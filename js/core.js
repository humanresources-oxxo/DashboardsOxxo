/* ==========================================================
   OXXO DASHBOARDS — MÓDULO CORE
   Conexión a Google Sheets · Utilidades compartidas
   ========================================================== */

// ─────────────────────────────────────────────────────────────
// CONFIGURACIÓN CENTRAL DEL SISTEMA
// Unica fuente: js/config.js (window.OXXO_CONFIG), cargado antes que
// este archivo en todas las paginas del sitio. Si falta, se corta aqui
// en vez de caer a un respaldo con datos de otro cliente hardcodeados.
// ─────────────────────────────────────────────────────────────
if (!window.OXXO_CONFIG) {
  throw new Error('[OXXO] Falta js/config.js -- debe cargarse antes que core.js.');
}
const SHEETS_CONFIG = window.OXXO_CONFIG;

// Contexto geografico/operativo normalizado para Región TABASCO.
function getDataContext() {
  const source = SHEETS_CONFIG.DATA_CONTEXT || {};
  return Object.freeze({
    countryCode: String(source.COUNTRY_CODE || 'MX').trim().toUpperCase(),
    country: String(source.COUNTRY || 'Mexico').trim(),
    state: String(source.STATE || 'Oaxaca').trim(),
    region: String(source.REGION || source.STATE || 'Oaxaca').trim(),
    plazaId: String(source.PLAZA_ID || 'PLAZA-OAXACA').trim().toUpperCase(),
    plaza: String(source.PLAZA || 'Plaza Oaxaca').trim(),
    zone: String(source.ZONE || '').trim(),
    brandSubtitle: String(source.BRAND_SUBTITLE || source.PLAZA || 'Plaza Oaxaca').trim(),
    plazaAliases: Array.isArray(source.PLAZA_ALIASES) ? source.PLAZA_ALIASES.map(String).filter(Boolean) : []
  });
}

function getScopeLabel() {
  const scope = getActiveDataScope();
  return scope.zone || scope.plaza || scope.region || getDataContext().plaza;
}

function getScopeCatalog() {
  const regions = Array.isArray(SHEETS_CONFIG.SCOPE_MODEL?.REGIONS) ? SHEETS_CONFIG.SCOPE_MODEL.REGIONS : [];
  return regions.map((region) => ({
    id: String(region.ID || '').trim(),
    name: String(region.NAME || '').trim(),
    plazas: (Array.isArray(region.PLAZAS) ? region.PLAZAS : []).map((plaza) => ({
      id: String(plaza.ID || '').trim(),
      name: String(plaza.NAME || '').trim(),
      shortName: String(plaza.SHORT_NAME || plaza.NAME || '').trim(),
      aliases: Array.isArray(plaza.ALIASES) ? plaza.ALIASES.map(String).filter(Boolean) : []
    }))
  })).filter((region) => region.name);
}

// Se llama millones de veces por carga: scopeRowValue() la invoca por cada
// columna de cada fila contra cada alias, y las hojas publican decenas de
// columnas (Dashboard_1 trae 44). Como siempre son los mismos nombres de
// columna y de plaza, el resultado se memoiza: en el perfil de CPU de
// Dashboard 1 esta funcion sola costaba 2.3 s de los 8.3 s de trabajo.
// El dominio es chico (nombres de columna, plazas, regiones); aun asi se
// pone un tope para que ningun dato raro haga crecer el mapa sin limite.
const SCOPE_TOKEN_CACHE = new Map();
const SCOPE_TOKEN_CACHE_MAX = 5000;
function normalizeScopeToken(value) {
  const raw = String(value || '');
  const hit = SCOPE_TOKEN_CACHE.get(raw);
  if (hit !== undefined) return hit;
  const token = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (SCOPE_TOKEN_CACHE.size >= SCOPE_TOKEN_CACHE_MAX) SCOPE_TOKEN_CACHE.clear();
  SCOPE_TOKEN_CACHE.set(raw, token);
  return token;
}

function normalizeDataScope(scope = {}) {
  const context = getDataContext();
  const catalog = getScopeCatalog();
  const requestedRegion = String(scope.region || context.region).trim();
  const region = catalog.find((item) => normalizeScopeToken(item.name) === normalizeScopeToken(requestedRegion)) || catalog[0];
  const level = ['region', 'plaza', 'zona'].includes(String(scope.level || '').toLowerCase())
    ? String(scope.level).toLowerCase()
    : String((SHEETS_CONFIG.SCOPE_MODEL || {}).DEFAULT_LEVEL || 'plaza').toLowerCase();
  const requestedPlaza = String(scope.plaza || context.plaza).trim();
  const plazaEntry = region?.plazas.find((item) => [item.name, item.shortName, ...item.aliases].some((candidate) => {
    const actual = normalizeScopeToken(requestedPlaza);
    const expected = normalizeScopeToken(candidate);
    return actual && expected && (actual === expected || actual.includes(expected) || expected.includes(actual));
  }));
  return Object.freeze({
    level,
    region: region?.name || requestedRegion,
    plaza: level === 'region' ? '' : (plazaEntry?.name || requestedPlaza),
    zone: level === 'zona' ? String(scope.zone || context.zone).trim() : ''
  });
}

// Algunas fuentes siguen siendo exclusivas de una plaza. La pantalla puede
// declararlo en <html> para ignorar tanto el alcance guardado como parametros
// regionales heredados desde el portal.
function getPageFixedDataScope() {
  const data = document.documentElement?.dataset || {};
  if (!String(data.oxxoFixedScope || '').trim()) return null;
  return normalizeDataScope({
    level: data.oxxoFixedScope,
    region: data.oxxoFixedRegion || getDataContext().region,
    plaza: data.oxxoFixedPlaza || getDataContext().plaza,
    zone: data.oxxoFixedZone || ''
  });
}

function getActiveDataScope() {
  const fixed = getPageFixedDataScope();
  if (fixed) return fixed;
  const model = SHEETS_CONFIG.SCOPE_MODEL || {};
  let saved = {};
  try { saved = JSON.parse(sessionStorage.getItem(model.STORAGE_KEY || 'oxxo_active_data_scope') || '{}') || {}; } catch (_) {}
  try {
    const query = new URLSearchParams(location.search || '');
    const level = query.get(model.QUERY_PARAM || 'scope');
    const region = query.get('region');
    const plaza = query.get('plaza');
    const zone = query.get('zona');
    if (level || region || plaza || zone) saved = { ...saved, level: level || saved.level, region: region || saved.region, plaza: plaza || saved.plaza, zone: zone || saved.zone };
  } catch (_) {}
  return normalizeDataScope(saved);
}

function setActiveDataScope(scope, { updateUrl = true } = {}) {
  const fixed = getPageFixedDataScope();
  if (fixed) return fixed;
  const normalized = normalizeDataScope(scope);
  const model = SHEETS_CONFIG.SCOPE_MODEL || {};
  try { sessionStorage.setItem(model.STORAGE_KEY || 'oxxo_active_data_scope', JSON.stringify(normalized)); } catch (_) {}
  if (updateUrl) {
    try {
      const url = new URL(location.href);
      url.searchParams.set(model.QUERY_PARAM || 'scope', normalized.level);
      normalized.region ? url.searchParams.set('region', normalized.region) : url.searchParams.delete('region');
      normalized.plaza ? url.searchParams.set('plaza', normalized.plaza) : url.searchParams.delete('plaza');
      normalized.zone ? url.searchParams.set('zona', normalized.zone) : url.searchParams.delete('zona');
      history.replaceState(history.state, '', url);
    } catch (_) {}
  }
  document.dispatchEvent(new CustomEvent('oxxo:scope-change', { detail: normalized }));
  return normalized;
}

const SCOPE_ROW_ALIASES = {
  region: ['Region', 'REGION', 'Región', 'REGION OPERATIVA'],
  plaza: ['Plaza', 'PLAZA', 'Plazas', 'CR Plaza'],
  zone: ['Zona', 'ZONA', 'Zone']
};

function scopeRowValue(row, dimension) {
  const aliases = SCOPE_ROW_ALIASES[dimension] || [];
  const key = Object.keys(row || {}).find((candidate) => aliases.some((alias) => normalizeScopeToken(candidate) === normalizeScopeToken(alias)));
  return key ? String(row[key] || '').trim() : '';
}

function matchesScopeValue(value, dimension = 'plaza', scope = getActiveDataScope()) {
  const actual = normalizeScopeToken(value);
  if (!actual) return true;
  const expected = dimension === 'region' ? scope.region : dimension === 'zone' ? scope.zone : scope.plaza;
  const regionalPlazaScope = dimension === 'plaza' && scope.level === 'region';
  if (!expected && !regionalPlazaScope) return true;
  const candidates = expected ? [expected] : [];
  if (regionalPlazaScope) {
    getScopeCatalog().filter((region) => normalizeScopeToken(region.name) === normalizeScopeToken(scope.region)).forEach((region) => {
      region.plazas.forEach((plaza) => candidates.push(plaza.name, plaza.shortName, ...plaza.aliases));
    });
  }
  if (dimension === 'region') {
    getScopeCatalog().filter((region) => normalizeScopeToken(region.name) === normalizeScopeToken(expected)).forEach((region) => {
      region.plazas.forEach((plaza) => candidates.push(plaza.name, plaza.shortName, ...plaza.aliases));
    });
  }
  if (dimension === 'plaza') {
    getScopeCatalog().flatMap((region) => region.plazas).forEach((plaza) => {
      if (normalizeScopeToken(plaza.name) === normalizeScopeToken(expected)) candidates.push(plaza.shortName, ...plaza.aliases);
    });
  }
  if (dimension === 'plaza' && normalizeScopeToken(expected) === normalizeScopeToken(getDataContext().plaza)) candidates.push(...getDataContext().plazaAliases);
  return candidates.some((candidate) => {
    const token = normalizeScopeToken(candidate);
    return token && (actual === token || actual.includes(token) || token.includes(actual));
  });
}

// A diferencia de matchesScopeValue (que compara contra la plaza ACTIVA),
// esto acepta cualquier plaza reconocida en el catalogo, sin importar cual
// este activa. Lo usa el panel admin para validar cargas: una base
// consolidada con varias plazas no debe filtrarse a "solo la plaza que
// estaba seleccionada arriba" -- el reemplazo real en Google Sheets ya
// separa cada plaza por su propio valor (ver replaceScope en
// apps-script/admin-upload.gs), asi que aqui solo se descartan filas cuya
// Plaza no es ninguna de las conocidas (fila vacia o basura).
function matchesAnyKnownPlaza(value) {
  const actual = normalizeScopeToken(value);
  if (!actual) return true;
  const candidates = [getDataContext().plaza, ...getDataContext().plazaAliases];
  getScopeCatalog().forEach((region) => {
    candidates.push(region.name);
    region.plazas.forEach((plaza) => candidates.push(plaza.name, plaza.shortName, ...plaza.aliases));
  });
  return candidates.some((candidate) => {
    const token = normalizeScopeToken(candidate);
    return token && (actual === token || actual.includes(token) || token.includes(actual));
  });
}

function rowMatchesDataScope(row, scope = getActiveDataScope(), { legacyPlaza = '' } = {}) {
  if (!row || typeof row !== 'object') return false;
  const region = scopeRowValue(row, 'region');
  const plaza = scopeRowValue(row, 'plaza') || String(legacyPlaza || '').trim();
  const zone = scopeRowValue(row, 'zone');
  if (region && !matchesScopeValue(region, 'region', scope)) return false;
  if (plaza && !matchesScopeValue(plaza, 'plaza', scope)) return false;
  if (scope.level === 'zona' && zone && !matchesScopeValue(zone, 'zone', scope)) return false;
  return true;
}

function filterRowsByDataScope(rows, scope = getActiveDataScope(), options = {}) {
  return Array.isArray(rows) ? rows.filter((row) => rowMatchesDataScope(row, scope, options)) : rows;
}

const DATA_CONTEXT_COLUMNS = {
  Region: 'region',
  REGION: 'region',
  Plaza: 'plaza',
  PLAZA: 'plaza',
  Zona: 'zone',
  ZONA: 'zone'
};
const STORE_CR_COLUMNS = ['CR', 'CR TIENDA', 'CR Tienda', 'Cr de Tienda', 'Cr de tienda', 'ID Tienda'];

// Completa solo las columnas que el destino ya declara. Esto mantiene
// compatibles las hojas actuales y evita agregar encabezados inesperados a
// dashboards antiguos. El CR siempre se normaliza como la llave estable.
function applyDataContextDefaults(row, { columns = [] } = {}) {
  const copy = { ...(row || {}) };
  const context = getDataContext();
  const scope = getActiveDataScope();
  const scopedContext = {
    ...context,
    region: scope.region || context.region,
    plaza: scope.level === 'region' ? '' : (scope.plaza || context.plaza),
    zone: scope.zone || context.zone
  };
  const allowed = new Set((columns || []).map(String));
  Object.entries(DATA_CONTEXT_COLUMNS).forEach(([column, contextKey]) => {
    if (!allowed.has(column) && !Object.prototype.hasOwnProperty.call(copy, column)) return;
    if (String(copy[column] ?? '').trim() === '') copy[column] = scopedContext[contextKey];
  });
  STORE_CR_COLUMNS.forEach((column) => {
    if (!allowed.has(column) && !Object.prototype.hasOwnProperty.call(copy, column)) return;
    if (String(copy[column] ?? '').trim() !== '') copy[column] = normalizeCatalogCr(copy[column]);
  });
  return copy;
}

// ─────────────────────────────────────────────────────────────
// FUNCIÓN BASE: Construir URL de descarga CSV
// Google Sheets publica cada pestaña como CSV accesible
// ─────────────────────────────────────────────────────────────
function activeScopeQuery(tabName, options = {}) {
  // Una consulta explicita manda sobre el filtro de plaza: quien la arma ya
  // decidio exactamente que filas necesita (por ejemplo una agregacion
  // server-side con group by, para no bajar la hoja entera). Viaja en el mismo
  // parametro tq, asi que entra tal cual a la llave de cache y nunca se
  // confunde con la lectura normal de la misma pestana.
  const customQuery = typeof options.query === 'string' ? options.query.trim() : '';
  if (customQuery) return customQuery;
  if (options.scoped === false) return '';
  const column = String(SHEETS_CONFIG.SCOPED_GVIZ_COLUMNS?.[tabName] || '').trim().toUpperCase();
  if (!/^[A-Z]+$/.test(column)) return '';
  const scope = options.scope ? normalizeDataScope(options.scope) : getActiveDataScope();
  if (!scope.plaza || scope.level === 'region') return '';
  const plazaToken = normalizeScopeToken(scope.plaza).replace(/^plaza\s+/, '').trim();
  if (!plazaToken) return '';
  // lower() evita depender de cómo venga capitalizada la Plaza en cada Excel.
  // La comilla se duplica según la sintaxis del Google Visualization Query.
  return `select * where lower(${column}) contains '${plazaToken.replace(/'/g, "''")}'`;
}

function buildSheetURL(tabName, options = {}) {
  const url = new URL(`https://docs.google.com/spreadsheets/d/${SHEETS_CONFIG.SPREADSHEET_ID}/gviz/tq`);
  url.searchParams.set('tqx', 'out:csv');
  url.searchParams.set('sheet', tabName);
  const query = activeScopeQuery(tabName, options);
  if (query) {
    // Las bases publicadas usan una fila buffer y después los encabezados
    // reales. Al filtrar sin declarar ambas filas, GViz interpreta la primera
    // tienda resultante como encabezado y el dashboard pierde un registro.
    url.searchParams.set('headers', '2');
    url.searchParams.set('tq', query);
  }
  return url.toString();
}

function sheetRequestCacheKey(tabName, options = {}) {
  const query = activeScopeQuery(tabName, options);
  return query ? `${tabName}|${query}` : String(tabName || '');
}

// Una solicitud bloqueada por el navegador (protección anti-rastreo, proxy o
// una red corporativa inestable) no debe dejar el dashboard mostrando el
// spinner para siempre. Cada fuente conserva sus respaldos normales; este
// límite únicamente permite llegar a ellos de forma determinista.
async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs) || 15000));
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Ruta base del sitio, derivada del <script> que carga este mismo core.js
// (dashboards lo incluyen como "../js/core.js" y admin.html como "js/core.js").
// Sirve para resolver assets locales sin importar la profundidad de la pagina.
function siteBasePath() {
  try {
    const scripts = document.getElementsByTagName('script');
    for (const s of scripts) {
      const src = s.getAttribute('src') || '';
      if (/(^|\/)js\/core\.js(\?|$)/.test(src)) {
        return src.replace(/js\/core\.js.*$/, '');
      }
    }
  } catch (e) {}
  return '';
}

// ─────────────────────────────────────────────────────────────
// FUNCIÓN: Obtener y parsear datos de una pestaña de Sheets
// Retorna un array de objetos con las columnas como claves
// ─────────────────────────────────────────────────────────────
const SHEET_CACHE_TTL_MS = 2 * 60 * 1000;
const SHEET_STALE_LIMIT_MS = 10 * 60 * 1000;
const SHEET_PERSISTENT_CACHE = 'oxxo-sheet-data-v1';
const sheetDataCache = new Map();
const sheetDataInflight = new Map();
const sheetDataStatus = new Map();
const sheetConnectionIssues = new Map();
let dashboardRetryHandler = null;
const SHARED_PERIOD_KEY = 'oxxo_rh_dashboard_period';

// Conserva el periodo elegido al recargar o cambiar entre dashboards de RH.
// sessionStorage evita que una seleccion antigua quede como predeterminada en
// una sesion futura cuando Google Sheets ya tenga un mes mas reciente.
function restoreDashboardPeriod(availablePeriods, defaultPeriod = '') {
  const available = new Set((availablePeriods || []).map(String));
  let saved = '';
  try {
    const queryValue = new URLSearchParams(location.search).get('periodo');
    saved = queryValue !== null ? queryValue : (sessionStorage.getItem(SHARED_PERIOD_KEY) || '');
  } catch (_) {}
  if (saved === 'todos') return '';
  return available.has(saved) ? saved : String(defaultPeriod || '');
}

function persistDashboardPeriod(period) {
  const value = String(period || 'todos');
  try { sessionStorage.setItem(SHARED_PERIOD_KEY, value); } catch (_) {}
  try {
    const url = new URL(location.href);
    url.searchParams.set('periodo', value);
    history.replaceState(history.state, '', url);
  } catch (_) {}
}

function cloneSheetRows(rows) {
  if (!Array.isArray(rows)) return rows;
  return rows.map((row) => ({ ...row }));
}

