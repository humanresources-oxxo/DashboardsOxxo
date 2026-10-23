// Ranking del juego Turno Nocturno en Apps Script. La escritura es publica
// (el juego no tiene contraseña): todo se valida en el servidor y la hoja
// nunca crece de mas.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

class FakeSheet {
  constructor(name) { this.name = name; this.values = []; this.maxRows = 1000; this.maxCols = 26; this.hidden = false; }
  getName() { return this.name; }
  getLastRow() { return this.values.length; }
  getLastColumn() { return Math.max(0, ...this.values.map(r => r.length)); }
  getMaxRows() { return this.maxRows; }
  getMaxColumns() { return this.maxCols; }
  getFrozenRows() { return 0; }
  deleteRows(start, n) { this.maxRows -= n; }
  deleteColumns(start, n) { this.maxCols -= n; }
  hideSheet() { this.hidden = true; }
  appendRow(row) { this.values.push([...row]); this.maxRows = Math.max(this.maxRows, this.values.length); }
  getRange(row, col, rows, cols) {
    const sheet = this;
    return {
      setValues(vals) { vals.forEach((v, i) => { sheet.values[row - 1 + i] = [...v]; }); },
      getValues() { return sheet.values.slice(row - 1, row - 1 + rows).map(r => r.slice(col - 1, col - 1 + cols)); },
      clearContent() { sheet.values.splice(row - 1, rows); },
    };
  }
}

function cargar() {
  const hojas = new Map();
  const ss = {
    getSheetByName: (n) => hojas.get(n) || null,
    insertSheet: (n) => { const s = new FakeSheet(n); hojas.set(n, s); return s; },
    getSpreadsheetTimeZone: () => 'America/Mexico_City',
  };
  const cache = new Map();
  const sandbox = {
    console, Set, Map, Date, JSON, Math, String, Number, Array, Object, RegExp,
    SpreadsheetApp: { openById: () => ss, flush() {} },
    CacheService: { getScriptCache: () => ({ get: (k) => cache.get(k) ?? null, put: (k, v) => cache.set(k, v) }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Utilities: { formatDate: () => '23/10/2026' },
    ContentService: { createTextOutput: (t) => ({ texto: t, setMimeType() { return this; } }), MimeType: { JSON: 'json' } },
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, 'apps-script', 'admin-upload.gs'), 'utf8'), sandbox);
  return { gs: sandbox, ss, hojas, cache };
}
const marca = (extra = {}) => ({ nombre: 'Ana López', tiempo: 600, monitos: 25, turnos: 3, ...extra });

test('guarda una marca valida en una hoja oculta y devuelve el lugar', () => {
  const { gs, hojas } = cargar();
  const r = gs.guardarRanking_(marca());
  assert.equal(r.ok, true);
  assert.equal(r.lugar, 1);
  assert.equal(r.ranking[0].nombre, 'Ana López');
  const hoja = hojas.get('Juego_Ranking');
  assert.equal(hoja.hidden, true, 'la hoja no aparece en la portada');
  assert.deepEqual(hoja.values[0], ['Fecha', 'Nombre', 'Tiempo (s)', 'Monitos', 'Turnos']);
});

test('rechaza nombres, tiempos, monitos y turnos imposibles', () => {
  const { gs } = cargar();
  for (const [campo, valor] of [['nombre', 'x'], ['nombre', '<<>>'], ['tiempo', 10], ['tiempo', 99999], ['tiempo', 'abc'], ['monitos', -1], ['turnos', 2]]) {
    assert.throws(() => gs.guardarRanking_(marca({ [campo]: valor })), undefined, `${campo}=${valor}`);
  }
});

test('limpia el nombre: sin simbolos raros y maximo 16 caracteres', () => {
  const { gs } = cargar();
  const r = gs.guardarRanking_(marca({ nombre: '  <b>Pedro</b>   Pérez Martínez García ' }));
  assert.equal(r.ranking[0].nombre, 'bPedrob Pérez Ma');
});

test('ordena por menor tiempo y limita los envios', () => {
  const { gs, cache } = cargar();
  gs.guardarRanking_(marca({ nombre: 'Lento', tiempo: 900 }));
  const r = gs.guardarRanking_(marca({ nombre: 'Rapido', tiempo: 300 }));
  assert.deepEqual(r.ranking.map(x => x.nombre), ['Rapido', 'Lento']);
  assert.equal(r.lugar, 1);
  assert.throws(() => gs.guardarRanking_(marca({ nombre: 'Rapido', tiempo: 200 })), /Espera/, 'mismo nombre dos veces seguidas');
  cache.set('ranking_total', '40');
  assert.throws(() => gs.guardarRanking_(marca({ nombre: 'Otro' })), /muchos envíos/);
});

test('la hoja no crece de mas: conserva las mejores marcas', () => {
  const { gs, hojas, cache } = cargar();
  for (let i = 0; i < 301; i++) { cache.clear(); gs.guardarRanking_(marca({ nombre: 'Jugador ' + i, tiempo: 1000 - i })); }
  const hoja = hojas.get('Juego_Ranking');
  assert.ok(hoja.getLastRow() - 1 <= 300);
  assert.equal(gs.leerRanking_(gs.SpreadsheetApp.openById(), 1)[0].tiempo, 700);
});

test('doGet ranking y doPost rankingGuardar son publicos y no tocan la contraseña', () => {
  const { gs } = cargar();
  gs.PropertiesService = { getScriptProperties: () => ({ getProperty: () => { throw new Error('no debe pedir contraseña'); } }) };
  const post = JSON.parse(gs.doPost({ postData: { contents: JSON.stringify({ action: 'rankingGuardar', ...marca() }) } }).texto);
  assert.equal(post.ok, true);
  const get = JSON.parse(gs.doGet({ parameter: { action: 'ranking' } }).texto);
  assert.equal(get.ok, true);
  assert.equal(get.ranking[0].nombre, 'Ana López');
});
