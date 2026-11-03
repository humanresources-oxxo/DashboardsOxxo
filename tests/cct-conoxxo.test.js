// Contratos colectivos (CCT): el Excel se convierte en el navegador en
// indicadores para la app Conoxxo; nombres de responsables y ligas a
// SharePoint nunca salen. El Apps Script los guarda en un libro privado
// aparte (publicarCct, con la sesion del panel) y ningun dashboard los lee.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const ctx = { window: {}, Map, Set, Date, Intl };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'js', 'cct-conoxxo.js'), 'utf8'), ctx);
const CCT = ctx.window.OXXO_CCT;

// Filas como las del Excel de RH (datos inventados).
const historico = (extra = {}) => ({
  'AÑO': 2025, UdN: 'Tiendas', CLUSTER: 'Centro-Sur', BASE: 'Tabasco', PLAZA: 'Plaza Prueba', TIPO: 'Plaza',
  'ENTIDAD FEDERATIVA': 'Oaxaca', LOCALIDAD: 'Oaxaca', HC: 100, CTs: 20, 'ZONA SALARIAL': 'General',
  SINDICATO: 'CONASIM\nSindicato Nacional de Trabajadores', '#CCT/EXPEDIENTE': ' CFCRL-CONTRATO-OAX-2025-1 ',
  'FECHA DE VENCIMIENTO': new Date(2025, 2, 1), 'TIPO DE REVISIÓN': 'Integral', 'ESTATUS REVISION': 'Realizada',
  'FECHA REVISIÓN': new Date(2025, 4, 12), 'DIAS REV VS VENCIMIENTO': 72, '% Salario': '4.9%', '% Prestaciones': 0.01,
  'ESTATUS CONSULTA': 'N/A', '% PARTICIPACION LEG/REP': 65, '% APROBACIÓN LEG/REP': '91.67%',
  'EXPEDIENTE COLECTIVO': 'https://femcom.sharepoint.com/x', 'RESPONSABLE LABORAL': 'Persona Uno', 'RESPONSABLE SINDICAL': 'Persona Dos',
  ...extra,
});
const ejercicio = (extra = {}) => ({
  'AÑO': 2026, PLAZA: 'Plaza Prueba', 'ENTIDAD FEDERATIVA': 'Estado de Oaxaca', SINDICATO: 'CONASIM',
  'TIPO DE REVISIÓN 2026': 'Salarial', '% Salario nominal': 0.047, '% Salario': 0.171,
  'DOC. CCT': 'SI', 'DOC. RESOLUCION POSITIVA SALARIAL': 'Pdte', 'NIVEL COMPLIANCE (3/5)': 5, '% COMPLIANCE': 1,
  'LIGA CCT': 'https://femcom.sharepoint.com/y', 'RESPONSABLE LABORAL': 'Persona Uno', ...extra,
});

test('convierte las dos hojas en indicadores para la app', () => {
  const { filas, resumen } = CCT.normalizar({ 'CCTs Tiendas': [historico()], 'CCT ejercicio 2026': [ejercicio()], Notas: [{ a: 1 }] });
  assert.equal(resumen.historico, 1);
  assert.equal(resumen.ejercicio, 1);
  const h = filas.find(f => f.hoja === 'historico').datos;
  assert.equal(h.sindicato, 'CONASIM');
  assert.equal(h.expediente, 'CFCRL-CONTRATO-OAX-2025-1');
  assert.equal(h.vencimiento, '2025-03-01');
  assert.equal(h.fechaRevision, '2025-05-12');
  assert.equal(h.pctSalario, 0.049);
  assert.equal(h.participacionLeg, 0.65);
  assert.equal(h.aprobacionLeg, 0.9167);
  assert.equal(h.estatusConsulta, undefined);
  const e = filas.find(f => f.hoja === 'ejercicio').datos;
  assert.equal(e.pctSalarioNominal, 0.047);
  assert.equal(e.pctSalario, 0.171);
  assert.equal(e.tipoRevision, 'Salarial');
  assert.equal(e.docResolucionSalarial, 'Pendiente');
});

test('nunca envia nombres de responsables ni ligas', () => {
  const { filas } = CCT.normalizar({ 'CCTs Tiendas': [historico()], 'CCT ejercicio 2026': [ejercicio()] });
  const todo = JSON.stringify(filas);
  assert.doesNotMatch(todo, /http|sharepoint|Persona Uno|Persona Dos/i);
});

test('sin las hojas del CCT avisa en vez de subir nada', () => {
  assert.throws(() => CCT.normalizar({ Hoja1: [{ Tienda: 'x', Importe: 1 }] }), /hojas del CCT/);
});

