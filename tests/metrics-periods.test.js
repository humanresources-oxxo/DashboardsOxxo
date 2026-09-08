// Google gviz sirve las hojas con el formato del Sheet (es-MX), asi que los
// numeros llegan con COMA decimal: "0,96", "1,0435", "0,939". metricsNum()
// trataba una sola coma con exactamente 3 decimales como separador de miles,
// asi que "0,939" se leia 939 y "1,125" se leia 1125. En Dashboard 11 esas
// columnas son porcentajes: 93.9% se volvia 939% e inflaba KPIs, dona y
// ranking de asesores (Oaxaca SEM 35 mostraba 105.8% de cumplimiento total
// contra el 76.81% del Excel de origen).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const sandbox = {
  console,
  document: {
    readyState: 'loading',
    body: null,
    documentElement: { dataset: {} },
    head: { appendChild() {} },
    addEventListener() {},
    getElementsByTagName() { return []; },
    getElementById() { return null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    createElement() { return { style: {}, dataset: {}, addEventListener() {}, remove() {} }; }
  },
  location: { pathname: '/index.html', origin: 'https://example.test', href: 'https://example.test/' },
  history: { state: null, replaceState() {} },
  sessionStorage: { getItem() { return null; }, setItem() {} },
  localStorage: { getItem() { return null; }, setItem() {} },
  navigator: {},
  CustomEvent: function CustomEvent() {},
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() {},
  matchMedia() { return { matches: false, addEventListener() {}, addListener() {} }; },
  URL, Request, Response, Blob, setTimeout, clearTimeout, Map, Set, Date, Promise
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'js/config.js'), 'utf8'), sandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'js/core.js'), 'utf8'), sandbox);

vm.runInContext(fs.readFileSync(path.join(root, 'js/metrics-periods.js'), 'utf8'), sandbox);
const api = sandbox.OXXO;
const keys = { mesKey:'Mes', anoKey:'Ano', semanaKey:'Semana', tiendaKey:'Tienda', asesorKey:'Asesor' };
const rows = [
 {Mes:12,Ano:2025,Semana:52,Tienda:'OXXO A',Cantidad:90},
 {Mes:1,Ano:2026,Semana:1,Tienda:'OXXO A',Cantidad:2},
 {Mes:1,Ano:2026,Semana:'Semana 1',Tienda:'OXXO B',Cantidad:3},
];
const result = api.metricsPreparePeriodSource(rows, null, keys);
assert.equal(result.currentMonth, '2026-01');
assert.equal(result.currentRows.length, 2);
assert.equal(result.currentRows.reduce((s,r)=>s+r.Cantidad,0),5);
assert.equal(result.rows.filter(r=>result.periodOf(r)===result.currentPeriod).length,2);
assert.equal(api.metricsMonthFromParts('septiembre',2026),'2026-09');
assert.equal(api.metricsMonthFromParts('2026-09',2026),'2026-09');
assert.equal(rows[0].Asesor,undefined); // input remains untouched
assert.equal(api.metricsCrossSignals([{ready:true,month:'2026-09',value:0},{ready:true,month:'2026-09',value:2}]).status,'ready');
assert.equal(api.metricsCrossSignals([{ready:true,month:'2026-08',value:3},{ready:true,month:'2026-09',value:2}]).status,'different');
assert.equal(api.metricsCrossSignals([{ready:false},{ready:true,month:'2026-09',value:2}]).status,'missing');
const lookup = api.metricsCreateRowLookup();
const source = {rows:Array.from({length:100000},(_,i)=>({store:i%250,value:i}))};
let scans=0;const keyOf=r=>{scans++;return r.store;};
for(let i=0;i<100;i++) assert.equal(lookup(source,i%250,keyOf,null).length,400);
assert.equal(scans,100000); // one scan, not 100 scans
source.rows=[{store:0,value:7}];assert.equal(lookup(source,0,keyOf,null)[0].value,7);
assert.equal(lookup(source,1,keyOf,null).length,0);
lookup(source,0,keyOf,{});assert.equal(scans,100002); // catalog change invalidates
console.log('Periods, equivalent week formats, monthly crossing and indexed reload: OK. 100 lookups: 100,000 key evaluations vs 10,000,000 without index.');

// Integration: progressive loading must not repaint an unchanged section.
sandbox.OXXO_FICHA = new Proxy({}, {get:()=>value=>String(value)});
let tiendaCode=fs.readFileSync(path.join(root,'js/mi-tienda.js'),'utf8');
tiendaCode=tiendaCode.replace("  document.addEventListener('DOMContentLoaded'", "  window.storeTest = { DATA, SOURCE_STATE, renderSource };\n  document.addEventListener('DOMContentLoaded'");
vm.runInContext(tiendaCode,sandbox);
const store=sandbox.storeTest;assert.ok(store);
let draws=0;const renderer=()=>({count:++draws});
store.DATA.d1={rows:[]};store.SOURCE_STATE.d1='loaded';
assert.equal(store.renderSource('d1',renderer,'A').count,1);
assert.equal(store.renderSource('d1',renderer,'A').count,1);
store.DATA.d2={rows:[]};assert.equal(store.renderSource('d1',renderer,'A').count,1);
assert.equal(store.renderSource('d1',renderer,'B').count,2);
store.DATA.d1={rows:[]};assert.equal(store.renderSource('d1',renderer,'B').count,3);
store.SOURCE_STATE.d1='failed';assert.equal(store.renderSource('d1',renderer,'B'),null);
store.SOURCE_STATE.d1='loaded';assert.equal(store.renderSource('d1',renderer,'B').count,4);
console.log('Mi Tienda rendering: unchanged source reused; selection, reload and failure invalidate cache.');

(async () => {
  sandbox.fetchSheetData = async () => [
    {Mes:'2026-08',Tienda:'OXXO A',Puesto:'AYUDANTE DE TIENDA',Asesor:'Ana','Status ocupacion':'Vacante'},
    {Mes:'2026-09',Tienda:'OXXO A',Puesto:'AYUDANTE DE TIENDA',Asesor:'Ana','Status ocupacion':'Ocupada',Empleados:'Persona'},
  ];
  sandbox.loadAsesorCatalog = async () => null;
  const history = await api.metricsD1Rows(true);
  const current = await api.metricsD1Rows();
  assert.equal(history.currentMonth,'2026-09');
  assert.equal(current.mes,history.currentMonth);
  assert.equal(current.rows.length,0);
  console.log('Vacancies: an occupied latest month does not fall back to historical vacancies.');
})().catch(error => { console.error(error); process.exitCode = 1; });
