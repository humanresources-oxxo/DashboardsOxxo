// Comportamiento de js/dashboard-dialogs.js con un DOM minimo simulado (sin
// dependencias): estado aria-pressed de las tarjetas KPI (incluidas las clases
// kpi-active* de D4/D9), filtros desplegables, y el ciclo de un dialogo
// (foco, Tab atrapado, Escape, restauracion, inert y bloqueo de scroll).
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'dashboard-dialogs.js'), 'utf8');

class Elemento {
  constructor(tag, { id = '', clases = [], attrs = {}, focusable = false } = {}) {
    this.tagName = tag.toUpperCase();
    this.id = id;
    this._clases = new Set(clases);
    this._attrs = new Map(Object.entries(attrs));
    this.children = [];
    this.parentElement = null;
    // dataset refleja data-* como en un navegador real (kpiKeys -> data-kpi-keys).
    this.dataset = new Proxy({}, { set: (obj, clave, valor) => { this._attrs.set(`data-${clave.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}`, String(valor)); obj[clave] = valor; return true; } });
    this.focusable = focusable;
    this.listeners = {};
    const self = this;
    this.classList = {
      add(...n) { n.forEach((x) => self._clases.add(x)); },
      remove(...n) { n.forEach((x) => self._clases.delete(x)); },
      contains(n) { return self._clases.has(n); },
      toggle(n, f) { const on = f === undefined ? !self._clases.has(n) : f; on ? self._clases.add(n) : self._clases.delete(n); return on; },
      [Symbol.iterator]() { return self._clases[Symbol.iterator](); }
    };
  }
  get firstElementChild() { return this.children[0] || null; }
  hasAttribute(n) { return this._attrs.has(n); }
  getAttribute(n) { return this._attrs.has(n) ? this._attrs.get(n) : null; }
  setAttribute(n, v) { this._attrs.set(n, String(v)); if (n === 'tabindex') this.tabIndex = Number(v); }
  removeAttribute(n) { this._attrs.delete(n); }
  append(...hijos) { hijos.forEach((h) => { h.parentElement = this; this.children.push(h); }); return this; }
  contains(otro) { for (let n = otro; n; n = n.parentElement) if (n === this) return true; return false; }
  descendientes() { return this.children.flatMap((h) => [h, ...h.descendientes()]); }
  matches(sel) { return sel.split(',').some((s) => coincide(this, s.trim())); }
  querySelectorAll(sel) { return this.descendientes().filter((e) => e.matches(sel)); }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  closest(sel) { for (let n = this; n; n = n.parentElement) if (n.matches && n.matches(sel)) return n; return null; }
  addEventListener(tipo, fn) { (this.listeners[tipo] ||= []).push(fn); }
  focus() { if (this.ownerDocument) this.ownerDocument.activeElement = this; }
  click() { (this.listeners.click || []).forEach((fn) => fn({ target: this, stopPropagation() {} })); }
  getClientRects() { return [{}]; }
  scrollTop = 0;
  disabled = false;
  hidden = false;
}

// Selectores admitidos: .clase, tag, [attr], [attr="v"] y sus combinaciones sin espacios.
function coincide(el, sel) {
  const partes = sel.match(/[a-z0-9]+|\.[\w-]+|\[[^\]]+\]|:not\([^)]*\)/gi) || [];
  return partes.every((p) => {
    if (p.startsWith('.')) return el.classList.contains(p.slice(1));
    if (p.startsWith('[')) {
      const m = p.match(/\[([\w-]+)(?:="?([^"\]]*)"?)?\]/);
      return m[2] === undefined ? el.hasAttribute(m[1]) : el.getAttribute(m[1]) === m[2];
    }
    if (p.startsWith(':not')) return !coincide(el, p.slice(5, -1));
    return el.tagName === p.toUpperCase();
  });
}

function entorno() {
  const body = new Elemento('body');
  const html = new Elemento('html'); html.append(body);
  const doc = {
    body, documentElement: html, readyState: 'complete', activeElement: body,
    listeners: {}, hijos: [],
    addEventListener(tipo, fn) { (this.listeners[tipo] ||= []).push(fn); },
    querySelectorAll(sel) { return body.querySelectorAll(sel); },
    querySelector(sel) { return body.querySelector(sel); },
    getElementById(id) { return body.descendientes().find((e) => e.id === id) || null; },
    contains(e) { return body.contains(e) || e === body; },
    dispatch(tipo, evento) { (this.listeners[tipo] || []).forEach((fn) => fn(evento)); }
  };
  [body, html].forEach((e) => { e.ownerDocument = doc; });
  const originalAppend = Elemento.prototype.append;
  body.append = function (...hs) { hs.forEach((h) => marcar(h, doc)); return originalAppend.apply(this, hs); };
  let observador = null;
  const ventana = {
    document: doc,
    MutationObserver: class { constructor(cb) { observador = cb; } observe() {} },
    getComputedStyle: () => ({ visibility: 'visible' }),
    setTimeout, clearTimeout, requestAnimationFrame: (fn) => setTimeout(fn, 0), Promise, Symbol
  };
  ventana.window = ventana;
  vm.createContext(ventana);
  return { doc, body, ventana, disparaObservador: () => observador && observador(), correr: () => vm.runInContext(source, ventana) };
}
function marcar(e, doc) { e.ownerDocument = doc; e.children.forEach((h) => marcar(h, doc)); }
const esperar = (ms = 60) => new Promise((r) => setTimeout(r, ms));
const tecla = (key, extra = {}) => ({ key, shiftKey: false, preventDefault() { this.evitado = true; }, target: null, ...extra });

