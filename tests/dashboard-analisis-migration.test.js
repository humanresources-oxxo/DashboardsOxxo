const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const read = file => fs.readFileSync(file, 'utf8');
const headOf = html => html.slice(0, html.indexOf('</head>'));
const linksOf = head => [...head.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"?]+)/g)].map(m => m[1]);
const LEGACY = ['dashboard-skin.css', 'floating-filter-layout.css', 'rh-dashboard-refresh.css'];

// Vistas de análisis (drill-down) migradas al canon rh-unified.
const pages = [
  { file: 'dashboards/dashboard-2-analisis.html', page: 'dashboard-2-analisis-page', css: 'css/dashboard-2-analisis.css' },
  { file: 'dashboards/dashboard-9-analisis.html', page: 'dashboard-9-analisis-page', css: 'css/dashboard-9-analisis.css' },
];

test('las vistas de análisis cargan el canon vía rh-unified y sueltan la pila legada', () => {
  for (const { file, page, css } of pages) {
    const html = read(file);
    const head = headOf(html);

    // Un solo <style> en el head: el candado preventivo, nada de presentación inline.
    const styles = [...head.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)];
    assert.equal(styles.length, 1, `${file}: solo queda el estilo del candado`);
    assert.match(styles[0][1], /html\.oxxo-locked/, `${file}: el estilo restante es funcional`);

    // El <body> declara su scope de página y el canon compartido.
    assert.match(html, new RegExp(`<body class="[^"]*\\b${page}\\b`), `${file}: clase de página`);
    assert.match(html, /<body class="[^"]*\brh-unified\b/, `${file}: clase de canon compartido`);

    // Ninguna capa heredada global.
    for (const legacy of LEGACY) {
      assert.doesNotMatch(head, new RegExp(legacy.replace('.', '\\.')), `${file}: sin capa heredada ${legacy}`);
    }

    // El canon va antes de la hoja propia de la página.
    const links = linksOf(head);
    const canon = links.findIndex(l => l.includes('dashboard-rh-unified.css'));
    const own = links.findIndex(l => l.includes(css.split('/').pop()));
    assert.ok(canon !== -1, `${file}: carga dashboard-rh-unified.css`);
    assert.ok(own !== -1 && own > canon, `${file}: la hoja propia va después del canon`);
  }
});

test('las hojas propias están aisladas por su scope de página (sin selectores globales, sin !important)', () => {
  for (const { css, page } of pages) {
    const text = read(css);
    const scoped = text.match(new RegExp(`body\\.${page}`, 'g')) || [];
    assert.ok(scoped.length > 10, `${css}: cobertura de componentes (${scoped.length})`);
    // Cada regla arranca desde el scope de la página (ignora comentarios y medias).
    const noComments = text.replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(noComments, /^\s*(?:html|:root|body(?!\.dashboard-)|[.#][a-z_-])[^{]*\{/im, `${css}: sin selectores globales`);
    assert.doesNotMatch(noComments, /!important/, `${css}: sin !important residual`);
  }
});

test('las hojas de análisis adoptan el sistema blanco: sin degradado de héroe ni vidrio heredado', () => {
  for (const { css } of pages) {
    const text = read(css);
    assert.doesNotMatch(text, /radial-gradient/, `${css}: sin lienzo con radial-gradient`);
    // El único linear-gradient permitido es el sutil del bloque de hallazgo (dato), no un héroe opaco.
    assert.doesNotMatch(text, /linear-gradient\(135deg,\s*#[0-9a-f]{3,6}\s+0%/i, `${css}: sin degradado sólido de héroe heredado`);
    assert.match(text, /var\(--du-/, `${css}: usa tokens del canon`);
  }
});

test('D2-análisis preserva IDs, contrato de scope y handlers que consume el JS', () => {
  const html = read('dashboards/dashboard-2-analisis.html');
  for (const id of ['filtro-mes', 'kpi-section', 'chart-antiguedad', 'chart-detalle', 'tabla-antiguedad', 'tabla-correlacion', 'hallazgos-motivos', 'hallazgos-lectura', 'tabla-plan']) {
    assert.match(html, new RegExp(`id="${id}"`), `D2-análisis conserva #${id}`);
  }
  assert.match(html, /data-oxxo-scope-mount/, 'D2-análisis conserva el punto de montaje de plaza');
  assert.match(html, /OXXO\.fetchSheetData/, 'D2-análisis conserva la carga de datos');
  assert.match(html, /window\.buildExcelSheets/, 'D2-análisis conserva el export a Excel');
  // Sigue enlazando de vuelta a su tablero padre.
  assert.match(html, /href="dashboard-2\.html"/, 'D2-análisis vuelve a Bajas Diarias');
});

test('D9-análisis preserva IDs, contrato de scope y handlers que consume el JS', () => {
  const html = read('dashboards/dashboard-9-analisis.html');
  for (const id of ['kpi-section', 'chart-pulso', 'rank-list', 'concept-list', 'finding-text', 'imb-grid', 'chart-quad', 'load-time']) {
    assert.match(html, new RegExp(`id="${id}"`), `D9-análisis conserva #${id}`);
  }
  assert.match(html, /data-oxxo-scope-mount/, 'D9-análisis conserva el punto de montaje de plaza');
  assert.match(html, /OXXO\.fetchSheetData/, 'D9-análisis conserva la carga de datos');
  assert.match(html, /OXXO\.updateFooterTime\('load-time'\)/, 'D9-análisis conserva el sello de pie');
  assert.match(html, /href="dashboard-9\.html"/, 'D9-análisis vuelve a Faltantes y Sobrantes');
});
