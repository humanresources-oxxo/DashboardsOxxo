(function(){
  // Toda la logica de columnas/filtros/fechas que replica el comportamiento
  // real de los dashboards vive en core.js (window.OXXO.metrics*), para que
  // dashboards y presentaciones nunca vuelvan a divergir. Aqui solo se
  // referencian esas funciones \u2014 nada de esto se reimplementa.
  const findKey = OXXO.metricsFindKey;
  const findDataKey = OXXO.metricsFindDataKey;
  const val = OXXO.metricsVal;
  const num = OXXO.metricsNum;
  const normText = OXXO.metricsNormText;
  const latestByKey = (rows, key) => { const vals = [...new Set(rows.map(r => String(r[key]||'').trim()).filter(Boolean))]; return vals.sort().slice(-1)[0] || ''; };
  // Escapa texto que viene de Sheets antes de insertarlo como HTML (ej. el
  // selector de mes): una celda 'Mes' con formato invalido se usa tal cual
  // como etiqueta, y sin este escape un valor malicioso en el Sheet podria
  // inyectar HTML/JS en admin.html.
  function escHtml(value){ return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
  const rowMonthKeyD1 = OXXO.metricsRowMonthKeyD1;
  const rowMonthKeyD2 = OXXO.metricsRowMonthKeyD2;
  const filterLatestMonth = OXXO.metricsFilterLatestMonth;
  const tipoPuesto = OXXO.metricsTipoPuesto;
  const coerceTreoRowsD7 = OXXO.metricsCoerceTreoRows;
  // Misma regla que normalizePct() en dashboard-3.html: solo se divide entre
  // 100 cuando el valor viene claramente duplicado por el formato Porcentaje
  // de Sheets (>150). Un aprovechamiento real de 100-150% (tienda con mas
  // activos de los necesarios) no se debe tocar.
  function normPct(v){ const n = num(v); return n > 150 ? n / 100 : n; }
  // Acorta un nombre largo a "Nombre(s) Apellido1 A." (inicial del ultimo
  // apellido) en vez de cortarlo a solo el primer nombre: la plaza suele tener
  // varios asesores que comparten nombre de pila, asi que recortar de mas
  // volveria a confundirlos.
  function shortenName(name, maxChars = 24){
    const trimmed = String(name || '').trim();
    if(trimmed.length <= maxChars) return trimmed;
    const parts = trimmed.split(/\s+/);
    if(parts.length <= 2) return trimmed;
    return `${parts.slice(0, -1).join(' ')} ${parts[parts.length - 1][0]}.`;
  }
  // Ranking de conteo por nombre (p.ej. vacantes o bajas por Asesor), top N descendente.
  function rankCount(rows, nameKey, limit){
    const counts = new Map();
    rows.forEach(r => {
      const name = String(val(r, nameKey)||'').trim();
      if(!name) return;
      counts.set(name, (counts.get(name)||0) + 1);
    });
    return [...counts.entries()].map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value).slice(0, limit);
  }
  // Ranking de promedio por nombre (p.ej. % aprovechamiento por AT), ordenado descendente.
  function rankAvg(rows, nameKey, valueKey, limit){
    const sums = new Map(), counts = new Map();
    rows.forEach(r => {
      const name = String(val(r, nameKey)||'').trim();
      if(!name) return;
      sums.set(name, (sums.get(name)||0) + num(val(r, valueKey)));
      counts.set(name, (counts.get(name)||0) + 1);
    });
    return [...sums.entries()].map(([name, sum]) => ({ name, value: sum / counts.get(name) })).sort((a,b) => b.value - a.value).slice(0, limit);
  }
  async function dataD1(targetMes = ''){
    const source = await OXXO.metricsD1Rows(true);
    if (!source || (targetMes && !source.months.includes(targetMes))) return null;
    const { puestoKey, asesorKey } = source;
    const mes = targetMes || source.currentMonth;
    const rows = source.rows.filter(r => rowMonthKeyD1(r, source.mesKey, source.fechaKey) === mes);
    const byPuesto = { Lider: 0, Encargado: 0, Ayudante: 0, Otro: 0 };
    rows.forEach(r => { byPuesto[tipoPuesto(val(r, puestoKey))]++; });
    return {
      total: rows.length, sub: mes ? `Mes ${mes}` : 'Plaza Oaxaca',
      byPuesto,
      ranking: rankCount(rows, asesorKey, 15),
    };
  }

  async function dataD2(targetMes = ''){
    const source = await OXXO.metricsD2Rows(targetMes);
    if (!source) return null;
    const { rows, mes, puestoKey, asesorKey } = source;
    const byPuesto = { Lider: 0, Encargado: 0, Ayudante: 0, Otro: 0 };
    rows.forEach(r => { byPuesto[tipoPuesto(val(r, puestoKey))]++; });
    return {
      total: rows.length, sub: mes ? `Mes ${mes}` : 'Plaza Oaxaca',
      byPuesto,
      ranking: rankCount(rows, asesorKey, 15),
    };
  }

  async function dataD3(){
    const raw = await OXXO.fetchSheetData(OXXO.SHEETS_CONFIG.TABS.d3);
    if(!raw || !raw.length) return null;
    const estatusKey = findKey(raw[0], ['Clas Aprov','Estatus Con impacto Ausentismo','Estatus']);
    const asesorKey = findKey(raw[0], ['Asesor']);
    const tiendaKey = findKey(raw[0], ['Tienda']);
    const crKey = findKey(raw[0], ['CR TIENDA','CR Tienda','CR','ID Tienda']);
    const ecPorAtKey = findKey(raw[0], ['Ec','EC','Ec por AT','EC POR AT','EC por AT','Ec Por AT']);
    const atKey = findKey(raw[0], ['Ats','ATS','AT','At']);
    const fechaKey = findKey(raw[0], ['Mes Semana','Semana','Fecha','FECHA']);
    // Igual que Dashboard 3: aunque cada carga deberia reemplazar toda la
    // pestana (foto diaria), si llegaran a quedar varias fechas mezcladas se
    // usa solo la mas reciente, para no promediar dias distintos.
    const fecha = latestByKey(raw, fechaKey);
    const rows = fecha ? raw.filter(r => String(r[fechaKey]||'').trim() === fecha) : raw;
    const total = rows.length;
    // Misma clasificacion que isCompleta/isIncompleta/isCritica de
    // dashboard-3.html (por texto de Estatus, no por umbral numerico).
    const clasifica = r => OXXO.metricsClasificaAprovechamiento(val(r, estatusKey));
    let completas = 0, incompletas = 0, criticas = 0;
    rows.forEach(r => {
      const c = clasifica(r);
      if(c === 'criticas') criticas++;
      else if(c === 'incompletas') incompletas++;
      else if(c === 'completas') completas++;
    });
    // "Aprovechamiento General" del Dashboard 3 = Equipo Completo / Total (EC%).
    const pct = total > 0 ? (completas / total * 100) : 0;

    // El gauge de OAXACA en "Aprovechamiento por Plaza" reutiliza ese mismo
    // EC% (asi lo calcula dashboard-3.html cuando no hay una columna de plaza
    // por tienda separada) — no es un promedio del aprovechamiento crudo.
    const oaxacaAvg = pct;

    let plazas = [];
    try {
      const otras = await OXXO.fetchSheetData(OXXO.SHEETS_CONFIG.TABS.d3plazas,{scoped:false});
      if(otras && otras.length){
        // findDataKey (no findKey): la hoja de "Otras Plazas" es una carga
        // manual y, como la de TREO, puede traer el mismo problema de
        // exportacion de Google donde el encabezado real queda pegado como
        // texto dentro de otra columna (fila "_buffer_..."). findKey se
        // conformaba con la primera columna que *mencionara* el alias
        // (pudiendo ser una vacia); findDataKey elige la que de verdad
        // tiene datos.
        const plazaKey = findDataKey(otras, ['PLAZAS','Plaza']);
        const valKey = findDataKey(otras, ['Aprovechamiento de estructura a hoy','Aprovechamiento'], 25, true);
        plazas = otras.map(r => ({ name: String(val(r, plazaKey)||'').trim(), value: normPct(val(r, valKey)) })).filter(p => p.name);
      }
    } catch(e){ /* sin datos de otras plazas: se muestra solo Oaxaca */ }
    plazas.push({ name: 'OAXACA', value: oaxacaAvg });
    plazas.sort((a,b) => b.value - a.value);

    // "Aprovechamiento por AT" = tabla EC% (AT) del Dashboard 3: usa la
    // columna 'Ec por AT' de la hoja si viene poblada; si no, cae al mismo
    // EC% (completas/total) calculado por asesor con la clasificacion de
    // Estatus de arriba — nunca el umbral sobre el valor crudo.
    // Dashboard-3.html cruza el EC% (columna 'Ec por AT') por la columna 'AT'
    // (no 'Asesor'), y ese promedio se calcula sobre TODA la base cargada
    // (ALL_DATA, sin filtrar por fecha/semana) — "fijo, no depende de
    // filtros". El resto (total de tiendas y EC% de respaldo) sí usa solo
    // las filas de la fecha mas reciente.
    const ecByAt = new Map();
    if(ecPorAtKey && atKey){
      raw.forEach(r => {
        const ecVal = normPct(val(r, ecPorAtKey));
        const atName = String(val(r, atKey)||'').trim().toUpperCase();
        if(!(ecVal > 0) || !atName) return;
        if(!ecByAt.has(atName)) ecByAt.set(atName, { sum: 0, n: 0 });
        const acc = ecByAt.get(atName);
        acc.sum += ecVal; acc.n++;
      });
    }
    // dashboard-3.html resuelve 'Sin Asesor Asignado' a Timoteo Antonio Perez
    // (via resolveAsesorD1) antes de agrupar por asesor: sin esto, las
    // tiendas sin AT vigente aparecian como su propia fila "Sin Asesor
    // Asignado" en el respaldo EC%, mezcladas con nombres de personas
    // reales. No afecta al cruce por 'ecByAt' de arriba, que agrupa por la
    // columna 'AT' (un concepto distinto a 'Asesor').
    const asesorCatalog = await OXXO.loadAsesorCatalog();
    const byAsesor = new Map();
    rows.forEach(r => {
      const name = String(OXXO.resolveAsesorD1(asesorCatalog, { cr: val(r, crKey), tienda: val(r, tiendaKey), asesor: val(r, asesorKey) }) || '').trim();
      if(!name) return;
      if(!byAsesor.has(name)) byAsesor.set(name, { total: 0, completas: 0 });
      const acc = byAsesor.get(name);
      acc.total++;
      if(clasifica(r) === 'completas') acc.completas++;
    });
    const ranking = [...byAsesor.entries()]
      .map(([name, v]) => {
        const ecAt = ecByAt.get(name.trim().toUpperCase());
        const ec = v.total > 0 ? v.completas / v.total : 0;
        return { name, value: ecAt ? ecAt.sum / ecAt.n : ec * 100, hasData: !!ecAt || ec > 0 };
      })
      .filter(x => x.hasData)
      .sort((a,b) => b.value - a.value)
      .slice(0, 15);

    return {
      sub: fecha ? `Corte ${fecha}` : 'Corte no informado',
      pct, completas, incompletas, criticas,
      plazas: plazas.slice(0, 5),
      ranking,
    };
  }

  // Replica la fuente de TREO del dashboard: SAP/Activos/Vacantes se recalculan
  // desde Dashboard_1_Diario por CR/Tienda para que el reporte coincida con la vista.
  const buildEstructuraDiariaD1 = OXXO.metricsBuildEstructuraDiariaD1;

  async function dataD7(){
    const [rawSheet, estructuraD1] = await Promise.all([
      OXXO.fetchSheetData(OXXO.SHEETS_CONFIG.TABS.s7),
      buildEstructuraDiariaD1(),
    ]);
    const raw = coerceTreoRowsD7(rawSheet);
    if(!raw || !raw.length) return null;
    // findDataKey (no findKey) para toda esta pestana: Dashboard_7_Semanal es
    // propensa al problema de exportacion de Google donde el encabezado real
    // aparece pegado dentro del texto de otra columna (ej. "_buffer_ CR Reg"
    // vs "_buffer_ CR 501K9 50N0M..."); un match por substring simple puede
    // acertarle a la columna vacia que solo *menciona* el alias.
    const difKey = findDataKey(raw, ['Dif SAP vs Est Optima Final'], 25, true);
    const treoKey = findDataKey(raw, ['Estructura Propuesta TREO P2 Jun - Ago','TREO'], 25, true);
    const sapKey = findDataKey(raw, ['Estructura SAP','SAP'], 25, true);
    const activosKey = findDataKey(raw, ['Empleados Activos','Activos'], 25, true);
    const vacantesKey = findDataKey(raw, ['Vacantes'], 25, true);
    const asesorKey = findDataKey(raw, ['Asesor']);
    // Mismos alias que pickField() en dashboard-7.html para 'tienda' y 'cr':
    // sin ellos, una hoja que use 'Unidad Organizativa' o 'ID Tienda' en vez
    // de 'Tienda'/'CR' se queda sin CR para el match por catalogo y cae al
    // respaldo por nombre de tienda, que es menos preciso.
    const tiendaKey = findDataKey(raw, ['Tienda','Nombre Tienda','Unidad','Unidad Org','Unidad Organizativa']);
    const crKey = findDataKey(raw, ['CR','ID Tienda','ID_Tienda']);
    // dashboard-7.html filtra por el catalogo de 255 tiendas autorizadas y
    // excluye 'timoteoantonioperez', igual que Dashboard 1.
    const asesorCatalog = await OXXO.loadAsesorCatalog();
    const rows = raw
      .filter(r => String(val(r, tiendaKey)||'').trim() || String(val(r, asesorKey)||'').trim())
      .filter(r => OXXO.isTiendaValid(asesorCatalog, val(r, tiendaKey), val(r, crKey)))
      .filter(r => normText(val(r, asesorKey)).replace(/[^A-Z]/g,'') !== 'TIMOTEOANTONIOPEREZ')
      .map(r => {
        if(!estructuraD1.ready) return r;
        const cr = String(val(r, crKey)||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
        const tienda = OXXO.metricsCleanKey ? OXXO.metricsCleanKey(String(val(r, tiendaKey)||'').replace(/^OXXO\s+/i,'').trim()) : String(val(r, tiendaKey)||'').trim().toUpperCase();
        const src = (cr && estructuraD1.byCr.get(cr)) || (tienda && estructuraD1.byTienda.get(tienda));
        if(!src) return r;
        const next = { ...r };
        const sap = src.sap || 0;
        const activos = src.activos || 0;
        const vacantes = Math.max(0, sap - activos);
        const treo = num(val(r, treoKey));
        const dif = treo - sap;
        if(sapKey) next[sapKey] = sap;
        if(activosKey) next[activosKey] = activos;
        if(vacantesKey) next[vacantesKey] = vacantes;
        if(difKey) next[difKey] = dif;
        return next;
      });
    const total = rows.length;
    let alineadas = 0, subir = 0, bajar = 0, posSubir = 0, posBajar = 0;
    rows.forEach(r => {
      const d = num(val(r, difKey));
      if(d === 0) alineadas++;
      else if(d > 0) { subir++; posSubir += d; }
      else { bajar++; posBajar += -d; }
    });
    const totalTreo = rows.reduce((s,r) => s + num(val(r, treoKey)), 0);
    const totalActivos = rows.reduce((s,r) => s + num(val(r, activosKey)), 0);
    const totalVacantes = rows.reduce((s,r) => s + num(val(r, vacantesKey)), 0);
    const cobertura = totalTreo > 0 ? (totalActivos / totalTreo * 100) : 0;
    // "Sub-dotadas"/"Sobre-dotadas" NO son subir/bajar (esas comparan SAP vs
    // Est. Optima via 'dif'): dashboard-7.html las calcula aparte, comparando
    // Empleados Activos (ya con el override de estructura diaria aplicado) contra el
    // objetivo TREO directamente por tienda.
    const subDotadas = rows.filter(r => num(val(r, activosKey)) < num(val(r, treoKey))).length;
    const sobreDotadas = rows.filter(r => num(val(r, activosKey)) > num(val(r, treoKey))).length;
    return {
      sub: 'Vigente: TREO + D1',
      total, alineadas, subir, bajar, posSubir, posBajar,
      totalTreo, totalActivos, totalVacantes, cobertura,
      subDotadas, sobreDotadas,
    };
  }

  // ── Paleta y helpers visuales (misma estructura que RAE_BASE.pptx) ──
  const RED = 'CC0000', GOLD = 'FFC400', ORANGE = 'EE7203', DARK = '2B1714';
  const PINKBG = 'FCE8EA', TRACKBG = 'F4F4F4', BORDER = 'E2E2E2';
  const TEXT = '222222', MUTED = '777777', SUBTLE = 'FFE3E0', BADGETEXT = '5A3A00', WHITE = 'FFFFFF', GREEN = '00A878';
  const PAGE_W = 13.333, MARGIN_X = 0.45, HEADER_H = 0.92;

  function addHeader(slide, title, dateLabel){
    slide.addShape('rect', { x: 0, y: 0, w: PAGE_W, h: HEADER_H, fill: { color: RED }, line: { type: 'none' } });
    slide.addShape('rect', { x: 0, y: HEADER_H, w: PAGE_W, h: 0.05, fill: { color: GOLD }, line: { type: 'none' } });
    const fontSize = title.length > 22 ? 22 : 30;
    slide.addText(title, { x: MARGIN_X, y: 0, w: 7.5, h: HEADER_H, fontSize, bold: true, color: WHITE, fontFace: 'Arial', valign: 'middle', margin: 0 });
    slide.addShape('roundRect', { x: 8.05, y: 0.26, w: 2.55, h: 0.42, rectRadius: 0.08, fill: { color: GOLD }, line: { type: 'none' } });
    slide.addText('Plaza Oaxaca', { x: 8.05, y: 0.26, w: 2.55, h: 0.42, fontSize: 13, bold: true, color: BADGETEXT, fontFace: 'Arial', align: 'center', valign: 'middle', margin: 0 });
    slide.addText(`OXXO · Uso Interno · ${dateLabel}`, { x: 10.7, y: 0, w: 2.2, h: HEADER_H, fontSize: 10, color: SUBTLE, fontFace: 'Arial', align: 'right', valign: 'middle', margin: 0, fit: 'shrink' });
  }

  function addSectionTitle(slide, x, y, w, text, rightText){
    slide.addShape('ellipse', { x, y: y + 0.05, w: 0.13, h: 0.13, fill: { color: RED }, line: { type: 'none' } });
    slide.addText(text, { x: x + 0.22, y, w: w - 0.22, h: 0.32, fontSize: 13, bold: true, color: TEXT, fontFace: 'Arial', margin: 0, valign: 'middle' });
    if(rightText){
      slide.addText(rightText, { x: x + w - 2.2, y, w: 2.2, h: 0.32, fontSize: 10, color: MUTED, fontFace: 'Arial', align: 'right', margin: 0, valign: 'middle' });
    }
  }

  function addHeroKpi(slide, x, y, w, h, value, label, sub){
    slide.addShape('roundRect', { x, y, w, h, rectRadius: 0.12, fill: { color: RED }, line: { type: 'none' } });
    slide.addText(String(value), { x: x + 0.2, y: y + 0.12, w: w * 0.45, h: h - 0.24, fontSize: 56, bold: true, color: WHITE, fontFace: 'Arial', valign: 'middle', margin: 0 });
    slide.addText([
      { text: label, options: { bold: true, breakLine: true } },
      { text: sub, options: { bold: false } },
    ], { x: x + w * 0.45, y, w: w * 0.55 - 0.15, h, fontSize: 11, color: SUBTLE, fontFace: 'Arial', valign: 'middle', margin: 0 });
  }

  function addDoughnutCard(pptx, slide, x, y, w, h, title, segments){
    slide.addShape('roundRect', { x, y, w, h, rectRadius: 0.1, fill: { color: WHITE }, line: { color: BORDER, width: 1 } });
    addSectionTitle(slide, x + 0.2, y + 0.16, w - 0.4, title);
    const clean = segments.filter(s => s.value > 0);
    if(!clean.length){
      slide.addText('Sin datos disponibles', { x: x + 0.2, y: y + h/2 - 0.2, w: w - 0.4, h: 0.4, fontSize: 12, color: MUTED, align: 'center', fontFace: 'Arial', margin: 0 });
      return;
    }
    const total = clean.reduce((s, seg) => s + seg.value, 0) || 1;

    // Bloque grafica+leyenda centrado verticalmente en el area bajo el titulo:
    // ancla fija arriba dejaba huecos enormes en tarjetas altas con pocos segmentos.
    const contentTop = y + 0.62;
    const contentH = h - 0.62 - 0.2;
    const chartSize = Math.min(w * 0.42, contentH, 2.3);
    // rowStep debe limitarse a contentH/n; Math.max(contentH, 0.62*n) hacia
    // arriba siempre devolvia 0.62 sin importar contentH, haciendo que la
    // leyenda se calculara para una tarjeta mas alta de la real y se
    // encimara con la dona en tarjetas bajas/anchas (ver mismo fix en
    // admin-pptx-asesor.js).
    const rowStep = Math.min(0.62, contentH / clean.length);
    const blockH = Math.max(chartSize, rowStep * clean.length);
    const blockY = contentTop + Math.max(0, (contentH - blockH) / 2);
    const chartY = blockY + (blockH - chartSize) / 2;

    // Leyenda con ancho maximo (3.2in) en vez de estirarse al ancho completo
    // de la tarjeta, y bloque dona+leyenda centrado horizontalmente (ver
    // mismo fix en admin-pptx-asesor.js).
    const legendW = Math.min(w - 0.6 - chartSize, 3.2);
    const contentW = 0.25 + chartSize + 0.1 + legendW;
    const blockX = x + Math.max(0.2, (w - contentW) / 2);

    slide.addChart(pptx.ChartType.doughnut, [{ name: title, labels: clean.map(s => s.label), values: clean.map(s => s.value) }], {
      x: blockX + 0.25, y: chartY, w: chartSize, h: chartSize,
      chartColors: clean.map(s => s.color),
      showLegend: false, showValue: false, showPercent: false,
      dataBorder: { pt: 2, color: WHITE },
      holeSize: 62,
    });
    const top = clean[0];
    const topPct = Math.round((top.value / total) * 100);
    slide.addText(`${topPct}%`, { x: blockX + 0.25, y: chartY + chartSize/2 - 0.32, w: chartSize, h: 0.34, fontSize: 20, bold: true, color: TEXT, align: 'center', fontFace: 'Arial', margin: 0 });
    slide.addText(top.label.toUpperCase(), { x: blockX + 0.25, y: chartY + chartSize/2 + 0.02, w: chartSize, h: 0.22, fontSize: 8, color: MUTED, align: 'center', fontFace: 'Arial', margin: 0 });

    const legendX = blockX + 0.35 + chartSize;
    const legendRowH = Math.min(0.22, rowStep * 0.36);
    let ly = blockY + (blockH - rowStep * clean.length) / 2;
    clean.forEach(seg => {
      const pct = Math.round((seg.value / total) * 100);
      slide.addShape('ellipse', { x: legendX, y: ly + 0.05, w: 0.1, h: 0.1, fill: { color: seg.color }, line: { type: 'none' } });
      slide.addText(seg.label.toUpperCase(), { x: legendX + 0.18, y: ly - 0.03, w: legendW * 0.55, h: legendRowH, fontSize: 9.5, bold: true, color: MUTED, fontFace: 'Arial', margin: 0 });
      slide.addText(`${pct}%`, { x: legendX + legendW * 0.55, y: ly - 0.03, w: legendW * 0.45, h: legendRowH, fontSize: 9.5, bold: true, color: seg.color, fontFace: 'Arial', align: 'right', margin: 0 });
      slide.addText(String(seg.value), { x: legendX + 0.18, y: ly + rowStep * 0.3, w: legendW, h: legendRowH, fontSize: rowStep >= 0.5 ? 16 : 12, bold: true, color: TEXT, fontFace: 'Arial', margin: 0 });
      ly += rowStep;
    });
  }

  function addRankingList(slide, x, y, w, h, title, items, rightText){
    slide.addShape('roundRect', { x, y, w, h, rectRadius: 0.1, fill: { color: WHITE }, line: { color: BORDER, width: 1 } });
    addSectionTitle(slide, x + 0.2, y + 0.16, w - 0.4, title, rightText);
    if(!items.length){
      slide.addText('Sin datos disponibles', { x: x + 0.2, y: y + h/2 - 0.2, w: w - 0.4, h: 0.4, fontSize: 12, color: MUTED, align: 'center', fontFace: 'Arial', margin: 0 });
      return;
    }
    const maxValue = Math.max(...items.map(it => it.value), 1);
    const rowH = Math.min(0.68, (h - 0.8) / items.length);
    let ry = y + 0.62;
    items.forEach((item, idx) => {
      const barColor = idx === 0 ? RED : GOLD;
      const nameW = w * 0.32;
      const barX = x + 0.2 + nameW;
      const barW = w - 0.4 - nameW - 0.65;
      const pillW = 0.6;
      slide.addText(shortenName(item.name), { x: x + 0.2, y: ry, w: nameW - 0.1, h: rowH, fontSize: 9.5, color: TEXT, fontFace: 'Arial', valign: 'middle', margin: 0, fit: 'shrink' });
      slide.addShape('roundRect', { x: barX, y: ry + rowH * 0.28, w: barW, h: rowH * 0.32, rectRadius: 0.04, fill: { color: TRACKBG }, line: { type: 'none' } });
      const fillW = Math.max(barW * (item.value / maxValue), 0.06);
      slide.addShape('roundRect', { x: barX, y: ry + rowH * 0.28, w: fillW, h: rowH * 0.32, rectRadius: 0.04, fill: { color: barColor }, line: { type: 'none' } });
      slide.addShape('roundRect', { x: x + w - 0.2 - pillW, y: ry + (rowH - 0.24) / 2, w: pillW, h: 0.24, rectRadius: 0.04, fill: { color: PINKBG }, line: { type: 'none' } });
      slide.addText(String(item.value), { x: x + w - 0.2 - pillW, y: ry + (rowH - 0.24) / 2, w: pillW, h: 0.24, fontSize: 10, bold: true, color: RED, fontFace: 'Arial', align: 'center', valign: 'middle', margin: 0 });
      ry += rowH;
    });
  }

  function addGaugeCard(slide, x, y, w, h, pct, label){
    const color = pct >= 95 ? GREEN : (pct >= 85 ? GOLD : RED);
    slide.addShape('roundRect', { x, y, w, h, rectRadius: 0.08, fill: { color: WHITE }, line: { color: BORDER, width: 1 } });
    slide.addText(`${pct.toFixed(1)}%`, { x: x + 0.1, y: y + 0.16, w: w - 0.2, h: 0.6, fontSize: 26, bold: true, color, fontFace: 'Arial', margin: 0 });
    slide.addText(label.toUpperCase(), { x: x + 0.1, y: y + 0.72, w: w - 0.2, h: 0.24, fontSize: 10, bold: true, color: MUTED, fontFace: 'Arial', margin: 0, fit: 'shrink' });
    slide.addShape('roundRect', { x: x + 0.1, y: y + h - 0.24, w: w - 0.2, h: 0.1, rectRadius: 0.05, fill: { color: TRACKBG }, line: { type: 'none' } });
    slide.addShape('roundRect', { x: x + 0.1, y: y + h - 0.24, w: (w - 0.2) * Math.min(pct, 100) / 100, h: 0.1, rectRadius: 0.05, fill: { color }, line: { type: 'none' } });
  }

  // Ranking de porcentaje con barra (p.ej. Aprovechamiento por AT). Igual que
  // addRankingList pero con barra hasta el 100% y color por umbral (95/85%)
  // en vez de color fijo por posicion, y valor mostrado con decimales.
  function addPctRankingList(slide, x, y, w, h, title, items, rightText){
    slide.addShape('roundRect', { x, y, w, h, rectRadius: 0.1, fill: { color: WHITE }, line: { color: BORDER, width: 1 } });
    addSectionTitle(slide, x + 0.2, y + 0.16, w - 0.4, title, rightText);
    if(!items.length){
      slide.addText('Sin datos disponibles', { x: x + 0.2, y: y + h/2 - 0.2, w: w - 0.4, h: 0.4, fontSize: 12, color: MUTED, align: 'center', fontFace: 'Arial', margin: 0 });
      return;
    }
    const rowH = Math.min(0.68, (h - 0.8) / items.length);
    let ry = y + 0.62;
    items.forEach(item => {
      const barColor = item.value >= 95 ? GREEN : (item.value >= 85 ? GOLD : RED);
      const nameW = w * 0.32;
      const barX = x + 0.2 + nameW;
      const barW = w - 0.4 - nameW - 0.75;
      const pillW = 0.7;
      slide.addText(shortenName(item.name), { x: x + 0.2, y: ry, w: nameW - 0.1, h: rowH, fontSize: 9.5, color: TEXT, fontFace: 'Arial', valign: 'middle', margin: 0, fit: 'shrink' });
      slide.addShape('roundRect', { x: barX, y: ry + rowH * 0.28, w: barW, h: rowH * 0.32, rectRadius: 0.04, fill: { color: TRACKBG }, line: { type: 'none' } });
      const fillW = Math.max(barW * Math.min(item.value, 100) / 100, 0.06);
      slide.addShape('roundRect', { x: barX, y: ry + rowH * 0.28, w: fillW, h: rowH * 0.32, rectRadius: 0.04, fill: { color: barColor }, line: { type: 'none' } });
      slide.addShape('roundRect', { x: x + w - 0.2 - pillW, y: ry + (rowH - 0.24) / 2, w: pillW, h: 0.24, rectRadius: 0.04, fill: { color: PINKBG }, line: { type: 'none' } });
      slide.addText(`${item.value.toFixed(1)}%`, { x: x + w - 0.2 - pillW, y: ry + (rowH - 0.24) / 2, w: pillW, h: 0.24, fontSize: 9.5, bold: true, color: barColor, fontFace: 'Arial', align: 'center', valign: 'middle', margin: 0 });
      ry += rowH;
    });
  }

  // Tarjeta de metrica TREO. Proporciones fraccionales (label ~arriba 8-25%,
  // valor grande ~27-68%, nota ~74-96%) tomadas de las coordenadas reales de
  // RAE_BASE.pptx (tarjetas de 1.83x2.05in), para que escale igual sin
  // importar el alto exacto que se le pase.
  function addMetricCard(slide, x, y, w, h, label, value, note){
    slide.addShape('roundRect', { x, y, w, h, rectRadius: 0.08, fill: { color: WHITE }, line: { color: BORDER, width: 1 } });
    slide.addText(label.toUpperCase(), { x: x + 0.14, y: y + h * 0.08, w: w - 0.28, h: h * 0.17, fontSize: 9, bold: true, color: MUTED, fontFace: 'Arial', margin: 0, fit: 'shrink' });
    slide.addText(String(value), { x: x + 0.14, y: y + h * 0.27, w: w - 0.28, h: h * 0.41, fontSize: 30, bold: true, color: TEXT, fontFace: 'Arial', margin: 0, fit: 'shrink' });
    slide.addText(note, { x: x + 0.14, y: y + h * 0.74, w: w - 0.28, h: h * 0.22, fontSize: 8.5, bold: true, color: RED, fontFace: 'Arial', margin: 0, fit: 'shrink' });
  }

  function addNoteCard(slide, x, y, w, h, title, note){
    slide.addShape('roundRect', { x, y, w, h, rectRadius: 0.08, fill: { color: WHITE }, line: { color: BORDER, width: 1 } });
    slide.addText(title, { x: x + 0.14, y: y + h * 0.1, w: w - 0.28, h: h * 0.4, fontSize: 11, bold: true, color: TEXT, fontFace: 'Arial', margin: 0, fit: 'shrink' });
    slide.addText(note, { x: x + 0.14, y: y + h * 0.5, w: w - 0.28, h: h * 0.4, fontSize: 10, color: RED, fontFace: 'Arial', margin: 0, fit: 'shrink' });
  }

  // Tarjeta "Alineacion Global": dona arriba + 3 casillas de estatus abajo,
  // igual que la columna derecha de la diapositiva TREO en RAE_BASE.pptx
  // (ahi la dona no lleva leyenda lateral, sino recuadros debajo).
  function addTreoAlignmentCard(pptx, slide, x, y, w, h, segments){
    slide.addShape('roundRect', { x, y, w, h, rectRadius: 0.1, fill: { color: WHITE }, line: { color: BORDER, width: 1 } });
    addSectionTitle(slide, x + 0.3, y + 0.29, w - 0.6, 'Alineación Global');
    const clean = segments.filter(s => s.value > 0);
    const total = clean.reduce((s, seg) => s + seg.value, 0) || 1;
    const chartSize = Math.min(w * 0.78, h * 0.56);
    const chartX = x + (w - chartSize) / 2;
    const chartY = y + 0.7;
    if(clean.length){
      slide.addChart(pptx.ChartType.doughnut, [{ name: 'Alineación Global', labels: clean.map(s => s.label), values: clean.map(s => s.value) }], {
        x: chartX, y: chartY, w: chartSize, h: chartSize,
        chartColors: clean.map(s => s.color),
        showLegend: false, showValue: false, showPercent: false,
        dataBorder: { pt: 2, color: WHITE },
        holeSize: 62,
      });
      const topPct = Math.round((clean[0].value / total) * 100);
      slide.addText(`${topPct}%`, { x: chartX, y: chartY + chartSize/2 - 0.32, w: chartSize, h: 0.34, fontSize: 22, bold: true, color: TEXT, align: 'center', fontFace: 'Arial', margin: 0 });
      slide.addText(clean[0].label.toUpperCase(), { x: chartX, y: chartY + chartSize/2 + 0.03, w: chartSize, h: 0.22, fontSize: 9, color: MUTED, align: 'center', fontFace: 'Arial', margin: 0 });
    }
    const boxY = chartY + chartSize + 0.15;
    const boxW = (w - 0.4) / segments.length - 0.1;
    segments.forEach((seg, i) => {
      const bx = x + 0.2 + i * (boxW + 0.13);
      slide.addShape('roundRect', { x: bx, y: boxY, w: boxW, h: 0.85, rectRadius: 0.06, fill: { color: TRACKBG }, line: { type: 'none' } });
      slide.addText(String(seg.value), { x: bx, y: boxY + 0.08, w: boxW, h: 0.42, fontSize: 16, bold: true, color: TEXT, align: 'center', fontFace: 'Arial', margin: 0 });
      slide.addText(seg.label, { x: bx, y: boxY + 0.52, w: boxW, h: 0.26, fontSize: 8.5, color: MUTED, align: 'center', fontFace: 'Arial', margin: 0, fit: 'shrink' });
    });
  }

  function emptySlide(pptx, title, dateLabel){
    const {slide,text}=editorialSlide(pptx,title,dateLabel);
    text('Sin datos disponibles',.5,2.75,11.8,.7,30,DARK,true);
    text('No hay información para este corte; no se sustituyó por otro periodo.',.5,3.75,11.8,.65,18,MUTED);
    return slide;
  }

  // Diseño compartido únicamente por Vacantes y Bajas; conserva sus datos y corte.
  function buildPeopleSummary(pptx, d, dateLabel, title){
    const slide = pptx.addSlide();
    slide.background = { color: 'FFFCF8' };
    const text = (value,x,y,w,h,size,color=TEXT,bold=false,extra={}) => slide.addText(String(value),
      { x,y,w,h,fontFace:'Arial',fontSize:size,color,bold,margin:0,breakLine:false,fit:'shrink',...extra });
    const rect = (x,y,w,h,color) => slide.addShape('rect',{x,y,w,h,line:{color,transparency:100},fill:{color}});
    rect(0,0,PAGE_W,.09,RED);
    text('OXXO  /  RECURSOS HUMANOS',.5,.3,7,.25,10,RED,true);
    text('Plaza Oaxaca',10,.3,2.8,.25,10,MUTED,false,{align:'right'});
    text(title,.5,.83,8,.58,30,DARK,true);
    text(dateLabel || 'Corte no informado',8.5,.97,4.3,.3,12,MUTED,false,{align:'right'});
    rect(.5,1.62,12.3,.015,'E5DCD6');
    text(d.total,.5,1.98,3.8,.98,64,RED,true);
    text(title === 'Vacantes' ? 'POSICIONES VACANTES' : 'BAJAS OPERATIVAS',.53,3.04,3.7,.3,12,DARK,true);
    text('Total del corte seleccionado',.53,3.43,3.7,.3,11,MUTED);
    text('Distribución por puesto',.53,4.18,3.7,.32,15,DARK,true);
    const groups=[['Ayudante',GOLD],['Encargado',ORANGE],['Lider',RED],['Otro',MUTED]];
    const total = groups.reduce((sum,[key])=>sum+(Number(d.byPuesto[key])||0),0);
    groups.forEach(([key,color],i)=>{
      const y=4.8+i*.44, value=Number(d.byPuesto[key])||0;
      rect(.53,y+.075,.09,.16,color);
      text(key === 'Lider' ? 'Líder' : key,.75,y,1.65,.28,12);
      text(value,2.5,y,.6,.28,13,DARK,true,{align:'right'});
      text(total ? Math.round(value/total*100)+'%' : '—',3.22,y,.7,.28,11,MUTED,false,{align:'right'});
    });
    rect(4.4,1.97,.015,4.76,'E5DCD6');
    text('Por asesor',4.8,2.02,4,.35,18,DARK,true);
    text('Hasta 15 asesores · mayor a menor',8.4,2.08,4.4,.25,10,MUTED,false,{align:'right'});
    const items = d.ranking || [], max=Math.max(1,...items.map(item=>item.value));
    const rowH=Math.min(.53,4.12/Math.max(1,items.length));
    if(!items.length) text('Sin registros en este corte',4.8,2.8,7,.5,15,MUTED);
    items.forEach((item,i)=>{
      const y=2.65+i*rowH;
      text(item.name,4.8,y,4.35,rowH*.85,items.length>12?11:12,TEXT);
      rect(9.45,y+rowH*.3,2.65,.07,'EDE6DF');
      if(item.value>0) rect(9.45,y+rowH*.3,2.65*item.value/max,.07,RED);
      text(item.value,12.22,y,.58,rowH*.85,12,DARK,true,{align:'right'});
    });
    text('OXXO · Uso interno',.5,7.04,4,.2,9,MUTED);
    text('El total incluye todos los asesores del corte',7.3,7.04,5.5,.2,9,MUTED,false,{align:'right'});
  }

  function buildD1(pptx, d, dateLabel){ buildPeopleSummary(pptx,d,dateLabel,'Vacantes'); }
  function buildD2(pptx, d, dateLabel){ buildPeopleSummary(pptx,d,dateLabel,'Bajas'); }

  function editorialSlide(pptx, title, dateLabel){
    const slide=pptx.addSlide();
    slide.background={color:'FFFCF8'};
    const text=(value,x,y,w,h,size,color=TEXT,bold=false,extra={})=>slide.addText(String(value),
      {x,y,w,h,fontFace:'Arial',fontSize:size,color,bold,margin:0,fit:'shrink',...extra});
    const rect=(x,y,w,h,color)=>slide.addShape('rect',{x,y,w,h,line:{color,transparency:100},fill:{color}});
    rect(0,0,PAGE_W,.09,RED);
    text('OXXO  /  RECURSOS HUMANOS',.5,.3,7,.25,10,RED,true);
    text('Plaza Oaxaca',10,.3,2.8,.25,10,MUTED,false,{align:'right'});
    text(title,.5,.83,8.5,.58,30,DARK,true);
    text(dateLabel||'Corte no informado',9.1,.91,3.7,.48,11,MUTED,false,{align:'right'});
    rect(.5,1.62,12.3,.015,'E5DCD6');
    text('OXXO · Uso interno',.5,7.04,4,.2,9,MUTED);
    return {slide,text,rect};
  }

  function buildD3(pptx, d, dateLabel){
    const {text,rect}=editorialSlide(pptx,'Aprovechamiento de estructura',dateLabel);
    text(d.pct.toFixed(1)+'%',.5,1.98,3.85,.9,56,RED,true);
    text('EQUIPO COMPLETO · OAXACA',.53,2.98,3.7,.28,11,DARK,true);
    text('Meta de referencia: 95%',.53,3.34,3.7,.25,11,MUTED);
    text('Tiendas por estatus',.53,3.83,3.7,.3,15,DARK,true);
    [['Completas',d.completas,GREEN],['Incompletas',d.incompletas,GOLD],['Críticas',d.criticas,RED]].forEach(([label,value,color],i)=>{
      const y=4.25+i*.32;
      rect(.53,y+.07,.09,.14,color);
      text(label,.75,y,2.45,.25,11);
      text(value,3.2,y,.7,.25,12,DARK,true,{align:'right'});
    });
    text('Comparativo por plaza',.53,5.42,3.7,.28,14,DARK,true);
    (d.plazas||[]).forEach((p,i)=>{
      const y=5.83+i*.2;
      text(p.name,.53,y,2.55,.2,10);
      text(p.value.toFixed(1)+'%',3.05,y,.9,.2,10,DARK,true,{align:'right'});
    });
    rect(4.4,1.97,.015,4.86,'E5DCD6');
    text('Equipo completo por asesor',4.8,2.02,5.6,.35,18,DARK,true);
    text('Hasta 15 asesores',10.5,2.08,2.3,.25,10,MUTED,false,{align:'right'});
    const items=d.ranking||[], rowH=Math.min(.53,4.12/Math.max(1,items.length));
    if(!items.length) text('Sin registros disponibles',4.8,2.8,7,.5,15,MUTED);
    items.forEach((item,i)=>{
      const y=2.65+i*rowH, color=item.value>=95?GREEN:(item.value>=85?ORANGE:RED);
      text(item.name,4.8,y,4.35,rowH*.85,items.length>12?11:12);
      rect(9.45,y+rowH*.3,2.3,.07,'EDE6DF');
      if(item.value>0) rect(9.45,y+rowH*.3,2.3*Math.min(item.value,100)/100,.07,color);
      text(item.value.toFixed(1)+'%',11.88,y,.92,rowH*.85,11,DARK,true,{align:'right'});
    });
  }

  function buildD7(pptx, d, dateLabel){
    const {text,rect}=editorialSlide(pptx,'TREO · Estructura',dateLabel);
    text(d.cobertura.toFixed(0)+'%',.5,1.98,3.85,.9,56,RED,true);
    text('COBERTURA DE ESTRUCTURA',.53,2.98,3.7,.28,11,DARK,true);
    text(OXXO.formatNum(d.totalActivos)+' activos / '+OXXO.formatNum(d.totalTreo)+' posiciones TREO',.53,3.4,3.7,.6,12,MUTED);
    text('Tiendas del alcance',.53,4.38,3.7,.3,14,DARK,true);
    text(OXXO.formatNum(d.total),.53,4.81,3.7,.62,34,DARK,true);
    text('Posiciones vacantes',.53,5.66,3.7,.3,14,DARK,true);
    text(OXXO.formatNum(d.totalVacantes),.53,6.05,3.7,.62,34,RED,true);
    rect(4.4,1.97,.015,4.86,'E5DCD6');
    text('Alineación de estructura',4.8,2.02,7.9,.35,18,DARK,true);
    text('Tiendas',10.1,2.55,.95,.25,10,MUTED,false,{align:'right'});
    text('Ajuste de posiciones',11.2,2.55,1.6,.25,10,MUTED,false,{align:'right'});
    const rows=[['Alineadas',d.alineadas,GREEN,'Sin ajuste'],['Por subir',d.subir,GOLD,'+'+OXXO.formatNum(Math.round(d.posSubir))],['Por bajar',d.bajar,RED,'−'+OXXO.formatNum(Math.round(d.posBajar))]];
    rows.forEach(([label,value,color,adjustment],i)=>{
      const y=3.08+i*.66;
      text(label,4.8,y,2.3,.32,14);
      rect(7.3,y+.13,2.4,.09,'EDE6DF');
      if(value>0 && d.total>0) rect(7.3,y+.13,2.4*Math.min(value/d.total,1),.09,color);
      text(value,10.1,y,.95,.32,17,DARK,true,{align:'right'});
      text(adjustment,11.2,y,1.6,.32,12,MUTED,false,{align:'right'});
    });
    rect(4.8,5.08,8,.015,'E5DCD6');
    text('Dotación de personal',4.8,5.4,7.9,.3,16,DARK,true);
    text('Subdotadas',4.8,5.99,3.5,.27,12);
    text('Sobredotadas',9,5.99,3.8,.27,12);
    text(d.subDotadas,4.8,6.35,1.25,.42,26,RED,true);
    text('Activos < TREO',6.15,6.47,2.15,.22,10,MUTED);
    text(d.sobreDotadas,9,6.35,1.25,.42,26,DARK,true);
    text('Activos > TREO',10.35,6.47,2.45,.22,10,MUTED);
  }

  function buildCover(pptx, dateLabel){
    const {text,rect}=editorialSlide(pptx,'Presentación RAE',dateLabel);
    text('Indicadores de recursos humanos',.5,2.5,11.9,.8,34,DARK,true);
    text('Plaza Oaxaca',.5,3.52,11.9,.5,22,RED,true);
    const sections=['Vacantes','Bajas','Aprovechamiento','TREO'];
    sections.forEach((label,i)=>{
      const x=.5+i*3.1;
      rect(x,5.23,2.8,.035,i===0?RED:'E5DCD6');
      text('0'+(i+1),x,5.54,2.8,.45,23,RED,true);
      text(label,x,6.15,2.8,.4,15,DARK,true);
    });
  }

  const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

  // Llena el selector "#pptx-rae-mes" con los meses realmente presentes en
  // Dashboard_1_Diario (columna 'Mes', formato crudo dd/mm/aaaa). Cada opcion
  // guarda dos valores: el mes tal cual para dataD1() y su equivalente
  // canonico YYYY-MM (data-canonico) para dataD2(), que usa otro formato de
  // llave. Sin seleccion = comportamiento de siempre (mes mas reciente).
  async function populateMesSelector(){
    const select = document.getElementById('pptx-rae-mes');
    if(!select) return;
    try {
      const raw = await OXXO.fetchSheetData(OXXO.SHEETS_CONFIG.TABS.d1);
      if(!raw || !raw.length) return;
      const mesKey = findKey(raw[0], ['Mes']);
      const fechaKey = findKey(raw[0], ['Fecha']);
      const keys = [...new Set(raw.map(r => rowMonthKeyD1(r, mesKey, fechaKey)).filter(Boolean))].sort();
      const opts = keys.map(k => {
        const m = String(k).match(/^\d{1,2}\/(\d{1,2})\/(\d{4})$/);
        if(!m) return { key: k, label: k, canon: '' };
        const mm = Number(m[1]), yyyy = Number(m[2]);
        const canon = (mm >= 1 && mm <= 12) ? `${yyyy}-${String(mm).padStart(2,'0')}` : '';
        return { key: k, label: (MESES[mm - 1] || 'Mes') + ' ' + yyyy, canon };
      });
      select.innerHTML = '<option value="">Más reciente</option>' + opts.map(o =>
        `<option value="${escHtml(o.key)}" data-canon="${escHtml(o.canon)}">${escHtml(o.label)}</option>`
      ).join('');
    } catch(e){ /* si falla, se queda solo "Más reciente" */ }
  }

  // Solo las 4 diapositivas que trae RAE_BASE.pptx: Vacantes, Bajas,
  // Aprovechamiento y TREO. Tiempo Extra/Vacaciones/Ausentismos no van aqui.
  function buildDashboardList(mesD1, mesD2){
    return [
      { title: 'VACANTES', fetch: () => dataD1(mesD1), build: buildD1 },
      { title: 'BAJAS', fetch: () => dataD2(mesD2), build: buildD2 },
      { title: 'APROVECHAMIENTO DE ESTRUCTURA', fetch: dataD3, build: buildD3 },
      { title: 'TREO · ESTRUCTURA', fetch: dataD7, build: buildD7 },
    ];
  }

  async function generatePresentation(){
    const statusEl = document.getElementById('pptx-rae-status');
    const btn = document.getElementById('generate-pptx-rae-btn');
    btn.disabled = true;
    btn.textContent = 'Generando...';
    if(statusEl) statusEl.textContent = 'Consultando Google Sheets...';
    try {
      await window.OXXO_ADMIN_ASSETS.ensure('pptx');
      const mesSelect = document.getElementById('pptx-rae-mes');
      const mesOption = mesSelect ? mesSelect.selectedOptions[0] : null;
      const mesD1 = mesOption ? mesOption.value : '';
      const mesD2 = mesOption ? (mesOption.dataset.canon || '') : '';
      const usaMesElegido = Boolean(mesD1);

      const today = new Date();
      const dateLabel = usaMesElegido && mesOption.textContent
        ? mesOption.textContent
        : `${MESES[today.getMonth()]} ${today.getFullYear()}`;

      const pptx = new window.PptxGenJS();
      pptx.layout = 'LAYOUT_WIDE'; // 13.333in x 7.5in, igual que RAE_BASE.pptx

      buildCover(pptx, today.toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' }));

      const DASHBOARDS = buildDashboardList(mesD1, mesD2);
      for(const d of DASHBOARDS){
        try {
          const data = await d.fetch();
          if(data) d.build(pptx, data, data.sub || 'Corte no informado');
          else emptySlide(pptx, d.title, dateLabel);
        } catch(e){
          console.error('Error generando slide', d.title, e);
          emptySlide(pptx, d.title, dateLabel);
        }
      }

      const fileName = `Presentacion-RAE-Oaxaca-${today.toISOString().slice(0,10)}.pptx`;
      await pptx.writeFile({ fileName });
      if(statusEl) statusEl.textContent = 'Presentación generada correctamente.';
    } catch(e){
      console.error(e);
      if(statusEl) statusEl.textContent = 'Error al generar la presentación: ' + e.message;
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<svg class="icon-inline" viewBox="0 0 24 24" aria-hidden="true"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>Generar Presentación RAE';
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('generate-pptx-rae-btn');
    if(btn) btn.addEventListener('click', generatePresentation);
    populateMesSelector();
  });
})();
