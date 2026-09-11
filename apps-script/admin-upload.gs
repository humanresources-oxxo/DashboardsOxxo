/**
 * DashboardsOxxo Admin Upload
 *
 * Flujo recomendado:
 * 1. Crear un proyecto en Google Apps Script.
 * 2. Pegar este archivo.
 * 3. Deploy > Web app.
 * 4. Execute as: Me.
 * 5. Who has access: Anyone with the link.
 * 6. Copiar la URL del Web App en SHEETS_CONFIG.ADMIN_UPLOAD_URL (js/core.js).
 *
 * Despues de eso, admin.html publica directo sin pedir URL.
 */
const SPREADSHEET_ID = '1EbUuyy-PRXiDwPmn9L14P93cGN6VXTyLfAHx-CE8M_A';
const APP_VERSION = '45';
const ADMIN_PASSWORD_PROPERTY = 'ADMIN_PASSWORD';
const AUDIT_SHEET = '_Admin_Bitacora';
const BACKUP_PREFIX = '_BK_';
const BACKUP_LIMIT = 5;
const MAX_UPLOAD_ROWS = 100000;
const MAX_UPLOAD_COLUMNS = 250;
const SYSTEM_NOTICES_SHEET = 'Avisos_Sistema';
const HOME_SHEET = '00_INICIO';
const STORE_CATALOG_SHEET = 'Catalogo_Tiendas';
const STORE_CATALOG_HEADERS = ['CR', 'Tienda', 'Region', 'Plaza', 'Zona', 'Asesor', 'ACTIVA', 'Fuente', 'Actualizado'];
const HOME_SHEET_ORDER = [
  HOME_SHEET,
  // Recursos Humanos
  'Dashboard_1_Diario',
  'Dashboard_2_Diario',
  'Dashboard_3_Diario',
  'Dashboard_4_Semanal',
  'Dashboard_5_Semanal',
  'Dashboard_6_Semanal',
  'Dashboard_7_Semanal',
  'Dashboard_8_Diario',
  'Dashboard_10_FLEX',
  'Dashboard_11_Semanal',
  'Dashboard_12_Mensual',
  'Dashboard_13_Ausentismo',
  STORE_CATALOG_SHEET,
  'Catalogo_Asesores',
  // Comercial
  'Dashboard_14_Comercial',
  'Promociones',
  'PromosD100',
  // Administrativo
  'Dashboard_9_Semanal',
  'Inventarios',
  // Soporte y configuracion
  'Dashboard_2_Otras_Plazas',
  'Denominaciones_Dashboard_2_Diario',
  'Dashboard_2_Plan_Accion',
  'Dashboard_3_Otras_Plazas',
  'Reasignaciones',
  'Avisos_Sistema',
  'Configuracion',
  '_Admin_Bitacora'
];
const SYSTEM_NOTICE_HEADERS = ['ID', 'Tipo', 'Destino', 'Titulo', 'Mensaje', 'Inicio', 'Fin', 'Activo', 'Creado', 'Actualizado'];
const ALLOWED_SHEETS = [
  'Dashboard_1_Diario',
  'Dashboard_2_Diario',
  'Dashboard_2_Otras_Plazas',
  'Denominaciones_Dashboard_2_Diario',
  'Dashboard_2_Plan_Accion',
  'Dashboard_3_Diario',
  'Dashboard_3_Otras_Plazas',
  'Dashboard_4_Semanal',
  'Dashboard_5_Semanal',
  'Dashboard_6_Semanal',
  'Dashboard_7_Semanal',
  'Dashboard_8_Diario',
  'Dashboard_9_Semanal',
  'Dashboard_10_FLEX',
  'Dashboard_11_Semanal',
  'Dashboard_12_Mensual',
  'Dashboard_13_Ausentismo',
  'Dashboard_14_Comercial',
  'Inventarios',
  STORE_CATALOG_SHEET,
  'Catalogo_Asesores',
  'Reasignaciones'
];

// Registro unico para la portada. Las claves coinciden con home-navigation.js
// y no con el nombre tecnico de las pestañas. Mantenerlo aqui permite que una
// publicacion nueva agregue su fila de Configuracion automaticamente y que la
// fecha siempre corresponda a una publicacion real, no a una visita al panel.
const CONFIG_DASHBOARD_REGISTRY = {
  d1: { name: 'Vacantes Diarias', frequency: 'Diario', sheet: 'Dashboard_1_Diario' },
  d2: { name: 'Bajas Diarias', frequency: 'Diario', sheet: 'Dashboard_2_Diario' },
  d3: { name: 'Aprovechamiento de Estructura', frequency: 'Diario', sheet: 'Dashboard_3_Diario' },
  s4: { name: 'Tiempo Extra', frequency: 'Semanal', sheet: 'Dashboard_4_Semanal' },
  s5: { name: 'Vacaciones', frequency: 'Semanal', sheet: 'Dashboard_5_Semanal' },
  s6: { name: 'Ausentismos', frequency: 'Semanal', sheet: 'Dashboard_6_Semanal' },
  s7: { name: 'TREO', frequency: 'Semanal', sheet: 'Dashboard_7_Semanal' },
  d8: { name: 'Capacidades 2026', frequency: 'Diario', sheet: 'Dashboard_8_Diario' },
  s9: { name: 'Faltantes y Sobrantes', frequency: 'Semanal', sheet: 'Dashboard_9_Semanal' },
  d10: { name: 'Personal FLEX', frequency: 'Diario', sheet: 'Dashboard_10_FLEX' },
  d11: { name: 'Cumplimiento de Marcajes', frequency: 'Semanal', sheet: 'Dashboard_11_Semanal' },
  m12: { name: 'Enfoque del Líder', frequency: 'Mensual', sheet: 'Dashboard_12_Mensual' },
  a13: { name: 'Control de Ausentismo', frequency: 'Mensual', sheet: 'Dashboard_13_Ausentismo' },
  c14: { name: 'Avance Comercial', frequency: 'Quincenal', sheet: 'Dashboard_14_Comercial' },
  inventories: { name: 'Resultados de Inventario', frequency: 'Mensual', sheet: 'Inventarios' },
  promos: { name: 'Promociones', frequency: 'Quincenal', sheet: 'Promociones' }
};

// action=readSheet&sheet=NOMBRE: lee una hoja completa via SpreadsheetApp (sin
// pasar por gviz). Necesario porque gviz corrompe la exportacion CSV de
// Catalogo_Asesores (fusiona ~109 de 263 filas en una sola celda), ver
// fetchCatalogRowsDirect() en core.js, que es quien llama esto. Sin accion (o
// con una desconocida) se mantiene el comportamiento original: listar
// ALLOWED_SHEETS para diagnostico rapido.
function doGet(e) {
  const action = String((e && e.parameter && e.parameter.action) || '');
  if (action === 'notices') {
    try {
      return jsonResponse({ ok: true, version: APP_VERSION, notices: getPublicSystemNotices() });
    } catch (error) {
      return jsonResponse({ ok: false, error: String(error.message || error), notices: [] });
    }
  }
  if (action === 'readSheet') {
    const sheetName = String((e && e.parameter && e.parameter.sheet) || '').trim();
    if (!sheetName) return jsonResponse({ ok: false, error: 'sheet requerido' });
    if (ALLOWED_SHEETS.indexOf(sheetName) === -1) return jsonResponse({ ok: false, error: 'sheet no permitido: ' + sheetName });
    try {
      const ss = SPREADSHEET_ID
        ? SpreadsheetApp.openById(SPREADSHEET_ID)
        : SpreadsheetApp.getActiveSpreadsheet();
      const sheet = ss.getSheetByName(sheetName);
      if (!sheet) return jsonResponse({ ok: false, error: 'hoja no encontrada: ' + sheetName });
      const values = sheet.getDataRange().getValues();
      return jsonResponse({ ok: true, version: APP_VERSION, values: values });
    } catch (error) {
      return jsonResponse({ ok: false, error: String(error.message || error) });
    }
  }
  return jsonResponse({ ok: true, app: 'DashboardsOxxo Admin Upload', version: APP_VERSION, sheets: ALLOWED_SHEETS });
}

/**
 * Reparacion segura de la estructura del libro.
 *
 * - Crea unicamente las pestanas de soporte que falten.
 * - No reemplaza ni modifica Catalogo_Asesores ni ninguna base existente.
 * - Crea Catalogo_Tiendas desde TREO si aun no existe.
 * - Oculta respaldos que por accidente hayan quedado visibles.
 *
 * Esta funcion se ejecuta manualmente una sola vez desde el editor de Apps
 * Script cuando se instala o recupera el proyecto.
 */
