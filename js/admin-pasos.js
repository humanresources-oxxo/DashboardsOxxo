/* Consumido por: admin.html (seccion "Cargar bases").
   Barra de 4 pasos (Elige la base, Sube el Excel, Revisa, Publica) que se
   pinta sola leyendo el estado de los controles que ya maneja js/admin.js:
   el dashboard elegido, la hoja del Excel, el boton Publicar y el resultado
   de la publicacion. No cambia como se valida ni como se publica. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  let publicadoCon = null; // texto de #file-meta cuando se publico con exito
  let pendiente = false;
  let anterior = -1;

  function estado() {
    const dash = $('dashboard-select');
    const hoja = $('sheet-select');
    const publicar = $('publish-btn');
    const meta = ($('file-meta')?.textContent || '').trim();
    const resultado = $('publication-result');
    const elegido = !!dash?.value;
    const archivo = !!hoja && !hoja.disabled;
    const valido = archivo && !!publicar && !publicar.disabled;
    const exito = !!resultado && !resultado.classList.contains('hidden') && !resultado.classList.contains('bad');
    // La publicacion cuenta solo para el mismo archivo y el mismo dashboard.
    const clave = `${dash?.value || ''}|${meta}`;
    if (exito && publicadoCon === null) publicadoCon = clave;
    if (!exito) publicadoCon = null;
    const publicado = exito && valido && publicadoCon === clave;
    return {
      pasos: [
        { hecho: elegido, nota: elegido ? dash.options[dash.selectedIndex]?.text : 'Dashboard destino' },
        { hecho: archivo, nota: archivo ? meta.split(' - ')[0] : 'Arrastra o selecciona' },
        { hecho: valido, malo: archivo && !valido, nota: valido ? 'Todo en orden' : archivo ? 'Revisa los avisos' : 'Validación y vista previa' },
        { hecho: publicado, nota: publicado ? 'Publicada' : valido ? 'Lista para publicar' : 'Se actualiza el dashboard' }
      ]
    };
  }

  function pintar() {
    pendiente = false;
    const raiz = $('ap-pasos');
    if (!raiz) return;
    const { pasos } = estado();
    const actual = pasos.findIndex((p) => !p.hecho);
    raiz.querySelectorAll('.ap-paso').forEach((li, i) => {
      const p = pasos[i];
      li.classList.toggle('hecho', p.hecho);
      li.classList.toggle('malo', !!p.malo);
      li.classList.toggle('actual', i === actual);
      const btn = li.querySelector('.ap-paso__btn');
      if (i === actual) btn.setAttribute('aria-current', 'step'); else btn.removeAttribute('aria-current');
      const nota = li.querySelector('[data-paso-nota]');
      if (nota && nota.textContent !== p.nota) nota.textContent = p.nota;
    });
    // Al terminar de leer el Excel lleva la vista a la validacion (en celular
    // queda muy abajo y parecia que no habia pasado nada).
    if (anterior === 1 && actual >= 2 && !$('tabpanel-upload')?.classList.contains('hidden')) {
      document.querySelector('[data-paso-card="3"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    anterior = actual;
    document.querySelectorAll('[data-paso-card]').forEach((card) => {
      const n = Number(card.dataset.pasoCard);
      card.classList.toggle('ap-carga__paso--actual', n - 1 === actual || (n === 1 && actual === 1));
    });
  }
  function programar() {
    if (pendiente) return;
    pendiente = true;
    requestAnimationFrame(pintar);
  }

  document.addEventListener('DOMContentLoaded', () => {
    const panel = $('tabpanel-upload');
    if (!panel || !$('ap-pasos')) return;
    // Solo miramos los controles que cambian de estado, no la tabla de vista previa.
    const obs = new MutationObserver(programar);
    ['dashboard-select', 'sheet-select', 'publish-btn', 'publication-result', 'file-meta'].forEach((id) => {
      const el = $(id);
      if (el) obs.observe(el, { attributes: true, childList: true, characterData: true, subtree: id === 'file-meta' });
    });
    $('dashboard-select')?.addEventListener('change', programar);
    $('ap-pasos').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-paso-ir]');
      if (!btn) return;
      const n = btn.dataset.pasoIr;
      const destino = document.querySelector(`[data-paso-card="${n === '2' ? '1' : n}"]`);
      if (!destino) return;
      destino.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (n === '2') $('drop-zone')?.focus?.();
    });
    programar();
  });
  window.OXXO_ADMIN_PASOS = { pintar };
})();