// Conserva las respuestas entre navegaciones. Antes, cada dashboard empezaba
// con un Map vacio y volvia a descargar Google Sheets y el catalogo aunque el
// usuario acabara de consultarlos en otra pantalla. Cache Storage admite bases
// grandes y no compite con el pequeno limite de localStorage/sessionStorage.
function persistentCacheRequest(cacheKey) {
  if (!('caches' in window) || !window.location?.origin || window.location.origin === 'null') return null;
  const book = encodeURIComponent(SHEETS_CONFIG.SPREADSHEET_ID || 'default');
  const key = encodeURIComponent(String(cacheKey || ''));
  return new Request(`${window.location.origin}/__oxxo_cache__/${book}/${key}`);
}
async function readPersistentRows(cacheKey) {
  const request = persistentCacheRequest(cacheKey);
  if (!request) return null;
  try {
    const cache = await caches.open(SHEET_PERSISTENT_CACHE);
    const response = await cache.match(request);
    if (!response) return null;
    const payload = await response.json();
    if (!Array.isArray(payload?.rows) || !Number.isFinite(payload?.savedAt)) return null;
    return payload;
  } catch (error) {
    console.warn('[OXXO] No se pudo leer la cache local:', error);
    return null;
  }
}
// Guardar la base en Cache Storage exige serializarla completa, y JSON.stringify
// es sincrono: en el perfil de CPU de Dashboard 1 esa serializacion bloqueaba
// el hilo principal 1.5 s mientras el usuario esperaba ver sus datos. La cache
// solo sirve para la NAVEGACION SIGUIENTE, nunca para la pantalla actual, asi
// que se escribe cuando el navegador esta desocupado. Si la persona se va antes
// de que haya un hueco, simplemente no se guarda: la siguiente vista vuelve a
// leer de la red, que es exactamente lo que pasaba sin cache.
function cuandoEsteDesocupado(tarea) {
  if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(tarea, { timeout: 4000 });
  else setTimeout(tarea, 0);
}
async function writePersistentRows(cacheKey, rows, savedAt = Date.now()) {
  const request = persistentCacheRequest(cacheKey);
  if (!request || !Array.isArray(rows)) return;
  cuandoEsteDesocupado(async () => {
    try {
      const cache = await caches.open(SHEET_PERSISTENT_CACHE);
      await cache.put(request, new Response(JSON.stringify({ rows, savedAt }), {
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      }));
    } catch (error) {
      // La cache es una optimizacion: una cuota llena nunca debe impedir cargar.
      console.warn('[OXXO] No se pudo guardar la cache local:', error);
    }
  });
}
async function deletePersistentRows(cacheKey) {
  if (!('caches' in window)) return;
  try {
    if (!cacheKey) {
      await caches.delete(SHEET_PERSISTENT_CACHE);
      return;
    }
    const cache = await caches.open(SHEET_PERSISTENT_CACHE);
    const request = persistentCacheRequest(cacheKey);
    if (request) await cache.delete(request);
  } catch (error) {
    console.warn('[OXXO] No se pudo limpiar la cache local:', error);
  }
}
function clearSheetDataCache(tabName) {
  if (tabName) {
    const key = String(tabName);
    [...sheetDataCache.keys()].filter((cacheKey) => cacheKey === key || cacheKey.startsWith(`${key}|`))
      .forEach((cacheKey) => sheetDataCache.delete(cacheKey));
    [...sheetDataInflight.keys()].filter((cacheKey) => cacheKey === key || cacheKey.startsWith(`${key}|`))
      .forEach((cacheKey) => sheetDataInflight.delete(cacheKey));
    // Cache Storage no expone búsqueda por prefijo de forma barata. Publicar
    // es poco frecuente, así que se invalida el libro local completo para que
    // ninguna vista conserve una variante regional anterior.
    void deletePersistentRows();
    if (key === SHEETS_CONFIG.CONFIG_SHEET) {
      systemConfigPromise = null;
    }
    if (key === (SHEETS_CONFIG.CATALOG_SHEET || 'Catalogo_Asesores')) {
      asesorCatalogPromise = null;
    }
    if (key === (SHEETS_CONFIG.STORE_CATALOG_SHEET || 'Catalogo_Tiendas') || key === SHEETS_CONFIG.TABS?.s7) {
      tiendaCatalogPromise = null;
      asesorCatalogPromise = null;
    }
  } else {
    sheetDataCache.clear();
    void deletePersistentRows();
    systemConfigPromise = null;
    asesorCatalogPromise = null;
    reasignacionesPromise = null;
  }
}
function setRetryHandler(handler) {
  dashboardRetryHandler = typeof handler === 'function' ? handler : null;
}
function getSheetDataStatus(tabName) {
  return sheetDataStatus.get(String(tabName || '')) || { status: 'unknown' };
}
function connectionAgeLabel(ageMs) {
  const minutes = Math.max(1, Math.round(Number(ageMs || 0) / 60000));
  return minutes === 1 ? '1 minuto' : `${minutes} minutos`;
}
function renderConnectionBanner() {
  if (!document.body) return;
  let banner = document.getElementById('oxxo-connection-banner');
  const issues = [...sheetConnectionIssues.values()];
  if (!issues.length) {
    banner?.remove();
    return;
  }
  const offline = issues.some((issue) => issue.status === 'offline');
  const stale = issues.find((issue) => issue.status === 'stale');
  if (!banner) {
    banner = document.createElement('aside');
    banner.id = 'oxxo-connection-banner';
    banner.className = 'connection-banner';
    banner.setAttribute('role', 'status');
    banner.setAttribute('aria-live', 'polite');
    document.body.appendChild(banner);
  }
  banner.className = `connection-banner ${offline ? 'is-offline' : 'is-stale'}`;
  banner.innerHTML = `<span class="connection-banner__icon" aria-hidden="true">${offline ? '!' : '↻'}</span><div><strong>${offline ? 'No pudimos conectar con Google Sheets' : 'Mostrando datos recientes guardados'}</strong><small>${offline ? 'La información no fue modificada. Revisa tu conexión e inténtalo nuevamente.' : `La última respuesta disponible tiene aproximadamente ${connectionAgeLabel(stale.ageMs)}.`}</small></div><button type="button" data-oxxo-retry>${offline ? 'Reintentar' : 'Actualizar ahora'}</button>`;
}
function updateConnectionStatus(tabName, status, detail = {}) {
  const key = String(tabName || '');
  sheetDataStatus.set(key, { status, ...detail, checkedAt: Date.now() });
  if (status === 'offline' || status === 'stale') sheetConnectionIssues.set(key, { tabName: key, status, ...detail });
  else sheetConnectionIssues.delete(key);
  renderConnectionBanner();
  document.dispatchEvent(new CustomEvent('oxxo:sheet-status', { detail: { tabName: key, status, ...detail } }));
}
async function retryDashboardData(button) {
  if (button) { button.disabled = true; button.textContent = 'Reintentando…'; }
  clearSheetDataCache();
  sheetConnectionIssues.clear();
  renderConnectionBanner();
  const inferred = dashboardRetryHandler || window.initDashboard || window.init;
  try {
    if (typeof inferred === 'function') await inferred();
    else location.reload();
  } catch (error) {
    console.error('[OXXO] El reintento no pudo completar la carga:', error);
    if (button) { button.disabled = false; button.textContent = 'Reintentar'; }
  }
}
document.addEventListener('click', (event) => {
  const button = event.target.closest?.('[data-oxxo-retry]');
  if (button) retryDashboardData(button);
});
async function fetchSheetData(tabName, options = {}) {
  const tabKey = String(tabName || '');
  const key = sheetRequestCacheKey(tabKey, options);
  const now = Date.now();
  let cached = sheetDataCache.get(key);
  const legacyTabs = SHEETS_CONFIG.SCOPE_MODEL?.LEGACY_DEFAULT_PLAZA_TABS || [];
  const legacyPlaza = legacyTabs.includes(tabKey) ? getDataContext().plaza : '';
  const prepareRows = (rows) => options.scoped === false
    ? cloneSheetRows(rows)
    : filterRowsByDataScope(cloneSheetRows(rows), getActiveDataScope(), { legacyPlaza });
  if (!options.fresh && cached && now - cached.savedAt < SHEET_CACHE_TTL_MS) return prepareRows(cached.rows);
  if (!options.fresh && !cached) {
    const persistent = await readPersistentRows(`sheet:${key}`);
    if (persistent) {
      cached = persistent;
      sheetDataCache.set(key, persistent);
      if (now - persistent.savedAt < SHEET_CACHE_TTL_MS) {
        updateConnectionStatus(tabKey, 'online', { source: 'cache' });
        return prepareRows(persistent.rows);
      }
    }
  }
  let request = sheetDataInflight.get(key);
  if (!request) {
    const url = buildSheetURL(tabName, options);
    request = (async () => {
      let lastError = null;
      try {
        for (let attempt = 0; attempt < 2; attempt += 1) {
          try {
            // Permite validacion HTTP del navegador; la vigencia funcional se
            // sigue controlando con savedAt y las constantes de arriba.
            const response = await fetchWithTimeout(url, { cache: 'default' }, attempt === 0 ? 12000 : 18000);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const rows = parseCSV(await response.text());
            const entry = { rows, savedAt: Date.now() };
            sheetDataCache.set(key, entry);
            void writePersistentRows(`sheet:${key}`, rows, entry.savedAt);
            return rows;
          } catch (error) {
            lastError = error;
            if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 650));
          }
        }
        console.error(`Error cargando pestaña "${tabName}":`, lastError);
        return null;
      } finally {
        sheetDataInflight.delete(key);
      }
    })();
    sheetDataInflight.set(key, request);
  }
  const rows = await request;
  if (rows) {
    updateConnectionStatus(tabKey, 'online');
    return prepareRows(rows);
  }
  if (options.allowStale !== false && cached && now - cached.savedAt < SHEET_STALE_LIMIT_MS) {
    updateConnectionStatus(tabKey, 'stale', { ageMs: now - cached.savedAt });
    return prepareRows(cached.rows);
  }
  updateConnectionStatus(tabKey, 'offline');
  return null;
}

// ─────────────────────────────────────────────────────────────
// FUNCIÓN: Parser CSV robusto
// Maneja comas dentro de comillas y caracteres especiales
// ─────────────────────────────────────────────────────────────

function downloadBlob(content, filename, mimeType = 'text/csv;charset=utf-8') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 800);
}

function timestampForFile() {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  return now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate()) + '-' + pad(now.getHours()) + pad(now.getMinutes());
}

function safeFileName(value) {
  return String(value || 'dashboard')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'dashboard';
}

async function downloadSheetTab(tabName, filename) {
  const name = filename || (safeFileName(tabName) + '-' + timestampForFile() + '.csv');
  const response = await fetch(buildSheetURL(tabName), { cache: 'no-store' });
  if (!response.ok) throw new Error('HTTP ' + response.status);
  const csv = await response.text();
  downloadBlob(csv, name.endsWith('.csv') ? name : name + '.csv');
}

function escapeCSVValue(value) {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

function rowsToCSV(rows, columns) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const headers = columns && columns.length ? columns : Array.from(safeRows.reduce((set, row) => {
    Object.keys(row || {}).forEach(key => set.add(key));
    return set;
  }, new Set()));
  const lines = [headers.map(escapeCSVValue).join(',')];
  safeRows.forEach(row => {
    lines.push(headers.map(header => escapeCSVValue(row?.[header])).join(','));
  });
  return '\uFEFF' + lines.join('\n');
}

function downloadRowsAsCSV(rows, filename, columns) {
  downloadBlob(rowsToCSV(rows, columns), filename || ('datos-' + timestampForFile() + '.csv'));
}

async function handleDownloadButton(button, task) {
  if (!button || typeof task !== 'function') return;
  const original = button.textContent;
  button.disabled = true;
  button.textContent = 'Descargando...';
  try {
    await task();
    button.textContent = 'Descargado';
    setTimeout(() => { button.textContent = original; button.disabled = false; }, 1100);
  } catch (error) {
    console.error('[OXXO] Error descargando base:', error);
    button.textContent = 'Error al descargar';
    setTimeout(() => { button.textContent = original; button.disabled = false; }, 1800);
  }
}

const XLSX_CDN = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
let xlsxPromise = null;

function loadXLSXLib() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (!xlsxPromise) {
    xlsxPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = XLSX_CDN;
      script.async = true;
      script.onload = () => window.XLSX ? resolve(window.XLSX) : reject(new Error('XLSX no disponible'));
      script.onerror = () => reject(new Error('No se pudo cargar XLSX'));
      document.head.appendChild(script);
    });
  }
  return xlsxPromise;
}

// Nombres de hoja de Excel: maximo 31 caracteres, sin : \ / ? * [ ]
function safeSheetName(name, used) {
  let base = String(name || 'Hoja').replace(/[:\\/?*[\]]/g, ' ').trim().slice(0, 31) || 'Hoja';
  let candidate = base, n = 2;
  while (used.has(candidate.toLowerCase())) {
    const suffix = ' (' + n++ + ')';
    candidate = base.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

// sheets: [{ name, rows: [{...}] }, ...]. Cada entrada se vuelve una hoja del Excel
// con json_to_sheet (encabezados = llaves del primer objeto de cada fila).
async function downloadDashboardExcel(sheets, filename) {
  const XLSX = await loadXLSXLib();
  const wb = XLSX.utils.book_new();
  const used = new Set();
  (sheets || []).forEach(sheet => {
    const rows = Array.isArray(sheet?.rows) ? sheet.rows : [];
    const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ 'Sin datos': '' }]);
    XLSX.utils.book_append_sheet(wb, ws, safeSheetName(sheet?.name, used));
  });
  XLSX.writeFile(wb, filename || ('dashboard-' + timestampForFile() + '.xlsx'));
}

// Convierte las tarjetas KPI ya renderizadas (.kpi-card dentro de containerId) en filas
// {Indicador, Valor} para una hoja de Excel, sin duplicar los calculos de cada dashboard.
function scrapeKpiCards(containerId) {
  const root = document.getElementById(containerId);
  if (!root) return [];
  return [...root.querySelectorAll('.kpi-card')].map(card => ({
    Indicador: card.querySelector('.kpi-card__label')?.childNodes[0]?.textContent.trim()
      || card.querySelector('.kpi-card__label')?.textContent.trim() || '',
    Valor: card.querySelector('.kpi-card__value')?.textContent.trim() || ''
  })).filter(r => r.Indicador);
}

// Convierte una tabla HTML ya renderizada (thead th = encabezados, tbody tr/td = filas)
// en un arreglo de objetos para una hoja de Excel.
function scrapeHtmlTable(selector) {
  const table = document.querySelector(selector);
  if (!table) return [];
  const headers = [...table.querySelectorAll('thead th')].map((th, i) => th.textContent.trim().replace(/\s+/g, ' ') || ('Columna ' + (i + 1)));
  if (!headers.length) return [];
  return [...table.querySelectorAll('tbody tr')].map(tr => {
    const row = {};
    [...tr.children].forEach((td, i) => { if (headers[i]) row[headers[i]] = td.textContent.trim().replace(/\s+/g, ' '); });
    return row;
  }).filter(row => Object.values(row).some(v => v !== ''));
}

function initExcelExportControls() {
  if (!/\/dashboards\//i.test(location.pathname.replace(/\\/g, '/'))) return;
  if (typeof window.buildExcelSheets !== 'function') return; // dashboard no define exportacion Excel
  if (document.querySelector('.excel-export-trigger')) return;
  const meta = document.querySelector('.topbar__meta') || document.querySelector('.topbar');
  if (!meta) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'topbar__back excel-export-trigger png-export-ui';
  button.textContent = 'Excel';
  button.title = 'Descargar el dashboard completo en Excel (una hoja por tabla)';
  button.addEventListener('click', async () => {
    const original = button.textContent;
    button.disabled = true; button.textContent = 'Generando...';
    try {
      const sheets = await window.buildExcelSheets();
      if (!sheets || !sheets.length) throw new Error('Sin datos para exportar');
      await downloadDashboardExcel(sheets, safeFileName(getDashboardSlug()) + '-' + timestampForFile() + '.xlsx');
      button.textContent = 'Descargado';
    } catch (error) {
      console.error('[OXXO] Error exportando Excel:', error);
      button.textContent = 'Error al exportar';
    } finally {
      setTimeout(() => { button.textContent = original; button.disabled = false; }, 1400);
    }
  });
  meta.appendChild(button);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initExcelExportControls);
} else {
  initExcelExportControls();
}

const HTML2CANVAS_CDN = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
let html2CanvasPromise = null;

function loadHtml2Canvas() {
  if (window.html2canvas) return Promise.resolve(window.html2canvas);
  if (!html2CanvasPromise) {
    html2CanvasPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = HTML2CANVAS_CDN;
      script.async = true;
      script.onload = () => window.html2canvas ? resolve(window.html2canvas) : reject(new Error('html2canvas no disponible'));
      script.onerror = () => reject(new Error('No se pudo cargar html2canvas'));
      document.head.appendChild(script);
    });
  }
  return html2CanvasPromise;
}

function getDashboardSlug() {
  const file = (location.pathname.split('/').pop() || 'dashboard').replace(/\.html?$/i, '');
  return safeFileName(file || document.title || 'dashboard');
}

function getTargetLabel(element, index) {
  if (!element) return 'vista';
  const titleEl = element.querySelector?.('.panel__title,.panel-title,.bajas-panel__title,.chart-title,.card-title,h2,h3,[data-png-title]');
  const text = (element.getAttribute?.('data-png-title') || titleEl?.textContent || '').replace(/\s+/g, ' ').trim();
  return text || (index === 0 ? 'vista completa' : `seccion ${index}`);
}

function findPngTargets() {
  const targets = [];
  const main = document.querySelector('main') || document.querySelector('.page') || document.body;
  if (main) targets.push({ label: 'Vista completa del dashboard', element: main });

  const selector = '[data-png-export], section.bajas-panel, article.bajas-panel, article.panel, section.panel, .chart-card, .table-panel, .detail-card, .card:not(.kpi-card)';
  const seen = new Set([main]);
  document.querySelectorAll(selector).forEach((element) => {
    if (!element || seen.has(element) || element.closest('.png-export-ui')) return;
    const rect = element.getBoundingClientRect();
    if (rect.width < 220 || rect.height < 120) return;
    seen.add(element);
    targets.push({ label: getTargetLabel(element, targets.length), element });
  });
  return targets.slice(0, 24);
}

// html2canvas no soporta backdrop-filter: cualquier elemento con blur de fondo (tooltips
// info-tip, overlays del hero, etc.) se pinta como una mancha gris solida en la captura.
// Workaround: apagar el backdrop-filter en todo el arbol justo antes de capturar y
// restaurarlo despues (no afecta lo que ve el usuario, solo el momento de la captura).
function disableBackdropFilters(root) {
  const all = [root, ...root.querySelectorAll('*')];
  const restores = [];
  all.forEach((el) => {
    const cs = window.getComputedStyle(el);
    if ((cs.backdropFilter && cs.backdropFilter !== 'none') || (cs.webkitBackdropFilter && cs.webkitBackdropFilter !== 'none')) {
      restores.push({ el, backdropFilter: el.style.backdropFilter, webkitBackdropFilter: el.style.webkitBackdropFilter });
      el.style.setProperty('backdrop-filter', 'none', 'important');
      el.style.setProperty('-webkit-backdrop-filter', 'none', 'important');
    }
  });
  return () => restores.forEach(({ el, backdropFilter, webkitBackdropFilter }) => {
    el.style.backdropFilter = backdropFilter;
    el.style.webkitBackdropFilter = webkitBackdropFilter;
  });
}

// html2canvas clona el DOM para capturarlo; con canvases de Chart.js (gradientes, escala de
// pixel propia) esa clonacion puede colgarse o salir en blanco. Workaround: sustituir cada
// <canvas> por una <img> de su bitmap actual justo antes de capturar, y restaurar despues.
function swapCanvasesForImages(root) {
  const canvases = Array.from(root.querySelectorAll('canvas'));
  const swaps = canvases.map((canvas) => {
    const img = document.createElement('img');
    img.src = canvas.toDataURL('image/png');
    img.width = canvas.clientWidth || canvas.width;
    img.height = canvas.clientHeight || canvas.height;
    img.style.cssText = canvas.style.cssText;
    img.className = canvas.className;
    canvas.parentNode.insertBefore(img, canvas);
    canvas.style.display = 'none';
    return { canvas, img };
  });
  return () => swaps.forEach(({ canvas, img }) => {
    img.remove();
    canvas.style.display = '';
  });
}

async function downloadElementAsPNG(element, label = 'captura') {
  if (!element) throw new Error('No se encontro la seccion para capturar');
  const html2canvas = await loadHtml2Canvas();
  document.body.classList.add('png-exporting');
  element.classList.add('png-export-target');
  const restoreCanvases = swapCanvasesForImages(element);
  const restoreBackdrops = disableBackdropFilters(element);
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  try {
    const canvas = await html2canvas(element, {
      backgroundColor: '#fff8ef',
      scale: Math.min(2, Math.max(1.35, window.devicePixelRatio || 1.5)),
      useCORS: true,
      allowTaint: false,
      logging: false,
      ignoreElements: node => node?.classList?.contains('png-export-ui') || Boolean(node?.closest?.('.png-export-ui'))
    });
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png', 0.98));
    if (!blob) throw new Error('No se pudo generar el PNG');
    const filename = `${getDashboardSlug()}-${safeFileName(label)}-${timestampForFile()}.png`;
    downloadBlob(blob, filename, 'image/png');
  } finally {
    restoreCanvases();
    restoreBackdrops();
    element.classList.remove('png-export-target');
    document.body.classList.remove('png-exporting');
  }
}

