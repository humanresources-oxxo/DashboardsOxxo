// Dashboard 3: columna Suma Vacante/Ausentismo (EP de Medicion = SUMA AUSENTISMOS
// + Vacantes acumuladas) en Detalle por Tienda, solo con Equipo Incompleto y rojo
// estrictamente > 13. Ya no se usa "AUSENTIMO O VACANTE AL DIA" (FC) ni "Vacante".
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

const mapOf = headers => JSON.parse(run(`JSON.stringify(buildMapDet([${JSON.stringify(Object.fromEntries(headers.map(h => [h, 'x'])))}]))`));
// Valor por tienda por la misma ruta que initDashboard: buildMapDet + sumaVacAusOf.
const sumas = rows => JSON.parse(run(`(() => { const d = ${JSON.stringify(rows)}; const md = buildMapDet(d); return JSON.stringify(d.map(r => sumaVacAusOf(r, md))); })()`));

// Filas del Excel original APROVECHAMIENTO ZCS 19.10.2026 (Medicion): EP = DE + EK.
const FC = 'AUSENTIMO O VACANTE AL DIA';
const EP = 'Suma Vacante/Ausentismo';
const original = [
  { Tienda: 'TANGUYU', AUSENTISMOS: 5, Vacantes: 19, Vacante: 2, [FC]: 2, [EP]: 24 },
  { Tienda: 'FERROCARRIL', AUSENTISMOS: 5, Vacantes: 19, Vacante: 3, [FC]: 3, [EP]: 24 },
  { Tienda: 'NUNO', AUSENTISMOS: 5, Vacantes: 15, Vacante: 1, [FC]: 1, [EP]: 20 },
];
const sin = (rows, ...cols) => rows.map(r => Object.fromEntries(Object.entries(r).filter(([k]) => !cols.includes(k))));
const con = (rows, patch) => rows.map(r => ({ ...r, ...patch }));

// Mapeo exacto: EP sin importar acentos/mayusculas, sin colision con Vacante/Vacantes/AUSENTISMOS/FC.
let m = mapOf(['Tienda', 'AUSENTISMOS', 'Vacante', 'Vacantes', FC, EP]);
assert.strictEqual(m.sumaVacAus, EP);
assert.strictEqual(m.ausent, 'AUSENTISMOS');
assert.strictEqual(m.vacante, 'Vacante');
assert.strictEqual(m.sumaVacAusAus, null, 'con EP no se usa el respaldo');
assert.strictEqual(mapOf(['Tienda', 'SUMA VACANTE / AUSENTISMO']).sumaVacAus, 'SUMA VACANTE / AUSENTISMO');
assert.strictEqual(mapOf(['Tienda', 'Súma vacante/ausentismo']).sumaVacAus, 'Súma vacante/ausentismo');
m = mapOf(['Tienda', 'AUSENTISMOS', 'Vacante', FC]);
assert.strictEqual(m.sumaVacAus, null);
assert.strictEqual(m.sumaVacAusVac, null, 'Vacante singular nunca sustituye a Vacantes');
assert.strictEqual(mapOf(['Tienda', 'AUSENTISMOS', EP]).vacante, null, 'Vacante no debe caer sobre EP');
assert.strictEqual(mapOf(['Tienda', 'AUSENTISMOS', FC]).vacante, null, 'Vacante no debe caer sobre FC');
m = mapOf(['Tienda', 'Vacantes totales', 'AUSENTISMOS ACUMULADOS']);
assert.strictEqual(m.sumaVacAusVac, null, 'sin parciales');
assert.strictEqual(m.sumaVacAusAus, null, 'sin parciales');

// EP manda: 24/24/20; nunca FC (2/3/1) ni AUSENTISMOS + Vacante (7/8/6).
assert.deepStrictEqual(sumas(original), [24, 24, 20]);
assert.deepStrictEqual(sumas(con(original, { [EP]: 9 })), [9, 9, 9], 'EP presente tiene precedencia');
// EP presente pero vacio/invalido: null, sin reconstruir.
assert.deepStrictEqual(sumas(con(original, { [EP]: '' })), [null, null, null]);
assert.deepStrictEqual(sumas(con(original, { [EP]: '#N/A' })), [null, null, null]);
// Base vieja sin EP: AUSENTISMOS + Vacantes (plural), ambas exactas.
const vieja = sin(original, EP);
assert.deepStrictEqual(sumas(vieja), [24, 24, 20]);
assert.deepStrictEqual(sumas(con(vieja, { Vacantes: '' })), [null, null, null], 'Vacantes vacia -> null');
assert.deepStrictEqual(sumas(con(vieja, { AUSENTISMOS: 'x' })), [null, null, null], 'AUSENTISMOS invalido -> null');
assert.deepStrictEqual(sumas(sin(vieja, 'Vacantes')), [null, null, null], 'solo Vacante singular/FC -> null');
assert.deepStrictEqual(sumas(sin(vieja, 'AUSENTISMOS')), [null, null, null]);
assert.deepStrictEqual(sumas([{ Tienda: 'T', AUSENTISMOS: 0, Vacantes: 19 }]), [19], 'respaldo solo con plural');

// Vacio/invalido -> null, nunca 0.
const val = v => run(`gnNullable({ X: ${JSON.stringify(v)} }, { sumaVacAus: 'X' }, 'sumaVacAus')`);
assert.strictEqual(val('14'), 14);
assert.strictEqual(val('0'), 0);
assert.strictEqual(val(''), null);
assert.strictEqual(val('#N/A'), null);

const row = (tienda, estatus, sumaVacAus) => ({ tienda, asesor: 'ASESOR UNO', estatus, sumaVacAus, ausent: 1, vacante: 1, aprov: 100 });
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
const orden = () => trs().map(tr => tr.match(/data-tienda="([^"]+)"/)[1]);

