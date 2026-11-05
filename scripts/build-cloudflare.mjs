#!/usr/bin/env node
/* Arma dist/ con SOLO los archivos del sitio para Cloudflare (wrangler.jsonc
   "assets.directory": "dist"). Es una lista de lo que SI se publica: pruebas,
   scripts, docs y el Apps Script nunca salen. GitHub Pages sigue sirviendo la
   raiz del repositorio tal cual. Uso: node scripts/build-cloudflare.mjs */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const destino = path.join(raiz, 'dist');
const SITIO = ['index.html', 'admin.html', 'robots.txt', 'assets', 'css', 'js', 'dashboards'];

fs.rmSync(destino, { recursive: true, force: true });
fs.mkdirSync(destino);
for (const entrada of SITIO) {
  const origen = path.join(raiz, entrada);
  if (!fs.existsSync(origen)) throw new Error(`falta ${entrada}`);
  fs.cpSync(origen, path.join(destino, entrada), { recursive: true });
}
// Las instantaneas de datos y respaldos (ignoradas en git) nunca se publican.
for (const privada of ['assets/data', 'assets/backups']) fs.rmSync(path.join(destino, privada), { recursive: true, force: true });
const contar = (d) => fs.readdirSync(d, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? contar(path.join(d, e.name)) : 1), 0);
console.log(`dist/ listo: ${contar(destino)} archivos`);
