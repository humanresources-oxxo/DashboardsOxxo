// Contratos de entrega estatica: ninguna pagina importa dos veces el mismo
// stylesheet/script, toda referencia local existe en disco y no quedan assets
// huerfanos (la portada llego a bajar 1.15 MB de mascotas solo para el favicon
// y el repo guardaba un hero y un CSV de asesores que nadie consumia).
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.resolve(__dirname, '..');
function walk(dir, ext, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['.git', 'node_modules', '.claude'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, ext, acc);
    else if (ext.some(x => e.name.endsWith(x))) acc.push(p);
  }
  return acc;
}
const rel = p => path.relative(raiz, p).replace(/\\/g, '/');
const htmls = walk(raiz, ['.html']);
const esLocal = url => url && !/^(?:[a-z][a-z0-9+.-]*:|\/\/|#|data:)/i.test(url);
const sinQuery = url => url.split(/[?#]/)[0];

test('ninguna pagina repite un stylesheet o script', () => {
  const repetidos = [];
  for (const archivo of htmls) {
    const texto = fs.readFileSync(archivo, 'utf8');
    const vistos = new Map();
    // rel="icon" y rel="apple-touch-icon" comparten href a proposito: solo se
    // vigilan stylesheets y scripts.
    const refs = [
      ...[...texto.matchAll(/<link\b[^>]*\brel="stylesheet"[^>]*>/gi)].map(m => m[0].match(/\bhref="([^"]+)"/i)?.[1]),
      ...[...texto.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/gi)].map(m => m[1])
    ].filter(Boolean);
    for (const url of refs) {
      const clave = sinQuery(url);
      vistos.set(clave, (vistos.get(clave) || 0) + 1);
    }
    for (const [clave, veces] of vistos) if (veces > 1) repetidos.push(`${rel(archivo)} -> ${clave} x${veces}`);
  }
  assert.deepEqual(repetidos, []);
});

test('toda referencia local de html y css apunta a un archivo existente', () => {
  const rotos = [];
  for (const archivo of htmls) {
    const texto = fs.readFileSync(archivo, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
    for (const m of texto.matchAll(/\b(?:src|href)="([^"]+)"/gi)) {
      const url = m[1];
      if (!esLocal(url)) continue;
      const destino = sinQuery(url);
      if (!destino) continue;
      if (!fs.existsSync(path.resolve(path.dirname(archivo), decodeURIComponent(destino)))) rotos.push(`${rel(archivo)} -> ${url}`);
    }
  }
  for (const archivo of walk(path.join(raiz, 'css'), ['.css'])) {
    const texto = fs.readFileSync(archivo, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of texto.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) {
      if (!esLocal(m[1])) continue;
      if (!fs.existsSync(path.resolve(path.dirname(archivo), sinQuery(m[1])))) rotos.push(`${rel(archivo)} -> ${m[1]}`);
    }
  }
  assert.deepEqual(rotos, []);
});

test('assets retirados siguen ausentes y ningun archivo de assets/ queda huerfano', () => {
  for (const eliminado of ['assets/orgulloxxos-hero.jpg', 'catalogo_asesores_2026-09-14.csv', 'assets/favicon-mascotas.png', 'assets/banner-septiembre-mexico.png']) {
    assert.equal(fs.existsSync(path.join(raiz, eliminado)), false, `${eliminado} ya no debe existir`);
  }
  const consumidores = walk(raiz, ['.html', '.js', '.css', '.gs', '.mjs'])
    .filter(p => !rel(p).startsWith('assets/vendor/') && !rel(p).startsWith('tests/'))
    .map(p => fs.readFileSync(p, 'utf8')).join('\n');
  const huerfanos = fs.readdirSync(path.join(raiz, 'assets'), { withFileTypes: true })
    .filter(e => e.isFile())
    .map(e => e.name)
    .filter(nombre => !consumidores.includes(nombre));
  assert.deepEqual(huerfanos, []);
});

test('la portada baja iconos y banner optimizados', () => {
  const peso = f => fs.statSync(path.join(raiz, f)).size;
  assert.ok(peso('assets/banner-septiembre-mexico.webp') <= 350 * 1024, 'banner WebP <= 350 KB');
  assert.ok(peso('assets/favicon-mascotas-192.png') <= 60 * 1024);
  assert.ok(peso('assets/favicon-mascotas-512.png') <= 150 * 1024);
  const index = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8');
  assert.doesNotMatch(index, /favicon-mascotas\.png/);
  assert.match(index, /rel="apple-touch-icon"[^>]*favicon-mascotas-192\.png/);
});
