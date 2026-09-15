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
for(const [file,api,names] of [['admin-pptx.js','general','kpiD1,kpiD2,kpiD4,kpiD6'],['admin-pptx-rae.js','rae','dataD1,dataD2,dataD8,buildD1,buildD2Analysis'],['admin-pptx-asesor.js','advisor','datosAsesorD1,datosAsesorD2']]){
 const code=fs.readFileSync(path.join(root,'js',file),'utf8').replace(/\}\)\(\);\s*$/, 'window.'+api+'={'+names+'};})();');vm.runInContext(code,sandbox);
}
let fixture=[], fixtureByTab=null;
sandbox.fetchSheetData=async tab => (fixtureByTab?.[tab] || fixture).map(r=>({...r}));sandbox.OXXO.fetchSheetData=sandbox.fetchSheetData;
sandbox.loadAsesorCatalog=async()=>null;sandbox.OXXO.loadAsesorCatalog=sandbox.loadAsesorCatalog;

(async()=>{
 fixture=[{Mes:'2026-09',Tienda:'OXXO A',Asesor:'Ana',Puesto:'AYUDANTE TIENDA','Status ocupacion':'Ocupada',Empleados:'Persona','Dias Vacantes':2}];
 assert.equal((await sandbox.general.kpiD1()).value,'0');
 assert.equal((await sandbox.rae.dataD1()).total,0);
 assert.equal((await sandbox.advisor.datosAsesorD1('Ana')).total,0);
 assert.equal(await sandbox.rae.dataD1('2026-08'),null);
 fixture.push({Mes:'2026-08',Tienda:'OXXO A',Asesor:'Ana',Puesto:'AYUDANTE TIENDA','Status ocupacion':'Vacante',Empleados:'', 'Dias Vacantes':5});
 assert.equal((await sandbox.general.kpiD1()).value,'0');
 fixture.push({Mes:'2026-08',Tienda:'OXXO B',Asesor:'Ana',Puesto:'AYUDANTE TIENDA','Status ocupacion':'Vacante',Empleados:'', 'Dias Vacantes':''});
 fixture.push({Mes:'2026-08',Tienda:'OXXO C',Asesor:'Ana',Puesto:'AYUDANTE TIENDA','Status ocupacion':'Vacante',Empleados:'', 'Dias Vacantes':'Mes finalizado'});
 const vacantesRae = await sandbox.rae.dataD1('2026-08');
 assert.equal(vacantesRae.total,3);
 assert.equal(vacantesRae.tablaAsesores[0].vacantes,3);
 assert.equal(vacantesRae.tablaAsesores[0].promedio,5);
 assert.equal(vacantesRae.tablaAsesores[0].d6,1);
 assert.equal(vacantesRae.totalTabla.vacantes,3);
 const vacantesDrawn = [];
 const fakeVacantesSlide = { background: {}, addText(...args) { vacantesDrawn.push(['text', ...args]); }, addShape(...args) { vacantesDrawn.push(['shape', ...args]); } };
 sandbox.rae.buildD1({ addSlide() { return fakeVacantesSlide; } }, vacantesRae, vacantesRae.sub);
 assert.ok(vacantesDrawn.some(([kind, value]) => kind === 'text' && String(value).includes('Distribución por puesto')));
 assert.ok(vacantesDrawn.some(([kind, value]) => kind === 'text' && String(value).includes('Total general')));
 fixture=[{Mes:8,Ano:2026,Semana:'9',Tienda:'OXXO A',Cantidad:90},{Mes:9,Ano:2026,Semana:'10',Tienda:'OXXO A',Cantidad:10}];
 assert.equal((await sandbox.general.kpiD4()).value,'10');
 assert.equal((await sandbox.general.kpiD4()).sub,'2026-09 · Sem 10');
 fixture=[{Mes:12,Ano:2025,Semana:'52',Tienda:'OXXO A',Dias:52},{Mes:1,Ano:2026,Semana:'1',Tienda:'OXXO A',Dias:1}];
 assert.equal((await sandbox.general.kpiD6()).value,'1');
 fixture=[{Mes:'2026-09',Tienda:'ENTRENAMIENTO OAXACA',Asesor:'Sin Asesor Asignado',Puesto:'AYUDANTE TIENDA',Medida:'BAJA',Motivo:'Renuncia',Edad:24,Temporalidad:'0 - 45 días'},
 {Mes:'2026-09',Tienda:'OXXO A',Asesor:'Timoteo Antonio Perez',Puesto:'AYUDANTE TIENDA',Medida:'BAJA',Motivo:'Baja con causal',Edad:34,Temporalidad:'46 - 90 días'}];
 assert.equal((await sandbox.general.kpiD2()).value,'2');
 const bajasRae = await sandbox.rae.dataD2();
 assert.equal(bajasRae.total,2);
 assert.equal(bajasRae.motivos[0].label,'BAJA CON CAUSAL');
 assert.equal(bajasRae.tiendas.length,2);
 assert.equal(bajasRae.heatmap.values[0].values[0],1);
 assert.equal(bajasRae.heatmap.values[1].values[1],1);
 const drawn = [];
 const fakeSlide = { background: {}, addText(...args) { drawn.push(['text', ...args]); }, addShape(...args) { drawn.push(['shape', ...args]); }, addChart(...args) { drawn.push(['chart', ...args]); } };
 sandbox.rae.buildD2Analysis({ ChartType: { pie: 'pie' }, addSlide() { return fakeSlide; } }, bajasRae, bajasRae.sub);
 assert.ok(drawn.some(([kind]) => kind === 'shape'));
 assert.ok(drawn.some(([kind, type]) => kind === 'chart' && type === 'pie'));
 assert.ok(drawn.some(([kind, value]) => kind === 'text' && String(value).includes('Top 10 tiendas')));
 assert.equal((await sandbox.OXXO.metricsD2Rows()).rows.length,2);
 assert.equal((await sandbox.advisor.datosAsesorD2('Timoteo Antonio Perez')).total,1);
 assert.equal(await sandbox.rae.dataD2('2026-08'),null);
 assert.equal(fixture[1].Asesor,'Timoteo Antonio Perez'); // normalization does not mutate the source
 fixture=[{Mes:'2026-09',Tienda:'OXXO A',Asesor:'Ana',Puesto:'ADMINISTRATIVO',Medida:'BAJA'}];
 const other=await sandbox.general.kpiD2();
 assert.equal(other.value,'1');
 assert.equal(other.chart.values.reduce((sum,n)=>sum+n,0),1);
 fixture=[
  {Plaza:'Oaxaca',Asesor_Correcto:'Ana',Empleados:'1','Unidad org.':'OXXO A','Cr de tienda':'50AAA','Promedio de Modulo Cerca Siempre 2026':1,'Promedio de Codigo de Etica 2026':1},
  {Plaza:'Oaxaca',Asesor_Correcto:'Beto',Empleados:'2','Unidad org.':'OXXO B','Cr de tienda':'50AAB','Promedio de Modulo Cerca Siempre 2026':0,'Promedio de Codigo de Etica 2026':1}
 ];
 const capacidades = await sandbox.rae.dataD8();
 assert.equal(capacidades.cercaSiempre.label,'Módulo Cerca Siempre');
 assert.equal(capacidades.cercaSiempre.aplicables,2);
 assert.equal(capacidades.cercaSiempre.completadas,1);
 assert.equal(capacidades.cercaSiempre.pendientes,1);
 assert.equal(capacidades.cercaSiempre.asesores[0].name,'Beto');
 const applyCatalogOriginal = sandbox.OXXO.applyAsesorCatalog;
 sandbox.OXXO.applyAsesorCatalog = (row) => {
  if(row.Asesor_Correcto === 'Centralizacion') row.Asesor_Correcto = 'Edgar Jonathan Bautista Ventura';
  return row;
 };
 fixture=[{Plaza:'Oaxaca',Asesor_Correcto:'Centralizacion',Empleados:'3','Unidad org.':'OXXO C','Cr de tienda':'50AAC','Promedio de Modulo Cerca Siempre 2026':0}];
 const capacidadesCatalogadas = await sandbox.rae.dataD8();
 assert.equal(capacidadesCatalogadas.cercaSiempre.asesores[0].name,'Edgar Jonathan Bautista Ventura');
 sandbox.OXXO.applyAsesorCatalog = applyCatalogOriginal;
 fixtureByTab={
  [sandbox.OXXO.SHEETS_CONFIG.TABS.d1]: [{Mes:'2026-09',Tienda:'OXXO A','CR TIENDA':'50AAA',Empleados:'Persona',Puesto:'AYUDANTE TIENDA'}],
  [sandbox.OXXO.SHEETS_CONFIG.TABS.s7]: [{Tienda:'OXXO A',CR:'50AAA',Asesor:'Timoteo Antonio Perez','Estructura Propuesta TREO P2 Jun - Ago':1,'Estructura SAP':1,'Empleados Activos':1,Vacantes:0,'Dif SAP vs Est Optima Final':0}]
 };
 assert.equal((await sandbox.OXXO.metricsD7Rows()).rows.length,1);
 fixtureByTab=null;
 fixture=[];assert.equal(await sandbox.general.kpiD1(),null);assert.equal(await sandbox.general.kpiD2(),null);
 console.log('PPTX: occupied positions, zero current vacancies, exact month, week/year, unassigned departures and chart totals OK');
})().catch(e=>{console.error(e);process.exitCode=1});
