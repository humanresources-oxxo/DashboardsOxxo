// Los mapas de Turno Nocturno son texto: un caracter mal puesto deja al
// jugador encerrado o crea un hueco al vacio, y el juego no avisa. Esta
// prueba lee los 3 turnos de NIVELES y verifica que sigan siendo jugables.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.resolve(__dirname, '..');
const juego = fs.readFileSync(path.join(raiz, 'js', 'juego-turno-nocturno.js'), 'utf8');
const ranking = fs.readFileSync(path.join(raiz, 'js', 'juego-ranking.js'), 'utf8');
const bloqueNiveles = juego.match(/const NIVELES = \[([\s\S]*?)\n    \];/);
const mapas = bloqueNiveles ? [...bloqueNiveles[1].matchAll(/mapa: \[([\s\S]*?)\]/g)].map(b => [...b[1].matchAll(/"([^"]*)"/g)].map(m => m[1])) : [];
const MUROS = '12345DX';
const MONITOS = 'zcjlLmopG';
const OBJETOS = 'habSTK';
const CONOCIDOS = new Set('12345DX.P' + OBJETOS + MONITOS);

test('hay 3 turnos y el Oso gerente solo aparece, una vez, en el ultimo', () => {
  assert.equal(mapas.length, 3, 'deben ser 3 turnos');
  mapas.forEach((mapa, n) => {
    const jefes = mapa.join('').split('G').length - 1;
    assert.equal(jefes, n === mapas.length - 1 ? 1 : 0, `turno ${n + 1}: ${jefes} jefes`);
  });
});

mapas.forEach((mapa, n) => {
  test(`turno ${n + 1}: el mapa es rectangular, cerrado y solo usa caracteres conocidos`, () => {
    assert.ok(mapa.length > 5, 'mapa vacio');
    const ancho = mapa[0].length;
    mapa.forEach((fila, y) => {
      assert.equal(fila.length, ancho, `la fila ${y} mide ${fila.length}, no ${ancho}`);
      for (const ch of fila) assert.ok(CONOCIDOS.has(ch), `caracter desconocido "${ch}" en la fila ${y}`);
      for (const x of [0, ancho - 1]) assert.ok(MUROS.includes(fila[x]), `hueco en el borde (${x},${y})`);
    });
    for (const y of [0, mapa.length - 1]) for (const ch of mapa[y]) assert.ok(MUROS.includes(ch), `hueco en el borde de la fila ${y}`);
  });

  test(`turno ${n + 1}: un solo inicio, una sola salida y se llega a ella caminando`, () => {
    const celdas = mapa.flatMap((fila, y) => [...fila].map((ch, x) => ({ ch, x, y })));
    const inicios = celdas.filter(c => c.ch === 'P');
    const salidas = celdas.filter(c => c.ch === 'X');
    assert.equal(inicios.length, 1, 'debe haber un solo inicio P');
    assert.equal(salidas.length, 1, 'debe haber una sola salida X');
    // Se camina por todo lo que no es muro; las puertas D se abren.
    const pisable = (x, y) => mapa[y] && mapa[y][x] !== undefined && !'12345X'.includes(mapa[y][x]);
    const visto = new Set([`${inicios[0].x},${inicios[0].y}`]);
    const cola = [inicios[0]];
    let llega = false;
    while (cola.length) {
      const { x, y } = cola.shift();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (mapa[ny] && mapa[ny][nx] === 'X') llega = true;
        const clave = `${nx},${ny}`;
        if (pisable(nx, ny) && !visto.has(clave)) { visto.add(clave); cola.push({ x: nx, y: ny }); }
      }
    }
    assert.ok(llega, 'la salida X no se alcanza desde P');
    // Todo monito y objeto queda en una zona alcanzable (si no, el contador de monitos nunca se completa).
    for (const c of celdas.filter(c => (MONITOS + OBJETOS).includes(c.ch))) {
      assert.ok(visto.has(`${c.x},${c.y}`), `"${c.ch}" en (${c.x},${c.y}) queda encerrado`);
    }
  });
});

