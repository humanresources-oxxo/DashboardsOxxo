// Contrato de accesibilidad de los tableros: semantica de dialogos, controles
// con nombre, botones tipados y filas accionables con boton nativo. Verifica
// lo observable en el HTML/JS publicado (no snapshots ni espacios en blanco).
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.resolve(__dirname, '..');
const leer = rel => fs.readFileSync(path.join(raiz, rel), 'utf8');
// Paginas que sacaron su logica a js/dashboard-N.js (D2): el HTML mas su script propio.
const leerConScriptPropio = pagina => {
  const html = leer(pagina);
  const propio = html.match(/<script src="\.\.\/(js\/dashboard-\d+\.js)\?v=/);
  return propio ? `${html}\n${leer(propio[1])}` : html;
};
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
    // D2 agrega su propia hoja DESPUES de la de dialogos (regla de css/dashboard-2.css).
    const propio = pagina === 'dashboards/dashboard-2.html';
    assert.equal(enlaces[enlaces.length - 1], propio ? '../css/dashboard-2.css' : '../css/dashboard-dialogs.css', `${pagina}: la hoja de dialogos va al final`);
    if (propio) assert.equal(enlaces[enlaces.length - 2], '../css/dashboard-dialogs.css', `${pagina}: dashboard-dialogs.css va justo antes de dashboard-2.css`);
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
    const registrados = (leerConScriptPropio(pagina).match(/OXXO_DIALOGS\.register\(/g) || []).length;
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
  assert.match(js, /kpi-active/, 'D4/D9 marcan el filtro activo con kpi-active*');
});

test('site-lock: etiqueta real, error anunciado y foco contenido', () => {
  const js = leer('js/site-lock.js');
  assert.match(js, /<label\b[^>]*for=/, 'el campo de contraseña necesita una etiqueta');
  assert.match(js, /aria-describedby/);
  assert.match(js, /aria-live|role="alert"/);
  assert.match(js, /'Tab'/, 'el foco debe quedar contenido en el candado');
});


test('el css compartido define foco visible, sr-only, objetivos tactiles y reduced-motion', () => {
  const css = leer('css/global.css');
  assert.match(css, /:focus-visible/);
  assert.match(css, /\.sr-only/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});

test('D8: el boton de detalle por certificacion mide 44x44 en celular y nombra al asesor', () => {
  const d8 = leer('dashboards/dashboard-8.html');
  const boton = d8.match(/<button type="button" class="cap-row-more"[^>]*>/)[0];
  assert.match(boton, /aria-label="Ver detalle por certificacion de \$\{OXXO\.escHtml\(a\.asesor\)\}"/);
  const refresh = leer('css/rh-dashboard-refresh.css');
  const movil = refresh.slice(refresh.lastIndexOf('@media (max-width: 760px)'));
  assert.match(movil, /\.cap-row-more\s*\{[^}]*width:\s*44px\s*!important[^}]*height:\s*44px\s*!important/);
  assert.doesNotMatch(leer('css/global.css'), /:not\([^)]*\.cap-row-more/, 'ya no queda exento de la regla de 44px');
});

test('css responsive compartido: filtros 2/1 columnas, tabla con scroll propio y admin con tabs desplazables', () => {
  const filtros = leer('css/floating-filter-layout.css');
  assert.match(filtros, /max-width:\s*979px[\s\S]*?repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(filtros, /max-width:\s*639px[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)\s*!important/);
  const refresh = leer('css/rh-dashboard-refresh.css');
  assert.match(refresh, /\.tbl-wrap[\s\S]*?overflow-x:\s*auto\s*!important/);
  const admin = leer('css/admin-layout.css');
  assert.match(admin, /\.admin-tabs\{[^}]*overflow-x:auto/);
  assert.match(admin, /\.restore-dialog\{[^}]*max-height:91vh/);
  assert.equal((leer('admin.html').match(/<style/g) || []).length, 0, 'el css de presentacion vive en admin-layout.css');
});

test('admin: el candado es un dialogo con nombre, campo etiquetado, error descrito y foco contenido', () => {
  const html = leer('admin.html');
  const dialogo = html.match(/<div class="admin-lock"[^>]*>/)[0];
  assert.match(dialogo, /role="dialog"/);
  assert.match(dialogo, /aria-modal="true"/);
  assert.match(dialogo, /aria-labelledby="admin-lock-title"/);
  assert.match(html, /id="admin-lock-title"/);
  assert.match(html, /<label[^>]*for="admin-password"[^>]*>[^<]+<\/label>/, 'etiqueta real del campo');
  assert.match(html.match(/<input[^>]*id="admin-password"[^>]*>/)[0], /aria-describedby="admin-lock-error"/);
  assert.match(html.match(/<div[^>]*id="admin-lock-error"[^>]*>/)[0], /role="alert"|aria-live=/);
  const admin = leer('js/admin.js');
  const cuerpo = admin.slice(admin.indexOf('function initAdminLock'), admin.indexOf('const {\n    getHeaders') > 0 ? admin.indexOf('const {\n    getHeaders') : undefined);
  assert.match(cuerpo, /setAttribute\('inert'/, 'la pagina de atras queda inert');
  assert.match(cuerpo, /key!=='Tab'/, 'Tab queda contenido en el candado');
  assert.match(cuerpo, /removeAttribute\('inert'\)/);
  assert.match(cuerpo, /\.focus\?\.\(\)/, 'al desbloquear el foco pasa al panel');
});

test('D2: celdas del mapa de calor y encabezados del detalle se operan con teclado', () => {
  const d2 = leer('js/dashboard-2.js');
  // Cada celda es un <button> nativo con nombre, estado y tabindex itinerante (una sola en la secuencia de Tab).
  assert.match(d2, /<button type="button" class="heatmap-cell[^`]*aria-pressed="\$\{isActive\}"[^`]*aria-label="\$\{name\}"/);
  assert.match(d2, /tabindex="\$\{r === HEAT\.row && c === HEAT\.col \? 0 : -1\}"/);
  assert.match(d2, /'ArrowRight'[\s\S]*'Home'[\s\S]*'End'/);
  // El orden del detalle usa un boton dentro del <th> con aria-sort y no cambia DET_SORT.
  assert.match(d2, /<th scope="col" data-col="\$\{k\}" aria-sort="\$\{ariaSort\(k\)\}"><button type="button" class="d2-sort"/);
  assert.doesNotMatch(d2, /th\.addEventListener\('click'/, 'el th ya no es un elemento solo-raton');
});