test('el panel solo lo muestra en Administrativo y no lo publica en el sitio', () => {
  const admin = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
  assert.match(admin, /id="admin-cct-panel"/);
  assert.match(admin, /OXXO_CCT\.montarAdmin\(\)/);
  const js = fs.readFileSync(path.join(root, 'js', 'admin.js'), 'utf8');
  assert.match(js, /admin-cct-panel'\)\?\.classList\.toggle\('hidden',area!=='administrativo'\)/);
  for (const pagina of fs.readdirSync(path.join(root, 'dashboards')).filter(n => n.endsWith('.html'))) {
    assert.doesNotMatch(fs.readFileSync(path.join(root, 'dashboards', pagina), 'utf8'), /cct-conoxxo/, `${pagina} no debe cargar los CCT`);
  }
});

// Apps Script con un libro de Sheets minimo (como en cuota-sindical.test.js).
function libroFalso(id) {
  const hojas = [];
  const hoja = nombre => {
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
  hoja('Hoja 1');
  return { id, hojas, getId: () => id, getSheets: () => hojas, insertSheet: n => hoja(n), getSheetByName: n => hojas.find(h => h.nombre === n) || null };
}
function servidor(props) {
  const libros = [];
  const sandbox = {
    console, Set, Map, Date, JSON, Math, String, Number, Array, Object, RegExp, isFinite,
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    SpreadsheetApp: { create: () => { const l = libroFalso('libro-cct'); libros.push(l); return l; }, openById: id => libros.find(l => l.id === id) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; }, deleteProperty: k => { delete props[k]; } }) },
    CacheService: { getScriptCache: () => ({ get: () => null, put() {} }) },
    Utilities: { formatDate: () => '2026-11-03 11:00', sleep() {} },
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, 'apps-script', 'admin-upload.gs'), 'utf8'), sandbox);
  sandbox.ajustarTamanoHoja_ = () => {};
  sandbox.registrarFalloAuth = () => 1;
  sandbox.registrarIntentoFallido = () => {};
  return { gs: sandbox, libros, props };
}

test('el Apps Script guarda los CCT en su libro privado con la sesion del panel y los entrega', () => {
  const srv = servidor({ ADMIN_PASSWORD: 'admin' });
  assert.deepEqual(JSON.parse(JSON.stringify(srv.gs.consultarCct_())), { ok: true, filas: [], carga: null }, 'sin carga todavia');
  const { filas } = CCT.normalizar({ 'CCTs Tiendas': [historico()], 'CCT ejercicio 2026': [ejercicio()] });
  const pedido = extra => ({ adminPassword: 'admin', archivo: 'CCT.xlsx', filas, ...extra });
  assert.throws(() => srv.gs.publicarCct_(pedido({ adminPassword: 'otra' })), /No autorizado/);
  assert.throws(() => srv.gs.publicarCct_(pedido({ filas: [] })), /no trae contratos/);
  assert.throws(() => srv.gs.publicarCct_(pedido({ filas: [{ hoja: 'otra', datos: {} }] })), /no válida/);
  assert.throws(() => srv.gs.publicarCct_(pedido({ filas: [{ hoja: 'historico', datos: { plaza: 'x', liga: 'https://femcom.sharepoint.com/z' } }] })), /no deben traer ligas/);

  const r = srv.gs.publicarCct_(pedido());
  assert.equal(r.filas, 2);
  assert.equal(srv.props.CCT_CONOXXO_SPREADSHEET_ID, 'libro-cct', 'el libro privado queda registrado aparte');
  assert.deepEqual(srv.libros[0].hojas.map(h => h.nombre), ['CCT', 'Carga']);
  const c = JSON.parse(JSON.stringify(srv.gs.consultarCct_()));
  assert.equal(c.filas.length, 2);
  assert.equal(c.filas.find(f => f.hoja === 'ejercicio').datos.pctSalarioNominal, 0.047);
  assert.deepEqual(c.carga, { fecha: '2026-11-03 11:00', archivo: 'CCT.xlsx', filas: 2 });
  assert.doesNotMatch(JSON.stringify(c), /Persona|http/);
  // Cada carga reemplaza la anterior.
  srv.gs.publicarCct_(pedido({ filas: filas.slice(0, 1) }));
  assert.equal(srv.gs.consultarCct_().filas.length, 1);
});

test('doPost: publicarCct exige la sesion y consultarCct es publica', () => {
  const gs = fs.readFileSync(path.join(root, 'apps-script', 'admin-upload.gs'), 'utf8');
  assert.match(gs, /action \|\| ''\) === 'publicarCct'\) \{\s*return jsonResponse\(publicarCct_\(payload\)\)/);
  assert.match(gs, /action \|\| ''\) === 'consultarCct'\) \{\s*return jsonResponse\(consultarCct_\(\)\)/);
  assert.match(gs, /function publicarCct_\(payload\) \{\s*assertAuthorized\(payload\)/);
  const admin = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
  assert.doesNotMatch(admin, /cct-admin-passcode/, 'la tarjeta ya no pide passcode');
});
