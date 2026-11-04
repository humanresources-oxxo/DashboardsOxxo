/* ==========================================================
   DECORACION DE TEMPORADA (NAVIDAD)

   Un solo archivo para encender y apagar la decoracion navidena:
   - Portada (<script ... data-modo="portada">): nieve detras del
     contenido, guirnalda de foquitos bajo el banner, cuenta regresiva
     y gorrito/copo en las tarjetas.
   - Dashboards: guirnalda arriba de la pagina y un copo junto al
     titulo. No toca graficas, tablas ni colores de datos.

   Se enciende sola del 1 de noviembre al 6 de enero (VENTANA) y se
   apaga sola el 7 de enero: no hay que acordarse de quitarla. Para el
   ano siguiente basta con dejar este archivo; si se quiere retirar del
   todo, se borra el <script> de las paginas.

   Respeta "reducir movimiento" del sistema (sin nieve ni parpadeo) y
   el modo de ahorro de datos (sin nieve).
   ========================================================== */
(function () {
  'use strict';

  // Mes 0-11. Del 1 de noviembre al 6 de enero, inclusive.
  const VENTANA = { inicio: { mes: 10, dia: 1 }, fin: { mes: 0, dia: 6 } };

  function enTemporada(hoy) {
    const m = hoy.getMonth(), d = hoy.getDate();
    if (m === VENTANA.inicio.mes) return d >= VENTANA.inicio.dia;
    if (m === 11) return true;
    if (m === VENTANA.fin.mes) return d <= VENTANA.fin.dia;
    return false;
  }

  // Texto de la cuenta regresiva para un dia dado (fechas locales).
  function textoCuenta(hoy) {
    const dia = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    const anio = dia.getFullYear();
    const dias = (a, b) => Math.round((b - a) / 864e5);
    if (dia.getMonth() === 0) return `¡Feliz Año Nuevo ${anio}!`;
    const navidad = new Date(anio, 11, 25);
    const faltanNavidad = dias(dia, navidad);
    if (faltanNavidad > 1) return `Faltan ${faltanNavidad} días para Navidad`;
    if (faltanNavidad === 1) return '¡Mañana es Navidad!';
    if (faltanNavidad === 0) return '¡Feliz Navidad!';
    const faltanAnio = dias(dia, new Date(anio + 1, 0, 1));
    return faltanAnio === 1 ? '¡Mañana es Año Nuevo!' : `Faltan ${faltanAnio} días para Año Nuevo`;
  }

  // Para pruebas (node): expone la logica sin tocar el DOM.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { enTemporada, textoCuenta };
    return;
  }
  if (!enTemporada(new Date())) return;

  const script = document.currentScript;
  const portada = script && script.dataset.modo === 'portada';
  const sinMovimiento = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ahorroDatos = Boolean(navigator.connection && navigator.connection.saveData);

  const COLORES = ['#e3262f', '#1f9d55', '#f2b632', '#2f7fd8'];

  const css = `
.temporada-guirnalda{display:block;width:100%;height:30px;pointer-events:none;overflow:visible}
.temporada-guirnalda path{fill:none;stroke:#3b5a3a;stroke-width:1.6;opacity:.75}
.temporada-guirnalda .foco{transform-box:fill-box;transform-origin:center}
.temporada-guirnalda--anima .foco{animation:temporada-brillo 2.4s ease-in-out infinite}
@keyframes temporada-brillo{0%,100%{opacity:1}50%{opacity:.35}}
.temporada-portada{width:var(--shell,min(1170px,calc(100% - 32px)));margin:2px auto 0;position:relative;z-index:1}
.temporada-cuenta{display:flex;justify-content:center;margin:2px 0 4px}
.temporada-cuenta span{display:inline-flex;align-items:center;gap:8px;padding:6px 14px;border-radius:999px;
  background:rgba(255,255,255,.82);border:1px solid rgba(31,157,85,.25);box-shadow:0 1px 2px rgba(112,45,28,.06);
  color:#1d6b3d;font-size:13px;font-weight:700;letter-spacing:.01em}
.temporada-cuenta svg{width:16px;height:16px;flex-shrink:0}
.temporada-nieve{position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:0}
body.temporada-home .card__icon{position:relative;overflow:visible}
body.temporada-home .card__icon::after{content:"";position:absolute;top:-11px;right:-7px;width:22px;height:18px;pointer-events:none;
  background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 22 18'%3E%3Cpath d='M3 14 C5 6 10 2 17 4 L19 11 Z' fill='%23d6202a'/%3E%3Crect x='1' y='12' width='17' height='5' rx='2.5' fill='%23fff' stroke='%23e6e1dc' stroke-width='.6'/%3E%3Ccircle cx='18.5' cy='4' r='2.6' fill='%23fff' stroke='%23e6e1dc' stroke-width='.6'/%3E%3C/svg%3E") center/contain no-repeat;
  transform:rotate(14deg)}
body.temporada-home .card__bar{background-image:linear-gradient(90deg,#d6202a 0 33%,#fff 33% 36%,#1f9d55 36% 66%,#fff 66% 69%,#d6202a 69%),linear-gradient(180deg,rgba(250,248,246,.92),rgba(241,238,235,.86));
  background-size:100% 3px,100% 100%;background-repeat:no-repeat}
body.temporada-home .card__bar .chip::before{content:"❄";margin-right:5px;color:#2f7fd8;font-weight:400}
.temporada-tira{position:relative;z-index:30;height:26px;margin-bottom:-4px;pointer-events:none}
.temporada-copo{display:inline-block;width:.72em;height:.72em;margin-left:.32em;vertical-align:.06em;color:#2f7fd8;opacity:.9}
@media (max-width:700px){.temporada-guirnalda{height:22px}.temporada-cuenta span{font-size:12px}}
`;

  function estilo() {
    const s = document.createElement('style');
    s.id = 'temporada-estilos';
    s.textContent = css;
    document.head.appendChild(s);
  }

  // Cable ondulado con foquitos. Se dibuja en un viewBox fijo y se estira
  // al ancho del contenedor (preserveAspectRatio="none" solo para el cable;
  // los focos se reposicionan por porcentaje para no deformarse).
  function guirnalda(focos) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'temporada-guirnalda' + (sinMovimiento ? '' : ' temporada-guirnalda--anima'));
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const cable = document.createElementNS(ns, 'svg');
    cable.setAttribute('viewBox', '0 0 1000 30');
    cable.setAttribute('preserveAspectRatio', 'none');
    cable.setAttribute('width', '100%');
    cable.setAttribute('height', '100%');
    const path = document.createElementNS(ns, 'path');
    let d = 'M0 6';
    for (let i = 0; i < focos; i++) {
      const x0 = (i * 1000) / focos, x1 = ((i + 1) * 1000) / focos;
      d += ` Q${(x0 + x1) / 2} 20 ${x1} 6`;
    }
    path.setAttribute('d', d);
    path.setAttribute('vector-effect', 'non-scaling-stroke');
    cable.appendChild(path);
    svg.appendChild(cable);
    for (let i = 0; i < focos; i++) {
      const x = ((i + 0.5) * 100) / focos;
      const foco = document.createElementNS(ns, 'g');
      foco.setAttribute('class', 'foco');
      foco.style.animationDelay = `${(i % 4) * 0.6}s`;
      const bombilla = document.createElementNS(ns, 'ellipse');
      bombilla.setAttribute('cx', `${x}%`);
      bombilla.setAttribute('cy', '20');
      bombilla.setAttribute('rx', '4.5');
      bombilla.setAttribute('ry', '6');
      bombilla.setAttribute('fill', COLORES[i % COLORES.length]);
      const brillo = document.createElementNS(ns, 'ellipse');
      brillo.setAttribute('cx', `${x}%`);
      brillo.setAttribute('cy', '18');
      brillo.setAttribute('rx', '1.5');
      brillo.setAttribute('ry', '2.2');
      brillo.setAttribute('fill', 'rgba(255,255,255,.7)');
      foco.appendChild(bombilla);
      foco.appendChild(brillo);
      svg.appendChild(foco);
    }
    return svg;
  }

  function focosPara(ancho) {
    return Math.max(10, Math.min(36, Math.round(ancho / 48)));
  }

  function cuentaRegresiva() {
    const caja = document.createElement('div');
    caja.className = 'temporada-cuenta';
    const pill = document.createElement('span');
    pill.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l4 6h-2.5l4 5.5h-2.8L19 19H5l4.3-5.5H6.5l4-5.5H8z" fill="#1f9d55"/><rect x="10.8" y="19" width="2.4" height="3" fill="#8a5a2b"/><circle cx="12" cy="2.6" r="1.6" fill="#f2b632"/></svg>';
    pill.appendChild(document.createTextNode(textoCuenta(new Date())));
    caja.appendChild(pill);
    return caja;
  }

  // Nieve en un canvas fijo detras del contenido: los hijos directos del
  // body se suben a z-index 1 (sin mover los que ya tienen posicion propia).
  function nieve() {
    const canvas = document.createElement('canvas');
    canvas.className = 'temporada-nieve';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.insertBefore(canvas, document.body.firstChild);
    Array.from(document.body.children).forEach((el) => {
      if (el === canvas || el.tagName === 'SCRIPT' || el.tagName === 'STYLE') return;
      const cs = getComputedStyle(el);
      if (cs.position === 'static') el.style.position = 'relative';
      if (cs.zIndex === 'auto') el.style.zIndex = '1';
    });
    const ctx = canvas.getContext('2d');
    let w = 0, h = 0, copos = [];
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    function medir() {
      w = window.innerWidth; h = window.innerHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const total = w < 700 ? 28 : 70;
      copos = Array.from({ length: total }, () => nuevo(true));
    }
    function nuevo(alInicio) {
      const r = 1.2 + Math.random() * 2.6;
      return { x: Math.random() * w, y: alInicio ? Math.random() * h : -10, r,
        vy: 0.25 + r * 0.16, fase: Math.random() * 6.28, a: 0.35 + Math.random() * 0.4,
        estrella: r > 3.2 };
    }
    function dibujaEstrella(c) {
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.fase);
      ctx.strokeStyle = `rgba(120,160,210,${c.a})`;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        ctx.rotate(Math.PI / 3);
        ctx.moveTo(-c.r * 1.6, 0); ctx.lineTo(c.r * 1.6, 0);
      }
      ctx.stroke();
      ctx.restore();
    }
    let ultimo = 0;
    function cuadro(t) {
      if (document.hidden) { requestAnimationFrame(cuadro); return; }
      const paso = Math.min(3, (t - ultimo) / 16.7 || 1);
      ultimo = t;
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < copos.length; i++) {
        const c = copos[i];
        c.fase += 0.012 * paso;
        c.y += c.vy * paso;
        c.x += Math.sin(c.fase) * 0.35 * paso;
        if (c.y > h + 10) copos[i] = nuevo(false);
        if (c.estrella) dibujaEstrella(c);
        else {
          ctx.beginPath();
          ctx.fillStyle = `rgba(150,180,215,${c.a})`;
          ctx.arc(c.x, c.y, c.r, 0, 6.283);
          ctx.fill();
        }
      }
      requestAnimationFrame(cuadro);
    }
    medir();
    let espera;
    window.addEventListener('resize', () => { clearTimeout(espera); espera = setTimeout(medir, 200); });
    requestAnimationFrame(cuadro);
  }

  function copoTitulo() {
    const h1 = document.querySelector('h1');
    if (!h1 || h1.querySelector('.temporada-copo')) return;
    const span = document.createElement('span');
    span.className = 'temporada-copo';
    span.setAttribute('aria-hidden', 'true');
    span.innerHTML = '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7"/><path d="M9 4l3 2 3-2M9 20l3-2 3 2M4.3 10.3l2.3-1.3.4-3M19.7 13.7l-2.3 1.3-.4 3M4.3 13.7l2.3 1.3.4 3M19.7 10.3l-2.3-1.3-.4-3"/></svg>';
    h1.appendChild(span);
  }

  function iniciar() {
    estilo();
    if (portada) {
      document.body.classList.add('temporada-home');
      const hero = document.querySelector('.hero');
      if (hero) {
        const caja = document.createElement('div');
        caja.className = 'temporada-portada';
        caja.appendChild(guirnalda(focosPara(hero.offsetWidth || window.innerWidth)));
        caja.appendChild(cuentaRegresiva());
        hero.insertAdjacentElement('afterend', caja);
      }
      if (!sinMovimiento && !ahorroDatos) nieve();
    } else {
      const tira = document.createElement('div');
      tira.className = 'temporada-tira';
      tira.appendChild(guirnalda(focosPara(window.innerWidth)));
      document.body.insertBefore(tira, document.body.firstChild);
      copoTitulo();
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
