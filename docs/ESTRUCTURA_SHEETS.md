# Estructura de Google Sheets

El sistema usa un Google Sheet como base central. Cada dashboard lee una pestana especifica (GViz/CSV, o `action=readSheet` del Apps Script para el catalogo de asesores).

## Configuracion central

La configuracion editable esta en `js/config.js`, dentro de `window.OXXO_CONFIG`. `js/core.js` la consume como `SHEETS_CONFIG`; **no tiene respaldo propio**, asi que `config.js` debe cargarse siempre antes.

Campos importantes:

- `SPREADSHEET_ID`: ID del Google Sheet principal.
- `CONFIG_SHEET` (`Configuracion`): fechas/cadencia de la portada.
- `CATALOG_SHEET` (`Catalogo_Asesores`): correccion de asesores por tienda/CR.
- `STORE_CATALOG_SHEET` (`Catalogo_Tiendas`): tiendas por CR, derivado de TREO.
- `COMMITMENTS_SHEET` (`Compromisos_Bajas`): meta mensual de bajas por asesor (Plaza | Asesor | Compromiso).
- `REASIGNACIONES_SHEET` (`Reasignaciones`): a quien heredan las tiendas de un asesor que ya no esta.
- `ADMIN_UPLOAD_URL`: URL del Web App de Apps Script.
- `DATA_CONTEXT` / `SCOPE_MODEL`: Region TABASCO y sus cinco plazas, con alias.
- `SCOPED_GVIZ_COLUMNS`: columna de Plaza por pestana para pedir solo la plaza activa.
- `TABS`: nombres exactos de las 20 pestanas de datos.

## Las 20 pestanas de `TABS`

| Clave | Pestana | Uso | Publicacion desde el panel |
|---|---|---|---|
| d1 | Dashboard_1_Diario | Vacantes diarias | si |
| d2 | Dashboard_2_Diario | Bajas diarias | si |
| d2otras | Dashboard_2_Otras_Plazas | Bajas de otras plazas (captura) | si |
| d2denom | Denominaciones_Dashboard_2_Diario | Movimientos ABC | si |
| d2plan | Dashboard_2_Plan_Accion | Plan de accion del analisis de bajas | si |
| d3 | Dashboard_3_Diario | Aprovechamiento de estructura | si |
| d3plazas | Dashboard_3_Otras_Plazas | Aprovechamiento por plaza | si |
| s4 | Dashboard_4_Semanal | Tiempo extra | si |
| s5 | Dashboard_5_Semanal | Vacaciones | si |
| s6 | Dashboard_6_Semanal | Ausentismos | si |
| s7 | Dashboard_7_Semanal | TREO (origen de `Catalogo_Tiendas`) | si |
| d8 | Dashboard_8_Diario | Capacidades | si |
| s9 | Dashboard_9_Semanal | Faltantes y sobrantes (sin Plaza: vacia = Oaxaca) | si |
| d10 | Dashboard_10_FLEX | Personal FLEX (alimenta Mi Tienda) | si |
| d11 | Dashboard_11_Semanal | Cumplimiento de marcajes | si |
| m12 | Dashboard_12_Mensual | Enfoque del lider (historico mensual) | si |
| a13 | Dashboard_13_Ausentismo | Control de ausentismo (alcance fijo Oaxaca) | si |
| c14 | Dashboard_14_Comercial | Avance comercial (sin Plaza: vacia = Oaxaca) | si |
| promos | Promociones | PromosD100 | **no: solo lectura/edicion directa** |
| inventories | Inventarios | Resultados de Inventario (historico por periodo) | si |

## Otras pestanas

| Pestana | Uso |
|---|---|
| Configuracion | `dashboard_id`, nombre, frecuencia y `ultima_actualizacion` de cada fuente; opcionalmente `archivo_url` / `archivo_nombre`. La escribe el Apps Script al publicar (registro `CONFIG_DASHBOARD_REGISTRY`) y la lee la portada. |
| Catalogo_Asesores | Asesor, tienda y CR por tienda (`ASESOR`, `TIENDA`, `CR TIENDA`, y columnas de Region/Plaza/Zona). Fuente compartida para corregir responsables. Se lee directo por Apps Script porque GViz corrompe esta hoja. |
| Catalogo_Tiendas | Tiendas por CR (columna `ACTIVA`). Se regenera solo al publicar o restaurar TREO. **Una tienda que no esta aqui se muestra igual** (TREO se actualiza con retraso); para ocultar una tienda se marca `ACTIVA = NO`. Las preaperturas se excluyen por nombre. |
| Compromisos_Bajas | Meta de bajas por asesor (Plaza, Asesor, Compromiso) para el panel Compromiso de Dashboard 2. |
| Reasignaciones | Reasignacion de tiendas de asesores salientes; se administra desde el panel admin. |

Pestanas de soporte que solo usa el Apps Script: `PromosD100`, `Avisos_Sistema`, `Directorio_Contactos_Bajas` (aislado, nunca en `ALLOWED_SHEETS`), `_Admin_Bitacora`, `00_INICIO` y los respaldos con prefijo de respaldo.

## Filas buffer y encabezados

Las pestanas publicadas por el panel llevan **dos filas de cabecera**: la fila 1 es `_buffer_` (una celda por columna) y la fila 2 son los encabezados reales; los datos empiezan en la fila 3. Al pedir por GViz con filtro se declara `headers=2` para que el primer registro no se confunda con el encabezado. Las hojas historicas sin fila buffer (por ejemplo `Dashboard_12_Mensual` e `Inventarios` actuales) se filtran del lado del navegador.

## Publicacion desde el panel admin

El panel admin no escribe directamente sobre archivos del repo. El flujo es:

1. El usuario sube un Excel en `admin.html`.
2. `js/admin.js` y `js/admin/*` validan y normalizan la base.
3. El panel envia los datos al Apps Script con la contrasena de administrador.
4. `apps-script/admin-upload.gs` autoriza en el servidor, valida contra `ALLOWED_SHEETS`, respalda, escribe y registra la bitacora.
5. Los dashboards leen la informacion publicada.

### Modos de publicacion

- `replaceAll`: reemplaza la pestana completa.
- `replaceScope`: reemplaza solo las filas de las **plazas presentes en el archivo** (columna Plaza) y conserva las de las demas. Es lo que permite cargas regionales multi-plaza o de una sola plaza sin borrar a las otras.
- `replacePeriod`: reemplaza solo el periodo cargado (por ejemplo `Mes` o `Semana`) y, cuando la base tiene Plaza, solo dentro de las plazas del archivo. Se bloquea si falta `periodColumn` o los valores del periodo.

Para Inventarios se carga la hoja `Resultado de Inventario` del `.xlsm`; el periodo `AAAA-MM` sale del nombre del archivo (con `Fecha de Inventario` como respaldo) y se reemplaza solo ese mes.

Cuando se publica `Dashboard_7_Semanal`, Apps Script toma la fotografia regional resultante, elimina Entrenamiento/Operaciones, deduplica por CR y reconstruye `Catalogo_Tiendas`. Si una plaza todavia no tiene TREO, el sistema conserva sus datos sin filtrarlos.

## Recomendacion operativa

Antes de cambiar nombres de pestanas en Google Sheets, actualiza `SHEETS_CONFIG.TABS` (y `ALLOWED_SHEETS` en el Apps Script) y prueba el panel admin con un archivo pequeno.