function closePngExportModal() {
  document.querySelector('.png-export-modal')?.remove();
}

function openPngExportModal() {
  closePngExportModal();
  const targets = findPngTargets();
  const modal = document.createElement('div');
  modal.className = 'png-export-modal png-export-ui';
  modal.innerHTML = `<div class="png-export-backdrop" data-close="1"></div><div class="png-export-dialog" role="dialog" aria-modal="true" aria-label="Exportar PNG"><div class="png-export-head"><div><strong>Exportar PNG</strong><span>Elige la seccion que quieres descargar.</span></div><button type="button" class="png-export-close" data-close="1">x</button></div><div class="png-export-list"></div></div>`;
  const list = modal.querySelector('.png-export-list');
  targets.forEach((target, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'png-export-option';
    button.textContent = target.label;
    button.addEventListener('click', async () => {
      const original = button.textContent;
      button.disabled = true;
      button.textContent = 'Generando PNG...';
      try {
        await downloadElementAsPNG(target.element, target.label);
        closePngExportModal();
      } catch (error) {
        console.error('[OXXO] Error exportando PNG:', error);
        button.textContent = 'No se pudo exportar';
        setTimeout(() => { button.textContent = original; button.disabled = false; }, 1600);
      }
    });
    list.appendChild(button);
  });
  modal.addEventListener('click', event => { if (event.target.dataset.close) closePngExportModal(); });
  document.addEventListener('keydown', function esc(event) { if (event.key === 'Escape') { closePngExportModal(); document.removeEventListener('keydown', esc); } });
  document.body.appendChild(modal);
}

function initPngExportControls() {
  if (!/\/dashboards\//i.test(location.pathname.replace(/\\/g, '/'))) return;
  if (document.querySelector('.png-export-trigger')) return;
  const meta = document.querySelector('.topbar__meta') || document.querySelector('.topbar');
  if (!meta) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'topbar__back png-export-trigger png-export-ui';
  button.textContent = 'PNG';
  button.title = 'Exportar una seccion del dashboard como PNG';
  button.addEventListener('click', openPngExportModal);
  meta.appendChild(button);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPngExportControls);
} else {
  setTimeout(initPngExportControls, 0);
}
function parseCSV(text) {
  const lines = parseCSVRecords(text.trim());
  if (lines.length < 2) return [];

  // Buscar la fila de encabezados: es la primera fila que tenga
  // al menos 3 columnas con contenido (salta títulos, instrucciones, y la fila
  // "sacrificio" que el Apps Script deja como fila 1 para absorber la corrupción de Google).
  // Si ninguna fila llega a 3 columnas (hojas angostas, ej. solo 2 columnas), se usa como
  // respaldo la primera fila no vacía y no-sacrificio que se encontró.
  let headerIndex = -1;
  let fallbackIndex = -1;
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const cols = splitCSVRow(lines[i]).map(c => c.trim().replace(/^"|"$/g, ''));
    if (cols.length && cols.every(c => c === '_buffer_' || c === '')) continue;
    const nonEmpty = cols.filter(c => c.length > 0 && c.length < 60);
    if (fallbackIndex === -1 && nonEmpty.length > 0) fallbackIndex = i;
    if (nonEmpty.length >= 3) {
      headerIndex = i;
      break;
    }
  }
  if (headerIndex === -1) headerIndex = fallbackIndex === -1 ? 0 : fallbackIndex;

  // Corrupcion de encabezado (variante 2): en vez de una fila 1 "sacrificio" separada
  // (puro "_buffer_"), a veces Google pega el prefijo "_buffer_ " directo al nombre real
  // de cada columna de la fila de encabezados (ej. "_buffer_ Motivo" en vez de "Motivo").
  // Sin este strip, cualquier busqueda de columna por nombre real nunca encuentra esa
  // columna y el dashboard cae siempre a su valor de respaldo.
  const headers = makeUniqueHeaders(splitCSVRow(lines[headerIndex]).map(h => h.trim().replace(/^"|"$/g, '').replace(/^_buffer_\s*/i, '')));

  const rows = [];
  for (let i = headerIndex + 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue; // saltar filas vacías
    const values = splitCSVRow(lines[i]);
    const row = {};
    headers.forEach((h, idx) => {
      let val = (values[idx] || "").trim().replace(/^"|"$/g, '');
      row[h] = fixMojibake(val);
    });
    rows.push(row);
  }
  return rows;
}

function makeUniqueHeaders(headers) {
  const seen = {};
  return headers.map((header, idx) => {
    const base = header || `col_${idx + 1}`;
    seen[base] = (seen[base] || 0) + 1;
    return seen[base] === 1 ? base : `${base}_${seen[base]}`;
  });
}

function parseCSVRecords(text) {
  const records = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"' && next === '"') {
      current += '""';
      i++;
    } else if (ch === '"') {
      inQuotes = !inQuotes;
      current += ch;
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && next === '\n') i++;
      if (current.trim()) records.push(current);
      current = '';
    } else {
      current += ch;
    }
  }

  if (current.trim()) records.push(current);
  return records;
}

// Divide una fila CSV respetando comillas
function splitCSVRow(row) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (ch === '"' && row[i + 1] === '"') { current += '"'; i++; }
    else if (ch === '"') { inQuotes = !inQuotes; }
    else if (ch === ',' && !inQuotes) { result.push(current); current = ''; }
    else { current += ch; }
  }
  result.push(current);
  return result;
}

// ─────────────────────────────────────────────────────────────
// FUNCIÓN: Cargar configuración desde pestaña "Configuracion"
// Estructura esperada de la pestaña:
//   Columna A: dashboard_id (d1, d2, d3, s4, s5, s6)
//   Columna B: nombre
//   Columna C: frecuencia
//   Columna D: ultima_actualizacion
//   Columna E: responsable
//   Columna F: activo (SI/NO)
// ─────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────
// FUNCIÓN: Normalizar cualquier formato de fecha a texto legible
// ─────────────────────────────────────────────────────────────
function normalizarFecha(val) {
  if (!val || !val.trim()) return val;
  const v = val.trim();

  // Serial numérico de Excel/Sheets (ej. 46179). timeZone:'UTC' evita que
  // toLocaleDateString() lo formatee con la hora local del navegador -- sin
  // esto, en husos horarios negativos (ej. Mexico, UTC-6) medianoche UTC cae
  // la tarde del dia anterior y la fecha mostrada se corre un dia hacia
  // atras (mismo bug de fondo que metricsParseFecha en este archivo).
  if (/^\d{4,5}$/.test(v)) {
    const date = new Date(Date.UTC(1899, 11, 30) + parseInt(v) * 86400000);
    return date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
  }

  // Ya tiene mes abreviado (ej. "10/jun/2026") → devolver tal cual
  if (/\d{1,2}\/[a-záéíóú]{3}\/\d{4}/i.test(v)) return v;

  // DD/MM/YYYY o D/M/YYYY
  const dmy = v.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmy) {
    const date = new Date(Date.UTC(+dmy[3], +dmy[2] - 1, +dmy[1]));
    if (!isNaN(date)) return date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  // ISO YYYY-MM-DD
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const date = new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3]));
    if (!isNaN(date)) return date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  return v;
}

// La pestana Configuracion la piden varias piezas de la misma pantalla (el
// index, las tarjetas de home-navigation y el resumen ejecutivo), y cada una
// disparaba su propia descarga: dos peticiones medidas por carga del index
// para leer exactamente el mismo CSV. Se memoiza igual que el catalogo de
// asesores y las reasignaciones -- una sola lectura por vista, compartida --
// y clearSheetDataCache() la libera para que "Reintentar" y las publicaciones
// nuevas la vuelvan a leer.
let systemConfigPromise = null;
async function loadSystemConfig() {
  if (systemConfigPromise) return systemConfigPromise;
  systemConfigPromise = (async () => {
    let config = {};
    try {
      config = await readSystemConfig();
    } catch (error) {
      console.warn('[OXXO] No se pudo leer la configuracion del sistema:', error);
    }
    // Una lectura fallida (red caida, hoja sin el encabezado esperado) devuelve
    // {} y NO se memoiza: antes cada llamador tenia su propio intento y esa
    // segunda oportunidad se conserva. Solo se comparte una lectura buena.
    if (!config || !Object.keys(config).length) {
      systemConfigPromise = null;
      return {};
    }
    return config;
  })();
  return systemConfigPromise;
}
async function readSystemConfig() {
  const url = buildSheetURL(SHEETS_CONFIG.CONFIG_SHEET);
  let csv;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return {};
    csv = await res.text();
  } catch { return {}; }

  const norm = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

  // Partir en líneas y buscar la que tenga "dashboard_id" como celda individual
  const lines = csv.replace(/\r/g, '').split('\n').filter(l => l.trim());

  // Función que parsea una línea CSV y devuelve las celdas limpias
  const parseLine = line => splitCSVRow(line).map(c => c.trim().replace(/^"|"$/g, ''));

  // Buscar la línea donde dashboard_id sea una celda propia (no parte de texto más largo)
  let headerLineIdx = -1;
  let headers = [];
  for (let i = 0; i < lines.length; i++) {
    const cells = parseLine(lines[i]);
    // Buscar celda que sea EXACTAMENTE "dashboard_id" (puede estar en cualquier posición)
    const hasId = cells.some(c => norm(c) === 'dashboard_id');
    if (hasId) { headerLineIdx = i; headers = cells; break; }
  }

  // Si no encontró celda exacta, puede que la primera celda sea el título largo que TERMINA en dashboard_id
  // En ese caso, el header real empieza dentro de esa celda — lo extraemos manualmente
  if (headerLineIdx === -1) {
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes('dashboard_id')) {
        // Cortar el texto desde "dashboard_id" en adelante y re-parsear
        const raw = lines[i];
        const cutIdx = raw.toLowerCase().indexOf('dashboard_id');
        const fixedLine = raw.slice(cutIdx); // "dashboard_id","nombre",...
        headers = parseLine('"' + fixedLine); // agregar " inicial que falta
        // Si aún no funciona, intentar sin comilla
        if (!headers.some(c => norm(c) === 'dashboard_id')) {
          headers = parseLine(fixedLine);
        }
        headerLineIdx = i;
        break;
      }
    }
  }

  if (headerLineIdx === -1 || !headers.some(c => norm(c) === 'dashboard_id')) {
    console.warn('[OXXO] No se encontró header dashboard_id. Headers detectados:', headers);
    return {};
  }

  const idxId    = headers.findIndex(h => norm(h) === 'dashboard_id');
  const idxFecha = headers.findIndex(h => norm(h) === 'ultima_actualizacion');
  // Columna opcional con el link de un archivo descargable (Google Drive u otro) por dashboard.
  // Si se agrega esta columna en la pestaña Configuracion, cada dashboard muestra un botón
  // "Descargar" que apunta a ese link. Sin esta columna (o vacía), el botón no aparece.
  const idxArchivoUrl    = headers.findIndex(h => ['archivourl','linkdescarga','urlarchivo','archivo','linkarchivo'].includes(norm(h).replace(/[^a-z0-9]/g,'')));
  const idxArchivoNombre = headers.findIndex(h => ['archivonombre','nombrearchivo','etiquetaarchivo'].includes(norm(h).replace(/[^a-z0-9]/g,'')));

  const config = {};
  for (let i = headerLineIdx + 1; i < lines.length; i++) {
    const vals = parseLine(lines[i]);
    const id = (vals[idxId] || '').trim().toLowerCase();
    if (!id || norm(id) === 'instrucciones de uso') continue;
    // Solo aceptar IDs válidos (d1-d9, s1-s9)
    if (!/^[ds]\d$/.test(id)) continue;

    const row = {};
    headers.forEach((h, idx) => { row[h] = vals[idx] || ''; });

    if (idxFecha !== -1) {
      const fechaNorm = normalizarFecha(vals[idxFecha] || '');
      row[headers[idxFecha]] = fechaNorm;
      row['ultima_actualizacion'] = fechaNorm;
    }
    if (idxArchivoUrl !== -1) row['archivo_url'] = (vals[idxArchivoUrl] || '').trim();
    if (idxArchivoNombre !== -1) row['archivo_nombre'] = (vals[idxArchivoNombre] || '').trim();
    config[id] = row;
  }

  return config;
}

// ─────────────────────────────────────────────────────────────
// FUNCIÓN: Mostrar estado de carga dentro de un contenedor
// ─────────────────────────────────────────────────────────────
function showLoading(containerId, message = "Cargando datos...") {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = `
    <div class="state-box">
      <div class="spinner"></div>
      <div class="state-box__title">${message}</div>
      <div class="state-box__text">Conectando con Google Sheets…</div>
    </div>`;
}

// ─────────────────────────────────────────────────────────────
// FUNCIÓN: Mostrar estado de error
// ─────────────────────────────────────────────────────────────
function showError(containerId, mensaje) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = `
    <div class="state-box">
      <div class="state-box__icon">⚠️</div>
      <div class="state-box__title">No pudimos conectar con los datos</div>
      <div class="state-box__text">${escapeAttr(mensaje || 'Google Sheets no respondió. La información no fue modificada.')}</div>
      <button type="button" class="state-box__retry" data-oxxo-retry>Reintentar carga</button>
    </div>`;
}

// ─────────────────────────────────────────────────────────────
// FUNCIÓN: Mostrar estado vacío
// ─────────────────────────────────────────────────────────────
function showEmpty(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = `
    <div class="state-box">
      <div class="state-box__icon">📭</div>
      <div class="state-box__title">Sin datos disponibles</div>
      <div class="state-box__text">La hoja está vacía o no tiene el formato esperado.</div>
    </div>`;
}

// ─────────────────────────────────────────────────────────────
// FUNCIÓN: Formatear número (separador de miles)
// ─────────────────────────────────────────────────────────────
function formatNum(n, decimals = 0) {
  const num = parseFloat(n);
  if (isNaN(num)) return n;
  return num.toLocaleString('es-MX', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

// ─────────────────────────────────────────────────────────────
// FUNCIÓN: Formatear porcentaje
// ─────────────────────────────────────────────────────────────
function formatPct(n, decimals = 1) {
  const num = parseFloat(n);
  if (isNaN(num)) return n;
  return num.toLocaleString('es-MX', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }) + '%';
}

// ─────────────────────────────────────────────────────────────
// FUNCIÓN: Determinar clase de semáforo
// umbralVerde: valor >= umbralVerde → verde
// umbralRojo:  valor <= umbralRojo  → rojo
// intermedio:  amarillo
// invertido: true cuando valor BAJO es bueno (ej. vacantes)
// ─────────────────────────────────────────────────────────────
function getSemaforo(valor, umbralVerde, umbralRojo, invertido = false) {
  const v = parseFloat(valor);
  if (isNaN(v)) return 'gris';
  if (!invertido) {
    if (v >= umbralVerde) return 'verde';
    if (v <= umbralRojo)  return 'rojo';
    return 'amarillo';
  } else {
    if (v <= umbralVerde) return 'verde';
    if (v >= umbralRojo)  return 'rojo';
    return 'amarillo';
  }
}

// ─────────────────────────────────────────────────────────────
// FUNCIÓN: Calcular máximo de un array de valores
// ─────────────────────────────────────────────────────────────
function maxVal(arr, key) {
  return Math.max(...arr.map(r => parseFloat(r[key]) || 0));
}

// ─────────────────────────────────────────────────────────────
// FUNCIÓN: Actualizar timestamp en el footer
// ─────────────────────────────────────────────────────────────
function updateFooterTime(elementId) {
  const el = document.getElementById(elementId);
  if (!el) return;
  const now = new Date();
  el.textContent = now.toLocaleString('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

// ─────────────────────────────────────────────────────────────
// FUNCIÓN: Truncar texto largo
// ─────────────────────────────────────────────────────────────
function truncate(str, maxLen = 25) {
  if (!str) return '';
  return str.length > maxLen ? str.substring(0, maxLen) + '…' : str;
}

// ─────────────────────────────────────────────────────────────
// FUNCIÓN: Escapar HTML antes de insertar datos de Sheets en innerHTML
// Necesario porque cualquier celda (nombre, tienda, comentario) puede
// traer '<', '>', '&', '"' o "'" con solo que alguien la edite desde
// Sheets o el panel admin -- sin esto, esa celda puede romper el markup
// de la pagina o insertar HTML no intencional.
// ─────────────────────────────────────────────────────────────
function escHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

// ─────────────────────────────────────────────────────────────
// FUNCIÓN: Renderizar ranking con barras
// ─────────────────────────────────────────────────────────────
function renderRanking(containerId, data, keyNombre, keyValor, sufijo = '', colorBar = 'var(--color-yellow)') {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (!data || data.length === 0) { showEmpty(containerId); return; }

  const max = maxVal(data, keyValor) || 1;

  const items = data.slice(0, 10).map((row, i) => {
    const val = parseFloat(row[keyValor]) || 0;
    const pct = (val / max * 100).toFixed(1);
    return `
      <div class="ranking-item">
        <div class="ranking-item__pos">${i + 1}</div>
        <div class="ranking-item__bar-wrap">
          <div class="ranking-item__name">${escHtml(truncate(row[keyNombre], 30))}</div>
          <div class="ranking-item__bar-bg">
            <div class="ranking-item__bar-fill" style="width:${pct}%;background:${colorBar}"></div>
          </div>
        </div>
        <div class="ranking-item__value">${formatNum(val)}${sufijo}</div>
      </div>`;
  }).join('');

  el.innerHTML = `<div class="ranking-list">${items}</div>`;

  // Animación de entrada con delay
  requestAnimationFrame(() => {
    el.querySelectorAll('.ranking-item__bar-fill').forEach((bar, idx) => {
      const target = bar.style.width;
      bar.style.width = '0';
      setTimeout(() => { bar.style.width = target; }, idx * 80);
    });
  });
}

// ─────────────────────────────────────────────────────────────
// FUNCIÓN: Renderizar tarjeta KPI
// ─────────────────────────────────────────────────────────────
function renderKPI(id, valor, delta = null, deltaPos = null) {
  const el = document.getElementById(id);
  if (!el) return;

  const valueEl = el.querySelector('.kpi-card__value');
  const deltaEl = el.querySelector('.kpi-card__delta');

  if (valueEl) valueEl.textContent = valor;
  if (deltaEl && delta !== null) {
    deltaEl.textContent = delta;
    deltaEl.className = 'kpi-card__delta ' + (deltaPos === true ? 'pos' : deltaPos === false ? 'neg' : 'neu');
  }
}

// ─────────────────────────────────────────────────────────────
// FUNCIÓN: Renderizar gráfica de barras con Chart.js
// ─────────────────────────────────────────────────────────────
function ensureChartReady(canvas) {
  if (window.Chart) {
    canvas.style.display = '';
    const notice = canvas.parentElement?.querySelector('.chart-unavailable');
    if (notice) notice.remove();
    return true;
  }

  canvas.style.display = 'none';
  const parent = canvas.parentElement;
  if (parent && !parent.querySelector('.chart-unavailable')) {
    const notice = document.createElement('div');
    notice.className = 'chart-unavailable';
    notice.textContent = 'Gráfica no disponible: Chart.js no cargó.';
    notice.style.cssText = 'min-height:180px;display:grid;place-items:center;color:var(--text-muted);font-family:Barlow,sans-serif;font-weight:700;text-align:center;border:1px dashed var(--line);border-radius:12px;background:rgba(255,255,255,.04);';
    parent.appendChild(notice);
  }
  console.warn('Chart.js no está disponible. Revisa la conexión al CDN o usa una copia local.');
  return false;
}
function renderBarChart(canvasId, labels, values, label, color = '#FFD200') {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  if (!ensureChartReady(canvas)) return;
  const theme = getChartThemeColors();

  if (canvas._chartInstance) canvas._chartInstance.destroy();

  const ctx = canvas.getContext('2d');
  const makeGradient = (chart) => {
    const area = chart.chartArea;
    if (!area) return color;
    const g = ctx.createLinearGradient(area.left, 0, area.right, 0);
    g.addColorStop(0, '#F6B73C');
    g.addColorStop(.52, '#F07B22');
    g.addColorStop(1, color === '#FFD200' ? '#D91F2D' : color);
    return g;
  };
  canvas._chartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label,
        data: values,
        backgroundColor: (context) => makeGradient(context.chart),
        borderColor: 'rgba(255,255,255,.68)',
        borderWidth: 1,
        borderRadius: 999,
        borderSkipped: false,
        barPercentage: .76,
        categoryPercentage: .72,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#251313',
          titleColor: '#FFF8EE',
          bodyColor: '#FFF8EE',
          titleFont: { family: 'Barlow Condensed', weight: '800', size: 14 },
          bodyFont: { family: 'Barlow', size: 13, weight: '600' },
          padding: 12,
          cornerRadius: 14,
          displayColors: false,
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            font: { family: 'Barlow', size: 11 },
            color: theme.muted,
            maxRotation: 35,
          }
        },
        y: {
          border: { display: false },
          grid: { color: 'rgba(128,63,38,.075)', drawTicks: false },
          ticks: {
            font: { family: 'Barlow', size: 11, weight: '800' },
            color: '#6A5148',
          },
          beginAtZero: true,
        }
      }
    }
  });
}

