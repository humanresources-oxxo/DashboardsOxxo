/* Cortes compartidos: una semana siempre pertenece a un mes y un año. */
(function () {
  'use strict';
  const val = (row, key) => key ? OXXO.metricsVal(row, key) : '';
  function monthKey(month, year) {
    const m = String(month || '').match(/^(\d{1,2})(?:\D|$)/);
    const y = String(year || '').match(/\b(\d{4})\b/);
    if (m && y && +m[1] >= 1 && +m[1] <= 12) return `${y[1]}-${m[1].padStart(2, '0')}`;
    return OXXO.metricsNormalizeMonthKey(month) || (y ? OXXO.metricsNormalizeMonthKey(`${month}-${y[1]}`) : '') || '';
  }
  function weekRank(value) {
    const m = String(value || '').match(/^(?:sem(?:ana)?\s*)?(\d{1,2})$/i);
    return m ? +m[1] : -1;
  }
  function prepare(raw, catalog, keys) {
    const rows = OXXO.filterValidTiendas(raw.map(row => ({ ...row })), catalog, keys.tiendaKey, keys.crKey);
    rows.forEach(row => OXXO.applyAsesorCatalog(row, catalog, keys));
    const monthOf = row => monthKey(val(row, keys.mesKey), val(row, keys.anoKey));
    const weekOf = row => { const raw = String(val(row, keys.semanaKey) || '').trim(); const rank = weekRank(raw); return rank >= 0 ? String(rank) : raw; };
    const months = [...new Set(rows.map(monthOf).filter(Boolean))].sort();
    const currentMonth = months.at(-1) || '';
    const monthRows = currentMonth ? rows.filter(row => monthOf(row) === currentMonth) : rows;
    const currentWeek = [...new Set(monthRows.map(weekOf).filter(Boolean))].sort((a, b) => weekRank(b) - weekRank(a) || b.localeCompare(a, 'es'))[0] || '';
    const currentRows = currentWeek ? monthRows.filter(row => weekOf(row) === currentWeek) : monthRows;
    const periodOf = row => [monthOf(row), weekOf(row) ? `Sem ${weekRank(weekOf(row)) >= 0 ? weekRank(weekOf(row)) : weekOf(row)}` : ''].filter(Boolean).join(' · ');
    const periods = [...new Map(rows.map(row => [periodOf(row), { month: monthOf(row), week: weekRank(weekOf(row)) }])).entries()]
      .filter(([label]) => label).sort((a, b) => b[1].month.localeCompare(a[1].month) || b[1].week - a[1].week).map(([label]) => label);
    return { rows, currentRows, currentMonth, currentWeek, months, monthOf, periodOf, periods, currentPeriod: currentRows.length ? periodOf(currentRows[0]) : '' };
  }
  // Las fuentes se reemplazan al recargar: el índice no retiene bases anteriores.
  function createRowLookup() {
    const cache = new WeakMap();
    return function(source, key, keyOf, context) {
      let entry = cache.get(source);
      if (!entry || entry.rows !== source.rows || entry.context !== context) {
        const groups = new Map();
        source.rows.forEach(row => { const k = keyOf(row); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(row); });
        entry = { rows: source.rows, context, groups }; cache.set(source, entry);
      }
      return entry.groups.get(key) || [];
    };
  }
  function crossing(sources) {
    if (sources.some(s => !s || !s.ready)) return { status: 'missing' };
    const months = sources.map(s => s.month);
    if (months.some(m => !m) || new Set(months).size !== 1) return { status: 'different', months };
    const values = sources.map(s => s.value);
    if (values.some(v => !Number.isFinite(v))) return { status: 'missing' };
    return { status: 'ready', month: months[0], values, signals: values.filter(v => v > 0).length };
  }
  Object.assign(OXXO, { metricsMonthFromParts: monthKey, metricsPreparePeriodSource: prepare, metricsCrossSignals: crossing, metricsCreateRowLookup: createRowLookup });
})();
