const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const listeners = new Map();
const documentStub = {
  readyState: 'loading',
  documentElement: { dataset: {} },
  body: null,
  head: { appendChild() {} },
  addEventListener(name, handler) { listeners.set(name, handler); },
  removeEventListener() {},
  dispatchEvent() {},
  getElementsByTagName() { return []; },
  getElementById() { return null; },
  querySelector() { return null; },
  querySelectorAll() { return []; },
  createElement() { return { style: {}, dataset: {}, addEventListener() {}, remove() {} }; }
};
const sandbox = {
  console,
  document: documentStub,
  location: { pathname: '/admin.html', origin: 'https://example.test', href: 'https://example.test/admin.html' },
  history: { state: null, replaceState() {} },
  sessionStorage: { getItem() { return null; }, setItem() {} },
  localStorage: { getItem() { return null; }, setItem() {} },
  navigator: {},
  CustomEvent: function CustomEvent() {},
  URL,
  Request,
  Response,
  Blob,
  setTimeout,
  clearTimeout,
  Map,
  Set,
  Date,
  Promise
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'js/config.js'), 'utf8'), sandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'js/core.js'), 'utf8'), sandbox);

const { OXXO } = sandbox;
const context = OXXO.getDataContext();
assert.equal(context.plaza, 'Plaza Oaxaca');
assert.equal(context.region, 'TABASCO');
assert.equal(OXXO.getScopeCatalog()[0].plazas.length, 5);
assert.equal(context.plazaId, 'PLAZA-OAXACA');
assert.equal(OXXO.getActiveDataScope().level, 'plaza');
assert.equal(OXXO.getActiveDataScope().plaza, 'Plaza Oaxaca');
assert.equal(OXXO.matchesScopeValue('10VHT Oaxaca', 'plaza'), true);
assert.equal(OXXO.rowMatchesDataScope({ Plaza: 'Villahermosa' }), false);
const regionalScope = OXXO.normalizeDataScope({ level: 'region', region: 'TABASCO' });
assert.equal(OXXO.rowMatchesDataScope({ Region: 'TABASCO', Plaza: 'Villahermosa' }, regionalScope), true);
assert.equal(OXXO.rowMatchesDataScope({ Region: 'TABASCO', Plaza: 'Puebla' }, regionalScope), false);
assert.equal(OXXO.filterRowsByDataScope([{ Plaza: 'Oaxaca' }, { Plaza: 'Tuxtla' }]).length, 1);
assert.equal(OXXO.rowMatchesDataScope({ Plaza: '' }, OXXO.normalizeDataScope({ level: 'plaza', plaza: 'Tuxtla' }), { legacyPlaza: 'Plaza Oaxaca' }), false);
const scopedD1Url = new URL(OXXO.buildSheetURL(OXXO.SHEETS_CONFIG.TABS.d1));
assert.match(scopedD1Url.searchParams.get('tq') || '', /where lower\(A\) contains 'oaxaca'/);
assert.equal(new URL(OXXO.buildSheetURL(OXXO.SHEETS_CONFIG.TABS.d1, { scoped: false })).searchParams.has('tq'), false);
assert.equal(new URL(OXXO.buildSheetURL(OXXO.SHEETS_CONFIG.TABS.d1, {
  scope: { level: 'region', region: 'TABASCO' }
})).searchParams.has('tq'), false);

const storeCatalog = OXXO.buildTiendaCatalog([
  { CR: '50-I34', Tienda: 'OXXO Centro OAX', Region: 'TABASCO', Plaza: '10VHT Oaxaca', ACTIVA: 'SI' },
  { CR: '50-X99', Tienda: 'OXXO Cerrada OAX', Region: 'TABASCO', Plaza: 'Plaza Oaxaca', ACTIVA: 'NO' },
  { CR: '50-E01', Tienda: 'Tienda Entrenamiento Oaxaca', Region: 'TABASCO', Plaza: 'Plaza Oaxaca', ACTIVA: 'SI' }
]);
assert.equal(storeCatalog.rows.length, 2);
assert.equal(OXXO.isTiendaValid({ storeCatalog }, 'OXXO Centro', '50I34'), true);
// Dada de baja explicitamente (ACTIVA = NO): esa es la unica forma de ocultar
// una tienda.
assert.equal(OXXO.isTiendaValid({ storeCatalog }, 'OXXO Cerrada', '50X99'), false);
// Una tienda que el catalogo todavia no registra SI cuenta. TREO se actualiza
// con retraso, asi que las tiendas recien abiertas tardan en aparecer ahi;
// descartarlas borraba tiendas reales de todos los tableros (en Plaza Oaxaca
// fueron nueve, con 31 de las 78 vacantes de septiembre). "No esta en TREO"
// significa "TREO no la registra aun", no "no existe".
assert.equal(OXXO.isTiendaValid({ storeCatalog }, 'OXXO No Catalogada', '50N00'), true);
assert.equal(OXXO.isTiendaValid({}, 'OXXO Respaldo', '50R00'), true);

