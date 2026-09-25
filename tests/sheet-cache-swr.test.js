// Cache de lectura de Sheets (js/core.js): vigencia de 2 min, stale-while-
// revalidate hasta 10 min, una sola solicitud por llave, primer intento unico
// y llaves separadas por consulta/alcance. Todo con reloj y red simulados.
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const MIN = 60 * 1000;

function crearEntorno({ persistentCache = false, deferCacheDelete = false } = {}) {
  let ahora = Date.UTC(2026, 8, 24, 12, 0, 0);
  class RelojFalso extends Date {
    constructor(...args) { super(...(args.length ? args : [ahora])); }
    static now() { return ahora; }
  }
  const eventos = [];
  const llamadas = [];               // solicitudes de red pendientes/hechas
  const tareasOciosas = [];
  const eliminacionesPendientes = [];
  const filasPersistidas = new Map();
  const documentStub = {
    readyState: 'loading', body: null, head: { appendChild() {} },
    addEventListener() {}, removeEventListener() {},
    dispatchEvent(evento) { eventos.push(evento.detail); },
    getElementsByTagName() { return []; }, getElementById() { return null; },
    querySelector() { return null; }, querySelectorAll() { return []; },
    createElement() { return { style: {}, dataset: {}, addEventListener() {}, remove() {} }; }
  };
  const sandbox = {
    console: { ...console, error() {}, warn() {} },
    document: documentStub,
    location: { pathname: '/dashboards/dashboard-1.html', origin: 'https://example.test', href: 'https://example.test/dashboards/dashboard-1.html', search: '' },
    history: { state: null, replaceState() {} },
    sessionStorage: { getItem() { return null; }, setItem() {} },
    localStorage: { getItem() { return null; }, setItem() {} },
    navigator: {},
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } },
    URL, URLSearchParams, Request, Response, Blob, AbortController, TextDecoder, Uint8Array,
    setTimeout, clearTimeout, setInterval, clearInterval, Map, Set, Promise, Date: RelojFalso
  };
  sandbox.window = sandbox;
  if (persistentCache) {
    const cache = {
      async match(request) {
        const response = filasPersistidas.get(request.url);
        return response ? response.clone() : undefined;
      },
      async put(request, response) { filasPersistidas.set(request.url, response.clone()); },
      async delete(request) { return filasPersistidas.delete(request.url); }
    };
    sandbox.requestIdleCallback = (callback) => {
      tareasOciosas.push(callback);
      return tareasOciosas.length;
    };
    sandbox.caches = {
      async open() { return cache; },
      async delete() {
        if (deferCacheDelete) {
          await new Promise((resolve) => eliminacionesPendientes.push(resolve));
        }
        filasPersistidas.clear();
        return true;
      }
    };
  }
  // Solo se controlan las lecturas de la pestaña bajo prueba; cualquier otra
  // solicitud que core.js haga al cargar (avisos, configuracion) falla al instante.
  sandbox.fetch = (url) => (String(url).includes('gviz/tq') && String(url).includes('sheet=Dashboard_4_Semanal')
    ? new Promise((resolve, reject) => llamadas.push({ url: String(url), resolve, reject }))
    : Promise.resolve(new Response('', { status: 500 })));
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, 'js/config.js'), 'utf8'), sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, 'js/core.js'), 'utf8'), sandbox);
  const responder = (llamada, csv) => llamada.resolve(new Response(csv, { status: 200 }));
  const avanzar = (ms) => { ahora += ms; };
  const settle = () => new Promise((resolve) => setTimeout(resolve, 5));
  const ejecutarTareasOciosas = async () => {
    while (tareasOciosas.length) tareasOciosas.shift()({ didTimeout: false, timeRemaining: () => 50 });
    await settle();
  };
  const liberarEliminacion = () => eliminacionesPendientes.shift()?.();
  const leerPersistida = async () => {
    const response = filasPersistidas.values().next().value;
    return response ? response.clone().json() : null;
  };
  return {
    OXXO: sandbox.OXXO, sandbox, eventos, llamadas, responder, avanzar, settle,
    ejecutarTareasOciosas, liberarEliminacion, leerPersistida,
    get tareasOciosas() { return tareasOciosas.length; },
    get eliminacionesPendientes() { return eliminacionesPendientes.length; },
    get entradasPersistidas() { return filasPersistidas.size; }
  };
}
const CSV_V1 = 'Plaza,Valor\nPlaza Oaxaca,uno\n';
const CSV_V2 = 'Plaza,Valor\nPlaza Oaxaca,dos\n';
const TAB = 'Dashboard_4_Semanal';
const abiertas = (e) => e.llamadas.filter((l) => !l.hecha);

