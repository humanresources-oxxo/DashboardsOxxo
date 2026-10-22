// Contrato de Dashboard 2 (rediseño mobile-first): orden de la pagina, IDs y
// enlaces que no se pueden perder, KPI, mapa de calor accesible, orden del
// detalle, pestañas/disclosure, CSS aislado y paridad de cifras con un fixture.
// Verifica lo observable en el HTML/CSS/JS publicado (sin navegador).
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const raiz = path.resolve(__dirname, '..');
const leer = rel => fs.readFileSync(path.join(raiz, rel), 'utf8');
const html = leer('dashboards/dashboard-2.html');
const js = leer('js/dashboard-2.js');
const css = leer('css/dashboard-2.css');
const enhancements = leer('js/rh-dashboard-enhancements.js');
// Coincidencias con mensaje corto: assert.match volcaria el archivo completo al fallar.
const ok = (texto, patron, mensaje) => assert.ok(patron.test(texto), mensaje || `no coincide ${patron}`);
const no = (texto, patron, mensaje) => assert.ok(!patron.test(texto), mensaje || `no debia coincidir ${patron}`);
const sinComentarios = texto => texto.replace(/<!--[\s\S]*?-->/g, '');
const cuerpo = sinComentarios(html);
const posicion = fragmento => {
  const i = cuerpo.indexOf(fragmento);
  assert.ok(i >= 0, `falta ${fragmento} en dashboard-2.html`);
  return i;
};

test('orden de la pagina: encabezado, KPI, panorama, filtros, analisis, plazas, tiendas, mapa, detalle y denominaciones', () => {
  const orden = ['class="d2-hero"', 'id="kpi-section"', 'id="d2-decision"', 'class="d2-filter-region"', 'class="d2-analysis"', 'class="d2-panel d2-plazas"',
    'd2-panel--tiendas', 'd2-panel--heatmap', 'd2-panel--detalle', 'id="denom-section"', 'class="dash-footer"'].map(posicion);
  assert.deepEqual(orden, [...orden].sort((a, b) => a - b), 'el DOM debe seguir el orden visual movil');
  // El resumen numerico del encabezado y sus insights duplicados ya no existen.
  no(cuerpo, /bajas-hero-context/);
  no(js, /bajas-hero-context|bajas registradas|asesores con bajas/);
});

test('conserva todos los IDs que consumen scripts compartidos, filtros y descargas', () => {
  const ids = ['kpi-section', 'filter-bar', 'tabla-compromiso', 'chart-asesores', 'tabla-plazas', 'd2-plazas-summary', 'plazas-scope-toggle',
    'chart-tiendas', 'heatmap-bajas', 'tabla-detalle', 'row-count', 'btn-denominaciones', 'btn-motivos-pastel', 'motivos-modal',
    'motivos-title', 'chart-motivos-pastel', 'motivos-pastel-empty', 'denom-section', 'denom-count', 'denom-kpis', 'tabla-denominaciones',
    'load-time', 'baja-modal', 'baja-title', 'baja-body', 'hero-download', 'heatmap-status', 'heatmap-help', 'd2-filter-toggle',
    'd2-active-context', 'd2-scope', 'd2-analysis-panels', 'd2-plazas-panels', 'd2-decision', 'd2-decision-list', 'asesores-empty'];
  for (const id of ids) ok(cuerpo, new RegExp(`\\bid="${id}"`), `falta id="${id}"`);
  const repetidos = [...cuerpo.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]).filter((id, i, todos) => todos.indexOf(id) !== i);
  assert.deepEqual(repetidos, [], 'IDs duplicados');
  // El filtro se reconstruye desde JS: sus controles y acciones conservan IDs.
  for (const id of ['asesor-button', 'asesor-menu', 'asesor-search', 'asesor-options', 'tienda-button', 'tienda-search', 'tienda-options',
    'reset-filters', 'download-base', 'download-contact', 'denom-sort']) ok(js, new RegExp(`id="${id}"`), `JS debe generar id="${id}"`);
  for (const clave of ['mes', 'temporalidad', 'rotTemp', 'puesto']) ok(js, new RegExp(`\\['${clave}',`));
  ok(js, /id="filter-\$\{key\}"/);
});

test('ranking de plazas: un solo ranking con resumen, sin grafica duplicada y con descarga real', () => {
  no(cuerpo, /chart-plazas/);
  no(js, /chart-plazas|d2-plazas-chart/);
  ok(js, /<ol class="plaza-rank-list">/);
  ok(js, /\{ name: 'Otras Plazas', rows: LAST_PLAZAS_ROWS \}/);
});

test('D2 usa el canon visual unificado y un solo css propio; sin capas legadas ni logica embebida', () => {
  const hojas = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"?]+)/g)].map(m => m[1]);
  assert.equal(hojas.filter(h => h === '../css/dashboard-2.css').length, 1);
  assert.equal(hojas[hojas.length - 1], '../css/dashboard-2.css');
  assert.equal(hojas[hojas.length - 2], '../css/dashboard-dialogs.css');
  for (const compartida of ['global', 'dashboard-rh-unified', 'rh-table-tools', 'rh-filter-summary']) {
    assert.ok(hojas.includes(`../css/${compartida}.css`), `sigue cargando ${compartida}.css`);
  }
  for (const legacy of ['dashboard-skin', 'floating-filter-layout', 'rh-dashboard-refresh']) {
    assert.ok(!hojas.includes(`../css/${legacy}.css`), `D2 ya no carga ${legacy}.css`);
  }
  // Solo queda el estilo del candado (arranque de site-lock), nada de D2.
  const estilos = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]);
  assert.equal(estilos.length, 1);
  ok(estilos[0], /oxxo-locked/);
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
  const embebidos = scripts.filter(s => !/\bsrc=/.test(s[1])).map(s => s[2]);
  assert.equal(embebidos.length, 1, 'solo el arranque del candado va embebido');
  ok(embebidos[0], /oxxo_site_unlocked/);
  const orden = [...html.matchAll(/<script[^>]+src="\.\.\/js\/([^"?]+)/g)].map(m => m[1]);
  const finales = orden.slice(orden.indexOf('config.js'));
  assert.deepEqual(finales, ['config.js', 'core.js', 'dashboard-dialogs.js', 'dashboard-2.js']);
  assert.equal(orden.filter(n => n === 'dashboard-2.js').length, 1);
  ok(html, /<body class="hr-dashboard dashboard-2-page rh-unified"/);
});

