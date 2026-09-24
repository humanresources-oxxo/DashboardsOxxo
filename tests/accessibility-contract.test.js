// Contrato de accesibilidad de los tableros: semantica de dialogos, controles
// con nombre, botones tipados y filas accionables con boton nativo. Verifica
// lo observable en el HTML/JS publicado (no snapshots ni espacios en blanco).
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.resolve(__dirname, '..');
const leer = rel => fs.readFileSync(path.join(raiz, rel), 'utf8');
const dashboards = fs.readdirSync(path.join(raiz, 'dashboards')).filter(n => n.endsWith('.html')).map(n => `dashboards/${n}`);
// Paginas con ventana de detalle que usan el controlador compartido.
const CON_DIALOGOS = [1, 2, 3, 4, 7, 8, 9, 12, 13].map(n => `dashboards/dashboard-${n}.html`);
const CON_FILTROS = [...CON_DIALOGOS, 'dashboards/dashboard-5.html', 'dashboards/dashboard-6.html', 'dashboards/dashboard-14.html'];
const sinScripts = html => html.replace(/<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>|<!--[\s\S]*?-->/g, '');
const atributo = (tag, nombre) => (tag.match(new RegExp(`\\b${nombre}="([^"]*)"`)) || [])[1];

test('las paginas con detalle cargan el controlador compartido y su css al final', () => {
  for (const pagina of CON_DIALOGOS) {
    const html = leer(pagina);
    assert.match(html, /<script src="\.\.\/js\/dashboard-dialogs\.js\?v=/, `${pagina} debe cargar dashboard-dialogs.js`);
    const enlaces = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"?]+)/g)].map(m => m[1]);
    assert.equal(enlaces[enlaces.length - 1], '../css/dashboard-dialogs.css', `${pagina}: dashboard-dialogs.css va al final`);
  }
  for (const pagina of ['dashboards/dashboard-5.html', 'dashboards/dashboard-6.html', 'dashboards/dashboard-14.html']) {
    assert.match(leer(pagina), /dashboard-dialogs\.js/, `${pagina} usa filtros desplegables`);
  }
});

test('cada modal declara dialogo accesible: role, aria-modal, titulo real y cierre tipado', () => {
  for (const pagina of CON_DIALOGOS) {
    const html = sinScripts(leer(pagina));
    const fondos = [...html.matchAll(/<div\b[^>]*class="[^"]*(?:am-overlay|baja-overlay|d7-overlay|te-modal-overlay|fs-modal-overlay)[^"]*"[^>]*>/g)].map(m => m[0]);
    assert.ok(fondos.length >= 1, `${pagina}: se esperaba al menos un modal`);
    for (const fondo of fondos) {
      assert.equal(atributo(fondo, 'aria-hidden'), 'true', `${pagina}: el fondo ${atributo(fondo, 'id')} inicia aria-hidden`);
      assert.doesNotMatch(fondo, /onclick=/, `${pagina}: el clic en el fondo lo maneja el controlador`);
      const inicio = html.indexOf(fondo) + fondo.length;
      const dialogo = html.slice(inicio).match(/<div\b[^>]*>/)[0];
      assert.equal(atributo(dialogo, 'role'), 'dialog', `${pagina}: ${atributo(fondo, 'id')} sin role=dialog`);
      assert.equal(atributo(dialogo, 'aria-modal'), 'true');
      const titulo = atributo(dialogo, 'aria-labelledby');
      assert.ok(titulo && new RegExp(`\\bid="${titulo}"`).test(html), `${pagina}: aria-labelledby="${titulo}" debe apuntar a un titulo existente`);
      // El primer boton del dialogo es el de cerrar.
      const cerrar = html.slice(inicio).match(/<button\b[^>]*>/)[0];
      assert.equal(atributo(cerrar, 'type'), 'button');
      assert.ok(atributo(cerrar, 'aria-label'), `${pagina}: el boton de cerrar necesita aria-label`);
      assert.doesNotMatch(cerrar, /onclick=/);
    }
    const registrados = (leer(pagina).match(/OXXO_DIALOGS\.register\(/g) || []).length;
    assert.equal(registrados, fondos.length, `${pagina}: cada modal se registra en el controlador`);
  }
});

test('el controlador implementa foco, trampa de Tab, Escape, fondo y restauracion', () => {
  const js = leer('js/dashboard-dialogs.js');
  for (const pieza of [/role.*dialog/, /aria-modal/, /aria-labelledby/, /aria-hidden/, /key === 'Escape'/, /key !== 'Tab'|key === 'Tab'/, /shiftKey/, /lastFocus\.focus/, /'inert'/, /oxxo-dialog-open/, /window\.OXXO_DIALOGS/]) {
    assert.match(js, pieza);
  }
  assert.match(js, /register,\s*\n?\s*bindRows/);
  assert.match(js, /open:.*\n.*close:/s);
});

test('no quedan filas de tabla accionables solo con el raton', () => {
  const culpables = [];
  for (const archivo of [...dashboards, 'index.html']) {
    const texto = leer(archivo);
    for (const m of texto.matchAll(/<tr\b[^>]*\bonclick=/g)) culpables.push(`${archivo}: ${m[0].slice(0, 60)}`);
    for (const m of texto.matchAll(/\btr\.addEventListener\(\s*'click'/g)) culpables.push(`${archivo}: tr.addEventListener('click')`);
    for (const m of texto.matchAll(/\bonmouse(?:over|out)=/g)) culpables.push(`${archivo}: ${m[0]}`);
  }
  assert.deepEqual(culpables, []);
  // Y donde hay filas accionables, el boton nativo sale del helper compartido.
  for (const pagina of ['dashboards/dashboard-8.html', 'dashboards/dashboard-12.html', 'dashboards/dashboard-13.html']) {
    assert.match(leer(pagina), /OXXO_DIALOGS\.bindRows\(/, `${pagina} debe usar bindRows`);
  }
});

test('todo <button> de los tableros y del panel declara type', () => {
  const sinTipo = [];
  for (const archivo of [...dashboards, 'index.html', 'admin.html']) {
    for (const m of leer(archivo).matchAll(/<button\b[^>]*>/g)) {
      if (!/\btype=/.test(m[0])) sinTipo.push(`${archivo}: ${m[0].slice(0, 70)}`);
    }
  }
  assert.deepEqual(sinTipo, []);
});

test('toda etiqueta visible se asocia con su control o nombra a un grupo', () => {
  const huerfanas = [];
  for (const archivo of [...CON_FILTROS, 'dashboards/inventarios.html', 'dashboards/promociones.html', 'admin.html']) {
    const completo = leer(archivo);
    const html = sinScripts(completo);
    // El combobox de Asesor lo monta OXXO.mountAsesorFilter dentro de #filtro-asesor.
    const montaAsesor = /id="filtro-asesor"/.test(completo);
    for (const m of html.matchAll(/<label\b([^>]*)>([\s\S]*?)<\/label>/g)) {
      const attrs = m[1];
      if (/aria-hidden="true"/.test(attrs) || /<(?:select|input|textarea)\b/.test(m[2])) continue;   // espaciador o control anidado
      const para = atributo(attrs, 'for');
      const id = atributo(attrs, 'id');
      let ok = false;
      if (para) ok = new RegExp(`\\bid="${para}"`).test(html) || (montaAsesor && para === 'filtro-asesor-button');
      else if (id) ok = new RegExp(`aria-labelledby="[^"]*\\b${id}\\b`).test(html);
      if (!ok) huerfanas.push(`${archivo}: <label${attrs}>${m[2].replace(/<[^>]+>/g, '').trim().slice(0, 30)}`);
    }
  }
  assert.deepEqual(huerfanas, []);
});

test('selects e inputs de los filtros tienen nombre accesible', () => {
  const sinNombre = [];
  for (const archivo of [...CON_FILTROS, 'dashboards/inventarios.html', 'dashboards/promociones.html']) {
    const html = sinScripts(leer(archivo));
    for (const m of html.matchAll(/<(select|input)\b([^>]*)>/g)) {
      const attrs = m[2];
      if (/type="(?:hidden|checkbox|radio)"/.test(attrs)) continue;
      const id = atributo(attrs, 'id');
      const nombrado = /aria-label=|aria-labelledby=|title=/.test(attrs)
        || (id && new RegExp(`<label\\b[^>]*for="${id}"`).test(html))
        || (id && /smart-filter__search/.test(attrs));            // el controlador nombra el buscador
      // Envuelto por un <label> que lo contiene.
      const envuelto = id && new RegExp(`<label\\b[^>]*>(?:(?!</label>)[\\s\\S])*\\bid="${id}"`).test(html);
      if (!nombrado && !envuelto) sinNombre.push(`${archivo}: <${m[1]}${attrs.slice(0, 70)}>`);
    }
  }
  assert.deepEqual(sinNombre, []);
});

test('los filtros desplegables exponen su estado desde el controlador compartido', () => {
  const js = leer('js/dashboard-dialogs.js');
  assert.match(js, /aria-expanded/);
  assert.match(js, /aria-controls/);
  assert.match(js, /smart-filter/);
  for (const pagina of CON_FILTROS) assert.match(leer(pagina), /dashboard-dialogs\.js/, `${pagina} carga el controlador`);
});

test('las tarjetas KPI que filtran exponen aria-pressed', () => {
  const js = leer('js/dashboard-dialogs.js');
  assert.match(js, /aria-pressed/);
  assert.match(js, /classList\.contains\('active'\)/);
});

test('site-lock: etiqueta real, error anunciado y foco contenido', () => {
  const js = leer('js/site-lock.js');
  assert.match(js, /<label\b[^>]*for=/, 'el campo de contraseña necesita una etiqueta');
  assert.match(js, /aria-describedby/);
  assert.match(js, /aria-live|role="alert"/);
  assert.match(js, /'Tab'/, 'el foco debe quedar contenido en el candado');
});