test('el motor no lee ni envia datos: el ranking va aparte y solo manda la marca', () => {
  for (const prohibido of [/\bfetch\s*\(/, /XMLHttpRequest/, /navigator\.sendBeacon/, /docs\.google\.com/, /OXXO_CONFIG/]) {
    assert.doesNotMatch(juego, prohibido, `El motor no debe usar ${prohibido}`);
  }
  // El modulo de ranking solo habla con la URL que recibe y solo envia estos campos.
  assert.doesNotMatch(ranking, /docs\.google\.com|XMLHttpRequest|sendBeacon|localStorage/);
  assert.match(ranking, /JSON\.stringify\(\{ action: 'rankingGuardar', nombre: marca\.nombre, tiempo: marca\.tiempo, monitos: marca\.monitos, turnos: marca\.turnos, dificultad: marca\.dificultad \}\)/);
});

test('la portada lo ofrece y la pagina carga el candado del sitio', () => {
  assert.match(fs.readFileSync(path.join(raiz, 'index.html'), 'utf8'), /href="dashboards\/turno-nocturno\.html"/);
  const pagina = fs.readFileSync(path.join(raiz, 'dashboards', 'turno-nocturno.html'), 'utf8');
  assert.match(pagina, /js\/site-lock\.js\?v=/);
  assert.match(pagina, /OXXO_TURNO_NOCTURNO\.montar\(\{ monitos: '\.\.\/assets\/juego\/monitos\.png', armas: '\.\.\/assets\/juego\/armas\.png', ranking: OXXO_TURNO_RANKING\.crear\(/);
  assert.equal((pagina.match(/data-dificultad="(facil|normal|dificil)"/g) || []).length, 6, 'selector de dificultad en portada y fin');
  for (const id of ['scrTurno', 'bNext', 'turnoTitle', 'turnoNombre', 'turnoText', 'turnoStats', 'hTurno', 'rankTitle', 'rankEnd', 'rankForm', 'rankNombre', 'bRank', 'rankMsg']) {
    assert.match(pagina, new RegExp(`id="${id}"`), `falta #${id} en la pagina`);
  }
  assert.match(pagina, /<canvas id="armas" width="960" height="600"/);
});

test('cada letra de monito del mapa tiene su celda en la hoja de sprites', () => {
  const hoja = fs.readFileSync(path.join(raiz, 'assets', 'juego', 'monitos.png'));
  // Cabecera PNG: ancho y alto en los bytes 16-23.
  const ancho = hoja.readUInt32BE(16), alto = hoja.readUInt32BE(20);
  assert.equal(alto, 128, 'las celdas miden 128 px de alto');
  const celdas = [...juego.matchAll(/^\s+(\w): \{ tipo: '(\w+)', celda: (\d+)/gm)];
  assert.deepEqual(celdas.map(m => m[1]).sort().join(''), [...MONITOS].sort().join(''), 'MONITOS del motor y de la prueba coinciden');
  for (const [, letra, tipo, celda] of celdas) {
    assert.ok((Number(celda) + 1) * 128 <= ancho, `${tipo} (${letra}) apunta a la celda ${celda}, fuera de la hoja`);
  }
});

test('cada arma recorta su propio tramo de la hoja de armas, sin encimarse', () => {
  const hoja = fs.readFileSync(path.join(raiz, 'assets', 'juego', 'armas.png'));
  const ancho = hoja.readUInt32BE(16), alto = hoja.readUInt32BE(20);
  assert.equal(alto, 360, 'las armas miden 360 px de alto');
  const armas = [...juego.matchAll(/^\s+(\w+): \{ name: '[^']+',[^\n]*hoja: \[(\d+), (\d+)\], boca: \[(\d+), (\d+)\]/gm)]
    .map(m => ({ arma: m[1], x: +m[2], w: +m[3], bx: +m[4], by: +m[5] }));
  assert.deepEqual(armas.map(a => a.arma).sort(), ['cafe', 'escaner', 'escudo', 'terminal', 'trapeador']);
  armas.sort((a, b) => a.x - b.x).forEach((a, i, todas) => {
    assert.ok(a.x + a.w <= ancho, `${a.arma} se sale de la hoja`);
    if (i) assert.ok(a.x >= todas[i - 1].x + todas[i - 1].w, `${a.arma} se encima con ${todas[i - 1].arma}`);
    assert.ok(a.bx <= a.w && a.by <= alto, `la boca de ${a.arma} queda fuera de su imagen`);
  });
});

test('las 3 dificultades existen y escalan en el orden correcto', () => {
  const bloque = juego.match(/const DIFICULTADES = \{([\s\S]*?)\n  \};/);
  assert.ok(bloque, 'no se encontro DIFICULTADES');
  const d = {};
  for (const [, k, cuerpo] of bloque[1].matchAll(/(\w+): \{([^}]*)\}/g)) d[k] = Object.fromEntries([...cuerpo.matchAll(/(\w+): ([\d.]+)/g)].map(m => [m[1], Number(m[2])]));
  assert.deepEqual(Object.keys(d), ['facil', 'normal', 'dificil']);
  assert.deepEqual(d.normal, { vida: 1, dano: 1, pilas: 50, descanso: 40, refuerzos: 1 }, 'normal es el juego de siempre');
  for (const k of ['vida', 'dano']) assert.ok(d.facil[k] < d.normal[k] && d.normal[k] < d.dificil[k], k);
  for (const k of ['pilas', 'descanso', 'refuerzos']) assert.ok(d.facil[k] > d.normal[k] && d.normal[k] > d.dificil[k], k);
});
