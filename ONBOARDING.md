# Onboarding de un cliente nuevo

Este repo hoy es **mono-cliente** (OXXO) pero ya es **multi-plaza dentro de la
Región TABASCO**: Plaza Oaxaca, Costa Istmo, Tuxtla, Villahermosa y Chontalpa
se eligen con el selector de alcance sin duplicar pantallas. Este documento
es el inventario honesto de qué se puede reconfigurar sin tocar código y
qué sigue cableado a esta marca/región y requeriría cambios reales para
atender a un cliente distinto. No implementa nada — es la base para
decidir cuánto se invierte antes de vender el sistema a alguien más.

## 1. Lo que ya es configuración (no requiere tocar código)

Todo vive en `js/config.js` (`window.OXXO_CONFIG`), cargado antes que
`js/core.js` en las 21 páginas del sitio (`core.js` no tiene configuración
de respaldo: sin `config.js` se detiene):

- `SPREADSHEET_ID` — el Google Sheet que alimenta todos los dashboards.
- `CONFIG_SHEET`, `CATALOG_SHEET`, `REASIGNACIONES_SHEET` — nombres de pestañas.
- `ADMIN_UPLOAD_URL` — el Web App de Apps Script que usa el panel admin para
  publicar y para leer el catálogo directo (`action=readSheet`, ver más abajo).
- `TABS` — nombres exactos de las 20 pestañas de datos (`Dashboard_1_Diario`, etc).
- `DATA_CONTEXT` — región, plaza inicial (Oaxaca), subtítulo de marca y alias.
- `SCOPE_MODEL` — catálogo territorial: región TABASCO y sus cinco plazas con
  alias, parámetro de URL (`scope`) y llave de almacenamiento del alcance activo.
- `SCOPED_GVIZ_COLUMNS` — columna de Plaza de cada pestaña para pedir solo la
  plaza activa; `LEGACY_DEFAULT_PLAZA_TABS` — pestañas históricas sin Plaza
  (se leen como la plaza por defecto).

Para **otra plaza de la misma región** basta con agregarla a `SCOPE_MODEL`
(con sus alias) y publicar su base: el panel la reconoce, los tableros la
ofrecen en el selector y cada plaza reemplaza solo sus filas
(`replaceScope`). Para un **cliente nuevo**, técnicamente bastaría con crear
su propio Google Sheet con esas pestañas y columnas (sección 3), desplegar su
propio Apps Script y actualizar estos valores. **Pero eso no alcanza** porque
quedan supuestos de marca y de operación cableados — ver sección 2.

## 2. Lo que sigue cableado en el código (requeriría cambios reales)

Ya **no** está cableado a una sola plaza:

- **Ingesta del panel admin** (`js/admin/normalizers.js`): `containsOaxaca()`
  conserva su nombre por compatibilidad, pero acepta cualquier plaza reconocida
  del catálogo (`OXXO.matchesAnyKnownPlaza`). Las filas de otras plazas ya no se
  descartan y cada plaza reemplaza solo las suyas en Google Sheets
  (`scopeColumns` -> `replaceScope` en `admin-upload.gs`).
- **Lectura en los tableros**: el alcance activo (`getActiveDataScope()`) filtra
  por plaza o región; no hay un literal `'OAXACA'` en el filtro de filas.
- **Alcance fijo por diseño**: Dashboard 13 (Control de Ausentismo) es exclusivo
  de Plaza Oaxaca (`data-oxxo-fixed-*` en su `<html>`).

Sigue cableado (supuestos honestos que quedan):

### a) Estructura comparativa y de tiendas propia de esta región

- `js/admin/dashboard-definitions.js` — `PEER_PLAZAS_D2OTRAS` y `PEER_PLAZAS_D3`:
  listas fijas de plazas comparativas (Chontalpa, Villahermosa, Costa Istmo,
  Tuxtla) para los rankings de Dashboard 2 y 3; asumen exactamente cuatro plazas
  vecinas.
