// Contrato de "Tiendas Alineadas por AT" (dashboard 7): desglose del indicador
// principal (% de tiendas alineadas). Cuenta con r.mov ('Movimiento Inicial'
// normalizado), deja fuera "Sin Asesor Asignado" y ordena de menor a mayor %.
// Ademas fija que el velocimetro, Mix por Concepto y Totales de Estructura ya no
// existen (repetian los KPIs o venian sin dato).
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'dashboards', 'dashboard-7.html'), 'utf8');
const source = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
  .filter(m => !/\bsrc\s*=/i.test(m[1] || ''))
  .map(m => m[2])
  .find(s => s.includes('function renderAlineadasPorAT(data)'));
assert(source, 'No se encontró renderAlineadasPorAT en dashboard-7');

const elements = { 'align-por-at': { innerHTML: '', querySelectorAll: () => [] } };
const context = vm.createContext({
  console,
  requestAnimationFrame: () => {},
  window: { addEventListener() {} },
  document: { addEventListener() {}, querySelectorAll() { return []; }, getElementById: id => elements[id] || null },
  OXXO_DIALOGS: { register() { return { open() {}, close() {} }; }, bindRows() {} },
  OXXO: { SHEETS_CONFIG: { TABS: { s7: 'test' } }, escHtml: String, truncate: String },
});
new vm.Script(source, { filename: 'dashboards/dashboard-7.html' }).runInContext(context);

context.data = [
  { asesor: 'Ana Uno Perez', mov: 'Alineada', dif: 2 },   // cuenta por r.mov aunque dif != 0
  { asesor: 'Ana Uno Perez', mov: 'Subir', dif: 0 },
  { asesor: 'Beto Dos Lopez', mov: 'Alineada', dif: 0 },
  { asesor: 'Beto Dos Lopez', mov: 'Alineada', dif: 0 },
  { asesor: 'Sin Asesor Asignado', mov: 'Bajar', dif: -1 },
];
new vm.Script('renderAlineadasPorAT(data)').runInContext(context);
const out = elements['align-por-at'].innerHTML;
assert(out.includes('>50%<'), 'Ana: 1 de 2 = 50%');
assert(out.includes('>100%<'), 'Beto: 2 de 2 = 100%');
assert(out.indexOf('>50%<') < out.indexOf('>100%<'), 'orden de menor a mayor %');
assert(out.includes('1 de 2') && out.includes('2 de 2'), 'muestra cuantas tiendas alineadas de cuantas');
assert(!/Sin Asesor/i.test(out), '"Sin Asesor Asignado" no es un AT');

assert(!html.includes('id="align-gauge"'), 'el velocimetro se quito: repetia los KPIs');
assert(!html.includes('id="dist-concepto"'), 'Mix por Concepto se quito');
assert(!html.includes('id="tot-estructura"'), 'Totales de Estructura se quito');
assert(html.includes('posiciones · SAP ${sumSap}'), 'el total SAP pasa a la tarjeta de Cobertura');
console.log('dashboard 7: % de tiendas alineadas por AT reemplaza al velocimetro');
