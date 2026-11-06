/* Consumido por: admin.html (tarjeta "Correos del día", pestaña Cargar y Publicar). */
/* ==========================================================
   CORREOS DEL DIA: Estructura, Bajas y Aprovechamiento

   Arma el mismo correo que se manda a mano cada dia y lo entrega como un
   archivo .eml que el Outlook clasico abre como un correo nuevo, ya listo
   (X-Unsent: 1): Para y CC, asunto con la fecha, banner, saludo, las
   tarjetas del dashboard ya actualizado como imagenes y el Excel adjunto.
   Solo falta dar Enviar: sale de la cuenta de Outlook de quien lo abre
   (angel.franco@oxxo.com) y queda en sus Enviados.

   Las imagenes se toman del dashboard real: se abre en un iframe oculto del
   mismo sitio con ?fresco=1 (core.js le pide al Worker no usar su cache de
   /api, para que salga lo recien publicado) y se capturan con html2canvas,
   igual que el boton PNG de los dashboards.

   El Excel adjunto es el ultimo que se publico en esta pestaña para ese
   dashboard (evento oxxo:base-publicada de publishers.js); si no hay, se
   elige a mano.
   ========================================================== */
(function () {
  'use strict';

  const HTML2CANVAS = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
  const PARA = ['AsesoresPlazaOaxaca@femcom.onmicrosoft.com'];
  const RH = 'RecursosHumanosOaxaca@femcom.onmicrosoft.com';
  const MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];

  const dd = (d) => String(d.getDate()).padStart(2, '0');
  const mm = (d) => String(d.getMonth() + 1).padStart(2, '0');
  const fechaCorta = (d) => `${dd(d)}/${mm(d)}/${d.getFullYear()}`;
  const fechaLarga = (d) => `${dd(d)}/${MESES[d.getMonth()]}/${d.getFullYear()}`;
  const fechaTexto = (d) => `${dd(d)} de ${MESES[d.getMonth()].toLowerCase()}`;

  // Cada correo: dashboard de donde salen las imagenes, que tarjetas, y el
  // texto tal cual se manda hoy.
  const CORREOS = [
    {
      id: 'estructura', dashboard: 'd1', nombre: 'Estructura',
      pagina: 'dashboards/dashboard-1.html',
      cc: [RH, 'hector.ramirez@oxxo.com', 'justo.valencia@oxxo.com', 'manuel.hernandezdejesus@oxxo.com'],
      asunto: (d) => `ESTRUCTURA PLAZA OAXACA ${fechaLarga(d)}`,
      saludo: (d) => `<p><b>¡Buen día, equipo! 👋</b></p><p>Les comparto la estructura correspondiente al día <b>${fechaCorta(d)}</b>.</p><p><b>¡Mucho éxito, equipo! Vamos con todo. 🎯</b></p>`,
      capturas: [{ selector: '.row-main', listo: '#vacantes-asesor-table table, #vacantes-asesor-table .va-table' }],
    },
    {
      id: 'bajas', dashboard: 'd2', nombre: 'Bajas',
      pagina: 'dashboards/dashboard-2.html',
      cc: [RH, 'yesenia.chavez@oxxo.com', 'justo.valencia@oxxo.com'],
      asunto: (d) => `BAJAS PLAZA OAXACA ${fechaLarga(d)}`,
      saludo: () => `<p><b>¡Buen día, equipo! 👋</b></p><p>Comparto el tablero ABC correspondiente a las bajas, con información actualizada, para su revisión y seguimiento.</p><p><b>¡Gracias por su atención y compromiso! 💪</b></p>`,
      capturas: [
        { selector: '#d2-analysis-panels', listo: '#tabla-compromiso table' },
        { selector: 'section.d2-plazas', listo: '#d2-plazas-summary *' },
      ],
    },
    {
      id: 'aprovechamiento', dashboard: 'd3', nombre: 'Aprovechamiento',
      pagina: 'dashboards/dashboard-3.html',
      cc: [RH, 'justo.valencia@oxxo.com'],
      asunto: (d) => `APROVECHAMIENTO ESTRUCTURA PLAZA OAXACA CORRESPONDIENTE AL ${fechaCorta(d)}`,
      saludo: (d) => `<p><b>¡Buen día, equipo! 👋</b></p><p>Adjunto el concentrado de <b>Aprovechamiento de Estructura correspondiente al ${fechaTexto(d)}</b>.</p>`,
      capturas: [
        { selector: '#plaza-ec-row', listo: '#tabla-ec-at *' },
        // Las tiendas que no llegan a equipo completo (cuentan 0%): la misma
        // tabla que sale al tocar el KPI de incompletas.
        { selector: '#detalle-card', listo: '#tabla-detalle table', preparar: (win) => win.setKpiEstatus && win.setKpiEstatus('incompleto'), todasLasFilas: true },
      ],
    },
  ];

  const archivos = {}; // dashboard -> File del ultimo Excel publicado

  // ── Utilidades ──────────────────────────────────────────
  const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
  async function esperarA(cond, ms, que) {
    const fin = Date.now() + ms;
    while (Date.now() < fin) {
      try { if (cond()) return; } catch (_) { /* aun no */ }
      await esperar(400);
    }
    throw new Error(`No terminó de cargar: ${que}`);
  }
  const b64 = (texto) => btoa(unescape(encodeURIComponent(texto)));
  const enLineas = (s) => s.replace(/.{1,76}/g, '$&\r\n');
  const cabecera = (texto) => /^[\x20-\x7e]*$/.test(texto) ? texto : `=?UTF-8?B?${b64(texto)}?=`;
  async function aBase64(blob) {
    const buf = new Uint8Array(await blob.arrayBuffer());
    let s = '';
    for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return btoa(s);
  }
  async function imagenDelSitio(ruta) {
    const r = await fetch(ruta, { cache: 'no-store' });
    if (!r.ok) return null;
    return r.blob();
  }

  // ── Captura del dashboard en un iframe oculto ───────────
  async function capturar(correo, avisar) {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText = 'position:fixed;left:-10000px;top:0;width:1600px;height:2400px;border:0;visibility:hidden';
    iframe.src = `${correo.pagina}?fresco=1&_=${Date.now()}`;
    document.body.appendChild(iframe);
    try {
      await new Promise((ok, mal) => { iframe.onload = ok; iframe.onerror = () => mal(new Error('No abrió el dashboard')); });
      const win = iframe.contentWindow, doc = iframe.contentDocument;
      avisar(`Cargando ${correo.nombre} con los datos nuevos…`);
      for (const c of correo.capturas) {
        await esperarA(() => doc.querySelector(c.selector) && doc.querySelector(c.listo), 90000, correo.nombre);
      }
      if (!win.html2canvas) {
        await new Promise((ok, mal) => { const s = doc.createElement('script'); s.src = HTML2CANVAS; s.onload = ok; s.onerror = () => mal(new Error('No cargó html2canvas')); doc.head.appendChild(s); });
      }
      const imagenes = [];
      for (const c of correo.capturas) {
        if (c.preparar) { c.preparar(win); await esperarA(() => doc.querySelector(c.listo), 30000, correo.nombre); }
        await esperar(1800); // animaciones de barras y graficas
        const el = doc.querySelector(c.selector);
        if (c.todasLasFilas) mostrarTodasLasFilas(el);
        avisar(`Tomando imágenes de ${correo.nombre}…`);
        imagenes.push(await fotografiar(win, doc, el));
      }
      return imagenes;
    } finally {
      iframe.remove();
    }
  }

  // Las tablas con buscador (rh-table-tools) paginan; para el correo van todas.
  function mostrarTodasLasFilas(el) {
    el.querySelectorAll('tbody tr').forEach((tr) => { tr.hidden = false; tr.style.display = ''; });
    el.querySelectorAll('.rh-table-toolbar').forEach((t) => { t.style.display = 'none'; });
    el.querySelectorAll('.tbl-wrap, .table-wrapper').forEach((w) => { w.style.maxHeight = 'none'; w.style.overflow = 'visible'; });
  }

  async function fotografiar(win, doc, el) {
    // Igual que el PNG de core.js: las graficas (canvas) se cambian por su
    // imagen y se apaga el desenfoque, que html2canvas no sabe pintar.
    const cambios = Array.from(el.querySelectorAll('canvas')).map((cv) => {
      const img = doc.createElement('img');
      img.src = cv.toDataURL('image/png');
      img.width = cv.clientWidth || cv.width; img.height = cv.clientHeight || cv.height;
      img.className = cv.className; img.style.cssText = cv.style.cssText;
      cv.parentNode.insertBefore(img, cv); cv.style.display = 'none';
      return () => { img.remove(); cv.style.display = ''; };
    });
    try {
      const lienzo = await win.html2canvas(el, {
        backgroundColor: '#f7f4f0', scale: 2, useCORS: true, logging: false,
        ignoreElements: (n) => n?.classList?.contains('info-tip') || n?.classList?.contains('png-export-ui'),
        onclone: (copia) => copia.querySelectorAll('*').forEach((n) => { n.style.backdropFilter = 'none'; n.style.webkitBackdropFilter = 'none'; }),
      });
      const blob = await new Promise((r) => lienzo.toBlob(r, 'image/png'));
      return { blob, ancho: Math.round(lienzo.width / 2) };
    } finally {
      cambios.forEach((f) => f());
    }
  }

  // ── El correo (.eml) ────────────────────────────────────
  async function armarEml(correo, imagenes, archivo, fecha) {
    const limite = 'oxxo_mixed_' + Date.now().toString(36), rel = 'oxxo_rel_' + Date.now().toString(36);
    const partes = [];
    const [banner, firma] = await Promise.all([imagenDelSitio('assets/correo/banner.png'), imagenDelSitio('assets/correo/firma.png')]);
    const img = (cid, ancho) => `<p style="margin:12px 0"><img src="cid:${cid}" width="${ancho}" style="display:block;width:${ancho}px;max-width:100%;height:auto;border:0" alt=""></p>`;
    const cuerpo = [
      banner ? `<p style="margin:0 0 8px"><img src="cid:banner" width="420" style="display:block;width:420px;height:auto;border:0" alt=""></p>` : '',
      correo.saludo(fecha),
      ...imagenes.map((im, i) => img(`captura${i + 1}`, Math.min(900, im.ancho))),
      `<p style="font-family:'Courier New',monospace"><b><i>!!Saludos Cordiales!!</i></b></p>`,
      firma ? `<p style="margin:8px 0 0"><img src="cid:firma" width="620" style="display:block;width:620px;height:auto;border:0" alt=""></p>` : '',
    ].join('\n');
    const html = `<html><head><meta charset="utf-8"></head><body style="font-family:Aptos,Calibri,Arial,sans-serif;font-size:11pt;color:#111">${cuerpo}</body></html>`;

    partes.push(`--${rel}\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${enLineas(b64(html))}`);
    const inline = async (cid, blob) => partes.push(`--${rel}\r\nContent-Type: image/png; name="${cid}.png"\r\nContent-Transfer-Encoding: base64\r\nContent-ID: <${cid}>\r\nContent-Disposition: inline; filename="${cid}.png"\r\n\r\n${enLineas(await aBase64(blob))}`);
    if (banner) await inline('banner', banner);
    for (let i = 0; i < imagenes.length; i++) await inline(`captura${i + 1}`, imagenes[i].blob);
    if (firma) await inline('firma', firma);

    const lineas = [
      'X-Unsent: 1',
      `To: ${PARA.join(', ')}`,
      `Cc: ${correo.cc.join(', ')}`,
      `Subject: ${cabecera(correo.asunto(fecha))}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/mixed; boundary="${limite}"`,
      '',
      `--${limite}`,
      `Content-Type: multipart/related; boundary="${rel}"; type="text/html"`,
      '',
      ...partes,
      `--${rel}--`,
    ];
    if (archivo) {
      const tipo = archivo.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      const nombre = cabecera(archivo.name);
      lineas.push(`--${limite}`, `Content-Type: ${tipo}; name="${nombre}"`, 'Content-Transfer-Encoding: base64', `Content-Disposition: attachment; filename="${nombre}"`, '', enLineas(await aBase64(archivo)));
    }
    lineas.push(`--${limite}--`, '');
    return new Blob([lineas.join('\r\n')], { type: 'message/rfc822' });
  }

  function descargar(blob, nombre) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  }

  // ── Tarjeta del panel ───────────────────────────────────
  function pintar(raiz) {
    raiz.innerHTML = `
      <span class="admin-eyebrow">Recursos Humanos · Outlook</span>
      <h2>Correos del día</h2>
      <p style="color:var(--ap-muted);font-size:13px;font-weight:600;margin:0 0 14px">Después de publicar Estructura, Bajas o Aprovechamiento, prepara su correo: se descarga un archivo que el <strong>Outlook clásico</strong> abre como correo nuevo con destinatarios, asunto, imágenes del dashboard actualizado y el Excel adjunto. Solo revisa y da <strong>Enviar</strong>.</p>
      <div class="correos-dia">${CORREOS.map((c) => `
        <div class="correos-dia__fila" data-correo="${c.id}">
          <div><strong>${c.nombre}</strong><small data-archivo>Sin Excel todavía: publica la base o elige el archivo.</small></div>
          <label class="admin-btn secondary correos-dia__elegir">Elegir Excel<input type="file" accept=".xlsx,.xls,.xlsm,.csv" hidden></label>
          <button class="admin-btn primary" type="button" data-preparar>Preparar correo</button>
          <p class="correos-dia__estado" data-estado role="status" aria-live="polite"></p>
        </div>`).join('')}
      </div>`;
    CORREOS.forEach((c) => {
      const fila = raiz.querySelector(`[data-correo="${c.id}"]`);
      const estado = fila.querySelector('[data-estado]');
      const etiqueta = fila.querySelector('[data-archivo]');
      const mostrarArchivo = () => {
        const f = archivos[c.dashboard];
        etiqueta.textContent = f ? `Adjunto: ${f.name} (${(f.size / 1024 / 1024).toFixed(1)} MB)` : 'Sin Excel todavía: publica la base o elige el archivo.';
      };
      c.refrescar = mostrarArchivo;
      fila.querySelector('input[type=file]').addEventListener('change', (e) => { if (e.target.files[0]) { archivos[c.dashboard] = e.target.files[0]; mostrarArchivo(); } });
      fila.querySelector('[data-preparar]').addEventListener('click', async (e) => {
        const boton = e.currentTarget;
        const archivo = archivos[c.dashboard];
        if (!archivo && !confirm(`No hay Excel para adjuntar al correo de ${c.nombre}. ¿Prepararlo sin adjunto?`)) return;
        boton.disabled = true;
        estado.dataset.tipo = '';
        try {
          const fecha = new Date();
          const imagenes = await capturar(c, (t) => { estado.textContent = t; });
          estado.textContent = 'Armando el correo…';
          const eml = await armarEml(c, imagenes, archivo, fecha);
          descargar(eml, `${c.nombre} ${dd(fecha)}.${mm(fecha)}.${fecha.getFullYear()}.eml`);
          estado.dataset.tipo = 'ok';
          estado.textContent = 'Listo: abre el archivo descargado, revisa el correo en Outlook y da Enviar.';
        } catch (error) {
          estado.dataset.tipo = 'error';
          estado.textContent = `No se pudo preparar: ${error.message || error}`;
        } finally {
          boton.disabled = false;
        }
      });
    });
  }

  window.addEventListener('oxxo:base-publicada', (e) => {
    const { key, file } = e.detail || {};
    if (!file) return;
    archivos[key] = file;
    CORREOS.filter((c) => c.dashboard === key).forEach((c) => c.refrescar && c.refrescar());
  });

  function iniciar() {
    const raiz = document.getElementById('correos-dia');
    if (raiz) pintar(raiz);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();

  window.OXXO_CORREOS = { CORREOS, armarEml, capturar };
})();
