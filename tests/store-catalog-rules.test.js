// Reglas del catalogo de tiendas con un catalogo SINTETICO (deterministico):
// ACTIVA=NO se rechaza, ACTIVA=SI y las tiendas ausentes se aceptan (mundo
// abierto: TREO se actualiza con retraso) y las preaperturas solo entran con
// el filtro global correspondiente. El diagnostico en vivo
// (tests/live-store-catalog.mjs) comprueba lo mismo contra produccion, pero
// puede no encontrar filas ACTIVA=NO; esta prueba nunca queda vacia.
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function core(search = '') {
  const documentStub = {
    readyState: 'loading', documentElement: { dataset: {} }, body: null, head: { appendChild() {} },
    addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
    getElementsByTagName() { return []; }, getElementById() { return null; },
    querySelector() { return null; }, querySelectorAll() { return []; },
    createElement() { return { style: {}, dataset: {}, addEventListener() {}, remove() {} }; }
  };
  const sandbox = {
    console, document: documentStub,
    location: { pathname: '/index.html', origin: 'https://example.test', href: 'https://example.test/index.html', search },
    history: { state: null, replaceState() {} },
    sessionStorage: { getItem() { return null; }, setItem() {} },
    localStorage: { getItem() { return null; }, setItem() {} }, navigator: {},
    CustomEvent: function CustomEvent() {}, URL, URLSearchParams, Request, Response, Blob, TextDecoder, Uint8Array, AbortController,
    fetch: () => Promise.resolve(new Response('', { status: 500 })),
    setTimeout, clearTimeout, setInterval, clearInterval, Map, Set, Date, Promise
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, 'js/config.js'), 'utf8'), sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, 'js/core.js'), 'utf8'), sandbox);
  return sandbox.OXXO;
}

const FILAS = [
  { CR: '50I01', Tienda: 'OXXO Activa Uno', Plaza: 'Plaza Oaxaca', Region: 'TABASCO', ACTIVA: 'SI' },
  { CR: '50I02', Tienda: 'OXXO Cerrada Dos', Plaza: 'Plaza Oaxaca', Region: 'TABASCO', ACTIVA: 'NO' },
  { CR: '50I03', Tienda: 'OXXO Cerrada Tres', Plaza: 'Plaza Oaxaca', Region: 'TABASCO', ACTIVA: 'inactiva' },
  { CR: '50T04', Tienda: 'OXXO Tuxtla Cuatro', Plaza: 'Tuxtla', Region: 'TABASCO', ACTIVA: '' },
  { CR: '50I05', Tienda: 'Tienda Entrenamiento Oaxaca', Plaza: 'Plaza Oaxaca', Region: 'TABASCO', ACTIVA: 'SI' }
];

function valida(OXXO, catalogo, tienda, cr = '') {
  return OXXO.isTiendaValid({ storeCatalog: catalogo }, tienda, cr);
}

test('el fixture ejercita filas ACTIVA=NO (la prueba no es vacia)', () => {
  const OXXO = core();
  const catalogo = OXXO.buildTiendaCatalog(FILAS, { source: 'fixture' });
  assert.equal(catalogo.rows.filter(fila => fila.activa === false).length, 2, 'NO e inactiva se marcan como no activas');
  assert.equal(catalogo.rows.some(fila => /entrenamiento/i.test(fila.tienda)), false, 'Entrenamiento se excluye del catalogo');
});

test('ACTIVA=NO se rechaza; SI, vacia y ausente de TREO se aceptan', () => {
  const OXXO = core();
  const catalogo = OXXO.buildTiendaCatalog(FILAS, { source: 'fixture' });
  assert.equal(valida(OXXO, catalogo, 'OXXO Cerrada Dos', '50I02'), false, 'por CR y nombre');
  assert.equal(valida(OXXO, catalogo, 'OXXO Cerrada Dos'), false, 'solo por nombre');
  assert.equal(valida(OXXO, catalogo, '', '50I03'), false, 'solo por CR (inactiva)');
  assert.equal(valida(OXXO, catalogo, 'OXXO Activa Uno', '50I01'), true);
  assert.equal(valida(OXXO, catalogo, 'OXXO Tuxtla Cuatro', '50T04'), true, 'sin valor en ACTIVA = activa');
  assert.equal(valida(OXXO, catalogo, 'OXXO Recien Abierta', '50N99'), true, 'ausente de TREO: mundo abierto');
});

test('preaperturas: rechazadas en operativas, aceptadas con el filtro de preapertura o todas', () => {
  const nombres = ['Papaya VSA', 'Small Beach OAX VSA', 'Piedra Parada VSA', 'Gas Nopala VSA', '5 de Septiembre VSA', 'Union y Progreso VSA', 'Parador Boca del Monte VSA'];
  const operativas = core('');
  const catalogo = operativas.buildTiendaCatalog(FILAS, { source: 'fixture' });
  for (const nombre of nombres) assert.equal(valida(operativas, catalogo, nombre), false, `${nombre} no entra en operativas`);
  const preapertura = core('?tiendas=preapertura');
  const cat2 = preapertura.buildTiendaCatalog(FILAS, { source: 'fixture' });
  assert.equal(valida(preapertura, cat2, 'Papaya VSA'), true);
  assert.equal(valida(preapertura, cat2, 'OXXO Activa Uno', '50I01'), false, 'preapertura muestra solo preaperturas');
  const todas = core('?tiendas=todas');
  const cat3 = todas.buildTiendaCatalog(FILAS, { source: 'fixture' });
  assert.equal(valida(todas, cat3, 'Papaya VSA'), true);
  assert.equal(valida(todas, cat3, 'OXXO Activa Uno', '50I01'), true);
  assert.equal(valida(todas, cat3, 'OXXO Cerrada Dos', '50I02'), false, 'ACTIVA=NO sigue fuera aun con "todas"');
});

test('sin catalogo cargado falla abierto para no desaparecer tiendas por una intermitencia', () => {
  const OXXO = core();
  assert.equal(OXXO.isTiendaValid({ storeCatalog: { loaded: false } }, 'OXXO Cualquiera', '50X01'), true);
  assert.equal(OXXO.isTiendaValid(null, 'OXXO Cualquiera', '50X01'), true);
});
