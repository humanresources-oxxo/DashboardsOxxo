// Contrato de la clasificación de movimiento en dashboard 7: la columna 'Movimiento Inicial'
// de la hoja es la fuente oficial (Alineada / Subir / Bajar) y manda sobre el cálculo
// numérico de 'Dif SAP vs Est Optima Final'. Solo cuando ese texto viene vacío o desconocido
// se cae al signo del dif, y en ese caso la estructura diaria sí puede recalcularlo.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'dashboards', 'dashboard-7.html'), 'utf8');
const source = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
  .filter(match => !/\bsrc\s*=/i.test(match[1] || ''))
  .map(match => match[2])
  .find(script => script.includes('function normalizeRow(row)'));

assert(source, 'No se encontró el script de dashboard-7');

const context = vm.createContext({
  console,
  window: { addEventListener() {} },
  document: { addEventListener() {}, querySelectorAll() { return []; }, getElementById() { return null; } },
  OXXO_DIALOGS: { register() { return { open() {}, close() {} }; }, bindRows() {} },
  OXXO: { SHEETS_CONFIG: { TABS: { s7: 'test' } }, escHtml: String, truncate: String },
});
new vm.Script(source, { filename: 'dashboards/dashboard-7.html' }).runInContext(context);
const run = expr => new vm.Script(expr).runInContext(context);

const fila = extra => Object.assign({
  Plaza: '10VHT Oaxaca',
  Tienda: 'Tienda X',
  'ID Tienda': '12345',
  'Estructura SAP': '8',
  'Estructura Propuesta TREO P2 Jun - Ago': '8',
  'Empleados Activos': '8',
  'Dif SAP vs Est Optima Final': '0',
}, extra);

// 1) El texto manda aunque el dif diga otra cosa (el caso de las 251 tiendas de Oaxaca:
// 208 Alineada / 36 Subir / 7 Bajar según la hoja, no según el número).
context.fila = fila({ 'Movimiento Inicial': 'Alineada', 'Dif SAP vs Est Optima Final': '2' });
let r = run('normalizeRow(fila)');
assert.strictEqual(r.mov, 'Alineada', "el texto 'Alineada' debe ganarle a un dif de +2");
assert.strictEqual(r.mov_src, 'texto');
assert.strictEqual(r.dif, '2', 'el dif numérico se conserva tal cual para las posiciones netas');

context.fila = fila({ 'Movimiento Inicial': 'Subir', 'Dif SAP vs Est Optima Final': '0' });
assert.strictEqual(run('normalizeRow(fila).mov'), 'Subir', "el texto 'Subir' debe ganarle a un dif de 0");

context.fila = fila({ 'Movimiento Inicial': 'Bajar', 'Dif SAP vs Est Optima Final': '3' });
assert.strictEqual(run('normalizeRow(fila).mov'), 'Bajar', "el texto 'Bajar' debe ganarle a un dif de +3");

// 2) Fallback numérico cuando el texto viene vacío o es desconocido.
[['', -2, 'Bajar'], ['', 1, 'Subir'], ['', 0, 'Alineada'], ['Revisar con RH', 1, 'Subir']]
  .forEach(([texto, dif, esperado]) => {
    context.fila = fila({ 'Movimiento Inicial': texto, 'Dif SAP vs Est Optima Final': String(dif) });
    const row = run('normalizeRow(fila)');
    assert.strictEqual(row.mov, esperado, `fallback numérico para texto "${texto}" y dif ${dif}`);
    assert.strictEqual(row.mov_src, 'calculo');
  });

// 3) La estructura diaria (SAP/Activos reales) no sobrescribe la clasificación textual,
// pero sí recalcula la derivada del dif.
const estructura = {
  ready: true,
  byCr: new Map([['12345', new Map([['sap', 10], ['activos', 9]])]]),
  byTienda: new Map(),
};
context.estructura = estructura;

context.fila = fila({ 'Movimiento Inicial': 'Alineada', 'Dif SAP vs Est Optima Final': '0' });
context.base = run('normalizeRow(fila)');
let aplicado = run('applyEstructuraDiaria(base, estructura)');
assert.strictEqual(aplicado.est_sap, '10', 'la estructura diaria sí actualiza SAP');
assert.strictEqual(aplicado.dif, '-2', 'la estructura diaria sí actualiza el dif (TREO 8 - SAP 10)');
assert.strictEqual(aplicado.mov, 'Alineada', 'TREO-SAP no debe sobrescribir el texto de la hoja');

context.fila = fila({ 'Movimiento Inicial': '', 'Dif SAP vs Est Optima Final': '0' });
context.base = run('normalizeRow(fila)');
aplicado = run('applyEstructuraDiaria(base, estructura)');
assert.strictEqual(aplicado.mov, 'Bajar', 'sin texto, la estructura diaria recalcula el movimiento');

// 4) Los conteos de KPIs usan r.mov, no el dif.
const elements = {
  'kpi-section': { innerHTML: '' },
};
context.document.getElementById = id => elements[id] || null;
context.ACTIVE_KPI = '';
context.data = [
  { mov: 'Alineada', dif: '2', est_final: 4, empleados: 4, vacantes: 0 },
  { mov: 'Alineada', dif: '-1', est_final: 4, empleados: 4, vacantes: 0 },
  { mov: 'Subir', dif: '0', est_final: 4, empleados: 3, vacantes: 1 },
];
run('renderKPIs(data)');
const kpis = elements['kpi-section'].innerHTML;
const valores = [...kpis.matchAll(/kpi-card__label">([^<]*)<[\s\S]*?kpi-card__value">([^<]*)</g)]
  .reduce((acc, m) => Object.assign(acc, { [m[1].trim()]: m[2].trim() }), {});
assert.strictEqual(valores['Alineadas ✔'], '2', 'KPI Alineadas debe contar r.mov, no dif===0');
assert.strictEqual(valores['Por Subir ▲'], '1', 'KPI Por Subir debe contar r.mov');
assert.strictEqual(valores['Por Bajar ▼'], '0', 'KPI Por Bajar debe contar r.mov, no dif<0');
// Las posiciones netas siguen saliendo del dif numérico.
assert(kpis.includes('+2 posiciones a agregar'), 'las posiciones a agregar siguen saliendo del dif');
assert(kpis.includes('−1 posiciones a liberar'), 'las posiciones a liberar siguen saliendo del dif');
// Cobertura Activos/TREO sin cambios: 11 activos de 12 TREO = 92%.
assert(kpis.includes('>92%<'), 'la cobertura Activos/TREO no cambia');

console.log("dashboard 7: 'Movimiento Inicial' manda y el fallback numérico sigue vivo");