test('cache fresca (<2 min): una sola solicitud y filas clonadas', async () => {
  const e = crearEntorno();
  const primera = e.OXXO.fetchSheetData(TAB, { scoped: false });
  await e.settle();
  assert.equal(e.llamadas.length, 1);
  e.responder(e.llamadas[0], CSV_V1);
  const filas = await primera;
  assert.equal(filas[0].Valor, 'uno');
  filas[0].Valor = 'mutada';                        // el consumidor no debe contaminar la cache
  e.avanzar(90 * 1000);
  const segunda = await e.OXXO.fetchSheetData(TAB, { scoped: false });
  assert.equal(e.llamadas.length, 1, 'dentro de 2 min no hay red');
  assert.equal(segunda[0].Valor, 'uno');
});

test('stale-while-revalidate: 2-10 min devuelve al instante y refresca una vez', async () => {
  const e = crearEntorno();
  const inicial = e.OXXO.fetchSheetData(TAB, { scoped: false });
  await e.settle();
  e.responder(e.llamadas[0], CSV_V1);
  await inicial;
  e.avanzar(5 * MIN);

  const a = await e.OXXO.fetchSheetData(TAB, { scoped: false });      // no espera a la red
  const b = await e.OXXO.fetchSheetData(TAB, { scoped: false });
  assert.equal(a[0].Valor, 'uno');
  assert.equal(b[0].Valor, 'uno');
  assert.equal(e.llamadas.length, 2, 'un solo refresco en segundo plano para las dos lecturas');
  const estado = e.eventos.filter((d) => d.tabName === TAB).pop();
  assert.equal(estado.status, 'stale');
  assert.ok(estado.ageMs >= 5 * MIN);

  e.responder(e.llamadas[1], CSV_V2);                                  // termina el refresco
  await e.settle();
  assert.equal(e.eventos.filter((d) => d.tabName === TAB).pop().refreshed, true, 'el aviso ofrece actualizar; no repinta solo');
  const c = await e.OXXO.fetchSheetData(TAB, { scoped: false });
  assert.equal(c[0].Valor, 'dos', 'la cache ya trae los datos nuevos');
  assert.equal(e.llamadas.length, 2);
  assert.equal(e.eventos.filter((d) => d.tabName === TAB).pop().status, 'online', 'al leer datos nuevos el aviso se retira');
});

test('refresco fallido: se conservan los datos guardados y el aviso stale', async () => {
  const e = crearEntorno();
  const inicial = e.OXXO.fetchSheetData(TAB, { scoped: false });
  await e.settle();
  e.responder(e.llamadas[0], CSV_V1);
  await inicial;
  e.avanzar(4 * MIN);
  const filas = await e.OXXO.fetchSheetData(TAB, { scoped: false });
  assert.equal(filas[0].Valor, 'uno');
  e.llamadas[1].resolve(new Response('error', { status: 500 }));
  await e.settle();
  const ultimo = e.eventos.filter((d) => d.tabName === TAB).pop();
  assert.equal(ultimo.status, 'stale');
  assert.notEqual(ultimo.refreshed, true);
});

test('mas de 10 min: espera a la red y, si falla, avisa sin conexion', async () => {
  const e = crearEntorno();
  const inicial = e.OXXO.fetchSheetData(TAB, { scoped: false });
  await e.settle();
  e.responder(e.llamadas[0], CSV_V1);
  await inicial;
  e.avanzar(11 * MIN);
  const pendiente = e.OXXO.fetchSheetData(TAB, { scoped: false });
  await e.settle();
  assert.equal(e.llamadas.length, 2);
  e.llamadas[1].reject(new Error('sin red'));
  assert.equal(await pendiente, null);
  assert.equal(e.eventos.filter((d) => d.tabName === TAB).pop().status, 'offline');
});

