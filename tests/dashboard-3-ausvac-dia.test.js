// Dashboard 3: columna AUSENTISMO O VACANTE AL DIA en Detalle por Tienda
// (solo con Equipo Incompleto, rojo estrictamente > 13) y su conservacion en
// la carga del admin, incluido el typo "AUSENTIMO" del Excel de origen.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');

// ── Dashboard ────────────────────────────────────────────────
const html = fs.readFileSync(path.join(root, 'dashboards', 'dashboard-3.html'), 'utf8');
const source = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
  .filter(m => !/\bsrc\s*=/i.test(m[1] || ''))
  .map(m => m[2])
  .find(s => s.includes('function renderDetalle('));
assert(source, 'No se encontró el script de dashboard-3');

const elements = {
  'detalle-card': { style: {} },
  'tabla-detalle': { innerHTML: '' },
  'detalle-count': { textContent: '' },
};
const context = vm.createContext({
  console,
  window: {},
  document: {
    addEventListener() {},
    querySelectorAll() { return []; },
    getElementById(id) { return elements[id] || null; },
  },
  OXXO_DIALOGS: { register() { return { open() {}, close() {} }; }, bindRows() {} },
  OXXO: { SHEETS_CONFIG: { TABS: { d3: 'test' } } },
});
new vm.Script(source, { filename: 'dashboards/dashboard-3.html' }).runInContext(context);
const run = code => new vm.Script(code).runInContext(context);

// Mapeo: alias exactos (typo + acentos/mayusculas) y sin colision con AUSENTISMOS/Vacante.
const mapOf = headers => JSON.parse(run(`JSON.stringify(buildMapDet([${JSON.stringify(Object.fromEntries(headers.map(h => [h, 'x'])))}]))`));
let m = mapOf(['Tienda', 'AUSENTISMOS', 'Vacante', 'AUSENTIMO O VACANTE AL DIA']);
assert.strictEqual(m.ausVacDia, 'AUSENTIMO O VACANTE AL DIA');
assert.strictEqual(m.ausent, 'AUSENTISMOS');
assert.strictEqual(m.vacante, 'Vacante');
assert.strictEqual(mapOf(['Tienda', 'Ausentismo o Vacante al Día']).ausVacDia, 'Ausentismo o Vacante al Día');
m = mapOf(['Tienda', 'AUSENTISMOS', 'Vacante']);
assert.strictEqual(m.ausVacDia, null, 'esquema viejo: sin columna, sin inventar');
m = mapOf(['Tienda', 'AUSENTISMOS', 'AUSENTISMO O VACANTE AL DIA']);
assert.strictEqual(m.vacante, null, 'Vacante no debe caer sobre la metrica nueva');

// Vacio/invalido -> null, nunca 0.
const val = v => run(`gnNullable({ X: ${JSON.stringify(v)} }, { ausVacDia: 'X' }, 'ausVacDia')`);
assert.strictEqual(val('14'), 14);
assert.strictEqual(val('0'), 0);
assert.strictEqual(val(''), null);
assert.strictEqual(val('#N/A'), null);
assert.strictEqual(run(`gnNullable({}, { ausVacDia: null }, 'ausVacDia')`), null);

