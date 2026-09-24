const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'dashboards', 'dashboard-8.html'), 'utf8');
const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
const source = scripts
  .filter(match => !/\bsrc\s*=/i.test(match[1] || ''))
  .map(match => match[2])
  .find(script => script.includes('function renderDetalle(data)'));

assert(source, 'No se encontró el script de dashboard-8');

const elements = {
  'filtro-cert': { value: '' },
  'tabla-detalle': { innerHTML: '' },
  'row-count': { textContent: '' },
  'detalle-clear': { classList: { toggle() {} } },
};
const context = vm.createContext({
  console,
  window: {},
  document: {
    addEventListener() {},
    querySelectorAll() { return []; },
    getElementById(id) {
      assert(elements[id], `Elemento no simulado: ${id}`);
      return elements[id];
    },
  },
  // Controlador compartido (js/dashboard-dialogs.js): aqui solo importa que la pagina lo invoque.
  OXXO_DIALOGS: { register() { return { open() {}, close() {} }; }, bindRows() {} },
  OXXO: {
    SHEETS_CONFIG: { TABS: { d8: 'test' } },
    escHtml(value) { return String(value); },
    truncate(value) { return String(value); },
  },
});

new vm.Script(source, { filename: 'dashboards/dashboard-8.html' }).runInContext(context);
new vm.Script(`
  C = { asesor:'asesor', empleado:'empleado', puesto:'puesto', unidad:'unidad' };
  CERT_COLS = [
    { key:'cert-a', label:'Certificación A' },
    { key:'cert-b', label:'Certificación B' }
  ];
  CERT_REAL_KEYS = { 'cert-a':'cert-a', 'cert-b':'cert-b' };
`).runInContext(context);

const data = [{
  asesor: 'Asesor 1',
  empleado: 'Empleado 1',
  puesto: 'Ayudante',
  unidad: 'Tienda 1',
  'cert-a': 1,
  'cert-b': 0,
}];
context.data = data;

function renderWith(cert) {
  elements['filtro-cert'].value = cert;
  new vm.Script('renderDetalle(data)').runInContext(context);
  return elements['tabla-detalle'].innerHTML;
}

const allCerts = renderWith('');
assert(allCerts.includes('Certificación A'));
assert(allCerts.includes('Certificación B'));
assert(allCerts.includes('>100%</span>'));
assert(allCerts.includes('>0%</span>'));

const certA = renderWith('cert-a');
assert(certA.includes('Certificación A'));
assert(!certA.includes('Certificación B'));
assert(certA.includes('>100%</span>'));
assert(!certA.includes('>0%</span>'));

const certB = renderWith('cert-b');
assert(!certB.includes('Certificación A'));
assert(certB.includes('Certificación B'));
assert(!certB.includes('>100%</span>'));
assert(certB.includes('>0%</span>'));

console.log('dashboard 8: la tabla cambia sus columnas con el filtro de certificación');
