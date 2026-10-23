// En modo compatible (sin respuesta de Apps Script) el panel solo puede
// confirmar la publicacion leyendo la hoja publica: deben estar las filas de
// los periodos y plazas enviados. Caso real (23/10/2026): Dashboard_6 se
// "verifico" con la base anterior aunque Sem 42 nunca llego.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../js/admin/publishers.js'), 'utf8');
const pick = (re) => { const m = source.match(re); assert.ok(m, String(re)); return m[0]; };
const ctx = {};
vm.runInNewContext([
  pick(/function normHeader\(value\)\{[^\n]*\}/),
  pick(/const keyOf=[^\n]*/),
  pick(/function publishedExpectation\(dash,rows,period\)\{[\s\S]*?\n  \}/),
  pick(/function countPublishedRows\(rows,expect\)\{[\s\S]*?\n  \}/),
  'globalThis.api={publishedExpectation,countPublishedRows};',
].join('\n'), ctx);
const { publishedExpectation, countPublishedRows } = ctx.api;

const dash = { scopeColumns: ['Plaza'] };
const period = { enabled: true, column: 'Semana', values: ['Sem 40', 'Sem 41', 'Sem 42'] };
const enviados = [
  { Plaza: 'Oaxaca', Semana: 'Sem 40' }, { Plaza: 'Tuxtla', Semana: 'Sem 41' }, { Plaza: 'Oaxaca', Semana: 'Sem 42' },
];

test('con la base anterior (sin Sem 42) no se confirma', () => {
  const expect = publishedExpectation(dash, enviados, period);
  const hojaVieja = [
    { Plaza: 'Oaxaca', Semana: 'Sem 39' }, { Plaza: 'Oaxaca', Semana: 'Sem 40' }, { Plaza: 'Tuxtla', Semana: 'Sem 41' },
  ];
  assert.notEqual(countPublishedRows(hojaVieja, expect), expect.count);
});

test('con las filas enviadas si se confirma, sin contar otras semanas ni otras plazas', () => {
  const expect = publishedExpectation(dash, enviados, period);
  const hojaNueva = [
    { Plaza: 'Oaxaca', Semana: 'Sem 39' }, { Plaza: 'Chontalpa', Semana: 'Sem 42' },
    { Plaza: 'Oaxaca', Semana: 'Sem 40' }, { Plaza: 'Tuxtla', Semana: 'Sem 41' }, { Plaza: 'Oaxaca', Semana: 'Sem42' },
  ];
  assert.equal(countPublishedRows(hojaNueva, expect), expect.count);
});

test('sin periodo ni plaza se compara el total de filas', () => {
  const expect = publishedExpectation({ scopeColumns: [] }, [{ a: 1 }, { a: 2 }], { enabled: false });
  assert.equal(countPublishedRows([{ a: 1 }, { a: 2 }], expect), 2);
  assert.equal(countPublishedRows([{ a: 1 }], expect), 1);
});

test('el panel marca la publicacion sin confirmar en vez de "Solicitud enviada"', () => {
  assert.match(source, /const unconfirmed=Boolean\(result\.compatibilityMode&&!readback\?\.ok\)/);
  assert.match(source, /title:unconfirmed\?'Publicación sin confirmar'/);
  assert.match(source, /type:unconfirmed\?'bad'/);
});