test('ningun tablero monta el riel de Lectura rapida y la navegacion no depende de el', () => {
  no(enhancements, /hr-insights|createInsights|renderInsights/);
  ok(enhancements, /function createNavigation\(\)/);
  ok(enhancements.slice(enhancements.indexOf('function init()')), /createNavigation\(\);/);
  for (const archivo of fs.readdirSync(path.join(raiz, 'dashboards')).filter(n => n.endsWith('.html'))) {
    no(leer(`dashboards/${archivo}`), /hr-insights|data-rh-insights|id="insights"|Lectura r[áa]pida|Prioridades del tablero/, `${archivo} aun monta el riel de insights`);
  }
});


test('las cinco tarjetas KPI comparten estructura y el nombre accesible no se trunca', () => {
  for (const kpi of ['todos', 'asesor', 'tienda', 'rotTemp', 'atribucion']) ok(js, new RegExp(`kpi:'${kpi}'`));
  ok(js, /function kpiCardHTML\(/);
  ok(js, /kpi-card__label.*kpi-card__value.*kpi-card__delta/s);
  ok(js, /d2-kpi__entity/);
  // La tienda muestra el conteo como cifra y el nombre como linea secundaria (antes al reves).
  ok(js, /kpi:'tienda'[^\n]*value:tiendaTotal[^\n]*entity:tiendaLabel/);
  ok(js, /`Filtrar por \$\{maxAsesor\.label\}: \$\{maxAsesor\.total\} bajas`/);
  ok(js, /aria-label="\$\{escHtml\(aria\)\}"/);
  no(js, /clic para filtrar/i);
  no(cuerpo, /clic para filtrar/i);
  no(js, /OXXO\.truncate\(maxAsesor|OXXO\.truncate\(topEntries\(byTienda,1\)/);
  // Mismo mecanismo de filtro y marca de activo persistente.
  ok(js, /card\.classList\.toggle\('active', kpi !== 'todos' && FILTER_STATE\[kpi\] === card\.dataset\.kpiVal\)/);
  ok(css, /\.kpi-card\.active::before[^}]*content: "✓"/, 'el estado activo no depende del color');
});

test('mapa de calor: botones nativos con nombre, aria-pressed, tabindex itinerante y teclado', () => {
  ok(js, /<button type="button" class="heatmap-cell/);
  ok(js, /aria-pressed="\$\{isActive\}"/);
  ok(js, /aria-label="\$\{name\}"/);
  ok(js, /activar filtro/);
  ok(js, /quitar filtro/, 'la celda activa se nombra como quitar filtro');
  ok(js, /id="heatmap-clear"/, 'un cruce vacio ofrece el camino de regreso');
  ok(js, /scope="col"/);
  ok(js, /scope="row"/);
  ok(js, /<caption class="d2-sr">/);
  ok(js, /aria-describedby="heatmap-help"/);
  ok(js, /tabindex="\$\{r === HEAT\.row && c === HEAT\.col \? 0 : -1\}"/);
  for (const tecla of ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End']) ok(js, new RegExp(`'${tecla}'`));
  ok(js, /event\.ctrlKey/);
  ok(js, /focus\(\{ preventScroll: true \}\)/, 'el foco logico se restaura tras redibujar');
  ok(cuerpo, /<p[^>]*id="heatmap-status"[^>]*role="status"[^>]*aria-live="polite"/);
  // La matriz, el filtro y las celdas en cero siguen igual (sin deshabilitar).
  ok(js, /if\s*\(key === 'edadRange' \|\| key === 'antiguedadRange'\)\s*return true;/);
  no(js, /heatmap-cell[^\n]*disabled/);
});

test('detalle: encabezados ordenables con boton nativo y aria-sort; DET_SORT no cambia', () => {
  ok(js, /<th scope="col" data-col="\$\{k\}" aria-sort="\$\{ariaSort\(k\)\}"><button type="button" class="d2-sort"/);
  ok(js, /let DET_SORT = \{ col:'mes', dir:'desc' \};/);
  ok(js, /'ascending'/);
  ok(js, /'descending'/);
  ok(js, /\.d2-sort\[data-col="\$\{col\}"\]`\)\?\.focus\(\)/, 'el foco vuelve al encabezado tras reordenar');
});

test('filtros y vistas hermanas: disclosure real, pestañas con roving focus y solo en celular', () => {
  ok(html, /<button type="button" class="d2-filter-toggle" id="d2-filter-toggle" aria-expanded="true" aria-controls="filter-bar">/);
  ok(js, /toggle\.setAttribute\('aria-expanded'/);
  ok(js, /toggle\.setAttribute\('aria-controls'/);
  ok(js, /bar\.hidden = !open/, 'colapsado, el contenido no recibe foco');
  ok(js, /matchMedia\('\(max-width: 767px\)'\)/);
  for (const rol of ['tablist', 'tab', 'tabpanel']) ok(js, new RegExp(`'role', '${rol}'`));
  for (const atributo of ['aria-selected', 'aria-controls', 'aria-labelledby']) ok(js, new RegExp(atributo));
  for (const tecla of ['ArrowRight', 'ArrowLeft', 'Home', 'End']) ok(js, new RegExp(`${tecla}:`));
  ok(js, /button\.tabIndex = on \? 0 : -1/);
  ok(js, /canvas\._chartInstance\?\.resize\(\)/, 'al mostrar una pestaña se llama resize() del grafico existente');
  ok(js, /panel\.hidden = false/, 'a partir de 768 px todos los paneles quedan visibles');
  ok(js, /tabs: \[\s*\{ label: 'Compromiso'[\s\S]*label: 'Bajas por AT'/);
  no(js, /label: 'Gráfica'/, 'el ranking de plazas ya no tiene pestaña de gráfica duplicada');
  no(js, /tabindex="[1-9]/, 'no hay tabindex positivo');
  no(cuerpo, /tabindex="[1-9]/);
});

test('rh-filter-summary: decision explicita, no se monta el badge en D2', () => {
  // Se conserva la carga del script/css compartido, pero #filter-bar no lleva .vac-filters/.bajas-filters:
  // el resumen de filtros activos lo dan #d2-filter-summary y #d2-active-context (sin badge duplicado).
  ok(cuerpo, /id="filter-bar"/);
  no(cuerpo, /class="[^"]*(?:vac-filters|bajas-filters)[^"]*"/);
  ok(cuerpo, /rh-filter-summary\.js/);
  ok(css, /\.rh-filter-summary-badge\s*\{\s*display: none;/);
});

test('alcance: se reutiliza el selector de core.js y solo se agrega el resumen plegable', () => {
  ok(html, /<div class="d2-scope" id="d2-scope" data-oxxo-scope-mount>/);
  ok(js, /function enhanceD2ScopeSelector\(\)/);
  ok(js, /\[data-oxxo-scope-selector\]/);
  ok(js, /d2-scope-toggle/);
  // No se clona el selector ni se toca su persistencia.
  no(js, /setActiveDataScope|setActiveStoreStatus|sessionStorage|clearSheetDataCache|location\.reload/);
  no(js, /oxxo-scope-switch__opt.*innerHTML/);
});

test('sin onclick/onchange estaticos ni generados; los botones se enlazan con listeners', () => {
  no(cuerpo, /\son(?:click|change|input|keydown)=/i);
  no(js, /\son(?:click|change|input|keydown)="/i);
  ok(js, /getElementById\('btn-denominaciones'\)\?\.addEventListener\('click', toggleDenominaciones\)/);
  ok(js, /getElementById\('btn-motivos-pastel'\)\?\.addEventListener\('click', openMotivosModal\)/);
  no(cuerpo, /\sstyle="/, 'ningun estilo de presentacion en linea');
  for (const boton of cuerpo.matchAll(/<button\b[^>]*>/g)) ok(boton[0], /\btype="button"/);
});

test('Analisis, descargas, modales, denominaciones y lecturas en paralelo se conservan', () => {
  ok(cuerpo, /<a href="dashboard-2-analisis\.html" class="d2-link">/);
  ok(js, /window\.buildExcelSheets = async function/);
  for (const hoja of ['KPIs', 'Compromiso', 'Otras Plazas', 'Detalle de Bajas', 'Denominaciones']) ok(js, new RegExp(`name: '${hoja}'`));
  ok(js, /OXXO\.downloadSheetTab\(TAB, 'dashboard-2-bajas\.csv'\)/);
  ok(js, /downloadBajasWithContact/);
  ok(js, /OXXO\.renderDownloadButton\('hero-download','d2'/);
  assert.equal((js.match(/OXXO_DIALOGS\.register\(/g) || []).length, 2);
  ok(js, /const rawDenominacionesPromise = OXXO\.fetchSheetData\(OXXO\.SHEETS_CONFIG\.TABS\.d2denom\);\s*const \[raw, asesorCatalog, rawOtras, rawRegional\] = await Promise\.all\(\[/);
  ok(js, /OXXO\.fetchSheetData\(TAB,\{scoped:false\}\)/, 'carga una copia regional para el comparativo');
  ok(js, /void rawDenominacionesPromise\.then\(loadDenominaciones\)/, 'denominaciones no bloquea el tablero');
  ok(js, /window\.addEventListener\('oxxo-theme-change'/);
  ok(js, /OXXO\.showError\(id,'No se pudo conectar con Google Sheets\.'\)/);
  ok(js, /OXXO\.showEmpty\(id\)/);
});

test('rotulos de alcance: cada panel declara lo que de verdad usa', () => {
  for (const tipo of ['decision', 'compromiso', 'asesores', 'tiendas', 'heatmap', 'detalle', 'plazas', 'denom']) {
    ok(cuerpo, new RegExp(`class="d2-panel-scope" data-d2-scope="${tipo}"`), `falta el rotulo ${tipo}`);
  }
  ok(js, /function updatePanelScopeLabels\(\)/);
  ok(js, /showAllPlazas=OXXO\.getActiveDataScope\(\)\.level==='region'\|\|PLAZAS_SHOW_ALL/);
  ok(js, /Mes actual · \$\{showAllPlazas \? 'Todas las plazas' : 'Plaza activa'\} · Sin filtros secundarios/);
  ok(js, /Solo filtra por mes/);
  // Se llama tras cada render, el toggle de plazas y las denominaciones.
  assert.ok((js.match(/syncD2UI\(\)/g) || []).length >= 3);
  ok(js, /if\(OXXO\.getActiveDataScope\(\)\.level==='region'\)return;\s*PLAZAS_SHOW_ALL = !PLAZAS_SHOW_ALL;\s*renderPlazasForScope\(BAJAS_COLS\);\s*updatePanelScopeLabels\(\);/);
  ok(js, /REGIONAL_BAJAS_DATA = filterData\(rawRegional, REGIONAL_BAJAS_COLS\)/, 'el comparativo regional usa las mismas reglas de bajas');
});

test('compromisos regionales suman las metas de todas las plazas sin duplicar la vista individual', () => {
  const cuerpoFuncion = js.match(/function compromisoConfigForScope\(\)\{[\s\S]*?\n\}/)?.[0];
  assert.ok(cuerpoFuncion, 'falta compromisoConfigForScope');
  const metas = new Map([
    ['Oaxaca', { Ana: 2, Juan: 1 }],
    ['Tuxtla', { Ana: 3, Luisa: 4 }]
  ]);
  const calcular = (level, plaza = '') => new Function('OXXO', 'COMPROMISOS_BY_PLAZA',
    `${cuerpoFuncion}; return compromisoConfigForScope();`)(
    {
      SHEETS_CONFIG: { BAJAS_COMMITMENTS_DEFAULT: 1 },
      getActiveDataScope: () => ({ level, plaza }),
      matchesScopeValue: (actual, _dimension, scope) => scope.level === 'region' || actual === scope.plaza
    }, metas
  );
  assert.deepEqual({ ...calcular('region').values }, { Ana: 5, Juan: 1, Luisa: 4 });
  assert.deepEqual({ ...calcular('plaza', 'Oaxaca').values }, { Ana: 2, Juan: 1 });
});

test('css aislado: todo bajo body.dashboard-2-page, pocos !important, sin vidrio ni sombras multicapa', () => {
  const sinBloques = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const selectores = [];
  let profundidad = 0, actual = '';
  for (const ch of sinBloques) {
    if (ch === '{') { if (profundidad === 0 || /^@media|^@supports/.test(actual.trim())) selectores.push(actual.trim()); actual = ''; profundidad++; }
    else if (ch === '}') { profundidad--; actual = ''; }
    else actual += ch;
  }
  const reglas = selectores.filter(s => s && !/^@/.test(s));
  // Separa solo las comas de nivel superior (las de :is(...) no cuentan).
  const partes = selector => {
    const resultado = []; let nivel = 0, acumulado = '';
    for (const ch of selector) {
      if (ch === '(') nivel++;
      if (ch === ')') nivel--;
      if (ch === ',' && nivel === 0) { resultado.push(acumulado); acumulado = ''; } else acumulado += ch;
    }
    return [...resultado, acumulado];
  };
  const sueltas = reglas.filter(s => !partes(s).every(parte => /^body\.(?:d2-enhanced\.)?dashboard-2-page\b/.test(parte.trim())));
  assert.deepEqual(sueltas, [], 'selectores fuera de body.dashboard-2-page');
  no(sinBloques, /backdrop-filter:\s*(?!none)[^\s;]/);
  no(sinBloques, /blur\(/);
  no(sinBloques, /inset [^;]*rgba\(255,\s*255,\s*255/, 'sin brillos internos');
  assert.ok((sinBloques.match(/!important/g) || []).length <= 95, 'presupuesto de !important (D2 traia 206 en linea; aqui solo se enfrentan las !important compartidas)');
  ok(css, /prefers-reduced-motion:\s*reduce/);
  ok(css, /forced-colors:\s*active/);
  ok(css, /@media print/);
  const consultas = [...sinBloques.matchAll(/@media[^{]*/g)].map(m => m[0]).join(' ');
  const anchos = new Set([...consultas.matchAll(/(?:min|max)-width:\s*(\d+)px/g)].map(m => Number(m[1])));
  for (const ancho of anchos) assert.ok([359, 360, 480, 767, 768, 1024, 1280].includes(ancho), `breakpoint no previsto: ${ancho}px`);
  ok(css, /:focus-visible[^}]*outline:\s*3px solid/);
});

// ── Paridad de cifras: se ejecuta js/dashboard-2.js con un DOM minimo ─────────────
function cargarD2(esAdminUnit = () => false) {
  const elementos = {};
  const crear = id => {
    const e = { id, innerHTML: '', textContent: '', dataset: {}, style: {}, hidden: false, children: [],
      classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
      addEventListener() {}, setAttribute() {}, getAttribute: () => null, removeAttribute() {},
      querySelector: () => null, querySelectorAll: () => [], contains: () => false, focus() {}, closest: () => null };
    return e;
  };
  const conocidos = ['kpi-section', 'tabla-compromiso', 'tabla-detalle', 'tabla-plazas', 'row-count', 'heatmap-bajas', 'heatmap-status',
    'd2-active-context', 'd2-filter-summary', 'load-time', 'd2-hero-load', 'plazas-scope-toggle', 'motivos-pastel-empty',
    'd2-decision-list', 'asesores-empty'];
  const documento = {
    body: { classList: { add() {} } },
    activeElement: null,
    addEventListener() {},
    getElementById: id => (conocidos.includes(id) ? (elementos[id] = elementos[id] || crear(id)) : null),
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  const OXXO = {
    SHEETS_CONFIG: { TABS: { d2: 'd2', d2denom: 'd2d', d2otras: 'd2o' }, COMMITMENTS_SHEET: '', BAJAS_COMMITMENTS_DEFAULT: 4 },
    metricsFindKey: (row, alias) => alias.find(a => a in row) || '',
    metricsNormalizeMonthKey: v => (/^\d{4}-\d{2}$/.test(String(v)) ? String(v) : ''),
    getScopeCatalog: () => [], getActiveDataScope: () => ({ level: 'plaza', region: 'OAXACA', plaza: 'Plaza Oaxaca' }),
    getActiveStoreStatus: () => 'operativas', matchesScopeValue: () => true,
    restoreDashboardPeriod: (_d, ultimo) => ultimo, persistDashboardPeriod() {},
    truncate: (s, n = 25) => (s && s.length > n ? s.slice(0, n) + '…' : s || ''),
    metricsIsTiendaEntrenamientoOperacionesD2: t => esAdminUnit(t), updateFooterTime() {},
    resolveAsesorD1: (_catalogo, { asesor }) => String(asesor || '').trim(),
    ensureChartReady: () => false, getChartThemeColors: () => ({ text: '#000', tooltipBg: '#000', grid: '#ccc' }),
  };
  const ventana = { matchMedia: () => ({ matches: false, addEventListener() {} }), addEventListener() {}, OXXO };
  const contexto = vm.createContext({ document: documento, window: ventana, OXXO, OXXO_DIALOGS: { register: () => ({ open() {}, close() {} }), bindRows() {} }, console });
  const exponer = `\n;globalThis.__d2 = { run(rows, metas, catalogo, filtroExtra) {
    const graficas = {};
    renderChart = (id, _tipo, labels, values) => { graficas[id] = { labels, values }; };
    if(metas) COMPROMISOS_BY_PLAZA = metas;
    ASESOR_CATALOG = catalogo || null;
    const cols = buildCols(rows);
    RAW_BAJAS_DATA = rows; BASE_BAJAS_DATA = filterData(rows, cols); BAJAS_COLS = cols;
    FILTER_STATE = { ...defaultFilterState(BASE_BAJAS_DATA, BAJAS_COLS), ...(filtroExtra || {}) };
    SELECTED_ASESORES = defaultAsesorSelection(BASE_BAJAS_DATA, BAJAS_COLS);
    renderBajasDashboard(applyUserFilters(BASE_BAJAS_DATA, BAJAS_COLS), BAJAS_COLS);
    return { kpi: document.getElementById('kpi-section').innerHTML, heat: document.getElementById('heatmap-bajas').innerHTML,
      compromiso: document.getElementById('tabla-compromiso').innerHTML, detalle: document.getElementById('tabla-detalle').innerHTML,
      panorama: document.getElementById('d2-decision-list').innerHTML, filas: document.getElementById('row-count').textContent,
      asesoresVacio: document.getElementById('asesores-empty').hidden,
      asesores: asesorOptionsList(BASE_BAJAS_DATA, BAJAS_COLS), graficas };
  }, heatSpeak, heatTextColor, d2MonthShort, kpiCardHTML };`;
  vm.runInContext(js + exponer, contexto, { filename: 'js/dashboard-2.js' });
  return contexto.__d2;
}

test('fixture: total, asesor con mas bajas, tienda con mas bajas, rotacion temprana y matriz del mapa', () => {
  const fila = (asesor, tienda, puesto, temporalidad, rot, edad) => ({ Mes: '2026-09', Asesor: asesor, Tienda: tienda, Puesto: puesto, Temporalidad: temporalidad, 'Rot. Temp.': rot, Edad: edad, Plaza: 'Oaxaca' });
  const filas = [
    fila('Ana Perez', 'OXXO UNO', 'Ayudante Tienda', '0 - 45 días', 'Si', '20'),
    fila('Ana Perez', 'OXXO UNO', 'Ayudante Tienda', '46 - 90 días', 'No', '30'),
    fila('Ana Perez', 'OXXO DOS', 'Encargado', '3 - 6 meses', 'No', '40'),
    fila('Beto Lopez', 'OXXO DOS', 'Ayudante Tienda', '0 - 45 días', 'Si', '22'),
    fila('Beto Lopez', 'OXXO DOS', 'Ayudante Tienda', '0 - 45 días', 'No', '27'),
    fila('Carla Ruiz', 'OXXO TRES', 'Líder', '> 1 año', 'No', '50'),
  ];
  const { kpi, heat } = cargarD2().run(filas);
  const tarjeta = clave => kpi.match(new RegExp(`<div class="kpi-card d2-kpi [^"]*" data-kpi="${clave}"[\\s\\S]*?</div></div>(?=<div class="kpi-card|$)`))?.[0] || '';
  const valor = clave => (tarjeta(clave).match(/kpi-card__value">([^<]*)</) || [])[1];
  assert.equal(valor('todos'), '6');
  assert.equal(valor('asesor'), '3');
  ok(tarjeta('asesor'), /data-kpi-val="Ana Perez"/);
  ok(tarjeta('asesor'), /aria-label="Filtrar por Ana Perez: 3 bajas"/);
  ok(tarjeta('asesor'), /d2-kpi__entity" title="Ana Perez">Ana Perez</);
  assert.equal(valor('tienda'), '3', 'la cifra grande es el conteo');
  ok(tarjeta('tienda'), /data-kpi-val="OXXO DOS"/);
  ok(tarjeta('tienda'), /d2-kpi__entity" title="OXXO DOS">OXXO DOS</, 'el nombre completo va en la linea secundaria');
  assert.equal(valor('rotTemp'), '2');
  ok(tarjeta('rotTemp'), /33% del total/);
  ok(tarjeta('rotTemp'), /data-kpi-val="Si"/);
  // Todas con asesor registrado: la tarjeta de pendientes informa 0 y no filtra.
  assert.equal(valor('atribucion'), '0');
  ok(tarjeta('atribucion'), /is-static/);
  no(tarjeta('atribucion'), /data-kpi-val=/);
  // 5x5 botones; celdas: (18-25 x 0-45)=2, (26-35 x 46-90)=1, (36-45 x 3-6 meses)=1, (26-35 x 0-45)=1, (46-55 x >1 año)=1.
  const celdas = [...heat.matchAll(/<button type="button" class="heatmap-cell[^"]*" data-edad="([^"]+)" data-ant="([^"]+)"[^>]*data-count="(\d+)"/g)];
  assert.equal(celdas.length, 25);
  const matriz = Object.fromEntries(celdas.filter(c => c[3] !== '0').map(c => [`${c[1]}|${c[2]}`, Number(c[3])]));
  assert.deepEqual(matriz, { '18-25|0 - 45 días': 2, '26-35|0 - 45 días': 1, '26-35|46 - 90 días': 1, '36-45|3 - 6 meses': 1, '46-55|> 1 año': 1 });
  ok(heat, /aria-label="Edad 18 a 25, antigüedad 0 a 45 días, 2 bajas, activar filtro"/);
  assert.equal((heat.match(/tabindex="0"/g) || []).length, 1, 'una sola celda en el orden de tabulacion');
  assert.equal((heat.match(/tabindex="-1"/g) || []).length, 24);
  assert.equal((heat.match(/aria-pressed="false"/g) || []).length, 25);
});

test('ayudas del mapa: rangos hablados y texto legible sobre cualquier relleno', () => {
  const d2 = cargarD2();
  assert.equal(d2.heatSpeak('18-25'), '18 a 25');
  assert.equal(d2.heatSpeak('56+'), '56 o más');
  assert.equal(d2.heatSpeak('0 - 45 días'), '0 a 45 días');
  assert.equal(d2.heatSpeak('> 1 año'), 'más de 1 año');
  assert.equal(d2.heatTextColor(0.05), '#2b1a17');
  assert.equal(d2.heatTextColor(1), '#fff');
  assert.equal(d2.d2MonthShort('2026-09'), 'Sep 2026');
  assert.equal(d2.d2MonthShort(''), 'Todos los meses');
});

// Reglas de atribucion: solo el Asesor crudo (no marcador) identifica a un
// responsable. Vacio, marcador o unidad administrativa sin Asesor crudo =>
// "Sin responsable identificado": cuenta en total y detalle, nunca en
// rankings individuales ni en Compromiso vs resultado.
const filaAt = (asesor, tienda, extra = {}) => ({ Mes: '2026-09', Asesor: asesor, Tienda: tienda, Puesto: 'Ayudante Tienda', Temporalidad: '0 - 45 días', 'Rot. Temp.': 'No', Edad: '25', Plaza: 'Oaxaca', 'Motivo de baja': 'Renuncia voluntaria', ...extra });
const esAdminAt = t => /^(ENTRENAMIENTO OAXACA|OPERACIONES )/.test(String(t || '').toUpperCase());
const filasAtribucion = () => [
  filaAt('Sin Asesor Asignado', 'ENTRENAMIENTO OAXACA'),            // unidad admin sin asesor crudo
  filaAt('', 'ENTRENAMIENTO OAXACA II'),                            // vacio
  filaAt('Ana Perez', 'OPERACIONES 1 OAXACA'),                      // unidad admin CON asesor crudo: confirmado
  filaAt('Sin Asesor Asignado', 'OXXO TIENDA REAL'),                // marcador en tienda real
  filaAt('N/A', 'OXXO UNO', { Temporalidad: '> 1 año' }),           // marcador
  filaAt('Ana Perez', 'OXXO UNO'),
  filaAt('Beto Lopez', 'OXXO DOS', { Temporalidad: '46 - 90 días', 'Motivo de baja': 'Abandono' }),
];
const tarjetaKpi = (kpi, clave) => kpi.match(new RegExp(`data-kpi="${clave}"[\\s\\S]*?</div></div>(?=<div class="kpi-card|$)`))?.[0] || '';

test('atribucion: marcadores, vacios y unidades admin sin asesor quedan Sin responsable identificado', () => {
  const filas = filasAtribucion();
  const copia = JSON.parse(JSON.stringify(filas));
  const { kpi, compromiso, detalle, asesores, graficas, filas: conteo } = cargarD2(esAdminAt).run(filas);
  assert.deepEqual(filas, copia, 'las filas de origen no se alteran');

  // Total y detalle incluyen todo: 7 bajas, 7 filas.
  ok(tarjetaKpi(kpi, 'todos'), /kpi-card__value">7</);
  assert.equal(conteo, '7 bajas');
  assert.equal((detalle.match(/class="det-row"/g) || []).length, 7);

  // Filtro: un solo grupo sin responsable, al final.
  assert.deepEqual(Array.from(asesores), ['Ana Perez', 'Beto Lopez', 'Sin responsable identificado']);

  // Compromiso y ranking: solo asesores confirmados; la nota declara las 4 excluidas.
  const celdas = [...compromiso.matchAll(/<td>([^<]*)<\/td>\s*<td class="num"><span class="pill [^"]*">(\d+)</g)].map(m => [m[1], Number(m[2])]);
  assert.deepEqual(celdas, [['Ana Perez', 2], ['Beto Lopez', 1]]);
  ok(compromiso, /<tfoot><tr><td>Total confirmado<\/td><td class="num">3</);
  ok(compromiso, /4 bajas sin responsable identificado no se incluyen en esta comparación/);
  assert.deepEqual([...graficas['chart-asesores'].labels], ['Ana Perez', 'Beto Lopez']);

  // KPI: el tope es una persona confirmada; pendientes = 4 y filtrable.
  ok(tarjetaKpi(kpi, 'asesor'), /data-kpi-val="Ana Perez"/);
  no(tarjetaKpi(kpi, 'asesor'), /Sin responsable/);
  ok(tarjetaKpi(kpi, 'atribucion'), /kpi-card__value">4</);
  ok(tarjetaKpi(kpi, 'atribucion'), /data-kpi-val="pendiente"/);
  ok(tarjetaKpi(kpi, 'atribucion'), /57% del total/);
  ok(tarjetaKpi(kpi, 'atribucion'), /aria-label="Filtrar bajas pendientes de atribución: 4"/);

  // Detalle: insignia con texto accesible en cada fila, columna ordenable.
  assert.equal((detalle.match(/class="d2-attr is-pending">Pendiente de atribución</g) || []).length, 4);
  assert.equal((detalle.match(/class="d2-attr is-confirmed">Asesor registrado</g) || []).length, 3);
  ok(detalle, /<th scope="col" data-col="atribucion" aria-sort="none"><button type="button" class="d2-sort" data-col="atribucion">Atribución/);
  assert.equal((detalle.match(/>Sin responsable identificado</g) || []).length, 4);
});

test('atribucion: el KPI de pendientes filtra solo las bajas sin responsable', () => {
  const { kpi, detalle, filas, compromiso, asesoresVacio, graficas } = cargarD2(esAdminAt).run(filasAtribucion(), null, null, { atribucion: 'pendiente' });
  assert.equal(filas, '4 bajas');
  no(detalle, /is-confirmed/);
  // Sin asesores confirmados: tope sin persona, comparativos con estado vacio.
  const tarjetaAsesor = tarjetaKpi(kpi, 'asesor');
  ok(kpi, /class="kpi-card d2-kpi rojo is-static" data-kpi="asesor"/);
  ok(tarjetaAsesor, /Sin asesor confirmado/);
  no(tarjetaAsesor, /data-kpi-val=/);
  // El roster del mes conserva a los confirmados en 0; las 4 pendientes se declaran aparte.
  const celdas = [...compromiso.matchAll(/<td>([^<]*)<\/td>\s*<td class="num"><span class="pill [^"]*">(\d+)</g)].map(m => [m[1], Number(m[2])]);
  assert.deepEqual(celdas, [['Ana Perez', 0], ['Beto Lopez', 0]]);
  ok(compromiso, /4 bajas sin responsable identificado no se incluyen/);
  // Todos los confirmados en 0: la grafica cae en su estado vacio.
  assert.equal(asesoresVacio, false, 'sin bajas confirmadas la grafica muestra su estado vacio');
  assert.equal(graficas['chart-asesores'], undefined, 'no se dibuja un ranking de puros ceros');
  // Sin ningun asesor confirmado en el alcance: estado vacio en tabla y grafica.
  const soloPendientes = cargarD2().run([filaAt('', 'OXXO UNO'), filaAt('N/A', 'OXXO DOS')]);
  ok(soloPendientes.compromiso, /class="d2-empty">Sin asesores confirmados con los filtros activos/);
  ok(soloPendientes.compromiso, /2 bajas sin responsable identificado no se incluyen/);
  assert.equal(soloPendientes.asesoresVacio, false, 'la grafica muestra su estado vacio');
  assert.equal(soloPendientes.graficas['chart-asesores'], undefined, 'no se dibuja un ranking vacio');
  ok(js, /if\(kpi !== 'todos' && kpiVal === undefined\) return;/, 'una tarjeta sin valor no filtra');
});

test('atribucion: nunca se infiere asesor por tienda vigente, catalogo ni parecido de nombre', () => {
  no(js, /resolveAsesorD1/, 'D2 no reescribe el asesor con el catalogo');
  no(js, /row\[cols\.asesor\]\s*=/, 'las filas de origen no se modifican');
  ok(js, /function isAtribucionConfirmada\(row, cols\)\{ return !isPlaceholderAsesor\(val\(row, cols, 'asesor', ''\)\); \}/);
  // Aunque el catalogo diga quien tiene hoy la tienda, la baja sin asesor sigue pendiente.
  const catalogo = { byTienda: new Map([['OXXO TIENDA REAL', { asesor: 'Carla Ruiz', tienda: 'OXXO TIENDA REAL', plaza: 'Oaxaca', activa: true }]]) };
  const { detalle, compromiso } = cargarD2().run([filaAt('Sin Asesor Asignado', 'OXXO TIENDA REAL')], null, catalogo);
  ok(detalle, /Pendiente de atribución/);
  no(detalle, /Carla Ruiz/);
  ok(compromiso, /<td>Carla Ruiz<\/td>\s*<td class="num"><span class="pill good">0</, 'el roster lista a la persona con 0 bajas');
});

test('la agrupacion administrativa heredada no aparece como responsable en la UI', () => {
  for (const [nombre, texto] of [['html', cuerpo], ['js', js]]) {
    no(texto, /Entrenamiento \/ Operaciones/, `${nombre} expone la agrupacion heredada`);
    no(texto, /Sin asesor asignado/, `${nombre} conserva la etiqueta anterior`);
  }
  const { kpi, compromiso, detalle, asesores, panorama } = cargarD2(esAdminAt).run(filasAtribucion());
  for (const salida of [kpi, compromiso, detalle, panorama, Array.from(asesores).join('|')]) no(salida, /Entrenamiento \/ Operaciones|SIN ASESOR ASIGNADO/i);
});

test('panorama de decision: concentracion temprana, motivo predominante y atribucion pendiente', () => {
  ok(cuerpo, /<section class="d2-panel d2-decision" id="d2-decision" aria-labelledby="d2-decision-title"/);
  ok(cuerpo, /<h2 class="d2-panel__title" id="d2-decision-title">Panorama de decisión/);
  ok(cuerpo, /<ul class="d2-decision__list" id="d2-decision-list" aria-live="polite">/);
  const { panorama } = cargarD2(esAdminAt).run(filasAtribucion());
  const items = [...panorama.matchAll(/<li class="d2-decision__item is-(\w+)"><p class="d2-decision__label">([^<]+)<\/p><p class="d2-decision__value">([^<]+)<\/p><p class="d2-decision__text">([^<]+)</g)]
    .map(m => ({ tono: m[1], etiqueta: m[2], valor: m[3], texto: m[4] }));
  assert.deepEqual(items.map(i => i.etiqueta), ['Concentración temprana', 'Motivo predominante', 'Atribución pendiente']);
  // 6 de 7 bajas dentro de 90 dias (5 en 0-45 + 1 en 46-90).
  assert.deepEqual([items[0].valor, items[0].tono], ['86%', 'alert']);
  ok(items[0].texto, /6 bajas de 7 en los primeros 90 días/);
  assert.equal(items[1].valor, 'Renuncia', 'el motivo normalizado se presenta en tipo oración');
  ok(items[1].texto, /86% de las bajas \(6 de 7\)/);
  assert.deepEqual([items[2].valor, items[2].tono], ['4', 'alert']);
  ok(items[2].texto, /4 bajas sin responsable identificado \(57%\)/);
  // Sin pendientes: lectura positiva. Sin datos: estado vacio explicito.
  const limpio = cargarD2().run([filaAt('Ana Perez', 'OXXO UNO')]).panorama;
  ok(limpio, /is-ok"><p class="d2-decision__label">Atribución pendiente[\s\S]*Todas las bajas tienen asesor registrado/);
  const vacio = cargarD2().run([filaAt('Ana Perez', 'OXXO UNO')], null, null, { puesto: 'Inexistente' }).panorama;
  ok(vacio, /d2-decision__item--empty">Sin bajas con los filtros activos/);
});

// La tabla es el tablero de seguimiento de la plaza: un AT con meta y cero
// bajas tambien se lista (su desfase a favor es informacion, no ruido).
test('compromiso lista a los asesores con cero bajas, la grafica no; las bajas sin responsable quedan fuera', () => {
  const fila = (asesor, tienda) => ({ Mes: '2026-09', Asesor: asesor, Tienda: tienda, Puesto: 'Ayudante Tienda', Temporalidad: '0 - 45 días', 'Rot. Temp.': 'No', Edad: '25', Plaza: 'Oaxaca' });
  const esAdmin = t => /^ENTRENAMIENTO /.test(String(t || '').toUpperCase());
  const metas = new Map([['Oaxaca', { 'Ana Perez': 2, 'Zoe Fantasma': 5 }]]);
  const filas = [
    fila('Ana Perez', 'OXXO UNO'), fila('Ana Perez', 'OXXO UNO'), fila('Ana Perez', 'OXXO DOS'),
    fila('Sin Asesor Asignado', 'OXXO TIENDA REAL'),
    fila('Sin Asesor Asignado', 'ENTRENAMIENTO OAXACA'),
  ];
  const { compromiso, graficas } = cargarD2(esAdmin).run(filas, metas);

  const celdas = [...compromiso.matchAll(/<td>([^<]*)<\/td>\s*<td class="num"><span class="pill [^"]*">(\d+)</g)].map(m => [m[1], Number(m[2])]);
  assert.deepEqual(celdas, [['Ana Perez', 3], ['Zoe Fantasma', 0]], 'el AT configurado con cero bajas se lista al final');

  // Pie confirmado: 3 bajas contra 7 de meta (Ana 2 + Zoe 5); las 2 sin responsable se declaran aparte.
  ok(compromiso, /<tfoot><tr><td>Total confirmado<\/td><td class="num">3<\/td><td class="num">7<\/td><td class="num">-4<\/td>/);
  ok(compromiso, /2 bajas sin responsable identificado no se incluyen/);
  // La fila de Zoe muestra su meta y el desfase a favor.
  ok(compromiso, /<td>Zoe Fantasma<\/td>\s*<td class="num"><span class="pill good">0<\/span><\/td>\s*<td class="num">5<\/td>\s*<td class="num desfase pos">-5<\/td>/);

  // Grafica Bajas por Asesor: Zoe sigue en la tabla, pero su cero no llega a los datos.
  const ranking = graficas['chart-asesores'];
  assert.deepEqual([...ranking.labels], ['Ana Perez']);
  assert.deepEqual([...ranking.values], [3]);

  // Con roster el cuerpo lista filas; solo sin ningun asesor confirmado hay estado vacio.
  ok(js, /<tbody>\$\{rows\}<\/tbody>/);
});

// Inicio, Excel, PNG y el selector de tablero comparten el canon de la barra
// superior (blanco, contorno, rojo solo en el texto). Regresion de la pildora
// roja compacta que traian Excel/PNG.
test('controles de la barra superior: mismo canon que los demas tableros', () => {
  const bloque = re => css.match(re)?.[0] || '';
  const inicio = bloque(/body\.dashboard-2-page \.topbar__back \{[^}]*\}/);
  const exportar = bloque(/body\.dashboard-2-page \.d2-export \.png-export-ui \{[^}]*\}/);
  ok(inicio, /min-height: var\(--du-target\)/);
  for (const patron of [/min-height: var\(--du-target\)/, /font-size: 14px/, /font-weight: 700/, /letter-spacing: normal/, /font-family: inherit/]) {
    ok(exportar, patron, `Excel/PNG fuera del canon: ${patron}`);
  }
  no(exportar, /background:\s*var\(--du-red/, 'Excel/PNG no llevan relleno rojo');
  // El selector de tablero mantiene el control de 38px y radio 10px del canon.
  ok(css, /\.hr-dashboard-switcher__control \{[^}]*min-height: 38px[^}]*border-radius: 10px/);
});

// Sin recortes: la tabla y el ranking listan a todo el roster, ordenado por
// bajas, sin duplicados y con el pie sumando el total real.
test('ranking de asesores: tabla y grafica listan el roster completo, sin recorte', () => {
  const fila = asesor => ({ Mes: '2026-09', Asesor: asesor, Tienda: 'OXXO UNO', Puesto: 'Ayudante Tienda', Temporalidad: '0 - 45 días', 'Rot. Temp.': 'No', Edad: '25', Plaza: 'Oaxaca' });
  const conteos = [['Ana Nueve', 9], ['Beto Ocho', 8], ['Carla Siete', 7], ['Dario Seis', 6], ['Elsa Cinco', 5],
    ['Fito Tres', 3], ['Gina Dos', 2], ['Hugo Dos', 2], ['Iris Dos', 2], ['Juan Uno', 1], ['Kiko Uno', 1], ['Lola Uno', 1]];
  const filas = conteos.flatMap(([nombre, n]) => Array.from({ length: n }, () => fila(nombre)));
  assert.equal(filas.length, 47, 'el fixture son 47 bajas');

  const { compromiso, graficas } = cargarD2().run(filas);
  const celdas = [...compromiso.matchAll(/<td>([^<]*)<\/td>\s*<td class="num"><span class="pill [^"]*">(\d+)</g)].map(m => [m[1], Number(m[2])]);
  assert.deepEqual(celdas, conteos, 'los 12 asesores, ordenados por bajas');
  assert.equal(new Set(celdas.map(([n]) => n)).size, celdas.length, 'sin asesores repetidos');
  no(compromiso, /compromiso-grupo/, 'sin separadores de recorte');

  // Pie con el total real: 47 bajas.
  ok(compromiso, /<tfoot><tr><td>Total confirmado<\/td><td class="num">47</);

  // La grafica usa exactamente la misma lista que la tabla.
  const ranking = graficas['chart-asesores'];
  assert.deepEqual([...ranking.labels], celdas.map(([n]) => n));
  assert.deepEqual([...ranking.values], celdas.map(([, n]) => n));
  ok(js, /function rankingGradientColors\(values\)/, 'la grafica de asesores define el degradado por nivel de bajas');
  ok(js, /colors: rankingGradientColors\(chartRanking\.map\(item=>item\.bajas\)\)/, 'la grafica de asesores usa el degradado');
});

// El roster sale del Catalogo_Asesores vigente, no de los datos: un AT activo
// de la plaza se lista con 0 bajas, y las tiendas marcadas no activas no
// aportan nombres. Los buckets y el pie no cambian.
test('compromiso: el roster incluye a los asesores vigentes del catalogo con cero bajas', () => {
  const fila = (asesor, tienda) => ({ Mes: '2026-09', Asesor: asesor, Tienda: tienda, Puesto: 'Ayudante Tienda', Temporalidad: '0 - 45 días', 'Rot. Temp.': 'No', Edad: '25', Plaza: 'Oaxaca' });
  const catalogo = { byTienda: new Map([
    ['OXXO UNO', { asesor: 'Ana Perez', tienda: 'OXXO UNO', plaza: 'Oaxaca', activa: true }],
    ['OXXO TRES', { asesor: 'Beto Sin Bajas', tienda: 'OXXO TRES', plaza: 'Oaxaca', activa: true }],
    ['OXXO CERRADA', { asesor: 'Carla Cerrada', tienda: 'OXXO CERRADA', plaza: 'Oaxaca', activa: false }],
    ['OXXO HUERFANA', { asesor: 'Sin Asesor Asignado', tienda: 'OXXO HUERFANA', plaza: 'Oaxaca', activa: true }],
  ]) };
  const { compromiso, graficas } = cargarD2().run([fila('Ana Perez', 'OXXO UNO'), fila('Ana Perez', 'OXXO UNO')], null, catalogo);

  const celdas = [...compromiso.matchAll(/<td>([^<]*)<\/td>\s*<td class="num"><span class="pill [^"]*">(\d+)</g)].map(m => [m[1], Number(m[2])]);
  assert.deepEqual(celdas, [['Ana Perez', 2], ['Beto S.B.', 0]], 'el AT vigente sin bajas se lista; la tienda no activa y el bucket no');
  assert.deepEqual([...graficas['chart-asesores'].labels], ['Ana Perez'], 'el AT vigente en 0 no llega a la grafica');
  assert.deepEqual([...graficas['chart-asesores'].values], [2]);

  // Totales intactos: 2 bajas contra la meta default (4) de los dos del roster.
  ok(compromiso, /<tfoot><tr><td>Total confirmado<\/td><td class="num">2<\/td><td class="num">8<\/td><td class="num">-6<\/td>/);
});