- `js/core.js` — dos regex que reconocen estructuras `ENTRENAMIENTO OAXACA…` y
  `OPERACIONES N OAXACA` para excluirlas del conteo de tiendas reales, y la lista
  corta de preaperturas por nombre (`PREOPENING_STORE_KEYS`).
- `Catalogo_Tiendas` se reconstruye desde TREO (`Dashboard_7_Semanal`); una tienda
  ausente de TREO se muestra igual y solo se oculta con `ACTIVA = NO`.

### b) Marca y textos

- Subtítulo de marca (`DATA_CONTEXT.BRAND_SUBTITLE`, "Plaza Oaxaca-ByPamsb"), logos
  y textos "OXXO / Plaza Oaxaca" en la portada, encabezados y pies de página.
- Dashboard 13 y algunos encabezados de tablero llevan "Plaza Oaxaca" como texto.

### c) Generadores de PPTX (exportar presentación desde el admin)

- `js/admin-pptx.js`, `js/admin-pptx-asesor.js`, `js/admin-pptx-rae.js` —
  literales de `Plaza Oaxaca` / `OAXACA` en slides y nombre de archivo exportado
  (`Presentacion-RAE-Oaxaca-...pptx`), y un ranking que asume una plaza propia + 4
  comparativas fijas.

### d) Seguridad

- El candado del sitio es disuasión del lado del cliente; las hojas públicas de
  Google y el Apps Script de lectura no están protegidos. Un cliente real con
  datos sensibles necesita autenticación y hojas privadas antes de publicarse.

**Resumen**: parametrizar para un cliente distinto significa introducir algo como
`CONFIG.BRAND` y `CONFIG.PEER_PLAZAS`, reemplazar los puntos de arriba y revisar
cómo cada tablero calcula sus comparativos (hoy asumen cuatro plazas vecinas).
Es un cambio transversal, no una tarea corta.

## 3. Estructura de Google Sheet requerida por dashboard

Columnas tomadas de `js/admin/dashboard-definitions.js` (`output`/`required`
de cada definición) — son las que el admin espera poder mapear desde el
Excel de origen antes de publicar:

| Pestaña (`TABS`) | Dashboard | Columnas obligatorias |
|---|---|---|
| `Dashboard_1_Diario` | 1 — Vacantes | Plaza, Asesor, Unidad org, ID posiciones, Descripcion de Posicion, Status ocupacion |
| `Dashboard_2_Diario` | 2 — Bajas | Plaza, Asesor, Nombre del empleado, Fecha, Semana, Temporalidad, Rot_Temp, Puesto, Tienda |
| `Dashboard_2_Otras_Plazas` | 2 — Bajas comparativo | Plazas, Bajas Plaza |
| `Denominaciones_Dashboard_2_Diario` | 2 — Movimientos ABC | Plaza, Asesor, Denominacion Medida, Nombre del empleado, F.Crea, Denominacion Funcion Anterior/Actual |
| `Dashboard_2_Plan_Accion` | 2 — Plan de acción | Hallazgo, Accion (captura manual) |
| `Dashboard_3_Diario` | 3 — Estructura | Plaza, CR TIENDA, Asesor, Tienda, Estructura Diaria, Aprovechamiento Estructura, Estatus Con impacto Ausentismo, FECHA |
| `Dashboard_3_Otras_Plazas` | 3 — Aprovechamiento comparativo | PLAZAS, Aprovechamiento de estructura a hoy |
| `Dashboard_4_Semanal` | 4 — Tiempo extra | Plaza, Asesor, Nombre del empleado o candidato, Textos homologados, Texto breve de unidad organizativa, Cantidad, Importe, Semana |
| `Dashboard_5_Semanal` | 5 — Vacaciones | Plaza, Asesor, Tienda, Puesto, No. De Empleado, Nombre, Dias_Restantes |
| `Dashboard_6_Semanal` | 6 — Ausentismos | Plaza, Asesor, N de personal, Nombre del empleado o candidato, Tienda, Tipo_Ausentismo, Denominacion, Absentismos solo en la semana, Semana |
| `Dashboard_7_Semanal` | 7 — TREO | Plaza, CR, Tienda, Asesor, Estructura Propuesta TREO, Estructura SAP, Empleados Activos, Vacantes, Movimiento Inicial |
| `Dashboard_8_Diario` | 8 — Capacidades | Plaza, Asesor_Correcto, Puesto_Correcto, Empleados |
| `Dashboard_9_Semanal` | 9 — Faltantes y sobrantes | CR, Importe, Fecha, Semana |
| `Dashboard_10_FLEX` | 10 — Personal FLEX | Tienda, Asesor, Fecha |
| `Dashboard_11_Semanal` | 11 — Registro y Apego a Horario | Tienda, Asesor, Fecha |
| `Dashboard_12_Mensual` | 12 — Enfoque del Líder | Mes, Plaza, CR Tienda, Tienda, Asesor, Clas Final |
| `Dashboard_13_Ausentismo` | 13 — Control de Ausentismo | Nombre, Clasificacion, Tienda, Asesor |
| `Dashboard_14_Comercial` | 14 — Avance Comercial | Tienda, Asesor, Spin, Premia, Cruzada Andatti, Venta Sugerida, Banner |
| `Inventarios` | Administrativo — Resultados de Inventario | CR, Tienda, Plaza, Asesor Comercial, Fecha de Inventario, Resultado de Inventario, Ventas sin TAE del mes |
| `Promociones` | Comercial — PromosD100 | (se edita directo en Sheets, no pasa por el panel admin; ver `admin-commercial-panel` en `admin.html`) |
| `Catalogo_Asesores` | Catálogo compartido | ASESOR, TIENDA, CR TIENDA |
| `Reasignaciones` | Reasignación de asesores salientes | (ver `js/admin-reasignaciones.js`) |
| `Configuracion` | Fecha de corte global | (ver panel admin) |

