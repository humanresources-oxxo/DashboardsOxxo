/* Portada: reutiliza los cálculos y el alcance de los dashboards. */
(function () {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = value => Number(value).toLocaleString('es-MX', { maximumFractionDigits: 1 });
  const definitions = [
    { id: 'd1', title: 'Vacantes activas', page: 'dashboard-1', load: () => OXXO.metricsD1Rows() },
    { id: 'd2', title: 'Bajas del mes', page: 'dashboard-2', load: () => OXXO.metricsD2Rows() },
    { id: 'd3', title: 'Equipo completo', page: 'dashboard-3', load: () => OXXO.metricsD3Rows() },
    { id: 's7', title: 'Cobertura TREO', page: 'dashboard-7', load: () => OXXO.metricsD7Rows() },
  ];
  function summarize(id, data) {
    if (!data || !Array.isArray(data.rows)) return null;
    const rows = data.rows;
    if (id === 'd1' || id === 'd2') return { value: fmt(rows.length), detail: id === 'd1' ? 'Posiciones vacantes del corte vigente' : 'Bajas operativas del mes disponible', period: data.mes };
    if (id === 'd3') {
      if (!rows.length || !data.estatusKey) return null;
      const completas = rows.filter(r => OXXO.metricsClasificaAprovechamiento(OXXO.metricsVal(r, data.estatusKey)) === 'completas').length;
      return { value: fmt(completas / rows.length * 100) + '%', detail: `${fmt(completas)} de ${fmt(rows.length)} tiendas completas`, period: data.fecha };
    }
    if (!rows.length || !data.treoKey || !data.activosKey) return null;
    const sum = key => rows.reduce((total, row) => total + (OXXO.metricsNum(OXXO.metricsVal(row, key)) || 0), 0);
    const treo = sum(data.treoKey), activos = sum(data.activosKey);
    if (!treo) return null;
    return { value: fmt(activos / treo * 100) + '%', detail: `${fmt(activos)} activos / ${fmt(treo)} posiciones TREO`, period: '' };
  }
  function criticalStores(data) {
    if (!data?.rows?.length || !data.estatusKey) return [];
    const key = OXXO.metricsFindKey(data.rows[0], ['Tienda', 'Unidad org', 'Nombre Tienda']);
    return data.rows.filter(r => OXXO.metricsClasificaAprovechamiento(OXXO.metricsVal(r, data.estatusKey)) === 'criticas')
      .map(r => ({ name: OXXO.metricsVal(r, key) || 'Tienda sin identificar', advisor: OXXO.metricsVal(r, data.asesorKey) || 'Sin asesor registrado' }))
      .sort((a, b) => String(a.name).localeCompare(String(b.name), 'es'));
  }
  let generation = 0;
  async function load() {
    const root = document.getElementById('home-operational');
    if (!root) return;
    const current = ++generation;
    const scope = OXXO.getScopeLabel();
    document.getElementById('home-scope').textContent = scope;
    root.setAttribute('aria-busy', 'true');
    root.innerHTML = definitions.map(d => `<a class="home-kpi" href="dashboards/${d.page}.html"><span>${d.title}</span><strong>—</strong><small>Cargando indicador…</small></a>`).join('');
    document.getElementById('home-priorities').textContent = 'Consultando estructura…';
    document.getElementById('home-next').textContent = 'Preparando seguimiento…';
    const [results, configResult] = await Promise.all([
      Promise.allSettled(definitions.map(d => d.load())),
      Promise.resolve().then(() => OXXO.loadSystemConfig()).catch(() => ({})),
    ]);
    if (current !== generation) return;
    const data = {};
    let available = 0;
    root.innerHTML = definitions.map((d, index) => {
      data[d.id] = results[index].status === 'fulfilled' ? results[index].value : null;
      const summary = summarize(d.id, data[d.id]);
      if (summary) available++;
      const updated = configResult?.[d.id]?.ultima_actualizacion;
      return `<a class="home-kpi" href="dashboards/${d.page}.html"><span>${d.title}</span><strong>${summary ? esc(summary.value) : '—'}</strong><small>${summary ? esc(summary.detail) : 'Sin datos disponibles · abrir tablero'}</small><small class="home-cut">${summary?.period ? 'Corte: ' + esc(summary.period) : 'Corte no informado'}<br>${updated ? 'Última carga registrada: ' + esc(updated) : 'Sin fecha de carga registrada'}</small><span class="home-open">Ver desglose →</span></a>`;
    }).join('');
    root.setAttribute('aria-busy', 'false');
    const stores = criticalStores(data.d3);
    document.getElementById('home-priorities').innerHTML = !summarize('d3', data.d3)
      ? '<p>No hay información suficiente para identificar tiendas críticas.</p>'
      : `<p>${fmt(stores.length)} tiendas en estructura crítica · corte ${esc(data.d3.fecha || 'no informado')}.</p>` + (stores.length
        ? `<ol class="home-store-list">${stores.slice(0, 5).map(s => `<li><strong>${esc(s.name)}</strong><span>${esc(s.advisor)}</span><small>Estructura crítica · revisar cobertura</small></li>`).join('')}</ol><p class="home-note">${stores.length > 5 ? 'Se muestran 5 de ' + fmt(stores.length) + '. ' : ''}Orden alfabético; todas requieren revisión.</p>`
        : '<p>No se reportan tiendas críticas en este corte.</p>');
    document.getElementById('home-next').innerHTML = `
      <a href="dashboards/dashboard-1.html"><strong>Revisar cobertura de vacantes</strong><span>${data.d1 ? fmt(data.d1.rows.length) + ' vacantes en el corte disponible' : 'Consultar disponibilidad de la base'}</span></a>
      <a href="dashboards/dashboard-2-analisis.html"><strong>Revisar el plan de bajas</strong><span>Consultar hallazgos, responsables y plazos</span></a>
      <a href="dashboards/mi-dashboard.html"><strong>Dar seguimiento por asesor</strong><span>Consulta individual o Todos los asesores</span></a>
      <p class="home-note">Acciones sugeridas; el estado de cumplimiento se revisa en el plan correspondiente.</p>`;
    document.getElementById('home-data-status').textContent = `${available}/4 indicadores disponibles · ${scope}. Cada indicador conserva su propio corte.`;
  }
  document.addEventListener('DOMContentLoaded', load);
  document.addEventListener('oxxo:scope-change', load);
  document.addEventListener('click', e => { if (e.target.closest('#home-retry')) load(); });
})();