// Sin filtro de estatus: no hay columna ni marcas.
run(`renderDetalle('', '')`);
assert(!elements['tabla-detalle'].innerHTML.includes('data-sort="sumaVacAus"'));
assert(!elements['tabla-detalle'].innerHTML.includes('row-ausvac-alta'));
assert.strictEqual(trs().length, 5);

// Equipo Incompleto: columna visible con el encabezado nuevo, rojo solo > 13.
run(`renderDetalle('', 'incompleto')`);
const table = elements['tabla-detalle'].innerHTML;
assert(table.includes('data-sort="sumaVacAus"'));
assert(table.includes('Suma Vacante/<br>Ausentismo'));
assert(!/vacante al d[ií]a/i.test(table), 'sin el encabezado viejo');
assert(table.includes('data-rh-page-size="15"'), 'paginacion intacta');
assert.strictEqual(trs().length, 4, 'TCOMP queda fuera por el filtro');
assert(!trOf('T13').includes('row-ausvac-alta'), '13 no se marca');
assert(trOf('T14').includes('row-ausvac-alta'), '14 se marca');
assert(trOf('T14').includes('<span class="ausvac-alta">14</span>'));
assert(trOf('T14').includes('(mayor a 13)'), 'texto accesible');
assert(trOf('TNULL').includes('aria-label="Sin dato"') && !trOf('TNULL').includes('row-ausvac-alta'));

// Orden por la columna: null al final en ambas direcciones.
run(`DET_SORT = { col:'sumaVacAus', dir:'desc' }; renderDetalle();`);
assert.deepStrictEqual(orden(), ['T24', 'T14', 'T13', 'TNULL']);
run(`DET_SORT = { col:'sumaVacAus', dir:'asc' }; renderDetalle();`);
assert.deepStrictEqual(orden(), ['T13', 'T14', 'T24', 'TNULL']);

// Busqueda se conserva; al salir de Incompleto la columna y el orden se retiran.
run(`DET_SEARCH = 't2'; renderDetalle();`);
assert.deepStrictEqual(orden(), ['T24']);
run(`DET_SEARCH = ''; renderDetalle('', 'critica');`);
assert.strictEqual(run('DET_SORT.col'), 'ausent');
assert(!elements['tabla-detalle'].innerHTML.includes('data-sort="sumaVacAus"'));

// Las tiendas originales salen en rojo con su valor EP, no con FC.
context.TEST_ROWS = sumas(original).map((v, i) => row(original[i].Tienda, 'Equipo Incompleto', v));
run(`DETALLE_DATA = TEST_ROWS; DET_SORT = { col:'sumaVacAus', dir:'desc' }; renderDetalle('', 'incompleto');`);
assert.deepStrictEqual(orden(), ['TANGUYU', 'FERROCARRIL', 'NUNO']);
assert(trOf('TANGUYU').includes('<span class="ausvac-alta">24</span>'));
assert(trOf('NUNO').includes('<span class="ausvac-alta">20</span>'));

// ── Admin: la carga d3 agrega EP al final y conserva FC ─────
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
assert.strictEqual(d3.output[d3.output.length - 1], EP, 'EP va al final');
assert(d3.output.includes('AUSENTISMO O VACANTE AL DIA'), 'FC se conserva por compatibilidad');
assert(!d3.required.includes(EP), 'opcional para no romper el esquema viejo');

// Mismo norm que js/admin.js.
const normalize = v => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9%]+/g, ' ').trim().replace(/\s+/g, '');
const normalizers = admin.window.OXXO_ADMIN_NORMALIZERS({
  state: { workbook: null, sheetMatrixCache: new Map() },
  norm: normalize,
  normLoose: v => String(v || '').toLowerCase(),
  aliasesFor: c => [c, ...(admin.window.OXXO_ADMIN_COLUMN_ALIASES[c] || [])].map(normalize),
  dashboard: () => d3, $: () => ({ value: '' }),
  OXXO: { applyDataContextDefaults: r => r },
});
const header = ['Plaza', 'CR TIENDA', 'Asesor', 'Tienda', 'Estructura Diaria', 'AUSENTISMOS', 'Vacante', 'Vacantes', 'Aprovechamiento Estructura', 'Estatus Con impacto Ausentismo', 'FECHA', FC];
const base = ['Oaxaca', '50AAA', 'Laura', 'TANGUYU', 7, 5, 2, 19, 80, 'Equipo Incompleto', '2026-10-19', 2];
for (const alias of ['Suma Vacante/Ausentismo', 'SUMA VACANTE / AUSENTISMO', 'súma vacante ausentismo']) {
  const parsed = normalizers.rowsFromMatrix([[...header, alias], [...base, 24], [...base, '']], d3);
  assert.strictEqual(parsed.rows[0][EP], 24, `alias ${alias}`);
  assert.strictEqual(parsed.rows[1][EP], '', 'vacio se publica vacio, no 0');
  assert.strictEqual(parsed.rows[0]['AUSENTISMO O VACANTE AL DIA'], 2, 'FC sigue publicandose');
  assert.strictEqual(parsed.rows[0].AUSENTISMOS, 5);
  assert.strictEqual(parsed.rows[0].Vacante, 2);
  assert.strictEqual(parsed.rows[0].Vacantes, 19);
}
const viejo = normalizers.rowsFromMatrix([header, base], d3);
assert.strictEqual(viejo.rows.length, 1, 'esquema viejo sigue cargando');
assert.strictEqual(viejo.rows[0][EP], '', 'sin EP la carga no inventa valor');

console.log('dashboard 3: Suma Vacante/Ausentismo (EP, respaldo, umbral, nulos, filtro, orden y carga) correcto');
