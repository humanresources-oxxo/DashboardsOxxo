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
const locationStub = {
  pathname: '/index.html', origin: 'https://humanresources-oxxo.github.io',
  href: 'https://humanresources-oxxo.github.io/DashboardsOxxo/index.html',
  search: '?scope=plaza&region=TABASCO&plaza=Plaza%20Oaxaca'
};
const sandbox = {
  console, document: documentStub, location: locationStub,
  history: { state: null, replaceState() {} },
  sessionStorage: { getItem() { return null; }, setItem() {} },
  localStorage: { getItem() { return null; }, setItem() {} },
  navigator: {}, CustomEvent: function CustomEvent() {},
  URL, URLSearchParams, Request, Response, Blob, TextDecoder, Uint8Array,
  AbortController, fetch, setTimeout, clearTimeout, setInterval, clearInterval,
  Map, Set, Date, Promise
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'js/config.js'), 'utf8'), sandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'js/core.js'), 'utf8'), sandbox);

const config = sandbox.OXXO.SHEETS_CONFIG;
const tabs = [...new Set([
  ...Object.keys(config.SCOPED_GVIZ_COLUMNS || {}),
  config.TABS.m12,
  config.TABS.inventories
])];
const results = [];
let cursor = 0;

async function worker() {
  while (cursor < tabs.length) {
    const tab = tabs[cursor++];
    const started = Date.now();
    const [scopedRows, fullRows] = await Promise.all([
      sandbox.OXXO.fetchSheetData(tab, { fresh: true }),
      sandbox.OXXO.fetchSheetData(tab, { fresh: true, scoped: false })
    ]);
    assert(Array.isArray(scopedRows), `${tab}: la consulta por plaza no respondio`);
    assert(Array.isArray(fullRows), `${tab}: la consulta regional no respondio`);
    const expected = sandbox.OXXO.filterRowsByDataScope(fullRows, sandbox.OXXO.getActiveDataScope());
    assert.equal(scopedRows.length, expected.length, `${tab}: el filtro en Google no coincide con el filtro local`);
    assert(scopedRows.length <= fullRows.length, `${tab}: la consulta por plaza devolvio mas filas que la regional`);
    results.push({
      tab,
      plaza: scopedRows.length,
      region: fullRows.length,
      reduccion: fullRows.length ? `${Math.round((1 - scopedRows.length / fullRows.length) * 100)}%` : '0%',
      ms: Date.now() - started
    });
  }
}

await Promise.all(Array.from({ length: 3 }, worker));
results.sort((a, b) => tabs.indexOf(a.tab) - tabs.indexOf(b.tab));
console.table(results);
console.log(`consultas por plaza: ${results.length} hojas coinciden con el filtrado regional`);
