const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'apps-script', 'admin-upload.gs'), 'utf8');

// El directorio guarda numero de personal y telefono. Debe vivir en un archivo
// APARTE y sin publicar: ocultar la pestaña dentro del archivo publicado no
// protege nada, porque hideSheet() la esconde de la interfaz pero no del
// exportador de datos (/gviz/tq?sheet=...), que responde sin credenciales.

assert.match(source, /const CONTACT_DIRECTORY_SPREADSHEET_PROPERTY = 'DIRECTORIO_CONTACTOS_SPREADSHEET_ID'/,
  'Debe existir la propiedad de script con el ID del archivo privado');

assert.match(source, /function openContactDirectorySpreadsheet_\(\)/,
  'Debe existir un unico punto de apertura del archivo privado');

assert.match(source, /if \(id === SPREADSHEET_ID\)[\s\S]{0,400}?throw new Error/,
  'Debe rechazar que el directorio apunte al archivo publicado');

assert.match(source, /if \(!id\)[\s\S]{0,400}?throw new Error/,
  'Sin la propiedad configurada debe fallar, nunca caer al archivo publicado');

// Escritura y lectura del directorio deben pasar por el archivo privado.
const escritura = source.match(/function replaceContactDirectory\(payload\)[\s\S]*?\n}/);
assert.ok(escritura, 'Debe existir replaceContactDirectory');
assert.match(escritura[0], /openContactDirectorySpreadsheet_\(\)/,
  'replaceContactDirectory debe escribir en el archivo privado');
assert.doesNotMatch(escritura[0], /SpreadsheetApp\.openById\(SPREADSHEET_ID\)/,
  'replaceContactDirectory NUNCA debe abrir el archivo publicado');

const lectura = source.match(/function getContactDirectoryMap\([\s\S]*?\n}/);
assert.ok(lectura, 'Debe existir getContactDirectoryMap');
assert.match(lectura[0], /openContactDirectorySpreadsheet_\(\)/,
  'getContactDirectoryMap debe leer del archivo privado');

// La descarga con telefonos sigue exigiendo su contraseña propia.
assert.match(source, /function downloadBajasWithContact\(payload\) \{\s*\n\s*assertContactDownloadAuthorized\(payload\);/,
  'La descarga con contacto debe validar su contraseña antes de leer nada');

// Debe existir la limpieza de lo que ya quedo expuesto.
assert.match(source, /function migrateContactDirectory\(/,
  'Debe existir la migracion que vacia el archivo publicado');
assert.match(source, /publico\.deleteSheet\(expuesta\)/,
  'La migracion debe eliminar la pestaña expuesta del archivo publicado');

// El directorio no debe aparecer entre las pestañas legibles ni en la portada.
const allowed = source.match(/ALLOWED_SHEETS\s*=\s*\[[\s\S]*?\]/);
if (allowed) {
  assert.doesNotMatch(allowed[0], /Directorio_Contactos_Bajas/,
    'El directorio no debe estar entre las pestañas legibles');
}
const orden = source.match(/HOME_SHEET_ORDER\s*=\s*\[[\s\S]*?\]/);
if (orden) {
  assert.doesNotMatch(orden[0], /Directorio_Contactos_Bajas/,
    'El directorio no debe listarse en la portada');
}

console.log('contact-directory-privado.test.js: OK');
