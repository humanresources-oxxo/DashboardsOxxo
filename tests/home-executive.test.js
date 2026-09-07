const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../js/home-executive.js'), 'utf8');
const elements = new Map();
const get = id => {
  if (!elements.has(id)) elements.set(id, { innerHTML: '', textContent: '', style: {}, setAttribute() {} });
  return elements.get(id);
};
const OXXO = {
  metricsVal: (r, k) => r[k], metricsNum: Number,
  metricsClasificaAprovechamiento: v => v,
  metricsFindKey: (r, aliases) => aliases.find(k => k in r),
  metricsD1Rows: async () => ({ rows: [], mes: '2026-09' }),
  metricsD2Rows: async () => { throw Error('offline'); },
  metricsD3Rows: async () => ({ rows: [{ Tienda: '<img src=x>', Asesor: 'A', Estado: 'criticas' }, { Tienda: 'B', Estado: 'completas' }, { Tienda: 'C', Estado: 'incompletas' }], estatusKey: 'Estado', asesorKey: 'Asesor', fecha: '2026-09-07' }),
  metricsD7Rows: async () => ({ rows: [{ a: 10, t: 10 }, { a: 0, t: 90 }], activosKey: 'a', treoKey: 't' }),
  loadSystemConfig: async () => ({}), getScopeLabel: () => 'Plaza de prueba',
};
const context = { window: {}, OXXO, document: { getElementById: get, addEventListener() {} } };
vm.runInNewContext(source.replace("  document.addEventListener('DOMContentLoaded', load);", '  globalThis.testAPI = { load, summarize, criticalStores };'), context);
(async () => {
  const { load, summarize } = context.testAPI;
  assert.equal(summarize('d3', { rows: [], estatusKey: 'Estado' }), null);
  assert.equal(summarize('s7', { rows: [{a: 2,t: 0}], activosKey:'a',treoKey:'t' }), null);
  assert.equal(summarize('d1', { rows: [], mes: '2026-09' }).value, '0');
  await load();
  assert.match(get('home-operational').innerHTML, /33.3%/);
  assert.match(get('home-operational').innerHTML, /10%/); // Ratio of totals, not 50% mean of store ratios.
  assert.match(get('home-operational').innerHTML, /Sin datos disponibles/);
  assert.match(get('home-data-status').textContent, /3\/4/);
  assert.match(get('home-priorities').innerHTML, /&lt;img/);
  assert.doesNotMatch(get('home-priorities').innerHTML, /<img/);
  OXXO.metricsD3Rows = async () => null;
  await load();
  assert.match(get('home-priorities').innerHTML, /No hay información suficiente/);
  context.document.body = { dataset: { area: 'comercial' } };
  OXXO.SHEETS_CONFIG = { TABS: { c14: 'commercial', promos: 'promos', inventories: 'inventory', s9: 'cash' } };
  OXXO.fetchSheetData = async tab => tab === 'commercial' ? [{ Tienda: 'A' }, { Tienda: 'A' }, { Tienda: 'B' }] : [{ Titulo: 'Ejemplo' }];
  await load();
  assert.match(get('home-operational').innerHTML, /Tiendas con avance comercial<\/span><strong>2/);
  assert.match(get('home-operational').innerHTML, /Promociones publicadas/);
  assert.doesNotMatch(get('home-operational').innerHTML, /Vacantes activas/);
  context.document.body.dataset.area = 'administrativo';
  await load();
  assert.match(get('home-operational').innerHTML, /Registros de inventario/);
  assert.match(get('home-operational').innerHTML, /Movimientos de caja/);
  assert.match(get('home-data-status').textContent, /todos los cortes/);
  console.log('Portada: totales, porcentajes ponderados, fuentes fallidas, ceros y escape OK');
})().catch(error => { console.error(error); process.exitCode = 1; });
