/* ==========================================================
   OXXO DASHBOARDS - CONFIGURACION CENTRAL
   Edita aqui conexiones, pestanas y nombres compartidos.
   ========================================================== */

window.OXXO_CONFIG = {
  // ID del Google Sheets principal.
  SPREADSHEET_ID: "1EbUuyy-PRXiDwPmn9L14P93cGN6VXTyLfAHx-CE8M_A",

  // Pestanas base.
  CONFIG_SHEET: "Configuracion",
  CATALOG_SHEET: "Catalogo_Asesores",
  STORE_CATALOG_SHEET: "Catalogo_Tiendas",
  // Meta mensual de bajas por asesor (Dashboard 2, panel Compromiso).
  // Columnas esperadas: Plaza | Asesor | Compromiso. Antes vivian como nombres
  // reales hardcodeados en BAJAS_COMMITMENTS mas abajo, en este archivo JS
  // publico -- se movieron a esta pestana (igual que Catalogo_Asesores/
  // Catalogo_Tiendas) para no exponer nombres de personal en el codigo fuente.
  COMMITMENTS_SHEET: "Compromisos_Bajas",

  // Contexto operativo predeterminado. Oaxaca se conserva como plaza inicial
  // durante la transición; todas las pantallas pueden cambiar de alcance sin
  // duplicarse mediante SCOPE_MODEL.
  DATA_CONTEXT: {
    COUNTRY_CODE: "MX",
    COUNTRY: "Mexico",
    STATE: "Oaxaca",
    REGION: "TABASCO",
    PLAZA_ID: "PLAZA-OAXACA",
    PLAZA: "Plaza Oaxaca",
    ZONE: "",
    BRAND_SUBTITLE: "Plaza Oaxaca-ByPamsb",
    PLAZA_ALIASES: ["Oaxaca", "OXXO OAXACA", "10VHT Oaxaca"]
  },
  // Catálogo territorial oficial de la Región TABASCO. Los alias permiten
  // reconocer los nombres que ya aparecen en los archivos históricos.
  SCOPE_MODEL: {
    DEFAULT_LEVEL: "plaza",
    QUERY_PARAM: "scope",
    STORAGE_KEY: "oxxo_active_data_scope",
    DISCOVER_FROM_CATALOG: true,
    // Estas hojas históricas no tenían Plaza. Sus filas vacías se interpretan
    // como Oaxaca hasta que sean reemplazadas desde el panel regional.
    LEGACY_DEFAULT_PLAZA_TABS: ["Dashboard_9_Semanal", "Dashboard_14_Comercial", "Promociones"],
    REGIONS: [
      {
        ID: "REGION-TABASCO",
        NAME: "TABASCO",
        PLAZAS: [
          { ID: "PLAZA-OAXACA", NAME: "Plaza Oaxaca", SHORT_NAME: "Oaxaca", ALIASES: ["Oaxaca", "OXXO OAXACA", "10VHT Oaxaca"] },
          { ID: "PLAZA-COSTA-ISTMO", NAME: "Costa Istmo", SHORT_NAME: "Costa Istmo", ALIASES: ["Istmo", "Plaza Istmo", "OXXO COSTA ISTMO"] },
          { ID: "PLAZA-TUXTLA", NAME: "Tuxtla", SHORT_NAME: "Tuxtla", ALIASES: ["Plaza Tuxtla", "OXXO TUXTLA"] },
          { ID: "PLAZA-VILLAHERMOSA", NAME: "Villahermosa", SHORT_NAME: "Villahermosa", ALIASES: ["Plaza Villahermosa", "OXXO VILLAHERMOSA"] },
          { ID: "PLAZA-CHONTALPA", NAME: "Chontalpa", SHORT_NAME: "Chontalpa", ALIASES: ["Plaza Chontalpa", "OXXO CHONTALPA"] }
        ]
      }
    ]
  },
  // Columna de Plaza dentro de cada pestaña publicada. Core usa este mapa
  // para pedirle a GViz solamente las filas de la plaza activa; en alcance
  // Región se conserva la lectura completa. Las fuentes legacy sin Plaza no
  // se incluyen porque deben seguir resolviéndose del lado del navegador.
  // Dashboard_12_Mensual e Inventarios también se filtran localmente: sus
  // hojas actuales no usan la fila buffer de las publicaciones nuevas.
  SCOPED_GVIZ_COLUMNS: {
    "Dashboard_1_Diario": "A",
    "Dashboard_2_Diario": "A",
    "Dashboard_3_Diario": "A",
    "Dashboard_4_Semanal": "C",
    "Dashboard_5_Semanal": "B",
    "Dashboard_6_Semanal": "C",
    "Dashboard_7_Semanal": "A",
    "Dashboard_8_Diario": "C",
    "Dashboard_10_FLEX": "D",
    "Dashboard_11_Semanal": "D",
    "Catalogo_Tiendas": "D"
  },
  // Quien hereda las tiendas de un asesor que ya no esta (ej. Anadelia -> Timoteo).
  // Se administra desde el panel admin, pestana "Reasignaciones" -- no requiere
  // tocar codigo cuando otro asesor deje la empresa. Si la pestana aun no
  // existe en el Sheet, el sistema sigue funcionando igual que antes (cae al
  // respaldo fijo que ya trae core.js).
  REASIGNACIONES_SHEET: "Reasignaciones",

  // Metas mensuales de bajas por asesor. El tablero arma el roster desde los
  // datos de la plaza activa; esta tabla solo conserva las excepciones de meta
  // que ya estaban definidas para Oaxaca. Las plazas sin una meta particular
  // usan DEFAULT, por lo que nunca heredan nombres de otra plaza.
  // Meta por defecto cuando un asesor no tiene fila propia en la pestana
  // Compromisos_Bajas (ver COMMITMENTS_SHEET arriba) para la plaza activa.
  BAJAS_COMMITMENTS_DEFAULT: 4,

  // Web App de Apps Script usado por el panel admin para publicar bases y
  // para leer hojas directo (sin pasar por gviz, ver ADMIN_READ_ACTION mas
  // abajo).
  //
  // COMO REDESPLEGAR SIN CAMBIAR ESTA URL (importante):
  //   Implementar > Administrar implementaciones > selecciona la
  //   implementacion activa > icono de lapiz (Editar) > Version: "Nueva
  //   version" > Implementar.
  // Ese camino publica el codigo nuevo CONSERVANDO la misma URL /exec, y
  // entonces este archivo no se toca. Cada implementacion tiene su propio ID
  // y su propia URL estable; lo que cambia con cada version es el codigo que
  // sirve, no la direccion.
  //
  // El boton "Nueva implementacion" (el otro camino) crea una implementacion
  // DISTINTA, con URL /exec nueva, y deja la anterior viva pero congelada con
  // el codigo de ese momento. Si alguna vez el panel deja de ver los cambios
  // recien publicados, casi siempre es eso: se creo una implementacion nueva
  // y esta constante seguia apuntando a la vieja. Solo en ese caso hay que
  // actualizar la URL de abajo.
  //
  // Historial de versiones publicadas (que se cambio en el .gs cada vez):
  // 2026-08-14 (b): se agrego doGet(e) con action=readSheet, que
  // devuelve una hoja completa via SpreadsheetApp (sin gviz). Necesario
  // porque gviz corrompe la exportacion CSV de Catalogo_Asesores (fusiona
  // decenas de filas en una sola celda, ver loadAsesorCatalog en core.js).
  // 2026-08-14 (c): se agrego 'Dashboard_9_Semanal' a ALLOWED_SHEETS
  // para publicar el nuevo Dashboard 9 (Faltantes y Sobrantes).
  // 2026-08-17: se agrego 'Dashboard_10_FLEX' a ALLOWED_SHEETS para
  // publicar el nuevo Dashboard 10 (Personal FLEX).
  // 2026-08-18: se agrego 'Dashboard_11_Semanal' a ALLOWED_SHEETS
  // para publicar el nuevo Dashboard 11 (Registro y Apego a Horario).
  // 2026-08-18 (b): se restauro doGet(e) con action=readSheet, que
  // se habia perdido en el redeploy anterior (el doGet() de ese momento no
  // leia parametros en absoluto). Sin esto Catalogo_Asesores se publicaba
  // desde el respaldo estatico del repo en vez del Sheet en vivo.
  // 2026-08-18 (c): se agrego 'Reasignaciones' a ALLOWED_SHEETS,
  // para que el panel admin (pestana Reasignaciones) pueda publicar ahi.
  // 2026-08-21: se agrego 'Dashboard_12_Mensual' a ALLOWED_SHEETS
  // para publicar el nuevo Dashboard 12 (Enfoque del Lider). Es la primera
  // pestana con historico mensual: se carga con updateMode replacePeriod
  // sobre la columna 'Mes', asi que subir un mes NO borra los anteriores.
  // 2026-08-21 (c): se agrego 'Dashboard_13_Ausentismo' a ALLOWED_SHEETS para
  // publicar el nuevo Dashboard 13 (Control de Ausentismo). Se publico otra vez
  // como implementacion NUEVA, asi que la URL /exec volvio a cambiar y esta
  // constante se actualizo con ella. Verificado antes de fijarla: doGet lista
  // las 20 hojas permitidas con Dashboard_13_Ausentismo incluida, y
  // action=readSheet sigue respondiendo.
  // 2026-08-21 (b): implementacion NUEVA (URL /exec distinta a la anterior,
  // que sigue viva pero sin Dashboard_12_Mensual). Verificado contra la URL
  // de abajo: doGet responde con las 19 hojas permitidas incluyendo
  // Dashboard_12_Mensual, y action=readSheet sigue funcionando. Para las
  // proximas veces, ver "COMO REDESPLEGAR SIN CAMBIAR ESTA URL" arriba: si se
  // publica una version nueva sobre esta misma implementacion, esta constante
  // ya no se vuelve a tocar.
  // 2026-08-24 (v34): se restauro la app web, la lectura directa del
  // catalogo, la reparacion segura de pestanas y el soporte de D12/D13.
  // 2026-08-24 (v35): se agrego penalizacion progresiva y bitacora muestreada
  // para intentos de acceso incorrectos, protegiendo las cuotas de Apps Script.
  // 2026-08-24 (v36): verificacion de filas/columnas tras cada publicacion,
  // version visible en el panel y cadencias completas para todas las fuentes.
  // Se actualizo la implementacion existente; la URL /exec no cambio.
  // 2026-08-25: se agrego 'Dashboard_14_Comercial' a ALLOWED_SHEETS (nuevo
  // Dashboard 14, Avance Comercial) en apps-script/admin-upload.gs.
  // 2026-08-25 (b): implementacion NUEVA (se uso "Nueva implementacion" en
  // vez de "Nueva version" sobre la existente, asi que la URL /exec cambio;
  // la anterior sigue viva pero congelada sin Dashboard_14_Comercial).
  // Verificado antes de fijarla: doGet responde con las 21 hojas permitidas
  // incluyendo Dashboard_14_Comercial.
  // 2026-09-02 (v43): Catalogo_Tiendas se reconstruye automaticamente desde
  // la fotografia regional vigente de Dashboard_7_Semanal (TREO).
  // 2026-09-02 (v43, URL nueva): el usuario redesplego con "Nueva
  // implementacion" (no "Nueva version") al subir el fix de
  // writeWithBufferRow() que fuerza texto plano en columnas de fecha -- eso
  // crea una implementacion/URL DISTINTA en vez de actualizar la anterior, y
  // la anterior queda congelada con el codigo de ese momento (ver
  // docs/GUIA_ACTUALIZACION.md, "Redesplegar el Apps Script sin romper la
  // URL"). Se apunta aqui a la URL nueva porque es la que se confirmo con el
  // fix realmente pegado; el numero de version en el health-check (v43) no
  // sirve para distinguirlas porque es una constante fija en el .gs que no se
  // incrementa sola con cada cambio.
  ADMIN_UPLOAD_URL: "https://script.google.com/macros/s/AKfycbwe_RcnVRkZy9x1YcRuum4qdLucIWLTVsnTZcMvQDyobo6f3ot-YG0Lv00hYS-1XEg/exec",
  // Confirmado directamente contra la URL /exec el 27-08-2026. Sirve como
  // respaldo cuando Brave u otro navegador bloquea solo la consulta de salud.
  VERIFIED_ADMIN_RUNTIME_VERSION: 45,

  // Nombres exactos de pestanas en Google Sheets.
  TABS: {
    d1: "Dashboard_1_Diario",
    d2: "Dashboard_2_Diario",
    d2otras: "Dashboard_2_Otras_Plazas",
    d2denom: "Denominaciones_Dashboard_2_Diario",
    d2plan: "Dashboard_2_Plan_Accion",
    d3: "Dashboard_3_Diario",
    d3plazas: "Dashboard_3_Otras_Plazas",
    s4: "Dashboard_4_Semanal",
    s5: "Dashboard_5_Semanal",
    s6: "Dashboard_6_Semanal",
    s7: "Dashboard_7_Semanal",
    d8: "Dashboard_8_Diario",
    s9: "Dashboard_9_Semanal",
    d10: "Dashboard_10_FLEX",
    d11: "Dashboard_11_Semanal",
    m12: "Dashboard_12_Mensual",
    a13: "Dashboard_13_Ausentismo",
    c14: "Dashboard_14_Comercial",
    promos: "Promociones",
    inventories: "Inventarios"
  }
};
