// `npm run assets:check` corre en CI y en Windows: debe ser de solo lectura,
// resolver la raiz del repo sin duplicar la unidad (C:\C:\...) y fallar solo
// cuando una referencia local de js/css no comparte la version de las demas.
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const raiz = path.resolve(__dirname, '..');
const script = path.join(raiz, 'scripts', 'version-assets.mjs');
const htmls = ['index.html', 'admin.html'].map(f => path.join(raiz, f));
const foto = () => htmls.map(f => fs.readFileSync(f, 'utf8'));

test('--check pasa en el arbol actual y no escribe nada', () => {
  const antes = foto();
  const r = spawnSync(process.execPath, [script, '--check'], { cwd: raiz, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /todas al dia/);
  assert.deepEqual(foto(), antes, '--check no debe modificar archivos');
});

test('--check con una etiqueta distinta a la actual falla sin escribir', () => {
  const antes = foto();
  const r = spawnSync(process.execPath, [script, '--check', 'etiqueta-inexistente'], { cwd: raiz, encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.deepEqual(foto(), antes);
});