function repairSystemStructure() {
  const ss = SPREADSHEET_ID
    ? SpreadsheetApp.openById(SPREADSHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
  const requiredSupportSheets = [
    {
      name: 'Dashboard_2_Plan_Accion',
      headers: ['Hallazgo', 'Accion', 'Responsable', 'Plazo', 'Indicador', 'Prioridad']
    },
    {
      name: 'Reasignaciones',
      headers: ['CR', 'Tienda', 'Asesor_Entrante', 'Nota', 'Fecha']
    },
    {
      name: SYSTEM_NOTICES_SHEET,
      headers: SYSTEM_NOTICE_HEADERS
    }
  ];
  const created = [];
  const existing = [];
  requiredSupportSheets.forEach(function(definition) {
    let sheet = ss.getSheetByName(definition.name);
    if (sheet) {
      existing.push(definition.name);
      return;
    }
    sheet = ss.insertSheet(definition.name);
    writeWithBufferRow(sheet, [definition.headers], definition.headers.length);
    sheet.setFrozenRows(2);
    sheet.autoResizeColumns(1, definition.headers.length);
    created.push(definition.name);
  });

  const hiddenBackups = [];
  ss.getSheets().forEach(function(sheet) {
    if (sheet.getName().indexOf(BACKUP_PREFIX) !== 0 || sheet.isSheetHidden()) return;
    sheet.hideSheet();
    hiddenBackups.push(sheet.getName());
  });
  const storeCatalog = safeRebuildStoreCatalogFromTreo_(ss);
  const home = ensureHomeSheet_(ss);
  SpreadsheetApp.flush();
  return {
    ok: true,
    created: created,
    alreadyExisted: existing,
    hiddenBackups: hiddenBackups,
    homeSheet: home.getName(),
    catalogUntouched: true,
    storeCatalog: storeCatalog
  };
}

/**
 * Crea o reconstruye la portada navegable del libro sin modificar ninguna BD.
 * Se puede ejecutar manualmente desde Apps Script cuando se reorganicen hojas.
 */
function refreshHomeSheet() {
  const ss = SPREADSHEET_ID
    ? SpreadsheetApp.openById(SPREADSHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
  const home = ensureHomeSheet_(ss);
  SpreadsheetApp.flush();
  return { ok: true, sheet: home.getName(), databases: home.getRange('K3').getValue() };
}

/**
 * Convierte a texto uniforme las columnas que Google Sheets puede inferir
 * parcialmente como fecha o numero. Esto repara hojas ya publicadas con una
 * mezcla de valores (por ejemplo, "26/08/2026" y "sep-26" en Mes), que hace
 * que gviz oculte filas aun cuando se ven correctamente dentro del Sheet.
 *
 * Se ejecuta manualmente una vez después de instalar esta versión. No cambia
 * ninguna cifra: los Date reales se conservan como yyyy-MM-dd y el resto se
 * reescribe exactamente como texto visible.
 */
function repairPublishedTextColumns() {
  const ss = SPREADSHEET_ID
    ? SpreadsheetApp.openById(SPREADSHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
  const repaired = [];
  ALLOWED_SHEETS.forEach(function(sheetName) {
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet || sheet.getLastRow() < 2 || sheet.getLastColumn() < 1) return;
    const values = sheet.getDataRange().getValues();
    const hasBuffer = values.length && values[0].length && values[0].every(function(value) {
      return normalizeCell(value) === BUFFER_ROW_VALUE;
    });
    const headerIndex = hasBuffer ? 1 : 0;
    const headers = (values[headerIndex] || []).map(String);
    const firstDataRow = headerIndex + 2;
    const rowCount = sheet.getLastRow() - firstDataRow + 1;
    if (rowCount < 1) return;
    const columns = [];
    const textTargets = new Set(PUBLISHED_TEXT_COLUMNS.map(normalizeHeader));
    headers.forEach(function(header, columnIndex) {
      if (!textTargets.has(normalizeHeader(header))) return;
      const range = sheet.getRange(firstDataRow, columnIndex + 1, rowCount, 1);
      const rawColumn = range.getValues();
      const displayColumn = range.getDisplayValues();
      const normalized = rawColumn.map(function(row, rowIndex) {
        const value = row[0];
        if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value)) {
          return [Utilities.formatDate(value, ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd')];
        }
        return [String(displayColumn[rowIndex][0] == null ? '' : displayColumn[rowIndex][0])];
      });
      range.setNumberFormat('@');
      range.setValues(normalized);
      columns.push(header);
    });
    if (columns.length) repaired.push({ sheet: sheetName, rows: rowCount, columns: columns });
  });
  SpreadsheetApp.flush();
  return { ok: true, sheets: repaired.length, repaired: repaired };
}

function doPost(e) {
  try {
    const payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (String(payload.action || '') === 'auth') {
      assertAuthorized(payload);
      return jsonResponse({ ok: true, authenticated: true });
    }

    assertAuthorized(payload);

    if (String(payload.action || '') === 'getAudit') {
      return jsonResponse(readAudit(Number(payload.limit || 100)));
    }

    if (String(payload.action || '') === 'getAdminOverview') {
      return jsonResponse(getAdminOverview(Number(payload.limit || 100)));
    }

    if (String(payload.action || '') === 'getSystemNotices') {
      return jsonResponse({ ok: true, notices: readSystemNotices(true) });
    }

    if (String(payload.action || '') === 'refreshHomeSheet') {
      const homeLock = LockService.getScriptLock();
      homeLock.waitLock(30000);
      try {
        return jsonResponse(refreshHomeSheet());
      } finally {
        homeLock.releaseLock();
      }
    }

    if (String(payload.action || '') === 'saveSystemNotice') {
      const noticeLock = LockService.getScriptLock();
      noticeLock.waitLock(30000);
      try {
        return jsonResponse(saveSystemNotice(payload));
      } finally {
        noticeLock.releaseLock();
      }
    }

    if (String(payload.action || '') === 'setSystemNoticeStatus') {
      const noticeStatusLock = LockService.getScriptLock();
      noticeStatusLock.waitLock(30000);
      try {
        return jsonResponse(setSystemNoticeStatus(payload));
      } finally {
        noticeStatusLock.releaseLock();
      }
    }

    if (String(payload.action || '') === 'preflight') {
      return jsonResponse(preflightPublication(payload));
    }

    if (String(payload.action || '') === 'getBackupPreview') {
      return jsonResponse(getBackupPreview(payload));
    }

    if (String(payload.action || '') === 'restoreBackup') {
      const restoreLock = LockService.getScriptLock();
      restoreLock.waitLock(30000);
      try {
        return jsonResponse(restoreLatestBackup(payload));
      } finally {
        restoreLock.releaseLock();
      }
    }

    // Fecha automatica: cada publish() en admin.js llama esta accion aparte
    // despues de publicar, para que "Ultima actualizacion" en la portada
    // (index.html) ya no dependa de que alguien la edite a mano en la hoja
    // Configuracion — siempre queda igual a la fecha real del ultimo publish.
    if (String(payload.action || '') === 'updateConfigDate') {
      const lock = LockService.getScriptLock();
      lock.waitLock(30000);
      try {
        return jsonResponse(updateConfigDate(String(payload.dashboardId || '').trim()));
      } finally {
        lock.releaseLock();
      }
    }

    const targetSheet = String(payload.targetSheet || '').trim();
    const rows = Array.isArray(payload.rows) ? payload.rows : [];
    const updateMode = String(payload.updateMode || 'replaceAll').trim();
    const periodColumn = String(payload.periodColumn || '').trim();
    const periodValues = Array.isArray(payload.periodValues) ? payload.periodValues.map(normalizeCell).filter(Boolean) : [];
    const scopeColumns = normalizeScopeColumns(payload.scopeColumns);
    const requiredHeaders = Array.isArray(payload.requiredHeaders) ? payload.requiredHeaders.map(String).filter(Boolean) : [];

    validatePublicationRequest(targetSheet, rows, updateMode, periodColumn, periodValues, requiredHeaders, scopeColumns);

    const lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      const ss = SPREADSHEET_ID
        ? SpreadsheetApp.openById(SPREADSHEET_ID)
        : SpreadsheetApp.getActiveSpreadsheet();
      let sheet = ss.getSheetByName(targetSheet);
      if (!sheet) sheet = ss.insertSheet(targetSheet);

      const newHeaders = collectHeaders(rows);

      let backupName = '';
      let result;
      try {
        backupName = backupCurrentSheet(ss, sheet, targetSheet, String(payload.sourceFile || payload.source || 'Publicación desde Panel Admin'));
        result = updateMode === 'replacePeriod'
          ? replacePeriod(sheet, rows, newHeaders, periodColumn, periodValues, scopeColumns)
          : scopeColumns.length
            ? replaceScope(sheet, rows, newHeaders, scopeColumns)
            : replaceAll(sheet, rows, newHeaders);

        // TREO es la fuente oficial de tiendas operativas. Una vez que su
        // publicación queda escrita (incluidas las demás plazas conservadas
        // por replaceScope), se reconstruye un catálogo independiente y
        // deduplicado por CR para que todos los dashboards compartan el mismo
        // universo de tiendas activas.
        if (targetSheet === 'Dashboard_7_Semanal') {
          result.storeCatalog = safeRebuildStoreCatalogFromTreo_(ss);
        }

        appendAudit(ss, payload, result, 'Correcta', '', backupName);
      } catch (publishError) {
        appendAudit(ss, payload, { mode: updateMode, rows: rows.length, keptRows: 0 }, 'Error', String(publishError.message || publishError), backupName);
        throw publishError;
      }

      sheet.setFrozenRows(2); // fila 1 = sacrificio, fila 2 = encabezados reales
      sheet.autoResizeColumns(1, Math.min(result.columns, 20));
      const verification = verifyPublishedSheet(sheet, result, newHeaders);
      ensureHomeSheet_(ss);

      return jsonResponse({
        ok: true,
        version: APP_VERSION,
        targetSheet: targetSheet,
        mode: result.mode,
        periodColumn: result.periodColumn || '',
        periodValues: result.periodValues || [],
        scopeColumns: result.scopeColumns || [],
        scopeKeys: result.scopeKeys || [],
        rows: result.rows,
        keptRows: result.keptRows || 0,
        columns: result.columns,
        backupSheet: backupName,
        audited: true,
        verification: verification,
        storeCatalog: result.storeCatalog || null,
        orphanedColumns: result.orphanedColumns || []
      });
    } finally {
      lock.releaseLock();
    }
  } catch (error) {
    return jsonResponse({ ok: false, error: String(error.message || error) });
  }
}

function ensureHomeSheet_(ss) {
  let home = ss.getSheetByName(HOME_SHEET);
  if (!home) home = ss.insertSheet(HOME_SHEET);

  const previousActive = ss.getActiveSheet();
  reorderSheets_(ss);

  const minimumRows = 90;
  const minimumColumns = 14;
  if (home.getMaxRows() < minimumRows) home.insertRowsAfter(home.getMaxRows(), minimumRows - home.getMaxRows());
  if (home.getMaxColumns() < minimumColumns) home.insertColumnsAfter(home.getMaxColumns(), minimumColumns - home.getMaxColumns());
  const canvas = home.getRange(1, 1, home.getMaxRows(), home.getMaxColumns());
  canvas.breakApart();
  canvas.clear();
  canvas.setBackground('#F7F3EF').setFontFamily('Arial').setVerticalAlignment('middle');
  home.setHiddenGridlines(true);
  home.setTabColor('#E3182D');
  home.setFrozenRows(4);

  for (let column = 1; column <= minimumColumns; column++) {
    home.setColumnWidth(column, [5, 10].indexOf(column) !== -1 ? 24 : 92);
  }
  home.setRowHeight(1, 18);
  home.setRowHeight(2, 46);
  home.setRowHeight(3, 28);
  home.setRowHeight(4, 18);

  home.getRange('A2:J2').merge().setValue('CENTRO DE DATOS · DASHBOARDS ATS')
    .setFontSize(20).setFontWeight('bold').setFontColor('#FFFFFF')
    .setBackground('#B51224').setHorizontalAlignment('left');
  home.getRange('A3:J3').merge().setValue('Acceso directo a las bases publicadas en Google Sheets')
    .setFontSize(10).setFontColor('#FFE6E8').setBackground('#B51224');
  home.getRange('K2:N2').merge().setValue('BASES DISPONIBLES')
    .setFontSize(9).setFontWeight('bold').setFontColor('#FFE6E8')
    .setBackground('#7D0C18').setHorizontalAlignment('center');

  const sheets = ss.getSheets().filter(function(sheet) {
    const name = sheet.getName();
    return name !== HOME_SHEET && name.indexOf(BACKUP_PREFIX) !== 0 && !sheet.isSheetHidden();
  });
  home.getRange('K3:N3').merge().setValue(sheets.length)
    .setFontSize(18).setFontWeight('bold').setFontColor('#FFFFFF')
    .setBackground('#7D0C18').setHorizontalAlignment('center');
  home.getRange('K2').setNote(String(sheets.length) + ' bases visibles');

  const groups = [
    {
      title: 'RECURSOS HUMANOS', color: '#E3182D', soft: '#FFF0F2',
      sheets: ['Dashboard_1_Diario', 'Dashboard_2_Diario', 'Dashboard_3_Diario', 'Dashboard_4_Semanal', 'Dashboard_5_Semanal', 'Dashboard_6_Semanal', 'Dashboard_7_Semanal', 'Dashboard_8_Diario', 'Dashboard_10_FLEX', 'Dashboard_11_Semanal', 'Dashboard_12_Mensual', 'Dashboard_13_Ausentismo', STORE_CATALOG_SHEET, 'Catalogo_Asesores']
    },
    {
      title: 'COMERCIAL', color: '#1479A8', soft: '#EDF8FC',
      sheets: ['Dashboard_14_Comercial', 'Promociones', 'PromosD100']
    },
    {
      title: 'ADMINISTRATIVO', color: '#7155A3', soft: '#F4F0FB',
      sheets: ['Dashboard_9_Semanal', 'Inventarios']
    },
    {
      title: 'SOPORTE Y CONFIGURACION', color: '#5C514B', soft: '#F2EFED',
      sheets: ['Dashboard_2_Otras_Plazas', 'Denominaciones_Dashboard_2_Diario', 'Dashboard_2_Plan_Accion', 'Dashboard_3_Otras_Plazas', 'Reasignaciones', 'Avisos_Sistema', 'Configuracion', '_Admin_Bitacora']
    }
  ];

  const assigned = {};
  let row = 6;
  groups.forEach(function(group) {
    const groupSheets = group.sheets.map(function(name) { return ss.getSheetByName(name); }).filter(function(sheet) {
      if (!sheet || sheet.isSheetHidden() || sheet.getName().indexOf(BACKUP_PREFIX) === 0) return false;
      assigned[sheet.getName()] = true;
      return true;
    });
    if (!groupSheets.length) return;
    row = renderHomeGroup_(ss, home, row, group.title, group.color, group.soft, groupSheets);
  });

  const otherSheets = sheets.filter(function(sheet) { return !assigned[sheet.getName()]; });
  if (otherSheets.length) {
    row = renderHomeGroup_(ss, home, row, 'OTRAS BASES', '#5C514B', '#F2EFED', otherSheets);
  }

  home.getRange(row + 1, 1, 2, 14).merge().setValue('Esta portada se actualiza automáticamente después de cada publicación. No reemplaza ni modifica el contenido de las bases.')
    .setFontSize(9).setFontColor('#776A64').setHorizontalAlignment('center');
  home.getRange(1, 1, row + 3, 14).setWrap(true);

  if (previousActive && previousActive.getSheetId() !== home.getSheetId() && ss.getSheetByName(previousActive.getName())) {
    ss.setActiveSheet(previousActive);
  }
  return home;
}

function reorderSheets_(ss) {
  const byName = {};
  ss.getSheets().forEach(function(sheet) { byName[sheet.getName()] = sheet; });
  const ordered = [];
  const included = {};
  HOME_SHEET_ORDER.forEach(function(name) {
    const sheet = byName[name];
    if (!sheet || sheet.isSheetHidden() || included[name]) return;
    ordered.push(sheet);
    included[name] = true;
  });
  // Una base nueva que todavia no tenga clasificacion queda visible al final,
  // nunca mezclada entre respaldos ocultos.
  ss.getSheets().forEach(function(sheet) {
    if (sheet.isSheetHidden() || sheet.getName().indexOf(BACKUP_PREFIX) === 0 || included[sheet.getName()]) return;
    ordered.push(sheet);
    included[sheet.getName()] = true;
  });
  ordered.forEach(function(sheet, index) {
    ss.setActiveSheet(sheet);
    ss.moveActiveSheet(index + 1);
  });
}

function renderHomeGroup_(ss, home, startRow, title, color, softColor, sheets) {
  const starts = [1, 6, 11];
  home.getRange(startRow, 1, 1, 14).merge().setValue(title)
    .setFontSize(11).setFontWeight('bold').setFontColor(color)
    .setHorizontalAlignment('left');
  home.setRowHeight(startRow, 30);

  sheets.forEach(function(sheet, index) {
    const cardRow = startRow + 1 + Math.floor(index / 3) * 3;
    const cardColumn = starts[index % 3];
    const titleRange = home.getRange(cardRow, cardColumn, 1, 4);
    const detailRange = home.getRange(cardRow + 1, cardColumn, 1, 4);
    titleRange.merge().setValue(homeSheetLabel_(sheet.getName()))
      .setFontSize(10).setFontWeight('bold').setFontColor('#2A211E')
      .setBackground('#FFFFFF').setHorizontalAlignment('left');
    const rowCount = Math.max(0, sheet.getLastRow() - (ALLOWED_SHEETS.indexOf(sheet.getName()) !== -1 ? 2 : 1));
    const columnCount = sheet.getLastColumn();
    const linkText = 'ABRIR BASE  →    ' + rowCount + ' filas · ' + columnCount + ' columnas';
    const richLink = SpreadsheetApp.newRichTextValue()
      .setText(linkText)
      .setLinkUrl(ss.getUrl() + '#gid=' + sheet.getSheetId())
      .build();
    detailRange.merge().setRichTextValue(richLink)
      .setFontSize(8).setFontColor(color).setBackground(softColor)
      .setHorizontalAlignment('left');
    home.getRange(cardRow, cardColumn, 2, 4).setBorder(true, true, true, true, false, false, '#E2D8D3', SpreadsheetApp.BorderStyle.SOLID);
    home.getRange(cardRow, cardColumn, 2, 1).setBorder(null, true, null, null, null, null, color, SpreadsheetApp.BorderStyle.SOLID_THICK);
    home.setRowHeight(cardRow, 32);
    home.setRowHeight(cardRow + 1, 28);
    home.setRowHeight(cardRow + 2, 10);
  });
  return startRow + 1 + Math.ceil(sheets.length / 3) * 3;
}

function homeSheetLabel_(sheetName) {
  const labels = {
    Dashboard_1_Diario: 'Vacantes diarias', Dashboard_2_Diario: 'Bajas diarias',
    Dashboard_3_Diario: 'Aprovechamiento de estructura', Dashboard_4_Semanal: 'Tiempo extra',
    Dashboard_5_Semanal: 'Vacaciones', Dashboard_6_Semanal: 'Ausentismos',
    Dashboard_7_Semanal: 'TREO', Dashboard_8_Diario: 'Capacidades',
    Dashboard_9_Semanal: 'Faltantes y sobrantes', Dashboard_10_FLEX: 'Personal FLEX',
    Dashboard_11_Semanal: 'Marcajes semanales', Dashboard_12_Mensual: 'Enfoque de líder',
    Dashboard_13_Ausentismo: 'Control de ausentismo', Dashboard_14_Comercial: 'Avance comercial',
    Inventarios: 'Resultados de inventario', Catalogo_Tiendas: 'Catálogo de tiendas activas', Catalogo_Asesores: 'Catálogo de asesores',
    Promociones: 'Promociones', PromosD100: 'PromosD100', Reasignaciones: 'Reasignaciones',
    Avisos_Sistema: 'Avisos del sistema', Configuracion: 'Configuración',
    _Admin_Bitacora: 'Bitácora administrativa'
  };
  return labels[sheetName] || String(sheetName).replace(/_/g, ' ');
}

function validatePublicationRequest(targetSheet, rows, updateMode, periodColumn, periodValues, requiredHeaders, scopeColumns) {
  if (!targetSheet) throw new Error('targetSheet requerido');
  if (ALLOWED_SHEETS.indexOf(targetSheet) === -1) throw new Error('targetSheet no permitido: ' + targetSheet);
  if (updateMode !== 'replaceAll' && updateMode !== 'replacePeriod') throw new Error('Modo de publicación no permitido: ' + updateMode);
  if (!Array.isArray(rows) || !rows.length) throw new Error('El archivo no contiene filas para publicar');
  if (rows.length > MAX_UPLOAD_ROWS) throw new Error('El archivo supera el máximo de ' + MAX_UPLOAD_ROWS + ' filas');

  const headers = collectHeaders(rows);
  if (!headers.length) throw new Error('Sin columnas para publicar');
  if (headers.length > MAX_UPLOAD_COLUMNS) throw new Error('El archivo supera el máximo de ' + MAX_UPLOAD_COLUMNS + ' columnas');
  if (headers.some(function(header) { return !String(header || '').trim(); })) throw new Error('Hay encabezados vacíos');

  const normalizedHeaders = headers.map(normalizeHeader);
  const missing = (requiredHeaders || []).filter(function(header) {
    return normalizedHeaders.indexOf(normalizeHeader(header)) === -1;
  });
  if (missing.length) throw new Error('Faltan encabezados obligatorios: ' + missing.join(', '));

  const emptyRequired = (requiredHeaders || []).filter(function(header) {
    const actual = headers.find(function(candidate) { return normalizeHeader(candidate) === normalizeHeader(header); });
    return actual && !rows.some(function(row) { return normalizeCell(row[actual]) !== ''; });
  });
  if (emptyRequired.length) throw new Error('Las columnas obligatorias vienen vacías: ' + emptyRequired.join(', '));

  const blankRows = rows.filter(function(row) {
    return !row || !Object.keys(row).some(function(header) { return normalizeCell(row[header]) !== ''; });
  }).length;
  if (blankRows) throw new Error('Se detectaron ' + blankRows + ' filas completamente vacías');

  if (updateMode === 'replacePeriod') {
    if (!periodColumn) throw new Error('replacePeriod requiere periodColumn; se bloqueó el reemplazo total por seguridad');
    if (!periodValues || !periodValues.length) throw new Error('replacePeriod requiere periodValues; se bloqueó el reemplazo total por seguridad');
    if (normalizedHeaders.indexOf(normalizeHeader(periodColumn)) === -1) throw new Error('La columna de periodo no existe en los datos: ' + periodColumn);
  }
  (scopeColumns || []).forEach(function(column) {
    if (normalizedHeaders.indexOf(normalizeHeader(column)) === -1) throw new Error('La columna de alcance no existe en los datos: ' + column);
    const actual = headers.find(function(candidate) { return normalizeHeader(candidate) === normalizeHeader(column); });
    if (!rows.every(function(row) { return normalizeCell(row[actual]) !== ''; })) throw new Error('La columna de alcance contiene filas vacias: ' + column);
  });
  return { headers: headers };
}

function sheetPublicationLayout(sheet) {
  if (!sheet || sheet.getLastRow() < 1 || sheet.getLastColumn() < 1) return { headers: [], rows: [] };
  const values = sheet.getDataRange().getDisplayValues();
  const hasBuffer = values.length && values[0].length && values[0].every(function(value) { return normalizeCell(value) === BUFFER_ROW_VALUE; });
  const headerIndex = hasBuffer ? 1 : 0;
  const headers = values[headerIndex] ? values[headerIndex].map(String) : [];
  const rows = values.slice(headerIndex + 1).filter(function(row) {
    return row.some(function(value) { return normalizeCell(value) !== ''; });
  });
  return { headers: headers, rows: rows };
}

/**
 * Reconstruye el catálogo maestro de tiendas activas desde la fotografía
 * vigente de TREO. Dashboard_7_Semanal ya conserva por plaza el último
 * archivo publicado, por lo que su contenido completo representa el universo
 * operativo regional actual. El CR es la llave; el nombre solo es etiqueta.
 */
function rebuildStoreCatalogFromTreo_(ss) {
  const source = ss.getSheetByName('Dashboard_7_Semanal');
  let target = ss.getSheetByName(STORE_CATALOG_SHEET);
  if (!target) target = ss.insertSheet(STORE_CATALOG_SHEET);
  if (!source || source.getLastRow() < 2) {
    writeWithBufferRow(target, [STORE_CATALOG_HEADERS], STORE_CATALOG_HEADERS.length);
    target.setFrozenRows(2);
    return { ok: false, rows: 0, source: 'Dashboard_7_Semanal', reason: 'TREO sin datos' };
  }

  const layout = sheetPublicationLayout(source);
  const indexes = {};
  const indexOf = function() {
    const aliases = Array.prototype.slice.call(arguments).map(normalizeHeader);
    for (let aliasIndex = 0; aliasIndex < aliases.length; aliasIndex++) {
      for (let i = 0; i < layout.headers.length; i++) {
        if (normalizeHeader(layout.headers[i]) === aliases[aliasIndex]) return i;
      }
    }
    return -1;
  };
  indexes.cr = indexOf('CR', 'CR TIENDA', 'CR Reg', 'ID Tienda');
  indexes.tienda = indexOf('Tienda', 'Unidad org', 'Unidad organizativa');
  indexes.region = indexOf('Region');
  indexes.plaza = indexOf('Plaza');
  indexes.zona = indexOf('Zona');
  indexes.asesor = indexOf('Asesor', 'AT');
  if (indexes.cr < 0 || indexes.tienda < 0 || indexes.plaza < 0) {
    throw new Error('TREO no contiene CR, Tienda y Plaza para reconstruir ' + STORE_CATALOG_SHEET);
  }

  const today = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone() || 'America/Mexico_City', 'yyyy-MM-dd HH:mm');
  const byCr = {};
  layout.rows.forEach(function(values) {
    const cr = normalizeCell(values[indexes.cr]).toUpperCase().replace(/[^A-Z0-9]/g, '');
    const tienda = normalizeCell(values[indexes.tienda]);
    const tiendaToken = normalizeHeader(tienda);
    const plaza = normalizeCell(values[indexes.plaza]);
    if (!cr || !tienda || !plaza || tiendaToken.indexOf('entrenamiento') !== -1 || tiendaToken.indexOf('operaciones') !== -1) return;
    const candidate = {
      CR: cr,
      Tienda: tienda,
      Region: indexes.region >= 0 ? normalizeCell(values[indexes.region]) : 'TABASCO',
      Plaza: plaza,
      Zona: indexes.zona >= 0 ? normalizeCell(values[indexes.zona]) : '',
      Asesor: indexes.asesor >= 0 ? normalizeCell(values[indexes.asesor]) : '',
      ACTIVA: 'SI',
      Fuente: 'Dashboard_7_Semanal · TREO',
      Actualizado: today
    };
    // Si TREO trae el mismo CR más de una vez, conservar la fila con asesor.
    if (!byCr[cr] || (!byCr[cr].Asesor && candidate.Asesor)) byCr[cr] = candidate;
  });

  const rows = Object.keys(byCr).map(function(cr) { return byCr[cr]; }).sort(function(a, b) {
    const plazaOrder = String(a.Plaza).localeCompare(String(b.Plaza));
    return plazaOrder || String(a.Tienda).localeCompare(String(b.Tienda));
  });
  writeWithBufferRow(target, rowsToValues(rows, STORE_CATALOG_HEADERS), STORE_CATALOG_HEADERS.length);
  target.setFrozenRows(2);
  target.setTabColor('#16A34A');
  target.autoResizeColumns(1, STORE_CATALOG_HEADERS.length);
  return { ok: true, rows: rows.length, source: 'Dashboard_7_Semanal', updatedAt: today };
}

