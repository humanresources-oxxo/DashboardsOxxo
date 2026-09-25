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

test('orden de la pagina: encabezado, KPI, filtros, analisis, plazas, tiendas, mapa, detalle y denominaciones', () => {
  const orden = ['class="d2-hero"', 'id="kpi-section"', 'class="d2-filter-region"', 'class="d2-analysis"', 'class="d2-panel d2-plazas"',
    'd2-panel--tiendas', 'd2-panel--heatmap', 'd2-panel--detalle', 'id="denom-section"', 'class="dash-footer"'].map(posicion);
  assert.deepEqual(orden, [...orden].sort((a, b) => a - b), 'el DOM debe seguir el orden visual movil');
  // El resumen numerico del encabezado y sus insights duplicados ya no existen.
  no(cuerpo, /bajas-hero-context/);
  no(js, /bajas-hero-context|bajas registradas|asesores con bajas/);
});

test('conserva todos los IDs que consumen scripts compartidos, filtros y descargas', () => {
  const ids = ['kpi-section', 'filter-bar', 'tabla-compromiso', 'chart-asesores', 'tabla-plazas', 'chart-plazas', 'plazas-scope-toggle',
    'chart-tiendas', 'heatmap-bajas', 'tabla-detalle', 'row-count', 'btn-denominaciones', 'btn-motivos-pastel', 'motivos-modal',
    'motivos-title', 'chart-motivos-pastel', 'motivos-pastel-empty', 'denom-section', 'denom-count', 'denom-kpis', 'tabla-denominaciones',
    'load-time', 'baja-modal', 'baja-title', 'baja-body', 'hero-download', 'heatmap-status', 'heatmap-help', 'd2-filter-toggle',
    'd2-active-context', 'd2-scope', 'd2-analysis-panels', 'd2-plazas-panels'];
  for (const id of ids) ok(cuerpo, new RegExp(`\\bid="${id}"`), `falta id="${id}"`);
  const repetidos = [...cuerpo.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]).filter((id, i, todos) => todos.indexOf(id) !== i);
  assert.deepEqual(repetidos, [], 'IDs duplicados');
  // El filtro se reconstruye desde JS: sus controles y acciones conservan IDs.
  for (const id of ['asesor-button', 'asesor-menu', 'asesor-search', 'asesor-options', 'tienda-button', 'tienda-search', 'tienda-options',
    'reset-filters', 'download-base', 'download-contact', 'denom-sort']) ok(js, new RegExp(`id="${id}"`), `JS debe generar id="${id}"`);
  for (const clave of ['mes', 'temporalidad', 'rotTemp', 'puesto']) ok(js, new RegExp(`\\['${clave}',`));
  ok(js, /id="filter-\$\{key\}"/);
});

test('un solo css (despues de dashboard-dialogs) y un solo js propio; sin css ni logica embebidos', () => {
  const hojas = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"?]+)/g)].map(m => m[1]);
  assert.equal(hojas.filter(h => h === '../css/dashboard-2.css').length, 1);
  assert.equal(hojas[hojas.length - 1], '../css/dashboard-2.css');
  assert.equal(hojas[hojas.length - 2], '../css/dashboard-dialogs.css');
  for (const compartida of ['global', 'dashboard-skin', 'floating-filter-layout', 'rh-dashboard-refresh', 'rh-table-tools', 'rh-filter-summary']) {
    assert.ok(hojas.includes(`../css/${compartida}.css`), `sigue cargando ${compartida}.css`);
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
  ok(html, /<body class="hr-dashboard dashboard-2-page"/);
});

test('el riel de insights se apaga solo con data-rh-insights="false" y la navegacion no depende de ello', () => {
  ok(html, /<body[^>]*data-rh-insights="false"/);
  const crear = enhancements.slice(enhancements.indexOf('function createInsights()'), enhancements.indexOf('function renderInsights'));
  ok(crear, /rhInsights === 'false'\) return null/);
  const init = enhancements.slice(enhancements.indexOf('function init()'));
  assert.ok(init.indexOf('createNavigation()') < init.indexOf('createInsights()'), 'la navegacion se crea antes y sin condicion');
  no(enhancements.slice(enhancements.indexOf('function createNavigation()'), enhancements.indexOf('function createInsights()')), /rhInsights/);
  // Otros tableros siguen mostrando su riel: ninguno mas declara el opt-out.
  for (const otro of fs.readdirSync(path.join(raiz, 'dashboards')).filter(n => n.endsWith('.html') && n !== 'dashboard-2.html')) {
    no(leer(`dashboards/${otro}`), /data-rh-insights/, `${otro} conserva sus insights`);
  }
});

