// Dashboard 11 · seguimiento semanal de marcajes. El calculo vive en
// js/dashboard-11.js (window.OXXO_D11) sin tocar el DOM; el filtro de
// asesores por catalogo/roster vive en el script de la pagina.
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const raiz = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(raiz, 'dashboards', 'dashboard-11.html'), 'utf8');
const modulo = fs.readFileSync(path.join(raiz, 'js', 'dashboard-11.js'), 'utf8');

const ctxModulo = vm.createContext({ window: {} });
new vm.Script(modulo, { filename: 'js/dashboard-11.js' }).runInContext(ctxModulo);
const D = ctxModulo.window.OXXO_D11;
const plano = v => JSON.parse(JSON.stringify(v));
const num = v => (v === '' || v === null || v === undefined ? NaN : Number(String(v).replace(',', '.')));
const C = { semana: 'Semana', plaza: 'Plaza', asesor: 'Asesor', tienda: 'Tienda', entradas: 'E', salidas: 'S', total: 'T', quality: 'Q' };
const fila = (asesor, total, { tienda, plaza = 'Oaxaca', semana = 'SEM 41', e = total, s = total, q = '' } = {}) =>
  ({ Semana: semana, Plaza: plaza, Asesor: asesor, Tienda: tienda || `T ${asesor}`, E: e, S: s, T: total, Q: q });
const leer = filas => D.leerFilas(filas, C, num);

test('pct lee fracciones, porcentajes y coma decimal; los rangos son >90 / 75-90 / 50-75 / <50', () => {
  assert.equal(D.pct('0,986', num), 98.6);
  assert.equal(D.pct(0.94, num), 94);
  assert.equal(D.pct(94, num), 94);
  assert.equal(D.pct('', num), null);
  assert.deepEqual([95, 90, 89.9, 75, 74.9, 50, 49.9, 0, null].map(v => D.rangoDe(v).id),
    ['Sobresaliente', 'Sobresaliente', 'En seguimiento', 'En seguimiento', 'Prioridad', 'Prioridad', 'Critico', 'Critico', 'Sin dato']);
});

test('el encabezado mide contra la meta del 95%, la brecha y los datos a corregir', () => {
  const r = plano(D.resumen(leer([
    fila('A', 0.9, { e: 0.98, s: 0.82 }), fila('B', 1.04, { e: 1.04, s: 1.04 }), fila('C', 0), fila('D', ''),
  ])));
  assert.equal(r.tiendas, 4);
  assert.equal(Math.round(r.total * 10) / 10, 64.7);
  assert.equal(Math.round(r.vsMeta * 10) / 10, -30.3);
  assert.ok(r.brecha > 0, 'entradas arriba de salidas');
  assert.equal(r.bajo75, 1, 'la tienda en 0%');
  assert.equal(r.cero, 1);
  assert.equal(r.fuera, 1, 'la de 104%');
  assert.equal(r.sinDato, 1);
});

