// Ficha de Plaza (pestaña Resumen de Conoxxo): una lamina con vacantes,
// bajas y aprovechamiento por asesor que reutiliza los calculos de los
// tableros (core.js + RAE) y se descarga como imagen.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'dashboards', 'ficha-plaza.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'js', 'ficha-plaza.js'), 'utf8');

test('la pagina es de alcance fijo Plaza Oaxaca y carga los calculos de los tableros', () => {
  assert.match(html, /data-oxxo-fixed-scope="plaza"[^>]*data-oxxo-fixed-plaza="Plaza Oaxaca"/);
  for (const s of ['config.js', 'core.js', 'admin-pptx-rae.js', 'ficha-plaza.js']) assert.match(html, new RegExp(`src="\\.\\./js/${s.replace('.', '\\.')}\\?v=`));
  // Sin reglas propias: vacantes, bajas y aprovechamiento salen de core.js / RAE.
  for (const f of ['metricsD1Rows', 'metricsD2Rows', 'metricsDiasVacantesValue', 'metricsTipoPuesto', 'OXXO_RAE_DATA.dataD3']) assert.ok(js.includes(f), f);
});

test('embebida en Conoxxo exige la sesion de la app; abierta normal usa el candado del sitio', () => {
  assert.match(html, /embed=1/);
  assert.match(html, /oxxito:sessionKey/);
  assert.match(html, /rpc\/sesion_validar/);
  assert.match(html, /site-lock\.js/);
  assert.match(html, /oxxo_site_unlocked/);
});

test('render escapa nombres y muestra FOCO, sin asesor y totales', () => {
  const ctx = { window: {}, Math, Number, String, Array, Object, Date, Map, Set, Intl };
  vm.createContext(ctx);
  vm.runInContext(js, ctx);
  const F = ctx.window.OXXO_FICHA;
  const a = (nombre, aprov, extra = {}) => ({ nombre, aprov, vacantes: 1, diasProm: 2, d3: 1, d6: 0, dMas6: 0, bajas: 0, comp: 8, desfase: -8, foco: false, ...extra });
  const ficha = {
    plaza: 'Oaxaca', corte: '04 nov 2026', generada: new Date(2026, 10, 4),
    vacantes: { total: 2, lider: 0, encargado: 1, ayudante: 1, masAntigua: { dias: 13, tienda: 'OXXO Avila Camacho' }, diasProm: 2 },
    bajas: { mes: 'Noviembre 2026', total: 5, comp: 16, desfase: -11, sinAsesor: 4 },
    aprov: { pct: 92.48, completas: 246, incompletas: 19, criticas: 1, tiendas: 266 },
    asesores: [a('<img src=x onerror=alert(1)>', 87.5, { foco: true }), a('Reyna Alicia Reyes Garcia', 100, { bajas: 1, desfase: -7 })],
    totales: { d3: 2, d6: 0, dMas6: 0 },
    plazas: [{ nombre: 'Chontalpa', bajas: 9, vacantes: 29, aprov: 95.22 }, { nombre: 'Oaxaca', propia: true, bajas: 5, vacantes: 21, aprov: 92.48 }],
    bajasRegion: 14,
  };
  const el = { innerHTML: '' };
  F.render(el, ficha);
  assert.doesNotMatch(el.innerHTML, /<img src=x/);
  assert.match(el.innerHTML, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(el.innerHTML, /FOCO/);
  assert.match(el.innerHTML, /Bajas sin asesor confirmado/);
  assert.match(el.innerHTML, /CORTE 04 NOV 2026/);
  assert.match(el.innerHTML, /36% DE LAS BAJAS/);
  assert.match(el.innerHTML, /266 tiendas/);
  assert.equal(F.nombreArchivo(ficha), 'Ficha Plaza Oaxaca 2026-11-04.png');
});

test('vista de la app: escapa nombres, prioriza FOCO y ordena asesores', () => {
  const ctx = { window: {}, Math, Number, String, Array, Object, Date, Map, Set, Intl };
  vm.createContext(ctx);
  vm.runInContext(js, ctx);
  const F = ctx.window.OXXO_FICHA;
  const a = (nombre, aprov, extra = {}) => ({ nombre, aprov, vacantes: 1, diasProm: 2, d3: 1, d6: 0, dMas6: 0, bajas: 0, comp: 8, desfase: -8, foco: false, ...extra });
  const ficha = {
    plaza: 'Oaxaca', corte: '04 nov 2026', generada: new Date(2026, 10, 4),
    vacantes: { total: 5, lider: 1, encargado: 1, ayudante: 3, masAntigua: { dias: 13, tienda: 'OXXO Avila Camacho' }, diasProm: 2 },
    bajas: { mes: 'Noviembre 2026', total: 2, comp: 16, desfase: -14, sinAsesor: 1 },
    aprov: { pct: 92.48, completas: 246, incompletas: 19, criticas: 1, tiendas: 266 },
    asesores: [a('<b>Uno</b>', 87.5, { foco: true }), a('Dos Mucho', 100, { vacantes: 4, bajas: 1, desfase: -7 })],
    totales: { d3: 2, d6: 0, dMas6: 0 },
    plazas: [{ nombre: 'Tuxtla', bajas: 3, vacantes: 21, aprov: 96.57 }, { nombre: 'Oaxaca', propia: true, bajas: 2, vacantes: 5, aprov: 92.48 }],
    bajasRegion: 5,
  };
  let handler = null;
  const el = { innerHTML: '', querySelector: () => ({ set innerHTML(v) { el.parcial = v; } }), querySelectorAll: () => [], contains: () => true, set onclick(f) { handler = f; } };
  F.renderApp(el, ficha);
  assert.doesNotMatch(el.innerHTML, /<b>Uno<\/b>/);
  assert.match(el.innerHTML, /&lt;b&gt;Uno&lt;\/b&gt;/);
  assert.match(el.innerHTML, /Requieren atención/);
  assert.match(el.innerHTML, /2\.º de 2 plazas/);
  assert.ok(el.innerHTML.indexOf('&lt;b&gt;Uno') < el.innerHTML.indexOf('Dos Mucho'), 'por aprovechamiento, el menor primero');
  handler({ target: { closest: () => ({ dataset: { orden: 'vacantes' } }) } });
  assert.ok(el.parcial.indexOf('Dos Mucho') < el.parcial.indexOf('&lt;b&gt;Uno'), 'por vacantes, el de mas vacantes primero');
});
