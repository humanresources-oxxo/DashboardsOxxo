import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const documentStub = {
  readyState: 'loading', documentElement: { dataset: {} }, body: null,
  head: { appendChild() {} }, addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
  getElementsByTagName() { return []; }, getElementById() { return null; },
  querySelector() { return null; }, querySelectorAll() { return []; },
  createElement() { return { style: {}, dataset: {}, addEventListener() {}, remove() {} }; }
};
const sandbox = {
  console, document: documentStub,
  location: {
    pathname: '/index.html', origin: 'https://humanresources-oxxo.github.io',
    href: 'https://humanresources-oxxo.github.io/DashboardsOxxo/index.html',
    search: '?scope=region&region=TABASCO'
  },
  history: { state: null, replaceState() {} },
  sessionStorage: { getItem() { return null; }, setItem() {} },
  localStorage: { getItem() { return null; }, setItem() {} }, navigator: {},
  CustomEvent: function CustomEvent() {}, URL, URLSearchParams, Request, Response, Blob,
  TextDecoder, Uint8Array, AbortController, fetch, setTimeout, clearTimeout, setInterval, clearInterval,
  Map, Set, Date, Promise
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'js/config.js'), 'utf8'), sandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'js/core.js'), 'utf8'), sandbox);

const catalog = await sandbox.OXXO.loadTiendaCatalog();
assert.equal(catalog.loaded, true, 'No se pudo construir el catalogo vivo desde Catalogo_Tiendas o TREO');
assert(catalog.rows.length >= 200, `Catalogo regional inesperadamente pequeño: ${catalog.rows.length}`);
assert.equal(new Set(catalog.rows.map(row => row.cr)).size, catalog.byCr.size);
assert.equal(catalog.rows.some(row => /entrenamiento|operaciones/i.test(row.tienda)), false);
const plazas = [...new Set(catalog.rows.map(row => row.plaza))].sort();
assert(plazas.some(plaza => /oaxaca/i.test(plaza)));

// Cobertura cruzada contra la fotografía más reciente de estructura/vacantes.
sandbox.location.search = '?scope=plaza&region=TABASCO&plaza=Plaza%20Oaxaca';
const d1Rows = await sandbox.OXXO.fetchSheetData(sandbox.OXXO.SHEETS_CONFIG.TABS.d1, { fresh: true });
const crKey = sandbox.OXXO.metricsFindDataKey(d1Rows, ['CR TIENDA', 'CR'], 25, true);
const tiendaKey = sandbox.OXXO.metricsFindDataKey(d1Rows, ['Unidad org', 'Tienda'], 25, true);
const mesKey = sandbox.OXXO.metricsFindDataKey(d1Rows, ['Mes'], 25, true);
const fechaKey = sandbox.OXXO.metricsFindDataKey(d1Rows, ['Fecha'], 25, true);
const latest = sandbox.OXXO.metricsFilterLatestMonth(d1Rows, row => sandbox.OXXO.metricsRowMonthKeyD1(row, mesKey, fechaKey));
const operational = latest.rows.filter(row => !sandbox.OXXO.metricsIsDefaultExcludedTiendaD1(row[tiendaKey]));
const currentStores = new Map();
operational.forEach(row => {
  const cr = sandbox.OXXO.normalizeCatalogCr(row[crKey]);
  const tienda = String(row[tiendaKey] || '').trim();
  if (cr || tienda) currentStores.set(cr || sandbox.OXXO.normalizeCatalogTienda(tienda), { cr, tienda });
});
// Regla "mundo abierto": una tienda ausente de TREO/catalogo se INCLUYE (TREO
// se actualiza con retraso). Aqui solo se exige que las exclusiones explicitas
// sigan funcionando; la deriva contra D1 se imprime como diagnostico.
const storeCatalog = catalog;
const valid = (tienda, cr = '') => sandbox.OXXO.isTiendaValid({ storeCatalog }, tienda, cr);

const inactivas = catalog.rows.filter(row => row.activa === false);
inactivas.forEach(row => assert.equal(valid(row.tienda, row.cr), false, `ACTIVA=NO debe rechazarse: ${row.tienda}`));

const preaperturas = ['Parador Boca del Monte VSA', 'Papaya VSA', 'Small Beach OAX VSA', 'Piedra Parada VSA', 'Gas Nopala VSA', '5 de Septiembre VSA', 'Union y Progreso VSA'];
preaperturas.forEach(tienda => assert.equal(valid(tienda), false, `la preapertura ${tienda} no debe entrar en "operativas"`));

assert.equal(valid('Tienda Nueva Inexistente en TREO 999', '99-ZZZ999'), true, 'una tienda ausente del catalogo debe aceptarse (regla de mundo abierto)');

const ausentes = [...currentStores.values()].filter(store => !(
  (store.cr && catalog.byCr.has(store.cr)) || catalog.byTienda.has(sandbox.OXXO.normalizeCatalogTienda(store.tienda))
));
const claves = tienda => sandbox.OXXO.normalizeCatalogTienda(tienda);
const clavesPreapertura = new Set(preaperturas.map(claves));
ausentes.filter(store => !clavesPreapertura.has(claves(store.tienda))).forEach(store => assert.equal(valid(store.tienda, store.cr), true, `tienda de D1 ausente del catalogo debe seguir aceptada: ${store.tienda}`));
if (ausentes.length) console.warn(`[diagnostico] ${ausentes.length} tiendas del ultimo corte D1 aun no estan en TREO/catalogo: ${ausentes.map(item => item.tienda).join(', ')}`);

console.log({ source: catalog.source, tiendas: catalog.byCr.size, plazas, periodoD1: latest.mes, tiendasD1: currentStores.size, inactivasRechazadas: inactivas.length, ausentesEnCatalogo: ausentes.length });
