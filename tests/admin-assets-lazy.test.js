// js/admin-assets.js: tras desbloquear el panel solo se precalienta XLSX; JSZip
// y PptxGenJS se descargan unicamente al pedirlos, con el mismo tope de 20 s.
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function entorno() {
  const cargados = [];
  const timers = [];
  const window = {};
  const document = {
    createElement() { return { remove() {}, set src(v) { this._src = v; }, get src() { return this._src; } }; },
    head: {
      appendChild(script) {
        cargados.push(script.src);
        // Cada CDN "descarga" y deja su global disponible.
        if (/xlsx/.test(script.src)) window.XLSX = {};
        if (/jszip/.test(script.src)) window.JSZip = function JSZip() {};
        if (/pptxgenjs/.test(script.src)) window.PptxGenJS = function PptxGenJS() {};
        setImmediate(() => script.onload());
      }
    }
  };
  const contexto = { window, document, Promise, Error, setTimeout: (fn, ms) => { timers.push(ms); return timers.length; }, clearTimeout() {} };
  vm.createContext(contexto);
  vm.runInContext(fs.readFileSync(path.join(root, 'js/admin-assets.js'), 'utf8'), contexto);
  return { api: window.OXXO_ADMIN_ASSETS, cargados, timers, window };
}

test('warmup precalienta solo XLSX', async () => {
  const { api, cargados } = entorno();
  await api.warmup();
  assert.equal(cargados.length, 1);
  assert.match(cargados[0], /xlsx@/);
});

test('JSZip y PptxGenJS siguen bajo demanda, con dependencia y tope de 20 s', async () => {
  const { api, cargados, timers } = entorno();
  await api.ensure('pptx');
  assert.ok(cargados.some(u => /jszip@/.test(u)), 'pptx depende de jszip');
  assert.ok(cargados.some(u => /pptxgenjs@/.test(u)));
  assert.ok(!cargados.some(u => /xlsx@/.test(u)), 'pedir pptx no arrastra xlsx');
  assert.ok(timers.every(ms => ms === 20000), 'tope de 20 s por recurso');
});

test('admin.js solo llama a warmup y nunca pide pptx/jszip al desbloquear', () => {
  const admin = fs.readFileSync(path.join(root, 'js/admin.js'), 'utf8');
  assert.match(admin, /OXXO_ADMIN_ASSETS\?\.warmup\(\)/);
  const desbloqueo = admin.slice(admin.indexOf('lock.classList.add(\'hidden\')'), admin.indexOf('}catch(err){'));
  assert.doesNotMatch(desbloqueo, /ensure\(\s*'(?:pptx|jszip)'/);
});
