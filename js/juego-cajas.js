/* ==========================================================
   TORRE DE CAJAS — juego de apilado

   Aparece en dos lugares: en la caja de error cuando Google
   Sheets no responde (el momento en que no hay nada mas que
   hacer) y en dashboards/juego.html, para quien lo busque
   aposta.

   No lee datos de ningun lado: por eso funciona justo cuando
   nada mas funciona. El record vive en localStorage, es decir
   por navegador: no hay identidad por persona en este sitio,
   asi que no existe marcador compartido ni se finge uno.

   Se dibuja con formas sobre canvas, sin imagenes ni
   librerias.
   ========================================================== */
(function () {
  'use strict';

  const RECORD_KEY = 'oxxo-torre-cajas-record';
  const COLORES = {
    cielo: ['#2b1a16', '#53251f'],
    caja:  ['#E8A33D', '#D98324', '#C56A1E', '#E2B65C'],
    borde: 'rgba(60,24,18,.55)',
    texto: '#FFF6EC',
    acento: '#F5C451',
    malo:  '#E8584F',
  };

  function leerRecord() {
    try { return Number(localStorage.getItem(RECORD_KEY)) || 0; } catch (_) { return 0; }
  }
  function guardarRecord(valor) {
    try { localStorage.setItem(RECORD_KEY, String(valor)); } catch (_) { /* modo privado */ }
  }

  let estilosPuestos = false;
  function ponerEstilos() {
    if (estilosPuestos) return;
    estilosPuestos = true;
    const style = document.createElement('style');
    style.id = 'oxxo-juego-cajas-styles';
    style.textContent = `
      .oxxo-juego{display:flex;flex-direction:column;gap:10px;align-items:center;width:100%}
      .oxxo-juego__marco{position:relative;width:100%;max-width:420px;aspect-ratio:4/5;border-radius:18px;overflow:hidden;background:#2b1a16;box-shadow:0 14px 34px rgba(50,18,14,.28),inset 0 0 0 1px rgba(255,255,255,.08)}
      .oxxo-juego__canvas{display:block;width:100%;height:100%;touch-action:manipulation}
      .oxxo-juego__pie{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;max-width:420px;font-size:12px;font-weight:700;color:var(--mt-muted,#7d6a61)}
      .oxxo-juego__btn{border:0;border-radius:12px;padding:9px 16px;background:#D91F2D;color:#fff;font-family:inherit;font-size:13px;font-weight:800;cursor:pointer}
      .oxxo-juego__btn:focus-visible{outline:2px solid #211312;outline-offset:2px}
      .oxxo-juego__ayuda{margin:0;font-size:12px;font-weight:650;color:var(--mt-muted,#7d6a61);text-align:center;max-width:420px}
      @media (prefers-reduced-motion:reduce){.oxxo-juego__marco{box-shadow:none}}
    `;
    document.head.appendChild(style);
  }

  // ── Geometria del apilado (pura, sin canvas) ─────────────
  // Separada a proposito: es la unica regla del juego que puede estar mal de
  // forma silenciosa, y asi se prueba sin navegador.
  // Devuelve la caja que queda, los restos que caen, y si la torre aguanta.
  function resolverSoltar(base, movil, margen) {
    const izq = Math.max(movil.x, base.x);
    const der = Math.min(movil.x + movil.ancho, base.x + base.ancho);
    const empalme = der - izq;
    if (empalme <= 0) return { ok: false, perfecto: false, nueva: null, restos: [] };

    if (Math.abs(movil.x - base.x) <= margen) {
      return { ok: true, perfecto: true, nueva: { x: base.x, ancho: base.ancho }, restos: [] };
    }
    const restos = [];
    if (movil.x < izq) restos.push({ x: movil.x, ancho: izq - movil.x, giro: -0.08 });
    if (movil.x + movil.ancho > der) restos.push({ x: der, ancho: movil.x + movil.ancho - der, giro: 0.08 });
    return { ok: true, perfecto: false, nueva: { x: izq, ancho: empalme }, restos };
  }

  // ── Motor ────────────────────────────────────────────────
  function crearJuego(canvas, alMarcar) {
    const ctx = canvas.getContext('2d');
    let W = 0, H = 0, dpr = 1;

    const ANCHO_BASE = 0.46;   // proporcion del ancho del canvas
    const ALTO_CAJA  = 0.075;  // proporcion del alto
    const VEL_BASE   = 0.0075;
    // Margen de acierto. Sin el, cada caja angosta la torre y el juego es una
    // muerte lenta sin recompensa; con el, clavarla se siente y se premia.
    const PERFECTO   = 6;

    let torre, movil, puntos, record = leerRecord(), estado, camara, caidas, vel, perfectos, destello;

    function medir() {
      const r = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = Math.max(1, Math.round(r.width));
      H = Math.max(1, Math.round(r.height));
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function reiniciar() {
      const ancho = W * ANCHO_BASE;
      torre = [{ x: (W - ancho) / 2, ancho }];
      puntos = 0; camara = 0; caidas = []; vel = VEL_BASE; perfectos = 0; destello = 0;
      estado = 'jugando';
      nuevaMovil();
    }

    function nuevaMovil() {
      const base = torre[torre.length - 1];
      movil = {
        x: puntos % 2 === 0 ? 0 : W - base.ancho,
        ancho: base.ancho,
        dir: puntos % 2 === 0 ? 1 : -1,
      };
    }

    // Soltar: la parte que no empalma se desprende y la torre se angosta.
    function soltar() {
      if (estado === 'fin') { reiniciar(); return; }
      const base = torre[torre.length - 1];
      const r = resolverSoltar(base, movil, PERFECTO);

      if (!r.ok) {
        caidas.push({ x: movil.x, ancho: movil.ancho, y: 0, vy: 0, giro: 0,
          filaY: H - (H * ALTO_CAJA) * torre.length });
        estado = 'fin';
        if (puntos > record) { record = puntos; guardarRecord(record); }
        return;
      }

      // filaY fija la altura a la que nacio el resto. Sin ella se dibujaba
      // relativo a la altura de la torre y daba un salto cada vez que
      // aterrizaba una caja nueva.
      const filaY = H - (H * ALTO_CAJA) * torre.length;
      r.restos.forEach((resto) => caidas.push({ ...resto, y: 0, vy: 0, filaY }));
      torre.push(r.nueva);
      if (r.perfecto) { perfectos += 1; destello = 1; }
      puntos += 1;
      vel += 0.00035;                       // sube el ritmo, no el tamaño del salto
      if (puntos > record) { record = puntos; guardarRecord(record); }
      if (typeof alMarcar === 'function') alMarcar(puntos, record);
      nuevaMovil();
    }

    function actualizar(dt) {
      if (estado === 'jugando') {
        movil.x += movil.dir * vel * W * dt;
        if (movil.x <= 0) { movil.x = 0; movil.dir = 1; }
        if (movil.x + movil.ancho >= W) { movil.x = W - movil.ancho; movil.dir = -1; }
      }
      const alto = H * ALTO_CAJA;
      // La camara sigue a la torre para que la cima quede siempre a la vista.
      // Se arranca con la camara ya levantada para que la torre no nazca pegada
      // al borde inferior con el marco vacio encima.
      const objetivo = Math.max(-H * 0.18, (torre.length - 1) * alto - H * 0.45);
      camara += (objetivo - camara) * Math.min(1, dt * 0.12);
      if (destello > 0) destello = Math.max(0, destello - dt * 0.035);
      caidas.forEach((c) => { c.vy += 0.9 * dt; c.y += c.vy * dt; c.giro += 0.01 * dt; });
      caidas = caidas.filter((c) => c.y < H * 2);
    }

    function caja(x, y, ancho, alto, i) {
      const tono = COLORES.caja[i % COLORES.caja.length];
      ctx.fillStyle = tono;
      ctx.strokeStyle = COLORES.borde;
      ctx.lineWidth = 1;
      const r = Math.min(5, ancho / 6);
      ctx.beginPath();
      ctx.roundRect(x, y, ancho, alto, r);
      ctx.fill(); ctx.stroke();
      // cinta de la caja
      if (ancho > 26) {
        ctx.fillStyle = 'rgba(255,255,255,.17)';
        ctx.fillRect(x + ancho / 2 - ancho * 0.045, y, ancho * 0.09, alto);
      }
    }

    function pintar() {
      const alto = H * ALTO_CAJA;
      const cielo = ctx.createLinearGradient(0, 0, 0, H);
      cielo.addColorStop(0, COLORES.cielo[0]);
      cielo.addColorStop(1, COLORES.cielo[1]);
      ctx.fillStyle = cielo;
      ctx.fillRect(0, 0, W, H);

      ctx.save();
      ctx.translate(0, camara);
      torre.forEach((c, i) => caja(c.x, H - alto * (i + 1), c.ancho, alto, i));
      if (estado === 'jugando') {
        caja(movil.x, H - alto * (torre.length + 1), movil.ancho, alto, torre.length);
      }
      caidas.forEach((c) => {
        ctx.save();
        ctx.translate(c.x + c.ancho / 2, c.filaY + c.y);
        ctx.rotate(c.giro);
        ctx.globalAlpha = .85;
        caja(-c.ancho / 2, -alto / 2, c.ancho, alto, 1);
        ctx.restore();
      });
      ctx.restore();

      ctx.fillStyle = COLORES.texto;
      ctx.font = '700 15px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`Cajas: ${puntos}`, 14, 26);
      ctx.textAlign = 'right';
      ctx.fillStyle = COLORES.acento;
      ctx.fillText(`Récord: ${record}`, W - 14, 26);

      if (destello > 0 && estado === 'jugando') {
        ctx.save();
        ctx.globalAlpha = destello;
        ctx.textAlign = 'center';
        ctx.fillStyle = COLORES.acento;
        ctx.font = '800 20px system-ui, sans-serif';
        ctx.fillText('¡Perfecto!', W / 2, H * 0.22);
        ctx.restore();
      }

      if (estado === 'fin') {
        ctx.fillStyle = 'rgba(30,12,10,.72)';
        ctx.fillRect(0, 0, W, H);
        ctx.textAlign = 'center';
        ctx.fillStyle = COLORES.malo;
        ctx.font = '800 22px system-ui, sans-serif';
        ctx.fillText('Se cayó la torre', W / 2, H / 2 - 16);
        ctx.fillStyle = COLORES.texto;
        ctx.font = '700 15px system-ui, sans-serif';
        ctx.fillText(`${puntos} ${puntos === 1 ? 'caja' : 'cajas'}${perfectos ? ` · ${perfectos} perfecta${perfectos === 1 ? '' : 's'}` : ''}`, W / 2, H / 2 + 12);
        ctx.font = '650 13px system-ui, sans-serif';
        ctx.fillStyle = 'rgba(255,246,236,.75)';
        ctx.fillText('Toca o pulsa espacio para otra', W / 2, H / 2 + 38);
      }
    }

    let previo = 0, raf = 0, vivo = false;
    function paso(t) {
      if (!vivo) return;
      // dt en "frames de 60fps": el juego corre igual en pantallas de 120Hz.
      const dt = Math.min(3, (t - previo) / 16.67 || 1);
      previo = t;
      actualizar(dt);
      pintar();
      raf = requestAnimationFrame(paso);
    }

    function arrancar() { if (vivo) return; vivo = true; previo = performance.now(); raf = requestAnimationFrame(paso); }
    function parar() { vivo = false; cancelAnimationFrame(raf); }

    medir(); reiniciar(); pintar();
    return { arrancar, parar, soltar, medir, reiniciar, pintar, get record() { return record; } };
  }

  // ── Montaje ──────────────────────────────────────────────
  function montar(contenedor) {
    if (!contenedor || contenedor.dataset.juegoMontado === '1') return null;
    contenedor.dataset.juegoMontado = '1';
    ponerEstilos();

    contenedor.innerHTML = `
      <div class="oxxo-juego">
        <div class="oxxo-juego__marco">
          <canvas class="oxxo-juego__canvas" role="img"
            aria-label="Torre de cajas: suelta cada caja para apilarla sobre la anterior"></canvas>
        </div>
        <div class="oxxo-juego__pie">
          <span data-juego-estado>Récord: ${leerRecord()}</span>
          <button type="button" class="oxxo-juego__btn" data-juego-soltar>Soltar caja</button>
        </div>
        <p class="oxxo-juego__ayuda">Toca la pantalla, pulsa <strong>espacio</strong> o usa el botón. Lo que no empalme se cae y la torre se angosta.</p>
      </div>`;

    const canvas = contenedor.querySelector('.oxxo-juego__canvas');
    const etiqueta = contenedor.querySelector('[data-juego-estado]');
    const boton = contenedor.querySelector('[data-juego-soltar]');

    const juego = crearJuego(canvas, (puntos, record) => {
      etiqueta.textContent = `Cajas: ${puntos} · Récord: ${record}`;
    });

    // pointerdown y no click: responde al instante, que en un juego de
    // tiempo es la diferencia entre sentirse preciso y sentirse pegajoso.
    canvas.addEventListener('pointerdown', (e) => { e.preventDefault(); juego.soltar(); });
    boton.addEventListener('click', () => { juego.soltar(); canvas.focus?.(); });

    function teclado(e) {
      if (e.code !== 'Space' && e.key !== ' ' && e.code !== 'ArrowDown') return;
      // Sin esto la barra espaciadora desplaza la pagina bajo el juego.
      if (contenedor.isConnected && estaALaVista(contenedor)) { e.preventDefault(); juego.soltar(); }
    }
    document.addEventListener('keydown', teclado);

    function estaALaVista(el) {
      const r = el.getBoundingClientRect();
      return r.bottom > 0 && r.top < innerHeight;
    }

    // Solo corre mientras se ve: no gasta bateria en una pestaña olvidada.
    const observador = new IntersectionObserver((entradas) => {
      entradas.forEach((x) => (x.isIntersecting ? juego.arrancar() : juego.parar()));
    }, { threshold: .15 });
    observador.observe(contenedor);

    const alRedimensionar = () => { juego.medir(); juego.pintar(); };
    window.addEventListener('resize', alRedimensionar);
    document.addEventListener('visibilitychange', () => (document.hidden ? juego.parar() : juego.arrancar()));

    return {
      destruir() {
        juego.parar();
        observador.disconnect();
        document.removeEventListener('keydown', teclado);
        window.removeEventListener('resize', alRedimensionar);
        contenedor.dataset.juegoMontado = '';
        contenedor.innerHTML = '';
      },
    };
  }

  window.OXXO_JUEGO = { montar, leerRecord, resolverSoltar };
})();
