/* ==========================================================
   FICHA UI — piezas visuales compartidas por "Mi Tienda" y
   "Mi Dashboard". Las dos paginas arman la misma ficha (cabecera
   de identidad, resumen con semaforo, alertas y un panel por
   dashboard); solo cambia si agrupan por tienda o por asesor.
   Vive aparte para que un ajuste visual valga para las dos y no
   se desincronicen.
   ========================================================== */
(function () {
  'use strict';

  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const num = (v) => OXXO.formatNum(Math.round(Number(v) || 0));
  const plural = (count, sing, plur) => `${count} ${count === 1 ? sing : plur}`;

  function statTile(value, label, cls) {
    return `<div class="mi-stat ${cls || ''}"><b>${value}</b><span>${esc(label)}</span></div>`;
  }
  function emptyRow(colspan, msg) {
    return `<tr><td colspan="${colspan}"><div class="mi-empty-mini">${esc(msg || 'Sin registros en este periodo.')}</div></td></tr>`;
  }
  // Un panel sin registros tiene dos lecturas distintas que antes se veian
  // igual (una reja de ceros): "no hay nada que atender" (bueno) y "esto no
  // aparece en esa base" (sin dato). Se separan.
  function clearBox(msg) { return `<div class="mt-clear">✓ ${esc(msg)}</div>`; }
  function noneBox(msg) { return `<div class="mt-none">— ${esc(msg)}</div>`; }

  // ── Medidor semicircular para cualquier % 0-100 ──
  // Sin aguja: a este tamano (120px) cruzaba por encima del numero y del
  // arco y ensuciaba la lectura, sobre todo en valores bajos. La sustituye
  // un punto al final del arco, que marca el avance sin encimarse.
  let gaugeSeq = 0;
  function gaugeTone(v, meta) {
    return meta != null
      ? (v >= meta ? 'verde' : v >= meta - 10 ? 'amarillo' : 'rojo')
      : (v >= 80 ? 'verde' : v >= 50 ? 'amarillo' : 'rojo');
  }
  function gaugeSVG(value, meta) {
    const v = Math.max(0, Math.min(100, Number(value) || 0));
    const color = gaugeTone(v, meta);
    const c = color === 'verde' ? { main: '#3ECF6D', dark: '#12813F', txt: '#12813F' }
      : color === 'amarillo' ? { main: '#F2A52B', dark: '#B87400', txt: '#9A6A00' }
      : { main: '#E85A60', dark: '#C0181F', txt: '#C0181F' };
    const cx = 100, cy = 100, r = 74, sw = 16, len = Math.PI * r;
    const dash = (len * v / 100).toFixed(1);
    const ang = Math.PI * (1 - v / 100);
    const px = (cx + r * Math.cos(ang)).toFixed(1), py = (cy - r * Math.sin(ang)).toFixed(1);
    const gid = 'mtg' + (gaugeSeq++);
    let metaLine = '';
    if (meta != null) {
      const ma = Math.PI * (1 - meta / 100);
      const m1x = (cx + (r - sw / 2 - 1) * Math.cos(ma)).toFixed(1), m1y = (cy - (r - sw / 2 - 1) * Math.sin(ma)).toFixed(1);
      const m2x = (cx + (r + sw / 2 + 3) * Math.cos(ma)).toFixed(1), m2y = (cy - (r + sw / 2 + 3) * Math.sin(ma)).toFixed(1);
      metaLine = `<line x1="${m1x}" y1="${m1y}" x2="${m2x}" y2="${m2y}" stroke="#3B1918" stroke-width="2" opacity=".45"/>`;
    }
    return `<svg viewBox="0 0 200 112" class="mi-gauge">
      <defs><linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${c.main}"/><stop offset="1" stop-color="${c.dark}"/></linearGradient></defs>
      <path d="M${cx - r},${cy} A${r},${r} 0 0 1 ${cx + r},${cy}" fill="none" stroke="rgba(130,54,38,.11)" stroke-width="${sw}" stroke-linecap="round"/>
      <path d="M${cx - r},${cy} A${r},${r} 0 0 1 ${cx + r},${cy}" fill="none" stroke="url(#${gid})" stroke-width="${sw}" stroke-linecap="round" stroke-dasharray="${dash} ${len.toFixed(1)}"/>
      ${metaLine}
      <circle cx="${px}" cy="${py}" r="5.5" fill="#fff" stroke="${c.dark}" stroke-width="3"/>
      <text x="${cx}" y="${cy - 4}" text-anchor="middle" class="mi-gauge__text" style="fill:${c.txt}">${v.toFixed(0)}<tspan style="font-size:18px" dy="-2">%</tspan></text>
    </svg>`;
  }
  function gaugeRowHTML(value, meta, label, tilesHtml) {
    return `<div class="mi-gauge-row">
      <div class="mi-gauge-wrap">
        ${gaugeSVG(value, meta)}
        <div class="mi-gauge__cap">${esc(label)}</div>
      </div>
      <div class="mi-stats">${tilesHtml}</div>
    </div>`;
  }

  // ── Barras horizontales para desgloses (motivos, puestos, tipos...) ──
  function barListHTML(items, colorClass) {
    const filtered = items.filter((it) => it.value > 0).sort((a, b) => b.value - a.value).slice(0, 4);
    if (!filtered.length) return '';
    const max = Math.max(...filtered.map((it) => it.value));
    return `<div class="mi-barlist">${filtered.map((it) => `
      <div class="mi-barlist__row">
        <span class="mi-barlist__label" title="${esc(it.label)}">${esc(it.label)}</span>
        <div class="mi-barlist__track"><div class="mi-barlist__fill ${colorClass || ''}" style="width:${max ? Math.max(4, Math.round(it.value / max * 100)) : 0}%"></div></div>
        <span class="mi-barlist__value">${typeof it.display === 'string' ? esc(it.display) : num(it.value)}</span>
      </div>`).join('')}</div>`;
  }
  // Barras para comparar porcentajes entre si: a diferencia de barListHTML
  // respeta el orden dado, no descarta los valores en 0 (un "0%" tiene que
  // verse) y mide contra 100, no contra el mayor del grupo.
  function pctBarsHTML(items) {
    return `<div class="mi-barlist">${items.map((it) => {
      const v = Math.max(0, Math.min(100, Number(it.value) || 0));
      const tone = gaugeTone(v, null);
      const cls = tone === 'verde' ? 'verde' : tone === 'amarillo' ? 'naranja' : '';
      return `<div class="mi-barlist__row">
        <span class="mi-barlist__label" title="${esc(it.label)}">${esc(it.label)}</span>
        <div class="mi-barlist__track"><div class="mi-barlist__fill ${cls}" style="width:${Math.max(2, v)}%"></div></div>
        <span class="mi-barlist__value">${v}%</span>
      </div>`;
    }).join('')}</div>`;
  }

  // ── Movimiento TREO ──
  function movInfo(dif) {
    if (dif === 0) return { cls: 'alineada', arrow: '✔', txt: 'Alineada' };
    return dif > 0 ? { cls: 'subir', arrow: '↑', txt: 'Subir' } : { cls: 'bajar', arrow: '↓', txt: 'Bajar' };
  }
  function movPill(dif) {
    const mov = movInfo(dif);
    const txt = mov.cls === 'alineada' ? '✔ Alineada' : mov.cls === 'subir' ? '▲ Subir' : '▼ Bajar';
    return `<span class="pill-mov ${mov.cls}">${txt}</span>`;
  }
  // Celda de estatus de estructura: con dos columnas ("con" y "sin"
  // ausentismo) en un panel angosto, el texto completo partia el renglon en
  // varias lineas. Se muestra corto y con color; el original va en el title.
  function estatusCell(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return '<td class="center">—</td>';
    const c = OXXO.metricsClasificaAprovechamiento(raw);
    const txt = raw.replace(/^equipo\s+/i, '').replace(/^tienda\s+/i, '');
    const cls = c === 'completas' ? 'alineada' : c === 'criticas' ? 'bajar' : c === 'incompletas' ? 'subir' : '';
    return `<td class="center" title="${esc(raw)}">${cls ? `<span class="pill-mov ${cls}">${esc(txt)}</span>` : esc(txt)}</td>`;
  }

  // ── Resumen (banda de titulares con semaforo) ──
  function rkTile(value, label, tone, hint) {
    return `<div class="rk ${tone || ''}">
      <b>${value}</b><span>${esc(label)}</span>${hint ? `<i>${esc(hint)}</i>` : ''}
    </div>`;
  }
  function toneByCount(count, warnAt) {
    if (!count) return 'is-ok';
    return count >= (warnAt || 3) ? 'is-bad' : 'is-warn';
  }
  function tonePct(pct, okAt, warnAt) {
    if (pct >= okAt) return 'is-ok';
    return pct >= warnAt ? 'is-warn' : 'is-bad';
  }
  function chipsHTML(alertas, okMsg) {
    return alertas.length
      ? alertas.map((x) => `<span class="chip ${x.t}">${esc(x.txt)}</span>`).join('')
      : `<span class="chip is-ok">✓ ${esc(okMsg)}</span>`;
  }
  function metaHTML(pares) {
    return pares
      .filter(([, v]) => String(v ?? '').trim() !== '')
      .map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`)
      .join('');
  }

  // ── Combobox de una sola opcion (busca + selecciona una) ──
  function mountSingleSelect(rootId, values, { onChange, placeholder, searchId, searchPlaceholder, pinnedValue } = {}) {
    const root = document.getElementById(rootId);
    if (!root) return null;
    const allValues = [...new Set(values)].sort((a, b) => String(a).localeCompare(String(b), 'es'));
    const pinnedIndex = allValues.indexOf(pinnedValue);
    if (pinnedIndex > 0) allValues.unshift(allValues.splice(pinnedIndex, 1)[0]);
    let selected = '';
    const ph = placeholder || 'Selecciona una opción';
    const sid = searchId || `${rootId}-search`;

    root.innerHTML = `
      <div class="smart-filter" id="${rootId}-filter">
        <button class="smart-filter__button" type="button" id="${rootId}-button">
          <span class="smart-filter__label" id="${rootId}-label">${esc(ph)}</span>
          <span class="smart-filter__chev">▾</span>
        </button>
        <div class="smart-filter__menu" id="${rootId}-menu">
          <input class="smart-filter__search" id="${esc(sid)}" type="search" placeholder="${esc(searchPlaceholder || 'Buscar...')}" autocomplete="off">
          <div class="smart-filter__list" id="${rootId}-options"></div>
        </div>
      </div>`;

    const wrap = document.getElementById(`${rootId}-filter`);
    const label = document.getElementById(`${rootId}-label`);
    const button = document.getElementById(`${rootId}-button`);
    const search = document.getElementById(sid);
    const list = document.getElementById(`${rootId}-options`);

    function renderOptions(query = '') {
      const q = String(query || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
      const filtered = allValues.filter((v) => !q || String(v).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(q));
      list.innerHTML = filtered.length
        ? filtered.map((v) => `<button type="button" class="smart-filter__option ${v === selected ? 'is-active' : ''}" data-value="${esc(v)}">
            <span class="smart-filter__check"></span><span>${esc(v)}</span>
          </button>`).join('')
        : '<div class="smart-filter__empty">Sin resultados</div>';
    }

    list.addEventListener('click', (e) => {
      const btn = e.target.closest('.smart-filter__option');
      if (!btn) return;
      selected = btn.dataset.value;
      label.textContent = selected;
      wrap.classList.remove('open');
      renderOptions(search.value);
      if (typeof onChange === 'function') onChange(selected);
    });
    search.addEventListener('input', () => renderOptions(search.value));
    button.addEventListener('click', () => {
      const opening = !wrap.classList.contains('open');
      wrap.classList.toggle('open', opening);
      if (opening) { search.value = ''; renderOptions(); search.focus(); }
    });
    document.addEventListener('click', (e) => { if (!wrap.contains(e.target)) wrap.classList.remove('open'); });

    renderOptions();
    return {
      get value() { return selected; },
      setValue(v) { selected = v || ''; label.textContent = selected || ph; renderOptions(); },
    };
  }

  // ── Capacidades 2026: detalle por persona ──────────────
  // Los paneles de Capacidades de las dos fichas resumian por certificacion
  // (4 renglones) y ahi se acababa: no habia forma de ver QUIEN tiene un
  // pendiente, que es justo lo que sirve para actuar. Dashboard 8 si lo
  // tiene, en un modal por empleado; estas piezas lo traen a las fichas.
  // Viven aqui, y no copiadas en cada pagina, porque las dos las usan igual
  // y la lista de certificaciones tiene que ser la misma en las tres
  // pantallas.
  const CAP_CERT_COLS = [
    { key: 'Promedio de Código de Ética 2026', label: 'Código de Ética' },
    { key: 'Promedio de Seguridad en la persona 2026', label: 'Seguridad en la Persona' },
    { key: 'Promedio de PLD2026Certificacion', label: 'PLD 2026' },
    { key: 'Promedio de ModuloCercaSiempre2026', label: 'Módulo Cerca Siempre' },
  ];
  // Una celda vacia significa "no le aplica", que NO es lo mismo que 0
  // (pendiente). Por eso devuelve null y no cero: mezclarlos hunde el
  // porcentaje de gente a la que simplemente no le toca ese modulo.
  function capValue(row, certKey, certRealKeys) {
    const raw = row[(certRealKeys && certRealKeys[certKey]) || certKey];
    if (raw === undefined || raw === null || String(raw).trim() === '') return null;
    const value = OXXO.metricsNum(raw);
    return Number.isFinite(value) ? value : null;
  }

  // Agrupa las filas por persona. La fuente publica una fila por empleado,
  // pero se agrupa por Nº personal de todos modos: si la base llega a traer
  // duplicados, una persona no debe contar dos veces ni aparecer repetida.
  function capEmpleados(rows, keys = {}) {
    const porPersona = new Map();
    (rows || []).forEach((row) => {
      const noPers = String(row[keys.noPersKey] ?? '').trim();
      const nombre = String(row[keys.empleadoKey] ?? '').trim();
      const id = noPers || nombre;
      if (!id) return;
      if (!porPersona.has(id)) {
        porPersona.set(id, {
          id, noPers, nombre: nombre || 'Empleado sin nombre',
          tienda: String(row[keys.tiendaKey] ?? row[keys.unidadKey] ?? '').trim(),
          cr: String(row[keys.crKey] ?? '').trim(),
          asesor: String(row[keys.asesorKey] ?? '').trim(),
          puesto: String(row[keys.puestoKey] ?? '').trim(),
          certs: CAP_CERT_COLS.map((c) => ({ label: c.label, valor: null })),
        });
      }
      const persona = porPersona.get(id);
      CAP_CERT_COLS.forEach((c, i) => {
        const valor = capValue(row, c.key, keys.certRealKeys);
        // Entre filas duplicadas gana el avance mayor.
        if (valor !== null && (persona.certs[i].valor === null || valor > persona.certs[i].valor)) {
          persona.certs[i].valor = valor;
        }
      });
    });
    return [...porPersona.values()].map((persona) => {
      const aplican = persona.certs.filter((c) => c.valor !== null);
      const completas = aplican.filter((c) => c.valor >= 1);
      return {
        ...persona,
        aplican: aplican.length,
        completas: completas.length,
        pendientes: aplican.length - completas.length,
        pct: aplican.length ? Math.round((completas.length / aplican.length) * 100) : null,
      };
    }).sort((a, b) => (a.pct ?? 101) - (b.pct ?? 101) || a.nombre.localeCompare(b.nombre));
  }

  function capBadge(pct) {
    if (pct === null) return '<span class="cap-pill na">N/A</span>';
    const cls = pct >= 90 ? 'verde' : pct >= 60 ? 'amarillo' : 'rojo';
    return `<span class="cap-pill ${cls}">${pct}%</span>`;
  }

  // Tabla-indice: una persona por renglon, las de menor cumplimiento
  // primero, porque son las que hay que perseguir. Cada renglon abre su
  // propio detalle.
  // La columna de contexto cambia segun la ficha: en "Mi Tienda" la tienda
  // es siempre la misma y no informa nada, asi que ahi va el puesto; en
  // "Mi Dashboard" (agrupado por asesor) lo util es de que tienda es cada
  // persona.
  const CAP_CONTEXTO = { Tienda: 'tienda', Asesor: 'asesor', Puesto: 'puesto' };
  function capEmpleadosTablaHTML(empleados, columnaContexto = 'Tienda') {
    const campo = CAP_CONTEXTO[columnaContexto] || 'tienda';
    const filas = (empleados || []).map((e, i) => `<tr class="cap-emp-row" data-cap-emp="${i}" tabindex="0" role="button" title="Ver certificación por certificación">
        <td>${esc(e.nombre)}${e.noPers ? `<small class="cap-emp-id">Nº ${esc(e.noPers)}</small>` : ''}</td>
        <td>${esc(e[campo] || '—')}</td>
        <td class="center">${e.completas}/${e.aplican}</td>
        <td class="center">${e.pendientes ? `<b class="cap-pend">${e.pendientes}</b>` : '—'}</td>
        <td class="center">${capBadge(e.pct)}</td>
      </tr>`).join('');
    return `<table class="tbl cap-emp-tabla">
      <thead><tr><th>Empleado</th><th>${esc(columnaContexto)}</th><th class="center">Completadas</th><th class="center">Pendientes</th><th class="center">Cumplimiento</th></tr></thead>
      <tbody>${filas || emptyRow(5, 'Sin empleados en capacidades.')}</tbody>
    </table>`;
  }

  // Ficha de una persona: el mismo desglose que abre Dashboard 8.
  function capEmpleadoDetalleHTML(e) {
    if (!e) return '';
    const chips = [['Nº personal', e.noPers], ['Puesto', e.puesto], ['Tienda', e.tienda], ['CR', e.cr], ['Asesor', e.asesor]]
      .filter(([, value]) => String(value || '').trim())
      .map(([label, value]) => `<div class="cap-emp-chip"><span>${esc(label)}</span><b>${esc(value)}</b></div>`).join('');
    const filas = e.certs.map((c) => {
      if (c.valor === null) return `<tr><td>${esc(c.label)}</td><td class="center">—</td><td class="center"><span class="cap-pill na">No aplica</span></td></tr>`;
      const avance = Math.round(c.valor * 100);
      const cls = c.valor >= 1 ? 'verde' : c.valor > 0 ? 'amarillo' : 'rojo';
      const txt = c.valor >= 1 ? 'Completada' : c.valor > 0 ? 'En proceso' : 'Pendiente';
      return `<tr><td>${esc(c.label)}</td><td class="center">${avance}%</td><td class="center"><span class="cap-pill ${cls}">${txt}</span></td></tr>`;
    }).join('');
    return `<div class="cap-emp-detalle">
      <div class="mi-stats">
        ${statTile(e.pct === null ? '—' : e.pct + '%', 'Cumplimiento')}
        ${statTile(`${e.completas}/${e.aplican}`, 'Completadas')}
        ${statTile(String(e.pendientes), 'Pendientes', e.pendientes ? 'rojo' : 'verde')}
      </div>
      ${chips ? `<div class="cap-emp-chips">${chips}</div>` : ''}
      <table class="tbl">
        <thead><tr><th>Certificación</th><th class="center">Avance</th><th class="center">Estatus</th></tr></thead>
        <tbody>${filas}</tbody>
      </table>
    </div>`;
  }

  // ── Modal de detalle (TODOS los paneles con "Ver detalle" o con acordeon
  //    por mes usan este mismo modal en vez de expandir en la tarjeta) ──
  // openModal acepta un elemento (se clona, ej. la tabla oculta de un panel
  // sin historial) o un string de HTML ya armado (ej. la tabla de un mes
  // especifico, generada al vuelo por monthsAccordion). Si la pagina no
  // trae el modal en su HTML (ej. mi-dashboard.html todavia no lo usa) esto
  // no hace nada.
  let modalOverlay = null, modalDialog = null, modalTitleEl = null,
      modalContextEl = null, modalMetaEl = null, modalBodyEl = null,
      modalLastTrigger = null;
  function closeModal() {
    if (!modalOverlay || !modalOverlay.classList.contains('show')) return;
    modalOverlay.classList.remove('show');
    modalOverlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('mi-modal-open');
    if (modalLastTrigger && document.contains(modalLastTrigger)) modalLastTrigger.focus();
  }
  function openModal(title, content) {
    if (!modalOverlay) return;
    const titleParts = String(title || 'Detalle').split(/\s*·\s*/);
    modalTitleEl.textContent = titleParts.shift() || 'Detalle';
    modalContextEl.textContent = titleParts.join(' · ') || 'Información detallada';
    modalBodyEl.innerHTML = '';
    if (content instanceof Element) {
      const wrap = document.createElement('div');
      wrap.className = 'tbl-wrap';
      wrap.appendChild(content.cloneNode(true));
      modalBodyEl.appendChild(wrap);
    } else if (typeof content === 'string') {
      modalBodyEl.innerHTML = `<div class="tbl-wrap">${content}</div>`;
    }
    const table = modalBodyEl.querySelector('.tbl');
    const columns = table ? table.querySelectorAll('thead th').length : 0;
    const bodyRows = table ? [...table.querySelectorAll('tbody tr')] : [];
    const recordCount = bodyRows.filter(row => !row.querySelector('.mi-empty-mini')).length;
    modalMetaEl.textContent = `${plural(recordCount, 'registro', 'registros')} · ${plural(columns, 'columna', 'columnas')}`;
    modalDialog.classList.toggle('is-wide', columns > 5);
    modalLastTrigger = document.activeElement;
    modalOverlay.setAttribute('aria-hidden', 'false');
    modalOverlay.classList.add('show');
    document.body.classList.add('mi-modal-open');
    // Espera a que termine la entrada: un elemento con visibility en
    // transición no siempre acepta foco en el primer frame (Chrome).
    setTimeout(() => document.getElementById('mi-modal-close')?.focus(), 250);
  }
  // Registro de la ultima lista de capacidades pintada, para que el modal
  // sepa a que persona corresponde el renglon en el que hicieron clic.
  let capLista = [], capTitulo = 'Capacidades 2026', capContexto = 'Tienda';
  function setCapEmpleados(lista, { titulo, contexto } = {}) {
    capLista = Array.isArray(lista) ? lista : [];
    if (titulo) capTitulo = titulo;
    if (contexto) capContexto = contexto;
  }
  function abrirCapLista() {
    openModal(`${capTitulo} · detalle por empleado`, capEmpleadosTablaHTML(capLista, capContexto));
  }
  function abrirCapEmpleado(indice) {
    const persona = capLista[indice];
    if (!persona) return;
    openModal(`${persona.nombre} · certificaciones`,
      `<button type="button" class="cap-emp-volver">&larr; Volver a la lista</button>` + capEmpleadoDetalleHTML(persona));
  }

  function initDetailModal() {
    modalOverlay = document.getElementById('mi-modal-overlay');
    if (!modalOverlay) return;
    modalDialog = modalOverlay.querySelector('.mi-modal');
    modalTitleEl = document.getElementById('mi-modal-title');
    modalContextEl = document.getElementById('mi-modal-context');
    modalMetaEl = document.getElementById('mi-modal-meta');
    modalBodyEl = document.getElementById('mi-modal-body');
    document.addEventListener('click', (e) => {
      // Capacidades va PRIMERO: su boton comparte la clase .mi-detail-btn
      // para verse igual que los demas, pero su contenido se arma al vuelo
      // en vez de clonar una tabla oculta. Si se evaluara despues, el
      // manejador generico buscaria un data-modal-target que no existe y
      // abriria el modal vacio.
      if (e.target.closest('.cap-emp-abrir')) { abrirCapLista(); return; }
      const btn = e.target.closest('.mi-detail-btn');
      if (btn) {
        openModal(btn.dataset.modalTitle, document.getElementById(btn.dataset.modalTarget));
        return;
      }
      // Volver de la ficha de una persona a la lista de empleados.
      if (e.target.closest('.cap-emp-volver')) { abrirCapLista(); return; }
      const fila = e.target.closest('.cap-emp-row');
      if (fila) { abrirCapEmpleado(Number(fila.dataset.capEmp)); return; }
      if (e.target === modalOverlay || e.target.closest('#mi-modal-close')) closeModal();
    });
    // La tabla de empleados se navega tambien con teclado: los renglones son
    // role="button", asi que Enter y Espacio tienen que abrirlos igual que
    // el clic.
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const fila = e.target.closest?.('.cap-emp-row');
      if (!fila) return;
      e.preventDefault();
      abrirCapEmpleado(Number(fila.dataset.capEmp));
    });
    document.addEventListener('keydown', (e) => {
      if (!modalOverlay.classList.contains('show')) return;
      if (e.key === 'Escape') { closeModal(); return; }
      if (e.key !== 'Tab') return;
      const focusable = [...modalDialog.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')]
        .filter(el => !el.disabled && el.getClientRects().length);
      if (!focusable.length) { e.preventDefault(); modalDialog.focus(); return; }
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  }
  initDetailModal();

  window.OXXO_FICHA = {
    esc, num, plural,
    statTile, emptyRow, clearBox, noneBox,
    gaugeTone, gaugeSVG, gaugeRowHTML,
    barListHTML, pctBarsHTML,
    movInfo, movPill, estatusCell,
    rkTile, toneByCount, tonePct, chipsHTML, metaHTML,
    mountSingleSelect, openModal, closeModal,
    CAP_CERT_COLS, capValue, capEmpleados, capEmpleadosTablaHTML, capEmpleadoDetalleHTML,
    setCapEmpleados, abrirCapLista,
  };
})();
