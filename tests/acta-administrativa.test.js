// Acta Administrativa: el Word se arma en el navegador (ZIP sin compresion)
// y el Apps Script solo puede mandarlo a RH y a copias de sus dominios.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const zlib = require('node:zlib');

const root = path.resolve(__dirname, '..');
const ctx = { window: {}, TextEncoder, Uint8Array, Uint32Array, Object, String, Math, Array };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'js', 'acta-administrativa.js'), 'utf8'), ctx);
const ACTA = ctx.window.OXXO_ACTA;

const datos = {
  tienda: 'Chihuahua OAX', crTienda: '504DV', numEmpleado: '5721936', domicilio: 'Av. Siempre Viva 1', cp: '68000', municipio: 'Oaxaca de Juárez',
  fecha: '2026-07-31', horaInicio: '10:30', representante: 'Sofia Caridad Jimenez Gomez', funcion: 'Asesor Tienda',
  trabajador: 'Lourdes Elisa Ortiz Lopez', puesto: 'Lider de Tienda', horaEntrada: '06:00', horaSalida: '14:00',
  testigo1: 'Ana Perez', testigo2: '', fechaHechos: '2026-07-30', falta: 'Resultados de pulsos',
  hechos: 'Evaluaciones con resultados bajos.\nMEP = 74.19%', manifiesta: 'Me comprometo a mejorar.', horaCierre: '11:00',
};

// Lector minimo de ZIP "stored" para revisar lo que genera el sitio.
function leerZip(buf) {
  const archivos = {};
  let i = 0;
  while (buf.readUInt32LE(i) === 0x04034b50) {
    const metodo = buf.readUInt16LE(i + 8), crc = buf.readUInt32LE(i + 14), tam = buf.readUInt32LE(i + 18);
    const largoNom = buf.readUInt16LE(i + 26), extra = buf.readUInt16LE(i + 28);
    const nombre = buf.slice(i + 30, i + 30 + largoNom).toString('utf8');
    const datos = buf.slice(i + 30 + largoNom + extra, i + 30 + largoNom + extra + tam);
    assert.equal(metodo, 0);
    assert.equal(crc, zlib.crc32 ? zlib.crc32(datos) : ACTA.crc32(datos), `crc de ${nombre}`);
    archivos[nombre] = datos.toString('utf8');
    i += 30 + largoNom + extra + tam;
  }
  assert.equal(buf.readUInt32LE(buf.length - 22), 0x06054b50, 'fin de directorio central');
  assert.equal(buf.readUInt16LE(buf.length - 12), Object.keys(archivos).length);
  return archivos;
}

test('genera un .docx valido con el texto del formato y los datos', () => {
  const zipBytes = Buffer.from(ACTA.docx(datos));
  const archivos = leerZip(zipBytes);
  for (const parte of ['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/styles.xml', 'word/footer1.xml', 'word/_rels/document.xml.rels']) {
    assert.ok(archivos[parte], `falta ${parte}`);
  }
  const doc = archivos['word/document.xml'];
  for (const texto of ['con CR ', '504DV', 'con número de empleado ', '5721936', 'Oaxaca de Juárez, Oaxaca, siendo las', 'Cadena Comercial Oxxo SA de CV', 'HECHOS', 'Chihuahua OAX',
    '31', 'julio', '30', 'Lourdes Elisa Ortiz Lopez', 'Resultados de pulsos', 'MEP = 74.19%', 'Me comprometo a mejorar.',
    'REPRESENTANTE DEL CENTRO DE TRABAJO', 'TRABAJADOR', 'TESTIGOS']) {
    assert.ok(doc.includes(texto), `el acta no incluye "${texto}"`);
  }
  assert.ok(doc.includes('<w:br/>'), 'los saltos de linea del texto se respetan');
  assert.ok(/Evaluaciones con resultados bajos\.<\/w:t><w:br\/>/.test(doc));
  assert.ok(archivos['word/footer1.xml'].includes('OXXO | Uso Interno'));
});

test('escapa caracteres especiales y deja hueco en campos vacios', () => {
  const doc = ACTA.documentXml({ ...datos, falta: 'A < B & "C"', testigo2: '' });
  assert.ok(doc.includes('A &lt; B &amp; &quot;C&quot;'));
  assert.ok(doc.includes('______________'), 'el testigo vacio queda como hueco para llenarlo a mano');
});

test('pide los datos obligatorios y arma un nombre de archivo limpio', () => {
  assert.deepEqual([...ACTA.faltantes({ ...datos, trabajador: ' ', hechos: '' })], ['Trabajador', 'Hechos y pruebas']);
  assert.equal(ACTA.faltantes(datos).length, 0);
  assert.equal(ACTA.nombreArchivo(datos), 'Acta administrativa - Lourdes Elisa Ortiz Lopez - Chihuahua OAX - 2026-07-31.docx');
  assert.equal(ACTA.fechaPartes('2026-07-31').mes, 'julio');
});