const row = (tienda, estatus, ausVacDia) => ({ tienda, asesor: 'ASESOR UNO', estatus, ausVacDia, ausent: 1, vacante: 1, aprov: 100 });
context.TEST_ROWS = [
  row('T13', 'Equipo Incompleto', 13),
  row('T14', 'Equipo Incompleto', 14),
  row('T24', 'Equipo Incompleto', 24),
  row('TNULL', 'Equipo Incompleto', null),
  row('TCOMP', 'Equipo Completo', 30),
];
run(`ACTIVE_SEMANA=''; DETALLE_DATA = TEST_ROWS;`);
const trs = () => elements['tabla-detalle'].innerHTML.match(/<tr class="det-row[\s\S]*?<\/tr>/g) || [];
const trOf = t => trs().find(tr => tr.includes(`data-tienda="${t}"`));

// Sin filtro de estatus: no hay columna ni marcas.
run(`renderDetalle('', '')`);
assert(!elements['tabla-detalle'].innerHTML.includes('data-sort="ausVacDia"'));
assert(!elements['tabla-detalle'].innerHTML.includes('row-ausvac-alta'));
assert.strictEqual(trs().length, 5);

// Equipo Incompleto: columna visible, rojo solo > 13.
run(`renderDetalle('', 'incompleto')`);
const table = elements['tabla-detalle'].innerHTML;
assert(table.includes('data-sort="ausVacDia"'));
assert.strictEqual(trs().length, 4, 'TCOMP queda fuera por el filtro');
assert(!trOf('T13').includes('row-ausvac-alta'), '13 no se marca');
assert(trOf('T14').includes('row-ausvac-alta'), '14 se marca');
assert(trOf('T14').includes('<span class="ausvac-alta">14</span>'));
assert(trOf('T14').includes('(mayor a 13)'), 'texto accesible');
assert(trOf('TNULL').includes('>—<') && !trOf('TNULL').includes('row-ausvac-alta'));

// Orden por la columna: desc con null al final; asc tambien deja null al final.
run(`DET_SORT = { col:'ausVacDia', dir:'desc' }; renderDetalle();`);
assert.deepStrictEqual(trs().map(tr => tr.match(/data-tienda="([^"]+)"/)[1]), ['T24', 'T14', 'T13', 'TNULL']);
run(`DET_SORT = { col:'ausVacDia', dir:'asc' }; renderDetalle();`);
assert.deepStrictEqual(trs().map(tr => tr.match(/data-tienda="([^"]+)"/)[1]), ['T13', 'T14', 'T24', 'TNULL']);

// Busqueda se conserva; al salir de Incompleto la columna y el orden se retiran.
run(`DET_SEARCH = 't2'; renderDetalle();`);
assert.deepStrictEqual(trs().map(tr => tr.match(/data-tienda="([^"]+)"/)[1]), ['T24']);
run(`DET_SEARCH = ''; renderDetalle('', 'critica');`);
assert.strictEqual(run('DET_SORT.col'), 'ausent');
assert(!elements['tabla-detalle'].innerHTML.includes('data-sort="ausVacDia"'));

// ── Admin: la carga d3 conserva la metrica al final ──────────
const admin = { window: {} };
vm.createContext(admin);
for (const file of ['column-aliases.js', 'dashboard-definitions.js', 'normalizers.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, 'js', 'admin', file), 'utf8'), admin, { filename: file });
}
const passthrough = r => r;
const d3 = admin.window.OXXO_ADMIN_DASHBOARDS({
  OXXO: { SHEETS_CONFIG: { TABS: new Proxy({}, { get: (_, k) => String(k) }), CATALOG_SHEET: 'Catalogo_Asesores' } },
  state: {}, parseDate: () => null, isoDate: () => '', containsOaxaca: () => true, isVacancyRow: () => true,
  deriveD1: passthrough, deriveD2: passthrough, deriveD2Denom: passthrough, deriveD3: passthrough, deriveD5: passthrough,
  deriveD6: passthrough, deriveD7: passthrough, deriveCatalog: passthrough, deriveInventories: passthrough,
}).find(d => d.key === 'd3');
assert.strictEqual(d3.output[d3.output.length - 1], 'AUSENTISMO O VACANTE AL DIA', 'la columna nueva va al final');
assert(!d3.required.includes('AUSENTISMO O VACANTE AL DIA'), 'opcional para no romper el esquema viejo');

const normalize = v => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9%]+/g, ' ').trim().replace(/\s+/g, '');
const normalizers = admin.window.OXXO_ADMIN_NORMALIZERS({
  state: { workbook: null, sheetMatrixCache: new Map() },
  norm: normalize,
  normLoose: v => String(v || '').toLowerCase(),
  aliasesFor: c => [c, ...(admin.window.OXXO_ADMIN_COLUMN_ALIASES[c] || [])].map(normalize),
  dashboard: () => d3, $: () => ({ value: '' }),
  OXXO: { applyDataContextDefaults: r => r },
});
const header = ['Plaza', 'CR TIENDA', 'Asesor', 'Tienda', 'Estructura Diaria', 'AUSENTISMOS', 'Vacante', 'Aprovechamiento Estructura', 'Estatus Con impacto Ausentismo', 'FECHA'];
const base = ['Oaxaca', '50AAA', 'Laura', 'OXXO Centro', 7, 3, 2, 100, 'Equipo Incompleto', '2026-10-19'];
for (const typo of ['AUSENTIMO O VACANTE AL DIA', 'Ausentismo o Vacante al Día']) {
  const parsed = normalizers.rowsFromMatrix([[...header, typo], [...base, 15], [...base, '']], d3);
  assert.strictEqual(parsed.rows[0]['AUSENTISMO O VACANTE AL DIA'], 15, `alias ${typo}`);
  assert.strictEqual(parsed.rows[1]['AUSENTISMO O VACANTE AL DIA'], '', 'vacio se publica vacio, no 0');
  assert.strictEqual(parsed.rows[0].AUSENTISMOS, 3);
  assert.strictEqual(parsed.rows[0].Vacante, 2);
}
const viejo = normalizers.rowsFromMatrix([header, base], d3);
assert.strictEqual(viejo.rows.length, 1, 'esquema viejo sigue cargando');
assert.strictEqual(viejo.rows[0]['AUSENTISMO O VACANTE AL DIA'], '');

console.log('dashboard 3: ausentismo o vacante al dia (umbral, nulos, filtro, orden y carga) correcto');