test('asesores: ranking, compromiso +5, si cumplio el anterior y FOCO', () => {
  const ahora = leer([
    fila('Ana', 0.96, { tienda: 'A1' }), fila('Ana', 0.94, { tienda: 'A2' }),
    fila('Beto', 0.80, { tienda: 'B1' }),
    fila('Caro', 0.70, { tienda: 'C1' }),
    fila('Dani', 0.85, { tienda: 'D1' }),
  ]);
  const antes = leer([
    fila('Ana', 0.88, { semana: 'SEM 40', tienda: 'A1' }), fila('Ana', 0.88, { semana: 'SEM 40', tienda: 'A2' }),
    fila('Beto', 0.85, { semana: 'SEM 40', tienda: 'B1' }),
    fila('Caro', 0.60, { semana: 'SEM 40', tienda: 'C1' }),
  ]);
  const lista = plano(D.porAsesor(ahora, antes, C));
  assert.deepEqual(lista.map(a => a.nombre), ['Ana', 'Dani', 'Beto', 'Caro']);
  const [ana, dani, beto, caro] = lista;
  assert.equal(ana.total, 95); assert.equal(ana.compromiso, 100); assert.equal(ana.cumplio, true, '88+5=93 y llego a 95');
  assert.equal(beto.cumplio, false, 'tenia 90 y bajo a 80');
  assert.equal(caro.cumplio, true, 'tenia 65 y llego a 70');
  assert.equal(dani.cumplio, null, 'sin semana anterior no se califica');
  assert.equal(beto.compromiso, 85);
  assert.equal(Math.round(beto.variacion), -5);
  assert.deepEqual(lista.filter(a => a.foco).map(a => a.nombre), ['Beto', 'Caro'], 'Caro bajo 75%; Beto cayo 5 pts');
  // Una caida chica no basta para FOCO aunque no haya cumplido el compromiso.
  const chica = plano(D.porAsesor(leer([fila('Hector', 0.89), fila('Otro', 0.8)]), leer([fila('Hector', 0.897, { semana: 'SEM 40' }), fila('Otro', 0.79, { semana: 'SEM 40' })]), C));
  assert.equal(chica.find(a => a.nombre === 'Hector').cumplio, false);
  assert.equal(chica.find(a => a.nombre === 'Hector').foco, false);
  assert.equal(ana.rangos.Sobresaliente, 2);
});

test('si nadie cae en FOCO, el asesor mas bajo lo es; empates por nombre; sin dato fuera', () => {
  const lista = plano(D.porAsesor(leer([fila('Zulema', 0.9), fila('Abel', 0.9), fila('Mario', 0.92), fila('Vacio', '')]), [], C));
  assert.deepEqual(lista.map(a => a.nombre), ['Mario', 'Abel', 'Zulema']);
  assert.deepEqual(lista.filter(a => a.foco).map(a => a.nombre), ['Zulema']);
});

test('tendencia de hasta 8 semanas, con cruce de año en el orden', () => {
  assert.deepEqual(plano(D.ordenarSemanas(['SEM 41', 'SEM 38', 'SEM 40', 'SEM 39', 'SEM 41'])), ['SEM 38', 'SEM 39', 'SEM 40', 'SEM 41']);
  assert.deepEqual(plano(D.ordenarSemanas(['SEM 1', 'SEM 52', 'SEM 2', 'SEM 51'])), ['SEM 51', 'SEM 52', 'SEM 1', 'SEM 2']);
  const semanas = Array.from({ length: 10 }, (_, i) => `SEM ${30 + i}`);
  const porSemana = new Map(semanas.map((s, i) => [s, leer([fila('Ana', 0.5 + i * 0.05, { semana: s })])]));
  const t = plano(D.tendencia(porSemana, semanas, 'SEM 38'));
  assert.deepEqual(t.map(x => x.semana), semanas.slice(1, 9), 'las 8 que terminan en la elegida');
  assert.equal(Math.round(t[t.length - 1].total), 90);
});

test('tiendas que bajaron de rango contra la semana anterior', () => {
  const cambios = D.cambiosDeRango(leer([fila('Ana', 0.6, { tienda: 'X' }), fila('Ana', 0.95, { tienda: 'Y' }), fila('Ana', 0.4, { tienda: 'Nueva' })]),
    leer([fila('Ana', 0.92, { tienda: 'X', semana: 'SEM 40' }), fila('Ana', 0.7, { tienda: 'Y', semana: 'SEM 40' })]), C);
  const x = cambios.get(D.claveTienda({ Plaza: 'Oaxaca', Tienda: 'X' }, C)), y = cambios.get(D.claveTienda({ Plaza: 'Oaxaca', Tienda: 'Y' }, C));
  assert.equal(x.bajo, true); assert.equal(x.antes.id, 'Sobresaliente'); assert.equal(x.ahora.id, 'Prioridad');
  assert.equal(y.bajo, false);
  assert.equal(cambios.has(D.claveTienda({ Plaza: 'Oaxaca', Tienda: 'Nueva' }, C)), false, 'sin semana anterior no se compara');
});

