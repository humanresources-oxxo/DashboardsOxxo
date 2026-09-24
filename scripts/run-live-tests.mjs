#!/usr/bin/env node
// Diagnosticos contra la produccion real (Sheets + Apps Script): son
// informativos y dependen de datos y red mutables, nunca son compuerta de CI.
// Cada tests/live-*.mjs corre por separado con tope de 120 s para que uno
// lento no cuelgue el resto, y al final se imprime una tabla pass/fail/timeout.
//
//   npm run test:live                        # todas
//   node scripts/run-live-tests.mjs plazas   # solo las que contengan "plazas"
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOPE_MS = 120_000;
const filtro = process.argv[2];
const pruebas = fs.readdirSync(path.join(raiz, 'tests'))
  .filter(nombre => /^live-.*\.mjs$/.test(nombre) && (!filtro || nombre.includes(filtro)))
  .sort();

function correr(nombre) {
  return new Promise(resolve => {
    const inicio = Date.now();
    const hijo = spawn(process.execPath, [path.join('tests', nombre)], { cwd: raiz, stdio: 'inherit' });
    let vencio = false;
    const reloj = setTimeout(() => { vencio = true; hijo.kill('SIGKILL'); }, TOPE_MS);
    const cerrar = estado => {
      clearTimeout(reloj);
      resolve({ prueba: nombre, estado, segundos: +((Date.now() - inicio) / 1000).toFixed(1) });
    };
    hijo.on('error', () => cerrar('FAIL'));
    hijo.on('close', codigo => cerrar(vencio ? 'TIMEOUT' : codigo === 0 ? 'PASS' : 'FAIL'));
  });
}

const resultados = [];
for (const nombre of pruebas) {
  console.log(`\n=== ${nombre} ===`);
  resultados.push(await correr(nombre));
}
console.log('\n=== resumen (diagnostico en vivo) ===');
console.table(resultados);
const fallidas = resultados.filter(r => r.estado === 'FAIL');
const vencidas = resultados.filter(r => r.estado === 'TIMEOUT');
console.log(`pass: ${resultados.length - fallidas.length - vencidas.length}, fail: ${fallidas.length}, timeout: ${vencidas.length}`);
// Un timeout es red/produccion lenta, no una asercion funcional rota.
process.exit(fallidas.length ? 1 : 0);