function safeRebuildStoreCatalogFromTreo_(ss) {
  try {
    return rebuildStoreCatalogFromTreo_(ss);
  } catch (error) {
    // TREO ya pudo haberse publicado. Vaciar el catálogo derivado obliga al
    // navegador a usar TREO directamente y evita conservar un catálogo viejo.
    let target = ss.getSheetByName(STORE_CATALOG_SHEET);
    if (!target) target = ss.insertSheet(STORE_CATALOG_SHEET);
    writeWithBufferRow(target, [STORE_CATALOG_HEADERS], STORE_CATALOG_HEADERS.length);
    target.setFrozenRows(2);
    return { ok: false, rows: 0, source: 'Dashboard_7_Semanal', error: String(error.message || error) };
  }
}

function preflightPublication(payload) {
  const targetSheet = String(payload.targetSheet || '').trim();
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  const updateMode = String(payload.updateMode || 'replaceAll').trim();
  const periodColumn = String(payload.periodColumn || '').trim();
  const periodValues = Array.isArray(payload.periodValues) ? payload.periodValues.map(normalizeCell).filter(Boolean) : [];
  const scopeColumns = normalizeScopeColumns(payload.scopeColumns);
  const requiredHeaders = Array.isArray(payload.requiredHeaders) ? payload.requiredHeaders.map(String).filter(Boolean) : [];
  const validated = validatePublicationRequest(targetSheet, rows, updateMode, periodColumn, periodValues, requiredHeaders, scopeColumns);
  const ss = SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(targetSheet);
  const layout = sheetPublicationLayout(sheet);
  const currentRows = layout.rows.length;
  let replacedRows = currentRows;
  let projectedRows = rows.length;

  const incomingScopeKeys = scopeKeysFromObjects(rows, scopeColumns);
  if (updateMode === 'replacePeriod') {
    const periodIndex = findHeaderIndex(layout.headers, periodColumn);
    if (currentRows && periodIndex < 0) throw new Error('La hoja actual no contiene la columna de periodo ' + periodColumn + '; no se modificó nada');
    const periodSet = {};
    periodValues.forEach(function(value) { periodSet[normalizePeriodValue(value, periodColumn)] = true; });
    replacedRows = periodIndex < 0 ? 0 : layout.rows.filter(function(row) {
      const scopeMatches = !scopeColumns.length || incomingScopeKeys.indexOf(scopeKeyFromArray(layout.headers, row, scopeColumns)) !== -1;
      return scopeMatches && Boolean(periodSet[normalizePeriodValue(row[periodIndex], periodColumn)]);
    }).length;
    projectedRows = currentRows - replacedRows + rows.length;
  } else if (scopeColumns.length) {
    replacedRows = layout.rows.filter(function(row) {
      return incomingScopeKeys.indexOf(scopeKeyFromArray(layout.headers, row, scopeColumns)) !== -1;
    }).length;
    projectedRows = currentRows - replacedRows + rows.length;
  }

  return {
    ok: true,
    version: APP_VERSION,
    targetSheet: targetSheet,
    mode: updateMode,
    currentRows: currentRows,
    incomingRows: rows.length,
    replacedRows: replacedRows,
    projectedRows: projectedRows,
    columns: validated.headers.length,
    willCreateBackup: Boolean(sheet && sheet.getLastRow() > 0),
    periodColumn: periodColumn,
    periodValues: periodValues,
    scopeColumns: scopeColumns,
    scopeKeys: incomingScopeKeys
  };
}