// Control de Ausentismo es una fuente exclusiva de Oaxaca: una plaza recibida
// por URL o conservada en la sesion no debe cambiar su alcance.
documentStub.documentElement.dataset = {
  oxxoFixedScope: 'plaza',
  oxxoFixedRegion: 'TABASCO',
  oxxoFixedPlaza: 'Plaza Oaxaca'
};
sandbox.location.search = '?scope=plaza&region=TABASCO&plaza=Tuxtla';
assert.equal(OXXO.getPageFixedDataScope().plaza, 'Plaza Oaxaca');
assert.equal(OXXO.getActiveDataScope().plaza, 'Plaza Oaxaca');
assert.equal(OXXO.setActiveDataScope({ level: 'plaza', region: 'TABASCO', plaza: 'Tuxtla' }).plaza, 'Plaza Oaxaca');
documentStub.documentElement.dataset = {};
sandbox.location.search = '';
assert.equal(OXXO.metricsFilterBajasD2([
  { Plaza: 'Oaxaca', Medida: 'BAJA' },
  { Plaza: 'Tuxtla', Medida: 'BAJA' }
], { plazaKey: 'Plaza', medidaKey: 'Medida' }).length, 2);

// Una vacante abierta el dia del corte llega desde Sheets como el serial cero
// de Excel (30/12/1899). Debe conservarse en la vista inicial de Vacantes.
assert.equal(OXXO.metricsDiasVacantesValue('30/12/1899'), 0);
assert.deepEqual(JSON.parse(JSON.stringify(OXXO.metricsApplyD1Defaults([
  { Tienda: 'OXXO NUEVA', Puesto: 'AYUDANTE TIENDA', Dias: '30/12/1899' },
  { Tienda: 'OXXO ANTIGUA', Puesto: 'LIDER TIENDA', Dias: '12' },
  { Tienda: 'OPERACIONES 1 OAXACA', Puesto: 'AYUDANTE TIENDA', Dias: '4' },
  { Tienda: 'OXXO ADMIN', Puesto: 'ADMINISTRATIVO', Dias: '8' }
], { tiendaKey: 'Tienda', puestoKey: 'Puesto', diasKey: 'Dias' }))), [
  { Tienda: 'OXXO NUEVA', Puesto: 'AYUDANTE TIENDA', Dias: '30/12/1899' },
  { Tienda: 'OXXO ANTIGUA', Puesto: 'LIDER TIENDA', Dias: '12' }
]);

const completed = OXXO.applyDataContextDefaults(
  { Region: '', Plaza: '', Zona: '', 'CR TIENDA': ' 50-i34 ' },
  { columns: ['Region', 'Plaza', 'Zona', 'CR TIENDA'] }
);
assert.deepEqual(
  JSON.parse(JSON.stringify(completed)),
  { Region: 'TABASCO', Plaza: 'Plaza Oaxaca', Zona: '', 'CR TIENDA': '50I34' }
);

const preserved = OXXO.applyDataContextDefaults(
  { Region: 'Sur', Plaza: 'Otra plaza', CR: ' ab-123 ' },
  { columns: ['Region', 'Plaza', 'CR'] }
);
assert.equal(preserved.Region, 'Sur');
assert.equal(preserved.Plaza, 'Otra plaza');
assert.equal(preserved.CR, 'AB123');

const untouched = OXXO.applyDataContextDefaults({ Tienda: 'Centro' });
assert.deepEqual(JSON.parse(JSON.stringify(untouched)), { Tienda: 'Centro' });

assert.deepEqual(JSON.parse(JSON.stringify(OXXO.getSystemNoticeContext('/dashboards/dashboard-14.html'))), { page: 'dashboard-14', area: 'comercial' });
assert.deepEqual(JSON.parse(JSON.stringify(OXXO.getSystemNoticeContext('/dashboards/inventarios.html'))), { page: 'inventarios', area: 'administrativo' });
assert.deepEqual(JSON.parse(JSON.stringify(OXXO.getSystemNoticeContext('/dashboards/mi-tienda.html'))), { page: 'mi-tienda', area: 'rh' });
assert.equal(OXXO.systemNoticeMatches({ target: 'area:comercial' }, OXXO.getSystemNoticeContext('/dashboards/dashboard-14.html')), true);
assert.equal(OXXO.systemNoticeMatches({ target: 'dashboard:dashboard-13' }, OXXO.getSystemNoticeContext('/dashboards/dashboard-14.html')), false);

