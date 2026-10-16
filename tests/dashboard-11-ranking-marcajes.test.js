// Extremos de marcajes de Dashboard 11: el indice por asesor es la suma de sus
// dos registros (promedio de % Cumpl Reg Entradas mas promedio de % Cumpl Reg
// Salidas de sus tiendas, escala 0-200), el top 5 y el bottom 5 salen de la
// misma lista ordenada sin repetir nombres, los empates son deterministas y los
// totales del encabezado cuadran con la vista. La fuente real solo publica
// porcentajes: no hay conteo absoluto de marcajes que sumar.
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const raiz = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(raiz, 'dashboards', 'dashboard-11.html'), 'utf8');
const inline = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
  .filter(m => !/\bsrc\s*=/i.test(m[1] || ''))
  .map(m => m[2])
  .find(s => s.includes('function renderRank()'));
assert.ok(inline, 'no se encontro el script propio de dashboard-11');

const COLUMNAS = {
  asesor: 'Asesor', plaza: 'Plaza', tienda: 'Tienda',
  entradas: '% Cumpl Reg Entradas', salidas: '% Cumpl Reg Salidas', total: '% Cumpl Reg Total',
};

// COL y VIEW son `let` del script: en un vm esas ligaduras no quedan en el
// global, asi que se expone un puente desde el MISMO ambito lexico.
const puente = '\nglobalThis.__d11={get COL(){return COL},set COL(v){COL=v},get VIEW(){return VIEW},set VIEW(v){VIEW=v},setCatalogoAsesores,esAsesorDeLaPlaza,loadRoster};';

function cargar(commitmentRows = []) {
  const nodos = new Map();
  const nodo = id => {
    if (!nodos.has(id)) nodos.set(id, { id, innerHTML: '', textContent: '', value: '', addEventListener() {}, style: { setProperty() {} } });
    return nodos.get(id);
  };
  const contexto = vm.createContext({
    console,
    window: {},
    document: {
      addEventListener() {},
      querySelector: () => nodo('tbody'),
      querySelectorAll: () => [],
      getElementById: nodo,
      createElement: () => ({ style: {}, appendChild() {} }),
    },
    OXXO: {
      SHEETS_CONFIG: { TABS: { d11: 'Dashboard_11_Semanal' }, COMMITMENTS_SHEET: 'Compromisos_Bajas' },
      escHtml: v => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;'),
      metricsNum: v => (v === '' || v === null || v === undefined ? NaN : Number(v)),
      matchesScopeValue: () => false,
      renderDownloadButton() {},
      updateFooterTime() {},
      fetchSheetData: async () => commitmentRows,
    },
  });
  new vm.Script(inline + puente, { filename: 'dashboards/dashboard-11.html' }).runInContext(contexto);
  contexto.__d11.COL = COLUMNAS;
  // Los objetos que devuelve el vm viven en otro realm: deepEqual compara
  // prototipos, asi que se aplanan antes de asertar.
  const plano = v => JSON.parse(JSON.stringify(v));
  const marcajes = rows => plano(contexto.marcajesPorAsesor(rows));
  const rank = rows => plano(contexto.rankMarcajes(contexto.marcajesPorAsesor(rows)));
  return { contexto, nodo, marcajes, rank };
}

// entradas/salidas en porcentaje (pct() los deja igual cuando pasan de 3).
const fila = (asesor, entradas, salidas, tienda) => ({
  Asesor: asesor, Plaza: 'Oaxaca', Tienda: tienda || `T ${asesor}`,
  '% Cumpl Reg Entradas': entradas, '% Cumpl Reg Salidas': salidas,
  '% Cumpl Reg Total': (entradas + salidas) / 2,
});

// 12 asesores con indice 24, 32, 40 ... 112 puntos (A el mas bajo, L el mas alto).
const DOCE = 'ABCDEFGHIJKL'.split('').map((letra, i) => fila(`Asesor ${letra}`, 10 + i * 4, 14 + i * 4));

test('el indice de marcajes suma entradas y salidas del asesor y promedia sus tiendas', () => {
  const { marcajes } = cargar();
  const lista = marcajes([
    fila('Asesor Uno', 80, 60, 'Tienda 1'),
    fila('Asesor Uno', 100, 40, 'Tienda 2'),
    fila('Asesor Dos', 50, 50, 'Tienda 3'),
  ]);
  const uno = lista.find(x => x.name === 'Asesor Uno');
  assert.equal(uno.entradas, 90);
  assert.equal(uno.salidas, 50);
  assert.equal(uno.index, 140, 'indice = promedio entradas + promedio salidas');
  assert.equal(uno.stores, 2);
  assert.equal(lista.find(x => x.name === 'Asesor Dos').index, 100);
  assert.deepEqual(lista.map(x => x.name), ['Asesor Uno', 'Asesor Dos'], 'ordenado de mas a menos marcajes');
});

test('top 5 y bottom 5 salen de la misma lista ordenada, sin repetir nombres', () => {
  const { rank } = cargar();
  const { top, bottom, total, stores } = rank(DOCE);
  assert.equal(total, 12);
  assert.equal(stores, DOCE.length, 'los totales del encabezado cuadran con las filas de la vista');
  assert.deepEqual(top.map(x => x.name), ['Asesor L', 'Asesor K', 'Asesor J', 'Asesor I', 'Asesor H']);
  assert.deepEqual(top.map(x => x.index), [112, 104, 96, 88, 80]);
  assert.deepEqual(bottom.map(x => x.name), ['Asesor A', 'Asesor B', 'Asesor C', 'Asesor D', 'Asesor E']);
  assert.deepEqual(bottom.map(x => x.index), [24, 32, 40, 48, 56]);
  const nombres = [...top, ...bottom].map(x => x.name);
  assert.equal(new Set(nombres).size, nombres.length, 'sin duplicados entre paneles');
});