function backupCurrentSheet(ss, sourceSheet, targetSheet, sourceLabel) {
  if (!sourceSheet || sourceSheet.getLastRow() < 1 || sourceSheet.getLastColumn() < 1) return '';
  return saveSnapshot(ss, targetSheet, sourceSheet.getDataRange().getValues(), sourceLabel);
}

function saveSnapshot(ss, targetSheet, values, sourceLabel) {
  if (!values.length || !values[0].length) throw new Error('No hay datos para respaldar');
  const createdAt = new Date();
  const stamp = Utilities.formatDate(createdAt, ss.getSpreadsheetTimeZone() || 'America/Mexico_City', 'yyyyMMdd_HHmmss_SSS');
  const baseName = (BACKUP_PREFIX + targetSheet).slice(0, 76);
  let backupName = (baseName + '_' + stamp).slice(0, 99);
  let suffix = 2;
  while (ss.getSheetByName(backupName)) {
    backupName = (baseName + '_' + stamp + '_' + suffix).slice(0, 99);
    suffix++;
  }
  const backup = ss.insertSheet(backupName);
  const requiredRows = values.length + 2;
  const requiredCols = Math.max(values[0].length, 6);
  if (backup.getMaxRows() < requiredRows) backup.insertRowsAfter(backup.getMaxRows(), requiredRows - backup.getMaxRows());
  if (backup.getMaxColumns() < requiredCols) backup.insertColumnsAfter(backup.getMaxColumns(), requiredCols - backup.getMaxColumns());
  backup.getRange(1, 1, 1, 6).setValues([['Respaldo creado', createdAt, 'Hoja origen', targetSheet, 'Archivo origen', String(sourceLabel || '')]]);
  backup.getRange(3, 1, values.length, values[0].length).setValues(values);
  backup.hideSheet();
  SpreadsheetApp.flush();
  pruneBackups(ss, targetSheet, BACKUP_LIMIT);
  return backupName;
}

function readBackupMetadata(ss, targetSheet) {
  const timezone = ss.getSpreadsheetTimeZone() || 'America/Mexico_City';
  const items = [];
  ss.getSheets().forEach(function(sheet) {
    if (sheet.getName().indexOf(BACKUP_PREFIX) !== 0 || sheet.getLastRow() < 3) return;
    const metadata = sheet.getRange(1, 1, 1, 6).getValues()[0];
    const origin = String(metadata[3] || '').trim();
    if (!origin || (targetSheet && origin !== targetSheet)) return;
    const createdValue = metadata[1];
    const createdMillis = Object.prototype.toString.call(createdValue) === '[object Date]' && !isNaN(createdValue) ? createdValue.getTime() : 0;
    items.push({
      sheet: sheet,
      backupSheet: sheet.getName(),
      targetSheet: origin,
      createdAt: createdMillis ? Utilities.formatDate(createdValue, timezone, 'dd/MM/yyyy HH:mm:ss') : 'Fecha no disponible',
      createdMillis: createdMillis,
      sourceFile: String(metadata[5] || ''),
      rows: Math.max(0, sheet.getLastRow() - 4),
      columns: sheet.getLastColumn()
    });
  });
  return items.sort(function(a, b) { return b.createdMillis - a.createdMillis; });
}

function pruneBackups(ss, targetSheet, limit) {
  const backups = readBackupMetadata(ss, targetSheet);
  backups.slice(Math.max(1, Number(limit || BACKUP_LIMIT))).forEach(function(item) {
    ss.deleteSheet(item.sheet);
  });
}

function resolveBackup(ss, targetSheet, requestedBackup) {
  const backups = readBackupMetadata(ss, targetSheet);
  if (!backups.length) throw new Error('No existe un respaldo disponible para ' + targetSheet);
  const selected = requestedBackup ? backups.find(function(item) { return item.backupSheet === requestedBackup; }) : backups[0];
  if (!selected) throw new Error('El respaldo no corresponde a la hoja seleccionada o ya vencio');
  return selected;
}

function writeSnapshot(sheet, values) {
  if (!values.length || !values[0].length) throw new Error('El respaldo esta vacio');
  const previousRows = sheet.getMaxRows();
  const previousCols = sheet.getMaxColumns();
  const rows = values.length;
  const columns = values[0].length;
  if (previousRows < rows) sheet.insertRowsAfter(previousRows, rows - previousRows);
  if (previousCols < columns) sheet.insertColumnsAfter(previousCols, columns - previousCols);
  sheet.getRange(1, 1, rows, columns).setValues(values);
  if (previousRows > rows) sheet.getRange(rows + 1, 1, previousRows - rows, Math.max(previousCols, columns)).clearContent();
  if (previousCols > columns) sheet.getRange(1, columns + 1, rows, previousCols - columns).clearContent();
  SpreadsheetApp.flush();
}

function getBackupPreview(payload) {
  const targetSheet = String(payload.targetSheet || '').trim();
  const requestedBackup = String(payload.backupSheet || '').trim();
  if (!targetSheet) throw new Error('targetSheet requerido');
  if (ALLOWED_SHEETS.indexOf(targetSheet) === -1) throw new Error('targetSheet no permitido: ' + targetSheet);
  const ss = SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  const target = ss.getSheetByName(targetSheet);
  if (!target) throw new Error('Hoja destino no encontrada: ' + targetSheet);
  const selected = resolveBackup(ss, targetSheet, requestedBackup);
  const backup = selected.sheet;

  const currentValues = target.getDataRange().getDisplayValues();
  const backupValues = backup.getRange(3, 1, backup.getLastRow() - 2, backup.getLastColumn()).getDisplayValues();
  const difference = compareSnapshots(currentValues, backupValues);
  return {
    ok: true,
    targetSheet: targetSheet,
    backupSheet: selected.backupSheet,
    createdAt: selected.createdAt,
    sourceFile: selected.sourceFile,
    current: { rows: Math.max(0, currentValues.length - 2), columns: currentValues[0] ? currentValues[0].length : 0, values: currentValues },
    backup: { rows: Math.max(0, backupValues.length - 2), columns: backupValues[0] ? backupValues[0].length : 0, values: backupValues },
    changedRows: difference.changedRows,
    changedCells: difference.changedCells
  };
}

