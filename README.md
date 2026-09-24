# OXXO Dashboards

Sistema estatico de dashboards operativos de Recursos Humanos, Comercial y Administrativo para la Region TABASCO (Plaza Oaxaca, Costa Istmo, Tuxtla, Villahermosa y Chontalpa). El sitio se publica tal cual en GitHub Pages (sin build ni servidor) y consume datos desde Google Sheets mediante CSV/GViz por pestana.

## Que incluye

- Portada (`index.html`) con acceso a las 15 tarjetas, tres areas (Recursos Humanos 11, Comercial 2, Administrativo 2) y el estado de cada fuente segun la pestana `Configuracion` (fecha de ultima actualizacion o "Sin fecha registrada"). No repite ni recalcula indicadores.
- Panel admin (`admin.html`) para validar Excel, normalizar columnas y publicar en Google Sheets por Apps Script.
- 14 dashboards numerados, mas las paginas de analisis, Inventarios, Promociones y los accesos personales:
  - Dashboard 1: Vacantes diarias.
  - Dashboard 2: Bajas diarias (y `dashboard-2-analisis.html`).
  - Dashboard 3: Aprovechamiento de estructura.
  - Dashboard 4: Tiempo extra.
  - Dashboard 5: Vacaciones.
  - Dashboard 6: Ausentismos.
  - Dashboard 7: TREO.
  - Dashboard 8: Capacidades 2026.
  - Dashboard 9: Faltantes y sobrantes (y `dashboard-9-analisis.html`).
  - Dashboard 10: Personal FLEX (fuente de Mi Tienda; no tiene pagina propia).
  - Dashboard 11: Cumplimiento de marcajes.
  - Dashboard 12: Enfoque del lider.
  - Dashboard 13: Control de ausentismo (alcance fijo Plaza Oaxaca).
  - Dashboard 14: Avance comercial.
  - Inventarios (Resultados de Inventario) y Promociones (PromosD100).
  - Mi Dashboard y Mi Tienda: consultas personales/por tienda.
- Catalogos de asesores y de tiendas para corregir responsables y descartar tiendas dadas de baja.
- Exportacion a PNG/CSV y generacion de presentaciones (PPTX) y XLSX desde el panel admin.

## Estructura actual

```txt
DashboardsOxxo/
  admin.html              Panel para carga, validacion y publicacion de bases
  index.html              Portada
  dashboards/             Paginas HTML de cada dashboard (la logica de calculo va en linea)
  js/                     Logica compartida, dashboards y panel admin
  css/                    Estilos globales, tema visual y layouts compartidos
  assets/                 Imagenes optimizadas, plantillas y catalogo de respaldo
  apps-script/            Codigo del Web App de Google Apps Script (espejo; se despliega a mano)
  scripts/                Herramientas de desarrollo (pruebas, versionado de assets)
  tests/                  Pruebas offline (*.test.js) y diagnosticos en vivo (live-*.mjs)
  docs/                   Documentacion operativa y tecnica
```

## Archivos principales

- `js/config.js`: configuracion central de Sheets y Apps Script (obligatoria; `core.js` no trae respaldo propio).
- `js/core.js`: lectura de Sheets con cache, alcance de datos, catalogos y utilidades compartidas.
- `js/dashboard-dialogs.js` + `css/dashboard-dialogs.css`: controlador unico de modales accesibles, filas accionables y estado de filtros/KPI.
- `js/home.js` + `css/home.css`: portada.
- `js/admin.js` y `js/admin/*`: validacion de Excel y publicacion al Apps Script.
- `apps-script/admin-upload.gs`: Web App que recibe datos del panel admin y actualiza Google Sheets.
- `css/dashboard-skin.css`, `css/floating-filter-layout.css`, `css/rh-dashboard-refresh.css`: tema y layout compartido de dashboards.

## Flujo de datos

1. Una persona recibe la base Excel.
2. Entra al panel admin (contrasena verificada en el servidor para publicar).
3. Selecciona el area y el dashboard destino.
4. Sube el Excel; el panel valida columnas, detecta plaza(s), periodo y filas.
5. Publica al Google Sheet mediante Apps Script (`replaceAll`, `replaceScope` o `replacePeriod`).
6. Los dashboards leen automaticamente la pestana correspondiente.

## Pruebas y calidad

Requiere Node 20. El proyecto no tiene dependencias de ejecucion; `package.json` solo define scripts.

```bash
npm ci                 # instala (solo genera node_modules vacio)
npm test               # pruebas offline: multiplataforma (Windows, macOS, Linux)
npm run assets:check   # verifica que todos los js/css locales compartan una version ?v=
npm run test:live      # diagnosticos contra produccion (manual; nunca en CI)
```

- `npm test` corre `tests/*.test.js` desde `scripts/run-tests.mjs`. Son la compuerta de calidad (CI en `.github/workflows/quality.yml`).
- `npm run test:live` ejecuta cada `tests/live-*.mjs` por separado con tope de 120 s y muestra una tabla final PASS/FAIL/TIMEOUT. Dependen de datos y red de produccion, por eso no bloquean un merge.
- `scripts/version-assets.mjs` pone el mismo `?v=<commit>` en todo js/css local; lo corre el workflow `versionar-assets.yml` en cada push a `main` (a mano: `node scripts/version-assets.mjs`).

## Documentacion

- [Guia de actualizacion](docs/GUIA_ACTUALIZACION.md)
- [Estructura de Google Sheets](docs/ESTRUCTURA_SHEETS.md)
- [Mapa de dashboards](docs/DASHBOARDS.md)
- [Soporte y problemas comunes](docs/SOPORTE.md)
- [Arquitectura de codigo](docs/ARQUITECTURA_CODIGO.md)
- [Onboarding de otro cliente/plaza](ONBOARDING.md)

## Desarrollo local

El sitio sigue siendo estatico. Para revisarlo levanta cualquier servidor de archivos desde la raiz, por ejemplo:

```bash
npx --yes serve .
# o
python -m http.server 4177
```

y abre `http://127.0.0.1:4177/` (el sitio pide la contrasena del equipo la primera vez).

## Publicacion

GitHub Pages sirve la version estatica desde la raiz del repositorio (`index.html`, `admin.html`, `dashboards/*.html`, `assets/`, `css/`, `js/`). No hay bundler: lo que se ve en el repo es lo que se sirve.

```bash
git status
git add .
git commit -m "Descripcion del cambio"
git pull --rebase origin main
git push origin main
```

## Seguridad

- El candado del sitio (`js/site-lock.js`) es una **disuasion del lado del cliente**, no una autorizacion: las hojas publicas de Google y el Apps Script de lectura siguen siendo accesibles a quien conozca las URLs.
- Toda **escritura** desde el panel admin se autoriza en el servidor (Apps Script): contrasena/propiedades, lista de pestanas permitidas, validaciones, bitacora y respaldos.
- La confidencialidad real de la informacion requiere autenticacion y hojas privadas: es una decision de arquitectura pendiente.

## Nota de mantenimiento

La carpeta `outputs/` se usa solo para respaldos, capturas y archivos generados durante pruebas locales. No debe publicarse en el repo.
