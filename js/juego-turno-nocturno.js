/* ==========================================================
   TURNO NOCTURNO — juego en primera persona dentro de un OXXO

   Son las 3:00 a.m. y la tienda se lleno de monitos zombi con el
   uniforme rojo: tlacuache, chihuahua, jaguar, lobos, mono,
   pinguino y el oso gerente. Hay que cruzar bodega, camara fria
   y pasillos hasta la puerta de SALIDA.

   Motor de raycasting (estilo clasico) sobre un canvas de 320x200.
   Paredes y objetos se dibujan con formas al arrancar; los monitos
   salen de assets/juego/monitos.png (una celda de 128x128 por
   personaje) y las 5 armas de assets/juego/armas.png, que se dibujan
   en un segundo canvas (#armas) a 960x600 para que no pierdan
   detalle. No usa librerias y, como la Torre de Cajas, no lee ni
   envia datos; el mejor tiempo vive en localStorage.

   Uso: OXXO_TURNO_NOCTURNO.montar({ monitos: 'ruta/monitos.png',
   armas: 'ruta/armas.png' }) sobre dashboards/turno-nocturno.html
   (busca sus elementos por id).
   ========================================================== */
(function () {
  'use strict';

  const RECORD_KEY = 'oxxo-turno-nocturno-record';

  function montar(opciones = {}) {
    const W = 320, H = 200, TS = 64;
    const stage = document.getElementById('stage');
    const cv = document.getElementById('view');
    const ctx = cv.getContext('2d', { alpha: false });
    const img = ctx.createImageData(W, H);
    const buf = new Uint32Array(img.data.buffer);
    const zbuf = new Float32Array(W);
    // Capa de armas: misma proporcion que la vista, 3 veces mas grande.
    const AW = 960, AH = 600, AS = AW / W;
    const actx = document.getElementById('armas').getContext('2d');

    /* ---------- utilidades ---------- */
    let seed = 2400;
    function rnd() { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }
    const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
    function angDiff(a, b) { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; }
    function shade(c, f) {
      if (f >= 1) return c;
      return 0xff000000 | (((c >> 16 & 255) * f) << 16) | (((c >> 8 & 255) * f) << 8) | ((c & 255) * f);
    }
    const fog = d => clamp(3.4 / (d + 1.5), 0.1, 1);
    // Monito congelado: se ve azul hielo.
    const azul = c => 0xff000000 | (Math.min(255, (c >> 16 & 255) + 120) << 16) | (Math.min(255, (c >> 8 & 255) + 50) << 8) | ((c & 255) >> 1);

    function makeTex(draw, noise = 0) {
      const c = document.createElement('canvas'); c.width = c.height = TS;
      const g = c.getContext('2d'); draw(g);
      const d = g.getImageData(0, 0, TS, TS);
      for (let i = 0; i < d.data.length; i += 4) {
        if (d.data[i + 3] < 128) { d.data[i + 3] = 0; continue; }
        d.data[i + 3] = 255;
        if (noise) { const v = (rnd() - 0.5) * noise; d.data[i] += v; d.data[i + 1] += v; d.data[i + 2] += v; }
      }
      return new Uint32Array(d.data.buffer);
    }
    function el(g, x, y, rx, ry, c) { g.fillStyle = c; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill(); }
    function poly(g, c, pts) { g.fillStyle = c; g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.closePath(); g.fill(); }
    function rect(g, c, x, y, w, h) { g.fillStyle = c; g.fillRect(x, y, w, h); }
    const ROJO = '#d91f2d', AMARILLO = '#ffd200';
    const PRODUCTOS = [ROJO, AMARILLO, '#2b6fd6', '#19ad63', '#f07b22', '#7b1fa2', '#f2f2f2', '#8a5a2b'];
    const producto = () => PRODUCTOS[rnd() * PRODUCTOS.length | 0];

    /* ---------- texturas de muro ---------- */
    // 1: anaquel de pasillo con papas, latas y botellas.
    const T_ANAQUEL = makeTex(g => {
      rect(g, '#2a2d31', 0, 0, 64, 64);
      for (const y0 of [0, 21, 42]) {
        let x = 4;
        while (x < 60) {
          const tipo = rnd(), c = producto();
          if (tipo < 0.4) { const w = 9; rect(g, c, x, y0 + 6, w, 12); rect(g, 'rgba(255,255,255,.35)', x + 2, y0 + 9, 5, 3); el(g, x + w / 2, y0 + 6, w / 2, 2, c); x += w + 1; }
          else if (tipo < 0.75) { rect(g, c, x, y0 + 10, 5, 8); rect(g, '#cfd3d6', x, y0 + 9, 5, 2); rect(g, 'rgba(255,255,255,.4)', x + 1, y0 + 11, 1, 6); x += 6; }
          else { rect(g, c, x + 1, y0 + 8, 4, 10); rect(g, c, x + 2, y0 + 4, 2, 4); rect(g, '#f2f2f2', x + 1, y0 + 11, 4, 3); x += 6; }
        }
        rect(g, '#9aa0a6', 0, y0 + 18, 64, 3); rect(g, ROJO, 2, y0 + 18, 8, 3); rect(g, '#5f656b', 0, y0 + 20, 64, 1);
      }
      rect(g, '#5f656b', 0, 0, 3, 64); rect(g, '#5f656b', 61, 0, 3, 64);
    }, 14);
    // 2: refrigerador con puertas de vidrio y botellas.
    const T_REFRI = makeTex(g => {
      rect(g, '#3a3f45', 0, 0, 64, 64);
      for (const x0 of [3, 34]) {
        rect(g, '#9fd2f2', x0, 6, 27, 56);
        for (const y0 of [8, 26, 44]) {
          for (let x = x0 + 2; x < x0 + 25; x += 4) { const c = producto(); rect(g, c, x, y0 + 4, 3, 12); rect(g, c, x + 1, y0 + 1, 1, 3); rect(g, 'rgba(255,255,255,.5)', x, y0 + 7, 1, 7); }
          rect(g, '#cfe6f5', x0, y0 + 16, 27, 2);
        }
        rect(g, 'rgba(255,255,255,.22)', x0 + 3, 6, 4, 56);
        rect(g, '#d8dde2', x0 + (x0 < 30 ? 23 : 1), 24, 2, 18);
      }
      rect(g, ROJO, 0, 0, 64, 5); rect(g, AMARILLO, 0, 4, 64, 1);
    }, 8);
    // 3: pared de la tienda: blanca con franja roja y amarilla.
    const T_PARED = makeTex(g => {
      rect(g, '#ece7df', 0, 0, 64, 64);
      rect(g, AMARILLO, 0, 22, 64, 4); rect(g, ROJO, 0, 26, 64, 14); rect(g, AMARILLO, 0, 40, 64, 2);
      rect(g, '#b9b2a8', 0, 58, 64, 6);
      rect(g, 'rgba(0,0,0,.06)', 31, 0, 1, 22); rect(g, 'rgba(0,0,0,.06)', 31, 42, 1, 16);
      g.fillStyle = '#7a1218'; g.fillRect(9, 30, 3, 3); g.fillRect(48, 34, 2, 2);
    }, 10);
    // 4: bodega: cajas de carton apiladas.
    const T_BODEGA = makeTex(g => {
      rect(g, '#4a4440', 0, 0, 64, 64);
      for (const [x, y, w, h] of [[1, 1, 30, 20], [33, 1, 30, 20], [1, 22, 20, 20], [22, 22, 41, 20], [1, 43, 40, 20], [42, 43, 21, 20]]) {
        const s = rnd();
        rect(g, `rgb(${150 + s * 30 | 0},${104 + s * 20 | 0},${58 + s * 12 | 0})`, x, y, w, h);
        rect(g, 'rgba(0,0,0,.18)', x, y + h - 2, w, 2);
        rect(g, '#c9a874', x + (w >> 1) - 2, y, 4, h);
        if (w > 25) { rect(g, '#f4efe4', x + 4, y + 4, 9, 6); rect(g, ROJO, x + 5, y + 6, 7, 1); }
      }
    }, 18);
    // D: puerta de bodega con ventanilla y franja de precaucion.
    const T_PUERTA = makeTex(g => {
      rect(g, '#5d6166', 0, 0, 64, 64);
      rect(g, '#7a7f85', 4, 0, 56, 64);
      el(g, 32, 18, 9, 9, '#2a2e33'); el(g, 32, 18, 7, 7, '#9fc6de'); rect(g, 'rgba(255,255,255,.4)', 28, 13, 2, 6);
      rect(g, '#141414', 4, 50, 56, 10);
      g.save(); g.beginPath(); g.rect(4, 50, 56, 10); g.clip();
      for (let x = -16; x < 70; x += 8) poly(g, AMARILLO, [x, 50, x + 4, 50, x + 12, 60, x + 8, 60]);
      g.restore();
      // Sin texto: la puerta se ve desde los dos lados y una palabra saldria al reves.
      rect(g, '#f4efe4', 18, 32, 28, 12); rect(g, ROJO, 22, 35, 20, 2); rect(g, ROJO, 22, 39, 20, 2);
      rect(g, '#43474c', 4, 0, 2, 64); rect(g, '#43474c', 58, 0, 2, 64);
    }, 10);
    // X: puertas automaticas de salida.
    const T_SALIDA = makeTex(g => {
      rect(g, '#20262b', 0, 0, 64, 64);
      rect(g, ROJO, 0, 0, 64, 8); rect(g, AMARILLO, 0, 8, 64, 2);
      rect(g, '#7fb6d1', 4, 12, 27, 52); rect(g, '#7fb6d1', 33, 12, 27, 52);
      rect(g, 'rgba(255,255,255,.3)', 8, 12, 4, 52); rect(g, 'rgba(255,255,255,.3)', 37, 12, 4, 52);
      rect(g, '#123d22', 10, 24, 44, 22);
      g.fillStyle = '#7dff8e'; g.font = 'bold 10px monospace'; g.textAlign = 'center'; g.fillText('SALIDA', 32, 34);
      poly(g, '#7dff8e', [20, 38, 34, 38, 34, 35, 43, 40, 34, 45, 34, 42, 20, 42]);
    }, 6);
    // 5: barra de cafe con cafeteras y vasos.
    const T_CAFE = makeTex(g => {
      rect(g, '#3b2a22', 0, 0, 64, 64);
      rect(g, ROJO, 0, 0, 64, 10); g.fillStyle = '#fff'; g.font = 'bold 8px monospace'; g.textAlign = 'center'; g.fillText('CAFÉ', 32, 8);
      for (const x of [4, 24, 44]) {
        rect(g, '#16110f', x, 14, 16, 30); rect(g, '#2d2522', x + 2, 16, 12, 10);
        rect(g, AMARILLO, x + 3, 28, 3, 3); rect(g, ROJO, x + 9, 28, 3, 3);
        rect(g, '#0c0908', x + 5, 34, 6, 6);
      }
      rect(g, '#b8aa9a', 0, 44, 64, 4);
      for (let x = 4; x < 60; x += 7) { rect(g, '#f4efe4', x, 50, 5, 9); rect(g, ROJO, x, 53, 5, 2); }
    }, 12);
    const WT = [T_ANAQUEL, T_REFRI, T_PARED, T_BODEGA, T_PUERTA, T_SALIDA, T_CAFE];
    const T_PISO = makeTex(g => {
      for (const x of [0, 32]) for (const y of [0, 32]) rect(g, (x + y) % 64 ? '#d6d2ca' : '#c9c4bb', x, y, 32, 32);
      rect(g, '#a49d92', 0, 0, 64, 1); rect(g, '#a49d92', 0, 32, 64, 1); rect(g, '#a49d92', 0, 0, 1, 64); rect(g, '#a49d92', 32, 0, 1, 64);
      el(g, 46, 14, 5, 3, 'rgba(140,40,30,.35)');
    }, 16);
    const T_TECHO = makeTex(g => {
      rect(g, '#9d988f', 0, 0, 64, 64); rect(g, '#b3aea5', 2, 2, 60, 60);
      rect(g, '#e8e2d2', 8, 26, 48, 12); rect(g, '#fffbea', 10, 28, 44, 8);
    }, 8);

    /* ---------- monitos ---------- */
    // Cada personaje ocupa una celda de 128x128 en assets/juego/monitos.png,
    // en este orden. Sus cuadros (caminar, atacar, dolor, muerto) se derivan
    // de esa unica pose al cargar la imagen.
    // ia: 'cuerpo' persigue y muerde · 'tirador' esquiva y avienta monedas ·
    // 'escupe' lanza proyectiles y muerde de cerca.
    const MONITOS = {
      z: { tipo: 'tlacuache', celda: 0, vida: 35, ia: 'tirador', vel: 1.5, dano: [4, 10], escala: 0.8, sonido: 'alerta', suelta: 'a' },
      c: { tipo: 'chihuahua', celda: 1, vida: 28, ia: 'cuerpo', vel: 3.4, dano: [5, 9], escala: 0.62, sonido: 'ladrido' },
      j: { tipo: 'jaguar', celda: 2, vida: 60, ia: 'cuerpo', vel: 2.5, dano: [10, 16], escala: 0.9, sonido: 'gruñido' },
      l: { tipo: 'lobo', celda: 3, vida: 50, ia: 'escupe', vel: 1.9, dano: [9, 16], escala: 0.62, z: 0.3, sonido: 'aullido', proj: 'baba' },
      L: { tipo: 'lobo2', celda: 4, vida: 50, ia: 'escupe', vel: 1.9, dano: [9, 16], escala: 0.62, z: 0.3, sonido: 'aullido', proj: 'baba' },
      m: { tipo: 'mono', celda: 5, vida: 40, ia: 'tirador', vel: 1.8, dano: [4, 9], escala: 0.85, sonido: 'chillido', suelta: 'a' },
      o: { tipo: 'oso', celda: 6, vida: 220, ia: 'cuerpo', vel: 1.3, embiste: 2.5, dano: [15, 24], escala: 1.3, sonido: 'gruñido' },
      p: { tipo: 'pinguino', celda: 7, vida: 70, ia: 'escupe', vel: 1.2, dano: [8, 14], escala: 0.82, sonido: 'graznido', proj: 'nieve' }
    };
    const CELDA = 128;
    // Textura de sprite: pixeles + lado (64 para objetos, 128 para monitos).
    const spr = (px, n) => ({ px, n });
    function texDeCanvas(c) {
      const g = c.getContext('2d'), d = g.getImageData(0, 0, c.width, c.height);
      for (let i = 3; i < d.data.length; i += 4) d.data[i] = d.data[i] < 128 ? 0 : 255;
      return spr(new Uint32Array(d.data.buffer), c.width);
    }
    function cuadros(fuente, sx) {
      const hacer = dibujo => { const c = document.createElement('canvas'); c.width = c.height = CELDA; dibujo(c.getContext('2d')); return texDeCanvas(c); };
      const pose = (g, ancho, alto) => g.drawImage(fuente, sx, 0, CELDA, CELDA, (CELDA - ancho) / 2, CELDA - alto, ancho, alto);
      const tinte = (g, color) => { g.globalCompositeOperation = 'source-atop'; g.fillStyle = color; g.fillRect(0, 0, CELDA, CELDA); };
      return {
        idle: hacer(g => pose(g, CELDA, CELDA)),
        walk: hacer(g => pose(g, CELDA * 1.03, CELDA * 0.96)),
        atk: hacer(g => { pose(g, CELDA, CELDA); tinte(g, 'rgba(255,220,90,.28)'); }),
        pain: hacer(g => { pose(g, CELDA * 0.97, CELDA * 0.97); tinte(g, 'rgba(255,40,40,.5)'); }),
        dead: hacer(g => { g.translate(CELDA / 2, CELDA - 22); g.rotate(Math.PI / 2); g.scale(0.7, 0.7); g.drawImage(fuente, sx, 0, CELDA, CELDA, -CELDA / 2, -CELDA / 2, CELDA, CELDA); g.setTransform(1, 0, 0, 1, 0, 0); tinte(g, 'rgba(20,0,0,.35)'); })
      };
    }
    // Si la imagen no llega (sin red, archivo movido) cada monito se ve como
    // una silueta roja: el juego sigue siendo jugable.
    function silueta() {
      const c = document.createElement('canvas'); c.width = c.height = CELDA; const g = c.getContext('2d');
      g.fillStyle = ROJO; g.beginPath(); g.ellipse(64, 80, 34, 44, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#8fb07a'; g.beginPath(); g.ellipse(64, 34, 24, 22, 0, 0, Math.PI * 2); g.fill();
      return c;
    }
    const SPR = {};
    function prepararMonitos(fuente) {
      for (const cfg of Object.values(MONITOS)) {
        const f = fuente ? cuadros(fuente, cfg.celda * CELDA) : cuadros(silueta(), 0);
        for (const k in f) SPR[cfg.tipo + '_' + k] = f[k];
      }
    }
    // h: torta (salud) · a: pilas (escaner) · b: cargas de cafe (lanza-cafe)
    // S lanza-cafe · T terminal "No hay sistema" · K escudo "Caja cerrada".
    SPR.h = spr(makeTex(g => { el(g, 32, 50, 18, 7, '#e2a95a'); rect(g, '#5aa83c', 15, 52, 34, 3); rect(g, '#d9534f', 16, 55, 32, 3); rect(g, '#f2d27a', 16, 58, 32, 2); el(g, 32, 61, 18, 4, '#d8994a'); for (const x of [24, 32, 40]) rect(g, '#fff3d6', x, 46, 2, 2); }), 64);
    SPR.a = spr(makeTex(g => { for (const x of [18, 30, 42]) { rect(g, '#2a2a2e', x, 44, 9, 19); rect(g, AMARILLO, x, 50, 9, 6); rect(g, '#c9c9cc', x + 3, 41, 3, 3); } }), 64);
    SPR.b = spr(makeTex(g => { poly(g, '#6b4226', [20, 42, 44, 42, 46, 63, 18, 63]); rect(g, ROJO, 19, 50, 26, 6); rect(g, '#f4efe4', 26, 52, 12, 2); rect(g, '#4a2c18', 22, 40, 20, 3); }), 64);
    SPR.S = spr(makeTex(g => { rect(g, '#5a5f66', 22, 40, 22, 22); rect(g, '#9aa0a6', 30, 30, 5, 12); el(g, 18, 54, 8, 8, '#cfe6f5'); el(g, 18, 56, 6, 5, '#5a3216'); rect(g, ROJO, 46, 44, 7, 16); rect(g, '#7a4a2a', 30, 50, 6, 13); }), 64);
    SPR.T = spr(makeTex(g => { rect(g, '#2f3540', 22, 34, 20, 29); rect(g, '#a9c48a', 25, 37, 14, 8); rect(g, ROJO, 34, 40, 3, 3); for (let y = 48; y < 60; y += 4) for (let x = 25; x < 39; x += 5) rect(g, '#9aa0a6', x, y, 3, 2); rect(g, '#2f3540', 38, 26, 2, 9); }), 64);
    SPR.K = spr(makeTex(g => { rect(g, '#2a2d33', 14, 36, 36, 27); rect(g, '#16181c', 18, 42, 28, 14); rect(g, AMARILLO, 21, 45, 22, 3); rect(g, ROJO, 21, 50, 22, 3); poly(g, '#9aa0a6', [14, 36, 22, 36, 14, 42]); poly(g, '#9aa0a6', [50, 36, 42, 36, 50, 42]); }), 64);
    // Proyectiles: baba verde de los lobos y bola de nieve del pinguino.
    SPR.proj_baba = spr(makeTex(g => { el(g, 32, 32, 26, 26, 'rgba(120,255,90,.55)'); el(g, 32, 34, 16, 18, '#4fd14a'); el(g, 27, 28, 5, 6, '#c8ffb0'); }), 64);
    SPR.proj_nieve = spr(makeTex(g => { el(g, 32, 32, 26, 26, 'rgba(170,220,255,.6)'); el(g, 32, 32, 17, 17, '#f4fbff'); el(g, 27, 27, 5, 5, '#ffffff'); el(g, 37, 37, 4, 4, '#cfe6f5'); }), 64);

    /* ---------- mapa ---------- */
    // P inicio · monitos: z tlacuache, c chihuahua, j jaguar, l/L lobos,
    // m mono, o oso, p pinguino · h torta · a pilas · b cargas de cafe
    // S lanza-cafe · T terminal "No hay sistema" · K escudo "Caja cerrada"
    // 1 anaquel · 2 refrigerador · 3 pared · 4 bodega · 5 barra de cafe
    // D puerta · X salida
    const MAP_SRC = [
      "444444444444222222222222",
      "4P....4....h2...l....z.2",
      "4.....4.....2.......T..2",
      "4..a..D..c..D....m....h2",
      "4.....4.....2..........2",
      "4..b..4.....2...a.....p2",
      "444D444444D4222222D22222",
      "3......................3",
      "3.11111.111111.111111..3",
      "3......z.........j.....3",
      "3.11111.111111.111111..3",
      "3..h....c....S.....a...3",
      "3.11111.111111.111111..3",
      "3...L.........m.....b..3",
      "3.11111.111111.111111..3",
      "3....K.................3",
      "3555...p.....j....z..h.3",
      "3555.......o...........3",
      "333333333333X33333333333"
    ];
    const MH = MAP_SRC.length, MW = MAP_SRC[0].length;
    const WALLCH = { '1': 0, '2': 1, '3': 2, '4': 3, 'D': 4, 'X': 5, '5': 6 };
    const DOOR = 4, EXIT = 5;

    let grid, doors, ents, player, kills, total, elapsed, state = 'title', mapOn = false;
    let ammo, have, cur, wcool, flashT, recoil, hurtT, pickT, bobT, moving, swapT, deathT, senalT, particulas;

    function loadLevel() {
      grid = new Int8Array(MW * MH).fill(-1); doors = new Map(); ents = [];
      for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
        const ch = MAP_SRC[y][x], i = y * MW + x;
        if (ch in WALLCH) { grid[i] = WALLCH[ch]; if (ch === 'D') doors.set(i, { open: 0, target: 0, timer: 0 }); continue; }
        const cx = x + .5, cy = y + .5;
        if (ch === 'P') player = { x: cx, y: cy, a: 0, hp: 100 };
        else if (ch in MONITOS) ents.push(enemy(MONITOS[ch], cx, cy));
        else if ('habSTK'.includes(ch)) ents.push({ kind: 'pick', item: ch, x: cx, y: cy });
      }
      total = ents.filter(e => e.kind === 'enemy').length; kills = 0; elapsed = 0;
      ammo = { pilas: 50, cafe: 0, senal: 0 }; have = { trapeador: true, escaner: true, cafe: false, terminal: false, escudo: false }; cur = 'escaner';
      senalT = 0; particulas = [];
      wcool = 0; flashT = 0; recoil = 0; hurtT = 0; pickT = 0; bobT = 0; moving = false; swapT = 0; deathT = 0;
    }
    function enemy(cfg, x, y) {
      return { kind: 'enemy', cfg, type: cfg.tipo, x, y, hp: cfg.vida, awake: false, cool: 1 + Math.random(),
        painT: 0, atkT: 0, dead: false, walkT: Math.random() * 10, moved: false, strafe: 1, strafeT: 0 };
    }
    function solidCell(x, y) {
      if (x < 0 || y < 0 || x >= MW || y >= MH) return true;
      const i = y * MW + x, c = grid[i];
      if (c < 0) return false;
      if (c === DOOR) return doors.get(i).open < 0.95;
      return true;
    }
    function blockedAt(x, y, r, opener) {
      for (const [ox, oy] of [[-r, -r], [r, -r], [-r, r], [r, r]]) {
        const cx = (x + ox) | 0, cy = (y + oy) | 0;
        if (solidCell(cx, cy)) { if (opener && grid[cy * MW + cx] === DOOR) openDoor(cy * MW + cx); return true; }
      }
      return false;
    }
    function move(e, dx, dy, r, opener) {
      let ok = false;
      if (!blockedAt(e.x + dx, e.y, r, opener)) { e.x += dx; ok = true; }
      if (!blockedAt(e.x, e.y + dy, r, opener)) { e.y += dy; ok = true; }
      return ok;
    }
    function castRay(x, y, ang, maxD) {
      const rdx = Math.cos(ang), rdy = Math.sin(ang);
      let mx = x | 0, my = y | 0;
      const ddx = Math.abs(1 / rdx), ddy = Math.abs(1 / rdy);
      let sx, sy, sdx, sdy;
      if (rdx < 0) { sx = -1; sdx = (x - mx) * ddx; } else { sx = 1; sdx = (mx + 1 - x) * ddx; }
      if (rdy < 0) { sy = -1; sdy = (y - my) * ddy; } else { sy = 1; sdy = (my + 1 - y) * ddy; }
      for (let k = 0; k < 64; k++) {
        let d;
        if (sdx < sdy) { d = sdx; sdx += ddx; mx += sx; } else { d = sdy; sdy += ddy; my += sy; }
        if (d > maxD) return maxD;
        if (solidCell(mx, my)) return d;
      }
      return maxD;
    }
    const los = (e, d) => castRay(e.x, e.y, Math.atan2(player.y - e.y, player.x - e.x), d) >= d - 0.05;

    /* ---------- audio sintetizado ---------- */
    let AC = null, NOISE = null;
    function initAudio() {
      if (AC) { AC.resume(); return; }
      try {
        AC = new (window.AudioContext || window.webkitAudioContext)();
        NOISE = AC.createBuffer(1, AC.sampleRate, AC.sampleRate);
        const d = NOISE.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      } catch (e) { AC = null; }
    }
    function env(vol, dur) { const g = AC.createGain(); const t = AC.currentTime; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); g.connect(AC.destination); return g; }
    function noise(vol, dur, type, freq) { const s = AC.createBufferSource(); s.buffer = NOISE; const f = AC.createBiquadFilter(); f.type = type; f.frequency.value = freq; s.connect(f); f.connect(env(vol, dur)); s.start(); s.stop(AC.currentTime + dur); }
    function tone(vol, dur, type, f0, f1) { const o = AC.createOscillator(); o.type = type; const t = AC.currentTime; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur); o.connect(env(vol, dur)); o.start(); o.stop(t + dur); }
    function sfx(name, x, y) {
      if (!AC) return;
      let v = 1;
      if (x !== undefined) v = clamp(1.6 / (1 + Math.hypot(x - player.x, y - player.y) * 0.35), 0.05, 1);
      switch (name) {
        case 'trapeador': noise(.4 * v, .22, 'bandpass', 600); break;
        case 'escaner': tone(.2 * v, .08, 'square', 1500, 1500); tone(.15 * v, .2, 'sawtooth', 1400, 500); break;
        case 'cafe': noise(.7 * v, .4, 'lowpass', 900); tone(.25 * v, .3, 'sine', 140, 60); break;
        case 'terminal': tone(.22, .12, 'square', 700, 700); setTimeout(() => AC && tone(.22, .12, 'square', 500, 500), 140); setTimeout(() => AC && tone(.22, .3, 'square', 320, 300), 280); break;
        case 'escudo': noise(.5 * v, .15, 'lowpass', 300); tone(.3 * v, .12, 'sine', 90, 50); break;
        case 'congela': tone(.2 * v, .5, 'sine', 900, 200); break;
        case 'moneda': tone(.22 * v, .06, 'square', 1800, 1700); setTimeout(() => AC && tone(.18 * v, .12, 'square', 2600, 2500), 50); break;
        case 'gruñido': tone(.3 * v, .55, 'sawtooth', 95, 55); break;
        case 'alerta': tone(.22 * v, .18, 'square', 520, 300); break;
        case 'dolor': tone(.25 * v, .18, 'square', 260, 120); break;
        case 'muere': tone(.35 * v, .7, 'sawtooth', 220, 35); noise(.2 * v, .4, 'lowpass', 400); break;
        case 'herido': tone(.35, .22, 'square', 200, 90); break;
        case 'recoge': tone(.2, .08, 'square', 660, 700); setTimeout(() => AC && tone(.2, .1, 'square', 990, 1000), 70); break;
        case 'puerta': tone(.25 * v, .55, 'triangle', 70, 55); noise(.12 * v, .5, 'lowpass', 300); break;
        case 'vacio': tone(.15, .05, 'square', 1200, 900); break;
        case 'uf': tone(.2, .12, 'square', 140, 100); break;
        case 'ladrido': tone(.25 * v, .07, 'square', 900, 700); setTimeout(() => AC && tone(.25 * v, .08, 'square', 950, 650), 110); break;
        case 'aullido': tone(.25 * v, .8, 'sine', 300, 520); break;
        case 'chillido': tone(.22 * v, .25, 'square', 1200, 1600); break;
        case 'graznido': tone(.25 * v, .3, 'sawtooth', 500, 380); noise(.12 * v, .2, 'bandpass', 1200); break;
        case 'baba': noise(.3 * v, .3, 'lowpass', 500); tone(.18 * v, .3, 'sine', 180, 90); break;
        case 'nieve': noise(.35 * v, .25, 'highpass', 1800); break;
        case 'bienvenido': tone(.18, .14, 'sine', 880, 880); setTimeout(() => AC && tone(.18, .22, 'sine', 660, 660), 150); break;
      }
    }

    /* ---------- armas ---------- */
    // hoja: [x, ancho] dentro de assets/juego/armas.png (360 px de alto).
    // boca: de donde sale el disparo, en pixeles de esa misma imagen.
    // corre: desplazamiento a la derecha en pantalla (el escaner se sostiene
    // como pistola: su ventana apunta arriba a la izquierda, hacia la mira).
    // tipo: 'golpe' cuerpo a cuerpo · 'rayo' disparo directo · 'congela'
    // detiene a los monitos cercanos · 'empuje' golpe del escudo.
    const WEAP = {
      trapeador: { name: 'TRAPEADOR', ammo: null, label: 'CLORO', tipo: 'golpe', rate: 0.55, dmg: [22, 34], alcance: 1.6, hoja: [0, 400], boca: [180, 50] },
      escaner: { name: 'ESCÁNER', ammo: 'pilas', label: 'PILAS', tipo: 'rayo', rate: 0.32, dmg: [10, 18], pellets: 1, spread: 0.01, hoja: [816, 498], boca: [212, 32], corre: 170 },
      cafe: { name: 'LANZA-CAFÉ', ammo: 'cafe', label: 'CARGAS', tipo: 'rayo', rate: 0.95, dmg: [7, 12], pellets: 7, spread: 0.09, hoja: [400, 416], boca: [195, 35] },
      terminal: { name: 'NO HAY SISTEMA', ammo: 'senal', label: 'SEÑALES', tipo: 'congela', rate: 1.4, radio: 9, dura: 4, hoja: [1314, 426], boca: [210, 100] },
      escudo: { name: 'CAJA CERRADA', ammo: null, label: 'ESCUDO', tipo: 'empuje', rate: 0.7, dmg: [6, 10], alcance: 1.4, hoja: [1740, 404], boca: [200, 150] }
    };
    // Teclas 1-5.
    const TECLAS = ['trapeador', 'escaner', 'cafe', 'terminal', 'escudo'];
    let hojaArmas = null;
    function switchTo(w) { if (!have[w] || cur === w) return; cur = w; swapT = 0.25; }
    function cycle() { const i = TECLAS.indexOf(cur); for (let k = 1; k <= TECLAS.length; k++) { const w = TECLAS[(i + k) % TECLAS.length]; if (have[w]) { switchTo(w); return; } } }
    const tiro = w => w.dmg[0] + Math.random() * (w.dmg[1] - w.dmg[0]) | 0;
    function fire() {
      if (wcool > 0 || swapT > 0) return;
      const w = WEAP[cur];
      if (w.ammo && ammo[w.ammo] <= 0) {
        sfx('vacio'); wcool = 0.35;
        if (cur !== 'escaner' && have.escaner && ammo.pilas > 0) switchTo('escaner'); else switchTo('trapeador');
        return;
      }
      if (w.ammo) ammo[w.ammo]--;
      wcool = w.rate; flashT = w.tipo === 'congela' ? 0.7 : cur === 'escaner' ? 0.16 : 0.12; recoil = 1; sfx(cur);
      if (w.tipo === 'rayo') for (let p = 0; p < w.pellets; p++) hitscan(player.a + (Math.random() - 0.5) * 2 * w.spread, tiro(w));
      else if (w.tipo === 'golpe' || w.tipo === 'empuje') golpeCercano(w);
      else if (w.tipo === 'congela') congelar(w);
      efectoDisparo(w);
      for (const e of ents) if (e.kind === 'enemy' && !e.dead && !e.awake && Math.hypot(e.x - player.x, e.y - player.y) < 11) wake(e);
    }
    // Trapeador y escudo: pegan al monito mas cercano frente a ti; el escudo lo empuja.
    function golpeCercano(w) {
      let best = null, bd = w.alcance;
      for (const e of ents) {
        if (e.kind !== 'enemy' || e.dead) continue;
        const dx = e.x - player.x, dy = e.y - player.y, d = Math.hypot(dx, dy);
        if (d < bd && Math.abs(angDiff(Math.atan2(dy, dx), player.a)) < 0.6) { best = e; bd = d; }
      }
      if (!best) return;
      hurtEnemy(best, tiro(w));
      if (w.tipo === 'empuje' && !best.dead) { const a = Math.atan2(best.y - player.y, best.x - player.x); move(best, Math.cos(a) * 0.9, Math.sin(a) * 0.9, 0.28, false); best.painT = 0.5; }
    }
    // "No hay sistema": los monitos que te ven se quedan quietos unos segundos.
    function congelar(w) {
      for (const e of ents) {
        if (e.kind !== 'enemy' || e.dead) continue;
        const d = Math.hypot(e.x - player.x, e.y - player.y);
        if (d < w.radio && los(e, d)) { e.congeladoT = w.dura; sfx('congela', e.x, e.y); }
      }
    }
    function hitscan(ang, dmg) {
      let best = null, bd = castRay(player.x, player.y, ang, 30);
      for (const e of ents) {
        if (e.kind !== 'enemy' || e.dead) continue;
        const dx = e.x - player.x, dy = e.y - player.y, d = Math.hypot(dx, dy);
        if (d >= bd) continue;
        if (Math.abs(angDiff(Math.atan2(dy, dx), ang)) < Math.atan2(0.3 * Math.max(1, e.cfg.escala), d)) { best = e; bd = d; }
      }
      if (best) hurtEnemy(best, dmg);
    }
    function wake(e) { if (e.awake) return; e.awake = true; sfx(e.cfg.sonido, e.x, e.y); }
    function hurtEnemy(e, dmg) {
      e.hp -= dmg; wake(e);
      if (e.hp <= 0) {
        e.dead = true; kills++; sfx('muere', e.x, e.y);
        if (e.cfg.suelta) ents.push({ kind: 'pick', item: e.cfg.suelta, x: e.x + 0.15, y: e.y + 0.1, drop: true });
      } else if (Math.random() < 0.55) { e.painT = 0.22; sfx('dolor', e.x, e.y); }
    }
    function hurtPlayer(n) {
      if (state !== 'play') return;
      // Con "Caja cerrada" en las manos el golpe llega a la cuarta parte.
      if (cur === 'escudo' && swapT <= 0) { n = Math.ceil(n * 0.25); sfx('escudo'); }
      player.hp -= n; hurtT = 0.4; sfx('herido');
      if (player.hp <= 0) { player.hp = 0; state = 'dying'; deathT = 0; releaseLock(); }
    }

    /* ---------- puertas y uso ---------- */
    function openDoor(i) { const d = doors.get(i); if (!d) return; if (d.target === 0) { d.target = 1; sfx('puerta', i % MW + .5, (i / MW | 0) + .5); } d.timer = 4; }
    function use() {
      if (state !== 'play') return;
      for (const reach of [0.7, 1.1, 1.5]) {
        const tx = (player.x + Math.cos(player.a) * reach) | 0, ty = (player.y + Math.sin(player.a) * reach) | 0;
        const c = grid[ty * MW + tx];
        if (c === DOOR) { openDoor(ty * MW + tx); return; }
        if (c === EXIT) { win(); return; }
        if (c >= 0) break;
      }
      sfx('uf');
    }
    function inCell(x, y, cx, cy, r) { return x + r > cx && x - r < cx + 1 && y + r > cy && y - r < cy + 1; }

    /* ---------- mensajes y pantallas ---------- */
    const msgEl = document.getElementById('msg'); let msgT = 0;
    function say(t) { msgEl.textContent = t; msgT = 2.4; }
    const scr = { title: document.getElementById('scrTitle'), pause: document.getElementById('scrPause'), end: document.getElementById('scrEnd') };
    function showScreen(name) { for (const k in scr) scr[k].hidden = k !== name; }
    const fmtTime = s => `${s / 60 | 0}:${String(s % 60 | 0).padStart(2, '0')}`;
    function leerRecord() { try { const v = Number(localStorage.getItem(RECORD_KEY)); return v > 0 ? v : 0; } catch (e) { return 0; } }
    function guardarRecord(v) { try { localStorage.setItem(RECORD_KEY, String(v)); } catch (e) { /* sin almacenamiento: no hay record */ } }
    function endScreen(won) {
      state = won ? 'won' : 'dead';
      document.getElementById('endTitle').textContent = won ? 'SOBREVIVISTE AL TURNO' : 'FIN DEL TURNO';
      document.getElementById('endText').textContent = won
        ? 'Saliste por la puerta automática antes del amanecer. La tienda queda en manos de los monitos.'
        : 'Los monitos se quedaron con la tienda. Vuelve a intentarlo.';
      let extra = '';
      if (won) {
        const antes = leerRecord();
        if (!antes || elapsed < antes) { guardarRecord(elapsed); extra = ' · ¡NUEVO RÉCORD!'; }
        else extra = ` · RÉCORD ${fmtTime(antes)}`;
      }
      document.getElementById('endStats').textContent = `MONITOS ${kills}/${total} · TIEMPO ${fmtTime(elapsed)}${extra}`;
      showScreen('end'); releaseLock(); touchLayer.hidden = true;
      setTimeout(() => document.getElementById('bAgain').focus(), 50);
    }
    function win() { sfx('bienvenido'); endScreen(true); }

    /* ---------- entrada ---------- */
    const keys = {}; let mouseDX = 0, mouseDown = false, dragging = false;
    const isTouch = matchMedia('(pointer: coarse)').matches;
    if (isTouch) document.getElementById('keyHelp').hidden = true;

    addEventListener('keydown', e => {
      if (state === 'play') {
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(e.code)) e.preventDefault();
        if (e.code === 'KeyE' || e.code === 'Enter') use();
        const n = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'].indexOf(e.code);
        if (n >= 0) switchTo(TECLAS[n]);
        if (e.code === 'KeyQ') cycle();
        if (e.code === 'KeyM' || e.code === 'Tab') mapOn = !mapOn;
        if (e.code === 'Escape' || e.code === 'KeyP') pause();
      } else if (state === 'pause' && (e.code === 'KeyP')) resume();
      keys[e.code] = true;
    });
    addEventListener('keyup', e => { keys[e.code] = false; });
    addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouseDown = false; if (state === 'play' && !isTouch) pause(); });

    function requestLock() { if (isTouch) return; try { const p = stage.requestPointerLock && stage.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* sin pointer lock: se juega arrastrando */ } }
    function releaseLock() { try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) { /* nada que soltar */ } }
    let hadLock = false;
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement === stage) hadLock = true;
      else if (hadLock && state === 'play') { hadLock = false; pause(); }
    });
    stage.addEventListener('mousedown', e => {
      if (state !== 'play' || isTouch || e.button !== 0) return;
      if (!document.pointerLockElement) { requestLock(); dragging = true; }
      mouseDown = true;
    });
    addEventListener('mouseup', () => { mouseDown = false; dragging = false; });
    addEventListener('mousemove', e => { if (state !== 'play') return; if (document.pointerLockElement === stage || dragging) mouseDX += e.movementX || 0; });
    stage.addEventListener('wheel', e => { if (state === 'play') { e.preventDefault(); cycle(); } }, { passive: false });

    /* tactil */
    const touchLayer = document.getElementById('touch'), stick = document.getElementById('stick'), knob = document.getElementById('knob');
    const touch = { mx: 0, my: 0, fire: false, look: 0 };
    let stickId = null, lookId = null, lookX = 0;
    touchLayer.addEventListener('pointerdown', e => {
      if (e.target.closest('.tb')) return;
      e.preventDefault();
      if (e.clientX < innerWidth * 0.45 && stickId === null) { stickId = e.pointerId; moveStick(e); }
      else if (lookId === null) { lookId = e.pointerId; lookX = e.clientX; }
    });
    touchLayer.addEventListener('pointermove', e => {
      if (e.pointerId === stickId) moveStick(e);
      else if (e.pointerId === lookId) { touch.look += e.clientX - lookX; lookX = e.clientX; }
    });
    function endTouch(e) {
      if (e.pointerId === stickId) { stickId = null; touch.mx = touch.my = 0; knob.style.transform = ''; }
      if (e.pointerId === lookId) lookId = null;
    }
    touchLayer.addEventListener('pointerup', endTouch); touchLayer.addEventListener('pointercancel', endTouch);
    function moveStick(e) {
      const r = stick.getBoundingClientRect();
      let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      const m = Math.hypot(dx, dy), R = 50; if (m > R) { dx *= R / m; dy *= R / m; }
      touch.mx = dx / R; touch.my = dy / R; knob.style.transform = `translate(${dx}px,${dy}px)`;
    }
    const tFire = document.getElementById('tFire');
    tFire.addEventListener('pointerdown', e => { e.preventDefault(); touch.fire = true; });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) tFire.addEventListener(ev, () => { touch.fire = false; });
    document.getElementById('tUse').addEventListener('pointerdown', e => { e.preventDefault(); use(); });
    document.getElementById('tSwap').addEventListener('pointerdown', e => { e.preventDefault(); cycle(); });

    /* botones de menu */
    function start() {
      initAudio(); loadLevel(); state = 'play'; showScreen(null);
      touchLayer.hidden = !isTouch; requestLock(); say('Llega a la puerta de SALIDA al frente de la tienda');
    }
    function pause() { if (state !== 'play') return; state = 'pause'; mouseDown = false; showScreen('pause'); releaseLock(); touchLayer.hidden = true; }
    function resume() { if (state !== 'pause') return; state = 'play'; showScreen(null); touchLayer.hidden = !isTouch; requestLock(); initAudio(); }
    document.getElementById('bStart').addEventListener('click', start);
    document.getElementById('bAgain').addEventListener('click', start);
    document.getElementById('bResume').addEventListener('click', resume);

    /* ---------- logica ---------- */
    function update(dt) {
      elapsed += dt;
      const turn = ((keys.ArrowRight ? 1 : 0) - (keys.ArrowLeft ? 1 : 0)) * 2.8 * dt;
      player.a += turn + mouseDX * 0.0026 + touch.look * 0.009; mouseDX = 0; touch.look = 0;

      let f = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0) - touch.my;
      let s = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0) + touch.mx;
      const len = Math.hypot(f, s); if (len > 1) { f /= len; s /= len; }
      const sp = (keys.ShiftLeft || keys.ShiftRight ? 5.4 : 3.5) * dt;
      const ca = Math.cos(player.a), sa = Math.sin(player.a);
      move(player, (ca * f - sa * s) * sp, (sa * f + ca * s) * sp, 0.22, false);
      moving = len > 0.15; if (moving) bobT += dt * (keys.ShiftLeft || keys.ShiftRight ? 12 : 9);

      wcool -= dt; swapT = Math.max(0, swapT - dt); flashT -= dt; recoil = Math.max(0, recoil - dt * 6);
      hurtT = Math.max(0, hurtT - dt); pickT = Math.max(0, pickT - dt);
      if (keys.Space || mouseDown || touch.fire) fire();
      // La terminal recupera una senal cada 12 s, hasta 3.
      if (have.terminal && ammo.senal < 3) { senalT += dt; if (senalT >= 12) { senalT = 0; ammo.senal++; } }
      for (let k = particulas.length - 1; k >= 0; k--) { const q = particulas[k]; q.x += q.vx * dt; q.y += q.vy * dt; q.vy += q.g * dt; q.vida -= dt; if (q.vida <= 0) particulas.splice(k, 1); }

      for (const [i, d] of doors) {
        if (d.target === 1) {
          d.timer -= dt;
          if (d.timer <= 0) {
            const cx = i % MW, cy = i / MW | 0;
            const busy = inCell(player.x, player.y, cx, cy, 0.25) || ents.some(e => e.kind === 'enemy' && !e.dead && inCell(e.x, e.y, cx, cy, 0.3));
            if (busy) d.timer = 1; else { d.target = 0; sfx('puerta', cx + .5, cy + .5); }
          }
        }
        d.open = clamp(d.open + Math.sign(d.target - d.open) * dt * 1.8, 0, 1);
      }

      for (let k = ents.length - 1; k >= 0; k--) {
        const e = ents[k];
        if (e.kind === 'pick') {
          if (Math.hypot(e.x - player.x, e.y - player.y) < 0.55 && takePickup(e.item)) ents.splice(k, 1);
        } else if (e.kind === 'proj') {
          e.x += e.vx * dt; e.y += e.vy * dt; e.life -= dt;
          if (Math.hypot(e.x - player.x, e.y - player.y) < 0.4) { hurtPlayer(e.dano); ents.splice(k, 1); }
          else if (e.life <= 0 || solidCell(e.x | 0, e.y | 0)) ents.splice(k, 1);
        } else if (e.kind === 'enemy') updateEnemy(e, dt);
      }
      if (msgT > 0) { msgT -= dt; if (msgT <= 0) msgEl.textContent = ''; }
    }
    function takePickup(it) {
      if (it === 'h') { if (player.hp >= 100) return false; player.hp = Math.min(100, player.hp + 25); say('Torta +25 de salud'); }
      else if (it === 'a') { if (ammo.pilas >= 200) return false; ammo.pilas = Math.min(200, ammo.pilas + 12); say('Pilas para el escáner +12'); }
      else if (it === 'b') { if (ammo.cafe >= 50) return false; ammo.cafe = Math.min(50, ammo.cafe + 6); say('Cargas de café +6'); }
      else if (it === 'S') { have.cafe = true; ammo.cafe = Math.min(50, ammo.cafe + 8); switchTo('cafe'); say('¡Lanza-café! Tecla 3'); }
      else if (it === 'T') { have.terminal = true; ammo.senal = Math.max(ammo.senal, 3); switchTo('terminal'); say('¡Terminal "No hay sistema"! Tecla 4: congela a los monitos'); }
      else if (it === 'K') { have.escudo = true; switchTo('escudo'); say('¡Escudo "Caja cerrada"! Tecla 5: aguanta los golpes'); }
      pickT = 0.25; sfx('recoge'); return true;
    }
    function updateEnemy(e, dt) {
      if (e.dead) return;
      e.moved = false;
      if (e.congeladoT > 0) { e.congeladoT -= dt; return; }
      e.cool -= dt; e.painT -= dt; e.atkT -= dt;
      const dx = player.x - e.x, dy = player.y - e.y, d = Math.hypot(dx, dy);
      if (!e.awake) { if (d < 13 && los(e, d)) wake(e); return; }
      if (e.painT > 0) return;
      const see = d < 16 && los(e, d);
      const ux = dx / d, uy = dy / d;
      const cfg = e.cfg, golpe = () => cfg.dano[0] + Math.random() * (cfg.dano[1] - cfg.dano[0]) | 0;
      if (cfg.ia === 'escupe') {
        if (d < 1.15 && e.cool <= 0) { hurtPlayer(golpe()); e.cool = 1.1; e.atkT = 0.3; sfx(cfg.sonido, e.x, e.y); return; }
        if (see && d > 2 && d < 12 && e.cool <= 0 && Math.random() < dt * 1.3) {
          const a = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.12;
          ents.push({ kind: 'proj', skin: cfg.proj, dano: golpe(), x: e.x + ux * 0.4, y: e.y + uy * 0.4, vx: Math.cos(a) * 6, vy: Math.sin(a) * 6, life: 4 });
          e.cool = 2.2; e.atkT = 0.45; sfx(cfg.proj, e.x, e.y); return;
        }
        if (e.atkT <= 0 && d > 0.95) { e.moved = move(e, ux * cfg.vel * dt, uy * cfg.vel * dt, 0.28, true); }
      } else if (cfg.ia === 'cuerpo') {
        // Persigue y muerde; el oso ademas embiste cuando te tiene cerca.
        const alcance = 0.9 + 0.3 * cfg.escala;
        if (d < alcance && e.cool <= 0) { hurtPlayer(golpe()); e.cool = 1.2; e.atkT = 0.3; sfx(cfg.sonido, e.x, e.y); return; }
        if (e.atkT <= 0 && d > alcance - 0.2) { const v = cfg.embiste && see && d < 4 ? cfg.embiste : cfg.vel; e.moved = move(e, ux * v * dt, uy * v * dt, 0.3, true); }
      } else {
        if (see && d < 15 && e.cool <= 0 && Math.random() < dt * 1.1) {
          e.cool = 1.5; e.atkT = 0.25; sfx('moneda', e.x, e.y);
          if (Math.random() < clamp(0.85 - d * 0.05, 0.25, 0.85)) hurtPlayer(golpe());
          return;
        }
        if (e.atkT > 0) return;
        e.strafeT -= dt; if (e.strafeT <= 0) { e.strafe = Math.random() < .5 ? -1 : 1; e.strafeT = 1 + Math.random() * 1.5; }
        if (d > 3.2 || !see) e.moved = move(e, ux * cfg.vel * dt, uy * cfg.vel * dt, 0.28, true);
        else e.moved = move(e, -uy * e.strafe * 1.2 * dt, ux * e.strafe * 1.2 * dt, 0.28, true);
      }
      if (e.moved) e.walkT += dt;
    }

    /* ---------- render ---------- */
    function render() {
      const a = player.a, dX = Math.cos(a), dY = Math.sin(a), pX = -dY * 0.66, pY = dX * 0.66, px = player.x, py = player.y;
      const boost = flashT > 0 ? 1.35 : 1;
      buf.fill(0xff000000);
      const h2 = H / 2, rx0 = dX - pX, ry0 = dY - pY, rx1 = dX + pX, ry1 = dY + pY;
      for (let y = h2 + 1; y < H; y++) {
        const rowD = h2 / (y - h2);
        const stX = rowD * (rx1 - rx0) / W, stY = rowD * (ry1 - ry0) / W;
        let fx = px + rowD * rx0, fy = py + rowD * ry0;
        const f = Math.min(1, fog(rowD) * boost), row = y * W, crow = (H - y) * W;
        for (let x = 0; x < W; x++) {
          const tx = ((fx - Math.floor(fx)) * TS) & 63, ty = ((fy - Math.floor(fy)) * TS) & 63, t = ty * TS + tx;
          fx += stX; fy += stY;
          buf[row + x] = shade(T_PISO[t], f);
          buf[crow + x] = shade(T_TECHO[t], f * 0.92);
        }
      }
      for (let x = 0; x < W; x++) {
        const camX = 2 * x / W - 1, rdx = dX + pX * camX, rdy = dY + pY * camX;
        let mx = px | 0, my = py | 0;
        const ddx = Math.abs(1 / rdx), ddy = Math.abs(1 / rdy);
        let sx, sy, sdx, sdy, side = 0, perp = 30, tex = T_PARED, wallX = 0, hit = false;
        if (rdx < 0) { sx = -1; sdx = (px - mx) * ddx; } else { sx = 1; sdx = (mx + 1 - px) * ddx; }
        if (rdy < 0) { sy = -1; sdy = (py - my) * ddy; } else { sy = 1; sdy = (my + 1 - py) * ddy; }
        for (let k = 0; k < 64; k++) {
          if (sdx < sdy) { sdx += ddx; mx += sx; side = 0; } else { sdy += ddy; my += sy; side = 1; }
          if (mx < 0 || my < 0 || mx >= MW || my >= MH) break;
          const c = grid[my * MW + mx];
          if (c < 0) continue;
          perp = side === 0 ? sdx - ddx : sdy - ddy;
          wallX = side === 0 ? py + perp * rdy : px + perp * rdx; wallX -= Math.floor(wallX);
          if (c === DOOR) { const o = doors.get(my * MW + mx).open; if (wallX < o) continue; wallX -= o; }
          else if ((side === 0 && rdx < 0) || (side === 1 && rdy > 0)) wallX = 1 - wallX;
          tex = WT[c]; hit = true; break;
        }
        zbuf[x] = perp;
        if (!hit) continue;
        const tx = (wallX * TS) & 63, lh = H / perp, top = h2 - lh / 2;
        const f = Math.min(1, fog(perp) * (side ? 0.8 : 1) * boost);
        const y0 = Math.max(0, top | 0), y1 = Math.min(H, (top + lh) | 0);
        const step = TS / lh; let tp = (y0 - top) * step;
        for (let y = y0; y < y1; y++) { buf[y * W + x] = shade(tex[((tp | 0) & 63) * TS + tx], f); tp += step; }
      }
      // sprites
      const invDet = 1 / (pX * dY - dX * pY), list = [];
      for (const e of ents) {
        const sx = e.x - px, sy = e.y - py;
        const tX = invDet * (dY * sx - dX * sy), tY = invDet * (-pY * sx + pX * sy);
        if (tY > 0.15) list.push([tY, tX, e]);
      }
      list.sort((p, q) => q[0] - p[0]);
      for (const [tY, tX, e] of list) {
        let tex, scale = 1, z = 0, bright = false;
        if (e.kind === 'enemy') {
          const fr = e.dead ? 'dead' : e.atkT > 0 ? 'atk' : e.painT > 0 ? 'pain' : (e.moved && (e.walkT * 5 | 0) % 2) ? 'walk' : 'idle';
          tex = SPR[e.type + '_' + fr]; if (fr === 'atk') bright = true;
          scale = e.cfg.escala; z = e.dead ? 0 : (e.cfg.z || 0);
        } else if (e.kind === 'pick') tex = SPR[e.item];
        else { tex = SPR['proj_' + e.skin]; scale = 0.32; z = 0.36; bright = true; }
        if (!tex) continue;
        const full = H / tY, sh = full * scale, scrX = W / 2 * (1 + tX / tY);
        const bottom = h2 + full / 2 - z * full, top = bottom - sh, left = scrX - sh / 2;
        const f = bright ? 1 : Math.min(1, fog(tY) * boost);
        const helado = e.kind === 'enemy' && e.congeladoT > 0;
        const x0 = Math.max(0, left | 0), x1 = Math.min(W, (left + sh) | 0);
        const y0 = Math.max(0, top | 0), y1 = Math.min(H, bottom | 0);
        for (let x = x0; x < x1; x++) {
          if (tY >= zbuf[x]) continue;
          const n = tex.n, m = n - 1, tx = ((x - left) * n / sh) & m;
          for (let y = y0; y < y1; y++) {
            const c = tex.px[(((y - top) * n / sh) & m) * n + tx];
            if ((c >>> 24) === 0) continue;
            buf[y * W + x] = helado ? azul(shade(c, f)) : shade(c, f);
          }
        }
      }
      ctx.putImageData(img, 0, 0);
      if (mapOn && state === 'play') drawMap();
      actx.clearRect(0, 0, AW, AH);
      if (state !== 'title') drawWeapon();
      if (hurtT > 0) { actx.fillStyle = `rgba(190,20,8,${Math.min(.55, hurtT * 1.3)})`; actx.fillRect(0, 0, AW, AH); }
      if (pickT > 0) { actx.fillStyle = `rgba(255,214,120,${pickT})`; actx.fillRect(0, 0, AW, AH); }
      if (state === 'dying' || state === 'dead') { actx.fillStyle = `rgba(110,0,0,${Math.min(.6, deathT)})`; actx.fillRect(0, 0, AW, AH); }
    }
    // Posicion del arma en la capa (esquina superior izquierda) con balanceo,
    // retroceso y cambio de arma.
    // ESC: tamano del arma en pantalla. BAJA: cuanto se hunde bajo el borde,
    // para que los brazos salgan de abajo y no se vean flotando.
    const ESC = 0.8, BAJA = 70, ALTO_ARMA = 360 * ESC;
    function poseArma(w) {
      const mv = moving ? 1 : 0, sw = swapT > 0 ? swapT * 480 : 0;
      const x = AW / 2 - w.hoja[1] * ESC / 2 + (w.corre || 0) + Math.cos(bobT) * 20 * mv;
      const y = AH - ALTO_ARMA + BAJA + Math.abs(Math.sin(bobT)) * 18 * mv + recoil * 18 + sw + (state === 'dying' || state === 'dead' ? 180 : 0);
      return [x, y];
    }
    function efectoDisparo(w) {
      const [x, y] = poseArma(w), bx = x + w.boca[0] * ESC, by = y + w.boca[1] * ESC;
      // Los chorros apuntan a la mira (centro de la pantalla).
      const haciaMira = Math.atan2(AH / 2 - 20 - by, AW / 2 - bx);
      const chorro = (n, color, vel, abre, vida, tam, g) => {
        for (let i = 0; i < n; i++) {
          const a = haciaMira + (Math.random() - 0.5) * abre, v = vel * (0.6 + Math.random() * 0.6);
          particulas.push({ x: bx, y: by, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g, vida: vida * (0.6 + Math.random() * 0.6), total: vida, color, tam: tam * (0.6 + Math.random() * 0.8) });
        }
      };
      if (cur === 'trapeador') chorro(18, '#5fe05a', 520, 2.2, 0.5, 9, 900);
      else if (cur === 'cafe') { chorro(34, '#5a3216', 1100, 0.35, 0.3, 14, 200); chorro(16, '#8a5a2b', 900, 0.5, 0.3, 9, 200); chorro(8, 'rgba(235,235,235,.8)', 160, 1.4, 0.8, 16, -60); }
      else if (cur === 'escudo') chorro(6, '#9aa0a6', 300, 1.6, 0.3, 6, 600);
    }
    function drawWeapon() {
      const w = WEAP[cur];
      const [x, y] = poseArma(w);
      const avance = wcool > 0 ? Math.sin(clamp(1 - wcool / w.rate, 0, 1) * Math.PI) : 0;
      // Onda de "No hay sistema": anillos azules y amarillos que se abren.
      if (cur === 'terminal' && flashT > 0) {
        const t = 1 - flashT / 0.7, cx = x + w.boca[0] * ESC, cy = y + w.boca[1] * ESC;
        actx.save();
        for (let k = 0; k < 5; k++) {
          const r = (t * 900 + k * 70) % 900;
          actx.strokeStyle = k % 2 ? `rgba(255,210,0,${0.7 * (1 - r / 900)})` : `rgba(60,160,255,${0.8 * (1 - r / 900)})`;
          actx.lineWidth = 10; actx.beginPath(); actx.arc(cx, cy, r, 0, Math.PI * 2); actx.stroke();
        }
        actx.restore();
      }
      for (const q of particulas) { actx.globalAlpha = clamp(q.vida / q.total, 0, 1); actx.fillStyle = q.color; actx.fillRect(q.x - q.tam / 2, q.y - q.tam / 2, q.tam, q.tam); }
      actx.globalAlpha = 1;
      if (!hojaArmas) return;
      actx.save();
      actx.imageSmoothingEnabled = false;
      if (cur === 'trapeador' && avance > 0) {
        // Golpe: el trapeador se inclina hacia adelante desde los brazos.
        actx.translate(x + w.hoja[1] * ESC / 2, y + ALTO_ARMA); actx.rotate(-avance * 0.45); actx.translate(-(x + w.hoja[1] * ESC / 2), -(y + ALTO_ARMA + avance * 40));
      } else if (cur === 'escudo' && avance > 0) {
        actx.translate(x + w.hoja[1] * ESC / 2, y + ALTO_ARMA); actx.scale(1 + avance * 0.12, 1 + avance * 0.12); actx.translate(-(x + w.hoja[1] * ESC / 2), -(y + ALTO_ARMA));
      }
      actx.drawImage(hojaArmas, w.hoja[0], 0, w.hoja[1], 360, Math.round(x), Math.round(y), Math.round(w.hoja[1] * ESC), ALTO_ARMA);
      actx.restore();
      // Laser del escaner, encima del arma: destello en la boca y rayo hasta
      // la mira, que esta en el centro de la vista (a la altura del horizonte).
      if (cur === 'escaner' && flashT > 0) {
        const bx = x + w.boca[0] * ESC, by = y + w.boca[1] * ESC, mx = AW / 2, my = AH / 2;
        const brillo = actx.createRadialGradient(bx, by, 2, bx, by, 60);
        brillo.addColorStop(0, 'rgba(255,240,240,1)'); brillo.addColorStop(.35, 'rgba(255,50,50,.85)'); brillo.addColorStop(1, 'rgba(255,0,0,0)');
        actx.fillStyle = brillo; actx.fillRect(bx - 60, by - 60, 120, 120);
        actx.save(); actx.lineCap = 'round';
        for (const [ancho, color] of [[18, 'rgba(255,40,40,.35)'], [8, 'rgba(255,60,60,.95)'], [3, '#ffe8e8']]) {
          actx.strokeStyle = color; actx.lineWidth = ancho; actx.beginPath(); actx.moveTo(bx, by); actx.lineTo(mx, my); actx.stroke();
        }
        actx.restore();
      }
    }
    function drawMap() {
      const s = 3, ox = W - MW * s - 4, oy = 4;
      ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(ox - 2, oy - 2, MW * s + 4, MH * s + 4);
      const col = ['#9aa0a6', '#7fb6d1', '#d91f2d', '#a8784a', '#ffd200', '#7dff8e', '#6b4a3a'];
      for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) { const c = grid[y * MW + x]; if (c >= 0) { ctx.fillStyle = col[c]; ctx.fillRect(ox + x * s, oy + y * s, s, s); } }
      ctx.fillStyle = '#fff'; ctx.fillRect(ox + player.x * s - 1, oy + player.y * s - 1, 3, 3);
      ctx.strokeStyle = '#ffd200'; ctx.beginPath(); ctx.moveTo(ox + player.x * s, oy + player.y * s);
      ctx.lineTo(ox + (player.x + Math.cos(player.a) * 2) * s, oy + (player.y + Math.sin(player.a) * 2) * s); ctx.stroke();
    }

    /* ---------- HUD ---------- */
    const hud = { hp: document.getElementById('hHp'), ammo: document.getElementById('hAmmo'), ammoL: document.getElementById('hAmmoL'), weap: document.getElementById('hWeap'), inv: document.getElementById('hInv'), kills: document.getElementById('hKills'), time: document.getElementById('hTime') };
    const last = {};
    function setT(k, v) { if (last[k] !== v) { last[k] = v; hud[k].textContent = v; } }
    function updateHud() {
      setT('hp', Math.max(0, player.hp | 0) + '%');
      hud.hp.classList.toggle('low', player.hp <= 25 && player.hp > 0);
      const w = WEAP[cur];
      setT('ammo', w.ammo ? String(ammo[w.ammo]) : '∞'); setT('ammoL', w.label); setT('weap', w.name);
      setT('inv', `${ammo.pilas} pilas · ${ammo.cafe} café · ${ammo.senal} señal`);
      setT('kills', `${kills}/${total}`); setT('time', fmtTime(elapsed));
    }

    // Las dos hojas se cargan antes de dejar entrar. Si alguna falla el juego
    // sigue: monitos como siluetas y, sin armas, solo los efectos de disparo.
    const bStart = document.getElementById('bStart'), textoEntrar = bStart.textContent;
    bStart.disabled = true; bStart.textContent = 'CARGANDO…';
    const cargar = ruta => new Promise(ok => {
      if (!ruta) { ok(null); return; }
      const im = new Image(); im.onload = () => ok(im); im.onerror = () => ok(null); im.src = ruta;
    });
    Promise.all([cargar(opciones.monitos), cargar(opciones.armas)]).then(([monitos, armas]) => {
      prepararMonitos(monitos); hojaArmas = armas;
      bStart.disabled = false; bStart.textContent = textoEntrar;
    });

    const record = leerRecord();
    if (record) document.getElementById('titleRecord').textContent = `Mejor tiempo en este navegador: ${fmtTime(record)}`;

    /* ---------- bucle ---------- */
    loadLevel();
    let prev = performance.now();
    function frame(now) {
      const dt = Math.min(0.05, (now - prev) / 1000); prev = now;
      if (state === 'play') update(dt);
      else if (state === 'title') { player.a += dt * 0.18; }
      else if (state === 'dying') { deathT += dt; hurtT = Math.max(0, hurtT - dt); for (const e of ents) if (e.kind === 'enemy') { e.atkT -= dt; e.painT -= dt; } if (deathT > 1.2) endScreen(false); }
      render(); updateHud();
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  window.OXXO_TURNO_NOCTURNO = { montar };
})();
