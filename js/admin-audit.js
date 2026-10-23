/* Bitacora compartida de publicaciones del Panel Admin. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  let pendingRestore = null;
  let overviewData = { backups: [], sources: [] };

  function render(rows) {
    $('audit-summary').textContent = rows.length ? `${rows.length} operación${rows.length === 1 ? '' : 'es'} reciente${rows.length === 1 ? '' : 's'} · los respaldos se conservan ocultos dentro del Google Sheets.` : 'Aún no hay publicaciones registradas en la nueva bitácora.';
    $('audit-table-body').innerHTML = rows.length ? rows.map((row) => {
      const ok = ['correcta', 'restaurada'].includes(String(row.Estado || '').toLowerCase());
      const sheet = String(row.Hoja || '');
      return `<tr><td><strong>${esc(row.Fecha || '—')}</strong></td><td><strong>${esc(sheet || '—')}</strong><small>${esc(row.Archivo || row.Origen || 'Sin archivo informado')}</small></td><td>${esc(row['Filas publicadas'] || '0')} filas<small>${esc(row.Modo || '—')}${row['Filas conservadas'] ? ` · ${esc(row['Filas conservadas'])} conservadas` : ''}</small></td><td>${esc(row.Usuario || 'Administrador')}</td><td><span class="audit-status ${ok ? 'ok' : 'bad'}">${esc(row.Estado || '—')}</span>${row.Detalle ? `<small>${esc(row.Detalle)}</small>` : ''}</td><td><span class="audit-backup">${esc(row.Respaldo || '—')}</span></td></tr>`;
    }).join('') : '<tr><td colspan="6" class="quality-empty">No hay operaciones registradas.</td></tr>';
  }

  function renderBackupHistory() {
    const filter = $('backup-sheet-filter')?.value || 'all';
    const matches = filter === 'all' ? overviewData.backups.slice(0, 15) : overviewData.backups.filter((item) => item.targetSheet === filter);
    $('backup-history-list').innerHTML = matches.length ? matches.map((item, index) => `<article class="backup-card">
      <div class="backup-card__number">${String(index + 1).padStart(2, '0')}</div>
      <div class="backup-card__copy"><strong>${esc(item.targetSheet)}</strong><span>${esc(item.createdAt || 'Fecha no disponible')}</span><small>${esc(item.sourceFile || 'Origen no registrado')} · ${Number(item.rows || 0).toLocaleString('es-MX')} filas · ${Number(item.columns || 0).toLocaleString('es-MX')} columnas</small></div>
      <button type="button" class="audit-restore" data-restore-sheet="${esc(item.targetSheet)}" data-restore-backup="${esc(item.backupSheet)}">Comparar y restaurar</button>
    </article>`).join('') : '<div class="backup-empty">Esta base todavía no tiene respaldos disponibles.</div>';
    $('backup-history-note').textContent = filter === 'all' && overviewData.backups.length > 15 ? `Mostrando los 15 más recientes de ${overviewData.backups.length}. Filtra una base para ver sus tres respaldos.` : `${matches.length} respaldo${matches.length === 1 ? '' : 's'} disponible${matches.length === 1 ? '' : 's'}. Se conservan hasta tres por base.`;
  }

  // Espacio del libro de Google Sheets (Apps Script v49+). Al llegar al 100%
  // Google rechaza cualquier publicacion, asi que se avisa desde el 75%.
  function renderWorkbookMeter(workbook) {
    const box = $('workbook-meter');
    if (!box) return;
    const pct = Number(workbook?.pct);
    if (!Number.isFinite(pct)) { box.hidden = true; return; }
    const level = pct >= 90 ? 'bad' : pct >= 75 ? 'warn' : 'ok';
    const nota = level === 'bad'
      ? 'Casi lleno: las publicaciones pueden bloquearse. Pide revisar respaldos o historial.'
      : level === 'warn' ? 'Se está llenando: conviene revisar el historial de las bases más grandes.' : 'Espacio suficiente para publicar.';
    const millones = (n) => (Number(n || 0) / 1e6).toLocaleString('es-MX', { maximumFractionDigits: 1 });
    box.className = `workbook-meter ${level}`;
    box.hidden = false;
    box.innerHTML = `<div class="workbook-meter__head"><span>Espacio del libro de Google Sheets</span><strong>${pct.toLocaleString('es-MX')}%</strong></div>
      <div class="workbook-meter__bar" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="Celdas usadas del libro"><i style="width:${Math.min(100, pct)}%"></i></div>
      <small>${millones(workbook.cells)} de ${millones(workbook.limit)} millones de celdas · ${nota}</small>`;
  }

  function renderOverview(result) {
    overviewData = { backups: Array.isArray(result.backups) ? result.backups : [], sources: Array.isArray(result.sources) ? result.sources : [] };
    const summary = result.summary || {};
    renderWorkbookMeter(result.workbook);
    $('admin-overview-summary').innerHTML = `
      <div class="overview-kpi"><span>Bases monitoreadas</span><strong>${Number(summary.sources || 0)}</strong></div>
      <div class="overview-kpi ok"><span>Con respaldo</span><strong>${Number(summary.withBackups || 0)}</strong></div>
      <div class="overview-kpi"><span>Respaldos vigentes</span><strong>${Number(summary.backups || 0)}</strong></div>
      <div class="overview-kpi ${Number(summary.attention || 0) ? 'warn' : 'ok'}"><span>Por revisar</span><strong>${Number(summary.attention || 0)}</strong></div>`;

    const sheets = [...new Set(overviewData.backups.map((item) => item.targetSheet))].sort((a, b) => a.localeCompare(b, 'es'));
    const filter = $('backup-sheet-filter');
    const previous = filter.value;
    filter.innerHTML = '<option value="all">Todos los dashboards</option>' + sheets.map((sheet) => `<option value="${esc(sheet)}">${esc(sheet)}</option>`).join('');
    filter.value = sheets.includes(previous) ? previous : 'all';
    renderBackupHistory();

    $('overview-sources-body').innerHTML = overviewData.sources.length ? overviewData.sources.map((source) => `<tr>
      <td><strong>${esc(source.sheet)}</strong></td>
      <td><span class="overview-health ${esc(source.health || 'neutral')}">${esc(source.healthLabel || 'Sin registro')}</span></td>
      <td>${esc(source.publishedAt || 'Sin publicación registrada')}${source.ageDays != null ? `<small>Hace ${Number(source.ageDays).toLocaleString('es-MX')} día${Number(source.ageDays) === 1 ? '' : 's'} · ${Number(source.publishedRows || 0).toLocaleString('es-MX')} filas</small>` : ''}</td>
      <td>${esc(source.latestBackup || 'Sin respaldo')}<small>${Number(source.backupCount || 0)} de 5 espacios usados</small></td>
    </tr>`).join('') : '<tr><td colspan="4" class="quality-empty">No fue posible construir el resumen operativo.</td></tr>';
  }

  function csvCell(value) {
    const text = String(value ?? '');
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function downloadSnapshot(kind) {
    if (!pendingRestore?.preview?.[kind]?.values) return;
    const values = pendingRestore.preview[kind].values;
    const csv = '\ufeff' + values.map((row) => row.map(csvCell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${pendingRestore.sheet}-${kind === 'current' ? 'estado-actual' : 'respaldo'}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function closeRestoreDialog() {
    const dialog = $('restore-dialog');
    if (dialog?.open) dialog.close();
    $('restore-confirm-input').value = '';
    $('restore-confirm-btn').disabled = true;
    $('restore-error').textContent = '';
    pendingRestore = null;
  }

  function showRestorePreview(preview, button) {
    pendingRestore = { sheet: preview.targetSheet, backup: preview.backupSheet, preview, sourceButton: button };
    $('restore-dialog-title').textContent = `Restaurar ${preview.targetSheet}`;
    $('restore-current-rows').textContent = `${Number(preview.current?.rows || 0).toLocaleString('es-MX')} filas`;
    $('restore-current-columns').textContent = `${Number(preview.current?.columns || 0).toLocaleString('es-MX')} columnas activas`;
    $('restore-backup-rows').textContent = `${Number(preview.backup?.rows || 0).toLocaleString('es-MX')} filas`;
    $('restore-backup-columns').textContent = `${Number(preview.backup?.columns || 0).toLocaleString('es-MX')} columnas guardadas`;
    $('restore-changed-rows').textContent = Number(preview.changedRows || 0).toLocaleString('es-MX');
    $('restore-changed-cells').textContent = Number(preview.changedCells || 0).toLocaleString('es-MX');
    $('restore-created-at').textContent = `Respaldo creado: ${preview.createdAt || 'fecha no disponible'}${preview.sourceFile ? ` · Origen: ${preview.sourceFile}` : ''}. El estado actual se guardará automáticamente antes de restaurar.`;
    $('restore-dialog').showModal();
    $('restore-confirm-input').focus();
  }

  async function openRestorePreview(button) {
    const sheet = button.dataset.restoreSheet || '';
    const backup = button.dataset.restoreBackup || '';
    if (!sheet || !backup) return;
    const ctx = window.OXXO_ADMIN_CTX;
    const original = button.textContent;
    button.disabled = true;
    button.textContent = 'Consultando…';
    try {
      const preview = await ctx.postAdminPayload({ action: 'getBackupPreview', adminPassword: ctx.getAdminPassword(), targetSheet: sheet, backupSheet: backup });
      if (preview.compatibilityMode) throw new Error('La versión publicada de Apps Script aún no permite comparar respaldos.');
      showRestorePreview(preview, button);
    } catch (error) {
      console.error('Vista previa de restauración:', error);
      alert('No se pudo consultar el respaldo: ' + (error.message || error));
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  }

  async function confirmRestore() {
    if (!pendingRestore || $('restore-confirm-input').value.trim().toUpperCase() !== 'RESTAURAR') return;
    const ctx = window.OXXO_ADMIN_CTX;
    const button = $('restore-confirm-btn');
    button.disabled = true;
    button.textContent = 'Restaurando…';
    $('restore-error').textContent = '';
    try {
      const result = await ctx.postAdminPayload({ action: 'restoreBackup', adminPassword: ctx.getAdminPassword(), targetSheet: pendingRestore.sheet, backupSheet: pendingRestore.backup, adminUser: 'Administrador' });
      if (result.compatibilityMode) throw new Error('No fue posible confirmar la restauración. Actualiza la bitácora antes de intentar nuevamente.');
      const restoredSheet = pendingRestore.sheet;
      OXXO.clearSheetDataCache(restoredSheet);
      closeRestoreDialog();
      alert(`${restoredSheet} se restauró correctamente con ${Number(result.rows || 0).toLocaleString('es-MX')} fila(s). El estado anterior quedó guardado para deshacer el cambio.`);
      await loadAudit();
    } catch (error) {
      console.error('Restauración administrativa:', error);
      $('restore-error').textContent = 'No se pudo restaurar: ' + (error.message || error);
      button.disabled = false;
      button.textContent = 'Restaurar respaldo';
    }
  }

  async function loadAudit() {
    const button = $('audit-refresh-btn');
    if (!button || button.disabled) return;
    const ctx = window.OXXO_ADMIN_CTX;
    if (!ctx?.postAdminPayload) return;
    button.disabled = true;
    button.textContent = 'Consultando…';
    $('audit-table-body').innerHTML = '<tr><td colspan="6" class="quality-empty">Consultando bitácora…</td></tr>';
    try {
      const result = await ctx.postAdminPayload({ action: 'getAdminOverview', adminPassword: ctx.getAdminPassword(), limit: 100 });
      if (result.compatibilityMode) throw new Error('La versión publicada de Apps Script aún no permite consultar la bitácora.');
      renderOverview(result);
      render(Array.isArray(result.rows) ? result.rows : []);
    } catch (error) {
      console.error('Bitácora administrativa:', error);
      $('audit-summary').textContent = error.message || 'No fue posible consultar la bitácora.';
      $('audit-table-body').innerHTML = '<tr><td colspan="6" class="quality-empty">No se pudo cargar la bitácora.</td></tr>';
    } finally {
      button.disabled = false;
      button.textContent = 'Actualizar resumen';
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('audit-refresh-btn')?.addEventListener('click', loadAudit);
    $('backup-history-list')?.addEventListener('click', (event) => {
      const button = event.target.closest('.audit-restore');
      if (button) openRestorePreview(button);
    });
    $('backup-sheet-filter')?.addEventListener('change', renderBackupHistory);
    $('restore-dialog-close')?.addEventListener('click', closeRestoreDialog);
    $('restore-cancel-btn')?.addEventListener('click', closeRestoreDialog);
    $('restore-dialog')?.addEventListener('cancel', (event) => { event.preventDefault(); closeRestoreDialog(); });
    $('restore-confirm-input')?.addEventListener('input', (event) => {
      $('restore-confirm-btn').disabled = event.target.value.trim().toUpperCase() !== 'RESTAURAR';
      $('restore-error').textContent = '';
    });
    $('restore-confirm-btn')?.addEventListener('click', confirmRestore);
    document.querySelectorAll('[data-restore-download]').forEach((button) => button.addEventListener('click', () => downloadSnapshot(button.dataset.restoreDownload)));
    document.querySelector('.admin-tab[data-tab="bitacora"]')?.addEventListener('click', () => {
      if ($('audit-table-body')?.textContent.includes('Bitácora pendiente')) loadAudit();
    });
  });
})();
