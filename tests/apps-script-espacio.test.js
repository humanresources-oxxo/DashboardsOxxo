// El libro de Google Sheets tiene un limite de celdas (vacias incluidas).
// Los respaldos se recortan a su tamaño, se borran los que sobran ANTES de
// crear uno nuevo y el mantenimiento encoge las hojas publicadas.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

class FakeSheet {
  constructor(name, { rows = 1000, cols = 26, values = [] } = {}) {
    this.name = name; this.maxRows = rows; this.maxCols = cols; this.values = values.map(r => [...r]); this.frozen = 0;
  }
  getName() { return this.name; }
  getLastRow() { return this.values.length; }
  getLastColumn() { return Math.max(0, ...this.values.map(r => r.length)); }
  getMaxRows() { return this.maxRows; }
  getMaxColumns() { return this.maxCols; }
  getFrozenRows() { return this.frozen; }
  insertRowsAfter(_, n) { this.maxRows += n; }
  insertColumnsAfter(_, n) { this.maxCols += n; }
  deleteRows(start, n) {
    assert.ok(start + n - 1 <= this.maxRows, 'no se borran filas inexistentes');
    assert.ok(start > this.frozen + 1, 'no se dejan solas las filas congeladas');
    this.maxRows -= n; this.values.splice(start - 1, n);
  }
  deleteColumns(start, n) { this.maxCols -= n; this.values.forEach(r => r.splice(start - 1, n)); }
  hideSheet() {}
  getDataRange() { return this.getRange(1, 1, this.getLastRow(), this.getLastColumn()); }
  getRange(row, col, rows, cols) {
    const sheet = this;
    return {
      setValues(vals) { vals.forEach((v, i) => { sheet.values[row - 1 + i] = sheet.values[row - 1 + i] || []; v.forEach((x, j) => { sheet.values[row - 1 + i][col - 1 + j] = x; }); }); },
      getValues() { return sheet.values.slice(row - 1, row - 1 + rows).map(r => { const out = r.slice(col - 1, col - 1 + cols); while (out.length < cols) out.push(''); return out; }); },
    };
  }
}
class FakeSpreadsheet {
  constructor(sheets) { this.list = sheets; }
  getSheets() { return [...this.list]; }
  getSheetByName(n) { return this.list.find(s => s.getName() === n) || null; }
  insertSheet(n) { const s = new FakeSheet(n); this.list.push(s); return s; }
  deleteSheet(s) { this.list = this.list.filter(x => x !== s); }
  getSpreadsheetTimeZone() { return 'America/Mexico_City'; }
}

function cargar() {
  let n = 0;
  const sandbox = {
    console, Set, Map, Date, JSON, Math, String, Number, Array, Object, RegExp,
    SpreadsheetApp: { flush() {} },
    Utilities: { formatDate() { n++; return '20261023_0800' + String(n).padStart(2, '0'); } },
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, 'apps-script', 'admin-upload.gs'), 'utf8'), sandbox);
  return sandbox;
}
function respaldo(origen, fecha) {
  return new FakeSheet('_BK_' + origen + '_' + fecha.getTime(), { rows: 1004, cols: 26, values: [
    ['Respaldo creado', fecha, 'Hoja origen', origen, 'Archivo origen', 'x'], [], ['_buffer_'], ['A'], ['1'],
  ] });
}

test('un respaldo nuevo queda del tamaño exacto y nunca hay mas de BACKUP_LIMIT', () => {
  const gs = cargar();
  const viejos = [1, 2, 3].map(d => respaldo('Dashboard_4_Semanal', new Date(2026, 9, d)));
  const ss = new FakeSpreadsheet([...viejos]);
  let maximo = 0;
  const insertar = ss.insertSheet.bind(ss);
  ss.insertSheet = (n) => { maximo = Math.max(maximo, ss.getSheets().length + 1); return insertar(n); };
  const datos = [['_buffer_', '_buffer_'], ['Semana', 'Horas'], ['Sem 43', '5']];
  const nombre = gs.saveSnapshot(ss, 'Dashboard_4_Semanal', datos, 'prueba');
  const nuevo = ss.getSheetByName(nombre);
  assert.equal(nuevo.getMaxRows(), datos.length + 2);
  assert.equal(nuevo.getMaxColumns(), 6);
  assert.equal(ss.getSheets().length, vm.runInContext('BACKUP_LIMIT', gs));
  assert.equal(maximo, vm.runInContext('BACKUP_LIMIT', gs), 'el libro nunca tiene un respaldo de mas, ni por un momento');
  assert.equal(ss.getSheetByName(viejos[0].getName()), null, 'se borra el mas viejo');
});