// Libro de Sheets minimo para el registro de actas.
function libroFalso() {
  const hojas = [];
  const hoja = nombre => {
    const h = { nombre, filas: [], formulas: {}, getName: () => h.nombre, setName: n => { h.nombre = n; }, setFrozenRows() {},
      getLastRow: () => h.filas.length, appendRow: f => { h.filas.push([...f]); },
      getRange(a, b, c, d) {
        if (typeof a === 'string') return { setFormula: f => { h.formulas[a] = f; }, setNumberFormat() {} };
        return {
          setValues: v => { v.forEach((f, i) => { h.filas[a - 1 + i] = [...f]; }); return { setFontWeight() {} }; },
          getValues: () => h.filas.slice(a - 1, a - 1 + c).map(f => f.slice(b - 1, b - 1 + d)),
        };
      } };
    hojas.push(h);
    return h;
  };
  hoja('Hoja 1');
  return { id: 'libro-actas', hojas, getId: () => 'libro-actas', getSheets: () => hojas, insertSheet: n => hoja(n),
    getSheetByName: n => hojas.find(h => h.nombre === n) || null };
}

function servidor(props) {
  const enviados = [];
  const cache = new Map();
  const libros = [];
  const sandbox = {
    console, Set, Map, Date, JSON, Math, String, Number, Array, Object, RegExp,
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    SpreadsheetApp: {
      create: () => { const l = libroFalso(); libros.push(l); return l; },
      openById: id => libros.find(l => l.id === id),
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; } }) },
    CacheService: { getScriptCache: () => ({ get: k => cache.get(k) ?? null, put: (k, v) => cache.set(k, v) }) },
    Utilities: { base64Decode: b => [...Buffer.from(b, 'base64')], newBlob: (bytes, mime, nombre) => ({ bytes, mime, nombre }),
      formatDate: d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` },
    MailApp: { sendEmail: o => enviados.push(o) },
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, 'apps-script', 'admin-upload.gs'), 'utf8'), sandbox);
  return { gs: sandbox, enviados, libros, props };
}
const pedido = (extra = {}) => ({ action: 'enviarActa', archivo: 'Acta.docx', docx: Buffer.from(ACTA.docx(datos)).toString('base64'),
  tienda: 'Chihuahua OAX', trabajador: 'Lourdes', representante: 'Sofia', fecha: '2026-07-31', ...extra });

test('el Apps Script manda el acta a RH con el Word adjunto y no revela los correos', () => {
  const { gs, enviados } = servidor({ ACTAS_DESTINATARIOS: 'rh@empresa.com, rh2@empresa.com' });
  const r = gs.enviarActa_(pedido({ copia: 'asesor@empresa.com' }));
  assert.equal(r.ok, true);
  assert.equal(r.enviadoA, 'RH y asesor@empresa.com');
  assert.equal(enviados.length, 1);
  assert.equal(enviados[0].to, 'rh@empresa.com,rh2@empresa.com');
  assert.equal(enviados[0].cc, 'asesor@empresa.com');
  assert.match(enviados[0].subject, /Acta administrativa · Lourdes · OXXO Chihuahua OAX/);
  assert.equal(enviados[0].attachments[0].nombre, 'Acta.docx');
  assert.match(enviados[0].attachments[0].mime, /wordprocessingml/);
});

test('el Apps Script rechaza envios sin configurar, a otros dominios o con archivos que no son Word', () => {
  assert.throws(() => servidor({}).gs.enviarActa_(pedido()), /no está configurado/);
  const { gs, enviados } = servidor({ ACTAS_DESTINATARIOS: 'rh@empresa.com' });
  assert.throws(() => gs.enviarActa_(pedido({ copia: 'alguien@gmail.com' })), /Solo se puede copiar/);
  assert.throws(() => gs.enviarActa_(pedido({ copia: 'a@empresa.com b@empresa.com c@empresa.com d@empresa.com' })), /Máximo 3/);
  assert.throws(() => gs.enviarActa_(pedido({ docx: Buffer.from('hola').toString('base64') })), /no es un Word/);
  assert.equal(enviados.length, 0);
  const otro = servidor({ ACTAS_DESTINATARIOS: 'rh@empresa.com', ACTAS_DOMINIOS_PERMITIDOS: 'oxxo.com' });
  assert.equal(otro.gs.enviarActa_(pedido({ copia: 'at@oxxo.com' })).ok, true);
});

test('la pagina se enlaza desde el menu del inicio', () => {
  assert.match(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), /href="dashboards\/acta-administrativa\.html"/);
});

test('cada acta enviada queda en un libro privado y se cuenta por empleado y tienda', () => {
  const srv = servidor({ ACTAS_DESTINATARIOS: 'rh@empresa.com' });
  const acta = (extra = {}) => pedido({ numEmpleado: '3002700', crTienda: '504dv', puesto: 'Líder', fechaHechos: '2026-07-30', falta: 'Pulsos', ...extra });
  const r1 = srv.gs.enviarActa_(acta());
  assert.equal(r1.registro.ok, true);
  assert.equal(r1.registro.actasEnTienda, 1);
  assert.equal(srv.libros.length, 1, 'crea el libro privado la primera vez');
  assert.equal(srv.props.ACTAS_REGISTRO_SPREADSHEET_ID, 'libro-actas', 'guarda su ID para las siguientes');
  const r2 = srv.gs.enviarActa_(acta());
  assert.equal(r2.registro.actasEnTienda, 2);
  const r3 = srv.gs.enviarActa_(acta({ crTienda: '50ABC', tienda: 'Otra' }));
  assert.equal(r3.registro.actasEnTienda, 1, 'en otra tienda empieza de nuevo');
  assert.equal(r3.registro.actasTotal, 3, 'pero el total del empleado suma todas');
  assert.equal(srv.libros.length, 1, 'no crea otro libro');
  const [libro] = srv.libros;
  const actas = libro.getSheetByName('Actas');
  assert.deepEqual([...actas.filas[0]].slice(3, 8), ['No. empleado', 'Trabajador', 'Puesto', 'Tienda', 'CR']);
  assert.equal(actas.filas.length, 4);
  assert.equal(actas.filas[1][3], '3002700');
  assert.equal(actas.filas[1][7], '504DV');
  assert.match(libro.getSheetByName('Resumen por empleado').formulas.A1, /group by D, E, G, H/);
});

test('si el registro falla, el correo igual sale y se avisa', () => {
  const srv = servidor({ ACTAS_DESTINATARIOS: 'rh@empresa.com', ACTAS_REGISTRO_SPREADSHEET_ID: 'no-existe' });
  const r = srv.gs.enviarActa_(pedido());
  assert.equal(r.ok, true);
  assert.equal(srv.enviados.length, 1);
  assert.ok(r.registro.error);
});

test('el registro agrupa actas por tienda y por empleado', () => {
  const rctx = { window: {}, Map, Set, String, Array, Object };
  vm.createContext(rctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'js', 'acta-registro.js'), 'utf8'), rctx);
  const R = rctx.window.OXXO_ACTA_REGISTRO;
  const g = R.agrupar([
    { numEmpleado: '1', trabajador: 'Ana', tienda: 'Chihuahua OAX', cr: '504DV', fecha: '2026-07-01', falta: 'Pulsos' },
    { numEmpleado: '1', trabajador: 'ANA', tienda: 'Chihuahua OAX', cr: '504dv', fecha: '2026-08-01', falta: 'Faltas' },
    { numEmpleado: '2', trabajador: 'Beto', tienda: 'Chihuahua OAX', cr: '504DV', fecha: '2026-06-01', falta: 'Pulsos' },
    { numEmpleado: '1', trabajador: 'Ana', tienda: 'Otra', cr: '50ABC', fecha: '2026-05-01', falta: 'Pulsos' },
  ]);
  assert.equal(g.tiendas.length, 2);
  assert.equal(g.tiendas[0].cr, '504DV');
  assert.equal(g.tiendas[0].actas, 3);
  assert.equal(g.tiendas[0].personas, 2);
  assert.equal(g.empleados[0].actas, 2, 'mismo No. de empleado en la misma tienda se cuenta junto');
  assert.equal(g.empleados[0].ultima, '2026-08-01');
  assert.deepEqual([...g.empleados[0].faltas], ['Pulsos', 'Faltas']);
  assert.equal(g.empleados.length, 3, 'la misma persona en otra tienda va aparte');
  assert.equal(R.fechaCorta('2026-07-31'), '31 jul 2026');
});

test('consultar el registro exige su propia contraseña y no expone el Word', () => {
  const srv = servidor({ ACTAS_DESTINATARIOS: 'rh@empresa.com' });
  srv.gs.registrarFalloAuth = () => 1;
  srv.gs.Utilities.sleep = () => {};
  assert.throws(() => srv.gs.consultarActas_({ password: 'x' }), /no está configurada/);
  srv.props.ACTAS_CONSULTA_PASSWORD = 'secreta';
  assert.throws(() => srv.gs.consultarActas_({ password: 'otra' }), /Contraseña incorrecta/);
  assert.deepEqual([...srv.gs.consultarActas_({ password: 'secreta' }).actas], [], 'sin registro todavia');
  srv.gs.enviarActa_(pedido({ numEmpleado: '3002700', crTienda: '504DV', falta: 'Pulsos', fecha: '2026-07-31' }));
  const r = srv.gs.consultarActas_({ password: 'secreta' });
  assert.equal(r.actas.length, 1);
  assert.equal(r.actas[0].numEmpleado, '3002700');
  assert.equal(r.actas[0].cr, '504DV');
  assert.equal(r.actas[0].falta, 'Pulsos');
  assert.equal(r.actas[0].fecha, '2026-07-31');
  assert.ok(!('archivo' in r.actas[0]) && !('docx' in r.actas[0]));
});
