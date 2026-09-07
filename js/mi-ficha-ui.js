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
  function initDetailModal() {
    modalOverlay = document.getElementById('mi-modal-overlay');
    if (!modalOverlay) return;
    modalDialog = modalOverlay.querySelector('.mi-modal');
    modalTitleEl = document.getElementById('mi-modal-title');
    modalContextEl = document.getElementById('mi-modal-context');
    modalMetaEl = document.getElementById('mi-modal-meta');
    modalBodyEl = document.getElementById('mi-modal-body');
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.mi-detail-btn');
      if (btn) {
        openModal(btn.dataset.modalTitle, document.getElementById(btn.dataset.modalTarget));
        return;
      }
      if (e.target === modalOverlay || e.target.closest('#mi-modal-close')) closeModal();
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
  };
})();
