/* Consumido por: dashboard-1, dashboard-11, dashboard-12, dashboard-13, dashboard-2, dashboard-3, dashboard-4, dashboard-5, dashboard-6, dashboard-7, dashboard-8. */
(function () {
  'use strict';

  const DASHBOARDS = [
    ['dashboard-1.html', 'Vacantes', 'Diario'],
    ['dashboard-2.html', 'Bajas', 'Diario'],
    ['dashboard-3.html', 'Estructura', 'Semanal'],
    ['dashboard-4.html', 'Tiempo Extra', 'Semanal'],
    ['dashboard-5.html', 'Vacaciones', 'Semanal'],
    ['dashboard-6.html', 'Ausentismos', 'Semanal'],
    ['dashboard-7.html', 'TREO', 'Semanal'],
    ['dashboard-8.html', 'Capacidades', 'Diario'],
    ['dashboard-11.html', 'Marcajes', 'Semanal'],
    ['dashboard-12.html', 'Enfoque del Líder', 'Mensual'],
    ['dashboard-13.html', 'Control de Ausentismo', 'Mensual'],
  ];

  const currentFile = location.pathname.split('/').pop() || '';
  const dashboardIndex = DASHBOARDS.findIndex(([file]) => file === currentFile);
  if (dashboardIndex < 0) return;

  function createNavigation() {
    const meta = document.querySelector('.topbar__meta');
    if (!meta || meta.querySelector('.hr-dashboard-switcher')) return;
    const wrapper = document.createElement('label');
    wrapper.className = 'hr-dashboard-switcher';
    wrapper.innerHTML = `
      <span class="hr-dashboard-switcher__eyebrow">Recursos Humanos</span>
      <span class="hr-dashboard-switcher__control">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"></path></svg>
        <select aria-label="Cambiar dashboard de Recursos Humanos">
          ${DASHBOARDS.map(([file, label, frequency]) => `<option value="${file}"${file === currentFile ? ' selected' : ''}>${label} · ${frequency}</option>`).join('')}
        </select>
      </span>`;
    const select = wrapper.querySelector('select');
    select.addEventListener('change', () => {
      const target = new URL(select.value, location.href);
      const period = new URLSearchParams(location.search).get('periodo');
      if (period) target.searchParams.set('periodo', period);
      location.href = target.href;
    });
    meta.insertBefore(wrapper, meta.firstChild);
  }

  // ponytail: el riel "Lectura rapida / Prioridades del tablero" se retiro;
  // este script solo monta el selector de dashboards.
  function init() {
    createNavigation();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