test('el mantenimiento encoge hojas publicadas y respaldos, y deja solo los ultimos por hoja', () => {
  const gs = cargar();
  const publicada = new FakeSheet('Dashboard_1_Diario', { rows: 40000, cols: 60, values: [['_buffer_', '_buffer_'], ['Fecha', 'Tienda'], ['2026-10-23', 'A']] });
  publicada.frozen = 2;
  const ajena = new FakeSheet('Configuracion', { rows: 1000, cols: 26, values: [['x']] });
  const bks = [1, 2, 3, 4, 5].map(d => respaldo('Dashboard_1_Diario', new Date(2026, 9, d)));
  const otro = respaldo('Dashboard_9_Semanal', new Date(2026, 8, 1));
  const ss = new FakeSpreadsheet([publicada, ajena, ...bks, otro]);
  const liberadas = gs.liberarEspacio_(ss);
  assert.ok(liberadas > 40000 * 60 - 3 * 2 - 1);
  assert.equal(publicada.getMaxRows(), 3);
  assert.equal(publicada.getMaxColumns(), 2);
  assert.equal(ajena.getMaxRows(), 1000, 'las hojas que el panel no maneja no se tocan');
  const quedan = ss.getSheets().filter(s => s.getName().startsWith('_BK_Dashboard_1_Diario')).map(s => s.getName());
  assert.deepEqual(quedan, bks.slice(-vm.runInContext('BACKUP_LIMIT', gs)).map(s => s.getName()));
  assert.ok(ss.getSheetByName(otro.getName()), 'los respaldos de otra hoja se conservan');
  assert.ok(bks.slice(-vm.runInContext('BACKUP_LIMIT', gs)).every(s => s.getMaxRows() === 5 && s.getMaxColumns() === 6));
});

test('una hoja con filas congeladas y sin datos no intenta quedarse solo con las congeladas', () => {
  const gs = cargar();
  const hoja = new FakeSheet('Dashboard_5_Semanal', { rows: 500, cols: 10, values: [['_buffer_'], ['A']] });
  hoja.frozen = 2;
  gs.ajustarTamanoHoja_(hoja, 2, 1);
  assert.equal(hoja.getMaxRows(), 3);
});

test('con el tiempo agotado la limpieza no toca nada y la publicacion sigue', () => {
  const gs = cargar();
  const publicada = new FakeSheet('Dashboard_1_Diario', { rows: 40000, cols: 60, values: [['_buffer_'], ['Fecha'], ['x']] });
  const bks = [1, 2, 3, 4].map(d => respaldo('Dashboard_1_Diario', new Date(2026, 9, d)));
  const ss = new FakeSpreadsheet([publicada, ...bks]);
  assert.equal(gs.liberarEspacio_(ss, Date.now() - 1), 0);
  assert.equal(publicada.getMaxRows(), 40000);
  assert.equal(ss.getSheets().length, 5);
});

test('el uso del libro suma todas las celdas, vacias incluidas', () => {
  const gs = cargar();
  const ss = new FakeSpreadsheet([new FakeSheet('A', { rows: 1000, cols: 26 }), new FakeSheet('B', { rows: 100000, cols: 50 })]);
  const uso = gs.usoCeldas_(ss);
  assert.equal(uso.cells, 26000 + 5000000);
  assert.equal(uso.limit, 20000000);
  assert.equal(uso.pct, 25.1);
});

test('la portada solo se redibuja si cambia la lista de hojas', () => {
  const gs = cargar();
  const props = new Map();
  gs.PropertiesService = { getScriptProperties: () => ({ getProperty: (k) => props.get(k) ?? null, setProperty: (k, v) => props.set(k, v) }) };
  let dibujos = 0;
  vm.runInContext('ensureHomeSheet_ = function() { globalThis.__dibujos = (globalThis.__dibujos || 0) + 1; }', gs);
  const hoja = (name, hidden = false) => Object.assign(new FakeSheet(name), { isSheetHidden: () => hidden });
  const ss = new FakeSpreadsheet([hoja('00_INICIO'), hoja('Dashboard_1_Diario'), hoja('_BK_Dashboard_1_Diario_1', true)]);
  assert.equal(gs.actualizarPortadaSiCambio_(ss), true);
  assert.equal(gs.actualizarPortadaSiCambio_(ss), false, 'misma lista: no se redibuja');
  ss.list.push(hoja('_BK_Dashboard_1_Diario_2', true));
  assert.equal(gs.actualizarPortadaSiCambio_(ss), false, 'un respaldo nuevo no cambia la portada');
  ss.list.push(hoja('Dashboard_15_Nuevo'));
  assert.equal(gs.actualizarPortadaSiCambio_(ss), true, 'una hoja nueva si');
  dibujos = vm.runInContext('globalThis.__dibujos', gs);
  assert.equal(dibujos, 2);
});

test('la limpieza completa solo corre con el libro desde LIMPIEZA_DESDE_PCT', () => {
  const gs = fs.readFileSync(path.join(root, 'apps-script', 'admin-upload.gs'), 'utf8');
  assert.match(gs, /if \(usoCeldas_\(ss\)\.pct >= LIMPIEZA_DESDE_PCT\) liberarEspacio_\(ss, Date\.now\(\) \+ LIMPIEZA_MAX_MS\);/);
  assert.match(gs, /try \{\s*actualizarPortadaSiCambio_\(ss\);\s*\} catch/);
});

