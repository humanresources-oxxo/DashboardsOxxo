// Dashboard 13: el Seguimiento de incapacidades solo lista lo vigente y del mes
// en curso en adelante; el resto del dashboard conserva todo el historico.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'dashboards', 'dashboard-13.html'), 'utf8');
const seguimiento = html.slice(html.indexOf('function renderSeguimiento('), html.indexOf('function renderComparativo('));

test('Seguimiento depura las incapacidades que terminaron antes del mes en curso', () => {
  assert.match(seguimiento, /const inicioMes=`\$\{hoy\.getFullYear\(\)\}-\$\{String\(hoy\.getMonth\(\)\+1\)\.padStart\(2,'0'\)\}-01`;/);
  assert.match(seguimiento, /\.filter\(r=>\{\s*const fin=fechaIso\(val\(r,C\.fFin\)\);\s*return !fin\|\|fin>=inicioMes;\s*\}\)/, 'quedan las vigentes, las de este mes en adelante y las sin fecha');
  assert.match(seguimiento, /<span>Terminadas este mes<\/span>/);
});

test('el resto del dashboard no se depura', () => {
  for (const fn of ['renderDetalle(', 'renderComparativo(', 'renderKPIs(']) {
    const i = html.indexOf('function ' + fn);
    if (i < 0) continue;
    const cuerpo = html.slice(i, html.indexOf('\nfunction ', i + 10));
    assert.ok(!cuerpo.includes('inicioMes'), `${fn} conserva el historico`);
  }
});
