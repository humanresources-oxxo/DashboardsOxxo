/* ==========================================================
   MI TIENDA — vista por tienda
   Se busca una tienda (buscador, no lista completa) y se ve, en
   una sola pagina, sus datos de los 8 dashboards (Vacantes, Bajas,
   Aprovechamiento, Tiempo Extra, Vacaciones, Ausentismos, TREO y
   Capacidades). Usa la MISMA logica de carga que cada dashboard
   real (js/mi-dashboard.js es el equivalente por asesor) pero
   agrupando por tienda: el nombre de tienda no siempre viene igual
   en cada hoja (ej. "OXXO LAS FLORES" vs "Las Flores"), asi que el
   match usa OXXO.normalizeCatalogTienda (misma normalizacion que ya
   usa el catalogo de asesores) en vez de comparar texto exacto.
   ========================================================== */
(function () {
  'use strict';

  // ── Utilidades compartidas ────────────────────────────
  const {
    esc, plural, statTile, emptyRow, clearBox, noneBox,
    gaugeTone, gaugeSVG, gaugeRowHTML, barListHTML, pctBarsHTML,
    movInfo, movPill, estatusCell, rkTile, toneByCount, tonePct,
    chipsHTML, metaHTML, mountSingleSelect, openModal,
  } = window.OXXO_FICHA;
  const V = (row, key) => OXXO.metricsVal(row, key);
  const K = (row, aliases) => OXXO.metricsFindKey(row, aliases);
  const n = (v) => OXXO.formatNum(Math.round(Number(v) || 0));
  const tKey = (v) => OXXO.normalizeCatalogTienda(v);
  const DATA_CONTEXT = OXXO.getDataContext();

  function applyScopeLabels() {
    const brand = document.getElementById('scope-brand-subtitle');
    const footer = document.getElementById('scope-footer-label');
    if (brand) brand.textContent = DATA_CONTEXT.brandSubtitle;
    if (footer) footer.textContent = DATA_CONTEXT.plaza;
  }

  function setSectionBadge(id, kicker, value, tone) {
    const el = document.getElementById(id);
    if (!el) return;
    el.className = `mi-badge mi-badge--cut${tone ? ' ' + tone : ''}`;
    el.innerHTML = `<span>${esc(kicker)}</span><strong>${esc(value || '—')}</strong>`;
  }
  function signalHTML(level, title, detail) {
    const icon = level === 'high' ? '!' : level === 'medium' ? '▲' : '✓';
    return `<div class="mt-signal mt-signal--${level}"><span class="mt-signal__icon">${icon}</span><div><strong>${esc(title)}</strong><small>${esc(detail)}</small></div></div>`;
  }
  function previousMonthKey(ym) {
    const match = String(ym || '').match(/^(\d{4})-(\d{2})$/);
    if (!match) return '';
    const date = new Date(Number(match[1]), Number(match[2]) - 2, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }
  function trendHTML(current, previous, label, formatter) {
    const now = Number(current) || 0;
    const before = Number(previous) || 0;
    const delta = now - before;
    const tone = delta < 0 ? 'good' : delta > 0 ? 'bad' : 'flat';
    const arrow = delta < 0 ? '↓' : delta > 0 ? '↑' : '→';
    const fmt = formatter || ((value) => n(value));
    return `<div class="mt-trend mt-trend--${tone}"><div><span>${esc(label)}</span><strong>${fmt(now)} <i>${arrow} ${fmt(Math.abs(delta))}</i></strong></div><small>Anterior: ${fmt(before)}</small></div>`;
  }

  // ── Acordeon mensual compartido ────────────────────────
  // Varios paneles (Vacantes, Bajas, Tiempo Extra, Ausentismos,
  // Faltantes/Sobrantes) guardan varios meses en su hoja pero antes solo se
  // mostraba el mas reciente. renderMonthsAccordion pinta un boton por mes
  // (mas reciente primero); al hacer clic abre el modal compartido con la
  // tabla de ese mes, en vez de expandirla dentro de la tarjeta.
  const MESES_NOMBRE = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  function mesLabel(ym) {
    const m = String(ym || '').match(/^(\d{4})-(\d{2})$/);
    return m ? `${MESES_NOMBRE[Number(m[2]) - 1]} ${m[1]}` : 'Sin fecha';
  }
  // Columnas "Mes"/"Ano" de Tiempo Extra y Ausentismos vienen como
  // "08.- Agosto" / "2026" -- OXXO.metricsNormalizeMonthKey (pensado para
  // "ago-26" o fechas completas) no reconoce ese formato y regresa ''. Como
  // el numero de mes ya viene al inicio del texto, es mas simple y confiable
  // leerlo directo que intentar generalizar el helper compartido.
  function mesKeyFromMesAno(mesRaw, anoRaw) {
    const mm = String(mesRaw || '').match(/^(\d{1,2})/);
    const yyyy = String(anoRaw || '').match(/(\d{4})/);
    return (mm && yyyy) ? `${yyyy[1]}-${mm[1].padStart(2, '0')}` : '';
  }
  function renderMonthsAccordion(container, rows, monthKeyFn, { titulo, summaryHtml, theadHtml, rowsHtml }) {
    if (!rows.length) { container.innerHTML = ''; return; }
    const porMes = new Map();
    rows.forEach((r) => {
      const ym = monthKeyFn(r);
      if (!porMes.has(ym)) porMes.set(ym, []);
      porMes.get(ym).push(r);
    });
    const keys = [...porMes.keys()].sort().reverse();
    container.innerHTML = keys.map((ym) => `<button type="button" class="mi-month">
        <span class="mi-month__name">${esc(mesLabel(ym))}</span>
        <span class="mi-month__nums">${summaryHtml(porMes.get(ym))}</span>
      </button>`).join('');
    [...container.children].forEach((btn, i) => {
      const mrows = porMes.get(keys[i]);
      btn.addEventListener('click', () => {
        openModal(`${titulo} · ${mesLabel(keys[i])}`, `<table class="tbl"><thead>${theadHtml}</thead><tbody>${rowsHtml(mrows)}</tbody></table>`);
      });
    });
  }

  // ── Estado global (se carga una sola vez) ─────────────
  let CATALOG = null;
  const TIENDAS = new Map(); // normKey -> nombre a mostrar (canonico del catalogo si existe, si no el nombre crudo)
  const DATA = {};
  const SOURCE_KEYS = ['d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8', 'd9', 'd10', 'd11', 'inventarios'];
  const SOURCE_STATE = Object.fromEntries(SOURCE_KEYS.map((key) => [key, 'pending']));
  let activeTiendaDisplay = '';
  let progressiveRenderFrame = 0;

  // El nombre de tienda no viene igual en todas las bases, y en 7 casos ni
  // siquiera empata al normalizar: TREO manda "Bacocho OAX" donde el resto
  // manda "OXXO BACHOCO" (mismo CR 50BKC); igual con Dos Oceanos/Dos
  // Oceanis, Gas Huatulco/Huatulco, Gas Transistmica/Transoceanica, etc.
  // Asi la tienda salia partida en dos entradas del buscador, cada una con
  // datos a medias (una con todo menos TREO, la otra solo con TREO).
  // El CR es la llave real y el catalogo tiene el nombre bueno de cada CR:
  // si la fila trae CR se resuelve por ahi; si no, por nombre (D2 y D5 no
  // traen CR, pero nombran igual que el catalogo).
  function canonKey(cr, nombre) {
    const crk = cr ? OXXO.normalizeCatalogCr(cr) : '';
    const hit = crk ? CATALOG?.byCr?.get(crk) : null;
    if (hit && hit.tienda) return tKey(hit.tienda);
    return tKey(nombre);
  }
  function rowKey(row, d) {
    return canonKey(d.crKey ? V(row, d.crKey) : '', V(row, d.tiendaKey));
  }
  function rowsFor(d, tienda) {
    return d.rows.filter((r) => rowKey(r, d) === tienda);
  }
  function addTiendas(rows, tiendaKey, crKey) {
    if (!tiendaKey) return;
    rows.forEach((r) => {
      const raw = String(V(r, tiendaKey) || '').trim();
      // Ninguna tienda real de OXXO tiene nombre puramente numerico (siempre
      // llevan letras); filas basura tipo totales/checksum al fondo de una
      // hoja a veces dejan "1" en Tienda/CR/Asesor (ver Dashboard_9_Semanal
      // fila 6606, Fecha vacia). No son tiendas, se descartan aqui.
      if (!raw || /^\d+$/.test(raw) || OXXO.metricsIsTiendaEntrenamientoOperacionesD2(raw)) return;
      const key = canonKey(crKey ? V(r, crKey) : '', raw);
      if (!key || TIENDAS.has(key)) return;
      const canon = CATALOG?.byTienda?.get(key)?.tienda;
      TIENDAS.set(key, canon || raw);
    });
  }

  // ── D1 · Vacantes Diarias (mismo pipeline que dashboard-1.html) ──
  async function loadD1() {
    const d1 = await OXXO.metricsD1Rows(true);
    if (!d1) { DATA.d1 = null; return; }
    const diasKey = d1.rows[0] ? K(d1.rows[0], ['Dias Vacantes', 'Dias_Vacantes']) : null;
    const fechaKey = d1.rows[0] ? K(d1.rows[0], ['Fecha']) : null;
    const crKey = d1.rows[0] ? K(d1.rows[0], ['CR TIENDA', 'CR']) : null;
    const statusKey = d1.rows[0] ? K(d1.rows[0], ['Status ocupacion', 'Status ocupación', 'Estatus ocupacion']) : null;
    const currentMonth = OXXO.metricsFilterLatestMonth(d1.rows, (r) => OXXO.metricsRowMonthKeyD1(r, d1.mesKey, fechaKey)).mes;
    DATA.d1 = { ...d1, diasKey, fechaKey, crKey, statusKey, currentMonth };
    addTiendas(d1.rows, d1.tiendaKey, crKey);
  }
  function renderD1(tienda) {
    const d = DATA.d1;
    const el = document.getElementById('sec-d1');
    if (!d) { el.classList.remove('show'); return null; }
    const allRows = rowsFor(d, tienda);
    el.classList.add('show');
    const mesKeyFn = (r) => OXXO.metricsRowMonthKeyD1(r, d.mesKey, d.fechaKey);
    const mes = d.currentMonth || '';
    const rows = mes ? allRows.filter((r) => mesKeyFn(r) === mes) : [];
    const previousRows = mes ? allRows.filter((r) => mesKeyFn(r) === previousMonthKey(mes)) : [];
    const trend = trendHTML(rows.length, previousRows.length, 'Vacantes vs. mes anterior');
    setSectionBadge('badge-d1', 'Corte', mes ? mesLabel(mes) : 'Sin fecha', 'is-current');
    const byPuesto = { Lider: 0, Encargado: 0, Ayudante: 0, Otro: 0 };
    rows.forEach((r) => { byPuesto[OXXO.metricsTipoPuesto(V(r, d.puestoKey))]++; });
    if (!rows.length) {
      document.getElementById('stats-d1').innerHTML = '';
      document.getElementById('viz-d1').innerHTML = trend + clearBox('Sin vacantes activas este mes');
    } else {
      document.getElementById('stats-d1').innerHTML =
        statTile(n(rows.length), 'Vacantes', 'rojo') +
        statTile(n(byPuesto.Lider), 'Líder') +
        statTile(n(byPuesto.Encargado), 'Encargado') +
        statTile(n(byPuesto.Ayudante), 'Ayudante');
      document.getElementById('viz-d1').innerHTML = trend + barListHTML([
        { label: 'Líder', value: byPuesto.Lider },
        { label: 'Encargado', value: byPuesto.Encargado },
        { label: 'Ayudante', value: byPuesto.Ayudante },
        { label: 'Otro', value: byPuesto.Otro },
      ]);
    }
    renderMonthsAccordion(document.getElementById('months-d1'), allRows, mesKeyFn, {
      titulo: 'Vacantes',
      summaryHtml: (mrows) => `<b class="rojo">${n(mrows.length)}</b> vacantes`,
      theadHtml: '<tr><th>Puesto</th><th class="center">Días</th><th>Fecha</th><th>Estatus</th></tr>',
      rowsHtml: (mrows) => mrows.map((r) => `<tr>
          <td>${esc(V(r, d.puestoKey) || '—')}</td>
          <td class="center">${d.diasKey ? esc(OXXO.metricsDiasVacantesValue(V(r, d.diasKey))) : '—'}</td>
          <td>${esc(d.fechaKey ? V(r, d.fechaKey) || '—' : '—')}</td>
          <td>${esc(d.statusKey ? OXXO.truncate(String(V(r, d.statusKey) || '—'), 30) : '—')}</td>
        </tr>`).join(''),
    });
    return { vacantes: rows.length };
  }

  // ── D2 · Bajas Diarias (mismo pipeline que dashboard-2.html) ──
  async function loadD2() {
    const raw = await OXXO.fetchSheetData(OXXO.SHEETS_CONFIG.TABS.d2);
    if (!raw || !raw.length) { DATA.d2 = null; return; }
    const h = raw[0];
    const asesorKey = K(h, ['Asesor']);
    const tiendaKey = K(h, ['Tienda']);
    const medidaKey = K(h, ['Denominación Medida', 'Denominacion Medida', 'Medida', 'Med.']);
    const plazaKey = K(h, ['Plaza']);
    const puestoKey = K(h, ['Puesto']);
    const motivoKey = K(h, ['Motivo', 'Denominación Motivo', 'Denominacion Motivo']);
    const detalleKey = K(h, ['Detalle', 'Detalle de Baja']);
    const fechaKey = K(h, ['Fecha']);
    const mesKey = K(h, ['Mes']);

    const rawSinTimoteo = raw.filter((r) => OXXO.metricsCleanKey(V(r, asesorKey) || '') !== 'timoteoantonioperez');
    rawSinTimoteo.forEach((r) => { r[asesorKey] = OXXO.resolveAsesorD1(CATALOG, { tienda: V(r, tiendaKey), asesor: V(r, asesorKey) }); });
    let base = OXXO.metricsFilterBajasD2(rawSinTimoteo, { medidaKey, plazaKey });
    if (puestoKey) {
      const operativos = base.filter((r) => { const p = OXXO.metricsNormText(V(r, puestoKey)); return p.includes('AYUDANTE') || p.includes('ENCARGADO') || p.includes('LIDER') || p.includes('LÍDER'); });
      if (operativos.length) base = operativos;
    }
    const currentMonth = OXXO.metricsFilterLatestMonth(base, (r) => OXXO.metricsRowMonthKeyD2(r, mesKey, fechaKey)).mes;
    DATA.d2 = { rows: base, asesorKey, tiendaKey, puestoKey, motivoKey, detalleKey, fechaKey, mesKey, currentMonth };
    addTiendas(base, tiendaKey);
  }
  function renderD2(tienda) {
    const d = DATA.d2;
    const el = document.getElementById('sec-d2');
    if (!d) { el.classList.remove('show'); return null; }
    const allRows = rowsFor(d, tienda);
    el.classList.add('show');
    const mesKeyFn = (r) => OXXO.metricsRowMonthKeyD2(r, d.mesKey, d.fechaKey);
    const mes = d.currentMonth || '';
    const rows = mes ? allRows.filter((r) => mesKeyFn(r) === mes) : [];
    const previousRows = mes ? allRows.filter((r) => mesKeyFn(r) === previousMonthKey(mes)) : [];
    const trend = trendHTML(rows.length, previousRows.length, 'Bajas vs. mes anterior');
    setSectionBadge('badge-d2', 'Corte', mes ? mesLabel(mes) : 'Sin fecha', 'is-current');
    const porMotivo = {};
    rows.forEach((r) => { const m = V(r, d.detalleKey) || V(r, d.motivoKey) || 'Sin motivo'; porMotivo[m] = (porMotivo[m] || 0) + 1; });
    const topMotivo = Object.entries(porMotivo).sort((a, b) => b[1] - a[1])[0];
    if (!rows.length) {
      document.getElementById('stats-d2').innerHTML = '';
      document.getElementById('viz-d2').innerHTML = trend + clearBox('Sin bajas este mes');
    } else {
      document.getElementById('stats-d2').innerHTML =
        statTile(n(rows.length), 'Bajas del mes', 'rojo') +
        statTile(topMotivo ? esc(OXXO.truncate(topMotivo[0], 22)) : '—', 'Motivo más frecuente', 'amarillo txt');
      const risk = rows.length >= 3 ? 'high' : rows.length >= 1 ? 'medium' : 'low';
      const riskTitle = risk === 'high' ? 'Rotación alta' : 'Seguimiento recomendado';
      const riskDetail = topMotivo ? `${topMotivo[1]} baja${topMotivo[1] > 1 ? 's' : ''} por ${OXXO.truncate(topMotivo[0], 34)}` : 'Revisa el detalle del periodo';
      const motivosOrdenados = Object.entries(porMotivo).sort((a, b) => b[1] - a[1]);
      document.getElementById('viz-d2').innerHTML = trend + signalHTML(risk, riskTitle, riskDetail) + barListHTML(
        motivosOrdenados.map(([label, value]) => ({ label: OXXO.truncate(label, 24), value }))
      );
    }
    renderMonthsAccordion(document.getElementById('months-d2'), allRows, mesKeyFn, {
      titulo: 'Bajas',
      summaryHtml: (mrows) => `<b class="rojo">${n(mrows.length)}</b> bajas`,
      theadHtml: '<tr><th>Asesor</th><th>Puesto</th><th>Motivo</th><th>Fecha</th></tr>',
      rowsHtml: (mrows) => mrows.map((r) => `<tr>
          <td>${esc(OXXO.truncate(String(V(r, d.asesorKey) || '—'), 20))}</td>
          <td>${esc(V(r, d.puestoKey) || '—')}</td>
          <td>${esc(OXXO.truncate(String(V(r, d.detalleKey) || V(r, d.motivoKey) || '—'), 26))}</td>
          <td>${esc(V(r, d.fechaKey) || '—')}</td>
        </tr>`).join(''),
    });
    return { bajas: rows.length, motivo: topMotivo ? topMotivo[0] : '' };
  }

  // ── D3 · Aprovechamiento de Estructura (mismo pipeline que dashboard-3.html) ──
  async function loadD3() {
    const raw = await OXXO.fetchSheetData(OXXO.SHEETS_CONFIG.TABS.d3);
    if (!raw || !raw.length) { DATA.d3 = null; return; }
    const h = raw[0];
    const asesorKey = K(h, ['Asesor']);
    const tiendaKey = K(h, ['Tienda']);
    const crKey = K(h, ['CR', 'CR Tienda', 'CR TIENDA']);
    const estatusKey = K(h, ['Clas Aprov', 'Estatus Con impacto Ausentismo', 'Estatus']);
    // Misma columna que usa la ficha de tienda de dashboard-3.html: trae el
    // estatus recalculado descontando los ausentismos, con el mismo
    // vocabulario ("Equipo Completo"/"Equipo Incompleto"/"Tienda Critica"),
    // asi que se clasifica con el mismo helper.
    const ecSinAusKey = K(h, ['EC SIN AUSENTISMO', 'EC sin ausentismo', 'EC Sin Ausentismo']);
    const semanaKey = K(h, ['Mes Semana', 'Semana', 'Fecha', 'FECHA']);
    raw.forEach((r) => { r[asesorKey] = OXXO.resolveAsesorD1(CATALOG, { cr: V(r, crKey), tienda: V(r, tiendaKey), asesor: V(r, asesorKey) }); });
    const semanas = [...new Set(raw.map((r) => String(V(r, semanaKey) || '').trim()).filter(Boolean))].sort();
    const semana = semanas[semanas.length - 1] || '';
    const rows = semana ? raw.filter((r) => String(V(r, semanaKey) || '').trim() === semana) : raw;
    DATA.d3 = { rows, semana, asesorKey, tiendaKey, crKey, estatusKey, ecSinAusKey };
    addTiendas(rows, tiendaKey, crKey);
  }
  function renderD3(tienda) {
    const d = DATA.d3;
    const el = document.getElementById('sec-d3');
    if (!d) { el.classList.remove('show'); return null; }
    const rows = rowsFor(d, tienda);
    el.classList.add('show');
    setSectionBadge('badge-d3', 'Corte', d.semana || 'Sin semana', 'is-current');
    let completas = 0, incompletas = 0, criticas = 0;
    let sinCompletas = 0, sinTotal = 0;
    rows.forEach((r) => {
      const c = OXXO.metricsClasificaAprovechamiento(V(r, d.estatusKey));
      if (c === 'completas') completas++; else if (c === 'incompletas') incompletas++; else if (c === 'criticas') criticas++;
      if (d.ecSinAusKey) {
        const s = OXXO.metricsClasificaAprovechamiento(V(r, d.ecSinAusKey));
        if (s) { sinTotal++; if (s === 'completas') sinCompletas++; }
      }
    });
    const ec = rows.length ? Math.round((completas / rows.length) * 100) : 0;
    const ecSin = sinTotal ? Math.round((sinCompletas / sinTotal) * 100) : null;
    document.getElementById('stats-d3').innerHTML = '';
    document.getElementById('viz-d3').innerHTML = rows.length
      ? gaugeRowHTML(ec, null, 'EC · Equipo Completo',
          statTile(n(completas), 'Completas', 'verde') +
          statTile(n(incompletas), 'Incompletas', 'amarillo') +
          statTile(n(criticas), 'Críticas', 'rojo')
        ) + (ecSin !== null ? pctBarsHTML([
          { label: 'Con ausentismo', value: ec },
          { label: 'Sin ausentismo', value: ecSin },
        ]) : '')
      : noneBox('Tu tienda no aparece en la semana vigente');
    const tbody = document.querySelector('#tbl-d3 tbody');
    tbody.innerHTML = rows.length ? rows.slice(0, 200).map((r) => `<tr>
        <td>${esc(V(r, d.asesorKey) || '—')}</td>
        ${estatusCell(V(r, d.estatusKey))}
        ${estatusCell(d.ecSinAusKey ? V(r, d.ecSinAusKey) : '')}
      </tr>`).join('') : emptyRow(3, 'Sin datos de estructura para tu tienda en la semana vigente.');
    return rows.length ? { ec, ecSin, completas, incompletas, criticas } : null;
  }


  // ── D4 · Tiempo Extra (mismo pipeline que dashboard-4.html) ──
  async function loadD4() {
    const raw = await OXXO.fetchSheetData(OXXO.SHEETS_CONFIG.TABS.s4);
    if (!raw || !raw.length) { DATA.d4 = null; return; }
    const h = raw[0];
    const asesorKey = K(h, ['Asesor']);
    const tiendaKey = K(h, ['Texto breve de unidad organizativa']);
    const crKey = K(h, ['Cr de Tienda', 'CR de Tienda']);
    const nombreKey = K(h, ['Nombre del empleado o candidato']);
    const semanaKey = K(h, ['Semana']);
    const mesKey = K(h, ['Mes']);
    const anoKey = K(h, ['Ano', 'Año']);
    const horasKey = K(h, ['Cantidad']);
    const importeKey = K(h, ['Importe']);
    const conceptoKey = K(h, ['Textos homologados', 'Texto homologado']);
    raw.forEach((r) => OXXO.applyAsesorCatalog(r, CATALOG, { asesorKey, tiendaKey, crKey }));
    const monthOf = (r) => mesKeyFromMesAno(V(r, mesKey), V(r, anoKey));
    const currentMonth = [...new Set(raw.map(monthOf).filter(Boolean))].sort().slice(-1)[0] || '';
    const currentMonthRows = currentMonth ? raw.filter((r) => monthOf(r) === currentMonth) : [];
    const currentWeek = [...new Set(currentMonthRows.map((r) => String(V(r, semanaKey) || '').trim()).filter(Boolean))]
      .sort((a, b) => semanaRank(b) - semanaRank(a))[0] || '';
    DATA.d4 = { rows: raw, asesorKey, tiendaKey, crKey, nombreKey, semanaKey, mesKey, anoKey, horasKey, importeKey, conceptoKey, currentMonth, currentWeek };
    addTiendas(raw, tiendaKey, crKey);
  }
  function semanaRank(value) {
    const v = String(value || '').trim();
    const sem = v.match(/(?:sem|semana)\s*(\d{1,2})/i);
    if (sem) return Number(sem[1]);
    if (/^\d{1,2}$/.test(v)) return Number(v);
    const nums = v.match(/\d+/g);
    return nums ? Number(nums[nums.length - 1]) : -1;
  }
  function numParse(v) { const x = parseFloat(String(v ?? '').replace(/,/g, '')); return isNaN(x) ? 0 : x; }
  function renderD4(tienda) {
    const d = DATA.d4;
    const el = document.getElementById('sec-d4');
    if (!d) { el.classList.remove('show'); return null; }
    const allRows = rowsFor(d, tienda);
    el.classList.add('show');
    const mesKeyFn = (r) => mesKeyFromMesAno(V(r, d.mesKey), V(r, d.anoKey));
    // Semana solo se usa para elegir "la mas reciente" DENTRO del mes vigente
    // (sus valores no traen mes, comparar el numero de semana entre meses
    // distintos daria un resultado incorrecto -- ago sem 1 "perderia" contra
    // jul sem 4 aunque agosto sea mas reciente).
    const mesVigente = d.currentMonth || '';
    const rowsMes = mesVigente ? allRows.filter((r) => mesKeyFn(r) === mesVigente) : [];
    const previousRowsMes = mesVigente ? allRows.filter((r) => mesKeyFn(r) === previousMonthKey(mesVigente)) : [];
    const semana = d.currentWeek || '';
    const rows = semana ? rowsMes.filter((r) => String(V(r, d.semanaKey) || '').trim() === semana) : rowsMes;
    const corteD4 = semana ? `${/sem/i.test(semana) ? semana : 'Sem ' + semana} · ${mesLabel(mesVigente)}` : (mesVigente ? mesLabel(mesVigente) : 'Sin fecha');
    setSectionBadge('badge-d4', 'Corte', corteD4, 'is-current');
    const totHoras = rows.reduce((s, r) => s + numParse(V(r, d.horasKey)), 0);
    const totGasto = rows.reduce((s, r) => s + numParse(V(r, d.importeKey)), 0);
    const monthHours = rowsMes.reduce((s, r) => s + numParse(V(r, d.horasKey)), 0);
    const previousMonthHours = previousRowsMes.reduce((s, r) => s + numParse(V(r, d.horasKey)), 0);
    const trend = trendHTML(monthHours, previousMonthHours, 'Horas del mes vs. anterior');
    const porEmpleado = {};
    rows.forEach((r) => { const nom = V(r, d.nombreKey) || 'Sin nombre'; porEmpleado[nom] = (porEmpleado[nom] || 0) + numParse(V(r, d.horasKey)); });
    if (!rows.length) {
      document.getElementById('stats-d4').innerHTML = '';
      document.getElementById('viz-d4').innerHTML = trend + clearBox('Sin tiempo extra esta semana');
    } else {
      document.getElementById('stats-d4').innerHTML =
        statTile(n(totHoras), 'Horas TE', 'amarillo') +
        statTile('$' + n(totGasto), 'Gasto TE', 'rojo') +
        statTile(n(rows.length), 'Registros');
      const risk = totHoras >= 20 ? 'high' : totHoras >= 10 ? 'medium' : 'low';
      const riskTitle = risk === 'high' ? 'Tiempo extra alto' : risk === 'medium' ? 'Tiempo extra en seguimiento' : 'Tiempo extra controlado';
      const riskDetail = `${n(totHoras)} horas y $${n(totGasto)} en el corte vigente`;
      document.getElementById('viz-d4').innerHTML = trend + signalHTML(risk, riskTitle, riskDetail) + barListHTML(
        Object.entries(porEmpleado).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label: OXXO.truncate(label, 24), value })), 'naranja'
      );
    }
    renderMonthsAccordion(document.getElementById('months-d4'), allRows, mesKeyFn, {
      titulo: 'Tiempo Extra',
      summaryHtml: (mrows) => {
        const horas = mrows.reduce((s, r) => s + numParse(V(r, d.horasKey)), 0);
        const gasto = mrows.reduce((s, r) => s + numParse(V(r, d.importeKey)), 0);
        return `<span><b class="amarillo">${n(horas)}</b> h</span><span><b class="rojo">$${n(gasto)}</b></span>`;
      },
      theadHtml: '<tr><th>Empleado</th><th>Concepto</th><th class="center">Horas</th><th class="center">Importe</th></tr>',
      rowsHtml: (mrows) => {
        const porEmp = new Map();
        mrows.forEach((r) => {
          const nom = V(r, d.nombreKey) || 'Sin nombre';
          const cur = porEmp.get(nom) || { horas: 0, importe: 0, conceptos: new Set() };
          cur.horas += numParse(V(r, d.horasKey));
          cur.importe += numParse(V(r, d.importeKey));
          if (d.conceptoKey) { const c = V(r, d.conceptoKey); if (c) cur.conceptos.add(String(c)); }
          porEmp.set(nom, cur);
        });
        return [...porEmp.entries()].sort((a, b) => b[1].importe - a[1].importe).map(([nom, v]) => `<tr>
            <td>${esc(OXXO.truncate(nom, 26))}</td>
            <td>${esc(OXXO.truncate([...v.conceptos].join(', ') || '—', 26))}</td>
            <td class="center">${n(v.horas)}</td>
            <td class="center">$${n(v.importe)}</td>
          </tr>`).join('');
      },
    });
    return { horas: totHoras, gasto: totGasto };
  }

  // ── D5 · Vacaciones (mismo pipeline que js/dashboard-5-vacaciones.js) ──
  async function loadD5() {
    const raw = await OXXO.fetchSheetData(OXXO.SHEETS_CONFIG.TABS.s5);
    if (!raw || !raw.length) { DATA.d5 = null; return; }
    const h = raw[0];
    const asesorKey = K(h, ['Asesor']);
    const tiendaKey = K(h, ['Tienda']);
    const nombreKey = K(h, ['Nombre']);
    const diasRestKey = K(h, ['Dias_Restantes']);
    const bucketKey = K(h, ['Bucket_Ant']);
    const puestoKey = K(h, ['Puesto']);
    const fechaFinKey = K(h, ['Fecha_Fin']);
    raw.forEach((r) => { r[asesorKey] = OXXO.resolveAsesorD1(CATALOG, { asesor: V(r, asesorKey), tienda: V(r, tiendaKey) }); });
    DATA.d5 = { rows: raw, asesorKey, tiendaKey, nombreKey, diasRestKey, bucketKey, puestoKey, fechaFinKey };
    addTiendas(raw, tiendaKey);
  }
  function renderD5(tienda) {
    const d = DATA.d5;
    const el = document.getElementById('sec-d5');
    if (!d) { el.classList.remove('show'); return null; }
    const rows = rowsFor(d, tienda);
    el.classList.add('show');
    setSectionBadge('badge-d5', 'Base', plural(rows.length, 'colaborador', 'colaboradores'));
    const totDias = rows.reduce((s, r) => s + (Number(V(r, d.diasRestKey)) || 0), 0);
    const vencidos = rows.filter((r) => OXXO.metricsNormText(V(r, d.bucketKey)).includes('VENCIERON')).length;
    const proximos = rows.filter((r) => { const b = OXXO.metricsNormText(V(r, d.bucketKey)); return b.includes('0 A 50') || b.includes('0A50'); }).length;
    if (!rows.length) {
      document.getElementById('stats-d5').innerHTML = '';
      document.getElementById('viz-d5').innerHTML = noneBox('Sin colaboradores con saldo de vacaciones');
    } else {
      document.getElementById('stats-d5').innerHTML = statTile(n(totDias), 'Días restantes', 'azul');
      document.getElementById('viz-d5').innerHTML = '';
    }
    const tbody = document.querySelector('#tbl-d5 tbody');
    const sorted = [...rows].sort((a, b) => (Number(V(b, d.diasRestKey)) || 0) - (Number(V(a, d.diasRestKey)) || 0));
    tbody.innerHTML = sorted.length ? sorted.slice(0, 200).map((r) => `<tr>
        <td>${esc(OXXO.truncate(String(V(r, d.nombreKey) || '—'), 26))}</td>
        <td>${esc(d.puestoKey ? V(r, d.puestoKey) || '—' : '—')}</td>
        <td class="center">${esc(V(r, d.diasRestKey) || '0')}</td>
        <td>${esc(V(r, d.bucketKey) || '—')}</td>
        <td>${esc(d.fechaFinKey ? V(r, d.fechaFinKey) || '—' : '—')}</td>
      </tr>`).join('') : emptyRow(5, 'Sin colaboradores con saldo de vacaciones.');
    return { colaboradores: rows.length, diasVac: totDias, vencidos, proximos };
  }

  // ── D6 · Ausentismos (mismo pipeline que dashboard-6.html) ──
  async function loadD6() {
    const raw = await OXXO.fetchSheetData(OXXO.SHEETS_CONFIG.TABS.s6);
    if (!raw || !raw.length) { DATA.d6 = null; return; }
    const h = raw[0];
    const asesorKey = K(h, ['Asesor']);
    const tiendaKey = K(h, ['Tienda']);
    const crKey = K(h, ['Cr de Tienda', 'CR de Tienda']);
    const tipoKey = K(h, ['Denominacion', 'Denominación']);
    const diasKey = K(h, ['Dias', 'Días']);
    const nombreKey = K(h, ['Nombre del empleado o candidato', 'Nombre del empleado']);
    const noPersKey = K(h, ['N de personal', 'N de Personal', 'No de personal', 'N° de personal']);
    const puestoKey = K(h, ['Puesto']);
    const mesKey = K(h, ['Mes']);
    const anoKey = K(h, ['Ano', 'Año']);
    raw.forEach((r) => OXXO.applyAsesorCatalog(r, CATALOG, { asesorKey, tiendaKey, crKey }));
    const monthOf = (r) => mesKeyFromMesAno(V(r, mesKey), V(r, anoKey));
    const currentMonth = [...new Set(raw.map(monthOf).filter(Boolean))].sort().slice(-1)[0] || '';
    DATA.d6 = { rows: raw, asesorKey, tiendaKey, crKey, tipoKey, diasKey, nombreKey, noPersKey, puestoKey, mesKey, anoKey, currentMonth };
    addTiendas(raw, tiendaKey, crKey);
  }
  function renderD6(tienda) {
    const d = DATA.d6;
    const el = document.getElementById('sec-d6');
    if (!d) { el.classList.remove('show'); return null; }
    const allRows = rowsFor(d, tienda);
    el.classList.add('show');
    const mesKeyFn = (r) => mesKeyFromMesAno(V(r, d.mesKey), V(r, d.anoKey));
    const mesVigente = d.currentMonth || '';
    const rows = mesVigente ? allRows.filter((r) => mesKeyFn(r) === mesVigente) : [];
    const previousRows = mesVigente ? allRows.filter((r) => mesKeyFn(r) === previousMonthKey(mesVigente)) : [];
    setSectionBadge('badge-d6', 'Corte', mesVigente ? mesLabel(mesVigente) : 'Sin fecha', 'is-current');
    const empleados = new Set(rows.map((r) => V(r, d.noPersKey) || V(r, d.nombreKey))).size;
    const totDias = rows.reduce((s, r) => s + (parseFloat(V(r, d.diasKey)) || 0), 0);
    const previousDays = previousRows.reduce((s, r) => s + (parseFloat(V(r, d.diasKey)) || 0), 0);
    const trend = trendHTML(totDias, previousDays, 'Días ausentes vs. mes anterior');
    const faltas = rows.filter((r) => OXXO.metricsNormText(V(r, d.tipoKey)).includes('FALTA')).length;
    const porTipo = {};
    rows.forEach((r) => { const tipo = V(r, d.tipoKey) || 'Sin tipo'; porTipo[tipo] = (porTipo[tipo] || 0) + (parseFloat(V(r, d.diasKey)) || 0); });
    if (!rows.length) {
      document.getElementById('stats-d6').innerHTML = '';
      document.getElementById('viz-d6').innerHTML = trend + clearBox('Sin ausentismos registrados este mes');
    } else {
      document.getElementById('stats-d6').innerHTML =
        statTile(n(empleados), 'Empleados', 'rojo') +
        statTile(n(totDias), 'Días ausentes', 'amarillo') +
        statTile(n(faltas), 'Faltas', faltas > 0 ? 'rojo' : 'verde');
      const risk = faltas > 0 || totDias >= 10 ? 'high' : totDias >= 5 ? 'medium' : 'low';
      const riskTitle = risk === 'high' ? 'Ausentismo prioritario' : risk === 'medium' ? 'Ausentismo en seguimiento' : 'Ausentismo controlado';
      const riskDetail = faltas > 0 ? `${n(faltas)} falta${faltas > 1 ? 's' : ''} y ${n(totDias)} días ausentes` : `${n(totDias)} días ausentes en el corte vigente`;
      document.getElementById('viz-d6').innerHTML = trend + signalHTML(risk, riskTitle, riskDetail) + barListHTML(
        Object.entries(porTipo).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label: OXXO.truncate(label, 24), value }))
      );
    }
    renderMonthsAccordion(document.getElementById('months-d6'), allRows, mesKeyFn, {
      titulo: 'Ausentismos',
      summaryHtml: (mrows) => {
        const dias = mrows.reduce((s, r) => s + (parseFloat(V(r, d.diasKey)) || 0), 0);
        const mFaltas = mrows.filter((r) => OXXO.metricsNormText(V(r, d.tipoKey)).includes('FALTA')).length;
        return `<span><b class="amarillo">${n(dias)}</b> días</span><span><b class="rojo">${n(mFaltas)}</b> faltas</span>`;
      },
      theadHtml: '<tr><th>Empleado</th><th>Puesto</th><th>Tipo</th><th class="center">Días</th></tr>',
      rowsHtml: (mrows) => mrows.map((r) => `<tr>
          <td>${esc(OXXO.truncate(String(V(r, d.nombreKey) || '—'), 24))}</td>
          <td>${esc(d.puestoKey ? V(r, d.puestoKey) || '—' : '—')}</td>
          <td>${esc(V(r, d.tipoKey) || '—')}</td>
          <td class="center">${esc(V(r, d.diasKey) || '—')}</td>
        </tr>`).join(''),
    });
    return { ausentes: empleados, diasAus: totDias, faltas };
  }

  // ── D7 · TREO (mismo pipeline que dashboard-7.html) ──
  async function loadD7() {
    const d7 = await OXXO.metricsD7Rows();
    if (!d7) { DATA.d7 = null; return; }
    d7.rows.forEach((r) => { r[d7.asesorKey] = OXXO.resolveAsesorD1(CATALOG, { tienda: V(r, d7.tiendaKey), asesor: V(r, d7.asesorKey) }); });
    // Campos extra (no resueltos por OXXO.metricsD7Rows) para la Ficha
    // Tecnica TREO -- se buscan una sola vez contra la primera fila, el
    // resto de filas comparte los mismos encabezados.
    const sample = d7.rows[0] || {};
    const crKey = K(sample, ['CR', 'ID Tienda', 'ID_Tienda']);
    const turnosKey = K(sample, ['Turnos']);
    const antiguedadKey = K(sample, ['Antiguedad', 'Antigüedad']);
    const accionableKey = K(sample, ['Accionable sugerido TREO', 'Accionable sugerido']);
    DATA.d7 = { ...d7, crKey, turnosKey, antiguedadKey, accionableKey };
    addTiendas(d7.rows, d7.tiendaKey, crKey);
  }
  function fichaRow(label, value, wide) {
    if (value === undefined || value === null || String(value).trim() === '') return '';
    return `<div class="ficha-treo__row${wide ? ' ficha-treo__row--wide' : ''}"><span>${esc(label)}</span><span>${esc(value)}</span></div>`;
  }
  function renderFichaTreo(tiendaLabel, d, r) {
    const sap = V(r, d.sapKey) || '0';
    const treo = V(r, d.treoKey) || '0';
    const dif = OXXO.metricsNum(V(r, d.difKey));
    const mov = movInfo(dif);
    const difTxt = (dif > 0 ? '+' : '') + dif;
    return `<div class="ficha-treo">
      <div class="ficha-treo__head">
        <div class="ficha-treo__title">${esc(tiendaLabel)}</div>
        <span class="ficha-treo__badge">Ficha Técnica TREO</span>
      </div>
      <div class="ficha-treo__body">
        <div class="ficha-treo__kpis">
          <div class="ficha-treo__kpi"><b>${esc(sap)}</b><span>SAP</span></div>
          <div class="ficha-treo__kpi"><b>${esc(treo)}</b><span>TREO</span></div>
          <div class="ficha-treo__kpi ${mov.cls}"><b>${esc(difTxt)}</b><span>Dif</span></div>
        </div>
        <div class="ficha-treo__mov ${mov.cls}"><span class="arrow">${mov.arrow}</span> Movimiento recomendado: ${mov.txt.toUpperCase()}</div>
        <div class="ficha-treo__details">
          ${fichaRow('Activos', d.activosKey ? V(r, d.activosKey) : '')}
          ${fichaRow('Vacantes', d.vacantesKey ? V(r, d.vacantesKey) : '')}
          ${fichaRow('Turnos', d.turnosKey ? V(r, d.turnosKey) : '')}
          ${fichaRow('Antigüedad', d.antiguedadKey ? V(r, d.antiguedadKey) : '')}
          ${fichaRow('Accionable sugerido', d.accionableKey ? V(r, d.accionableKey) : '', true)}
        </div>
      </div>
    </div>`;
  }
  function renderD7(tienda) {
    const d = DATA.d7;
    const el = document.getElementById('sec-d7');
    if (!d) { el.classList.remove('show'); return null; }
    const rows = rowsFor(d, tienda);
    el.classList.add('show');
    setSectionBadge('badge-d7', 'Base', plural(rows.length, 'registro', 'registros'));
    const fichaEl = document.getElementById('ficha-d7');
    const statsEl = document.getElementById('stats-d7');
    const detailEl = document.querySelector('.mi-detail-btn[data-modal-target="tbl-d7"]');
    // Caso normal: la tienda tiene exactamente un registro en TREO -> se
    // muestra la Ficha Tecnica en vez de la tabla generica (que tendria una
    // sola fila, poco util). Se oculta tambien el "Ver detalle" (no hay
    // nada mas que mostrar, la ficha ya trae todos los campos). Si hay 0 o
    // mas de un registro (caso raro) se conserva el comportamiento anterior
    // de KPIs + tabla con su propio "Ver detalle", sin romper nada.
    if (rows.length === 1) {
      fichaEl.innerHTML = renderFichaTreo(rows[0][d.tiendaKey] || tienda, d, rows[0]);
      fichaEl.style.display = '';
      statsEl.style.display = 'none';
      statsEl.innerHTML = '';
      detailEl.style.display = 'none';
      document.querySelector('#tbl-d7 tbody').innerHTML = '';
      const r0 = rows[0];
      const dif0 = OXXO.metricsNum(V(r0, d.difKey));
      return {
        asesor: V(r0, d.asesorKey) || '',
        cr: d.crKey ? V(r0, d.crKey) : '',
        turnos: d.turnosKey ? V(r0, d.turnosKey) : '',
        antiguedad: d.antiguedadKey ? V(r0, d.antiguedadKey) : '',
        sap: OXXO.metricsNum(V(r0, d.sapKey)),
        treo: OXXO.metricsNum(V(r0, d.treoKey)),
        activos: d.activosKey ? OXXO.metricsNum(V(r0, d.activosKey)) : 0,
        dif: dif0,
        mov: movInfo(dif0),
      };
    }
    // Sin registros no se pintan KPIs en cero (se leian como "SAP 0,
    // TREO 0" cuando en realidad la tienda no esta en esa base), igual
    // que en los demas paneles.
    if (!rows.length) {
      fichaEl.style.display = '';
      fichaEl.innerHTML = noneBox('Tu tienda no aparece en TREO');
      statsEl.style.display = 'none';
      statsEl.innerHTML = '';
      detailEl.style.display = 'none';
      document.querySelector('#tbl-d7 tbody').innerHTML = '';
      return null;
    }
    fichaEl.style.display = 'none';
    fichaEl.innerHTML = '';
    statsEl.style.display = '';
    detailEl.style.display = '';
    const sumSap = rows.reduce((s, r) => s + (OXXO.metricsNum(V(r, d.sapKey)) || 0), 0);
    const sumTreo = rows.reduce((s, r) => s + (OXXO.metricsNum(V(r, d.treoKey)) || 0), 0);
    const sumAct = rows.reduce((s, r) => s + (OXXO.metricsNum(V(r, d.activosKey)) || 0), 0);
    const cobertura = sumTreo > 0 ? Math.round((sumAct / sumTreo) * 100) : 0;
    statsEl.innerHTML =
      statTile(n(sumSap), 'SAP') +
      statTile(n(sumTreo), 'TREO', 'azul') +
      statTile(n(sumAct), 'Activos', 'verde') +
      statTile(cobertura + '%', 'Cobertura', cobertura >= 98 ? 'verde' : cobertura >= 90 ? 'amarillo' : 'rojo');
    const tbody = document.querySelector('#tbl-d7 tbody');
    tbody.innerHTML = rows.length ? rows.map((r) => {
      const dif = OXXO.metricsNum(V(r, d.difKey));
      const mov = movInfo(dif);
      const movTxt = mov.cls === 'alineada' ? '✔ Alineada' : mov.cls === 'subir' ? '▲ Subir' : '▼ Bajar';
      return `<tr>
        <td>${esc(V(r, d.asesorKey) || '—')}</td>
        <td class="center">${esc(V(r, d.sapKey) || '0')}</td>
        <td class="center">${esc(V(r, d.treoKey) || '0')}</td>
        <td class="center">${esc(V(r, d.activosKey) || '0')}</td>
        <td class="center"><span class="pill-mov ${mov.cls}">${movTxt}</span></td>
      </tr>`;
    }).join('') : emptyRow(5, 'Tu tienda no aparece en TREO.');
    if (!rows.length) return null;
    const difTot = sumSap - sumTreo;
    return {
      asesor: V(rows[0], d.asesorKey) || '',
      cr: d.crKey ? V(rows[0], d.crKey) : '',
      turnos: '', antiguedad: '',
      sap: sumSap, treo: sumTreo, activos: sumAct, cobertura,
      dif: difTot, mov: movInfo(difTot),
    };
  }

  // ── D8 · Capacidades 2026 (mismo pipeline que dashboard-8.html) ──
  const CERT_COLS = [
    { key: 'Promedio de Código de Ética 2026', label: 'Código de Ética' },
    { key: 'Promedio de Seguridad en la persona 2026', label: 'Seguridad en la Persona' },
    { key: 'Promedio de PLD2026Certificacion', label: 'PLD 2026' },
    { key: 'Promedio de ModuloCercaSiempre2026', label: 'Módulo Cerca Siempre' },
  ];
  async function loadD8() {
    const raw = await OXXO.fetchSheetData(OXXO.SHEETS_CONFIG.TABS.d8);
    if (!raw || !raw.length) { DATA.d8 = null; return; }
    const h = raw[0];
    const asesorKey = K(h, ['Asesor_Correcto', 'Asesor']);
    const unidadKey = K(h, ['Unidad org.', 'Unidad org']);
    const crKey = K(h, ['Cr de tienda', 'Cr de Tienda', 'CR de Tienda']);
    const noPersKey = K(h, ['Nº personal', 'N personal', 'No Personal']);
    const empleadoKey = K(h, ['Empleados', 'Empleado']);
    const puestoKey = K(h, ['Puesto_Correcto', 'Puesto']);
    const certRealKeys = {};
    CERT_COLS.forEach((c) => { certRealKeys[c.key] = K(h, [c.key]) || c.key; });
    raw.forEach((r) => OXXO.applyAsesorCatalog(r, CATALOG, { asesorKey, tiendaKey: unidadKey, crKey }));
    DATA.d8 = { rows: raw, asesorKey, unidadKey, tiendaKey: unidadKey, crKey, noPersKey, empleadoKey, puestoKey, certRealKeys };
    addTiendas(raw, unidadKey, crKey);
  }
  function capValue(row, certKey, certRealKeys) {
    const raw = row[certRealKeys[certKey]];
    if (raw === undefined || raw === null || String(raw).trim() === '') return null;
    const num = OXXO.metricsNum(raw);
    return Number.isFinite(num) ? num : null;
  }
  function renderD8(tienda) {
    const d = DATA.d8;
    const el = document.getElementById('sec-d8');
    if (!d) { el.classList.remove('show'); return null; }
    const rows = rowsFor(d, tienda);
    el.classList.add('show');
    const empleados = new Set(rows.map((r) => V(r, d.noPersKey) || V(r, d.empleadoKey))).size;
    setSectionBadge('badge-d8', 'Base 2026', plural(empleados, 'empleado', 'empleados'));
    const certStats = CERT_COLS.map((c) => {
      let aplic = 0, comp = 0;
      rows.forEach((r) => { const v = capValue(r, c.key, d.certRealKeys); if (v !== null) { aplic++; if (v >= 1) comp++; } });
      return { ...c, aplic, comp, pct: aplic ? Math.round((comp / aplic) * 100) : null };
    });
    const aplicTotal = certStats.reduce((s, c) => s + c.aplic, 0);
    const compTotal = certStats.reduce((s, c) => s + c.comp, 0);
    const pctGlobal = aplicTotal ? Math.round((compTotal / aplicTotal) * 100) : 0;
    const pendientes = new Set(rows.filter((r) => CERT_COLS.some((c) => {
      const value = capValue(r, c.key, d.certRealKeys);
      return value !== null && value < 1;
    })).map((r) => V(r, d.noPersKey) || V(r, d.empleadoKey)).filter(Boolean)).size;
    const critica = certStats.filter((c) => c.pct !== null).sort((a, b) => a.pct - b.pct)[0] || null;
    document.getElementById('stats-d8').innerHTML = '';
    const certBars = barListHTML(certStats.filter((c) => c.pct !== null).map((c) => ({ label: c.label, value: c.pct, display: c.pct + '%' })), 'verde');
    const capRisk = !pendientes ? 'low' : (critica && critica.pct < 60 ? 'high' : 'medium');
    const capTitle = !pendientes ? 'Certificaciones completas' : `${n(pendientes)} persona${pendientes > 1 ? 's' : ''} con pendientes`;
    const capDetail = critica ? `Módulo más crítico: ${critica.label} (${critica.pct}%)` : 'Sin módulos evaluados';
    document.getElementById('viz-d8').innerHTML = rows.length
      ? signalHTML(capRisk, capTitle, capDetail) + gaugeRowHTML(pctGlobal, null, 'Cumplimiento global', statTile(n(empleados), 'Empleados') + statTile(n(pendientes), 'Personas pendientes', pendientes ? 'rojo' : 'verde')) + certBars
      : noneBox('Tu tienda no aparece en capacidades');
    const tbody = document.querySelector('#tbl-d8 tbody');
    tbody.innerHTML = certStats.length ? certStats.map((c) => `<tr>
        <td>${esc(c.label)}</td>
        <td class="center">${n(c.aplic)}</td>
        <td class="center">${n(c.comp)}</td>
        <td class="center">${c.pct === null ? 'N/A' : c.pct + '%'}</td>
      </tr>`).join('') : emptyRow(4, 'Sin datos de certificaciones.');
    // Quien tiene el pendiente: el resumen por certificacion dice CUANTO
    // falta, no A QUIEN perseguir. Se arma la lista por persona (el mismo
    // detalle que abre Dashboard 8) y se habilita el boton que la abre.
    const personas = OXXO_FICHA.capEmpleados(rows, {
      noPersKey: d.noPersKey, empleadoKey: d.empleadoKey, tiendaKey: d.tiendaKey,
      crKey: d.crKey, asesorKey: d.asesorKey, puestoKey: d.puestoKey, certRealKeys: d.certRealKeys,
    });
    // En esta ficha la tienda es fija: la columna util es el puesto.
    OXXO_FICHA.setCapEmpleados(personas, { titulo: 'Capacidades 2026', contexto: 'Puesto' });
    const botonEmp = document.querySelector('.cap-emp-abrir[data-panel="d8"]');
    if (botonEmp) {
      botonEmp.hidden = !personas.length;
      botonEmp.textContent = personas.length
        ? `Ver detalle por empleado (${n(personas.length)})`
        : 'Ver detalle por empleado';
    }
    return rows.length ? { capPct: pctGlobal, empleados, pendientes, critica: critica ? critica.label : '' } : null;
  }

  // ── D9 · Faltantes y Sobrantes (ultimos 3 meses con datos) ──
  async function loadD9() {
    const raw = await OXXO.fetchSheetData(OXXO.SHEETS_CONFIG.TABS.s9);
    if (!raw || !raw.length) { DATA.d9 = null; return; }
    const h = raw[0];
    const crKey = K(h, ['CR']);
    const tiendaKey = K(h, ['Tienda']);
    const importeKey = K(h, ['Importe']);
    const tipoKey = K(h, ['Tipo']);
    const fechaKey = K(h, ['Fecha']);
    const asesorKey = K(h, ['Asesor']);
    const conceptoKey = K(h, ['Concepto']);
    const meses = new Set();
    raw.forEach((r) => { const f = String(V(r, fechaKey) || ''); if (/^\d{4}-\d{2}/.test(f)) meses.add(f.slice(0, 7)); });
    const ultimos3 = [...meses].sort().slice(-3);
    const rows = ultimos3.length ? raw.filter((r) => ultimos3.includes(String(V(r, fechaKey) || '').slice(0, 7))) : raw;
    DATA.d9 = { rows, crKey, tiendaKey, importeKey, tipoKey, fechaKey, asesorKey, conceptoKey, meses: ultimos3 };
    addTiendas(raw, tiendaKey, crKey);
  }
  function sumaFaltanteSobrante(rows, importeKey) {
    let faltante = 0, sobrante = 0;
    rows.forEach((r) => {
      const importe = OXXO.metricsNum(V(r, importeKey));
      if (importe >= 0) faltante += importe; else sobrante += Math.abs(importe);
    });
    return { faltante, sobrante };
  }
  function renderD9(tienda) {
    const d = DATA.d9;
    const el = document.getElementById('sec-d9');
    if (!d) { el.classList.remove('show'); return null; }
    const rows = rowsFor(d, tienda);
    el.classList.add('show');
    setSectionBadge('badge-d9', 'Historial', d.meses.length ? plural(d.meses.length, 'mes', 'meses') : 'Sin fecha');
    const { faltante, sobrante } = sumaFaltanteSobrante(rows, d.importeKey);
    const neto = faltante - sobrante;
    const monthsEl = document.getElementById('months-d9');
    if (!rows.length) {
      document.getElementById('stats-d9').innerHTML = '';
      document.getElementById('viz-d9').innerHTML = clearBox('Sin faltantes ni sobrantes en el periodo');
      monthsEl.innerHTML = '';
      return null;
    }
    document.getElementById('stats-d9').innerHTML =
      statTile('$' + n(faltante), 'Faltante') +
      statTile('$' + n(sobrante), 'Sobrante') +
      statTile((neto >= 0 ? '$' : '-$') + n(Math.abs(neto)), 'Neto');
    const mesKeyFn = (r) => String(V(r, d.fechaKey) || '').slice(0, 7);
    const currentMonth = [...d.meses].sort().slice(-1)[0] || '';
    const currentAmounts = sumaFaltanteSobrante(rows.filter((r) => mesKeyFn(r) === currentMonth), d.importeKey);
    const previousAmounts = sumaFaltanteSobrante(rows.filter((r) => mesKeyFn(r) === previousMonthKey(currentMonth)), d.importeKey);
    document.getElementById('viz-d9').innerHTML = trendHTML(currentAmounts.faltante, previousAmounts.faltante, 'Faltante vs. mes anterior', (value) => '$' + n(value));
    renderMonthsAccordion(monthsEl, rows, mesKeyFn, {
      titulo: 'Faltantes y Sobrantes',
      summaryHtml: (mrows) => {
        const { faltante: mf, sobrante: ms } = sumaFaltanteSobrante(mrows, d.importeKey);
        return `<span><b class="rojo">$${n(mf)}</b> falt</span><span><b class="verde">$${n(ms)}</b> sobr</span>`;
      },
      theadHtml: '<tr><th>Fecha</th><th>Asesor</th><th>Tipo</th><th>Concepto</th><th class="center">Importe</th></tr>',
      rowsHtml: (mrows) => [...mrows].sort((a, b) => String(V(b, d.fechaKey)).localeCompare(String(V(a, d.fechaKey)))).map((r) => `<tr>
          <td>${esc(V(r, d.fechaKey) || '—')}</td>
          <td>${esc(d.asesorKey ? OXXO.truncate(String(V(r, d.asesorKey) || '—'), 20) : '—')}</td>
          <td>${esc(V(r, d.tipoKey) || '—')}</td>
          <td>${esc(d.conceptoKey ? OXXO.truncate(String(V(r, d.conceptoKey) || '—'), 26) : '—')}</td>
          <td class="center">$${n(Math.abs(OXXO.metricsNum(V(r, d.importeKey))))}</td>
        </tr>`).join(''),
    });
    return { faltante, sobrante, neto };
  }

  function seedTiendasFromCatalog() {
    (CATALOG?.rows || []).forEach((row) => {
      const raw = String(row.tienda || '').trim();
      const key = tKey(raw);
      if (key && raw && !TIENDAS.has(key)) TIENDAS.set(key, raw);
    });
  }

  // ── Administrativo · Resultados de Inventario ─────────
  // La tarjeta principal usa solo el ultimo corte disponible de la tienda.
  // El historial permanece accesible por periodo en los botones inferiores.
  const invNorm = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  function invValue(row, aliases) {
    const lookup = new Map(Object.keys(row || {}).map((key) => [invNorm(key), row[key]]));
    for (const alias of aliases) if (lookup.has(invNorm(alias))) return lookup.get(invNorm(alias));
    return '';
  }
  function invNumber(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    let raw = String(value ?? '').trim();
    if (!raw || raw === '-') return 0;
    const isPercent = raw.includes('%');
    raw = raw.replace(/[$%\s]/g, '').replace(/[^0-9,.-]/g, '');
    if (raw.includes(',') && raw.includes('.')) raw = raw.replace(/,/g, '');
    else if (raw.includes(',')) {
      const parts = raw.split(',');
      raw = parts.length === 2 ? parts.join('.') : parts.join('');
    }
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? (isPercent && Math.abs(parsed) > 1 ? parsed / 100 : parsed) : 0;
  }
  function invDate(value) {
    const raw = String(value || '').trim();
    if (!raw || raw === '-') return null;
    let match = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    match = raw.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
    if (match) return new Date(Number(match[3]) + (match[3].length === 2 ? 2000 : 0), Number(match[2]) - 1, Number(match[1]));
    if (/^\d+(?:\.\d+)?$/.test(raw)) return new Date(1899, 11, 30 + Math.floor(Number(raw)));
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  function invPeriod(value, date) {
    const raw = String(value || '').trim();
    const direct = raw.match(/^(20\d{2})[-/](\d{1,2})/);
    if (direct) return `${direct[1]}-${String(direct[2]).padStart(2, '0')}`;
    const normalized = invNorm(raw);
    const month = MESES_NOMBRE.findIndex((name) => normalized.includes(invNorm(name)));
    const year = normalized.match(/20\d{2}/)?.[0];
    if (month >= 0 && year) return `${year}-${String(month + 1).padStart(2, '0')}`;
    return date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}` : '';
  }
  const invMoney = (value) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(Number(value) || 0);
  const invMoneyCompact = (value) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', notation: 'compact', maximumFractionDigits: 1 }).format(Number(value) || 0);
  const invPercent = (value) => new Intl.NumberFormat('es-MX', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value) || 0);
  const invDateText = (value) => value ? new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }).format(value) : 'Sin fecha';
  function invRatio(row) { return row.totalSales ? row.finalResult / row.totalSales : row.finalRatio; }
  async function loadInventarios() {
    const raw = await OXXO.fetchSheetData(OXXO.SHEETS_CONFIG.TABS.inventories || 'Inventarios');
    if (!raw || !raw.length) { DATA.inventarios = null; return; }
    const rows = raw.map((row) => {
      const inventoryDate = invDate(invValue(row, ['Fecha de Inventario', 'Fecha Inventario', 'Fecha inventario actual']));
      return {
        cr: String(invValue(row, ['CR', 'Código CR', 'Codigo CR']) || '').trim(),
        store: String(invValue(row, ['Tienda', 'Nombre Tienda']) || '').trim(),
        advisor: String(invValue(row, ['Asesor Comercial', 'Asesor', 'AT']) || '').trim(),
        inventoryDate,
        period: invPeriod(invValue(row, ['Periodo', 'Período', 'Mes', 'Corte']), inventoryDate),
        type: String(invValue(row, ['Tipo Inventario', 'Tipo de Inventario']) || 'Sin tipo').trim(),
        inventoryResult: invNumber(invValue(row, ['Resultado de Inventario', 'Resultado Inventario'])),
        finalResult: invNumber(invValue(row, ['Resultado de Merma (Final c/s proyectos)', 'Resultado de Merma  (Final c/s proyectos)', 'Resultado Merma Final', 'Resultado Final'])),
        totalSales: invNumber(invValue(row, ['SUMA TOTAL VTA S/TAE', 'Suma Total Ventas sin TAE', 'Total Ventas sin TAE'])),
        finalRatio: invNumber(invValue(row, ['% Merma / Vta sin TAE (Final c/s proyectos)', '% Merma/Venta Final', 'Porcentaje Merma Final'])),
        notes: String(invValue(row, ['Observaciones', 'Notas']) || '').trim(),
      };
    }).filter((row) => row.store);
    DATA.inventarios = { rows, tiendaKey: 'store', crKey: 'cr' };
    addTiendas(rows, 'store', 'cr');
  }
  function renderInventarios(tienda) {
    const d = DATA.inventarios;
    const el = document.getElementById('sec-inventarios');
    if (!d) { el.classList.remove('show'); return null; }
    const allRows = rowsFor(d, tienda);
    el.classList.add('show');
    const periods = [...new Set(allRows.map((row) => row.period).filter(Boolean))].sort();
    const latestPeriod = periods.at(-1) || '';
    const rows = latestPeriod ? allRows.filter((row) => row.period === latestPeriod) : allRows;
    const monthsEl = document.getElementById('months-inventarios');
    if (!rows.length) {
      setSectionBadge('badge-inventarios', 'Corte', 'Sin datos');
      document.getElementById('stats-inventarios').innerHTML = '';
      document.getElementById('viz-inventarios').innerHTML = noneBox('Tu tienda no aparece en Resultados de Inventario');
      monthsEl.innerHTML = '';
      return null;
    }
    const merma = rows.reduce((sum, row) => sum + row.finalResult, 0);
    const ventas = rows.reduce((sum, row) => sum + row.totalSales, 0);
    const ratio = ventas ? merma / ventas : rows.reduce((sum, row) => sum + row.finalRatio, 0) / rows.length;
    const latestDate = rows.map((row) => row.inventoryDate).filter(Boolean).sort((a, b) => b - a)[0] || null;
    setSectionBadge('badge-inventarios', 'Último corte', latestPeriod ? mesLabel(latestPeriod) : invDateText(latestDate), 'is-current');
    document.getElementById('stats-inventarios').innerHTML =
      statTile(n(rows.length), 'Inventarios') +
      statTile(invMoneyCompact(merma), 'Merma final', ratio > .01 ? 'rojo' : ratio > .005 ? 'amarillo' : 'verde') +
      statTile(invMoneyCompact(ventas), 'Venta sin TAE') +
      statTile(invPercent(ratio), '% Merma / venta', ratio > .01 ? 'rojo' : ratio > .005 ? 'amarillo' : 'verde');
    const risk = ratio > .01 ? 'high' : ratio > .005 ? 'medium' : 'low';
    document.getElementById('viz-inventarios').innerHTML = signalHTML(risk,
      risk === 'high' ? 'Merma por arriba de 1%' : risk === 'medium' ? 'Merma en seguimiento' : 'Merma controlada',
      `${invPercent(ratio)} sobre venta sin TAE · inventario ${invDateText(latestDate)}`);
    renderMonthsAccordion(monthsEl, allRows, (row) => row.period, {
      titulo: 'Resultados de Inventario',
      summaryHtml: (periodRows) => {
        const result = periodRows.reduce((sum, row) => sum + row.finalResult, 0);
        const sales = periodRows.reduce((sum, row) => sum + row.totalSales, 0);
        return `<span><b class="${sales && result / sales > .01 ? 'rojo' : 'verde'}">${invPercent(sales ? result / sales : 0)}</b> merma</span><span><b>${invMoneyCompact(result)}</b></span>`;
      },
      theadHtml: '<tr><th>Fecha</th><th>Tipo</th><th>Asesor</th><th class="center">Resultado</th><th class="center">Merma final</th><th class="center">Venta sin TAE</th><th class="center">% Merma</th><th>Observaciones</th></tr>',
      rowsHtml: (periodRows) => [...periodRows].sort((a, b) => (b.inventoryDate || 0) - (a.inventoryDate || 0)).map((row) => `<tr>
          <td>${esc(invDateText(row.inventoryDate))}</td><td>${esc(row.type)}</td><td>${esc(row.advisor || '—')}</td>
          <td class="center">${esc(invMoney(row.inventoryResult))}</td><td class="center">${esc(invMoney(row.finalResult))}</td>
          <td class="center">${esc(invMoney(row.totalSales))}</td><td class="center">${esc(invPercent(invRatio(row)))}</td><td>${esc(row.notes || '—')}</td>
        </tr>`).join(''),
    });
    return { count: rows.length, merma, ventas, ratio, period: latestPeriod };
  }

  // ── D10 · Personal FLEX (foto: colaboradores FLEX por tienda) ──
  async function loadD10() {
    const raw = await OXXO.fetchSheetData(OXXO.SHEETS_CONFIG.TABS.d10);
    if (!raw || !raw.length) { DATA.d10 = null; return; }
    const h = raw[0];
    // Coincidencia exacta (no K/metricsFindKey): si la pestana "Dashboard_10_FLEX"
    // no existe todavia, gviz no da error -- devuelve otra pestana del libro
    // por accidente (normalmente Dashboard_1_Diario). Con coincidencia "se
    // parece a", 'Tienda' emparejaba por error contra la columna 'CR TIENDA'
    // de esa hoja, y esos codigos de CR terminaban ensuciando el buscador de
    // tiendas de toda la pagina (ver addTiendas). Exacta evita eso: si la
    // hoja real trae "Tienda" literal, sigue matcheando igual.
    const tiendaKey = OXXO.metricsFindKeyExact(h, ['Tienda']);
    const crKey = K(h, ['Cr de Tienda', 'CR TIENDA', 'CR']);
    const fechaKey = K(h, ['Fecha']);
    const flexKey = K(h, ['COLABORADORESFLEX_NUM']);
    DATA.d10 = { rows: raw, tiendaKey, crKey, fechaKey, flexKey };
    addTiendas(raw, tiendaKey, crKey);
  }
  function renderD10(tienda) {
    const d = DATA.d10;
    const el = document.getElementById('sec-d10');
    if (!d) { el.classList.remove('show'); return null; }
    const rows = rowsFor(d, tienda);
    el.classList.add('show');
    if (!rows.length) {
      setSectionBadge('badge-d10', 'Corte', 'Sin datos');
      document.getElementById('stats-d10').innerHTML = '';
      return null;
    }
    const flex = rows.reduce((s, r) => s + (OXXO.metricsNum(V(r, d.flexKey)) || 0), 0);
    const fecha = V(rows[0], d.fechaKey) || '—';
    setSectionBadge('badge-d10', 'Corte', fecha, 'is-current');
    document.getElementById('stats-d10').innerHTML = statTile(n(flex), 'Colaboradores FLEX');
    return { flex, fecha };
  }

  // ── D11 · Cumplimiento de Marcajes (foto semanal regional) ──
  function pctVal(v) { const num = OXXO.metricsNum(v); return Number.isFinite(num) ? Math.round((Math.abs(num) <= 3 ? num * 100 : num) * 10) / 10 : null; }
  function pctTxt(v) { const p = pctVal(v); return p === null ? '—' : p + '%'; }
  function pctTone(p) { if (p === null) return ''; return p >= 90 ? 'verde' : p >= 70 ? 'amarillo' : 'rojo'; }
  async function loadD11() {
    const raw = await OXXO.fetchSheetData(OXXO.SHEETS_CONFIG.TABS.d11);
    if (!raw || !raw.length) { DATA.d11 = null; return; }
    const h = raw[0];
    // Ver nota igual en loadD10(): exacta, no fuzzy, para que si la hoja
    // todavia no existe y gviz devuelve otra por error, no confunda otra
    // columna (ej. CR) con la de Tienda y ensucie el buscador global.
    const tiendaKey = OXXO.metricsFindKeyExact(h, ['Tienda']);
    const asesorKey = K(h, ['Asesor']);
    const fechaKey = K(h, ['Semana', 'Fecha']);
    const entradasKey = K(h, ['% Cumpl Reg Entradas']);
    const salidasKey = K(h, ['% Cumpl Reg Salidas']);
    const totalKey = K(h, ['% Cumpl Reg Total']);
    const estatusKey = K(h, ['Estatus']);
    const calidadKey = K(h, ['Alerta Calidad']);
    // Hoy la hoja publica una sola semana, asi que no filtrar no se notaba;
    // en cuanto acumule una segunda, los promedios de entradas/salidas
    // mezclarian semanas y el badge mostraria la semana de la primera fila
    // que tocara, no la vigente. Se corta a la mas reciente, igual que
    // Dashboard 11.
    const semana = fechaKey ? OXXO.metricsLatestSemanaNumerica(raw, fechaKey) : '';
    const rows = semana ? raw.filter((r) => String(V(r, fechaKey) || '').trim() === semana) : raw;
    DATA.d11 = { rows, semana, tiendaKey, asesorKey, fechaKey, entradasKey, salidasKey, totalKey, estatusKey, calidadKey };
    addTiendas(raw, tiendaKey);
  }
  function renderD11(tienda) {
    const d = DATA.d11;
    const el = document.getElementById('sec-d11');
    if (!d) { el.classList.remove('show'); return null; }
    const rows = rowsFor(d, tienda);
    el.classList.add('show');
    const tbody = document.querySelector('#tbl-d11 tbody');
    if (!rows.length) {
      setSectionBadge('badge-d11', 'Corte', 'Sin datos');
      document.getElementById('stats-d11').innerHTML = '';
      tbody.innerHTML = emptyRow(6, 'Tu tienda no aparece en Cumplimiento de Marcajes.');
      return null;
    }
    setSectionBadge('badge-d11', 'Corte', d.semana || V(rows[0], d.fechaKey) || 'Sin fecha', 'is-current');
    const avg = (key) => {
      const vals = rows.map((r) => pctVal(V(r, key))).filter((v) => v !== null);
      return vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : null;
    };
    const cumplTotal = avg(d.totalKey);
    const entradas = avg(d.entradasKey);
    const salidas = avg(d.salidasKey);
    document.getElementById('stats-d11').innerHTML =
      statTile(cumplTotal === null ? '—' : cumplTotal + '%', 'Cumpl. registro', pctTone(cumplTotal)) +
      statTile(entradas === null ? '—' : entradas + '%', 'Entradas', pctTone(entradas)) +
      statTile(salidas === null ? '—' : salidas + '%', 'Salidas', pctTone(salidas));
    tbody.innerHTML = rows.map((r) => `<tr>
        <td>${esc(OXXO.truncate(String(V(r, d.asesorKey) || '—'), 22))}</td>
        <td class="center">${pctTxt(V(r, d.entradasKey))}</td>
        <td class="center">${pctTxt(V(r, d.salidasKey))}</td>
        <td class="center">${pctTxt(V(r, d.totalKey))}</td>
        <td class="center">${esc(V(r, d.estatusKey) || '—')}</td>
        <td class="center">${esc(V(r, d.calidadKey) || '—')}</td>
      </tr>`).join('');
    return { cumplTotal, entradas, salidas };
  }

  // ── Resumen y alertas ──────────────────────────────────
  // Antes habia que leer los 8 paneles para saber si la tienda estaba
  // bien o mal. Estos dos bloques responden eso de una: el resumen trae
  // los titulares de cada dashboard con su semaforo, y las alertas solo
  // listan lo que necesita atencion (si no hay nada, se dice explicito).
  function renderResumen(S) {
    const operacion = [];
    const personas = [];
    const estructura = [];
    const administrativo = [];
    if (S.d1) operacion.push(rkTile(n(S.d1.vacantes), 'Vacantes', toneByCount(S.d1.vacantes)));
    if (S.d2) operacion.push(rkTile(n(S.d2.bajas), 'Bajas del mes', toneByCount(S.d2.bajas)));
    if (S.d4) operacion.push(rkTile(n(S.d4.horas), 'Horas extra', toneByCount(S.d4.horas, 20), S.d4.gasto ? '$' + n(S.d4.gasto) : ''));
    if (S.d6) operacion.push(rkTile(n(S.d6.diasAus), 'Días ausentismo', toneByCount(S.d6.diasAus, 20), S.d6.ausentes ? S.d6.ausentes + ' empleados' : ''));
    if (S.d5) personas.push(rkTile(n(S.d5.diasVac), 'Días restantes', 'is-info', S.d5.colaboradores ? S.d5.colaboradores + ' colaboradores' : ''));
    if (S.d8) personas.push(rkTile(S.d8.capPct + '%', 'Capacidades', tonePct(S.d8.capPct, 90, 60), S.d8.pendientes ? `${n(S.d8.pendientes)} pendientes` : 'Sin pendientes'));
    if (S.d10) personas.push(rkTile(n(S.d10.flex), 'Personal FLEX'));
    if (S.d11 && S.d11.cumplTotal !== null) personas.push(rkTile(S.d11.cumplTotal + '%', 'Cumpl. registro', tonePct(S.d11.cumplTotal, 90, 70)));
    if (S.d3) estructura.push(rkTile(S.d3.ec + '%', 'Equipo completo', tonePct(S.d3.ec, 80, 50),
      S.d3.ecSin !== null && S.d3.ecSin !== undefined ? `sin ausentismo: ${S.d3.ecSin}%` : ''));
    if (S.d7) {
      const dif = Number(S.d7.dif) || 0;
      estructura.push(rkTile((dif > 0 ? '+' : '') + dif, 'Diferencia TREO', dif === 0 ? 'is-ok' : Math.abs(dif) <= 2 ? 'is-warn' : 'is-bad', S.d7.mov?.txt || ''));
    }
    if (S.inventarios) {
      administrativo.push(rkTile(invMoneyCompact(S.inventarios.merma), 'Merma final', S.inventarios.ratio > .01 ? 'is-bad' : S.inventarios.ratio > .005 ? 'is-warn' : 'is-ok'));
      administrativo.push(rkTile(invPercent(S.inventarios.ratio), '% Merma / venta', S.inventarios.ratio > .01 ? 'is-bad' : S.inventarios.ratio > .005 ? 'is-warn' : 'is-ok', S.inventarios.period ? mesLabel(S.inventarios.period) : ''));
    }
    const group = (title, subtitle, cls, icon, tiles) => tiles.length ? `<section class="mt-summary-group ${cls}">
      <div class="mt-summary-group__head"><span class="mt-summary-group__icon">${icon}</span><div><strong>${title}</strong><small>${subtitle}</small></div></div>
      <div class="mt-summary-group__grid">${tiles.join('')}</div>
    </section>` : '';
    const iconOperacion = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h4l2-7 4 14 2-7h6"></path></svg>';
    const iconPersonas = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path></svg>';
    const iconEstructura = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20V7"></path></svg>';
    const iconAdministrativo = '<svg viewBox="0 0 24 24" aria-hidden="true"><polygon points="12 2 21 7 12 12 3 7 12 2"></polygon><polyline points="3 7 3 17 12 22 21 17 21 7"></polyline></svg>';
    document.getElementById('ficha-resumen').innerHTML = `
      <div class="mt-current-head">
        <div><span class="mt-current-head__eyebrow">Estado actual</span><strong>Resumen de la tienda</strong></div>
        <span class="mt-current-head__note">Revisa el corte vigente en cada tarjeta</span>
      </div>
      <div class="mt-summary-groups">
        ${group('Operación', 'Vacantes, bajas y asistencia', 'mt-summary-group--operacion', iconOperacion, operacion)}
        ${group('Personas', 'Desarrollo y cumplimiento', 'mt-summary-group--personas', iconPersonas, personas)}
        ${group('Estructura', 'Cobertura y recomendación TREO', 'mt-summary-group--estructura', iconEstructura, estructura)}
        ${group('Administrativo', 'Inventario y merma', 'mt-summary-group--administrativo', iconAdministrativo, administrativo)}
      </div>`;
  }
  function renderAlertas(S) {
    const a = [];
    if (S.d1 && S.d1.vacantes) a.push({ t: S.d1.vacantes >= 3 ? 'is-bad' : 'is-warn', target: 'sec-d1', txt: `${S.d1.vacantes} vacante${S.d1.vacantes > 1 ? 's' : ''} por cubrir` });
    if (S.d2 && S.d2.bajas) a.push({ t: S.d2.bajas >= 3 ? 'is-bad' : 'is-warn', target: 'sec-d2', txt: `${S.d2.bajas} baja${S.d2.bajas > 1 ? 's' : ''} este mes${S.d2.motivo ? ' · ' + OXXO.truncate(S.d2.motivo, 26) : ''}` });
    if (S.d3 && S.d3.criticas) a.push({ t: 'is-bad', target: 'sec-d3', txt: `${S.d3.criticas} registro${S.d3.criticas > 1 ? 's' : ''} de estructura crítica` });
    if (S.d4 && S.d4.gasto) a.push({ t: S.d4.horas >= 20 ? 'is-bad' : 'is-warn', target: 'sec-d4', txt: `$${n(S.d4.gasto)} en tiempo extra (${n(S.d4.horas)} h)` });
    if (S.d6 && S.d6.faltas) a.push({ t: 'is-bad', target: 'sec-d6', txt: `${S.d6.faltas} falta${S.d6.faltas > 1 ? 's' : ''} registrada${S.d6.faltas > 1 ? 's' : ''}` });
    if (S.d7 && S.d7.dif) a.push({ t: 'is-info', target: 'sec-d7', txt: `TREO: ${S.d7.mov.txt.toLowerCase()} ${Math.abs(S.d7.dif)} posición${Math.abs(S.d7.dif) > 1 ? 'es' : ''}` });
    if (S.d8 && S.d8.capPct < 100) a.push({ t: S.d8.capPct < 60 ? 'is-bad' : 'is-warn', target: 'sec-d8', txt: `Capacidades al ${S.d8.capPct}%${S.d8.pendientes ? ` · ${n(S.d8.pendientes)} pendientes` : ''}` });
    if (S.d11 && S.d11.cumplTotal !== null && S.d11.cumplTotal < 90) a.push({ t: S.d11.cumplTotal < 70 ? 'is-bad' : 'is-warn', target: 'sec-d11', txt: `Cumplimiento de registro al ${S.d11.cumplTotal}%` });
    if (S.inventarios && S.inventarios.ratio > .005) a.push({ t: S.inventarios.ratio > .01 ? 'is-bad' : 'is-warn', target: 'sec-inventarios', txt: `Merma de inventario al ${invPercent(S.inventarios.ratio)}` });
    const container = document.getElementById('ficha-alertas');
    container.innerHTML = a.length ? a.map((item) => `<button type="button" class="chip mt-alert-link ${item.t}" data-target="${item.target}">${esc(item.txt)} <span aria-hidden="true">→</span></button>`).join('') : chipsHTML([], 'Sin alertas: tu tienda está en orden');
    container.querySelectorAll('.mt-alert-link').forEach((button) => button.addEventListener('click', () => {
      const target = document.getElementById(button.dataset.target);
      if (!target) return;
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target.classList.remove('mt-section-focus');
      requestAnimationFrame(() => target.classList.add('mt-section-focus'));
      setTimeout(() => target.classList.remove('mt-section-focus'), 1700);
    }));
    return a;
  }

  // Escaparate: agrupa las mismas alertas de renderAlertas() por las 4
  // categorias que ya usa renderResumen (Operacion/Personas/Estructura/
  // Administrativo) en vez de listarlas planas. Cada "ventana" toma el peor
  // semaforo de sus alertas -- is-info (la sugerencia de TREO) no cuenta
  // como problema para esto, solo is-warn/is-bad.
  const STOREFRONT_GROUPS = [
    { label: 'Operación', targets: ['sec-d1', 'sec-d2', 'sec-d4', 'sec-d6'] },
    { label: 'Personas', targets: ['sec-d5', 'sec-d8', 'sec-d10', 'sec-d11'] },
    { label: 'Estructura', targets: ['sec-d3', 'sec-d7'] },
    { label: 'Administrativo', targets: ['sec-inventarios'] },
  ];
  function renderStorefront(alerts) {
    const windowsEl = document.getElementById('mt-storefront-windows');
    const signEl = document.getElementById('mt-storefront-sign');
    if (!windowsEl || !signEl) return;
    const rank = { ok: 0, warn: 1, bad: 2 };
    let worst = 'ok';
    const windows = STOREFRONT_GROUPS.map((group) => {
      const relevant = alerts.filter((a) => group.targets.includes(a.target));
      let tone = 'ok';
      if (relevant.some((a) => a.t === 'is-bad')) tone = 'bad';
      else if (relevant.some((a) => a.t === 'is-warn')) tone = 'warn';
      if (rank[tone] > rank[worst]) worst = tone;
      return { label: group.label, tone };
    });
    windowsEl.innerHTML = windows.map((w) => `<div class="mt-storefront__window is-${w.tone}">
        <span class="mt-storefront__window-dot"></span>
        <span class="mt-storefront__window-label">${esc(w.label)}</span>
      </div>`).join('');
    const total = alerts.length;
    const icon = worst === 'bad' ? '!' : worst === 'warn' ? '▲' : '✓';
    const text = worst === 'ok' ? 'Todo en orden'
      : worst === 'bad' ? `${total} punto${total > 1 ? 's' : ''} crítico${total > 1 ? 's' : ''}`
      : `${total} punto${total > 1 ? 's' : ''} por revisar`;
    signEl.className = `mt-storefront__sign is-${worst}`;
    signEl.innerHTML = `<span aria-hidden="true">${icon}</span><span>${esc(text)}</span>`;
  }

  // A diferencia del resumen (un indicador -> una tarjeta) y las alertas (un
  // indicador -> un chip), esto combina 2+ indicadores de DISTINTAS fuentes
  // en una sola historia -- el tipo de lectura que antes exigia comparar a
  // mano varios paneles (ej. "el ausentismo esta detras de la brecha de
  // estructura", "la rotacion se esta pagando en tiempo extra"). Cada regla
  // se apaga sola si a la tienda le falta alguna de las fuentes que cruza.
  function renderLecturaCruzada(S) {
    const insights = [];

    if (S.d3 && S.d6 && Number.isFinite(S.d3.ec) && Number.isFinite(S.d3.ecSin)) {
      const brecha = S.d3.ecSin - S.d3.ec;
      if (brecha >= 10 && S.d6.diasAus > 0) {
        insights.push({
          level: brecha >= 20 ? 'high' : 'medium',
          title: `El ausentismo explica ${brecha} pts de la brecha de estructura`,
          detail: `Sin su impacto, Equipo Completo subiría de ${S.d3.ec}% a ${S.d3.ecSin}%. Ya van ${n(S.d6.diasAus)} días de ausentismo este mes.`,
        });
      }
    }

    if (S.d1?.vacantes > 0 && S.d2?.bajas > 0 && S.d4?.horas > 0) {
      insights.push({
        level: S.d4.horas >= 20 ? 'high' : 'medium',
        title: 'La rotación se está pagando en tiempo extra',
        detail: `${S.d1.vacantes} vacante${S.d1.vacantes > 1 ? 's' : ''} sin cubrir y ${S.d2.bajas} baja${S.d2.bajas > 1 ? 's' : ''} este mes coinciden con ${n(S.d4.horas)}h de tiempo extra${S.d4.gasto ? ` ($${n(S.d4.gasto)})` : ''}.`,
      });
    } else if (S.d6?.diasAus >= 10 && S.d4?.horas >= 20) {
      // Misma idea que la anterior pero sin vacantes/bajas de por medio: el
      // ausentismo puro cubierto con TE. No se agregan las dos a la vez
      // para no contar la misma historia de tiempo extra dos veces.
      insights.push({
        level: 'medium',
        title: 'El ausentismo se está cubriendo con tiempo extra',
        detail: `${n(S.d6.diasAus)} días de ausentismo (${n(S.d6.ausentes)} persona${S.d6.ausentes > 1 ? 's' : ''}) coinciden con ${n(S.d4.horas)}h de tiempo extra${S.d4.gasto ? ` ($${n(S.d4.gasto)})` : ''}.`,
      });
    }

    if (S.d7?.mov?.cls === 'bajar' && S.d1?.vacantes > 0) {
      insights.push({
        level: 'medium',
        title: 'TREO sugiere bajar estructura, pero hay vacantes activas',
        detail: `La estructura óptima pide bajar ${Math.abs(S.d7.dif)} posición${Math.abs(S.d7.dif) > 1 ? 'es' : ''}; antes de cubrir ${S.d1.vacantes > 1 ? 'las' : 'la'} ${S.d1.vacantes} vacante${S.d1.vacantes > 1 ? 's' : ''}, valida si de verdad se necesita${S.d1.vacantes > 1 ? 'n' : ''}.`,
      });
    }

    if (S.inventarios?.ratio > .005 && S.d9?.faltante > 0) {
      insights.push({
        level: S.inventarios.ratio > .01 ? 'high' : 'medium',
        title: 'Dos señales de control interno al mismo tiempo',
        detail: `Merma de inventario al ${invPercent(S.inventarios.ratio)} y $${n(S.d9.faltante)} en faltantes de caja este periodo.`,
      });
    }

    if (S.d8?.pendientes > 0 && S.d2?.bajas > 0) {
      insights.push({
        level: 'medium',
        title: 'Posible personal nuevo sin capacitación completa',
        detail: `${S.d2.bajas} baja${S.d2.bajas > 1 ? 's' : ''} este mes y ${n(S.d8.pendientes)} persona${S.d8.pendientes > 1 ? 's' : ''} con certificaciones pendientes: revisa si el equipo ya completó lo básico.`,
      });
    }

    if (S.d11 && S.d11.cumplTotal != null && S.d11.cumplTotal < 80 && S.d6?.faltas > 0) {
      insights.push({
        level: S.d11.cumplTotal < 60 ? 'high' : 'medium',
        title: 'El checador podría no reflejar el ausentismo real',
        detail: `Cumplimiento de registro al ${S.d11.cumplTotal}%; con ese nivel, conviene confirmar ${S.d6.faltas > 1 ? `las ${S.d6.faltas} faltas detectadas` : 'la falta detectada'} antes de actuar sobre ${S.d6.faltas > 1 ? 'ellas' : 'ella'}.`,
      });
    }

    const container = document.getElementById('ficha-cruzado');
    if (!container) return;
    const list = insights.length
      ? insights.map((i) => signalHTML(i.level, i.title, i.detail)).join('')
      : signalHTML('low', 'Sin señales cruzadas', 'Los indicadores de esta tienda no muestran, por ahora, patrones combinados que requieran atención.');
    container.innerHTML = `
      <div class="mt-current-head">
        <div><span class="mt-current-head__eyebrow">Lectura cruzada</span><strong>Qué está pasando de fondo</strong></div>
        <span class="mt-current-head__note">Combina varios indicadores a la vez</span>
      </div>
      <div class="mt-cruzado-list">${list}</div>`;
  }

  function renderIdentidad(tiendaDisplay, S) {
    document.getElementById('ficha-tienda-title').textContent = tiendaDisplay;
    const d7 = S.d7 || {};
    document.getElementById('ficha-meta').innerHTML = metaHTML([
      ['Asesor / AT', d7.asesor],
      ['CR', d7.cr],
      ['Turnos', d7.turnos],
      ['Antigüedad', d7.antiguedad],
      ['Colaboradores', S.d5 && S.d5.colaboradores ? String(S.d5.colaboradores) : ''],
    ]);
    const st = document.getElementById('ficha-status');
    if (d7.mov) {
      st.textContent = d7.mov.cls === 'alineada' ? '✔ Estructura alineada'
        : `${d7.mov.arrow} ${d7.mov.txt} ${Math.abs(d7.dif)}`;
    } else {
      st.textContent = 'Ficha de tienda';
    }
  }

  // ── Orquestacion ───────────────────────────────────────
  let isInitializing = false;
  const statePin = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>';
  function setPageState(mode, title, message) {
    const empty = document.getElementById('mi-empty');
    const content = document.getElementById('mi-content');
    const retry = document.getElementById('mi-retry');
    const big = empty.querySelector('.big');
    empty.style.display = 'block';
    content.style.display = 'none';
    document.getElementById('mi-state-title').textContent = title;
    document.getElementById('mi-state-message').textContent = message;
    retry.hidden = mode !== 'error';
    big.innerHTML = mode === 'loading' ? '<span class="spinner" aria-hidden="true"></span>' : statePin;
  }

  function sectionState(key, mode) {
    const section = document.getElementById(`sec-${key}`);
    if (!section) return;
    section.classList.remove('is-loading', 'is-source-error');
    section.removeAttribute('aria-busy');
    section.removeAttribute('data-source-message');
    if (mode === 'pending') {
      section.classList.add('show', 'is-loading');
      section.setAttribute('aria-busy', 'true');
    } else if (mode === 'failed') {
      section.classList.add('show', 'is-source-error');
      section.dataset.sourceMessage = 'Esta fuente no respondió. Puedes reintentar la carga desde la parte superior.';
    }
  }

  function renderSource(key, renderer, tienda) {
    const state = SOURCE_STATE[key];
    if (state === 'pending' || state === 'failed') {
      sectionState(key, state);
      return null;
    }
    sectionState(key, 'loaded');
    return renderer(tienda);
  }

  function scheduleProgressiveRender() {
    if (!activeTiendaDisplay || progressiveRenderFrame) return;
    progressiveRenderFrame = requestAnimationFrame(() => {
      progressiveRenderFrame = 0;
      renderFor(activeTiendaDisplay);
    });
  }

  function updateLoadProgress() {
    const corte = document.getElementById('corte-badge');
    const completed = SOURCE_KEYS.filter((key) => SOURCE_STATE[key] !== 'pending').length;
    const failures = SOURCE_KEYS.filter((key) => SOURCE_STATE[key] === 'failed').length;
    if (completed < SOURCE_KEYS.length) {
      corte.className = 'hero-badge is-loading';
      corte.textContent = `⟳ ${completed} de ${SOURCE_KEYS.length} fuentes listas`;
      return;
    }
    corte.className = `hero-badge${failures ? ' is-partial' : ''}`;
    corte.textContent = failures
      ? `⚠ Datos parciales · ${failures} fuente${failures > 1 ? 's' : ''} sin respuesta`
      : `✓ Datos actualizados · ${DATA_CONTEXT.plaza}`;
    OXXO.updateFooterTime('load-time');
  }

  function renderFor(tiendaDisplay) {
    if (!tiendaDisplay) return;
    activeTiendaDisplay = tiendaDisplay;
    const tienda = tKey(tiendaDisplay);
    document.getElementById('mi-empty').style.display = 'none';
    document.getElementById('mi-content').style.display = 'block';
    const S = {
      d1: renderSource('d1', renderD1, tienda), d2: renderSource('d2', renderD2, tienda),
      d3: renderSource('d3', renderD3, tienda), d4: renderSource('d4', renderD4, tienda),
      d5: renderSource('d5', renderD5, tienda), d6: renderSource('d6', renderD6, tienda),
      d7: renderSource('d7', renderD7, tienda), d8: renderSource('d8', renderD8, tienda),
      d9: renderSource('d9', renderD9, tienda), d10: renderSource('d10', renderD10, tienda),
      d11: renderSource('d11', renderD11, tienda),
      inventarios: renderSource('inventarios', renderInventarios, tienda),
    };
    renderIdentidad(tiendaDisplay, S);
    renderResumen(S);
    const alertas = renderAlertas(S);
    renderStorefront(alertas);
    renderLecturaCruzada(S);
  }

  async function init() {
    if (isInitializing) return;
    isInitializing = true;
    const corte = document.getElementById('corte-badge');
    corte.className = 'hero-badge is-loading';
    corte.textContent = '⟳ Cargando datos…';
    setPageState('loading', 'Conectando con Google Sheets', 'Estamos reuniendo los indicadores más recientes de tu tienda.');
    try {
      document.getElementById('mi-tienda-select').innerHTML = '';
      TIENDAS.clear();
      Object.keys(DATA).forEach((key) => delete DATA[key]);
      SOURCE_KEYS.forEach((key) => { SOURCE_STATE[key] = 'pending'; });
      activeTiendaDisplay = '';
      CATALOG = await OXXO.loadAsesorCatalog();
      seedTiendasFromCatalog();
      if (!TIENDAS.size) throw new Error('El catálogo no contiene tiendas disponibles.');
      mountSingleSelect('mi-tienda-select', [...TIENDAS.values()], {
        placeholder: 'Busca tu tienda',
        searchId: 'mi-tienda-search',
        searchPlaceholder: 'Buscar tienda por nombre...',
        onChange: renderFor,
      });
      setPageState('ready', 'Busca tu tienda arriba', 'Ya puedes elegirla. Cada apartado aparecerá en cuanto termine de cargar su fuente.');

      const sources = [
        ['d1', loadD1], ['d2', loadD2], ['d3', loadD3], ['d4', loadD4],
        ['d5', loadD5], ['d6', loadD6], ['d7', loadD7], ['d8', loadD8],
        ['d9', loadD9], ['d10', loadD10], ['d11', loadD11], ['inventarios', loadInventarios],
      ];
      updateLoadProgress();
      await Promise.allSettled(sources.map(async ([key, load]) => {
        try {
          await load();
          SOURCE_STATE[key] = DATA[key] ? 'loaded' : 'failed';
        } catch (error) {
          SOURCE_STATE[key] = 'failed';
          console.error(`Mi Tienda: no se pudo cargar ${key}`, error);
        } finally {
          updateLoadProgress();
          scheduleProgressiveRender();
        }
      }));
    } catch (error) {
      console.error('Mi Tienda: error de carga', error);
      corte.className = 'hero-badge is-error';
      corte.textContent = 'No se pudieron cargar los datos';
      setPageState('error', 'No pudimos conectar con los datos', 'Verifica tu conexión e inténtalo nuevamente. La información guardada en Google Sheets no fue modificada.');
    } finally {
      isInitializing = false;
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    applyScopeLabels();
    OXXO.setRetryHandler(init);
    document.getElementById('mi-retry').addEventListener('click', init);
    document.getElementById('mi-pdf-btn')?.addEventListener('click', () => window.print());
    init();
  });
})();