function compareSnapshots(currentValues, backupValues) {
  const rowCount = Math.max(currentValues.length, backupValues.length);
  let changedRows = 0;
  let changedCells = 0;
  for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
    const currentRow = currentValues[rowIndex] || [];
    const backupRow = backupValues[rowIndex] || [];
    const columnCount = Math.max(currentRow.length, backupRow.length);
    let rowChanged = false;
    for (let columnIndex = 0; columnIndex < columnCount; columnIndex++) {
      if (String(currentRow[columnIndex] || '') !== String(backupRow[columnIndex] || '')) {
        changedCells++;
        rowChanged = true;
      }
    }
    if (rowChanged) changedRows++;
  }
  return { changedRows: changedRows, changedCells: changedCells };
}

function restoreLatestBackup(payload) {
  const targetSheet = String(payload.targetSheet || '').trim();
  const requestedBackup = String(payload.backupSheet || '').trim();
  if (!targetSheet) throw new Error('targetSheet requerido');
  if (ALLOWED_SHEETS.indexOf(targetSheet) === -1) throw new Error('targetSheet no permitido: ' + targetSheet);
  const ss = SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  const target = ss.getSheetByName(targetSheet);
  if (!target) throw new Error('Hoja destino no encontrada: ' + targetSheet);
  const selected = resolveBackup(ss, targetSheet, requestedBackup);
  const backup = selected.sheet;

  const backupValues = backup.getRange(3, 1, backup.getLastRow() - 2, backup.getLastColumn()).getValues();
  const currentValues = target.getDataRange().getValues();
  const undoBackup = saveSnapshot(ss, targetSheet, currentValues, 'Estado anterior a restaurar ' + selected.backupSheet);
  writeSnapshot(target, backupValues);
  target.setFrozenRows(Math.min(2, target.getLastRow()));
  const storeCatalog = targetSheet === 'Dashboard_7_Semanal' ? safeRebuildStoreCatalogFromTreo_(ss) : null;

  const dataRows = Math.max(0, backupValues.length - 2);
  const result = { mode: 'restoreBackup', rows: dataRows, keptRows: 0, columns: backupValues[0].length };
  appendAudit(ss, {
    targetSheet: targetSheet,
    source: 'Restauracion desde Panel Admin',
    sourceFile: selected.backupSheet,
    adminUser: String(payload.adminUser || 'Administrador')
  }, result, 'Restaurada', '', undoBackup);
  return { ok: true, restored: true, targetSheet: targetSheet, rows: dataRows, restoredFrom: selected.backupSheet, backupSheet: undoBackup, reversible: true, storeCatalog: storeCatalog };
}

function appendAudit(ss, payload, result, status, message, backupName) {
  let sheet = ss.getSheetByName(AUDIT_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(AUDIT_SHEET);
    sheet.appendRow(['Fecha', 'Hoja', 'Modo', 'Filas publicadas', 'Filas conservadas', 'Archivo', 'Origen', 'Usuario', 'Estado', 'Detalle', 'Respaldo']);
    sheet.setFrozenRows(1);
    sheet.hideSheet();
  }
  sheet.appendRow([
    new Date(), String(payload.targetSheet || ''), String(result.mode || payload.updateMode || ''), Number(result.rows || 0),
    Number(result.keptRows || 0), String(payload.sourceFile || ''), String(payload.source || ''), String(payload.adminUser || 'Administrador'),
    status, message, backupName || ''
  ]);
}

function ensureSystemNoticesSheet() {
  const ss = SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SYSTEM_NOTICES_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(SYSTEM_NOTICES_SHEET);
    sheet.getRange(1, 1, 1, SYSTEM_NOTICE_HEADERS.length).setValues([SYSTEM_NOTICE_HEADERS]);
    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1, SYSTEM_NOTICE_HEADERS.length);
  }
  return sheet;
}

function systemNoticeLayout(sheet) {
  const values = sheet.getDataRange().getValues();
  const hasBuffer = values.length && values[0].length && values[0].every(function(value) { return normalizeCell(value) === BUFFER_ROW_VALUE; });
  const headerIndex = hasBuffer ? 1 : 0;
  const headers = (values[headerIndex] || []).map(String);
  const validHeaders = SYSTEM_NOTICE_HEADERS.every(function(header) { return headers.indexOf(header) !== -1; });
  if (!validHeaders) {
    if (sheet.getLastRow() > 0 && values.some(function(row) { return row.some(function(value) { return normalizeCell(value) !== ''; }); })) {
      throw new Error(SYSTEM_NOTICES_SHEET + ' existe pero sus encabezados no son validos');
    }
    sheet.clearContents();
    sheet.getRange(1, 1, 1, SYSTEM_NOTICE_HEADERS.length).setValues([SYSTEM_NOTICE_HEADERS]);
    sheet.setFrozenRows(1);
    return { values: [SYSTEM_NOTICE_HEADERS], headerIndex: 0, headers: SYSTEM_NOTICE_HEADERS.slice() };
  }
  return { values: values, headerIndex: headerIndex, headers: headers };
}

function systemNoticeBoolean(value) {
  if (value === true || value === 1) return true;
  return /^(true|si|sí|1|activo)$/i.test(String(value || '').trim());
}

function systemNoticeDate(value) {
  if (!value) return '';
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value)) return value.toISOString();
  const parsed = new Date(String(value));
  return isNaN(parsed) ? '' : parsed.toISOString();
}

function readSystemNotices(includeInactive) {
  const sheet = ensureSystemNoticesSheet();
  const layout = systemNoticeLayout(sheet);
  const headerMap = {};
  layout.headers.forEach(function(header, index) { headerMap[header] = index; });
  return layout.values.slice(layout.headerIndex + 1).map(function(row) {
    return {
      id: String(row[headerMap.ID] || '').trim(),
      type: String(row[headerMap.Tipo] || 'info').trim().toLowerCase(),
      target: String(row[headerMap.Destino] || 'global').trim().toLowerCase(),
      title: String(row[headerMap.Titulo] || '').trim(),
      message: String(row[headerMap.Mensaje] || '').trim(),
      startsAt: systemNoticeDate(row[headerMap.Inicio]),
      endsAt: systemNoticeDate(row[headerMap.Fin]),
      active: systemNoticeBoolean(row[headerMap.Activo]),
      createdAt: systemNoticeDate(row[headerMap.Creado]),
      updatedAt: systemNoticeDate(row[headerMap.Actualizado])
    };
  }).filter(function(notice) {
    return notice.id && notice.title && notice.message && (includeInactive || notice.active);
  }).sort(function(a, b) {
    return String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt));
  });
}

function getPublicSystemNotices() {
  const now = Date.now();
  return readSystemNotices(false).filter(function(notice) {
    const starts = notice.startsAt ? Date.parse(notice.startsAt) : 0;
    const ends = notice.endsAt ? Date.parse(notice.endsAt) : 0;
    return (!starts || starts <= now) && (!ends || ends >= now);
  }).map(function(notice) {
    return {
      id: notice.id, type: notice.type, target: notice.target,
      title: notice.title, message: notice.message,
      startsAt: notice.startsAt, endsAt: notice.endsAt
    };
  });
}

function cleanSystemNoticeText(value, maxLength, label) {
  const text = String(value || '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) throw new Error(label + ' requerido');
  if (text.length > maxLength) throw new Error(label + ' supera ' + maxLength + ' caracteres');
  return text;
}

function validateSystemNoticeTarget(value) {
  const target = String(value || 'global').trim().toLowerCase();
  if (!/^(global|area:(rh|comercial|administrativo)|dashboard:[a-z0-9-]+)$/.test(target)) {
    throw new Error('Destino de aviso no permitido');
  }
  return target;
}

function saveSystemNotice(payload) {
  const sheet = ensureSystemNoticesSheet();
  const layout = systemNoticeLayout(sheet);
  const id = String(payload.id || '').trim() || Utilities.getUuid();
  const type = String(payload.type || 'info').trim().toLowerCase();
  if (['info', 'warn', 'critical'].indexOf(type) === -1) throw new Error('Tipo de aviso no permitido');
  const title = cleanSystemNoticeText(payload.title, 100, 'Titulo');
  const message = cleanSystemNoticeText(payload.message, 500, 'Mensaje');
  const target = validateSystemNoticeTarget(payload.target);
  const startsAt = payload.startsAt ? systemNoticeDate(payload.startsAt) : '';
  const endsAt = payload.endsAt ? systemNoticeDate(payload.endsAt) : '';
  if (payload.startsAt && !startsAt) throw new Error('Fecha de inicio invalida');
  if (payload.endsAt && !endsAt) throw new Error('Fecha de vencimiento invalida');
  if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) throw new Error('El vencimiento debe ser posterior al inicio');
  const now = new Date().toISOString();
  let rowNumber = 0;
  let createdAt = now;
  const idIndex = layout.headers.indexOf('ID');
  const createdIndex = layout.headers.indexOf('Creado');
  for (let index = layout.headerIndex + 1; index < layout.values.length; index++) {
    if (String(layout.values[index][idIndex] || '').trim() !== id) continue;
    rowNumber = index + 1;
    createdAt = systemNoticeDate(layout.values[index][createdIndex]) || now;
    break;
  }
  const active = payload.active === undefined ? true : systemNoticeBoolean(payload.active);
  const byHeader = {
    ID: id, Tipo: type, Destino: target, Titulo: title, Mensaje: message,
    Inicio: startsAt, Fin: endsAt, Activo: active ? 'SI' : 'NO', Creado: createdAt, Actualizado: now
  };
  const values = layout.headers.map(function(header) { return byHeader[header] === undefined ? '' : byHeader[header]; });
  if (rowNumber) sheet.getRange(rowNumber, 1, 1, values.length).setValues([values]);
  else sheet.appendRow(values);
  SpreadsheetApp.flush();
  return { ok: true, notice: { id: id, type: type, target: target, title: title, message: message, startsAt: startsAt, endsAt: endsAt, active: active, createdAt: createdAt, updatedAt: now } };
}

function setSystemNoticeStatus(payload) {
  const id = String(payload.id || '').trim();
  if (!id) throw new Error('ID de aviso requerido');
  const sheet = ensureSystemNoticesSheet();
  const layout = systemNoticeLayout(sheet);
  const idIndex = layout.headers.indexOf('ID');
  const activeIndex = layout.headers.indexOf('Activo');
  const updatedIndex = layout.headers.indexOf('Actualizado');
  for (let index = layout.headerIndex + 1; index < layout.values.length; index++) {
    if (String(layout.values[index][idIndex] || '').trim() !== id) continue;
    sheet.getRange(index + 1, activeIndex + 1).setValue(systemNoticeBoolean(payload.active) ? 'SI' : 'NO');
    sheet.getRange(index + 1, updatedIndex + 1).setValue(new Date().toISOString());
    SpreadsheetApp.flush();
    return { ok: true, id: id, active: systemNoticeBoolean(payload.active) };
  }
  throw new Error('Aviso no encontrado');
}

