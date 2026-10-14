const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

// Cada tarjeta de la portada muestra "Actualización: <fecha>", que sale de
// cruzar su ruta contra rutasConfiguracion. Si una ruta no esta en ese mapa, la
// tarjeta se queda en "Sin fecha registrada" para siempre, aunque la pestaña
// Configuracion si traiga la fila. Asi se quedaron m12, promos e inventories.
const raiz = path.resolve(__dirname, '..');
const pagina = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8');
// El markup de la portada vive en index.html; el mapa de rutas y las tarjetas de
// Comercial/Administrativo, en js/home.js.
const script = fs.readFileSync(path.join(raiz, 'js', 'home.js'), 'utf8');
const estilos = fs.readFileSync(path.join(raiz, 'css', 'home.css'), 'utf8');
const html = pagina + '\n' + script;

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

assert.equal(rutasTarjetas.size, 15, `La portada debe tener 15 tarjetas, se encontraron ${rutasTarjetas.size}`);
const estaticas = [...pagina.matchAll(/class="card__title" href="([^"]+\.html)"/g)].length;
assert.equal(estaticas, 11, 'Recursos Humanos debe conservar 11 tarjetas');
// El hero ya no lleva el resumen de conteos por area: la navegacion y las 15
// tarjetas son la unica fuente de cobertura.
assert.doesNotMatch(pagina, /class="stats?"|class="stat__[nl]"/, 'la portada no debe traer las tarjetas de resumen del hero');
assert.doesNotMatch(estilos, /^\.stats?\{|\.stat__[nl]\{/m, 'el CSS del hero no debe conservar reglas de .stats/.stat');
// El hero tampoco lleva el parrafo secundario: el badge y el titulo son toda la copia.
assert.doesNotMatch(pagina, /hero__lede/, 'la portada no debe traer el parrafo hero__lede');
assert.doesNotMatch(pagina, /indicadores clave|actualizados directamente desde Google Sheets/i, 'el texto del parrafo secundario debe estar fuera de la portada');
assert.doesNotMatch(estilos, /\.hero__lede/, 'el CSS no debe conservar reglas de .hero__lede');
assert.match(pagina, /<p class="hero__badge">Monitoreo en tiempo real<\/p>/, 'el badge debe seguir en el hero');
assert.match(pagina, /<h1 class="hero__title">Torre de <em>Control<\/em><\/h1>/, 'el titulo debe seguir en el hero');
for (const area of ['rh', 'comercial', 'administrativo']) {
  assert.match(pagina, new RegExp(`class="area-switch__button[^"]*" type="button" data-area="${area}"`),
    `debe seguir el boton de navegacion de ${area}`);
}

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

// La portada no inventa indicadores: sin valores, deltas ni sparklines fijos;
// solo el estado de cada fuente (fecha / sin fecha) que sale de Configuracion.
assert.doesNotMatch(pagina, /class="(?:metric|delta|spark)|metric__value|tone-(?:good|bad|flat)/, 'la portada no debe traer metricas ni tendencias fijas');
const marcado = pagina.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<svg[\s\S]*?<\/svg>/g, '');
assert.doesNotMatch(marcado, /\b\d+(?:[.,]\d+)?\s*(?:%|pt\b|vacantes|bajas|tiendas|d[ií]as)/i, 'no debe haber cifras de KPI fijas en la portada');
assert.equal((marcado.match(/class="card__state"/g) || []).length, 11, 'cada tarjeta estatica declara su estado de fuente');
assert.match(marcado, /id="home-summary"[^>]*aria-live="polite"/, 'debe existir un resumen aria-live');
assert.doesNotMatch(marcado, /id="home-statusbar"|class="statusbar(?:\s|__|\")/, 'la portada no debe mostrar la barra de resumen de fuentes');
assert.match(marcado, /class="topbar__actions"[\s\S]*?id="home-retry"[\s\S]*?<\/div>/, 'el reintento debe seguir disponible en el encabezado');
for (const area of ['rh', 'comercial', 'administrativo']) {
  const regla = estilos.match(new RegExp(`\\.area-switch__button\\[data-area="${area}"\\]\\{([^}]*)\\}`));
  assert.ok(regla, `${area} debe definir su color activo`);
  for (const extremo of ['start', 'end']) {
    const color = regla[1].match(new RegExp(`--area-${extremo}:(#[0-9a-f]{6})`, 'i'))?.[1];
    assert.ok(color, `${area} debe definir su color ${extremo}`);
    const canales = [1, 3, 5].map(indice => parseInt(color.slice(indice, indice + 2), 16) / 255);
    const lineales = canales.map(valor => valor <= .04045 ? valor / 12.92 : ((valor + .055) / 1.055) ** 2.4);
    const luminancia = .2126 * lineales[0] + .7152 * lineales[1] + .0722 * lineales[2];
    assert.ok(1.05 / (luminancia + .05) >= 4.5, `${area} ${extremo} debe contrastar con el texto blanco`);
  }
}
assert.match(estilos, /\.area-switch__button\.is-active\{[^}]*var\(--area-start\)[^}]*var\(--area-end\)/, 'el botón activo debe usar el color de su apartado');
assert.match(script, /Datos disponibles/);
assert.match(script, /Sin fecha registrada/);

console.log(`portada-fechas-cobertura.test.js: ${rutasTarjetas.size} tarjetas, todas con fecha resoluble OK`);
