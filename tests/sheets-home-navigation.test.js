const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'apps-script', 'admin-upload.gs'), 'utf8');

assert.match(source, /const HOME_SHEET = '00_INICIO'/, 'Debe existir la portada 00_INICIO');
assert.match(source, /function refreshHomeSheet\(\)/, 'Debe existir una actualización manual de la portada');
assert.match(source, /function ensureHomeSheet_\(ss\)/, 'Debe existir el generador idempotente');
assert.match(source, /ss\.moveActiveSheet\(index \+ 1\)/, 'Las pestañas deben moverse a su posición definida');
assert.match(source, /const HOME_SHEET_ORDER = \[/, 'Debe existir un orden explícito de pestañas');
assert.match(source, /function reorderSheets_\(ss\)/, 'Debe reordenar las pestañas sin modificar sus datos');
assert.match(source, /'Dashboard_1_Diario'[\s\S]*'Dashboard_14_Comercial'[\s\S]*'Dashboard_9_Semanal'/, 'El orden debe separar RH, Comercial y Administrativo');
assert.match(source, /setLinkUrl\(ss\.getUrl\(\) \+ '#gid='/, 'Cada tarjeta debe navegar a su pestaña');
assert.match(source, /name\.indexOf\(BACKUP_PREFIX\) !== 0/, 'Los respaldos deben excluirse de la portada');
assert.match(source, /actualizarPortadaSiCambio_\(ss\);[\s\S]{0,240}return jsonResponse/, 'La portada debe refrescarse tras una publicación cuando cambia la lista de hojas');

console.log('sheets-home-navigation.test.js: OK');
