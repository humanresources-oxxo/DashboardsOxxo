// Precedencia del catalogo de asesores: la hoja viva (Apps Script
// action=readSheet) manda sobre el csv versionado, la cache y gviz, para que
// una edicion desde el panel admin se vea de inmediato. Datos ficticios.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function nuevoSandbox() {
  const documentStub = {
    readyState: 'loading', body: null, head: { appendChild() {} },
    addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
    getElementsByTagName() { return []; }, getElementById() { return null; },
    querySelector() { return null; }, querySelectorAll() { return []; },
    createElement() { return { style: {}, dataset: {}, addEventListener() {}, remove() {} }; }
  };
  const sandbox = {
    console: { log() {}, warn() {}, error() {} }, document: documentStub,
    location: { pathname: '/index.html', origin: 'https://example.test', href: 'https://example.test/index.html' },
    history: { state: null, replaceState() {} },
    sessionStorage: { getItem() { return null; }, setItem() {} },
    localStorage: { getItem() { return null; }, setItem() {} },
    navigator: {}, CustomEvent: function CustomEvent() {},
    URL, Request, Response, Blob, AbortController,
    setTimeout, clearTimeout, setInterval, clearInterval, Map, Set, Date, Promise, JSON
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, 'js/config.js'), 'utf8'), sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, 'js/core.js'), 'utf8'), sandbox);
  return sandbox;
}

// Cache Storage minima: devuelve siempre las filas dadas (solo se consulta la
// del catalogo en esta prueba).
function cacheFalsa(rows) {
  return {
    async open() {
      return {
        async match() { return new Response(JSON.stringify({ rows, savedAt: Date.now() })); },
        async put() {}, async delete() { return true; }
      };
    },
    async delete() { return true; }
  };
}

const FILA_VIVA = { asesor: 'Asesor Vivo', tienda: 'Tienda Uno', cr: 'CR0001' };
const respuestaViva = () => new Response(JSON.stringify({
  ok: true,
  values: [['_buffer_', '_buffer_', '_buffer_'], ['ASESOR', 'TIENDA', 'CR TIENDA'],
    [FILA_VIVA.asesor, FILA_VIVA.tienda, FILA_VIVA.cr]]
}), { status: 200 });
const CSV_LOCAL = 'Asesor Csv,Tienda Uno,CR0001\n';
const CSV_GVIZ = '"Asesor Gviz","Tienda Uno","CR0001"\n';

// Enruta por tipo de fuente; cada caso decide cual responde y cual falla.
function instalarFetch(sandbox, { viva, local, gviz }) {
  sandbox.fetch = async (url) => {
    const texto = String(url);
    if (texto.includes('action=readSheet')) return viva();
    if (texto.includes('catalogo_asesores.csv')) return local();
    if (texto.includes('docs.google.com') || texto.includes('gviz')) return gviz();
    throw new Error(`url inesperada: ${texto}`);
  };
}

const falla = () => { throw new Error('fuente caida'); };
const vacio = () => new Response('', { status: 200 });

async function asesorDe(sandbox) {
  const catalogo = await sandbox.OXXO.loadAsesorCatalogRows();
  return catalogo.byCr.get('CR0001')?.asesor;
}

test('la hoja viva gana al csv versionado y a la cache fresca', async () => {
  const sandbox = nuevoSandbox();
  sandbox.caches = cacheFalsa([{ asesor: 'Asesor Cache', tienda: 'Tienda Uno', cr: 'CR0001' }]);
  instalarFetch(sandbox, {
    viva: respuestaViva,
    local: () => new Response(CSV_LOCAL, { status: 200 }),
    gviz: () => new Response(CSV_GVIZ, { status: 200 })
  });
  assert.equal(await asesorDe(sandbox), 'Asesor Vivo');
});

test('sin hoja viva cae al csv versionado', async () => {
  const sandbox = nuevoSandbox();
  instalarFetch(sandbox, {
    viva: falla,
    local: () => new Response(CSV_LOCAL, { status: 200 }),
    gviz: () => new Response(CSV_GVIZ, { status: 200 })
  });
  assert.equal(await asesorDe(sandbox), 'Asesor Csv');
});

test('una hoja viva vacia no bloquea el respaldo', async () => {
  const sandbox = nuevoSandbox();
  instalarFetch(sandbox, {
    viva: () => new Response(JSON.stringify({ ok: true, values: [] }), { status: 200 }),
    local: () => new Response(CSV_LOCAL, { status: 200 }),
    gviz: () => new Response(CSV_GVIZ, { status: 200 })
  });
  assert.equal(await asesorDe(sandbox), 'Asesor Csv');
});

test('sin hoja viva ni csv usa la cache fresca antes que gviz', async () => {
  const sandbox = nuevoSandbox();
  sandbox.caches = cacheFalsa([{ asesor: 'Asesor Cache', tienda: 'Tienda Uno', cr: 'CR0001' }]);
  instalarFetch(sandbox, { viva: falla, local: vacio, gviz: () => new Response(CSV_GVIZ, { status: 200 }) });
  assert.equal(await asesorDe(sandbox), 'Asesor Cache');
});

test('gviz es el ultimo respaldo', async () => {
  const sandbox = nuevoSandbox();
  instalarFetch(sandbox, { viva: falla, local: falla, gviz: () => new Response(CSV_GVIZ, { status: 200 }) });
  assert.equal(await asesorDe(sandbox), 'Asesor Gviz');
});
