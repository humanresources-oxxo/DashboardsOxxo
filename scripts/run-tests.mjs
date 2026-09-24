#!/usr/bin/env node
// Corre las pruebas offline (tests/*.test.js) igual en Windows, macOS y Linux:
// el shell de Windows no expande el glob de `node --test tests/*.test.js`.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const archivos = fs.readdirSync(path.join(raiz, 'tests'))
  .filter(nombre => nombre.endsWith('.test.js'))
  .sort()
  .map(nombre => path.join('tests', nombre));

if (!archivos.length) { console.error('no hay pruebas en tests/*.test.js'); process.exit(1); }
const { status } = spawnSync(process.execPath, ['--test', ...archivos], { cwd: raiz, stdio: 'inherit' });
process.exit(status ?? 1);
