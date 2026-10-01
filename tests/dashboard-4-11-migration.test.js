const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const read = file => fs.readFileSync(file, 'utf8');
const headOf = html => html.slice(0, html.indexOf('</head>'));
const linksOf = head => [...head.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"?]+)/g)].map(m => m[1]);
const LEGACY = ['dashboard-skin.css', 'floating-filter-layout.css', 'rh-dashboard-refresh.css'];

// Piloto de migración a rh-unified (canon compartido) para la Familia A.
const pilots = [
  { file: 'dashboards/dashboard-4.html', page: 'dashboard-4-page', css: 'css/dashboard-4.css', dialogs: true },
  { file: 'dashboards/dashboard-11.html', page: 'dashboard-11-page', css: 'css/dashboard-11.css', dialogs: false },
];

test('los pilotos cargan el canon vía class rh-unified y sueltan la pila skin/floating/refresh', () => {
  for (const { file, page } of pilots) {
    const html = read(file);
    const head = headOf(html);

    // Un solo <style> en el head: el candado preventivo, nada de CSS de presentación inline.
    const styles = [...head.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)];
    assert.equal(styles.length, 1, `${file}: solo queda el estilo del candado`);
    assert.match(styles[0][1], /html\.oxxo-locked/, `${file}: el estilo restante es funcional`);

    // El <body> declara su scope de página y el scope compartido reutilizable.
    assert.match(html, new RegExp(`<body class="[^"]*\\b${page}\\b`), `${file}: clase de página`);
    assert.match(html, /<body class="[^"]*\brh-unified\b/, `${file}: clase de canon compartido`);

    // Ninguna capa heredada global.
    for (const legacy of LEGACY) {
      assert.doesNotMatch(head, new RegExp(legacy.replace('.', '\\.')), `${file}: sin capa heredada ${legacy}`);
    }

    // El canon se carga y va antes de la hoja propia de la página.
    const links = linksOf(head);
    const canon = links.findIndex(l => l.includes('dashboard-rh-unified.css'));
    const own = links.findIndex(l => l.includes(`${page.replace('-page', '')}.css`));
    assert.ok(canon !== -1, `${file}: carga dashboard-rh-unified.css`);
    assert.ok(own !== -1 && own > canon, `${file}: la hoja propia va después del canon`);
  }
});

test('D4 conserva el contrato de diálogos y herramientas de tabla al final de la cascada', () => {
  const head = headOf(read('dashboards/dashboard-4.html'));
  const links = linksOf(head);
  assert.ok(links.at(-3).includes('dashboard-rh-unified.css'), 'canon como antepenúltima');
  assert.ok(links.at(-2).includes('dashboard-4.css'), 'hoja propia penúltima');
  assert.ok(links.at(-1).includes('dashboard-dialogs.css'), 'diálogos al final (accesibilidad)');
  // rh-table-tools sigue presente porque la tabla usa data-rh-tools.
  assert.match(head, /rh-table-tools\.css/, 'D4 conserva rh-table-tools');
});

test('D11 termina su cascada visual en su propia hoja (no usa diálogos ni table-tools)', () => {
  const head = headOf(read('dashboards/dashboard-11.html'));
  const links = linksOf(head);
  assert.deepEqual(links, ['../css/global.css', '../css/dashboard-rh-unified.css', '../css/dashboard-11.css'],
    'D11: global -> canon -> hoja propia, sin capas extra');
});