## 4. Apps Script

El Web App que publica datos y sirve el catálogo en vivo (`readSheet`) está
versionado en `apps-script/admin-upload.gs`. **Ese archivo es solo un
espejo**: cada vez que se edita hay que copiarlo a mano al editor de
script.google.com y volver a desplegarlo — git no lo publica solo. Cada
redeploy genera una URL `/exec` nueva si se usa "Nueva implementación" (la
anterior queda congelada, no falla, simplemente deja de reflejar cambios;
pasó varias veces en este proyecto) o conserva la misma URL si se usa
"Nueva versión" sobre la implementación existente (ver
`docs/GUIA_ACTUALIZACION.md`, sección "Redesplegar el Apps Script sin
romper la URL"). Para un cliente nuevo: copiar `apps-script/admin-upload.gs`
al proyecto de Apps Script de su propio Sheet, ajustar `SPREADSHEET_ID` /
`ALLOWED_SHEETS` si aplica, y desplegarlo como Web App.

## 5. Checklist manual para un cliente nuevo (estado actual, sin refactor)

1. Crear un Google Sheet nuevo con las pestañas y columnas de la sección 3.
2. Copiar el Apps Script (ver sección 4) al proyecto de Apps Script del
   Sheet nuevo, ajustar `SPREADSHEET_ID`/`ALLOWED_SHEETS` si aplica, y
   desplegarlo como Web App.
3. Actualizar `js/config.js` con el `SPREADSHEET_ID` y `ADMIN_UPLOAD_URL`
   nuevos (probablemente en un fork o rama separada del repo, ya que hoy es
   mono-cliente).
4. Registrar las plazas del cliente en `SCOPE_MODEL` (con alias) y ajustar las
   plazas comparativas (`PEER_PLAZAS_*`) según la sección 2a.
5. Revisar y ajustar los textos de marca (sección 2b) y los generadores de
   PPTX (sección 2c).

Los pasos 1-3 son mecánicos. Los pasos 4-5 (comparativos y marca) son el costo real
de vender el sistema a alguien más — vale la pena parametrizarlos el día que haya
un cliente real en la mira, en vez de mantenerlos como checklist manual.
