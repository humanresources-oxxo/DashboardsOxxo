const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'dashboards', 'dashboard-6.html'), 'utf8');
const fn = html.match(/function esNoJustificado\(tipo\)\{[^\n]*\}/);
assert(fn, 'Dashboard 6 debe definir esNoJustificado');
const ctx = vm.createContext({});
new vm.Script(fn[0]).runInContext(ctx);
const noJust = t => new vm.Script(`esNoJustificado(${JSON.stringify(t)})`).runInContext(ctx);

// Regla acordada: solo la falta es no justificada.
assert.strictEqual(noJust('Falta Días'), true);
['Vacaciones', 'Inc. Enf. Gen. no Prof.', 'Inc. Maternidad', 'Accidente en trayecto',
 'Accidente de Trabajo', 'Permiso con Goce de Sueld', 'Perm. sin Goce de Sueldo',
 'Permiso de Paternidad', 'Defunción Primer Grado', 'Suspensión', '']
  .forEach(t => assert.strictEqual(noJust(t), false, t));

// La pantalla expone el filtro, las tarjetas y el ranking.
assert(html.includes('id="filtro-justif"'));
assert(html.includes("'filtro-tipo','filtro-funcion','filtro-justif'"), 'Limpiar debe resetear el filtro de justificación');
assert(html.includes('No Justificados') && html.includes('>Justificados<'));
assert(html.includes('id="chart-justif"') && html.includes('id="ranking-justif"'));
console.log('dashboard 6: justificados vs no justificados');
