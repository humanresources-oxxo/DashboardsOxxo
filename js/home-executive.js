/* Portada: reutiliza los cálculos y el alcance de los dashboards. */
(function () {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = value => Number(value).toLocaleString('es-MX', { maximumFractionDigits: 1 });
  const dateLabel = value => window.OXXO_HOME?.formatDate(value) || String(value || '');
  const areas = {
    comercial: [
      { id: 'c14', tab: 'c14', title: 'Tiendas con avance comercial', page: 'dashboard-14', stores: true },
      { id: 'promos', tab: 'promos', title: 'Promociones publicadas', page: 'promociones' },
    ],
    administrativo: [
      { id: 'inventories', tab: 'inventories', title: 'Registros de inventario', page: 'inventarios' },
      { id: 's9', tab: 's9', title: 'Movimientos de caja', page: 'dashboard-9' },
    ],
  };
  async function loadArea(area, root, current, scope) {
    const items = areas[area];
    root.style.gridTemplateColumns = 'repeat(2, minmax(0, 1fr))';
    root.innerHTML = '<p>Consultando fuentes del área…</p>';
    const results = await Promise.allSettled(items.map(async item => {
      const tab = OXXO.SHEETS_CONFIG.TABS[item.tab];
      if (!tab) return null;
      return OXXO.fetchSheetData(tab);
    }));
    const config = await OXXO.loadSystemConfig().catch(() => ({}));
    if (current !== generation) return;
    let available = 0;
    root.innerHTML = items.map((item, i) => {
      const rows = results[i].status === 'fulfilled' ? results[i].value : null;
      let count = null;
      if (Array.isArray(rows)) {
        count = rows.length;
        if (item.stores && rows.length) {
          const key = OXXO.metricsFindKey(rows[0], ['Tienda', 'Nombre Tienda']);
          count = key ? new Set(rows.map(r => String(OXXO.metricsVal(r, key) || '').trim()).filter(Boolean)).size : null;
        }
      }
      if (count !== null) available++;
      const updated = dateLabel(config?.[item.id]?.ultima_actualizacion);
      return `<a class="home-kpi" href="dashboards/${item.page}.html"><span>${item.title}</span><strong>${count === null ? '—' : fmt(count)}</strong><small>${count === null ? 'Sin datos disponibles' : 'Base publicada del alcance activo · todos los cortes'}</small><small class="home-cut">${updated ? 'Última carga registrada: ' + esc(updated) : 'Sin fecha de carga registrada'}</small><span class="home-open">Ver desglose →</span></a>`;
    }).join('');
    root.setAttribute('aria-busy', 'false');
    document.getElementById('home-priorities').innerHTML = '<p>Consulta los tableros del área para seleccionar un periodo y revisar metas, importes y casos específicos.</p>';
    document.getElementById('home-next').innerHTML = items.map(item => `<a href="dashboards/${item.page}.html"><strong>${item.title}</strong><span>Revisar el detalle y los filtros del tablero</span></a>`).join('');
    document.getElementById('home-data-status').textContent = `${available}/${items.length} fuentes disponibles · ${scope}. Los conteos incluyen todos los cortes publicados; no representan vigencia ni cumplimiento.`;
  }
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
    const area = document.body?.dataset.area || 'rh';
    const otherArea = Boolean(areas[area]);
    const label = document.querySelector?.('.home-eyebrow');
    if (label) label.textContent = 'Vista ejecutiva · ' + (area === 'comercial' ? 'Comercial' : area === 'administrativo' ? 'Administrativo' : 'Recursos Humanos');
    const priorityTitle = document.getElementById('home-priority-title');
    if (priorityTitle) priorityTitle.textContent = otherArea ? 'Revisión del área' : 'Tiendas que requieren atención';
    const summaryTitle = document.getElementById('home-details-label');
    if (summaryTitle) summaryTitle.textContent = otherArea ? 'Ver siguientes pasos del área' : 'Ver tiendas críticas y siguientes pasos';
    const allStoresLink = document.getElementById('home-all-stores');
    if (allStoresLink) allStoresLink.hidden = otherArea;
    document.getElementById('home-scope').textContent = scope;
    root.setAttribute('aria-busy', 'true');
    if (otherArea) return loadArea(area, root, current, scope);
    if (root.style) root.style.gridTemplateColumns = '';
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
      const updated = dateLabel(configResult?.[d.id]?.ultima_actualizacion);
      return `<a class="home-kpi" href="dashboards/${d.page}.html"><span>${d.title}</span><strong>${summary ? esc(summary.value) : '—'}</strong><small>${summary ? esc(summary.detail) : 'Sin datos disponibles · abrir tablero'}</small><small class="home-cut">${summary?.period ? 'Corte: ' + esc(dateLabel(summary.period)) : 'Corte no informado'}<br>${updated ? 'Última carga registrada: ' + esc(updated) : 'Sin fecha de carga registrada'}</small><span class="home-open">Ver desglose →</span></a>`;
    }).join('');
    root.setAttribute('aria-busy', 'false');
    const stores = criticalStores(data.d3);
    document.getElementById('home-priorities').innerHTML = !summarize('d3', data.d3)
      ? '<p>No hay información suficiente para identificar tiendas críticas.</p>'
      : `<p>${fmt(stores.length)} tiendas en estructura crítica · corte ${esc(dateLabel(data.d3.fecha) || 'no informado')}.</p>` + (stores.length
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
  document.addEventListener('oxxo:area-change', load);
  document.addEventListener('click', e => { if (e.target.closest('#home-retry')) load(); });
})();
