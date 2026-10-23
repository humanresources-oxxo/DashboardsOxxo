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
