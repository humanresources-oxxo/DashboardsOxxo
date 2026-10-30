/* ==========================================================
   CUOTA SINDICAL — dashboard aparte del area Administrativo
   Consumido por: dashboards/cuota-sindical.html.

   Muy aparte de los demas tableros: sus datos NO viven en el libro de los
   dashboards sino en un libro privado propio del Apps Script
   (CUOTA_SINDICAL_SPREADSHEET_ID). Ningun otro dashboard lo lee.

   La afiliacion sindical es un dato personal sensible. El Excel completo
   (con nombres) solo va a la hoja "Base" del libro privado; el dashboard lee
   unicamente TOTALES por mes, division, tienda y puesto, que se calculan
   aqui mismo en el navegador (las personas solo se cuentan).

   Se actualiza desde esta pagina o desde el panel admin (area
   Administrativo); las dos usan subirExcel.

   Uso: OXXO_CUOTA.agregar(filasExcel) -> { detalle, resumen, meta },
   OXXO_CUOTA.subirExcel(archivo, adminPassword, alAvanzar),
   OXXO_CUOTA.montar() para la pagina, OXXO_CUOTA.montarAdmin() para el panel.
   ========================================================== */
(function () {
  'use strict';

  // Lo que se publica (filas de arreglos, en este orden).
  const DETALLE_HEADERS = ['Mes', 'Division', 'Tienda', 'Funcion', 'Importe', 'Personas', 'Movimientos', 'Devoluciones', 'ImporteDevoluciones', 'Reversos'];
  const RESUMEN_HEADERS = ['Mes', 'Division', 'Personas', 'PersonasSinDescuento', 'SemanasPagadas', 'Importe', 'Movimientos', 'Devoluciones', 'ImporteDevoluciones', 'Reversos'];
  // Fila de resumen con la plaza completa: una persona que cambio de division
  // en el mes cuenta una sola vez.
  const TODAS = 'Todas';
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const ENTRENAMIENTO = 'Entrenamiento / Operaciones';

  const norm = v => String(v == null ? '' : v).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const limpio = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  const redondear = n => Math.round(n * 100) / 100;
  function clave(fila, alias) {
    const mapa = new Map(Object.keys(fila || {}).map(k => [norm(k), k]));
    for (const a of alias) if (mapa.has(norm(a))) return mapa.get(norm(a));
    return '';
  }
  function numero(v) {
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
    const t = String(v == null ? '' : v).replace(/[$\s]/g, '').replace(/,/g, '');
    const n = Number(t);
    return Number.isFinite(n) ? n : 0;
  }
  function fecha(v) {
    if (v instanceof Date && !isNaN(v.getTime())) return v;
    if (typeof v === 'number' && v > 20000) return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
    const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})/) || String(v || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (!m) return null;
    return m[1].length === 4 ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  }
  const iso = d => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  // "10. Octubre" + 2025 -> "2025-10"; si no, el mes de la fecha de pago.
  function mesDe(anio, mes, pago) {
    const a = parseInt(anio, 10);
    let m = parseInt(String(mes || ''), 10);
    if (!m) { const i = MESES.findIndex(nombre => norm(mes).includes(nombre)); if (i >= 0) m = i + 1; }
    if (a > 2000 && m >= 1 && m <= 12) return `${a}-${String(m).padStart(2, '0')}`;
    return pago ? iso(pago).slice(0, 7) : '';
  }

  // Filas del Excel de nomina (objetos por encabezado) -> totales sin datos
  // personales. Importe del Excel: negativo = descuento, positivo = devolucion.
  // En lo publicado, Importe es lo descontado neto (positivo).
  function agregar(filas) {
    filas = (filas || []).filter(f => f && Object.values(f).some(v => limpio(v)));
    if (!filas.length) throw new Error('El Excel no trae filas');
    const muestra = filas[0];
    const k = {
      persona: clave(muestra, ['Número de personal', 'Numero de personal', 'No. personal', 'Nº personal']),
      division: clave(muestra, ['Texto división de personal', 'Texto division de personal', 'División', 'Division']),
      tienda: clave(muestra, ['Texto breve de unidad organizativa', 'Unidad organizativa texto', 'Tienda']),
      funcion: clave(muestra, ['Denominación función', 'Denominacion funcion', 'Función', 'Puesto']),
      importe: clave(muestra, ['Importe']),
      cantidad: clave(muestra, ['Cantidad']),
      anio: clave(muestra, ['Año', 'Anio']),
      mes: clave(muestra, ['Mes']),
      pago: clave(muestra, ['Fecha de pago']),
      concepto: clave(muestra, ['Texto expl.CC-nómina', 'Texto expl.CC-nomina', 'Textos homologados']),
    };
    const faltan = [['persona', 'Número de personal'], ['tienda', 'Texto breve de unidad organizativa'], ['importe', 'Importe']]
      .filter(([c]) => !k[c]).map(([, nombre]) => nombre);
    if (!k.pago && !(k.anio && k.mes)) faltan.push('Año y Mes (o Fecha de pago)');
    if (faltan.length) throw new Error('Al Excel le faltan columnas: ' + faltan.join(', '));

    const detalle = new Map(), resumen = new Map();
    const meta = { filas: filas.length, otroConcepto: 0, sinMes: 0, mesesOmitidos: [] };
    const caja = (mapa, llave, base) => { if (!mapa.has(llave)) mapa.set(llave, { ...base, importe: 0, personas: new Set(), movimientos: 0, devoluciones: 0, importeDevoluciones: 0, reversos: 0 }); return mapa.get(llave); };
    const sumar = (g, persona, importe, cantidad) => {
      g.importe -= importe; g.movimientos++; g.personas.add(persona);
      if (importe > 0) { g.devoluciones++; g.importeDevoluciones += importe; }
      if (cantidad < 0) g.reversos++;
    };
    filas.forEach(f => {
      if (k.concepto && !/cuota\s*sindical/i.test(limpio(f[k.concepto]))) { meta.otroConcepto++; return; }
      const pago = k.pago ? fecha(f[k.pago]) : null;
      const mes = mesDe(k.anio && f[k.anio], k.mes && f[k.mes], pago);
      if (!mes) { meta.sinMes++; return; }
      const persona = limpio(f[k.persona]);
      const division = limpio(k.division && f[k.division]) || 'Sin división';
      const tienda = limpio(f[k.tienda]) || 'Sin tienda';
      const funcion = limpio(k.funcion && f[k.funcion]) || 'Sin puesto';
      const importe = numero(f[k.importe]), cantidad = k.cantidad ? numero(f[k.cantidad]) : 0;
      sumar(caja(detalle, [mes, division, tienda, funcion].join('|'), { mes, division, tienda, funcion }), persona, importe, cantidad);
      [division, TODAS].forEach(d => {
        const g = caja(resumen, mes + '|' + d, { mes, division: d, netoPorPersona: new Map(), pagos: new Set() });
        sumar(g, persona, importe, cantidad);
        g.netoPorPersona.set(persona, (g.netoPorPersona.get(persona) || 0) + importe);
        // Semanas pagadas del mes: los ajustes traen la fecha de pago de la semana
        // original y hay pagos sueltos entre semana; cada pago cuenta por el
        // domingo de su semana.
        if (pago && iso(pago).slice(0, 7) === mes) g.pagos.add(iso(new Date(pago.getTime() + ((7 - pago.getUTCDay()) % 7) * 86400000)));
      });
    });
    // Un mes que neto no descuenta nada (p. ej. solo reversos que se cancelan)
    // no se publica: se avisa en meta.
    const omitidos = new Set([...resumen.values()].filter(g => g.division === TODAS && Math.abs(g.importe) < 0.005).map(g => g.mes));
    meta.mesesOmitidos = [...omitidos].sort();
    const det = [...detalle.values()].filter(g => !omitidos.has(g.mes))
      .sort((a, b) => a.mes.localeCompare(b.mes) || a.division.localeCompare(b.division) || a.tienda.localeCompare(b.tienda) || a.funcion.localeCompare(b.funcion))
      .map(g => [g.mes, g.division, g.tienda, g.funcion, redondear(g.importe), g.personas.size, g.movimientos, g.devoluciones, redondear(g.importeDevoluciones), g.reversos]);
    const res = [...resumen.values()].filter(g => !omitidos.has(g.mes))
      .sort((a, b) => a.mes.localeCompare(b.mes) || (a.division === TODAS) - (b.division === TODAS) || a.division.localeCompare(b.division))
      .map(g => [g.mes, g.division, g.personas.size, [...g.netoPorPersona.values()].filter(v => v >= -0.005).length, g.pagos.size,
        redondear(g.importe), g.movimientos, g.devoluciones, redondear(g.importeDevoluciones), g.reversos]);
    const meses = [...new Set(res.map(r => r[0]))];
    meta.meses = meses.length;
    meta.desde = meses[0] || '';
    meta.hasta = meses[meses.length - 1] || '';
    meta.total = redondear(res.filter(r => r[1] === TODAS).reduce((s, r) => s + r[5], 0));
    return { detalle: det, resumen: res, meta };
  }

  // ── Apps Script ──
  async function pedir(cuerpo) {
    const url = window.OXXO_CONFIG && window.OXXO_CONFIG.ADMIN_UPLOAD_URL;
    if (!url) throw new Error('el Apps Script no está configurado');
    // text/plain evita la consulta previa de CORS que Apps Script no contesta.
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(cuerpo) });
    const datos = await r.json().catch(() => null);
    if (!r.ok || !datos || datos.ok === false) {
      const motivo = (datos && datos.error) || 'el servidor no respondió';
      // Un Apps Script anterior a v62 no conoce la carga del Excel completo.
      throw new Error(/no autorizado/i.test(motivo) && cuerpo.action !== 'publicarCuotaSindical' ? 'falta publicar la versión 62 del Apps Script' : motivo);
    }
    return datos;
  }

  // Excel -> encabezados y filas (fechas como AAAA-MM-DD), sin filas vacias.
  function leerExcel(libro) {
    const hoja = libro.Sheets[libro.SheetNames[0]];
    const matriz = window.XLSX.utils.sheet_to_json(hoja, { header: 1, defval: '', raw: true });
    const headers = (matriz.shift() || []).map(h => limpio(h));
    while (headers.length && !headers[headers.length - 1]) headers.pop();
    const filas = matriz.filter(f => f.some(v => limpio(v)))
      .map(f => headers.map((_, i) => { const v = f[i]; return v instanceof Date ? iso(fecha(v)) : (v == null ? '' : v); }));
    return { headers, filas };
  }

  // Carga completa: el Excel entero a la Base del libro privado (por partes,
  // a una hoja temporal) y, al final, los totales del dashboard.
  const POR_PARTE = 8000;
  async function subirExcel(archivo, adminPassword, alAvanzar) {
    const avisar = alAvanzar || (() => {});
    avisar('Leyendo el Excel…');
    await window.OXXO_ADMIN_ASSETS.ensure('xlsx');
    const libro = window.XLSX.read(await archivo.arrayBuffer(), { type: 'array', cellDates: true });
    const { headers, filas } = leerExcel(libro);
    const datos = agregar(filas.map(f => Object.fromEntries(headers.map((h, i) => [h, f[i]]))));
    const { cargaId } = await pedir({ action: 'publicarCuotaSindical', fase: 'inicio', adminPassword, headers, totalFilas: filas.length });
    for (let desde = 0; desde < filas.length; desde += POR_PARTE) {
      avisar(`Subiendo el Excel a la hoja… ${Math.round(desde / filas.length * 100)}% (${desde.toLocaleString('es-MX')} de ${filas.length.toLocaleString('es-MX')} filas)`);
      await pedir({ action: 'publicarCuotaSindical', fase: 'filas', adminPassword, cargaId, desde, filas: filas.slice(desde, desde + POR_PARTE) });
    }
    avisar(`Publicando los totales de ${datos.meta.meses} meses (${fmtDinero(datos.meta.total)})…`);
    const fin = await pedir({ action: 'publicarCuotaSindical', fase: 'fin', adminPassword, cargaId, archivo: archivo.name, detalle: datos.detalle, resumen: datos.resumen, meta: datos.meta });
    return { meta: datos.meta, url: fin.url || '' };
  }
  function resumenCarga(meta) {
    const extra = [meta.mesesOmitidos.length ? `se omitió ${meta.mesesOmitidos.map(m => fmtMes(m)).join(', ')} (neto $0)` : '', meta.otroConcepto ? `${fmtNum(meta.otroConcepto)} filas de otro concepto` : ''].filter(Boolean).join('; ');
    return `${fmtNum(meta.filas)} filas del Excel en la hoja Base, ${meta.meses} meses (${fmtDinero(meta.total)}).${extra ? ' Nota: ' + extra + '.' : ''}`;
  }

  // ── Pagina ──
  const fmtDinero = v => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(v || 0);
  const fmtCompacto = v => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', notation: 'compact', maximumFractionDigits: 1 }).format(v || 0);
  const fmtNum = v => Math.round(v || 0).toLocaleString('es-MX');
  const esc = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  function fmtMes(m, corto) {
    const x = String(m || '').match(/^(\d{4})-(\d{2})$/);
    if (!x) return m || '—';
    return new Intl.DateTimeFormat('es-MX', corto ? { month: 'short', year: '2-digit' } : { month: 'long', year: 'numeric' }).format(new Date(+x[1], +x[2] - 1, 1));
  }
  const aObjetos = (headers, filas) => (filas || []).map(f => Object.fromEntries(headers.map((h, i) => [h, f[i]])));

  function montar() {
    const $ = id => document.getElementById(id);
    const charts = {};
    let detalle = [], resumen = [], carga = null, catalogo = null;
    let filtradas = [];
    let pagina = 1, porPagina = 25;
    const orden = { key: 'importe', dir: 'desc' };


    function atDe(tienda) {
      if (OXXO.metricsIsTiendaEntrenamientoOperacionesD2 && OXXO.metricsIsTiendaEntrenamientoOperacionesD2(tienda)) return ENTRENAMIENTO;
      return (catalogo && OXXO.resolveAsesorD1(catalogo, { tienda })) || 'Sin Asesor Asignado';
    }
    function llenar(select, valores, etiqueta) {
      const previo = select.value;
      const primero = select.options[0];
      select.innerHTML = '';
      select.appendChild(primero);
      valores.forEach(v => { const o = document.createElement('option'); o.value = v; o.textContent = etiqueta ? etiqueta(v) : v; select.appendChild(o); });
      if (valores.includes(previo)) select.value = previo;
    }
    const unicos = (lista, key) => [...new Set(lista.map(x => x[key]).filter(Boolean))];
    const suma = (lista, key) => lista.reduce((s, x) => s + (Number(x[key]) || 0), 0);
    function agrupar(lista, key) {
      const mapa = new Map();
      lista.forEach(x => { const n = x[key] || 'Sin dato'; if (!mapa.has(n)) mapa.set(n, []); mapa.get(n).push(x); });
      return [...mapa].map(([nombre, items]) => ({ nombre, items, importe: suma(items, 'importe'), personas: suma(items, 'personas'), devoluciones: suma(items, 'devoluciones'), importeDevoluciones: suma(items, 'importeDevoluciones'), reversos: suma(items, 'reversos') }));
    }

    // Filtros sin el mes (para la tendencia y la comparacion entre meses).
    function filtroBase() {
      const division = $('f-division').value, at = $('f-at').value, funcion = $('f-funcion').value, q = norm($('f-tienda').value);
      return detalle.filter(x => (!division || x.division === division) && (!at || x.at === at) && (!funcion || x.funcion === funcion) && (!q || norm(`${x.tienda} ${x.at}`).includes(q)));
    }
    // Personas exactas solo cuando no hay filtro por debajo de la division:
    // el detalle cuenta personas por tienda y puesto (una persona en dos
    // tiendas del mismo mes sumaria dos).
    function resumenDe(meses) {
      if ($('f-at').value || $('f-funcion').value || $('f-tienda').value) return null;
      const division = $('f-division').value || TODAS;
      const filas = resumen.filter(r => r.division === division && meses.includes(r.mes));
      return filas.length ? filas : null;
    }

    function pintarKpis(base, mes, meses) {
      const delMes = mes ? base.filter(x => x.mes === mes) : base;
      const importe = suma(delMes, 'importe');
      const res = resumenDe(mes ? [mes] : meses);
      const personas = res ? suma(res.map(r => ({ v: r.personas - r.sinDescuento })), 'v') : suma(delMes, 'personas');
      const semanas = res ? suma(res, 'semanas') : 0;
      $('k-total').textContent = fmtCompacto(importe);
      const iMes = meses.indexOf(mes);
      const previo = mes && iMes > 0 ? suma(base.filter(x => x.mes === meses[iMes - 1]), 'importe') : null;
      $('k-total-nota').textContent = previo ? `${importe >= previo ? '▲' : '▼'} ${Math.abs((importe - previo) / previo * 100).toFixed(1)}% vs ${fmtMes(meses[iMes - 1], true)}` : (mes ? 'Primer mes con datos' : 'Todos los meses');
      $('k-personas').textContent = fmtNum(personas);
      $('k-personas-nota').textContent = res ? (mes ? 'Con descuento en el mes' : 'Suma de cada mes') : 'Suma por tienda y puesto';
      $('k-promedio').textContent = personas ? fmtDinero(importe / personas) : '—';
      $('k-semana').textContent = semanas ? fmtCompacto(importe / semanas) : '—';
      $('k-semana-nota').textContent = semanas ? `${semanas} ${semanas === 1 ? 'semana pagada' : 'semanas pagadas'}` : 'Disponible sin filtro de AT, tienda o puesto';
      $('k-ajustes').textContent = fmtNum(suma(delMes, 'devoluciones') + suma(delMes, 'reversos'));
      $('k-ajustes-nota').textContent = `${fmtNum(suma(delMes, 'devoluciones'))} devoluciones (${fmtCompacto(suma(delMes, 'importeDevoluciones'))}) · ${fmtNum(suma(delMes, 'reversos'))} reversos`;
      $('k-acumulado').textContent = fmtCompacto(suma(base, 'importe'));
      $('k-acumulado-nota').textContent = meses.length ? `${fmtMes(meses[0], true)} – ${fmtMes(meses[meses.length - 1], true)}` : '—';
    }

    function grafica(nombre, id, config) {
      if (charts[nombre]) { charts[nombre].destroy(); charts[nombre] = null; }
      const canvas = $(id);
      if (!canvas || typeof Chart === 'undefined') return;
      charts[nombre] = new Chart(canvas.getContext('2d'), config);
    }
    function pintarTendencia(base, meses) {
      const res = resumenDe(meses);
      grafica('tendencia', 'c-tendencia', { type: 'bar', data: { labels: meses.map(m => fmtMes(m, true)), datasets: [
        { label: 'Descontado', data: meses.map(m => suma(base.filter(x => x.mes === m), 'importe')), backgroundColor: meses.map(m => m === $('f-mes').value ? '#B5121B' : 'rgba(181,18,27,.45)'), borderRadius: 7, yAxisID: 'y' },
        { type: 'line', label: res ? 'Personas con descuento' : 'Personas (suma por tienda)', data: meses.map(m => { const r = res && res.find(x => x.mes === m); return r ? r.personas - r.sinDescuento : suma(base.filter(x => x.mes === m), 'personas'); }), borderColor: '#1F3B70', backgroundColor: '#1F3B70', borderWidth: 2.5, pointRadius: 3, tension: .3, yAxisID: 'y1' },
      ] }, options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, usePointStyle: true } }, tooltip: { callbacks: { label: c => c.datasetIndex ? `${c.dataset.label}: ${fmtNum(c.raw)}` : `Descontado: ${fmtDinero(c.raw)}` } } },
        scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { callback: v => fmtCompacto(v) } }, y1: { beginAtZero: true, position: 'right', grid: { display: false } } } } });
    }
    function barras(nombre, id, grupos) {
      grafica(nombre, id, { type: 'bar', data: { labels: grupos.map(g => g.nombre), datasets: [{ data: grupos.map(g => g.importe), backgroundColor: grupos.map((_, i) => `rgba(181,18,27,${Math.max(.35, .92 - i * .07)})`), borderRadius: 6, barThickness: 16 }] },
        options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => `${fmtDinero(c.raw)} · ${fmtNum(grupos[c.dataIndex].personas)} personas` } } },
          scales: { x: { beginAtZero: true, ticks: { callback: v => fmtCompacto(v) } }, y: { grid: { display: false }, ticks: { font: { size: 10, weight: '700' }, callback: function (v) { const t = this.getLabelForValue(v); return t.length > 24 ? t.slice(0, 24) + '…' : t; } } } } } });
    }
    function pintarAts(lista) {
      const grupos = agrupar(lista, 'at').sort((a, b) => b.importe - a.importe);
      $('n-ats').textContent = `${grupos.length} ${grupos.length === 1 ? 'asesor' : 'asesores'}`;
      if (!grupos.length) { $('l-ats').innerHTML = '<div class="inv-panel-empty">Sin datos con estos filtros</div>'; return; }
      const max = Math.max(...grupos.map(g => g.importe), 1);
      $('l-ats').innerHTML = grupos.map(g => `<div class="inv-advisor-row"><div class="inv-advisor-name"><strong>${esc(g.nombre)}</strong><small>${unicos(g.items, 'tienda').length} tiendas · ${fmtNum(g.personas)} personas</small></div>`
        + `<div class="inv-advisor-bar"><i style="width:${Math.max(3, g.importe / max * 100).toFixed(1)}%"></i></div><div class="inv-advisor-value"><strong>${esc(fmtCompacto(g.importe))}</strong><small>${g.personas ? esc(fmtDinero(g.importe / g.personas)) + ' por persona' : ''}</small></div></div>`).join('');
    }
    function pintarRevisar(mes, meses) {
      const res = resumen.filter(r => r.division === ($('f-division').value || TODAS) && (mes ? r.mes === mes : meses.includes(r.mes)));
      const sin = suma(res, 'sinDescuento');
      $('r-revisar').innerHTML = `<li><strong>${fmtNum(sin)}</strong> ${sin === 1 ? 'persona quedó' : 'personas quedaron'} con descuento neto en $0 o a favor${mes ? ' en el mes' : ' (suma de los meses)'}.</li>`
        + `<li><strong>${fmtNum(suma(res, 'devoluciones'))}</strong> devoluciones por <strong>${fmtDinero(suma(res, 'importeDevoluciones'))}</strong>.</li>`
        + `<li><strong>${fmtNum(suma(res, 'reversos'))}</strong> reversos de semanas anteriores.</li>`
        + '<li class="cuota-nota">Por privacidad no se publican nombres: para saber quiénes son, revisa el reporte de nómina.</li>';
    }

    function pintarTabla() {
      const grupos = agrupar(filtradas, 'tienda').map(g => ({ ...g, at: g.items[0].at, division: unicos(g.items, 'division').join(', '), promedio: g.personas ? g.importe / g.personas : 0 }));
      $('n-tiendas').textContent = `${grupos.length} ${grupos.length === 1 ? 'tienda' : 'tiendas'}`;
      document.querySelectorAll('.inv-table th.sortable').forEach(th => {
        const activa = th.dataset.sort === orden.key;
        th.classList.toggle('sort-asc', activa && orden.dir === 'asc');
        th.classList.toggle('sort-desc', activa && orden.dir === 'desc');
        th.setAttribute('aria-sort', activa ? (orden.dir === 'asc' ? 'ascending' : 'descending') : 'none');
      });
      if (!grupos.length) { $('t-tiendas').innerHTML = '<tr><td colspan="7" class="inv-table-message">No hay tiendas con estos filtros.</td></tr>'; $('p-resumen').textContent = 'Sin resultados'; $('p-botones').innerHTML = ''; return; }
      const k = orden.key === 'tienda' ? 'nombre' : orden.key;
      grupos.sort((a, b) => (typeof a[k] === 'number' ? a[k] - b[k] : String(a[k]).localeCompare(String(b[k]), 'es')) * (orden.dir === 'asc' ? 1 : -1));
      const total = Math.max(1, Math.ceil(grupos.length / porPagina));
      pagina = Math.min(pagina, total);
      const inicio = (pagina - 1) * porPagina, filas = grupos.slice(inicio, inicio + porPagina);
      $('t-tiendas').innerHTML = filas.map(g => `<tr><td><strong>${esc(g.nombre)}</strong></td><td>${esc(g.at)}</td><td>${esc(g.division)}</td><td class="num"><strong>${esc(fmtDinero(g.importe))}</strong></td><td class="num">${fmtNum(g.personas)}</td><td class="num">${esc(fmtDinero(g.promedio))}</td><td class="num">${fmtNum(g.devoluciones + g.reversos)}</td></tr>`).join('');
      $('p-resumen').textContent = `Mostrando ${inicio + 1}–${inicio + filas.length} de ${grupos.length} · Página ${pagina} de ${total}`;
      $('p-botones').innerHTML = `<button type="button" class="inv-page-button" data-page="${pagina - 1}" aria-label="Página anterior" ${pagina <= 1 ? 'disabled' : ''}>‹</button>`
        + `<button type="button" class="inv-page-button active" aria-current="page">${pagina}</button>`
        + `<button type="button" class="inv-page-button" data-page="${pagina + 1}" aria-label="Página siguiente" ${pagina >= total ? 'disabled' : ''}>›</button>`;
    }

    function aplicar() {
      const base = filtroBase();
      const meses = unicos(detalle, 'mes').sort();
      const mes = $('f-mes').value;
      filtradas = mes ? base.filter(x => x.mes === mes) : base;
      pagina = 1;
      $('linea-resultado').textContent = `${unicos(filtradas, 'tienda').length} tiendas · ${unicos(filtradas, 'at').length} asesores con los filtros activos`;
      $('linea-corte').textContent = mes ? `Corte: ${fmtMes(mes)}` : 'Todos los meses';
      pintarKpis(base, mes, meses);
      pintarTendencia(base, meses);
      barras('division', 'c-division', agrupar(filtradas, 'division').sort((a, b) => b.importe - a.importe));
      barras('funcion', 'c-funcion', agrupar(filtradas, 'funcion').sort((a, b) => b.importe - a.importe));
      pintarAts(filtradas);
      pintarRevisar(mes, meses);
      pintarTabla();
    }

    function descargar() {
      const filas = filtradas.map(x => ({ Mes: x.mes, Division: x.division, Tienda: x.tienda, Asesor: x.at, Puesto: x.funcion, Descontado: x.importe, Personas: x.personas, Movimientos: x.movimientos, Devoluciones: x.devoluciones, 'Importe devoluciones': x.importeDevoluciones, Reversos: x.reversos }));
      OXXO.downloadRowsAsCSV(filas, `cuota-sindical-${$('f-mes').value || 'todos'}.csv`);
    }

    function sinDatos(texto) {
      $('hero-corte').innerHTML = '<span></span>' + esc(texto);
      $('t-tiendas').innerHTML = `<tr><td colspan="7" class="inv-table-message">${esc(texto)}</td></tr>`;
      $('l-ats').innerHTML = `<div class="inv-panel-empty">${esc(texto)}</div>`;
    }

    async function cargar() {
      $('hero-corte').innerHTML = '<span></span>Consultando el libro privado…';
      try {
        const [datos, cat] = await Promise.all([pedir({ action: 'consultarCuotaSindical' }), OXXO.loadAsesorCatalog().catch(() => null)]);
        catalogo = cat;
        carga = datos.carga || null;
        resumen = aObjetos(RESUMEN_HEADERS, datos.resumen).map(r => ({ mes: r.Mes, division: r.Division, personas: +r.Personas || 0, sinDescuento: +r.PersonasSinDescuento || 0, semanas: +r.SemanasPagadas || 0, importe: +r.Importe || 0, devoluciones: +r.Devoluciones || 0, importeDevoluciones: +r.ImporteDevoluciones || 0, reversos: +r.Reversos || 0 }));
        detalle = aObjetos(DETALLE_HEADERS, datos.detalle).map(r => ({ mes: r.Mes, division: r.Division, tienda: r.Tienda, funcion: r.Funcion, importe: +r.Importe || 0, personas: +r.Personas || 0, movimientos: +r.Movimientos || 0, devoluciones: +r.Devoluciones || 0, importeDevoluciones: +r.ImporteDevoluciones || 0, reversos: +r.Reversos || 0 }));
        const ats = new Map();
        detalle.forEach(x => { if (!ats.has(x.tienda)) ats.set(x.tienda, atDe(x.tienda)); x.at = ats.get(x.tienda); });
        // El catalogo de tiendas trae algunos nombres en minusculas ("jessica
        // yazmin verdi toala"): la misma persona no debe salir dos veces.
        const nombres = new Map();
        [...ats.values()].forEach(n => { const k = norm(n), previo = nombres.get(k); if (!previo || (previo === previo.toLowerCase() && n !== n.toLowerCase())) nombres.set(k, n); });
        const propio = n => n === n.toLowerCase() ? n.replace(/(^|\s)(\S)/g, (m, e, l) => e + l.toUpperCase()) : n;
        detalle.forEach(x => { x.at = propio(nombres.get(norm(x.at))); });
        if (!detalle.length) { sinDatos('Todavía no hay datos. Pulsa "Actualizar datos" y sube el Excel de cuota sindical.'); return; }
        const meses = unicos(detalle, 'mes').sort();
        llenar($('f-mes'), [...meses].reverse(), m => fmtMes(m));
        if (!$('f-mes').value) $('f-mes').value = meses[meses.length - 1];
        llenar($('f-division'), unicos(detalle, 'division').sort());
        llenar($('f-at'), unicos(detalle, 'at').sort((a, b) => a.localeCompare(b, 'es')));
        llenar($('f-funcion'), unicos(detalle, 'funcion').sort());
        $('hero-corte').innerHTML = `<span></span>${fmtMes(meses[0])} a ${fmtMes(meses[meses.length - 1])} · ${unicos(detalle, 'tienda').length} unidades`;
        $('pie-carga').textContent = carga && carga.fecha ? `${carga.fecha}${carga.archivo ? ' · ' + carga.archivo : ''}` : '—';
        aplicar();
      } catch (e) {
        sinDatos('No se pudo consultar: ' + e.message + '.');
      }
    }

    // ── Actualizar datos (solo administradores) ──
    const dialogo = $('cuota-carga');
    function avisarCarga(texto, tipo) { const el = $('carga-estado'); el.textContent = texto; el.dataset.tipo = tipo || 'info'; el.hidden = !texto; }
    async function publicar() {
      const archivo = $('carga-archivo').files[0], adminPassword = $('carga-password').value;
      if (!archivo || !adminPassword) { avisarCarga('Elige el Excel y escribe la contraseña del panel admin.', 'error'); return; }
      $('carga-publicar').disabled = true;
      try {
        const r = await subirExcel(archivo, adminPassword, texto => avisarCarga(texto, 'info'));
        dialogo.close();
        $('carga-archivo').value = ''; $('carga-password').value = '';
        await cargar();
        $('linea-resultado').textContent = 'Datos actualizados: ' + resumenCarga(r.meta);
      } catch (e) {
        avisarCarga('No se pudo actualizar: ' + e.message + '.', 'error');
      } finally {
        $('carga-publicar').disabled = false;
      }
    }

    ['f-mes', 'f-division', 'f-at', 'f-funcion'].forEach(id => $(id).addEventListener('change', aplicar));
    let espera;
    $('f-tienda').addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(aplicar, 150); });
    $('f-limpiar').addEventListener('click', () => { ['f-division', 'f-at', 'f-funcion', 'f-tienda'].forEach(id => { $(id).value = ''; }); aplicar(); });
    $('f-descargar').addEventListener('click', descargar);
    $('f-actualizar').addEventListener('click', () => { avisarCarga('', 'info'); dialogo.showModal(); });
    $('carga-cancelar').addEventListener('click', () => dialogo.close());
    $('carga-form').addEventListener('submit', e => { e.preventDefault(); publicar(); });
    document.querySelector('.inv-table thead').addEventListener('click', e => {
      const th = e.target.closest('th[data-sort]');
      if (!th) return;
      orden.dir = orden.key === th.dataset.sort && orden.dir === 'desc' ? 'asc' : 'desc';
      orden.key = th.dataset.sort;
      pintarTabla();
    });
    $('p-tamano').addEventListener('change', e => { porPagina = +e.target.value || 25; pagina = 1; pintarTabla(); });
    $('p-botones').addEventListener('click', e => { const b = e.target.closest('button[data-page]'); if (!b || b.disabled) return; pagina = +b.dataset.page || 1; pintarTabla(); });
    if (typeof Chart !== 'undefined') { Chart.defaults.font.family = getComputedStyle(document.body).getPropertyValue('--font-body') || 'Arial'; Chart.defaults.color = '#6f625d'; }
    OXXO.setRetryHandler && OXXO.setRetryHandler(cargar);
    cargar();
  }

  // Panel admin (area Administrativo): misma carga, con la sesion del admin.
  function montarAdmin() {
    const $ = id => document.getElementById(id);
    if (!$('admin-cuota-panel')) return;
    const avisar = (texto, tipo) => { const el = $('cuota-admin-estado'); el.textContent = texto; el.dataset.tipo = tipo || 'info'; el.hidden = !texto; };
    const password = () => (window.OXXO_ADMIN_CTX ? window.OXXO_ADMIN_CTX.getAdminPassword() : '');
    const mostrarHoja = url => { const a = $('cuota-admin-hoja'); a.hidden = !url; if (url) a.href = url; };
    let consultado = false;
    async function info() {
      if (consultado || !password()) return;
      consultado = true;
      try {
        const r = await pedir({ action: 'infoCuotaSindical', adminPassword: password() });
        mostrarHoja(r.url);
        $('cuota-admin-ultima').textContent = r.carga && r.carga.fecha ? `Última carga: ${r.carga.fecha}${r.carga.archivo ? ' · ' + r.carga.archivo : ''}` : 'Todavía no hay cargas.';
      } catch (e) {
        consultado = false;
        $('cuota-admin-ultima').textContent = 'No se pudo consultar la última carga: ' + e.message + '.';
      }
    }
    // Se consulta al entrar al area Administrativo (ya con la sesion abierta).
    document.querySelectorAll('.admin-area[data-admin-area="administrativo"]').forEach(b => b.addEventListener('click', info));
    $('cuota-admin-publicar').addEventListener('click', async () => {
      const archivo = $('cuota-admin-archivo').files[0];
      if (!archivo) { avisar('Elige el Excel de cuota sindical.', 'error'); return; }
      if (!password()) { avisar('Entra al panel admin con su contraseña.', 'error'); return; }
      $('cuota-admin-publicar').disabled = true;
      try {
        const r = await subirExcel(archivo, password(), texto => avisar(texto, 'info'));
        mostrarHoja(r.url);
        $('cuota-admin-archivo').value = '';
        consultado = false; info();
        avisar('Listo: ' + resumenCarga(r.meta), 'ok');
      } catch (e) {
        avisar('No se pudo actualizar: ' + e.message + '.', 'error');
      } finally {
        $('cuota-admin-publicar').disabled = false;
      }
    });
  }

  window.OXXO_CUOTA = { agregar, subirExcel, leerExcel, montar, montarAdmin, DETALLE_HEADERS, RESUMEN_HEADERS, TODAS };
})();