function readAudit(limit) {
  const ss = SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(AUDIT_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return { ok: true, rows: [] };
  const values = sheet.getDataRange().getDisplayValues();
  const headers = values.shift();
  const safeLimit = Math.max(1, Math.min(Number(limit || 100), 500));
  const rows = values.slice(-safeLimit).reverse().map(function(valuesRow) {
    const row = {};
    headers.forEach(function(header, index) { row[String(header)] = valuesRow[index] || ''; });
    return row;
  });
  return { ok: true, rows: rows };
}

function getAdminOverview(limit) {
  const ss = SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  // Repara de forma idempotente las filas de configuracion que se crearon
  // antes de que existiera el registro automatico de los dashboards nuevos.
  // Usa exclusivamente la fecha de una publicacion Correcta en la bitacora.
  syncMissingConfigDatesFromAudit_(ss);
  const audit = readAudit(limit);
  const auditSheet = ss.getSheetByName(AUDIT_SHEET);
  const latestBySheet = {};
  if (auditSheet && auditSheet.getLastRow() >= 2) {
    const values = auditSheet.getDataRange().getValues();
    const headers = values.shift().map(String);
    const sheetIndex = headers.indexOf('Hoja');
    const dateIndex = headers.indexOf('Fecha');
    const statusIndex = headers.indexOf('Estado');
    const rowsIndex = headers.indexOf('Filas publicadas');
    for (let index = values.length - 1; index >= 0; index--) {
      const sheetName = String(values[index][sheetIndex] || '');
      if (!sheetName || latestBySheet[sheetName]) continue;
      const dateValue = values[index][dateIndex];
      const dateMillis = Object.prototype.toString.call(dateValue) === '[object Date]' && !isNaN(dateValue) ? dateValue.getTime() : 0;
      latestBySheet[sheetName] = {
        publishedAt: dateMillis ? Utilities.formatDate(dateValue, ss.getSpreadsheetTimeZone() || 'America/Mexico_City', 'dd/MM/yyyy HH:mm') : '',
        publishedMillis: dateMillis,
        status: String(values[index][statusIndex] || ''),
        rows: Number(values[index][rowsIndex] || 0)
      };
    }
  }

  const allBackups = readBackupMetadata(ss).filter(function(item) { return ALLOWED_SHEETS.indexOf(item.targetSheet) !== -1; });
  const backupsBySheet = {};
  allBackups.forEach(function(item) {
    if (!backupsBySheet[item.targetSheet]) backupsBySheet[item.targetSheet] = [];
    backupsBySheet[item.targetSheet].push(item);
  });

  const now = Date.now();
  const sources = ALLOWED_SHEETS.map(function(sheetName) {
    const latest = latestBySheet[sheetName] || null;
    const backups = backupsBySheet[sheetName] || [];
    const thresholds = publicationThresholds(sheetName);
    const ageDays = latest && latest.publishedMillis ? Math.floor((now - latest.publishedMillis) / 86400000) : null;
    let health = 'neutral';
    let healthLabel = 'Sin registro';
    if (latest) {
      health = String(latest.status).toLowerCase() === 'error' ? 'bad' : ageDays > thresholds.bad ? 'bad' : ageDays > thresholds.warn ? 'warn' : 'ok';
      healthLabel = health === 'bad' ? 'Requiere atención' : health === 'warn' ? 'Por actualizar' : 'Al día';
    }
    return {
      sheet: sheetName,
      status: latest ? latest.status : '',
      health: health,
      healthLabel: healthLabel,
      publishedAt: latest ? latest.publishedAt : '',
      publishedRows: latest ? latest.rows : 0,
      ageDays: ageDays,
      backupCount: backups.length,
      latestBackup: backups[0] ? backups[0].createdAt : ''
    };
  });

  const backups = allBackups.map(function(item) {
    return { targetSheet: item.targetSheet, backupSheet: item.backupSheet, createdAt: item.createdAt, sourceFile: item.sourceFile, rows: item.rows, columns: item.columns };
  });
  return {
    ok: true,
    rows: audit.rows,
    sources: sources,
    backups: backups,
    summary: {
      sources: sources.length,
      withBackups: sources.filter(function(item) { return item.backupCount > 0; }).length,
      backups: backups.length,
      attention: sources.filter(function(item) { return item.health === 'warn' || item.health === 'bad'; }).length
    }
  };
}

function publicationThresholds(sheetName) {
  const daily = ['Dashboard_1_Diario', 'Dashboard_2_Diario', 'Dashboard_2_Otras_Plazas', 'Denominaciones_Dashboard_2_Diario', 'Dashboard_2_Plan_Accion', 'Dashboard_3_Diario', 'Dashboard_3_Otras_Plazas', 'Dashboard_8_Diario'];
  const weekly = ['Dashboard_4_Semanal', 'Dashboard_5_Semanal', 'Dashboard_6_Semanal', 'Dashboard_7_Semanal', 'Dashboard_9_Semanal', 'Dashboard_10_FLEX', 'Dashboard_11_Semanal', 'Dashboard_14_Comercial'];
  const monthly = ['Dashboard_12_Mensual', 'Dashboard_13_Ausentismo', 'Inventarios'];
  if (daily.indexOf(sheetName) !== -1) return { warn: 14, bad: 45 };
  if (weekly.indexOf(sheetName) !== -1) return { warn: 14, bad: 35 };
  if (monthly.indexOf(sheetName) !== -1) return { warn: 45, bad: 75 };
  return { warn: 90, bad: 180 };
}

// La Web App es publica para que el panel pueda llamarla, pero todas las
// acciones que modifican o exponen administracion siguen protegidas por la
// contrasena guardada en Script Properties. Apps Script no entrega la IP del
// cliente: se usa una penalizacion corta y global para desacelerar intentos
// automatizados sin bloquear al administrador que si conoce la contrasena.
//
// El retardo se limita a 2 segundos porque Utilities.sleep() mantiene una
// ejecucion ocupada. Registrar cada fallo tambien agotaria la cuota de Sheets;
// por eso la bitacora conserva solo los primeros eventos y muestras posteriores.
const AUTH_FAIL_CACHE_KEY = 'oxxo_auth_fallos';
const AUTH_FAIL_WINDOW_SECONDS = 15 * 60;
const AUTH_FAIL_MAX_DELAY_MS = 2000;

function registrarFalloAuth() {
  let lock;
  try {
    lock = LockService.getScriptLock();
    if (!lock.tryLock(500)) return 1;
    const cache = CacheService.getScriptCache();
    const total = Number(cache.get(AUTH_FAIL_CACHE_KEY) || 0) + 1;
    cache.put(AUTH_FAIL_CACHE_KEY, String(total), AUTH_FAIL_WINDOW_SECONDS);
    return total;
  } catch (error) {
    return 1;
  } finally {
    if (lock && lock.hasLock()) lock.releaseLock();
  }
}

function debeRegistrarFalloAuth(total) {
  if (total <= 3) return true;
  // 4, 8, 16, 32... y una muestra cada 25 intentos.
  return (total & (total - 1)) === 0 || total % 25 === 0;
}

function registrarIntentoFallido(total) {
  if (!debeRegistrarFalloAuth(total)) return;
  let lock;
  try {
    lock = LockService.getScriptLock();
    if (!lock.tryLock(500)) return;
    const ss = SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
    appendAudit(ss, {
      targetSheet: '', sourceFile: '', source: 'Endpoint publico', adminUser: 'Desconocido'
    }, {}, 'RECHAZADO', 'Contrasena incorrecta (' + total + ' intentos recientes)', '');
  } catch (error) {
    // La bitacora es informativa; nunca debe interferir con el rechazo.
  } finally {
    if (lock && lock.hasLock()) lock.releaseLock();
  }
}

function assertAuthorized(payload) {
  const configured = PropertiesService.getScriptProperties().getProperty(ADMIN_PASSWORD_PROPERTY) || '';
  if (!configured) throw new Error('ADMIN_PASSWORD no configurado en Script Properties');
  const received = String((payload && payload.adminPassword) || '');
  if (received !== configured) {
    const total = registrarFalloAuth();
    const delay = Math.min(250 * Math.pow(2, Math.min(total - 1, 3)), AUTH_FAIL_MAX_DELAY_MS);
    Utilities.sleep(delay);
    registrarIntentoFallido(total);
    throw new Error('No autorizado');
  }
}

// FIX 1: antes se hacia sheet.clearContents() y luego setValues() como dos pasos separados.
// Esa ventana entre "borrar todo" y "escribir de nuevo" hacia que el exportador CSV de
// Google (gviz, el que usan los dashboards) a veces tomara una foto a medio camino,
// mezclando varias filas en una sola celda. Ahora se escribe directo encima de lo que
// ya habia, y solo se limpia el sobrante (si la base nueva es mas chica) al final.
//
// FIX 2 (version anterior, con bug): se agrego una fila "sacrificio" (_buffer_) como
// fila 1 fisica de la hoja, para que si Google corrompe "la primera fila" de una
// escritura masiva, se coma esa basura y no los encabezados/datos reales. PERO la
// implementacion anterior volvia a partir la escritura en DOS llamadas setValues()
// separadas (una para la fila buffer, otra para encabezados+datos) — exactamente el
// mismo patron de "pasos separados" que el FIX 1 identifico como causa de la
// corrupcion. Resultado real (confirmado leyendo el CSV crudo exportado): el
// exportador tomaba su foto justo entre esas dos escrituras y fusionaba el texto de
// ambas en una sola celda por columna (ej. "_buffer_ Plaza" en vez de "_buffer_" y
// "Plaza" en filas separadas), corrompiendo el encabezado real.
//
// FIX 3 (este cambio): la fila buffer, los encabezados y los datos se arman en UN
// SOLO arreglo 2D y se escriben con UNA SOLA llamada a setValues(), eliminando por
// completo la ventana entre escrituras. dashboards/js/core.js ya sabe detectar los
// encabezados reales aunque no esten en la fila 1 (busca en las primeras filas cual
// tiene pinta de encabezado), asi que esto sigue siendo compatible sin tocar los
// dashboards.
const BUFFER_ROW_VALUE = '_buffer_';
// Columnas que los derive*() de js/admin/normalizers.js llenan con texto
// normalizado. Incluye fechas y dimensiones de periodo: "Mes" también puede
// mezclar fechas reales con valores como "sep-26", y gviz elimina las filas
// cuyo tipo no coincide con el tipo inferido de la columna.
// abajo, mismo set replicado aqui porque Apps Script no puede importar ese
// archivo. Si Sheets las autoformatea como Fecha (heredando el formato de la
// columna, o autodetectando el patron "aaaa-mm-dd" al escribir mas alla del
// rango previamente formateado), la columna queda con un tipo MEZCLADO: unas
// celdas Fecha real, otras texto plano. gviz infiere un solo tipo por columna
// para toda la hoja -- con esa mezcla, las filas nuevas (o toda la respuesta)
// pueden quedar fuera de lo que expone /gviz/tq, aunque el valor crudo este
// bien escrito (confirmado: cargas nuevas de Dashboard_1/2_Diario invisibles
// en el CSV publico hasta forzar texto plano en su columna Fecha).
const PUBLISHED_TEXT_COLUMNS = [
  'Fecha', 'F.Crea', 'F. Crea', 'F.Crea.', 'Fecha_Inicio', 'Fecha_Fin',
  'Inicio de validez', 'Fin de validez', 'Inicio de semana', 'Fin de semana',
  'Fecha de Inventario', 'Fecha de Inventario Anterior',
  'Mes', 'Periodo', 'Período', 'Semana',
];
function writeWithBufferRow(sheet, values, numCols) {
  const prevMaxRows = sheet.getMaxRows();
  const prevMaxCols = sheet.getMaxColumns();
  const bufferRow = new Array(numCols).fill(BUFFER_ROW_VALUE);
  const allRows = [bufferRow].concat(values); // buffer + encabezados + datos, un solo arreglo
  const totalRows = allRows.length;

  // Forzar texto plano ('@') en las columnas de fecha-texto ANTES de escribir
  // los valores: si se hace despues, Sheets ya convirtio el string "aaaa-mm-dd"
  // a un valor Fecha real al detectar el patron (o al heredar el formato de la
  // columna en un rango nuevo), y cambiar el formato despues solo cambia como
  // se MUESTRA ese valor ya convertido -- no recupera el texto original. Con
  // el formato de texto puesto de antemano, Sheets nunca reinterpreta el
  // string y la columna queda con el mismo tipo en todas sus filas, viejas y
  // nuevas (gviz infiere un solo tipo por columna para toda la hoja; con tipos
  // mezclados las filas nuevas -o toda la respuesta- podian quedar fuera de lo
  // que expone /gviz/tq aunque el valor crudo estuviera bien escrito -- eso es
  // lo que se confirmo con cargas nuevas de Dashboard_1/2_Diario invisibles en
  // el CSV publico).
  const dataRowCount = totalRows - 2; // filas reales, sin contar buffer+encabezado
  if (dataRowCount > 0) {
    const headerRow = values[0] || [];
    const dateTextTargets = new Set(PUBLISHED_TEXT_COLUMNS.map(normalizeHeader));
    headerRow.forEach(function(header, idx) {
      if (dateTextTargets.has(normalizeHeader(header))) {
        sheet.getRange(3, idx + 1, dataRowCount, 1).setNumberFormat('@');
      }
    });
  }

  sheet.getRange(1, 1, allRows.length, numCols).setValues(allRows); // una sola escritura
  SpreadsheetApp.flush(); // fuerza a confirmar antes de seguir: sin esto, en bases grandes
  // (~260+ filas) el exportador CSV (gviz, el que usan los dashboards) podia leer un
  // estado intermedio de la escritura por lotes y mezclar el texto de varias filas en
  // una sola celda — confirmado reproduciendo el bug llamando al Web App directo, fuera
  // del navegador, con la base real de Catalogo_Asesores (263 filas).

  if (prevMaxRows > totalRows) {
    sheet.getRange(totalRows + 1, 1, prevMaxRows - totalRows, Math.max(prevMaxCols, numCols)).clearContent();
  }
  if (prevMaxCols > numCols) {
    sheet.getRange(1, numCols + 1, totalRows, prevMaxCols - numCols).clearContent();
  }
  SpreadsheetApp.flush();
}

function configLayout_(sheet) {
  const values = sheet.getDataRange().getValues();
  let headerRow = -1, headers = [];
  for (let i = 0; i < values.length; i++) {
    if (values[i].some(c => normalizeCell(c) === 'dashboard_id')) { headerRow = i; headers = values[i]; break; }
  }
  if (headerRow === -1) throw new Error('No se encontro el encabezado dashboard_id en Configuracion');
  const idxId = headers.findIndex(h => normalizeCell(h) === 'dashboard_id');
  const idxFecha = headers.findIndex(h => normalizeCell(h) === 'ultima_actualizacion');
  if (idxFecha === -1) throw new Error('No se encontro la columna ultima_actualizacion en Configuracion');
  return { values: values, headerRow: headerRow, headers: headers, idxId: idxId, idxFecha: idxFecha };
}

function latestSuccessfulPublicationBySheet_(ss) {
  const audit = ss.getSheetByName(AUDIT_SHEET);
  const latest = {};
  if (!audit || audit.getLastRow() < 2) return latest;
  const values = audit.getDataRange().getValues();
  const headers = values.shift().map(String);
  const sheetIndex = headers.indexOf('Hoja');
  const dateIndex = headers.indexOf('Fecha');
  const statusIndex = headers.indexOf('Estado');
  if (sheetIndex < 0 || dateIndex < 0 || statusIndex < 0) return latest;
  for (let i = values.length - 1; i >= 0; i--) {
    const sheetName = String(values[i][sheetIndex] || '').trim();
    const date = values[i][dateIndex];
    const status = normalizeCell(values[i][statusIndex]);
    if (!sheetName || latest[sheetName] || status !== 'correcta') continue;
    if (Object.prototype.toString.call(date) === '[object Date]' && !isNaN(date)) latest[sheetName] = date;
  }
  return latest;
}

function insertConfigRow_(sheet, layout, dashboardId, date) {
  const meta = CONFIG_DASHBOARD_REGISTRY[dashboardId];
  if (!meta) return null;
  // Las instrucciones empiezan despues de las filas con dashboard_id. Insertar
  // justo antes para conservarlas intactas y mantener el bloque de datos unido.
  let row = layout.headerRow + 1;
  while (row < layout.values.length && normalizeCell(layout.values[row][layout.idxId])) row++;
  sheet.insertRowBefore(row + 1);
  const values = new Array(layout.headers.length).fill('');
  values[layout.idxId] = dashboardId;
  const set = (header, value) => {
    const index = layout.headers.findIndex(h => normalizeCell(h) === header);
    if (index >= 0) values[index] = value;
  };
  set('nombre', meta.name);
  set('frecuencia', meta.frequency);
  set('ultima_actualizacion', date);
  set('responsable', 'Sistema');
  set('activo', 'SI');
  sheet.getRange(row + 1, 1, 1, values.length).setValues([values]);
  return row;
}

// Actualiza la fecha de una publicacion real. Si el dashboard fue agregado
// despues de crear Configuracion, se registra automaticamente sin tocar las
// instrucciones ni inventar fechas. La bitacora permite recuperar la ultima
// fecha real ya registrada para las filas que faltaban antes de este ajuste.
function updateConfigDate(dashboardId, publishedAt) {
  const wantedId = normalizeCell(dashboardId);
  if (!wantedId) throw new Error('dashboardId requerido');
  const ss = SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Configuracion');
  if (!sheet) throw new Error('Hoja Configuracion no encontrada');
  const layout = configLayout_(sheet);
  const eventDate = publishedAt instanceof Date ? publishedAt : new Date();
  const date = Utilities.formatDate(eventDate, 'America/Mexico_City', 'dd/MM/yyyy');
  for (let i = layout.headerRow + 1; i < layout.values.length; i++) {
    if (normalizeCell(layout.values[i][layout.idxId]) === wantedId) {
      sheet.getRange(i + 1, layout.idxFecha + 1).setValue(date);
      return { ok: true, updated: true, created: false, dashboardId: wantedId, date: date };
    }
  }
  const inserted = insertConfigRow_(sheet, layout, wantedId, date);
  if (inserted !== null) return { ok: true, updated: true, created: true, dashboardId: wantedId, date: date };
  return { ok: true, updated: false, created: false, error: 'dashboard_id no reconocido: ' + wantedId };
}

function syncMissingConfigDatesFromAudit_(ss) {
  const latest = latestSuccessfulPublicationBySheet_(ss);
  Object.keys(CONFIG_DASHBOARD_REGISTRY).forEach(function(dashboardId) {
    const eventDate = latest[CONFIG_DASHBOARD_REGISTRY[dashboardId].sheet];
    if (eventDate) updateConfigDate(dashboardId, eventDate);
  });
}

function replaceAll(sheet, rows, headers) {
  const values = rowsToValues(rows, headers);
  writeWithBufferRow(sheet, values, headers.length);
  return { mode: 'replaceAll', rows: rows.length, columns: headers.length };
}

// Comprobacion inmediata posterior a la escritura. No vuelve a modificar la
// hoja: confirma que la fila buffer, los encabezados y el volumen final que
// quedaron en Sheets coinciden con lo que el panel acaba de publicar.
function verifyPublishedSheet(sheet, result, expectedHeaders) {
  SpreadsheetApp.flush();
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  const expectedRows = Number(result.rows || 0) + Number(result.keptRows || 0);
  const actualRows = Math.max(0, lastRow - 2);
  const expectedColumns = Number(result.columns || expectedHeaders.length || 0);
  const firstRows = lastRow >= 2 && lastColumn >= 1
    ? sheet.getRange(1, 1, 2, Math.max(1, Math.min(lastColumn, expectedColumns))).getDisplayValues()
    : [];
  const bufferOk = firstRows.length === 2 && firstRows[0].every(function(value) { return String(value) === BUFFER_ROW_VALUE; });
  const actualHeaders = firstRows.length === 2 ? firstRows[1].slice(0, expectedColumns).map(String) : [];
  const headersOk = expectedHeaders.length === actualHeaders.length && expectedHeaders.every(function(header, index) {
    return normalizeHeader(header) === normalizeHeader(actualHeaders[index]);
  });
  const rowsOk = actualRows === expectedRows;
  const columnsOk = lastColumn >= expectedColumns;
  const checks = {
    buffer: bufferOk,
    headers: headersOk,
    rows: rowsOk,
    columns: columnsOk
  };
  return {
    ok: bufferOk && headersOk && rowsOk && columnsOk,
    checks: checks,
    expectedRows: expectedRows,
    actualRows: actualRows,
    expectedColumns: expectedColumns,
    actualColumns: lastColumn,
    message: bufferOk && headersOk && rowsOk && columnsOk
      ? 'Publicacion verificada en Google Sheets'
      : 'La escritura termino, pero una comprobacion posterior requiere revision'
  };
}

function normalizeScopeColumns(value) {
  const seen = {};
  return (Array.isArray(value) ? value : []).map(function(column) { return String(column || '').trim(); }).filter(function(column) {
    const key = normalizeHeader(column);
    if (!key || seen[key]) return false;
    seen[key] = true;
    return true;
  }).slice(0, 3);
}

function scopeKeyParts(values) {
  const normalized = values.map(function(value) { return normalizeHeader(normalizeCell(value)); });
  return normalized.some(function(value) { return !value; }) ? '' : normalized.join('::');
}

function normalizeScopeValue(column, value) {
  const token = normalizeHeader(normalizeCell(value));
  if (normalizeHeader(column) === 'plaza') {
    if (['oaxaca', 'plazaoaxaca', 'oxxooaxaca', '10vhtoaxaca'].indexOf(token) !== -1) return 'PLAZA-OAXACA';
    if (['costaistmo', 'istmo', 'plazaistmo', 'oxxocostaistmo'].indexOf(token) !== -1) return 'PLAZA-COSTA-ISTMO';
    if (['tuxtla', 'plazatuxtla', 'oxxotuxtla'].indexOf(token) !== -1) return 'PLAZA-TUXTLA';
    if (['villahermosa', 'plazavillahermosa', 'oxxovillahermosa'].indexOf(token) !== -1) return 'PLAZA-VILLAHERMOSA';
    if (['chontalpa', 'plazachontalpa', 'oxxochontalpa'].indexOf(token) !== -1) return 'PLAZA-CHONTALPA';
  }
  if (normalizeHeader(column) === 'region') {
    const regional = ['tabasco','oaxaca','plazaoaxaca','costaistmo','istmo','tuxtla','villahermosa','chontalpa'];
    if (regional.indexOf(token) !== -1) return 'REGION-TABASCO';
  }
  return value;
}

function scopeKeyFromObject(row, scopeColumns) {
  if (!scopeColumns.length) return '';
  const headers = Object.keys(row || {});
  return scopeKeyParts(scopeColumns.map(function(column) {
    const actual = findHeaderByKey(headers, normalizeHeader(column)) || column;
    return normalizeScopeValue(column, row[actual]);
  }));
}

function scopeKeyFromArray(headers, row, scopeColumns) {
  if (!scopeColumns.length) return '';
  const legacyDefaults = { Region: 'TABASCO', Plaza: 'Plaza Oaxaca', Zona: '' };
  return scopeKeyParts(scopeColumns.map(function(column) {
    const index = findHeaderIndex(headers, column);
    const value = index >= 0 ? row[index] : '';
    // Las pestañas existentes nacieron como mono-plaza. Al agregar por primera
    // vez una columna territorial, sus filas previas pertenecen a Oaxaca; así
    // una carga de otra plaza las conserva y la primera carga de Oaxaca las
    // sustituye sin duplicarlas.
    return normalizeScopeValue(column, String(value == null ? '' : value).trim() || legacyDefaults[column] || '');
  }));
}

function scopeKeysFromObjects(rows, scopeColumns) {
  if (!scopeColumns.length) return [];
  const seen = {};
  return rows.map(function(row) { return scopeKeyFromObject(row, scopeColumns); }).filter(function(key) {
    if (!key || seen[key]) return false;
    seen[key] = true;
    return true;
  });
}

function replaceScope(sheet, rows, newHeaders, scopeColumns) {
  const incomingScopeKeys = scopeKeysFromObjects(rows, scopeColumns);
  if (!incomingScopeKeys.length) throw new Error('No se detectaron valores para el alcance de publicacion');
  const currentValues = sheet.getDataRange().getValues();
  const hasBufferRow = currentValues.length && String(currentValues[0][0]) === BUFFER_ROW_VALUE;
  const headerRowIndex = hasBufferRow ? 1 : 0;
  const existingHeaders = currentValues.length > headerRowIndex ? currentValues[headerRowIndex].map(String) : [];
  const keptRows = [];
  for (let i = headerRowIndex + 1; i < currentValues.length; i++) {
    const currentScopeKey = scopeKeyFromArray(existingHeaders, currentValues[i], scopeColumns);
    if (!currentScopeKey || incomingScopeKeys.indexOf(currentScopeKey) === -1) keptRows.push(projectRowToHeaders(existingHeaders, currentValues[i], newHeaders));
  }
  const finalRows = keptRows.concat(rows);
  const orphanedColumns = detectOrphanedColumns(existingHeaders, currentValues, headerRowIndex, newHeaders);
  writeWithBufferRow(sheet, rowsToValues(finalRows, newHeaders), newHeaders.length);
  return { mode: 'replaceScope', rows: rows.length, keptRows: keptRows.length, columns: newHeaders.length, scopeColumns: scopeColumns, scopeKeys: incomingScopeKeys, orphanedColumns: orphanedColumns };
}

function replacePeriod(sheet, rows, newHeaders, periodColumn, periodValues, scopeColumns) {
  if (!periodValues.length) throw new Error('No se detectaron valores para ' + periodColumn);

  const currentValues = sheet.getDataRange().getValues();
  // Si la fila 1 es la fila "sacrificio", los encabezados reales estan en la fila 2 y
  // los datos empiezan en la fila 3.
  const hasBufferRow = currentValues.length && String(currentValues[0][0]) === BUFFER_ROW_VALUE;
  const headerRowIndex = hasBufferRow ? 1 : 0;
  const existingHeaders = currentValues.length > headerRowIndex ? currentValues[headerRowIndex].map(String) : [];
  const periodKey = normalizeHeader(periodColumn);
  const periodSet = new Set(periodValues.map(function(value) {
    return normalizePeriodValue(value, periodColumn);
  }).filter(Boolean));
  const keptRows = [];
  const normalizedScopeColumns = normalizeScopeColumns(scopeColumns);
  const incomingScopeKeys = scopeKeysFromObjects(rows, normalizedScopeColumns);

  rows.forEach(function(row) {
    row[periodColumn] = normalizePeriodValue(row[periodColumn], periodColumn);
  });

  for (let i = headerRowIndex + 1; i < currentValues.length; i++) {
    const projected = projectRowToHeaders(existingHeaders, currentValues[i], newHeaders);
    const periodHeader = findHeaderByKey(newHeaders, periodKey) || periodColumn;
    const currentPeriod = normalizePeriodValue(projected[periodHeader], periodColumn);
    const currentScopeKey = scopeKeyFromObject(projected, normalizedScopeColumns);
    const scopeMatches = !normalizedScopeColumns.length || incomingScopeKeys.indexOf(currentScopeKey) !== -1;
    // Antes se exigia currentPeriod truthy para conservar la fila, asi que una fila con la
    // columna de periodo vacia (dato legado, o texto que normalizePeriodValue no reconocio) y
    // scope coincidente se perdia en silencio: no entraba a keptRows ni a las filas nuevas.
    // periodSet nunca contiene '' (se filtra con .filter(Boolean) al construirlo), asi que
    // periodSet.has(currentPeriod) ya es false para periodo vacio -- basta con quitar el
    // chequeo de truthy para conservar esas filas en vez de descartarlas.
    if (!scopeMatches || !periodSet.has(currentPeriod)) {
      projected[periodHeader] = currentPeriod;
      keptRows.push(projected);
    }
  }

  const finalRows = keptRows.concat(rows);
  const values = rowsToValues(finalRows, newHeaders);
  const orphanedColumns = detectOrphanedColumns(existingHeaders, currentValues, headerRowIndex, newHeaders);
  writeWithBufferRow(sheet, values, newHeaders.length);

  return {
    mode: 'replacePeriod',
    periodColumn: periodColumn,
    periodValues: periodValues,
    scopeColumns: normalizedScopeColumns,
    scopeKeys: incomingScopeKeys,
    rows: rows.length,
    keptRows: keptRows.length,
    columns: newHeaders.length,
    orphanedColumns: orphanedColumns
  };
}

function collectHeaders(rows) {
  return Object.keys(rows.reduce(function(acc, row) {
    Object.keys(row || {}).forEach(function(key) { acc[key] = true; });
    return acc;
  }, {}));
}

function mergeHeaders(existingHeaders, newHeaders) {
  const seen = {};
  const out = [];
  existingHeaders.concat(newHeaders).forEach(function(header) {
    const name = String(header || '').trim();
    if (!name || seen[name]) return;
    seen[name] = true;
    out.push(name);
  });
  return out;
}

function findHeaderIndex(headers, headerName) {
  const target = normalizeHeader(headerName);
  for (let i = 0; i < headers.length; i++) {
    if (normalizeHeader(headers[i]) === target) return i;
  }
  return -1;
}

function rowArrayToObject(headers, values) {
  const row = {};
  headers.forEach(function(header, index) {
    row[String(header || '').trim()] = values[index] == null ? '' : values[index];
  });
  return row;
}

// La verificacion post-publish (verifyPublishedSheet) solo compara conteos de
// filas/columnas, nunca contenido -- si dash.output cambia el nombre de una
// columna entre publicaciones, projectRowToHeaders reproyecta las filas
// conservadas por nombre normalizado y esa columna queda en '' para todas las
// filas viejas conservadas: el conteo de filas sigue cuadrando, la
// verificacion reporta "ok", pero los datos historicos de esa columna
// quedaron vaciados en silencio. Esto detecta esa situacion especifica (una
// columna vieja con datos reales que ya no existe en el esquema nuevo bajo
// NINGUN nombre) para poder avisar en la respuesta, sin bloquear el publish
// -- una columna que de verdad se dejo de usar (vacia en todas las filas) no
// se reporta, solo la que tenia datos y los perderia.
function detectOrphanedColumns(existingHeaders, currentValues, headerRowIndex, newHeaders) {
  const targetKeys = {};
  newHeaders.forEach(function(h) { targetKeys[normalizeHeader(h)] = true; });
  const orphaned = [];
  for (let c = 0; c < existingHeaders.length; c++) {
    const key = normalizeHeader(existingHeaders[c]);
    if (!key || targetKeys[key]) continue;
    for (let r = headerRowIndex + 1; r < currentValues.length; r++) {
      if (String((currentValues[r] || [])[c] || '').trim()) { orphaned.push(existingHeaders[c]); break; }
    }
  }
  return orphaned;
}

function projectRowToHeaders(existingHeaders, values, targetHeaders) {
  const source = rowArrayToObject(existingHeaders, values);
  const byKey = {};
  Object.keys(source).forEach(function(header) {
    byKey[normalizeHeader(header)] = source[header];
  });
  const row = {};
  targetHeaders.forEach(function(header) {
    const key = normalizeHeader(header);
    row[header] = byKey[key] == null ? '' : byKey[key];
  });
  return row;
}

function findHeaderByKey(headers, key) {
  for (let i = 0; i < headers.length; i++) {
    if (normalizeHeader(headers[i]) === key) return headers[i];
  }
  return '';
}

function rowsToValues(rows, headers) {
  return [headers].concat(rows.map(function(row) {
    return headers.map(function(header) {
      return sanitizeSheetValue(row[header] == null ? '' : row[header]);
    });
  }));
}

// Mitigacion de formula injection: texto libre del Excel subido (causa de
// baja, comentarios, nombres) se escribe tal cual en la hoja. Una celda cuyo
// valor empiece con =, +, - o @ se interpreta como formula al escribirse con
// setValues() -- igual que si alguien la tecleara a mano -- y podria ejecutar
// algo como =HYPERLINK(...) contra quien abra el Sheet directamente (no
// contra los dashboards, que solo leen el CSV ya renderizado). Se antepone un
// apostrofe, la misma convencion que usa Sheets para forzar texto literal al
// escribir a mano: Sheets lo interpreta como "no evaluar" y lo retira del
// valor mostrado/exportado, sin alterar como se ve la celda.
function sanitizeSheetValue(value) {
  if (typeof value !== 'string') return value;
  if (/^[=+\-@]/.test(value)) return "'" + value;
  return value;
}

function normalizeHeader(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9%]+/g, '')
    .trim();
}