// ─────────────────────────────────────────────────────────────
// FUNCIÓN: Renderizar gráfica de línea con Chart.js
// ─────────────────────────────────────────────────────────────
function renderLineChart(canvasId, labels, datasets) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  if (!ensureChartReady(canvas)) return;
  const theme = getChartThemeColors();
  if (canvas._chartInstance) canvas._chartInstance.destroy();

  const COLORS = ['#D91F2D', '#F07B22', '#F6B73C', '#B5121C', '#7B5709'];

  const ctx = canvas.getContext('2d');
  canvas._chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: datasets.map((ds, i) => ({
        label: ds.label,
        data: ds.values,
        borderColor: COLORS[i % COLORS.length],
        backgroundColor: 'transparent',
        borderWidth: 3,
        pointBackgroundColor: COLORS[i % COLORS.length],
        pointBorderColor: '#FFF8EE',
        pointBorderWidth: 2,
        pointRadius: 4.5,
        pointHoverRadius: 6,
        fill: false,
        tension: 0.35,
      }))
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: datasets.length > 1,
          position: 'top',
          labels: { font: { family: 'Barlow', size: 12 }, color: theme.text }
        },
        tooltip: {
          backgroundColor: '#251313',
          titleColor: '#FFF8EE',
          bodyColor: '#FFF8EE',
          titleFont: { family: 'Barlow Condensed', weight: '800', size: 14 },
          bodyFont: { family: 'Barlow', size: 13, weight: '600' },
          padding: 12,
          cornerRadius: 14,
          displayColors: false,
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { family: 'Barlow', size: 11 }, color: theme.muted }
        },
        y: {
          border: { display: false },
          grid: { color: 'rgba(128,63,38,.08)', drawTicks: false },
          ticks: { font: { family: 'Barlow', size: 11 }, color: theme.muted },
          beginAtZero: false,
        }
      }
    }
  });
}

// ─────────────────────────────────────────────────────────────
// FUNCIÓN: Renderizar gráfica de dona con Chart.js
// ─────────────────────────────────────────────────────────────
function renderDonutChart(canvasId, labels, values) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  if (!ensureChartReady(canvas)) return;
  const theme = getChartThemeColors();
  if (canvas._chartInstance) canvas._chartInstance.destroy();

  const ctx = canvas.getContext('2d');
  canvas._chartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: ['#D91F2D', '#F07B22', '#F6B73C', '#B5121C', '#7B5709', '#8B6A5F'],
        borderColor: '#FFF8EE',
        borderWidth: 4,
        borderRadius: 10,
        spacing: 3,
        hoverOffset: 6,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '68%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: { usePointStyle: true, pointStyle: 'circle', font: { family: 'Barlow', size: 12, weight: '800' }, color: '#5A4037', padding: 14 }
        },
        tooltip: {
          backgroundColor: '#251313',
          titleColor: '#FFF8EE',
          bodyColor: '#FFF8EE',
          titleFont: { family: 'Barlow Condensed', weight: '800', size: 14 },
          bodyFont: { family: 'Barlow', size: 13, weight: '600' },
          padding: 12,
          cornerRadius: 14,
          displayColors: false,
        }
      }
    }
  });
}



function getChartThemeColors() {
  return {
    text: '#2D2D44',
    muted: '#6B6678',
    grid: 'rgba(128,63,38,.10)',
    tooltipBg: '#251313'
  };
}

function applyChartThemeDefaults() {
  if (!window.Chart) return;
  const theme = getChartThemeColors();
  Chart.defaults.color = theme.text;
  Chart.defaults.borderColor = theme.grid;
  Chart.defaults.plugins = Chart.defaults.plugins || {};
  Chart.defaults.plugins.legend = Chart.defaults.plugins.legend || {};
  Chart.defaults.plugins.legend.labels = Chart.defaults.plugins.legend.labels || {};
  Chart.defaults.plugins.legend.labels.color = theme.text;
  Chart.defaults.scale = Chart.defaults.scale || {};
  Chart.defaults.scale.ticks = Chart.defaults.scale.ticks || {};
  Chart.defaults.scale.ticks.color = theme.text;
  Chart.defaults.scale.grid = Chart.defaults.scale.grid || {};
  Chart.defaults.scale.grid.color = theme.grid;
  Object.values(Chart.instances || {}).forEach((chart) => {
    if (!chart || !chart.options) return;
    const plugins = chart.options.plugins || {};
    if (plugins.legend && plugins.legend.labels) plugins.legend.labels.color = theme.text;
    if (plugins.title) plugins.title.color = theme.text;
    if (plugins.datalabels) plugins.datalabels.color = theme.text;
    const scales = chart.options.scales || {};
    Object.values(scales).forEach((scale) => {
      if (!scale) return;
      scale.ticks = scale.ticks || {};
      scale.grid = scale.grid || {};
      scale.ticks.color = theme.text;
      scale.ticks.textStrokeColor = 'rgba(0,0,0,0.18)';
      scale.ticks.textStrokeWidth = 0;
      if (scale.grid.display !== false) scale.grid.color = theme.grid;
    });
    chart.update('none');
  });
}
// Tema fijo claro compartido
function initThemeToggle() {
  const STORAGE_KEY = 'oxxo-theme';
  const root = document.documentElement;

  function applyTheme(theme) {
    root.dataset.theme = theme;
    try { localStorage.setItem(STORAGE_KEY, 'light'); } catch (_) {}
    applyChartThemeDefaults();
    window.dispatchEvent(new CustomEvent('oxxo-theme-change', { detail: { theme } }));
  }

  applyTheme('light');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initThemeToggle, { once: true });
} else {
  initThemeToggle();
}

// Catalogo compartido para corregir Asesor por CR/Tienda
let asesorCatalogPromise = null;
let tiendaCatalogPromise = null;
let reasignacionesPromise = null;
function stripAccents(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
// Repara "mojibake": texto UTF-8 que en el origen (captura manual, copiar-
// pegar entre programas) se guardo mal -- se interpreto como Latin-1 y se
// re-guardo como UTF-8 -- y llega a la hoja con la enie (u otro acento)
// convertida en dos caracteres sueltos en vez del caracter acentuado real
// (confirmado en una tienda real: "5 Senores" llegaba corrupto solo desde
// la hoja de TREO, con acento real en las demas hojas, y el mismatch de
// texto hacia que esa tienda no calzara entre dashboards). Solo actua si
// el texto cabe entero en un byte por caracter Y si al reinterpretar esos
// bytes como UTF-8 el resultado es valido; un texto ya limpio casi nunca
// cumple la segunda condicion (un caracter acentuado suelto seguido de una
// letra normal no forma una secuencia UTF-8 valida), asi que es seguro
// aplicarlo a cualquier valor sin revisar caso por caso.
function fixMojibake(value) {
  const text = String(value ?? '');
  if (!/[\u0080-\u00ff]/.test(text)) return text;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) > 0xff) return text;
  }
  try {
    const bytes = Uint8Array.from(text.split('').map(ch => ch.charCodeAt(0)));
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (e) {
    return text;
  }
}
function normalizeCatalogCr(value) {
  return stripAccents(value).toUpperCase().replace(/[^A-Z0-9]/g, '');
}
function normalizeCatalogTienda(value) {
  return stripAccents(value)
    .toUpperCase()
    .replace(/^OXXO\s+/, '')
    .replace(/^TIENDA\s+/, '')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    // El catalogo trae el nombre de tienda con sufijo de plaza (ej. "Las Flores OAX",
    // "Trailer Park VSA"), pero las bases operativas (Bajas, Vacantes, etc.) no lo traen
    // (ej. "OXXO LAS FLORES"). Sin quitar el sufijo, el match por nombre fallaba y marcaba
    // como "tienda no autorizada" a tiendas que si estan en el catalogo.
    .replace(/\s(OAX|VSA)$/, '');
}
function validCatalogRow(asesor, tienda, cr) {
  const crKey = normalizeCatalogCr(cr);
  const asesorKey = normalizeCatalogTienda(asesor);
  const tiendaKey = normalizeCatalogTienda(tienda);
  return asesorKey && tiendaKey && /^[A-Z0-9]{4,8}$/.test(crKey)
    && !asesorKey.startsWith('ASESORES')
    && asesorKey !== 'ASESOR'
    && tiendaKey !== 'TIENDA';
}
function parseAsesorCatalogCSV(csv) {
  const records = parseCSVRecords(String(csv || '').trim());
  const rows = [];
  records.forEach(record => {
    const cells = splitCSVRow(record).map(c => String(c || '').trim().replace(/^"|"$/g, ''));
    if (cells.length < 3) return;
    const [asesor, tienda, cr] = cells;
    if (validCatalogRow(asesor, tienda, cr)) { rows.push({ asesor, tienda, cr }); return; }
    // Recuperacion: si una fila trae varios CR pegados en una sola celda (ej. por saltos de
    // linea dentro de la celda en el sheet), se rescatan como CR "huerfanos" (sin tienda/asesor
    // asociado) para que el filtro de tiendas validas los siga reconociendo.
    const crTokens = String(cr || '').trim().split(/\s+/).filter(t => /^[A-Z0-9]{4,8}$/i.test(t));
    if (crTokens.length > 1) {
      crTokens.forEach(token => rows.push({ asesor: '', tienda: '', cr: token }));
    }
  });
  return rows;
}
function buildAsesorCatalog(rows) {
  const byCr = new Map();
  const byTienda = new Map();
  const validTiendas = new Set();
  rows.forEach(row => {
    const context = getDataContext();
    const item = {
      asesor: String(row.asesor || '').trim(),
      tienda: String(row.tienda || '').trim(),
      cr: normalizeCatalogCr(row.cr),
      region: String(row.region || context.region).trim(),
      plaza: String(row.plaza || context.plaza).trim(),
      zona: String(row.zona || context.zone).trim(),
      activa: String(row.activa || 'SI').trim().toUpperCase() !== 'NO'
    };
    const crKey = normalizeCatalogCr(item.cr);
    const tiendaKey = normalizeCatalogTienda(item.tienda);
    // Una fila sin asesor (p.ej. un CR "huerfano" rescatado de una celda-blob corrupta
    // en el sheet) NUNCA debe sobrescribir una asignacion buena ya cargada: eso dejaba
    // el asesor vacio y resolveAsesor caia al asesor viejo del dashboard.
    if (crKey && (item.asesor || !byCr.has(crKey))) byCr.set(crKey, item);
    if (tiendaKey) {
      if (item.asesor || !byTienda.has(tiendaKey)) byTienda.set(tiendaKey, item);
      validTiendas.add(tiendaKey);
    }
  });
  return { loaded: true, rows, byCr, byTienda, validTiendas };
}

function catalogValueByAliases(row, aliases) {
  const keys = Object.keys(row || {});
  for (const alias of aliases) {
    const wanted = normalizeCatalogTienda(alias);
    const key = keys.find(candidate => normalizeCatalogTienda(candidate) === wanted);
    if (key) return row[key];
  }
  return '';
}
function catalogPlazaKey(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return normalizeScopeToken(normalizeDataScope({ level: 'plaza', region: getDataContext().region, plaza: raw }).plaza);
}
function buildTiendaCatalog(rows, { source = 'Catalogo_Tiendas', loaded = true } = {}) {
  const byCr = new Map();
  const byTienda = new Map();
  const coveredPlazas = new Set();
  const cleanRows = [];
  (Array.isArray(rows) ? rows : []).forEach(row => {
    const cr = normalizeCatalogCr(catalogValueByAliases(row, ['CR', 'CR TIENDA', 'CR Reg', 'ID Tienda']));
    const tienda = String(catalogValueByAliases(row, ['Tienda', 'Unidad org', 'Unidad organizativa']) || '').trim();
    const plaza = String(catalogValueByAliases(row, ['Plaza']) || '').trim();
    const region = String(catalogValueByAliases(row, ['Region']) || 'TABASCO').trim();
    const zona = String(catalogValueByAliases(row, ['Zona']) || '').trim();
    const asesor = String(catalogValueByAliases(row, ['Asesor', 'AT']) || '').trim();
    const activeRaw = String(catalogValueByAliases(row, ['ACTIVA', 'Activo', 'Estatus']) || 'SI').trim().toUpperCase();
    const activa = !/^(NO|FALSE|FALSO|0|INACTIVA|INACTIVO|BAJA)$/.test(activeRaw);
    const tiendaKey = normalizeCatalogTienda(tienda);
    if (!cr || !tiendaKey || !plaza || tiendaKey.includes('ENTRENAMIENTO') || tiendaKey.includes('OPERACIONES')) return;
    const item = { cr, tienda, region, plaza, zona, asesor, activa, source };
    coveredPlazas.add(catalogPlazaKey(plaza));
    if (!byCr.has(cr) || (!byCr.get(cr).asesor && asesor)) byCr.set(cr, item);
    if (!byTienda.has(tiendaKey) || (!byTienda.get(tiendaKey).asesor && asesor)) byTienda.set(tiendaKey, item);
    cleanRows.push(item);
  });
  return { loaded, source, rows: cleanRows, byCr, byTienda, coveredPlazas };
}
async function loadTiendaCatalog() {
  if (tiendaCatalogPromise) return tiendaCatalogPromise;
  tiendaCatalogPromise = (async () => {
    const catalogName = SHEETS_CONFIG.STORE_CATALOG_SHEET || 'Catalogo_Tiendas';
    const treoName = SHEETS_CONFIG.TABS?.s7 || 'Dashboard_7_Semanal';
    const catalogRequest = fetchSheetData(catalogName).then(rows => (
      Array.isArray(rows) ? buildTiendaCatalog(rows, { source: catalogName }) : null
    )).catch(() => null);
    // Respaldo inmediato: mientras Apps Script v43 crea la hoja física, TREO
    // ya permite activar el catálogo sin esperar otra carga administrativa.
    const treoRequest = fetchSheetData(treoName).then(rows => (
      Array.isArray(rows) ? buildTiendaCatalog(rows, { source: treoName }) : null
    )).catch(() => null);
    const first = await Promise.race([
      catalogRequest.then(value => value?.rows?.length ? value : treoRequest),
      treoRequest.then(value => value?.rows?.length ? value : catalogRequest),
      new Promise(resolve => setTimeout(() => resolve(null), 1600))
    ]);
    if (first?.loaded) return first;
    return buildTiendaCatalog([], { source: 'sin catalogo disponible', loaded: false });
  })();
  return tiendaCatalogPromise;
}

