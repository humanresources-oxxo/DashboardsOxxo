const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const read = file => fs.readFileSync(file, 'utf8');

test('los dashboards administrativos aplican el asesor vigente del CNT', () => {
  const d11 = read('dashboards/dashboard-11.html');
  assert.match(d11, /loadAsesorCatalog\(\)/, 'D11 carga el CNT');
  assert.match(d11, /applyAsesorCatalog\(/, 'D11 normaliza el asesor');
  assert.match(d11, /cr:key\(h,\['CR'/, 'D11 prioriza CR para resolver la tienda');

  const d14 = read('dashboards/dashboard-14.html');
  assert.match(d14, /loadAsesorCatalog\(\)/, 'D14 carga el CNT');
  assert.match(d14, /resolveAsesorD1\(/, 'D14 normaliza el asesor');

  const inventories = read('js/inventarios.js');
  assert.match(inventories, /loadAsesorCatalog\(\)/, 'Inventarios carga el CNT');
  assert.match(inventories, /resolveAsesorD1\(/, 'Inventarios normaliza el asesor');
  assert.match(inventories, /metricsCanonicalPlazaLabel\(/, 'Inventarios usa la plaza canónica');
});

test('los periodos compartidos canonizan la plaza antes de agrupar', () => {
  const periods = read('js/metrics-periods.js');
  assert.match(periods, /metricsCanonicalPlazaLabel\(/);
  assert.match(periods, /applyAsesorCatalog\(/);
});

test('el diagnóstico admin vigila el CNT y la columna de división de RAE', () => {
  const quality = read('js/admin-data-quality.js');
  assert.match(quality, /kind: 'advisor-catalog'/, 'Administración revisa el CNT');
  assert.match(quality, /inspectAdvisorCatalog\(/, 'Administración valida filas y CR duplicados');
  assert.match(quality, /\['div\.p\.'\]/, 'Administración detecta si RAE pierde Div.P.');
});
