// El comparativo regional de Dashboard 1 dejo de bajar la hoja completa
// (4.4 MB, toda la region fila por fila) y ahora le pide a GViz el conteo ya
// agregado con un group by (~20 KB). La consulta traduce a texto los mismos
// filtros que antes corrian en el navegador y depende de la POSICION de las
// columnas en la hoja publicada, algo que ningun test offline puede ver.
//
// Esta prueba baja las dos cosas de la hoja real y exige que el panel salga
// identico por cada periodo del selector. Si alguien reordena las columnas,
// agrega un puesto o publica una fila sin Mes, aqui se cae -- y el respaldo de
// la lectura completa que quedo en loadPlazas() se vuelve la ruta buena.
//
//   node tests/live-plazas-aggregate.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const memory = new Map();
// core.js intenta primero el catalogo local por ruta relativa, que fuera del
// navegador no resuelve. Se sirve del disco para que el unico trafico de red
// de esta prueba sea el que se quiere medir.
const nativeFetch = fetch;
const catalogAwareFetch = async (input, options) => {
  const value = typeof input === 'string' ? input : input?.url || '';
  if (value === 'assets/catalogo_asesores.csv') {
    return new Response(fs.readFileSync(path.join(root, 'assets/catalogo_asesores.csv'), 'utf8'), { status: 200 });
  }
  return nativeFetch(input, options);
};
const sandbox = {
  console,
  document: {
    readyState: 'loading', body: null, documentElement: { dataset: {} },
    head: { appendChild() {} }, addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
    getElementsByTagName() { return []; }, getElementById() { return null; },
    querySelector() { return null; }, querySelectorAll() { return []; },
    createElement() { return { style: {}, dataset: {}, addEventListener() {}, remove() {} }; }
  },
  location: {
    pathname: '/dashboards/dashboard-1.html',
    origin: 'https://humanresources-oxxo.github.io',
    href: 'https://humanresources-oxxo.github.io/DashboardsOxxo/dashboards/dashboard-1.html',
    search: ''
  },
  history: { state: null, replaceState() {} },
  sessionStorage: {
    getItem(key) { return memory.get(`session:${key}`) ?? null; },
    setItem(key, value) { memory.set(`session:${key}`, String(value)); }
  },
  localStorage: {
    getItem(key) { return memory.get(`local:${key}`) ?? null; },
    setItem(key, value) { memory.set(`local:${key}`, String(value)); }
  },
  navigator: {},
  CustomEvent: function CustomEvent() {},
  addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
  matchMedia() { return { matches: false, addEventListener() {}, addListener() {} }; },
  URL, URLSearchParams, Request, Response, Blob, TextDecoder, Uint8Array,
  AbortController, fetch: catalogAwareFetch,
  setTimeout, clearTimeout, setInterval, clearInterval,
  Map, Set, Date, Promise
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'js/config.js'), 'utf8'), sandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'js/core.js'), 'utf8'), sandbox);
const OXXO = sandbox.OXXO;

