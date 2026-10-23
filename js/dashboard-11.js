/* ==========================================================
   DASHBOARD 11 · CUMPLIMIENTO DE MARCAJES
   Consumido por: dashboards/dashboard-11.html.

   Seguimiento semanal por plaza, asesor y tienda. Desde que la carga
   conserva el historico (replacePeriod sobre Semana), la hoja trae varias
   semanas: el selector elige una y se compara contra la anterior.

   - Encabezado: % total contra la meta del 95%, entradas, salidas y su
     brecha, variacion contra la semana anterior y conteos de tiendas.
   - Tendencia: ultimas 8 semanas de la plaza con la linea de meta, y la
     de un asesor si se elige.
   - Asesores: ranking con rangos, compromiso (+5 pts) y si cumplio el de
     la semana anterior; etiqueta FOCO automatica.
   - Tiendas: vistas de criticas, 0%, bajaron de rango y calidad de dato.
   - Contexto: posicion de cada plaza de la region en la semana.
   - Exportar lamina: PNG 1920x1080 listo para la presentacion semanal.

   Las funciones de calculo no tocan el DOM y se exponen en
   window.OXXO_D11 para las pruebas (tests/dashboard-11-seguimiento.test.js).
   ========================================================== */
(function () {
  'use strict';

  const META = 95;
  const COMPROMISO_PTS = 5;
  const FOCO_CAIDA = 3;
  const SEMANAS_TENDENCIA = 8;
  const RANGOS = [
    { id: 'Sobresaliente', etiqueta: '>90%', min: 90, color: '#16a765', orden: 4 },
    { id: 'En seguimiento', etiqueta: '75–90%', min: 75, color: '#f6b93b', orden: 3 },
    { id: 'Prioridad', etiqueta: '50–75%', min: 50, color: '#f47b20', orden: 2 },
    { id: 'Critico', etiqueta: '<50%', min: -Infinity, color: '#ed1c2e', orden: 1 }
  ];
  const SIN_DATO = { id: 'Sin dato', etiqueta: 'Sin dato', color: '#c0aca7', orden: 0 };

  /* ---------- calculo puro ---------- */
  const norm = v => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9%]+/g, ' ').trim();
  // La base publica fracciones (0.94) pero algunas filas vienen como 94 o
  // "94%"; metricsNum lee la coma decimal es-MX ("0,986").
  function pct(v, num) {
    const n = num(v);
    if (!Number.isFinite(n)) return null;
    return Math.abs(n) <= 3 ? n * 100 : n;
  }
  function rangoDe(total) {
    if (total === null || total === undefined || !Number.isFinite(total)) return SIN_DATO;
    return RANGOS.find(r => total >= r.min) || RANGOS[RANGOS.length - 1];
  }
  const promedio = vals => { const v = vals.filter(Number.isFinite); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  // "SEM 41" -> 41. Sin año en la base: si las semanas cruzan de año (52 ->
  // 1) las chicas se tratan como del año siguiente.
  function numeroSemana(s) { const m = String(s || '').match(/(\d{1,2})\s*$/) || String(s || '').match(/(\d{1,2})/); return m ? Number(m[1]) : NaN; }
  function ordenarSemanas(lista) {
    const unicas = [...new Set(lista.map(s => String(s || '').trim()).filter(Boolean))];
    const nums = unicas.map(numeroSemana).filter(Number.isFinite);
    const cruza = nums.length && Math.max(...nums) - Math.min(...nums) > 26;
    const clave = s => { const n = numeroSemana(s); return cruza && n < 26 ? n + 53 : n; };
    return unicas.sort((a, b) => clave(a) - clave(b));
  }
  const claveTienda = (fila, c) => norm(fila[c.plaza]) + '|' + norm(fila[c.tienda]);

  // Cada fila ya trae sus % leidos: { ...fila, _e, _s, _t }.
  function leerFilas(filas, c, num) {
    return filas.map(f => ({ ...f, _e: pct(f[c.entradas], num), _s: pct(f[c.salidas], num), _t: pct(f[c.total], num) }));
  }
  const fueraDeRango = f => [f._e, f._s, f._t].some(v => v !== null && v > 100.001);
  function calidadDe(f, c) {
    const motivos = [];
    if (f._t === null) motivos.push('Sin dato');
    if (fueraDeRango(f)) motivos.push('Mayor a 100%');
    const alerta = String(f[c.quality] || '').trim();
    if (alerta && !motivos.includes('Mayor a 100%')) motivos.push(alerta);
    return motivos;
  }

  function resumen(filas) {
    const total = promedio(filas.map(f => f._t)), entradas = promedio(filas.map(f => f._e)), salidas = promedio(filas.map(f => f._s));
    const rangos = Object.fromEntries([...RANGOS, SIN_DATO].map(r => [r.id, 0]));
    filas.forEach(f => { rangos[rangoDe(f._t).id]++; });
    return {
      tiendas: filas.length, total, entradas, salidas,
      brecha: entradas !== null && salidas !== null ? entradas - salidas : null,
      vsMeta: total !== null ? total - META : null,
      bajo75: filas.filter(f => f._t !== null && f._t < 75).length,
      fuera: filas.filter(fueraDeRango).length,
      sinDato: filas.filter(f => f._t === null).length,
      cero: filas.filter(f => f._t === 0).length,
      rangos
    };
  }
  const delta = (a, b) => (a !== null && b !== null && a !== undefined && b !== undefined ? a - b : null);

  // Ranking de asesores de la semana contra la anterior. Compromiso: lo que
  // cada asesor debe alcanzar la semana que sigue (+5 pts, tope 100). Cumplio:
  // si esta semana llego al compromiso que le tocaba (anterior +5).
  // FOCO: bajo 75% o cayo FOCO_CAIDA pts o mas contra la anterior; si nadie
  // cae ahi, el mas bajo. (Con "no cumplio y bajo" casi todos quedaban en
  // foco: subir 5 pts por semana es exigente y la etiqueta dejaba de servir.)
  function porAsesor(filasSemana, filasAnterior, c) {
    const agrupar = filas => {
      const g = new Map();
      filas.forEach(f => { const a = String(f[c.asesor] || '').trim() || 'Sin asesor'; if (!g.has(a)) g.set(a, []); g.get(a).push(f); });
      return g;
    };
    const antes = agrupar(filasAnterior || []);
    const lista = [...agrupar(filasSemana)].map(([nombre, filas]) => {
      const r = resumen(filas), previo = antes.has(nombre) ? resumen(antes.get(nombre)).total : null;
      const metaAnterior = previo !== null ? Math.min(100, previo + COMPROMISO_PTS) : null;
      return {
        nombre, tiendas: filas.length, total: r.total, entradas: r.entradas, salidas: r.salidas, brecha: r.brecha,
        rangos: r.rangos, totalAnterior: previo, variacion: delta(r.total, previo),
        compromiso: r.total !== null ? Math.min(100, r.total + COMPROMISO_PTS) : null,
        compromisoAnterior: metaAnterior,
        cumplio: metaAnterior === null || r.total === null ? null : r.total >= metaAnterior - 0.05,
        foco: false
      };
    }).filter(a => a.total !== null)
      .sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre, 'es'));
    lista.forEach(a => { a.foco = a.total < 75 || (a.variacion !== null && a.variacion <= -FOCO_CAIDA); });
    if (lista.length && !lista.some(a => a.foco)) lista[lista.length - 1].foco = true;
    return lista;
  }

  // Tendencia de las ultimas semanas hasta la elegida (inclusive).
  function tendencia(filasPorSemana, semanas, hasta, filtro = () => true) {
    const fin = semanas.indexOf(hasta);
    return semanas.slice(Math.max(0, fin - SEMANAS_TENDENCIA + 1), fin + 1).map(s => {
      const r = resumen((filasPorSemana.get(s) || []).filter(filtro));
      return { semana: s, total: r.total, entradas: r.entradas, salidas: r.salidas, tiendas: r.tiendas };
    });
  }

  // Cambio de rango por tienda contra la semana anterior.
  function cambiosDeRango(filasSemana, filasAnterior, c) {
    const antes = new Map((filasAnterior || []).map(f => [claveTienda(f, c), f]));
    const cambios = new Map();
    filasSemana.forEach(f => {
      const prev = antes.get(claveTienda(f, c));
      if (!prev) return;
      const ahora = rangoDe(f._t), entonces = rangoDe(prev._t);
      cambios.set(claveTienda(f, c), { antes: entonces, ahora, totalAnterior: prev._t, variacion: delta(f._t, prev._t), bajo: entonces.orden > 0 && ahora.orden < entonces.orden });
    });
    return cambios;
  }

  // Plazas de la region en la semana, de mejor a peor.
  function plazas(filasRegionSemana, filasRegionAnterior, c) {
    const agrupar = filas => { const g = new Map(); filas.forEach(f => { const p = String(f[c.plaza] || '').trim(); if (!p) return; if (!g.has(p)) g.set(p, []); g.get(p).push(f); }); return g; };
    const antes = agrupar(filasRegionAnterior || []);
    return [...agrupar(filasRegionSemana)].map(([plaza, filas]) => {
      const r = resumen(filas), previo = antes.has(plaza) ? resumen(antes.get(plaza)).total : null;
      return { plaza, total: r.total, entradas: r.entradas, salidas: r.salidas, tiendas: r.tiendas, variacion: delta(r.total, previo) };
    }).filter(p => p.total !== null).sort((a, b) => b.total - a.total);
  }

  const calc = { META, COMPROMISO_PTS, FOCO_CAIDA, RANGOS, SIN_DATO, pct, rangoDe, numeroSemana, ordenarSemanas, leerFilas, resumen, porAsesor, tendencia, cambiosDeRango, plazas, calidadDe, fueraDeRango, claveTienda, norm };
  window.OXXO_D11 = calc;
  if (!window.document || !document.getElementById('d11-root')) return;

  /* ---------- pagina ---------- */
  const $ = id => document.getElementById(id);
  const esc = v => (window.OXXO ? OXXO.escHtml(String(v ?? '')) : String(v ?? ''));
  const fmt = v => (v === null || v === undefined || !Number.isFinite(v) ? '—' : `${v.toFixed(1).replace(/\.0$/, '')}%`);
  const fmtPts = (v, signo = true) => (v === null || !Number.isFinite(v) ? '—' : `${signo && v > 0 ? '+' : ''}${v.toFixed(1).replace(/\.0$/, '')} pts`);
  const flecha = v => (v === null || !Number.isFinite(v) || Math.abs(v) < 0.05 ? '<span class="d11-var d11-var--igual">= 0 pts</span>'
    : v > 0 ? `<span class="d11-var d11-var--sube">▲ ${fmtPts(v, false)}</span>` : `<span class="d11-var d11-var--baja">▼ ${fmtPts(-v, false)}</span>`);

  let COL = {}, ALL = [], SCOPE_ROWS = [], SEMANAS = [], POR_SEMANA = new Map(), REGION_POR_SEMANA = new Map();
  let esAsesorDeLaPlaza = () => true;
  const estado = { semana: '', anterior: '', asesor: '', rango: '', vista: '', q: '', trendAsesor: '' };
  let ULTIMO = null;

  function agruparPorSemana(filas) {
    const g = new Map();
    filas.forEach(f => { const s = String(f[COL.semana] || '').trim().toUpperCase(); if (!s) return; if (!g.has(s)) g.set(s, []); g.get(s).push(f); });
    return g;
  }

  function filtrosTienda(f) {
    if (estado.asesor && String(f[COL.asesor] || '') !== estado.asesor) return false;
    if (estado.rango && rangoDe(f._t).id !== estado.rango) return false;
    if (estado.q && !norm(f[COL.tienda]).includes(estado.q)) return false;
    return true;
  }

  function render() {
    const semana = estado.semana, idx = SEMANAS.indexOf(semana);
    estado.anterior = idx > 0 ? SEMANAS[idx - 1] : '';
    const filas = POR_SEMANA.get(semana) || [], previas = POR_SEMANA.get(estado.anterior) || [];
    const delAsesor = f => !estado.asesor || String(f[COL.asesor] || '') === estado.asesor;
    const r = resumen(filas.filter(delAsesor)), rp = estado.anterior ? resumen(previas.filter(delAsesor)) : null;
    const asesores = porAsesor(filas.filter(esAsesorDeLaPlaza), previas.filter(esAsesorDeLaPlaza), COL);
    const cambios = cambiosDeRango(filas, previas, COL);
    ULTIMO = { semana, r, rp, asesores, cambios, filas, previas };
    $('corte-badge').textContent = `${semana || 'Sin semana'} · ${OXXO.getScopeLabel()}${estado.anterior ? ` · comparado con ${estado.anterior}` : ' · sin semana anterior para comparar'}`;
    renderKpis(r, rp);
    renderTendencia();
    renderMix(r);
    renderAsesores(asesores);
    renderTiendas(filas, cambios);
    renderCalidad(filas);
    renderPlazas();
  }

  function kpi(label, value, sub, accent, extra = '') {
    return `<article class="kpi-card" style="--accent:${accent}"><div class="kpi-card__label">${label}</div><div class="kpi-card__value">${value}</div><div class="kpi-card__delta">${sub}</div>${extra}</article>`;
  }
  function renderKpis(r, rp) {
    const v = rp ? delta(r.total, rp.total) : null;
    const meta = r.vsMeta === null ? 'Sin dato' : r.vsMeta >= 0 ? `Meta ${META}% · cumplida (${fmtPts(r.vsMeta)})` : `Meta ${META}% · faltan ${fmtPts(-r.vsMeta, false)}`;
    const brecha = r.brecha === null ? '—' : fmtPts(r.brecha);
    const brechaTxt = r.brecha === null ? 'Sin dato' : r.brecha > 0.05 ? `Las salidas van ${fmtPts(r.brecha, false)} abajo: principal oportunidad` : r.brecha < -0.05 ? `Las entradas van ${fmtPts(-r.brecha, false)} abajo` : 'Entradas y salidas parejas';
    $('kpi-section').innerHTML =
      kpi('Cumplimiento total', fmt(r.total), meta, r.vsMeta !== null && r.vsMeta >= 0 ? '#16a765' : '#ed1c2e') +
      kpi('Vs. semana anterior', rp ? flecha(v) : '—', rp ? `${estado.anterior}: ${fmt(rp.total)}` : 'Sin semana anterior cargada', '#176d98') +
      kpi('Entradas', fmt(r.entradas), rp ? `Antes ${fmt(rp.entradas)} · ${flecha(delta(r.entradas, rp.entradas))}` : 'Registro de entrada', '#16a765') +
      kpi('Salidas', fmt(r.salidas), rp ? `Antes ${fmt(rp.salidas)} · ${flecha(delta(r.salidas, rp.salidas))}` : 'Registro de salida', '#f47b20') +
      kpi('Brecha entrada / salida', brecha, brechaTxt, '#f6b93b') +
      kpi('Tiendas evaluadas', String(r.tiendas), `${r.bajo75} bajo 75% · ${r.cero} en 0%`, '#651418') +
      kpi('Tiendas bajo 75%', String(r.bajo75), rp ? `Antes ${rp.bajo75}` : 'Requieren seguimiento', '#ed1c2e') +
      kpi('Datos fuera de rango', String(r.fuera + r.sinDato), `${r.fuera} mayores a 100% · ${r.sinDato} sin dato`, '#651418');
  }

  // Grafica de lineas en SVG: total de la plaza, entradas, salidas, meta y,
  // si se elige, el total de un asesor.
  function svgTendencia(series, { ancho = 760, alto = 260 } = {}) {
    const puntos = series[0].datos;
    if (!puntos.length) return '<div class="state">Sin semanas para graficar.</div>';
    const pad = { l: 40, r: 44, t: 18, b: 30 };
    const todos = series.flatMap(s => s.datos.map(d => d.v)).filter(Number.isFinite);
    const min = Math.max(0, Math.floor((Math.min(META, ...todos) - 5) / 10) * 10), max = Math.max(100, Math.ceil(Math.max(...todos) / 5) * 5);
    const x = i => pad.l + (puntos.length === 1 ? (ancho - pad.l - pad.r) / 2 : i * (ancho - pad.l - pad.r) / (puntos.length - 1));
    const y = v => pad.t + (max - v) * (alto - pad.t - pad.b) / (max - min);
    const lineas = [];
    for (let v = min; v <= max; v += 10) lineas.push(`<line x1="${pad.l}" x2="${ancho - pad.r}" y1="${y(v)}" y2="${y(v)}" class="d11-grid"/><text x="${pad.l - 6}" y="${y(v) + 4}" class="d11-eje" text-anchor="end">${v}</text>`);
    const meta = `<line x1="${pad.l}" x2="${ancho - pad.r}" y1="${y(META)}" y2="${y(META)}" class="d11-meta"/><text x="${ancho - pad.r}" y="${y(META) - 5}" class="d11-meta-txt" text-anchor="end">Meta ${META}%</text>`;
    const etiquetas = puntos.map((d, i) => `<text x="${x(i)}" y="${alto - 8}" class="d11-eje" text-anchor="middle">${esc(d.s.replace(/^SEM\s*/i, 'S'))}</text>`).join('');
    const trazos = series.map(s => {
      const pts = s.datos.map((d, i) => (Number.isFinite(d.v) ? [x(i), y(d.v), d.v] : null));
      let path = '', abierto = false;
      pts.forEach(p => { if (!p) { abierto = false; return; } path += `${abierto ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`; abierto = true; });
      const ultimo = pts.filter(Boolean).pop();
      return `<path d="${path}" class="d11-linea" style="--c:${s.color};--w:${s.ancho || 2}" ${s.punteada ? 'stroke-dasharray="5 4"' : ''}/>` +
        pts.filter(Boolean).map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="${s.ancho > 2 ? 4 : 3}" style="fill:${s.color}"><title>${esc(s.nombre)}: ${fmt(p[2])}</title></circle>`).join('') +
        (ultimo && s.ancho > 2 ? `<text x="${ultimo[0]}" y="${ultimo[1] - 9}" class="d11-valor" text-anchor="middle">${fmt(ultimo[2])}</text>` : '');
    }).join('');
    return `<svg viewBox="0 0 ${ancho} ${alto}" class="d11-svg" role="img" aria-label="Tendencia de cumplimiento por semana">${lineas.join('')}${meta}${etiquetas}${trazos}</svg>`;
  }
  function seriesTendencia() {
    const base = tendencia(POR_SEMANA, SEMANAS, estado.semana, f => !estado.asesor || String(f[COL.asesor] || '') === estado.asesor);
    const series = [
      { nombre: estado.asesor ? `Total ${estado.asesor}` : 'Total de la plaza', color: '#d91f2d', ancho: 3, datos: base.map(d => ({ s: d.semana, v: d.total })) },
      { nombre: 'Entradas', color: '#16a765', datos: base.map(d => ({ s: d.semana, v: d.entradas })) },
      { nombre: 'Salidas', color: '#f47b20', datos: base.map(d => ({ s: d.semana, v: d.salidas })) }
    ];
    if (estado.trendAsesor && estado.trendAsesor !== estado.asesor) {
      const a = tendencia(POR_SEMANA, SEMANAS, estado.semana, f => String(f[COL.asesor] || '') === estado.trendAsesor);
      series.push({ nombre: estado.trendAsesor, color: '#176d98', ancho: 3, punteada: true, datos: a.map(d => ({ s: d.semana, v: d.total })) });
    }
    return series;
  }
  function renderTendencia() {
    const series = seriesTendencia();
    const ancho = Math.round(Math.min(760, Math.max(320, $('trend-chart').clientWidth || 760)));
    $('trend-chart').innerHTML = svgTendencia(series, { ancho, alto: ancho < 520 ? 240 : 260 });
    $('trend-legend').innerHTML = series.map(s => `<span><i style="--c:${s.color}"${s.punteada ? ' class="punteada"' : ''}></i>${esc(s.nombre)}</span>`).join('') + `<span><i class="meta"></i>Meta ${META}%</span>`;
    const n = series[0].datos.length;
    $('trend-chip').textContent = n > 1 ? `${n} semanas` : 'Se llena con cada carga semanal';
  }

  function renderMix(r) {
    const total = Math.max(1, r.tiendas);
    let acum = 0;
    const cortes = RANGOS.slice(0, 3).map(x => { acum += r.rangos[x.id] / total * 100; return acum; });
    const ring = $('mix-ring');
    ['--p1', '--p2', '--p3'].forEach((p, i) => ring.style.setProperty(p, cortes[i] + '%'));
    $('ring-total').textContent = r.tiendas;
    $('mix-chip').textContent = `${r.tiendas} tiendas`;
    $('mix-legend').innerHTML = [...RANGOS, SIN_DATO].filter(x => x !== SIN_DATO || r.rangos[x.id]).map(x =>
      `<button type="button" class="legend-row" data-rango="${esc(x.id)}" aria-pressed="${estado.rango === x.id}"><i style="--c:${x.color}"></i><span>${esc(x.id)} <small>${esc(x.etiqueta)}</small></span><b>${r.rangos[x.id]}</b><em>${Math.round(r.rangos[x.id] / total * 100)}%</em></button>`).join('');
  }

  function renderAsesores(lista) {
    const hayAnterior = Boolean(estado.anterior);
    $('advisor-chip').textContent = `${lista.length} asesores · ${lista.filter(a => a.foco).length} en foco`;
    const fila = (a, i) => {
      const rg = rangoDe(a.total);
      const cumplio = a.cumplio === null ? '<span class="d11-tag d11-tag--na">—</span>'
        : a.cumplio ? `<span class="d11-tag d11-tag--si" title="Tenía ${fmt(a.compromisoAnterior)}">Sí</span>` : `<span class="d11-tag d11-tag--no" title="Tenía ${fmt(a.compromisoAnterior)}">No · ${fmt(a.compromisoAnterior)}</span>`;
      return `<tr class="${a.foco ? 'is-foco' : ''}${estado.asesor === a.nombre ? ' is-sel' : ''}" data-asesor="${esc(a.nombre)}">
        <td class="d11-n">${i + 1}</td>
        <td class="d11-asesor d11-cab"><button type="button" class="d11-link" data-asesor="${esc(a.nombre)}">${esc(a.nombre)}</button>${a.foco ? '<span class="d11-foco">FOCO</span>' : ''}<small>${a.tiendas} tiendas</small></td>
        <td class="pct" data-l="Total" style="color:${rg.color}">${fmt(a.total)}</td>
        <td data-l="Vs. anterior">${hayAnterior ? flecha(a.variacion) : '—'}</td>
        <td class="pct d11-desk" data-l="Entradas">${fmt(a.entradas)}</td>
        <td class="pct d11-desk" data-l="Salidas">${fmt(a.salidas)}</td>
        ${RANGOS.map(x => `<td class="d11-rango d11-desk"><span style="--c:${x.color}">${a.rangos[x.id]}</span></td>`).join('')}
        <td class="d11-movil d11-ancho" data-l="Tiendas por rango"><span class="d11-pills">${RANGOS.map(x => `<span class="d11-rango"><span style="--c:${x.color}" title="${esc(x.etiqueta)}">${esc(x.etiqueta)} · ${a.rangos[x.id]}</span></span>`).join('')}</span></td>
        <td class="d11-movil" data-l="Entradas / salidas">${fmt(a.entradas)} / ${fmt(a.salidas)}</td>
        <td class="pct" data-l="Compromiso sig.">${fmt(a.compromiso)}</td>
        <td data-l="¿Cumplió?">${hayAnterior ? cumplio : '—'}</td>
      </tr>`;
    };
    $('advisor-table').querySelector('tbody').innerHTML = lista.length ? lista.map(fila).join('')
      : `<tr><td colspan="${10 + RANGOS.length}"><div class="state">Sin asesores con estos filtros.</div></td></tr>`;
  }

  const VISTAS = {
    criticas: { nombre: 'Críticas (<50%)', ok: f => f._t !== null && f._t < 50 },
    cero: { nombre: '0% · sin registro', ok: f => f._t === 0 },
    bajaron: { nombre: 'Bajaron de rango', ok: (f, cambio) => Boolean(cambio && cambio.bajo) }
  };
  function renderTiendas(filas, cambios) {
    const vista = VISTAS[estado.vista];
    const lista = filas.filter(filtrosTienda).filter(f => !vista || vista.ok(f, cambios.get(claveTienda(f, COL))))
      .sort((a, b) => (a._t ?? -1) - (b._t ?? -1));
    const criticas = filas.filter(f => f._t !== null && f._t < 50).length, ceros = filas.filter(f => f._t === 0).length;
    const bajaron = filas.filter(f => cambios.get(claveTienda(f, COL))?.bajo).length;
    $('store-views').innerHTML = [['', 'Todas', filas.length], ['criticas', 'Críticas <50%', criticas], ['cero', '0% sin registro', ceros], ['bajaron', 'Bajaron de rango', estado.anterior ? bajaron : '—']]
      .map(([id, txt, n]) => `<button type="button" class="d11-chip" data-vista="${id}" aria-pressed="${estado.vista === id}">${txt} <b>${n}</b></button>`).join('');
    $('result-count').textContent = `${lista.length} tiendas${vista ? ` · ${vista.nombre}` : ''}`;
    $('detail-table').querySelector('tbody').innerHTML = lista.length ? lista.map(f => {
      const rg = rangoDe(f._t), cambio = cambios.get(claveTienda(f, COL)), calidad = calidadDe(f, COL);
      const mov = !cambio ? '<span class="d11-mut">Nueva</span>' : cambio.bajo ? `<span class="d11-baja">▼ de ${esc(cambio.antes.id)}</span>` : cambio.ahora.orden > cambio.antes.orden ? `<span class="d11-sube">▲ de ${esc(cambio.antes.id)}</span>` : '<span class="d11-mut">Igual</span>';
      return `<tr><td class="store d11-cab"><strong>${esc(f[COL.tienda] || '—')}</strong><small>${esc(f[COL.plaza] || '')}</small></td>
        <td class="d11-ancho" data-l="Asesor">${esc(f[COL.asesor] || '—')}</td>
        <td class="pct" data-l="Entradas">${fmt(f._e)}</td><td class="pct" data-l="Salidas">${fmt(f._s)}</td><td class="pct" data-l="Total" style="color:${rg.color}">${fmt(f._t)}</td>
        <td data-l="Vs. anterior">${cambio ? flecha(cambio.variacion) : '—'}</td>
        <td data-l="Rango"><span class="status" style="--bg:${rg.color}22;--fg:${rg.color}">${esc(rg.id)}</span></td>
        <td data-l="Cambio">${estado.anterior ? mov : '—'}</td>
        <td class="d11-ancho${calidad.length ? '' : ' d11-vacio'}" data-l="Calidad">${calidad.length ? `<span class="quality">${esc(calidad.join(' · '))}</span>` : '—'}</td></tr>`;
    }).join('') : '<tr><td colspan="9"><div class="state">No hay tiendas que coincidan con los filtros.</div></td></tr>';
  }

  function renderCalidad(filas) {
    const lista = filas.filter(filtrosTienda).map(f => ({ f, motivos: calidadDe(f, COL) })).filter(x => x.motivos.length)
      .sort((a, b) => String(a.f[COL.asesor] || '').localeCompare(String(b.f[COL.asesor] || ''), 'es'));
    $('quality-chip').textContent = lista.length ? `${lista.length} por corregir` : 'Todo en orden';
    $('quality-list').innerHTML = lista.length ? `<table class="tbl d11-calidad d11-tarjetas"><thead><tr><th>Tienda</th><th>Asesor</th><th>Entradas</th><th>Salidas</th><th>Total</th><th>Qué corregir</th></tr></thead><tbody>${lista.map(({ f, motivos }) =>
      `<tr><td class="store d11-cab"><strong>${esc(f[COL.tienda])}</strong></td><td class="d11-ancho" data-l="Asesor">${esc(f[COL.asesor] || '—')}</td><td class="pct" data-l="Entradas">${fmt(f._e)}</td><td class="pct" data-l="Salidas">${fmt(f._s)}</td><td class="pct" data-l="Total">${fmt(f._t)}</td><td class="d11-ancho" data-l="Qué corregir"><span class="quality">${esc(motivos.join(' · '))}</span></td></tr>`).join('')}</tbody></table>`
      : '<div class="state">Ninguna tienda con más de 100% ni sin dato esta semana.</div>';
  }

  function renderPlazas() {
    const lista = plazas(REGION_POR_SEMANA.get(estado.semana) || [], REGION_POR_SEMANA.get(estado.anterior) || [], COL);
    const activa = lista.find(p => OXXO.matchesScopeValue(p.plaza, 'plaza'));
    const pos = activa ? lista.indexOf(activa) + 1 : null;
    $('plazas-chip').textContent = activa && OXXO.getActiveDataScope().level !== 'region' ? `${activa.plaza}: lugar ${pos} de ${lista.length}` : `${lista.length} plazas`;
    $('plazas-list').innerHTML = lista.length ? lista.map((p, i) => {
      const rg = rangoDe(p.total), mia = p === activa && OXXO.getActiveDataScope().level !== 'region';
      return `<div class="d11-plaza${mia ? ' is-mia' : ''}"><span class="d11-plaza__pos">${i + 1}</span><span class="d11-plaza__nombre">${esc(p.plaza)}</span>
        <span class="d11-plaza__bar"><i style="width:${Math.min(100, Math.max(0, p.total)).toFixed(1)}%;--c:${rg.color}"></i><b style="left:${META}%"></b></span>
        <span class="pct">${fmt(p.total)}</span><span class="d11-plaza__var">${estado.anterior ? flecha(p.variacion) : ''}</span></div>`;
    }).join('') : '<div class="state">Sin datos de la región para esta semana.</div>';
    // Resumen bajo la lista: cuanto le falta a la plaza para el 1.er lugar,
    // el promedio de la region y la meta.
    const region = resumen(REGION_POR_SEMANA.get(estado.semana) || []);
    const mia = activa && OXXO.getActiveDataScope().level !== 'region' ? activa : null, lider = lista[0];
    const dato = (t, v, sub) => `<div class="d11-resumen__dato"><span>${t}</span><b>${v}</b><small>${sub}</small></div>`;
    $('plazas-resumen').innerHTML = lista.length ? [
      dato('Promedio región', fmt(region.total), `${region.tiendas} tiendas · ${lista.length} plazas`),
      mia ? dato(pos === 1 ? 'Ventaja sobre el 2.º' : 'Para el 1.er lugar', pos === 1 ? (lista[1] ? fmtPts(mia.total - lista[1].total) : '—') : fmtPts(lider.total - mia.total, false), pos === 1 ? (lista[1] ? `contra ${esc(lista[1].plaza)}` : '') : `${esc(lider.plaza)} va en ${fmt(lider.total)}`)
        : dato('Mejor plaza', esc(lider.plaza), fmt(lider.total)),
      dato(mia ? `${esc(mia.plaza)} vs. región` : 'Región vs. meta', mia ? fmtPts(mia.total - region.total) : fmtPts(region.vsMeta), mia ? `${mia.total >= region.total ? 'arriba' : 'abajo'} del promedio` : `meta ${META}%`)
    ].join('') : '';
  }

  /* ---------- lamina PNG ---------- */
  // Version para presentar: 1920x1080 con encabezado, KPIs, tendencia y
  // tabla de asesores, tal como se ve en el dashboard para la semana elegida.
  function exportarLamina() {
    if (!ULTIMO) return;
    const { semana, r, rp, asesores } = ULTIMO;
    const W = 1920, H = 1080, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    const F = (peso, px) => `${peso} ${px}px "Barlow", "Inter", Arial, sans-serif`;
    g.fillStyle = '#f7f3ef'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#b51224'; g.fillRect(0, 0, W, 120);
    g.fillStyle = '#ffd200'; g.fillRect(0, 120, W, 6);
    g.fillStyle = '#fff'; g.font = F(800, 46); g.fillText('Cumplimiento de Marcajes', 60, 70);
    g.font = F(600, 24); g.fillText(`${OXXO.getScopeLabel()} · ${semana}${estado.anterior ? ` vs ${estado.anterior}` : ''}${estado.asesor ? ` · ${estado.asesor}` : ''}`, 60, 104);
    g.textAlign = 'right'; g.font = F(700, 22); g.fillText(`Meta ${META}%`, W - 60, 70); g.textAlign = 'left';
    const v = rp ? delta(r.total, rp.total) : null;
    const cajas = [
      ['Cumplimiento total', fmt(r.total), r.vsMeta === null ? '' : r.vsMeta >= 0 ? `Meta cumplida ${fmtPts(r.vsMeta)}` : `Faltan ${fmtPts(-r.vsMeta, false)} para ${META}%`, r.vsMeta !== null && r.vsMeta >= 0 ? '#16a765' : '#ed1c2e'],
      ['Vs. semana anterior', v === null ? '—' : `${v >= 0 ? '▲' : '▼'} ${fmtPts(Math.abs(v), false)}`, rp ? `${estado.anterior}: ${fmt(rp.total)}` : 'Sin semana anterior', v === null ? '#5c514b' : v >= 0 ? '#16a765' : '#ed1c2e'],
      ['Entradas', fmt(r.entradas), 'Registro de entrada', '#16a765'],
      ['Salidas', fmt(r.salidas), 'Registro de salida', '#f47b20'],
      ['Brecha E/S', r.brecha === null ? '—' : fmtPts(r.brecha), r.brecha > 0 ? 'Salidas abajo' : 'Parejas', '#f6b93b'],
      ['Tiendas', String(r.tiendas), `${r.bajo75} bajo 75% · ${r.fuera + r.sinDato} a corregir`, '#651418']
    ];
    const cw = (W - 120 - 5 * 20) / 6;
    cajas.forEach(([t, val, sub, color], i) => {
      const x = 60 + i * (cw + 20), y = 156;
      g.fillStyle = '#fff'; g.fillRect(x, y, cw, 150); g.fillStyle = color; g.fillRect(x, y, 8, 150);
      g.fillStyle = '#6f625c'; g.font = F(700, 18); g.fillText(t.toUpperCase(), x + 26, y + 36);
      g.fillStyle = '#2b1d18'; g.font = F(800, 54); g.fillText(val, x + 26, y + 98);
      g.fillStyle = '#6f625c'; g.font = F(600, 17); g.fillText(sub, x + 26, y + 132, cw - 40);
    });
    // Tendencia
    const img = new Image();
    const svg = svgTendencia(seriesTendencia(), { ancho: 900, alto: 560 })
      .replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="560" ')
      .replace('>', `><style>.d11-grid{stroke:#e5ddd6}.d11-eje{fill:#6f625c;font:600 15px Arial}.d11-meta{stroke:#2b1d18;stroke-dasharray:8 6;stroke-width:2}.d11-meta-txt{fill:#2b1d18;font:700 15px Arial}.d11-linea{fill:none;stroke:var(--c);stroke-width:calc(var(--w)*1.4)}.d11-valor{fill:#2b1d18;font:800 18px Arial}</style>`);
    g.fillStyle = '#fff'; g.fillRect(60, 336, 940, 660);
    g.fillStyle = '#2b1d18'; g.font = F(800, 26); g.fillText('Tendencia semanal', 84, 378);
    const tabla = () => {
      const x0 = 1030, y0 = 336, w = W - 60 - x0;
      g.fillStyle = '#fff'; g.fillRect(x0, y0, w, 660);
      g.fillStyle = '#2b1d18'; g.font = F(800, 26); g.fillText('Asesores', x0 + 24, y0 + 42);
      const cols = [['Asesor', 24], ['Total', 330], ['Var.', 430], ['<50', 540], ['Compromiso', 610], ['Cumplió', 750]];
      g.font = F(700, 16); g.fillStyle = '#6f625c'; cols.forEach(([t, dx]) => g.fillText(t.toUpperCase(), x0 + dx, y0 + 80));
      const filas = asesores.slice(0, 13);
      filas.forEach((a, i) => {
        const y = y0 + 118 + i * 40;
        if (a.foco) { g.fillStyle = '#fde8ea'; g.fillRect(x0 + 10, y - 26, w - 20, 36); }
        g.fillStyle = '#2b1d18'; g.font = F(700, 18);
        const nombre = a.nombre.length > 24 ? a.nombre.slice(0, 23) + '…' : a.nombre;
        g.fillText(nombre, x0 + 24, y);
        if (a.foco) { g.fillStyle = '#ed1c2e'; g.font = F(800, 13); g.fillText('FOCO', x0 + 270, y); }
        g.fillStyle = rangoDe(a.total).color; g.font = F(800, 20); g.fillText(fmt(a.total), x0 + 330, y);
        g.font = F(700, 18); g.fillStyle = a.variacion === null ? '#6f625c' : a.variacion >= 0 ? '#16864f' : '#bd1625';
        g.fillText(a.variacion === null ? '—' : `${a.variacion >= 0 ? '▲' : '▼'}${Math.abs(a.variacion).toFixed(1)}`, x0 + 430, y);
        g.fillStyle = '#2b1d18'; g.fillText(String(a.rangos.Critico), x0 + 540, y); g.fillText(fmt(a.compromiso), x0 + 610, y);
        g.fillStyle = a.cumplio === null ? '#6f625c' : a.cumplio ? '#16864f' : '#bd1625'; g.fillText(a.cumplio === null ? '—' : a.cumplio ? 'Sí' : 'No', x0 + 750, y);
      });
      if (asesores.length > filas.length) { g.fillStyle = '#6f625c'; g.font = F(600, 16); g.fillText(`+${asesores.length - filas.length} asesores más en el dashboard`, x0 + 24, y0 + 640); }
      g.fillStyle = '#6f625c'; g.font = F(600, 16);
      g.fillText(`Compromiso = total actual +${COMPROMISO_PTS} pts (tope 100%). FOCO: bajo 75% o cayó ${FOCO_CAIDA} pts o más.`, 60, H - 30);
      g.textAlign = 'right'; g.fillText(`Generado ${new Date().toLocaleDateString('es-MX')} · Dashboards Ats`, W - 60, H - 30); g.textAlign = 'left';
      cv.toBlob(b => {
        const a = document.createElement('a'); a.href = URL.createObjectURL(b);
        a.download = `D11-Marcajes-${OXXO.getScopeLabel().replace(/\s+/g, '_')}-${semana.replace(/\s+/g, '')}.png`;
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      }, 'image/png');
    };
    const leyenda = () => {
      let x = 84;
      [...seriesTendencia().map(s => [s.nombre, s.color, s.punteada]), [`Meta ${META}%`, '#2b1d18', true]].forEach(([n, color, punteada]) => {
        g.strokeStyle = color; g.lineWidth = 4; g.setLineDash(punteada ? [8, 6] : []);
        g.beginPath(); g.moveTo(x, 970); g.lineTo(x + 30, 970); g.stroke(); g.setLineDash([]);
        g.fillStyle = '#4a3d38'; g.font = F(600, 16);
        const t = n.length > 28 ? n.slice(0, 27) + '…' : n; g.fillText(t, x + 38, 976); x += 38 + g.measureText(t).width + 26;
      });
    };
    img.onload = () => { g.drawImage(img, 80, 400); leyenda(); tabla(); };
    img.onerror = () => { leyenda(); tabla(); };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  /* ---------- eventos ---------- */
  function poblarSelect(id, opciones, primera) {
    const sel = $(id), previo = sel.value;
    sel.innerHTML = (primera ? `<option value="">${esc(primera)}</option>` : '') + opciones.map(o => `<option value="${esc(o)}">${esc(o)}</option>`).join('');
    if (opciones.includes(previo)) sel.value = previo;
  }
  function poblarAsesores() {
    const nombres = [...new Set(SCOPE_ROWS.filter(esAsesorDeLaPlaza).map(f => String(f[COL.asesor] || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
    poblarSelect('filtro-asesor', nombres, 'Todos los asesores');
    poblarSelect('trend-asesor', nombres, 'Sin asesor');
    if (!nombres.includes(estado.asesor)) estado.asesor = $('filtro-asesor').value = '';
  }
  function conectar() {
    $('filtro-semana').addEventListener('change', e => { estado.semana = e.target.value; render(); });
    $('filtro-asesor').addEventListener('change', e => { estado.asesor = e.target.value; render(); });
    $('filtro-estatus').addEventListener('change', e => { estado.rango = e.target.value; render(); });
    $('filtro-tienda').addEventListener('input', e => { estado.q = norm(e.target.value); render(); });
    $('trend-asesor').addEventListener('change', e => { estado.trendAsesor = e.target.value; renderTendencia(); });
    $('limpiar').addEventListener('click', () => {
      Object.assign(estado, { asesor: '', rango: '', vista: '', q: '', trendAsesor: '' });
      ['filtro-asesor', 'filtro-estatus', 'filtro-tienda', 'trend-asesor'].forEach(id => { $(id).value = ''; });
      render();
    });
    $('exportar-lamina').addEventListener('click', exportarLamina);
    $('store-views').addEventListener('click', e => { const b = e.target.closest('[data-vista]'); if (!b) return; estado.vista = b.dataset.vista; render(); });
    $('mix-legend').addEventListener('click', e => { const b = e.target.closest('[data-rango]'); if (!b) return; estado.rango = estado.rango === b.dataset.rango ? '' : b.dataset.rango; $('filtro-estatus').value = estado.rango; render(); });
    $('advisor-table').addEventListener('click', e => { const b = e.target.closest('button[data-asesor]'); if (!b) return; estado.asesor = estado.asesor === b.dataset.asesor ? '' : b.dataset.asesor; $('filtro-asesor').value = estado.asesor; render(); });
  }

  async function iniciar({ esAsesor, columnas, filasRegion }) {
    COL = columnas; esAsesorDeLaPlaza = esAsesor;
    ALL = leerFilas(filasRegion, COL, OXXO.metricsNum);
    SCOPE_ROWS = OXXO.filterRowsByDataScope(ALL);
    POR_SEMANA = agruparPorSemana(SCOPE_ROWS.filter(esAsesorDeLaPlaza));
    REGION_POR_SEMANA = agruparPorSemana(ALL);
    SEMANAS = ordenarSemanas([...POR_SEMANA.keys()]);
    estado.semana = SEMANAS[SEMANAS.length - 1] || '';
    poblarSelect('filtro-semana', SEMANAS.slice().reverse());
    $('filtro-semana').value = estado.semana;
    poblarAsesores();
    render();
  }
  conectar();
  // Al girar el celular o cambiar el ancho, la grafica se redibuja a su medida.
  let anchoPrevio = 0;
  addEventListener('resize', () => { const w = $('trend-chart').clientWidth; if (ULTIMO && Math.abs(w - anchoPrevio) > 40) { anchoPrevio = w; renderTendencia(); } });

  // Para Descargar (Excel): lo que se ve, en hojas separadas.
  function hojasExcel() {
    if (!ULTIMO) return [];
    const { asesores } = ULTIMO;
    return [
      { name: 'Encabezado', rows: OXXO.scrapeKpiCards('kpi-section') },
      { name: 'Asesores', rows: asesores.map((a, i) => ({ Lugar: i + 1, Asesor: a.nombre, Tiendas: a.tiendas, 'Total %': a.total, 'Variación pts': a.variacion, 'Entradas %': a.entradas, 'Salidas %': a.salidas, '>90%': a.rangos.Sobresaliente, '75-90%': a.rangos['En seguimiento'], '50-75%': a.rangos.Prioridad, '<50%': a.rangos.Critico, 'Compromiso siguiente %': a.compromiso, 'Compromiso anterior %': a.compromisoAnterior, 'Cumplió': a.cumplio === null ? '' : a.cumplio ? 'Sí' : 'No', FOCO: a.foco ? 'Sí' : '' })) },
      { name: 'Tiendas', rows: OXXO.scrapeHtmlTable('#detail-table') }
    ];
  }
  window.OXXO_D11_PAGINA = { iniciar, render, hojasExcel, exportarLamina, estado };
})();
