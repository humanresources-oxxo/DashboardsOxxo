/* ==========================================================
   FICHA DE PLAZA (Conoxxo · pestaña Resumen)
   Una sola lamina con Vacantes (Dashboard 1), Bajas (Dashboard 2) y
   Aprovechamiento de estructura (Dashboard 3) de Plaza Oaxaca, por asesor,
   mas el comparativo de las 5 plazas. Se ve en dashboards/ficha-plaza.html
   (y dentro de la app Conoxxo) y se descarga como imagen para compartir.

   No reimplementa reglas: usa las mismas funciones de core.js
   (metricsD1Rows, metricsD2Rows, metricsDiasVacantesValue, metricsTipoPuesto)
   y de la RAE (OXXO_RAE_DATA.dataD3) que usan los dashboards y la
   presentacion, para que los numeros nunca diverjan.
   ========================================================== */
(function (global) {
  'use strict';

  const PLAZAS = [
    { nombre: 'Chontalpa', scope: 'Plaza Chontalpa', d3: 'CHONTALPA' },
    { nombre: 'Villahermosa', scope: 'Plaza Villahermosa', d3: 'VILLAHERMOSA' },
    { nombre: 'Costa Istmo', scope: 'Plaza Costa Istmo', d3: 'COSTA ISTMO' },
    { nombre: 'Oaxaca', scope: 'Plaza Oaxaca', d3: 'OAXACA' },
    { nombre: 'Tuxtla', scope: 'Plaza Tuxtla', d3: 'TUXTLA' },
  ];
  const PROPIA = 'Oaxaca';
  const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const MESES_CORTOS = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
  // Asesores marcados FOCO: los de menor aprovechamiento de estructura.
  const FOCO_CUANTOS = 3;

  const O = () => global.OXXO;
  const scopeDe = plaza => O().normalizeDataScope({ level: 'plaza', region: 'TABASCO', plaza });
  // Misma llave que la RAE (advisorKey): solo letras, sin acentos ni mayusculas.
  const clave = v => O().metricsNormText(v).replace(/[^A-Z]/g, '');
  const esc = v => String(v ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

  function mesTexto(mes) {
    const m = String(mes || '').match(/^(\d{4})-(\d{2})/);
    return m ? `${MESES[+m[2] - 1]} ${m[1]}` : String(mes || '');
  }

  async function vacantesDe(plaza) {
    const s = await O().metricsD1Rows(true, { scope: scopeDe(plaza) });
    if (!s) return null;
    const rows = s.rows.filter(r => O().metricsRowMonthKeyD1(r, s.mesKey, s.fechaKey) === s.currentMonth);
    return { ...s, rows, mes: s.currentMonth };
  }

  async function bajasDe(plaza) {
    return O().metricsD2Rows('', { scope: scopeDe(plaza), includeAdminUnits: true, asesorCrudo: true });
  }

  // Vacantes por asesor con la misma regla de antiguedad que la RAE / Dashboard 1:
  // sin dias, "Mes finalizado" o mas de 500 dias (tienda nueva) no cuentan
  // para promedio ni rangos, pero si como vacante.
  function vacantesPorAsesor(v) {
    const { rows, asesorKey, puestoKey } = v;
    const muestra = rows[0] || {};
    const diasKey = O().metricsFindKey(muestra, ['Dias Vacantes', 'Dias_Vacantes']);
    const tiendaKey = O().metricsFindKey(muestra, ['Unidad org', 'Unidad org.', 'Tienda']);
    const porPuesto = { Lider: 0, Encargado: 0, Ayudante: 0, Otro: 0 };
    const asesores = new Map();
    let masAntigua = null;
    rows.forEach(r => {
      porPuesto[O().metricsTipoPuesto(O().metricsVal(r, puestoKey))]++;
      const nombre = String(O().metricsVal(r, asesorKey) || '').trim() || 'Sin asesor';
      const k = clave(nombre);
      if (!asesores.has(k)) asesores.set(k, { nombre, vacantes: 0, n: 0, suma: 0, d3: 0, d6: 0, dMas6: 0 });
      const a = asesores.get(k);
      a.vacantes++;
      const crudo = diasKey ? O().metricsVal(r, diasKey) : '';
      const texto = String(crudo ?? '').trim();
      const dias = O().metricsDiasVacantesValue(crudo);
      if (!texto || /finaliz/i.test(texto) || dias > 500) return;
      a.n++;
      a.suma += dias;
      if (dias <= 3) a.d3++;
      else if (dias <= 6) a.d6++;
      else a.dMas6++;
      if (!masAntigua || dias > masAntigua.dias) masAntigua = { dias, tienda: titulo(String(O().metricsVal(r, tiendaKey) || '').trim()) };
    });
    return { porPuesto, asesores, masAntigua };
  }

  async function compromisosOaxaca() {
    const filas = await O().fetchSheetData(O().SHEETS_CONFIG.COMMITMENTS_SHEET, { scoped: false }).catch(() => []);
    const mapa = new Map();
    (filas || []).forEach(r => {
      const plaza = O().metricsNormText(r['Plaza']);
      if (!plaza.includes(O().metricsNormText(PROPIA))) return;
      const c = Number(r['Compromiso']);
      if (r['Asesor'] && Number.isFinite(c)) mapa.set(clave(r['Asesor']), c);
    });
    return mapa;
  }

  async function calcular() {
    if (!global.OXXO_RAE_DATA) throw new Error('falta js/admin-pptx-rae.js');
    const [d3, vac, baj, comp, ...otras] = await Promise.all([
      global.OXXO_RAE_DATA.dataD3(),
      vacantesDe('Plaza ' + PROPIA),
      bajasDe('Plaza ' + PROPIA),
      compromisosOaxaca(),
      ...PLAZAS.map(p => Promise.all([vacantesDe(p.scope).catch(() => null), bajasDe(p.scope).catch(() => null)])),
    ]);
    if (!d3 || !vac || !baj) throw new Error('no se pudieron leer los datos de los dashboards');

    const v = vacantesPorAsesor(vac);
    // Bajas por asesor: la misma exclusion que la RAE (sin responsable o
    // marcadores como "Sin asesor" van a la fila "sin asesor confirmado").
    const bajas = new Map();
    let bajasConAsesor = 0;
    baj.rows.forEach(r => {
      const nombre = String(O().metricsVal(r, baj.asesorKey) || '').trim();
      if (!nombre || O().metricsIsPlaceholderAsesorD2(nombre) || nombre === O().METRICS_SIN_RESPONSABLE_D2) return;
      const k = clave(nombre);
      bajas.set(k, { nombre, n: (bajas.get(k)?.n || 0) + 1 });
      bajasConAsesor++;
    });

    // Roster = asesores con tiendas en Aprovechamiento (Dashboard 3).
    const filas = new Map();
    d3.rankingAll.forEach(a => filas.set(clave(a.name), { nombre: a.name, aprov: a.hasData ? a.value : null }));
    [...v.asesores.values(), ...bajas.values()].forEach(a => {
      const k = clave(a.nombre);
      if (!filas.has(k) && !/^SINASESOR/.test(k)) filas.set(k, { nombre: a.nombre, aprov: null });
    });
    const asesores = [...filas.entries()].map(([k, f]) => {
      const va = v.asesores.get(k);
      const b = bajas.get(k)?.n || 0;
      const c = comp.has(k) ? comp.get(k) : 0;
      return {
        nombre: f.nombre,
        aprov: f.aprov,
        vacantes: va?.vacantes || 0,
        diasProm: va && va.n ? va.suma / va.n : null,
        d3: va?.d3 || 0,
        d6: va?.d6 || 0,
        dMas6: va?.dMas6 || 0,
        bajas: b,
        comp: c,
        desfase: b - c,
        foco: false,
      };
    }).sort((a, b) => (a.aprov ?? 999) - (b.aprov ?? 999) || a.nombre.localeCompare(b.nombre, 'es'));
    asesores.filter(a => a.aprov !== null && a.aprov < 100).slice(0, FOCO_CUANTOS).forEach(a => { a.foco = true; });

    const sinAsesor = baj.rows.length - bajasConAsesor;
    const totalComp = asesores.reduce((s, a) => s + a.comp, 0);
    const vacTotal = vac.rows.length;
    const conDias = [...v.asesores.values()].reduce((s, a) => ({ n: s.n + a.n, suma: s.suma + a.suma }), { n: 0, suma: 0 });
    const tiendas = d3.completas + d3.incompletas + d3.criticas;

    const plazas = PLAZAS.map((p, i) => {
      const [pv, pb] = otras[i];
      const a = d3.plazas.find(x => O().metricsNormText(x.name) === p.d3);
      return { nombre: p.nombre, propia: p.nombre === PROPIA, vacantes: pv ? pv.rows.length : null, bajas: pb ? pb.rows.length : null, aprov: a ? a.value : null };
    }).sort((a, b) => (b.bajas ?? -1) - (a.bajas ?? -1) || a.nombre.localeCompare(b.nombre, 'es'));
    const bajasRegion = plazas.reduce((s, p) => s + (p.bajas || 0), 0);

    // d3.sub = "Corte <fecha>" de la base de Aprovechamiento (o "Corte no informado").
    const corteFecha = /no informado/i.test(d3.sub || '') ? '' : String(d3.sub || '').replace(/^Corte\s*/i, '');
    return {
      plaza: PROPIA,
      corte: corteFecha,
      generada: new Date(),
      vacantes: {
        total: vacTotal,
        lider: v.porPuesto.Lider,
        encargado: v.porPuesto.Encargado,
        ayudante: v.porPuesto.Ayudante + v.porPuesto.Otro,
        masAntigua: v.masAntigua,
        diasProm: conDias.n ? conDias.suma / conDias.n : null,
      },
      bajas: { mes: mesTexto(baj.mes), total: baj.rows.length, comp: totalComp, desfase: baj.rows.length - totalComp, sinAsesor },
      aprov: { pct: d3.pct, completas: d3.completas, incompletas: d3.incompletas, criticas: d3.criticas, tiendas },
      asesores,
      totales: asesores.reduce((t, a) => ({ d3: t.d3 + a.d3, d6: t.d6 + a.d6, dMas6: t.dMas6 + a.dMas6 }), { d3: 0, d6: 0, dMas6: 0 }),
      plazas,
      bajasRegion,
    };
  }

  /* ---------- Formato ---------- */
  const pct = (v, dec = 2) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : `${v.toFixed(dec)}%`);
  const uno = v => (v === null || v === undefined ? '—' : v.toFixed(1));
  const signo = v => (v > 0 ? `+${v}` : String(v));
  // Verde desde 95% (como la ficha impresa); debajo, dorado. El rojo queda para resaltar a la plaza propia.
  const colorAprov = v => (v === null || v === undefined ? '#9a948e' : v >= 95 ? '#1f7a4a' : '#c9a227');
  // "OXXO AVILA CAMACHO" -> "OXXO Avila Camacho".
  const titulo = v => String(v || '').toLowerCase().replace(/(^|\s)(\S)/g, (m, a, b) => a + b.toUpperCase()).replace(/\bOxxo\b/g, 'OXXO');
  const corteTitulo = f => (f.corte ? `CORTE ${String(f.corte).toUpperCase()}` : `CORTE ${f.generada.getDate()} ${MESES_CORTOS[f.generada.getMonth()]} ${f.generada.getFullYear()}`);

  /* ---------- Vista HTML (responsiva) ---------- */
  function anilloSvg(segs, total, centro, tam = 120, grosor = 14) {
    const r = (tam - grosor) / 2;
    const c = 2 * Math.PI * r;
    let off = 0;
    const arcos = segs.filter(s => s.v > 0).map(s => {
      const largo = total ? (s.v / total) * c : 0;
      const a = `<circle cx="${tam / 2}" cy="${tam / 2}" r="${r}" fill="none" stroke="${s.color}" stroke-width="${grosor}" stroke-dasharray="${largo} ${c - largo}" stroke-dashoffset="${-off}" transform="rotate(-90 ${tam / 2} ${tam / 2})"/>`;
      off += largo;
      return a;
    }).join('');
    return `<svg viewBox="0 0 ${tam} ${tam}" width="${tam}" height="${tam}" aria-hidden="true"><circle cx="${tam / 2}" cy="${tam / 2}" r="${r}" fill="none" stroke="#efe7df" stroke-width="${grosor}"/>${arcos}<text x="50%" y="53%" text-anchor="middle" dominant-baseline="middle" class="fp-anillo-txt">${esc(centro)}</text></svg>`;
  }

  const chip = (n, clase) => (n ? `<span class="fp-chip ${clase}">${n}</span>` : '<span class="fp-nada">—</span>');

  function render(el, f) {
    const maxVac = Math.max(1, ...f.asesores.map(a => a.vacantes));
    const maxBaj = Math.max(1, ...f.plazas.map(p => p.bajas || 0));
    const maxVacP = Math.max(1, ...f.plazas.map(p => p.vacantes || 0));
    const pctBajas = f.bajasRegion ? Math.round(((f.plazas.find(p => p.propia)?.bajas || 0) / f.bajasRegion) * 100) : 0;
    el.innerHTML = `
      <header class="fp-cab">
        <span class="fp-pill">PLAZA ${esc(f.plaza.toUpperCase())}</span>
        <span class="fp-sub">VACANTES, BAJAS Y APROVECHAMIENTO · ${esc(corteTitulo(f))}</span>
        <span class="fp-listón" aria-hidden="true"></span>
      </header>
      <section class="fp-kpis">
        <div class="fp-kpi">${anilloSvg([{ v: f.vacantes.lider, color: '#e30613' }, { v: f.vacantes.encargado, color: '#f28c18' }, { v: f.vacantes.ayudante, color: '#f6c400' }], f.vacantes.total, f.vacantes.total, 96, 12)}
          <div><b>VACANTES TOTALES</b><small><i style="background:#e30613"></i>${f.vacantes.lider} Líder <i style="background:#f28c18"></i>${f.vacantes.encargado} Enc. <i style="background:#f6c400"></i>${f.vacantes.ayudante} Ayud.</small></div></div>
        <div class="fp-kpi"><span class="fp-num">${f.vacantes.masAntigua ? f.vacantes.masAntigua.dias : '—'}</span>
          <div><b>DÍAS VACANTE MÁS ANTIGUA</b><small>${esc(f.vacantes.masAntigua ? f.vacantes.masAntigua.tienda : 'Sin vacantes con antigüedad')}</small></div></div>
        <div class="fp-kpi"><span class="fp-num fp-rojo">${f.bajas.total}</span>
          <div><b>BAJAS DEL MES</b><small>${esc(f.bajas.mes)} · comp. ${f.bajas.comp}</small></div></div>
        <div class="fp-kpi">${anilloSvg([{ v: f.aprov.completas, color: '#1f7a4a' }, { v: f.aprov.incompletas, color: '#f6c400' }, { v: f.aprov.criticas, color: '#e30613' }], f.aprov.tiendas, pct(f.aprov.pct, 1), 96, 12)}
          <div><b>APROV. ESTRUCTURA</b><small><i style="background:#1f7a4a"></i>${f.aprov.completas} compl. <i style="background:#f6c400"></i>${f.aprov.incompletas} inc. <i style="background:#e30613"></i>${f.aprov.criticas} crít.</small></div></div>
      </section>
      <section class="fp-cuerpo">
        <div class="fp-card fp-tabla-card">
          <h2>Estructura, vacantes y bajas por asesor</h2>
          <div class="fp-scroll"><table class="fp-tabla">
            <thead>
              <tr class="fp-grupos"><th></th><th colspan="1" class="g-est">ESTRUCTURA</th><th colspan="5" class="g-vac">VACANTES</th><th colspan="3" class="g-baj">BAJAS DEL MES</th></tr>
              <tr><th>ASESOR</th><th>APROV. EC %</th><th>VACANTES</th><th>DÍAS PROM.</th><th>≤3 D</th><th>≤6 D</th><th>&gt;6 D</th><th>BAJAS</th><th>COMP.</th><th>DESFASE</th></tr>
            </thead>
            <tbody>
              ${f.asesores.map(a => `<tr>
                <td class="fp-asesor">${esc(a.nombre)}${a.foco ? '<span class="fp-foco">FOCO</span>' : ''}</td>
                <td><div class="fp-barra"><span style="width:${Math.min(100, a.aprov || 0)}%;background:${colorAprov(a.aprov)}"></span><em style="left:92.5%"></em></div><b style="color:${colorAprov(a.aprov)}">${pct(a.aprov)}</b></td>
                <td>${a.vacantes ? `<b>${a.vacantes}</b><span class="fp-mini"><span style="width:${(a.vacantes / maxVac) * 100}%"></span></span>` : '<span class="fp-nada">—</span>'}</td>
                <td class="${a.diasProm > 6 ? 'fp-rojo' : ''}">${a.vacantes ? uno(a.diasProm) : '—'}</td>
                <td>${chip(a.d3, 'verde')}</td><td>${chip(a.d6, 'amarillo')}</td><td>${chip(a.dMas6, 'rosa')}</td>
                <td><span class="fp-chip ${a.bajas === 0 ? 'oscuro' : a.bajas <= a.comp ? 'oro' : 'rojo'}">${a.bajas}</span></td>
                <td>${a.comp}</td>
                <td class="${a.desfase <= 0 ? 'fp-verde' : 'fp-rojo'}"><b>${signo(a.desfase)}</b></td>
              </tr>`).join('')}
              ${f.bajas.sinAsesor ? `<tr class="fp-sep"><td colspan="10">SIN RESPONSABLE IDENTIFICADO</td></tr>
              <tr><td class="fp-asesor">Bajas sin asesor confirmado</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td>
                <td><span class="fp-chip rojo">${f.bajas.sinAsesor}</span></td><td>0</td><td class="fp-rojo"><b>${signo(f.bajas.sinAsesor)}</b></td></tr>` : ''}
            </tbody>
            <tfoot><tr>
              <td>Total plaza</td><td><b style="color:${colorAprov(f.aprov.pct)}">${pct(f.aprov.pct)}</b> <small>${f.aprov.tiendas} tiendas</small></td>
              <td>${f.vacantes.total}</td><td>${uno(f.vacantes.diasProm)}</td><td class="fp-verde">${f.totales.d3}</td><td class="fp-oro">${f.totales.d6}</td><td class="fp-rojo">${f.totales.dMas6}</td>
              <td class="fp-rojo">${f.bajas.total}</td><td>${f.bajas.comp}</td><td class="${f.bajas.desfase <= 0 ? 'fp-verde' : 'fp-rojo'}">${signo(f.bajas.desfase)}</td>
            </tr></tfoot>
          </table></div>
          <div class="fp-lista">
            ${f.asesores.map(a => `<div class="fp-item">
              <div class="fp-item-cab"><b>${esc(a.nombre)}</b>${a.foco ? '<span class="fp-foco">FOCO</span>' : ''}</div>
              <div class="fp-item-aprov"><div class="fp-barra"><span style="width:${Math.min(100, a.aprov || 0)}%;background:${colorAprov(a.aprov)}"></span><em style="left:92.5%"></em></div><b style="color:${colorAprov(a.aprov)}">${pct(a.aprov)}</b></div>
              <div class="fp-item-datos">
                <span><small>Vacantes</small><b>${a.vacantes || '—'}</b></span>
                <span><small>Días prom.</small><b class="${a.diasProm > 6 ? 'fp-rojo' : ''}">${a.vacantes ? uno(a.diasProm) : '—'}</b></span>
                <span><small>≤3 · ≤6 · &gt;6 d</small><b>${chip(a.d3, 'verde')} ${chip(a.d6, 'amarillo')} ${chip(a.dMas6, 'rosa')}</b></span>
                <span><small>Bajas / comp.</small><b><span class="fp-chip ${a.bajas === 0 ? 'oscuro' : a.bajas <= a.comp ? 'oro' : 'rojo'}">${a.bajas}</span> / ${a.comp}</b></span>
                <span><small>Desfase</small><b class="${a.desfase <= 0 ? 'fp-verde' : 'fp-rojo'}">${signo(a.desfase)}</b></span>
              </div>
            </div>`).join('')}
            ${f.bajas.sinAsesor ? `<div class="fp-item"><div class="fp-item-cab"><b>Bajas sin asesor confirmado</b></div><div class="fp-item-datos"><span><small>Bajas / comp.</small><b><span class="fp-chip rojo">${f.bajas.sinAsesor}</span> / 0</b></span><span><small>Desfase</small><b class="fp-rojo">${signo(f.bajas.sinAsesor)}</b></span></div></div>` : ''}
            <div class="fp-item fp-item-total"><div class="fp-item-cab"><b>Total plaza</b><small>${f.aprov.tiendas} tiendas</small></div>
              <div class="fp-item-datos">
                <span><small>Aprov. EC</small><b style="color:${colorAprov(f.aprov.pct)}">${pct(f.aprov.pct)}</b></span>
                <span><small>Vacantes</small><b>${f.vacantes.total}</b></span>
                <span><small>≤3 · ≤6 · &gt;6 d</small><b><span class="fp-verde">${f.totales.d3}</span> · <span class="fp-oro">${f.totales.d6}</span> · <span class="fp-rojo">${f.totales.dMas6}</span></b></span>
                <span><small>Bajas / comp.</small><b>${f.bajas.total} / ${f.bajas.comp}</b></span>
                <span><small>Desfase</small><b class="${f.bajas.desfase <= 0 ? 'fp-verde' : 'fp-rojo'}">${signo(f.bajas.desfase)}</b></span>
              </div></div>
          </div>
        </div>
        <div class="fp-card fp-plazas">
          <h2>Comparativo por plaza</h2>
          ${f.plazas.map((p, i) => `<div class="fp-plaza ${p.propia ? 'propia' : ''}">
            <div class="fp-plaza-cab"><span class="fp-rank">${i + 1}</span><b>${esc(p.nombre)}</b>${p.propia ? `<small>${pctBajas}% DE LAS BAJAS</small>` : ''}</div>
            <div class="fp-fila"><span>BAJAS</span><div class="fp-track"><span style="width:${((p.bajas || 0) / maxBaj) * 100}%"></span></div><b>${p.bajas ?? '—'}</b></div>
            <div class="fp-fila"><span>VACANTES</span><div class="fp-track"><span class="v" style="width:${((p.vacantes || 0) / maxVacP) * 100}%"></span></div><b>${p.vacantes ?? '—'}</b></div>
            <div class="fp-fila"><span>APROV.</span><div class="fp-track"><span class="a" style="width:${Math.max(0, Math.min(100, ((p.aprov || 0) - 80) * 5))}%;background:${p.propia ? '#e30613' : colorAprov(p.aprov)}"></span><em></em></div><b style="color:${p.propia ? '#e30613' : colorAprov(p.aprov)}">${pct(p.aprov)}</b></div>
          </div>`).join('')}
        </div>
      </section>
      <p class="fp-nota">Vacantes: Dashboard 1 (mes vigente). Bajas: Dashboard 2 (${esc(f.bajas.mes)}), compromiso de Compromisos_Bajas. Aprovechamiento: Dashboard 3, tienda completa = Equipo completo. FOCO: los ${FOCO_CUANTOS} asesores con menor aprovechamiento.</p>`;
  }

  /* ---------- Imagen para compartir (2000 x 1130, como la ficha impresa) ---------- */
  function rr(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  function tarjeta(g, x, y, w, h) {
    g.save();
    g.shadowColor = 'rgba(60,40,30,.14)';
    g.shadowBlur = 24;
    g.shadowOffsetY = 6;
    g.fillStyle = '#f4f0ec';
    rr(g, x, y, w, h, 28);
    g.fill();
    g.restore();
  }
  const F = (peso, tam) => `${peso} ${tam}px Arial, Helvetica, sans-serif`;
  function txt(g, s, x, y, { f = F(400, 20), c = '#241a17', a = 'left' } = {}) {
    g.font = f;
    g.fillStyle = c;
    g.textAlign = a;
    g.fillText(String(s), x, y);
  }
  function anillo(g, cx, cy, r, grosor, segs, total) {
    g.lineWidth = grosor;
    g.strokeStyle = '#e8e0d8';
    g.beginPath();
    g.arc(cx, cy, r, 0, 2 * Math.PI);
    g.stroke();
    let a0 = -Math.PI / 2;
    segs.forEach(s => {
      if (!s.v || !total) return;
      const a1 = a0 + (s.v / total) * 2 * Math.PI;
      g.strokeStyle = s.color;
      g.beginPath();
      g.arc(cx, cy, r, a0, a1);
      g.stroke();
      a0 = a1;
    });
  }
  function pastilla(g, x, y, s, fondo, color) {
    rr(g, x - 20, y - 20, 40, 34, 9);
    g.fillStyle = fondo;
    g.fill();
    txt(g, s, x, y + 6, { f: F(700, 19), c: color, a: 'center' });
  }

  function dibujar(f) {
    const W = 2000, H = 1130;
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const g = cv.getContext('2d');
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, W, H);

    // Encabezado + liston
    rr(g, 60, 42, 292, 46, 14);
    g.fillStyle = '#e30613';
    g.fill();
    txt(g, `PLAZA ${f.plaza.toUpperCase()}`, 206, 73, { f: F(700, 22), c: '#fff', a: 'center' });
    txt(g, `VACANTES, BAJAS Y APROVECHAMIENTO · ${corteTitulo(f)}`, 375, 72, { f: F(700, 21), c: '#5e5550' });
    g.save();
    g.lineCap = 'round';
    [['#e30613', 44, 0], ['#f6c400', 16, 18]].forEach(([c, w, dy]) => {
      g.strokeStyle = c;
      g.lineWidth = w;
      g.beginPath();
      g.moveTo(1270, 70 + dy);
      g.bezierCurveTo(1420, 150 + dy, 1520, -10 + dy, 1660, 70 + dy);
      g.bezierCurveTo(1760, 130 + dy, 1840, 40 + dy, 1930, 60 + dy);
      g.stroke();
    });
    g.restore();

    // KPIs
    const kx = [60, 535, 1010, 1485], kw = 455, ky = 133, kh = 128;
    kx.forEach(x => tarjeta(g, x, ky, kw, kh));
    anillo(g, 139, 197, 46, 13, [{ v: f.vacantes.lider, color: '#e30613' }, { v: f.vacantes.encargado, color: '#f28c18' }, { v: f.vacantes.ayudante, color: '#f6c400' }], f.vacantes.total);
    txt(g, f.vacantes.total, 139, 210, { f: F(700, 36), a: 'center' });
    txt(g, 'VACANTES TOTALES', 218, 190, { f: F(700, 19) });
    const leyenda = (x, y, items) => {
      let cx = x;
      items.forEach(([color, s]) => {
        g.fillStyle = color;
        g.beginPath();
        g.arc(cx + 5, y - 6, 5, 0, 2 * Math.PI);
        g.fill();
        txt(g, s, cx + 15, y, { f: F(400, 18), c: '#3a302b' });
        g.font = F(400, 18);
        cx += 15 + g.measureText(s).width + 16;
      });
    };
    leyenda(218, 216, [['#e30613', `${f.vacantes.lider} Líder`], ['#f28c18', `${f.vacantes.encargado} Enc.`], ['#f6c400', `${f.vacantes.ayudante} Ayud.`]]);
    txt(g, f.vacantes.masAntigua ? f.vacantes.masAntigua.dias : '—', 622, 220, { f: F(700, 58), a: 'center' });
    txt(g, 'DÍAS VACANTE MÁS ANTIGUA', 700, 190, { f: F(700, 19) });
    txt(g, f.vacantes.masAntigua ? f.vacantes.masAntigua.tienda : 'Sin vacantes con antigüedad', 700, 216, { f: F(400, 18), c: '#3a302b' });
    txt(g, f.bajas.total, 1097, 220, { f: F(700, 58), c: '#e30613', a: 'center' });
    txt(g, 'BAJAS DEL MES', 1175, 190, { f: F(700, 19) });
    txt(g, `${f.bajas.mes} · comp. ${f.bajas.comp}`, 1175, 216, { f: F(400, 18), c: '#3a302b' });
    anillo(g, 1564, 197, 46, 13, [{ v: f.aprov.completas, color: '#1f7a4a' }, { v: f.aprov.incompletas, color: '#f6c400' }, { v: f.aprov.criticas, color: '#e30613' }], f.aprov.tiendas);
    txt(g, pct(f.aprov.pct, 1), 1564, 205, { f: F(700, 21), a: 'center' });
    txt(g, 'APROV. ESTRUCTURA', 1643, 190, { f: F(700, 19) });
    leyenda(1643, 216, [['#1f7a4a', `${f.aprov.completas} compl.`], ['#f6c400', `${f.aprov.incompletas} inc.`], ['#e30613', `${f.aprov.criticas} crít.`]]);

    // Tabla por asesor
    tarjeta(g, 60, 284, 1270, 798);
    txt(g, 'Estructura, vacantes y bajas por asesor', 90, 328, { f: F(700, 27) });
    const cols = { asesor: 90, aprovBar: 428, aprov: 662, vac: 721, dias: 865, d3: 928, d6: 980, dm: 1032, baj: 1117, comp: 1195, desf: 1272 };
    const grupo = (s, x0, x1, c) => {
      txt(g, s, (x0 + x1) / 2, 362, { f: F(700, 16), c, a: 'center' });
      g.fillStyle = c;
      g.fillRect(x0, 372, x1 - x0, 2);
    };
    grupo('ESTRUCTURA', 431, 683, '#c9a227');
    grupo('VACANTES', 708, 1053, '#f28c18');
    grupo('BAJAS DEL MES', 1079, 1310, '#e30613');
    rr(g, 78, 382, 1236, 44, 12);
    g.fillStyle = '#e7e1db';
    g.fill();
    const enc = [['ASESOR', cols.asesor, 'left'], ['APROV. EC %', cols.aprovBar, 'left'], ['VACANTES', 746, 'center'], ['DÍAS', cols.dias, 'center'], ['≤3 D', cols.d3, 'center'], ['≤6 D', cols.d6, 'center'], ['>6 D', cols.dm, 'center'], ['BAJAS', cols.baj, 'center'], ['COMP.', cols.comp, 'center'], ['DESFASE', cols.desf, 'center']];
    enc.forEach(([s, x, a]) => txt(g, s, x, 410, { f: F(700, 15), c: '#6e605b', a }));
    txt(g, 'PROM.', cols.dias, 425, { f: F(700, 13), c: '#6e605b', a: 'center' });

    const filas = f.asesores;
    const espacio = 940 - 448;
    const extra = f.bajas.sinAsesor ? 2 : 0;
    const alto = Math.min(43, espacio / Math.max(1, filas.length + extra * 0.9));
    const maxVac = Math.max(1, ...filas.map(a => a.vacantes));
    let y = 448;
    filas.forEach(a => {
      const cy = y + alto / 2 + 7;
      // Nombre que quepa (con FOCO deja lugar para la etiqueta): primero se
      // abrevia el ultimo apellido ("Laura Alejandra Moreno M."), luego se corta.
      g.font = F(a.foco ? 700 : 400, 19);
      const cabe = a.foco ? 262 : 322;
      let nom = a.nombre;
      if (g.measureText(nom).width > cabe) {
        const partes = nom.split(' ');
        if (partes.length > 2) nom = partes.slice(0, -1).join(' ') + ' ' + partes[partes.length - 1][0] + '.';
        while (g.measureText(nom).width > cabe && nom.length > 4) nom = nom.slice(0, -2) + '…';
      }
      txt(g, nom, cols.asesor, cy, { f: F(a.foco ? 700 : 400, 19) });
      if (a.foco) {
        const w = g.measureText(nom).width;
        rr(g, cols.asesor + w + 10, cy - 18, 52, 22, 6);
        g.fillStyle = '#e30613';
        g.fill();
        txt(g, 'FOCO', cols.asesor + w + 36, cy - 2, { f: F(700, 13), c: '#fff', a: 'center' });
      }
      const ca = colorAprov(a.aprov);
      rr(g, cols.aprovBar, cy - 11, 130, 8, 4);
      g.fillStyle = '#e8e0d8';
      g.fill();
      rr(g, cols.aprovBar, cy - 11, 130 * Math.min(1, (a.aprov || 0) / 100), 8, 4);
      g.fillStyle = ca;
      g.fill();
      g.fillStyle = '#241a17';
      g.fillRect(cols.aprovBar + 130 * 0.925, cy - 16, 2, 18);
      txt(g, pct(a.aprov), cols.aprov, cy, { f: F(700, 19), c: ca, a: 'right' });
      if (a.vacantes) {
        txt(g, a.vacantes, cols.vac, cy, { f: F(700, 19), a: 'center' });
        rr(g, 738, cy - 11, 82, 8, 4);
        g.fillStyle = '#e8e0d8';
        g.fill();
        rr(g, 738, cy - 11, Math.max(16, 82 * (a.vacantes / maxVac)), 8, 4);
        g.fillStyle = a.vacantes === maxVac ? '#c9a227' : '#2f8a5b';
        g.fill();
      } else txt(g, '—', cols.vac, cy, { f: F(400, 19), c: '#a2948d', a: 'center' });
      txt(g, a.vacantes ? uno(a.diasProm) : '—', cols.dias, cy, { f: F(400, 19), c: a.diasProm > 6 ? '#e30613' : '#241a17', a: 'center' });
      [[a.d3, cols.d3, '#d8f0de', '#1f7a4a'], [a.d6, cols.d6, '#fff1b8', '#8a6100'], [a.dMas6, cols.dm, '#ffe0e6', '#c2002b']].forEach(([n, x, fo, co]) => {
        if (n) pastilla(g, x, cy - 6, n, fo, co);
        else txt(g, '—', x, cy, { f: F(400, 19), c: '#a2948d', a: 'center' });
      });
      pastilla(g, cols.baj, cy - 6, a.bajas, a.bajas === 0 ? '#1f7a4a' : a.bajas <= a.comp ? '#f6c400' : '#e30613', a.bajas === 0 ? '#fff' : a.bajas <= a.comp ? '#241a17' : '#fff');
      txt(g, a.comp, cols.comp, cy, { f: F(400, 19), a: 'center' });
      txt(g, signo(a.desfase), cols.desf, cy, { f: F(700, 19), c: a.desfase <= 0 ? '#1f7a4a' : '#e30613', a: 'center' });
      g.fillStyle = '#e7e1db';
      g.fillRect(78, y + alto, 1236, 1);
      y += alto;
    });
    if (f.bajas.sinAsesor) {
      txt(g, 'SIN RESPONSABLE IDENTIFICADO', cols.asesor, y + 24, { f: F(700, 15), c: '#6e605b' });
      g.fillStyle = '#241a17';
      g.fillRect(78, y + 34, 1236, 2);
      const cy = y + 34 + alto / 2 + 7;
      txt(g, 'Bajas sin asesor confirmado', cols.asesor, cy, { f: F(400, 19) });
      [cols.aprovBar + 130, cols.vac, cols.dias, cols.d3, cols.d6, cols.dm].forEach(x => txt(g, '—', x, cy, { f: F(400, 19), c: '#a2948d', a: 'center' }));
      pastilla(g, cols.baj, cy - 6, f.bajas.sinAsesor, '#e30613', '#fff');
      txt(g, '0', cols.comp, cy, { f: F(400, 19), a: 'center' });
      txt(g, signo(f.bajas.sinAsesor), cols.desf, cy, { f: F(700, 19), c: '#e30613', a: 'center' });
    }
    rr(g, 78, 1020, 1236, 48, 12);
    g.fillStyle = '#e7e1db';
    g.fill();
    txt(g, 'Total plaza', cols.asesor, 1052, { f: F(700, 21) });
    txt(g, pct(f.aprov.pct), cols.aprovBar, 1052, { f: F(700, 20), c: colorAprov(f.aprov.pct) });
    txt(g, `${f.aprov.tiendas} tiendas`, cols.aprovBar + 76, 1051, { f: F(400, 15), c: '#6e605b' });
    txt(g, f.vacantes.total, cols.vac, 1052, { f: F(700, 20), a: 'center' });
    txt(g, uno(f.vacantes.diasProm), cols.dias, 1052, { f: F(700, 20), a: 'center' });
    txt(g, f.totales.d3, cols.d3, 1052, { f: F(700, 20), c: '#1f7a4a', a: 'center' });
    txt(g, f.totales.d6, cols.d6, 1052, { f: F(700, 20), c: '#c9a227', a: 'center' });
    txt(g, f.totales.dMas6, cols.dm, 1052, { f: F(700, 20), c: '#e30613', a: 'center' });
    txt(g, f.bajas.total, cols.baj, 1052, { f: F(700, 20), c: '#e30613', a: 'center' });
    txt(g, f.bajas.comp, cols.comp, 1052, { f: F(700, 20), a: 'center' });
    txt(g, signo(f.bajas.desfase), cols.desf, 1052, { f: F(700, 20), c: f.bajas.desfase <= 0 ? '#1f7a4a' : '#e30613', a: 'center' });

    // Comparativo por plaza
    tarjeta(g, 1355, 284, 588, 798);
    txt(g, 'Comparativo por plaza', 1382, 328, { f: F(700, 27) });
    const maxB = Math.max(1, ...f.plazas.map(p => p.bajas || 0));
    const maxV = Math.max(1, ...f.plazas.map(p => p.vacantes || 0));
    const totalB = f.bajasRegion || 1;
    let py = 352;
    const bh = 146;
    f.plazas.forEach((p, i) => {
      if (p.propia) {
        g.save();
        g.shadowColor = 'rgba(60,40,30,.12)';
        g.shadowBlur = 16;
        g.fillStyle = '#fbf8f5';
        rr(g, 1378, py + 2, 542, bh - 10, 18);
        g.fill();
        g.restore();
      }
      g.fillStyle = p.propia ? '#e30613' : '#ece6e0';
      g.beginPath();
      g.arc(1407, py + 28, 12, 0, 2 * Math.PI);
      g.fill();
      txt(g, i + 1, 1407, py + 33, { f: F(700, 14), c: p.propia ? '#fff' : '#6e605b', a: 'center' });
      txt(g, p.nombre, 1432, py + 37, { f: F(700, 24), c: p.propia ? '#e30613' : '#241a17' });
      if (p.propia) txt(g, `${Math.round(((p.bajas || 0) / totalB) * 100)}% DE LAS BAJAS`, 1902, py + 34, { f: F(700, 14), c: '#e30613', a: 'right' });
      const fila = (lbl, yy, frac, color, valor, cval) => {
        txt(g, lbl, 1394, yy, { f: F(700, 14), c: '#6e605b' });
        rr(g, 1482, yy - 11, 326, 9, 5);
        g.fillStyle = '#e8e0d8';
        g.fill();
        rr(g, 1482, yy - 11, Math.max(10, 326 * frac), 9, 5);
        g.fillStyle = color;
        g.fill();
        txt(g, valor, 1902, yy + 2, { f: F(700, 20), c: cval || '#241a17', a: 'right' });
      };
      const cA = p.propia ? '#e30613' : colorAprov(p.aprov);
      fila('BAJAS', py + 64, (p.bajas || 0) / maxB, p.propia ? '#e30613' : '#a59b93', p.bajas ?? '—', p.propia ? '#e30613' : null);
      fila('VACANTES', py + 88, (p.vacantes || 0) / maxV, p.propia ? '#f28c18' : '#cfc7c0', p.vacantes ?? '—', p.propia ? '#f28c18' : null);
      fila('APROV.', py + 112, Math.max(0, Math.min(1, ((p.aprov || 0) - 80) / 20)), cA, pct(p.aprov), cA);
      g.fillStyle = '#241a17';
      g.fillRect(1482 + 326 * ((92.5 - 80) / 20), py + 112 - 15, 2, 17);
      if (!p.propia && i < f.plazas.length - 1 && !f.plazas[i + 1].propia) {
        g.fillStyle = '#e7e1db';
        g.fillRect(1378, py + bh - 6, 542, 1);
      }
      py += bh;
    });

    txt(g, `Conoxxo · Plaza ${f.plaza} · generada ${f.generada.toLocaleString('es-MX')}`, 60, 1112, { f: F(400, 14), c: '#a2948d' });
    return cv;
  }

  function nombreArchivo(f) {
    const d = f.generada;
    return `Ficha Plaza ${f.plaza} ${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.png`;
  }

  function imagen(f) {
    return new Promise((resolve, reject) => dibujar(f).toBlob(b => (b ? resolve(b) : reject(new Error('no se pudo generar la imagen'))), 'image/png'));
  }

  // Comparte la imagen (celular: WhatsApp, correo...) o la descarga.
  async function compartir(f) {
    const blob = await imagen(f);
    const archivo = new File([blob], nombreArchivo(f), { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
      try {
        await navigator.share({ files: [archivo], title: `Ficha Plaza ${f.plaza}` });
        return 'compartida';
      } catch (e) {
        if (e && e.name === 'AbortError') return 'cancelada';
      }
    }
    descargarBlob(blob, nombreArchivo(f));
    return 'descargada';
  }
  async function descargar(f) {
    descargarBlob(await imagen(f), nombreArchivo(f));
  }
  function descargarBlob(blob, nombre) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  global.OXXO_FICHA = { calcular, render, dibujar, imagen, compartir, descargar, nombreArchivo };
})(window);
