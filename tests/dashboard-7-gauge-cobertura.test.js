// Contrato del velocímetro de "Alineación Global" (dashboard 7): la cifra grande y su
// etiqueta son la Cobertura de estructura (Activos ÷ TREO), mientras que los conteos
// Alineada / Subir / Bajar siguen saliendo de 'Dif SAP vs Est Optima Final'.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'dashboards', 'dashboard-7.html'), 'utf8');
const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
const source = scripts
  .filter(match => !/\bsrc\s*=/i.test(match[1] || ''))
  .map(match => match[2])
  .find(script => script.includes('function renderDonut(data)'));

assert(source, 'No se encontró el script de dashboard-7');

const elements = {
  'align-gauge': { innerHTML: '' },
  'align-summary': { innerHTML: '' },
  'mix-ali': { textContent: '' },
  'mix-sub': { textContent: '' },
  'mix-baj': { textContent: '' },
};

const context = vm.createContext({
  console,
  window: { addEventListener() {} },
  document: {
    addEventListener() {},
    querySelectorAll() { return []; },
    getElementById(id) {
      assert(elements[id], `Elemento no simulado: ${id}`);
      return elements[id];
    },
  },
  OXXO_DIALOGS: { register() { return { open() {}, close() {} }; }, bindRows() {} },
  OXXO: { SHEETS_CONFIG: { TABS: { s7: 'test' } }, escHtml: String, truncate: String },
});

new vm.Script(source, { filename: 'dashboards/dashboard-7.html' }).runInContext(context);

// 7 activos de 10 TREO = 70% de cobertura; 1 alineada / 1 por subir / 1 por bajar.
context.data = [
  { dif: 0, est_final: 4, empleados: 4 },
  { dif: 2, est_final: 4, empleados: 2 },
  { dif: -1, est_final: 2, empleados: 1 },
];
new vm.Script('renderDonut(data)').runInContext(context);

const svg = elements['align-gauge'].innerHTML;
assert(svg.includes('>70%</text>'), 'la cifra grande del gauge debe ser la cobertura (70%)');
assert(svg.includes('>cobertura</text>'), 'la etiqueta del gauge debe decir "cobertura"');
assert(!svg.includes('>33%</text>'), 'el gauge ya no debe mostrar el % de alineación');
assert(!svg.includes('>alineadas</text>'), 'el gauge ya no debe etiquetarse "alineadas"');

// La aguja sigue a la métrica mostrada: 70% -> ángulo 0.3π, x≈100+68·cos(0.3π)=140.0
const needle = svg.match(/<line x1="100" y1="100" x2="([\d.]+)" y2="([\d.]+)"/);
assert(needle, 'no se encontró la aguja del velocímetro');
assert.strictEqual(needle[1], '140.0', 'la aguja debe apuntar al % de cobertura');

// Los conteos de movimiento y sus segmentos no cambian.
assert.strictEqual(elements['mix-ali'].textContent, 1);
assert.strictEqual(elements['mix-sub'].textContent, 1);
assert.strictEqual(elements['mix-baj'].textContent, 1);
['#138c3e', '#B85000', '#C0393B'].forEach(color => {
  assert(svg.includes(`stroke="${color}"`), `falta el segmento ${color}`);
});

// El mini-resumen conserva su propio cálculo de cobertura.
assert(elements['align-summary'].innerHTML.includes('70%'), 'el resumen conserva la cobertura');

console.log('dashboard 7: el velocímetro expone la cobertura como cifra principal');
