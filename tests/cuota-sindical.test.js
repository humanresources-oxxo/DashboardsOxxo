// Cuota Sindical: el Excel de nomina se convierte en totales en el navegador
// (sin nombres ni numeros de empleado) y el Apps Script los guarda en un libro
// privado aparte, nunca en el libro de los dashboards.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const ctx = { window: {}, Intl, Map, Set };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'js', 'cuota-sindical.js'), 'utf8'), ctx);
const CUOTA = ctx.window.OXXO_CUOTA;

// Filas como las del reporte de nomina (datos inventados).
const fila = (persona, nombre, tienda, importe, extra = {}) => ({
  'Número de personal': persona, 'Nombre del empleado o candidato': nombre, 'Texto división de personal': 'OXXO OAXACA',
  'Texto breve de unidad organizativa': tienda, 'Denominación función': 'AYUDANTE TIENDA SIND', 'Texto expl.CC-nómina': 'Desc. Cuota Sindical',
  Cantidad: 2, Importe: importe, Año: 2026, Mes: '03. Marzo', 'Fecha de pago': '2026-03-01', ...extra,
});

test('convierte el Excel en totales por mes, division, tienda y puesto', () => {
  const r = CUOTA.agregar([
    fila(1, 'Persona Uno', 'OXXO CENTRO OAX', -23.1),
    fila(1, 'Persona Uno', 'OXXO CENTRO OAX', -23.1, { 'Fecha de pago': '2026-03-08' }),
    fila(2, 'Persona Dos', 'OXXO CENTRO OAX', -20.48),
    // Pago suelto entre semana: cuenta por el domingo de su semana (15 de marzo).
    fila(2, 'Persona Dos', 'OXXO CENTRO OAX', 20.48, { Cantidad: -2, 'Fecha de pago': '2026-03-10' }),
    fila(3, 'Persona Tres', 'OXXO NORTE OAX', -22.05, { 'Texto división de personal': 'OXXO OAXACA II', 'Fecha de pago': '2026-03-15' }),
    // Ajuste de una semana de febrero pagado en marzo: no suma una semana de marzo.
    fila(3, 'Persona Tres', 'OXXO NORTE OAX', -22.05, { 'Texto división de personal': 'OXXO OAXACA II', 'Fecha de pago': '2026-02-22' }),
    fila(9, 'Otra', 'OXXO NORTE OAX', -99, { 'Texto expl.CC-nómina': 'Otro descuento' }),
  ]);
  assert.deepEqual([...CUOTA.DETALLE_HEADERS], ['Mes', 'Division', 'Tienda', 'Funcion', 'Importe', 'Personas', 'Movimientos', 'Devoluciones', 'ImporteDevoluciones', 'Reversos']);
  const centro = r.detalle.find(d => d[2] === 'OXXO CENTRO OAX');
  assert.deepEqual([...centro], ['2026-03', 'OXXO OAXACA', 'OXXO CENTRO OAX', 'AYUDANTE TIENDA SIND', 46.2, 2, 4, 1, 20.48, 1]);
  const todas = r.resumen.find(x => x[1] === CUOTA.TODAS);
  // Persona 2 quedo en $0 neto; semanas: 1, 8 y 15 de marzo.
  assert.deepEqual([...todas], ['2026-03', 'Todas', 3, 1, 3, 90.30, 6, 1, 20.48, 1]);
  assert.equal(r.meta.otroConcepto, 1);
  assert.equal(r.meta.total, 90.3);
  assert.equal(r.resumen.filter(x => x[1] !== CUOTA.TODAS).length, 2, 'una fila por division y una de toda la plaza');
});

test('no publica nombres ni numeros de empleado', () => {
  const r = CUOTA.agregar([fila(3002700, 'Persona Con Nombre', 'OXXO CENTRO OAX', -23.1)]);
  const todo = JSON.stringify(r);
  assert.ok(!todo.includes('Persona Con Nombre') && !todo.includes('3002700'));
});

