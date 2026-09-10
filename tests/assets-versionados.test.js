// El sitio es estatico: el sufijo "?v=" de cada <script>/<link> es lo unico
// que le avisa al navegador que un archivo cambio. Se bumpeaba a mano y se
// desincronizo -- 20 sufijos distintos conviviendo, y css/dashboard-skin.css
// sin ninguno en 15 paginas, o sea publicandose sin proteccion de cache.
//
// Ahora lo pone scripts/version-assets.mjs en cada push. Esta prueba vigila
// dos cosas: que NINGUNA referencia local se quede sin version, y que todas
// compartan la misma (una sola version por publicacion, no una por archivo).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.resolve(__dirname, '..');
function htmls(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '.git' || e.name === 'node_modules') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) htmls(p, acc);
    else if (e.name.endsWith('.html')) acc.push(p);
  }
  return acc;
}

const REFERENCIA = /\b(?:src|href)="(?!https?:|\/\/)([^"?]+\.(?:js|css))(\?[^"]*)?"/g;
const sinVersion = [];
const versiones = new Map();
let total = 0;

for (const archivo of htmls(raiz)) {
  const texto = fs.readFileSync(archivo, 'utf8');
  for (const m of texto.matchAll(REFERENCIA)) {
    total++;
    const rel = path.relative(raiz, archivo);
    const version = (m[2] || '').match(/[?&]v=([^&]*)/)?.[1];
    if (!version) { sinVersion.push(`${rel} -> ${m[1]}`); continue; }
    if (!versiones.has(version)) versiones.set(version, []);
    versiones.get(version).push(`${rel} -> ${m[1]}`);
  }
}

assert.ok(total > 100, `se esperaban muchas referencias locales, se encontraron ${total}`);
assert.deepEqual(sinVersion, [], `hay assets locales sin "?v=":\n  ${sinVersion.join('\n  ')}`);
assert.equal(
  versiones.size, 1,
  `todas las referencias deben compartir una sola version; hay ${versiones.size}:\n  ` +
  [...versiones.entries()].map(([v, usos]) => `${v} (${usos.length} usos, ej. ${usos[0]})`).join('\n  ')
);

console.log(`assets versionados: ${total} referencias, version unica "${[...versiones.keys()][0]}"`);
