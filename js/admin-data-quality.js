/* ==========================================================
   PANEL ADMIN · CALIDAD DE DATOS
   Diagnostico de solo lectura sobre las fuentes publicadas.
   ========================================================== */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const norm = (value) => String(OXXO.fixMojibake ? OXXO.fixMojibake(value || '') : value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9%]+/g, ' ').trim();
  const tabs = () => OXXO.SHEETS_CONFIG.TABS;
  const sheetGids = {
    Dashboard_1_Diario: '148613755', Dashboard_2_Diario: '871442940', Dashboard_3_Diario: '503610234',
    Dashboard_4_Semanal: '2049610484', Dashboard_5_Semanal: '211648341', Dashboard_6_Semanal: '773035568',
    Dashboard_7_Semanal: '302199273', Dashboard_8_Diario: '1011586825', Dashboard_10_FLEX: '1144560330',
    Dashboard_11_Semanal: '244096847', Dashboard_9_Semanal: '1089270560', Inventarios: '1093120909', Promociones: '1911021880',
  };
  let lastResults = [];
  let activeFilter = 'all';
  const sources = () => [
    { area: 'RH', name: 'Vacantes Diarias', tab: tabs().d1, cadence: 'daily', required: [['tienda'], ['puesto', 'tipo puesto', 'posicion']], dates: ['Fecha', 'Mes'] },
    { area: 'RH', name: 'Bajas Diarias', tab: tabs().d2, cadence: 'daily', required: [['tienda'], ['asesor'], ['fecha', 'mes'], ['div.p.']], dates: ['Fecha', 'F.Crea', 'Mes'] },
    { area: 'Gobierno de datos', name: 'CNT · asesor por tienda', tab: OXXO.SHEETS_CONFIG.CATALOG_SHEET || 'Catalogo_Asesores', cadence: 'snapshot', kind: 'advisor-catalog', required: [] },
    { area: 'RH', name: 'Aprovechamiento', tab: tabs().d3, cadence: 'weekly', required: [['tienda'], ['asesor'], ['aprovechamiento estructura']], dates: ['FECHA', 'Fecha'] },
    { area: 'RH', name: 'Tiempo Extra', tab: tabs().s4, cadence: 'monthly', required: [['texto breve de unidad organizativa'], ['cantidad'], ['importe']], monthParts: true },
    { area: 'RH', name: 'Vacaciones', tab: tabs().s5, cadence: 'snapshot', required: [['tienda'], ['nombre'], ['dias restantes']] },
    { area: 'RH', name: 'Ausentismos', tab: tabs().s6, cadence: 'monthly', required: [['tienda'], ['denominacion'], ['dias']], monthParts: true },
    { area: 'RH', name: 'TREO', tab: tabs().s7, cadence: 'snapshot', required: [['tienda'], ['asesor'], ['estructura sap']] },
    { area: 'RH', name: 'Capacidades', tab: tabs().d8, cadence: 'snapshot', required: [['unidad org'], ['empleados'], ['asesor correcto', 'asesor']] },
    { area: 'RH', name: 'Personal FLEX', tab: tabs().d10, cadence: 'weekly', required: [['tienda'], ['asesor'], ['fecha']], dates: ['Fecha'] },
    { area: 'RH', name: 'Cumplimiento de Marcajes', tab: tabs().d11, cadence: 'snapshot', required: [['tienda'], ['asesor'], ['semana'], ['cumpl reg total']] },
    { area: 'RH', name: 'Enfoque del Lider', tab: tabs().m12, cadence: 'monthly', required: [['tienda'], ['asesor'], ['mes']], dates: ['Mes'] },
    { area: 'RH', name: 'Control de Ausentismo', tab: tabs().a13, cadence: 'monthly', required: [['tienda'], ['nombre'], ['clasificacion']], dates: ['Fecha Captura', 'Fecha Inicio'] },
    { area: 'Administrativo', name: 'Faltantes y Sobrantes', tab: tabs().s9, cadence: 'weekly', required: [['cr'], ['fecha'], ['importe']], dates: ['Fecha'] },
    { area: 'Administrativo', name: 'Inventarios', tab: tabs().inventories, cadence: 'monthly', required: [['cr'], ['tienda'], ['fecha de inventario']], dates: ['Fecha de Inventario', 'Periodo'] },
    { area: 'Comercial', name: 'PromosD100', tab: tabs().promos, cadence: 'snapshot', required: [['titulo', 'promocion'], ['imagen', 'imagen url', 'url']], dates: ['Fecha fin', 'Fin', 'Vigencia hasta'] },
    { area: 'Comercial', name: 'Avance Comercial', tab: tabs().c14, cadence: 'snapshot', required: [['tienda'], ['asesor'], ['spin']] },
  ].filter((source) => source.tab);

  function headerMap(row) {
    const map = new Map();
    Object.keys(row || {}).forEach((key) => map.set(norm(key), key));
    return map;
  }
  function findHeader(map, aliases) {
    const normalized = aliases.map(norm);
    for (const [key, original] of map) {
      if (normalized.some((alias) => key === alias || key.includes(alias))) return original;
    }
    return '';
  }
  function parseDate(value) {
    const text = String(value || '').trim();
    if (!text) return null;
    const iso = text.match(/^(\d{4})[-/](\d{1,2})(?:[-/](\d{1,2}))?/);
    if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3] || 1));
    const dmy = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
    if (dmy) {
      const first = Number(dmy[1]);
      const second = Number(dmy[2]);
      const year = Number(dmy[3]) < 100 ? 2000 + Number(dmy[3]) : Number(dmy[3]);
      return first <= 12 && second > 12 ? new Date(year, first - 1, second) : new Date(year, second - 1, first);
    }
    const months = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    const es = norm(text).match(/(\d{1,2}) de ([a-z]+) de (\d{4})/);
    if (es && months.includes(es[2])) return new Date(Number(es[3]), months.indexOf(es[2]), Number(es[1]));
    const monthKey = OXXO.metricsNormalizeMonthKey ? OXXO.metricsNormalizeMonthKey(text) : '';
    if (monthKey) {
      const parts = monthKey.split('-');
      return new Date(Number(parts[0]), Number(parts[1]) - 1, 1);
    }
    const native = new Date(text);
    return Number.isNaN(native.getTime()) ? null : native;
  }
  function columnLetter(row, key) {
    let index = Object.keys(row || {}).indexOf(key) + 1;
    let letters = '';
    while (index > 0) {
      index -= 1;
      letters = String.fromCharCode(65 + (index % 26)) + letters;
      index = Math.floor(index / 26);
    }
    return letters || '?';
  }
  function latestDate(rows, source, map) {
    const candidates = [];
    (source.dates || []).forEach((alias) => {
      const key = findHeader(map, [alias]);
      if (key) rows.forEach((row, index) => {
        const date = parseDate(row[key]);
        if (date && !Number.isNaN(date.getTime())) candidates.push({ date, key, row: index + 2, raw: row[key] });
      });
    });
    if (source.monthParts) {
      const mesKey = findHeader(map, ['Mes']);
      const anoKey = findHeader(map, ['Ano', 'Año']);
      if (mesKey && anoKey) rows.forEach((row, index) => {
        const month = String(row[mesKey] || '').match(/(\d{1,2})/);
        const year = String(row[anoKey] || '').match(/(\d{4})/);
        if (month && year) candidates.push({ date: new Date(Number(year[1]), Number(month[1]) - 1, 1), key: mesKey, row: index + 2, raw: `${row[mesKey]} / ${row[anoKey]}` });
      });
    }
    return candidates.sort((a, b) => b.date - a.date)[0] || null;
  }
  function dateLabel(date) {
    return date ? date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : 'No informado';
  }
  function sheetURL(result) {
    const id = OXXO.SHEETS_CONFIG.SPREADSHEET_ID;
    const gid = sheetGids[result.tab] || '0';
    return `https://docs.google.com/spreadsheets/d/${encodeURIComponent(id)}/edit#gid=${gid}&range=${encodeURIComponent(result.cell || 'A1')}`;
  }
  async function inspectAdvisorCatalog(source) {
    const catalog = await OXXO.loadAsesorCatalog();
    const rows = Array.isArray(catalog?.rows) ? catalog.rows : [];
    if (!rows.length) return { ...source, status: 'bad', rows: 0, cut: null, note: 'El CNT no devolvió filas válidas.', action: 'Publica o recupera Catalogo_Asesores antes de actualizar los tableros.' };
    const crCounts = new Map();
    rows.forEach((row) => {
      const cr = String(row.cr || '').trim().toUpperCase();
      if (cr) crCounts.set(cr, (crCounts.get(cr) || 0) + 1);
    });
    const duplicatedCr = [...crCounts.values()].filter((count) => count > 1).length;
    const status = duplicatedCr ? 'warn' : 'ok';
    return {
      ...source,
      status,
      rows: rows.length,
      cut: null,
      note: duplicatedCr
        ? `CNT disponible con ${duplicatedCr} CR duplicado${duplicatedCr > 1 ? 's' : ''}.`
        : `CNT disponible: ${rows.length.toLocaleString('es-MX')} asignaciones válidas por CR.`,
      action: duplicatedCr
        ? 'Corrige los CR duplicados en el CNT para evitar que una tienda herede un asesor ambiguo.'
        : 'Sin acción requerida. Este catálogo es la fuente principal de asesores.'
    };
  }
  async function inspect(source) {
    if (source.kind === 'advisor-catalog') return inspectAdvisorCatalog(source);
    // scoped:false: este diagnostico revisa la salud de la fuente completa,
    // no solo de la plaza activa en el switch de Alcance (que ni siquiera se
    // muestra ya en el panel admin) -- sin esto, filtrar a una sola plaza
    // podia reportar una pestana como vacia/con error aunque tuviera datos
    // sanos de otras plazas.
    const rows = await OXXO.fetchSheetData(source.tab, { fresh: true, allowStale: false, scoped: false });
    if (!Array.isArray(rows)) return { ...source, status: 'bad', rows: 0, cut: null, note: 'La fuente no respondió.' };
    if (!rows.length) return { ...source, status: 'bad', rows: 0, cut: null, note: 'La pestaña está vacía.' };
    const map = headerMap(rows[0]);
    const missing = source.required.filter((group) => !findHeader(map, group)).map((group) => group[0]);
    const latest = latestDate(rows, source, map);
    const cut = latest?.date || null;
    const age = cut ? Math.floor((Date.now() - cut.getTime()) / 86400000) : null;
    const now = new Date();
    const monthGap = cut ? (now.getFullYear() - cut.getFullYear()) * 12 + now.getMonth() - cut.getMonth() : null;
    const cell = latest ? `${columnLetter(rows[0], latest.key)}${latest.row}` : '';
    let status = 'ok';
    let note = 'Encabezados y vigencia correctos.';
    let action = 'Sin acción requerida.';
    if (missing.length) {
      status = 'bad';
      note = `Faltan encabezados en la fila 1: ${missing.join(', ')}.`;
      action = `Agrega o renombra ${missing.length > 1 ? 'las columnas indicadas' : `la columna “${missing[0]}”`} sin cambiar los demás encabezados.`;
    } else if (!cut && source.cadence === 'snapshot') {
      note = 'Estructura correcta; esta fuente se valida como fotografía vigente.';
      action = 'Sin acción requerida. La fecha no es obligatoria para esta base.';
    } else if (!cut) {
      status = 'warn';
      note = 'No se encontró una fecha o periodo válido para comprobar la vigencia.';
      action = source.monthParts ? 'Completa las columnas “Mes” y “Año” en las filas publicadas.' : `Agrega una columna de corte: ${(source.dates || ['Fecha']).join(' o ')}.`;
    } else if (age < -7) {
      status = 'warn';
      note = `Fecha futura en ${latest.key}, celda ${cell}: “${latest.raw}”.`;
      action = 'Corrige esa celda en Google Sheets o confirma que el año publicado sea intencional.';
    } else if (source.cadence === 'monthly' && monthGap > 2) {
      status = 'bad';
      note = `El último periodo está ${monthGap} meses atrás (${latest.key}, celda ${cell}).`;
      action = 'Publica el archivo del mes más reciente o corrige el periodo de esa celda.';
    } else if (source.cadence === 'monthly' && monthGap > 1) {
      status = 'warn';
      note = `Falta el periodo más reciente; último dato en ${latest.key}, celda ${cell}.`;
      action = 'Publica el mes pendiente cuando la base esté disponible.';
    } else if (source.cadence === 'weekly' && age > 35) {
      status = 'bad';
      note = `Corte semanal atrasado ${age} días (${latest.key}, celda ${cell}).`;
      action = 'Actualiza la fuente con el corte semanal más reciente.';
    } else if (source.cadence === 'weekly' && age > 14) {
      status = 'warn';
      note = `Han pasado ${age} días desde el corte (${latest.key}, celda ${cell}).`;
      action = 'Revisa si ya corresponde publicar una nueva semana.';
    } else if (source.cadence === 'daily' && age > 45) {
      status = 'bad';
      note = `Corte diario atrasado ${age} días (${latest.key}, celda ${cell}).`;
      action = 'Publica la base diaria actualizada.';
    } else if (source.cadence === 'daily' && age > 14) {
      status = 'warn';
      note = `Han pasado ${age} días desde el corte (${latest.key}, celda ${cell}).`;
      action = 'Revisa si la carga diaria dejó de actualizarse.';
    }
    return { ...source, status, rows: rows.length, cut, note, action, cell, age, monthGap };
  }
  function renderRows() {
    const visible = activeFilter === 'all' ? lastResults : lastResults.filter((result) => result.status === activeFilter);
    $('quality-table-body').innerHTML = visible.length ? visible.map((result) => `<tr>
      <td><span class="quality-source">${esc(result.name)}</span><small>${esc(result.area)} · ${esc(result.tab)}</small></td>
      <td><span class="quality-status ${result.status}">${result.status === 'ok' ? 'Correcta' : result.status === 'warn' ? 'Atención' : 'Error'}</span></td>
      <td>${result.rows.toLocaleString('es-MX')}</td><td>${esc(dateLabel(result.cut))}${result.cell ? `<small>Celda ${esc(result.cell)}</small>` : ''}</td><td><strong class="quality-detail">${esc(result.note)}</strong><small>${esc(result.action)}</small></td>
      <td><a class="quality-open" href="${esc(sheetURL(result))}" target="_blank" rel="noopener">Abrir hoja<span aria-hidden="true">↗</span></a></td>
    </tr>`).join('') : '<tr><td colspan="6" class="quality-empty">No hay fuentes con este estado.</td></tr>';
  }
  function render(results) {
    lastResults = results;
    const count = (status) => results.filter((result) => result.status === status).length;
    $('quality-summary').innerHTML = `
      <div class="quality-kpi"><span>Fuentes</span><strong>${results.length}</strong></div>
      <div class="quality-kpi ok"><span>Correctas</span><strong>${count('ok')}</strong></div>
      <div class="quality-kpi warn"><span>Atención</span><strong>${count('warn')}</strong></div>
      <div class="quality-kpi bad"><span>Errores</span><strong>${count('bad')}</strong></div>`;
    const alerts = results.filter((result) => result.status === 'warn' || result.status === 'bad');
    $('quality-alerts').innerHTML = alerts.length ? alerts.map((result) => `<div class="quality-alert ${result.status === 'bad' ? 'bad' : ''}">
      <div class="quality-alert__icon">${result.status === 'bad' ? '×' : '!'}</div>
      <div><strong>${esc(result.name)} · ${esc(result.area)}</strong><span>${esc(result.note)}</span></div>
      <div class="quality-alert__age">${result.age != null && result.age >= 0 ? `${result.age} días` : result.monthGap != null && result.monthGap >= 0 ? `${result.monthGap} meses` : 'Revisar ahora'}</div>
    </div>`).join('') : '<div class="quality-alert ok"><div class="quality-alert__icon">✓</div><div><strong>Fuentes al día</strong><span>No se detectaron alertas de estructura o vigencia.</span></div><div class="quality-alert__age">Correcto</div></div>';
    renderRows();
    $('quality-last-run').textContent = `Última revisión: ${new Date().toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}`;
    const issues = count('warn') + count('bad');
    $('quality-guidance').textContent = issues ? `${issues} fuente${issues > 1 ? 's requieren' : ' requiere'} revisión. Abre la base correspondiente antes de publicar una actualización.` : 'Todas las fuentes revisadas tienen estructura y vigencia correctas.';
  }
  async function run() {
    const button = $('quality-refresh-btn');
    if (!button || button.disabled) return;
    button.disabled = true;
    button.textContent = 'Revisando fuentes…';
    $('quality-table-body').innerHTML = '<tr><td colspan="6" class="quality-empty">Consultando Google Sheets…</td></tr>';
    try {
      const results = await Promise.all(sources().map(inspect));
      render(results);
    } catch (error) {
      console.error('Diagnóstico de calidad:', error);
      $('quality-guidance').textContent = 'No fue posible completar el diagnóstico. Revisa la conexión e inténtalo nuevamente.';
      $('quality-table-body').innerHTML = '<tr><td colspan="6" class="quality-empty">El diagnóstico no pudo completarse.</td></tr>';
    } finally {
      button.disabled = false;
      button.textContent = 'Actualizar diagnóstico';
    }
  }
  document.addEventListener('DOMContentLoaded', () => {
    $('quality-refresh-btn')?.addEventListener('click', run);
    document.querySelectorAll('[data-quality-filter]').forEach((button) => button.addEventListener('click', () => {
      activeFilter = button.dataset.qualityFilter;
      document.querySelectorAll('[data-quality-filter]').forEach((item) => item.classList.toggle('active', item === button));
      renderRows();
    }));
    document.querySelector('.admin-tab[data-tab="calidad"]')?.addEventListener('click', () => {
      if ($('quality-table-body')?.textContent.includes('Diagnóstico pendiente')) run();
    });
  });
})();
