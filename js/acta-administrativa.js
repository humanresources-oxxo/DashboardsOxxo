/* ==========================================================
   ACTA ADMINISTRATIVA — formulario -> Word -> correo
   Consumido por: dashboards/acta-administrativa.html.

   El asesor llena el formulario; con los mismos datos se arma la vista
   previa en pantalla y el .docx (mismo texto que el formato impreso).
   El Word se genera aqui mismo, sin librerias: un .docx es un ZIP con
   unos XML, y basta un ZIP "sin compresion" para que Word lo abra.

   El envio por correo lo hace el Apps Script del sitio (accion publica
   "enviarActa"): el navegador no puede mandar correos solo. El script
   manda siempre a los destinatarios fijos de RH (Propiedades del script)
   y, si se pide, copia a un correo del mismo dominio.

   Uso: OXXO_ACTA.modelo(datos), OXXO_ACTA.docx(datos) -> Uint8Array,
   OXXO_ACTA.montar() para la pagina.
   ========================================================== */
(function () {
  'use strict';

  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const VACIO = '______________';
  const BORRADOR_KEY = 'oxxo_acta_borrador';
  const CAMPOS = ['tienda', 'domicilio', 'cp', 'municipio', 'fecha', 'horaInicio', 'representante', 'funcion',
    'trabajador', 'puesto', 'horaEntrada', 'horaSalida', 'testigo1', 'testigo2', 'fechaHechos', 'falta',
    'hechos', 'manifiesta', 'horaCierre', 'copia'];
  const OBLIGATORIOS = { tienda: 'Tienda', fecha: 'Fecha del acta', representante: 'Representante', trabajador: 'Trabajador', puesto: 'Puesto', fechaHechos: 'Fecha de los hechos', falta: 'Falta al reglamento', hechos: 'Hechos y pruebas' };

  function limpio(v) { return String(v == null ? '' : v).trim(); }
  function fechaPartes(iso) {
    const m = limpio(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? { dia: String(+m[3]), mes: MESES[+m[2] - 1] || '', anio: m[1] } : { dia: '', mes: '', anio: '' };
  }

  // ── Modelo: el texto del formato, con los huecos marcados como campo ──
  function modelo(d) {
    d = d || {};
    const f = fechaPartes(d.fecha);
    const h = fechaPartes(d.fechaHechos);
    const T = t => ({ t });
    const C = t => ({ t: limpio(t), campo: true });
    const testigos = [limpio(d.testigo1), limpio(d.testigo2)].filter(Boolean).join(' y ');
    return {
      parrafos: [
        { runs: [T('Oaxaca de Juárez, Oaxaca, siendo las '), C(d.horaInicio), T(' horas del día '), C(f.dia), T(' de '), C(f.mes),
          T(' del '), C(f.anio), T(', en la tienda denominada OXXO '), C(d.tienda),
          T(' propiedad de la empresa Cadena Comercial Oxxo SA de CV, sita en '), C(d.domicilio), T(' Cp '), C(d.cp),
          T(' Municipio '), C(d.municipio), T(' Oaxaca y ante la presencia de la C. '), C(d.representante),
          T(' quien desempeña la función de '), C(d.funcion), T(' como representante del patrón en el centro de trabajo, el trabajador de nombre '),
          C(d.trabajador), T(' y los C. '), C(d.testigo1), T(' y '), C(d.testigo2),
          T(', trabajadores como testigos de asistencia. Se levanta la presente Acta Administrativa a fin de hacer constar los siguientes:')] },
        { titulo: true, runs: [T('HECHOS')] },
        { runs: [T('El día '), C(h.dia), T(' del mes de '), C(h.mes), T(' del año '), C(h.anio), T(', el empleado de nombre '), C(d.trabajador),
          T(' con puesto '), C(d.puesto), T(', con horario de trabajo de las '), C(d.horaEntrada), T(' a las '), C(d.horaSalida),
          T(', cometió las siguientes faltas al reglamento (proceso) '), C(d.falta), T(', hechos que se comprueban con: '), C(d.hechos)] },
        { runs: [T('Hecho por lo que EL TRABAJADOR '), C(d.trabajador), T(' en relación a los hechos manifiesta en este acto: '), C(d.manifiesta)] },
        { runs: [T('POR SU PARTE LOS INTERVINIENTES COMO TESTIGOS '), C(testigos),
          T(' SEÑALAN: Que al estar presentes y escuchar las manifestaciones les consta que el acta levantada a la C. '), C(d.trabajador),
          T(' se le dio el uso de la palabra y argumentó en su defensa y están dispuestos a ratificar los hechos que les consta ante cualquier autoridad que se les indique o requiera. Por ese motivo se firma la presente acta siendo las '),
          C(d.horaCierre), T(' horas del día de su inicio, firmando los que en ella intervinieron.')] },
      ],
      firmas: [
        { rol: 'REPRESENTANTE DEL CENTRO DE TRABAJO', nombre: limpio(d.representante) },
        { rol: 'TRABAJADOR', nombre: limpio(d.trabajador) },
      ],
      testigos: [limpio(d.testigo1), limpio(d.testigo2)],
    };
  }

  function nombreArchivo(d) {
    const base = ['Acta administrativa', limpio(d.trabajador), limpio(d.tienda), limpio(d.fecha)].filter(Boolean).join(' - ');
    return base.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9 ._-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120) + '.docx';
  }

  // ── Word (OOXML) ──
  function xml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function runXml(texto, { campo = false, negrita = false } = {}) {
    const vacio = campo && !texto;
    const props = (negrita ? '<w:b/>' : '') + (campo && !vacio ? '<w:u w:val="single"/>' : '');
    const lineas = String(vacio ? VACIO : texto).split(/\r?\n/);
    const cuerpo = lineas.map((l, i) => (i ? '<w:br/>' : '') + `<w:t xml:space="preserve">${xml(l)}</w:t>`).join('');
    return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}${cuerpo}</w:r>`;
  }
  function parrafoXml(runs, { alinear = 'both', antes = 0, despues = 160 } = {}) {
    return `<w:p><w:pPr><w:spacing w:before="${antes}" w:after="${despues}" w:line="300" w:lineRule="auto"/><w:jc w:val="${alinear}"/></w:pPr>${runs}</w:p>`;
  }
  // Bloque de firmas en dos columnas (representante | trabajador, testigo |
  // testigo): cabe con el texto en una hoja y no se parte entre paginas.
  function celdaFirmaXml(rol, nombre) {
    return '<w:tc><w:tcPr><w:tcW w:w="4985" w:type="dxa"/></w:tcPr>'
      + parrafoXml(runXml(rol, { negrita: true }), { alinear: 'center', antes: 0, despues: 0 })
      + parrafoXml(runXml('________________________________'), { alinear: 'center', antes: 640, despues: 0 })
      + parrafoXml(runXml(nombre || ' '), { alinear: 'center', despues: 120 }) + '</w:tc>';
  }
  function filaFirmasXml(a, b) {
    return `<w:tr><w:trPr><w:cantSplit/></w:trPr>${celdaFirmaXml(a.rol, a.nombre)}${celdaFirmaXml(b.rol, b.nombre)}</w:tr>`;
  }
  function documentXml(d) {
    const m = modelo(d);
    const cuerpo = m.parrafos.map(p => p.titulo
      ? parrafoXml(p.runs.map(r => runXml(r.t, { negrita: true })).join(''), { alinear: 'center', antes: 120 })
      : parrafoXml(p.runs.map(r => runXml(r.t, { campo: r.campo })).join(''))).join('');
    const bloque = '<w:tbl><w:tblPr><w:tblW w:w="9970" w:type="dxa"/><w:jc w:val="center"/><w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid><w:gridCol w:w="4985"/><w:gridCol w:w="4985"/></w:tblGrid>'
      + filaFirmasXml(m.firmas[0], m.firmas[1])
      + filaFirmasXml({ rol: 'TESTIGO', nombre: m.testigos[0] }, { rol: 'TESTIGO', nombre: m.testigos[1] })
      + '</w:tbl>';
    const firmas = parrafoXml('', { antes: 240, despues: 0 }) + bloque;
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>'
      + cuerpo + firmas
      + '<w:sectPr><w:footerReference w:type="default" r:id="rId2"/><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr>'
      + '</w:body></w:document>';
  }
  const ARCHIVOS_FIJOS = {
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/></Types>',
    '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    'word/_rels/document.xml.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/></Relationships>',
    'word/styles.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial" w:eastAsia="Arial"/><w:sz w:val="21"/><w:szCs w:val="21"/><w:lang w:val="es-MX"/></w:rPr></w:rPrDefault><w:pPrDefault/></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>',
    // Texto justificado sin estirar la linea que termina en un salto (Enter
    // dentro de "Hechos"): Word la abriria de margen a margen.
    'word/settings.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:compat><w:doNotExpandShiftReturn/></w:compat></w:settings>',
    'word/footer1.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:t>OXXO | Uso Interno</w:t></w:r></w:p></w:ftr>',
  };

  // ZIP sin compresion (metodo 0): suficiente para Word y sin dependencias.
  const CRC_TABLA = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLA[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function zip(archivos) {
    const enc = new TextEncoder();
    const partes = [], central = [];
    let offset = 0;
    const u16 = (v, n) => { v.push(n & 0xFF, (n >>> 8) & 0xFF); };
    const u32 = (v, n) => { v.push(n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF); };
    Object.entries(archivos).forEach(([nombre, contenido]) => {
      const nom = enc.encode(nombre);
      const datos = typeof contenido === 'string' ? enc.encode(contenido) : contenido;
      const crc = crc32(datos);
      const cab = [];
      u32(cab, 0x04034b50); u16(cab, 20); u16(cab, 0x0800); u16(cab, 0); u16(cab, 0); u16(cab, 0x21);
      u32(cab, crc); u32(cab, datos.length); u32(cab, datos.length); u16(cab, nom.length); u16(cab, 0);
      partes.push(Uint8Array.from(cab), nom, datos);
      const cen = [];
      u32(cen, 0x02014b50); u16(cen, 20); u16(cen, 20); u16(cen, 0x0800); u16(cen, 0); u16(cen, 0); u16(cen, 0x21);
      u32(cen, crc); u32(cen, datos.length); u32(cen, datos.length); u16(cen, nom.length); u16(cen, 0); u16(cen, 0);
      u16(cen, 0); u16(cen, 0); u32(cen, 0); u32(cen, offset);
      central.push(Uint8Array.from(cen), nom);
      offset += cab.length + nom.length + datos.length;
    });
    const tamCentral = central.reduce((s, p) => s + p.length, 0);
    const fin = [];
    u32(fin, 0x06054b50); u16(fin, 0); u16(fin, 0); u16(fin, central.length / 2); u16(fin, central.length / 2);
    u32(fin, tamCentral); u32(fin, offset); u16(fin, 0);
    const todo = [...partes, ...central, Uint8Array.from(fin)];
    const out = new Uint8Array(todo.reduce((s, p) => s + p.length, 0));
    let pos = 0;
    todo.forEach(p => { out.set(p, pos); pos += p.length; });
    return out;
  }
  function docx(d) { return zip({ ...ARCHIVOS_FIJOS, 'word/document.xml': documentXml(d) }); }

  function faltantes(d) {
    return Object.entries(OBLIGATORIOS).filter(([k]) => !limpio(d[k])).map(([, etiqueta]) => etiqueta);
  }
  function aBase64(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }

  // ── Pagina ──
  function montar() {
    const $ = id => document.getElementById(id);
    const form = $('acta-form');
    const estado = $('acta-estado');
    const val = () => Object.fromEntries(CAMPOS.map(k => [k, form.elements[k] ? form.elements[k].value : '']));
    let tiendas = [];       // [{ etiqueta, tienda, cr, asesor }]
    let empleados = [];     // [{ cr, nombre, puesto }]
    let auto = { representante: '', puesto: '' };   // ultimo valor puesto por el sistema

    function avisar(texto, tipo) {
      estado.textContent = texto;
      estado.dataset.tipo = tipo || 'info';
      estado.hidden = !texto;
    }
    function guardarBorrador() {
      try { localStorage.setItem(BORRADOR_KEY, JSON.stringify(val())); } catch (e) { /* sin almacenamiento */ }
    }
    function cargarBorrador() {
      try {
        const d = JSON.parse(localStorage.getItem(BORRADOR_KEY) || 'null');
        if (d) CAMPOS.forEach(k => { if (form.elements[k] && d[k] != null) form.elements[k].value = d[k]; });
      } catch (e) { /* borrador ilegible */ }
    }
    function pintarVista() {
      const m = modelo(val());
      const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const run = r => r.campo
        ? (r.t ? `<span class="acta-campo">${esc(r.t).replace(/\n/g, '<br>')}</span>` : `<span class="acta-hueco">${VACIO}</span>`)
        : esc(r.t);
      const firma = (rol, nombre) => `<div class="acta-firma"><strong>${esc(rol)}</strong><span class="acta-linea"></span><span>${esc(nombre || ' ')}</span></div>`;
      $('acta-vista').innerHTML = m.parrafos.map(p => p.titulo ? `<h3>${p.runs.map(run).join('')}</h3>` : `<p>${p.runs.map(run).join('')}</p>`).join('')
        + `<div class="acta-firmas">${[...m.firmas, { rol: 'TESTIGO', nombre: m.testigos[0] }, { rol: 'TESTIGO', nombre: m.testigos[1] }].map(f => firma(f.rol, f.nombre)).join('')}</div>`
        + '<footer>OXXO | Uso Interno</footer>';
    }
    function tiendaElegida() {
      const v = limpio(form.elements.tienda.value).toLowerCase();
      return tiendas.find(t => t.etiqueta.toLowerCase() === v || t.tienda.toLowerCase() === v) || null;
    }
    function alCambiarTienda() {
      const t = tiendaElegida();
      if (t) {
        form.elements.tienda.value = t.tienda;
        const rep = form.elements.representante;
        if (!limpio(rep.value) || rep.value === auto.representante) { rep.value = t.asesor; auto.representante = t.asesor; }
      }
      const lista = t ? empleados.filter(e => e.cr === t.cr) : [];
      $('acta-empleados').innerHTML = lista.map(e => `<option value="${xml(e.nombre)}">${xml(e.puesto)}</option>`).join('');
      $('acta-tienda-ayuda').textContent = t ? `CR ${t.cr} · AT ${t.asesor} · ${lista.length} colaboradores en la base` : 'Escribe y elige tu tienda de la lista.';
    }
    function alCambiarTrabajador() {
      const t = tiendaElegida();
      const nombre = limpio(form.elements.trabajador.value).toLowerCase();
      const e = empleados.find(x => (!t || x.cr === t.cr) && x.nombre.toLowerCase() === nombre);
      const pu = form.elements.puesto;
      if (e && (!limpio(pu.value) || pu.value === auto.puesto)) { pu.value = e.puesto; auto.puesto = e.puesto; }
    }
    function validar() {
      const d = val();
      const falta = faltantes(d);
      if (falta.length) { avisar('Faltan datos: ' + falta.join(', ') + '.', 'error'); return null; }
      return d;
    }
    function descargar(d) {
      const blob = new Blob([docx(d)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = nombreArchivo(d);
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }
    async function enviar(d, boton) {
      const url = window.OXXO_CONFIG && window.OXXO_CONFIG.ADMIN_UPLOAD_URL;
      if (!url) { avisar('El envío por correo no está configurado. Descarga el Word y mándalo tú.', 'error'); return; }
      boton.disabled = true;
      avisar('Enviando el acta por correo…', 'info');
      try {
        const cuerpo = JSON.stringify({
          action: 'enviarActa', archivo: nombreArchivo(d), docx: aBase64(docx(d)), copia: limpio(d.copia),
          tienda: limpio(d.tienda), trabajador: limpio(d.trabajador), representante: limpio(d.representante), fecha: limpio(d.fecha),
        });
        // text/plain evita la consulta previa de CORS que Apps Script no contesta.
        const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: cuerpo });
        const datos = await r.json().catch(() => null);
        if (!r.ok || !datos || datos.ok === false) {
          const motivo = (datos && datos.error) || 'el servidor no respondió';
          // Un Apps Script sin la accion "enviarActa" contesta "No autorizado".
          throw new Error(/no autorizado/i.test(motivo) ? 'el envío por correo aún no está activado en el Apps Script' : motivo);
        }
        avisar(`Acta enviada a ${datos.enviadoA || 'RH'}. También se descargó el Word para imprimirlo.`, 'ok');
        descargar(d);
      } catch (e) {
        avisar('No se pudo enviar: ' + e.message + '. Descarga el Word y mándalo por correo.', 'error');
      } finally {
        boton.disabled = false;
      }
    }

    cargarBorrador();
    const hoy = new Date();
    const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (!form.elements.fecha.value) form.elements.fecha.value = iso(hoy);
    if (!form.elements.horaInicio.value) form.elements.horaInicio.value = `${String(hoy.getHours()).padStart(2, '0')}:${String(hoy.getMinutes()).padStart(2, '0')}`;
    if (!form.elements.funcion.value) form.elements.funcion.value = 'Asesor Tienda';
    pintarVista();

    form.addEventListener('input', () => { pintarVista(); guardarBorrador(); });
    form.elements.tienda.addEventListener('change', () => { alCambiarTienda(); pintarVista(); guardarBorrador(); });
    form.elements.trabajador.addEventListener('change', () => { alCambiarTrabajador(); pintarVista(); guardarBorrador(); });
    $('acta-descargar').addEventListener('click', () => { const d = validar(); if (d) { descargar(d); avisar('Word descargado. Ábrelo para imprimirlo.', 'ok'); } });
    $('acta-enviar').addEventListener('click', e => { const d = validar(); if (d) enviar(d, e.currentTarget); });
    $('acta-limpiar').addEventListener('click', () => {
      if (!window.confirm('¿Borrar todos los datos del acta?')) return;
      form.reset();
      try { localStorage.removeItem(BORRADOR_KEY); } catch (e) { /* sin almacenamiento */ }
      form.elements.fecha.value = iso(new Date());
      form.elements.funcion.value = 'Asesor Tienda';
      auto = { representante: '', puesto: '' };
      alCambiarTienda(); pintarVista(); avisar('', 'info');
    });

    // Catalogo de tiendas (AT vigente) y colaboradores de Capacidades para
    // sugerir nombres y puesto. Si algo falla, el formulario sigue siendo libre.
    (async () => {
      try {
        const cat = await OXXO.loadAsesorCatalog();
        tiendas = (cat.rows || []).filter(r => r.tienda).map(r => ({ tienda: r.tienda, cr: String(r.cr || '').toUpperCase(), asesor: r.asesor || '', etiqueta: `${r.tienda} · ${r.cr}` }))
          .sort((a, b) => a.tienda.localeCompare(b.tienda, 'es'));
        $('acta-tiendas').innerHTML = tiendas.map(t => `<option value="${xml(t.tienda)}">${xml(t.cr + ' · ' + t.asesor)}</option>`).join('');
      } catch (e) { /* catalogo no disponible: se escribe a mano */ }
      try {
        const filas = await OXXO.fetchSheetData(OXXO.SHEETS_CONFIG.TABS.d8);
        if (filas && filas.length) {
          const k = n => OXXO.metricsFindKey(filas[0], n);
          const kCr = k(['Cr de tienda', 'CR de Tienda']), kNom = k(['Empleados', 'Empleado']), kPu = k(['Puesto_Correcto', 'Puesto']);
          const vistos = new Set();
          empleados = filas.map(r => ({ cr: String(r[kCr] || '').trim().toUpperCase(), nombre: String(r[kNom] || '').trim(), puesto: String(r[kPu] || '').trim() }))
            .filter(e => e.nombre && e.cr && !vistos.has(e.cr + e.nombre) && vistos.add(e.cr + e.nombre))
            .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
        }
      } catch (e) { /* sin sugerencias de colaboradores */ }
      alCambiarTienda();
    })();
  }

  window.OXXO_ACTA = { modelo, docx, documentXml, nombreArchivo, faltantes, fechaPartes, crc32, montar };
})();