test('calidad de datos y posicion de cada plaza en la region', () => {
  const [mala, vacia, ok] = leer([fila('Ana', 1.05), fila('Ana', ''), fila('Ana', 0.9)]);
  assert.deepEqual(plano(D.calidadDe(mala, C)), ['Mayor a 100%']);
  assert.deepEqual(plano(D.calidadDe(vacia, C)), ['Sin dato']);
  assert.deepEqual(plano(D.calidadDe(ok, C)), []);
  const lista = plano(D.plazas(leer([fila('A', 0.9, { plaza: 'Tuxtla' }), fila('B', 0.8, { plaza: 'Oaxaca' })]),
    leer([fila('B', 0.7, { plaza: 'Oaxaca', semana: 'SEM 40' })]), C));
  assert.deepEqual(lista.map(p => p.plaza), ['Tuxtla', 'Oaxaca']);
  assert.equal(Math.round(lista[1].variacion), 10);
  assert.equal(lista[0].variacion, null);
});

// --- filtro de asesores de la pagina (catalogo vigente y roster) ---
const inline = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
  .filter(m => !/\bsrc\s*=/i.test(m[1] || '')).map(m => m[2]).find(s => s.includes('function esAsesorDeLaPlaza('));
function cargarPagina(commitmentRows = []) {
  const contexto = vm.createContext({
    console, window: {}, document: { addEventListener() {}, getElementById: () => ({ innerHTML: '' }) },
    OXXO: { SHEETS_CONFIG: { TABS: { d11: 'Dashboard_11_Semanal' }, COMMITMENTS_SHEET: 'Compromisos_Bajas' }, metricsNum: num, matchesScopeValue: () => false, fetchSheetData: async () => commitmentRows },
  });
  new vm.Script(inline + '\nglobalThis.__d11={setCatalogoAsesores,esAsesorDeLaPlaza,loadRoster,set COL(v){COL=v}};', { filename: 'dashboard-11.html' }).runInContext(contexto);
  contexto.__d11.COL = { asesor: 'Asesor', plaza: 'Plaza', tienda: 'Tienda' };
  return contexto.__d11;
}

test('el catalogo vigente excluye a un asesor que quedo en Compromisos_Bajas', async () => {
  const p = cargarPagina([{ Plaza: 'Plaza Oaxaca', Asesor: 'Sofia Caridad Jimenez Gomez' }, { Plaza: 'Plaza Oaxaca', Asesor: 'Asesor Vigente' }]);
  p.setCatalogoAsesores({ rows: [{ asesor: 'Asesor Vigente', plaza: 'Oaxaca' }] });
  await p.loadRoster();
  assert.equal(p.esAsesorDeLaPlaza({ Plaza: 'Oaxaca', Asesor: 'Sofia Caridad Jimenez Gomez' }), false);
  assert.equal(p.esAsesorDeLaPlaza({ Plaza: 'Oaxaca', Asesor: 'Asesor Vigente' }), true);
});

test('D11 no trata Sin Asesor como un asesor valido aunque venga en el catalogo', () => {
  const p = cargarPagina();
  p.setCatalogoAsesores({ rows: [{ asesor: 'Sin Asesor Asignado', plaza: 'Oaxaca' }, { asesor: 'Asesor Vigente', plaza: 'Oaxaca' }] });
  assert.equal(p.esAsesorDeLaPlaza({ Plaza: 'Oaxaca', Asesor: 'Sin Asesor Asignado' }), false);
});

test('la pagina trae las secciones pedidas y lee las 5 plazas sin filtrar', () => {
  for (const id of ['filtro-semana', 'kpi-section', 'trend-chart', 'trend-asesor', 'mix-ring', 'advisor-table', 'store-views', 'detail-table', 'quality-list', 'plazas-list', 'exportar-lamina']) {
    assert.match(html, new RegExp(`id="${id}"`), `falta #${id}`);
  }
  assert.match(html, /fetchSheetData\(OXXO\.SHEETS_CONFIG\.TABS\.d11,\{scoped:false\}\)/);
  assert.match(html, /js\/dashboard-11\.js\?v=/);
  assert.match(modulo, /const META = 95;/);
  assert.match(modulo, /const COMPROMISO_PTS = 5;/);
});