test('omite un mes que neto no descuenta nada y pide las columnas minimas', () => {
  const r = CUOTA.agregar([
    fila(1, 'A', 'OXXO CENTRO OAX', -39.75, { Año: 2025, Mes: '09. Septiembre', 'Fecha de pago': '2025-09-28' }),
    fila(1, 'A', 'OXXO CENTRO OAX', 39.75, { Año: 2025, Mes: '09. Septiembre', 'Fecha de pago': '2025-09-28', Cantidad: -2 }),
    fila(1, 'A', 'OXXO CENTRO OAX', -23.1),
  ]);
  assert.deepEqual([...r.meta.mesesOmitidos], ['2025-09']);
  assert.ok(r.detalle.every(d => d[0] === '2026-03'));
  assert.throws(() => CUOTA.agregar([{ Nombre: 'x', Importe: -1 }]), /faltan columnas: Número de personal, Texto breve de unidad organizativa/);
  assert.throws(() => CUOTA.agregar([]), /no trae filas/);
});

// Libro de Sheets minimo.
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
  return { id, hojas, getId: () => id, getUrl: () => 'https://docs.google.com/spreadsheets/d/' + id, getSheets: () => hojas, insertSheet: n => hoja(n),
    deleteSheet: h => { hojas.splice(hojas.indexOf(h), 1); }, getSheetByName: n => hojas.find(h => h.nombre === n) || null };
}
function servidor(props) {
  const libros = [], fechas = [];
  let uuid = 0;
  const sandbox = {
    console, Set, Map, Date, JSON, Math, String, Number, Array, Object, RegExp, isFinite,
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    SpreadsheetApp: { create: () => { const l = libroFalso('libro-cuota'); libros.push(l); return l; }, openById: id => libros.find(l => l.id === id) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; }, deleteProperty: k => { delete props[k]; } }) },
    CacheService: { getScriptCache: () => ({ get: () => null, put() {} }) },
    Utilities: { formatDate: () => '30/10/2026 10:00', sleep() {}, getUuid: () => 'carga-' + (++uuid) },
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, 'apps-script', 'admin-upload.gs'), 'utf8'), sandbox);
  sandbox.ajustarTamanoHoja_ = () => {};
  sandbox.registrarFalloAuth = () => 1;
  sandbox.registrarIntentoFallido = () => {};
  sandbox.updateConfigDate = id => { fechas.push(id); return { ok: true }; };
  return { gs: sandbox, libros, props, fechas };
}

test('el Apps Script guarda los totales en un libro privado aparte y los entrega', () => {
  const srv = servidor({ ADMIN_PASSWORD: 'admin' });
  assert.deepEqual(JSON.parse(JSON.stringify(srv.gs.consultarCuotaSindical_())), { ok: true, detalle: [], resumen: [], carga: null }, 'sin carga todavia');
  const datos = CUOTA.agregar([fila(1, 'A', 'OXXO CENTRO OAX', -23.1), fila(2, 'B', 'OXXO NORTE OAX', -20.48)]);
  const pedido = extra => ({ adminPassword: 'admin', archivo: 'Cuota.xlsx', detalle: datos.detalle, resumen: datos.resumen, meta: datos.meta, ...extra });
  assert.throws(() => srv.gs.publicarCuotaSindical_(pedido({ adminPassword: 'otra' })), /No autorizado/);
  assert.throws(() => srv.gs.publicarCuotaSindical_(pedido({ detalle: [['2026-03', 'X']] })), /no válida/);
  assert.throws(() => srv.gs.publicarCuotaSindical_(pedido({ detalle: [['marzo', 'X', 'T', 'F', 1, 1, 1, 0, 0, 0]] })), /Mes no válido/);
  assert.throws(() => srv.gs.publicarCuotaSindical_(pedido({ resumen: [] })), /no trae el resumen/);

  const r = srv.gs.publicarCuotaSindical_(pedido());
  assert.equal(r.ok, true);
  assert.equal(srv.props.CUOTA_SINDICAL_SPREADSHEET_ID, 'libro-cuota', 'el libro privado queda registrado aparte');
  const libro = srv.libros[0];
  assert.deepEqual(libro.hojas.map(h => h.nombre), ['Detalle', 'Resumen', 'Carga']);
  assert.deepEqual(libro.getSheetByName('Detalle').filas[0], [...CUOTA.DETALLE_HEADERS]);
  assert.deepEqual([...srv.fechas], ['cuota'], 'solo la fecha va a Configuracion para la tarjeta del inicio');

  const consulta = srv.gs.consultarCuotaSindical_();
  assert.equal(consulta.detalle.length, 2);
  assert.equal(consulta.resumen.length, 2);
  assert.equal(consulta.carga.archivo, 'Cuota.xlsx');
  // Reemplaza todo en cada carga.
  srv.gs.publicarCuotaSindical_(pedido({ detalle: datos.detalle.slice(0, 1) }));
  assert.equal(srv.gs.consultarCuotaSindical_().detalle.length, 1);
});