test('primera carga: una sola solicitud compartida, y un solo intento si falla', async () => {
  const e = crearEntorno();
  const a = e.OXXO.fetchSheetData(TAB, { scoped: false });
  const b = e.OXXO.fetchSheetData(TAB, { scoped: false });
  await e.settle();
  assert.equal(e.llamadas.length, 1, 'llamadas concurrentes comparten la solicitud en vuelo');
  e.llamadas[0].reject(new Error('sin red'));
  assert.equal(await a, null);
  assert.equal(await b, null);
  await e.settle();
  assert.equal(e.llamadas.length, 1, 'no hay segundo intento serial');
  assert.equal(e.eventos.filter((d) => d.tabName === TAB).pop().status, 'offline');
});

test('llaves separadas: plaza, region y consulta propia nunca se mezclan', async () => {
  const e = crearEntorno();
  const pedir = (opciones) => e.OXXO.fetchSheetData(TAB, opciones);
  const oax = pedir({ scope: { level: 'plaza', region: 'TABASCO', plaza: 'Plaza Oaxaca' } });
  const istmo = pedir({ scope: { level: 'plaza', region: 'TABASCO', plaza: 'Costa Istmo' } });
  const region = pedir({ scope: { level: 'region', region: 'TABASCO' } });
  const propia = pedir({ scoped: false, query: 'select A, count(B) group by A' });
  await e.settle();
  assert.equal(e.llamadas.length, 4, 'cuatro llaves = cuatro solicitudes');
  const urls = e.llamadas.map((l) => new URL(l.url).searchParams.get('tq') || '');
  const buscar = (fn) => urls.filter(fn);
  assert.equal(buscar((u) => u.includes('oaxaca') && !u.includes('istmo')).length, 1);
  assert.equal(buscar((u) => u.includes('istmo')).length, 1);
  assert.equal(buscar((u) => u.includes('group by A')).length, 1, 'la consulta propia viaja aparte');
  assert.equal(buscar((u) => u === '').length, 1, 'region: lectura completa, sin tq');
  e.llamadas.forEach((l) => e.responder(l, CSV_V1));
  await Promise.all([oax, istmo, region, propia]);
  // Repetir la misma llave sale de cache; una llave nueva vuelve a la red.
  await pedir({ scope: { level: 'plaza', region: 'TABASCO', plaza: 'Plaza Oaxaca' } });
  assert.equal(e.llamadas.length, 4);
  const otra = pedir({ scope: { level: 'plaza', region: 'TABASCO', plaza: 'Tuxtla' } });
  await e.settle();
  assert.equal(e.llamadas.length, 5);
  assert.ok((new URL(e.llamadas[4].url).searchParams.get('tq') || '').includes('tuxtla'));
  e.responder(e.llamadas[4], CSV_V1);
  await otra;
});

test('fresh:true se salta la cache y Reintentar limpia y vuelve a pedir', async () => {
  const e = crearEntorno();
  const inicial = e.OXXO.fetchSheetData(TAB, { scoped: false });
  await e.settle();
  e.responder(e.llamadas[0], CSV_V1);
  await inicial;

  const fresca = e.OXXO.fetchSheetData(TAB, { scoped: false, fresh: true });
  await e.settle();
  assert.equal(e.llamadas.length, 2, 'fresh ignora la cache vigente');
  e.responder(e.llamadas[1], CSV_V2);
  assert.equal((await fresca)[0].Valor, 'dos');

  let reinicios = 0;
  e.sandbox.initDashboard = async () => { reinicios++; await e.OXXO.fetchSheetData(TAB, { scoped: false }); };
  const reintento = e.OXXO.retryDashboardData(null);
  await e.settle();
  assert.equal(e.llamadas.length, 3, 'Reintentar hace una solicitud nueva aunque la cache estuviera vigente');
  e.responder(e.llamadas[2], CSV_V1);
  await reintento;
  assert.equal(reinicios, 1);
});

