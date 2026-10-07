import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const memory = new Map();
const documentStub = {
  readyState: 'loading', documentElement: { dataset: {} }, body: null,
  head: { appendChild() {} }, addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
  getElementsByTagName() { return []; }, getElementById() { return null; },
  querySelector() { return null; }, querySelectorAll() { return []; },
  createElement() { return { style: {}, dataset: {}, addEventListener() {}, remove() {} }; }
};
const locationStub = {
  pathname: '/admin.html', origin: 'https://humanresources-oxxo.github.io',
  href: 'https://humanresources-oxxo.github.io/DashboardsOxxo/admin.html', search: '?scope=region&region=TABASCO'
};
const nativeFetch = fetch;
const auditFetch = async (input, options) => {
  const value = typeof input === 'string' ? input : input?.url || '';
  if (value === 'assets/catalogo_asesores.csv') {
    return new Response(fs.readFileSync(path.join(root, 'assets/catalogo_asesores.csv'), 'utf8'), { status: 200 });
  }
  return nativeFetch(input, options);
};
const sandbox = {
  console, document: documentStub, location: locationStub,
  history: { state: null, replaceState() {} },
  sessionStorage: { getItem(key) { return memory.get(`session:${key}`) ?? null; }, setItem(key, value) { memory.set(`session:${key}`, String(value)); } },
  localStorage: { getItem(key) { return memory.get(`local:${key}`) ?? null; }, setItem(key, value) { memory.set(`local:${key}`, String(value)); } },
  navigator: {}, CustomEvent: function CustomEvent() {}, URL, URLSearchParams, Request, Response, Blob, TextDecoder, Uint8Array,
  AbortController, fetch: auditFetch, setTimeout, clearTimeout, setInterval, clearInterval, Map, Set, Date, Promise
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'js/config.js'), 'utf8'), sandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'js/core.js'), 'utf8'), sandbox);

const tabs = [
  ['D1', sandbox.OXXO.SHEETS_CONFIG.TABS.d1],
  ['D2', sandbox.OXXO.SHEETS_CONFIG.TABS.d2],
  ['D3', sandbox.OXXO.SHEETS_CONFIG.TABS.d3],
  ['D4', sandbox.OXXO.SHEETS_CONFIG.TABS.s4],
  ['D6', sandbox.OXXO.SHEETS_CONFIG.TABS.s6],
  ['D7', sandbox.OXXO.SHEETS_CONFIG.TABS.s7],
  ['D8', sandbox.OXXO.SHEETS_CONFIG.TABS.d8],
  ['D11', sandbox.OXXO.SHEETS_CONFIG.TABS.d11],
  ['D14', sandbox.OXXO.SHEETS_CONFIG.TABS.c14],
  ['Inventarios', sandbox.OXXO.SHEETS_CONFIG.TABS.inventories],
];
const catalog = await sandbox.OXXO.loadAsesorCatalog();
assert(catalog?.loaded, 'el catálogo CNT no pudo cargarse');
const byCr = new Map();
const sourceStats = [];

for (const [label, tab] of tabs) {
  const rows = await sandbox.OXXO.fetchSheetData(tab, { scoped: false });
  assert(Array.isArray(rows), `${label}: la hoja no devolvió filas`);
  if (!rows.length) { sourceStats.push(`${label}=0`); continue; }
  const sample = rows[0];
  const crKey = sandbox.OXXO.metricsFindKey(sample, ['CR', 'CR Tienda', 'CR TIENDA', 'Código CR', 'Codigo CR']);
  const storeKey = sandbox.OXXO.metricsFindKey(sample, ['Tienda', 'Unidad org.', 'Unidad org', 'Nombre Tienda']);
  const advisorKey = sandbox.OXXO.metricsFindKey(sample, ['Asesor', 'Asesor Comercial', 'AT']);
  let usable = 0;
  rows.forEach(row => {
    const cr = sandbox.OXXO.normalizeCatalogCr(crKey ? row[crKey] : '');
    if (!cr) return;
    usable++;
    const resolved = sandbox.OXXO.resolveAsesorD1(catalog, {
      cr,
      tienda: storeKey ? row[storeKey] : '',
      asesor: advisorKey ? row[advisorKey] : ''
    }) || 'Sin Asesor Asignado';
    if (!byCr.has(cr)) byCr.set(cr, new Map());
    const sources = byCr.get(cr);
    if (!sources.has(label)) sources.set(label, new Set());
    sources.get(label).add(resolved);
  });
  sourceStats.push(`${label}=${usable}`);
}

const conflicts = [];
const uncovered = [];
const normalizeName = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
for (const [cr, sources] of byCr) {
  const values = new Set([...sources.values()].flatMap(set => [...set]).map(normalizeName));
  const catalogHit = catalog.byCr?.has(cr);
  if (catalogHit && values.size > 1) conflicts.push({ cr, values: [...values], sources: Object.fromEntries([...sources].map(([key, set]) => [key, [...set]])) });
  if (!catalogHit) uncovered.push(cr);
}
assert.equal(conflicts.length, 0, 'asesores incongruentes por CR cubierto por CNT: ' + JSON.stringify(conflicts.slice(0, 12)));
console.log('CNT consistente por CR: ' + byCr.size + ' CR revisados ? ' + (byCr.size - uncovered.length) + ' cubiertos por CNT ? ' + uncovered.length + ' sin fila CNT ? ' + sourceStats.join(', '));
if (uncovered.length) console.warn('CR sin cobertura CNT (muestra): ' + uncovered.slice(0, 20).join(', '));
