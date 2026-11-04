const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { crearPartida, avanzar, servir, VIDAS, CLIENTES_POR_TURNO } = require('../js/juego-caja-navidena.js');

const raiz = path.join(__dirname, '..');

test('despachar el pedido completo cobra, da propina y saca al cliente', () => {
  const p = crearPartida(7);
  const c = p.fila[0];
  const pedido = [...c.pedido];
  pedido.slice(0, -1).forEach(x => assert.equal(servir(p, x), 'ok'));
  assert.equal(servir(p, pedido.at(-1)), 'cobrado');
  assert.equal(p.atendidos, 1);
  assert.ok(p.puntos >= 10 * pedido.length + 10, 'con paciencia llena la propina es maxima');
  assert.ok(!p.fila.some(x => x.id === c.id));
});

test('un producto equivocado quita paciencia y no cobra', () => {
  const p = crearPartida(3);
  const c = p.fila[0];
  const otro = ['cafe', 'ponche', 'tamal', 'pan', 'regalo', 'recarga'].find(x => !c.pedido.includes(x));
  const antes = c.paciencia;
  assert.equal(servir(p, otro), 'error');
  assert.ok(c.paciencia < antes);
  assert.equal(p.puntos, 0);
});

test('tres clientes molestos terminan la partida', () => {
  const p = crearPartida(11);
  for (let i = 0; i < 2000 && !p.terminada; i++) avanzar(p, 0.1);
  assert.equal(p.terminada, true);
  assert.ok(p.molestos >= VIDAS);
  assert.equal(servir(p, 'cafe'), 'vacio');
});

test('cada seis clientes atendidos sube el turno', () => {
  const p = crearPartida(5);
  for (let n = 0; n < CLIENTES_POR_TURNO; n++) {
    while (!p.fila.length) avanzar(p, 0.1);
    [...p.fila[0].pedido].forEach(x => servir(p, x));
  }
  assert.equal(p.turno, 2);
});

test('la pagina existe y la portada la enlaza', () => {
  const pagina = fs.readFileSync(path.join(raiz, 'dashboards', 'caja-navidena.html'), 'utf8');
  assert.match(pagina, /juego-caja-navidena\.js\?v=/);
  assert.match(pagina, /OXXO_CAJA\.montar/);
  assert.match(fs.readFileSync(path.join(raiz, 'index.html'), 'utf8'), /href="dashboards\/caja-navidena\.html"/);
});
