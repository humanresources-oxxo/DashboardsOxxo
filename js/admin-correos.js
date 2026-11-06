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
      listoLamina: ['#tabla-compromiso table tbody tr', '#tabla-plazas .plaza-rank-row', '#kpi-section .kpi-card__value'],
      lamina: async (doc, fecha, win) => laminaBajas(await leerBajas(doc, win), fecha),
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
        return [await dibujarLamina(await correo.lamina(doc, new Date(), win))];
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

  // Mismo lenguaje visual que la Ficha de Plaza (dashboards/ficha-plaza.html):
  // pildora roja, liston rojo/amarillo, tarjetas con anillo y tabla con
  // columnas agrupadas. En diciembre lleva adornos navideños (navidad=true).
  const anillo = (partes, centro, tam = 104, grosor = 13) => {
    const r = (tam - grosor) / 2, c = 2 * Math.PI * r;
    const total = partes.reduce((x, p) => x + p.valor, 0) || 1;
    let off = 0;
    const arcos = partes.filter((p) => p.valor > 0).map((p) => {
      const largo = c * p.valor / total;
      const arco = `<circle cx="${tam / 2}" cy="${tam / 2}" r="${r}" fill="none" stroke="${p.color}" stroke-width="${grosor}" stroke-dasharray="${largo} ${c - largo}" stroke-dashoffset="${-off}" transform="rotate(-90 ${tam / 2} ${tam / 2})"/>`;
      off += largo;
      return arco;
    }).join('');
    return `<svg viewBox="0 0 ${tam} ${tam}" width="${tam}" height="${tam}"><circle cx="${tam / 2}" cy="${tam / 2}" r="${r}" fill="none" stroke="#efe7df" stroke-width="${grosor}"/>${arcos}<text x="50%" y="50%" dy=".35em" text-anchor="middle" font-size="30" font-weight="800" fill="#241a17" font-family="Plus Jakarta Sans, Arial">${esc(centro)}</text></svg>`;
  };
  const num = (v) => Number(String(v).replace(/[^\d.]/g, '')) || 0;
  // Nombres como vienen; solo los que llegan todo en mayusculas o minusculas
  // se pasan a nombre propio (sin romper acentos: "Márquez", no "MáRquez").
  const nombrePropio = (v) => {
    const t = String(v || '').trim();
    if (t !== t.toUpperCase() && t !== t.toLowerCase()) return t;
    return t.toLowerCase().split(/(\s+)/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
  };

  // Adornos: tira de foquitos arriba, rama de acebo en el liston y un fondo
  // apenas tenido de rojo y verde.
  const FOQUITOS = (() => {
    const colores = ['#e30613', '#1f7a4a', '#f6c400', '#2f7fd8'];
    let cable = 'M0 10', focos = '';
    for (let i = 0; i < 34; i++) {
      const x0 = i * 48, x1 = x0 + 48;
      cable += ` Q${x0 + 24} 30 ${x1} 10`;
      const x = x0 + 24;
      focos += `<rect x="${x - 4}" y="19" width="8" height="6" rx="1.5" fill="#6b5d55"/><ellipse cx="${x}" cy="33" rx="7" ry="10" fill="${colores[i % 4]}"/><ellipse cx="${x - 2}" cy="30" rx="2" ry="3.5" fill="rgba(255,255,255,.65)"/>`;
    }
    return `<svg class="lm-foquitos" viewBox="0 0 1632 48" width="1632" height="48"><path d="${cable}" fill="none" stroke="#3b5a3a" stroke-width="2.2"/>${focos}</svg>`;
  })();
  const ACEBO = `<svg class="lm-acebo" viewBox="0 0 120 70" width="120" height="70"><path d="M60 38 C40 20 18 22 6 36 C22 34 30 44 34 56 C42 44 52 42 60 38Z" fill="#1f7a4a"/><path d="M60 38 C80 20 102 22 114 36 C98 34 90 44 86 56 C78 44 68 42 60 38Z" fill="#2c9a5f"/><circle cx="52" cy="36" r="9" fill="#e30613"/><circle cx="66" cy="32" r="9" fill="#c4070f"/><circle cx="60" cy="46" r="9" fill="#e30613"/><circle cx="49" cy="33" r="2.6" fill="rgba(255,255,255,.7)"/></svg>`;

  // Misma ventana que js/temporada.js: del 1 de noviembre al 6 de enero.
  const enTemporadaNavidad = (f) => f.getMonth() === 10 || f.getMonth() === 11 || (f.getMonth() === 0 && f.getDate() <= 6);

  function laminaEstructura(d, fecha, navidad = enTemporadaNavidad(fecha)) {
    const k = (n) => d.kpis[n] || { valor: '—', nota: '' };
    const total = num(k('total vacantes').valor), lider = num(k('lider').valor), enc = num(k('encargado').valor), ayu = num(k('ayudante').valor);
    const antigua = k('vacante más antigua');
    const asesores = num((k('total vacantes').nota.match(/\d+/) || [0])[0]);
    const t = d.total || {};
    const d3 = num(t.d3), d6 = num(t.d6), dMas = num(t.dMas);
    const maxA = Math.max(1, ...d.asesores.map((a) => a.vacantes));
    const maxP = Math.max(1, ...d.plazas.map((p) => p.vacantes));
    const plazas = d.plazas.slice().sort((x, y) => y.vacantes - x.vacantes);
    const totalRegion = plazas.reduce((x, p) => x + p.vacantes, 0) || 1;
    const corte = `${dd(fecha)} ${MESES[fecha.getMonth()].slice(0, 3)} ${fecha.getFullYear()}`;
    const celda = (v, tipo) => (v && v !== '—' && v !== '0') ? `<span class="lm-chip lm-chip--${tipo}">${esc(v)}</span>` : '<span class="lm-nada">—</span>';
    const filas = d.asesores.map((a) => {
      const foco = a.dMas && a.dMas !== '—';
      return `<tr>
        <td class="lm-asesor">${foco ? '<b>' : ''}${esc(nombrePropio(a.nombre))}${foco ? '</b> <span class="lm-foco">FOCO</span>' : ''}</td>
        <td class="lm-vac"><b>${a.vacantes}</b><span class="lm-track"><span class="lm-bar lm-bar--${a.riesgo}" style="width:${Math.max(6, Math.round(a.vacantes / maxA * 100))}%"></span></span></td>
        <td class="${num(a.prom) >= 6 ? 'lm-rojo' : ''}">${esc(a.prom)}</td><td>${esc(a.max)}</td>
        <td>${celda(a.d3, 'verde')}</td><td>${celda(a.d6, 'ambar')}</td><td>${celda(a.dMas, 'rojo')}</td>
      </tr>`;
    }).join('');
    return `
      <div class="lm${navidad ? ' lm--navidad' : ''}">
        ${navidad ? FOQUITOS : ''}
        <header class="lm-cab">
          <span class="lm-pill">Plaza Oaxaca</span>
          <span class="lm-sub">Estructura del día · Vacantes · Corte ${esc(corte)}</span>
          <span class="lm-liston"><svg viewBox="0 0 700 90" width="600" height="90" preserveAspectRatio="none"><path d="M10 52 C120 10 230 10 350 46 S580 86 690 30" fill="none" stroke="#e30613" stroke-width="30" stroke-linecap="round"/><path d="M10 66 C120 26 230 26 350 62 S580 100 690 46" fill="none" stroke="#f6c400" stroke-width="12" stroke-linecap="round"/></svg>${navidad ? ACEBO : ''}</span>
        </header>
        <section class="lm-kpis">
          <div class="lm-kpi">${anillo([{ valor: lider, color: '#e30613' }, { valor: enc, color: '#f28c18' }, { valor: ayu, color: '#f6c400' }], total)}
            <div><b>VACANTES TOTALES</b><small><i style="background:#e30613"></i>${lider} Líder <i style="background:#f28c18"></i>${enc} Enc. <i style="background:#f6c400"></i>${ayu} Ayud.</small></div></div>
          <div class="lm-kpi">${anillo([{ valor: d3, color: '#1f7a4a' }, { valor: d6, color: '#f6c400' }, { valor: dMas, color: '#e30613' }], esc(t.prom || '—'))}
            <div><b>ANTIGÜEDAD PROMEDIO</b><small><i style="background:#1f7a4a"></i>${d3} ≤3 d <i style="background:#f6c400"></i>${d6} ≤6 d <i style="background:#e30613"></i>${dMas} &gt;6 d</small></div></div>
          <div class="lm-kpi"><span class="lm-num">${esc(antigua.valor)}</span>
            <div><b>VACANTE MÁS ANTIGUA</b><small>días · ${esc(nombrePropio(antigua.nota.replace(/^días ·\s*/, '')))}</small></div></div>
          <div class="lm-kpi"><span class="lm-num lm-rojo">${asesores}</span>
            <div><b>ASESORES CON VACANTES</b><small>tiendas operativas</small></div></div>
        </section>
        <div class="lm-cuerpo">
          <section class="lm-card">
            <h2>Vacantes por asesor</h2>
            <table class="lm-tabla">
              <thead>
                <tr class="lm-grupos"><th></th><th><span>VACANTES</span></th><th colspan="5"><span>ANTIGÜEDAD</span></th></tr>
                <tr><th>ASESOR</th><th>VACANTES</th><th>DÍAS PROM.</th><th>DÍAS MÁX.</th><th>≤3 D</th><th>≤6 D</th><th>&gt;6 D</th></tr>
              </thead>
              <tbody>${filas}</tbody>
              <tfoot><tr><td>Total plaza</td><td class="lm-vac"><b>${esc(t.vacantes || total)}</b></td><td>${esc(t.prom || '—')}</td><td>${esc(t.max || '—')}</td><td class="lm-verde">${d3}</td><td class="lm-oro">${d6}</td><td class="lm-rojo">${dMas}</td></tr></tfoot>
            </table>
            <p class="lm-leyenda"><span class="lm-foco">FOCO</span> asesor con al menos una vacante de más de 6 días · Días prom. en rojo: 6 o más.</p>
          </section>
          <section class="lm-card">
            <h2>Comparativo por plaza</h2>
            ${plazas.map((p, i) => `<div class="lm-plaza${p.activa ? ' propia' : ''}">
              <div class="lm-plaza-cab"><span class="lm-rank">${i + 1}</span><b>${esc(p.plaza)}</b>${p.activa ? `<small>${Math.round(p.vacantes / totalRegion * 100)}% DE LAS VACANTES</small>` : ''}</div>
              <div class="lm-fila"><span>VACANTES</span><span class="lm-track"><span class="lm-bar" style="width:${Math.max(6, Math.round(p.vacantes / maxP * 100))}%"></span></span><b>${p.vacantes}</b></div>
              <div class="lm-fila lm-fila--sub"><span>TIENDAS</span><em>${esc(p.tiendas)}</em></div>
            </div>`).join('')}
            <h3>Tiendas con más vacantes</h3>
            ${d.tiendas.map((x) => `<div class="lm-tienda"><span>${esc(x.tienda.replace(/^OXXO\s+/i, ''))}</span><b>${x.vacantes}</b></div>`).join('')}
            ${d.empate ? `<p class="lm-nota">${esc(d.empate)}</p>` : ''}
          </section>
        </div>
        <footer class="lm-pie">${navidad ? '❄ ' : ''}Conoxxo · Plaza Oaxaca · generada ${fecha.toLocaleDateString('es-MX')}, ${fecha.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' })}${navidad ? ' · ¡Felices fiestas! ❄' : ''}</footer>
      </div>`;
  }

  // Bajas: los numeros del Dashboard 2 ya pintado (compromiso vs resultado,
  // tarjetas y ranking de plazas del mes). La tabla del dashboard abrevia los
  // nombres ("Mirna M.L."); aqui van completos, buscandolos en el catalogo
  // con la misma abreviatura del dashboard (shortAsesorName).
  async function leerBajas(doc, win) {
    const kpis = {};
    doc.querySelectorAll('#kpi-section .kpi-card').forEach((k) => {
      kpis[k.dataset.kpi || txt(k.querySelector('.kpi-card__label')).toLowerCase()] = { valor: txt(k.querySelector('.kpi-card__value')), nota: txt(k.querySelector('.kpi-card__delta')) };
    });
    const completos = new Map();
    try {
      const cat = await win.OXXO.loadAsesorCatalog();
      Array.from(cat.byCr.values()).forEach((i) => { if (i.asesor && win.shortAsesorName) completos.set(win.shortAsesorName(i.asesor), i.asesor); });
    } catch (_) { /* sin catalogo: nombres como en el dashboard */ }
    const filas = Array.from(doc.querySelectorAll('#tabla-compromiso table tbody tr')).map((tr) => {
      const c = tr.cells, corto = txt(c[0]);
      return { nombre: completos.get(corto) || corto, pendiente: tr.classList.contains('is-pendiente'), bajas: num(txt(c[1])), comp: txt(c[2]), desfase: txt(c[3]) };
    });
    const pie = doc.querySelector('#tabla-compromiso table tfoot tr');
    const total = pie ? { bajas: txt(pie.cells[1]), comp: txt(pie.cells[2]), desfase: txt(pie.cells[3]) } : {};
    // Con alcance de plaza el ranking del dashboard muestra solo Oaxaca hasta
    // pulsar "Ver todas las plazas"; el iframe es oculto, asi que se pulsa aqui.
    const verTodas = doc.getElementById('plazas-scope-toggle');
    if (verTodas && !verTodas.hidden && /^ver todas/i.test(txt(verTodas))) verTodas.click();
    const plazas = Array.from(doc.querySelectorAll('#tabla-plazas .plaza-rank-row')).map((li) => ({
      plaza: txt(li.querySelector('.plaza-rank-top strong')), bajas: num(txt(li.querySelector('.plaza-rank-value'))),
      pct: txt(li.querySelector('.plaza-rank-pct')), propia: li.classList.contains('is-current'),
    }));
    const alcance = txt(doc.querySelector('[data-d2-scope="compromiso"]'));
    return { kpis, filas, total, plazas, alcance };
  }

  function laminaBajas(d, fecha, navidad = enTemporadaNavidad(fecha)) {
    const k = (n) => d.kpis[n] || { valor: '—', nota: '' };
    const total = num(d.total.bajas || k('todos').valor), comp = num(d.total.comp), desf = total - comp;
    const pend = d.filas.find((f) => f.pendiente);
    const asesores = d.filas.filter((f) => !f.pendiente);
    const maxB = Math.max(1, ...d.filas.map((f) => f.bajas));
    const maxP = Math.max(1, ...d.plazas.map((p) => p.bajas));
    const propia = d.plazas.findIndex((p) => p.propia);
    const empate = propia >= 0 ? d.plazas.filter((p, i) => i !== propia && p.bajas === d.plazas[propia].bajas).map((p) => p.plaza) : [];
    const rotT = k('rotTemp');
    const corte = `${dd(fecha)} ${MESES[fecha.getMonth()].slice(0, 3)} ${fecha.getFullYear()}`;
    const mes = (k('todos').nota || '').replace(/^Con filtros activos$/, '');
    const color = (b) => (b <= 1 ? 'verde' : b <= 3 ? 'ambar' : b <= 5 ? 'naranja' : 'rojo');
    const fila = (f) => {
      const dv = num(f.desfase) * (String(f.desfase).trim().startsWith('-') ? -1 : 1);
      return `<tr${f.pendiente ? ' class="lm-pend"' : ''}>
        <td class="lm-asesor">${esc(f.pendiente ? 'Bajas sin asesor confirmado' : nombrePropio(f.nombre))}</td>
        <td class="lm-vac"><span class="lm-pillnum lm-pillnum--${f.pendiente ? 'gris' : color(f.bajas)}">${f.bajas}</span><span class="lm-track"><span class="lm-bar lm-bar--${f.pendiente ? 'gris' : color(f.bajas)}" style="width:${Math.max(4, Math.round(f.bajas / maxB * 100))}%"></span></span></td>
        <td>${esc(f.comp)}</td>
        <td class="${dv > 0 ? 'lm-rojo' : 'lm-verde'}"><b>${dv > 0 ? '+' : ''}${dv}</b></td>
      </tr>`;
    };
    return `
      <div class="lm${navidad ? ' lm--navidad' : ''}">
        ${navidad ? FOQUITOS : ''}
        <header class="lm-cab">
          <span class="lm-pill">Plaza Oaxaca</span>
          <span class="lm-sub">Bajas del mes · Tablero ABC · Corte ${esc(corte)}</span>
          <span class="lm-liston"><svg viewBox="0 0 700 90" width="600" height="90" preserveAspectRatio="none"><path d="M10 52 C120 10 230 10 350 46 S580 86 690 30" fill="none" stroke="#e30613" stroke-width="30" stroke-linecap="round"/><path d="M10 66 C120 26 230 26 350 62 S580 100 690 46" fill="none" stroke="#f6c400" stroke-width="12" stroke-linecap="round"/></svg>${navidad ? ACEBO : ''}</span>
        </header>
        <section class="lm-kpis">
          <div class="lm-kpi">${anillo([{ valor: Math.min(total, comp || total), color: desf > 0 ? '#e30613' : '#1f7a4a' }, { valor: Math.max(0, comp - total), color: '#efe7df' }], total)}
            <div><b>BAJAS DEL MES</b><small>${esc(mes || 'mes vigente')} · comp. ${comp}</small></div></div>
          <div class="lm-kpi"><span class="lm-num${String(Math.abs(desf)).length > 1 ? ' lm-num--largo' : ''} ${desf > 0 ? 'lm-rojo' : 'lm-verde'}">${desf > 0 ? '+' : ''}${desf}</span>
            <div><b>DESFASE VS COMPROMISO</b><small>${desf > 0 ? 'por arriba del compromiso' : 'por debajo del compromiso'}</small></div></div>
          <div class="lm-kpi"><span class="lm-num lm-oro">${esc(rotT.valor)}</span>
            <div><b>ROTACIÓN TEMPRANA</b><small>${esc(rotT.nota)}</small></div></div>
          <div class="lm-kpi"><span class="lm-num">${propia >= 0 ? `${propia + 1}°` : '—'}</span>
            <div><b>LUGAR EN LA REGIÓN</b><small>${empate.length ? `de ${d.plazas.length} · empate con ${esc(empate.join(", "))}` : `de ${d.plazas.length} plazas · ${propia >= 0 ? esc(d.plazas[propia].pct) : ""}`}</small></div></div>
        </section>
        <div class="lm-cuerpo">
          <section class="lm-card">
            <h2>Compromiso vs resultado por asesor</h2>
            <table class="lm-tabla">
              <thead>
                <tr class="lm-grupos"><th></th><th colspan="3"><span class="lm-grupo-rojo">BAJAS DEL MES</span></th></tr>
                <tr><th>ASESOR</th><th>BAJAS</th><th>COMP.</th><th>DESFASE</th></tr>
              </thead>
              <tbody>${asesores.map(fila).join('')}
                ${pend ? `<tr class="lm-sep"><td colspan="4">SIN RESPONSABLE IDENTIFICADO</td></tr>${fila(pend)}` : ''}</tbody>
              <tfoot><tr><td>Total plaza</td><td class="lm-vac"><b>${total}</b></td><td>${comp}</td><td class="${desf > 0 ? 'lm-rojo' : 'lm-verde'}">${desf > 0 ? '+' : ''}${desf}</td></tr></tfoot>
            </table>
            <p class="lm-leyenda">Color de bajas: <span class="lm-pillnum lm-pillnum--verde">0-1</span> <span class="lm-pillnum lm-pillnum--ambar">2-3</span> <span class="lm-pillnum lm-pillnum--naranja">4-5</span> <span class="lm-pillnum lm-pillnum--rojo">6+</span> · Desfase = bajas − compromiso.</p>
          </section>
          <section class="lm-card">
            <h2>Ranking de plazas · bajas del mes</h2>
            ${d.plazas.map((p, i) => `<div class="lm-plaza${p.propia ? ' propia' : ''}">
              <div class="lm-plaza-cab"><span class="lm-rank">${i + 1}</span><b>${esc(p.plaza)}</b>${p.propia ? '<small>TU PLAZA</small>' : ''}</div>
              <div class="lm-fila"><span>BAJAS</span><span class="lm-track"><span class="lm-bar" style="width:${Math.max(6, Math.round(p.bajas / maxP * 100))}%"></span></span><b>${p.bajas}</b></div>
              <div class="lm-fila lm-fila--sub"><span>PARTICIPACIÓN</span><em>${esc(p.pct)}</em></div>
            </div>`).join('')}
            <p class="lm-nota">Total región: ${d.plazas.reduce((x, p) => x + p.bajas, 0)} bajas en ${d.plazas.length} plazas.</p>
          </section>
        </div>
        <footer class="lm-pie">${navidad ? '❄ ' : ''}Conoxxo · Plaza Oaxaca · generada ${fecha.toLocaleDateString('es-MX')}, ${fecha.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' })}${navidad ? ' · ¡Felices fiestas! ❄' : ''}</footer>
      </div>`;
  }

  const ESTILOS_LAMINA = `
    .lm{position:relative;width:1632px;padding:30px 36px 22px;background:#fff;color:#241a17;font-family:'Plus Jakarta Sans','Barlow',Arial,sans-serif;box-sizing:border-box;overflow:hidden}
    .lm *{box-sizing:border-box}
    .lm--navidad{padding-top:62px;background:#fff radial-gradient(circle at 8% 92%,rgba(31,122,74,.05),transparent 30%),radial-gradient(circle at 96% 70%,rgba(227,6,19,.05),transparent 30%)}
    .lm-foquitos{position:absolute;left:0;top:0}
    .lm-cab{position:relative;display:flex;align-items:center;gap:18px;margin-bottom:22px;min-height:76px}
    .lm-pill{position:relative;white-space:nowrap;padding:12px 30px;border-radius:14px;background:#e30613;color:#fff;font-size:24px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;box-shadow:0 6px 14px rgba(227,6,19,.25)}
    .lm-sub{white-space:nowrap;font-size:18px;font-weight:700;letter-spacing:.05em;color:#5e5550;text-transform:uppercase}
    .lm-liston{position:relative;margin-left:auto;margin-right:10px;width:600px;height:90px}
    .lm-liston>svg:first-child{position:absolute;inset:0}
    .lm--navidad .lm-cab{margin-bottom:26px}
    .lm-acebo{position:absolute;left:-46px;top:16px}
    .lm-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:20px;margin-bottom:22px}
    .lm-kpi{display:flex;align-items:center;gap:20px;min-height:132px;padding:16px 22px;border-radius:26px;background:#f4f0ec;box-shadow:0 6px 18px rgba(60,40,30,.10)}
    .lm-kpi b{display:block;font-size:16px;letter-spacing:.04em;white-space:nowrap}
    .lm-kpi small{display:block;margin-top:8px;color:#3a302b;font-size:15px;white-space:nowrap}
    .lm-kpi small i{display:inline-block;width:10px;height:10px;margin:0 5px 1px 8px;border-radius:50%}
    .lm-kpi small i:first-child{margin-left:0}
    .lm-num{flex:none;min-width:96px;font-size:66px;font-weight:800;line-height:1;text-align:center;letter-spacing:-.02em}
    .lm-num--largo{font-size:50px}
    .lm-rojo{color:#e30613}.lm-verde{color:#1f7a4a}.lm-oro{color:#c9a227}
    .lm-cuerpo{display:grid;grid-template-columns:minmax(0,2.15fr) minmax(0,1fr);gap:22px}
    .lm-card{padding:22px;border-radius:28px;background:#f4f0ec;box-shadow:0 6px 18px rgba(60,40,30,.10)}
    .lm-card h2{margin:0 6px 14px;font-size:27px}
    .lm-card h3{margin:18px 6px 10px;font-size:20px}
    .lm-tabla{width:100%;border-collapse:collapse;font-size:18px}
    .lm-tabla th{padding:9px 8px;color:#6e605b;font-size:14px;letter-spacing:.03em;text-align:center}
    .lm-grupos th span{display:block;padding-bottom:6px;border-bottom:2px solid #c9a227;color:#c9a227;font-size:15px}
    .lm-grupos th:last-child span{border-color:#e30613;color:#e30613}
    .lm-tabla thead tr:last-child th{background:#e7e1db}
    .lm-tabla thead tr:last-child th:first-child{border-radius:12px 0 0 12px;text-align:left}
    .lm-tabla thead tr:last-child th:last-child{border-radius:0 12px 12px 0}
    .lm-tabla td{padding:9px 8px;border-bottom:1px solid #e7e1db;text-align:center;white-space:nowrap}
    .lm-tabla td.lm-asesor{text-align:left}
    .lm-foco{display:inline-block;margin-left:6px;padding:2px 8px;border-radius:7px;background:#e30613;color:#fff;font-size:12px;font-weight:800;vertical-align:2px}
    .lm-vac{display:flex;align-items:center;gap:12px}
    .lm-vac b{width:28px;text-align:right;font-size:20px}
    .lm-track{display:block;flex:1;height:10px;min-width:120px;border-radius:6px;background:#e7e1db;overflow:hidden}
    .lm-bar{display:block;height:100%;border-radius:6px;background:#a89c95}
    .lm-bar--alto{background:#e30613}.lm-bar--medio{background:#c9a227}.lm-bar--bajo{background:#1f7a4a}
    .lm-chip{display:inline-block;min-width:36px;padding:4px 10px;border-radius:10px;font-weight:800}
    .lm-chip--verde{background:#dff2e6;color:#1f7a4a}.lm-chip--ambar{background:#fff1c2;color:#9a6a00}.lm-chip--rojo{background:#fde0e0;color:#c4070f}
    .lm-nada{color:#b9aea6}
    .lm-tabla tfoot td{border:0;background:#e7e1db;font-weight:800;font-size:20px}
    .lm-tabla tfoot td:first-child{border-radius:12px 0 0 12px;text-align:left}
    .lm-tabla tfoot td:last-child{border-radius:0 12px 12px 0}
    .lm-plaza{padding:12px 12px;border-bottom:1px solid #e7e1db}
    .lm-plaza.propia{border:0;border-radius:20px;background:#fbf8f5;box-shadow:0 4px 14px rgba(60,40,30,.10)}
    .lm-plaza-cab{display:flex;align-items:center;gap:10px;margin-bottom:8px}
    .lm-plaza-cab b{font-size:22px}
    .lm-plaza-cab small{margin-left:auto;color:#e30613;font-size:13px;font-weight:800}
    .lm-rank{display:grid;place-items:center;width:26px;height:26px;border-radius:50%;background:#e7e1db;font-size:13px;font-weight:800}
    .lm-plaza.propia .lm-rank{background:#e30613;color:#fff}
    .lm-plaza.propia b{color:#e30613}
    .lm-fila{display:grid;grid-template-columns:96px 1fr 50px;align-items:center;gap:10px;font-size:13px;font-weight:800;color:#6e605b}
    .lm-fila b{font-size:22px;text-align:right;color:#241a17}
    .lm-plaza.propia .lm-bar{background:#e30613}
    .lm-fila--sub em{grid-column:2/4;font-style:normal;font-weight:600}
    .lm-tienda{display:flex;justify-content:space-between;padding:7px 12px;font-size:17px;font-weight:700;border-bottom:1px solid #e7e1db}
    .lm-tienda b{color:#e30613;font-size:20px}
    .lm-nota{margin:8px 12px 0;color:#6e605b;font-size:14px;font-weight:600}
    .lm-pie{margin-top:16px;color:#8b7f78;font-size:14px}
    .lm-pillnum{display:inline-grid;place-items:center;min-width:38px;height:32px;padding:0 8px;border-radius:9px;color:#fff;font-weight:800;font-size:18px}
    .lm-pillnum--verde,.lm-bar--verde{background:#1f7a4a}.lm-pillnum--ambar,.lm-bar--ambar{background:#f6c400}.lm-pillnum--naranja,.lm-bar--naranja{background:#f28c18}.lm-pillnum--rojo,.lm-bar--rojo{background:#e30613}.lm-pillnum--gris,.lm-bar--gris{background:#9a8f8a}
    .lm-pillnum--ambar{color:#241a17}
    .lm-leyenda .lm-pillnum{min-width:0;height:24px;font-size:13px;vertical-align:1px}
    .lm-grupo-rojo{border-color:#e30613!important;color:#e30613!important}
    .lm-sep td{padding-top:14px;border-bottom:2px solid #241a17;color:#6e605b;font-size:13px;font-weight:800;letter-spacing:.04em;text-align:left}
    .lm-pend td{color:#3a302b}
    .lm-leyenda{margin:14px 6px 0;color:#6e605b;font-size:15px;font-weight:600}
    .lm-leyenda .lm-foco{margin:0 6px 0 0}
  `;

  async function dibujarLamina(html) {
    if (!window.html2canvas) {
      await new Promise((ok, mal) => { const s = document.createElement('script'); s.src = HTML2CANVAS; s.onload = ok; s.onerror = () => mal(new Error('No cargó html2canvas')); document.head.appendChild(s); });
    }
    if (!document.getElementById('lm-fuente')) {
      const l = document.createElement('link');
      l.id = 'lm-fuente'; l.rel = 'stylesheet';
      l.href = 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap';
      document.head.appendChild(l);
      await new Promise((r) => { l.onload = r; l.onerror = r; setTimeout(r, 4000); });
    }
    const caja = document.createElement('div');
    caja.style.cssText = 'position:fixed;left:-20000px;top:0';
    caja.innerHTML = `<style>${ESTILOS_LAMINA}</style>${html}`;
    document.body.appendChild(caja);
    try {
      if (document.fonts?.load) await Promise.all(['500', '700', '800'].map((w) => document.fonts.load(`${w} 16px "Plus Jakarta Sans"`).catch(() => {})));
      const lienzo = await window.html2canvas(caja.querySelector('.lm'), { backgroundColor: '#ffffff', scale: 2, logging: false });
      const blob = await new Promise((r) => lienzo.toBlob(r, 'image/png'));
      return { blob, ancho: Math.round(lienzo.width / 2) };
    } finally {
      caja.remove();
    }
  }

  // ── El correo (.eml) ────────────────────────────────────
  // HTML del correo. src(nombre) da la fuente de cada imagen: en el .eml es
  // "cid:captura1" (parte inline); en Power Automate va la imagen misma como
  // data: URI, porque "Enviar correo (V2)" no enlaza cid con sus adjuntos
  // (las imagenes llegaban rotas) y Exchange si convierte las data: URI en
  // imagenes dentro del correo.
  // firma: solo para Power Automate, que (a diferencia del Outlook clasico) no
  // agrega la firma automatica de la cuenta.
  function cuerpoCorreo(correo, imagenes, fecha, banner, src, firma = false) {
    const img = (id, ancho) => `<p style="margin:12px 0"><img src="${src(id)}" width="${ancho}" style="display:block;width:${ancho}px;max-width:100%;height:auto;border:0" alt=""></p>`;
    const cuerpo = [
      banner ? `<p style="margin:0 0 8px"><img src="${src('banner')}" width="420" style="display:block;width:420px;height:auto;border:0" alt=""></p>` : '',
      correo.saludo(fecha),
      ...imagenes.map((im, i) => img(`captura${i + 1}`, Math.min(900, im.ancho))),
      firma ? `<p style="font-family:'Courier New',monospace"><b><i>!!Saludos Cordiales!!</i></b></p><p style="margin:8px 0 0"><img src="${src('firma')}" width="620" style="display:block;width:620px;max-width:100%;height:auto;border:0" alt=""></p>` : '',
    ].join('\n');
    return `<html><head><meta charset="utf-8"></head><body style="font-family:Aptos,Calibri,Arial,sans-serif;font-size:11pt;color:#111">${cuerpo}</body></html>`;
  }

  async function armarEml(correo, imagenes, archivo, fecha) {
    const limite = 'oxxo_mixed_' + Date.now().toString(36), rel = 'oxxo_rel_' + Date.now().toString(36);
    const partes = [];
    // Sin firma propia: el Outlook clasico agrega la firma automatica de la
    // cuenta ("!!Saludos Cordiales!!" + tarjeta) al abrir el borrador, y con
    // la del archivo salia dos veces.
    const banner = await imagenDelSitio('assets/correo/banner.png');
    const html = cuerpoCorreo(correo, imagenes, fecha, banner, (n) => `cid:${n}`);

    partes.push(`--${rel}\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${enLineas(b64(html))}`);
    const inline = async (cid, blob) => partes.push(`--${rel}\r\nContent-Type: image/png; name="${cid}.png"\r\nContent-Transfer-Encoding: base64\r\nContent-ID: <${cid}>\r\nContent-Disposition: inline; filename="${cid}.png"\r\n\r\n${enLineas(await aBase64(blob))}`);
    if (banner) await inline('banner', banner);
    for (let i = 0; i < imagenes.length; i++) await inline(`captura${i + 1}`, imagenes[i].blob);

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

  // ── Envio automatico (Power Automate) ───────────────────
  // El panel deja un .json en una carpeta de OneDrive (sincronizada en la PC);
  // un flujo de Power Automate lo toma, pide la aprobacion de Angel y envia el
  // correo con su cuenta (docs/CORREOS_POWER_AUTOMATE.md). Escribir en la
  // carpeta usa la File System Access API: Edge/Chrome la traen; Brave la
  // tiene apagada (brave://flags/#file-system-access-api).
  async function armarPaquete(correo, imagenes, archivo, fecha) {
    const [banner, firma] = await Promise.all([imagenDelSitio('assets/correo/banner.png'), imagenDelSitio('assets/correo/firma.png')]);
    const fuentes = {};
    if (banner) fuentes.banner = banner;
    if (firma) fuentes.firma = firma;
    imagenes.forEach((im, i) => { fuentes[`captura${i + 1}`] = im.blob; });
    for (const k of Object.keys(fuentes)) fuentes[k] = `data:image/png;base64,${await aBase64(fuentes[k])}`;
    // ContentBytes como contenido binario de Power Automate ($content-type +
    // $content): con el base64 como texto plano, el V2 lo volvia a codificar y
    // el Excel llegaba danado.
    const adjuntos = archivo ? [{ Name: archivo.name, ContentBytes: { '$content-type': archivo.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '$content': await aBase64(archivo) } }] : [];
    return {
      formato: 'conoxxo-correo-1',
      correo: correo.id,
      para: PARA.join(';'),
      cc: correo.cc.join(';'),
      asunto: correo.asunto(fecha),
      html: cuerpoCorreo(correo, imagenes, fecha, banner, (n) => fuentes[n], Boolean(firma)),
      resumen: `${correo.nombre} · ${fechaTexto(fecha)} · ${archivo ? `Excel: ${archivo.name}` : 'sin Excel adjunto'}`,
      adjuntos,
    };
  }

  const PUEDE_CARPETA = typeof window.showDirectoryPicker === 'function';
  const AUTO_CLAVE = 'oxxo_correos_auto';
  function baseCarpeta() {
    return new Promise((ok, mal) => {
      const r = indexedDB.open('oxxo-correos', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('ajustes');
      r.onsuccess = () => ok(r.result);
      r.onerror = () => mal(r.error);
    });
  }
  async function carpetaGuardada() {
    try {
      const db = await baseCarpeta();
      return await new Promise((ok) => { const q = db.transaction('ajustes').objectStore('ajustes').get('carpeta'); q.onsuccess = () => ok(q.result || null); q.onerror = () => ok(null); });
    } catch (_) { return null; }
  }
  async function guardarCarpeta(h) {
    const db = await baseCarpeta();
    await new Promise((ok, mal) => { const t = db.transaction('ajustes', 'readwrite'); t.objectStore('ajustes').put(h, 'carpeta'); t.oncomplete = ok; t.onerror = () => mal(t.error); });
  }
  // pedir=true solo dentro de un clic (el navegador lo exige para preguntar).
  async function carpetaLista(pedir) {
    const h = await carpetaGuardada();
    if (!h) return null;
    const modo = { mode: 'readwrite' };
    if ((await h.queryPermission(modo)) === 'granted') return h;
    if (pedir && (await h.requestPermission(modo)) === 'granted') return h;
    return null;
  }
  async function mandarAPowerAutomate(correo, avisar, pedir) {
    const carpeta = await carpetaLista(pedir);
    if (!carpeta) throw new Error('falta dar permiso a la carpeta de OneDrive (botón "Activar" arriba).');
    const fecha = new Date();
    const imagenes = await capturar(correo, avisar);
    avisar('Dejando el correo en OneDrive…');
    const paquete = await armarPaquete(correo, imagenes, archivos[correo.dashboard], fecha);
    const nombre = `${correo.id} ${fecha.getFullYear()}-${mm(fecha)}-${dd(fecha)} ${String(fecha.getHours()).padStart(2, '0')}${String(fecha.getMinutes()).padStart(2, '0')}${String(fecha.getSeconds()).padStart(2, '0')}.json`;
    const fh = await carpeta.getFileHandle(nombre, { create: true });
    const w = await fh.createWritable();
    await w.write(new Blob([JSON.stringify(paquete)], { type: 'application/json' }));
    await w.close();
    return nombre;
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
      <div class="correos-dia__auto" data-auto>
        <div><strong>Envío automático con aprobación</strong><small data-auto-estado>Revisando…</small></div>
        <button class="admin-btn secondary" type="button" data-carpeta>Elegir carpeta de OneDrive</button>
        <label class="correos-dia__check"><input type="checkbox" data-auto-al-publicar> Mandar a aprobación al publicar</label>
      </div>
      <div class="correos-dia">${CORREOS.map((c) => `
        <div class="correos-dia__fila" data-correo="${c.id}">
          <div><strong>${c.nombre}</strong><small data-archivo>Sin Excel todavía: publica la base o elige el archivo.</small></div>
          <label class="admin-btn secondary correos-dia__elegir">Elegir Excel<input type="file" accept=".xlsx,.xls,.xlsm,.csv" hidden></label>
          <button class="admin-btn primary" type="button" data-preparar>Preparar correo</button>
          <button class="admin-btn secondary" type="button" data-aprobar hidden>Mandar a aprobación</button>
          <p class="correos-dia__estado" data-estado role="status" aria-live="polite"></p>
        </div>`).join('')}
      </div>`;
    const auto = raiz.querySelector('[data-auto]');
    const autoEstado = auto.querySelector('[data-auto-estado]');
    const botonCarpeta = auto.querySelector('[data-carpeta]');
    const alPublicar = auto.querySelector('[data-auto-al-publicar]');
    try { alPublicar.checked = localStorage.getItem(AUTO_CLAVE) === '1'; } catch (_) { /* sin storage */ }
    alPublicar.addEventListener('change', () => { try { localStorage.setItem(AUTO_CLAVE, alPublicar.checked ? '1' : '0'); } catch (_) { /* sin storage */ } });
    const refrescarAuto = async () => {
      if (!PUEDE_CARPETA) {
        autoEstado.innerHTML = 'Este navegador no deja guardar en carpetas. En Brave: abre <b>brave://flags/#file-system-access-api</b>, ponlo en <b>Enabled</b> y reinicia Brave.';
        botonCarpeta.hidden = true; alPublicar.disabled = true;
        return;
      }
      const h = await carpetaGuardada();
      const lista = h && (await carpetaLista(false));
      botonCarpeta.textContent = !h ? 'Elegir carpeta de OneDrive' : lista ? 'Cambiar carpeta' : 'Activar';
      autoEstado.textContent = !h ? 'Elige la carpeta de OneDrive que vigila tu flujo de Power Automate.'
        : lista ? `Listo: los correos se dejan en "${h.name}" y te llega la aprobación.` : `Carpeta "${h.name}": da clic en Activar para dar permiso en esta sesión.`;
      raiz.querySelectorAll('[data-aprobar]').forEach((b) => { b.hidden = !h; });
    };
    botonCarpeta.addEventListener('click', async () => {
      try {
        const h = await carpetaGuardada();
        if (h && botonCarpeta.textContent === 'Activar') await carpetaLista(true);
        else await guardarCarpeta(await window.showDirectoryPicker({ id: 'conoxxo-correos', mode: 'readwrite' }));
      } catch (error) {
        if (error?.name !== 'AbortError') autoEstado.textContent = `No se pudo usar la carpeta: ${error.message || error}`;
      }
      refrescarAuto();
    });
    refrescarAuto();

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
      const aprobar = async (pedir) => {
        const boton = fila.querySelector('[data-aprobar]');
        boton.disabled = true;
        estado.dataset.tipo = '';
        try {
          await mandarAPowerAutomate(c, (t) => { estado.textContent = t; }, pedir);
          estado.dataset.tipo = 'ok';
          estado.textContent = `Enviado a aprobación${archivos[c.dashboard] ? '' : ' (sin Excel adjunto)'}: en unos minutos te llega el aviso de Power Automate.`;
        } catch (error) {
          estado.dataset.tipo = 'error';
          estado.textContent = `No se mandó a aprobación: ${error.message || error}`;
        } finally {
          boton.disabled = false;
        }
      };
      c.aprobar = aprobar;
      fila.querySelector('[data-aprobar]').addEventListener('click', () => aprobar(true));
    });
  }

  // Al publicar, si esta activado, cada correo del dashboard se manda solo a
  // aprobacion (uno tras otro: cada captura usa su propio iframe).
  let cola = Promise.resolve();
  function enviarAlPublicar(key) {
    let activo = false;
    try { activo = localStorage.getItem(AUTO_CLAVE) === '1'; } catch (_) { /* sin storage */ }
    if (!activo || !PUEDE_CARPETA) return;
    CORREOS.filter((c) => c.dashboard === key && c.aprobar).forEach((c) => { cola = cola.then(() => c.aprobar(false)); });
  }

  window.addEventListener('oxxo:base-publicada', (e) => {
    const { key, file } = e.detail || {};
    if (!file) return;
    archivos[key] = file;
    CORREOS.filter((c) => c.dashboard === key).forEach((c) => c.refrescar && c.refrescar());
    enviarAlPublicar(key);
  });

  function iniciar() {
    const raiz = document.getElementById('correos-dia');
    if (raiz) pintar(raiz);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();

  window.OXXO_CORREOS = { CORREOS, armarEml, armarPaquete, capturar, leerEstructura, laminaEstructura, leerBajas, laminaBajas, dibujarLamina };
})();
