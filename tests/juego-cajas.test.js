// La geometria del apilado es la unica regla del juego que puede fallar en
// silencio: si angosta de mas, la torre nunca crece y el juego se vuelve
// injugable sin que nada avise.
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const raiz = path.resolve(__dirname, '..');
const contexto = { window: {}, document: { head: { appendChild() {} }, createElement: () => ({ style: {} }) } };
vm.runInNewContext(fs.readFileSync(path.join(raiz, 'js', 'juego-cajas.js'), 'utf8'), contexto);
const { resolverSoltar } = contexto.window.OXXO_JUEGO;

const MARGEN = 6;

test('una caja clavada conserva el ancho completo', () => {
  const base = { x: 100, ancho: 200 };
  const r = resolverSoltar(base, { x: 100, ancho: 200 }, MARGEN);
  assert.equal(r.ok, true);
  assert.equal(r.perfecto, true);
  // Se comparan campos y no el objeto entero: viene de otro realm del vm y
  // deepStrictEqual fallaria por el prototipo, no por los valores.
  assert.equal(r.nueva.x, 100);
  assert.equal(r.nueva.ancho, 200);
  assert.equal(r.restos.length, 0, 'una clavada no tira restos');
});

test('un desfase dentro del margen tambien cuenta como clavada', () => {
  const base = { x: 100, ancho: 200 };
  for (const dx of [-MARGEN, -1, 0, 1, MARGEN]) {
    const r = resolverSoltar(base, { x: 100 + dx, ancho: 200 }, MARGEN);
    assert.equal(r.perfecto, true, `desfase ${dx} deberia ser perfecto`);
    assert.equal(r.nueva.ancho, 200, 'no debe angostar');
  }
});

test('fuera del margen angosta exactamente lo que no empalma', () => {
  const base = { x: 100, ancho: 200 };
  const r = resolverSoltar(base, { x: 150, ancho: 200 }, MARGEN);
  assert.equal(r.perfecto, false);
  assert.equal(r.nueva.x, 150);
  assert.equal(r.nueva.ancho, 150, 'empalme de 150px');
  assert.equal(r.restos.length, 1, 'cae un solo resto, por la derecha');
  assert.equal(r.restos[0].x, 300);
  assert.equal(r.restos[0].ancho, 50);
});

test('sin empalme la torre se cae', () => {
  const base = { x: 100, ancho: 200 };
  assert.equal(resolverSoltar(base, { x: 300, ancho: 200 }, MARGEN).ok, false, 'justo al borde no empalma');
  assert.equal(resolverSoltar(base, { x: 400, ancho: 200 }, MARGEN).ok, false, 'muy lejos tampoco');
  assert.equal(resolverSoltar(base, { x: -200, ancho: 200 }, MARGEN).ok, false, 'ni por la izquierda');
});

test('el ancho nunca crece ni se vuelve negativo', () => {
  let base = { x: 100, ancho: 200 };
  for (let i = 0; i < 50; i += 1) {
    const dx = (i % 7) * 9 - 27;            // desfases variados, algunos dentro del margen
    const r = resolverSoltar(base, { x: base.x + dx, ancho: base.ancho }, MARGEN);
    if (!r.ok) break;
    assert.ok(r.nueva.ancho > 0, 'el ancho debe ser positivo');
    assert.ok(r.nueva.ancho <= base.ancho, 'el ancho nunca crece');
    base = r.nueva;
  }
});

test('un jugador perfecto puede construir una torre indefinida', () => {
  // Es la prueba que importa: si clavar cada caja igual angostara la torre,
  // el juego seria injugable por diseño y nadie pasaria de unas pocas cajas.
  let base = { x: 100, ancho: 200 };
  let altura = 0;
  for (let i = 0; i < 500; i += 1) {
    const r = resolverSoltar(base, { x: base.x, ancho: base.ancho }, MARGEN);
    assert.equal(r.ok, true, `la torre se cayo en la caja ${i} pese a clavarla`);
    base = r.nueva;
    altura += 1;
  }
  assert.equal(altura, 500);
  assert.equal(base.ancho, 200, 'clavando siempre, el ancho se conserva entero');
});

test('una racha de casi-aciertos degrada despacio, no de golpe', () => {
  // Desfase de 10px (fuera del margen de 6) sobre 200 de ancho.
  let base = { x: 100, ancho: 200 };
  let cajas = 0;
  while (cajas < 100) {
    const r = resolverSoltar(base, { x: base.x + 10, ancho: base.ancho }, MARGEN);
    if (!r.ok) break;
    base = r.nueva; cajas += 1;
  }
  assert.ok(cajas >= 18, `con 10px de error deberian caber al menos 18 cajas, cupieron ${cajas}`);
});

test('el juego se ofrece una sola vez por pagina y solo donde cabe', () => {
  // showError() se llama por contenedor: un tablero caido levanta cuatro o
  // cinco cajas de error. Sin tope, el boton aparecia en todas.
  const core = fs.readFileSync(path.join(raiz, 'js', 'core.js'), 'utf8');
  assert.match(core, /let juegoYaOfrecido = false;/, 'Debe haber un tope por pagina');
  assert.match(core, /if \(juegoYaOfrecido\) \{ zona\.remove\(\); return; \}/,
    'Las cajas siguientes no deben ofrecer el juego');
  assert.match(core, /const JUEGO_ANCHO_MINIMO = \d+;/, 'Debe declarar un ancho minimo');
  assert.match(core, /getBoundingClientRect\(\)\.width < JUEGO_ANCHO_MINIMO/,
    'Una caja angosta no debe ofrecer el juego');
  // Y no debe cargarse de entrada: solo cuando alguien lo pide.
  assert.doesNotMatch(core, /<script[^>]*juego-cajas\.js/, 'No debe precargarse en core');
  assert.match(core, /script\.src = .*juego-cajas\.js/, 'Debe cargarse bajo demanda');
});

test('el juego no lee ni envia datos', () => {
  // Es lo que lo hace util cuando Sheets no responde; si algun dia alguien le
  // agrega una peticion, deja de funcionar justo cuando mas se necesita.
  const juego = fs.readFileSync(path.join(raiz, 'js', 'juego-cajas.js'), 'utf8');
  for (const prohibido of [/\bfetch\s*\(/, /XMLHttpRequest/, /navigator\.sendBeacon/, /docs\.google\.com/]) {
    assert.doesNotMatch(juego, prohibido, `El juego no debe usar ${prohibido}`);
  }
});

console.log('juego-cajas.test.js: geometria del apilado OK');
