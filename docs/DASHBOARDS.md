# Mapa de dashboards

El sitio tiene 14 dashboards numerados, paginas de analisis, Inventarios, Promociones y dos accesos personales. Todas las paginas cargan `js/site-lock.js`, `js/config.js` y `js/core.js` (en ese orden de dependencia: `config.js` -> `core.js` -> modulos de la pagina) mas los scripts que se listan abajo. La logica de calculo de cada tablero vive en linea dentro de su HTML.

Convenciones compartidas:

- **Alcance de datos** (`scope`): Region TABASCO o una plaza (Oaxaca, Costa Istmo, Tuxtla, Villahermosa, Chontalpa). Lo elige el selector de plaza, se conserva en la URL (`?scope=`) y en `sessionStorage`. Excepcion: **Dashboard 13** es de alcance fijo Plaza Oaxaca (`data-oxxo-fixed-*` en su `<html>`).
- **Estado de tienda** (`?tiendas=`): operativas (por omision), preapertura o todas.
- **Periodo** (`?periodo=`): se comparte entre los tableros RH de la sesion.
- Los tableros RH con detalle usan `js/dashboard-dialogs.js` + `css/dashboard-dialogs.css` para sus modales (foco, Escape, fondo, `aria-*`), filas accionables con boton nativo y estado `aria-pressed/aria-expanded` de KPI y filtros.

## Portada

Archivos: `index.html`, `css/home.css`, `js/home.js`, `js/home-dates.js`.

- 15 tarjetas (RH 11, Comercial 2, Administrativo 2) con tres pestañas de area.
- Cada tarjeta muestra solo el estado de su fuente segun la pestaña `Configuracion`: "Datos disponibles" + fecha de ultima actualizacion, "Sin fecha registrada", "Fuente no disponible" (con boton Reintentar) o "Consultando…". Resumen `aria-live` con el conteo de fuentes con fecha.
- No calcula ni repite KPIs de los tableros.

## Panel admin

Archivos: `admin.html`, `css/admin-layout.css`, `js/admin.js`, `js/admin/*.js`, `js/admin-assets.js`, `js/admin-audit.js`, `js/admin-console.js`, `js/admin-contact-directory.js`, `js/admin-data-quality.js`, `js/admin-indicadores.js`, `js/admin-pptx.js`, `js/admin-pptx-asesor.js`, `js/admin-pptx-rae.js`, `js/admin-reasignaciones.js`, `js/admin-system-map.js`.

- Areas: Recursos Humanos, Comercial y Administrativo, con las bases de cada una.
- Cargar Excel, validar columnas, detectar plaza(s), periodo y filas, y publicar con `replaceAll`, `replaceScope` o `replacePeriod`.
- Herramientas: calidad de datos, bitacora y restauracion de respaldos, avisos del sistema, directorio de contactos, reasignaciones, mapa del sistema, PPTX/XLSX.
- XLSX se precalienta al desbloquear; JSZip y PptxGenJS se cargan solo al exportar.

## Dashboard 1 - Vacantes diarias

`dashboards/dashboard-1.html` · `rh-dashboard-enhancements.js`, `rh-table-tools.js`, `rh-filter-summary.js`, `dashboard-dialogs.js`

Vacantes por asesor, tienda, puesto, antiguedad y mes; KPIs accionables, comparativo por plaza y detalle por tienda. Modal: detalle por asesor.

## Dashboard 2 - Bajas diarias

`dashboards/dashboard-2.html`, `dashboards/dashboard-2-analisis.html` · mismos scripts RH + `dashboard-dialogs.js` (el analisis solo `core.js`)

Bajas por mes, asesor, puesto, temporalidad y rotacion temprana; comparativo de plazas, movimientos ABC (denominaciones), compromiso de bajas por asesor y plan de accion. Modales: motivos de baja y detalle de la baja.

## Dashboard 3 - Aprovechamiento de estructura

`dashboards/dashboard-3.html` · scripts RH + `dashboard-dialogs.js`, `home-dates.js`

Equipo completo/incompleto, tiendas criticas, aprovechamiento por AT y por plaza. Modal: detalle por asesor y por tienda.

## Dashboard 4 - Tiempo extra

`dashboards/dashboard-4.html` · scripts RH + `dashboard-dialogs.js`, `metrics-periods.js`

Gasto y horas de tiempo extra, ranking por asesor, detalle por empleado y tipo de TE. Modal: detalle por asesor.

## Dashboard 5 - Vacaciones

`dashboards/dashboard-5.html` · `js/dashboard-5-vacaciones.js`, `dashboard-dialogs.js` (filtros)

Dias restantes por colaborador, rangos de vacaciones, tiendas y puestos con pendientes.

