// Regresion del layout movil del selector de plaza/estado que inyecta core.js
// (visto roto en Mi Tienda). Dos defectos distintos a <=640:
//  - Rectangulo gris vacio: el switch se apilaba en columna y heredaba
//    'flex:1 1 220px' de global.css, que sobre el eje vertical fijaba 220px de
//    ALTO. NO lo causaba el scroll.
//  - Plazas recortadas: la fila con scroll horizontal (overflow-x) cortaba las
//    chips que no cabian.
//
// Arreglo en dos capas, ambas COMPARTIDAS por los 18 tableros con selector:
//  1) RAIZ: global.css acota 'flex:1 1 220px' a tablet (641-979), asi nunca cae
//     en la columna de <=640 (elimina el rectangulo gris en todos los tableros).
//  2) LAYOUT MOVIL: core.js inyecta, a <=640, las plazas en rejilla de 2 columnas
//     (5a plaza a fila entera) y el estado en 3 con la etiqueta a ancho completo,
//     sin scroll horizontal ni recorte. Es el mismo estilo antes exclusivo de Mi
//     Tienda, ahora unico y sin duplicar: mi-ficha.css ya no lleva su copia.
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
  // La base de 220px solo debe vivir en tablet: en movil, el selector padre
  // se apila en columna y esa base pasaria a fijar el alto del switch.
  const tablet = bloqueMedia(css, /@media\s*\(min-width:\s*641px\)\s*and\s*\(max-width:\s*979px\)/);
  assert.match(tablet, /\.oxxo-scope-selector--inline\s+\.oxxo-scope-switch\s*\{[^}]*flex:\s*1\s+1\s+220px/);
  // Ya no debe existir la @media (max-width:979px) SIN piso que la filtraba a celular.
  assert.doesNotMatch(css, /@media\s*\(max-width:\s*979px\)\s*\{[^}]*flex:\s*1\s+1\s+220px/);
});

test('COMPARTIDO core.js: a <=640 el selector inyectado usa rejilla 2 col + estado 3 col', () => {
  const core = leer('js/core.js');
  const movil = bloqueMedia(core, /@media\(max-width:640px\)/, core.indexOf('oxxo-scope-selector-style'));
  assert.ok(movil, 'falta el bloque movil <=640 inyectado');
  // Plazas: rejilla de 2 columnas, sin recorte, con la 5a plaza a fila entera.
  assert.match(movil, /\.oxxo-scope-switch\s*\{[^}]*display:grid[^}]*grid-template-columns:1fr 1fr/);
  assert.match(movil, /\.oxxo-scope-switch\s*\{[^}]*overflow:visible/);
  assert.match(movil, /\.oxxo-scope-switch__opt:last-child:nth-child\(odd\)\{grid-column:1\/-1\}/);
  // Estado: 3 columnas + etiqueta a ancho completo, sin scroll que recorte.
  assert.match(movil, /\.oxxo-store-status\s*\{[^}]*display:grid[^}]*grid-template-columns:repeat\(3,1fr\)/);
  assert.match(movil, /\.oxxo-store-status\s*\{[^}]*overflow:visible/);
  assert.match(movil, /\.oxxo-store-status__label\{grid-column:1\/-1\}/);
});

test('SIN DUPLICAR mi-ficha.css: ya no lleva su copia del layout del selector', () => {
  const css = leer('css/mi-ficha.css');
  // El layout movil del selector es compartido (core.js); Mi Tienda no debe
  // redefinirlo por body.mi-tienda-page (evita la regla duplicada).
  assert.doesNotMatch(css, /body\.mi-tienda-page\s+\.oxxo-scope-switch/);
  assert.doesNotMatch(css, /body\.mi-tienda-page\s+\.oxxo-store-status/);
});

test('Dashboard 1: su estilo movil deja ganar la rejilla compartida sin duplicar columnas', () => {
  const css = leer('css/dashboard-1.css');
  const movil = bloqueMedia(css, /@media\s*\(max-width:\s*640px\)/, css.lastIndexOf('@media (max-width: 640px)'));
  assert.ok(movil, 'falta el ajuste movil de Dashboard 1');
  assert.match(movil, /\.oxxo-scope-switch\s*\{[^}]*display:\s*grid[^}]*overflow:\s*visible/);
  assert.match(movil, /\.oxxo-store-status\s*\{[^}]*display:\s*grid[^}]*overflow:\s*visible/);
  assert.doesNotMatch(movil, /grid-template-columns/, 'las columnas deben mantenerse en core.js');
});
