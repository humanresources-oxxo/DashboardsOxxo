# Mapa de dashboards

El sitio tiene 14 dashboards numerados, paginas de analisis, Inventarios, Promociones y dos accesos personales. Todas las paginas cargan `js/site-lock.js`, `js/config.js` y `js/core.js` (en ese orden de dependencia: `config.js` -> `core.js` -> modulos de la pagina) mas los scripts que se listan abajo. La logica de calculo de cada tablero vive en linea dentro de su HTML.

Convenciones compartidas:

- **Alcance de datos** (`scope`): Region TABASCO o una plaza (Oaxaca, Costa Istmo, Tuxtla, Villahermosa, Chontalpa). Lo elige el selector de plaza, se conserva en la URL (`?scope=`) y en `sessionStorage`. Excepcion: **Dashboard 13** es de alcance fijo Plaza Oaxaca (`data-oxxo-fixed-*` en su `<html>`).
- **Estado de tienda** (`?tiendas=`): operativas (por omision), preapertura o todas.
- **Periodo** (`?periodo=`): se comparte entre los tableros RH de la sesion.
- Los tableros RH con detalle usan `js/dashboard-dialogs.js` + `css/dashboard-dialogs.css` para sus modales (foco, Escape, fondo, `aria-*`), filas accionables con boton nativo y estado `aria-pressed/aria-expanded` de KPI y filtros.

## Portada

Archivos: `index.html`, `css/home.css`, `js/home.js`, `js/home-dates.js`.

- 16 tarjetas (RH 11, Comercial 2, Administrativo 3) con tres pestañas de area.
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

`dashboards/dashboard-2.html`, `dashboards/dashboard-2-analisis.html` · mismos scripts RH + `dashboard-dialogs.js` (el analisis solo `core.js`). La logica vive en `js/dashboard-2.js` y todo el CSS propio en `css/dashboard-2.css` (se carga al final y va bajo `body.dashboard-2-page`). La hoja "KPIs" del Excel de D2 ahora trae una columna "Detalle" (asesor/tienda completos, porcentaje o mes) y el "Valor" de la tienda es su conteo; la tarjeta KPI activa persiste y un segundo clic quita el filtro. `rh-filter-summary.js` se sigue cargando pero no monta su badge en D2 (`#filter-bar` no lleva `.bajas-filters`): el conteo de filtros activos lo dan `#d2-filter-summary` y `#d2-active-context`

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

Panel "Asesores con mas y menos marcajes": top 5 y bottom 5 por indice de marcajes = promedio de `% Cumpl Reg Entradas` mas promedio de `% Cumpl Reg Salidas` de las tiendas del asesor (escala 0-200 puntos). La fuente (`Ranking por Tienda`) no publica conteos absolutos de marcajes, solo porcentajes; la definicion queda impresa en la pagina.

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

`dashboards/inventarios.html` · `css/inventarios-visual.css`, `js/inventarios.js`

Resultados de Inventario: merma, venta sin TAE, inventarios y focos por tienda y asesor comercial. Se actualiza desde el panel admin con `.xlsm` y conserva historico por periodo.

## Promociones (PromosD100)

`dashboards/promociones.html` · `css/promociones.css`, `js/promociones.js`

Galeria de campañas vigentes y proximas. La pestaña `Promociones` es de **solo lectura desde el panel admin**: se edita directo en Google Sheets.

## Mi Dashboard y Mi Tienda

`dashboards/mi-dashboard.html` (`mi-dashboard.js`) y `dashboards/mi-tienda.html` (`mi-tienda.js`), ambos con `mi-ficha-ui.js` y `css/mi-ficha.css`.

Consultas consolidadas: Mi Dashboard por asesor (bajas, estructura, tiempo extra, vacaciones, ausentismos, capacidades); Mi Tienda por tienda (ademas Dashboard 9, 10 FLEX, 11 e Inventarios). Sus modales usan el controlador propio de `mi-ficha-ui.js`.

## Cuota Sindical

`dashboards/cuota-sindical.html` (`js/cuota-sindical.js`, `css/cuota-sindical.css`, base visual de `css/inventarios-visual.css`). Tarjeta en el área Administrativo del inicio. Es un dashboard **aparte**: sus datos no viven en el libro de los dashboards sino en un libro **privado** propio del Apps Script (`CUOTA_SINDICAL_SPREADSHEET_ID`, se crea con la primera carga; hojas `Detalle`, `Resumen` y `Carga`), y ningún otro tablero lo lee.