// Todos los formatos que pueden llegar desde Excel/Sheets deben producir la
// misma clave mensual. Esto protege los selectores de Dashboard 1, Dashboard
// 2, Mi Tienda, Mi Dashboard y RAE.
const septemberSerial = Math.round((Date.UTC(2026, 8, 1) - Date.UTC(1899, 11, 30)) / 86400000);
[
  'sep-26', 'septiembre 2026', 'September 2026', '2026-09', '2026/09/01',
  '01/09/2026', '09/2026', String(septemberSerial), new Date(2026, 8, 1)
].forEach((value) => assert.equal(OXXO.metricsNormalizeMonthKey(value), '2026-09', `Formato mensual no reconocido: ${value}`));
assert.equal(OXXO.metricsNormalizeMonthKey('sin periodo'), '');
assert.equal(OXXO.metricsRowMonthKeyD1({ Mes: 'sin periodo', Fecha: '2026-09-02' }, 'Mes', 'Fecha'), '2026-09');
assert.equal(OXXO.metricsRowMonthKeyD2({ Mes: 'sin periodo', Fecha: '2026-09-02' }, 'Mes', 'Fecha'), '2026-09');

// El formato historico del catalogo (solo ASESOR, TIENDA y CR TIENDA) debe
// seguir siendo valido; las columnas nuevas se completan sin pedir cambios al
// Excel que hoy usa Plaza Oaxaca.
vm.runInContext(fs.readFileSync(path.join(root, 'js/admin/column-aliases.js'), 'utf8'), sandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'js/admin/normalizers.js'), 'utf8'), sandbox);
const aliases = sandbox.OXXO_ADMIN_COLUMN_ALIASES;
const state = { fileName: 'catalogo.xlsx', sheetName: 'Hoja1', workbook: null, sheetMatrixCache: new Map() };
const norm = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9%]+/g, ' ').trim().replace(/\s+/g, '');
const normLoose = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const aliasesFor = (column) => [column, ...(aliases[column] || [])].map(norm);
let catalogDashboard;
const normalizers = sandbox.OXXO_ADMIN_NORMALIZERS({
  state, norm, normLoose, aliasesFor, OXXO,
  dashboard: () => catalogDashboard,
  $: () => ({ value: '' })
});
catalogDashboard = {
  output: ['ASESOR', 'TIENDA', 'CR TIENDA', 'Region', 'Plaza', 'Zona', 'ACTIVA'],
  required: ['ASESOR', 'TIENDA', 'CR TIENDA'],
  derive: normalizers.deriveCatalog,
  filter: (row) => Boolean(row.ASESOR && row.TIENDA && row['CR TIENDA'])
};
const parsed = normalizers.rowsFromMatrix([
  ['ASESOR', 'TIENDA', 'CR TIENDA'],
  ['Marisela Munoz', 'OXXO Centro', ' 50-i34 ']
], catalogDashboard);
assert.equal(parsed.rows.length, 1);
assert.deepEqual(JSON.parse(JSON.stringify(parsed.rows[0])), {
  ASESOR: 'Marisela Munoz', TIENDA: 'OXXO Centro', 'CR TIENDA': '50I34',
  Region: 'TABASCO', Plaza: 'Plaza Oaxaca', Zona: '', ACTIVA: 'SI'
});

// Capacidades llega en dos formatos de Excel. El reporte actual nombra la
// certificacion simplemente "PLD 2026"; debe conservarse en la columna
// tecnica que usan Dashboard 8 y Mi Tienda.
catalogDashboard = {
  output: ['Plaza', 'Asesor_Correcto', 'Unidad org.', 'Cr de tienda', 'Puesto_Correcto', 'Nº personal', 'Empleados', 'Promedio de PLD2026Certificacion'],
  required: ['Plaza', 'Asesor_Correcto', 'Puesto_Correcto', 'Empleados'],
  derive: (row) => row,
  filter: (row) => Boolean(row.Empleados)
};
const capacidades = normalizers.rowsFromMatrix([
  ['Plaza', 'Asesor_Correcto', 'Unidad org.', 'Cr de tienda', 'Puesto_Correcto', 'Nº personal', 'Empleados', 'PLD 2026'],
  ['Oaxaca', 'Laura Alejandra Moreno Mayoral', 'OXXO COSTA CHICA OAX', '50TDH', 'Líder', '3142521', 'Ivon Montalvan Ibarra', '100%']
], catalogDashboard);
assert.equal(capacidades.rows.length, 1);
assert.equal(capacidades.rows[0]['Promedio de PLD2026Certificacion'], '100%');

console.log('data-context, alcance regional, periodos, catalogo de tiendas y avisos: 42 pruebas correctas');
