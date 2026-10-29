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
  tienda: 'Chihuahua OAX', numEmpleado: '5721936', domicilio: 'Av. Siempre Viva 1', cp: '68000', municipio: 'Oaxaca de Juárez',
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
  for (const texto of ['con número de empleado ', '5721936', 'Oaxaca de Juárez, Oaxaca, siendo las', 'Cadena Comercial Oxxo SA de CV', 'HECHOS', 'Chihuahua OAX',
    '31', 'julio', '30', 'Lourdes Elisa Ortiz Lopez', 'Resultados de pulsos', 'MEP = 74.19%', 'Me comprometo a mejorar.',
    'REPRESENTANTE DEL CENTRO DE TRABAJO', 'TRABAJADOR', 'TESTIGOS']) {
    assert.ok(doc.includes(texto), `el acta no incluye "${texto}"`);
  }
  assert.ok(!doc.includes(' con CR '), 'el acta ya no lleva el CR de tienda');
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
  assert.deepEqual([...ACTA.faltantes({ ...datos, trabajador: ' ', hechos: '' })], ['Trabajador', 'Hechos']);
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
          setValues: v => {
            v.forEach((f, i) => { const fila = h.filas[a - 1 + i] = h.filas[a - 1 + i] || []; f.forEach((x, j) => { fila[b - 1 + j] = x; }); });
            return { setFontWeight() {} };
          },
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
  assert.deepEqual({ ...g.empleados[0].tipos }, { 'Acta administrativa': 2 }, 'filas viejas sin tipo cuentan como acta administrativa');
  const conHechos = R.agrupar([{ tienda: 'X', cr: '1', fecha: '2026-01-01', tipo: 'Acta de hechos' }]);
  assert.equal(conHechos.tiendas[0].actas, 1);
  assert.equal(conHechos.empleados.length, 0, 'un acta de hechos sin trabajador no crea una persona vacia');
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

test('cada tipo de documento sale con su formato', () => {
  const base = { ...datos, participante1: 'Ernesto Cruz Marquez', funcionP1: 'Asesor de Tienda', participante2: 'Cristian Carbajal', funcionP2: 'Responsable de RH',
    ciudad: 'Oaxaca de Juárez', compromisos: 'Foros de alta escucha', fechaIngreso: '2016-01-21' };
  const texto = tipo => {
    const m = ACTA.modelo({ ...base, tipo });
    return { m, txt: m.parrafos.map(p => p.runs.map(r => r.t).join('')).join('\n'), doc: ACTA.documentXml({ ...base, tipo }) };
  };
  const ult = texto('ultimatum');
  assert.equal(ult.m.titulo, 'ACTA ULTIMÁTUM');
  assert.match(ult.txt, /ante la presencia de los C\. Ernesto Cruz Marquez y Cristian Carbajal, quienes desempeñan la función de Asesor de Tienda y Responsable de RH, respectivamente/);
  assert.match(ult.txt, /se levanta la presente ACTA ULTIMÁTUM/);
  assert.ok(ult.txt.includes('Foros de alta escucha'));
  assert.deepEqual([...ult.m.firmas.map(f => f.nombre)], ['Ernesto Cruz Marquez', 'Cristian Carbajal', 'Lourdes Elisa Ortiz Lopez']);
  assert.ok(ult.doc.includes('Si alguien se niega a firmar'));

  const retro = texto('retroalimentacion');
  assert.equal(retro.m.titulo, 'RETROALIMENTACIÓN');
  assert.match(retro.txt, /La presente Retroalimentación se levanta/);

  const hechos = texto('hechos');
  assert.match(hechos.txt, /estando presentes los C\. Ernesto Cruz Marquez y Cristian Carbajal.*sucursal Chihuahua OAX, que se encuentra ubicada en: Av\. Siempre Viva 1/);
  assert.equal(ACTA.modelo({ ...base, tipo: 'hechos', trabajador: '' }).firmas.length, 2, 'sin trabajador solo firman los presentes');

  const prob = texto('probidad');
  assert.equal(prob.m.subtitulo, 'Falta de probidad');
  assert.match(prob.txt, /^Oaxaca de Juárez, Oaxaca, siendo las 10:30/);
  assert.match(prob.txt, /cometió las siguientes faltas al reglamento \(proceso\) Resultados de pulsos:/);

  const ren = texto('renuncia');
  assert.equal(ren.m.carta, true);
  assert.equal(ren.m.resumen, null, 'la renuncia no lleva recuadro de datos');
  assert.match(ren.txt, /Oaxaca de Juárez, Oaxaca a 31 de julio de 2026/);
  assert.match(ren.txt, /al puesto de LIDER DE TIENDA, que venía desempeñando desde el día 21 DE ENERO DE 2016/);
  assert.equal(ren.m.firmas[0].nombre, '5721936 LOURDES ELISA ORTIZ LOPEZ');
  assert.ok(!ren.doc.includes('FIRMAS'));

  // Cada tipo pide lo suyo.
  assert.deepEqual([...ACTA.faltantes({ tipo: 'renuncia', tienda: 'X', fecha: '2026-01-01', ciudad: 'Oax', trabajador: 'A', puesto: 'B' })], ['Fecha de ingreso']);
  assert.deepEqual([...ACTA.faltantes({ tipo: 'hechos', tienda: 'X', fecha: '2026-01-01', ciudad: 'Oax', hechos: 'algo' })], ['Al menos una persona presente']);
  assert.match(ACTA.nombreArchivo({ ...base, tipo: 'ultimatum' }), /^Acta ultimatum - Lourdes/);
});