// Catalogo_Asesores sigue resolviendo responsables; Catalogo_Tiendas,
// reconstruido desde TREO, es ahora la unica fuente que decide actividad.
// Si temporalmente ninguna de las dos fuentes responde, se falla abierto para
// no desaparecer tiendas por una intermitencia de red.
function isTiendaValid(catalog, tienda, cr='') {
  const stores = catalog?.storeCatalog;
  if (!stores?.loaded) return true;
  const crKey = normalizeCatalogCr(cr);
  const tiendaKey = normalizeCatalogTienda(tienda);
  const hit = (crKey && stores.byCr.get(crKey)) || (tiendaKey && stores.byTienda.get(tiendaKey));
  if (hit) return Boolean(hit.activa);
  // TREO se carga por plaza. Mientras una plaza aún no haya publicado su
  // archivo, no se usa el catálogo parcial para ocultar sus tiendas. En una
  // plaza ya cubierta sí se exige que el CR/nombre exista en TREO vigente.
  const scope = getActiveDataScope();
  if (scope.level !== 'plaza') return true;
  return !stores.coveredPlazas?.has(catalogPlazaKey(scope.plaza));
}
function filterValidTiendas(rows, catalog, tiendaKey, crKey) {
  if (!Array.isArray(rows) || !tiendaKey) return rows;
  return rows.filter(row => isTiendaValid(catalog, row[tiendaKey], crKey ? row[crKey] : ''));
}
// El catalogo de asesor-por-tienda vuelve a leerse de la hoja Catalogo_Asesores
// (en vez de en vivo desde Dashboard_3_Diario): se confirmo que Dashboard_3_Diario
// esta desactualizado respecto al archivo real de Estructura mas reciente (90
// tiendas con asesor distinto), asi que por ahora es MENOS confiable que un
// catalogo curado a mano mientras se resuelve la publicacion de esos archivos.
// Catalogo_Asesores debe mantenerse actualizado manualmente hasta entonces.
// Lee Catalogo_Asesores directo via el Apps Script (SpreadsheetApp,
// action=readSheet), sin pasar por gviz. Se confirmo con datos reales que
// gviz corrompe la exportacion CSV de esta hoja especifica (fusiona ~109 de
// 263 filas en una sola celda, siempre las mismas, sin importar como se
// escribio ni cache de por medio -- ver hallazgo completo en la sesion que
// agrego esto). Esta lectura es la que permite que el catalogo se edite
// desde el panel admin y quede vivo de inmediato en el sitio.
async function fetchCatalogRowsDirect() {
  const base = SHEETS_CONFIG.ADMIN_UPLOAD_URL;
  if (!base) return null;
  const sheetName = SHEETS_CONFIG.CATALOG_SHEET || 'Catalogo_Asesores';
  const url = `${base}${base.includes('?') ? '&' : '?'}action=readSheet&sheet=${encodeURIComponent(sheetName)}`;
  const response = await fetchWithTimeout(url, { cache: 'no-store' }, 6000);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  if (!data.ok) throw new Error(data.error || 'respuesta invalida de readSheet');
  let values = Array.isArray(data.values) ? data.values : [];
  // Fila 1 = "sacrificio" (_buffer_) si la hoja se publico con
  // writeWithBufferRow; fila real de encabezados justo despues.
  if (values.length && values[0].every(c => String(c ?? '').trim() === '_buffer_')) values = values.slice(1);
  const headers = (values[0] || []).map((value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, ' '));
  const indexOf = (...aliases) => headers.findIndex((header) => aliases.includes(header));
  const indexOr = (fallback, ...aliases) => {
    const found = indexOf(...aliases);
    return found >= 0 ? found : fallback;
  };
  const indexes = {
    // Las primeras tres columnas son contrato historico; los fallbacks
    // conservan compatibilidad si un encabezado viejo trae caracteres raros.
    asesor: indexOr(0, 'ASESOR'), tienda: indexOr(1, 'TIENDA'), cr: indexOr(2, 'CR TIENDA', 'CR'),
    region: indexOf('REGION'), plaza: indexOf('PLAZA'), zona: indexOf('ZONA'), activa: indexOf('ACTIVA')
  };
  const cell = (row, index) => index >= 0 ? String(row[index] ?? '').trim() : '';
  const rows = [];
  values.slice(1).forEach((r) => {
    const asesor = cell(r, indexes.asesor), tienda = cell(r, indexes.tienda), cr = cell(r, indexes.cr);
    if (validCatalogRow(asesor, tienda, cr)) rows.push({
      asesor, tienda, cr,
      region: cell(r, indexes.region), plaza: cell(r, indexes.plaza),
      zona: cell(r, indexes.zona), activa: cell(r, indexes.activa)
    });
  });
  return rows;
}
async function loadAsesorCatalogRows() {
  const catalogName = SHEETS_CONFIG.CATALOG_SHEET || 'Catalogo_Asesores';
  const catalogCacheKey = `catalog:${catalogName}`;
  const cached = await readPersistentRows(catalogCacheKey);
  // El catalogo cambia mucho menos que las bases diarias. Cinco minutos evita
  // descargarlo otra vez al recorrer varios dashboards, sin ocultar una
  // actualizacion administrativa durante una sesion larga.
  if (cached && Date.now() - cached.savedAt < 5 * 60 * 1000) {
    return buildAsesorCatalog(cloneSheetRows(cached.rows));
  }
  // La fuente viva y el respaldo versionado arrancan al mismo tiempo. Antes
  // se esperaba hasta 6 segundos a Apps Script y solo despues se intentaba el
  // archivo local; una intermitencia del endpoint bloqueaba todos los tableros
  // aunque ya existiera un catalogo valido en el propio sitio.
  const directPromise = (async () => {
    try {
      const rows = await fetchCatalogRowsDirect();
      if (rows && rows.length) {
        void writePersistentRows(catalogCacheKey, rows);
        return rows;
      }
      if (rows) console.warn('[OXXO] Lectura directa de Catalogo_Asesores vino vacia, usando respaldo.');
    } catch (e) {
      console.warn('[OXXO] No se pudo leer Catalogo_Asesores via Apps Script, usando respaldo:', e);
    }
    return null;
  })();
  const localPromise = (async () => {
    try {
      const localUrl = siteBasePath() + 'assets/catalogo_asesores.csv';
      const resp = await fetch(localUrl, { cache: 'default' });
      if (!resp.ok) return null;
      const rows = parseAsesorCatalogCSV(await resp.text());
      if (rows.length) return rows;
      console.warn('[OXXO] catalogo_asesores.csv sin filas validas, usando gviz.');
    } catch (e) {
      console.warn('[OXXO] No se pudo leer catalogo_asesores.csv, usando gviz:', e);
    }
    return null;
  })();
  const fastDirect = await Promise.race([
    directPromise,
    new Promise((resolve) => setTimeout(() => resolve(null), 1200))
  ]);
  if (fastDirect?.length) return buildAsesorCatalog(fastDirect);
  const localRows = await localPromise;
  if (localRows?.length) {
    // directPromise sigue trabajando y, si responde, deja la version viva en
    // Cache Storage para la siguiente navegación sin retrasar esta pantalla.
    void directPromise;
    return buildAsesorCatalog(localRows);
  }
  const delayedDirect = await directPromise;
  if (delayedDirect?.length) return buildAsesorCatalog(delayedDirect);
  // Ultimo respaldo: hoja Catalogo_Asesores via gviz (puede venir con
  //    filas fusionadas para esta hoja en particular; solo se llega aqui si
  //    fallaron los dos anteriores).
  try {
    const url = buildSheetURL(SHEETS_CONFIG.CATALOG_SHEET || 'Catalogo_Asesores') + '&range=A2%3AC';
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const rows = parseAsesorCatalogCSV(await response.text());
    const catalog = buildAsesorCatalog(rows);
    if (!rows.length) console.warn('[OXXO] Catalogo_Asesores no devolvio filas validas.');
    return catalog;
  } catch (error) {
    console.warn('[OXXO] No se pudo cargar Catalogo_Asesores:', error);
    if (cached && Date.now() - cached.savedAt < 60 * 60 * 1000) {
      return buildAsesorCatalog(cloneSheetRows(cached.rows));
    }
    return { loaded: false, rows: [], byCr: new Map(), byTienda: new Map() };
  }
}
async function loadAsesorCatalog() {
  if (asesorCatalogPromise) return asesorCatalogPromise;
  asesorCatalogPromise = (async () => {
    const [catalog, reasignaciones, storeCatalog] = await Promise.all([loadAsesorCatalogRows(), loadReasignaciones(), loadTiendaCatalog()]);
    catalog.reasignaciones = reasignaciones;
    catalog.storeCatalog = storeCatalog;
    return catalog;
  })();
  return asesorCatalogPromise;
}
//
// Renombres de asesor: Anadelia ya no existe, su estructura/tiendas se
// traspasaron por completo a Timoteo Antonio Perez, asi que sus filas se cuentan
// con ese asesor en todos los dashboards (no solo en el Excel de Indicadores).
const ASESOR_MERGE = { 'anadelia': 'Timoteo Antonio Perez' };
function renameMergedAsesor(name) {
  const raw = String(name || '').trim();
  const key = raw.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  for (const alias in ASESOR_MERGE) {
    if (key.includes(alias)) return ASESOR_MERGE[alias];
  }
  return raw;
}
// Corrige el asesor de una fila contra el catalogo (construido en vivo desde
// Dashboard_3_Diario / Estructura, ver loadAsesorCatalog): busca primero por
// CR (clave confiable, unica) y si no hay CR usa el nombre de tienda como
// respaldo. Si la tienda no esta en el catalogo, se deja el asesor tal cual
// vino en la fila. El renombre Anadelia->Timoteo Antonio Perez se aplica siempre al final,
// tanto si el asesor viene del catalogo como si viene sin corregir.
function resolveAsesor(catalog, { cr='', tienda='', asesor='' } = {}) {
  const fallback = String(asesor || '').trim();
  if (!catalog || !catalog.byCr || !catalog.byTienda) return renameMergedAsesor(fallback);
  const crKey = normalizeCatalogCr(cr);
  const tiendaKey = normalizeCatalogTienda(tienda);
  const hit = (crKey && catalog.byCr.get(crKey)) || (tiendaKey && catalog.byTienda.get(tiendaKey));
  // El catálogo histórico de Oaxaca no trae Plaza en sus tres columnas
  // originales. buildAsesorCatalog la completa como Oaxaca; por eso un hit de
  // ese catálogo solo puede corregir filas del alcance al que pertenece. Sin
  // esta comprobación, una tienda homónima de Tuxtla/Villahermosa podía heredar
  // silenciosamente el asesor de Oaxaca.
  const hitMatchesScope = hit && rowMatchesDataScope({ Region: hit.region, Plaza: hit.plaza, Zona: hit.zona });
  return renameMergedAsesor(hitMatchesScope ? hit.asesor : fallback);
}
function metricsIsSinAsesorD1(value) {
  const t = metricsNormText(value).replace(/[^A-Z]/g, '');
  return !t || t.includes('SINASESOR') || t.includes('NOASIGNADO');
}
// Reasignaciones: pestana opcional del Sheet (ver panel admin, seccion
// "Reasignaciones") donde se registra quien hereda una tienda cuando su
// asesor deja la empresa -- sin tocar codigo. Si la pestana no existe
// todavia o esta vacia, se devuelve vacio sin error: resolveAsesorD1 cae al
// respaldo fijo de abajo, que es el que ya cubre el caso de Anadelia.
async function loadReasignaciones() {
  if (reasignacionesPromise) return reasignacionesPromise;
  reasignacionesPromise = (async () => {
    const empty = { byCr: new Map(), byTienda: new Map(), rows: [] };
    try {
      // fetchSheetData (gviz, rapido) en vez de la lectura directa por Apps
      // Script: el riesgo real que motivo ese cambio no era el canal, era que
      // metricsFindKey() (con su segundo paso de coincidencia "se parece a")
      // podia emparejar 'Asesor_Entrante' contra la columna 'Asesor' de OTRA
      // hoja si gviz devolvia la hoja equivocada (ver nota abajo). Con
      // coincidencia exacta ese emparejamiento erroneo ya no puede pasar, asi
      // que no hace falta pagar la latencia extra de Apps Script aqui.
      const raw = await fetchSheetData(SHEETS_CONFIG.REASIGNACIONES_SHEET || 'Reasignaciones');
      if (!raw || !raw.length) return empty;
      const h = raw[0];
      // metricsFindKeyExact (NO metricsFindKey): si la pestana "Reasignaciones"
      // no existe todavia, gviz no da error -- silenciosamente devuelve la
      // PRIMERA pestana del libro (Dashboard_1_Diario) en su lugar. Con
      // coincidencia "se parece a", el alias 'Asesor_Entrante' emparejaba por
      // error con la columna 'Asesor' de esa hoja, y el resto del codigo
      // interpretaba Dashboard 1 entero como si fueran reasignaciones reales
      // (confirmado en vivo: 263 "reasignaciones" falsas, una por tienda).
      // Exigir coincidencia exacta cierra ese hueco: Dashboard 1 no tiene
      // ninguna columna llamada literal "Asesor_Entrante"/"Nuevo Asesor"/etc.
      const crKey = metricsFindKeyExact(h, ['CR', 'CR Tienda', 'CR TIENDA']);
      const tiendaKey = metricsFindKeyExact(h, ['Tienda']);
      const entranteKey = metricsFindKeyExact(h, ['Asesor_Entrante', 'Asesor Entrante', 'Nuevo Asesor', 'Hereda']);
      if (!entranteKey) return empty;
      const byCr = new Map(), byTienda = new Map();
      raw.forEach(row => {
        const entrante = String(metricsVal(row, entranteKey) || '').trim();
        if (!entrante) return;
        const crK = crKey ? normalizeCatalogCr(metricsVal(row, crKey)) : '';
        const tK = tiendaKey ? normalizeCatalogTienda(metricsVal(row, tiendaKey)) : '';
        if (crK) byCr.set(crK, entrante);
        if (tK) byTienda.set(tK, entrante);
      });
      return { byCr, byTienda, rows: raw };
    } catch (e) {
      console.warn('[OXXO] No se pudo cargar Reasignaciones (opcional):', e);
      return empty;
    }
  })();
  return reasignacionesPromise;
}
function lookupReasignacion(catalog, cr, tienda) {
  const r = catalog?.reasignaciones;
  if (!r) return '';
  const crKey = normalizeCatalogCr(cr);
  if (crKey && r.byCr.has(crKey)) return r.byCr.get(crKey);
  const tiendaKey = normalizeCatalogTienda(tienda);
  if (tiendaKey && r.byTienda.has(tiendaKey)) return r.byTienda.get(tiendaKey);
  return '';
}
// Snapshot fijo (por CR, la llave estable) de las tiendas que eran de
// Anadelia Hernandez Santiago cuando dejo la empresa, y que quedan como
// respaldo permanente por si la pestana Reasignaciones esta vacia o no
// existe todavia. Antes, resolveAsesorD1 decidia Timoteo-vs-Sin-Asesor
// mirando si la celda CRUDA de asesor de ESE archivo en particular traia
// su nombre o venia vacia -- pero los 8 origenes de datos se mantienen por
// separado y no todos se "limpian" al mismo tiempo. Resultado real medido:
// 27 tiendas salian como Timoteo en unos dashboards y como Sin Asesor
// Asignado en otros. Con este snapshot fijo (construido una vez cruzando
// las 8 bases) la misma tienda sale igual sin importar que base mires.
const ANADELIA_CR = new Set(['50XUE','50C10','50A49','50XUP','50DXH','50D6F','50LIY','50ZP4','50JT5','507SP','50ALK','50K5Z','507EF','50G0Y','5094V','50E1V','50H1A','501OP','5084R','50C62','50JTQ','50LPB','502WQ','5000K','50T5X','50XUA','50NK1'].map(normalizeCatalogCr));
const ANADELIA_TIENDA = new Set(['OXXO CALENDA','OXXO JALPAN OAX','OXXO MARIA ARISTA OAX','OXXO MORELOS','OXXO JP GARCIA OAX','OXXO LLANO OAX','OXXO RINCONADAS OAX','OXXO ALCALA OAX','OXXO TERAN OAX','OXXO LA SALLE VSA','OXXO VENUS OAX','OXXO XOXO OAX','OXXO MI RANCHITO OAX','OXXO DIAZ OAX','OXXO TEQUIO OAX','OXXO ANTEQUERA G500 VSA','OXXO LORDCAST VSA','OXXO ZAACHILA VSA','OXXO LA CIÉNEGA VSA','OXXO CARRILLO OAX','OXXO GALA','OXXO HINOJOSA OAX','OXXO MARIA MORELOS OAX','OXXO NUNO DEL MERCADO VSA','OXXO PIPILA OAX','OXXO SANTA ANITA','OXXO SANTA ELENA OAX'].map(normalizeCatalogTienda));
function esTiendaDeAnadelia(cr, tienda) {
  const crKey = normalizeCatalogCr(cr);
  if (crKey && ANADELIA_CR.has(crKey)) return true;
  const tiendaKey = normalizeCatalogTienda(tienda);
  return Boolean(tiendaKey && ANADELIA_TIENDA.has(tiendaKey));
}
// Regla general (todos los dashboards): toda tienda sin un AT vigente en el
// catalogo se atribuye a quien la haya heredado en la pestana Reasignaciones
// del Sheet (panel admin); si nadie la reasigno ahi, se usa el snapshot fijo
// de Anadelia como respaldo; si tampoco aplica, se deja como "Sin Asesor
// Asignado" tal cual, sin inventarle dueño a nadie. Las unidades de
// Entrenamiento/Operaciones (no son tiendas operativas reales) siempre se
// quedan con su propio "Sin Asesor Asignado", sin pasar por nada de esto.
function resolveAsesorD1(catalog, { cr='', tienda='', asesor='' } = {}) {
  if (metricsIsTiendaEntrenamientoOperacionesD2(tienda)) return 'Sin Asesor Asignado';
  const resolved = resolveAsesor(catalog, { cr, tienda, asesor });
  if (!metricsIsSinAsesorD1(resolved)) return resolved;
  const heredero = lookupReasignacion(catalog, cr, tienda);
  if (heredero) return heredero;
  return esTiendaDeAnadelia(cr, tienda) ? 'Timoteo Antonio Perez' : 'Sin Asesor Asignado';
}
// Todos los consumidores de catalogo (Dashboard 4, 6, 8, etc.) pasan por
// resolveAsesorD1 para heredar la regla de arriba, no solo el renombre
// Anadelia->Timoteo que hacia resolveAsesor() por si solo.
function applyAsesorCatalog(row, catalog, { asesorKey, tiendaKey, crKey } = {}) {
  if (!row || !asesorKey) return row;
  const corrected = resolveAsesorD1(catalog, { cr: crKey ? row[crKey] : '', tienda: tiendaKey ? row[tiendaKey] : '', asesor: row[asesorKey] });
  if (corrected) row[asesorKey] = corrected;
  return row;
}