test('KPI: aria-pressed sigue a "active" y a las clases kpi-active* de D4/D9', async () => {
  const e = entorno();
  const tarjeta = (id, clases) => new Elemento('div', { id, clases: ['kpi-card', ...clases], attrs: { role: 'button', tabindex: '0' } });
  const todo = tarjeta('kpi-all', ['kpi-active']);           // D4: sin filtro
  const doble = tarjeta('kpi-doble', []);
  const triple = tarjeta('kpi-triple', []);
  const desc = tarjeta('kpi-desc', []);
  const d1 = new Elemento('div', { id: 'd1', clases: ['kpi-card', 'rojo'], attrs: { 'data-kpi': 'Lider' } });   // sin role: se agrega
  e.body.append(todo, doble, triple, desc, d1);
  e.correr();
  const api = e.ventana.OXXO_DIALOGS;
  assert.ok(api && typeof api.register === 'function');
  assert.equal(todo.getAttribute('aria-pressed'), 'true');
  assert.equal(doble.getAttribute('aria-pressed'), 'false');
  assert.equal(d1.getAttribute('role'), 'button');
  assert.equal(d1.getAttribute('tabindex'), '0');

  // setFilter('triple'): D4 quita kpi-active y agrega kpi-active-red.
  todo.classList.remove('kpi-active', 'kpi-active-red', 'kpi-active-blue');
  triple.classList.add('kpi-active-red');
  e.disparaObservador(); await esperar();
  assert.equal(todo.getAttribute('aria-pressed'), 'false');
  assert.equal(triple.getAttribute('aria-pressed'), 'true', 'kpi-active-red debe anunciarse como presionado');

  // setFilter('descanso'): kpi-active-blue.
  triple.classList.remove('kpi-active-red');
  desc.classList.add('kpi-active-blue');
  e.disparaObservador(); await esperar();
  assert.equal(triple.getAttribute('aria-pressed'), 'false');
  assert.equal(desc.getAttribute('aria-pressed'), 'true');

  // D9: kpi-active-green y regreso a "sin filtro".
  desc.classList.remove('kpi-active-blue');
  doble.classList.add('kpi-active-green');
  e.disparaObservador(); await esperar();
  assert.equal(doble.getAttribute('aria-pressed'), 'true');
  doble.classList.remove('kpi-active-green'); todo.classList.add('kpi-active');
  e.disparaObservador(); await esperar();
  assert.deepEqual([todo, doble, triple, desc].map((c) => c.getAttribute('aria-pressed')), ['true', 'false', 'false', 'false']);

  // D1-D3/D7: clase "active".
  d1.classList.add('active');
  e.disparaObservador(); await esperar();
  assert.equal(d1.getAttribute('aria-pressed'), 'true');

  // Enter / Espacio activan solo las tarjetas a las que el controlador agrego el rol.
  let clics = 0; d1.click = () => { clics++; };
  const ev = tecla('Enter', { target: d1 });
  e.doc.dispatch('keydown', ev);
  assert.equal(clics, 1);
  assert.equal(ev.evitado, true);
});

test('filtros desplegables: aria-expanded/controls, opciones y cierre con Escape', async () => {
  const e = entorno();
  const boton = new Elemento('button', { id: 'asesor-button', clases: ['smart-filter__button'], focusable: true });
  const opcion = new Elemento('button', { clases: ['smart-filter__option', 'is-active'] });
  const otra = new Elemento('button', { clases: ['smart-filter__option'] });
  const buscar = new Elemento('input', { clases: ['smart-filter__search'] });
  const menu = new Elemento('div', { id: 'asesor-menu', clases: ['smart-filter__menu'] }); menu.append(buscar, opcion, otra);
  const caja = new Elemento('div', { id: 'asesor-filter', clases: ['smart-filter'] }); caja.append(boton, menu);
  const etiqueta = new Elemento('label', { attrs: { for: 'asesor-button' } }); etiqueta.textContent = 'Asesor';
  e.body.append(etiqueta, caja);
  e.correr();
  assert.equal(boton.getAttribute('aria-controls'), 'asesor-menu');
  assert.equal(boton.getAttribute('aria-expanded'), 'false');
  assert.equal(opcion.getAttribute('aria-pressed'), 'true');
  assert.equal(otra.getAttribute('aria-pressed'), 'false');
  assert.match(buscar.getAttribute('aria-label') || '', /Buscar/);

  caja.classList.add('open');
  e.disparaObservador(); await esperar();
  assert.equal(boton.getAttribute('aria-expanded'), 'true');
  const ev = tecla('Escape');
  e.doc.dispatch('keydown', ev);
  assert.equal(caja.classList.contains('open'), false);
  assert.equal(e.doc.activeElement, boton, 'el foco vuelve al boton del filtro');
  e.disparaObservador(); await esperar();
  assert.equal(boton.getAttribute('aria-expanded'), 'false');
});

