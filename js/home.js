/* ==========================================================
   OXXO — Portada (index.html)

   Solo la consume index.html (carga despues de config.js, core.js y
   home-dates.js). Arma el selector de area y las tarjetas de las areas
   Comercial/Administrativo, y muestra el ESTADO de cada fuente segun la
   pestaña Configuracion: fecha de ultima actualizacion o "Sin fecha
   registrada". La portada no calcula ni repite indicadores de los tableros.

   Estados de cada tarjeta (data-state de .card__state):
     loading  consultando Configuracion
     ok       la fuente tiene fecha registrada -> "Datos disponibles"
     empty    Configuracion cargo pero la fuente no trae fecha
     error    Configuracion no respondio (boton Reintentar)
   ========================================================== */
(function () {
  'use strict';

  const areas = {
    comercial: {
      kicker: 'Comunicación comercial', titulo: 'Dashboards Comerciales',
      tarjetas: [
        ['PromosD100', 'Galería visual de campañas vigentes, próximas promociones y materiales para tienda.', 'dashboards/promociones.html', 'En vivo'],
        ['Avance Comercial', 'SPIN, Premia, Cruzada Andatti, Venta Sugerida, Banner y MEP vs meta, por tienda y asesor.', 'dashboards/dashboard-14.html', 'Quincenal']
      ]
    },
    administrativo: {
      kicker: 'Control administrativo', titulo: 'Indicadores administrativos',
      tarjetas: [
        ['Resultados de Inventario', 'Merma, venta sin TAE, inventarios y focos principales por tienda y asesor comercial.', 'dashboards/inventarios.html', 'Mensual'],
        ['Faltantes y Sobrantes', 'Faltantes y sobrantes de caja por asesor, tienda y semana.', 'dashboards/dashboard-9.html', 'Semanal']
      ]
    }
  };
  const rhContent = [...document.querySelectorAll('.group, .access')];
  const otherArea = document.getElementById('other-area');
  const pill = document.getElementById('home-pill');
  const summary = document.getElementById('home-summary');
  const retry = document.getElementById('home-retry');

  const cardMarkup = ([titulo, descripcion, ruta, frecuencia]) => `
      <article class="card"><header class="card__bar"><span class="chip">${frecuencia}</span></header>
        <div class="card__body"><div class="card__head"><span class="card__icon" aria-hidden="true">↗</span><a class="card__title" href="${ruta}">${titulo}</a></div>
        <p class="card__state" data-state="loading"><i aria-hidden="true"></i><span>Consultando fuente…</span></p>
        <p class="card__desc">${descripcion}</p></div>
        <footer class="card__foot"><p class="card__stamp">Actualización: <strong>Consultando…</strong></p><a class="btn btn--sm" href="${ruta}">Abrir</a></footer></article>`;

  // La tarjeta completa es el acceso; se conserva el enlace nativo para
  // lectores de pantalla y navegación con teclado.
  function activarTarjetas(raiz) {
    raiz.querySelectorAll('.card').forEach((card) => {
      const link = card.querySelector('.card__title');
      if (!link || card.dataset.activa) return;
      card.dataset.activa = '1';
      card.tabIndex = 0;
      card.setAttribute('role', 'link');
      card.setAttribute('aria-label', `Abrir ${link.textContent.trim()}`);
      const open = () => { window.location.href = link.href; };
      card.addEventListener('click', (event) => {
        if (!event.target.closest('a')) open();
      });
      card.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          open();
        }
      });
    });
  }

  function activarArea(area) {
    const esRh = area === 'rh';
    document.body.dataset.area = area;
    rhContent.forEach((elemento) => { elemento.hidden = !esRh; });
    otherArea.hidden = esRh;
    if (esRh) otherArea.removeAttribute('data-area');
    if (!esRh) {
      const actual = areas[area];
      otherArea.dataset.area = area;
      otherArea.innerHTML = `<section class="group"><div class="group__head"><div><p class="kicker"><span class="dot"></span>${actual.kicker}</p><h2 class="group__title">${actual.titulo}</h2></div><p class="group__count">${actual.tarjetas.length} dashboards</p></div><div class="rule"></div><div class="grid">${actual.tarjetas.map(cardMarkup).join('')}</div></section>`;
      activarTarjetas(otherArea);
      aplicarFechas();
    }
    document.querySelectorAll('.area-switch__button').forEach((item) => {
      const active = item.dataset.area === area;
      item.classList.toggle('is-active', active);
      item.setAttribute('aria-pressed', String(active));
    });
    try { localStorage.setItem('oxxo-dashboard-area', area); } catch (error) {}
  }
  document.querySelectorAll('.area-switch__button').forEach((button) => button.addEventListener('click', () => activarArea(button.dataset.area)));
  let areaInicial = 'rh';
  try { areaInicial = localStorage.getItem('oxxo-dashboard-area') || 'rh'; } catch (error) {}
  activarTarjetas(document);

  // 'loading' | 'ok' | 'error'; null mientras no hay respuesta de Configuracion.
  let estadoConfiguracion = 'loading';
  let configuracionSistema = null;
  const rutasConfiguracion = {
    d1: 'dashboards/dashboard-1.html', d2: 'dashboards/dashboard-2.html',
    d3: 'dashboards/dashboard-3.html', s4: 'dashboards/dashboard-4.html',
    s5: 'dashboards/dashboard-5.html', s6: 'dashboards/dashboard-6.html',
    s7: 'dashboards/dashboard-7.html', d8: 'dashboards/dashboard-8.html',
    s9: 'dashboards/dashboard-9.html', d11: 'dashboards/dashboard-11.html',
    a13: 'dashboards/dashboard-13.html', c14: 'dashboards/dashboard-14.html',
    m12: 'dashboards/dashboard-12.html',
    // Tarjetas de las areas comercial y administrativo, que se arman
    // dinamicamente mas arriba: sin su clave se quedaban en "Sin fecha
    // registrada" aunque la pestaña Configuracion ya trajera la fila.
    promos: 'dashboards/promociones.html',
    inventories: 'dashboards/inventarios.html'
  };
  // El formato vive en js/home-dates.js (probado en tests/home-dates.test.js).
  // Antes se resolvia con un replace fijo que convertia cualquier mes en
  // "sep": un dato de agosto se mostraba como septiembre.
  const textoFecha = (fecha) => (window.OXXO_HOME ? OXXO_HOME.formatDate(fecha) : String(fecha || '').trim());
  const fechaDeRuta = (ruta) => {
    if (!configuracionSistema) return '';
    const clave = Object.keys(rutasConfiguracion).find((k) => rutasConfiguracion[k] === ruta);
    const fila = clave && configuracionSistema[clave];
    return (fila && fila.ultima_actualizacion) || '';
  };

  function pintarTarjeta(card) {
    const link = card.querySelector('.card__title');
    const destino = card.querySelector('.card__stamp strong');
    const estado = card.querySelector('.card__state');
    if (!link || !destino || !estado) return 'empty';
    const fecha = estadoConfiguracion === 'ok' ? fechaDeRuta(link.getAttribute('href')) : '';
    const clase = estadoConfiguracion === 'loading' ? 'loading' : estadoConfiguracion === 'error' ? 'error' : fecha ? 'ok' : 'empty';
    const textos = {
      loading: ['Consultando fuente…', 'Consultando…'],
      error: ['Fuente no disponible', '—'],
      ok: ['Datos disponibles', textoFecha(fecha)],
      empty: ['Sin fecha registrada', '—']
    }[clase];
    estado.dataset.state = clase;
    estado.querySelector('span').textContent = textos[0];
    destino.textContent = textos[1];
    return clase;
  }

  function resumen(conFecha, total) {
    let clase = estadoConfiguracion;
    let texto;
    if (estadoConfiguracion === 'loading') texto = 'Consultando la fecha de cada fuente en Configuración…';
    else if (estadoConfiguracion === 'error') texto = 'No se pudo consultar la pestaña Configuración; los tableros siguen disponibles, pero sin fecha de actualización. Intenta de nuevo.';
    else if (!conFecha) { clase = 'empty'; texto = 'Configuración cargada, pero ninguna fuente tiene fecha de actualización registrada.'; }
    else { clase = 'ok'; texto = `${conFecha} de ${total} fuentes con fecha de actualización registrada.`; }
    if (summary) summary.textContent = texto;
    if (pill) {
      pill.dataset.state = clase;
      pill.querySelector('span').textContent = {
        loading: 'Consultando fuentes…', error: 'Sin fechas', empty: 'Sin fechas registradas', ok: `${conFecha} de ${total} con fecha`
      }[clase];
    }
    if (retry) retry.hidden = estadoConfiguracion !== 'error';
  }

  // El total se cuenta sobre las 15 tarjetas del sitio (las de las areas
  // ocultas se resuelven contra el mapa de rutas, no contra el DOM visible).
  const todasLasRutas = () => [...new Set([
    ...[...document.querySelectorAll('.group .card__title')].map((a) => a.getAttribute('href')),
    ...Object.values(areas).flatMap((a) => a.tarjetas.map((t) => t[2]))
  ])];
  function aplicarFechas() {
    document.querySelectorAll('.card').forEach(pintarTarjeta);
    const rutas = todasLasRutas();
    resumen(rutas.filter((ruta) => estadoConfiguracion === 'ok' && fechaDeRuta(ruta)).length, rutas.length);
  }

  async function cargarFechasReales() {
    estadoConfiguracion = 'loading';
    aplicarFechas();
    try {
      configuracionSistema = (window.OXXO && OXXO.loadSystemConfig) ? await OXXO.loadSystemConfig() : {};
    } catch (error) { configuracionSistema = {}; }
    estadoConfiguracion = configuracionSistema && Object.keys(configuracionSistema).length ? 'ok' : 'error';
    aplicarFechas();
  }

  if (retry) retry.addEventListener('click', cargarFechasReales);
  // El area guardada se muestra de inmediato; las fechas llegan despues.
  activarArea(areaInicial);
  cargarFechasReales();
})();
