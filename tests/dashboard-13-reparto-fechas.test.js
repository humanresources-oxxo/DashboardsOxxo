// Dashboard 13: un folio con fechas pero sin las columnas D Ene..D Dic
// reparte sus dias por mes desde Fecha Inicio..Fecha Termino (solo los del
// anio del reporte); si la sabana trae cualquier columna mensual, manda la sabana.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'dashboards', 'dashboard-13.html'), 'utf8');
const bloque = (inicio, fin) => { const a = html.indexOf(inicio); assert.ok(a >= 0, inicio); return html.slice(a, html.indexOf(fin, a)); };
const codigo = [
  "const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];",
  'let REPORT_YEAR = 2026;',
  "const C = { fIni: 'Fecha Inicio', fFin: 'Fecha Termino' }; MESES.forEach(m => { C['m' + m] = 'D ' + m; });",
  'const val = (r, k) => r[k];',
  'const OXXO = { metricsNum: v => { const n = parseFloat(String(v).replace(/,/g, "")); return Number.isFinite(n) ? n : NaN; } };',
  bloque('function fechaIso(valor){', 'function fechaCorta('),
  bloque('const REPARTO_FECHAS = new WeakMap();', 'function diasHastaCorte('),
].join('\n');
const ctx = vm.createContext({ WeakMap, Date, String, Number, Array });
vm.runInContext(codigo, ctx);
const dias = r => Array.from({ length: 12 }, (_, i) => ctx.diasMes(r, i));
const fila = (ini, fin, meses = {}) => { const r = { 'Fecha Inicio': ini, 'Fecha Termino': fin }; ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'].forEach(m => { r['D ' + m] = meses[m] ?? ''; }); return r; };

test('sin columnas mensuales reparte los dias por las fechas', () => {
  assert.deepEqual(dias(fila('2026-05-16', '2026-05-17')), [0,0,0,0,2,0,0,0,0,0,0,0]);
  assert.deepEqual(dias(fila('2026-05-30', '2026-06-01')), [0,0,0,0,2,1,0,0,0,0,0,0], 'cruza de mes');
  assert.deepEqual(dias(fila('03/07/2026', '04/07/2026')), [0,0,0,0,0,0,2,0,0,0,0,0], 'acepta DD/MM/AAAA');
  assert.deepEqual(dias(fila('2025-12-30', '2026-01-02')), [2,0,0,0,0,0,0,0,0,0,0,0], 'solo cuenta los dias del anio del reporte');
});

test('si la sabana trae alguna columna mensual, manda la sabana', () => {
  assert.deepEqual(dias(fila('2026-05-01', '2026-05-28', { May: '14' })), [0,0,0,0,14,0,0,0,0,0,0,0]);
  assert.deepEqual(dias(fila('', '')), new Array(12).fill(0), 'sin fechas no inventa dias');
  assert.deepEqual(dias(fila('2026-06-10', '2026-06-01')), new Array(12).fill(0), 'fechas invertidas no se reparten');
});
