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
vm.runInContext(fs.readFileSync(path.join(root,'js/admin-pptx.js'),'utf8').replace(/\}\)\(\);\s*$/,'window.foro={kpiD1,kpiD2,kpiD3,kpiD4,kpiD5,kpiD6,kpiD7,addKpiSlide,addCover,addPlazaRankingSlide,generatePresentation,DASHBOARDS};})();'),sandbox);
let fixture=[];
sandbox.fetchSheetData=sandbox.OXXO.fetchSheetData=async()=>fixture;
sandbox.loadAsesorCatalog=sandbox.OXXO.loadAsesorCatalog=async()=>null;
const instances=[];let failWrite=false;
class FakePptx {
 constructor(){this.slides=[];instances.push(this);}
 addSlide(){const slide={texts:[],shapes:[],addText(t,o){this.texts.push({t:String(t),o});},addShape(t,o){this.shapes.push({t,o});}};this.slides.push(slide);return slide;}
 async writeFile(){if(failWrite)throw Error('descarga fallida');this.written=true;}
}
const btn={disabled:false},status={textContent:''};
sandbox.document.getElementById=id=>id==='generate-pptx-btn'?btn:id==='pptx-status'?status:null;
sandbox.PptxGenJS=FakePptx;sandbox.OXXO_ADMIN_ASSETS={ensure:async()=>{}};
const allText=pptx=>pptx.slides.flatMap(s=>s.texts.map(t=>t.t)).join('\n');
(async()=>{
 fixture=[{Mes:'2026-09',Tienda:'OXXO A',Asesor:'Ana',Puesto:'ADMINISTRATIVO','Status ocupacion':'Vacante',Empleados:'','Dias Vacantes':2}];
 const d1=await sandbox.foro.kpiD1();assert.equal(d1.chart.values.reduce((a,b)=>a+b,0),Number(d1.value));assert.equal(d1.chart.labels.at(-1),'Otro');
 fixture=[{Mes:9,Ano:2026,Semana:10,Tienda:'OXXO A',Dias:3,Denominacion:'OTRA INCIDENCIA'}];
 const d6=await sandbox.foro.kpiD6();assert.equal(d6.chart.values.reduce((a,b)=>a+b,0),3);assert.equal(d6.chart.labels.at(-1),'Otro');
 fixture=[{Tienda:'OXXO A',Asesor:'Ana',Fecha:'2026-09-09',Estatus:'CRITICA'}];
 const d3=await sandbox.foro.kpiD3();assert.equal(d3.ranking.items.length,1);assert.equal(d3.ranking.items[0].value,0);assert.match(d3.sub,/2026-09-09/);
 fixture=[];for(const d of sandbox.foro.DASHBOARDS)assert.equal(await d.fn(),null,d.name+' sin filas');
 const kpi={label:'Total',value:'40',sub:'Datos de ejemplo',secondary:[],chart:{title:'Puestos',labels:['Otro'],values:[40]},ranking:{title:'Asesores',items:Array.from({length:20},(_,i)=>({name:'Asesor completo '+i,value:20-i}))}};
 const paged=new FakePptx();sandbox.foro.addKpiSlide(paged,'Vacantes',kpi);assert.equal(paged.slides.length,2);assert.match(allText(paged),/Asesor completo 19/);
 const firstBar=paged.slides[0].shapes.find(s=>s.o.x===9.45 && s.o.fill.color==='CC0000');
 const nextBar=paged.slides[1].shapes.find(s=>s.o.x===9.45 && s.o.fill.color==='CC0000');assert.equal(nextBar.o.w/firstBar.o.w,5/20);
 for(const d of sandbox.foro.DASHBOARDS)d.fn=async()=>({...kpi,ranking:null,plazaRanking:d.name.includes('2 ·')?[{plaza:'Oaxaca',bajas:40}]:undefined});
 await sandbox.foro.generatePresentation();const complete=instances.at(-1);assert.equal(complete.slides.length,9);assert.equal(complete.layout,'LAYOUT_WIDE');assert.equal(complete.written,true);assert.equal(btn.disabled,false);assert.match(status.textContent,/correctamente/);
 for(const slide of complete.slides)for(const {o} of [...slide.texts,...slide.shapes]){for(const key of ['x','y','w','h'])assert.ok(Number.isFinite(o[key]));assert.ok(o.x+o.w<=13.334 && o.y+o.h<=7.5);}
 sandbox.foro.DASHBOARDS[0].fn=async()=>null;
 await sandbox.foro.generatePresentation();assert.match(status.textContent,/1 indicador/);assert.match(allText(instances.at(-1)),/Sin datos disponibles/);assert.equal(btn.disabled,false);
 sandbox.console={...console,error(){}};sandbox.foro.DASHBOARDS[0].fn=async()=>{throw Error('red no disponible');};
 await sandbox.foro.generatePresentation();assert.match(status.textContent,/1 indicador/);assert.equal(instances.at(-1).written,true);assert.equal(btn.disabled,false);
 failWrite=true;await sandbox.foro.generatePresentation();assert.match(status.textContent,/descarga fallida/);assert.equal(btn.disabled,false);
 console.log('Foro: category totals, zero percentage, pagination, shared scale, 9-slide generation, bounds, missing data and download failure OK');
})().catch(e=>{console.error(e);process.exitCode=1});