## Dashboard 6 - Ausentismos

`dashboards/dashboard-6.html` · scripts RH + `dashboard-dialogs.js`, `metrics-periods.js`

Ausentismos por semana, tipo de ausencia y afectacion por asesor, tienda y empleado.

## Dashboard 7 - TREO

`dashboards/dashboard-7.html` · scripts RH + `dashboard-dialogs.js`

Alineacion TREO vs SAP, movimiento de estructura (Subir/Bajar/Alineada), vacantes y activos por tienda. De esta pestaña se reconstruye `Catalogo_Tiendas`. Modal: detalle por tienda.

## Dashboard 8 - Capacidades 2026

`dashboards/dashboard-8.html` · scripts RH + `dashboard-dialogs.js`

Avance de certificaciones y capacitaciones por asesor, puesto y tienda. Modales: cumplimiento por certificacion de un asesor y ficha del empleado.

## Dashboard 9 - Faltantes y sobrantes (+ analisis)

`dashboards/dashboard-9.html`, `dashboards/dashboard-9-analisis.html` · `dashboard-dialogs.js` (el analisis solo `core.js`)

Faltantes y sobrantes de caja por asesor, tienda y semana; el analisis ("Balance de Caja") resume el balance. Pestaña `Dashboard_9_Semanal` (fuente legacy sin Plaza: las filas vacias se leen como Oaxaca). Modal: detalle por asesor.

## Dashboard 10 - Personal FLEX

Sin pagina propia: la pestaña `Dashboard_10_FLEX` alimenta **Mi Tienda**.

## Dashboard 11 - Cumplimiento de marcajes

`dashboards/dashboard-11.html`

Entradas, salidas y cumplimiento total por tienda, asesor y plaza de la Region Tabasco (tiendas por debajo de 50% resaltadas).

## Dashboard 12 - Enfoque del lider

`dashboards/dashboard-12.html` · scripts RH + `dashboard-dialogs.js`

Etapa de desarrollo de cada lider de tienda, su trayectoria mes a mes (historico de 12 meses, publicacion por periodo) y la rotacion del puesto. Modal: trayectoria del lider.

## Dashboard 13 - Control de ausentismo (alcance fijo Plaza Oaxaca)

`dashboards/dashboard-13.html` · scripts RH + `dashboard-dialogs.js`

Incapacidades del IMSS, dias perdidos, seguimiento y riesgos de trabajo. **Uso exclusivo Plaza Oaxaca**: el selector de plaza no aplica. Modal: ficha del colaborador (desde el detalle por folio y desde el seguimiento).

## Dashboard 14 - Avance comercial

`dashboards/dashboard-14.html` · `dashboard-dialogs.js` (filtros)

SPIN, Premia, Cruzada Andatti, Venta Sugerida, Banner y MEP contra meta, por tienda y asesor. Publicacion quincenal.

## Inventarios

`dashboards/inventarios.html` · `css/inventarios.css`, `js/inventarios.js`

Resultados de Inventario: merma, venta sin TAE, inventarios y focos por tienda y asesor comercial. Se actualiza desde el panel admin con `.xlsm` y conserva historico por periodo.

## Promociones (PromosD100)

`dashboards/promociones.html` · `css/promociones.css`, `js/promociones.js`

Galeria de campañas vigentes y proximas. La pestaña `Promociones` es de **solo lectura desde el panel admin**: se edita directo en Google Sheets.

## Mi Dashboard y Mi Tienda

`dashboards/mi-dashboard.html` (`mi-dashboard.js`) y `dashboards/mi-tienda.html` (`mi-tienda.js`), ambos con `mi-ficha-ui.js` y `css/mi-ficha.css`.

Consultas consolidadas: Mi Dashboard por asesor (bajas, estructura, tiempo extra, vacaciones, ausentismos, capacidades); Mi Tienda por tienda (ademas Dashboard 9, 10 FLEX, 11 e Inventarios). Sus modales usan el controlador propio de `mi-ficha-ui.js`.

## Vistas consolidadas

Al elegir Region TABASCO, los tableros muestran todas las plazas a la vez (los que tienen comparativo por plaza lo muestran siempre). Las lecturas por plaza piden a GViz solo las filas de esa plaza (`SCOPED_GVIZ_COLUMNS` en `js/config.js`); en region se lee la hoja completa.

## Dependencias externas

- Chart.js: local en `assets/vendor/`.
- XLSX.js, JSZip, PptxGenJS: CDN jsDelivr, bajo demanda en el panel admin.
- html2canvas: CDN, bajo demanda para exportar PNG.
- Google Fonts: Archivo (portada) y Barlow (estilos globales).
