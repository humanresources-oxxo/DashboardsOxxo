# Arquitectura de codigo

Este documento define como mantener el proyecto ordenado sin romper la publicacion estatica en GitHub Pages.

## Principio base

El sitio es estatico: cada HTML carga CSS y JS directo desde el repo (sin bundler ni servidor). Por eso los cambios deben ser incrementales y compatibles con navegadores, sin depender de build steps. `package.json` solo define scripts de desarrollo (pruebas y versionado); no hay dependencias de ejecucion.

## Capas actuales

| Capa | Carpeta/archivo | Responsabilidad |
|---|---|---|
| Configuracion | `js/config.js` | IDs de Sheets, URL de Apps Script, pestanas, alcance territorial |
| Core compartido | `js/core.js` | Lectura de Sheets con cache, parseo CSV, alcance de datos, catalogos, utilidades y exportacion PNG |
| Dialogos y a11y compartida | `js/dashboard-dialogs.js`, `css/dashboard-dialogs.css` | Modales accesibles (`OXXO_DIALOGS`), filas accionables, aria de KPI y filtros |
| Portada | `index.html`, `js/home.js`, `css/home.css`, `js/home-dates.js` | Tarjetas y estado de las fuentes |
| Panel admin | `admin.html`, `css/admin-layout.css`, `js/admin.js`, `js/admin/*.js`, `js/admin-*.js` | Validacion de Excel, normalizacion, publicacion y herramientas |
| Dashboards | `dashboards/*.html` | Visualizacion, filtros, KPIs, graficas y tablas (la logica de calculo va en linea) |
| Estilos | `css/*.css` | Tema visual, layout, tarjetas, filtros y tablas |
| Integracion Sheets | `apps-script/admin-upload.gs` | Escritura autorizada desde el panel admin a Google Sheets |
| Herramientas | `scripts/`, `tests/`, `.github/workflows/` | Pruebas, versionado de assets y CI |
| Documentacion | `docs/*.md` | Operacion, soporte y mapa tecnico |

## Orden de carga

1. `js/site-lock.js` (con `defer`, mas un snippet en linea que oculta la pagina hasta decidir).
2. **`js/config.js` -> `js/core.js`**: siempre en este orden. `config.js` es obligatorio: `core.js` no trae configuracion de respaldo y falla sin `window.OXXO_CONFIG`.
3. Modulos de la pagina: `metrics-periods.js`, `dashboard-dialogs.js`, `home.js`, `mi-ficha-ui.js`, `inventarios.js`, etc. Los scripts en linea de cada tablero van al final.
4. CSS: `global.css` primero; despues (segun la pagina) `dashboard-skin.css`, `floating-filter-layout.css`, `rh-dashboard-refresh.css`, `rh-table-tools.css`, `rh-filter-summary.css` y **`dashboard-dialogs.css` al final**. Cada stylesheet se enlaza una sola vez por pagina.

Cada archivo compartido lleva una cabecera que indica que paginas lo consumen.

## Regla de configuracion

Toda URL o nombre de pestana debe vivir primero en `js/config.js`. Ya no hay respaldo interno en `core.js`: si cambia una URL o pestana, se edita ese archivo (y `ALLOWED_SHEETS` en el Apps Script) y `scripts/version-assets.mjs` rompe la cache del navegador en cada push.

## Cache de lecturas de Sheets (`js/core.js`)

`fetchSheetData(tab, opciones)` guarda cada respuesta en memoria y en Cache Storage (`oxxo-sheet-data-v1`). La llave es **pestana + consulta/alcance** (plaza, region o consulta propia), asi que las variantes nunca se mezclan; las filas se clonan antes de filtrarlas por alcance.

| Antiguedad | Comportamiento |
|---|---|
| < 2 min (`SHEET_CACHE_TTL_MS`) | Copia fresca, sin red. |
| 2-10 min (`SHEET_STALE_LIMIT_MS`) | Stale-while-revalidate: devuelve la copia al instante, dispara `oxxo:sheet-status` = `stale`, refresca **una vez** en segundo plano (llamadas concurrentes comparten la solicitud) y solo actualiza cache/estado, sin repintar. |
| > 10 min o sin copia | Espera a la red: un unico intento de 18 s (`SHEET_REQUEST_TIMEOUT_MS`); si falla, `offline`. |
| `fresh: true` | Se salta la cache (publicaciones, "Reintentar"). |

"Reintentar" / "Actualizar ahora" (`retryDashboardData`) limpia la cache y vuelve a ejecutar la carga de la pagina. Cubierto por `tests/sheet-cache-swr.test.js`.

## Dialogos y accesibilidad compartida

`js/dashboard-dialogs.js` expone `window.OXXO_DIALOGS`:

- `register({overlay, dialog, title, close, onClose, openClass})` -> `{open, close, isOpen}`. Pone `role="dialog"`, `aria-modal`, `aria-labelledby`, alterna `aria-hidden`, mueve el foco, atrapa Tab/Shift+Tab, cierra con Escape / fondo / boton, devuelve el foco al disparador, bloquea el scroll y marca el resto de la pagina `inert`. Admite varios por pagina.
- `bindRows(filas, etiqueta, accion, opciones)`: boton nativo en la primera celda de una fila accionable (el clic en la fila queda solo como comodidad de raton).
- Sincroniza `aria-pressed` de las tarjetas KPI, y `aria-expanded` / `aria-controls` de los filtros desplegables (`.smart-filter`), con cierre por Escape o clic fuera.

Cada tablero conserva sus funciones `openXModal()/closeXModal()` como adaptadores delgados. Mi Dashboard y Mi Tienda usan el controlador propio de `js/mi-ficha-ui.js`.

## Limite de seguridad

- El candado del sitio (`js/site-lock.js`) es **disuasion del lado del cliente**: no puede proteger las hojas publicas ni el Apps Script de lectura, cuyas URLs son publicas.
- La **escritura** si se autoriza en el servidor: `apps-script/admin-upload.gs` exige la contrasena de administrador (Script Properties), solo escribe en `ALLOWED_SHEETS`, valida modo de publicacion, toma bloqueos, respalda y registra bitacora. El directorio de contactos esta aislado.
- No exponer campos adicionales en las hojas publicas. La confidencialidad real requiere autenticacion y hojas privadas (trabajo futuro, requiere decision de arquitectura).

## Como refactorizar sin riesgo

1. Cambiar una sola capa por commit.
2. Correr `npm test` y `npm run assets:check` (deben pasar en Windows y Linux).
3. Revisar `git diff --check`.
4. Probar al menos `admin.html`, `dashboard-1.html`, `dashboard-2.html` y `dashboard-3.html` y los modales.
5. Ejecutar `npm run test:live` de forma manual si se toco lectura de datos (informativo).
6. Subir el cambio solo cuando el flujo principal siga funcionando.

## Que no mover todavia

- No partir `js/core.js`, `apps-script/admin-upload.gs`, los generadores PPTX del admin ni la logica embebida dentro de cada `dashboard-*.html` sin una prueba visual y de metricas clara: es codigo funcional y muy conectado a la UI.
- El CSS compartido usa `!important` de forma extensa (`dashboard-skin.css`, `floating-filter-layout.css`, `rh-dashboard-refresh.css`): hacer cambios aditivos y acotados, no limpiezas de cascada.
