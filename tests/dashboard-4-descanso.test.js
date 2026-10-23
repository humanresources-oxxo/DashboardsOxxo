// "Día Descanso" debe contar el texto viejo ("Día Des", hasta Sem39) y el
// nuevo ("Descanso Laborado", desde Sem 40): con solo el viejo el KPI
// quedaba en 0 aunque la base si trae esas horas.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../dashboards/dashboard-4.html'), 'utf8');
const pick = (re) => { const m = html.match(re); assert.ok(m, String(re)); return m[0]; };
const ctx = {};
vm.runInNewContext([
  pick(/function cleanKeyD4\(str\)\{[^\n]*\}/),
  pick(/function normTipoTE\(t\)\{[^\n]*\}/),
  pick(/const isDes = [^\n]*/).replace('const isDes', 'globalThis.isDes'),
].join('\n'), ctx);

test('Día Descanso reconoce los dos textos de la base', () => {
  for (const t of ['Día Des', 'DIA DES', 'Descanso Laborado', 'descanso  laborado']) assert.equal(ctx.isDes(t), true, t);
  for (const t of ['Tiempo Extra Doble', 'Tiempo Extra Triple', 'Festivo Laborado', 'Día Festivo Lab', '']) assert.equal(ctx.isDes(t), false, t);
});

test('la presentacion clasifica igual que el dashboard', () => {
  const pptx = fs.readFileSync(path.join(__dirname, '../js/admin-pptx.js'), 'utf8');
  assert.match(pptx, /\/\^\(DIADES\|DESCANSOLAB\)\//);
});
