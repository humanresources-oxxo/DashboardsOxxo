// En modo compatible (sin respuesta de Apps Script) el panel confirma la
// publicacion con la bitacora: Apps Script escribe "Correcta" solo al
// terminar. La hoja publica no sirve de prueba (el 23/10/2026
// Dashboard_3_Diario, una foto diaria de ~1,055 filas, se "confirmo" con la
// base del dia anterior) y tampoco se comparan horas: la bitacora usa la zona
// del libro, una hora antes que el navegador en Oaxaca.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../js/admin/publishers.js'), 'utf8');
const pick = (re) => { const m = source.match(re); assert.ok(m, String(re)); return m[0]; };
const ctx = {};
vm.runInNewContext([
  pick(/const keyOf=[^\n]*/),
  pick(/const auditField=[^\n]*/),
  pick(/const auditSignature=[^\n]*/),
  pick(/function entriesAfter\(rows,baseline\)\{[\s\S]*?\n  \}/),
  pick(/function findAuditEntry\(rows,\{tab,count,baseline\}\)\{[\s\S]*?\n  \}/),
  'globalThis.api={findAuditEntry,auditSignature};',
].join('\n'), ctx);
const { findAuditEntry, auditSignature } = ctx.api;

const antes = [
  { Fecha: '22/10/2026 8:50:16', Hoja: 'Dashboard_3_Diario', 'Filas publicadas': '1055', Estado: 'Correcta', Respaldo: '_BK_viejo' },
  { Fecha: '23/10/2026 9:04:41', Hoja: 'Dashboard_6_Semanal', 'Filas publicadas': '2729', Estado: 'Correcta', Respaldo: '_BK_d6' },
];
const baseline = { length: antes.length, last: auditSignature(antes[antes.length - 1]) };

test('sin entradas nuevas no se confirma, aunque haya una igual de antes', () => {
  assert.equal(findAuditEntry(antes, { tab: 'Dashboard_3_Diario', count: 1055, baseline }), null);
});

test('una entrada nueva Correcta confirma, sin importar la hora que traiga', () => {
  // Hora del libro: una hora antes que la del navegador.
  const despues = [...antes, { Fecha: '23/10/2026 9:20:11', Hoja: 'Dashboard_3_Diario', 'Filas publicadas': '1,055', Estado: 'Correcta', Respaldo: '_BK_Dashboard_3_Diario_20261023_091953_560' }];
  const entry = findAuditEntry(despues, { tab: 'Dashboard_3_Diario', count: 1055, baseline });
  assert.equal(entry.status, 'Correcta');
  assert.equal(entry.backup, '_BK_Dashboard_3_Diario_20261023_091953_560');
});

test('un Error nuevo se reporta con su motivo', () => {
  const despues = [...antes, { Fecha: '23/10/2026 9:30:00', Hoja: 'Dashboard_4_Semanal', 'Filas publicadas': '18825', Estado: 'Error', Detalle: 'limite de celdas' }];
  const entry = findAuditEntry(despues, { tab: 'Dashboard_4_Semanal', count: 18825, baseline });
  assert.equal(entry.status, 'Error');
  assert.equal(entry.detail, 'limite de celdas');
});

test('otra hoja u otra cantidad de filas no cuentan', () => {
  const despues = [...antes, { Fecha: 'x', Hoja: 'Dashboard_3_Otras_Plazas', 'Filas publicadas': '4', Estado: 'Correcta' }];
  assert.equal(findAuditEntry(despues, { tab: 'Dashboard_3_Diario', count: 1055, baseline }), null);
  assert.equal(findAuditEntry(despues, { tab: 'Dashboard_3_Otras_Plazas', count: 5, baseline }), null);
});

test('sin linea base no se adivina', () => {
  assert.equal(findAuditEntry([...antes, { Hoja: 'Dashboard_3_Diario', 'Filas publicadas': '1055', Estado: 'Correcta' }], { tab: 'Dashboard_3_Diario', count: 1055, baseline: null }), null);
});

test('el panel confirma con la bitacora la principal y las automaticas', () => {
  assert.match(source, /const unconfirmed=Boolean\(result\.compatibilityMode&&audit\?\.status!=='Correcta'\)/);
  assert.equal((source.match(/const baseline=await auditBaseline\(\);/g) || []).length, 2);
  assert.match(source, /verified:audit\?\.status==='Correcta'/);
  assert.doesNotMatch(source, /auditDate|since-/);
});