// Respaldo por copia (v51): la hoja se duplica dentro de Google y queda con
// el mismo formato de siempre (metadatos en la fila 1, datos desde la 3).
function hojaCopiable(name, values, opts = {}) {
  const sheet = new FakeSheet(name, { rows: values.length, cols: values[0].length, values });
  sheet.frozen = 2;
  sheet.formats = [];
  sheet.copyTo = (ss) => {
    if (opts.copyFails) throw new Error('copyTo no disponible');
    const copia = new FakeSheet('Copia de ' + name, { rows: sheet.maxRows, cols: sheet.maxCols, values: sheet.values });
    copia.frozen = sheet.frozen;
    copia.setName = (n) => { copia.name = n; };
    copia.setFrozenRows = (n) => { copia.frozen = n; };
    copia.insertRowsBefore = (at, n) => {
      if (opts.insertFails) throw new Error('fallo a medias');
      copia.maxRows += n; copia.values.splice(at - 1, 0, ...Array.from({ length: n }, () => []));
    };
    copia.hidden = false; copia.hideSheet = () => { copia.hidden = true; };
    const getRange = copia.getRange.bind(copia);
    copia.getRange = (r, c, rs, cs) => Object.assign(getRange(r, c, rs, cs), {
      clearFormat() { copia.formatoLimpio = true; },
      clearContent() { for (let i = 0; i < rs; i++) copia.values[r - 1 + i] = []; },
    });
    ss.list.push(copia);
    return copia;
  };
  return sheet;
}
const datosD4 = [['_buffer_', '_buffer_'], ['Semana', 'Horas'], ['Sem 42', '5'], ['Sem 43', '7']];

test('el respaldo por copia queda con el formato de siempre y del tamaño exacto', () => {
  const gs = cargar();
  const origen = hojaCopiable('Dashboard_4_Semanal', datosD4);
  const ss = new FakeSpreadsheet([origen, ...[1, 2, 3].map(d => respaldo('Dashboard_4_Semanal', new Date(2026, 9, d)))]);
  const nombre = gs.backupCurrentSheet(ss, origen, 'Dashboard_4_Semanal', 'TE S43.xlsx');
  const bk = ss.getSheetByName(nombre);
  assert.ok(nombre.startsWith('_BK_Dashboard_4_Semanal_'));
  assert.equal(bk.values[0][0], 'Respaldo creado');
  assert.ok(bk.values[0][1] instanceof Date, 'la fecha queda como Fecha para ordenar y podar');
  assert.deepEqual(bk.values[0].slice(2, 6), ['Hoja origen', 'Dashboard_4_Semanal', 'Archivo origen', 'TE S43.xlsx']);
  assert.deepEqual(bk.values.slice(2), datosD4, 'los datos empiezan en la fila 3, iguales al origen');
  assert.equal(bk.getMaxRows(), datosD4.length + 2);
  assert.equal(bk.getMaxColumns(), 6);
  assert.equal(bk.frozen, 0);
  assert.equal(bk.hidden, true);
  assert.equal(bk.formatoLimpio, true);
  assert.deepEqual(origen.values, datosD4, 'la hoja publicada no se toca');
  const meta = gs.readBackupMetadata(ss, 'Dashboard_4_Semanal');
  assert.equal(meta.length, vm.runInContext('BACKUP_LIMIT', gs));
  assert.equal(meta[0].backupSheet, nombre, 'el nuevo es el mas reciente');
  assert.equal(meta[0].rows, datosD4.length - 2);
});

test('si la copia falla se usa el respaldo por valores', () => {
  const gs = cargar();
  const origen = hojaCopiable('Dashboard_4_Semanal', datosD4, { copyFails: true });
  const ss = new FakeSpreadsheet([origen]);
  const bk = ss.getSheetByName(gs.backupCurrentSheet(ss, origen, 'Dashboard_4_Semanal', 'x'));
  assert.equal(bk.values[0][0], 'Respaldo creado');
  assert.deepEqual(bk.values.slice(2, 2 + datosD4.length).map(r => r.slice(0, 2)), datosD4);
});

test('una copia a medias se borra y no queda como respaldo', () => {
  const gs = cargar();
  const origen = hojaCopiable('Dashboard_4_Semanal', datosD4, { insertFails: true });
  const ss = new FakeSpreadsheet([origen]);
  const nombre = gs.backupCurrentSheet(ss, origen, 'Dashboard_4_Semanal', 'x');
  assert.equal(ss.getSheets().filter(s => s.getName().startsWith('Copia de') || s.getName().startsWith('_BK_')).length, 1);
  assert.ok(ss.getSheetByName(nombre), 'queda solo el respaldo por valores');
});
