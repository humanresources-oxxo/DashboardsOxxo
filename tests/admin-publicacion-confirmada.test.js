// En modo compatible (sin respuesta de Apps Script) el panel confirma la
// publicacion con la bitacora: Apps Script escribe "Correcta" solo al
// terminar. La hoja publica no sirve de prueba: el 23/10/2026
// Dashboard_3_Diario (foto diaria, ~1,055 filas cada dia) se "confirmo" con
// la base del dia anterior.
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
  pick(/function auditDate\(value\)\{[\s\S]*?\n  \}/),
  pick(/const AUDIT_SKEW_MS=[^\n]*/),
  pick(/function findAuditEntry\(rows,\{tab,count,since\}\)\{[\s\S]*?\n  \}/),
  'globalThis.api={findAuditEntry,auditDate};',
].join('\n'), ctx);
const { findAuditEntry, auditDate } = ctx.api;

const bitacora = [
  { Fecha: '22/10/2026 8:50:16', Hoja: 'Dashboard_3_Diario', 'Filas publicadas': '1055', Estado: 'Correcta', Respaldo: '_BK_viejo' },
  { Fecha: '23/10/2026 9:04:41', Hoja: 'Dashboard_6_Semanal', 'Filas publicadas': '2729', Estado: 'Correcta', Respaldo: '_BK_Dashboard_6_Semanal_20261023_090353_339' },
  { Fecha: '23/10/2026 9:12:03', Hoja: 'Dashboard_3_Otras_Plazas', 'Filas publicadas': '4', Estado: 'Correcta', Respaldo: '_BK_x' },
  { Fecha: '23/10/2026 9:20:00', Hoja: 'Dashboard_4_Semanal', 'Filas publicadas': '18,825', Estado: 'Error', Detalle: 'limite de celdas' },
];
const envio = (h, m) => new Date(2026, 9, 23, h, m).getTime();

test('la publicacion de ayer no confirma la de hoy', () => {
  assert.equal(findAuditEntry(bitacora, { tab: 'Dashboard_3_Diario', count: 1055, since: envio(9, 10) }), null);
});

test('una entrada Correcta posterior al envio confirma y trae el respaldo', () => {
  const entry = findAuditEntry(bitacora, { tab: 'Dashboard_6_Semanal', count: 2729, since: envio(9, 3) });
  assert.equal(entry.status, 'Correcta');
  assert.equal(entry.backup, '_BK_Dashboard_6_Semanal_20261023_090353_339');
});

test('un Error del servidor se reporta con su motivo', () => {
  const entry = findAuditEntry(bitacora, { tab: 'Dashboard_4_Semanal', count: 18825, since: envio(9, 19) });
  assert.equal(entry.status, 'Error');
  assert.equal(entry.detail, 'limite de celdas');
});

test('otra cantidad de filas no cuenta como esta publicacion', () => {
  assert.equal(findAuditEntry(bitacora, { tab: 'Dashboard_6_Semanal', count: 100, since: envio(9, 3) }), null);
});

test('la fecha de la bitacora se lee como hora local', () => {
  assert.equal(auditDate('23/10/2026 9:04:41'), new Date(2026, 9, 23, 9, 4, 41).getTime());
  assert.ok(Number.isNaN(auditDate('')));
});

test('el panel ya no afirma exito en modo compatible sin la bitacora', () => {
  assert.match(source, /const unconfirmed=Boolean\(result\.compatibilityMode&&audit\?\.status!=='Correcta'\)/);
  assert.match(source, /'Publicación no realizada'/);
  assert.doesNotMatch(source, /la hoja pública ya tiene las filas enviadas/);
});