test('las cuatro tarjetas KPI comparten estructura y el nombre accesible no se trunca', () => {
  for (const kpi of ['todos', 'asesor', 'tienda', 'rotTemp']) ok(js, new RegExp(`kpi:'${kpi}'`));
  ok(js, /function kpiCardHTML\(/);
  ok(js, /kpi-card__label.*kpi-card__value.*kpi-card__delta/s);
  ok(js, /d2-kpi__entity/);
  // La tienda muestra el conteo como cifra y el nombre como linea secundaria (antes al reves).
  ok(js, /kpi:'tienda'[^\n]*value:tiendaTotal[^\n]*entity:tiendaLabel/);
  ok(js, /aria:`Filtrar por \$\{maxAsesor\.label\}: \$\{maxAsesor\.total\} bajas`/);
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
  ok(js, /label: 'Ranking'[\s\S]*label: 'Gráfica'/);
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
  ok(js, /const rawDenominacionesPromise = OXXO\.fetchSheetData\(OXXO\.SHEETS_CONFIG\.TABS\.d2denom\);\s*const \[raw, asesorCatalog, rawOtras\] = await Promise\.all\(\[/);
  ok(js, /void rawDenominacionesPromise\.then\(loadDenominaciones\)/, 'denominaciones no bloquea el tablero');
  ok(js, /window\.addEventListener\('oxxo-theme-change'/);
  ok(js, /OXXO\.showError\(id,'No se pudo conectar con Google Sheets\.'\)/);
  ok(js, /OXXO\.showEmpty\(id\)/);
});

test('rotulos de alcance: cada panel declara lo que de verdad usa', () => {
  for (const tipo of ['compromiso', 'asesores', 'tiendas', 'heatmap', 'detalle', 'plazas', 'denom']) {
    ok(cuerpo, new RegExp(`class="d2-panel-scope" data-d2-scope="${tipo}"`), `falta el rotulo ${tipo}`);
  }
  ok(js, /function updatePanelScopeLabels\(\)/);
  ok(js, /Mes actual · \$\{PLAZAS_SHOW_ALL \? 'Todas las plazas' : 'Plaza activa'\} · Sin filtros secundarios/);
  ok(js, /Solo filtra por mes/);
  // Se llama tras cada render, el toggle de plazas y las denominaciones.
  assert.ok((js.match(/syncD2UI\(\)/g) || []).length >= 3);
  ok(js, /PLAZAS_SHOW_ALL = !PLAZAS_SHOW_ALL;\s*renderPlazas\(BASE_BAJAS_DATA, BAJAS_COLS\);\s*updatePanelScopeLabels\(\);/);
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
function cargarD2() {
  const elementos = {};
  const crear = id => {
    const e = { id, innerHTML: '', textContent: '', dataset: {}, style: {}, hidden: false, children: [],
      classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
      addEventListener() {}, setAttribute() {}, getAttribute: () => null, removeAttribute() {},
      querySelector: () => null, querySelectorAll: () => [], contains: () => false, focus() {}, closest: () => null };
    return e;
  };
  const conocidos = ['kpi-section', 'tabla-compromiso', 'tabla-detalle', 'tabla-plazas', 'row-count', 'heatmap-bajas', 'heatmap-status',
    'd2-active-context', 'd2-filter-summary', 'load-time', 'd2-hero-load', 'plazas-scope-toggle', 'motivos-pastel-empty'];
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
    metricsIsTiendaEntrenamientoOperacionesD2: () => false, updateFooterTime() {},
    ensureChartReady: () => false, getChartThemeColors: () => ({ text: '#000', tooltipBg: '#000', grid: '#ccc' }),
  };
  const ventana = { matchMedia: () => ({ matches: false, addEventListener() {} }), addEventListener() {}, OXXO };
  const contexto = vm.createContext({ document: documento, window: ventana, OXXO, OXXO_DIALOGS: { register: () => ({ open() {}, close() {} }), bindRows() {} }, console });
  const exponer = `\n;globalThis.__d2 = { run(rows) {
    const cols = buildCols(rows);
    RAW_BAJAS_DATA = rows; BASE_BAJAS_DATA = filterData(rows, cols); BAJAS_COLS = cols;
    FILTER_STATE = defaultFilterState(BASE_BAJAS_DATA, BAJAS_COLS);
    SELECTED_ASESORES = defaultAsesorSelection(BASE_BAJAS_DATA, BAJAS_COLS);
    renderBajasDashboard(applyUserFilters(BASE_BAJAS_DATA, BAJAS_COLS), BAJAS_COLS);
    return { kpi: document.getElementById('kpi-section').innerHTML, heat: document.getElementById('heatmap-bajas').innerHTML };
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
