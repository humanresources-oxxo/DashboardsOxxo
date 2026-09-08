(function(){
  // Toda la logica de columnas/filtros/fechas viene de core.js
  // (window.OXXO.metrics*) — ver js/admin-pptx-rae.js para el detalle de
  // por que esto vive centralizado ahi.
  const val = OXXO.metricsVal;
  const num = OXXO.metricsNum;
  const normText = OXXO.metricsNormText;
  const tipoPuesto = OXXO.metricsTipoPuesto;
  const clasificaAprovechamiento = OXXO.metricsClasificaAprovechamiento;

  function esMismoAsesor(row, asesorKey, nombreObjetivo){
    return normText(val(row, asesorKey)) === normText(nombreObjetivo);
  }

  // ── Paleta y helpers visuales (mismos que Presentación RAE) ──
  const RED = 'CC0000', GOLD = 'FFC400', ORANGE = 'EE7203', DARK = '2B1714';
  const TRACKBG = 'F4F4F4', BORDER = 'E2E2E2';
  const TEXT = '222222', MUTED = '777777', SUBTLE = 'FFE3E0', BADGETEXT = '5A3A00', WHITE = 'FFFFFF', GREEN = '00A878';
  // LAYOUT_WIDE de pptxgenjs mide 13.333 x 7.5in — antes buildD7() usaba un
  // "5.75" suelto para calcular la altura disponible (una altura de layout
  // vieja/equivocada), dejando la tarjeta de "Alineación de estructura"
  // demasiado baja (dona chiquita, filas de leyenda amontonadas) y ~1.8in de
  // espacio en blanco sin usar al fondo de la diapositiva.
  const PAGE_W = 13.333, PAGE_H = 7.5, MARGIN_X = 0.45, HEADER_H = 0.92;

  function addHeader(slide, title, sub, dateLabel){
    slide.addShape('rect', { x: 0, y: 0, w: PAGE_W, h: HEADER_H, fill: { color: RED }, line: { type: 'none' } });
    slide.addShape('rect', { x: 0, y: HEADER_H, w: PAGE_W, h: 0.05, fill: { color: GOLD }, line: { type: 'none' } });
    slide.addText(title, { x: MARGIN_X, y: 0, w: 8.4, h: HEADER_H * 0.62, fontSize: 24, bold: true, color: WHITE, fontFace: 'Arial', valign: 'bottom', margin: 0 });
    slide.addText(sub, { x: MARGIN_X, y: HEADER_H * 0.6, w: 8.4, h: HEADER_H * 0.4, fontSize: 12, color: SUBTLE, fontFace: 'Arial', valign: 'top', margin: 0 });
    // "OXXO · Uso Interno" y la pastilla "Plaza Oaxaca" van en FILAS separadas
    // (antes se encimaban: la pastilla ocupaba 9.9-12.45 y el texto arrancaba
    // en 10.7, dentro de esa misma franja horizontal).
    slide.addText(`OXXO · Uso Interno · ${dateLabel}`, { x: PAGE_W - MARGIN_X - 3.0, y: 0.08, w: 3.0, h: 0.22, fontSize: 9, color: SUBTLE, fontFace: 'Arial', align: 'right', valign: 'middle', margin: 0 });
    slide.addShape('roundRect', { x: PAGE_W - MARGIN_X - 2.2, y: 0.36, w: 2.2, h: 0.42, rectRadius: 0.08, fill: { color: GOLD }, line: { type: 'none' } });
    slide.addText('Plaza Oaxaca', { x: PAGE_W - MARGIN_X - 2.2, y: 0.36, w: 2.2, h: 0.42, fontSize: 13, bold: true, color: BADGETEXT, fontFace: 'Arial', align: 'center', valign: 'middle', margin: 0 });
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
    // fit:'shrink' + wrap:false: sin esto, un valor mas largo de lo esperado
    // (p.ej. "85.2%" en vez de un entero de 1-2 digitos) no cabe en el ancho
    // fijo a 56pt y PowerPoint lo parte en dos lineas ("85.2" / "%").
    slide.addText(String(value), { x: x + 0.2, y: y + 0.12, w: w * 0.45, h: h - 0.24, fontSize: 56, bold: true, color: WHITE, fontFace: 'Arial', valign: 'middle', margin: 0, wrap: false, fit: 'shrink' });
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
    const contentTop = y + 0.62;
    const contentH = h - 0.62 - 0.2;
    const chartSize = Math.min(w * 0.42, contentH, 2.3);
    // Antes: Math.max(contentH, 0.62*n)/n siempre devolvía 0.62 sin importar
    // contentH (el Math.max con 0.62*n domina la division), asi que en
    // tarjetas bajas (contentH chico, como el panel ancho de TREO) las N
    // filas de la leyenda se calculaban para una altura mayor a la real de
    // la tarjeta y se salian por debajo, encimandose con la dona (que si
    // respeta contentH). Ahora rowStep tambien se limita a contentH/n.
    const rowStep = Math.min(0.62, contentH / clean.length);
    const blockH = Math.max(chartSize, rowStep * clean.length);
    const blockY = contentTop + Math.max(0, (contentH - blockH) / 2);
    const chartY = blockY + (blockH - chartSize) / 2;

    // La leyenda se limita a un ancho maximo (3.2in) en vez de estirarse al
    // ancho completo de la tarjeta: en tarjetas anchas (full width) eso
    // dejaba el nombre pegado a la dona y el porcentaje disparado hasta el
    // borde derecho, con un vacio enorme en medio. El bloque
    // dona+leyenda ahora se centra horizontalmente dentro de la tarjeta.
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

  function addMetricCard(slide, x, y, w, h, label, value, note){
    slide.addShape('roundRect', { x, y, w, h, rectRadius: 0.08, fill: { color: WHITE }, line: { color: BORDER, width: 1 } });
    slide.addText(label.toUpperCase(), { x: x + 0.14, y: y + h * 0.08, w: w - 0.28, h: h * 0.17, fontSize: 9, bold: true, color: MUTED, fontFace: 'Arial', margin: 0, fit: 'shrink' });
    slide.addText(String(value), { x: x + 0.14, y: y + h * 0.27, w: w - 0.28, h: h * 0.41, fontSize: 30, bold: true, color: TEXT, fontFace: 'Arial', margin: 0, fit: 'shrink' });
    slide.addText(note, { x: x + 0.14, y: y + h * 0.74, w: w - 0.28, h: h * 0.22, fontSize: 8.5, bold: true, color: RED, fontFace: 'Arial', margin: 0, fit: 'shrink' });
  }

  // ── Datos por asesor: reusan las mismas filas ya filtradas/verificadas
  // de core.js (metricsD1Rows/metricsD2Rows/metricsD3Rows/metricsD7Rows), y
  // aqui solo se recorta a las filas del asesor seleccionado.
  async function datosAsesorD1(nombre){
    const d1 = await OXXO.metricsD1Rows();
    if(!d1) return null;
    const rows = d1.rows.filter(r => esMismoAsesor(r, d1.asesorKey, nombre));
    const byPuesto = { Lider: 0, Encargado: 0, Ayudante: 0, Otro: 0 };
    rows.forEach(r => { byPuesto[tipoPuesto(val(r, d1.puestoKey))]++; });
    return { total: rows.length, byPuesto, mes: d1.mes };
  }

  async function datosAsesorD2(nombre){
    const d2 = await OXXO.metricsD2Rows();
    if(!d2) return null;
    const rows = d2.rows.filter(r => esMismoAsesor(r, d2.asesorKey, nombre));
    const byPuesto = { Lider: 0, Encargado: 0, Ayudante: 0, Otro: 0 };
    rows.forEach(r => { byPuesto[tipoPuesto(val(r, d2.puestoKey))]++; });
    return { total: rows.length, byPuesto, mes: d2.mes };
  }

  async function datosAsesorD3(nombre){
    const d3 = await OXXO.metricsD3Rows();
    if(!d3) return null;
    const rows = d3.rows.filter(r => esMismoAsesor(r, d3.asesorKey, nombre));
    let completas = 0, incompletas = 0, criticas = 0;
    rows.forEach(r => {
      const c = clasificaAprovechamiento(val(r, d3.estatusKey));
      if(c === 'criticas') criticas++;
      else if(c === 'incompletas') incompletas++;
      else if(c === 'completas') completas++;
    });
    const total = rows.length;
    const pct = total > 0 ? (completas / total * 100) : 0;
    return { total, completas, incompletas, criticas, pct };
  }

  async function datosAsesorD7(nombre){
    const d7 = await OXXO.metricsD7Rows();
    if(!d7) return null;
    const rows = d7.rows.filter(r => esMismoAsesor(r, d7.asesorKey, nombre));
    const total = rows.length;
    let alineadas = 0, subir = 0, bajar = 0;
    rows.forEach(r => {
      const d = num(val(r, d7.difKey));
      if(d === 0) alineadas++;
      else if(d > 0) subir++;
      else bajar++;
    });
    const totalTreo = rows.reduce((s,r) => s + num(val(r, d7.treoKey)), 0);
    const totalActivos = rows.reduce((s,r) => s + num(val(r, d7.activosKey)), 0);
    const totalVacantes = rows.reduce((s,r) => s + num(val(r, d7.vacantesKey)), 0);
    const cobertura = totalTreo > 0 ? (totalActivos / totalTreo * 100) : 0;
    return { total, alineadas, subir, bajar, totalTreo, totalActivos, totalVacantes, cobertura };
  }

  // Ancho completo (menos margenes): antes el hero + la dona se quedaban en
  // 4.55in fijos y dejaban vacia toda la mitad derecha de la diapositiva
  // (PAGE_W=13.333in). Ahora ambos usan el ancho disponible completo.
  const FULL_W = PAGE_W - MARGIN_X * 2;

  function buildD1(pptx, d, nombre, dateLabel){
    const slide = pptx.addSlide();
    slide.background = { color: WHITE };
    addHeader(slide, 'VACANTES', nombre, dateLabel);
    addHeroKpi(slide, MARGIN_X, 1.25, FULL_W, 1.6, d.total, 'VACANTES TOTALES', d.mes ? `Mes ${d.mes}` : 'Plaza Oaxaca');
    addDoughnutCard(pptx, slide, MARGIN_X, 3.1, FULL_W, 3.15, 'Distribución por puesto', [
      { label: 'Ayudante', value: d.byPuesto.Ayudante, color: GOLD },
      { label: 'Encargado', value: d.byPuesto.Encargado, color: ORANGE },
      { label: 'Lider', value: d.byPuesto.Lider, color: RED },
    ]);
  }

  function buildD2(pptx, d, nombre, dateLabel){
    const slide = pptx.addSlide();
    slide.background = { color: WHITE };
    addHeader(slide, 'BAJAS', nombre, dateLabel);
    addHeroKpi(slide, MARGIN_X, 1.25, FULL_W, 1.6, d.total, 'BAJAS TOTALES', d.mes ? `Mes ${d.mes}` : 'Plaza Oaxaca');
    addDoughnutCard(pptx, slide, MARGIN_X, 3.1, FULL_W, 3.15, 'Distribución por puesto', [
      { label: 'Ayudante', value: d.byPuesto.Ayudante, color: GOLD },
      { label: 'Encargado', value: d.byPuesto.Encargado, color: ORANGE },
      { label: 'Lider', value: d.byPuesto.Lider, color: RED },
      { label: 'Otro', value: d.byPuesto.Otro, color: MUTED },
    ]);
  }

  function buildD3(pptx, d, nombre, dateLabel){
    const slide = pptx.addSlide();
    slide.background = { color: WHITE };
    addHeader(slide, 'APROVECHAMIENTO DE ESTRUCTURA', nombre, dateLabel);
    addHeroKpi(slide, MARGIN_X, 1.25, FULL_W, 1.6, `${d.pct.toFixed(1)}%`, 'APROVECHAMIENTO (EC%)', `${d.total} tiendas · Meta 95%`);
    addDoughnutCard(pptx, slide, MARGIN_X, 3.1, FULL_W, 3.15, 'Estatus con impacto de ausentismo', [
      { label: 'Completas', value: d.completas, color: GREEN },
      { label: 'Incompletas', value: d.incompletas, color: GOLD },
      { label: 'Criticas', value: d.criticas, color: RED },
    ]);
  }

  function buildD7(pptx, d, nombre, dateLabel){
    const slide = pptx.addSlide();
    slide.background = { color: WHITE };
    addHeader(slide, 'TREO · ESTRUCTURA', nombre, dateLabel);
    const cardW = 2.55, cardH = 1.9, gapX = 0.25, y = 1.4;
    const xs = [MARGIN_X, MARGIN_X + cardW + gapX, MARGIN_X + 2 * (cardW + gapX), MARGIN_X + 3 * (cardW + gapX)];
    addMetricCard(slide, xs[0], y, cardW, cardH, 'Total Tiendas', d.total, 'Asignadas al asesor');
    addMetricCard(slide, xs[1], y, cardW, cardH, 'Cobertura', `${d.cobertura.toFixed(0)}%`, `${OXXO.formatNum(d.totalActivos)} de ${OXXO.formatNum(d.totalTreo)} posiciones`);
    addMetricCard(slide, xs[2], y, cardW, cardH, 'Vacantes TREO', OXXO.formatNum(d.totalVacantes), 'En tiendas del asesor');
    addMetricCard(slide, xs[3], y, cardW, cardH, 'Alineadas', d.alineadas, `${d.total ? Math.round(d.alineadas/d.total*100) : 0}% del total`);
    addDoughnutCard(pptx, slide, MARGIN_X, y + cardH + 0.3, PAGE_W - MARGIN_X * 2, PAGE_H - (y + cardH + 0.3) - MARGIN_X, 'Alineación de estructura', [
      { label: 'Alineada', value: d.alineadas, color: GREEN },
      { label: 'Subir', value: d.subir, color: GOLD },
      { label: 'Bajar', value: d.bajar, color: RED },
    ]);
  }

  const DASHBOARDS = [
    { title: 'VACANTES', fetch: datosAsesorD1, build: buildD1 },
    { title: 'BAJAS', fetch: datosAsesorD2, build: buildD2 },
    { title: 'APROVECHAMIENTO DE ESTRUCTURA', fetch: datosAsesorD3, build: buildD3 },
    { title: 'TREO · ESTRUCTURA', fetch: datosAsesorD7, build: buildD7 },
  ];

  function emptySlide(pptx, title, nombre, dateLabel){
    const slide = pptx.addSlide();
    slide.background = { color: WHITE };
    addHeader(slide, title, nombre, dateLabel);
    slide.addText('Sin datos disponibles para este asesor', { x: MARGIN_X, y: 3, w: PAGE_W - MARGIN_X*2, h: 0.6, fontSize: 18, color: MUTED, align: 'center', fontFace: 'Arial' });
    return slide;
  }

  // ── Selector de asesor: union de nombres reales que aparecen en
  // cualquiera de los 4 dashboards (ya filtrados por catalogo/timoteo),
  // para no listar nombres que no existen en ningun lado.
  async function poblarSelectorAsesores(){
    const sel = document.getElementById('select-asesor');
    if(!sel) return;
    sel.innerHTML = '<option value="">Cargando asesores…</option>';
    try {
      const [d1, d2, d3, d7] = await Promise.all([
        OXXO.metricsD1Rows(), OXXO.metricsD2Rows(), OXXO.metricsD3Rows(), OXXO.metricsD7Rows(),
      ]);
      const nombres = new Map(); // clave normalizada -> nombre "bonito" (title-case si existe)
      const agregar = (rows, key) => {
        if(!rows) return;
        rows.rows.forEach(r => {
          const nombre = String(val(r, key) || '').trim();
          if(!nombre) return;
          const clave = normText(nombre);
          const actual = nombres.get(clave);
          // Preferir la grafia con mayusculas/minusculas mixtas (mas legible
          // que "JORDAN VAZQUEZ TOALA" en mayusculas de Dashboard 3).
          if(!actual || (nombre !== nombre.toUpperCase() && actual === actual.toUpperCase())) nombres.set(clave, nombre);
        });
      };
      agregar(d1, d1 && d1.asesorKey);
      agregar(d2, d2 && d2.asesorKey);
      agregar(d3, d3 && d3.asesorKey);
      agregar(d7, d7 && d7.asesorKey);
      const lista = [...nombres.values()].sort((a,b) => a.localeCompare(b, 'es'));
      sel.innerHTML = '<option value="">Selecciona un asesor…</option>' + lista.map(n => `<option value="${OXXO.escHtml(n)}">${OXXO.escHtml(n)}</option>`).join('');
    } catch(e){
      console.error('Error poblando selector de asesores', e);
      sel.innerHTML = '<option value="">Error al cargar asesores</option>';
    }
  }

  async function generatePresentacionAsesor(){
    const statusEl = document.getElementById('pptx-asesor-status');
    const btn = document.getElementById('generate-pptx-asesor-btn');
    const sel = document.getElementById('select-asesor');
    const nombre = sel && sel.value;
    if(!nombre){
      if(statusEl) statusEl.textContent = 'Selecciona un asesor primero.';
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Generando...';
    if(statusEl) statusEl.textContent = 'Consultando Google Sheets...';
    try {
      await window.OXXO_ADMIN_ASSETS.ensure('pptx');
      const today = new Date();
      const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
      const dateLabel = `${MESES[today.getMonth()]} ${today.getFullYear()}`;

      const pptx = new window.PptxGenJS();
      pptx.layout = 'LAYOUT_WIDE';

      const title = pptx.addSlide();
      title.background = { color: RED };
      title.addText('Presentación Individual', { x: 0.8, y: 2.0, w: 11.7, h: 1.0, fontSize: 34, bold: true, color: 'FFFFFF', fontFace: 'Arial' });
      title.addText(nombre, { x: 0.8, y: 3.0, w: 11.7, h: 0.7, fontSize: 24, bold: true, color: GOLD, fontFace: 'Arial' });
      title.addText('Plaza Oaxaca', { x: 0.8, y: 3.75, w: 11.7, h: 0.5, fontSize: 16, color: 'FFD7D5', fontFace: 'Arial' });
      title.addText(today.toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' }), { x: 0.8, y: 6.4, w: 11.7, h: 0.4, fontSize: 13, color: 'FFD7D5', fontFace: 'Arial' });

      for(const d of DASHBOARDS){
        try {
          const data = await d.fetch(nombre);
          if(data && data.total > 0) d.build(pptx, data, nombre, dateLabel);
          else emptySlide(pptx, d.title, nombre, dateLabel);
        } catch(e){
          console.error('Error generando slide', d.title, e);
          emptySlide(pptx, d.title, nombre, dateLabel);
        }
      }

      const fileName = `Presentacion-${nombre.replace(/\s+/g,'-')}-${today.toISOString().slice(0,10)}.pptx`;
      await pptx.writeFile({ fileName });
      if(statusEl) statusEl.textContent = 'Presentación generada correctamente.';
    } catch(e){
      console.error(e);
      if(statusEl) statusEl.textContent = 'Error al generar la presentación: ' + e.message;
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<svg class="icon-inline" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>Generar Presentación del Asesor';
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    poblarSelectorAsesores();
    const btn = document.getElementById('generate-pptx-asesor-btn');
    if(btn) btn.addEventListener('click', generatePresentacionAsesor);
  });
})();
