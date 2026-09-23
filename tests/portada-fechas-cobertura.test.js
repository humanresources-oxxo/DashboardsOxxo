const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

// Cada tarjeta de la portada muestra "Actualización: <fecha>", que sale de
// cruzar su ruta contra rutasConfiguracion. Si una ruta no esta en ese mapa, la
// tarjeta se queda en "Sin fecha registrada" para siempre, aunque la pestaña
// Configuracion si traiga la fila. Asi se quedaron m12, promos e inventories.
const raiz = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8');

// 1) Rutas declaradas en el mapa.
const bloque = html.match(/const rutasConfiguracion = \{([\s\S]*?)\};/);
assert.ok(bloque, 'Debe existir rutasConfiguracion en index.html');
const cuerpoMapa = bloque[1].replace(/\/\/[^\n]*/g, '');  // sin comentarios
const rutasMapeadas = new Set([...cuerpoMapa.matchAll(/'([^']+\.html)'/g)].map(m => m[1]));
const claves = [...cuerpoMapa.matchAll(/([A-Za-z0-9_]+)\s*:/g)].map(m => m[1]);

// 2) Rutas de las tarjetas estaticas.
const rutasTarjetas = new Set(
  [...html.matchAll(/class="card__title" href="([^"]+\.html)"/g)].map(m => m[1])
);

// 3) Rutas de las tarjetas que se arman dinamicamente por area.
for (const m of html.matchAll(/\[\s*'[^']*'\s*,\s*'[^']*'\s*,\s*'(dashboards\/[^']+\.html)'\s*,\s*'[^']*'\s*\]/g)) {
  rutasTarjetas.add(m[1]);
}

assert.ok(rutasTarjetas.size >= 12, `Se esperaban al menos 12 tarjetas, se encontraron ${rutasTarjetas.size}`);

// Toda tarjeta debe poder resolver su fecha.
const sinClave = [...rutasTarjetas].filter(r => !rutasMapeadas.has(r)).sort();
assert.deepEqual(sinClave, [],
  `Estas tarjetas no tienen clave en rutasConfiguracion y mostrarian "Sin fecha registrada": ${sinClave.join(', ')}`);

// Y toda ruta del mapa debe apuntar a una pagina que exista.
const inexistentes = [...rutasMapeadas].filter(r => !fs.existsSync(path.join(raiz, r))).sort();
assert.deepEqual(inexistentes, [],
  `rutasConfiguracion apunta a paginas que no existen: ${inexistentes.join(', ')}`);

// Las claves deben ser ids reales de SHEETS_CONFIG.TABS.
const config = fs.readFileSync(path.join(raiz, 'js', 'config.js'), 'utf8');
const tabs = config.match(/TABS:\s*\{([\s\S]*?)\}/);
assert.ok(tabs, 'Debe existir TABS en js/config.js');
const idsValidos = new Set([...tabs[1].matchAll(/([A-Za-z0-9_]+)\s*:/g)].map(m => m[1]));
const desconocidas = claves.filter(k => !idsValidos.has(k)).sort();
assert.deepEqual(desconocidas, [],
  `rutasConfiguracion usa claves que no son pestañas declaradas: ${desconocidas.join(', ')}`);

console.log(`portada-fechas-cobertura.test.js: ${rutasTarjetas.size} tarjetas, todas con fecha resoluble OK`);
