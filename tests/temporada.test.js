const test = require('node:test');
const assert = require('node:assert');
const { enTemporada, textoCuenta } = require('../js/temporada.js');

test('la decoracion se enciende del 1 de noviembre al 6 de enero', () => {
  assert.equal(enTemporada(new Date(2026, 9, 31)), false);
  assert.equal(enTemporada(new Date(2026, 10, 1)), true);
  assert.equal(enTemporada(new Date(2026, 11, 31)), true);
  assert.equal(enTemporada(new Date(2027, 0, 6)), true);
  assert.equal(enTemporada(new Date(2027, 0, 7)), false);
  assert.equal(enTemporada(new Date(2027, 6, 15)), false);
});

test('cuenta regresiva a Navidad y Año Nuevo', () => {
  assert.equal(textoCuenta(new Date(2026, 10, 4, 23, 30)), 'Faltan 51 días para Navidad');
  assert.equal(textoCuenta(new Date(2026, 11, 24)), '¡Mañana es Navidad!');
  assert.equal(textoCuenta(new Date(2026, 11, 25)), '¡Feliz Navidad!');
  assert.equal(textoCuenta(new Date(2026, 11, 26)), 'Faltan 6 días para Año Nuevo');
  assert.equal(textoCuenta(new Date(2026, 11, 31)), '¡Mañana es Año Nuevo!');
  assert.equal(textoCuenta(new Date(2027, 0, 3)), '¡Feliz Año Nuevo 2027!');
});
