const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

class FakeRange {
  constructor(sheet, row, column, rows, columns) {
    this.sheet = sheet;
    this.row = row;
    this.column = column;
    this.rows = rows;
    this.columns = columns;
  }
  setValues(values) {
    values.forEach((valuesRow, rowIndex) => valuesRow.forEach((value, columnIndex) => {
      const targetRow = this.row - 1 + rowIndex;
      const targetColumn = this.column - 1 + columnIndex;
      if (!this.sheet.values[targetRow]) this.sheet.values[targetRow] = [];
      this.sheet.values[targetRow][targetColumn] = value;
    }));
    return this;
  }
  clearContent() {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.columns; c++) {
        if (this.sheet.values[this.row - 1 + r]) this.sheet.values[this.row - 1 + r][this.column - 1 + c] = '';
      }
    }
    return this;
  }
  getDisplayValues() { return this.sheet.values.map(row => row.map(value => String(value ?? ''))); }
}

class FakeSheet {
  constructor(name, values = []) { this.name = name; this.values = values.map(row => [...row]); }
  getName() { return this.name; }
  getLastRow() { return this.values.length; }
  getLastColumn() { return Math.max(0, ...this.values.map(row => row.length)); }
  getMaxRows() { return Math.max(this.maxRows ?? 100, this.values.length); }
  getMaxColumns() { return Math.max(this.maxCols ?? 20, this.getLastColumn()); }
  getFrozenRows() { return 0; }
  deleteRows(start, count) { this.maxRows = this.getMaxRows() - count; this.values.splice(start - 1, count); }
  deleteColumns(start, count) { this.maxCols = this.getMaxColumns() - count; this.values.forEach(row => row.splice(start - 1, count)); }
  getDataRange() { return new FakeRange(this, 1, 1, this.getLastRow(), this.getLastColumn()); }
  getRange(row, column, rows, columns) { return new FakeRange(this, row, column, rows, columns); }
  setFrozenRows() { return this; }
  setTabColor() { return this; }
  autoResizeColumns() { return this; }
}

class FakeSpreadsheet {
  constructor(sheets) { this.sheets = new Map(sheets.map(sheet => [sheet.getName(), sheet])); }
  getSheetByName(name) { return this.sheets.get(name) || null; }
  insertSheet(name) { const sheet = new FakeSheet(name); this.sheets.set(name, sheet); return sheet; }
  getSpreadsheetTimeZone() { return 'America/Mexico_City'; }
}

const headers = ['Plaza', 'CR Reg', 'CR', 'Tienda', 'ID Tienda', 'Asesor', 'Accionable sugerido TREO'];
const treo = new FakeSheet('Dashboard_7_Semanal', [
  headers.map(() => '_buffer_'),
  headers,
  ['Plaza Oaxaca', '', '50-I34', 'OXXO Centro OAX', '', 'Marisela', ''],
  ['Plaza Oaxaca', '', '50-I34', 'OXXO Centro duplicada', '', '', ''],
  ['Tuxtla', '', '50-T01', 'OXXO Tuxtla Centro', '', 'Laura', ''],
  ['Plaza Oaxaca', '', '50-E01', 'Tienda Entrenamiento Oaxaca', '', 'Prueba', ''],
  ['Plaza Oaxaca', '', '', 'Sin CR', '', 'Prueba', '']
]);
const ss = new FakeSpreadsheet([treo]);
const sandbox = {
  console,
  SpreadsheetApp: { flush() {} },
  Utilities: { formatDate() { return '2026-09-02 10:30'; } },
  Set, Map, Date, JSON, Math, String, Number, Array, Object, RegExp
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'apps-script', 'admin-upload.gs'), 'utf8'), sandbox);

const result = sandbox.rebuildStoreCatalogFromTreo_(ss);
if (process.env.DEBUG_STORE_CATALOG) {
  console.log(result, sandbox.sheetPublicationLayout(treo), ss.getSheetByName('Catalogo_Tiendas').values);
}
assert.equal(result.ok, true);
assert.equal(result.rows, 2);
const output = ss.getSheetByName('Catalogo_Tiendas').values;
assert.equal(output[0].slice(0, 9).every(value => value === '_buffer_'), true);
// La hoja publicada queda de su tamaño real: las celdas vacias cuentan para el limite del libro.
const catalogo = ss.getSheetByName('Catalogo_Tiendas');
assert.equal(catalogo.getMaxRows(), 4);
assert.equal(catalogo.getMaxColumns(), 9);
assert.deepEqual(output[1].slice(0, 9), ['CR', 'Tienda', 'Region', 'Plaza', 'Zona', 'Asesor', 'ACTIVA', 'Fuente', 'Actualizado']);
assert.deepEqual(output.slice(2).map(row => row.slice(0, 7)), [
  ['50I34', 'OXXO Centro OAX', 'TABASCO', 'Plaza Oaxaca', '', 'Marisela', 'SI'],
  ['50T01', 'OXXO Tuxtla Centro', 'TABASCO', 'Tuxtla', '', 'Laura', 'SI']
]);

console.log('catalogo de tiendas: TREO deduplicado por CR y sin tiendas no operativas');