test('desaparecen los parches anti-skin por ID e !important en la hoja de D4', () => {
  // Se ignoran los comentarios: importa el CSS efectivo, no el texto explicativo.
  const css = read('css/dashboard-4.css').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(css, /#ranking-container|#kpi-section/, 'sin selectores por ID (existían solo para vencer a skin)');
  assert.doesNotMatch(css, /!important/, 'sin !important residual en la hoja propia');
});

test('las hojas propias de los pilotos están aisladas por su scope de página', () => {
  for (const { css, page } of pilots) {
    const text = read(css);
    const scoped = text.match(new RegExp(`body\\.${page}`, 'g')) || [];
    assert.ok(scoped.length > 15, `${css}: cobertura de componentes (${scoped.length})`);
    // Ninguna regla global: cada selector arranca desde el scope de la página.
    assert.doesNotMatch(text, /^\s*(?:html|:root|body(?!\.dashboard-)|[.#][a-z_-])[^{]*\{/im, `${css}: sin selectores globales`);
  }
});

test('el canon quedó consolidado en UN solo scope reutilizable body.rh-unified', () => {
  const css = read('css/dashboard-rh-unified.css');
  assert.ok((css.match(/body\.rh-unified/g) || []).length > 100, 'canon íntegramente bajo body.rh-unified');
  // Ya no repite las tres clases por página: el scope es único.
  assert.doesNotMatch(css, /body\.dashboard-[138]-page/, 'sin listas de selectores por página duplicadas');
  // Los tokens efectivos de D2 siguen intactos.
  assert.match(css, /--du-bg:\s*#f7f4f0/i, 'token de fondo');
  assert.match(css, /--du-radius:\s*14px/i, 'token de radio');
});

test('las referencias D1/D3/D8 y los pilotos declaran el opt-in rh-unified', () => {
  for (const n of [1, 3, 8, 4, 11]) {
    const html = read(`dashboards/dashboard-${n}.html`);
    assert.match(html, /<body class="[^"]*\brh-unified\b/, `dashboard-${n}: opta al canon`);
    assert.match(html, new RegExp(`<body class="[^"]*\\bdashboard-${n}-page\\b`), `dashboard-${n}: conserva su clase de página`);
  }
});

test('D11 adopta el sistema blanco: sin lienzo rojo, degradado de héroe ni vidrio heredado', () => {
  const css = read('css/dashboard-11.css');
  assert.doesNotMatch(css, /radial-gradient/, 'sin lienzo rojo (radial-gradient)');
  assert.doesNotMatch(css, /linear-gradient\(118deg|linear-gradient\(180deg/, 'sin degradado de héroe/fondo heredado');
  assert.doesNotMatch(css, /border-radius:\s*(?:17|18|20|22|28)px/, 'sin radios inflados del glass anterior');
  assert.doesNotMatch(css, /rgba\(255,\s*255,\s*255,\s*\.(?:7|8|9)/, 'sin rellenos translúcidos de vidrio');
  // Se apoya en los tokens del canon (adopta el sistema, no lo re-declara).
  assert.match(css, /var\(--du-/, 'usa tokens del canon');
});

test('se preservan los contratos de DOM (IDs, data-* y handlers) que consume el JS', () => {
  const d4 = read('dashboards/dashboard-4.html');
  for (const id of ['kpi-section', 'ranking-container', 'tabla-detalle', 'te-asesor-modal', 'filter-banner']) {
    assert.match(d4, new RegExp(`id="${id}"`), `D4 conserva #${id}`);
  }
  assert.match(d4, /data-rh-tools/, 'D4 conserva data-rh-tools');
  for (const handler of ['applyDropdownFilters', 'limpiarFiltros', 'OXXO.handleDownloadButton', 'setTableSort', 'setFilter']) {
    assert.match(d4, new RegExp(handler.replace('.', '\\.')), `D4 conserva handler ${handler}`);
  }
  assert.match(d4, /js\/dashboard-dialogs\.js/, 'D4 conserva el controlador de diálogos');

  const d11 = read('dashboards/dashboard-11.html');
  for (const id of ['kpi-section', 'detail-table', 'advisor-list', 'mix-ring', 'insights']) {
    assert.match(d11, new RegExp(`id="${id}"`), `D11 conserva #${id}`);
  }
  // La sección de insights mantiene la clase hr-insights: reclama el slot para que
  // rh-dashboard-enhancements.js no inyecte un riel duplicado.
  assert.match(d11, /class="insights hr-insights"/, 'D11 conserva insights hr-insights');
});
