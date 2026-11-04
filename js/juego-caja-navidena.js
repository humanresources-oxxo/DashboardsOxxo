/* ==========================================================
   CAJA NAVIDENA — juego de atencion en caja

   Es Nochebuena y la fila no para. Cada cliente pide de 1 a 3
   productos; se despacha tocando los productos en el orden que
   quieras para el cliente de hasta adelante. Si se le acaba la
   paciencia se va molesto: al tercer cliente molesto termina el
   turno. Mientras mas rapido se atiende, mayor la propina.

   Consumido por dashboards/caja-navidena.html (OXXO_CAJA.montar).
   No lee ni envia datos: el record vive en localStorage, por
   navegador, igual que Torre de Cajas.

   La regla del juego (crearPartida/avanzar/servir) es pura y no
   toca el DOM, para probarla sin navegador; la vista solo la pinta.
   ========================================================== */
(function () {
  'use strict';

  const RECORD_KEY = 'oxxo-caja-navidena-record';

  const PRODUCTOS = [
    { id: 'cafe', nombre: 'Café', tecla: '1' },
    { id: 'ponche', nombre: 'Ponche', tecla: '2' },
    { id: 'tamal', nombre: 'Tamal', tecla: '3' },
    { id: 'pan', nombre: 'Pan dulce', tecla: '4' },
    { id: 'regalo', nombre: 'Regalo', tecla: '5' },
    { id: 'recarga', nombre: 'Recarga', tecla: '6' },
  ];
  const IDS = PRODUCTOS.map(p => p.id);

  const VIDAS = 3;
  const FILA_MAX = 4;
  const CLIENTES_POR_TURNO = 6;

  // Generador con semilla: la misma partida se repite igual en las pruebas.
  function aleatorio(semilla) {
    let s = (semilla >>> 0) || 1;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Dificultad por turno: llegan mas seguido, aguantan menos y piden mas.
  function ritmo(turno) {
    return {
      llegada: Math.max(1.6, 4.2 - (turno - 1) * 0.35),
      paciencia: Math.max(9, 20 - (turno - 1) * 1.4),
      maxPiezas: Math.min(3, 1 + Math.floor((turno + 1) / 2)),
    };
  }

  function nuevoCliente(p) {
    const r = ritmo(p.turno);
    const piezas = 1 + Math.floor(p.rnd() * r.maxPiezas);
    const pedido = [];
    for (let i = 0; i < piezas; i++) pedido.push(IDS[Math.floor(p.rnd() * IDS.length)]);
    p.siguienteId += 1;
    return {
      id: p.siguienteId,
      pedido,
      servido: pedido.map(() => false),
      paciencia: r.paciencia,
      pacienciaMax: r.paciencia,
      cara: Math.floor(p.rnd() * 6),
    };
  }

  function crearPartida(semilla) {
    const p = {
      rnd: aleatorio(semilla == null ? Date.now() : semilla),
      fila: [], puntos: 0, atendidos: 0, molestos: 0, turno: 1,
      reloj: 0, proxima: 0.6, siguienteId: 0, terminada: false, eventos: [],
    };
    p.fila.push(nuevoCliente(p));
    return p;
  }

  // Avanza el tiempo dt (segundos). Devuelve la misma partida.
  function avanzar(p, dt) {
    if (p.terminada) return p;
    p.reloj += dt;
    p.proxima -= dt;
    if (p.proxima <= 0 && p.fila.length < FILA_MAX) {
      p.fila.push(nuevoCliente(p));
      p.proxima = ritmo(p.turno).llegada * (0.75 + p.rnd() * 0.5);
    } else if (p.proxima <= 0) {
      p.proxima = 0.5;
    }
    // Solo se impacienta de verdad el de adelante; los de atras, a la mitad.
    p.fila.forEach((c, i) => { c.paciencia -= dt * (i === 0 ? 1 : 0.5); });
    const seVan = p.fila.filter(c => c.paciencia <= 0);
    if (seVan.length) {
      p.fila = p.fila.filter(c => c.paciencia > 0);
      p.molestos += seVan.length;
      seVan.forEach(c => p.eventos.push({ tipo: 'molesto', id: c.id }));
      if (p.molestos >= VIDAS) p.terminada = true;
    }
    if (!p.fila.length && !p.terminada) p.proxima = Math.min(p.proxima, 0.4);
    return p;
  }

  // Sirve un producto al cliente de adelante.
  // Devuelve 'ok' | 'cobrado' | 'error' | 'vacio'.
  function servir(p, producto) {
    if (p.terminada) return 'vacio';
    const c = p.fila[0];
    if (!c) return 'vacio';
    const i = c.pedido.findIndex((x, k) => x === producto && !c.servido[k]);
    if (i < 0) {
      // Producto equivocado: el cliente pierde paciencia, no se cobra nada.
      c.paciencia = Math.max(0.01, c.paciencia - 2.5);
      p.eventos.push({ tipo: 'error', id: c.id });
      return 'error';
    }
    c.servido[i] = true;
    if (!c.servido.every(Boolean)) return 'ok';
    const propina = Math.round(5 * c.paciencia / c.pacienciaMax) * 2;
    const ganado = 10 * c.pedido.length + propina;
    p.puntos += ganado;
    p.atendidos += 1;
    p.fila.shift();
    p.eventos.push({ tipo: 'cobrado', id: c.id, ganado, propina });
    if (p.atendidos % CLIENTES_POR_TURNO === 0) {
      p.turno += 1;
      p.eventos.push({ tipo: 'turno', turno: p.turno });
    }
    return 'cobrado';
  }

  function leerRecord() {
    try { return Number(localStorage.getItem(RECORD_KEY)) || 0; } catch (_) { return 0; }
  }
  function guardarRecord(valor) {
    try { localStorage.setItem(RECORD_KEY, String(valor)); } catch (_) { /* modo privado */ }
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { crearPartida, avanzar, servir, ritmo, PRODUCTOS, VIDAS, CLIENTES_POR_TURNO };
    return;
  }

  // ── Dibujos (SVG en linea, sin imagenes) ─────────────────
  const ICONOS = {
    cafe: '<path d="M14 26h24v14a8 8 0 0 1-8 8h-8a8 8 0 0 1-8-8z" fill="#fff" stroke="#6b3b23" stroke-width="2.4"/><path d="M38 30h3a5 5 0 0 1 0 10h-3" fill="none" stroke="#6b3b23" stroke-width="2.4"/><rect x="14" y="26" width="24" height="5" fill="#d6202a"/><path d="M21 13c-2 3 2 5 0 8M27 12c-2 3 2 5 0 8M33 13c-2 3 2 5 0 8" fill="none" stroke="#b9a79c" stroke-width="2" stroke-linecap="round"/>',
    ponche: '<path d="M12 22h30l-3 22a6 6 0 0 1-6 5H21a6 6 0 0 1-6-5z" fill="#c8572e" stroke="#7a2e14" stroke-width="2.4"/><path d="M42 26h3a5 5 0 0 1 0 10h-4" fill="none" stroke="#7a2e14" stroke-width="2.4"/><circle cx="22" cy="22" r="4.5" fill="#f2a325"/><circle cx="31" cy="21" r="4" fill="#e4572e"/><rect x="25" y="10" width="3" height="13" rx="1.5" fill="#9b6a3a" transform="rotate(18 26 16)"/>',
    tamal: '<path d="M10 38c4-14 14-24 30-26-2 16-12 26-26 30z" fill="#9bbf5b" stroke="#4f7a2b" stroke-width="2.4"/><path d="M17 37c4-9 10-15 19-18-3 9-9 15-18 18z" fill="#f3d27a"/><path d="M14 40l6-6" stroke="#4f7a2b" stroke-width="2.4" stroke-linecap="round"/>',
    pan: '<path d="M8 36c0-11 8-18 18-18s18 7 18 18z" fill="#f0b66b" stroke="#a86a2c" stroke-width="2.4"/><path d="M11 33c3-8 9-12 15-12s12 4 15 12" fill="#f7efe3"/><path d="M26 21v12M18 24l4 9M34 24l-4 9" stroke="#d9a35e" stroke-width="2"/><rect x="7" y="35" width="38" height="5" rx="2.5" fill="#d98b3f"/>',
    regalo: '<rect x="10" y="22" width="32" height="24" rx="3" fill="#d6202a" stroke="#8c1016" stroke-width="2.4"/><rect x="8" y="17" width="36" height="8" rx="2" fill="#e8343d" stroke="#8c1016" stroke-width="2.4"/><rect x="23" y="17" width="6" height="29" fill="#f2c230"/><path d="M26 17c-4-8-12-6-9-1 2 2 6 2 9 1zM26 17c4-8 12-6 9-1-2 2-6 2-9 1z" fill="#f2c230" stroke="#b28512" stroke-width="1.6"/>',
    recarga: '<rect x="15" y="8" width="22" height="38" rx="4" fill="#2b3a55" stroke="#141c2b" stroke-width="2.4"/><rect x="18" y="13" width="16" height="25" rx="1.5" fill="#7fc4f2"/><path d="M27 17l-5 9h4l-2 8 6-10h-4z" fill="#f2c230"/><circle cx="26" cy="42" r="1.8" fill="#9fb0c9"/>',
  };
  function icono(id, clase) {
    return `<svg class="${clase || ''}" viewBox="0 0 52 52" aria-hidden="true">${ICONOS[id]}</svg>`;
  }

  const PIELES = ['#f1c7a1', '#d9a074', '#b97a50', '#8d5a3b', '#f5d3b5', '#c68a5e'];
  const ROPA = ['#1f9d55', '#2f7fd8', '#7b4fb4', '#d6202a', '#e08a1e', '#26807a'];
  function cara(n, humor) {
    const piel = PIELES[n % PIELES.length], ropa = ROPA[(n * 5 + 1) % ROPA.length];
    const boca = humor > 0.55 ? 'M24 41q6 5 12 0' : humor > 0.25 ? 'M24 42h12' : 'M24 44q6-5 12 0';
    const cejas = humor > 0.25 ? '' : '<path d="M20 30l6 2M40 30l-6 2" stroke="#3a241a" stroke-width="2" stroke-linecap="round"/>';
    return `<svg viewBox="0 0 60 70" aria-hidden="true"><path d="M8 70c0-14 10-20 22-20s22 6 22 20z" fill="${ropa}"/><path d="M18 52h24" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-dasharray="4 4"/><circle cx="30" cy="34" r="15" fill="${piel}"/><path d="M14 25c2-11 30-14 32 0z" fill="#d6202a"/><rect x="12" y="23" width="36" height="6" rx="3" fill="#fff"/><circle cx="47" cy="14" r="4" fill="#fff"/><path d="M44 14c0-5-6-9-12-9" fill="none" stroke="#d6202a" stroke-width="6" stroke-linecap="round"/><circle cx="24" cy="35" r="2" fill="#3a241a"/><circle cx="36" cy="35" r="2" fill="#3a241a"/>${cejas}<path d="${boca}" fill="none" stroke="#3a241a" stroke-width="2.2" stroke-linecap="round"/></svg>`;
  }

  let estilosPuestos = false;
  function ponerEstilos() {
    if (estilosPuestos) return;
    estilosPuestos = true;
    const s = document.createElement('style');
    s.id = 'oxxo-caja-navidena-styles';
    s.textContent = `
.cn{display:flex;flex-direction:column;gap:12px;width:100%;max-width:640px;margin:0 auto;user-select:none;-webkit-user-select:none}
.cn__marcador{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.cn__dato{display:flex;flex-direction:column;align-items:center;padding:8px 6px;border-radius:12px;background:#fff7f0;border:1px solid rgba(130,54,38,.12)}
.cn__dato small{font-size:10.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#8a6a5e}
.cn__dato strong{font-size:20px;font-weight:800;color:#2b1a16;font-variant-numeric:tabular-nums}
.cn__vidas{letter-spacing:2px}
.cn__tienda{position:relative;border-radius:18px;overflow:hidden;padding:14px 12px 0;min-height:260px;
  background:linear-gradient(180deg,#1b2a4a 0,#22365e 46%,#efe7dc 46%,#f6f1ea 100%);box-shadow:0 14px 34px rgba(30,20,40,.25)}
.cn__anaquel{position:absolute;left:0;right:0;top:46%;height:58px;pointer-events:none;
  background:repeating-linear-gradient(90deg,transparent 0 10px,#e3b04b 10px 22px,transparent 22px 30px,#d6202a 30px 40px,transparent 40px 48px,#3a8f5c 48px 60px,transparent 60px 74px),linear-gradient(#cfc4b6,#cfc4b6);
  background-size:100% 18px,100% 3px;background-position:0 12px,0 31px;background-repeat:repeat-x,no-repeat;opacity:.55}
.cn__mostrador{position:relative;height:26px;margin:0 -12px;background:linear-gradient(180deg,#d6202a 0 6px,#a5151d 6px 9px,#5c3a2e 9px);box-shadow:0 -2px 0 rgba(0,0,0,.08)}
.cn__mostrador::before{content:"";position:absolute;right:16px;top:-22px;width:46px;height:24px;border-radius:5px 5px 0 0;background:#2b3a55;box-shadow:inset 0 0 0 3px #3e5274}
.cn__mostrador::after{content:"";position:absolute;right:24px;top:-17px;width:30px;height:9px;border-radius:2px;background:#7fe0a3}
.cn__letrero{position:absolute;top:10px;left:12px;padding:3px 9px;border-radius:6px;background:#d6202a;color:#fff;font-size:11px;font-weight:900;letter-spacing:.08em}
.cn__nieve{position:absolute;inset:0;pointer-events:none;background-image:radial-gradient(#fff 1px,transparent 1.5px),radial-gradient(#fff 1px,transparent 1.5px);background-size:44px 44px,70px 70px;background-position:0 0,22px 30px;opacity:.35}
.cn__fila{position:relative;display:flex;flex-direction:row-reverse;gap:10px;align-items:flex-end;justify-content:flex-start;min-height:206px;padding:26px 70px 0 0}
.cn__cliente{position:relative;display:flex;flex-direction:column;align-items:center;gap:6px;width:23%;min-width:0;transition:transform .25s ease,opacity .25s ease}
.cn__cliente--frente{transform:scale(1.08);transform-origin:bottom center}
.cn__cliente:not(.cn__cliente--frente){opacity:.82}
.cn__globo{display:flex;gap:2px;flex-wrap:wrap;justify-content:center;padding:5px 6px;border-radius:12px;background:#fff;box-shadow:0 2px 6px rgba(0,0,0,.18);min-height:34px}
.cn__globo svg{width:26px;height:26px}
.cn__globo .is-listo{opacity:.25;filter:grayscale(1)}
.cn__cara{width:100%;max-width:74px}
.cn__cara svg{display:block;width:100%;height:auto}
.cn__barra{width:80%;height:6px;border-radius:3px;background:rgba(0,0,0,.18);overflow:hidden}
.cn__barra i{display:block;height:100%;border-radius:3px;background:#1f9d55;transition:width .1s linear,background .3s}
.cn__cliente--error{animation:cn-sacude .3s}
@keyframes cn-sacude{25%{translate:-5px 0}75%{translate:5px 0}}
.cn__aviso{position:absolute;left:50%;top:44%;translate:-50% -50%;padding:8px 14px;border-radius:12px;background:rgba(43,26,22,.86);color:#fff;font-size:14px;font-weight:800;white-space:nowrap;pointer-events:none;opacity:0;transition:opacity .2s}
.cn__aviso.is-on{opacity:1}
.cn__productos{display:grid;grid-template-columns:repeat(6,1fr);gap:8px}
.cn__prod{position:relative;display:flex;flex-direction:column;align-items:center;gap:2px;padding:8px 4px 7px;border-radius:14px;border:1px solid rgba(130,54,38,.16);background:#fff;font:inherit;font-size:11.5px;font-weight:800;color:#4a332a;cursor:pointer;touch-action:manipulation;transition:transform .08s}
.cn__prod svg{width:40px;height:40px}
.cn__prod:active{transform:scale(.94)}
.cn__prod:focus-visible{outline:2px solid #d6202a;outline-offset:2px}
.cn__prod kbd{position:absolute;top:4px;left:6px;font:700 10px/1 inherit;color:#b39a8f}
.cn__portada{position:absolute;inset:0;z-index:2;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:16px;text-align:center;background:rgba(20,30,56,.82);color:#fff}
.cn__portada h2{margin:0;font-size:24px;font-weight:900}
.cn__portada p{margin:0;max-width:380px;font-size:13.5px;line-height:1.45;color:#e5e9f2}
.cn__btn{border:0;border-radius:12px;padding:11px 20px;background:#d6202a;color:#fff;font:inherit;font-size:14px;font-weight:800;cursor:pointer}
.cn__btn:focus-visible{outline:2px solid #fff;outline-offset:2px}
@media (max-width:560px){.cn__productos{grid-template-columns:repeat(3,1fr)}.cn__prod svg{width:34px;height:34px}.cn__dato strong{font-size:17px}.cn__globo svg{width:20px;height:20px}}
@media (prefers-reduced-motion:reduce){.cn__cliente,.cn__barra i{transition:none}.cn__cliente--error{animation:none}}
`;
    document.head.appendChild(s);
  }

  // ── Vista ────────────────────────────────────────────────
  function montar(contenedor) {
    if (!contenedor || contenedor.dataset.juegoMontado) return null;
    contenedor.dataset.juegoMontado = '1';
    ponerEstilos();
    contenedor.innerHTML = `
<div class="cn">
  <div class="cn__marcador">
    <div class="cn__dato"><small>Puntos</small><strong data-cn="puntos">0</strong></div>
    <div class="cn__dato"><small>Atendidos</small><strong data-cn="atendidos">0</strong></div>
    <div class="cn__dato"><small>Turno</small><strong data-cn="turno">1</strong></div>
    <div class="cn__dato"><small>Corazones</small><strong class="cn__vidas" data-cn="vidas" aria-label="3 de 3 corazones" style="color:#d6202a">♥♥♥</strong></div>
  </div>
  <div class="cn__tienda">
    <div class="cn__nieve"></div>
    <div class="cn__anaquel"></div>
    <span class="cn__letrero">CAJA 1</span>
    <div class="cn__fila" data-cn="fila" aria-live="polite"></div>
    <div class="cn__mostrador"></div>
    <div class="cn__aviso" data-cn="aviso"></div>
    <div class="cn__portada" data-cn="portada">
      <h2>Caja Navideña</h2>
      <p>Es Nochebuena y la fila no para. Toca los productos que pide el cliente de adelante. Si te equivocas pierde paciencia; si se va molesto pierdes un corazón. Con 3 clientes molestos termina el turno.</p>
      <p data-cn="record"></p>
      <button class="cn__btn" type="button" data-cn="iniciar">Abrir caja</button>
    </div>
  </div>
  <div class="cn__productos" data-cn="productos">
    ${PRODUCTOS.map(p => `<button class="cn__prod" type="button" data-prod="${p.id}" aria-label="${p.nombre}"><kbd>${p.tecla}</kbd>${icono(p.id)}<span>${p.nombre}</span></button>`).join('')}
  </div>
</div>`;

    const $ = k => contenedor.querySelector(`[data-cn="${k}"]`);
    const filaEl = $('fila'), avisoEl = $('aviso'), portadaEl = $('portada');
    let partida = null, ultimo = 0, rafId = 0, avisoT = 0, record = leerRecord();
    const nodos = new Map();

    function textoRecord() {
      $('record').textContent = record ? `Tu récord: ${record} puntos` : 'Aún no tienes récord en este navegador.';
    }
    textoRecord();

    function aviso(texto) {
      avisoEl.textContent = texto;
      avisoEl.classList.add('is-on');
      clearTimeout(avisoT);
      avisoT = setTimeout(() => avisoEl.classList.remove('is-on'), 900);
    }

    function pintarMarcador() {
      $('puntos').textContent = partida.puntos;
      $('atendidos').textContent = partida.atendidos;
      $('turno').textContent = partida.turno;
      const vivas = Math.max(0, 3 - partida.molestos);
      $('vidas').textContent = '♥'.repeat(vivas) + '♡'.repeat(3 - vivas);
      $('vidas').setAttribute('aria-label', `${vivas} de 3 corazones`);
    }

    function pintarFila() {
      const vivos = new Set(partida.fila.map(c => c.id));
      nodos.forEach((el, id) => { if (!vivos.has(id)) { el.remove(); nodos.delete(id); } });
      partida.fila.forEach((c, i) => {
        let el = nodos.get(c.id);
        if (!el) {
          el = document.createElement('div');
          el.className = 'cn__cliente';
          el.innerHTML = '<div class="cn__globo"></div><div class="cn__cara"></div><div class="cn__barra"><i></i></div>';
          nodos.set(c.id, el);
          el.dataset.humor = '';
        }
        if (filaEl.children[i] !== el) filaEl.insertBefore(el, filaEl.children[i] || null);
        el.classList.toggle('cn__cliente--frente', i === 0);
        const humor = c.paciencia / c.pacienciaMax;
        const nivel = humor > 0.55 ? 'a' : humor > 0.25 ? 'b' : 'c';
        if (el.dataset.humor !== nivel) {
          el.dataset.humor = nivel;
          el.querySelector('.cn__cara').innerHTML = cara(c.cara, humor);
        }
        const globo = el.querySelector('.cn__globo');
        const firma = c.servido.map(Number).join('');
        if (globo.dataset.firma !== firma) {
          globo.dataset.firma = firma;
          globo.innerHTML = c.pedido.map((p, k) => icono(p, c.servido[k] ? 'is-listo' : '')).join('');
        }
        const barra = el.querySelector('.cn__barra i');
        barra.style.width = `${Math.max(0, humor * 100)}%`;
        barra.style.background = humor > 0.55 ? '#1f9d55' : humor > 0.25 ? '#f2b632' : '#d6202a';
      });
    }

    function procesarEventos() {
      partida.eventos.splice(0).forEach((e) => {
        if (e.tipo === 'cobrado') aviso(e.propina ? `+${e.ganado} · propina ${e.propina}` : `+${e.ganado}`);
        else if (e.tipo === 'molesto') aviso('Un cliente se fue molesto');
        else if (e.tipo === 'turno') aviso(`¡Turno ${e.turno}! Llega más gente`);
        else if (e.tipo === 'error') {
          const el = nodos.get(e.id);
          if (el) { el.classList.remove('cn__cliente--error'); void el.offsetWidth; el.classList.add('cn__cliente--error'); }
        }
      });
    }

    function cuadro(t) {
      const dt = Math.min(0.1, (t - ultimo) / 1000 || 0);
      ultimo = t;
      avanzar(partida, dt);
      procesarEventos();
      pintarFila();
      pintarMarcador();
      if (partida.terminada) return terminar();
      rafId = requestAnimationFrame(cuadro);
    }

    function iniciar() {
      partida = crearPartida();
      nodos.forEach(el => el.remove());
      nodos.clear();
      portadaEl.hidden = true;
      portadaEl.style.display = 'none';
      ultimo = performance.now();
      pintarMarcador();
      pintarFila();
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(cuadro);
    }

    function terminar() {
      cancelAnimationFrame(rafId);
      rafId = 0;
      const nuevo = partida.puntos > record;
      if (nuevo) { record = partida.puntos; guardarRecord(record); }
      portadaEl.style.display = '';
      portadaEl.hidden = false;
      portadaEl.querySelector('h2').textContent = nuevo ? '¡Nuevo récord!' : 'Se acabó el turno';
      portadaEl.querySelector('p').textContent = `Atendiste a ${partida.atendidos} clientes y llegaste al turno ${partida.turno}: ${partida.puntos} puntos.`;
      textoRecord();
      $('iniciar').textContent = 'Jugar otra vez';
      $('iniciar').focus();
    }

    function tocar(id) {
      if (!partida || partida.terminada || !rafId) return;
      const r = servir(partida, id);
      if (r !== 'vacio') { procesarEventos(); pintarFila(); pintarMarcador(); }
    }

    $('iniciar').addEventListener('click', iniciar);
    // pointerdown y no click: responde al instante, como en Torre de Cajas.
    $('productos').addEventListener('pointerdown', (e) => {
      const b = e.target.closest('[data-prod]');
      if (!b) return;
      e.preventDefault();
      tocar(b.dataset.prod);
    });
    // El teclado (Enter/Espacio sobre un boton) llega como click sin puntero.
    $('productos').addEventListener('click', (e) => {
      const b = e.target.closest('[data-prod]');
      if (b && e.detail === 0) tocar(b.dataset.prod);
    });
    document.addEventListener('keydown', (e) => {
      const p = PRODUCTOS.find(x => x.tecla === e.key);
      if (p && rafId) { e.preventDefault(); tocar(p.id); }
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && rafId) { cancelAnimationFrame(rafId); rafId = 0; }
      else if (!document.hidden && partida && !partida.terminada && !rafId) {
        ultimo = performance.now();
        rafId = requestAnimationFrame(cuadro);
      }
    });
    return { iniciar };
  }

  window.OXXO_CAJA = { montar, leerRecord };
})();
