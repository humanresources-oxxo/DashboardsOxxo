const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const migrated = [
  'dashboard-1', 'dashboard-3', 'dashboard-4', 'dashboard-5',
  'dashboard-6', 'dashboard-7', 'dashboard-8', 'dashboard-9',
  'dashboard-11', 'dashboard-12', 'dashboard-13', 'dashboard-14',
  'dashboard-2-analisis', 'dashboard-9-analisis',
  'inventarios', 'promociones', 'mi-tienda', 'mi-dashboard',
];

const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const links = html => [...html.matchAll(/<link\b[^>]*href="([^"]+\.css(?:\?[^"]*)?)"[^>]*>/g)]
  .map(match => match[1].split('?')[0]);

test('todas las vistas migradas optan al canon y no cargan las capas viejas', () => {
  for (const page of migrated) {
    const html = read(`dashboards/${page}.html`);
    const styles = links(html);
    assert.match(html, /<body class="[^"]*\brh-unified\b/, page);
    assert.ok(styles.includes('../css/dashboard-rh-unified.css'), page);
    assert.ok(!styles.some(link => /(?:dashboard-skin|floating-filter-layout|rh-dashboard-refresh)\.css$/.test(link)), page);
    assert.equal(styles.filter(link => link === '../css/dashboard-rh-unified.css').length, 1, page);
    assert.equal(styles.at(0), '../css/global.css', page);
    assert.equal([...html.matchAll(/<style\b/g)].length, 1, `${page}: sólo el estilo del candado permanece inline`);
  }
});

test('Inventarios y Dashboard 9 comparten la misma hoja propia, sin el tema púrpura huérfano', () => {
  for (const page of ['inventarios', 'dashboard-9']) {
    assert.ok(links(read(`dashboards/${page}.html`)).includes('../css/inventarios-visual.css'));
  }
  assert.ok(!fs.existsSync(path.join(root, 'css/inventarios.css')));
  const own = read('css/inventarios-visual.css');
  assert.doesNotMatch(own, /!important|linear-gradient\(128deg|#65529a/i);
});

test('los parches anti-skin por ID y alturas forzadas se retiraron de TREO y D9', () => {
  const d7 = read('css/dashboard-7.css');
  const d9 = read('css/dashboard-9.css');
  assert.doesNotMatch(d7, /!important|min-height:\s*620px|dashboard-skin/i);
  assert.doesNotMatch(d9, /!important|:has\(#|dashboard-skin/i);
  assert.match(d7, /\.d7-overlay\.open/);
  assert.match(d9, /\.fs-modal-overlay\.open/);
});

test('Mi Tienda y Mi Dashboard comparten ficha blanca y conservan sus contratos de interacción', () => {
  const css = read('css/mi-ficha.css');
  assert.doesNotMatch(css, /dashboard-skin\.css|linear-gradient\(126deg/);
  assert.match(css, /\.ficha__head\{background:#fff/);
  for (const page of ['mi-tienda', 'mi-dashboard']) {
    const html = read(`dashboards/${page}.html`);
    for (const id of ['mi-content', 'mi-empty', 'corte-badge']) {
      assert.match(html, new RegExp(`id="${id}"`), `${page}: ${id}`);
    }
  }
});
