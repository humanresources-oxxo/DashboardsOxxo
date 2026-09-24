/* ==========================================================
   OXXO — Controlador unico de dialogos (modales de detalle)

   Lo consumen los tableros con ventana de detalle: dashboard-1, 2, 3, 4,
   7, 8, 9, 12 y 13. Mi Dashboard / Mi Tienda conservan el controlador de
   js/mi-ficha-ui.js. Va despues de los scripts del tablero y NO toca ningun
   calculo: solo semantica y teclado.

     const dlg = OXXO_DIALOGS.register({
       overlay: 'mi-overlay',      // id o elemento del fondo (el que lleva la clase de abierto)
       dialog:  '.am-dialog',      // opcional; por defecto el primer hijo del fondo
       title:   'mi-titulo',       // id o elemento del encabezado (aria-labelledby)
       close:   '.am-close',       // opcional; boton(es) que cierran
       onClose: () => {},          // opcional
       openClass: 'open'           // opcional; clase que muestra el fondo
     });
     dlg.open(); dlg.close();      // tambien OXXO_DIALOGS.open(id) / close(id)

   Garantias: role=dialog + aria-modal + aria-labelledby, aria-hidden en el
   fondo, foco dentro del dialogo, Tab/Shift+Tab atrapados, Escape / clic en
   el fondo / boton cerrar, foco devuelto al elemento que lo abrio, scroll de
   fondo bloqueado y el resto de la pagina "inert" mientras hay uno abierto.
   Admite varios dialogos por pagina (Escape cierra el de arriba).

   Tambien expone OXXO_DIALOGS.bindRows(): filas de tabla que abren un
   detalle o filtran. Pone un <button> nativo en la primera celda (foco,
   Enter/Espacio, nombre accesible); el clic en el resto de la fila se
   conserva solo como comodidad para el raton.

   Y mantiene las tarjetas KPI que filtran (.kpi-card[data-kpi] o
   [role="button"]): role/tabindex/Enter/Espacio cuando faltan y
   aria-pressed reflejando la clase "active" que ya pone cada tablero.

   Y los filtros desplegables (.smart-filter, los de cada pagina y el que
   monta OXXO.mountAsesorFilter): aria-expanded / aria-controls sincronizados
   con la clase "open", aria-pressed en las opciones activas, nombre
   accesible para el buscador, y cierre con Escape (devolviendo el foco al
   boton) o con clic fuera. Lo cargan tambien D5, D6 y D14.
   ========================================================== */