test('la pagina vive aparte: tarjeta en Administrativo y sin pestaña en el libro de los dashboards', () => {
  const home = fs.readFileSync(path.join(root, 'js', 'home.js'), 'utf8');
  assert.match(home, /\['Cuota Sindical', '[^']+', 'dashboards\/cuota-sindical\.html', 'Mensual'\]/);
  const config = fs.readFileSync(path.join(root, 'js', 'config.js'), 'utf8');
  assert.ok(!/cuota/i.test(config.match(/TABS:\s*\{([\s\S]*?)\}/)[1]), 'no es una pestaña del libro de los dashboards');
  const otras = fs.readdirSync(path.join(root, 'js')).filter(n => n.endsWith('.js') && !['cuota-sindical.js', 'home.js', 'core.js', 'admin.js'].includes(n));
  for (const n of otras) assert.ok(!/consultarCuotaSindical|OXXO_CUOTA/.test(fs.readFileSync(path.join(root, 'js', n), 'utf8')), `${n} no debe leer la cuota sindical`);
});

test('el Excel completo llega por partes a la Base del libro privado y la consulta publica no la entrega', () => {
  const srv = servidor({ ADMIN_PASSWORD: 'admin' });
  const headers = ['Número de personal', 'Nombre del empleado o candidato', 'Texto breve de unidad organizativa', 'Importe', 'Año', 'Mes'];
  const filas = Array.from({ length: 5 }, (_, i) => [1000 + i, 'Persona ' + i, 'OXXO CENTRO OAX', -23.1, 2026, '03. Marzo']);
  const datos = CUOTA.agregar(filas.map(f => Object.fromEntries(headers.map((h, i) => [h, f[i]]))));
  const base = { adminPassword: 'admin', action: 'publicarCuotaSindical' };
  assert.throws(() => srv.gs.publicarCuotaSindical_({ ...base, adminPassword: 'x', fase: 'inicio', headers, totalFilas: 5 }), /No autorizado/);
  const { cargaId } = srv.gs.publicarCuotaSindical_({ ...base, fase: 'inicio', headers, totalFilas: 5 });
  const libro = srv.libros[0];
  assert.ok(libro.getSheetByName('Base (cargando)'), 'se escribe en una hoja temporal');
  assert.throws(() => srv.gs.publicarCuotaSindical_({ ...base, fase: 'filas', cargaId, desde: 3, filas: filas.slice(3) }), /fuera de orden/);
  assert.throws(() => srv.gs.publicarCuotaSindical_({ ...base, fase: 'filas', cargaId: 'otra', desde: 0, filas }), /ya no está activa/);
  assert.throws(() => srv.gs.publicarCuotaSindical_({ ...base, fase: 'filas', cargaId, desde: 0, filas: [[1, 2]] }), /no válida/);
  srv.gs.publicarCuotaSindical_({ ...base, fase: 'filas', cargaId, desde: 0, filas: filas.slice(0, 3) });
  const fin = { ...base, fase: 'fin', cargaId, archivo: 'Cuota.xlsx', detalle: datos.detalle, resumen: datos.resumen, meta: datos.meta };
  assert.throws(() => srv.gs.publicarCuotaSindical_(fin), /incompleta: 3 de 5/, 'no publica una Base a medias');
  assert.ok(!libro.getSheetByName('Base'), 'la Base anterior sigue intacta mientras tanto');
  srv.gs.publicarCuotaSindical_({ ...base, fase: 'filas', cargaId, desde: 3, filas: filas.slice(3) });
  const r = srv.gs.publicarCuotaSindical_(fin);
  assert.equal(r.url, 'https://docs.google.com/spreadsheets/d/libro-cuota');
  assert.ok(!libro.getSheetByName('Base (cargando)'));
  assert.deepEqual(libro.getSheetByName('Base').filas[0], headers);
  assert.equal(libro.getSheetByName('Base').filas.length, 6, 'encabezados y las 5 filas del Excel');
  assert.equal(libro.getSheetByName('Base').filas[1][1], 'Persona 0');
  assert.equal(srv.props.CUOTA_SINDICAL_CARGA, undefined, 'la carga termina');
  assert.throws(() => srv.gs.publicarCuotaSindical_(fin), /ya no está activa/, 'una carga terminada no se repite');
  // La consulta publica solo trae totales; la liga del libro solo con la contraseña.
  assert.ok(!JSON.stringify(srv.gs.consultarCuotaSindical_()).includes('Persona'));
  assert.throws(() => srv.gs.infoCuotaSindical_({ adminPassword: 'x' }), /No autorizado/);
  assert.equal(srv.gs.infoCuotaSindical_({ adminPassword: 'admin' }).carga.archivo, 'Cuota.xlsx');
});

test('el panel admin tiene la carga de cuota sindical en el area Administrativo', () => {
  const admin = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
  for (const id of ['admin-cuota-panel', 'cuota-admin-archivo', 'cuota-admin-publicar', 'cuota-admin-hoja']) assert.ok(admin.includes(`id="${id}"`), id);
  assert.match(admin, /<script src="js\/cuota-sindical\.js\?v=[0-9a-f]+"><\/script>/);
  assert.match(fs.readFileSync(path.join(root, 'js', 'admin.js'), 'utf8'), /admin-cuota-panel'\)\?\.classList\.toggle\('hidden',area!=='administrativo'\)/);
});

test('lee bien los meses y la fecha de carga aunque Google Sheets los guarde como fecha', () => {
  assert.equal(CUOTA.mesTexto('2026-09'), '2026-09');
  assert.equal(CUOTA.mesTexto('2026-09-01T06:00:00.000Z'), '2026-09', 'medianoche de Ciudad de México');
  assert.equal(CUOTA.mesTexto('2026-03-01T05:00:00.000Z'), '2026-03');
  assert.equal(CUOTA.mesTexto('2026-08-31T19:00:00.000Z'), '2026-09', 'medianoche de una zona adelantada');
  assert.equal(CUOTA.fechaCarga('30/10/2026 11:42'), '30/10/2026 11:42');
  assert.match(CUOTA.fechaCarga('Fri Oct 30 2026 11:42:00 GMT-0600 (Central Standard Time)'), /30 oct 2026, 11:42/, 'a la hora del centro de México');
  assert.doesNotMatch(CUOTA.fechaCarga('Fri Oct 30 2026 11:42:00 GMT-0600 (Central Standard Time)'), /GMT|Fri/);
});

test('el dashboard es de solo lectura: la carga solo esta en el panel admin', () => {
  const pagina = fs.readFileSync(path.join(root, 'dashboards', 'cuota-sindical.html'), 'utf8');
  assert.ok(!/Actualizar datos|id="cuota-carga"|type="file"|type="password"|admin-assets\.js/.test(pagina), 'sin boton, dialogo ni campos de carga');
  const js = fs.readFileSync(path.join(root, 'js', 'cuota-sindical.js'), 'utf8');
  const montar = js.slice(js.indexOf('  function montar() {'), js.indexOf('  function montarAdmin() {'));
  assert.ok(!/subirExcel|publicarCuotaSindical/.test(montar), 'la pagina no publica');
});
