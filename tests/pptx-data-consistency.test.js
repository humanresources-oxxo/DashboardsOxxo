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
for(const [file,api,names] of [['admin-pptx.js','general','kpiD1,kpiD2,kpiD4,kpiD6'],['admin-pptx-rae.js','rae','dataD1,dataD2,dataRotationTop10,dataD3,dataD7,dataD8,dataFocusKpis,raeMonthOption,buildD1,buildD2,buildD2Analysis,buildRotationTop10,buildD3,buildFocusKpis,buildD3StoreListSlides,buildD3ZeroAprovechamiento,buildD3RescateEc,buildD8,buildDashboardList'],['admin-pptx-asesor.js','advisor','datosAsesorD1,datosAsesorD2']]){
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
 {Mes:'2026-09',Tienda:'OPERACIONES 11 OAXACA',Asesor:'Sin Asesor Asignado',Puesto:'AYUDANTE TIENDA',Medida:'BAJA',Motivo:'Renuncia',Edad:24,Temporalidad:'0 - 45 días'},
 {Mes:'2026-09',Tienda:'OXXO A',Asesor:'Timoteo Antonio Perez',Puesto:'AYUDANTE TIENDA',Medida:'BAJA',Motivo:'Baja con causal',Edad:34,Temporalidad:'46 - 90 días'}];
 // La presentacion general (admin-pptx.js) ahora cuenta igual que el KPI
 // "Total Bajas" de dashboard-2.html: conserva Entrenamiento/Operaciones.
 assert.equal((await sandbox.general.kpiD2()).value,'3');
 const bajasRae = await sandbox.rae.dataD2();
 // RAE ahora INCLUYE Entrenamiento/Operaciones en el TOTAL (como el KPI
 // "Total Bajas" de dashboard-2.html): 2 bajas admin + 1 real = 3.
 assert.equal(bajasRae.total,3);
 // Motivos y mapa de calor tambien incluyen las bajas admin (2 renuncias).
 assert.equal(bajasRae.motivos[0].label,'RENUNCIA');
 assert.equal(bajasRae.motivos[0].total,2);
 // El ranking de tiendas SI excluye Entrenamiento/Operaciones: solo OXXO A.
 assert.equal(bajasRae.tiendas.length,1);
 assert.equal(bajasRae.tiendas[0].label,'OXXO A');
 // asesores (atribucion a personas reales) excluye "Sin asesor asignado".
 assert.ok(!bajasRae.asesores.some(a => /sin asesor/i.test(a.name)));
 assert.equal(bajasRae.heatmap.values[0].values[0],2);
 assert.equal(bajasRae.heatmap.values[1].values[1],1);
 fixtureByTab={[sandbox.OXXO.SHEETS_CONFIG.TABS.d2]:[
  {Mes:'2026-01',Fecha:'2026-01-10',Tienda:'OXXO COSTA','CR TIENDA':'50AAA',Asesor:'Ana',Puesto:'AYUDANTE TIENDA','Div.P.':'B351','Aplica en % de rotación':'Aplica',Rot_Temp:'Si'},
  {Mes:'2026-02',Fecha:'2026-02-10',Tienda:'OXXO COSTA','CR TIENDA':'50AAA',Asesor:'Ana',Puesto:'AYUDANTE TIENDA','Div.P.':'B351','Aplica en % de rotación':'Aplica',Rot_Temp:'No'},
  {Mes:'2026-03',Fecha:'2026-03-10',Tienda:'OXXO ISTMO',Asesor:'Beto',Puesto:'AYUDANTE TIENDA','Div.P.':'B350','Aplica en % de rotación':'Aplica',Rot_Temp:'No'},
  {Mes:'2026-03',Fecha:'2026-03-11',Tienda:'OXXO ISTMO',Asesor:'Beto',Puesto:'AYUDANTE TIENDA','Div.P.':'B350','Aplica en % de rotación':'No aplica por reingreso',Rot_Temp:'No'},
  {Mes:'2026-03',Fecha:'2026-03-12',Tienda:'OXXO VALLES',Asesor:'Caro',Puesto:'AYUDANTE TIENDA','Div.P.':'B378','Aplica en % de rotación':'Aplica',Rot_Temp:'No'}]};
 const rotationCatalog = { loaded:true, rows:[{asesor:'Jessica Yazmin',tienda:'OXXO COSTA',cr:'50AAA'}], byCr:new Map([['50AAA',{asesor:'Jessica Yazmin',tienda:'OXXO COSTA',cr:'50AAA'}]]), byTienda:new Map(), reasignaciones:{byCr:new Map(),byTienda:new Map()} };
 const loadCatalogBeforeRotation = sandbox.OXXO.loadAsesorCatalog;
 sandbox.OXXO.loadAsesorCatalog = async () => rotationCatalog;
 const rotation=await sandbox.rae.dataRotationTop10();
 assert.equal(rotation.top10[0].name,'OXXO COSTA');
 assert.equal(rotation.top10[0].total,2);
 assert.equal(rotation.top10[0].zone,'COSTA');
 assert.equal(rotation.top10[0].asesor,'Jessica Yazmin');
 assert.equal(rotation.totalBajas,4);
 assert.equal(rotation.zoneTotals.map(item=>item.name).join('|'),'COSTA|ISTMO|VALLES');
 sandbox.OXXO.loadAsesorCatalog = loadCatalogBeforeRotation;
 fixtureByTab[sandbox.OXXO.SHEETS_CONFIG.TABS.d2]=[{Mes:'2026-03',Fecha:'2026-03-10',Tienda:'OXXO SIN DIVISION',Asesor:'Ana',Puesto:'AYUDANTE TIENDA',Rot_Temp:'No'}];
 const missingRotation=await sandbox.rae.dataRotationTop10();
 assert.equal(missingRotation.unavailable,true);
 assert.equal(Array.from(missingRotation.missingColumns).join('|'),'Div.P.');
 fixtureByTab[sandbox.OXXO.SHEETS_CONFIG.TABS.d2]=[
  {Mes:'2026-01',Fecha:'2026-01-10',Tienda:'OXXO COSTA',Asesor:'Ana',Puesto:'AYUDANTE TIENDA','Div.P.':'B351','Aplica en % de rotaciÃ³n':'Aplica',Rot_Temp:'Si'},
  {Mes:'2026-02',Fecha:'2026-02-10',Tienda:'OXXO COSTA',Asesor:'Ana',Puesto:'AYUDANTE TIENDA','Div.P.':'B351','Aplica en % de rotaciÃ³n':'Aplica',Rot_Temp:'No'},
  {Mes:'2026-03',Fecha:'2026-03-10',Tienda:'OXXO ISTMO',Asesor:'Beto',Puesto:'AYUDANTE TIENDA','Div.P.':'B350','Aplica en % de rotaciÃ³n':'Aplica',Rot_Temp:'No'},
  {Mes:'2026-03',Fecha:'2026-03-11',Tienda:'OXXO ISTMO',Asesor:'Beto',Puesto:'AYUDANTE TIENDA','Div.P.':'B350','Aplica en % de rotaciÃ³n':'No aplica por reingreso',Rot_Temp:'No'},
  {Mes:'2026-03',Fecha:'2026-03-12',Tienda:'OXXO VALLES',Asesor:'Caro',Puesto:'AYUDANTE TIENDA','Div.P.':'B378','Aplica en % de rotaciÃ³n':'Aplica',Rot_Temp:'No'}];
 const rotationDrawn=[];
 const rotationSlide={background:{},addText(...args){rotationDrawn.push(['text',...args]);},addShape(...args){rotationDrawn.push(['shape',...args]);}};
 sandbox.rae.buildRotationTop10({addSlide(){return rotationSlide;}},rotation,rotation.sub);
 assert.ok(rotationDrawn.some(([kind,value])=>kind==='text'&&String(value).includes('Tiendas con mas bajas')));
 fixtureByTab=null;
 const drawn = [];
 const fakeSlide = { background: {}, addText(...args) { drawn.push(['text', ...args]); }, addShape(...args) { drawn.push(['shape', ...args]); }, addChart(...args) { drawn.push(['chart', ...args]); } };
 sandbox.rae.buildD2Analysis({ ChartType: { pie: 'pie' }, addSlide() { return fakeSlide; } }, bajasRae, bajasRae.sub);
 assert.ok(drawn.some(([kind]) => kind === 'shape'));
 assert.ok(drawn.some(([kind, type]) => kind === 'chart' && type === 'pie'));
 assert.ok(drawn.some(([kind, value]) => kind === 'text' && String(value).includes('Top 10 tiendas')));
 assert.equal((await sandbox.OXXO.metricsD2Rows()).rows.length,1);
 assert.equal((await sandbox.advisor.datosAsesorD2('Timoteo Antonio Perez')).total,1);
 assert.equal(await sandbox.rae.dataD2('2026-08'),null);
 assert.equal(fixture[2].Asesor,'Timoteo Antonio Perez'); // normalization does not mutate the source
 fixture=[{Mes:'2026-09',Tienda:'OXXO A',Asesor:'Ana',Puesto:'ADMINISTRATIVO',Medida:'BAJA'}];
 const other=await sandbox.general.kpiD2();
 assert.equal(other.value,'1');
 assert.equal(other.chart.values.reduce((sum,n)=>sum+n,0),1);
 fixture=Array.from({length:9},(_,i)=>({Mes:'2026-09',Tienda:'OXXO A',Asesor:'Ana',Puesto:'AYUDANTE TIENDA',Medida:'BAJA',Motivo:'RENUNCIA','Detalle de Baja':`Motivo ${i+1}`}));
 const motivosCompletos=await sandbox.rae.dataD2();
 assert.equal(motivosCompletos.motivos.length,9);
 assert.equal(motivosCompletos.motivos[0].label,'Motivo 1');
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
 assert.equal(capacidades.capacidades.length,2);
 assert.equal(capacidades.capacidades.find(item=>item.label==='Código de Ética').asesores.length,2);
 // Capacidades es UNA sola lamina: resumen general por curso + matriz por AT.
 assert.equal(capacidades.cursos.map(c=>`${c.label}|${c.aplicables}|${c.completadas}|${c.pct}`).join(' / '),'Módulo Cerca Siempre|2|1|50 / Código de Ética|2|2|100');
 // Ranking de mayor a menor cumplimiento total, con todos los AT validos.
 assert.equal(capacidades.matriz.map(item=>item.name).join('|'),'Ana|Beto');
 assert.equal(capacidades.matriz[0].cursos.map(c=>c.pct).join('|'),'100|100');
 assert.equal(capacidades.matriz[1].cursos.map(c=>c.pct).join('|'),'0|100');
 assert.equal(capacidades.matriz[0].pct,100);
 assert.equal(capacidades.matriz[1].pct,50);
 const capacidadesSlides=[], capacidadesDrawn=[];
 sandbox.rae.buildD8({addSlide(){const slide={background:{},addText(...args){capacidadesDrawn.push(['text',...args]);},addShape(...args){capacidadesDrawn.push(['shape',...args]);}};capacidadesSlides.push(slide);return slide;}},capacidades,'Corte vigente');
 assert.equal(capacidadesSlides.length,1);
 const capacidadesTextos=capacidadesDrawn.filter(([kind])=>kind==='text').map(([,value])=>String(value));
 assert.ok(capacidadesTextos.includes('Resumen general por curso'));
 assert.ok(capacidadesTextos.some(value=>value.startsWith('Ranking por AT')));
 assert.ok(capacidadesTextos.includes('Total general'));
 assert.ok(capacidadesTextos.includes('Módulo Cerca Siempre')&&capacidadesTextos.includes('Código de Ética'));
 assert.ok(capacidadesTextos.includes('1. Ana')&&capacidadesTextos.includes('2. Beto'));
 // Ya no hay laminas por modulo: una unica entrada de Capacidades.
 const listaRae=sandbox.rae.buildDashboardList('','',new Date());
 assert.equal(listaRae.filter(item=>/CAPACIDAD/i.test(item.title)).length,1);
 assert.ok(!listaRae.some(item=>/M.DULO/i.test(item.title)));
 assert.ok(!fs.readFileSync(path.join(root,'js/admin-pptx-rae.js'),'utf8').includes('buildD8Capabilit'), 'sin laminas por capacidad: ni buildD8Capability ni buildD8Capabilities');
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
  [sandbox.OXXO.SHEETS_CONFIG.TABS.d1]: [{Mes:'2026-09',Tienda:'OXXO A',Asesor:'Ana',Puesto:'AYUDANTE TIENDA','Status ocupacion':'Vacante',Empleados:'','Dias Vacantes':4}],
  [sandbox.OXXO.SHEETS_CONFIG.TABS.d2]: [{Mes:'2026-09',Tienda:'OXXO A',Asesor:'Ana',Puesto:'AYUDANTE TIENDA',Medida:'BAJA'}],
  [sandbox.OXXO.SHEETS_CONFIG.TABS.d3]: [
   {Plaza:'Oaxaca',Tienda:'OXXO A',Asesor:'Ana',Fecha:'2026-09-22',Estatus:'COMPLETA','Aprovechamiento Estructura':95,'Fecha máxima rescate EC':'23/09/2026'},
   {Plaza:'Oaxaca',Tienda:'OXXO B',Asesor:'Beto',Fecha:'2026-09-22',Estatus:'CRITICA','Aprovechamiento Estructura':0,'Fecha máxima rescate EC':'23/09/2026'},
   {Plaza:'Oaxaca',Tienda:'OXXO C',Asesor:'Edgar Jonathan Bautista Ventura',Fecha:'2026-09-22',Estatus:'COMPLETA','Aprovechamiento Estructura':100,'Fecha máxima rescate EC':'23/09/2026'}
  ]
 };
 const foco = await sandbox.rae.dataFocusKpis();
 assert.equal(foco.rows.length,3);
 assert.equal(foco.rows.find(item=>item.name==='Ana').diasPromedio,4);
 assert.equal(foco.rows.find(item=>item.name==='Ana').bajas,1);
 assert.equal(foco.rows.find(item=>item.name==='Beto').aprovechamiento,0);
 assert.equal(foco.rows.find(item=>item.name==='Edgar Jonathan Bautista Ventura').apego,80);
 const d3Rescate = await sandbox.rae.dataD3(new Date(2026,8,22));
 assert.equal(d3Rescate.zeroAprovechamiento.length,1);
 assert.equal(d3Rescate.rescatablesEc[0].tienda,'OXXO B');
 const focoDrawn=[];
 const focoSlide={background:{},addText(...args){focoDrawn.push(['text',...args]);},addShape(...args){focoDrawn.push(['shape',...args]);}};
 sandbox.rae.buildFocusKpis({addSlide(){return focoSlide;}},foco,foco.sub);
 assert.ok(focoDrawn.some(([kind,value])=>kind==='text'&&String(value).includes('Tiempo promedio')));
 assert.ok(focoDrawn.some(([kind,value])=>kind==='text'&&String(value)==='META'));
 const rescateDrawn=[];
 const rescateSlide={background:{},addText(...args){rescateDrawn.push(['text',...args]);},addShape(...args){rescateDrawn.push(['shape',...args]);}};
 sandbox.rae.buildD3ZeroAprovechamiento({addSlide(){return rescateSlide;}},d3Rescate,d3Rescate.sub);
 sandbox.rae.buildD3RescateEc({addSlide(){return rescateSlide;}},d3Rescate,d3Rescate.sub);
 assert.ok(rescateDrawn.some(([kind,value])=>kind==='text'&&String(value).includes('Tiendas con rescate EC en el mes')));
 assert.ok(rescateDrawn.some(([kind,value])=>kind==='text'&&String(value).includes('con opción de rescate este mes')));
 const listSlides=[];
 const listItems=Array.from({length:32},(_,i)=>({tienda:`OXXO TIENDA ${i+1}`,asesor:`Asesor ${i+1}`,ausentismos:i%4,vacantes:i%2,fechaRescateEc:new Date(2026,8,23),fechaRescateEcLabel:'23 sep 2026'}));
 sandbox.rae.buildD3StoreListSlides({addSlide(){const slide={background:{},addText(...args){listSlides.push(['text',...args]);},addShape(){}};return slide;}},d3Rescate,d3Rescate.sub,{title:'Lista completa',items:listItems,countLabel:'TIENDAS CON 0%',detail:'Detalle',emptyText:'Sin datos'});
 assert.equal(listSlides.filter(([kind])=>kind==='text').filter(([,value])=>String(value)==='OXXO TIENDA 1').length,1);
 assert.equal(listSlides.filter(([kind])=>kind==='text').filter(([,value])=>String(value)==='OXXO TIENDA 32').length,1);

 // ── Regresion RAE: rescate EC por MES del corte (no por fecha de hoy) ──────
 // Regla de negocio: tiendas sin EC (Aprov Estructura <92.5) cuya Fecha maxima
 // rescate EC cae en el mes del corte D3 (dia 1 a fin de mes, INCLUSIVE),
 // aunque el plazo exacto ya haya pasado. Meses previos/futuros y fechas
 // invalidas se excluyen. El encabezado se lee con o sin "de".
 fixtureByTab={[sandbox.OXXO.SHEETS_CONFIG.TABS.d3]:[
  {Plaza:'Oaxaca',Tienda:'OXXO DIA1',FECHA:'2026-09-28',Estatus:'CRITICA','Aprovechamiento Estructura':0,'Fecha máxima de rescate EC':'2026-09-01'},
  {Plaza:'Oaxaca',Tienda:'OXXO FIN',FECHA:'2026-09-28',Estatus:'CRITICA','Aprovechamiento Estructura':0,'Fecha máxima de rescate EC':'2026-09-30'},
  {Plaza:'Oaxaca',Tienda:'OXXO EXP',FECHA:'2026-09-28',Estatus:'CRITICA','Aprovechamiento Estructura':0,'Fecha máxima de rescate EC':'2026-09-04'},
  {Plaza:'Oaxaca',Tienda:'OXXO PREV',FECHA:'2026-09-28',Estatus:'CRITICA','Aprovechamiento Estructura':0,'Fecha máxima de rescate EC':'2026-08-31'},
  {Plaza:'Oaxaca',Tienda:'OXXO FUT',FECHA:'2026-09-28',Estatus:'CRITICA','Aprovechamiento Estructura':0,'Fecha máxima de rescate EC':'2026-10-01'},
  {Plaza:'Oaxaca',Tienda:'OXXO INV',FECHA:'2026-09-28',Estatus:'CRITICA','Aprovechamiento Estructura':0,'Fecha máxima de rescate EC':'N/D'},
  {Plaza:'Oaxaca',Tienda:'OXXO OK',FECHA:'2026-09-28',Estatus:'COMPLETA','Aprovechamiento Estructura':95,'Fecha máxima de rescate EC':'2026-09-10'}]};
 // today en OCTUBRE a proposito: el mes de referencia sale del CORTE
 // (septiembre), no de la fecha de hoy.
 const rescMes = await sandbox.rae.dataD3(new Date(2026,9,15));
 assert.equal(rescMes.zeroAprovechamiento.length,6);                 // 6 tiendas sin EC (0% binario)
 const rescTiendas = rescMes.rescatablesEc.map(x=>x.tienda);
 assert.deepEqual(rescTiendas,['OXXO DIA1','OXXO EXP','OXXO FIN']);  // dia 1, vencida en el mes y fin de mes
 assert.ok(!rescTiendas.includes('OXXO PREV'));                      // mes previo excluido
 assert.ok(!rescTiendas.includes('OXXO FUT'));                       // mes futuro excluido
 assert.ok(!rescTiendas.includes('OXXO INV'));                       // fecha invalida excluida
 assert.equal(rescMes.rescueMonthLabel,'septiembre 2026');           // etiqueta del mes del corte
 assert.ok(rescMes.rescatablesEc[0].fechaRescateEc instanceof Date); // alias con "de" leido
 fixtureByTab=null;

 fixtureByTab={
  [sandbox.OXXO.SHEETS_CONFIG.TABS.d1]: [{Mes:'2026-09',Tienda:'OXXO A','CR TIENDA':'50AAA',Empleados:'Persona',Puesto:'AYUDANTE TIENDA'}],
  [sandbox.OXXO.SHEETS_CONFIG.TABS.s7]: [{Tienda:'OXXO A',CR:'50AAA',Asesor:'Timoteo Antonio Perez','Estructura Propuesta TREO P2 Jun - Ago':1,'Estructura SAP':1,'Empleados Activos':1,Vacantes:0,'Dif SAP vs Est Optima Final':0}]
 };
 assert.equal((await sandbox.OXXO.metricsD7Rows()).rows.length,1);
 fixtureByTab=null;

 // ── Regresion RAE: sincronizacion con Dashboard 2 y Dashboard 3 ──────────
 // (1) Selector de mes canonico: value === canon === YYYY-MM y etiqueta amigable.
 const chkMonth=(input,value,label)=>{const o=sandbox.rae.raeMonthOption(input);assert.equal(o.value,value);assert.equal(o.canon,value);assert.equal(o.label,label);};
 chkMonth('2026-08','2026-08','Agosto 2026');
 chkMonth('sep-26','2026-09','Septiembre 2026');
 chkMonth('01/09/2026','2026-09','Septiembre 2026');

 // (2) Entrenamiento/Operaciones: la RAE (includeAdminUnits) los cuenta en el
 // TOTAL como dashboard-2.html; el default (general/asesor) los sigue excluyendo.
 fixtureByTab={[sandbox.OXXO.SHEETS_CONFIG.TABS.d2]:[
  {Mes:'2026-09',Tienda:'ENTRENAMIENTO OAXACA',Asesor:'Sin Asesor Asignado',Puesto:'AYUDANTE TIENDA',Medida:'BAJA',Motivo:'Renuncia',Edad:24,Temporalidad:'0 - 45 días'},
  {Mes:'2026-09',Tienda:'OPERACIONES 5 OAXACA',Asesor:'Sin Asesor Asignado',Puesto:'AYUDANTE TIENDA',Medida:'BAJA',Motivo:'Renuncia',Edad:24,Temporalidad:'0 - 45 días'},
  {Mes:'2026-09',Tienda:'OXXO A',Asesor:'Ana',Puesto:'AYUDANTE TIENDA',Medida:'BAJA',Motivo:'Renuncia',Edad:30,Temporalidad:'0 - 45 días'}]};
 assert.equal((await sandbox.OXXO.metricsD2Rows()).rows.length,1);
 assert.equal((await sandbox.OXXO.metricsD2Rows('',{includeAdminUnits:true})).rows.length,3);
 const bajasAll=await sandbox.rae.dataD2();
 assert.equal(bajasAll.total,3);              // TOTAL incluye admin units
 assert.equal(bajasAll.tiendas.length,1);     // ranking de tiendas los excluye
 assert.equal(bajasAll.tiendas[0].label,'OXXO A');

 // (3) Escenario Region: con una sesion ACTIVA regional (sessionStorage), la RAE
 // sigue forzando Plaza Oaxaca en cada lectura de datos, sin tocar el alcance
 // global del panel (no cambia getActiveDataScope ni sessionStorage).
 const getItemPrev=sandbox.sessionStorage.getItem;
 sandbox.sessionStorage.getItem=(k)=>k===sandbox.OXXO.SHEETS_CONFIG.SCOPE_MODEL.STORAGE_KEY?JSON.stringify({level:'region',region:'TABASCO'}):null;
 assert.equal(sandbox.OXXO.getActiveDataScope().level,'region'); // control: la sesion es regional
 const capturado=[]; const baseFetch=sandbox.fetchSheetData;
 sandbox.fetchSheetData=async(tab,opts={})=>{capturado.push({tab,scope:opts&&opts.scope});return baseFetch(tab);};
 sandbox.OXXO.fetchSheetData=sandbox.fetchSheetData;
 fixtureByTab={
  [sandbox.OXXO.SHEETS_CONFIG.TABS.d1]:[{Mes:'2026-09',Tienda:'OXXO A',Asesor:'Ana',Puesto:'AYUDANTE TIENDA','Status ocupacion':'Vacante',Empleados:'','Dias Vacantes':3},
   {Mes:'2026-08',Tienda:'OXXO B',Asesor:'Ana',Puesto:'AYUDANTE TIENDA','Status ocupacion':'Vacante',Empleados:'','Dias Vacantes':4}],
  [sandbox.OXXO.SHEETS_CONFIG.TABS.d2]:[{Mes:'2026-09',Tienda:'OXXO A',Asesor:'Ana',Puesto:'AYUDANTE TIENDA',Medida:'BAJA'},
   {Mes:'2026-08',Tienda:'OXXO A',Asesor:'Ana',Puesto:'AYUDANTE TIENDA',Medida:'BAJA'},
   {Mes:'2026-08',Tienda:'OXXO B',Asesor:'Ana',Puesto:'AYUDANTE TIENDA',Medida:'BAJA'}]};
 await sandbox.rae.dataD2();
 await sandbox.rae.dataD1('2026-09');
 const fD2=capturado.find(c=>c.tab===sandbox.OXXO.SHEETS_CONFIG.TABS.d2);
 const fD1=capturado.find(c=>c.tab===sandbox.OXXO.SHEETS_CONFIG.TABS.d1);
 assert.ok(fD2&&fD2.scope&&/oaxaca/i.test(fD2.scope.plaza),'dataD2 fuerza Plaza Oaxaca');
 assert.ok(fD1&&fD1.scope&&/oaxaca/i.test(fD1.scope.plaza),'dataD1 fuerza Plaza Oaxaca');
 // control inverso: sin scope explicito la misma sesion sigue en Region.
 assert.equal(sandbox.OXXO.getActiveDataScope().level,'region');
 sandbox.sessionStorage.getItem=getItemPrev;

 // (4) Mes anterior: value y canon envian el MISMO periodo a Vacantes y Bajas.
 const opt=sandbox.rae.raeMonthOption('2026-08');
 const bajasAgo=await sandbox.rae.dataD2(opt.canon);
 const vacAgo=await sandbox.rae.dataD1(opt.value);
 assert.equal(bajasAgo.total,2);              // 2 bajas de agosto
 assert.equal(bajasAgo.sub,'Mes 2026-08');
 assert.equal(vacAgo.total,1);                // 1 vacante de agosto (OXXO B)
 assert.equal(vacAgo.sub,'Mes 2026-08');
 sandbox.fetchSheetData=baseFetch; sandbox.OXXO.fetchSheetData=baseFetch;

 // (5) Aprovechamiento D3: sin filtro de catalogo (cuenta preaperturas, igual
 // que dashboard-3.html) y comparativo por plaza calculado del propio D3, con
 // la hoja manual solo como respaldo.
 fixtureByTab={
  [sandbox.OXXO.SHEETS_CONFIG.TABS.d3]:[
   {Plaza:'Oaxaca',Tienda:'OXXO A',FECHA:'2026-09-22','Estatus Con impacto Ausentismo':'Equipo Completo','Aprovechamiento Estructura':95},
   {Plaza:'Oaxaca',Tienda:'Small Beach OAX VSA',FECHA:'2026-09-22','Estatus Con impacto Ausentismo':'Tienda Crítica','Aprovechamiento Estructura':0},
   {Plaza:'Tuxtla',Tienda:'OXXO T1',FECHA:'2026-09-22','Estatus Con impacto Ausentismo':'Equipo Completo','Aprovechamiento Estructura':100},
   {Plaza:'Tuxtla',Tienda:'OXXO T2',FECHA:'2026-09-22','Estatus Con impacto Ausentismo':'Equipo Completo','Aprovechamiento Estructura':100}],
  // Respaldo manual: Tuxtla con valor ERRONEO (debe ignorarse porque D3 lo trae)
  // y Villahermosa que solo existe aqui (debe usarse como respaldo).
  [sandbox.OXXO.SHEETS_CONFIG.TABS.d3plazas]:[
   {PLAZAS:'Tuxtla','Aprovechamiento de estructura a hoy':10},
   {PLAZAS:'Villahermosa','Aprovechamiento de estructura a hoy':88}]};
 const aprov=await sandbox.rae.dataD3(new Date(2026,8,22));
 // 2 tiendas Oaxaca contadas (la preapertura Small Beach ya NO se excluye).
 assert.equal(aprov.completas,1);
 assert.equal(aprov.criticas,1);              // preapertura critica incluida
 assert.equal(Number(aprov.pct.toFixed(1)),50.0);
 const pOax=aprov.plazas.find(p=>/oaxaca/i.test(p.name));
 const pTux=aprov.plazas.find(p=>/tuxtla/i.test(p.name));
 const pVilla=aprov.plazas.find(p=>/villahermosa/i.test(p.name));
 assert.equal(Number(pOax.value.toFixed(1)),50.0);
 assert.equal(Number(pTux.value.toFixed(1)),100.0); // del D3, NO el 10 manual
 assert.equal(Number(pVilla.value.toFixed(1)),88.0); // respaldo manual

 // (6) Multi-corte: paridad con el gauge del Dashboard 3. El comparativo por
 // plaza usa TODAS las fechas (computePlazaStatsFromRows), mientras el KPI
 // principal (pct) usa solo el corte mas reciente. Oaxaca: corte reciente 1/2
 // = 50%, pero todas las fechas 3/4 = 75% -> el gauge debe mostrar 75%.
 fixtureByTab={[sandbox.OXXO.SHEETS_CONFIG.TABS.d3]:[
  {Plaza:'Oaxaca',Tienda:'OXXO A',FECHA:'2026-09-28','Estatus Con impacto Ausentismo':'Equipo Completo','Aprovechamiento Estructura':95},
  {Plaza:'Oaxaca',Tienda:'OXXO B',FECHA:'2026-09-28','Estatus Con impacto Ausentismo':'Tienda Crítica','Aprovechamiento Estructura':0},
  {Plaza:'Oaxaca',Tienda:'OXXO A',FECHA:'2026-09-21','Estatus Con impacto Ausentismo':'Equipo Completo','Aprovechamiento Estructura':95},
  {Plaza:'Oaxaca',Tienda:'OXXO B',FECHA:'2026-09-21','Estatus Con impacto Ausentismo':'Equipo Completo','Aprovechamiento Estructura':95}]};
 const multi=await sandbox.rae.dataD3(new Date(2026,8,28));
 // (6b) Mismo asesor escrito distinto (mayusculas/acentos) = UNA sola fila del
 // ranking, con el nombre canonico del Catalogo_Asesores.
 fixtureByTab={[sandbox.OXXO.SHEETS_CONFIG.TABS.d3]:[
  {Plaza:'Oaxaca',Tienda:'OXXO A','CR TIENDA':'50AAA',Asesor:'MIRNA MARTINEZ LORENZO',FECHA:'2026-09-22','Estatus Con impacto Ausentismo':'Equipo Completo','Aprovechamiento Estructura':95},
  {Plaza:'Oaxaca',Tienda:'OXXO B','CR TIENDA':'50BBB',Asesor:'mirna martínez lorenzo',FECHA:'2026-09-22','Estatus Con impacto Ausentismo':'Tienda Crítica','Aprovechamiento Estructura':0}]};
 const dupCatalog={loaded:true,rows:[{asesor:'Mirna Martinez Lorenzo',tienda:'OXXO Z',cr:'50ZZZ'}],byCr:new Map(),byTienda:new Map(),reasignaciones:{byCr:new Map(),byTienda:new Map()}};
 const loadCatalogBeforeDup=sandbox.OXXO.loadAsesorCatalog;
 sandbox.OXXO.loadAsesorCatalog=async()=>dupCatalog;
 const dup=await sandbox.rae.dataD3(new Date(2026,8,22));
 const mirnas=dup.rankingAll.filter(x=>/mirna/i.test(x.name));
 assert.equal(mirnas.length,1);
 assert.equal(mirnas[0].name,'Mirna Martinez Lorenzo');
 assert.equal(Number(mirnas[0].value.toFixed(1)),50.0);
 sandbox.OXXO.loadAsesorCatalog=loadCatalogBeforeDup;
 assert.equal(Number(multi.pct.toFixed(1)),50.0);   // KPI principal = corte reciente
 const mOax=multi.plazas.find(p=>/oaxaca/i.test(p.name));
 assert.equal(Number(mOax.value.toFixed(1)),75.0);  // gauge por plaza = todas las fechas
 fixtureByTab=null;

 // RAE alineada a dashboard-2.html: el responsable de la baja es el Asesor
 // crudo de la fila (no quien tiene hoy la tienda segun el catalogo) y los
 // placeholders quedan como "Sin responsable identificado" en el ranking.
 const catalogoTienda=sandbox.OXXO.loadAsesorCatalog;
 sandbox.OXXO.loadAsesorCatalog=async()=>({byTienda:new Map([['OXXO A','Beto Actual']]),byCr:new Map()});
 fixtureByTab=null;
 fixture=[{Mes:'2026-09',Tienda:'OXXO A',Asesor:'Ana Anterior',Puesto:'AYUDANTE TIENDA',Medida:'BAJA'},
  {Mes:'2026-09',Tienda:'OXXO A',Asesor:'Sin Asesor Asignado',Puesto:'AYUDANTE TIENDA',Medida:'BAJA'},
  {Mes:'2026-09',Tienda:'OXXO A',Asesor:'',Puesto:'AYUDANTE TIENDA',Medida:'BAJA'}];
 const crudo=await sandbox.rae.dataD2();
 assert.equal(JSON.stringify(crudo.ranking.map(x=>[x.name,x.value])),JSON.stringify([['Sin responsable identificado',2],['Ana Anterior',1]]));
 assert.equal(JSON.stringify(crudo.asesores.map(x=>[x.name,x.bajas])),JSON.stringify([['Ana Anterior',1]]));
 sandbox.OXXO.loadAsesorCatalog=catalogoTienda;
 // Baja de tienda real SIN asesor: se carga al AT que hoy tiene la tienda.
 // Con asesor se conserva el crudo; Entrenamiento/Operaciones sin asesor siguen
 // "Sin responsable identificado".
 const catTienda={storeCatalog:{byCr:new Map(),byTienda:new Map([[sandbox.OXXO.normalizeCatalogTienda('OXXO B'),{asesor:'Carla Actual',region:'TABASCO',plaza:'Plaza Oaxaca',zona:''}]])}};
 assert.equal(sandbox.OXXO.metricsAsesorBajaD2('',{catalog:catTienda,tienda:'OXXO B'}),'Carla Actual');
 assert.equal(sandbox.OXXO.metricsAsesorBajaD2('Sin Asesor Asignado',{catalog:catTienda,tienda:'OXXO B'}),'Carla Actual');
 assert.equal(sandbox.OXXO.metricsAsesorBajaD2('Ana Anterior',{catalog:catTienda,tienda:'OXXO B'}),'Ana Anterior');
 assert.equal(sandbox.OXXO.metricsAsesorBajaD2('',{catalog:catTienda,tienda:'ENTRENAMIENTO OAXACA'}),'Sin responsable identificado');
 assert.equal(sandbox.OXXO.metricsAsesorBajaD2('',{catalog:catTienda,tienda:'OXXO SIN CATALOGO'}),'Sin responsable identificado');
 // TREO: 'Movimiento Inicial' manda sobre el signo del dif (dashboard-7.html).
 assert.equal(sandbox.OXXO.metricsMovimientoTreo('Subir',0),'Subir');
 assert.equal(sandbox.OXXO.metricsMovimientoTreo('Alineada',3),'Alineada');
 assert.equal(sandbox.OXXO.metricsMovimientoTreo('▼ Bajar',2),'Bajar');
 assert.equal(sandbox.OXXO.metricsMovimientoTreo('',-1),'Bajar');
 assert.equal(sandbox.OXXO.metricsMovimientoTreo('otro',0),'Alineada');

 fixture=[];assert.equal(await sandbox.general.kpiD1(),null);assert.equal(await sandbox.general.kpiD2(),null);
 console.log('PPTX: occupied positions, zero current vacancies, exact month, week/year, unassigned departures and chart totals OK');
 console.log('RAE sync: total con admin units, mes canonico, scope Oaxaca forzado, D3 sin catalogo y plazas vigentes OK');
})().catch(e=>{console.error(e);process.exitCode=1});
