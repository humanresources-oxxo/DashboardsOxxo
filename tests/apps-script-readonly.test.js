// Contrato del servidor (apps-script/admin-upload.gs): Promociones/PromosD100
// son de solo lectura desde el panel. Ni publicar, ni comprobar, ni previsualizar
// o restaurar respaldos las muta; las hojas escribibles siguen funcionando.
// Se ejecuta el .gs real en un sandbox con servicios de Google simulados.
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const salida = (texto) => ({ texto, setMimeType() { return this; } });

function servidor() {
  const escrituras = [];
  const sandbox = {
    console, Date, Set, Map, JSON, Math, String, Number, Array, Object, RegExp,
    ContentService: { createTextOutput: salida, MimeType: { JSON: 'json' } },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'clave-de-prueba', setProperty() {} }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Utilities: { sleep() {}, formatDate: () => '2026-09-24' },
    SpreadsheetApp: {
      flush() {},
      openById: () => hoja(escrituras), getActiveSpreadsheet: () => hoja(escrituras)
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, 'apps-script', 'admin-upload.gs'), 'utf8'), sandbox);
  const post = (payload) => JSON.parse(sandbox.doPost({ postData: { contents: JSON.stringify({ adminPassword: 'clave-de-prueba', ...payload }) } }).texto);
  const get = (parametros) => JSON.parse(sandbox.doGet({ parameter: parametros }).texto);
  return { sandbox, post, get, escrituras };
}
// Libro simulado: cualquier intento de obtener/insertar una hoja queda registrado.
function hoja(escrituras) {
  return {
    getSheetByName(nombre) { escrituras.push(`getSheetByName:${nombre}`); return null; },
    insertSheet(nombre) { escrituras.push(`insertSheet:${nombre}`); throw new Error('no debe crear hojas'); },
    getSpreadsheetTimeZone: () => 'America/Mexico_City'
  };
}

const FILAS = [{ Plaza: 'Plaza Oaxaca', Titulo: 'Promo', Mes: '2026-09' }];

test('la politica declara Promociones y PromosD100 como solo lectura y fuera de ALLOWED_SHEETS', () => {
  const { sandbox } = servidor();
  assert.deepEqual([...vm.runInContext('READ_ONLY_SHEETS', sandbox)], ['Promociones', 'PromosD100']);
  const permitidas = [...vm.runInContext('ALLOWED_SHEETS', sandbox)];
  for (const nombre of ['Promociones', 'PromosD100']) assert.equal(permitidas.includes(nombre), false, `${nombre} no debe ser escribible`);
  assert.ok(permitidas.includes('Dashboard_1_Diario'));
});

for (const hojaProtegida of ['Promociones', 'PromosD100']) {
  test(`publicar / comprobar / previsualizar / restaurar ${hojaProtegida} se rechaza sin tocar el libro`, () => {
    const { post, escrituras } = servidor();
    const casos = [
      { targetSheet: hojaProtegida, rows: FILAS, updateMode: 'replaceAll' },                        // publicar
      { targetSheet: hojaProtegida, rows: FILAS, updateMode: 'replacePeriod', periodColumn: 'Mes', periodValues: ['2026-09'] },
      { action: 'preflight', targetSheet: hojaProtegida, rows: FILAS, updateMode: 'replaceAll' },
      { action: 'getBackupPreview', targetSheet: hojaProtegida },
      { action: 'restoreBackup', targetSheet: hojaProtegida }
    ];
    for (const caso of casos) {
      const respuesta = post(caso);
      assert.equal(respuesta.ok, false, `debe rechazar ${JSON.stringify(caso).slice(0, 70)}`);
      assert.match(respuesta.error, /solo lectura/i);
    }
    assert.deepEqual(escrituras, [], 'ninguna hoja fue abierta ni creada');
  });
}

test('las hojas escribibles siguen pasando la validacion y una desconocida sigue rechazada', () => {
  const { sandbox, post } = servidor();
  assert.doesNotThrow(() => vm.runInContext(`validatePublicationRequest('Dashboard_1_Diario', ${JSON.stringify(FILAS)}, 'replaceAll', '', [], ['Plaza'], ['Plaza'])`, sandbox));
  const desconocida = post({ targetSheet: 'Hoja_Inventada', rows: FILAS, updateMode: 'replaceAll' });
  assert.equal(desconocida.ok, false);
  assert.match(desconocida.error, /no permitido/);
});

test('readSheet no expone las hojas de solo lectura (su lectura publica es por GViz)', () => {
  const { get } = servidor();
  assert.equal(get({ action: 'readSheet', sheet: 'Promociones' }).ok, false);
  assert.equal(get({ action: 'readSheet', sheet: 'PromosD100' }).ok, false);
});

test('APP_VERSION sigue igual a la version verificada en config.js', () => {
  const gs = fs.readFileSync(path.join(root, 'apps-script', 'admin-upload.gs'), 'utf8');
  const cfg = fs.readFileSync(path.join(root, 'js', 'config.js'), 'utf8');
  assert.equal(gs.match(/const APP_VERSION = '(\d+)'/)[1], '47');
  assert.equal(cfg.match(/VERIFIED_ADMIN_RUNTIME_VERSION:\s*(\d+)/)[1], '47');
});