function normalizeCell(value) {
  return String(value == null ? '' : value).trim();
}

function normalizePeriodValue(value, periodColumn) {
  const raw = normalizeCell(value);
  if (normalizeHeader(periodColumn) !== 'mes' || !raw) return raw;

  const monthNames = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value)) {
    return monthNames[value.getMonth()] + '-' + String(value.getFullYear()).slice(-2);
  }

  // Dashboard 12 (m12) publica su columna Mes ya canonica como "YYYY-MM" (ver mesKeyD12 en
  // dashboard-definitions.js), formato que tambien espera nombreMes() en dashboard-12.html.
  // Sin este chequeo el valor caia al parseo generico de mas abajo: new Date("2026-09") se
  // interpreta en UTC, y al convertir a hora de Mexico (UTC-6) se corre un mes hacia atras
  // (confirmado con datos reales: septiembre se publicaba como agosto). Se devuelve tal cual,
  // sin reformatear a "mon-YY" como el resto de dashboards, porque ese es su formato correcto.
  const isoYearMonth = raw.match(/^(\d{4})-(\d{1,2})$/);
  if (isoYearMonth) {
    const month = Number(isoYearMonth[2]);
    if (month >= 1 && month <= 12) return isoYearMonth[1] + '-' + String(month).padStart(2, '0');
  }

  const compact = raw.toLowerCase().replace(/[.\/]/g, '-').replace(/\s+/g, '-');
  const named = compact.match(/^(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)-?(\d{2}|\d{4})$/);
  if (named) return named[1] + '-' + named[2].slice(-2);

  // Los pipelines actuales (monthKey/mesKeyD12 en el admin) nunca generan una
  // fecha numerica suelta para la columna Mes -- siempre mandan "mon-YY" (rama
  // named de arriba) o "YYYY-MM" (rama isoYearMonth de arriba). Esta rama solo
  // se alcanza leyendo filas legadas o editadas a mano con un "Mes" tipo
  // fecha numerica, y asume D-M-Y (como el resto de este archivo). Igual que
  // el bug ya corregido en getSheetMatrix, esto es ambiguo cuando ambos
  // grupos son <=12 -- no hay forma de saber la convencion solo con el texto.
  // Se agrega un segundo intento (M-D-Y) unicamente para el caso donde D-M-Y
  // es invalido (el "mes" da >12): ahi ya sabemos que D-M-Y esta mal, asi que
  // probar M-D-Y no puede empeorar nada que ya funcionara.
  const numeric = raw.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2}|\d{4})$/);
  if (numeric) {
    const monthDMY = Number(numeric[2]);
    if (monthDMY >= 1 && monthDMY <= 12) return monthNames[monthDMY - 1] + '-' + numeric[3].slice(-2);
    const monthMDY = Number(numeric[1]);
    if (monthMDY >= 1 && monthMDY <= 12) return monthNames[monthMDY - 1] + '-' + numeric[3].slice(-2);
  }

  const parsed = new Date(raw);
  if (!isNaN(parsed)) return monthNames[parsed.getMonth()] + '-' + String(parsed.getFullYear()).slice(-2);
  return raw;
}
function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
