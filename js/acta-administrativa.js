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

   Firma en pantalla: cada persona del documento puede firmar con el dedo
   en el celular o tableta; la firma (PNG) se incrusta en el Word. Si alguien
   se niega, se asienta "Se negó a firmar" en su lugar. Las firmas viven
   solo en memoria (no en el borrador) y, mientras haya alguna, los datos
   del documento quedan bloqueados para que nadie cambie lo ya firmado.

   Uso: OXXO_ACTA.modelo(datos), OXXO_ACTA.docx(datos, { logo, firmas })
   -> Uint8Array, OXXO_ACTA.montar() para la pagina. "firmas" va en el
   mismo orden que modelo(datos).firmas: { png, cuando } | { negada, cuando } | null.
   ========================================================== */
(function () {
  'use strict';

  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const VACIO = '______________';
  const BORRADOR_KEY = 'oxxo_acta_borrador';
  const PARTICIPANTES = 4;
  const CAMPOS = ['tipo', 'tienda', 'ciudad', 'domicilio', 'cp', 'municipio', 'fecha', 'horaInicio', 'representante', 'funcion',
    'trabajador', 'numEmpleado', 'puesto', 'horaEntrada', 'horaSalida', 'fechaIngreso', 'testigo1', 'testigo2',
    ...Array.from({ length: PARTICIPANTES }, (_, i) => [`participante${i + 1}`, `funcionP${i + 1}`]).flat(),
    'fechaHechos', 'falta', 'hechos', 'manifiesta', 'compromisos', 'horaCierre', 'copia'];
  // Tipos de documento: lo que pide cada formato de RH. "campos" decide que
  // se muestra en el formulario; "obligatorios", que se valida.
  const ETIQUETAS = { tienda: 'Tienda', fecha: 'Fecha', representante: 'Representante', trabajador: 'Trabajador', puesto: 'Puesto',
    fechaHechos: 'Fecha de los hechos', falta: 'Falta al reglamento', hechos: 'Hechos', participante1: 'Al menos una persona presente',
    fechaIngreso: 'Fecha de ingreso', municipio: 'Municipio', ciudad: 'Ciudad' };
  const PRESENTES = Array.from({ length: PARTICIPANTES }, (_, i) => [`participante${i + 1}`, `funcionP${i + 1}`]).flat();
  const TIPOS = {
    administrativa: { nombre: 'Acta administrativa', titulo: 'ACTA ADMINISTRATIVA',
      campos: ['domicilio', 'cp', 'municipio', 'horaInicio', 'representante', 'funcion', 'horaEntrada', 'horaSalida', 'testigo1', 'testigo2', 'fechaHechos', 'falta', 'hechos', 'manifiesta', 'horaCierre'],
      obligatorios: ['tienda', 'fecha', 'representante', 'trabajador', 'puesto', 'fechaHechos', 'falta', 'hechos'] },
    probidad: { nombre: 'Acta por falta de probidad', titulo: 'ACTA ADMINISTRATIVA', subtitulo: 'Falta de probidad',
      campos: ['domicilio', 'municipio', 'horaInicio', 'representante', 'funcion', 'testigo1', 'testigo2', 'falta', 'hechos', 'manifiesta', 'horaCierre'],
      obligatorios: ['tienda', 'fecha', 'municipio', 'representante', 'trabajador', 'puesto', 'hechos'] },
    ultimatum: { nombre: 'Acta ultimátum', titulo: 'ACTA ULTIMÁTUM', ref: 'ACTA ULTIMÁTUM', cierre: 'Acta Ultimátum',
      campos: ['ciudad', 'horaInicio', ...PRESENTES, 'falta', 'hechos', 'manifiesta', 'compromisos'],
      obligatorios: ['tienda', 'fecha', 'ciudad', 'trabajador', 'puesto', 'participante1', 'hechos'] },
    retroalimentacion: { nombre: 'Retroalimentación', titulo: 'RETROALIMENTACIÓN', ref: 'Retroalimentación', cierre: 'Retroalimentación',
      campos: ['ciudad', 'horaInicio', ...PRESENTES, 'falta', 'hechos', 'manifiesta', 'compromisos'],
      obligatorios: ['tienda', 'fecha', 'ciudad', 'trabajador', 'puesto', 'participante1', 'hechos'] },
    hechos: { nombre: 'Acta de hechos', titulo: 'ACTA DE HECHOS',
      campos: ['ciudad', 'domicilio', 'horaInicio', ...PRESENTES, 'falta', 'hechos'],
      obligatorios: ['tienda', 'fecha', 'ciudad', 'participante1', 'hechos'] },
    renuncia: { nombre: 'Renuncia voluntaria', titulo: 'RENUNCIA VOLUNTARIA', carta: true,
      campos: ['ciudad', 'fechaIngreso'],
      obligatorios: ['tienda', 'fecha', 'ciudad', 'trabajador', 'puesto', 'fechaIngreso'] },
  };
  // Siempre visibles: tienda, fecha, trabajador, No. de empleado, puesto y la copia del correo.
  const CAMPOS_COMUNES = ['tipo', 'tienda', 'fecha', 'trabajador', 'numEmpleado', 'puesto', 'copia'];
  const tipoDe = d => TIPOS[d && d.tipo] ? d.tipo : 'administrativa';

  function limpio(v) { return String(v == null ? '' : v).trim(); }
  function fechaPartes(iso) {
    const m = limpio(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? { dia: String(+m[3]), mes: MESES[+m[2] - 1] || '', anio: m[1] } : { dia: '', mes: '', anio: '' };
  }

  // ── Modelo: el texto de cada formato, con los huecos marcados como campo ──
  const T = t => ({ t });
  const C = t => ({ t: limpio(t), campo: true });
  // Textos largos: misma tipografia de dato, sin negrita ni subrayado (se leen mejor).
  const L = t => ({ t: limpio(t), campo: true, largo: true });
  const seccion = t => ({ titulo: true, runs: [T(t)] });
  function enLista(nombres) {
    const n = nombres.filter(Boolean);
    return n.length > 1 ? n.slice(0, -1).join(', ') + ' y ' + n[n.length - 1] : (n[0] || '');
  }
  function presentes(d) {
    return Array.from({ length: PARTICIPANTES }, (_, i) => ({ nombre: limpio(d[`participante${i + 1}`]), rol: limpio(d[`funcionP${i + 1}`]) }))
      .filter(p => p.nombre);
  }
  const NOTA_FIRMA = 'NOTA: Si alguien se niega a firmar, debe asentarse tal hecho.';
  const CIERRE_TESTIGOS = ' se le dio el uso de la palabra y argumentó en su defensa y están dispuestos a ratificar los hechos que les consta ante cualquier autoridad que se les indique o requiera. Por ese motivo se firma la presente acta siendo las ';

  function resumenDe(d, f) {
    return [
      [['Tienda', limpio(d.tienda) ? 'OXXO ' + limpio(d.tienda) : ''], ['Fecha', f.dia ? `${f.dia} de ${f.mes} de ${f.anio}` : ''], ['Hora de inicio', limpio(d.horaInicio)]],
      [['Trabajador', limpio(d.trabajador)], ['No. de empleado', limpio(d.numEmpleado)], ['Puesto', limpio(d.puesto)]],
    ];
  }

  const MODELOS = {
    administrativa(d, f) {
      const h = fechaPartes(d.fechaHechos);
      const testigos = enLista([limpio(d.testigo1), limpio(d.testigo2)]);
      return {
        parrafos: [
          { runs: [T('Oaxaca de Juárez, Oaxaca, siendo las '), C(d.horaInicio), T(' horas del día '), C(f.dia), T(' de '), C(f.mes),
            T(' del '), C(f.anio), T(', en la tienda denominada OXXO '), C(d.tienda),
            T(' propiedad de la empresa Cadena Comercial Oxxo SA de CV, sita en '), C(d.domicilio), T(' Cp '), C(d.cp),
            T(' Municipio '), C(d.municipio), T(' Oaxaca y ante la presencia de la C. '), C(d.representante),
            T(' quien desempeña la función de '), C(d.funcion), T(' como representante del patrón en el centro de trabajo, el trabajador de nombre '),
            C(d.trabajador), T(' y los C. '), C(d.testigo1), T(' y '), C(d.testigo2),
            T(', trabajadores como testigos de asistencia. Se levanta la presente Acta Administrativa a fin de hacer constar los siguientes:')] },
          seccion('HECHOS'),
          { runs: [T('El día '), C(h.dia), T(' del mes de '), C(h.mes), T(' del año '), C(h.anio), T(', el empleado de nombre '), C(d.trabajador),
            T(' con número de empleado '), C(d.numEmpleado), T(' y puesto '), C(d.puesto), T(', con horario de trabajo de las '), C(d.horaEntrada), T(' a las '), C(d.horaSalida),
            T(', cometió las siguientes faltas al reglamento (proceso) '), C(d.falta), T(', hechos que se comprueban con: '), L(d.hechos)] },
          seccion('MANIFESTACIÓN DEL TRABAJADOR'),
          { runs: [T('Hecho por lo que EL TRABAJADOR '), C(d.trabajador), T(' en relación a los hechos manifiesta en este acto: '), L(d.manifiesta)] },
          seccion('DECLARACIÓN DE LOS TESTIGOS'),
          { runs: [T('POR SU PARTE LOS INTERVINIENTES COMO TESTIGOS '), C(testigos),
            T(' SEÑALAN: Que al estar presentes y escuchar las manifestaciones les consta que el acta levantada a la C. '), C(d.trabajador),
            T(CIERRE_TESTIGOS), C(d.horaCierre), T(' horas del día de su inicio, firmando los que en ella intervinieron.')] },
        ],
        firmas: [
          { rol: 'REPRESENTANTE DEL CENTRO DE TRABAJO', nombre: limpio(d.representante) },
          { rol: 'TRABAJADOR', nombre: limpio(d.trabajador) },
          { rol: 'TESTIGO', nombre: limpio(d.testigo1) },
          { rol: 'TESTIGO', nombre: limpio(d.testigo2) },
        ],
        resumen: resumenDe(d, f),
      };
    },
    probidad(d, f) {
      const testigos = enLista([limpio(d.testigo1), limpio(d.testigo2)]);
      return {
        parrafos: [
          { runs: [C(d.municipio), T(', Oaxaca, siendo las '), C(d.horaInicio), T(' horas del día '), C(f.dia), T(' de '), C(f.mes), T(' del '), C(f.anio),
            T(', en las instalaciones de la empresa Cadena Comercial Oxxo SA de CV, tienda OXXO '), C(d.tienda), T(', sita en '), C(d.domicilio),
            T(', '), C(d.municipio), T(', Oaxaca y ante la presencia del C. '), C(d.representante), T(', quien desempeña la función de '), C(d.funcion),
            T(', como representante del patrón en el centro de trabajo, el trabajador de nombre '), C(d.trabajador), T(', y los C. '), C(d.testigo1), T(' y '), C(d.testigo2),
            T(', trabajadores como testigos de asistencia. Se levanta la presente Acta Administrativa a fin de hacer constar los siguientes hechos:')] },
          seccion('HECHOS'),
          { runs: [T('El empleado de nombre '), C(d.trabajador), T(' con número de empleado '), C(d.numEmpleado), T(' y puesto de '), C(d.puesto),
            T(' cometió las siguientes faltas al reglamento (proceso) '), C(d.falta), T(': '), L(d.hechos)] },
          seccion('MANIFESTACIÓN DEL TRABAJADOR'),
          { runs: [T('EL TRABAJADOR '), C(d.trabajador), T(' en relación a los hechos manifiesta: '), L(d.manifiesta)] },
          seccion('DECLARACIÓN DE LOS TESTIGOS'),
          { runs: [T('POR SU PARTE LOS INTERVINIENTES COMO TESTIGOS '), C(testigos),
            T(': Que al estar presentes y escuchar las manifestaciones les consta que el acta levantada al C. '), C(d.trabajador),
            T(CIERRE_TESTIGOS), C(d.horaCierre), T(' horas del día de su inicio, firmando los que en ella intervinieron.')] },
        ],
        firmas: [
          { rol: 'ASESOR DE TIENDA', nombre: limpio(d.representante) },
          { rol: 'TRABAJADOR', nombre: limpio(d.trabajador) },
          { rol: 'TESTIGO', nombre: limpio(d.testigo1) },
          { rol: 'TESTIGO', nombre: limpio(d.testigo2) },
        ],
        resumen: resumenDe(d, f),
      };
    },
    // Ultimatum y Retroalimentacion comparten formato; cambia el nombre.
    ultimatum(d, f, tipo) {
      const lista = presentes(d);
      const t = TIPOS[tipo];
      return {
        parrafos: [
          { runs: [T('En la Ciudad de '), C(d.ciudad), T(' del Estado de Oaxaca, siendo las '), C(d.horaInicio), T(' horas del día '), C(f.dia), T(' de '), C(f.mes),
            T(' del año '), C(f.anio), T(', y ante la presencia de los C. '), C(enLista(lista.map(p => p.nombre))), T(', quienes desempeñan la función de '),
            C(enLista(lista.map(p => p.rol))), T(', respectivamente, dentro de la Empresa Cadena Comercial Oxxo S.A. de C.V., se levanta la presente '), T(t.ref),
            T(' a fin de hacer constar los siguientes hechos. En la cual participa el C. '), C(d.trabajador), T(' quien desempeña la función de '), C(d.puesto),
            T(' y que consiste en lo siguiente:')] },
          seccion('HECHOS'),
          { runs: [L(d.hechos)] },
          seccion('MANIFESTACIÓN DEL TRABAJADOR'),
          { runs: [T('Así mismo, en este acto el C. '), C(d.trabajador), T(' manifiesta lo siguiente: '), L(d.manifiesta)] },
          seccion('Y SE COMPROMETE A'),
          { runs: [L(d.compromisos)] },
          { runs: [T(`La presente ${t.cierre} se levanta el día y lugar arriba mencionados, para los fines legales correspondientes, firmando para constancia cada una de las personas que participan en la misma.`)] },
        ],
        firmas: [...lista.map(p => ({ rol: p.rol || 'PARTICIPANTE', nombre: p.nombre })), { rol: 'TRABAJADOR', nombre: limpio(d.trabajador) }],
        nota: NOTA_FIRMA,
        resumen: resumenDe(d, f),
      };
    },
    hechos(d, f) {
      const lista = presentes(d);
      const firmas = lista.map(p => ({ rol: p.rol || 'PARTICIPANTE', nombre: p.nombre }));
      if (limpio(d.trabajador)) firmas.push({ rol: 'TRABAJADOR', nombre: limpio(d.trabajador) });
      return {
        parrafos: [
          { runs: [T('En la Ciudad de '), C(d.ciudad), T(', del Estado de Oaxaca, siendo las '), C(d.horaInicio), T(' horas del día '), C(f.dia), T(' del mes de '), C(f.mes),
            T(' del año '), C(f.anio), T(', estando presentes los C. '), C(enLista(lista.map(p => p.nombre))), T(', quienes desempeñan la función de '),
            C(enLista(lista.map(p => p.rol))), T(', respectivamente, dentro de la Empresa Cadena Comercial Oxxo SA de CV, sucursal '), C(d.tienda),
            T(', que se encuentra ubicada en: '), C(d.domicilio), T(', procedemos a levantar la presente Acta a fin de hacer constar los siguientes hechos que a continuación detallamos:')] },
          seccion('HECHOS'),
          { runs: [L(d.hechos)] },
          { runs: [T('La presente Acta se levanta el día y lugar arriba mencionados, para los fines legales correspondientes, firmando para constancia cada una de las personas que participan en la misma.')] },
        ],
        firmas,
        nota: NOTA_FIRMA,
        resumen: resumenDe(d, f),
      };
    },
    // Carta del trabajador: sin membrete ni recuadro de datos.
    renuncia(d, f) {
      const ing = fechaPartes(d.fechaIngreso);
      const larga = x => x.dia ? `${x.dia} de ${x.mes} de ${x.anio}` : '';
      return {
        parrafos: [
          { alinear: 'right', runs: [C(d.ciudad), T(', Oaxaca a '), C(larga(f))] },
          { alinear: 'left', negrita: true, antes: 360, despues: 0, runs: [T('CADENA COMERCIAL OXXO, S.A. DE C.V.')] },
          { alinear: 'left', negrita: true, despues: 0, runs: [T('AL REPRESENTANTE LEGAL')] },
          { alinear: 'left', negrita: true, despues: 240, runs: [T('P R E S E N T E.-')] },
          { runs: [T('Por medio de la presente me permito comunicarle a Usted mi renuncia de carácter irrevocable al puesto de '), C(limpio(d.puesto).toUpperCase()),
            T(', que venía desempeñando desde el día '), C(larga(ing).toUpperCase()), T(' del cual me separo en forma voluntaria a partir del día de hoy, por así convenir a mis intereses personales.')] },
          { runs: [T('Rogándole a Usted se sirva aceptar mi renuncia voluntaria, reiterando que durante mi estancia en esta empresa, siempre me fueron cubiertas todas y cada una de las prestaciones a que tuve derecho no adeudándome a la fecha ninguna cantidad por concepto de: salarios, séptimo día, tiempo extra fijo, aguinaldo, vacaciones, utilidades, riesgos profesionales, primas legales, sobre salarios, ni por ningún otro concepto derivado del contrato de trabajo que tenía celebrado con dicha empresa.')] },
          { runs: [T('Así mismo manifiesto que durante el tiempo que laboré con ustedes, jamás sufrí accidente ni enfermedad profesional alguna que me impida seguir prestando mis servicios para otra empresa.')] },
          { runs: [T('Aprovecho la presente para agradecerle a Usted todas las atenciones que me dispensaron durante todo el tiempo en que presté mis servicios personales para esta empresa.')] },
          { alinear: 'center', antes: 360, runs: [T('A t e n t a m e n t e.-')] },
        ],
        firmas: [{ rol: '', nombre: [limpio(d.numEmpleado), limpio(d.trabajador).toUpperCase()].filter(Boolean).join(' ') }],
        resumen: null,
      };
    },
  };
  MODELOS.retroalimentacion = (d, f) => MODELOS.ultimatum(d, f, 'retroalimentacion');

  function modelo(d) {
    d = d || {};
    const tipo = tipoDe(d);
    const m = (tipo === 'ultimatum' ? MODELOS.ultimatum(d, fechaPartes(d.fecha), tipo) : MODELOS[tipo](d, fechaPartes(d.fecha)));
    return { tipo, ...TIPOS[tipo], ...m };
  }

  function nombreArchivo(d) {
    const base = [TIPOS[tipoDe(d)].nombre, limpio(d.trabajador), limpio(d.tienda), limpio(d.fecha)].filter(Boolean).join(' - ');
    return base.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9 ._-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120) + '.docx';
  }

  // ── Word (OOXML) ──
  // El texto del formato va en Arial gris oscuro; lo que llena el asesor, en
  // Calibri negrita azul marino y subrayado, para distinguirlo de un vistazo
  // (y de lo que despues se escriba a mano en las firmas).
  const COLOR_TEXTO = '262626', COLOR_DATO = '1F3B70', COLOR_ROJO = 'B5121B', COLOR_GRIS = '6F625D';
  const FUENTE_DATO = '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri" w:eastAsia="Calibri"/>';
  function xml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function runXml(texto, { campo = false, negrita = false, color = '', tam = 0, mayus = false, subrayar = true, largo = false } = {}) {
    const vacio = campo && !texto;
    if (largo) subrayar = false;
    const props = (campo && !vacio ? FUENTE_DATO + (largo ? '' : '<w:b/>') : negrita ? '<w:b/>' : '')
      + (mayus ? '<w:caps/>' : '')
      + `<w:color w:val="${campo && !vacio ? COLOR_DATO : color || (vacio ? '9A9A9A' : COLOR_TEXTO)}"/>`
      + (tam ? `<w:sz w:val="${tam}"/><w:szCs w:val="${tam}"/>` : campo && !vacio ? '<w:sz w:val="21"/><w:szCs w:val="21"/>' : '')
      + (campo && !vacio && subrayar ? `<w:u w:val="single" w:color="${COLOR_DATO}"/>` : '');
    const lineas = String(vacio ? VACIO : texto).split(/\r?\n/);
    const cuerpo = lineas.map((l, i) => (i ? '<w:br/>' : '') + `<w:t xml:space="preserve">${xml(l)}</w:t>`).join('');
    return `<w:r><w:rPr>${props}</w:rPr>${cuerpo}</w:r>`;
  }
  function parrafoXml(runs, { alinear = 'both', antes = 0, despues = 100, linea = 276, extra = '' } = {}) {
    return `<w:p><w:pPr>${extra}<w:spacing w:before="${antes}" w:after="${despues}" w:line="${linea}" w:lineRule="auto"/><w:jc w:val="${alinear}"/></w:pPr>${runs}</w:p>`;
  }
  // Titulo de seccion: rojo, en mayusculas, con una linea fina debajo.
  function seccionXml(texto) {
    return parrafoXml(runXml(texto, { negrita: true, color: COLOR_ROJO, tam: 19 }), {
      alinear: 'left', antes: 150, despues: 80, linea: 240,
      extra: '<w:keepNext/><w:pBdr><w:bottom w:val="single" w:sz="4" w:space="2" w:color="DED6CF"/></w:pBdr>',
    });
  }
  const SIN_BORDES = '<w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders>';
  function tablaXml(anchos, filas, { bordes = SIN_BORDES } = {}) {
    const total = anchos.reduce((a, b) => a + b, 0);
    return `<w:tbl><w:tblPr><w:tblW w:w="${total}" w:type="dxa"/><w:jc w:val="center"/>${bordes}<w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="100" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr>`
      + `<w:tblGrid>${anchos.map(a => `<w:gridCol w:w="${a}"/>`).join('')}</w:tblGrid>${filas.join('')}</w:tbl>`;
  }
  function celdaXml(ancho, contenido, { fondo = '' } = {}) {
    return `<w:tc><w:tcPr><w:tcW w:w="${ancho}" w:type="dxa"/>${fondo ? `<w:shd w:val="clear" w:color="auto" w:fill="${fondo}"/>` : ''}</w:tcPr>${contenido}</w:tc>`;
  }
  // Recuadro de datos: etiqueta chica gris arriba, dato en la tipografia de datos.
  function resumenXml(resumen) {
    const anchos = [3990, 1990, 3990];
    const borde = c => `<w:${c} w:val="single" w:sz="4" w:space="0" w:color="DED6CF"/>`;
    const bordes = `<w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(borde).join('')}</w:tblBorders>`;
    const filas = resumen.map(fila => '<w:tr><w:trPr><w:cantSplit/></w:trPr>' + fila.map(([etq, val], i) => celdaXml(anchos[i],
      parrafoXml(runXml(etq, { color: COLOR_GRIS, tam: 14, mayus: true }), { alinear: 'left', antes: 60, despues: 0, linea: 240 })
      + parrafoXml(runXml(val, { campo: true, subrayar: false }), { alinear: 'left', antes: 0, despues: 60, linea: 240 }), { fondo: 'FAF6F1' })).join('') + '</w:tr>');
    return tablaXml(anchos, filas, { bordes });
  }
  // Imagen en linea (logo del encabezado, firmas): rid apunta a la relacion
  // del archivo .rels de la parte donde va.
  const EMU = 914400;
  function imagenXml(rid, id, nombre, cx, cy) {
    return '<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">'
      + `<wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="${xml(nombre)}"/>`
      + '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">'
      + `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="${xml(nombre)}.png"/><pic:cNvPicPr/></pic:nvPicPr>`
      + `<pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>`
      + `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>`
      + '</a:graphicData></a:graphic></wp:inline></w:drawing></w:r>';
  }
  // El lienzo de firma es 3:1; en el Word ocupa 2.4" x 0.8" sobre la linea.
  const FIRMA_CX = Math.round(EMU * 2.4), FIRMA_CY = Math.round(EMU * 0.8);
  const NEGADA = 'SE NEGÓ A FIRMAR';
  // Firmas en dos columnas (representante | trabajador, testigo | testigo):
  // cabe con el texto en una hoja y no se parte entre paginas.
  // f.firma: la firma en pantalla de esa persona (o null: se firma a mano).
  function celdaFirmaXml(f) {
    const s = f.firma;
    const arriba = s && s.png
      ? parrafoXml(imagenXml(`rIdFirma${f.n}`, 100 + f.n, `Firma ${f.n}`, FIRMA_CX, FIRMA_CY), { alinear: 'center', antes: 60, despues: 0, linea: 240 })
      : s && s.negada ? parrafoXml(runXml(NEGADA, { negrita: true, color: COLOR_ROJO, tam: 18 }), { alinear: 'center', antes: 300, despues: 40, linea: 240 }) : '';
    const sello = s && (s.png || s.negada) && s.cuando
      ? parrafoXml(runXml(`${s.negada ? 'Negativa asentada' : 'Firmado en pantalla'} el ${s.cuando}`, { color: COLOR_GRIS, tam: 13 }), { alinear: 'center', antes: 0, despues: 80, linea: 240 }) : '';
    return celdaXml(4985, arriba
      + parrafoXml(runXml('______________________________________', { color: '595959' }), { alinear: 'center', antes: arriba ? 0 : 480, despues: 0, linea: 240 })
      + parrafoXml(runXml(f.nombre || '\u00a0', { campo: !!f.nombre, subrayar: false, tam: f.nombre ? 0 : 21 }), { alinear: 'center', antes: 20, despues: 0, linea: 240 })
      + parrafoXml(runXml(f.rol, { negrita: true, color: COLOR_GRIS, tam: 16 }), { alinear: 'center', antes: 0, despues: sello ? 0 : 80, linea: 240 })
      + sello);
  }
  function filaFirmasXml(a, b) {
    return `<w:tr><w:trPr><w:cantSplit/></w:trPr>${celdaFirmaXml(a)}${b ? celdaFirmaXml(b) : celdaXml(4985, parrafoXml(''))}</w:tr>`;
  }
  // Firmas de dos en dos; una sola (renuncia) va centrada.
  function firmasXml(firmas) {
    if (firmas.length === 1) return tablaXml([4985], [`<w:tr><w:trPr><w:cantSplit/></w:trPr>${celdaFirmaXml(firmas[0])}</w:tr>`]);
    const filas = [];
    for (let i = 0; i < firmas.length; i += 2) filas.push(filaFirmasXml(firmas[i], firmas[i + 1]));
    return tablaXml([4985, 4985], filas);
  }
  // Junta cada firmante del formato con su firma en pantalla (por posicion).
  function firmantesCon(m, firmas) {
    return m.firmas.map((f, i) => ({ ...f, n: i + 1, firma: (firmas && firmas[i]) || null }));
  }
  function documentXml(d, { firmas = null } = {}) {
    const m = modelo(d);
    const cuerpo = m.parrafos.map(p => p.titulo
      ? seccionXml(p.runs.map(r => r.t).join(''))
      : parrafoXml(p.runs.map(r => runXml(r.t, { campo: r.campo, largo: r.largo, negrita: p.negrita })).join(''),
        { alinear: p.alinear || 'both', ...(p.antes != null ? { antes: p.antes } : {}), ...(p.despues != null ? { despues: p.despues } : {}) })).join('');
    const bloqueFirmas = (m.carta ? parrafoXml('', { antes: 120, despues: 0 }) : seccionXml('FIRMAS')) + firmasXml(firmantesCon(m, firmas))
      + (m.nota ? parrafoXml(runXml(m.nota, { color: COLOR_GRIS, tam: 16 }), { alinear: 'left', antes: 160, despues: 0, linea: 240 }) : '');
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><w:body>'
      + (m.resumen ? resumenXml(m.resumen) + parrafoXml('', { despues: 60, linea: 240 }) : '') + cuerpo + bloqueFirmas
      + `<w:sectPr><w:headerReference w:type="default" r:id="rId4"/><w:footerReference w:type="default" r:id="rId2"/><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="${m.carta ? 1418 : 1330}" w:right="1134" w:bottom="1134" w:left="1134" w:header="510" w:footer="510" w:gutter="0"/></w:sectPr>`
      + '</w:body></w:document>';
  }
  // Encabezado: logo a la izquierda (si se pudo leer) y titulo a la derecha,
  // con una franja roja debajo.
  function pngTamano(bytes) {
    if (!bytes || bytes.length < 24 || bytes[0] !== 0x89 || bytes[1] !== 0x50) return null;
    const leer = i => ((bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3]) >>> 0;
    return { ancho: leer(16), alto: leer(20) };
  }
  // La renuncia es una carta del trabajador: va sin membrete (encabezado vacio).
  function headerXml(logo, m) {
    const NS = '<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">';
    if (m.carta) return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' + NS + '<w:p/></w:hdr>';
    const tam = pngTamano(logo);
    const cy = Math.round(EMU * 0.42), cx = tam ? Math.round(cy * tam.ancho / tam.alto) : 0;
    const imagen = tam ? imagenXml('rIdLogo', 1, 'Logo OXXO', cx, cy) : runXml('OXXO', { negrita: true, color: COLOR_ROJO, tam: 32 });
    const titulo = parrafoXml(runXml(m.titulo, { negrita: true, color: '1A1A1A', tam: 30 }), { alinear: 'right', despues: 0, linea: 240 })
      + (m.subtitulo ? parrafoXml(runXml(m.subtitulo, { negrita: true, color: COLOR_ROJO, tam: 18 }), { alinear: 'right', despues: 0, linea: 240 }) : '')
      + parrafoXml(runXml('Cadena Comercial OXXO, S.A. de C.V. · Relaciones laborales', { color: COLOR_GRIS, tam: 15 }), { alinear: 'right', despues: 0, linea: 240 });
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">'
      + tablaXml([3485, 6485], [`<w:tr>${celdaXml(3485, parrafoXml(imagen, { alinear: 'left', despues: 0, linea: 240 }))}<w:tc><w:tcPr><w:tcW w:w="6485" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>${titulo}</w:tc></w:tr>`])
      + parrafoXml('', { antes: 60, despues: 0, linea: 120, extra: `<w:pBdr><w:bottom w:val="single" w:sz="18" w:space="1" w:color="${COLOR_ROJO}"/></w:pBdr>` })
      + '</w:hdr>';
  }
  const ARCHIVOS_FIJOS = {
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/></Types>',
    '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    'word/styles.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial" w:eastAsia="Arial"/><w:sz w:val="20"/><w:szCs w:val="20"/><w:lang w:val="es-MX"/></w:rPr></w:rPrDefault><w:pPrDefault/></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>',
    // Texto justificado sin estirar la linea que termina en un salto (Enter
    // dentro de "Hechos"): Word la abriria de margen a margen.
    'word/settings.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:compat><w:doNotExpandShiftReturn/></w:compat></w:settings>',
    // Pie: "OXXO | Uso Interno" a la izquierda y "Pagina X de Y" a la derecha.
    'word/footer1.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:pBdr><w:top w:val="single" w:sz="4" w:space="4" w:color="DED6CF"/></w:pBdr><w:tabs><w:tab w:val="right" w:pos="9972"/></w:tabs></w:pPr>'
      + '<w:r><w:rPr><w:color w:val="6F625D"/><w:sz w:val="15"/></w:rPr><w:t xml:space="preserve">OXXO | Uso Interno</w:t></w:r><w:r><w:rPr><w:sz w:val="15"/></w:rPr><w:tab/></w:r>'
      + '<w:r><w:rPr><w:color w:val="6F625D"/><w:sz w:val="15"/></w:rPr><w:t xml:space="preserve">Página </w:t></w:r><w:r><w:rPr><w:color w:val="6F625D"/><w:sz w:val="15"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:rPr><w:color w:val="6F625D"/><w:sz w:val="15"/></w:rPr><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:rPr><w:color w:val="6F625D"/><w:sz w:val="15"/></w:rPr><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:rPr><w:color w:val="6F625D"/><w:sz w:val="15"/></w:rPr><w:t>1</w:t></w:r><w:r><w:rPr><w:color w:val="6F625D"/><w:sz w:val="15"/></w:rPr><w:fldChar w:fldCharType="end"/></w:r>'
      + '<w:r><w:rPr><w:color w:val="6F625D"/><w:sz w:val="15"/></w:rPr><w:t xml:space="preserve"> de </w:t></w:r><w:r><w:rPr><w:color w:val="6F625D"/><w:sz w:val="15"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:rPr><w:color w:val="6F625D"/><w:sz w:val="15"/></w:rPr><w:instrText xml:space="preserve"> NUMPAGES </w:instrText></w:r><w:r><w:rPr><w:color w:val="6F625D"/><w:sz w:val="15"/></w:rPr><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:rPr><w:color w:val="6F625D"/><w:sz w:val="15"/></w:rPr><w:t>1</w:t></w:r><w:r><w:rPr><w:color w:val="6F625D"/><w:sz w:val="15"/></w:rPr><w:fldChar w:fldCharType="end"/></w:r></w:p></w:ftr>',
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
  const REL_IMAGEN = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image';
  function documentRelsXml(conFirma) {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>'
      + conFirma.map(f => `<Relationship Id="rIdFirma${f.n}" Type="${REL_IMAGEN}" Target="media/firma${f.n}.png"/>`).join('') + '</Relationships>';
  }
  // logo: bytes del PNG del encabezado (opcional; sin logo se escribe "OXXO").
  // firmas: firmas en pantalla, en el orden de modelo(d).firmas (opcional).
  function docx(d, { logo = null, firmas = null } = {}) {
    const conLogo = pngTamano(logo);
    // Una firma que no es un PNG legible se trata como "firma a mano".
    const firmantes = firmantesCon(modelo(d), firmas);
    const conFirma = firmantes.filter(f => f.firma && f.firma.png && pngTamano(f.firma.png));
    const validas = firmantes.map(f => (f.firma && (f.firma.negada || conFirma.includes(f)) ? f.firma : null));
    return zip({
      ...ARCHIVOS_FIJOS,
      'word/_rels/document.xml.rels': documentRelsXml(conFirma),
      'word/document.xml': documentXml(d, { firmas: validas }),
      'word/header1.xml': headerXml(conLogo ? logo : null, modelo(d)),
      'word/_rels/header1.xml.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + (conLogo ? '<Relationship Id="rIdLogo" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/logo.png"/>' : '') + '</Relationships>',
      ...(conLogo ? { 'word/media/logo.png': logo } : {}),
      ...Object.fromEntries(conFirma.map(f => [`word/media/firma${f.n}.png`, f.firma.png])),
    });
  }

  function faltantes(d) {
    return TIPOS[tipoDe(d)].obligatorios.filter(k => !limpio(d[k])).map(k => ETIQUETAS[k] || k);
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
    let empleados = [];     // [{ cr, nombre, puesto, numero }]
    let logo = null;        // PNG del encabezado del Word
    fetch('../assets/oxxo-logo-original.png').then(r => r.ok ? r.arrayBuffer() : null)
      .then(b => { if (b) logo = new Uint8Array(b); }).catch(() => { /* el Word sale con "OXXO" en texto */ });
    // Ultimo valor que puso el sistema en cada campo: se reemplaza al cambiar
    // de tienda o trabajador, pero nunca lo que el asesor escribio a mano.
    let auto = {};
    function autoLlenar(campo, valor) {
      const el = form.elements[campo];
      // Con firmas, nada cambia los nombres (la firma quedaria con otro).
      if (hayFirmas()) return;
      if (valor && (!limpio(el.value) || el.value === auto[campo])) { el.value = valor; auto[campo] = valor; }
    }

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
    // ── Firmas en pantalla ──
    // Una entrada por firmante de modelo().firmas; la clave (posicion, rol y
    // nombre) evita que una firma quede bajo el nombre de otra persona.
    let firmas = [];        // { clave, png, url, cuando } | { clave, negada, cuando } | null
    let clavesFirmas = null;
    const TINTA = '#14213D';
    const claveFirma = (f, i) => `${i}|${f.rol}|${f.nombre}`;
    const hayFirmas = () => firmas.some(Boolean);
    const dos = n => String(n).padStart(2, '0');
    function ahora() {
      const x = new Date();
      return `${dos(x.getDate())}/${dos(x.getMonth() + 1)}/${x.getFullYear()} ${dos(x.getHours())}:${dos(x.getMinutes())}`;
    }
    function bytesDeDataUrl(url) {
      const b = atob(url.split(',')[1] || '');
      const out = new Uint8Array(b.length);
      for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
      return out;
    }
    // Con alguna firma, los datos no se pueden cambiar (se firmo ese texto).
    function actualizarBloqueo() {
      const b = hayFirmas();
      form.querySelectorAll('fieldset[data-bloqueable]').forEach(f => { f.disabled = b; });
      $('acta-firmas-bloqueo').hidden = !b;
    }
    function estadoPad(pad, s) {
      pad.classList.toggle('is-firmada', !!(s && s.png));
      pad.classList.toggle('is-negada', !!(s && s.negada));
      pad.querySelector('.acta-pad-estado').textContent = s && s.png ? `Firmado · ${s.cuando}` : s && s.negada ? `Se negó a firmar · ${s.cuando}` : 'Sin firmar';
      const negar = pad.querySelector('[data-accion="negar"]');
      if (negar) negar.textContent = s && s.negada ? 'Quitar negativa' : 'Se negó a firmar';
    }
    function activarPad(pad, i) {
      const lienzo = pad.querySelector('canvas');
      const ctx = lienzo.getContext('2d');
      let ultimo = null;
      const punto = e => {
        const r = lienzo.getBoundingClientRect();
        return { x: (e.clientX - r.left) * lienzo.width / r.width, y: (e.clientY - r.top) * lienzo.height / r.height };
      };
      const limpiarLienzo = () => ctx.clearRect(0, 0, lienzo.width, lienzo.height);
      lienzo.addEventListener('pointerdown', e => {
        if (firmas[i] && firmas[i].negada) return;
        e.preventDefault();
        lienzo.setPointerCapture(e.pointerId);
        ultimo = punto(e);
        ctx.fillStyle = TINTA;
        ctx.beginPath(); ctx.arc(ultimo.x, ultimo.y, 2.6, 0, Math.PI * 2); ctx.fill();
      });
      lienzo.addEventListener('pointermove', e => {
        if (!ultimo) return;
        const p = punto(e);
        ctx.strokeStyle = TINTA; ctx.lineWidth = 5.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(ultimo.x, ultimo.y); ctx.lineTo(p.x, p.y); ctx.stroke();
        ultimo = p;
      });
      const soltar = () => {
        if (!ultimo) return;
        ultimo = null;
        const url = lienzo.toDataURL('image/png');
        firmas[i] = { clave: pad.dataset.clave, png: bytesDeDataUrl(url), url, cuando: ahora() };
        estadoPad(pad, firmas[i]); actualizarBloqueo(); pintarVista();
      };
      lienzo.addEventListener('pointerup', soltar);
      lienzo.addEventListener('pointercancel', soltar);
      pad.addEventListener('click', e => {
        const accion = e.target.closest('[data-accion]');
        if (!accion) return;
        limpiarLienzo();
        firmas[i] = accion.dataset.accion === 'negar' && !(firmas[i] && firmas[i].negada) ? { clave: pad.dataset.clave, negada: true, cuando: ahora() } : null;
        estadoPad(pad, firmas[i]); actualizarBloqueo(); pintarVista();
      });
    }
    // Rehace los recuadros solo si cambian los firmantes (un recuadro nuevo
    // borraria el trazo).
    function pintarFirmas() {
      const m = modelo(val());
      const claves = m.firmas.map(claveFirma);
      if (clavesFirmas === claves.join('\n')) return;
      clavesFirmas = claves.join('\n');
      firmas = claves.map(c => firmas.find(f => f && f.clave === c) || null);
      const pads = $('acta-pads');
      pads.innerHTML = m.firmas.map((f, i) => `<div class="acta-pad" data-i="${i}" data-clave="${xml(claves[i])}">`
        + `<div class="acta-pad-titulo"><strong>${xml(f.nombre || 'Sin nombre')}</strong><small>${xml(f.rol || 'Firma')}</small></div>`
        + (f.nombre
          ? `<canvas width="900" height="300" aria-label="Recuadro de firma de ${xml(f.nombre)}"></canvas>`
            + `<div class="acta-pad-pie"><span class="acta-pad-estado"></span><button type="button" data-accion="borrar">Borrar</button>${m.carta ? '' : '<button type="button" data-accion="negar">Se negó a firmar</button>'}</div>`
          : '<p class="acta-pad-sin-nombre">Escribe su nombre en los datos para que pueda firmar aquí.</p>')
        + '</div>').join('');
      pads.querySelectorAll('.acta-pad').forEach(pad => {
        const i = +pad.dataset.i;
        if (!pad.querySelector('canvas')) return;
        activarPad(pad, i);
        const s = firmas[i];
        if (s && s.url) { const img = new Image(); img.onload = () => pad.querySelector('canvas').getContext('2d').drawImage(img, 0, 0); img.src = s.url; }
        estadoPad(pad, s);
      });
      actualizarBloqueo();
    }
    function borrarFirmas() {
      firmas = []; clavesFirmas = null;
      pintarFirmas();
    }
    const firmasDoc = () => firmas.map(f => f && (f.png ? { png: f.png, cuando: f.cuando } : { negada: true, cuando: f.cuando }));

    function pintarVista() {
      pintarFirmas();
      const m = modelo(val());
      const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const run = r => r.campo
        ? (r.t ? `<span class="acta-campo${r.largo ? ' acta-campo--largo' : ''}">${esc(r.t).replace(/\n/g, '<br>')}</span>` : `<span class="acta-hueco">${VACIO}</span>`)
        : esc(r.t);
      const firma = (rol, nombre, s) => `<div class="acta-firma"><span class="acta-linea">${s && s.url ? `<img class="acta-firma-img" src="${s.url}" alt="Firma de ${esc(nombre)}">` : s && s.negada ? '<span class="acta-negada">SE NEGÓ A FIRMAR</span>' : ''}</span>`
        + `${nombre ? `<span class="acta-campo">${esc(nombre)}</span>` : '<span>&nbsp;</span>'}<small>${esc(rol)}</small>`
        + (s ? `<span class="acta-sello">${s.negada ? 'Negativa asentada' : 'Firmado en pantalla'} el ${esc(s.cuando)}</span>` : '') + '</div>';
      const resumen = m.resumen ? m.resumen.flat().map(([etq, v]) => `<div><small>${esc(etq)}</small>${v ? `<span class="acta-campo">${esc(v)}</span>` : `<span class="acta-hueco">${VACIO}</span>`}</div>`).join('') : '';
      const vista = $('acta-vista');
      vista.classList.toggle('acta-vista--carta', !!m.carta);
      vista.innerHTML = (m.carta ? '' : `<header class="acta-encabezado"><img src="../assets/oxxo-logo-original.png" alt="OXXO"><div><strong>${esc(m.titulo)}</strong>${m.subtitulo ? `<em>${esc(m.subtitulo)}</em>` : ''}<span>Cadena Comercial OXXO, S.A. de C.V. · Relaciones laborales</span></div></header>`)
        + (resumen ? `<div class="acta-resumen">${resumen}</div>` : '')
        + m.parrafos.map(p => p.titulo ? `<h3>${p.runs.map(r => esc(r.t)).join('')}</h3>`
          : `<p${p.alinear ? ` style="text-align:${p.alinear}"` : ''}${p.negrita ? ' class="acta-negrita"' : ''}>${p.runs.map(run).join('')}</p>`).join('')
        + (m.carta ? '' : '<h3>FIRMAS</h3>')
        + `<div class="acta-firmas${m.firmas.length === 1 ? ' acta-firmas--una' : ''}">${m.firmas.map((f, i) => firma(f.rol, f.nombre, firmas[i])).join('')}</div>`
        + (m.nota ? `<p class="acta-nota">${esc(m.nota)}</p>` : '')
        + '<footer><span>OXXO | Uso Interno</span><span>Página 1 de 1</span></footer>';
    }
    // Muestra solo los campos del tipo elegido; los ocultos no se validan
    // ni salen en el documento (cada formato usa los suyos).
    function aplicarTipo() {
      const t = TIPOS[tipoDe(val())];
      const visibles = new Set([...CAMPOS_COMUNES, ...t.campos]);
      form.querySelectorAll('[data-campo]').forEach(el => { el.hidden = !visibles.has(el.dataset.campo); });
      form.querySelectorAll('[data-grupo]').forEach(g => {
        g.hidden = ![...g.querySelectorAll('[data-campo]')].some(el => !el.hidden);
      });
      const req = new Set(t.obligatorios);
      form.querySelectorAll('[data-campo] > label').forEach(l => {
        const campo = l.parentElement.dataset.campo;
        l.textContent = l.textContent.replace(/\s*\*$/, '') + (req.has(campo) ? ' *' : '');
      });
      $('acta-tipo-ayuda').textContent = t.carta ? 'La renuncia sale como carta del trabajador, sin membrete.' : `Se genera el formato "${t.nombre}".`;
      $('acta-enviar').textContent = 'Enviar por correo y descargar';
    }
    function tiendaElegida() {
      const v = limpio(form.elements.tienda.value).toLowerCase();
      return tiendas.find(t => t.etiqueta.toLowerCase() === v || t.tienda.toLowerCase() === v) || null;
    }
    function alCambiarTienda() {
      const t = tiendaElegida();
      if (t) {
        form.elements.tienda.value = t.tienda;
        autoLlenar('representante', t.asesor);
        // En ultimatum, retroalimentacion y hechos el AT va como primer presente.
        autoLlenar('participante1', t.asesor);
        autoLlenar('funcionP1', 'Asesor de Tienda');
      }
      const lista = t ? empleados.filter(e => e.cr === t.cr) : [];
      $('acta-empleados').innerHTML = lista.map(e => `<option value="${xml(e.nombre)}">${xml(e.puesto)}</option>`).join('');
      $('acta-tienda-ayuda').textContent = t ? `AT ${t.asesor} · ${lista.length} colaboradores en la base` : 'Escribe y elige tu tienda de la lista.';
    }
    function alCambiarTrabajador() {
      const t = tiendaElegida();
      const nombre = limpio(form.elements.trabajador.value).toLowerCase();
      const e = empleados.find(x => (!t || x.cr === t.cr) && x.nombre.toLowerCase() === nombre);
      if (e) { autoLlenar('puesto', e.puesto); autoLlenar('numEmpleado', e.numero); }
    }
    function validar() {
      const d = val();
      const falta = faltantes(d);
      if (falta.length) { avisar('Faltan datos: ' + falta.join(', ') + '.', 'error'); return null; }
      return d;
    }
    function textoFirmas() {
      const n = firmas.filter(f => f && f.png).length, neg = firmas.filter(f => f && f.negada).length;
      return (n ? ` con ${n} firma${n === 1 ? '' : 's'} en pantalla` : '') + (neg ? `${n ? ' y' : ' con'} ${neg} negativa${neg === 1 ? '' : 's'} a firmar` : '');
    }
    function descargar(d) {
      const blob = new Blob([docx(d, { logo, firmas: firmasDoc() })], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
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
      avisar(`Enviando ${TIPOS[tipoDe(d)].nombre.toLowerCase()} por correo…`, 'info');
      try {
        const cuerpo = JSON.stringify({
          action: 'enviarActa', archivo: nombreArchivo(d), docx: aBase64(docx(d, { logo, firmas: firmasDoc() })), copia: limpio(d.copia),
          tipo: TIPOS[tipoDe(d)].nombre,
          tienda: limpio(d.tienda), trabajador: limpio(d.trabajador), fecha: limpio(d.fecha),
          representante: limpio(TIPOS[tipoDe(d)].campos.includes('representante') ? d.representante : d.participante1),
          // Para el registro de actas (libro privado del Apps Script).
          // El CR ya no va en el acta, pero se sigue mandando (del catalogo) para
          // que el registro distinga tiendas con nombres parecidos.
          crTienda: (tiendaElegida() || {}).cr || '', numEmpleado: limpio(d.numEmpleado), puesto: limpio(d.puesto),
          fechaHechos: limpio(TIPOS[tipoDe(d)].campos.includes('fechaHechos') ? d.fechaHechos : d.fecha), falta: limpio(d.falta),
        });
        // text/plain evita la consulta previa de CORS que Apps Script no contesta.
        const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: cuerpo });
        const datos = await r.json().catch(() => null);
        if (!r.ok || !datos || datos.ok === false) {
          const motivo = (datos && datos.error) || 'el servidor no respondió';
          // Un Apps Script sin la accion "enviarActa" contesta "No autorizado".
          throw new Error(/no autorizado/i.test(motivo) ? 'el envío por correo aún no está activado en el Apps Script' : motivo);
        }
        const reg = datos.registro;
        const conteo = reg && reg.ok && !reg.actasEnTienda ? ' Quedó en el registro.' : reg && reg.ok
          ? ` Quedó en el registro: ${limpio(d.trabajador) || 'este documento'} lleva ${reg.actasEnTienda} documento${reg.actasEnTienda === 1 ? '' : 's'} en esta tienda`
            + (reg.mismoTipo ? ` (${reg.mismoTipo} de tipo "${TIPOS[tipoDe(d)].nombre}")` : '') + (reg.actasTotal > reg.actasEnTienda ? `, ${reg.actasTotal} en total.` : '.')
          : reg && reg.error ? ' Ojo: no se pudo guardar en el registro de actas; avisa a RH.' : '';
        avisar(`${TIPOS[tipoDe(d)].nombre} enviada a ${datos.enviadoA || 'RH'}${textoFirmas()}.${conteo} También se descargó el Word.`, reg && reg.error ? 'error' : 'ok');
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
    if (!form.elements.ciudad.value) form.elements.ciudad.value = 'Oaxaca de Juárez';
    if (!form.elements.tipo.value) form.elements.tipo.value = 'administrativa';
    aplicarTipo();
    pintarVista();
    form.elements.tipo.addEventListener('change', () => { aplicarTipo(); pintarVista(); guardarBorrador(); });

    form.addEventListener('input', () => { pintarVista(); guardarBorrador(); });
    form.elements.tienda.addEventListener('change', () => { alCambiarTienda(); pintarVista(); guardarBorrador(); });
    form.elements.trabajador.addEventListener('change', () => { alCambiarTrabajador(); pintarVista(); guardarBorrador(); });
    $('acta-descargar').addEventListener('click', () => { const d = validar(); if (d) { descargar(d); avisar(`Word descargado${textoFirmas()}. Ábrelo para imprimirlo.`, 'ok'); } });
    $('acta-firmas-editar').addEventListener('click', () => {
      if (!window.confirm('¿Borrar todas las firmas para poder corregir el documento? Tendrán que volver a firmar.')) return;
      borrarFirmas(); pintarVista(); avisar('Se borraron las firmas. Ya puedes corregir el documento.', 'info');
    });
    $('acta-enviar').addEventListener('click', e => { const d = validar(); if (d) enviar(d, e.currentTarget); });
    $('acta-limpiar').addEventListener('click', () => {
      if (!window.confirm(hayFirmas() ? '¿Borrar todos los datos y las firmas del documento?' : '¿Borrar todos los datos del documento?')) return;
      firmas = []; clavesFirmas = null; actualizarBloqueo();
      form.reset();
      try { localStorage.removeItem(BORRADOR_KEY); } catch (e) { /* sin almacenamiento */ }
      form.elements.fecha.value = iso(new Date());
      form.elements.funcion.value = 'Asesor Tienda';
      form.elements.ciudad.value = 'Oaxaca de Juárez';
      form.elements.tipo.value = 'administrativa';
      auto = {};
      aplicarTipo();
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
          const kCr = k(['Cr de tienda', 'CR de Tienda']), kNom = k(['Empleados', 'Empleado']), kPu = k(['Puesto_Correcto', 'Puesto']), kNum = k(['Nº personal', 'N personal', 'No Personal']);
          const vistos = new Set();
          empleados = filas.map(r => ({ cr: String(r[kCr] || '').trim().toUpperCase(), nombre: String(r[kNom] || '').trim(), puesto: String(r[kPu] || '').trim(), numero: kNum ? String(r[kNum] || '').trim() : '' }))
            .filter(e => e.nombre && e.cr && !vistos.has(e.cr + e.nombre) && vistos.add(e.cr + e.nombre))
            .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
        }
      } catch (e) { /* sin sugerencias de colaboradores */ }
      alCambiarTienda();
    })();
  }

  window.OXXO_ACTA = { TIPOS, modelo, docx, documentXml, nombreArchivo, faltantes, fechaPartes, crc32, montar };
})();