(function () {
  'use strict';

  const FOCUSABLE = 'a[href],button,input,select,textarea,summary,[tabindex]';
  const registry = new Map();      // overlay -> handle
  const stack = [];                // handles abiertos, el ultimo esta arriba
  const inertCount = new WeakMap();
  let seq = 0;

  const asElement = (ref, root) => {
    if (!ref) return null;
    if (typeof ref !== 'string') return ref;
    return document.getElementById(ref) || (root || document).querySelector(ref);
  };
  const focusables = (root) => [...root.querySelectorAll(FOCUSABLE)].filter((el) => {
    if (el.disabled || el.getAttribute('tabindex') === '-1' || el.hidden) return false;
    return el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  });

  function lockBackground(overlay) {
    // Todo lo que no sea el fondo del dialogo (ni sus ancestros) queda inerte:
    // ni foco ni lector de pantalla llegan a la pagina de atras.
    const marked = [];
    let node = overlay;
    while (node && node !== document.body) {
      const parent = node.parentElement;
      if (!parent) break;
      [...parent.children].forEach((sibling) => {
        if (sibling === node || sibling.tagName === 'SCRIPT' || sibling.tagName === 'STYLE') return;
        const n = inertCount.get(sibling) || 0;
        inertCount.set(sibling, n + 1);
        if (n === 0) sibling.setAttribute('inert', '');
        marked.push(sibling);
      });
      node = parent;
    }
    return marked;
  }
  function unlockBackground(marked) {
    marked.forEach((el) => {
      const n = (inertCount.get(el) || 1) - 1;
      inertCount.set(el, n);
      if (n <= 0) el.removeAttribute('inert');
    });
  }

  function register(config) {
    const overlay = asElement(config.overlay);
    if (!overlay) return null;
    if (registry.has(overlay)) return registry.get(overlay);
    const dialog = asElement(config.dialog, overlay) || overlay.firstElementChild;
    const openClass = config.openClass || 'open';
    const titleEl = asElement(config.title, overlay) || dialog.querySelector('h1,h2,h3,[id$="title"]');

    overlay.classList.add('oxxo-dialog-overlay');
    dialog.classList.add('oxxo-dialog');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('tabindex', '-1');
    if (titleEl) {
      if (!titleEl.id) titleEl.id = `oxxo-dialog-title-${++seq}`;
      dialog.setAttribute('aria-labelledby', titleEl.id);
    }
    overlay.setAttribute('aria-hidden', String(!overlay.classList.contains(openClass)));

    let lastFocus = null;
    let marked = [];
    let pressedOnBackdrop = false;

    const handle = {
      overlay, dialog,
      isOpen: () => overlay.classList.contains(openClass),
      open(trigger) {
        if (handle.isOpen()) return;
        lastFocus = trigger || document.activeElement;
        overlay.classList.add(openClass);
        overlay.setAttribute('aria-hidden', 'false');
        stack.push(handle);
        document.documentElement.classList.add('oxxo-dialog-open');
        marked = lockBackground(overlay);
        dialog.scrollTop = 0;
        dialog.focus({ preventScroll: true });
      },
      close() {
        if (!handle.isOpen()) return;
        overlay.classList.remove(openClass);
        overlay.setAttribute('aria-hidden', 'true');
        const at = stack.indexOf(handle);
        if (at >= 0) stack.splice(at, 1);
        unlockBackground(marked);
        marked = [];
        if (!stack.length) document.documentElement.classList.remove('oxxo-dialog-open');
        if (lastFocus && lastFocus !== document.body && document.contains(lastFocus) && typeof lastFocus.focus === 'function') {
          lastFocus.focus({ preventScroll: true });
        }
        lastFocus = null;
        if (typeof config.onClose === 'function') config.onClose();
      }
    };

    // Clic en el fondo: solo si el gesto empezo y termino en el fondo (no al
    // soltar un arrastre de seleccion de texto que empezo dentro).
    overlay.addEventListener('mousedown', (e) => { pressedOnBackdrop = e.target === overlay; });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay && pressedOnBackdrop) handle.close();
      pressedOnBackdrop = false;
    });
    const closers = config.close
      ? (typeof config.close === 'string' ? [...dialog.querySelectorAll(config.close)] : [].concat(config.close))
      : [];
    closers.forEach((btn) => {
      if (btn.tagName === 'BUTTON') btn.type = 'button';
      if (!btn.getAttribute('aria-label')) btn.setAttribute('aria-label', 'Cerrar');
      btn.addEventListener('click', () => handle.close());
    });

    registry.set(overlay, handle);
    return handle;
  }

  document.addEventListener('keydown', (e) => {
    const top = stack[stack.length - 1];
    if (!top) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      top.close();
      return;
    }
    if (e.key !== 'Tab') return;
    const items = focusables(top.dialog);
    if (!items.length) { e.preventDefault(); top.dialog.focus(); return; }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === top.dialog || !top.dialog.contains(active))) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && (active === last || !top.dialog.contains(active))) {
      e.preventDefault(); first.focus();
    }
  });

  // rows: filas ya renderizadas. run(tr): la accion de siempre. label: prefijo
  // del nombre accesible ("Ver detalle"). opts.cell: celda del boton (0),
  // opts.pressed(tr): estado aria-pressed cuando la accion es un filtro.
  function bindRows(rows, label, run, opts) {
    const cellIndex = (opts && opts.cell) || 0;
    [...rows].forEach((tr) => {
      const cell = tr.cells && tr.cells[cellIndex];
      if (!cell || tr.dataset.rowAction) return;
      tr.dataset.rowAction = '1';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'row-action';
      const nombre = cell.textContent.trim();
      btn.setAttribute('aria-label', nombre ? `${label}: ${nombre}` : label);
      if (opts && opts.pressed) btn.setAttribute('aria-pressed', String(Boolean(opts.pressed(tr))));
      while (cell.firstChild) btn.appendChild(cell.firstChild);
      cell.appendChild(btn);
      btn.addEventListener('click', (e) => { e.stopPropagation(); run(tr); });
      tr.addEventListener('click', (e) => {
        if (e.target.closest('button,a,input,select,textarea,label')) return;
        btn.focus({ preventScroll: true });   // el foco vuelve aqui al cerrar el dialogo
        run(tr);
      });
    });
  }

  // ── Tarjetas KPI que filtran ─────────────────────────────
  const KPI = '.kpi-card[data-kpi], .kpi-card[role="button"]';
  // Cada tablero marca su filtro activo a su manera: "active" (D1-D3, D7) o
  // "kpi-active", "kpi-active-red/-blue/-green" (D4, D9).
  const kpiActive = (card) => [...card.classList].some((name) => name === 'active' || name.startsWith('kpi-active'));
  function syncKpis() {
    document.querySelectorAll(KPI).forEach((card) => {
      if (!card.hasAttribute('role')) {
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        card.dataset.kpiKeys = '1';      // el teclado lo atiende el listener de abajo
      }
      const active = String(kpiActive(card));
      if (card.getAttribute('aria-pressed') !== active) card.setAttribute('aria-pressed', active);
    });
  }
  // ── Filtros desplegables ─────────────────────────────────
  let smartSeq = 0;
  function syncSmartFilters() {
    document.querySelectorAll('.smart-filter').forEach((box) => {
      const button = box.querySelector('.smart-filter__button');
      const menu = box.querySelector('.smart-filter__menu');
      if (!button || !menu) return;
      if (!menu.id) menu.id = `${box.id || `smart-filter-${++smartSeq}`}-menu`;
      const open = String(box.classList.contains('open'));
      if (button.getAttribute('aria-controls') !== menu.id) button.setAttribute('aria-controls', menu.id);
      if (button.getAttribute('aria-expanded') !== open) button.setAttribute('aria-expanded', open);
      const nombre = (button.id && document.querySelector(`label[for="${button.id}"]`)?.textContent.trim()) || '';
      if (!menu.hasAttribute('role')) menu.setAttribute('role', 'group');
      if (!menu.hasAttribute('aria-label') && nombre) menu.setAttribute('aria-label', nombre);
      const search = menu.querySelector('.smart-filter__search');
      if (search && !search.hasAttribute('aria-label')) search.setAttribute('aria-label', nombre ? `Buscar en ${nombre}` : 'Buscar en la lista');
      menu.querySelectorAll('.smart-filter__option').forEach((option) => {
        const on = String(option.classList.contains('is-active'));
        if (option.getAttribute('aria-pressed') !== on) option.setAttribute('aria-pressed', on);
      });
    });
  }
  const closeSmartFilters = (returnFocus) => {
    const abierto = document.querySelector('.smart-filter.open');
    if (!abierto) return false;
    document.querySelectorAll('.smart-filter.open').forEach((box) => box.classList.remove('open'));
    if (returnFocus) abierto.querySelector('.smart-filter__button')?.focus();
    return true;
  };
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !stack.length && closeSmartFilters(true)) e.preventDefault();
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.smart-filter')) closeSmartFilters(false);
  });

  let kpiTimer = 0;   // setTimeout y no rAF: una pestaña en segundo plano tambien debe quedar al dia
  const scheduleKpis = () => { if (!kpiTimer) kpiTimer = setTimeout(() => { kpiTimer = 0; syncKpis(); syncSmartFilters(); }, 30); };
  document.addEventListener('keydown', (e) => {
    if ((e.key !== 'Enter' && e.key !== ' ') || !e.target.matches || !e.target.matches('.kpi-card[data-kpi-keys]')) return;
    e.preventDefault();
    e.target.click();
  });
  const startKpis = () => {
    syncKpis();
    syncSmartFilters();
    new MutationObserver(scheduleKpis).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startKpis);
  else startKpis();

  const find = (ref) => registry.get(asElement(ref));
  window.OXXO_DIALOGS = {
    register,
    bindRows,
    open: (ref, trigger) => find(ref)?.open(trigger),
    close: (ref) => find(ref)?.close(),
    closeAll: () => [...stack].reverse().forEach((h) => h.close()),
    isOpen: (ref) => Boolean(find(ref)?.isOpen())
  };
})();