test('el registro guarda el tipo y cuenta por tipo', () => {
  const srv = servidor({ ACTAS_DESTINATARIOS: 'rh@empresa.com' });
  const env = extra => srv.gs.enviarActa_(pedido({ numEmpleado: '1', crTienda: '504DV', ...extra }));
  env({ tipo: 'Acta administrativa' });
  const r = env({ tipo: 'Acta ultimátum' });
  assert.equal(r.registro.actasEnTienda, 2);
  assert.equal(r.registro.mismoTipo, 1);
  assert.match(srv.enviados[1].subject, /^Acta ultimátum · /);
  const actas = srv.libros[0].getSheetByName('Actas');
  assert.equal(actas.filas[0][12], 'Tipo');
  assert.equal(actas.filas[2][12], 'Acta ultimátum');
  const sinTrabajador = env({ tipo: 'Acta de hechos', numEmpleado: '', trabajador: '' });
  assert.equal(sinTrabajador.registro.actasEnTienda, 0);
});

test('las firmas en pantalla salen en el Word sobre la linea de cada persona', () => {
  // PNG minimo: firma + IHDR de 900 x 300 (lo que mide el recuadro de firma).
  const png = Uint8Array.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 3, 0x84, 0, 0, 1, 0x2C, 8, 6, 0, 0, 0]);
  const firmas = [{ png, cuando: '31/07/2026 11:05' }, { negada: true, cuando: '31/07/2026 11:06' }, null, { png: Uint8Array.from([1, 2, 3]), cuando: 'x' }];
  const archivos = leerZip(Buffer.from(ACTA.docx(datos, { firmas })));
  const doc = archivos['word/document.xml'];
  assert.ok(archivos['word/media/firma1.png'], 'la firma del representante va en el paquete');
  assert.ok(!archivos['word/media/firma4.png'], 'lo que no es PNG no se incrusta');
  assert.match(archivos['word/_rels/document.xml.rels'], /Id="rIdFirma1"[^>]*Target="media\/firma1\.png"/);
  assert.ok(!archivos['word/_rels/document.xml.rels'].includes('rIdFirma4'));
  assert.equal((doc.match(/r:embed="rIdFirma/g) || []).length, 1);
  assert.ok(doc.includes('xmlns:wp='), 'el documento declara el espacio de nombres de las imagenes');
  assert.ok(doc.includes('Firmado en pantalla el 31/07/2026 11:05'));
  assert.ok(doc.includes('SE NEGÓ A FIRMAR') && doc.includes('Negativa asentada el 31/07/2026 11:06'), 'la negativa queda asentada en el lugar del trabajador');
  assert.equal((doc.match(/______________________________________/g) || []).length, 4, 'todas conservan la linea de firma');

  // Sin firmas el Word queda igual que antes: lineas para firmar a mano.
  const sin = leerZip(Buffer.from(ACTA.docx(datos)));
  assert.ok(!Object.keys(sin).some(k => k.startsWith('word/media/firma')));
  assert.ok(!sin['word/document.xml'].includes('Firmado en pantalla'));
});

test('la pagina tiene el apartado de firmas y bloquea los datos ya firmados', () => {
  const html = fs.readFileSync(path.join(root, 'dashboards', 'acta-administrativa.html'), 'utf8');
  assert.ok(html.includes('id="acta-pads"') && html.includes('id="acta-firmas-editar"'));
  assert.equal((html.match(/data-bloqueable/g) || []).length, 4, 'tipo, lugar, participantes y hechos se bloquean con firmas');
  const js = fs.readFileSync(path.join(root, 'js', 'acta-administrativa.js'), 'utf8');
  assert.ok(!/BORRADOR_KEY[^\n]*firmas|setItem\([^)]*firmas/.test(js), 'las firmas no se guardan en el navegador');
});

test('el registro anota cuántas firmas se hicieron en pantalla y el correo lo dice', () => {
  const srv = servidor({ ACTAS_DESTINATARIOS: 'rh@empresa.com', ACTAS_CONSULTA_PASSWORD: 'clave' });
  srv.gs.enviarActa_(pedido({ numEmpleado: '1' }));
  srv.gs.enviarActa_(pedido({ numEmpleado: '1', firmantes: 4, firmasPantalla: 2, firmasNegadas: 1 }));
  srv.gs.enviarActa_(pedido({ numEmpleado: '1', firmantes: 3, firmasPantalla: 3 }));
  const actas = srv.libros[0].getSheetByName('Actas');
  assert.equal(actas.filas[0][13], 'Firmas');
  assert.deepEqual(actas.filas.slice(1).map(f => f[13]), ['A mano', '2 de 4 en pantalla · 1 se negó', '3 de 3 en pantalla']);
  assert.match(srv.enviados[0].body, /Debe imprimirse y firmarse por todas las personas/);
  assert.match(srv.enviados[1].body, /Firmas: 2 de 4 en pantalla · 1 se negó\. Las firmas que faltan deben recabarse a mano\./);
  assert.ok(!/recabarse a mano/.test(srv.enviados[2].body), 'si firmaron todos no pide firmas a mano');
  assert.equal(srv.gs.firmasActa_({ firmantes: 'x', firmasPantalla: -3 }).texto, 'A mano', 'datos raros cuentan como firma a mano');
  const consulta = srv.gs.consultarActas_({ password: 'clave' });
  assert.deepEqual(consulta.actas.map(a => a.firmas), ['A mano', '2 de 4 en pantalla · 1 se negó', '3 de 3 en pantalla']);
});

test('anular un registro exige su propia contraseña, lo marca y deja de contarlo', () => {
  const srv = servidor({ ACTAS_DESTINATARIOS: 'rh@empresa.com', ACTAS_CONSULTA_PASSWORD: 'ver' });
  srv.gs.registrarFalloAuth = () => 1;
  srv.gs.Utilities.sleep = () => {};
  srv.gs.enviarActa_(pedido({ numEmpleado: '1', crTienda: '504DV', falta: 'Primera' }));
  srv.gs.enviarActa_(pedido({ numEmpleado: '1', crTienda: '504DV', falta: 'Segunda' }));
  const [a1, a2] = srv.gs.consultarActas_({ password: 'ver' }).actas;
  assert.match(a1.id, /^2-/);
  const pedir = extra => srv.gs.anularActa_({ id: a1.id, motivo: 'Se levantó por error', quien: 'Cristian', password: 'borrar', ...extra });

  assert.throws(() => pedir(), /no está configurada \(falta ACTAS_BORRADO_PASSWORD\)/);
  srv.props.ACTAS_BORRADO_PASSWORD = 'borrar';
  assert.throws(() => pedir({ password: 'ver' }), /Contraseña incorrecta/, 'la de consulta no sirve para anular');
  assert.throws(() => pedir({ motivo: 'x' }), /motivo/);
  assert.throws(() => pedir({ quien: ' ' }), /quién anula/);
  assert.throws(() => pedir({ id: 'cualquiera' }), /no válido/);

  assert.equal(pedir().ok, true);
  const hoja = srv.libros[0].getSheetByName('Actas');
  assert.deepEqual(hoja.filas[0].slice(14), ['Anulada', 'Motivo anulación', 'Anuló']);
  assert.ok(hoja.filas[1][14] instanceof Date, 'la fila queda con la fecha de anulación');
  assert.deepEqual(hoja.filas[1].slice(15), ['Se levantó por error', 'Cristian']);
  assert.equal(hoja.filas[1][8], 'Primera', 'el resto de la fila no se toca');
  assert.equal(hoja.filas.length, 3, 'no se borra ninguna fila');
  assert.throws(() => pedir(), /ya estaba anulado/);

  const visibles = srv.gs.consultarActas_({ password: 'ver' }).actas;
  assert.deepEqual(visibles.map(a => a.falta), ['Segunda'], 'la anulada ya no se muestra');
  assert.equal(visibles[0].id, a2.id);
  assert.match(srv.libros[0].getSheetByName('Resumen por empleado').formulas.A1, /A:Q.*where E is not null and O is null/);
  const r = srv.gs.enviarActa_(pedido({ numEmpleado: '1', crTienda: '504DV', falta: 'Tercera' }));
  assert.equal(r.registro.actasEnTienda, 2, 'la anulada no cuenta para el empleado');

  // Si alguien movio filas a mano, se encuentra por la marca de tiempo.
  hoja.filas.splice(1, 0, ['fila insertada a mano']);
  assert.equal(srv.gs.anularActa_({ id: a2.id, motivo: 'Duplicada', quien: 'Cristian', password: 'borrar' }).ok, true);
  assert.equal(hoja.filas[3][15], 'Duplicada');
});

test('la pagina pide motivo, quien y contraseña para anular', () => {
  const html = fs.readFileSync(path.join(root, 'dashboards', 'acta-administrativa.html'), 'utf8');
  for (const id of ['reg-anular', 'reg-anular-motivo', 'reg-anular-quien', 'reg-anular-password']) assert.ok(html.includes(`id="${id}"`), id);
  const js = fs.readFileSync(path.join(root, 'js', 'acta-registro.js'), 'utf8');
  assert.ok(js.includes("action: 'anularActa'") && js.includes('sessionStorage.setItem(CLAVE_BORRADO'));
  assert.ok(!/localStorage\.(set|get)Item/.test(js), 'ninguna contraseña va a localStorage');
});
