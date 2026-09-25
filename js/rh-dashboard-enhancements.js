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

  const normalize = (value) => String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ').trim().toLowerCase();

  const numeric = (value) => {
    const cleaned = String(value || '').replace(/[^0-9.,-]/g, '').replace(/,/g, '');
    const parsed = Number.parseFloat(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  };

  function cardLabel(card) {
    const node = card.querySelector('.kpi-card__label, .kpi-label');
    if (!node) return '';
    const ownText = [...node.childNodes]
      .filter((child) => child.nodeType === Node.TEXT_NODE)
      .map((child) => child.textContent)
      .join(' ')
      .trim();
    return ownText || node.textContent.trim();
  }

  function readKpis() {
    return [...document.querySelectorAll('#kpi-section .kpi-card')].map((card) => {
      const label = cardLabel(card);
      const valueText = card.querySelector('.kpi-card__value, .kpi-value')?.textContent.trim() || '';
      const deltaText = card.querySelector('.kpi-card__delta, .kpi-card__sub')?.textContent.trim() || '';
      return {
        card,
        label,
        key: normalize(label),
        valueText,
        value: numeric(valueText),
        deltaText,
        delta: numeric(deltaText),
      };
    });
  }

  function findKpi(kpis, label) {
    const wanted = normalize(label);
    return kpis.find((item) => item.key.includes(wanted));
  }

  function insight(level, title, text) {
    return { level, title, text };
  }

  const RULES = {
    'dashboard-1.html': (kpis) => {
      const old = findKpi(kpis, 'vacante mas antigua');
      const leaders = findKpi(kpis, 'lider');
      const total = findKpi(kpis, 'total vacantes');
      return [
        old?.value >= 15 && insight('critical', 'Antigüedad crítica', `La vacante más antigua lleva ${old.valueText} días. Prioriza su cobertura.`),
        leaders?.value > 0 && insight('warning', 'Posiciones prioritarias', `${leaders.valueText} vacantes de Líder requieren seguimiento.`),
        total?.value > 0 && insight('info', 'Carga abierta', `${total.valueText} vacantes activas con los filtros seleccionados.`),
      ];
    },
    'dashboard-2.html': (kpis) => {
      const early = findKpi(kpis, 'rot. temprana');
      const total = findKpi(kpis, 'total bajas');
      const advisor = findKpi(kpis, 'at con mas bajas');
      return [
        early?.value > 0 && insight('critical', 'Rotación temprana', `${early.valueText} bajas tempranas; revisa causas de ingreso y acompañamiento.`),
        total?.value > 0 && insight('warning', 'Bajas registradas', `${total.valueText} bajas coinciden con los filtros activos.`),
        advisor?.value > 0 && insight('info', 'Concentración por AT', `${advisor.deltaText || advisor.valueText} concentra el mayor volumen.`),
      ];
    },
    'dashboard-3.html': (kpis) => {
      const critical = findKpi(kpis, 'tienda critica');
      const incomplete = findKpi(kpis, 'equipo incompleto');
      const performance = findKpi(kpis, 'aprovechamiento general');
      return [
        critical?.value > 0 && insight('critical', 'Tiendas críticas', `${critical.valueText} tiendas requieren acción inmediata.`),
        incomplete?.value > 0 && insight('warning', 'Estructura incompleta', `${incomplete.valueText} tiendas necesitan completar su estructura.`),
        performance?.value !== null && insight(performance.value >= 92.5 ? 'success' : 'info', 'Aprovechamiento general', `Cobertura actual de ${performance.valueText}.`),
      ];
    },
    'dashboard-4.html': (kpis) => {
      const triple = findKpi(kpis, 'horas te triple');
      const rest = findKpi(kpis, 'dia descanso');
      const spend = findKpi(kpis, 'total gasto');
      return [
        triple?.value > 0 && insight('critical', 'Tiempo extra triple', `${triple.valueText} horas triples requieren revisión.`),
        rest?.value > 0 && insight('warning', 'Trabajo en descanso', `${rest.valueText} horas se registraron en día de descanso.`),
        spend?.value > 0 && insight('info', 'Gasto acumulado', `${spend.valueText} con los filtros activos.`),
      ];
    },
    'dashboard-5.html': (kpis) => {
      const previous = findKpi(kpis, 'periodo anterior');
      const current = findKpi(kpis, 'periodo actual');
      const overdue = findKpi(kpis, 'vencidos ant');
      const soon = findKpi(kpis, 'vencen 0-50 dias');
      const result = [];
      if (overdue?.value > 0) result.push(insight('critical', 'Saldo vencido', `${overdue.valueText} colaboradores requieren acción inmediata.`));
      if (soon?.value > 0) result.push(insight('warning', 'Próximos vencimientos', `${soon.valueText} colaboradores vencen dentro de 50 días.`));
      if (previous?.value !== null && current?.value !== null) {
        const diff = current.value - previous.value;
        const pct = previous.value ? Math.abs(diff / previous.value * 100).toFixed(1) : null;
        const direction = diff > 0 ? 'más que' : diff < 0 ? 'menos que' : 'igual que';
        result.push(insight('compare', 'Comparativo de periodos', `${current.valueText} días actuales: ${pct ? `${pct}% ${direction}` : direction} el saldo anterior (${previous.valueText}).`));
      }
      return result;
    },
    'dashboard-6.html': (kpis) => {
      const absences = findKpi(kpis, 'dias ausentes');
      const faults = findKpi(kpis, 'faltas');
      const stores = findKpi(kpis, 'tiendas afectadas');
      return [
        faults?.value > 0 && insight('critical', 'Faltas sin justificar', `${faults.valueText} registros requieren seguimiento.`),
        absences?.value > 0 && insight('warning', 'Ausentismo acumulado', `${absences.valueText} días ausentes en el periodo.`),
        stores?.value > 0 && insight('info', 'Alcance operativo', `${stores.valueText} tiendas presentan ausentismos.`),
      ];
    },
    'dashboard-7.html': (kpis) => {
      const understaffed = findKpi(kpis, 'sub-dotadas');
      const vacancies = findKpi(kpis, 'vacantes totales');
      const lower = findKpi(kpis, 'por bajar');
      return [
        understaffed?.value > 0 && insight('critical', 'Tiendas sub-dotadas', `${understaffed.valueText} tiendas tienen menos activos que su TREO.`),
        vacancies?.value > 0 && insight('warning', 'Vacantes de estructura', `${vacancies.valueText} posiciones continúan sin cubrir.`),
        lower?.value > 0 && insight('info', 'Reubicación posible', `${lower.valueText} tiendas pueden liberar o reubicar posiciones.`),
      ];
    },
    'dashboard-8.html': (kpis) => {
      const completion = findKpi(kpis, 'cumplimiento global');
      const critical = findKpi(kpis, 'certificacion mas critica');
      const stores = findKpi(kpis, 'tiendas cubiertas');
      return [
        completion?.value !== null && completion.value < 80 && insight('critical', 'Cumplimiento bajo', `El cumplimiento global es ${completion.valueText}.`),
        critical && insight('warning', 'Certificación prioritaria', `${critical.valueText}: ${critical.deltaText || 'requiere seguimiento'}.`),
        stores?.value > 0 && insight('info', 'Cobertura del tablero', `${stores.valueText} tiendas incluidas en la lectura.`),
      ];
    },
    'dashboard-11.html': (kpis) => {
      const total = findKpi(kpis, 'cumplimiento total');
      const under = findKpi(kpis, 'tiendas bajo 75');
      const quality = findKpi(kpis, 'datos fuera de rango');
      return [
        under?.value > 0 && insight('critical', 'Tiendas prioritarias', `${under.valueText} tiendas están debajo de 75%.`),
        quality?.value > 0 && insight('warning', 'Validación de datos', `${quality.valueText} porcentajes superan 100% y deben revisarse.`),
        total?.value !== null && insight(total.value >= 90 ? 'success' : 'info', 'Cumplimiento visible', `Promedio de ${total.valueText} con los filtros activos.`),
      ];
    },
  };

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

  function createInsights() {
    const section = document.getElementById('kpi-section');
    if (!section || document.querySelector('.hr-insights')) return null;
    // Un tablero que ya resume sus KPI puede desactivar el riel con
    // <body data-rh-insights="false"> (Dashboard 2). La navegacion no depende de esto.
    if (document.body?.dataset.rhInsights === 'false') return null;
    const rail = document.createElement('section');
    rail.className = 'hr-insights';
    rail.setAttribute('aria-label', 'Lectura rápida de indicadores');
    rail.innerHTML = `
      <div class="hr-insights__head">
        <div>
          <span class="hr-insights__eyebrow">Lectura rápida</span>
          <strong>Prioridades del tablero</strong>
        </div>
        <span class="hr-insights__freshness">Analizando indicadores…</span>
      </div>
      <div class="hr-insights__grid" aria-live="polite"></div>`;
    section.insertAdjacentElement('afterend', rail);
    return rail;
  }

  function renderInsights(rail) {
    if (!rail) return;
    const kpis = readKpis();
    if (!kpis.length || kpis.some((item) => normalize(item.label).includes('cargando'))) return;
    const generated = (RULES[currentFile]?.(kpis) || []).filter(Boolean).slice(0, 3);
    const items = generated.length ? generated : [insight('success', 'Sin alertas críticas', 'Los KPI visibles no muestran condiciones prioritarias con los filtros activos.')];
    const grid = rail.querySelector('.hr-insights__grid');
    grid.innerHTML = items.map((item) => `
      <article class="hr-insight hr-insight--${item.level}">
        <span class="hr-insight__dot" aria-hidden="true"></span>
        <div><strong>${item.title}</strong><p>${item.text}</p></div>
      </article>`).join('');

    const loadTime = document.getElementById('load-time')?.textContent.trim();
    const freshness = rail.querySelector('.hr-insights__freshness');
    freshness.textContent = loadTime && loadTime !== '—' && loadTime !== '--'
      ? `Datos actualizados: ${loadTime}`
      : 'Indicadores según filtros activos';
  }

  function init() {
    createNavigation();
    const rail = createInsights();
    if (!rail) return;
    let timer = null;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => renderInsights(rail), 80);
    };
    const kpiSection = document.getElementById('kpi-section');
    const loadTime = document.getElementById('load-time');
    const observer = new MutationObserver(schedule);
    observer.observe(kpiSection, { childList: true, subtree: true, characterData: true });
    if (loadTime) observer.observe(loadTime, { childList: true, subtree: true, characterData: true });
    schedule();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
