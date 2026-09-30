// Regresion del layout movil del selector de plaza/estado que inyecta core.js
// (visto roto en Mi Tienda): a <=640 el switch se apilaba en columna y heredaba
// 'flex:1 1 220px' de global.css, que sobre el eje vertical fijaba 220px de ALTO
// -> rectangulo gris vacio, con las plazas recortadas por overflow-x.
//
// Arreglo en dos capas:
//  1) RAIZ compartida: global.css acota 'flex:1 1 220px' a tablet (641-979), asi
//     nunca cae en la columna de <=640 (elimina el rectangulo gris en todos los
//     tableros).
//  2) VISTA Mi Tienda: mi-ficha.css, acotado a body.mi-tienda-page, pone las
//     plazas en rejilla de 2 columnas y el estado en 3, sin recorte. No se toca
//     el layout inyectado de los demas tableros.
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.resolve(__dirname, '..');
const leer = rel => fs.readFileSync(path.join(raiz, rel), 'utf8');

// Recorta el cuerpo de la primera @media (desde `desde`) cuya cabecera casa con `re`.
const bloqueMedia = (css, re, desde = 0) => {
  const trozo = css.slice(desde);
  const m = trozo.match(re);
  if (!m) return '';
  const abre = trozo.indexOf('{', m.index);
  let prof = 0;
  for (let i = abre; i < trozo.length; i++) {
    if (trozo[i] === '{') prof++;
    else if (trozo[i] === '}' && --prof === 0) return trozo.slice(abre + 1, i);
  }
  return '';
};

test('RAIZ global.css: flex:1 1 220px del switch queda acotado a tablet (min-width:641px)', () => {
  const css = leer('css/global.css');
  // La base de 220px solo debe vivir en la franja de tablet, donde el switch es
  // fila; a <=640 es columna y esa base pasaria a ser alto (rectangulo gris).
  const tablet = bloqueMedia(css, /@media\s*\(min-width:\s*641px\)\s*and\s*\(max-width:\s*979px\)/);
  assert.match(tablet, /\.oxxo-scope-selector--inline\s+\.oxxo-scope-switch\s*\{[^}]*flex:\s*1\s+1\s+220px/);
  // Ya no debe existir la @media (max-width:979px) SIN piso que la filtraba a celular.
  assert.doesNotMatch(css, /@media\s*\(max-width:\s*979px\)\s*\{[^}]*flex:\s*1\s+1\s+220px/);
});

test('Mi Tienda mi-ficha.css: plazas en rejilla 2 col y estado en 3, acotado por body', () => {
  const css = leer('css/mi-ficha.css');
  // El bloque movil del selector es la ultima @media (max-width:640px) del archivo.
  const movil = bloqueMedia(css, /@media\s*\(max-width:\s*640px\)/, css.lastIndexOf('@media (max-width:640px)'));
  assert.ok(movil, 'falta el bloque movil <=640 del selector en mi-ficha.css');
  // Todo el selector se acota por body.mi-tienda-page (no afecta otros tableros).
  const reglas = movil.match(/[^{}]+\{[^}]*\}/g) || [];
  const delSelector = reglas.filter(r => /oxxo-scope-switch|oxxo-store-status/.test(r));
  assert.ok(delSelector.length >= 3, 'deben existir reglas del selector en el bloque');
  delSelector.forEach(r => assert.match(r, /body\.mi-tienda-page/, `regla sin acotar a Mi Tienda: ${r.trim()}`));
  // Plazas: rejilla de 2 columnas, sin recorte, con el ultimo impar a fila entera.
  assert.match(movil, /body\.mi-tienda-page\s+\.oxxo-scope-switch\s*\{[^}]*display:grid[^}]*grid-template-columns:1fr 1fr/);
  assert.match(movil, /body\.mi-tienda-page\s+\.oxxo-scope-switch\s*\{[^}]*overflow:visible/);
  assert.match(movil, /\.oxxo-scope-switch__opt:last-child:nth-child\(odd\)\{grid-column:1\/-1\}/);
  // Estado: 3 columnas + etiqueta a ancho completo, sin scroll que recorte.
  assert.match(movil, /body\.mi-tienda-page\s+\.oxxo-store-status\s*\{[^}]*display:grid[^}]*grid-template-columns:repeat\(3,1fr\)/);
  assert.match(movil, /body\.mi-tienda-page\s+\.oxxo-store-status__label\{grid-column:1\/-1\}/);
});

test('core.js: el layout inyectado de los demas tableros no cambia (sin grid global)', () => {
  const core = leer('js/core.js');
  const movil = bloqueMedia(core, /@media\(max-width:640px\)/, core.indexOf('oxxo-scope-selector-style'));
  assert.ok(movil, 'falta el bloque movil <=640 inyectado');
  // El switch inyectado sigue siendo el layout compartido (fila con scroll), no
  // se globaliza la rejilla: eso vive solo en Mi Tienda (mi-ficha.css).
  assert.doesNotMatch(movil, /\.oxxo-scope-switch\s*\{[^}]*display:grid/);
});
