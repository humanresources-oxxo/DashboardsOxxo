(function(){
  // Toda la logica de columnas/filtros/fechas que replica el comportamiento
  // real de los dashboards vive en core.js (window.OXXO.metrics*), para que
  // dashboards y presentaciones nunca vuelvan a divergir. Aqui solo se
  // referencian esas funciones \u2014 nada de esto se reimplementa.
  const findKey = OXXO.metricsFindKey;
  const findDataKey = OXXO.metricsFindDataKey;
  const val = OXXO.metricsVal;
  const num = OXXO.metricsNum;
  const normText = OXXO.metricsNormText;
  const latestByKey = (rows, key) => { const vals = [...new Set(rows.map(r => String(r[key]||'').trim()).filter(Boolean))]; return vals.sort().slice(-1)[0] || ''; };
  // Escapa texto que viene de Sheets antes de insertarlo como HTML (ej. el
  // selector de mes): una celda 'Mes' con formato invalido se usa tal cual
  // como etiqueta, y sin este escape un valor malicioso en el Sheet podria
  // inyectar HTML/JS en admin.html.
  function escHtml(value){ return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
  const rowMonthKeyD1 = OXXO.metricsRowMonthKeyD1;
  const rowMonthKeyD2 = OXXO.metricsRowMonthKeyD2;
  const filterLatestMonth = OXXO.metricsFilterLatestMonth;
  const tipoPuesto = OXXO.metricsTipoPuesto;
  const coerceTreoRowsD7 = OXXO.metricsCoerceTreoRows;
  // Misma regla que normalizePct() en dashboard-3.html: solo se divide entre
  // 100 cuando el valor viene claramente duplicado por el formato Porcentaje
  // de Sheets (>150). Un aprovechamiento real de 100-150% (tienda con mas
  // activos de los necesarios) no se debe tocar.
  function normPct(v){ const n = num(v); return n > 150 ? n / 100 : n; }
  // Dashboard 8 publica certificaciones como 1=completo, 0=pendiente,
  // fracción=avance parcial y vacío=no aplica. Estas reglas replican su
  // lectura para que la RAE nunca presente un porcentaje distinto al tablero.
  const CAP_IGNORADAS = new Set([
    'promediodecobrodlssedesmundialistas2026',
    'promedioderesultadocertificacionalimentosybebidas2026',
    'panhorneado'
  ]);
  const CAP_ETIQUETAS = {
    'promediodecodigodeetica2026': 'Código de Ética',
    'promediodeseguridadenlapersona2026': 'Seguridad en la Persona',
    'promediodepld2026certificacion': 'PLD 2026',
    'promediodemodulocercasiempre2026': 'Módulo Cerca Siempre',
    'promediodecapacidadtableroamazoncounter': 'Tablero Amazon Counter'
  };
  const capKey = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
  const capLabel = key => CAP_ETIQUETAS[capKey(key)] || String(key).replace(/^\s*Promedio de\s+/i,'').trim();
  const isCapColumn = key => /^\s*Promedio de\s+/i.test(String(key || '')) && !CAP_IGNORADAS.has(capKey(key));
  function capValue(row, key){
    const raw = row?.[key];
    if(raw === undefined || raw === null || String(raw).trim() === '') return null;
    const value = num(raw);
    // El origen ocasionalmente publica 0.3333 como 3.333. Es un avance de
    // certificación, así que valores >1 se recuperan igual que Dashboard 8.
    if(value > 1){
      const digits = String(raw).replace(/\D/g,'');
      const fixed = Number('0.' + digits);
      return Number.isFinite(fixed) ? fixed : 0;
    }
    return Number.isFinite(value) ? value : null;
  }
  // Acorta un nombre largo a "Nombre(s) Apellido1 A." (inicial del ultimo
  // apellido) en vez de cortarlo a solo el primer nombre: la plaza suele tener
  // varios asesores que comparten nombre de pila, asi que recortar de mas
  // volveria a confundirlos.
  function shortenName(name, maxChars = 24){
    const trimmed = String(name || '').trim();
    if(trimmed.length <= maxChars) return trimmed;
    const parts = trimmed.split(/\s+/);
    if(parts.length <= 2) return trimmed;
    return `${parts.slice(0, -1).join(' ')} ${parts[parts.length - 1][0]}.`;
  }
  // Ranking de conteo por nombre (p.ej. vacantes o bajas por Asesor), top N descendente.
  function rankCount(rows, nameKey, limit){
    const counts = new Map();
    rows.forEach(r => {
      const name = String(val(r, nameKey)||'').trim();
      if(!name) return;
      counts.set(name, (counts.get(name)||0) + 1);
    });
    return [...counts.entries()].map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value).slice(0, limit);
  }
  // Ranking de promedio por nombre (p.ej. % aprovechamiento por AT), ordenado descendente.
  function rankAvg(rows, nameKey, valueKey, limit){
    const sums = new Map(), counts = new Map();
    rows.forEach(r => {
      const name = String(val(r, nameKey)||'').trim();
      if(!name) return;
      sums.set(name, (sums.get(name)||0) + num(val(r, valueKey)));
      counts.set(name, (counts.get(name)||0) + 1);
    });
    return [...sums.entries()].map(([name, sum]) => ({ name, value: sum / counts.get(name) })).sort((a,b) => b.value - a.value).slice(0, limit);
  }
  async function dataD1(targetMes = ''){
    const source = await OXXO.metricsD1Rows(true);
    if (!source || (targetMes && !source.months.includes(targetMes))) return null;
    const { puestoKey, asesorKey } = source;
    const mes = targetMes || source.currentMonth;
    const rows = source.rows.filter(r => rowMonthKeyD1(r, source.mesKey, source.fechaKey) === mes);
    const byPuesto = { Lider: 0, Encargado: 0, Ayudante: 0, Otro: 0 };
    rows.forEach(r => { byPuesto[tipoPuesto(val(r, puestoKey))]++; });
    // Misma lectura de antigüedad que la tabla "Vacantes por asesor" del
    // Dashboard 1. Las tiendas nuevas y los meses finalizados sí cuentan como
    // vacantes, pero no deben alterar promedio, máximo ni semáforo.
    const diasKey = rows.length ? findKey(rows[0], ['Dias Vacantes', 'Dias_Vacantes']) : null;
    const asesores = new Map();
    rows.forEach(r => {
      const name = String(val(r, asesorKey) || '').trim() || 'Sin asesor';
      if (!asesores.has(name)) asesores.set(name, { name, vacantes: 0, diasCount: 0, sumDias: 0, maxDias: 0, d3: 0, d6: 0, dMas6: 0 });
      const item = asesores.get(name);
      item.vacantes++;
      const rawDias = diasKey ? val(r, diasKey) : '';
      const rawText = String(rawDias ?? '').trim();
      const dias = OXXO.metricsDiasVacantesValue(rawDias);
      const sinAntiguedad = !rawText || /finaliz/i.test(rawText) || dias > 500;
      if (sinAntiguedad) return;
      item.diasCount++;
      item.sumDias += dias;
      item.maxDias = Math.max(item.maxDias, dias);
      if (dias <= 3) item.d3++;
      else if (dias <= 6) item.d6++;
      else item.dMas6++;
    });
    const tablaAsesores = [...asesores.values()]
      .map(item => ({ ...item, promedio: item.diasCount ? item.sumDias / item.diasCount : null }))
      .sort((a, b) => b.vacantes - a.vacantes || a.name.localeCompare(b.name, 'es'));
    const totalTabla = tablaAsesores.reduce((total, item) => ({
      vacantes: total.vacantes + item.vacantes,
      diasCount: total.diasCount + item.diasCount,
      sumDias: total.sumDias + item.sumDias,
      maxDias: Math.max(total.maxDias, item.maxDias),
      d3: total.d3 + item.d3,
      d6: total.d6 + item.d6,
      dMas6: total.dMas6 + item.dMas6,
    }), { vacantes: 0, diasCount: 0, sumDias: 0, maxDias: 0, d3: 0, d6: 0, dMas6: 0 });
    totalTabla.promedio = totalTabla.diasCount ? totalTabla.sumDias / totalTabla.diasCount : null;
    return {
      total: rows.length, sub: mes ? `Mes ${mes}` : 'Plaza Oaxaca',
      byPuesto,
      ranking: rankCount(rows, asesorKey, 15),
      tablaAsesores,
      totalTabla,
    };
  }

  async function dataD2(targetMes = ''){
    const source = await OXXO.metricsD2Rows(targetMes);
    if (!source) return null;
    const { rows, mes, puestoKey, asesorKey } = source;
    const byPuesto = { Lider: 0, Encargado: 0, Ayudante: 0, Otro: 0 };
    rows.forEach(r => { byPuesto[tipoPuesto(val(r, puestoKey))]++; });
    // La lámina de análisis conserva las mismas filas ya filtradas por
    // metricsD2Rows() que usa la lámina de resumen y el Dashboard 2.
    const sample = rows[0] || {};
    const tiendaKey = findKey(sample, ['Tienda','Unidad org.','Unidad org','Unidad Organizativa','Unidad','Sucursal','Nombre Tienda']);
    const motivoKey = findKey(sample, ['Motivo de baja','Motivo_baja','Motivo','Causa','Causa baja','Baja con causal','Tipo de baja']);
    const edadKey = findKey(sample, ['Edad']);
    const temporalidadKey = findKey(sample, ['Temporalidad','Temporalidad baja','Rango antigüedad','Rango antiguedad','Antigüedad rango','Antiguedad rango']);
    const normalizeMotivo = raw => {
      const clean = normText(raw);
      if(!clean) return 'Sin motivo';
      if(clean.includes('RENUNCIA')) return 'RENUNCIA';
      if(clean.includes('CAUSAL')) return 'BAJA CON CAUSAL';
      if(clean.includes('ABANDONO')) return 'ABANDONO';
      return String(raw || '').trim();
    };
    const rankBy = (key, normalize = value => String(value || '').trim() || 'Sin dato', limit = 10) => {
      const counts = new Map();
      rows.forEach(row => {
        const label = normalize(val(row, key));
        counts.set(label, (counts.get(label) || 0) + 1);
      });
      return [...counts.entries()].map(([label,total]) => ({ label, total }))
        .sort((a,b) => b.total - a.total || a.label.localeCompare(b.label, 'es')).slice(0, limit);
    };
    const edades = [
      { label:'18-25', min:18, max:25 }, { label:'26-35', min:26, max:35 },
      { label:'36-45', min:36, max:45 }, { label:'46-55', min:46, max:55 },
      { label:'56+', min:56, max:Infinity }
    ];
    const antiguedades = ['0 - 45 días','46 - 90 días','3 - 6 meses','6 - 12 meses','> 1 año'];
    const mapaCalor = edades.map(edad => ({ label: edad.label, values: antiguedades.map(() => 0) }));
    rows.forEach(row => {
      const age = num(val(row, edadKey));
      const ageIndex = edades.findIndex(group => age >= group.min && age <= group.max);
      const tenureIndex = antiguedades.indexOf(String(val(row, temporalidadKey) || '').trim());
      if(ageIndex >= 0 && tenureIndex >= 0) mapaCalor[ageIndex].values[tenureIndex]++;
    });
    return {
      total: rows.length, sub: mes ? `Mes ${mes}` : 'Plaza Oaxaca',
      byPuesto,
      ranking: rankCount(rows, asesorKey, 15),
      motivos: rankBy(motivoKey, normalizeMotivo, 8),
      tiendas: rankBy(tiendaKey, undefined, 10),
      heatmap: { edades: edades.map(group => group.label), antiguedades, values: mapaCalor },
    };
  }

  async function dataD3(){
    // La RAE es una presentación exclusiva de Plaza Oaxaca. El panel puede
    // conservar un alcance regional de una navegación previa; no debe hacer
    // que esta diapositiva mezcle asesores de otras plazas ni nombres crudos
    // de la fuente ("CENTRALIZACION").
    const raw = await OXXO.fetchSheetData(OXXO.SHEETS_CONFIG.TABS.d3, { scoped: false });
    if(!raw || !raw.length) return null;
    const oaxacaScope = OXXO.normalizeDataScope({ level:'plaza', region:'TABASCO', plaza:'Plaza Oaxaca' });
    const scoped = raw.filter(r => OXXO.rowMatchesDataScope(r, oaxacaScope));
    if(!scoped.length) return null;
    const estatusKey = findKey(scoped[0], ['Clas Aprov','Estatus Con impacto Ausentismo','Estatus']);
    const asesorKey = findKey(scoped[0], ['Asesor']);
    const tiendaKey = findKey(scoped[0], ['Tienda']);
    const crKey = findKey(scoped[0], ['CR TIENDA','CR Tienda','CR','ID Tienda']);
    // Estas columnas son opcionales. Se exige nombre exacto para no confundir
    // "EC" con "EC SIN AUSENTISMO" o "AT" con parte de "Estatus".
    const ecPorAtKey = OXXO.metricsFindKeyExact(scoped[0], ['Ec por AT','EC POR AT','Ec Por AT','EC']);
    const atKey = OXXO.metricsFindKeyExact(scoped[0], ['Ats','ATS','AT','At']);
    const fechaKey = findKey(scoped[0], ['Mes Semana','Semana','Fecha','FECHA']);
    const asesorCatalog = await OXXO.loadAsesorCatalog();
    const visible = scoped.filter(r => OXXO.isTiendaValid(asesorCatalog, val(r, tiendaKey), val(r, crKey)));
    if(!visible.length) return null;
    // Igual que Dashboard 3: aunque cada carga deberia reemplazar toda la
    // pestana (foto diaria), si llegaran a quedar varias fechas mezcladas se
    // usa solo la mas reciente, para no promediar dias distintos.
    const fecha = latestByKey(visible, fechaKey);
    const rows = fecha ? visible.filter(r => String(r[fechaKey]||'').trim() === fecha) : visible;
    const total = rows.length;
    // Misma clasificacion que isCompleta/isIncompleta/isCritica de
    // dashboard-3.html (por texto de Estatus, no por umbral numerico).
    const clasifica = r => OXXO.metricsClasificaAprovechamiento(val(r, estatusKey));
    let completas = 0, incompletas = 0, criticas = 0;
    rows.forEach(r => {
      const c = clasifica(r);
      if(c === 'criticas') criticas++;
      else if(c === 'incompletas') incompletas++;
      else if(c === 'completas') completas++;
    });
    // "Aprovechamiento General" del Dashboard 3 = Equipo Completo / Total (EC%).
    const pct = total > 0 ? (completas / total * 100) : 0;

    // El gauge de OAXACA en "Aprovechamiento por Plaza" reutiliza ese mismo
    // EC% (asi lo calcula dashboard-3.html cuando no hay una columna de plaza
    // por tienda separada) — no es un promedio del aprovechamiento crudo.
    const oaxacaAvg = pct;

    let plazas = [];
    try {
      const otras = await OXXO.fetchSheetData(OXXO.SHEETS_CONFIG.TABS.d3plazas,{scoped:false});
      if(otras && otras.length){
        // findDataKey (no findKey): la hoja de "Otras Plazas" es una carga
        // manual y, como la de TREO, puede traer el mismo problema de
        // exportacion de Google donde el encabezado real queda pegado como
        // texto dentro de otra columna (fila "_buffer_..."). findKey se
        // conformaba con la primera columna que *mencionara* el alias
        // (pudiendo ser una vacia); findDataKey elige la que de verdad
        // tiene datos.
        const plazaKey = findDataKey(otras, ['PLAZAS','Plaza']);
        const valKey = findDataKey(otras, ['Aprovechamiento de estructura a hoy','Aprovechamiento'], 25, true);
        plazas = otras.map(r => ({ name: String(val(r, plazaKey)||'').trim(), value: normPct(val(r, valKey)) })).filter(p => p.name);
      }
    } catch(e){ /* sin datos de otras plazas: se muestra solo Oaxaca */ }
    plazas.push({ name: 'OAXACA', value: oaxacaAvg });
    plazas.sort((a,b) => b.value - a.value);

    // "Aprovechamiento por AT" = tabla EC% (AT) del Dashboard 3: usa la
    // columna 'Ec por AT' de la hoja si viene poblada; si no, cae al mismo
    // EC% (completas/total) calculado por asesor con la clasificacion de
    // Estatus de arriba — nunca el umbral sobre el valor crudo.
    // Dashboard-3.html cruza el EC% (columna 'Ec por AT') por la columna 'AT'
    // (no 'Asesor'), y ese promedio se calcula sobre TODA la base cargada
    // (ALL_DATA, sin filtrar por fecha/semana) — "fijo, no depende de
    // filtros". El resto (total de tiendas y EC% de respaldo) sí usa solo
    // las filas de la fecha mas reciente.
    const ecByAt = new Map();
    if(ecPorAtKey && atKey){
      visible.forEach(r => {
        const ecVal = normPct(val(r, ecPorAtKey));
        const atName = String(OXXO.resolveAsesorD1(asesorCatalog, {
          cr: val(r, crKey), tienda: val(r, tiendaKey), asesor: val(r, atKey)
        }) || '').trim().toUpperCase();
        if(!(ecVal > 0) || !atName) return;
        if(!ecByAt.has(atName)) ecByAt.set(atName, { sum: 0, n: 0 });
        const acc = ecByAt.get(atName);
        acc.sum += ecVal; acc.n++;
      });
    }
    // dashboard-3.html resuelve 'Sin Asesor Asignado' a Timoteo Antonio Perez
    // (via resolveAsesorD1) antes de agrupar por asesor: sin esto, las
    // tiendas sin AT vigente aparecian como su propia fila "Sin Asesor
    // Asignado" en el respaldo EC%, mezcladas con nombres de personas
    // reales. No afecta al cruce por 'ecByAt' de arriba, que agrupa por la
    // columna 'AT' (un concepto distinto a 'Asesor').
    const byAsesor = new Map();
    rows.forEach(r => {
      const name = String(OXXO.resolveAsesorD1(asesorCatalog, { cr: val(r, crKey), tienda: val(r, tiendaKey), asesor: val(r, asesorKey) }) || '').trim();
      if(!name) return;
      // "Sin Asesor Asignado" no es una persona: son las tiendas sin AT
      // vigente que resolveAsesorD1 no pudo reatribuir (Entrenamiento y
      // Operaciones). Agrupadas encabezaban el ranking con 100%, presentadas
      // como el mejor AT de la plaza arriba de todas las personas reales.
      if(normText(name).replace(/[^A-Z]/g, '').includes('SINASESOR')) return;
      if(!byAsesor.has(name)) byAsesor.set(name, { total: 0, completas: 0 });
      const acc = byAsesor.get(name);
      acc.total++;
      if(clasifica(r) === 'completas') acc.completas++;
    });
    const ranking = [...byAsesor.entries()]
      .map(([name, v]) => {
        const ecAt = ecByAt.get(name.trim().toUpperCase());
        const ec = v.total > 0 ? v.completas / v.total : 0;
        return { name, value: ecAt ? ecAt.sum / ecAt.n : ec * 100, hasData: !!ecAt || ec > 0 };
      })
      .filter(x => x.hasData)
      .sort((a,b) => b.value - a.value)
      .slice(0, 15);

    return {
      sub: fecha ? `Corte ${fecha}` : 'Corte no informado',
      pct, completas, incompletas, criticas,
      plazas: plazas.slice(0, 5),
      ranking,
    };
  }

  async function dataD8(){
    const raw = await OXXO.fetchSheetData(OXXO.SHEETS_CONFIG.TABS.d8, { scoped: false });
    if(!raw || !raw.length) return null;
    const oaxacaScope = OXXO.normalizeDataScope({ level:'plaza', region:'TABASCO', plaza:'Plaza Oaxaca' });
    const scoped = raw.filter(r => OXXO.rowMatchesDataScope(r, oaxacaScope));
    if(!scoped.length) return null;
    const sample = scoped[0];
    const asesorKey = findKey(sample, ['Asesor_Correcto','Asesor']);
    const empleadoKey = findKey(sample, ['Nº personal','N personal','No Personal','Empleados','Empleado']);
    const tiendaKey = findKey(sample, ['Unidad org.','Unidad org','Tienda']);
    const crKey = findKey(sample, ['Cr de tienda','CR TIENDA','CR Tienda','CR','ID Tienda']);
    const asesorCatalog = await OXXO.loadAsesorCatalog();
    const rows = scoped.filter(r => OXXO.isTiendaValid(asesorCatalog, val(r, tiendaKey), val(r, crKey)));
    if(!rows.length) return null;
    const certifications = Object.keys(sample).filter(isCapColumn);
    if(!certifications.length) return null;

    const stats = certifications.map(key => {
      let aplic = 0, comp = 0;
      rows.forEach(row => {
        const value = capValue(row, key);
        if(value === null) return;
        aplic++;
        if(value >= 1) comp++;
      });
      return { key, label: capLabel(key), aplic, comp, pct: aplic ? comp / aplic * 100 : null };
    }).filter(item => item.aplic > 0);
    if(!stats.length) return null;
    const aplic = stats.reduce((sum, item) => sum + item.aplic, 0);
    const comp = stats.reduce((sum, item) => sum + item.comp, 0);
    const byAsesor = new Map();
    rows.forEach(row => {
      const name = String(val(row, asesorKey) || 'Sin Asesor Asignado').trim();
      if(!byAsesor.has(name)) byAsesor.set(name, { aplic:0, comp:0 });
      const acc = byAsesor.get(name);
      certifications.forEach(key => {
        const value = capValue(row, key);
        if(value === null) return;
        acc.aplic++;
        if(value >= 1) acc.comp++;
      });
    });
    const asesores = [...byAsesor.entries()]
      .map(([name, value]) => ({ name, pct: value.aplic ? value.comp / value.aplic * 100 : 0, aplic: value.aplic }))
      .filter(item => item.aplic > 0 && !normText(item.name).replace(/[^A-Z]/g,'').includes('SINASESOR'))
      .sort((a,b) => a.pct - b.pct || a.name.localeCompare(b.name));
    const empleados = new Set(rows.map(row => String(val(row, empleadoKey) || '').trim()).filter(Boolean)).size;
    const tiendas = new Set(rows.map(row => String(val(row, tiendaKey) || '').trim()).filter(Boolean)).size;
    const cercaKey = certifications.find(key => capKey(key).includes('cercasiempre'));
    let cercaSiempre = null;
    if(cercaKey){
      const resumen = stats.find(item => item.key === cercaKey);
      const porAsesor = new Map();
      rows.forEach(row => {
        const value = capValue(row, cercaKey);
        if(value === null) return;
        const name = String(val(row, asesorKey) || 'Sin Asesor Asignado').trim();
        if(!porAsesor.has(name)) porAsesor.set(name, { name, aplic: 0, comp: 0 });
        const item = porAsesor.get(name);
        item.aplic++;
        if(value >= 1) item.comp++;
      });
      const asesoresCerca = [...porAsesor.values()]
        .map(item => ({ ...item, pendientes: item.aplic - item.comp, pct: item.aplic ? item.comp / item.aplic * 100 : 0 }))
        .filter(item => item.aplic && !normText(item.name).replace(/[^A-Z]/g,'').includes('SINASESOR'))
        .sort((a,b) => a.pct - b.pct || b.pendientes - a.pendientes || a.name.localeCompare(b.name));
      cercaSiempre = {
        label: resumen.label,
        aplicables: resumen.aplic,
        completadas: resumen.comp,
        pendientes: resumen.aplic - resumen.comp,
        pct: resumen.pct || 0,
        asesores: asesoresCerca.slice(0, 10),
      };
    }
    return {
      sub: 'Corte vigente', empleados, tiendas, pct: aplic ? comp / aplic * 100 : 0,
      completadas: comp, aplicables: aplic,
      criticas: stats.sort((a,b) => a.pct - b.pct).slice(0, 3),
      asesores: asesores.slice(0, 10),
      cercaSiempre,
    };
  }

  // Replica la fuente de TREO del dashboard: SAP/Activos/Vacantes se recalculan
  // desde Dashboard_1_Diario por CR/Tienda para que el reporte coincida con la vista.
  const buildEstructuraDiariaD1 = OXXO.metricsBuildEstructuraDiariaD1;

  async function dataD7(){
    const [rawSheet, estructuraD1] = await Promise.all([
      OXXO.fetchSheetData(OXXO.SHEETS_CONFIG.TABS.s7),
      buildEstructuraDiariaD1(),
    ]);
    const raw = coerceTreoRowsD7(rawSheet);
    if(!raw || !raw.length) return null;
    // findDataKey (no findKey) para toda esta pestana: Dashboard_7_Semanal es
    // propensa al problema de exportacion de Google donde el encabezado real
    // aparece pegado dentro del texto de otra columna (ej. "_buffer_ CR Reg"
    // vs "_buffer_ CR 501K9 50N0M..."); un match por substring simple puede
    // acertarle a la columna vacia que solo *menciona* el alias.
    const difKey = findDataKey(raw, ['Dif SAP vs Est Optima Final'], 25, true);
    const treoKey = findDataKey(raw, ['Estructura Propuesta TREO P2 Jun - Ago','TREO'], 25, true);
    const sapKey = findDataKey(raw, ['Estructura SAP','SAP'], 25, true);
    const activosKey = findDataKey(raw, ['Empleados Activos','Activos'], 25, true);
    const vacantesKey = findDataKey(raw, ['Vacantes'], 25, true);
    const asesorKey = findDataKey(raw, ['Asesor']);
    // Mismos alias que pickField() en dashboard-7.html para 'tienda' y 'cr':
    // sin ellos, una hoja que use 'Unidad Organizativa' o 'ID Tienda' en vez
    // de 'Tienda'/'CR' se queda sin CR para el match por catalogo y cae al
    // respaldo por nombre de tienda, que es menos preciso.
    const tiendaKey = findDataKey(raw, ['Tienda','Nombre Tienda','Unidad','Unidad Org','Unidad Organizativa']);
    const crKey = findDataKey(raw, ['CR','ID Tienda','ID_Tienda']);
    // Mismo catálogo y estado de tienda que dashboard-7.html. Los asesores
    // no se excluyen: cada tienda operativa debe entrar al total de TREO.
    const asesorCatalog = await OXXO.loadAsesorCatalog();
    const rows = raw
      .filter(r => String(val(r, tiendaKey)||'').trim() || String(val(r, asesorKey)||'').trim())
      .filter(r => OXXO.isTiendaValid(asesorCatalog, val(r, tiendaKey), val(r, crKey)))
      .map(r => {
        if(!estructuraD1.ready) return r;
        const cr = String(val(r, crKey)||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
        const tienda = OXXO.metricsCleanKey ? OXXO.metricsCleanKey(String(val(r, tiendaKey)||'').replace(/^OXXO\s+/i,'').trim()) : String(val(r, tiendaKey)||'').trim().toUpperCase();
        const src = (cr && estructuraD1.byCr.get(cr)) || (tienda && estructuraD1.byTienda.get(tienda));
        if(!src) return r;
        const next = { ...r };
        const sap = src.sap || 0;
        const activos = src.activos || 0;
        const vacantes = Math.max(0, sap - activos);
        const treo = num(val(r, treoKey));
        const dif = treo - sap;
        if(sapKey) next[sapKey] = sap;
        if(activosKey) next[activosKey] = activos;
        if(vacantesKey) next[vacantesKey] = vacantes;
        if(difKey) next[difKey] = dif;
        return next;
      });
    const total = rows.length;
    let alineadas = 0, subir = 0, bajar = 0, posSubir = 0, posBajar = 0;
    rows.forEach(r => {
      const d = num(val(r, difKey));
      if(d === 0) alineadas++;
      else if(d > 0) { subir++; posSubir += d; }
      else { bajar++; posBajar += -d; }
    });
    const totalTreo = rows.reduce((s,r) => s + num(val(r, treoKey)), 0);
    const totalActivos = rows.reduce((s,r) => s + num(val(r, activosKey)), 0);
    const totalVacantes = rows.reduce((s,r) => s + num(val(r, vacantesKey)), 0);
    const cobertura = totalTreo > 0 ? (totalActivos / totalTreo * 100) : 0;
    // "Sub-dotadas"/"Sobre-dotadas" NO son subir/bajar (esas comparan SAP vs
    // Est. Optima via 'dif'): dashboard-7.html las calcula aparte, comparando
    // Empleados Activos (ya con el override de estructura diaria aplicado) contra el
    // objetivo TREO directamente por tienda.
    const subDotadas = rows.filter(r => num(val(r, activosKey)) < num(val(r, treoKey))).length;
    const sobreDotadas = rows.filter(r => num(val(r, activosKey)) > num(val(r, treoKey))).length;
    return {
      sub: 'Vigente: TREO + D1',
      total, alineadas, subir, bajar, posSubir, posBajar,
      totalTreo, totalActivos, totalVacantes, cobertura,
      subDotadas, sobreDotadas,
    };
  }

  // ── Paleta y helpers visuales (misma estructura que RAE_BASE.pptx) ──
  const RED = 'CC0000', GOLD = 'FFC400', ORANGE = 'EE7203', DARK = '2B1714';
  const PINKBG = 'FCE8EA', TRACKBG = 'F4F4F4', BORDER = 'E2E2E2';
  const TEXT = '222222', MUTED = '777777', SUBTLE = 'FFE3E0', BADGETEXT = '5A3A00', WHITE = 'FFFFFF', GREEN = '00A878';
  const PAGE_W = 13.333, MARGIN_X = 0.45, HEADER_H = 0.92;

  function addHeader(slide, title, dateLabel){
    slide.addShape('rect', { x: 0, y: 0, w: PAGE_W, h: HEADER_H, fill: { color: RED }, line: { type: 'none' } });
    slide.addShape('rect', { x: 0, y: HEADER_H, w: PAGE_W, h: 0.05, fill: { color: GOLD }, line: { type: 'none' } });
    const fontSize = title.length > 22 ? 22 : 30;
    slide.addText(title, { x: MARGIN_X, y: 0, w: 7.5, h: HEADER_H, fontSize, bold: true, color: WHITE, fontFace: 'Arial', valign: 'middle', margin: 0 });
    slide.addShape('roundRect', { x: 8.05, y: 0.26, w: 2.55, h: 0.42, rectRadius: 0.08, fill: { color: GOLD }, line: { type: 'none' } });
    slide.addText('Plaza Oaxaca', { x: 8.05, y: 0.26, w: 2.55, h: 0.42, fontSize: 13, bold: true, color: BADGETEXT, fontFace: 'Arial', align: 'center', valign: 'middle', margin: 0 });
    slide.addText(`OXXO · Uso Interno · ${dateLabel}`, { x: 10.7, y: 0, w: 2.2, h: HEADER_H, fontSize: 10, color: SUBTLE, fontFace: 'Arial', align: 'right', valign: 'middle', margin: 0, fit: 'shrink' });
  }

  function addSectionTitle(slide, x, y, w, text, rightText){
    slide.addShape('ellipse', { x, y: y + 0.05, w: 0.13, h: 0.13, fill: { color: RED }, line: { type: 'none' } });
    slide.addText(text, { x: x + 0.22, y, w: w - 0.22, h: 0.32, fontSize: 13, bold: true, color: TEXT, fontFace: 'Arial', margin: 0, valign: 'middle' });
    if(rightText){
      slide.addText(rightText, { x: x + w - 2.2, y, w: 2.2, h: 0.32, fontSize: 10, color: MUTED, fontFace: 'Arial', align: 'right', margin: 0, valign: 'middle' });
    }
  }

  function addHeroKpi(slide, x, y, w, h, value, label, sub){
    slide.addShape('roundRect', { x, y, w, h, rectRadius: 0.12, fill: { color: RED }, line: { type: 'none' } });
    slide.addText(String(value), { x: x + 0.2, y: y + 0.12, w: w * 0.45, h: h - 0.24, fontSize: 56, bold: true, color: WHITE, fontFace: 'Arial', valign: 'middle', margin: 0 });
    slide.addText([
      { text: label, options: { bold: true, breakLine: true } },
      { text: sub, options: { bold: false } },
    ], { x: x + w * 0.45, y, w: w * 0.55 - 0.15, h, fontSize: 11, color: SUBTLE, fontFace: 'Arial', valign: 'middle', margin: 0 });
  }

  function addDoughnutCard(pptx, slide, x, y, w, h, title, segments){
    slide.addShape('roundRect', { x, y, w, h, rectRadius: 0.1, fill: { color: WHITE }, line: { color: BORDER, width: 1 } });
    addSectionTitle(slide, x + 0.2, y + 0.16, w - 0.4, title);
    const clean = segments.filter(s => s.value > 0);
    if(!clean.length){
      slide.addText('Sin datos disponibles', { x: x + 0.2, y: y + h/2 - 0.2, w: w - 0.4, h: 0.4, fontSize: 12, color: MUTED, align: 'center', fontFace: 'Arial', margin: 0 });
      return;
    }
    const total = clean.reduce((s, seg) => s + seg.value, 0) || 1;

    // Bloque grafica+leyenda centrado verticalmente en el area bajo el titulo:
    // ancla fija arriba dejaba huecos enormes en tarjetas altas con pocos segmentos.
    const contentTop = y + 0.62;
    const contentH = h - 0.62 - 0.2;
    const chartSize = Math.min(w * 0.42, contentH, 2.3);
    // rowStep debe limitarse a contentH/n; Math.max(contentH, 0.62*n) hacia
    // arriba siempre devolvia 0.62 sin importar contentH, haciendo que la
    // leyenda se calculara para una tarjeta mas alta de la real y se
    // encimara con la dona en tarjetas bajas/anchas (ver mismo fix en
    // admin-pptx-asesor.js).
    const rowStep = Math.min(0.62, contentH / clean.length);
    const blockH = Math.max(chartSize, rowStep * clean.length);
    const blockY = contentTop + Math.max(0, (contentH - blockH) / 2);
    const chartY = blockY + (blockH - chartSize) / 2;

    // Leyenda con ancho maximo (3.2in) en vez de estirarse al ancho completo
    // de la tarjeta, y bloque dona+leyenda centrado horizontalmente (ver
    // mismo fix en admin-pptx-asesor.js).
    const legendW = Math.min(w - 0.6 - chartSize, 3.2);
    const contentW = 0.25 + chartSize + 0.1 + legendW;
    const blockX = x + Math.max(0.2, (w - contentW) / 2);

    slide.addChart(pptx.ChartType.doughnut, [{ name: title, labels: clean.map(s => s.label), values: clean.map(s => s.value) }], {
      x: blockX + 0.25, y: chartY, w: chartSize, h: chartSize,
      chartColors: clean.map(s => s.color),
      showLegend: false, showValue: false, showPercent: false,
      dataBorder: { pt: 2, color: WHITE },
      holeSize: 62,
    });
    const top = clean[0];
    const topPct = Math.round((top.value / total) * 100);
    slide.addText(`${topPct}%`, { x: blockX + 0.25, y: chartY + chartSize/2 - 0.32, w: chartSize, h: 0.34, fontSize: 20, bold: true, color: TEXT, align: 'center', fontFace: 'Arial', margin: 0 });
    slide.addText(top.label.toUpperCase(), { x: blockX + 0.25, y: chartY + chartSize/2 + 0.02, w: chartSize, h: 0.22, fontSize: 8, color: MUTED, align: 'center', fontFace: 'Arial', margin: 0 });

    const legendX = blockX + 0.35 + chartSize;
    const legendRowH = Math.min(0.22, rowStep * 0.36);
    let ly = blockY + (blockH - rowStep * clean.length) / 2;
    clean.forEach(seg => {
      const pct = Math.round((seg.value / total) * 100);
      slide.addShape('ellipse', { x: legendX, y: ly + 0.05, w: 0.1, h: 0.1, fill: { color: seg.color }, line: { type: 'none' } });
      slide.addText(seg.label.toUpperCase(), { x: legendX + 0.18, y: ly - 0.03, w: legendW * 0.55, h: legendRowH, fontSize: 9.5, bold: true, color: MUTED, fontFace: 'Arial', margin: 0 });
      slide.addText(`${pct}%`, { x: legendX + legendW * 0.55, y: ly - 0.03, w: legendW * 0.45, h: legendRowH, fontSize: 9.5, bold: true, color: seg.color, fontFace: 'Arial', align: 'right', margin: 0 });
      slide.addText(String(seg.value), { x: legendX + 0.18, y: ly + rowStep * 0.3, w: legendW, h: legendRowH, fontSize: rowStep >= 0.5 ? 16 : 12, bold: true, color: TEXT, fontFace: 'Arial', margin: 0 });
      ly += rowStep;
    });
  }

  function addRankingList(slide, x, y, w, h, title, items, rightText){
    slide.addShape('roundRect', { x, y, w, h, rectRadius: 0.1, fill: { color: WHITE }, line: { color: BORDER, width: 1 } });
    addSectionTitle(slide, x + 0.2, y + 0.16, w - 0.4, title, rightText);
    if(!items.length){
      slide.addText('Sin datos disponibles', { x: x + 0.2, y: y + h/2 - 0.2, w: w - 0.4, h: 0.4, fontSize: 12, color: MUTED, align: 'center', fontFace: 'Arial', margin: 0 });
      return;
    }
    const maxValue = Math.max(...items.map(it => it.value), 1);
    const rowH = Math.min(0.68, (h - 0.8) / items.length);
    let ry = y + 0.62;
    items.forEach((item, idx) => {
      const barColor = idx === 0 ? RED : GOLD;
      const nameW = w * 0.32;
      const barX = x + 0.2 + nameW;
      const barW = w - 0.4 - nameW - 0.65;
      const pillW = 0.6;
      slide.addText(shortenName(item.name), { x: x + 0.2, y: ry, w: nameW - 0.1, h: rowH, fontSize: 9.5, color: TEXT, fontFace: 'Arial', valign: 'middle', margin: 0, fit: 'shrink' });
      slide.addShape('roundRect', { x: barX, y: ry + rowH * 0.28, w: barW, h: rowH * 0.32, rectRadius: 0.04, fill: { color: TRACKBG }, line: { type: 'none' } });
      const fillW = Math.max(barW * (item.value / maxValue), 0.06);
      slide.addShape('roundRect', { x: barX, y: ry + rowH * 0.28, w: fillW, h: rowH * 0.32, rectRadius: 0.04, fill: { color: barColor }, line: { type: 'none' } });
      slide.addShape('roundRect', { x: x + w - 0.2 - pillW, y: ry + (rowH - 0.24) / 2, w: pillW, h: 0.24, rectRadius: 0.04, fill: { color: PINKBG }, line: { type: 'none' } });
      slide.addText(String(item.value), { x: x + w - 0.2 - pillW, y: ry + (rowH - 0.24) / 2, w: pillW, h: 0.24, fontSize: 10, bold: true, color: RED, fontFace: 'Arial', align: 'center', valign: 'middle', margin: 0 });
      ry += rowH;
    });
  }

  function addGaugeCard(slide, x, y, w, h, pct, label){
    const color = pct >= 95 ? GREEN : (pct >= 85 ? GOLD : RED);
    slide.addShape('roundRect', { x, y, w, h, rectRadius: 0.08, fill: { color: WHITE }, line: { color: BORDER, width: 1 } });
    slide.addText(`${pct.toFixed(1)}%`, { x: x + 0.1, y: y + 0.16, w: w - 0.2, h: 0.6, fontSize: 26, bold: true, color, fontFace: 'Arial', margin: 0 });
    slide.addText(label.toUpperCase(), { x: x + 0.1, y: y + 0.72, w: w - 0.2, h: 0.24, fontSize: 10, bold: true, color: MUTED, fontFace: 'Arial', margin: 0, fit: 'shrink' });
    slide.addShape('roundRect', { x: x + 0.1, y: y + h - 0.24, w: w - 0.2, h: 0.1, rectRadius: 0.05, fill: { color: TRACKBG }, line: { type: 'none' } });
    slide.addShape('roundRect', { x: x + 0.1, y: y + h - 0.24, w: (w - 0.2) * Math.min(pct, 100) / 100, h: 0.1, rectRadius: 0.05, fill: { color }, line: { type: 'none' } });
  }

  // Ranking de porcentaje con barra (p.ej. Aprovechamiento por AT). Igual que
  // addRankingList pero con barra hasta el 100% y color por umbral (95/85%)
  // en vez de color fijo por posicion, y valor mostrado con decimales.
  function addPctRankingList(slide, x, y, w, h, title, items, rightText){
    slide.addShape('roundRect', { x, y, w, h, rectRadius: 0.1, fill: { color: WHITE }, line: { color: BORDER, width: 1 } });
    addSectionTitle(slide, x + 0.2, y + 0.16, w - 0.4, title, rightText);
    if(!items.length){
      slide.addText('Sin datos disponibles', { x: x + 0.2, y: y + h/2 - 0.2, w: w - 0.4, h: 0.4, fontSize: 12, color: MUTED, align: 'center', fontFace: 'Arial', margin: 0 });
      return;
    }
    const rowH = Math.min(0.68, (h - 0.8) / items.length);
    let ry = y + 0.62;
    items.forEach(item => {
      const barColor = item.value >= 95 ? GREEN : (item.value >= 85 ? GOLD : RED);
      const nameW = w * 0.32;
      const barX = x + 0.2 + nameW;
      const barW = w - 0.4 - nameW - 0.75;
      const pillW = 0.7;
      slide.addText(shortenName(item.name), { x: x + 0.2, y: ry, w: nameW - 0.1, h: rowH, fontSize: 9.5, color: TEXT, fontFace: 'Arial', valign: 'middle', margin: 0, fit: 'shrink' });
      slide.addShape('roundRect', { x: barX, y: ry + rowH * 0.28, w: barW, h: rowH * 0.32, rectRadius: 0.04, fill: { color: TRACKBG }, line: { type: 'none' } });
      const fillW = Math.max(barW * Math.min(item.value, 100) / 100, 0.06);
      slide.addShape('roundRect', { x: barX, y: ry + rowH * 0.28, w: fillW, h: rowH * 0.32, rectRadius: 0.04, fill: { color: barColor }, line: { type: 'none' } });
      slide.addShape('roundRect', { x: x + w - 0.2 - pillW, y: ry + (rowH - 0.24) / 2, w: pillW, h: 0.24, rectRadius: 0.04, fill: { color: PINKBG }, line: { type: 'none' } });
      slide.addText(`${item.value.toFixed(1)}%`, { x: x + w - 0.2 - pillW, y: ry + (rowH - 0.24) / 2, w: pillW, h: 0.24, fontSize: 9.5, bold: true, color: barColor, fontFace: 'Arial', align: 'center', valign: 'middle', margin: 0 });
      ry += rowH;
    });
  }

  // Tarjeta de metrica TREO. Proporciones fraccionales (label ~arriba 8-25%,
  // valor grande ~27-68%, nota ~74-96%) tomadas de las coordenadas reales de
  // RAE_BASE.pptx (tarjetas de 1.83x2.05in), para que escale igual sin
  // importar el alto exacto que se le pase.
  function addMetricCard(slide, x, y, w, h, label, value, note){
    slide.addShape('roundRect', { x, y, w, h, rectRadius: 0.08, fill: { color: WHITE }, line: { color: BORDER, width: 1 } });
    slide.addText(label.toUpperCase(), { x: x + 0.14, y: y + h * 0.08, w: w - 0.28, h: h * 0.17, fontSize: 9, bold: true, color: MUTED, fontFace: 'Arial', margin: 0, fit: 'shrink' });
    slide.addText(String(value), { x: x + 0.14, y: y + h * 0.27, w: w - 0.28, h: h * 0.41, fontSize: 30, bold: true, color: TEXT, fontFace: 'Arial', margin: 0, fit: 'shrink' });
    slide.addText(note, { x: x + 0.14, y: y + h * 0.74, w: w - 0.28, h: h * 0.22, fontSize: 8.5, bold: true, color: RED, fontFace: 'Arial', margin: 0, fit: 'shrink' });
  }

  function addNoteCard(slide, x, y, w, h, title, note){
    slide.addShape('roundRect', { x, y, w, h, rectRadius: 0.08, fill: { color: WHITE }, line: { color: BORDER, width: 1 } });
    slide.addText(title, { x: x + 0.14, y: y + h * 0.1, w: w - 0.28, h: h * 0.4, fontSize: 11, bold: true, color: TEXT, fontFace: 'Arial', margin: 0, fit: 'shrink' });
    slide.addText(note, { x: x + 0.14, y: y + h * 0.5, w: w - 0.28, h: h * 0.4, fontSize: 10, color: RED, fontFace: 'Arial', margin: 0, fit: 'shrink' });
  }

  // Tarjeta "Alineacion Global": dona arriba + 3 casillas de estatus abajo,
  // igual que la columna derecha de la diapositiva TREO en RAE_BASE.pptx
  // (ahi la dona no lleva leyenda lateral, sino recuadros debajo).
  function addTreoAlignmentCard(pptx, slide, x, y, w, h, segments){
    slide.addShape('roundRect', { x, y, w, h, rectRadius: 0.1, fill: { color: WHITE }, line: { color: BORDER, width: 1 } });
    addSectionTitle(slide, x + 0.3, y + 0.29, w - 0.6, 'Alineación Global');
    const clean = segments.filter(s => s.value > 0);
    const total = clean.reduce((s, seg) => s + seg.value, 0) || 1;
    const chartSize = Math.min(w * 0.78, h * 0.56);
    const chartX = x + (w - chartSize) / 2;
    const chartY = y + 0.7;
    if(clean.length){
      slide.addChart(pptx.ChartType.doughnut, [{ name: 'Alineación Global', labels: clean.map(s => s.label), values: clean.map(s => s.value) }], {
        x: chartX, y: chartY, w: chartSize, h: chartSize,
        chartColors: clean.map(s => s.color),
        showLegend: false, showValue: false, showPercent: false,
        dataBorder: { pt: 2, color: WHITE },
        holeSize: 62,
      });
      const topPct = Math.round((clean[0].value / total) * 100);
      slide.addText(`${topPct}%`, { x: chartX, y: chartY + chartSize/2 - 0.32, w: chartSize, h: 0.34, fontSize: 22, bold: true, color: TEXT, align: 'center', fontFace: 'Arial', margin: 0 });
      slide.addText(clean[0].label.toUpperCase(), { x: chartX, y: chartY + chartSize/2 + 0.03, w: chartSize, h: 0.22, fontSize: 9, color: MUTED, align: 'center', fontFace: 'Arial', margin: 0 });
    }
    const boxY = chartY + chartSize + 0.15;
    const boxW = (w - 0.4) / segments.length - 0.1;
    segments.forEach((seg, i) => {
      const bx = x + 0.2 + i * (boxW + 0.13);
      slide.addShape('roundRect', { x: bx, y: boxY, w: boxW, h: 0.85, rectRadius: 0.06, fill: { color: TRACKBG }, line: { type: 'none' } });
      slide.addText(String(seg.value), { x: bx, y: boxY + 0.08, w: boxW, h: 0.42, fontSize: 16, bold: true, color: TEXT, align: 'center', fontFace: 'Arial', margin: 0 });
      slide.addText(seg.label, { x: bx, y: boxY + 0.52, w: boxW, h: 0.26, fontSize: 8.5, color: MUTED, align: 'center', fontFace: 'Arial', margin: 0, fit: 'shrink' });
    });
  }

  function emptySlide(pptx, title, dateLabel){
    const {slide,text}=editorialSlide(pptx,title,dateLabel);
    text('Sin datos disponibles',.5,2.75,11.8,.7,30,DARK,true);
    text('No hay información para este corte; no se sustituyó por otro periodo.',.5,3.75,11.8,.65,18,MUTED);
    return slide;
  }

  // Diseño compartido únicamente por Vacantes y Bajas; conserva sus datos y corte.
  function buildPeopleSummary(pptx, d, dateLabel, title){
    const slide = pptx.addSlide();
    slide.background = { color: 'FFFCF8' };
    const text = (value,x,y,w,h,size,color=TEXT,bold=false,extra={}) => slide.addText(String(value),
      { x,y,w,h,fontFace:'Arial',fontSize:size,color,bold,margin:0,breakLine:false,fit:'shrink',...extra });
    const rect = (x,y,w,h,color) => slide.addShape('rect',{x,y,w,h,line:{color,transparency:100},fill:{color}});
    rect(0,0,PAGE_W,.09,RED);
    text('OXXO  /  RECURSOS HUMANOS',.5,.3,7,.25,10,RED,true);
    text('Plaza Oaxaca',10,.3,2.8,.25,10,MUTED,false,{align:'right'});
    text(title,.5,.83,8,.58,30,DARK,true);
    text(dateLabel || 'Corte no informado',8.5,.97,4.3,.3,12,MUTED,false,{align:'right'});
    rect(.5,1.62,12.3,.015,'E5DCD6');
    text(d.total,.5,1.98,3.8,.98,64,RED,true);
    text(title === 'Vacantes' ? 'POSICIONES VACANTES' : 'BAJAS OPERATIVAS',.53,3.04,3.7,.3,12,DARK,true);
    text('Total del corte seleccionado',.53,3.43,3.7,.3,11,MUTED);
    text('Distribución por puesto',.53,4.18,3.7,.32,15,DARK,true);
    const groups=[['Ayudante',GOLD],['Encargado',ORANGE],['Lider',RED],['Otro',MUTED]];
    const total = groups.reduce((sum,[key])=>sum+(Number(d.byPuesto[key])||0),0);
    groups.forEach(([key,color],i)=>{
      const y=4.8+i*.44, value=Number(d.byPuesto[key])||0;
      rect(.53,y+.075,.09,.16,color);
      text(key === 'Lider' ? 'Líder' : key,.75,y,1.65,.28,12);
      text(value,2.5,y,.6,.28,13,DARK,true,{align:'right'});
      text(total ? Math.round(value/total*100)+'%' : '—',3.22,y,.7,.28,11,MUTED,false,{align:'right'});
    });
    rect(4.4,1.97,.015,4.76,'E5DCD6');
    text('Por asesor',4.8,2.02,4,.35,18,DARK,true);
    text('Hasta 15 asesores · mayor a menor',8.4,2.08,4.4,.25,10,MUTED,false,{align:'right'});
    const items = d.ranking || [], max=Math.max(1,...items.map(item=>item.value));
    const rowH=Math.min(.53,4.12/Math.max(1,items.length));
    if(!items.length) text('Sin registros en este corte',4.8,2.8,7,.5,15,MUTED);
    items.forEach((item,i)=>{
      const y=2.65+i*rowH;
      text(item.name,4.8,y,4.35,rowH*.85,items.length>12?11:12,TEXT);
      rect(9.45,y+rowH*.3,2.65,.07,'EDE6DF');
      if(item.value>0) rect(9.45,y+rowH*.3,2.65*item.value/max,.07,RED);
      text(item.value,12.22,y,.58,rowH*.85,12,DARK,true,{align:'right'});
    });
    text('OXXO · Uso interno',.5,7.04,4,.2,9,MUTED);
    text('El total incluye todos los asesores del corte',7.3,7.04,5.5,.2,9,MUTED,false,{align:'right'});
  }

  function buildD1(pptx, d, dateLabel){
    const slide = pptx.addSlide();
    slide.background = { color: 'FFFCF8' };
    const text = (value,x,y,w,h,size,color=TEXT,bold=false,extra={}) => slide.addText(String(value),
      { x,y,w,h,fontFace:'Arial',fontSize:size,color,bold,margin:0,breakLine:false,fit:'shrink',...extra });
    const rect = (x,y,w,h,color) => slide.addShape('rect',{x,y,w,h,line:{color,transparency:100},fill:{color}});
    rect(0,0,PAGE_W,.09,RED);
    text('OXXO  /  RECURSOS HUMANOS',.5,.3,7,.25,10,RED,true);
    text('Plaza Oaxaca',10,.3,2.8,.25,10,MUTED,false,{align:'right'});
    text('Vacantes',.5,.83,7,.58,30,DARK,true);
    text(dateLabel || 'Corte no informado',8.5,.97,4.3,.3,12,MUTED,false,{align:'right'});
    rect(.5,1.62,12.3,.015,'E5DCD6');

    const total = d.totalTabla || { vacantes: d.total, promedio: null, maxDias: 0, dMas6: 0 };
    text(total.vacantes,.5,1.98,3.65,.9,56,RED,true);
    text('POSICIONES VACANTES',.53,3.03,3.7,.28,12,DARK,true);
    text('Total del corte seleccionado',.53,3.42,3.7,.24,11,MUTED);
    text('Distribución por puesto',.53,4.12,3.7,.3,16,DARK,true);
    const groups=[['Ayudante',GOLD],['Encargado',ORANGE],['Lider',RED],['Otro',MUTED]];
    groups.filter(([key]) => Number(d.byPuesto[key]) > 0).forEach(([key,color],index)=>{
      const y=4.78+index*.46, value=Number(d.byPuesto[key])||0;
      rect(.53,y+.07,.1,.17,color);
      text(key === 'Lider' ? 'Líder' : key,.75,y,1.75,.28,13,TEXT);
      text(value,2.85,y,.42,.28,15,DARK,true,{align:'right'});
    });
    rect(4.15,1.95,.015,4.78,'E5DCD6');

    const columns = [
      ['ASESOR', 5.25, 2.63, 'left'],
      ['VACANTES', 7.88, 1.12, 'center'],
      ['DÍAS PROM.', 9, 1.12, 'center'],
      ['DÍAS MÁX.', 10.12, 1.05, 'center'],
      ['≤3 D', 11.17, .58, 'center'],
      ['≤6 D', 11.75, .58, 'center'],
      ['>6 D', 12.33, .45, 'center'],
    ];
    const tableX = 5.25, tableY = 1.68, tableW = 7.53;
    slide.addShape('roundRect',{x:tableX,y:tableY,w:tableW,h:5.18,rectRadius:.07,fill:{color:'FFFFFF'},line:{color:'E5DCD6'}});
    rect(tableX,tableY,tableW,.38,'5A1115');
    columns.forEach(([label,x,w,align]) => text(label,x+.05,1.795,w-.1,.12,7.6,'FFFFFF',true,{align}));
    const items = d.tablaAsesores || [];
    const visible = items.slice(0, 12);
    const rowH = .36;
    const formatDays = value => value === null || value === undefined ? '—' : Number(value).toFixed(1);
    visible.forEach((item, index) => {
      const y = 2.06 + index * rowH;
      if (index % 2) rect(tableX,y,tableW,rowH,'FFF8F4');
      const risk = item.vacantes >= 4 ? RED : item.vacantes >= 2 ? 'C79A00' : GREEN;
      slide.addShape('ellipse',{x:tableX+.14,y:y+.145,w:.065,h:.065,fill:{color:risk},line:{type:'none'}});
      text(shortenName(item.name,30),tableX+.27,y+.09,2.2,rowH-.12,8.6,TEXT,true);
      text(item.vacantes,7.98,y+.09,.92,rowH-.12,10,DARK,true,{align:'center'});
      text(formatDays(item.promedio),9.1,y+.09,.92,rowH-.12,8.8,DARK,false,{align:'center'});
      text(item.diasCount ? item.maxDias : '—',10.22,y+.09,.85,rowH-.12,8.8,DARK,false,{align:'center'});
      text(item.d3 || '—',11.24,y+.09,.44,rowH-.12,8.8,item.d3?GREEN:MUTED,true,{align:'center'});
      text(item.d6 || '—',11.82,y+.09,.44,rowH-.12,8.8,item.d6?ORANGE:MUTED,true,{align:'center'});
      text(item.dMas6 || '—',12.4,y+.09,.28,rowH-.12,8.8,item.dMas6?RED:MUTED,true,{align:'center'});
    });
    const totalY = 2.06 + visible.length * rowH;
    rect(tableX,totalY,tableW,.27,'FCE8EA');
    text('Total general',tableX+.07,totalY+.055,2.4,.14,8.5,DARK,true);
    text(total.vacantes,7.98,totalY+.055,.92,.14,9,DARK,true,{align:'center'});
    text(formatDays(total.promedio),9.1,totalY+.055,.92,.14,8.5,DARK,true,{align:'center'});
    text(total.diasCount ? total.maxDias : '—',10.22,totalY+.055,.85,.14,8.5,DARK,true,{align:'center'});
    text(total.d3 || '—',11.24,totalY+.055,.44,.14,8.5,GREEN,true,{align:'center'});
    text(total.d6 || '—',11.82,totalY+.055,.44,.14,8.5,ORANGE,true,{align:'center'});
    text(total.dMas6 || '—',12.4,totalY+.055,.28,.14,8.5,RED,true,{align:'center'});
    if (items.length > visible.length) text(`Top 12 de ${items.length} asesores`,5.25,6.92,2.6,.16,8.5,MUTED);
    text('OXXO · Uso interno',.5,7.04,4,.2,9,MUTED);
    text('La tabla usa el mismo alcance de tiendas que el dashboard',7.3,7.04,5.5,.2,9,MUTED,false,{align:'right'});
  }
  function buildD2(pptx, d, dateLabel){ buildPeopleSummary(pptx,d,dateLabel,'Bajas'); }

  function buildD2Analysis(pptx, d, dateLabel){
    const {slide,text,rect}=editorialSlide(pptx,'Análisis de bajas',dateLabel);
    const heat = d.heatmap || { edades: [], antiguedades: [], values: [] };
    const maxHeat = Math.max(0, ...(heat.values || []).flatMap(row => row.values || []));
    text('Mapa de calor de bajas',.5,1.98,5.5,.32,17,DARK,true);
    text('Edad y antigüedad antes de la baja',.5,2.32,5.5,.2,10,MUTED);
    const gridX = 1.35, gridY = 2.75, cellW = .75, cellH = .48;
    (heat.antiguedades || []).forEach((label,index) => text(label,gridX+index*cellW,2.54,cellW,.17,7.7,MUTED,true,{align:'center'}));
    (heat.values || []).forEach((row,rowIndex) => {
      const y = gridY + rowIndex*cellH;
      text(row.label,.5,y+.15,.72,.16,9,DARK,true,{align:'right'});
      row.values.forEach((value,colIndex) => {
        const intensity = maxHeat ? value / maxHeat : 0;
        const fill = value ? (intensity >= .7 ? 'C0181F' : intensity >= .4 ? 'E46B4E' : 'F8C8B8') : 'F7F3EC';
        slide.addShape('roundRect',{x:gridX+colIndex*cellW,y,w:.63,h:.33,rectRadius:.04,fill:{color:fill},line:{color:'FFFFFF',transparency:0}});
        text(value || '—',gridX+colIndex*cellW,y+.08,.63,.14,10,value?'FFFFFF':'A69E95',true,{align:'center'});
      });
    });
    text('Mayor intensidad',.5,5.38,1.3,.2,9,MUTED);
    ['F7F3EC','F8C8B8','E46B4E','C0181F'].forEach((color,index) => slide.addShape('roundRect',{x:1.55+index*.32,y:5.36,w:.22,h:.14,rectRadius:.02,fill:{color},line:{type:'none'}}));

    rect(5.4,1.97,.015,4.86,'E5DCD6');
    text('Motivos de baja',5.8,1.98,3.05,.32,17,DARK,true);
    text('Top 8 del corte',5.8,2.32,3.05,.2,10,MUTED);
    const motivos = d.motivos || [];
    const motivosVisibles = motivos.filter(item => item.total > 0).slice(0,8);
    if(motivosVisibles.length){
      // Gráfica nativa y editable: concentra los motivos sin sustituir la
      // evidencia por una imagen. La leyenda conserva nombre y porcentaje.
      slide.addChart(pptx.ChartType.pie, [{
        name: 'Motivos de baja',
        labels: motivosVisibles.map(item => shortenName(item.label,24)),
        values: motivosVisibles.map(item => item.total)
      }], {
        x:5.72, y:2.58, w:3.05, h:2.82,
        chartColors:['C0181F','EE7203','F5B700','48A868','2A76A8','7452A3','008C95','9C6B3E'],
        showLegend:true, legendPos:'b',
        showValue:true, showPercent:true, showCategoryName:false,
        dataLabelPosition:'bestFit',
        dataBorder:{ pt:1.5, color:WHITE },
        fontFace:'Arial', fontSize:8.5,
      });
    } else {
      text('Sin motivos de baja registrados para el corte.',5.8,3.05,2.8,.45,12,MUTED);
    }

    text('Top 10 tiendas con más bajas',9.28,1.98,3.45,.32,17,DARK,true);
    text('Bajas acumuladas en el corte',9.28,2.32,3.45,.2,10,MUTED);
    const tiendas = d.tiendas || [];
    const maxTienda = Math.max(1,...tiendas.map(item => item.total));
    tiendas.slice(0,10).forEach((item,index) => {
      const y=2.7+index*.34;
      text(String(index+1).padStart(2,'0'),9.28,y,.28,.18,8.5,RED,true);
      text(shortenName(item.label,25),9.62,y,2.15,.18,9.4,TEXT,true);
      rect(11.83,y+.08,.55,.06,'EDE6DF');
      rect(11.83,y+.08,.55*item.total/maxTienda,.06,RED);
      text(item.total,12.45,y,.3,.18,10,DARK,true,{align:'right'});
    });
    text('OXXO · Uso interno',.5,7.04,4,.2,9,MUTED);
    text('Mapa, motivos y tiendas usan las mismas bajas del corte seleccionado',6.4,7.04,6.4,.2,9,MUTED,false,{align:'right'});
  }

  function editorialSlide(pptx, title, dateLabel){
    const slide=pptx.addSlide();
    slide.background={color:'FFFCF8'};
    const text=(value,x,y,w,h,size,color=TEXT,bold=false,extra={})=>slide.addText(String(value),
      {x,y,w,h,fontFace:'Arial',fontSize:size,color,bold,margin:0,fit:'shrink',...extra});
    const rect=(x,y,w,h,color)=>slide.addShape('rect',{x,y,w,h,line:{color,transparency:100},fill:{color}});
    rect(0,0,PAGE_W,.09,RED);
    text('OXXO  /  RECURSOS HUMANOS',.5,.3,7,.25,10,RED,true);
    text('Plaza Oaxaca',10,.3,2.8,.25,10,MUTED,false,{align:'right'});
    text(title,.5,.83,8.5,.58,30,DARK,true);
    text(dateLabel||'Corte no informado',9.1,.91,3.7,.48,11,MUTED,false,{align:'right'});
    rect(.5,1.62,12.3,.015,'E5DCD6');
    text('OXXO · Uso interno',.5,7.04,4,.2,9,MUTED);
    return {slide,text,rect};
  }

  function buildD3(pptx, d, dateLabel){
    const {text,rect}=editorialSlide(pptx,'Aprovechamiento de estructura',dateLabel);
    text(d.pct.toFixed(1)+'%',.5,1.98,3.85,.9,56,RED,true);
    text('EQUIPO COMPLETO · OAXACA',.53,2.98,3.7,.28,11,DARK,true);
    text('Meta de referencia: 95%',.53,3.34,3.7,.25,11,MUTED);
    text('Tiendas por estatus',.53,3.83,3.7,.3,15,DARK,true);
    [['Completas',d.completas,GREEN],['Incompletas',d.incompletas,GOLD],['Críticas',d.criticas,RED]].forEach(([label,value,color],i)=>{
      const y=4.25+i*.32;
      rect(.53,y+.07,.09,.14,color);
      text(label,.75,y,2.45,.25,11);
      text(value,3.2,y,.7,.25,12,DARK,true,{align:'right'});
    });
    text('Comparativo por plaza',.53,5.42,3.7,.28,14,DARK,true);
    (d.plazas||[]).forEach((p,i)=>{
      const y=5.83+i*.2;
      text(p.name,.53,y,2.55,.2,10);
      text(p.value.toFixed(1)+'%',3.05,y,.9,.2,10,DARK,true,{align:'right'});
    });
    rect(4.4,1.97,.015,4.86,'E5DCD6');
    text('Equipo completo por asesor',4.8,2.02,5.6,.35,18,DARK,true);
    text('Hasta 15 asesores',10.5,2.08,2.3,.25,10,MUTED,false,{align:'right'});
    const items=d.ranking||[], rowH=Math.min(.53,4.12/Math.max(1,items.length));
    if(!items.length) text('Sin registros disponibles',4.8,2.8,7,.5,15,MUTED);
    items.forEach((item,i)=>{
      const y=2.65+i*rowH, color=item.value>=95?GREEN:(item.value>=85?ORANGE:RED);
      text(item.name,4.8,y,4.35,rowH*.85,items.length>12?11:12);
      rect(9.45,y+rowH*.3,2.3,.07,'EDE6DF');
      if(item.value>0) rect(9.45,y+rowH*.3,2.3*Math.min(item.value,100)/100,.07,color);
      text(item.value.toFixed(1)+'%',11.88,y,.92,rowH*.85,11,DARK,true,{align:'right'});
    });
  }

  function buildD8(pptx, d, dateLabel){
    const {text,rect}=editorialSlide(pptx,'Capacidades 2026',dateLabel);
    text(d.pct.toFixed(1)+'%',.5,1.98,3.85,.9,56,d.pct>=80?GREEN:(d.pct>=50?GOLD:RED),true);
    text('CUMPLIMIENTO GLOBAL',.53,2.98,3.7,.28,11,DARK,true);
    text(OXXO.formatNum(d.completadas)+' de '+OXXO.formatNum(d.aplicables)+' certificaciones aplicables',.53,3.34,3.7,.28,11,MUTED);
    text('Cobertura del corte',.53,3.92,3.7,.3,15,DARK,true);
    text(OXXO.formatNum(d.empleados),.53,4.32,1.15,.55,28,DARK,true);
    text('empleados',1.72,4.47,1.5,.24,11,MUTED);
    text(OXXO.formatNum(d.tiendas),.53,5.02,1.15,.55,28,DARK,true);
    text('tiendas',1.72,5.17,1.5,.24,11,MUTED);
    text('Certificaciones prioritarias',.53,5.86,3.55,.28,14,DARK,true);
    (d.criticas||[]).forEach((item,i)=>{
      const y=6.2+i*.22;
      text((i+1)+'. '+shortenName(item.label,29),.53,y,2.65,.2,10);
      text(item.pct.toFixed(1)+'%',3.05,y,.8,.2,10,item.pct>=80?GREEN:(item.pct>=50?GOLD:RED),true,{align:'right'});
    });
    rect(4.4,1.97,.015,4.86,'E5DCD6');
    text('Asesores con mayor necesidad',4.8,2.02,6.2,.35,18,DARK,true);
    text('Cumplimiento de certificaciones',10.1,2.08,2.7,.25,10,MUTED,false,{align:'right'});
    const items=d.asesores||[], rowH=Math.min(.42,4.15/Math.max(1,items.length));
    if(!items.length) text('Sin registros disponibles',4.8,2.8,7,.5,15,MUTED);
    items.forEach((item,i)=>{
      const y=2.62+i*rowH, color=item.pct>=80?GREEN:(item.pct>=50?GOLD:RED);
      text(shortenName(item.name,30),4.8,y,4.1,rowH*.84,items.length>8?10:11,TEXT);
      rect(9.2,y+rowH*.31,2.45,.07,'EDE6DF');
      if(item.pct>0) rect(9.2,y+rowH*.31,2.45*Math.min(item.pct,100)/100,.07,color);
      text(item.pct.toFixed(1)+'%',11.8,y,.95,rowH*.84,11,DARK,true,{align:'right'});
    });
  }

  function buildD8CercaSiempre(pptx, d, dateLabel){
    const {text,rect}=editorialSlide(pptx,'Módulo Cerca Siempre',dateLabel);
    const color = d.pct >= 80 ? GREEN : (d.pct >= 50 ? GOLD : RED);
    text(d.pct.toFixed(1)+'%',.5,1.98,3.85,.9,56,color,true);
    text('CUMPLIMIENTO DEL MÓDULO',.53,2.98,3.7,.28,11,DARK,true);
    text('Capacidades 2026 · corte vigente',.53,3.34,3.7,.28,11,MUTED);
    const metrics = [
      ['Personal aplicable', d.aplicables, DARK],
      ['Completaron', d.completadas, GREEN],
      ['Pendientes', d.pendientes, d.pendientes ? RED : GREEN],
    ];
    metrics.forEach(([label,value,metricColor], index) => {
      const y = 4.03 + index * .72;
      text(label,.53,y,2.45,.25,13,DARK,true);
      text(value,3.15,y-.08,.72,.43,23,metricColor,true,{align:'right'});
      rect(.53,y+.4,3.3,.06,'EDE6DF');
      if(d.aplicables) rect(.53,y+.4,3.3 * Math.min(Number(value) / d.aplicables, 1),.06,metricColor);
    });
    rect(4.4,1.97,.015,4.86,'E5DCD6');
    text('Asesores con seguimiento pendiente',4.8,2.02,6.2,.35,18,DARK,true);
    text('Cumplimiento y personas pendientes',9.9,2.08,2.85,.25,10,MUTED,false,{align:'right'});
    const items = d.asesores || [];
    const rowH = Math.min(.43,4.12/Math.max(1,items.length));
    if(!items.length) text('Sin registros aplicables para el módulo',4.8,2.8,7,.5,15,MUTED);
    items.forEach((item,i)=>{
      const y=2.65+i*rowH;
      const itemColor=item.pct>=80?GREEN:(item.pct>=50?GOLD:RED);
      text(shortenName(item.name,30),4.8,y,3.7,rowH*.84,items.length>8?10:11,TEXT);
      rect(8.68,y+rowH*.31,2.18,.07,'EDE6DF');
      if(item.pct>0) rect(8.68,y+rowH*.31,2.18*Math.min(item.pct,100)/100,.07,itemColor);
      text(item.pct.toFixed(1)+'%',10.98,y,.8,rowH*.84,11,itemColor,true,{align:'right'});
      text(item.pendientes+' pend.',11.86,y,.9,rowH*.84,10,MUTED,false,{align:'right'});
    });
  }

  function buildD7(pptx, d, dateLabel){
    const {text,rect}=editorialSlide(pptx,'TREO · Estructura',dateLabel);
    text(d.cobertura.toFixed(0)+'%',.5,1.98,3.85,.9,56,RED,true);
    text('COBERTURA DE ESTRUCTURA',.53,2.98,3.7,.28,11,DARK,true);
    text(OXXO.formatNum(d.totalActivos)+' activos / '+OXXO.formatNum(d.totalTreo)+' posiciones TREO',.53,3.4,3.7,.6,12,MUTED);
    text('Tiendas del alcance',.53,4.38,3.7,.3,14,DARK,true);
    text(OXXO.formatNum(d.total),.53,4.81,3.7,.62,34,DARK,true);
    text('Posiciones vacantes',.53,5.66,3.7,.3,14,DARK,true);
    text(OXXO.formatNum(d.totalVacantes),.53,6.05,3.7,.62,34,RED,true);
    rect(4.4,1.97,.015,4.86,'E5DCD6');
    text('Alineación de estructura',4.8,2.02,7.9,.35,18,DARK,true);
    text('Tiendas',10.1,2.55,.95,.25,10,MUTED,false,{align:'right'});
    text('Ajuste de posiciones',11.2,2.55,1.6,.25,10,MUTED,false,{align:'right'});
    const rows=[['Alineadas',d.alineadas,GREEN,'Sin ajuste'],['Por subir',d.subir,GOLD,'+'+OXXO.formatNum(Math.round(d.posSubir))],['Por bajar',d.bajar,RED,'−'+OXXO.formatNum(Math.round(d.posBajar))]];
    rows.forEach(([label,value,color,adjustment],i)=>{
      const y=3.08+i*.66;
      text(label,4.8,y,2.3,.32,14);
      rect(7.3,y+.13,2.4,.09,'EDE6DF');
      if(value>0 && d.total>0) rect(7.3,y+.13,2.4*Math.min(value/d.total,1),.09,color);
      text(value,10.1,y,.95,.32,17,DARK,true,{align:'right'});
      text(adjustment,11.2,y,1.6,.32,12,MUTED,false,{align:'right'});
    });
    rect(4.8,5.08,8,.015,'E5DCD6');
    text('Dotación de personal',4.8,5.4,7.9,.3,16,DARK,true);
    text('Subdotadas',4.8,5.99,3.5,.27,12);
    text('Sobredotadas',9,5.99,3.8,.27,12);
    text(d.subDotadas,4.8,6.35,1.25,.42,26,RED,true);
    text('Activos < TREO',6.15,6.47,2.15,.22,10,MUTED);
    text(d.sobreDotadas,9,6.35,1.25,.42,26,DARK,true);
    text('Activos > TREO',10.35,6.47,2.45,.22,10,MUTED);
  }

  function buildCover(pptx, dateLabel){
    const {text,rect}=editorialSlide(pptx,'Presentación RAE',dateLabel);
    text('Indicadores de recursos humanos',.5,2.5,11.9,.8,34,DARK,true);
    text('Plaza Oaxaca',.5,3.52,11.9,.5,22,RED,true);
    const sections=['Vacantes','Bajas','Análisis de bajas','Aprovechamiento','Capacidades','Cerca Siempre','TREO'];
    sections.forEach((label,i)=>{
      const sectionW = 1.54;
      const x=.5+i*1.78;
      rect(x,5.23,sectionW,.035,i===0?RED:'E5DCD6');
      text('0'+(i+1),x,5.54,sectionW,.45,23,RED,true);
      text(label,x,6.15,sectionW,.4,11,DARK,true);
    });
  }

  const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

  // Llena el selector "#pptx-rae-mes" con los meses realmente presentes en
  // Dashboard_1_Diario (columna 'Mes', formato crudo dd/mm/aaaa). Cada opcion
  // guarda dos valores: el mes tal cual para dataD1() y su equivalente
  // canonico YYYY-MM (data-canonico) para dataD2(), que usa otro formato de
  // llave. Sin seleccion = comportamiento de siempre (mes mas reciente).
  async function populateMesSelector(){
    const select = document.getElementById('pptx-rae-mes');
    if(!select) return;
    try {
      const raw = await OXXO.fetchSheetData(OXXO.SHEETS_CONFIG.TABS.d1);
      if(!raw || !raw.length) return;
      const mesKey = findKey(raw[0], ['Mes']);
      const fechaKey = findKey(raw[0], ['Fecha']);
      const keys = [...new Set(raw.map(r => rowMonthKeyD1(r, mesKey, fechaKey)).filter(Boolean))].sort();
      const opts = keys.map(k => {
        const m = String(k).match(/^\d{1,2}\/(\d{1,2})\/(\d{4})$/);
        if(!m) return { key: k, label: k, canon: '' };
        const mm = Number(m[1]), yyyy = Number(m[2]);
        const canon = (mm >= 1 && mm <= 12) ? `${yyyy}-${String(mm).padStart(2,'0')}` : '';
        return { key: k, label: (MESES[mm - 1] || 'Mes') + ' ' + yyyy, canon };
      });
      select.innerHTML = '<option value="">Más reciente</option>' + opts.map(o =>
        `<option value="${escHtml(o.key)}" data-canon="${escHtml(o.canon)}">${escHtml(o.label)}</option>`
      ).join('');
    } catch(e){ /* si falla, se queda solo "Más reciente" */ }
  }

  // RAE reúne Vacantes, Bajas, Aprovechamiento, Capacidades y TREO. Tiempo
  // Extra/Vacaciones/Ausentismos se mantienen fuera de esta presentación.
  function buildDashboardList(mesD1, mesD2){
    let capacidadesPromise;
    const loadCapacidades = () => capacidadesPromise || (capacidadesPromise = dataD8());
    let bajasPromise;
    const loadBajas = () => bajasPromise || (bajasPromise = dataD2(mesD2));
    return [
      { title: 'VACANTES', fetch: () => dataD1(mesD1), build: buildD1 },
      { title: 'BAJAS', fetch: loadBajas, build: buildD2 },
      { title: 'ANÁLISIS DE BAJAS', fetch: loadBajas, build: buildD2Analysis },
      { title: 'APROVECHAMIENTO DE ESTRUCTURA', fetch: dataD3, build: buildD3 },
      { title: 'CAPACIDADES 2026', fetch: loadCapacidades, build: buildD8 },
      { title: 'MÓDULO CERCA SIEMPRE', fetch: async () => (await loadCapacidades())?.cercaSiempre || null, build: buildD8CercaSiempre },
      { title: 'TREO · ESTRUCTURA', fetch: dataD7, build: buildD7 },
    ];
  }

  async function generatePresentation(){
    const statusEl = document.getElementById('pptx-rae-status');
    const btn = document.getElementById('generate-pptx-rae-btn');
    btn.disabled = true;
    btn.textContent = 'Generando...';
    if(statusEl) statusEl.textContent = 'Consultando Google Sheets...';
    try {
      await window.OXXO_ADMIN_ASSETS.ensure('pptx');
      const mesSelect = document.getElementById('pptx-rae-mes');
      const mesOption = mesSelect ? mesSelect.selectedOptions[0] : null;
      const mesD1 = mesOption ? mesOption.value : '';
      const mesD2 = mesOption ? (mesOption.dataset.canon || '') : '';
      const usaMesElegido = Boolean(mesD1);

      const today = new Date();
      const dateLabel = usaMesElegido && mesOption.textContent
        ? mesOption.textContent
        : `${MESES[today.getMonth()]} ${today.getFullYear()}`;

      const pptx = new window.PptxGenJS();
      pptx.layout = 'LAYOUT_WIDE'; // 13.333in x 7.5in, igual que RAE_BASE.pptx

      buildCover(pptx, today.toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' }));

      const DASHBOARDS = buildDashboardList(mesD1, mesD2);
      for(const d of DASHBOARDS){
        try {
          const data = await d.fetch();
          if(data) d.build(pptx, data, data.sub || 'Corte no informado');
          else emptySlide(pptx, d.title, dateLabel);
        } catch(e){
          console.error('Error generando slide', d.title, e);
          emptySlide(pptx, d.title, dateLabel);
        }
      }

      const fileName = `Presentacion-RAE-Oaxaca-${today.toISOString().slice(0,10)}.pptx`;
      await pptx.writeFile({ fileName });
      if(statusEl) statusEl.textContent = 'Presentación generada correctamente.';
    } catch(e){
      console.error(e);
      if(statusEl) statusEl.textContent = 'Error al generar la presentación: ' + e.message;
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<svg class="icon-inline" viewBox="0 0 24 24" aria-hidden="true"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>Generar Presentación RAE';
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('generate-pptx-rae-btn');
    if(btn) btn.addEventListener('click', generatePresentation);
    populateMesSelector();
  });
})();
