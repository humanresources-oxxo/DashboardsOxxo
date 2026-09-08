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

vm.runInContext(fs.readFileSync(path.join(root,'js/metrics-periods.js'),'utf8'),sandbox);
for(const [file,api,names] of [['admin-pptx.js','general','kpiD1,kpiD2,kpiD4,kpiD6'],['admin-pptx-rae.js','rae','dataD1,dataD2'],['admin-pptx-asesor.js','advisor','datosAsesorD1,datosAsesorD2']]){
 const code=fs.readFileSync(path.join(root,'js',file),'utf8').replace(/\}\)\(\);\s*$/, 'window.'+api+'={'+names+'};})();');vm.runInContext(code,sandbox);
}
let fixture=[];
sandbox.fetchSheetData=async()=>fixture.map(r=>({...r}));sandbox.OXXO.fetchSheetData=sandbox.fetchSheetData;
sandbox.loadAsesorCatalog=async()=>null;sandbox.OXXO.loadAsesorCatalog=sandbox.loadAsesorCatalog;

(async()=>{
 fixture=[{Mes:'2026-09',Tienda:'OXXO A',Asesor:'Ana',Puesto:'AYUDANTE TIENDA','Status ocupacion':'Ocupada',Empleados:'Persona','Dias Vacantes':2}];
 assert.equal((await sandbox.general.kpiD1()).value,'0');
 assert.equal((await sandbox.rae.dataD1()).total,0);
 assert.equal((await sandbox.advisor.datosAsesorD1('Ana')).total,0);
 assert.equal(await sandbox.rae.dataD1('2026-08'),null);
 fixture.push({Mes:'2026-08',Tienda:'OXXO A',Asesor:'Ana',Puesto:'AYUDANTE TIENDA','Status ocupacion':'Vacante',Empleados:'', 'Dias Vacantes':5});
 assert.equal((await sandbox.general.kpiD1()).value,'0');
 assert.equal((await sandbox.rae.dataD1('2026-08')).total,1);
 fixture=[{Mes:8,Ano:2026,Semana:'9',Tienda:'OXXO A',Cantidad:90},{Mes:9,Ano:2026,Semana:'10',Tienda:'OXXO A',Cantidad:10}];
 assert.equal((await sandbox.general.kpiD4()).value,'10');
 assert.equal((await sandbox.general.kpiD4()).sub,'2026-09 · Sem 10');
 fixture=[{Mes:12,Ano:2025,Semana:'52',Tienda:'OXXO A',Dias:52},{Mes:1,Ano:2026,Semana:'1',Tienda:'OXXO A',Dias:1}];
 assert.equal((await sandbox.general.kpiD6()).value,'1');
 fixture=[{Mes:'2026-09',Tienda:'ENTRENAMIENTO OAXACA',Asesor:'Sin Asesor Asignado',Puesto:'AYUDANTE TIENDA',Medida:'BAJA'},
 {Mes:'2026-09',Tienda:'OXXO A',Asesor:'Timoteo Antonio Perez',Puesto:'AYUDANTE TIENDA',Medida:'BAJA'}];
 assert.equal((await sandbox.general.kpiD2()).value,'2');
 assert.equal((await sandbox.rae.dataD2()).total,2);
 assert.equal((await sandbox.OXXO.metricsD2Rows()).rows.length,2);
 assert.equal((await sandbox.advisor.datosAsesorD2('Timoteo Antonio Perez')).total,1);
 assert.equal(await sandbox.rae.dataD2('2026-08'),null);
 assert.equal(fixture[1].Asesor,'Timoteo Antonio Perez'); // normalization does not mutate the source
 fixture=[{Mes:'2026-09',Tienda:'OXXO A',Asesor:'Ana',Puesto:'ADMINISTRATIVO',Medida:'BAJA'}];
 const other=await sandbox.general.kpiD2();
 assert.equal(other.value,'1');
 assert.equal(other.chart.values.reduce((sum,n)=>sum+n,0),1);
 fixture=[];assert.equal(await sandbox.general.kpiD1(),null);assert.equal(await sandbox.general.kpiD2(),null);
 console.log('PPTX: occupied positions, zero current vacancies, exact month, week/year, unassigned departures and chart totals OK');
})().catch(e=>{console.error(e);process.exitCode=1});
