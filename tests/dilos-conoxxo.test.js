// Casos DILOS: el reporte se convierte en el navegador para la app Conoxxo
// sin el nombre del facilitador; el Apps Script lo guarda en un libro privado
// aparte (publicarDilos, con la sesion del panel) y ningun dashboard lo lee.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const ctx = { window: {}, Map, Set, Date };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'js', 'dilos-conoxxo.js'), 'utf8'), ctx);
const DILOS = ctx.window.OXXO_DILOS;

// Matriz como la hoja ZCS del reporte (datos inventados).
const hoja = [
  ['Número de caso', 'Región', 'Plaza', 'Facilitador', 'Estatus', 'Días abiertos'],
  ['OXMX-2026-1', 'CDMX', 'COYOACAN', 'Persona Uno', 'En atención ADM', 22],
  ['OXMX-2026-2', 'Tabasco', 'Tuxtla', 'Persona Dos', 'En atención de ADM', 19],
  ['OXMX-2026-3', 'MORELOS', 'ACAPULCO', 'Persona Tres', 'En atención RH', 21],
  [null, null, null, null, null, null],
];

test('convierte el reporte en casos sin facilitador y toma el corte del archivo', () => {
  const r = DILOS.normalizar({ ZCS: hoja, Matriz: [] }, 'Reporte_DILOS_.27.10.2026.xls');
  assert.equal(r.corte, '2026-10-27');
  assert.equal(r.casos.length, 3);
  assert.deepEqual(JSON.parse(JSON.stringify(r.casos[1])), { caso: 'OXMX-2026-2', region: 'TABASCO', plaza: 'TUXTLA', estatus: 'En atención ADM', area: 'ADM', dias: 19 });
  assert.equal(r.casos[2].area, 'RH');
  assert.doesNotMatch(JSON.stringify(r.casos), /Persona|Facilitador/);
});

test('avisa si el archivo no es el reporte', () => {
  assert.throws(() => DILOS.normalizar({ Hoja1: [['Tienda', 'Importe']] }, 'x.xls'), /hoja de casos/);
  assert.equal(DILOS.corteDe('Reporte DILOS.xls'), '');
});

function libroFalso(id) {
  const hojas = [];
  const nueva = nombre => {
    const h = { nombre, filas: [], setName(n) { h.nombre = n; }, setFrozenRows() {}, clearContents() { h.filas = []; }, getLastRow: () => h.filas.length,
      getRange(r, c, nr, nc) {
        return {
          setValues: v => { v.forEach((f, i) => { h.filas[r - 1 + i] = [...f]; }); },
          getValues: () => h.filas.slice(r - 1, r - 1 + nr).map(f => f.slice(c - 1, c - 1 + nc)),
        };
      } };
    hojas.push(h);
    return h;
  };
  nueva('Hoja 1');
  return { id, hojas, getId: () => id, getSheets: () => hojas, insertSheet: n => nueva(n), getSheetByName: n => hojas.find(h => h.nombre === n) || null };
}
function servidor(props) {
  const libros = [];
  const sandbox = {
    console, Set, Map, Date, JSON, Math, String, Number, Array, Object, RegExp, isFinite,
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    SpreadsheetApp: { create: () => { const l = libroFalso('libro-dilos'); libros.push(l); return l; }, openById: id => libros.find(l => l.id === id) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; }, deleteProperty: k => { delete props[k]; } }) },
    CacheService: { getScriptCache: () => ({ get: () => null, put() {} }) },
    Utilities: { formatDate: () => '2026-11-03 12:00', sleep() {} },
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, 'apps-script', 'admin-upload.gs'), 'utf8'), sandbox);
  sandbox.ajustarTamanoHoja_ = () => {};
  sandbox.registrarFalloAuth = () => 1;
  sandbox.registrarIntentoFallido = () => {};
  return { gs: sandbox, libros, props };
}

test('el Apps Script guarda los casos en su libro privado con la sesion del panel', () => {
  const srv = servidor({ ADMIN_PASSWORD: 'admin' });
  assert.deepEqual(JSON.parse(JSON.stringify(srv.gs.consultarDilos_())), { ok: true, casos: [], carga: null });
  const { casos, corte } = DILOS.normalizar({ ZCS: hoja }, 'Reporte_DILOS_.27.10.2026.xls');
  const pedido = extra => ({ adminPassword: 'admin', archivo: 'Reporte DILOS.xls', casos, corte, ...extra });
  assert.throws(() => srv.gs.publicarDilos_(pedido({ adminPassword: 'otra' })), /No autorizado/);
  assert.throws(() => srv.gs.publicarDilos_(pedido({ casos: [] })), /no trae casos/);
  assert.throws(() => srv.gs.publicarDilos_(pedido({ casos: [{ caso: 'X', area: 'Ventas', dias: 1 }] })), /Área no válida/);
  // Un campo extra (p. ej. un nombre) no se guarda: solo las columnas fijas.
  assert.equal(srv.gs.publicarDilos_(pedido({ casos: casos.map(c => ({ ...c, facilitador: 'Persona Uno' })) })).casos, 3);
  assert.equal(srv.props.DILOS_CONOXXO_SPREADSHEET_ID, 'libro-dilos');
  assert.deepEqual(srv.libros[0].hojas.map(h => h.nombre), ['Casos', 'Carga']);
  const c = JSON.parse(JSON.stringify(srv.gs.consultarDilos_()));
  assert.equal(c.casos.length, 3);
  assert.deepEqual(c.carga, { fecha: '2026-11-03 12:00', archivo: 'Reporte DILOS.xls', casos: 3, corte: '2026-10-27' });
  assert.doesNotMatch(JSON.stringify(c), /Persona/);
  srv.gs.publicarDilos_(pedido({ casos: casos.slice(0, 1) }));
  assert.equal(srv.gs.consultarDilos_().casos.length, 1, 'cada carga reemplaza la anterior');
});

test('la tarjeta vive en Administrativo y ninguna pagina lee los casos', () => {
  const admin = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
  assert.match(admin, /id="admin-dilos-panel"/);
  assert.match(admin, /OXXO_DILOS\.montarAdmin\(\)/);
  const js = fs.readFileSync(path.join(root, 'js', 'admin.js'), 'utf8');
  assert.match(js, /admin-dilos-panel'\)\?\.classList\.toggle\('hidden',area!=='administrativo'\)/);
  for (const pagina of fs.readdirSync(path.join(root, 'dashboards')).filter(n => n.endsWith('.html'))) {
    assert.doesNotMatch(fs.readFileSync(path.join(root, 'dashboards', pagina), 'utf8'), /dilos-conoxxo/, `${pagina} no debe cargar los casos`);
  }
  const gs = fs.readFileSync(path.join(root, 'apps-script', 'admin-upload.gs'), 'utf8');
  assert.match(gs, /function publicarDilos_\(payload\) \{\s*assertAuthorized\(payload\)/);
  assert.match(gs, /action \|\| ''\) === 'consultarDilos'\) \{\s*exigirConoxxoOAdmin_\(payload\);\s*return jsonResponse\(consultarDilos_\(\)\)/);
});