// Las funciones se extraen del HTML publicado -- no se copian aqui -- para que
// el tablero y la prueba nunca se separen.
const html = fs.readFileSync(path.join(root, 'dashboards/dashboard-1.html'), 'utf8');
const take = (pattern, label) => {
  const found = html.match(pattern);
  assert(found, `no se encontro ${label} en dashboard-1.html`);
  return found[0];
};
const pieces = [
  take(/const ALIASES = \{[\s\S]*?\n\};/, 'ALIASES'),
  'function findKey(sample,aliases){ return OXXO.metricsFindKey(sample, aliases); }',
  take(/function buildMap\(data\)\{[\s\S]*?\n\}/, 'buildMap()'),
  take(/function gv\(row,map,k,fb=''\)\{.*\n/, 'gv()'),
  take(/function normalizeSearchText\(value\)\{[\s\S]*?\n\}/, 'normalizeSearchText()'),
  take(/function normalizeMesColumn\(value\)\{[\s\S]*?\n\}/, 'normalizeMesColumn()'),
  take(/function monthShortLabel\(key\)\{[\s\S]*?\n\}/, 'monthShortLabel()'),
  'function parseFechaVacante(value){ return OXXO.metricsParseFecha(value); }',
  'function mesKeyFromDate(date){ return OXXO.metricsMesKeyFromDate(date); }',
  take(/const DEFAULT_PUESTOS = \[[\s\S]*?\n\];/, 'DEFAULT_PUESTOS'),
  take(/function isAllowedPuesto\(value\)\{[\s\S]*?\n\}/, 'isAllowedPuesto()'),
  take(/function isVacancySourceRow\(rawRow\)\{[\s\S]*?\n\}/, 'isVacancySourceRow()'),
  take(/function gvizColumnLetter\(index\)\{[\s\S]*?\n\}/, 'gvizColumnLetter()'),
  take(/function gvizColumnFor\(key\)\{[\s\S]*?\n\}/, 'gvizColumnFor()'),
  take(/const PLAZAS_COUNT_HEADER = .*\n/, 'PLAZAS_COUNT_HEADER'),
  take(/function plazasAggregateQuery\(\)\{[\s\S]*?\n\}/, 'plazasAggregateQuery()'),
  take(/function plazasAccumulator\(mesSeleccionado\)\{[\s\S]*?\n\}/, 'plazasAccumulator()'),
  take(/function plazasDesdeAgregado\(filas, mes\)\{[\s\S]*?\n\}/, 'plazasDesdeAgregado()'),
  take(/function plazasDesdeHojaCompleta\(filas, mes\)\{[\s\S]*?\n\}/, 'plazasDesdeHojaCompleta()'),
  'return { setContext(headers, map){ RAW_HEADERS = headers; colMap = map; }, buildMap, gv, normalizeMesColumn, plazasAggregateQuery, plazasDesdeAgregado, plazasDesdeHojaCompleta, gvizColumnFor };'
].join('\n');
const D1 = new Function('OXXO', `let RAW_HEADERS = []; let colMap = {};\n${pieces}`)(OXXO);

const TAB = OXXO.SHEETS_CONFIG.TABS.d1;

// Lectura completa: la misma que hacia el panel antes de esta optimizacion.
const completa = await OXXO.fetchSheetData(TAB, { scoped: false });
assert(completa?.length, 'la hoja completa no devolvio filas');
D1.setContext(Object.keys(completa[0] || {}), D1.buildMap(completa));

const query = D1.plazasAggregateQuery();
assert(query, 'no se pudo armar la consulta agregada: falta alguna columna esperada en la hoja');
console.log('consulta:', query);

const agregado = await OXXO.fetchSheetData(TAB, { scoped: false, query });
assert(agregado?.length, 'la consulta agregada no devolvio filas');

// El peso es la razon de ser del cambio: si el agregado deja de ser una
// fraccion de la hoja, la consulta esta trayendo mas de lo que deberia.
const pesoCompleta = JSON.stringify(completa).length;
const pesoAgregado = JSON.stringify(agregado).length;
assert(
  pesoAgregado * 20 < pesoCompleta,
  `el agregado (${agregado.length} filas) no es al menos 20x mas ligero que la hoja completa (${completa.length} filas)`
);

// Cada opcion del selector de mes, mas "(todos)".
const mapa = D1.buildMap(completa);
const meses = ['', ...new Set(completa
  .map((row) => D1.normalizeMesColumn(D1.gv(row, mapa, 'mes', '')).key)
  .filter(Boolean))].sort();
assert(meses.length > 1, 'la hoja no publica ningun periodo reconocible');

const tabla = [];
for (const mes of meses) {
  const rapido = D1.plazasDesdeAgregado(agregado, mes);
  assert(rapido, `${mes || '(todos)'}: la respuesta agregada no trae la forma esperada`);
  const lento = D1.plazasDesdeHojaCompleta(completa, mes);
  assert.deepEqual(
    rapido, lento,
    `${mes || '(todos)'}: el comparativo agregado no coincide con la lectura completa`
  );
  tabla.push({
    periodo: mes || '(todos)',
    plazas: lento.length,
    vacantes: lento.reduce((sum, p) => sum + p.vacantes, 0),
    tiendas: lento.reduce((sum, p) => sum + p.tiendas, 0)
  });
}

console.table(tabla);
console.log(
  `comparativo de plazas: identico en ${meses.length} periodos; ` +
  `${agregado.length} filas agregadas (${pesoAgregado} B) contra ${completa.length} filas completas (${pesoCompleta} B), ` +
  `${(pesoCompleta / pesoAgregado).toFixed(0)}x mas ligero`
);
