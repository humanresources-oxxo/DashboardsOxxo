// La documentacion debe seguir a la produccion: cada pestana configurada, cada
// pagina publicada y cada script npm aparecen documentados, y no quedan las
// afirmaciones obsoletas ("7 dashboards", "solo Oaxaca", "core con respaldo").
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const leer = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const config = (() => { const ctx = { window: {} }; vm.createContext(ctx); vm.runInContext(leer('js/config.js'), ctx); return ctx.window.OXXO_CONFIG; })();

test('ESTRUCTURA_SHEETS documenta las 20 pestanas y las auxiliares', () => {
  const doc = leer('docs/ESTRUCTURA_SHEETS.md');
  const tabs = Object.values(config.TABS);
  assert.equal(tabs.length, 20);
  for (const tab of [...tabs, config.CONFIG_SHEET, config.CATALOG_SHEET, config.STORE_CATALOG_SHEET, config.COMMITMENTS_SHEET, config.REASIGNACIONES_SHEET]) {
    assert.ok(doc.includes(tab), `docs/ESTRUCTURA_SHEETS.md no menciona ${tab}`);
  }
  for (const modo of ['replaceAll', 'replaceScope', 'replacePeriod', '_buffer_']) assert.ok(doc.includes(modo), `falta ${modo}`);
  assert.match(doc, /Promociones[^\n]*no: solo lectura/i);
});

test('DASHBOARDS documenta cada pagina del sitio', () => {
  const doc = leer('docs/DASHBOARDS.md');
  for (const pagina of fs.readdirSync(path.join(root, 'dashboards')).filter(n => n.endsWith('.html'))) {
    assert.ok(doc.includes(pagina), `docs/DASHBOARDS.md no menciona ${pagina}`);
  }
  for (const n of [10]) assert.ok(new RegExp(`Dashboard ${n} `).test(doc));
  assert.match(doc, /Dashboard 13[^\n]*Plaza Oaxaca/);
  assert.match(doc, /Mi Tienda/);
});

test('README y guias reflejan scripts npm, 14 dashboards y alcance regional', () => {
  const readme = leer('README.md');
  const scripts = JSON.parse(leer('package.json')).scripts;
  for (const nombre of Object.keys(scripts)) {
    assert.ok(readme.includes(nombre === 'test' ? 'npm test' : `npm run ${nombre}`), `README no documenta npm ${nombre}`);
  }
  assert.match(readme, /14 dashboards numerados/);
  assert.doesNotMatch(readme, /7 dashboards operativos/);
  const guia = leer('docs/GUIA_ACTUALIZACION.md') + leer('docs/SOPORTE.md');
  assert.doesNotMatch(guia, /solo\s+(?:toma\s+)?(?:registros\s+de\s+)?plaza oaxaca|solo oaxaca/i);
  assert.match(guia, /replaceScope/);
  assert.match(guia, /test:live/);
  assert.match(guia, /Nueva version/);
});

test('ARQUITECTURA documenta orden de carga, cache y limite de seguridad sin el respaldo de core', () => {
  const doc = leer('docs/ARQUITECTURA_CODIGO.md');
  assert.doesNotMatch(doc, /mantiene un fallback interno/);
  for (const clave of ['config.js', 'SHEET_CACHE_TTL_MS', 'SHEET_STALE_LIMIT_MS', 'OXXO_DIALOGS', 'disuasion', 'js/home.js']) {
    assert.ok(doc.includes(clave), `ARQUITECTURA_CODIGO.md no menciona ${clave}`);
  }
  // Las constantes documentadas existen con esos nombres en core.js.
  const core = leer('js/core.js');
  assert.match(core, /const SHEET_CACHE_TTL_MS = 2 \* 60 \* 1000/);
  assert.match(core, /const SHEET_STALE_LIMIT_MS = 10 \* 60 \* 1000/);
  assert.match(core, /const SHEET_REQUEST_TIMEOUT_MS = 18000/);
});

test('ONBOARDING ya no afirma un filtro de ingesta fijo a Oaxaca', () => {
  const doc = leer('ONBOARDING.md');
  assert.doesNotMatch(doc, /descarta\s+toda fila que no diga Oaxaca/);
  assert.match(doc, /SCOPE_MODEL/);
  assert.match(doc, /matchesAnyKnownPlaza/);
});