for (const [nombre, limpiar] of [
  ['por pestana', (o) => o.clearSheetDataCache(TAB)],
  ['global', (o) => o.clearSheetDataCache()]
]) {
  test(`invalidacion ${nombre}: una respuesta vieja no repuebla la cache ni libera la solicitud nueva`, async () => {
    const e = crearEntorno();
    const vieja = e.OXXO.fetchSheetData(TAB, { scoped: false });
    await e.settle();
    assert.equal(e.llamadas.length, 1);

    limpiar(e.OXXO);                                             // p. ej. se publico la pestana
    const nueva = e.OXXO.fetchSheetData(TAB, { scoped: false });
    await e.settle();
    assert.equal(e.llamadas.length, 2, 'tras invalidar se pide de nuevo');

    e.responder(e.llamadas[0], CSV_V1);                          // la vieja llega tarde
    assert.equal((await vieja)[0].Valor, 'uno', 'quien la esperaba recibe sus filas');
    await e.settle();
    const compartida = e.OXXO.fetchSheetData(TAB, { scoped: false });
    await e.settle();
    assert.equal(e.llamadas.length, 2, 'la solicitud nueva sigue en vuelo y se comparte');

    e.responder(e.llamadas[1], CSV_V2);
    assert.equal((await nueva)[0].Valor, 'dos');
    assert.equal((await compartida)[0].Valor, 'dos');
    const leida = await e.OXXO.fetchSheetData(TAB, { scoped: false });
    assert.equal(leida[0].Valor, 'dos', 'la cache conserva lo nuevo, no lo viejo');
    assert.equal(e.llamadas.length, 2);
  });
}

test('invalidacion: la vieja que llega DESPUES de la nueva tampoco pisa la cache', async () => {
  const e = crearEntorno();
  const vieja = e.OXXO.fetchSheetData(TAB, { scoped: false });
  await e.settle();
  e.OXXO.clearSheetDataCache(TAB);
  const nueva = e.OXXO.fetchSheetData(TAB, { scoped: false });
  await e.settle();
  e.responder(e.llamadas[1], CSV_V2);
  await nueva;
  e.responder(e.llamadas[0], CSV_V1);
  await vieja;
  await e.settle();
  assert.equal((await e.OXXO.fetchSheetData(TAB, { scoped: false }))[0].Valor, 'dos');
  assert.equal(e.llamadas.length, 2);
});

test('invalidacion persistente: una escritura ociosa anterior no recrea datos borrados', async () => {
  const e = crearEntorno({ persistentCache: true });
  const anterior = e.OXXO.fetchSheetData(TAB, { scoped: false });
  await e.settle();
  e.responder(e.llamadas[0], CSV_V1);
  await anterior;
  assert.equal(e.tareasOciosas, 1, 'la respuesta dejo su persistencia en espera');

  e.OXXO.clearSheetDataCache(TAB);
  await e.settle();
  await e.ejecutarTareasOciosas();

  assert.equal(e.entradasPersistidas, 0, 'la tarea vieja se descarta despues de invalidar');
  assert.equal(await e.leerPersistida(), null);
});

test('invalidacion persistente: una respuesta nueva espera la eliminacion pendiente y sobrevive', async () => {
  const e = crearEntorno({ persistentCache: true, deferCacheDelete: true });
  e.OXXO.clearSheetDataCache(TAB);
  await e.settle();
  assert.equal(e.eliminacionesPendientes, 1, 'la limpieza de Cache Storage sigue en curso');

  const nueva = e.OXXO.fetchSheetData(TAB, { scoped: false });
  await e.settle();
  e.responder(e.llamadas[0], CSV_V2);
  assert.equal((await nueva)[0].Valor, 'dos');
  await e.ejecutarTareasOciosas();
  assert.equal(e.entradasPersistidas, 0, 'la escritura nueva espera detras de la limpieza');

  e.liberarEliminacion();
  await e.settle();
  const persistida = await e.leerPersistida();
  assert.equal(persistida.rows[0].Valor, 'dos', 'la limpieza no borra la respuesta posterior');
});