function escapeAttr(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ─────────────────────────────────────────────────────────────
// MÉTRICAS COMPARTIDAS (Vacantes/Bajas/Aprovechamiento/Ausentismos/TREO)
//
// Antes, cada dashboard y cada generador de presentación (admin-pptx.js,
// admin-pptx-rae.js) tenía su PROPIA copia de esta lógica de filtros. Eso
// permitía que divergieran silenciosamente: un ajuste en un dashboard no se
// reflejaba en las presentaciones (o viceversa), y los totales terminaban
// sin coincidir. Todo lo de aquí abajo es la única fuente de verdad —
// dashboards y presentaciones la llaman en vez de reimplementarla.
//
// El comportamiento (incluidos los "bugs" documentados, ej. el parseo de
// "Mes" en Dashboard_1_Diario) fue verificado dato-por-dato contra el CSV
// en vivo de Google Sheets antes de mover el código aquí; no se cambió
// ninguna regla al centralizarlo.

function metricsCleanKey(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}
function metricsVal(row, key, fallback = '') {
  const v = key ? row[key] : undefined;
  return (v === undefined || v === null || String(v).trim() === '') ? fallback : v;
}
// Google Sheets a veces exporta celdas numericas en formato es-MX (coma
// decimal, ej. "52,00" en vez de "52.00" — confirmado en la columna "Dias
// Vacantes" de TODOS los meses de Dashboard_1_Diario). Sin este caso especial,
// una sola coma seguida de 1-2 digitos se trataba igual que un separador de
// miles y se eliminaba sin mas: "52,00" se leia como 5200 en vez de 52,
// disparando el filtro de "tienda nueva" (dias>500) y excluyendo filas
// validas del total. Un numero con miles reales (ej. "12,345") sigue
// tratando la coma como separador de miles porque trae 3+ digitos despues.
function metricsNum(v) {
  const raw = String(v ?? '').replace(/[$%]/g, '').trim();
  const comma = raw.lastIndexOf(',');
  const dot = raw.lastIndexOf('.');
  let asDecimal = raw;
  if (comma >= 0 && dot >= 0) {
    // Cuando aparecen ambos separadores, el ultimo es el decimal:
    // 1.234,56 (es-MX) y 1,234.56 (en-US) representan el mismo valor.
    asDecimal = comma > dot
      ? raw.replace(/\./g, '').replace(',', '.')
      : raw.replace(/,/g, '');
  } else if (comma >= 0) {
    const parts = raw.split(',');
    // Sin punto en la cadena, una sola coma SIEMPRE es el decimal es-MX:
    // "0,96", "2,234592627" y tambien "0,939". La regla anterior reservaba
    // el caso de exactamente 3 decimales para miles (12,345) y por eso
    // "0,939" se leia 939 y "1,125" se leia 1125 -- en Dashboard 11 eso
    // convertia 93.9% en 939% e inflaba KPIs, dona y ranking de asesores.
    // Se reviso la publicacion completa (16 pestanas del Sheet): el patron
    // "N,ddd" solo aparece en las columnas de % de Dashboard 11 y siempre es
    // decimal; los miles reales llegan como "1,113.75", con coma Y punto,
    // que resuelve la rama de arriba. Varias comas ("1,234,567") solo
    // admiten lectura de miles y se siguen tratando asi.
    asDecimal = parts.length === 2 ? raw.replace(',', '.') : raw.replace(/,/g, '');
  }
  const n = Number(asDecimal);
  return Number.isFinite(n) ? n : 0;
}
function metricsNormText(v) {
  return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
}
function metricsFindKey(row, aliases) {
  const keys = Object.keys(row || {});
  const map = new Map(keys.map(k => [metricsCleanKey(k), k]));
  for (const a of aliases) { const found = map.get(metricsCleanKey(a)); if (found) return found; }
  for (const a of aliases) {
    const ca = metricsCleanKey(a);
    const found = keys.find(k => metricsCleanKey(k).includes(ca) || ca.includes(metricsCleanKey(k)));
    if (found) return found;
  }
  return null;
}
// Variante SIN el segundo paso de metricsFindKey() (coincidencia "se parece
// a", por substring). Para columnas con un alias corto/generico como
// "Asesor" (dentro de "Asesor_Entrante"), ese segundo paso puede emparejar
// por error la columna de OTRA hoja completamente distinta -- ver
// loadReasignaciones() mas abajo, que es donde importa evitarlo.
function metricsFindKeyExact(row, aliases) {
  const keys = Object.keys(row || {});
  const map = new Map(keys.map(k => [metricsCleanKey(k), k]));
  for (const a of aliases) { const found = map.get(metricsCleanKey(a)); if (found) return found; }
  return null;
}
// Variante de metricsFindKey() para hojas con el problema de exportación de
// Google Sheets donde el encabezado real termina pegado como texto dentro
// de las celdas de otra columna (ej. Dashboard_7_Semanal: una columna
// vacía "CR Reg" junto a otra "CR 501K9 50N0M..." que sí trae los datos).
// Un match por substring simple puede acertarle a la columna equivocada;
// aquí se prueban TODOS los candidatos que matchean el alias y se elige el
// que realmente tiene datos (y, si numeric=true, el que tiene más valores
// que parecen número — para no perder contra una columna de texto libre
// que solo MENCIONA el alias en una frase larga).
function metricsFindDataKey(rows, aliases, sample = 25, numeric = false) {
  if (!rows || !rows.length) return null;
  const keys = Object.keys(rows[0] || {});
  const exact = [], partial = [];
  for (const a of aliases) {
    const ca = metricsCleanKey(a);
    for (const k of keys) {
      const ck = metricsCleanKey(k);
      if (ck === ca) exact.push(k);
      else if (ck.includes(ca) || ca.includes(ck)) partial.push(k);
    }
  }
  const candidates = [...new Set([...exact, ...partial])];
  if (!candidates.length) return null;
  const n = Math.min(sample, rows.length);
  const isNum = v => v !== '' && Number.isFinite(Number(String(v).replace(/,/g, '').trim()));
  let best = candidates[0], bestScore = -1;
  for (const k of candidates) {
    let score = 0;
    for (let i = 0; i < n; i++) {
      const v = String(rows[i][k] ?? '').trim();
      if (!v) continue;
      score += (numeric ? (isNum(v) ? 1 : 0) : 1);
    }
    if (score > bestScore) { bestScore = score; best = k; }
  }
  return best;
}
function metricsTipoPuesto(desc) {
  const d = metricsNormText(desc);
  if (d.includes('LIDER')) return 'Lider';
  if (d.includes('ENCARGADO')) return 'Encargado';
  if (d.includes('AYUDANTE') || d.includes('AYUDANTA')) return 'Ayudante';
  return 'Otro';
}
const METRICS_MES_ABBR = {
  ene: 1, enero: 1, feb: 2, febrero: 2, mar: 3, marzo: 3, abr: 4, abril: 4,
  may: 5, mayo: 5, jun: 6, junio: 6, jul: 7, julio: 7, ago: 8, agosto: 8,
  sep: 9, sept: 9, septiembre: 9, set: 9, setiembre: 9,
  oct: 10, octubre: 10, nov: 11, noviembre: 11, dic: 12, diciembre: 12,
  jan: 1, january: 1, february: 2, march: 3, apr: 4, april: 4, june: 6,
  july: 7, aug: 8, august: 8, september: 9, october: 10,
  november: 11, dec: 12, december: 12,
};
// Convierte "Mes" (texto tipo "jul-26", "07-2026", "2026-07") a una clave
// canónica "YYYY-MM". Usado por Dashboard_2_Diario (monthKeyFromRow).
function metricsNormalizeMonthKey(value) {
  if (value instanceof Date && !isNaN(value)) return metricsMesKeyFromDate(value);
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const clean = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[._/]+/g, '-').replace(/\s+/g, '-').replace(/^-+|-+$/g, '');
  let m = clean.match(/^(\d{4})-(\d{1,2})(?:-\d{1,2})?$/);
  if (m && +m[2] >= 1 && +m[2] <= 12) return `${m[1]}-${String(+m[2]).padStart(2, '0')}`;
  m = clean.match(/^(\d{1,2})-(\d{4})$/);
  if (m && +m[1] >= 1 && +m[1] <= 12) return `${m[2]}-${String(+m[1]).padStart(2, '0')}`;
  m = clean.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/);
  if (m && +m[2] >= 1 && +m[2] <= 12) { const y = +m[3] < 100 ? 2000 + +m[3] : +m[3]; return `${y}-${String(+m[2]).padStart(2, '0')}`; }
  m = clean.match(/^([a-z]+)-?(\d{2,4})$/);
  if (m && METRICS_MES_ABBR[m[1]]) { const y = +m[2] < 100 ? 2000 + +m[2] : +m[2]; return `${y}-${String(METRICS_MES_ABBR[m[1]]).padStart(2, '0')}`; }
  m = clean.match(/^(\d{1,2})-([a-z]+)-(\d{2,4})$/);
  if (m && METRICS_MES_ABBR[m[2]]) { const y = +m[3] < 100 ? 2000 + +m[3] : +m[3]; return `${y}-${String(METRICS_MES_ABBR[m[2]]).padStart(2, '0')}`; }
  if (/^\d{4,5}(?:\.\d+)?$/.test(clean)) {
    const parsed = metricsParseFecha(clean);
    if (parsed) return metricsMesKeyFromDate(parsed);
  }
  return '';
}
// Igual que parseFechaVacante() de dashboard-1.html: lee una fecha real
// (serial de Excel o texto dd/mm/aaaa, aaaa-mm-dd, etc.).
function metricsParseFecha(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  if (/^\d+(\.\d+)?$/.test(raw)) {
    const serial = Number(raw);
    if (serial > 25000 && serial < 80000) {
      // El serial de Excel no tiene zona horaria (es solo un dia calendario),
      // pero Date.UTC(...) construye un instante UTC concreto. Si el resultado
      // se lee despues con getters LOCALES (getFullYear/getMonth/getDate, como
      // hace mesKeyFromDate en todo el codebase) en un huso horario negativo
      // (ej. Mexico, UTC-6), medianoche UTC del 1 de septiembre cae la tarde
      // del 31 de agosto en hora local -- el dia se corria uno hacia atras
      // (confirmado: subir vacantes con la columna Mes/Fecha como fecha de
      // Excel las agrupaba en el dia anterior). Se leen los componentes en
      // UTC y se reconstruye la fecha con el constructor LOCAL, para que
      // coincida con el dia calendario real sin importar el huso horario del
      // navegador.
      const utc = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
      if (isNaN(utc)) return null;
      const d = new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate());
      return isNaN(d) ? null : d;
    }
  }
  const clean = raw.replace(/\s+\d{1,2}:\d{2}(:\d{2})?.*$/, '').replace(/[.]/g, '/').replace(/-/g, '/');
  const parts = clean.split('/').map(p => p.trim()).filter(Boolean);
  if (parts.length >= 3) {
    let day, month, year;
    if (parts[0].length === 4) { year = Number(parts[0]); month = Number(parts[1]); day = Number(parts[2]); }
    else { day = Number(parts[0]); month = Number(parts[1]); year = Number(parts[2]); }
    if (year < 100) year += 2000;
    const d = new Date(year, month - 1, day);
    if (!isNaN(d) && d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day) return d;
  }
  const d = new Date(raw);
  return isNaN(d) ? null : d;
}
function metricsMesKeyFromDate(date) {
  if (!date) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}
