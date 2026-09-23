const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const context = { window: {}, document: { addEventListener() {} } };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/home-dates.js'), 'utf8'), context);
const { formatDate, normalize } = context.window.OXXO_HOME;

// Formatos que conviven en la hoja Configuracion y en las columnas de fecha.
assert.equal(formatDate('2026-09-04T06:00:36.000Z'), '4 sep 2026');
assert.equal(formatDate('2026-09-04T00:00:00.000Z'), '4 sep 2026');
assert.equal(formatDate('2026-09'), 'sep 2026');
assert.equal(formatDate('7/sept/2026'), '7 sep 2026');
assert.equal(formatDate('04/09/2026'), '4 sep 2026');
assert.equal(formatDate('Semana 36'), 'Semana 36');
assert.equal(formatDate('2026-02-30'), '2026-02-30');
assert.equal(formatDate(''), '');
assert.equal(normalize(' VACACIÓN '), 'vacacion');

// Regresion: la portada traia un replace fijo que convertia CUALQUIER mes de
// dos digitos en "sep", asi que un dato de agosto se mostraba como septiembre.
// Cada mes debe salir con su propio nombre.
const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
meses.forEach((nombre, i) => {
  const mm = String(i + 1).padStart(2, '0');
  assert.equal(formatDate(`15/${mm}/2026`), `15 ${nombre} 2026`, `15/${mm}/2026 debe decir ${nombre}`);
  assert.equal(formatDate(`2026-${mm}-15`), `15 ${nombre} 2026`, `2026-${mm}-15 debe decir ${nombre}`);
});

// El caso concreto que se mostraba mal en produccion: Avance Comercial.
assert.equal(formatDate('25/08/2026'), '25 ago 2026');

// Una marca de tiempo completa nunca debe llegar cruda a la pantalla.
assert.equal(formatDate('2026-09-21T06:00:36.000Z'), '21 sep 2026');
assert.doesNotMatch(formatDate('2026-09-21T06:00:36.000Z'), /T\d{2}:/);

console.log('Fechas legibles en los 12 meses, sin marcas de tiempo crudas y búsqueda sin acentos OK');