La afiliación sindical es un dato personal sensible: el botón **Actualizar datos** pide el Excel completo de nómina (concepto "Desc. Cuota Sindical") y la contraseña del panel admin, lee el Excel en el navegador (`OXXO_CUOTA.agregar`) y publica con la acción `publicarCuotaSindical` solo totales por mes, división, tienda y puesto (descontado neto, personas, movimientos, devoluciones y reversos), reemplazando lo anterior. Nombres y números de empleado nunca salen del equipo. Un mes cuyo neto es $0 (p. ej. solo reversos que se cancelan) no se publica. La consulta (`consultarCuotaSindical`) es pública porque solo hay totales; la carga también escribe la fecha en la fila `cuota` de `Configuracion` para la tarjeta del inicio.

KPIs: descontado del mes (vs mes anterior), personas con descuento, promedio por persona, promedio por semana pagada (cada pago cuenta por el domingo de su semana), ajustes (devoluciones y reversos) y acumulado. Apartados: tendencia mensual, por división, por puesto, por AT (catálogo; Entrenamiento/Operaciones aparte; sin AT → "Sin Asesor Asignado"), casos a revisar y tabla por tienda. Filtros: mes, división, AT, puesto y tienda. Las personas son exactas por mes y división; con filtro de AT, tienda o puesto se suman por tienda y puesto.

## Acta Administrativa

`dashboards/acta-administrativa.html` (`js/acta-administrativa.js`, `css/acta-administrativa.css`). Acceso desde el menú lateral del inicio.

Formulario con vista previa para seis formatos de RH: acta administrativa, acta por falta de probidad, acta ultimátum, retroalimentación, acta de hechos y renuncia voluntaria (cada uno muestra y valida solo sus campos; la renuncia sale como carta, sin membrete). Sugiere tienda y AT desde `Catalogo_Asesores` y colaboradores/puesto desde `Dashboard_8_Diario`. Genera el `.docx` en el navegador (sin librerías) y lo envía por correo con la acción pública `enviarActa` del Apps Script, que solo manda a `ACTAS_DESTINATARIOS` (Propiedades del script) y copia a correos de los dominios permitidos (`ACTAS_DOMINIOS_PERMITIDOS` o los de RH). Cada acta enviada se anota en un libro **privado** aparte (`ACTAS_REGISTRO_SPREADSHEET_ID`; el script lo crea en el Drive de la cuenta dueña con el primer envío): hoja `Actas` con el detalle (incluye la columna `Tipo`) y hoja `Resumen por empleado` con el conteo por No. de empleado y tienda. Nunca en el libro publicado de los dashboards. El registro se consulta en el **panel admin**, pestaña **Registro de actas** (área RH, `js/acta-registro.js`), con la acción `consultarActas`, que exige la contraseña del admin (la de la sesión abierta; desde la v60 la antigua `ACTAS_CONSULTA_PASSWORD` ya no se usa): conteo por tienda, por empleado y detalle. En el detalle, **Anular** marca un registro con fecha, motivo y quién (columnas `Anulada`, `Motivo anulación` y `Anuló`): no borra la fila, pero deja de mostrarse y de contar, también en `Resumen por empleado`. Exige la acción `anularActa` con otra contraseña, `ACTAS_BORRADO_PASSWORD` (Propiedades del script), para que quien solo consulta no pueda anular (Apps Script v59; consulta con la sesión del admin desde la v60). La página no muestra el aviso de conexión con Google Sheets (`data-oxxo-hide-connection-banner` en `<html>`): Sheets solo aporta sugerencias y el formulario funciona sin ellas. El borrador queda solo en el navegador de quien lo llena; al enviarse por correo con éxito, el formulario, las firmas y el borrador se limpian (se conserva el correo de copia). "Solo descargar Word" no limpia. **Firmas en pantalla** (apartado 4, opcional): cada persona del documento firma con el dedo en su recuadro y la firma se incrusta como imagen en el Word, sobre su línea, con la fecha y hora; "Se negó a firmar" asienta la negativa en su lugar (no aplica a la renuncia). Mientras haya alguna firma, los datos quedan bloqueados ("Borrar firmas y editar" los libera). Las imágenes de las firmas solo viven en memoria (no se guardan en el borrador ni en el registro); al enviar, el registro anota en la columna `Firmas` cuántas se hicieron en pantalla y cuántas personas se negaron ("A mano" si ninguna), y el correo a RH lo indica (Apps Script v58). Es una firma autógrafa digitalizada, no una firma electrónica avanzada (e.firma).

