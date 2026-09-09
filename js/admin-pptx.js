(function(){
  // Toda la logica de columnas/filtros/fechas que replica el comportamiento
  // real de los dashboards vive en core.js (window.OXXO.metrics*), para que
  // dashboards y presentaciones nunca vuelvan a divergir. Aqui solo se
  // referencian esas funciones — nada de esto se reimplementa.
  const findKey = OXXO.metricsFindKey;
  const findDataKey = OXXO.metricsFindDataKey;
  const val = OXXO.metricsVal;
  const num = OXXO.metricsNum;
  const normText = OXXO.metricsNormText;
  const latestByKey = (rows, key) => { const vals = [...new Set(rows.map(r => String(r[key]||'').trim()).filter(Boolean))]; return vals.sort().slice(-1)[0] || ''; };
  const tipoPuesto = OXXO.metricsTipoPuesto;
  const rowMonthKeyD1 = OXXO.metricsRowMonthKeyD1;
  const rowMonthKeyD2 = OXXO.metricsRowMonthKeyD2;
  const filterLatestMonth = OXXO.metricsFilterLatestMonth;
  const coerceTreoRowsD7 = OXXO.metricsCoerceTreoRows;
  // Ranking de conteo por nombre (p.ej. vacantes o bajas por Asesor), top N
  // descendente. Misma logica ya verificada de rankCount() en
  // admin-pptx-rae.js (copia local para no acoplar los dos archivos).
  function rankCount(rows, nameKey, limit){
    const counts = new Map();
    rows.forEach(r => {
      const name = String(val(r, nameKey)||'').trim();
      if(!name) return;
      counts.set(name, (counts.get(name)||0) + 1);
    });
    return [...counts.entries()].map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value).slice(0, limit);
  }
  function tipoAusentismo(desc){
    const d = normText(desc);
    if(d.includes('FALTA')) return 'Faltas';
    if(d.includes('ACCIDENTE')) return 'Accidentes';
    if(d.includes('INC') || d.includes('ENF')) return 'Incapacidades';
    if(d.includes('VACAC')) return 'Vacaciones';
    if(d.includes('MATERN') || d.includes('PATERN') || d.includes('PERMISO')) return 'Permisos';
    return 'Otro';
  }

  async function kpiD1(){
    const source = await OXXO.metricsD1Rows();
    if (!source) return null;
    const { rows, mes, puestoKey, asesorKey } = source;
    const byPuesto = { Lider: 0, Encargado: 0, Ayudante: 0, Otro: 0 };
    rows.forEach(r => { byPuesto[tipoPuesto(val(r, puestoKey))]++; });
    return {
      label: 'Total Vacantes', value: String(rows.length), sub: mes ? `Mes ${mes}` : 'Plaza Oaxaca',
      secondary: [
        { label: 'Lider', value: String(byPuesto.Lider) },
        { label: 'Encargado', value: String(byPuesto.Encargado) },
        { label: 'Ayudante', value: String(byPuesto.Ayudante) },
      ],
      chart: { title: 'Vacantes por Puesto', labels: ['Lider','Encargado','Ayudante','Otro'], values: [byPuesto.Lider, byPuesto.Encargado, byPuesto.Ayudante, byPuesto.Otro] },
      ranking: { title: 'Vacantes por Asesor', items: rankCount(rows, asesorKey, 20) },
    };
  }

  async function kpiD2(){
    const source = await OXXO.metricsD2Rows();
    if (!source) return null;
    const { rows, mes, puestoKey, asesorKey } = source;
    const byMonth = rows;
    const byPuesto = { Lider: 0, Encargado: 0, Ayudante: 0, Otro: 0 };
    rows.forEach(r => { byPuesto[tipoPuesto(val(r, puestoKey))]++; });
    // El total local usa las mismas filas que la diapositiva de bajas.
    const plazaRanking = [{ plaza: 'Oaxaca', bajas: byMonth.length }];
    try {
      const otras = await OXXO.fetchSheetData(OXXO.SHEETS_CONFIG.TABS.d2otras,{scoped:false});
      if(otras && otras.length){
        const plazaOtrasKey = findDataKey(otras, ['Plazas','PLAZAS']);
        const bajasOtrasKey = findDataKey(otras, ['Bajas Plaza','Bajas_Plaza']);
        otras.forEach(r => {
          const plaza = String(val(r, plazaOtrasKey)||'').trim();
          const bajas = num(val(r, bajasOtrasKey));
          if(plaza && bajas > 0 && !plazaRanking.find(p => p.plaza === plaza)) plazaRanking.push({ plaza, bajas });
        });
      }
    } catch(e){ /* sin datos de otras plazas: se muestra solo Oaxaca */ }
    plazaRanking.sort((a,b) => b.bajas - a.bajas);
    return {
      label: 'Total de Bajas', value: String(rows.length), sub: mes ? `Mes ${mes}` : 'Plaza Oaxaca',
      secondary: [
        { label: 'Ayudante', value: String(byPuesto.Ayudante) },
        { label: 'Encargado', value: String(byPuesto.Encargado) },
        { label: 'Lider', value: String(byPuesto.Lider) },
      ],
      chart: { title: 'Bajas por Puesto', labels: ['Ayudante','Encargado','Lider','Otro'], values: [byPuesto.Ayudante, byPuesto.Encargado, byPuesto.Lider, byPuesto.Otro] },
      ranking: { title: 'Bajas por Asesor', items: rankCount(rows, asesorKey, 20) },
      plazaRanking,
    };
  }

  async function kpiD3(){
    const raw = await OXXO.fetchSheetData(OXXO.SHEETS_CONFIG.TABS.d3);
    if(!raw || !raw.length) return null;
    const estatusKey = findKey(raw[0], ['Clas Aprov','Estatus Con impacto Ausentismo','Estatus']);
    const asesorKey = findKey(raw[0], ['Asesor']);
    const tiendaKey = findKey(raw[0], ['Tienda']);
    const crKey = findKey(raw[0], ['CR TIENDA','CR Tienda','CR','ID Tienda']);
    const fechaKey = findKey(raw[0], ['Mes Semana','Semana','Fecha','FECHA']);
    // Igual que dashboard-3.html: limitar al corte de la fecha mas
    // reciente, para no mezclar dias distintos si llegaran a quedar
    // varias fechas en la misma hoja.
    const fecha = latestByKey(raw, fechaKey);
    const rows = fecha ? raw.filter(r => String(r[fechaKey]||'').trim() === fecha) : raw;
    const total = rows.length;
    let completas = 0, incompletas = 0, criticas = 0;
    rows.forEach(r => {
      const c = OXXO.metricsClasificaAprovechamiento(val(r, estatusKey));
      if(c === 'criticas') criticas++;
      else if(c === 'incompletas') incompletas++;
      else if(c === 'completas') completas++;
    });
    const pct = total > 0 ? (completas / total * 100) : 0;
    // "Aprovechamiento por AT" = EC% (Equipo Completo / Total) por Asesor,
    // misma clasificacion que arriba. Igual fallback que dataD3() en
    // admin-pptx-rae.js cuando no hay columna dedicada de 'Ec por AT'.
    // dashboard-3.html resuelve 'Sin Asesor Asignado' a Timoteo Antonio Perez
    // (via resolveAsesorD1) ANTES de agrupar por asesor: sin esto, las
    // tiendas sin AT vigente aparecian como su propia fila "Sin Asesor
    // Asignado" en el ranking, mezcladas con nombres de personas reales.
    const asesorCatalog = await OXXO.loadAsesorCatalog();
    const byAsesor = new Map();
    rows.forEach(r => {
      const name = String(OXXO.resolveAsesorD1(asesorCatalog, { cr: val(r, crKey), tienda: val(r, tiendaKey), asesor: val(r, asesorKey) }) || '').trim();
      if(!name) return;
      // "Sin Asesor Asignado" no es una persona: son las tiendas sin AT
      // vigente que resolveAsesorD1 no pudo reatribuir (Entrenamiento y
      // Operaciones). Agrupadas encabezaban el ranking con 100%, presentadas
      // como el mejor AT de la plaza arriba de todas las personas reales.
      if(normText(name).replace(/[^A-Z]/g, '').includes('SINASESOR')) return;
      if(!byAsesor.has(name)) byAsesor.set(name, { total: 0, completas: 0 });
      const acc = byAsesor.get(name);
      acc.total++;
      if(OXXO.metricsClasificaAprovechamiento(val(r, estatusKey)) === 'completas') acc.completas++;
    });
    const ranking = [...byAsesor.entries()]
      .map(([name, v]) => ({ name, value: v.total > 0 ? (v.completas / v.total * 100) : 0 }))
      .sort((a,b) => b.value - a.value)
      .slice(0, 20);
    return {
      label: 'Aprovechamiento General', value: pct.toFixed(2) + '%', sub: fecha ? 'Corte '+fecha : 'Corte no informado',
      secondary: [
        { label: 'Completas', value: String(completas) },
        { label: 'Incompletas', value: String(incompletas) },
        { label: 'Criticas', value: String(criticas) },
      ],
      chart: { title: 'Tiendas por Estatus', labels: ['Completas','Incompletas','Criticas'], values: [completas, incompletas, criticas], type: 'pie' },
      ranking: { title: 'Aprovechamiento por AT', items: ranking, pct: true },
    };
  }

  async function kpiD4(){
    const raw = await OXXO.fetchSheetData(OXXO.SHEETS_CONFIG.TABS.s4);
    if(!raw || !raw.length) return null;
    const semanaKey = findKey(raw[0], ['Semana']);
    const horasKey = findKey(raw[0], ['Cantidad']);
    const tipoKey = findKey(raw[0], ['Textos homologados']);
    const catalog = await OXXO.loadAsesorCatalog();
    const period = OXXO.metricsPreparePeriodSource(raw, catalog, {
      semanaKey, mesKey: findKey(raw[0], ['Mes']), anoKey: findKey(raw[0], ['Ano','Año']),
      asesorKey: findKey(raw[0], ['Asesor']), tiendaKey: findKey(raw[0], ['Tienda']), crKey: findKey(raw[0], ['Cr de Tienda','CR'])
    });
    const rows = period.currentRows, semana = period.currentPeriod;
    const totalHoras = rows.reduce((s,r) => s + num(val(r, horasKey)), 0);
    const byTipo = { Doble: 0, Triple: 0, Descanso: 0, Sencillo: 0 };
    // Clasificacion normalizada (sin acentos/espacios), igual que dashboard-4.html, para que
    // la presentacion no diverja del dashboard si 'Textos homologados' trae variantes de
    // acentos/espacios.
    rows.forEach(r => {
      const t = normText(val(r, tipoKey));
      const horas = num(val(r, horasKey));
      if(t.replace(/\s+/g,'') === 'TIEMPOEXTRADOBLE') byTipo.Doble += horas;
      else if(t.replace(/\s+/g,'') === 'TIEMPOEXTRATRIPLE') byTipo.Triple += horas;
      else if(t.replace(/\s+/g,'').startsWith('DIADES')) byTipo.Descanso += horas;
      else byTipo.Sencillo += horas;
    });
    return {
      label: 'Total Horas TE', value: OXXO.formatNum(totalHoras), sub: semana ? semana : 'Plaza Oaxaca',
      secondary: [
        { label: 'Doble', value: OXXO.formatNum(byTipo.Doble) },
        { label: 'Triple', value: OXXO.formatNum(byTipo.Triple) },
        { label: 'Descanso', value: OXXO.formatNum(byTipo.Descanso) },
      ],
      chart: { title: 'Horas TE por Tipo', labels: ['Sencillo','Doble','Triple','Descanso'], values: [byTipo.Sencillo, byTipo.Doble, byTipo.Triple, byTipo.Descanso] },
    };
  }

  async function kpiD5(){
    const raw = await OXXO.fetchSheetData(OXXO.SHEETS_CONFIG.TABS.s5);
    if(!raw || !raw.length) return null;
    const diasKey = findKey(raw[0], ['Dias_Restantes']);
    const bucketKey = findKey(raw[0], ['Bucket_Ant']);
    const totalDias = raw.reduce((s,r) => s + num(val(r, diasKey)), 0);
    const buckets = { 'ya vencieron sus dias': 0, '0 a 50 dias': 0, '51 a 100 dias': 0, '101 a 150 dias': 0, 'mas de 150 dias': 0 };
    raw.forEach(r => {
      const b = String(val(r, bucketKey) || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
      if(buckets[b] !== undefined) buckets[b]++;
    });
    return {
      label: 'Días Restantes de Vacaciones', value: OXXO.formatNum(Math.round(totalDias)), sub: 'Base vigente · Corte no informado',
      secondary: [
        { label: 'Vencidos', value: String(buckets['ya vencieron sus dias']) },
        { label: 'Vencen 0-50 días', value: String(buckets['0 a 50 dias']) },
        { label: 'Colaboradores', value: String(raw.length) },
      ],
      chart: { title: 'Colaboradores por Vencimiento', labels: ['Vencidos','0-50 días','51-100 días','101-150 días','+150 días'], values: [buckets['ya vencieron sus dias'], buckets['0 a 50 dias'], buckets['51 a 100 dias'], buckets['101 a 150 dias'], buckets['mas de 150 dias']] },
    };
  }

  async function kpiD6(){
    const raw = await OXXO.fetchSheetData(OXXO.SHEETS_CONFIG.TABS.s6);
    if(!raw || !raw.length) return null;
    const semanaKey = findKey(raw[0], ['Semana']);
    const diasKey = findKey(raw[0], ['Dias']);
    const denomKey = findKey(raw[0], ['Denominacion']);
    const tiendaKey = findKey(raw[0], ['Tienda']);
    const crKey = findKey(raw[0], ['Cr de Tienda','CR de Tienda']);
    const catalog = await OXXO.loadAsesorCatalog();
    const period = OXXO.metricsPreparePeriodSource(raw, catalog, {
      semanaKey, mesKey: findKey(raw[0], ['Mes']), anoKey: findKey(raw[0], ['Ano','Año']),
      asesorKey: findKey(raw[0], ['Asesor']), tiendaKey: findKey(raw[0], ['Tienda']), crKey: findKey(raw[0], ['Cr de Tienda','CR'])
    });
    const rows = period.currentRows, semana = period.currentPeriod;
    const totalDias = rows.reduce((s,r) => s + num(val(r, diasKey)), 0);
    const byTipo = { Faltas: 0, Incapacidades: 0, Vacaciones: 0, Permisos: 0, Accidentes: 0, Otro: 0 };
    rows.forEach(r => { byTipo[tipoAusentismo(val(r, denomKey))] += num(val(r, diasKey)); });
    return {
      label: 'Días Ausentes', value: OXXO.formatNum(Math.round(totalDias)), sub: semana ? semana : 'Plaza Oaxaca',
      secondary: [
        { label: 'Faltas', value: OXXO.formatNum(Math.round(byTipo.Faltas)) },
        { label: 'Incapacidades', value: OXXO.formatNum(Math.round(byTipo.Incapacidades)) },
        { label: 'Vacaciones', value: OXXO.formatNum(Math.round(byTipo.Vacaciones)) },
      ],
      chart: { title: 'Días Ausentes por Tipo', labels: ['Faltas','Incapacidades','Vacaciones','Permisos','Accidentes','Otro'], values: [byTipo.Faltas, byTipo.Incapacidades, byTipo.Vacaciones, byTipo.Permisos, byTipo.Accidentes, byTipo.Otro], type: 'pie' },
    };
  }

  async function kpiD7(){
    const rawSheet = await OXXO.fetchSheetData(OXXO.SHEETS_CONFIG.TABS.s7);
    // Dashboard_7_Semanal es propensa al problema de exportacion de Google
    // donde el encabezado real queda pegado como texto en la primera fila
    // de datos; sin coerceTreoRowsD7 + findDataKey los alias pueden
    // emparejar una columna vacia o equivocada.
    const raw = coerceTreoRowsD7(rawSheet);
    if(!raw || !raw.length) return null;
    const difKey = findDataKey(raw, ['Dif SAP vs Est Optima Final'], 25, true);
    const asesorKey = findDataKey(raw, ['Asesor']);
    const tiendaKey = findDataKey(raw, ['Tienda','Nombre Tienda','Unidad','Unidad Org','Unidad Organizativa']);
    const crKey = findDataKey(raw, ['CR','ID Tienda','ID_Tienda']);
    const asesorCatalog = await OXXO.loadAsesorCatalog();
    const rows = raw
      .filter(r => String(val(r, tiendaKey)||'').trim() || String(val(r, asesorKey)||'').trim())
      .filter(r => OXXO.isTiendaValid(asesorCatalog, val(r, tiendaKey), val(r, crKey)))
      .filter(r => normText(val(r, asesorKey)).replace(/[^A-Z]/g,'') !== 'TIMOTEOANTONIOPEREZ');
    const total = rows.length;
    let alineadas = 0, subir = 0, bajar = 0;
    rows.forEach(r => {
      const d = num(val(r, difKey));
      if(d === 0) alineadas++;
      else if(d > 0) subir++;
      else bajar++;
    });
    const pct = total > 0 ? (alineadas / total * 100) : 0;
    return {
      label: 'Alineación Global TREO', value: pct.toFixed(1) + '%', sub: 'TREO vigente · Corte no informado',
      secondary: [
        { label: 'Alineadas', value: String(alineadas) },
        { label: 'Por Subir', value: String(subir) },
        { label: 'Por Bajar', value: String(bajar) },
      ],
      chart: { title: 'Tiendas por Estatus TREO', labels: ['Alineadas','Por Subir','Por Bajar'], values: [alineadas, subir, bajar], type: 'pie' },
    };
  }

  const DASHBOARDS = [
    { name: 'Dashboard 1 · Vacantes', fn: kpiD1 },
    { name: 'Dashboard 2 · Bajas', fn: kpiD2 },
    { name: 'Dashboard 3 · Aprovechamiento', fn: kpiD3 },
    { name: 'Dashboard 4 · Tiempo Extra', fn: kpiD4 },
    { name: 'Dashboard 5 · Vacaciones', fn: kpiD5 },
    { name: 'Dashboard 6 · Ausentismos', fn: kpiD6 },
    { name: 'Dashboard 7 · TREO', fn: kpiD7 },
  ];

  const RED='CC0000', DARK='2B1714', GRAY='777777';
  const PALETTE=['CC0000','EE7203','FFC400','00A878','0066CC','777777'];

  function slideFrame(pptx, title, period){
    const slide=pptx.addSlide(); slide.background={color:'FFFCF8'};
    const text=(value,x,y,w,h,size=12,color=DARK,bold=false,extra={})=>slide.addText(String(value),
      {x,y,w,h,fontFace:'Arial',fontSize:size,color,bold,margin:0,fit:'shrink',...extra});
    const rect=(x,y,w,h,color)=>slide.addShape('rect',{x,y,w,h,fill:{color},line:{color,transparency:100}});
    rect(0,0,13.333,.09,RED);
    text('OXXO  /  FORO BIENESTAR',.5,.3,7,.25,10,RED,true);
    text('Plaza Oaxaca',10,.3,2.8,.25,10,GRAY,false,{align:'right'});
    text(title.replace(/^Dashboard \d+ · /,''),.5,.83,8.2,.58,30,DARK,true);
    text(period||'Corte no informado',8.9,.89,3.9,.5,11,GRAY,false,{align:'right'});
    rect(.5,1.62,12.3,.015,'E5DCD6');
    text('OXXO · Uso interno',.5,7.04,4,.2,9,GRAY);
    return {slide,text,rect};
  }

  function drawRows(frame, title, items, pct=false, start=0, count=items.length, scaleMax=0){
    const {text,rect}=frame;
    text(title,4.8,2.02,7.9,.36,18,DARK,true);
    text(count ? 'Registros '+(start+1)+'–'+(start+items.length)+' de '+count : 'Sin registros',4.8,2.43,7.9,.23,10,GRAY);
    const rowH=Math.min(.61,3.9/Math.max(1,items.length));
    const max=pct?100:Math.max(1,scaleMax,...items.map(i=>Number(i.value)||0));
    items.forEach((item,i)=>{
      const y=2.89+i*rowH, value=Number(item.value)||0;
      text(item.name,4.8,y,4.35,rowH*.87,items.length>12?11:12);
      rect(9.45,y+rowH*.31,2.3,.07,'EDE6DF');
      const color=pct?(value>=95?'00A878':value>=85?'EE7203':RED):RED;
      if(value>0) rect(9.45,y+rowH*.31,2.3*Math.min(value/max,1),.07,color);
      text(pct?value.toFixed(1)+'%':OXXO.formatNum(value),11.88,y,.92,rowH*.87,11,DARK,true,{align:'right'});
    });
  }

  function addKpiSlide(pptx, name, kpi){
    const ranking=kpi && kpi.ranking;
    const items=ranking && ranking.items || [];
    // Hasta 15 nombres por página; el resto continúa sin recortar personas.
    const pages=Math.max(1,Math.ceil(items.length/15));
    for(let page=0;page<pages;page++){
      const frame=slideFrame(pptx,name,kpi && kpi.sub), {text,rect}=frame;
      if(!kpi){
        text('Sin datos disponibles',.5,2.75,11.8,.7,30,DARK,true);
        text('No se pudo obtener información para este indicador.',.5,3.75,11.8,.65,18,GRAY);
        return;
      }
      text(kpi.value,.5,1.98,3.85,.95,56,RED,true);
      text(kpi.label,.53,3.08,3.7,.65,15,DARK,true);
      const breakdown=ranking && kpi.chart ? kpi.chart.labels.map((label,i)=>({label,value:OXXO.formatNum(kpi.chart.values[i])})) : kpi.secondary||[];
      text(ranking && kpi.chart ? kpi.chart.title : 'Detalle del indicador',.53,4.02,3.7,.5,14,DARK,true);
      breakdown.forEach((item,i)=>{
        const y=4.75+i*.43;
        text(item.label,.53,y,2.55,.31,12);
        text(item.value,3.1,y,.83,.31,13,DARK,true,{align:'right'});
      });
      rect(4.4,1.97,.015,4.86,'E5DCD6');
      if(items.length){
        drawRows(frame,ranking.title,items.slice(page*15,(page+1)*15),!!ranking.pct,page*15,items.length,Math.max(1,...items.map(i=>Number(i.value)||0)));
      }else if(kpi.chart){
        drawRows(frame,kpi.chart.title,kpi.chart.labels.map((label,i)=>({name:label,value:kpi.chart.values[i]})));
      }else text('Sin desglose disponible',4.8,2.8,7,.5,15,GRAY);
      if(pages>1) text('Continuación '+(page+1)+' / '+pages,9,7.04,3.8,.2,9,GRAY,false,{align:'right'});
    }
  }

  function addPlazaRankingSlide(pptx, plazaRanking){
    const frame=slideFrame(pptx,'Bajas por plaza','Bases disponibles por plaza'), {text,rect}=frame;
    const rows=plazaRanking||[], total=rows.reduce((sum,p)=>sum+p.bajas,0);
    text(OXXO.formatNum(total),.5,1.98,3.85,.95,56,RED,true);
    text('BAJAS REPORTADAS',.53,3.08,3.7,.5,15,DARK,true);
    text('Oaxaca y plazas con información disponible.',.53,4.02,3.7,.8,13,GRAY);
    text('Las otras plazas son cargas manuales y pueden tener un corte distinto al de Oaxaca.',.53,5.35,3.7,1.05,12,GRAY);
    rect(4.4,1.97,.015,4.86,'E5DCD6');
    drawRows(frame,'Comparativo regional',rows.map(p=>({name:p.plaza,value:p.bajas})));
  }

  function addCover(pptx,today){
    const {text,rect}=slideFrame(pptx,'Foro Bienestar',today.toLocaleDateString('es-MX',{year:'numeric',month:'long',day:'numeric'}));
    text('Indicadores de recursos humanos',.5,2.5,11.9,.8,34,DARK,true);
    text('Días martes · Plaza Oaxaca',.5,3.52,11.9,.5,22,RED,true);
    ['Vacantes y bajas','Estructura y TREO','Tiempo extra','Vacaciones y\nausentismos'].forEach((label,i)=>{
      const x=.5+i*3.1;rect(x,5.23,2.8,.035,i===0?RED:'E5DCD6');
      text('0'+(i+1),x,5.54,2.8,.45,23,RED,true);
      text(label,x,6.1,2.8,.6,15,DARK,true);
    });
  }

  async function generatePresentation(){
    const statusEl = document.getElementById('pptx-status');
    const btn = document.getElementById('generate-pptx-btn');
    btn.disabled = true;
    btn.textContent = 'Generando...';
    if(statusEl) statusEl.textContent = 'Consultando Google Sheets...';
    try {
      await window.OXXO_ADMIN_ASSETS.ensure('pptx');
      const results = [];
      for(const d of DASHBOARDS){
        try {
          const kpi = await d.fn();
          results.push({ name: d.name, kpi });
        } catch(e) {
          console.error('Error KPI', d.name, e);
          results.push({ name: d.name, kpi: null });
        }
      }

      const pptx = new window.PptxGenJS();
      pptx.layout = 'LAYOUT_WIDE';
      const today = new Date();
      addCover(pptx,today);

      results.forEach(({ name, kpi }) => {
        addKpiSlide(pptx, name, kpi);
        if(name === 'Dashboard 2 · Bajas' && kpi && kpi.plazaRanking){
          addPlazaRankingSlide(pptx, kpi.plazaRanking);
        }
      });

      const fileName = `Presentacion-Foro-Bienestar-Dias-Martes-${today.toISOString().slice(0,10)}.pptx`;
      await pptx.writeFile({ fileName });
      const missing=results.filter(r=>!r.kpi).length;
      if(statusEl) statusEl.textContent = missing ? 'Presentación generada con '+missing+' indicador(es) sin datos disponibles.' : 'Presentación generada correctamente.';
    } catch(e){
      console.error(e);
      if(statusEl) statusEl.textContent = 'Error al generar la presentación: ' + e.message;
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<svg class="icon-inline" viewBox="0 0 24 24" aria-hidden="true"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>Generar Presentación Foro Bienestar Días Martes';
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('generate-pptx-btn');
    if(btn) btn.addEventListener('click', generatePresentation);
  });
})();
