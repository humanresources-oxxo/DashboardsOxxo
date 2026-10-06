const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const read = file => fs.readFileSync(file, 'utf8');
const pages = [
  ['dashboards/dashboard-1.html', 'dashboard-1-page', 'dashboard-1.css'],
  ['dashboards/dashboard-3.html', 'dashboard-3-page', 'dashboard-3.css'],
  ['dashboards/dashboard-8.html', 'dashboard-8-page', 'dashboard-8.css'],
];

test('D1, D3 y D8 usan una sola cascada visual consolidada, con dialogos al final', () => {
  for (const [file, bodyClass, pageCss] of pages) {
    const html = read(file);
    const head = html.slice(0, html.indexOf('</head>'));
    const styles = [...head.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)];
    assert.equal(styles.length, 1, `${file}: solo queda el estilo preventivo del candado`);
    assert.match(styles[0][1], /html\.oxxo-locked/, `${file}: el estilo restante es funcional`);
    assert.match(html, new RegExp(`<body class="[^"]*${bodyClass}`), `${file}: clase de aislamiento`);
    for (const legacy of ['dashboard-skin.css', 'floating-filter-layout.css', 'rh-dashboard-refresh.css']) {
      assert.doesNotMatch(head, new RegExp(legacy.replace('.', '\\.')), `${file}: sin capa heredada ${legacy}`);
    }
    const links = [...head.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(match => match[1]);
    assert.ok(links.at(-3).includes('dashboard-rh-unified.css'), `${file}: base unificada antes de la hoja propia`);
    assert.ok(links.at(-2).includes(pageCss), `${file}: hoja propia al final de la cascada visual`);
    assert.ok(links.at(-1).includes('dashboard-dialogs.css'), `${file}: accesibilidad de dialogos conserva prioridad final`);
    assert.doesNotMatch(head, /d1-(?:extras|liquid|macos)|d3-(?:extras|layout|dashboard2)/, `${file}: sin capas finales antiguas`);
  }
});

test('la base unificada conserva los tokens y estados visuales efectivos de D2', () => {
  const css = read('css/dashboard-rh-unified.css');
  for (const token of ['--du-bg: #f7f4f0', '--du-card: #ffffff', '--du-border: #ded6cf', '--du-text: #2a1c19', '--du-radius: 14px', '--du-target: 44px']) {
    assert.match(css, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), token);
  }
  assert.match(css, /:focus-visible/, 'foco visible');
  assert.match(css, /:disabled/, 'estado disabled');
  assert.match(css, /:active/, 'estado active');
  assert.match(css, /:hover/, 'estado hover');
  assert.match(css, /prefers-reduced-motion/, 'movimiento reducido');
  assert.match(css, /forced-colors/, 'colores forzados');
  assert.match(css, /@media print/, 'impresion');
});

test('las hojas nuevas estan aisladas y no reintroducen vidrio o sombras multicapa', () => {
  for (const file of ['css/dashboard-1.css', 'css/dashboard-3.css', 'css/dashboard-8.css']) {
    const css = read(file);
    const page = file.match(/dashboard-(\d+)\.css/)[1];
    const pageClass = `dashboard-${page}-page`;
    const scopedRules = css.match(new RegExp(`body\\.${pageClass}`, 'g')) || [];
    assert.ok(scopedRules.length > 20, `${file}: cobertura de componentes`);
    assert.doesNotMatch(css, /^\s*(?:html|:root|body(?!\.dashboard)|[.#][a-z_-])[^{]*\{/im, `${file}: sin selectores globales`);
    assert.doesNotMatch(css, /backdrop-filter|\bglass\b|box-shadow\s*:[^;]*,[^;]*,/i, `${file}: sin vidrio ni sombras apiladas`);
  }
});

test('D3 mantiene visibles las plazas debajo del piso de la escala', () => {
  const html = read('dashboards/dashboard-3.html');
  assert.match(html, /plazaData = \(Array\.isArray\(plazaData\) \? plazaData : \[\]\)\.map\(p =>/);
  assert.match(html, /Number\.isFinite\(aprov\)/);
  assert.match(html, /const ec = Number\.isFinite\(Number\(p\?\.aprov\)\) \? Number\(p\.aprov\) : 0/);
  assert.match(html, /const minValue = values\.length \? Math\.min\(\.\.\.values\) : o\.floor/);
  assert.match(html, /const floor = Math\.min\(o\.floor, Math\.max\(0, Math\.floor\(minValue \/ 5\) \* 5\)\)/);
  assert.match(html, /const visibleH = h > 0 \? h : 8/);
  assert.match(html, /plaza-bars__value--outside/);
});
