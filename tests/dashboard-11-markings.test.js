const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const aliasesSource = fs.readFileSync(path.join(root, 'js', 'admin', 'column-aliases.js'), 'utf8');
const source = fs.readFileSync(path.join(root, 'js', 'admin', 'dashboard-definitions.js'), 'utf8');
const normalizersSource = fs.readFileSync(path.join(root, 'js', 'admin', 'normalizers.js'), 'utf8');
const context = { window: {} };
vm.createContext(context);
vm.runInContext(aliasesSource, context, { filename: 'column-aliases.js' });
vm.runInContext(source, context, { filename: 'dashboard-definitions.js' });
vm.runInContext(normalizersSource, context, { filename: 'normalizers.js' });

const passthrough = (row) => row;
const definitions = context.window.OXXO_ADMIN_DASHBOARDS({
  OXXO: {
    SHEETS_CONFIG: {
      TABS: new Proxy({}, { get: (_, key) => String(key) }),
      CATALOG_SHEET: 'Catalogo_Asesores',
    },
  },
  state: { fileName: 'Reporte Marcajes Sem 34.xlsx', sheetName: 'Ranking por Tienda' },
  parseDate: () => null,
  isoDate: () => '',
  containsOaxaca: () => true,
  isVacancyRow: () => true,
  deriveD1: passthrough,
  deriveD2: passthrough,
  deriveD2Denom: passthrough,
  deriveD3: passthrough,
  deriveD5: passthrough,
  deriveD6: passthrough,
  deriveD7: passthrough,
  deriveCatalog: passthrough,
  deriveInventories: passthrough,
});

const d11 = definitions.find((definition) => definition.key === 'd11');
assert(d11, 'Debe existir la definición d11');
assert.deepStrictEqual(Array.from(d11.preferredSheets), ['Ranking por Tienda']);
assert.deepStrictEqual(Array.from(d11.scopeColumns), [], 'La carga debe reemplazar toda la región, no solo la plaza activa');
// Conserva el historico: cada carga reemplaza solo su semana (tendencia,
// variacion contra la semana anterior y compromiso dependen de eso).
assert.strictEqual(d11.periodColumn, 'Semana', 'Debe publicar por semana y conservar las anteriores');

const row = d11.derive({
  Region: 'TABASCO', Plaza: 'Oaxaca', Asesor: '  Angel  Perez ', Tienda: ' OXXO Centro ',
  '% Cumpl Reg Entradas': '84.50%', '% Cumpl Reg Salidas': '0.72', '% Cumpl Reg Total': '1.04',
});
assert.strictEqual(row.Semana, 'SEM 34');
assert.strictEqual(row['% Cumpl Reg Entradas'], 0.845);
assert.strictEqual(row['% Cumpl Reg Salidas'], 0.72);
assert.strictEqual(row['% Cumpl Reg Total'], 1.04);
assert.strictEqual(row['Alerta Calidad'], 'PORCENTAJE MAYOR A 100%');
assert.strictEqual(d11.filter(row), true);
assert.strictEqual(d11.filter({ ...row, Region: 'VERACRUZ' }), false);

const normalize = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9%]+/g, ' ').trim().replace(/\s+/g, '');
const normalizers = context.window.OXXO_ADMIN_NORMALIZERS({
  state: { fileName: 'Reporte Marcajes Sem 34.xlsx', sheetName: 'Ranking por Tienda', workbook: null, sheetMatrixCache: new Map() },
  norm: normalize,
  normLoose: (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(),
  aliasesFor: (column) => [column, ...(context.window.OXXO_ADMIN_COLUMN_ALIASES[column] || [])].map(normalize),
  dashboard: () => d11,
  $: () => ({ value: '' }),
  OXXO: {
    matchesScopeValue: () => true,
    getActiveDataScope: () => ({ level: 'region', region: 'TABASCO' }),
    applyDataContextDefaults: (record) => record,
  },
});
const parsed = normalizers.rowsFromMatrix([
  ['Ranking de Tiendas por % Cumplimiento de Registros | SEM 34'],
  ['ZONA', 'Región', 'Plaza', 'Asesor', 'Tienda', '% Cumpl Reg Entradas', '% Cumpl Reg Salidas', '% Cumpl Reg Total'],
  ['SUR', 'TABASCO', 'Oaxaca', 'Asesor Uno', 'Tienda Uno', '84.5%', '72%', '78.25%'],
  ['CENTRO', 'VERACRUZ', 'Veracruz', 'Asesor Dos', 'Tienda Dos', '90%', '90%', '90%'],
], d11);
assert.strictEqual(parsed.headerRow, 2);
assert.strictEqual(parsed.rows.length, 1, 'Solo debe publicar la región Tabasco');
assert.strictEqual(parsed.rows[0].Semana, 'SEM 34');
assert.strictEqual(parsed.rows[0]['% Cumpl Reg Total'], 0.7825);

console.log('dashboard 11: reemplazo regional, semana y porcentajes correctos');
