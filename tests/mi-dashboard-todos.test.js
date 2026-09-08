const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const elements = new Map();
function element(id) {
  if (!elements.has(id)) elements.set(id, { style: {}, classList: { add() {}, remove() {} }, innerHTML: '', textContent: '' });
  return elements.get(id);
}
let selector;
const context = {
  window: { OXXO_FICHA: new Proxy({}, { get: (_, key) => key === 'mountSingleSelect'
    ? (id, values, options) => { selector = { values, options }; return { setValue(value) { selector.selected = value; } }; }
    : (...args) => JSON.stringify(args) }) },
  document: { getElementById: element, querySelector: element, addEventListener() {} },
  OXXO: {
    metricsVal: (row, key) => row[key], formatNum: String, truncate: String,
    metricsClasificaAprovechamiento: value => value,
    getScopeLabel: () => 'Plaza de prueba', setRetryHandler() {},
  },
};
let source = fs.readFileSync(path.join(__dirname, '../js/mi-dashboard.js'), 'utf8');
source = source.replace('  OXXO.setRetryHandler(init);', `
  window.testAPI = { DATA, ASESORES, TODOS_ASESORES, rowsFor, renderFor, mountAsesorSelector };
  OXXO.setRetryHandler(init);`);
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/metrics-periods.js'), 'utf8'), context);
vm.runInNewContext(source, context);
const api = context.window.testAPI;
api.ASESORES.add('Ana');
api.ASESORES.add('Beto');
const rows = [
  { asesor: 'Ana', tienda: 'A', estado: 'completas' },
  { asesor: 'Beto', tienda: 'B', estado: 'incompletas' },
  { asesor: 'Beto', tienda: 'C', estado: 'incompletas' },
  { asesor: 'Sin asesor', tienda: 'D', estado: 'completas' },
];
const data = { rows, asesorKey: 'asesor', tiendaKey: 'tienda', estatusKey: 'estado' };
assert.equal(api.rowsFor(data, api.TODOS_ASESORES).length, 3);
assert.equal(api.rowsFor(data, 'Ana').length, 1);
assert.equal(api.rowsFor(data, 'Beto').length, 2);
assert.equal(api.rowsFor(data, 'Otro').length, 0);

api.mountAsesorSelector();
assert.equal(selector.values[0], api.TODOS_ASESORES);
assert.equal(selector.options.pinnedValue, api.TODOS_ASESORES);
// Selecting the total before sources finish loading must survive remounting.
selector.options.onChange(api.TODOS_ASESORES);
api.DATA.d3 = data;
api.mountAsesorSelector();
assert.equal(selector.selected, api.TODOS_ASESORES);
assert.equal(element('ficha-asesor-title').textContent, 'Todos los asesores');
assert.match(element('ficha-resumen').innerHTML, /33%/); // 1/3 stores, not mean of advisor percentages (50%).
assert.match(element('ficha-resumen').innerHTML, /Consolidado/);
assert.doesNotMatch(element('ficha-resumen').innerHTML, /is-ok/);
assert.equal(element('ficha-alertas').innerHTML, '');
assert.match(element('#tbl-d3 tbody').innerHTML, /A/);
assert.match(element('#tbl-d3 tbody').innerHTML, /C/);
assert.doesNotMatch(element('#tbl-d3 tbody').innerHTML, /<td>\["D"\]<\/td>/);
// Individual filtering still works after the total was selected.
assert.equal(api.rowsFor(api.DATA.d3, 'Ana').length, 1);
console.log('Mi Dashboard: consolidated selection, weighted totals and progressive loading OK');
