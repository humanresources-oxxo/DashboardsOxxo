#!/usr/bin/env node
/* ==========================================================
   VERSIONA LOS ASSETS PARA ROMPER LA CACHE DEL NAVEGADOR

   El sitio es estatico en GitHub Pages: los <script> y <link>
   apuntan a js/*.js y css/*.css con un "?v=..." pegado a mano.
   Ese sufijo es lo unico que le dice al navegador que el archivo
   cambio -- si nadie lo actualiza, el navegador sigue sirviendo
   la copia vieja y el cambio publicado no se ve hasta que alguien
   hace Ctrl+Shift+R.

   Se venia bumpeando a mano y se noto: habia 20 sufijos distintos
   conviviendo (fechas, nombres, "2", "4", "8") y css/dashboard-skin.css
   iba SIN sufijo en 15 paginas, o sea sin proteccion ninguna.

   Este script pone el mismo sufijo -- el commit que se publica -- en
   TODA referencia local a un .js o .css. Corre solo en cada push a
   main (.github/workflows/versionar-assets.yml); tambien se puede
   correr a mano:

     node scripts/version-assets.mjs            # usa el commit actual
     node scripts/version-assets.mjs 20260910a  # o una etiqueta propia
     node scripts/version-assets.mjs --check    # solo revisa, no escribe

   Las URLs externas (CDN, Google Fonts) no se tocan.
   ========================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const soloRevisar = process.argv.includes('--check');
const etiqueta = process.argv.slice(2).find(a => !a.startsWith('--'));

function versionDelCommit() {
  try { return execSync('git rev-parse --short=8 HEAD', { cwd: raiz }).toString().trim(); }
  catch { return String(Date.now()); }
}
const version = etiqueta || versionDelCommit();

function htmlsDe(dir, acc = []) {
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entrada.name === '.git' || entrada.name === 'node_modules') continue;
    const completa = path.join(dir, entrada.name);
    if (entrada.isDirectory()) htmlsDe(completa, acc);
    else if (entrada.name.endsWith('.html')) acc.push(completa);
  }
  return acc;
}

// src="..." o href="..." que apunte a un .js/.css LOCAL. Se excluyen las
// absolutas (http://, https://, //cdn...) porque versionarlas rompe la URL.
const REFERENCIA = /(\b(?:src|href)=")(?!https?:|\/\/)([^"?]+\.(?:js|css))(\?[^"]*)?(")/g;

let archivosTocados = 0, referencias = 0;
const pendientes = [];
for (const archivo of htmlsDe(raiz)) {
  const original = fs.readFileSync(archivo, 'utf8');
  let cambios = 0;
  const nuevo = original.replace(REFERENCIA, (_, abre, ruta, query, cierra) => {
    referencias++;
    const deseado = `${abre}${ruta}?v=${version}${cierra}`;
    if (`${abre}${ruta}${query || ''}${cierra}` !== deseado) cambios++;
    return deseado;
  });
  if (cambios) {
    archivosTocados++;
    pendientes.push(`${path.relative(raiz, archivo)} (${cambios})`);
    if (!soloRevisar) fs.writeFileSync(archivo, nuevo);
  }
}

console.log(`version: ${version}`);
console.log(`referencias locales js/css revisadas: ${referencias}`);
if (soloRevisar) {
  if (!archivosTocados) { console.log('todas al dia'); process.exit(0); }
  console.log(`sin versionar o con version vieja en ${archivosTocados} archivos:`);
  pendientes.forEach(p => console.log('  ' + p));
  process.exit(1);
}
console.log(archivosTocados ? `actualizados ${archivosTocados} archivos` : 'nada que cambiar');