**App Oxxito:** la app móvil (repo `humanresources-oxxo/oxxitoapp`, pantalla *Actas y Formatos*) tiene una copia nativa de este formulario: `src/utils/actaDocx.ts` reproduce los textos y el `.docx` de `js/acta-administrativa.js`, y envía con la misma acción `enviarActa` (mismos campos del cuerpo JSON), y manda el CR de la tienda, que saca de `Catalogo_Asesores` (acción `readSheet`; de respaldo, `assets/catalogo_asesores.csv` publicado en GitHub Pages), así que sus actas llegan al mismo correo y al mismo registro, agrupadas con las de la web. Si cambias el texto de un formato, el contrato de `enviarActa` o la ruta del catálogo, actualiza también la app.

## Torre de Cajas (juego)

`dashboards/juego.html` (`js/juego-cajas.js`). Juego de apilado en canvas, sin
librerias ni imagenes. No lee ninguna pestana: por eso funciona justo cuando
Google Sheets no responde.

Tiene dos entradas. La primera es `dashboards/juego.html`, con su tarjeta en la
portada. La segunda es la caja de error de `showError()` en `core.js`: cuando
una fuente falla aparece un boton discreto que carga el juego bajo demanda, asi
que quien nunca pierda la conexion no descarga ese archivo. Es el mismo papel
que cumple el dinosaurio de Chrome.

El record vive en `localStorage` (`oxxo-torre-cajas-record`), es decir por
navegador. No hay identidad por persona en el sitio, asi que no existe marcador
compartido ni se finge uno.

## Vistas consolidadas

Al elegir Region TABASCO, los tableros muestran todas las plazas a la vez (los que tienen comparativo por plaza lo muestran siempre). Las lecturas por plaza piden a GViz solo las filas de esa plaza (`SCOPED_GVIZ_COLUMNS` en `js/config.js`); en region se lee la hoja completa.

## Dependencias externas

- Chart.js: local en `assets/vendor/`.
- XLSX.js, JSZip, PptxGenJS: CDN jsDelivr, bajo demanda en el panel admin.
- html2canvas: CDN, bajo demanda para exportar PNG.
- Google Fonts: Archivo (portada) y Barlow (estilos globales).

## Turno Nocturno (juego)

`dashboards/turno-nocturno.html` (`js/juego-turno-nocturno.js`,
`css/juego-turno-nocturno.css`). Juego en primera persona (raycasting sobre un
canvas de 320x200) ambientado en una tienda OXXO de madrugada: bodega, camara
fria, pasillos de anaqueles, barra de cafe y la puerta de SALIDA al frente.

Monitos (todos con el uniforme rojo de la tienda): chihuahua y jaguar muerden,
tlacuache y mono avientan monedas, los lobos (solo cabeza, flotan) y el pinguino
escupen, y el oso gerente cuida la salida.

Armas (teclas 1 a 5): trapeador de cloro (golpe, sin municion), escaner de
barras (laser, pilas), lanza-cafe (escopeta, cargas de cafe), terminal "No hay
sistema" (congela unos segundos a los monitos que te ven; recupera una senal
cada 12 s) y escudo "Caja cerrada" (mientras lo traes el dano baja a la cuarta
parte; empuja al disparar). Se empieza con trapeador y escaner; las otras tres
se recogen en el mapa (S, T y K). La torta da salud.
Funciona con teclado y raton o con controles tactiles en celular.

Paredes y objetos se dibujan con formas al arrancar. Las armas salen de
`assets/juego/armas.png` (360 px de alto; cada arma guarda su tramo en `hoja`)
y se pintan en un segundo canvas `#armas` de 960x600 encima de la vista; los
efectos de disparo (cloro, cafe, laser y ondas) se dibujan ahi mismo. Los
monitos salen de `assets/juego/monitos.png`: una celda de 128x128 por personaje, en el orden
de `MONITOS` dentro del motor; de esa pose se derivan los cuadros de caminar,
atacar, dolor y muerto. Si la imagen no carga, cada monito se ve como una
silueta y el juego sigue. No usa librerias ni lee o envia datos; solo carga
las fuentes de Google Fonts y, si no llegan, usa monospace. El mejor
tiempo vive en `localStorage` (`oxxo-turno-nocturno-record`). El mapa esta en
`MAP_SRC` y `tests/juego-turno-nocturno.test.js` verifica que siga siendo
rectangular, cerrado y con la salida alcanzable desde el inicio.