test('dialogo: semantica, foco, Tab atrapado, Escape, restauracion, inert y scroll', () => {
  const e = entorno();
  const principal = new Elemento('main');
  const disparador = new Elemento('button', { id: 'abrir', focusable: true });
  principal.append(disparador);
  const titulo = new Elemento('h2', { id: 'titulo' });
  const cerrar = new Elemento('button', { clases: ['cerrar'], focusable: true });
  const otro = new Elemento('button', { clases: ['otro'], focusable: true });
  const dialogo = new Elemento('div', { clases: ['dlg'] }); dialogo.append(titulo, cerrar, otro);
  const fondo = new Elemento('div', { id: 'fondo', clases: ['overlay'] }); fondo.append(dialogo);
  e.body.append(principal, fondo);
  e.correr();

  let cerrado = 0;
  const dlg = e.ventana.OXXO_DIALOGS.register({ overlay: 'fondo', title: 'titulo', close: '.cerrar', onClose: () => { cerrado++; } });
  assert.equal(dialogo.getAttribute('role'), 'dialog');
  assert.equal(dialogo.getAttribute('aria-modal'), 'true');
  assert.equal(dialogo.getAttribute('aria-labelledby'), 'titulo');
  assert.equal(fondo.getAttribute('aria-hidden'), 'true');
  assert.equal(cerrar.getAttribute('aria-label'), 'Cerrar');
  assert.equal(cerrar.type, 'button');

  disparador.focus();
  dlg.open();
  assert.equal(fondo.getAttribute('aria-hidden'), 'false');
  assert.equal(e.doc.activeElement, dialogo, 'el foco entra al dialogo');
  assert.equal(principal.hasAttribute('inert'), true, 'la pagina de atras queda inert');
  assert.equal(e.doc.documentElement.classList.contains('oxxo-dialog-open'), true, 'scroll de fondo bloqueado');

  // Tab desde el ultimo control vuelve al primero; Shift+Tab desde el primero va al ultimo.
  e.doc.activeElement = otro;
  let ev = tecla('Tab'); e.doc.dispatch('keydown', ev);
  assert.equal(e.doc.activeElement, cerrar); assert.equal(ev.evitado, true);
  ev = tecla('Tab', { shiftKey: true }); e.doc.dispatch('keydown', ev);
  assert.equal(e.doc.activeElement, otro);

  // Escape cierra y devuelve el foco al disparador.
  ev = tecla('Escape'); e.doc.dispatch('keydown', ev);
  assert.equal(dlg.isOpen(), false);
  assert.equal(cerrado, 1);
  assert.equal(e.doc.activeElement, disparador);
  assert.equal(principal.hasAttribute('inert'), false);
  assert.equal(e.doc.documentElement.classList.contains('oxxo-dialog-open'), false);

  // Clic en el fondo (solo si el gesto empezo en el fondo) y en el boton cerrar tambien cierran.
  dlg.open();
  fondo.listeners.mousedown.forEach((fn) => fn({ target: fondo }));
  fondo.listeners.click.forEach((fn) => fn({ target: fondo }));
  assert.equal(dlg.isOpen(), false);
  dlg.open(); cerrar.click();
  assert.equal(dlg.isOpen(), false);
  dlg.open();
  fondo.listeners.mousedown.forEach((fn) => fn({ target: dialogo }));       // seleccion de texto que termina fuera
  fondo.listeners.click.forEach((fn) => fn({ target: fondo }));
  assert.equal(dlg.isOpen(), true, 'un arrastre que empezo dentro no cierra');
});

test('varios dialogos: Escape cierra solo el de arriba y el fondo sigue bloqueado', () => {
  const e = entorno();
  const mk = (id) => {
    const t = new Elemento('h2', { id: `${id}-t` });
    const c = new Elemento('button', { clases: ['x'], focusable: true });
    const d = new Elemento('div'); d.append(t, c);
    const f = new Elemento('div', { id }); f.append(d);
    return f;
  };
  const a = mk('a'); const b = mk('b');
  e.body.append(a, b);
  e.correr();
  const A = e.ventana.OXXO_DIALOGS.register({ overlay: 'a', title: 'a-t', close: '.x' });
  const B = e.ventana.OXXO_DIALOGS.register({ overlay: 'b', title: 'b-t', close: '.x' });
  A.open(); B.open();
  e.doc.dispatch('keydown', tecla('Escape'));
  assert.equal(B.isOpen(), false);
  assert.equal(A.isOpen(), true);
  assert.equal(e.doc.documentElement.classList.contains('oxxo-dialog-open'), true);
  e.doc.dispatch('keydown', tecla('Escape'));
  assert.equal(A.isOpen(), false);
  assert.equal(e.doc.documentElement.classList.contains('oxxo-dialog-open'), false);
});
