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
      // Lamina hecha para el correo con los datos que ya calculo el dashboard.
      listoLamina: ['#vacantes-asesor-table tbody tr[data-asesor]', '#ranking-container .ranking-chart__row', '.plazas-chart__item', '#kpi-section .kpi-card__value'],
      lamina: (doc, fecha) => laminaEstructura(leerEstructura(doc), fecha),
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
      if (correo.lamina) {
        await esperarA(() => correo.listoLamina.every((sel) => doc.querySelector(sel)), 90000, correo.nombre);
        await esperar(800);
        avisar(`Armando la lámina de ${correo.nombre}…`);
        return [await dibujarLamina(correo.lamina(doc, new Date()))];
      }
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

  // ── Laminas para el correo ──────────────────────────────
  // Se leen los numeros tal cual los pinto el dashboard (mismos filtros por
  // defecto: mes vigente, tiendas operativas, puestos de tienda) y se dibujan
  // con un diseño hecho para leerse en el celular.
  const txt = (el) => String(el?.textContent || '').replace(/\s+/g, ' ').trim();
  const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function leerEstructura(doc) {
    const kpis = {};
    doc.querySelectorAll('#kpi-section .kpi-card').forEach((k) => {
      kpis[txt(k.querySelector('.kpi-card__label')).toLowerCase()] = { valor: txt(k.querySelector('.kpi-card__value')), nota: txt(k.querySelector('.kpi-card__delta')) };
    });
    const asesores = Array.from(doc.querySelectorAll('#vacantes-asesor-table tbody tr[data-asesor]')).map((tr) => {
      const c = tr.cells;
      const riesgo = ['alto', 'medio', 'bajo'].find((r) => tr.querySelector('.riesgo-dot')?.classList.contains(r)) || 'bajo';
      return { nombre: tr.dataset.asesor, riesgo, vacantes: Number(txt(c[1])) || 0, prom: txt(c[2]), max: txt(c[3]), d3: txt(c[4]), d6: txt(c[5]), dMas: txt(c[6]) };
    });
    const pie = doc.querySelector('#vacantes-asesor-table tfoot tr');
    const total = pie ? { vacantes: txt(pie.cells[1]), prom: txt(pie.cells[2]), max: txt(pie.cells[3]), d3: txt(pie.cells[4]), d6: txt(pie.cells[5]), dMas: txt(pie.cells[6]) } : null;
    const tiendas = Array.from(doc.querySelectorAll('#ranking-container .ranking-chart__row')).map((r) => ({ tienda: txt(r.querySelector('.ranking-chart__label')), vacantes: Number(txt(r.querySelector('strong'))) || 0 }));
    const empate = txt(doc.querySelector('#ranking-container .ranking-empate'));
    const plazas = Array.from(doc.querySelectorAll('.plazas-chart__item')).map((p) => ({
      plaza: txt(p.querySelector('span')).replace(/Activa$/, '').trim(), vacantes: Number(txt(p.querySelector('strong'))) || 0,
      tiendas: txt(p.querySelector('small')), activa: p.classList.contains('is-active') || /oaxaca/i.test(txt(p.querySelector('span'))),
    }));
    const mes = txt(doc.querySelector('#filtro-mes option:checked'));
    return { kpis, asesores, total, tiendas, empate, plazas, mes };
  }

  const nombreCorto = (n) => {
    const p = String(n).split(/\s+/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
    return p.length > 2 ? `${p[0]} ${p[1]} ${p[2].charAt(0)}.` : p.join(' ');
  };
  const chip = (v, color) => (v && v !== '—' && v !== '0') ? `<span class="lam-chip lam-chip--${color}">${esc(v)}</span>` : '<span class="lam-nada">—</span>';

  function laminaEstructura(d, fecha) {
    const k = (n) => d.kpis[n] || { valor: '—', nota: '' };
    const total = k('total vacantes'), antigua = k('vacante más antigua');
    const maxA = Math.max(1, ...d.asesores.map((a) => a.vacantes));
    const maxP = Math.max(1, ...d.plazas.map((p) => p.vacantes));
    const maxT = Math.max(1, ...d.tiendas.map((t) => t.vacantes));
    const filas = d.asesores.map((a) => `<tr>
        <td><span class="lam-punto lam-punto--${a.riesgo}"></span>${esc(nombreCorto(a.nombre))}</td>
        <td class="lam-vac"><b>${a.vacantes}</b><span class="lam-barra"><i class="lam-barra--${a.riesgo}" style="width:${Math.max(8, Math.round(a.vacantes / maxA * 100))}%"></i></span></td>
        <td>${esc(a.prom)}</td><td>${esc(a.max)}</td>
        <td>${chip(a.d3, 'verde')}</td><td>${chip(a.d6, 'ambar')}</td><td>${chip(a.dMas, 'rojo')}</td>
      </tr>`).join('');
    return `
      <div class="lam">
        <header class="lam-cab">
          <div><span class="lam-cab__eti">Plaza Oaxaca · Recursos Humanos</span><h1>Estructura del día</h1><span class="lam-cab__fecha">${dd(fecha)} de ${MESES[fecha.getMonth()].toLowerCase()} de ${fecha.getFullYear()}</span></div>
          <div class="lam-cab__total"><b>${esc(total.valor)}</b><span>vacantes abiertas</span></div>
        </header>
        <section class="lam-kpis">
          <div><i></i><small>Asesores afectados</small><b>${esc((total.nota.match(/\d+/) || ['—'])[0])}</b></div>
          <div class="lam-kpis--rojo"><i></i><small>Líder</small><b>${esc(k('lider').valor)}</b></div>
          <div class="lam-kpis--naranja"><i></i><small>Encargado</small><b>${esc(k('encargado').valor)}</b></div>
          <div class="lam-kpis--ambar"><i></i><small>Ayudante</small><b>${esc(k('ayudante').valor)}</b></div>
          <div><i></i><small>Más antigua</small><b>${esc(antigua.valor)}<em> días</em></b><span>${esc(antigua.nota.replace(/^días ·\s*/, ''))}</span></div>
        </section>
        <section class="lam-caja">
          <h2>Vacantes por asesor</h2>
          <table class="lam-tabla">
            <thead><tr><th>Asesor</th><th>Vacantes</th><th>Días prom.</th><th>Días máx.</th><th>≤3 d</th><th>≤6 d</th><th>&gt;6 d</th></tr></thead>
            <tbody>${filas}</tbody>
            ${d.total ? `<tfoot><tr><td>Total</td><td class="lam-vac"><b>${esc(d.total.vacantes)}</b></td><td>${esc(d.total.prom)}</td><td>${esc(d.total.max)}</td><td>${esc(d.total.d3)}</td><td>${esc(d.total.d6)}</td><td>${esc(d.total.dMas)}</td></tr></tfoot>` : ''}
          </table>
        </section>
        <div class="lam-dos">
          <section class="lam-caja">
            <h2>Tiendas con más vacantes</h2>
            ${d.tiendas.map((t, i) => `<div class="lam-top"><span class="lam-top__n">${i + 1}</span><div><b>${esc(t.tienda.replace(/^OXXO\s+/i, ''))}</b><span class="lam-barra"><i class="lam-barra--alto" style="width:${Math.max(8, Math.round(t.vacantes / maxT * 100))}%"></i></span></div><strong>${t.vacantes}</strong></div>`).join('')}
            ${d.empate ? `<p class="lam-nota">${esc(d.empate)}</p>` : ''}
          </section>
          <section class="lam-caja">
            <h2>Vacantes por plaza · Región</h2>
            ${d.plazas.map((p) => `<div class="lam-plaza${p.activa ? ' is-activa' : ''}"><span>${esc(p.plaza)}</span><span class="lam-barra"><i style="width:${Math.max(6, Math.round(p.vacantes / maxP * 100))}%"></i></span><b>${p.vacantes}</b></div>`).join('')}
          </section>
        </div>
        <footer class="lam-pie">Dashboard 1 · Vacantes Diarias · dashboardsoxxo.plaza-oaxaca.workers.dev</footer>
      </div>`;
  }

  const ESTILOS_LAMINA = `
    .lam{width:1100px;padding:28px;background:#f7f2ec;font-family:'Barlow',Arial,sans-serif;color:#231815;box-sizing:border-box}
    .lam *{box-sizing:border-box}
    .lam h1,.lam h2,.lam b,.lam strong{font-family:'Barlow Condensed','Barlow',Arial,sans-serif}
    .lam-cab{display:flex;justify-content:space-between;align-items:center;padding:24px 30px;border-radius:24px;background:linear-gradient(120deg,#d91f2d,#f2412a);color:#fff}
    .lam-cab__eti{font-size:15px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;opacity:.9}
    .lam-cab h1{margin:4px 0;font-size:46px;line-height:1;font-weight:800}
    .lam-cab__fecha{font-size:18px;font-weight:600}
    .lam-cab__total{text-align:right}
    .lam-cab__total b{display:block;font-size:88px;line-height:.9;font-weight:800}
    .lam-cab__total span{font-size:18px;font-weight:600}
    .lam-kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin:16px 0}
    .lam-kpis>div{position:relative;overflow:hidden;padding:18px 16px 14px;border-radius:18px;background:#fff;border:1px solid #eadfd6}
    .lam-kpis i{position:absolute;left:0;right:0;top:0;height:6px;background:#c9bdb3}
    .lam-kpis small{display:block;font-size:13px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#7a6a63}
    .lam-kpis b{display:block;font-size:40px;line-height:1.05;font-weight:800}
    .lam-kpis b em{font-size:18px;font-style:normal;font-weight:700}
    .lam-kpis span{display:block;font-size:13px;font-weight:600;color:#7a6a63}
    .lam-kpis--rojo i{background:#d91f2d}.lam-kpis--naranja i{background:#e2711d}.lam-kpis--ambar i{background:#e8b004}
    .lam-caja{padding:18px 20px;border-radius:20px;background:#fff;border:1px solid #eadfd6}
    .lam-caja h2{margin:0 0 12px;font-size:24px;font-weight:800}
    .lam-tabla{width:100%;border-collapse:collapse;font-size:17px}
    .lam-tabla th{padding:8px 10px;background:#f6efe8;color:#7a6a63;font-size:13px;letter-spacing:.05em;text-transform:uppercase;text-align:center}
    .lam-tabla th:first-child,.lam-tabla td:first-child{text-align:left}
    .lam-tabla td{padding:9px 10px;border-bottom:1px solid #f0e7df;text-align:center}
    .lam-tabla tfoot td{border-top:3px solid #231815;border-bottom:0;font-weight:800;background:#f6efe8}
    .lam-vac{display:flex;align-items:center;gap:10px;justify-content:flex-start}
    .lam-vac b{width:26px;font-size:22px;text-align:right}
    .lam-barra{display:block;flex:1;height:10px;min-width:60px;border-radius:9px;background:#efe6de;overflow:hidden}
    .lam-barra i{display:block;height:100%;border-radius:9px;background:#9a8d86}
    .lam-barra--alto{background:#d91f2d!important}.lam-barra--medio{background:#c08a00!important}.lam-barra--bajo{background:#1f8a4c!important}
    .lam-punto{display:inline-block;width:10px;height:10px;margin-right:9px;border-radius:50%}
    .lam-punto--alto{background:#d91f2d}.lam-punto--medio{background:#c08a00}.lam-punto--bajo{background:#1f8a4c}
    .lam-chip{display:inline-block;min-width:30px;padding:3px 9px;border-radius:9px;font-weight:800}
    .lam-chip--verde{background:#e3f5ea;color:#157a49}.lam-chip--ambar{background:#fff3d6;color:#9a6400}.lam-chip--rojo{background:#fde4e4;color:#b5121b}
    .lam-nada{color:#b9aea6}
    .lam-dos{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px}
    .lam-top{display:grid;grid-template-columns:34px 1fr 40px;align-items:center;gap:10px;margin-bottom:12px}
    .lam-top__n{display:grid;place-items:center;width:30px;height:30px;border-radius:9px;background:#fde4e4;color:#b5121b;font-weight:800}
    .lam-top b{display:block;margin-bottom:5px;font-size:18px}
    .lam-top strong{font-size:28px;text-align:right}
    .lam-nota{margin:4px 0 0;font-size:14px;color:#7a6a63;font-weight:600}
    .lam-plaza{display:grid;grid-template-columns:110px 1fr 40px;align-items:center;gap:10px;margin-bottom:11px;font-size:17px;font-weight:600}
    .lam-plaza b{font-size:24px;text-align:right}
    .lam-plaza.is-activa span:first-child{color:#d91f2d;font-weight:800}
    .lam-plaza.is-activa .lam-barra i{background:#d91f2d}
    .lam-pie{margin-top:14px;text-align:center;font-size:13px;color:#9a8d86;font-weight:600}
  `;

  async function dibujarLamina(html) {
    if (!window.html2canvas) {
      await new Promise((ok, mal) => { const s = document.createElement('script'); s.src = HTML2CANVAS; s.onload = ok; s.onerror = () => mal(new Error('No cargó html2canvas')); document.head.appendChild(s); });
    }
    const caja = document.createElement('div');
    caja.style.cssText = 'position:fixed;left:-20000px;top:0';
    caja.innerHTML = `<style>${ESTILOS_LAMINA}</style>${html}`;
    document.body.appendChild(caja);
    try {
      if (document.fonts?.ready) await document.fonts.ready;
      const lienzo = await window.html2canvas(caja.querySelector('.lam'), { backgroundColor: '#f7f2ec', scale: 2, logging: false });
      const blob = await new Promise((r) => lienzo.toBlob(r, 'image/png'));
      return { blob, ancho: Math.round(lienzo.width / 2) };
    } finally {
      caja.remove();
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

  window.OXXO_CORREOS = { CORREOS, armarEml, capturar, leerEstructura, laminaEstructura, dibujarLamina };
})();
