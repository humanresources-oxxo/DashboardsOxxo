// El ranking Top/Bottom 10 de Mi Tienda debe usar EXACTAMENTE los mismos
// umbrales que los semaforos de la ficha. Si se separan, una tienda podria
// salir "en verde" en el ranking y en rojo al abrirla, que es el modo de fallo
// que hace que nadie vuelva a confiar en el tablero.
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const raiz = path.resolve(__dirname, '..');
const fuente = fs.readFileSync(path.join(raiz, 'js', 'mi-tienda.js'), 'utf8');

// Las funciones de umbral son puras: se extraen y se evaluan aisladas.
const nombres = ['nivelBajas', 'nivelTiempoExtra', 'nivelAusentismos', 'nivelCapacidades', 'nivelInventarios'];
const contexto = {};
for (const nombre of nombres) {
  const m = fuente.match(new RegExp(`function ${nombre}\\([^)]*\\) \\{[\\s\\S]*?\\n  \\}`));
  assert.ok(m, `Debe existir ${nombre} como funcion pura`);
  vm.runInNewContext(m[0] + `;this.${nombre} = ${nombre};`, contexto);
}
const { nivelBajas, nivelTiempoExtra, nivelAusentismos, nivelCapacidades, nivelInventarios } = contexto;

test('umbrales de cada indicador', () => {
  assert.equal(nivelBajas(0), 'low');
  assert.equal(nivelBajas(1), 'medium');
  assert.equal(nivelBajas(2), 'medium');
  assert.equal(nivelBajas(3), 'high');

  assert.equal(nivelTiempoExtra(0), 'low');
  assert.equal(nivelTiempoExtra(9.9), 'low');
  assert.equal(nivelTiempoExtra(10), 'medium');
  assert.equal(nivelTiempoExtra(20), 'high');

  assert.equal(nivelAusentismos(0, 0), 'low');
  assert.equal(nivelAusentismos(0, 4), 'low');
  assert.equal(nivelAusentismos(0, 5), 'medium');
  assert.equal(nivelAusentismos(0, 10), 'high');
  // Una sola falta manda a rojo aunque los dias sean pocos.
  assert.equal(nivelAusentismos(1, 0), 'high');

  assert.equal(nivelCapacidades(0, null), 'low');
  assert.equal(nivelCapacidades(0, 10), 'low');
  assert.equal(nivelCapacidades(3, 80), 'medium');
  assert.equal(nivelCapacidades(3, 59), 'high');
  // Con pendientes pero sin modulo evaluado no se puede afirmar "critico".
  assert.equal(nivelCapacidades(3, null), 'medium');

  assert.equal(nivelInventarios(0), 'low');
  assert.equal(nivelInventarios(.005), 'low');
  assert.equal(nivelInventarios(.0051), 'medium');
  assert.equal(nivelInventarios(.0101), 'high');
});

