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
      chart: { title: 'Vacantes por Puesto', labels: ['Lider','Encargado','Ayudante'], values: [byPuesto.Lider, byPuesto.Encargado, byPuesto.Ayudante] },
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
      if(!byAsesor.has(name)) byAsesor.set(name, { total: 0, completas: 0 });
      const acc = byAsesor.get(name);
      acc.total++;
      if(OXXO.metricsClasificaAprovechamiento(val(r, estatusKey)) === 'completas') acc.completas++;
    });
    const ranking = [...byAsesor.entries()]
      .map(([name, v]) => ({ name, value: v.total > 0 ? (v.completas / v.total * 100) : 0 }))
      .filter(x => x.value > 0)
      .sort((a,b) => b.value - a.value)
      .slice(0, 20);
    return {
      label: 'Aprovechamiento General', value: pct.toFixed(2) + '%', sub: 'Plaza Oaxaca',
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
      label: 'Días Restantes de Vacaciones', value: OXXO.formatNum(Math.round(totalDias)), sub: 'Plaza Oaxaca',
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
      chart: { title: 'Días Ausentes por Tipo', labels: ['Faltas','Incapacidades','Vacaciones','Permisos','Accidentes'], values: [byTipo.Faltas, byTipo.Incapacidades, byTipo.Vacaciones, byTipo.Permisos, byTipo.Accidentes], type: 'pie' },
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
      label: 'Alineación Global TREO', value: pct.toFixed(1) + '%', sub: 'Plaza Oaxaca',
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

  const RED = 'F71926';
  const DARK = '211312';
  const GRAY = '7A4A42';
  const PALETTE = ['F71926','F07B22','F6B73C','1DB954','0066CC','8B4CF7','9E9E9E'];

  function addKpiSlide(pptx, name, kpi){
    const slide = pptx.addSlide();
    slide.background = { color: 'FFF8EF' };
    slide.addText(name, { x: 0.4, y: 0.3, w: 9.2, h: 0.5, fontSize: 22, bold: true, color: DARK, fontFace: 'Arial' });

    if(!kpi){
      slide.addText('Sin datos disponibles', { x: 0.4, y: 2.3, w: 9.2, h: 0.6, fontSize: 22, color: GRAY, align: 'center', fontFace: 'Arial' });
      return;
    }

    // KPI principal (izquierda)
    slide.addText(kpi.value, { x: 0.4, y: 1.0, w: 4.2, h: 1.3, fontSize: 56, bold: true, color: RED, align: 'center', fontFace: 'Arial' });
    slide.addText(kpi.label, { x: 0.4, y: 2.25, w: 4.2, h: 0.45, fontSize: 15, color: DARK, align: 'center', fontFace: 'Arial', bold: true });
    slide.addText(kpi.sub || '', { x: 0.4, y: 2.65, w: 4.2, h: 0.35, fontSize: 11, color: GRAY, align: 'center', fontFace: 'Arial' });

    // KPIs secundarios (debajo del principal)
    (kpi.secondary || []).forEach((s, i) => {
      const y = 3.15 + i * 0.62;
      slide.addShape(pptx.ShapeType.roundRect, { x: 0.4, y, w: 4.2, h: 0.52, fill: { color: 'FFFFFF' }, line: { color: 'EFE2DC', width: 1 }, rectRadius: 0.08 });
      slide.addText(s.label, { x: 0.55, y: y + 0.06, w: 2.6, h: 0.4, fontSize: 12, color: GRAY, fontFace: 'Arial', valign: 'middle' });
      slide.addText(s.value, { x: 3.1, y: y + 0.06, w: 1.4, h: 0.4, fontSize: 14, bold: true, color: DARK, align: 'right', fontFace: 'Arial', valign: 'middle' });
    });

    // Derecha: si hay un ranking real por asesor/AT (Vacantes, Bajas,
    // Aprovechamiento), se muestra esa lista con barras en vez de la
    // gráfica genérica de 3 categorías — es la info que de verdad se usa en
    // el Foro Bienestar.
    if(kpi.ranking && kpi.ranking.items && kpi.ranking.items.length){
      addRankingList(pptx, slide, 4.85, 0.9, 4.75, 4.25, kpi.ranking.title, kpi.ranking.items, { pct: !!kpi.ranking.pct });
    } else if(kpi.chart && kpi.chart.values.some(v => v > 0)){
      const chartType = kpi.chart.type === 'pie' ? pptx.ChartType.pie : pptx.ChartType.bar;
      const dataSeries = [{ name: kpi.chart.title, labels: kpi.chart.labels, values: kpi.chart.values }];
      slide.addText(kpi.chart.title, { x: 4.9, y: 0.9, w: 4.7, h: 0.35, fontSize: 13, bold: true, color: DARK, fontFace: 'Arial' });
      slide.addChart(chartType, dataSeries, {
        x: 4.85, y: 1.25, w: 4.75, h: 3.9,
        chartColors: PALETTE,
        showLegend: true, legendPos: 'b', legendFontSize: 9,
        showValue: kpi.chart.type === 'pie',
        dataLabelFontSize: 10,
        catAxisLabelFontSize: 10,
        valAxisLabelFontSize: 10,
      });
    }
  }

  // Lista de ranking con barras (p.ej. "Bajas por Asesor", "Aprovechamiento
  // por AT"), usando shapes nativos de pptxgenjs — mismo estilo visual que
  // addRankingList()/addPctRankingList() de admin-pptx-rae.js, adaptado al
  // layout mas chico (10x5.63in) de esta presentación.
  function addRankingList(pptx, slide, x, y, w, h, title, items, opts = {}){
    slide.addText(title, { x, y, w, h: 0.32, fontSize: 13, bold: true, color: DARK, fontFace: 'Arial' });
    const contentY = y + 0.42;
    const availH = (y + h) - contentY;
    const rowH = Math.min(0.46, availH / items.length);
    const maxVal = opts.pct ? 100 : Math.max(...items.map(it => it.value), 1);
    const nameW = w * 0.5;
    const barX = x + nameW + 0.05;
    const barW = w - nameW - 0.75;
    const pillW = 0.65;
    items.forEach((item, i) => {
      const ry = contentY + i * rowH;
      const color = opts.pct ? (item.value >= 95 ? '1DB954' : (item.value >= 85 ? 'F6B73C' : RED)) : (i === 0 ? RED : 'F6B73C');
      slide.addText(item.name, { x, y: ry, w: nameW - 0.05, h: rowH, fontSize: 9, color: DARK, fontFace: 'Arial', valign: 'middle', fit: 'shrink' });
      slide.addShape(pptx.ShapeType.roundRect, { x: barX, y: ry + rowH * 0.32, w: barW, h: rowH * 0.36, fill: { color: 'EFE2DC' }, line: { type: 'none' }, rectRadius: 0.03 });
      const fillW = Math.max(barW * (Math.min(item.value, maxVal) / maxVal), 0.05);
      slide.addShape(pptx.ShapeType.roundRect, { x: barX, y: ry + rowH * 0.32, w: fillW, h: rowH * 0.36, fill: { color }, line: { type: 'none' }, rectRadius: 0.03 });
      const valText = opts.pct ? `${item.value.toFixed(1)}%` : String(item.value);
      slide.addText(valText, { x: x + w - pillW, y: ry, w: pillW, h: rowH, fontSize: 10, bold: true, color: RED, align: 'right', fontFace: 'Arial', valign: 'middle' });
    });
  }

  // Diapositiva "🏆 Ranking de Plazas · Bajas acumuladas" — misma tabla que
  // el panel de dashboard-2.html (medalla, barra degradada, pill con el
  // total, footer con el acumulado), con datos reales de Oaxaca + las
  // plazas capturadas a mano en Dashboard_2_Otras_Plazas.
  function addPlazaRankingSlide(pptx, plazaRanking){
    const slide = pptx.addSlide();
    slide.background = { color: 'FFF8EF' };
    slide.addText('Bajas por Plaza · Comparativo Regional', { x: 0.4, y: 0.3, w: 9.2, h: 0.5, fontSize: 22, bold: true, color: DARK, fontFace: 'Arial' });

    if(!plazaRanking || !plazaRanking.length){
      slide.addText('Sin datos disponibles', { x: 0.4, y: 2.3, w: 9.2, h: 0.6, fontSize: 22, color: GRAY, align: 'center', fontFace: 'Arial' });
      return;
    }

    const total = plazaRanking.reduce((s,p) => s + p.bajas, 0) || 1;
    const maxVal = Math.max(...plazaRanking.map(p => p.bajas), 1);
    const rowH = Math.min(0.72, 4.1 / plazaRanking.length);
    let ry = 1.0;
    plazaRanking.forEach((p, i) => {
      const tone = i === 0 ? RED : i === 1 ? 'F07B22' : i === 2 ? 'F6B73C' : '9B6B60';
      const pct = Math.round(p.bajas / total * 100);
      slide.addShape(pptx.ShapeType.roundRect, { x: 0.4, y: ry, w: 9.2, h: rowH - 0.08, fill: { color: 'FFFFFF' }, line: { color: 'EFE2DC', width: 1 }, rectRadius: 0.1 });
      slide.addShape(pptx.ShapeType.ellipse, { x: 0.55, y: ry + (rowH - 0.08) / 2 - 0.22, w: 0.44, h: 0.44, fill: { color: tone }, line: { type: 'none' } });
      slide.addText(String(i + 1), { x: 0.55, y: ry + (rowH - 0.08) / 2 - 0.22, w: 0.44, h: 0.44, fontSize: 14, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', fontFace: 'Arial' });
      slide.addText(p.plaza, { x: 1.15, y: ry + 0.06, w: 4.0, h: 0.3, fontSize: 13, bold: true, color: DARK, fontFace: 'Arial' });
      slide.addText(`${pct}% del total`, { x: 5.2, y: ry + 0.06, w: 3.2, h: 0.3, fontSize: 10, color: GRAY, align: 'right', fontFace: 'Arial' });
      const barX = 1.15, barW = 7.25;
      slide.addShape(pptx.ShapeType.roundRect, { x: barX, y: ry + rowH - 0.34, w: barW, h: 0.14, fill: { color: 'EFE2DC' }, line: { type: 'none' }, rectRadius: 0.07 });
      slide.addShape(pptx.ShapeType.roundRect, { x: barX, y: ry + rowH - 0.34, w: Math.max(barW * (p.bajas / maxVal), 0.08), h: 0.14, fill: { color: tone }, line: { type: 'none' }, rectRadius: 0.07 });
      slide.addShape(pptx.ShapeType.roundRect, { x: 8.55, y: ry + (rowH - 0.08) / 2 - 0.22, w: 1.0, h: 0.44, fill: { color: 'FFF2F1' }, line: { type: 'none' }, rectRadius: 0.22 });
      slide.addText(String(p.bajas), { x: 8.55, y: ry + (rowH - 0.08) / 2 - 0.22, w: 1.0, h: 0.44, fontSize: 15, bold: true, color: RED, align: 'center', valign: 'middle', fontFace: 'Arial' });
      ry += rowH;
    });
    slide.addText('Total acumulado', { x: 0.4, y: ry + 0.05, w: 5.0, h: 0.35, fontSize: 12, bold: true, color: GRAY, fontFace: 'Arial' });
    slide.addText(String(total), { x: 5.4, y: ry + 0.02, w: 2.2, h: 0.4, fontSize: 18, bold: true, color: DARK, align: 'right', fontFace: 'Arial' });
    slide.addText('100%', { x: 7.6, y: ry + 0.1, w: 2.0, h: 0.3, fontSize: 11, bold: true, color: RED, fontFace: 'Arial' });
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
      pptx.defineLayout({ name: 'OXXO', width: 10, height: 5.63 });
      pptx.layout = 'OXXO';

      const title = pptx.addSlide();
      title.background = { color: RED };
      title.addText('Presentación Foro Bienestar Días Martes', { x: 0.6, y: 1.6, w: 8.8, h: 1.3, fontSize: 34, bold: true, color: 'FFFFFF', fontFace: 'Arial' });
      title.addText('Indicadores clave · Plaza Oaxaca', { x: 0.6, y: 2.9, w: 8.8, h: 0.5, fontSize: 18, color: 'FFD7D5', fontFace: 'Arial' });
      const today = new Date();
      title.addText(today.toLocaleDateString('es-MX', { year:'numeric', month:'long', day:'numeric' }), { x: 0.6, y: 4.8, w: 8.8, h: 0.4, fontSize: 12, color: 'FFD7D5', fontFace: 'Arial' });

      results.forEach(({ name, kpi }) => {
        addKpiSlide(pptx, name, kpi);
        if(name === 'Dashboard 2 · Bajas' && kpi && kpi.plazaRanking){
          addPlazaRankingSlide(pptx, kpi.plazaRanking);
        }
      });

      const fileName = `Presentacion-Foro-Bienestar-Dias-Martes-${today.toISOString().slice(0,10)}.pptx`;
      await pptx.writeFile({ fileName });
      if(statusEl) statusEl.textContent = 'Presentación generada correctamente.';
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
