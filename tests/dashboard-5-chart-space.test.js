const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'dashboards/dashboard-5.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css/dashboard-5.css'), 'utf8');
const js = fs.readFileSync(path.join(root, 'js/dashboard-5-vacaciones.js'), 'utf8');

test('D5: el gráfico de asesores aprovecha la altura de acciones solo en escritorio', () => {
  assert.match(html, /class="vac-chart vac-chart--advisors"><canvas id="chart-asesores"/);
  assert.match(css, /\.vac-grid-main > \.panel:first-child\s*\{\s*display:\s*flex;\s*flex-direction:\s*column;/);
  assert.match(css, /@media \(min-width:\s*1101px\)\s*\{\s*body\.dashboard-5-page \.vac-chart--advisors\s*\{[^}]*flex:\s*1 1 auto;[^}]*height:\s*auto;/);
  const mobileRules = css.split('@media (max-width: 720px)')[1];
  assert.ok(mobileRules, 'D5 conserva reglas móviles específicas');
  assert.match(mobileRules, /\.vac-chart\s*\{\s*height:\s*260px;/);
  assert.match(js, /function renderStackedHorizontal\([\s\S]*?maintainAspectRatio:\s*false/);
});