test('la ficha usa las funciones compartidas, no umbrales propios', () => {
  // Cada seccion debe llamar a su funcion; ningun umbral suelto puede quedar.
  for (const nombre of nombres) {
    const llamadas = fuente.split(`${nombre}(`).length - 1;
    assert.ok(llamadas >= 2, `${nombre} debe definirse y usarse (encontradas ${llamadas} apariciones)`);
  }
  // Fuera del modulo de umbrales no debe quedar ningun literal suelto. Se
  // recorta el propio modulo antes de buscar, porque ahi si deben estar.
  const inicio = fuente.indexOf('function nivelBajas(');
  const fin = fuente.indexOf('const CLASE_NIVEL');
  assert.ok(inicio > 0 && fin > inicio, 'Debe existir el modulo de umbrales');
  const resto = fuente.slice(0, inicio) + fuente.slice(fin);

  const sueltos = [
    /rows\.length >= 3 \? 'high'/,
    /totHoras >= 20 \? 'high'/,
    /faltas > 0 \|\| totDias >= 10 \? 'high'/,
    /!pendientes \? 'low' : \(critica/,
    /ratio > \.0(1|05)/,
    /totDias >= 5/,
    /totHoras >= 10/,
  ];
  for (const patron of sueltos) {
    assert.doesNotMatch(resto, patron, `Umbral duplicado fuera del modulo compartido: ${patron}`);
  }
});

test('el ranking existe y declara su minimo de indicadores', () => {
  assert.match(fuente, /const RANKING_MIN_EVALUADOS = \d+/, 'Debe declarar el minimo de indicadores evaluados');
  assert.match(fuente, /function rankingTiendas\(/, 'Debe existir rankingTiendas');
  assert.match(fuente, /function evaluarTienda\(/, 'Debe existir evaluarTienda');
  // Una tienda sin dato en una fuente no debe contar como que cumple.
  assert.match(fuente, /if \(!allRows\.length\) return null;/, 'Sin filas debe devolver null, no un nivel');
  // Los cinco indicadores deben estar declarados.
  const bloque = fuente.match(/const INDICADORES = \[[\s\S]*?\n  \];/);
  assert.ok(bloque, 'Debe existir INDICADORES');
  for (const id of ["'d2'", "'d4'", "'d6'", "'d8'"]) {
    assert.ok(bloque[0].includes(id), `INDICADORES debe incluir ${id}`);
  }

  // Resultados de Inventario, Personal FLEX y Faltantes y Sobrantes quedan
  // fuera del ranking a proposito: son administrativos y comerciales, no de
  // gestion de personal. Sus semaforos siguen en la ficha, no aqui.
  const excluidos = [
    ['DATA.inventarios', 'Resultados de Inventario'],
    ['DATA.d10', 'Personal FLEX'],
    ['DATA.d9', 'Faltantes y Sobrantes'],
  ];
  for (const [fuenteDato, nombre] of excluidos) {
    assert.ok(!bloque[0].includes(fuenteDato),
      `${nombre} (${fuenteDato}) no debe entrar al ranking`);
  }
  assert.equal((bloque[0].match(/\bid: '/g) || []).length, 4,
    'El ranking debe evaluar exactamente 4 indicadores');
});

test('el orden del ranking es determinista', () => {
  const m = fuente.match(/function compararTiendas\(a, b\) \{[\s\S]*?\n  \}/);
  assert.ok(m, 'Debe existir compararTiendas');
  const ctx = {};
  vm.runInNewContext(m[0] + ';this.compararTiendas = compararTiendas;', ctx);
  const cmp = ctx.compararTiendas;

  const mejor = { pct: 1, rojos: 0, evaluados: 5, display: 'OXXO A' };
  const peor = { pct: .2, rojos: 3, evaluados: 5, display: 'OXXO B' };
  assert.ok(cmp(mejor, peor) < 0, 'Mas verde va primero');

  // A igual proporcion, menos rojos gana.
  const a = { pct: .5, rojos: 0, evaluados: 4, display: 'OXXO C' };
  const b = { pct: .5, rojos: 2, evaluados: 4, display: 'OXXO D' };
  assert.ok(cmp(a, b) < 0, 'A igual proporcion, menos rojos va primero');

  // A igual proporcion y rojos, mas indicadores evaluados gana.
  const c = { pct: .5, rojos: 1, evaluados: 5, display: 'OXXO E' };
  const d = { pct: .5, rojos: 1, evaluados: 3, display: 'OXXO F' };
  assert.ok(cmp(c, d) < 0, 'Mas indicadores evaluados va primero');

  // Empate total: orden alfabetico estable, nunca depende del orden de llegada.
  const e = { pct: .5, rojos: 1, evaluados: 4, display: 'OXXO Z' };
  const f = { pct: .5, rojos: 1, evaluados: 4, display: 'OXXO A' };
  assert.ok(cmp(e, f) > 0, 'Empate total se resuelve por nombre');
  assert.equal(cmp(f, f), 0, 'Comparar consigo misma da 0');
});

test('el boton existe en la pagina y arranca deshabilitado', () => {
  const html = fs.readFileSync(path.join(raiz, 'dashboards', 'mi-tienda.html'), 'utf8');
  assert.match(html, /id="mi-ranking-btn"[^>]*disabled/, 'El boton debe arrancar deshabilitado hasta que haya datos');
  assert.match(fuente, /getElementById\('mi-ranking-btn'\)\?\.addEventListener\('click', abrirRanking\)/);
  assert.match(fuente, /actualizarBotonRanking\(\);/, 'Debe habilitarse al terminar la carga');
});

// ── Activación de tiendas del ranking ──────────────────────────────────
// Cada tienda del Top/Bottom 10 debe poder activarse (mouse y teclado) para
// abrir su ficha completa, sin crear un modal ni un computo paralelo.

// filaRanking es la fila que usan AMBAS listas (top y bottom), asi que probar
// su salida cubre las dos columnas. Se ejecuta con el esc REAL de la ficha
// para que la prueba de seguridad valide el escape de verdad, no un stub.
function cargarFilaRanking() {
  const fichaFuente = fs.readFileSync(path.join(raiz, 'js', 'mi-ficha-ui.js'), 'utf8');
  const mEsc = fichaFuente.match(/const esc = \(s\) => String\(s == null[\s\S]*?&#39;'\);/);
  assert.ok(mEsc, 'Debe poder extraerse esc de mi-ficha-ui.js');
  const mFila = fuente.match(/function filaRanking\(t, posicion\) \{[\s\S]*?\n  \}/);
  assert.ok(mFila, 'Debe existir filaRanking');
  const ctx = {};
  vm.runInNewContext(
    `const NIVEL_TEXTO = { low: 'verde', medium: 'ambar', high: 'rojo' };\n` +
    mEsc[0] + '\n' + mFila[0] + '\nthis.filaRanking = filaRanking;',
    ctx,
  );
  return ctx.filaRanking;
}

test('cada tienda del ranking es un boton semantico (mouse y teclado)', () => {
  const filaRanking = cargarFilaRanking();
  const fila = { display: 'OXXO Las Flores', verdes: 3, evaluados: 4, detalle: [
    { etiqueta: 'Bajas', texto: '0 bajas en el mes', nivel: 'low', inicial: 'B' },
  ] };
  const html = filaRanking(fila, 1);
  // <button> nativo: Enter/Espacio lo activan sin listener de teclado extra.
  assert.match(html, /<button type="button" class="mt-rank-store" data-rank-tienda="OXXO Las Flores" title="OXXO Las Flores">OXXO Las Flores<\/button>/,
    'El nombre de la tienda debe ser un <button> con el nombre exacto y title completo');
});

test('el nombre de la tienda en el ranking va escapado (seguridad de HTML)', () => {
  const filaRanking = cargarFilaRanking();
  const malicioso = '<img src=x onerror=alert(1)>';
  const fila = { display: malicioso, verdes: 1, evaluados: 3, detalle: [
    { etiqueta: 'Bajas', texto: '1 baja', nivel: 'high', inicial: 'B' },
  ] };
  const html = filaRanking(fila, 1);
  assert.ok(!html.includes('<img src=x'), 'No debe inyectarse HTML crudo en la celda');
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'), 'El texto visible debe ir escapado');
  assert.ok(html.includes('data-rank-tienda="&lt;img src=x onerror=alert(1)&gt;"'),
    'El atributo data-rank-tienda debe ir escapado');
});

test('activar una tienda del ranking abre su ficha con el flujo del selector', () => {
  const m = fuente.match(/function activarTiendaDesdeRanking\([\s\S]*?\n  \}/);
  assert.ok(m, 'Debe existir activarTiendaDesdeRanking');
  const cuerpo = m[0];
  assert.match(cuerpo, /closeModal\(\)/, 'Debe cerrar el modal del ranking');
  assert.match(cuerpo, /tiendaSelectControl\?\.setValue\(display\)/, 'Debe seleccionar la tienda en el combobox existente');
  assert.match(cuerpo, /renderFor\(display\)/, 'Debe renderizar la ficha completa ya existente');
  assert.match(cuerpo, /scrollIntoView/, 'Debe desplazar la ficha a la vista');
  assert.match(cuerpo, /\.focus\(/, 'Debe enfocar la ficha');
  // No crea modal ni computo paralelo: reusa renderFor, nunca abre openModal.
  assert.ok(!/openModal\(/.test(cuerpo), 'No debe abrir un modal paralelo');
  // Solo activa tiendas que existen en el catalogo (no confia en el data-attr).
  assert.match(cuerpo, /TIENDAS\.has\(tKey\(display\)\)/, 'Debe validar la tienda contra el catalogo');
});

test('Top y Bottom seleccionan su propia tienda y una tienda desconocida no altera la ficha', () => {
  const m = fuente.match(/function activarTiendaDesdeRanking\([\s\S]*?\n  \}/);
  assert.ok(m, 'Debe existir activarTiendaDesdeRanking');
  const eventos = [];
  const titulo = {
    setAttribute: (...args) => eventos.push(['tabindex', ...args]),
    focus: (options) => eventos.push(['focus', options.preventScroll]),
  };
  const ficha = { scrollIntoView: (options) => eventos.push(['scroll', options.block]) };
  const ctx = {
    TIENDAS: new Map([['oxxo top', 'OXXO Top'], ['oxxo bottom', 'OXXO Bottom']]),
    tKey: (value) => String(value).toLowerCase(),
    closeModal: () => eventos.push(['close']),
    tiendaSelectControl: { setValue: (value) => eventos.push(['select', value]) },
    renderFor: (value) => eventos.push(['render', value]),
    document: { getElementById: (id) => id === 'mi-content' ? ficha : id === 'ficha-tienda-title' ? titulo : null },
  };
  vm.runInNewContext(m[0] + ';this.activar = activarTiendaDesdeRanking;', ctx);
  for (const tienda of ['OXXO Top', 'OXXO Bottom']) {
    eventos.length = 0;
    ctx.activar(tienda);
    assert.deepEqual(eventos.slice(0, 3), [['close'], ['select', tienda], ['render', tienda]]);
    assert.deepEqual(eventos.slice(3), [['scroll', 'start'], ['tabindex', 'tabindex', '-1'], ['focus', true]]);
  }
  eventos.length = 0;
  ctx.activar('OXXO Ajena');
  assert.deepEqual(eventos, [], 'Una tienda ajena no debe cambiar seleccion ni ficha');
});

test('un solo listener delegado, sin duplicarlo en cada reintento', () => {
  const apariciones = (fuente.match(/mt-rank-store/g) || []).length;
  assert.equal(apariciones, 2, 'mt-rank-store solo debe aparecer en el markup y en el selector del listener');
  const dom = fuente.match(/document\.addEventListener\('DOMContentLoaded'[\s\S]*?\n  \}\);/);
  assert.ok(dom && /mt-rank-store/.test(dom[0]) && /activarTiendaDesdeRanking/.test(dom[0]),
    'El listener delegado debe registrarse en DOMContentLoaded');
  const init = fuente.match(/async function init\(\)[\s\S]*?\n  \}/);
  assert.ok(init && !/mt-rank-store/.test(init[0]),
    'init() no debe registrar el listener (evitar duplicados en reintentos)');
  assert.ok(!/mi-ranking-btn'\)\?\.addEventListener/.test(init[0]),
    'init() tampoco debe duplicar el listener que abre el ranking');
});

test('el modal del ranking sigue cerrando con Escape', () => {
  const ficha = fs.readFileSync(path.join(raiz, 'js', 'mi-ficha-ui.js'), 'utf8');
  assert.match(ficha, /e\.key === 'Escape'[\s\S]{0,40}closeModal\(\)/,
    'Escape debe seguir cerrando el modal');
});