test('con 10 asesores o menos los extremos no se solapan: el bottom excluye el top', () => {
  const { rank } = cargar();
  const { top, bottom, total } = rank(DOCE.slice(0, 6));
  assert.equal(total, 6);
  assert.equal(top.length, 5);
  assert.deepEqual(bottom.map(x => x.name), ['Asesor A'], 'solo queda uno fuera del top');
  const nombres = [...top, ...bottom].map(x => x.name);
  assert.equal(new Set(nombres).size, nombres.length);
  // Un solo asesor: sale en el top y el bottom queda vacio, no duplicado.
  const uno = rank([fila('Solo', 70, 70)]);
  assert.deepEqual(uno.top.map(x => x.name), ['Solo']);
  assert.deepEqual(uno.bottom, []);
});

test('empates deterministas por nombre y asesores sin marcaje legible fuera del ranking', () => {
  const { marcajes } = cargar();
  const empatados = [fila('Zulema', 50, 50), fila('Abel', 50, 50), fila('Mario', 50, 50)];
  const orden = marcajes(empatados).map(x => x.name);
  assert.deepEqual(orden, ['Abel', 'Mario', 'Zulema'], 'mismo indice -> alfabetico');
  assert.deepEqual(marcajes(empatados.slice().reverse()).map(x => x.name), orden, 'el orden no depende de la entrada');
  const conVacios = marcajes([
    fila('Con dato', 80, 80),
    { Asesor: 'Sin dato', Plaza: 'Oaxaca', Tienda: 'T', '% Cumpl Reg Entradas': '', '% Cumpl Reg Salidas': '', '% Cumpl Reg Total': '' },
  ]);
  assert.deepEqual(conVacios.map(x => x.name), ['Con dato'], 'sin porcentajes no se rankea como el peor');
  // Un solo registro legible si cuenta: la suma usa el que exista.
  const medio = marcajes([{ ...fila('Medio', 90, 0), '% Cumpl Reg Salidas': '' }]);
  assert.equal(medio[0].index, 90);
});

test('el catalogo vigente excluye a un asesor que quedo en Compromisos_Bajas', async () => {
  const { contexto, marcajes } = cargar([
    { Plaza: 'Plaza Oaxaca', Asesor: 'Sofia Caridad Jimenez Gomez', Compromiso: 8 },
    { Plaza: 'Plaza Oaxaca', Asesor: 'Asesor Vigente', Compromiso: 4 },
  ]);
  contexto.__d11.setCatalogoAsesores({ rows: [{ asesor: 'Asesor Vigente', plaza: 'Oaxaca' }] });
  await contexto.__d11.loadRoster();
  assert.equal(contexto.__d11.esAsesorDeLaPlaza({ Plaza: 'Oaxaca', Asesor: 'Sofia Caridad Jimenez Gomez' }), false);
  const lista = marcajes([
    fila('Sofia Caridad Jimenez Gomez', 99, 99),
    fila('Asesor Vigente', 80, 80),
  ]);
  assert.deepEqual(lista.map(x => x.name), ['Asesor Vigente']);
});

test('renderRank pinta los dos paneles, los totales y deja la definicion visible', () => {
  const { contexto, nodo } = cargar();
  contexto.__d11.VIEW = DOCE;
  contexto.renderRank();
  assert.equal(nodo('rank-chip').textContent, '12 asesores · 12 tiendas');
  const top = nodo('rank-top').innerHTML, bottom = nodo('rank-bottom').innerHTML;
  assert.match(top, /Asesor L/);
  assert.match(top, /112 pts/);
  assert.match(bottom, /Asesor A/);
  assert.match(bottom, /24 pts/);
  assert.doesNotMatch(bottom, /Asesor L/, 'ningun nombre del top se repite en el bottom');
  assert.equal((top.match(/class="rank-row"/g) || []).length, 5);
  assert.equal((bottom.match(/class="rank-row"/g) || []).length, 5);
  // Vista vacia: estado explicito en lugar de una lista en blanco.
  contexto.__d11.VIEW = [];
  contexto.renderRank();
  assert.equal(nodo('rank-chip').textContent, '0 asesores · 0 tiendas');
  assert.match(nodo('rank-top').innerHTML, /Sin asesores/);
});

test('la pagina publica la seccion y la definicion del indice de marcajes', () => {
  for (const id of ['rank-section', 'rank-def', 'rank-chip', 'rank-top', 'rank-bottom']) {
    assert.match(html, new RegExp(`\\bid="${id}"`), `falta id="${id}"`);
  }
  const definicion = html.match(/id="rank-def"[^>]*>([^<]+)</)[1];
  for (const pieza of ['% Cumpl Reg Entradas', '% Cumpl Reg Salidas', '0 a 200']) {
    assert.ok(definicion.includes(pieza), `la definicion visible debe mencionar ${pieza}`);
  }
  assert.match(html, /renderMix\(\);renderAdvisors\(\);renderRank\(\);renderTable\(\)/, 'renderRank corre en cada render');
});