// Normaliza la columna "Mes" de Dashboard_1_Diario con el mismo parser
// compartido que usa Dashboard 2. Así una fecha real, un serial de Excel y
// un texto tipo "sep-26" siempre pertenecen al mismo periodo.
function metricsNormalizeMesColumnD1(value) {
  return metricsNormalizeMonthKey(value);
}
// Clave de mes por fila para Dashboard_1_Diario: mesInfo.key ||
// mesKeyFromDate(fechaObj). Si "Mes" no es reconocible, "Fecha" evita que
// la fila desaparezca del selector mensual.
function metricsRowMonthKeyD1(row, mesKey, fechaKey) {
  return metricsNormalizeMesColumnD1(metricsVal(row, mesKey)) || metricsMesKeyFromDate(metricsParseFecha(metricsVal(row, fechaKey)));
}
// Clave de mes por fila para Dashboard_2_Diario: monthKeyFromRow() =
// normalizeMonthKey(Mes) || normalizeMonthKey(Fecha).
function metricsRowMonthKeyD2(row, mesKey, fechaKey) {
  return metricsNormalizeMonthKey(metricsVal(row, mesKey)) || metricsNormalizeMonthKey(metricsVal(row, fechaKey));
}
// Agrupa `rows` por la clave de mes que regrese rowKeyFn() y regresa solo
// las del mes más reciente (orden alfabético de la clave — funciona igual
// para claves canónicas "YYYY-MM" y para el texto crudo de respaldo de
// metricsNormalizeMesColumnD1, que en la práctica también ordena bien
// porque el formato de corte es constante).
// targetMes: opcional. Si se pasa y existe entre las llaves disponibles, se usa
// ese mes en vez del mas reciente (p.ej. para generar una presentacion de un
// mes anterior aunque ya se haya subido un mes mas nuevo).
function metricsFilterLatestMonth(rows, rowKeyFn, targetMes = '') {
  const keyed = rows.map(r => ({ r, k: rowKeyFn(r) }));
  const keys = [...new Set(keyed.map(x => x.k).filter(Boolean))].sort();
  const mes = (targetMes && keys.includes(targetMes)) ? targetMes : (keys.slice(-1)[0] || '');
  if (!mes) return { mes: '', rows };
  return { mes, rows: keyed.filter(x => x.k === mes).map(x => x.r) };
}
// Los 6 valores EXACTOS de "Descripcion de Posicion" que dashboard-1.html
// selecciona por defecto en su filtro de Puesto (DEFAULT_PUESTOS). Puestos
// reales como "AYUDANTE APERTURA"/"AYUDANTE BANCA"/"AYUDANTE TIENDA
// ENTRENAMIENTO" no son ninguno de los 6 y quedan fuera del total por
// defecto — no es "contiene AYUDANTE/ENCARGADO/LIDER".
const METRICS_DEFAULT_PUESTOS_D1 = new Set([
  'ENCARGADO TURNO', 'ENCARGADO TURNO SATELITE',
  'LIDER TIENDA', 'LIDER TIENDA SATELITE',
  'AYUDANTE TIENDA', 'AYUDANTE TIENDA SATELITE',
]);
// isDefaultExcludedTienda() de dashboard-1.html: el filtro de Tienda por
// defecto ("Tiendas operativas") excluye nombres con "entrenamiento" u
// "operaciones".
function metricsIsDefaultExcludedTiendaD1(v) {
  const t = metricsNormText(v);
  return t.includes('ENTRENAMIENTO') || t.includes('OPERACIONES');
}
// diasVacantesValue() de dashboard-1.html: la columna "Dias Vacantes" a
// veces llega de gviz como fecha-serial de Excel en vez de un numero plano
// (ej. "20/07/1900" en lugar de "20" — Sheets reinterpreta el numero chico
// como fecha al exportar). Sin esta conversion, metricsNum() la parsea como
// 0 y el filtro de Antiguedad por defecto excluye TODAS las filas (dias=0
// nunca cumple dias>=1), dejando el total en 0 en vez del real.
function metricsDiasVacantesValue(raw) {
  const s = String(raw ?? '').trim();
  if (!s || /finaliz/i.test(s)) return 0;
  const d = metricsParseFecha(s);
  if (d && d.getFullYear() <= 1901) {
    const base = Date.UTC(1899, 11, 30);
    return Math.max(0, Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - base) / 86400000));
  }
  if (/\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}/.test(s)) return 0;
  // Delegado a metricsNum() para heredar el manejo de coma decimal es-MX
  // (ej. "52,00"), que es justo el formato real de esta columna en el Sheet.
  const n = metricsNum(s);
  return n >= 0 ? n : 0;
}
// Dashboard_1_Diario ahora publica TODAS las posiciones (ocupadas y vacantes),
// no solo las vacantes, porque TREO necesita el total (SAP) para calcular
// Activos/Vacantes por tienda. Este filtro reconstruye "es vacante" del lado
// del dashboard para que el conteo de Vacantes Diarias no se infle contando
// tambien las posiciones ocupadas: una fila es vacante si su Status lo dice
// explicitamente, o si no hay nombre de empleado en la columna "Empleados"
// (cuando esa columna existe en la hoja).
function metricsIsVacanteSourceD1(row, keys) {
  const { statusKey, empleadoKey } = keys;
  const status = metricsNormText(metricsVal(row, statusKey));
  if (status.includes('VACANTE') || status.includes('NO OCUPADO')) return true;
  if (empleadoKey) return String(metricsVal(row, empleadoKey) || '').trim() === '';
  return true;
}
// Compatibilidad para consumidores que necesiten aplicar explicitamente el
// criterio historico de 1+ dias. El Dashboard 1 ya no lo usa como default:
// una vacante abierta hoy (0 dias) sigue siendo una vacante vigente y debe
// aparecer en el corte, especialmente el primer dia de cada mes.
function metricsPasaAntiguedadDefaultD1(row, diasKey) {
  const dias = metricsDiasVacantesValue(metricsVal(row, diasKey));
  const diasRaw = String(metricsVal(row, diasKey) || '').trim();
  const esTiendaNueva = dias > 500 || diasRaw === '';
  if (esTiendaNueva) return false;
  return dias >= 1;
}
// Aplica los filtros DEFAULT completos de dashboard-1.html (catalogo de
// tiendas + timoteoantonioperez ya deben aplicarse antes, por separado,
// porque tambien los usa Dashboard 7). La antiguedad inicia en "todas": no
// se eliminan vacantes de 0 dias ni tiendas nuevas.
function metricsApplyD1Defaults(rows, keys) {
  const { tiendaKey, puestoKey } = keys;
  return rows
    .filter(r => !metricsIsDefaultExcludedTiendaD1(metricsVal(r, tiendaKey)))
    .filter(r => METRICS_DEFAULT_PUESTOS_D1.has(String(metricsVal(r, puestoKey) || '').trim().toUpperCase()));
}
// filterData() de dashboard-2.html: si la hoja trae columna de Medida,
// quedarse solo con movimientos de BAJA. El alcance geográfico ya fue
// aplicado por fetchSheetData; volver a filtrar Oaxaca aquí rompía el modo
// Región TABASCO al descartar Tuxtla, Villahermosa, Costa Istmo y Chontalpa.
function metricsFilterBajasD2(rows, keys) {
  const { medidaKey } = keys;
  let base = rows;
  if (medidaKey) {
    const bajas = base.filter(r => metricsNormText(metricsVal(r, medidaKey)).includes('BAJA'));
    if (bajas.length) base = bajas;
  }
  return base;
}
// isTiendaEntrenamientoOperacionesD2() de dashboard-2.html: unidades de
// Entrenamiento/Operaciones sin AT real. Sus bajas se cuentan mas no se
// atribuyen a un asesor de catalogo: se fusionan en Timoteo (via Sin Asesor
// Asignado), igual que el resto de bajas sin AT vigente.
function metricsIsTiendaEntrenamientoOperacionesD2(tienda) {
  const t = String(tienda || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/\s+/g, ' ').trim();
  if (/^ENTRENAMIENTO OAXACA(\s+(I|II|III|IV|V|VI|VII|VIII|IX|X|\d+))?$/.test(t)) return true;
  if (/^OPERACIONES\s+\d+\s+OAXACA$/.test(t)) return true;
  return false;
}
// isCompleta/isIncompleta/isCritica de dashboard-3.html: clasificación por
// texto de Estatus, no por umbral numérico sobre el aprovechamiento crudo.
function metricsClasificaAprovechamiento(estatus) {
  const s = metricsNormText(estatus);
  if (s.includes('CRIT')) return 'criticas';
  if (s.includes('INCOMPLETO')) return 'incompletas';
  if (s.includes('COMPLETO')) return 'completas';
  return null;
}
// hasTreoHeaderValues()/coerceTreoRows() de dashboard-7.html: la hoja
// Dashboard_7_Semanal tiene un problema de exportación de Google donde el
// encabezado real termina pegado como texto dentro de las celdas de la
// primera fila de datos (parseCSV detecta como "encabezado" otra fila
// distinta, con columnas tipo "_buffer_..."). Sin esta corrección,
// metricsFindKey()/metricsFindDataKey() buscan sobre encabezados
// corruptos y pueden emparejar la columna equivocada.
function metricsNormKeyD7(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}
function metricsHasTreoHeaderValues(row) {
  const values = Object.values(row || {}).map(v => metricsNormKeyD7(v));
  const hits = ['zona', 'plaza', 'tienda', 'id_tienda', 'at_ro', 'estructura_sap', 'movimiento_inicial']
    .filter(h => values.includes(h)).length;
  return hits >= 4;
}
function metricsCoerceTreoRows(rows) {
  if (!Array.isArray(rows) || !rows.length) return [];
  if (!metricsHasTreoHeaderValues(rows[0])) return rows;
  const sourceKeys = Object.keys(rows[0]);
  const headers = sourceKeys.map((key, idx) => {
    const value = String(rows[0][key] || '').trim();
    return value || `col_${idx + 1}`;
  });
  return rows.slice(1).map(raw => {
    const out = {};
    sourceKeys.forEach((key, idx) => { out[headers[idx]] = raw[key]; });
    return out;
  });
}
// Estructura diaria para TREO: se calcula desde Dashboard_1_Diario, no desde
// la captura manual de Dashboard_7_Semanal. SAP = conteo de posiciones por
// CR/tienda; Activos = filas con Empleados; Vacantes = SAP - Activos. Solo
// usa el mes mas reciente publicado en la hoja diaria.
//
// Depende de que el panel admin publique la columna "Empleados" en
// Dashboard_1_Diario (ver dashboard-definitions.js, key 'd1') — si esa hoja
// no trae esa columna (porque no se ha vuelto a publicar con el Excel de
// Estructura que si la trae), empleadoKey sale vacio y TODAS las filas
// cuentan como "sin empleado", inflando Vacantes a cada posicion. Por eso
// metricsBuildActivosPorCR() exige empleadoKey antes de usar este calculo.
function metricsNormTiendaD7(value) {
  return metricsCleanKey(String(value || '').replace(/^OXXO\s+/i, '').trim());
}
async function metricsBuildEstructuraDiariaD1() {
  const rows = await fetchSheetData(SHEETS_CONFIG.TABS.d1);
  const out = { byCr: new Map(), byTienda: new Map(), periodo: '', total: 0, ready: false };
  if (!rows || !rows.length) return out;
  const mesKey = metricsFindKey(rows[0], ['Mes']);
  const fechaKey = metricsFindKey(rows[0], ['Fecha']);
  const tiendaKey = metricsFindKey(rows[0], ['Unidad org', 'Unidad org/', 'Tienda', 'Nombre Tienda']);
  const crKey = metricsFindKey(rows[0], ['CR TIENDA', 'CR', 'ID Tienda', 'ID_Tienda']);
  const empleadoKey = metricsFindKey(rows[0], ['Empleados', 'Empleado', 'Nombre del empleado', 'Nombre empleado', 'Nombre del empleado o candidato']);
  const puestoKey = metricsFindKey(rows[0], ['Descripcion de Posicion', 'Descripcion Posicion', 'Puesto']);
  if (!empleadoKey) return out;
  const { mes, rows: latestRows } = metricsFilterLatestMonth(rows, r => metricsRowMonthKeyD1(r, mesKey, fechaKey));
  out.periodo = mes;
  let empleadosDetectados = 0;
  latestRows.forEach(r => {
    const cr = String(metricsVal(r, crKey) || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    const tienda = metricsNormTiendaD7(metricsVal(r, tiendaKey));
    if (!cr && !tienda) return;
    // Posiciones de Incapacidad (Ayudante/Encargado/Lider Incapacidad) no son
    // estructura real para TREO: se excluyen del conteo por completo (ni SAP
    // ni Activos), igual que buildEstructuraDiaria() en dashboard-7.html. Sin
    // este filtro, esta version "compartida" inflaba el SAP recalculado por
    // tienda/CR y reclasificaba Alineada/Subir/Bajar distinto al dashboard
    // real (se detecto una diferencia de decenas de tiendas en una revision).
    if (puestoKey && metricsCleanKey(metricsVal(r, puestoKey)).includes('incapacidad')) return;
    const empleado = String(metricsVal(r, empleadoKey) || '').trim();
    if (empleado) empleadosDetectados++;
    const add = target => {
      if (!target) return;
      target.sap = (target.sap || 0) + 1;
      if (empleado) target.activos = (target.activos || 0) + 1;
    };
    if (cr) { if (!out.byCr.has(cr)) out.byCr.set(cr, { sap: 0, activos: 0 }); add(out.byCr.get(cr)); }
    if (tienda) { if (!out.byTienda.has(tienda)) out.byTienda.set(tienda, { sap: 0, activos: 0 }); add(out.byTienda.get(tienda)); }
    out.total++;
  });
  out.byCr.forEach(v => { v.vacantes = Math.max(0, (v.sap || 0) - (v.activos || 0)); });
  out.byTienda.forEach(v => { v.vacantes = Math.max(0, (v.sap || 0) - (v.activos || 0)); });
  // Si la hoja trae la columna "Empleados" pero ningun valor viene lleno, el
  // publish no trajo datos reales todavia (esquema nuevo, contenido viejo):
  // se marca "no listo" para que los consumidores no muestren 0 en Activos
  // por error.
  out.ready = out.total > 0 && empleadosDetectados > 0;
  return out;
}
async function metricsBuildActivosPorCR() {
  const estructura = await metricsBuildEstructuraDiariaD1();
  const map = new Map();
  if (!estructura.ready) return map;
  estructura.byCr.forEach((v, cr) => map.set(cr, v.activos || 0));
  return map;
}
// Semana más reciente por orden NUMÉRICO de los dígitos del texto (ej.
// "Sem 28" -> 28), igual que dashboard-6.html — un orden de texto simple
// falla entre semanas de una y dos cifras (ej. "Sem 9" > "Sem 28"
// alfabéticamente).
function metricsLatestSemanaNumerica(rows, semanaKey) {
  const semanas = [...new Set(rows.map(r => String(metricsVal(r, semanaKey) || '').trim()).filter(Boolean))]
    .sort((a, b) => (parseInt(a.replace(/\D+/g, ''), 10) || 0) - (parseInt(b.replace(/\D+/g, ''), 10) || 0));
  return semanas[semanas.length - 1] || '';
}

// ─────────────────────────────────────────────────────────────
// DESGLOSES POR ASESOR (para exportables tipo "Indicadores ATs")
//
// Mismas reglas ya verificadas de Vacantes/Aprovechamiento/TREO, pero
// agrupadas por TODOS los asesores (no solo el top 15 de un ranking), para
// cruzarlas contra una lista externa de nombres (ej. un Excel de
// indicadores llenado a mano con columnas por AT).

// Empareja un nombre corto (ej. "Adrian") contra la lista de asesores
// reales buscando coincidencia de PALABRA COMPLETA (no substring), ya que
// el nombre corto puede ser cualquier palabra del nombre completo, no solo
// la primera (ej. "Jorge Adrian Posadas Lopez" para "Adrian").
function metricsMatchShortName(shortName, fullNames) {
  const target = metricsNormText(shortName).trim();
  if (!target) return null;
  for (const full of fullNames) {
    const words = metricsNormText(full).split(/\s+/).filter(Boolean);
    if (words.includes(target)) return full;
  }
  return null;
}

// ── "Rows" reutilizables: la misma base filtrada (catalogo, timoteo,
// defaults, mes/fecha mas reciente) que usan dataD1/dataD2/dataD3/dataD7 en
// admin-pptx-rae.js, expuesta aqui para que CUALQUIER consumidor nuevo
// (rankings, totales por asesor, detalle de un asesor especifico, etc.)
// parta del mismo conjunto de filas ya verificado en vez de tener que
// reimplementar el pipeline de filtros otra vez.

// Filas de Dashboard 1 (Vacantes) ya filtradas al mes mas reciente con los
// 3 defaults reales del dashboard. allMonths=true se salta ese ultimo
// filtro y regresa TODOS los meses cargados (usado por Mi Tienda para el
// desglose historico por mes; el resto de los llamadores no lo pasan y
// siguen viendo solo el mes vigente, sin cambios).
async function metricsD1Rows(allMonths = false) {
  const raw = await fetchSheetData(SHEETS_CONFIG.TABS.d1);
  if (!raw || !raw.length) return null;
  const mesKey = metricsFindKey(raw[0], ['Mes']);
  const puestoKey = metricsFindKey(raw[0], ['Descripcion de Posicion', 'Puesto']);
  const asesorKey = metricsFindKey(raw[0], ['Asesor']);
  const tiendaKey = metricsFindKey(raw[0], ['Tienda', 'Unidad org']);
  const crKey = metricsFindKey(raw[0], ['CR TIENDA', 'CR']);
  const fechaKey = metricsFindKey(raw[0], ['Fecha']);
  const statusKey = metricsFindKey(raw[0], ['Status ocupacion', 'Status ocupación', 'Estatus ocupacion']);
  const empleadoKey = metricsFindKey(raw[0], ['Empleados', 'Empleado', 'Nombre del empleado', 'Nombre empleado']);
  const diasKey = metricsFindKey(raw[0], ['Dias Vacantes', 'Dias_Vacantes']);
  const asesorCatalog = await loadAsesorCatalog();
  const stepCatalog = raw
    .filter(r => metricsIsVacanteSourceD1(r, { statusKey, empleadoKey }))
    .filter(r => String(metricsVal(r, tiendaKey) || '').trim() && String(metricsVal(r, tiendaKey) || '').trim() !== 'Sin tienda')
    .filter(r => isTiendaValid(asesorCatalog, metricsVal(r, tiendaKey), metricsVal(r, crKey)))
    .map(r => {
      const copy = { ...r };
      // applyAsesorCatalog ya aplica la regla completa (Sin Asesor -> Timoteo,
      // salvo Entrenamiento/Operaciones), no hace falta el chequeo previo.
      applyAsesorCatalog(copy, asesorCatalog, { asesorKey, tiendaKey, crKey });
      return copy;
    });
  const base = metricsApplyD1Defaults(stepCatalog, { tiendaKey, asesorKey, puestoKey, diasKey });
  if (allMonths) return { rows: base, mes: '', asesorKey, puestoKey, tiendaKey, mesKey, fechaKey };
  // El corte vigente se determina con la fuente completa del alcance, no con
  // las vacantes que sobrevivieron los filtros. Si el mes actual tiene cero
  // vacantes operativas (caso real: Tuxtla, agosto 2026), elegir el ultimo mes
  // dentro de `base` podia retroceder silenciosamente a un periodo anterior.
  const mes = metricsFilterLatestMonth(raw, r => metricsRowMonthKeyD1(r, mesKey, fechaKey)).mes;
  const rows = mes ? base.filter(r => metricsRowMonthKeyD1(r, mesKey, fechaKey) === mes) : base;
  return { rows, mes, asesorKey, puestoKey, tiendaKey, mesKey, fechaKey };
}

// Vacantes por Asesor: mismo pipeline verificado de dataD1(), pero regresa
// TODOS los asesores (no solo el top N de un ranking).
async function metricsVacantesPorAsesor() {
  const d1 = await metricsD1Rows();
  if (!d1) return new Map();
  const map = new Map();
  d1.rows.forEach(r => {
    const name = String(metricsVal(r, d1.asesorKey) || '').trim();
    if (!name) return;
    map.set(name, (map.get(name) || 0) + 1);
  });
  return map;
}

// Filas de Dashboard 3 (Aprovechamiento) ya filtradas al corte de fecha
// mas reciente.
async function metricsD3Rows() {
  const raw = await fetchSheetData(SHEETS_CONFIG.TABS.d3);
  if (!raw || !raw.length) return null;
  const estatusKey = metricsFindKey(raw[0], ['Clas Aprov', 'Estatus Con impacto Ausentismo', 'Estatus']);
  const asesorKey = metricsFindKey(raw[0], ['Asesor']);
  const fechaKey = metricsFindKey(raw[0], ['Mes Semana', 'Semana', 'Fecha', 'FECHA']);
  const fechas = [...new Set(raw.map(r => String(r[fechaKey] || '').trim()).filter(Boolean))].sort();
  const fecha = fechas.slice(-1)[0] || '';
  const rows = fecha ? raw.filter(r => String(r[fechaKey] || '').trim() === fecha) : raw;
  return { rows, fecha, asesorKey, estatusKey };
}

// Aprovechamiento por AT (Dashboard 3): mismo pipeline verificado de
// dataD3() — EC% (completas/total) por asesor. (El cruce por columna
// 'AT'/'Ec por AT' de la hoja, cuando existe, sigue siendo exclusivo de la
// Presentación RAE porque ahi el ranking se muestra tal cual viene esa
// columna; aqui se necesita un numero por CADA asesor para cruzar contra
// listas externas, y ese cruce siempre esta disponible via Estatus, a
// diferencia de 'Ec por AT' que no siempre viene poblada.)
async function metricsAprovechamientoPorAT() {
  const d3 = await metricsD3Rows();
  if (!d3) return new Map();
  const byAsesor = new Map();
  d3.rows.forEach(r => {
    const name = String(metricsVal(r, d3.asesorKey) || '').trim();
    if (!name) return;
    if (!byAsesor.has(name)) byAsesor.set(name, { total: 0, completas: 0 });
    const acc = byAsesor.get(name);
    acc.total++;
    if (metricsClasificaAprovechamiento(metricsVal(r, d3.estatusKey)) === 'completas') acc.completas++;
  });
  const map = new Map();
  byAsesor.forEach((v, name) => map.set(name, v.total > 0 ? v.completas / v.total : 0));
  return map;
}

// Filas de Dashboard 2 (Bajas) ya filtradas por BAJA/Oaxaca y al mes mas
// reciente, igual que dataD2() en admin-pptx-rae.js.
async function metricsD2Rows() {
  const raw = await fetchSheetData(SHEETS_CONFIG.TABS.d2);
  if (!raw || !raw.length) return null;
  const mesKey = metricsFindKey(raw[0], ['Mes']);
  const asesorKey = metricsFindKey(raw[0], ['Asesor']);
  const puestoKey = metricsFindKey(raw[0], ['Puesto']);
  const medidaKey = metricsFindKey(raw[0], ['Denominación Medida', 'Denominacion Medida', 'Medida', 'Med.']);
  const plazaKey = metricsFindKey(raw[0], ['Plaza']);
  const fechaKey = metricsFindKey(raw[0], ['Fecha']);
  const asesorCrudoOk = raw.filter(r => String(metricsVal(r, asesorKey) || '').trim() && metricsNormText(metricsVal(r, asesorKey)).replace(/[^A-Z]/g, '') !== 'TIMOTEOANTONIOPEREZ');
  const base = metricsFilterBajasD2(asesorCrudoOk, { medidaKey, plazaKey });
  const { mes, rows: byMonth } = metricsFilterLatestMonth(base, r => metricsRowMonthKeyD2(r, mesKey, fechaKey));
  const rows = byMonth.filter(r => {
    const asesor = metricsNormText(metricsVal(r, asesorKey));
    if (!asesor || asesor.includes('SIN ASESOR')) return false;
    return metricsTipoPuesto(metricsVal(r, puestoKey)) !== 'Otro';
  });
  return { rows, mes, asesorKey, puestoKey };
}

// Filas de Dashboard 7 (TREO) ya filtradas por catalogo y timoteo.
async function metricsD7Rows() {
  const rawSheet = await fetchSheetData(SHEETS_CONFIG.TABS.s7);
  const raw = metricsCoerceTreoRows(rawSheet);
  if (!raw || !raw.length) return null;
  const difKey = metricsFindDataKey(raw, ['Dif SAP vs Est Optima Final'], 25, true);
  const treoKey = metricsFindDataKey(raw, ['Estructura Propuesta TREO P2 Jun - Ago', 'TREO'], 25, true);
  const sapKey = metricsFindDataKey(raw, ['Estructura SAP', 'SAP'], 25, true);
  const activosKey = metricsFindDataKey(raw, ['Empleados Activos', 'Activos'], 25, true);
  const vacantesKey = metricsFindDataKey(raw, ['Vacantes'], 25, true);
  const asesorKey = metricsFindDataKey(raw, ['Asesor']);
  const tiendaKey = metricsFindDataKey(raw, ['Tienda', 'Nombre Tienda', 'Unidad', 'Unidad Org', 'Unidad Organizativa']);
  const crKey = metricsFindDataKey(raw, ['CR', 'ID Tienda', 'ID_Tienda']);
  const asesorCatalog = await loadAsesorCatalog();
  const estructuraD1 = await metricsBuildEstructuraDiariaD1();
  const rows = raw
    .filter(r => String(metricsVal(r, tiendaKey) || '').trim() || String(metricsVal(r, asesorKey) || '').trim())
    .filter(r => isTiendaValid(asesorCatalog, metricsVal(r, tiendaKey), metricsVal(r, crKey)))
    .filter(r => metricsNormText(metricsVal(r, asesorKey)).replace(/[^A-Z]/g, '') !== 'TIMOTEOANTONIOPEREZ')
    .map(r => {
      if (!estructuraD1.ready) return r;
      const cr = String(metricsVal(r, crKey) || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      const tienda = metricsNormTiendaD7(metricsVal(r, tiendaKey));
      const src = (cr && estructuraD1.byCr.get(cr)) || (tienda && estructuraD1.byTienda.get(tienda));
      if (!src) return r;
      const next = { ...r };
      const sap = src.sap || 0;
      const activos = src.activos || 0;
      const vacantes = Math.max(0, sap - activos);
      const treo = metricsNum(metricsVal(r, treoKey));
      const dif = treo - sap;
      if (sapKey) next[sapKey] = sap;
      if (activosKey) next[activosKey] = activos;
      if (vacantesKey) next[vacantesKey] = vacantes;
      if (difKey) next[difKey] = dif;
      return next;
    });
  return { rows, difKey, treoKey, sapKey, activosKey, vacantesKey, asesorKey, tiendaKey };
}

// Alineación de estructura por Asesor (Dashboard 7/TREO): mismo pipeline
// verificado de dataD7() — agrupando el % de tiendas Alineadas (Dif===0)
// por asesor en vez de un solo total.
async function metricsAlineacionPorAsesor() {
  const d7 = await metricsD7Rows();
  if (!d7) return new Map();
  const byAsesor = new Map();
  d7.rows.forEach(r => {
    const name = String(metricsVal(r, d7.asesorKey) || '').trim();
    if (!name) return;
    if (!byAsesor.has(name)) byAsesor.set(name, { total: 0, alineadas: 0 });
    const acc = byAsesor.get(name);
    acc.total++;
    if (metricsNum(metricsVal(r, d7.difKey)) === 0) acc.alineadas++;
  });
  const map = new Map();
  byAsesor.forEach((v, name) => map.set(name, v.total > 0 ? v.alineadas / v.total : 0));
  return map;
}

// ─────────────────────────────────────────────────────────────
// FUNCIÓN: Filtro de Asesor con buscador y multi-seleccion (combobox)
// Reemplaza un <select> simple por el mismo combobox que ya usaban
// Dashboard 1 y 2. onChange recibe: null (todos seleccionados, sin filtro
// manual) o un array de valores seleccionados (puede ser []).
// options.excludeFromAll: valores que NO se marcan por defecto al montar
// (p.ej. "Sin Asesor Asignado"), igual que defaultAsesorSelection() en D2.
function mountAsesorFilter(rootId, values, options = {}) {
  const root = document.getElementById(rootId);
  if (!root) return null;
  const excludeFromAll = new Set(options.excludeFromAll || []);
  const onChange = typeof options.onChange === 'function' ? options.onChange : () => {};
  const allLabel = options.allLabel || 'Todos los asesores';

  let allValues = Array.from(new Set(values || [])).sort((a, b) => String(a).localeCompare(String(b), 'es'));
  let selected = allValues.filter((v) => !excludeFromAll.has(v));

  root.innerHTML = `
    <div class="smart-filter" id="${rootId}-filter">
      <button class="smart-filter__button" type="button" id="${rootId}-button">
        <span class="smart-filter__label" id="${rootId}-label">${allLabel}</span>
        <span class="smart-filter__chev">▾</span>
      </button>
      <div class="smart-filter__menu" id="${rootId}-menu">
        <input class="smart-filter__search" id="${rootId}-search" type="search" placeholder="Buscar..." autocomplete="off">
        <div class="smart-filter__list" id="${rootId}-options"></div>
      </div>
    </div>`;

  const wrap = document.getElementById(`${rootId}-filter`);
  const button = document.getElementById(`${rootId}-button`);
  const label = document.getElementById(`${rootId}-label`);
  const menu = document.getElementById(`${rootId}-menu`);
  const search = document.getElementById(`${rootId}-search`);
  const list = document.getElementById(`${rootId}-options`);

  function updateLabel() {
    const total = allValues.length;
    const n = selected.length;
    if (n === total) label.textContent = allLabel;
    else if (n === 0) label.textContent = 'Ninguno seleccionado';
    else if (n === 1) label.textContent = OXXO.truncate(selected[0], 24);
    else label.textContent = `${n} seleccionados`;
  }

  function renderOptions(query = '') {
    const q = String(query || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const filtered = allValues.filter((v) => !q || String(v).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(q));
    const allSelected = selected.length === allValues.length;
    const rows = [{ value: '', label: allLabel, isAll: true }]
      .concat(filtered.map((v) => ({ value: v, label: v, isAll: false })))
      .map((opt) => {
        const active = opt.isAll ? allSelected : selected.includes(opt.value);
        return `<button type="button" class="smart-filter__option ${active ? 'is-active' : ''}" data-value="${escapeAttr(opt.value)}" data-all="${opt.isAll ? '1' : ''}">
          <span class="smart-filter__check"></span>
          <span>${escapeAttr(opt.label)}</span>
        </button>`;
      }).join('');
    list.innerHTML = rows || '<div class="smart-filter__empty">Sin resultados</div>';
  }

  function emitChange() {
    updateLabel();
    onChange(selected.length === allValues.length ? null : selected.slice());
  }

  list.addEventListener('click', (event) => {
    const optBtn = event.target.closest('.smart-filter__option');
    if (!optBtn) return;
    if (optBtn.dataset.all) {
      const allSelected = selected.length === allValues.length;
      selected = allSelected ? [] : allValues.slice();
    } else {
      const value = optBtn.dataset.value;
      // Si actualmente esta todo seleccionado (estado implicito "Todos"), un clic en un
      // asesor puntual selecciona SOLO ese (en vez de solo quitarlo del grupo completo,
      // lo cual obligaba a deseleccionar uno por uno para quedarse con uno solo).
      if (selected.length === allValues.length) {
        selected = [value];
      } else {
        const set = new Set(selected);
        if (set.has(value)) set.delete(value); else set.add(value);
        selected = allValues.filter((v) => set.has(v));
      }
    }
    renderOptions(search.value);
    emitChange();
  });

  search.addEventListener('input', () => renderOptions(search.value));

  button.addEventListener('click', (event) => {
    event.stopPropagation();
    const isOpen = wrap.classList.toggle('open');
    if (isOpen) { renderOptions(''); search.value = ''; setTimeout(() => search.focus(), 0); }
  });

  document.addEventListener('click', (event) => {
    if (!wrap.contains(event.target)) wrap.classList.remove('open');
  });

  renderOptions('');
  updateLabel();

  return {
    getSelected: () => (selected.length === allValues.length ? null : selected.slice()),
    setValues(newValues, opts = {}) {
      allValues = Array.from(new Set(newValues || [])).sort((a, b) => String(a).localeCompare(String(b), 'es'));
      if (opts.resetSelection) selected = allValues.filter((v) => !excludeFromAll.has(v));
      else selected = selected.filter((v) => allValues.includes(v));
      renderOptions(search.value);
      updateLabel();
    },
    reset() {
      selected = allValues.filter((v) => !excludeFromAll.has(v));
      renderOptions(search.value);
      emitChange();
    },
  };
}

// ─────────────────────────────────────────────────────────────
// FUNCIÓN: Botón de descarga de archivo por dashboard
// Lee la columna 'archivo_url' (y opcionalmente 'archivo_nombre') de la fila
// correspondiente en la pestaña Configuracion. Si el admin sube un archivo (p.ej.
// a Google Drive con acceso "cualquiera con el link") y pega ese link en el Sheet,
// el botón aparece automáticamente — sin tocar código. Si no hay link, no se muestra nada.
async function renderDownloadButton(elId, dashboardId, badgeClass = 'hero-badge') {
  const el = document.getElementById(elId);
  if (!el) return;
  try {
    const config = await loadSystemConfig();
    const data = config[dashboardId];
    const url = data && data.archivo_url;
    if (!url) return;
    const label = data.archivo_nombre ? data.archivo_nombre : 'Descargar archivo';
    el.innerHTML = `<a class="${escapeAttr(badgeClass)} hero-download-link" href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">⬇ ${escapeAttr(label)}</a>`;
    el.style.display = '';
  } catch (e) {
    // Silencioso: si falla la carga de configuración, simplemente no se muestra el botón.
  }
}

// Exportar para uso global (disponible en todos los dashboards)
// ─────────────────────────────────────────────────────────────
// AVISOS OPERATIVOS — publicados desde el Panel Admin
// ─────────────────────────────────────────────────────────────
function getSystemNoticeContext(pathname = location.pathname) {
  const file = String(pathname || '').replace(/\\/g, '/').split('/').pop().replace(/\.html$/i, '') || 'index';
  let area = '';
  if (['dashboard-14', 'promociones'].includes(file)) area = 'comercial';
  else if (['dashboard-9', 'dashboard-9-analisis', 'inventarios'].includes(file)) area = 'administrativo';
  else if (/^dashboard-(?:[1-8]|1[0-3])(?:-analisis)?$/.test(file) || ['mi-tienda', 'mi-dashboard'].includes(file)) area = 'rh';
  return { page: file, area };
}

function systemNoticeMatches(notice, context = getSystemNoticeContext()) {
  const target = String(notice?.target || 'global').toLowerCase();
  return target === 'global' || target === `dashboard:${context.page}` || Boolean(context.area && target === `area:${context.area}`);
}

function ensureSystemNoticeStyles() {
  if (document.getElementById('oxxo-system-notice-styles')) return;
  const style = document.createElement('style');
  style.id = 'oxxo-system-notice-styles';
  style.textContent = `.system-notices{width:min(1560px,calc(100% - 32px));margin:14px auto;display:grid;gap:9px;position:relative;z-index:80}.system-notice{--notice:#12608f;--notice-soft:#edf7fc;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:start;gap:12px;border:1px solid color-mix(in srgb,var(--notice) 24%,white);border-left:5px solid var(--notice);border-radius:15px;background:color-mix(in srgb,var(--notice-soft) 86%,white);padding:13px 15px;box-shadow:0 10px 28px color-mix(in srgb,var(--notice) 10%,transparent);color:#263239}.system-notice.warn{--notice:#d88800;--notice-soft:#fff8e9}.system-notice.critical{--notice:#d51e29;--notice-soft:#fff0f0}.system-notice__icon{display:grid;place-items:center;width:27px;height:27px;border-radius:50%;background:var(--notice);color:#fff;font-weight:950}.system-notice strong{display:block;color:#211312;font-size:13px}.system-notice p{margin:3px 0 0;font-size:12px;font-weight:650;line-height:1.4}.system-notice small{display:block;margin-top:5px;color:#746662;font-size:9.5px;font-weight:750}.system-notice__close{border:0;border-radius:50%;width:29px;height:29px;background:rgba(255,255,255,.78);color:#695854;font-size:18px;line-height:1;cursor:pointer}@media(max-width:640px){.system-notices{width:calc(100% - 20px);margin:10px auto}.system-notice{grid-template-columns:auto minmax(0,1fr);padding:12px}.system-notice__close{position:absolute;right:7px;margin-top:-5px}.system-notice__copy{padding-right:23px}}`;
  document.head.appendChild(style);
}

function renderSystemNotices(notices) {
  const context = getSystemNoticeContext();
  const dismissed = new Set(JSON.parse(sessionStorage.getItem('oxxo-dismissed-notices') || '[]'));
  const matching = (Array.isArray(notices) ? notices : []).filter((notice) => systemNoticeMatches(notice, context) && !dismissed.has(notice.id)).slice(0, 3);
  document.getElementById('oxxo-system-notices')?.remove();
  if (!matching.length) return;
  ensureSystemNoticeStyles();
  const host = document.createElement('section');
  host.id = 'oxxo-system-notices';
  host.className = 'system-notices';
  host.setAttribute('aria-live', 'polite');
  host.innerHTML = matching.map((notice) => {
    const type = ['warn', 'critical'].includes(notice.type) ? notice.type : 'info';
    const icon = type === 'critical' ? '!' : type === 'warn' ? '!' : 'i';
    const expiry = notice.endsAt ? `<small>Vigente hasta ${escHtml(new Date(notice.endsAt).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }))}</small>` : '';
    return `<article class="system-notice ${type}" data-system-notice="${escHtml(notice.id)}"><span class="system-notice__icon" aria-hidden="true">${icon}</span><div class="system-notice__copy"><strong>${escHtml(notice.title)}</strong><p>${escHtml(notice.message)}</p>${expiry}</div><button class="system-notice__close" type="button" aria-label="Cerrar aviso">×</button></article>`;
  }).join('');
  const anchor = document.querySelector('.topbar, header');
  if (anchor?.parentNode) anchor.insertAdjacentElement('afterend', host);
  else document.body.prepend(host);
  host.addEventListener('click', (event) => {
    const close = event.target.closest('.system-notice__close');
    if (!close) return;
    const card = close.closest('[data-system-notice]');
    dismissed.add(card.dataset.systemNotice);
    sessionStorage.setItem('oxxo-dismissed-notices', JSON.stringify([...dismissed]));
    card.remove();
    if (!host.children.length) host.remove();
  });
}

async function refreshSystemNotices() {
  if (/\/admin\.html$/i.test(location.pathname) || !SHEETS_CONFIG.ADMIN_UPLOAD_URL) return [];
  try {
    const separator = SHEETS_CONFIG.ADMIN_UPLOAD_URL.includes('?') ? '&' : '?';
    const response = await fetch(`${SHEETS_CONFIG.ADMIN_UPLOAD_URL}${separator}action=notices&_=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const result = await response.json();
    if (result.ok === false) throw new Error(result.error || 'No fue posible consultar avisos');
    renderSystemNotices(result.notices || []);
    return result.notices || [];
  } catch (error) {
    console.warn('[OXXO] Avisos no disponibles:', error.message || error);
    return [];
  }
}

function initScopeSelector() {
  // Un dashboard de plaza fija no debe ofrecer un control que aparenta
  // cambiar el origen de sus datos.
  if (getPageFixedDataScope()) {
    applyScopeLabels();
    return;
  }
  const catalog = getScopeCatalog();
  if (!catalog.length) return;
  // El portal (index.html) muestra el resumen de todos los dashboards, no los
  // datos de una plaza en particular: el control de Alcance solo tiene
  // sentido dentro de cada dashboard, no aqui.
  const hideWidget = Boolean(document.documentElement?.dataset?.oxxoHideScopeWidget);
  if (!hideWidget && !document.querySelector('[data-oxxo-scope-selector]')) {
    const active = getActiveDataScope();
    const isActivePlaza = (plaza) => active.level !== 'region' && normalizeScopeToken(active.plaza) === normalizeScopeToken(plaza.name);
    // Preferimos montarlo dentro del encabezado (junto al badge "Diario ·
    // Plaza") de cada dashboard, como el resto de sus controles. Solo si la
    // pagina no tiene ese encabezado (ej. paginas con layout propio) cae al
    // recuadro flotante de siempre.
    let heroRow = document.querySelector('[data-oxxo-scope-mount]');
    if (!heroRow) heroRow = document.querySelector('.hero-top');
    if (!heroRow) heroRow = document.querySelector('.hero:has(> .hero-badge)');
    const inline = Boolean(heroRow);
    const host = document.createElement('div');
    host.className = `oxxo-scope-selector ${inline ? 'oxxo-scope-selector--inline' : 'oxxo-scope-selector--floating'}`;
    host.dataset.oxxoScopeSelector = 'true';
    host.dataset.area = getSystemNoticeContext().area || 'general';
    host.innerHTML = `
      <div class="oxxo-scope-selector__intro">
        <span class="oxxo-scope-selector__pin" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M20 10c0 5.4-8 11-8 11S4 15.4 4 10a8 8 0 1 1 16 0Z"></path><circle cx="12" cy="10" r="2.5"></circle></svg></span>
        <span class="oxxo-scope-selector__label"><strong>Plaza activa</strong><small>Cambiar vista</small></span>
      </div>
      <div class="oxxo-scope-switch" role="tablist" aria-label="Seleccionar plaza">
        ${catalog.map((region) => region.plazas.map((plaza) => `<button type="button" class="oxxo-scope-switch__opt${isActivePlaza(plaza) ? ' is-active' : ''}" role="tab" aria-selected="${isActivePlaza(plaza)}" data-scope="plaza|${escHtml(region.name)}|${escHtml(plaza.name)}"><span class="oxxo-scope-switch__dot" aria-hidden="true"></span><span>${escHtml(plaza.shortName || plaza.name)}</span></button>`).join('')).join('')}
      </div>`;
    if (!document.getElementById('oxxo-scope-selector-style')) {
      const style = document.createElement('style');
      style.id = 'oxxo-scope-selector-style';
      style.textContent = `
        .oxxo-scope-selector{--scope-accent:#d81928;display:flex;align-items:center;gap:9px;font-family:inherit;color:#342927;background:rgba(255,255,255,.95) !important;border:1px solid rgba(255,255,255,.72) !important;box-shadow:0 12px 30px rgba(70,24,24,.16),inset 0 1px 0 #fff}
        .oxxo-scope-selector[data-area="comercial"]{--scope-accent:#126b95}
        .oxxo-scope-selector[data-area="administrativo"]{--scope-accent:#69539d}
        .oxxo-scope-selector--floating{position:fixed;right:18px;bottom:18px;z-index:9990;max-width:min(760px,calc(100vw - 36px));padding:8px;border-radius:18px}
        .oxxo-scope-selector--inline{position:relative;z-index:1;margin-left:auto;padding:7px;border-radius:18px}
        .oxxo-scope-selector__intro{display:flex;align-items:center;gap:8px;padding:0 8px 0 3px;flex:0 0 auto}
        .oxxo-scope-selector__pin{display:grid;place-items:center;width:30px;height:30px;border-radius:10px;color:var(--scope-accent);background:color-mix(in srgb,var(--scope-accent) 10%,white)}
        .oxxo-scope-selector__pin svg{width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}
        .oxxo-scope-selector__label{display:flex;flex-direction:column;line-height:1.05;white-space:nowrap;text-align:left}
        .oxxo-scope-selector__label strong{color:#302422;font-size:10px;font-weight:900;letter-spacing:.075em;text-transform:uppercase}
        .oxxo-scope-selector__label small{margin-top:3px;color:#907f7b;font-size:8.5px;font-weight:750;letter-spacing:.025em}
        .oxxo-scope-switch{display:flex;align-items:center;flex-wrap:nowrap;gap:3px;padding:4px;border-radius:13px;background:#f3efed;box-shadow:inset 0 1px 3px rgba(50,29,27,.07);overflow-x:auto;scrollbar-width:none}
        .oxxo-scope-switch::-webkit-scrollbar{display:none}
        .oxxo-scope-switch__opt{appearance:none;display:inline-flex;align-items:center;justify-content:center;gap:6px;flex:0 0 auto;border:0;border-radius:10px;padding:8px 11px;color:#6d605d !important;background:transparent !important;font:800 10.5px/1.1 inherit;letter-spacing:.01em;white-space:nowrap;cursor:pointer;box-shadow:none !important;transition:background .18s ease,color .18s ease,transform .12s ease,box-shadow .18s ease}
        .oxxo-scope-switch__dot{width:6px;height:6px;border-radius:50%;background:#c9bfbc;box-shadow:0 0 0 2px rgba(255,255,255,.7)}
        .oxxo-scope-switch__opt:hover{color:#312725 !important;background:#fff !important}
        .oxxo-scope-switch__opt.is-active{color:#fff !important;background:linear-gradient(135deg,color-mix(in srgb,var(--scope-accent) 82%,#fff),var(--scope-accent)) !important;box-shadow:0 5px 12px color-mix(in srgb,var(--scope-accent) 30%,transparent) !important}
        .oxxo-scope-switch__opt.is-active .oxxo-scope-switch__dot{background:#fff;box-shadow:0 0 0 3px rgba(255,255,255,.22)}
        .oxxo-scope-switch__opt:active{transform:scale(.96)}
        .oxxo-scope-switch__opt:focus-visible{outline:3px solid color-mix(in srgb,var(--scope-accent) 32%,transparent);outline-offset:2px}
        @media(max-width:640px){
          .oxxo-scope-selector{align-items:stretch;gap:7px}
          .oxxo-scope-selector--floating{right:10px;bottom:10px;left:10px;flex-direction:column}
          .oxxo-scope-selector--inline{width:100%;margin-left:0;flex-direction:column;border-radius:16px}
          .oxxo-scope-selector__intro{padding:1px 3px}
          .oxxo-scope-selector__pin{width:27px;height:27px;border-radius:9px}
          .oxxo-scope-switch{width:100%;justify-content:flex-start}
          .oxxo-scope-switch__opt{padding:8px 12px}
        }
        @media print{.oxxo-scope-selector{display:none!important}}
      `;
      document.head.appendChild(style);
    }
    if (heroRow) heroRow.appendChild(host);
    else document.body.appendChild(host);
    host.querySelector('.oxxo-scope-switch').addEventListener('click', (event) => {
      const btn = event.target.closest('[data-scope]');
      if (!btn || btn.classList.contains('is-active')) return;
      const [level, region, plaza = ''] = String(btn.dataset.scope || '').split('|');
      setActiveDataScope({ level, region, plaza }, { updateUrl: true });
      clearSheetDataCache();
      if (/\/admin\.html$/i.test(location.pathname)) {
        document.getElementById('dashboard-select')?.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        location.reload();
      }
    });
  }
  applyScopeLabels();
  if (typeof MutationObserver !== 'undefined') {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'characterData') replaceScopeTextNode(mutation.target);
        mutation.addedNodes?.forEach((node) => applyScopeLabels(node));
      });
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }
}

function replaceScopeTextNode(node) {
  if (!node || node.nodeType !== 3 || !/Plaza Oaxaca/i.test(node.nodeValue || '')) return;
  const active = getActiveDataScope();
  const label = active.level === 'region' ? `Región ${active.region}` : active.plaza;
  const brand = active.level === 'region' ? `Región ${active.region}` : `${active.plaza}-ByPamsb`;
  const next = node.nodeValue
    .replace(/Plaza Oaxaca-ByPamsb/gi, brand)
    .replace(/Plaza Oaxaca/gi, label);
  // No reasignar si el texto no cambia (caso normal: alcance por defecto ya es
  // "Plaza Oaxaca"). Escribir nodeValue encola una mutacion characterData
  // aunque el valor sea identico, y el MutationObserver de abajo la vuelve a
  // procesar: sin este guardado se reescribe a si mismo en un bucle infinito
  // que congela la pestana (visto en produccion: CPU al 100% y el dashboard
  // nunca termina de cargar).
  if (next !== node.nodeValue) node.nodeValue = next;
}

function applyScopeLabels(root = document.body) {
  if (!root) return;
  if (root.nodeType === 3) return replaceScopeTextNode(root);
  if (root.nodeType !== 1 || ['SCRIPT', 'STYLE', 'OPTION', 'SELECT'].includes(root.tagName)) return;
  // Salida rapida antes del TreeWalker: el MutationObserver de abajo llama
  // esto por cada nodo agregado al DOM, incluida cada fila cuando una tabla
  // grande se reconstruye entera (ej. cientos de filas en Dashboard 1/8).
  // textContent es una sola lectura nativa; evita crear un TreeWalker y
  // recorrer nodo por nodo cuando ese subarbol ni siquiera menciona "Plaza
  // Oaxaca" (el caso normal para filas de datos). El titulo del documento
  // no vive dentro de root, asi que se revisa aparte, no bajo esta salida.
  if (/Plaza Oaxaca/i.test(root.textContent || '')) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        return ['SCRIPT', 'STYLE', 'OPTION', 'SELECT'].includes(node.parentElement?.tagName)
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT;
      }
    });
    let node;
    while ((node = walker.nextNode())) replaceScopeTextNode(node);
  }
  if (/Plaza Oaxaca/i.test(document.title || '')) {
    const active = getActiveDataScope();
    document.title = document.title.replace(/Plaza Oaxaca/gi, active.level === 'region' ? `Región ${active.region}` : active.plaza);
  }
}

window.OXXO = {
  SHEETS_CONFIG,
  getDataContext,
  getScopeCatalog,
  getScopeLabel,
  getPageFixedDataScope,
  normalizeDataScope,
  getActiveDataScope,
  setActiveDataScope,
  matchesScopeValue,
  matchesAnyKnownPlaza,
  rowMatchesDataScope,
  filterRowsByDataScope,
  applyDataContextDefaults,
  fetchWithTimeout,
  fetchSheetData,
  clearSheetDataCache,
  getSheetDataStatus,
  setRetryHandler,
  restoreDashboardPeriod,
  persistDashboardPeriod,
  renderDownloadButton,
  mountAsesorFilter,
  buildSheetURL,
  downloadBlob,
  downloadSheetTab,
  downloadElementAsPNG,
  initPngExportControls,
  downloadDashboardExcel,
  scrapeKpiCards,
  scrapeHtmlTable,
  rowsToCSV,
  downloadRowsAsCSV,
  handleDownloadButton,
  loadAsesorCatalog,
  loadTiendaCatalog,
  buildTiendaCatalog,
  loadReasignaciones,
  resolveAsesor,
  resolveAsesorD1,
  applyAsesorCatalog,
  isTiendaValid,
  filterValidTiendas,
  normalizeCatalogCr,
  normalizeCatalogTienda,
  fixMojibake,
  loadSystemConfig,
  showLoading,
  showError,
  showEmpty,
  formatNum,
  formatPct,
  getSemaforo,
  renderRanking,
  renderKPI,
  renderBarChart,
  renderLineChart,
  renderDonutChart,
  getChartThemeColors,
  applyChartThemeDefaults,
  ensureChartReady,
  updateFooterTime,
  initThemeToggle,
  truncate,
  escHtml,
  maxVal,
  // Métricas compartidas (ver seccion arriba de resolveAsesor/applyAsesorCatalog)
  metricsCleanKey,
  metricsFindKey,
  metricsFindKeyExact,
  metricsFindDataKey,
  metricsVal,
  metricsNum,
  metricsNormText,
  metricsTipoPuesto,
  metricsNormalizeMonthKey,
  metricsParseFecha,
  metricsMesKeyFromDate,
  metricsNormalizeMesColumnD1,
  metricsRowMonthKeyD1,
  metricsRowMonthKeyD2,
  metricsFilterLatestMonth,
  metricsIsDefaultExcludedTiendaD1,
  metricsDiasVacantesValue,
  metricsPasaAntiguedadDefaultD1,
  metricsApplyD1Defaults,
  metricsFilterBajasD2,
  metricsIsTiendaEntrenamientoOperacionesD2,
  metricsClasificaAprovechamiento,
  metricsCoerceTreoRows,
  metricsBuildEstructuraDiariaD1,
  metricsBuildActivosPorCR,
  metricsLatestSemanaNumerica,
  metricsMatchShortName,
  metricsVacantesPorAsesor,
  metricsAprovechamientoPorAT,
  metricsAlineacionPorAsesor,
  metricsD1Rows,
  metricsD2Rows,
  metricsD3Rows,
  metricsD7Rows,
  getSystemNoticeContext,
  systemNoticeMatches,
  refreshSystemNotices,
  initScopeSelector,
  applyScopeLabels,
};

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initScopeSelector, { once: true });
else initScopeSelector();

// Arranca el catalogo al mismo tiempo que cada dashboard descarga su propia
// base. Las pantallas lo esperan mas adelante para corregir asesores; iniciar
// aqui elimina esa espera secuencial sin modificar el orden del renderizado.
if (/\/dashboards\//i.test(location.pathname.replace(/\\/g, '/'))
    && !/\/(promociones|inventarios)\.html$/i.test(location.pathname)) {
  void loadAsesorCatalog().catch(() => {});
}

if (!/\/admin\.html$/i.test(location.pathname)) {
  const startSystemNotices = () => {
    void refreshSystemNotices();
    window.setInterval(() => void refreshSystemNotices(), 60000);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startSystemNotices, { once: true });
  else startSystemNotices();
}
