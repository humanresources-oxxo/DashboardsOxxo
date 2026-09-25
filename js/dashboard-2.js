const TAB = OXXO.SHEETS_CONFIG.TABS.d2;

const ALIASES = {
  mes: ['Mes','MES','Mes baja','Mes de baja','Mes_baja'],
  semana: ['Semana','SEMANA','Week','Semana de baja'],
  region: ['Región','Region','REGION','División','Division'],
  plaza: ['Plaza','PLAZA','Zona'],
  asesor: ['Asesor','ASESOR','AT','Asesor AT','Responsable','Asesor Responsable','Nombre asesor','Nombre del asesor'],
  tienda: ['Tienda','Unidad org.','Unidad org','Unidad Organizativa','Unidad organizativa','Unidad','Sucursal','Nombre Tienda','Nombre de tienda','Denominación U.Org. Actual','Denominacion U.Org. Actual','Denominación U.Organ.Actual','Denominacion U.Organ.Actual','Denom. Unidad','U.Or.Act'],
  puesto: ['Puesto','Puestos Homologados','Descripción de Posición','Descripcion de Posicion','Descripción de Puesto','Descripcion de Puesto','Posición','Posicion','Cargo','Denominación Función Actual','Denominacion Funcion Actual'],
  motivo: ['Motivo de baja','Motivo_baja','Motivo','Causa','Causa baja','Baja con causal','Tipo de baja','Denominación Motivo','Denominacion Motivo'],
  detalle: ['Detalle de Baja','Detalle_baja','Detalle baja','Comentarios'],
  temporalidad: ['Temporalidad','Temporalidad baja','Rango antigüedad','Rango antiguedad','Antigüedad rango','Antiguedad rango'],
  aplica: ['Aplica en %','Aplica en % de rotación','Aplica en % de rotacion','Aplica','Aplica porcentaje','Aplica rotación','Aplica rotacion'],
  rotTemp: ['Rot. Temp.','Rot Temp','Rotación temporal','Rotacion temporal','Rot. Temprana','Rot Temprana','Temporal'],
  fecha: ['Fecha','Fecha baja','Fecha de baja','Fecha_validez','Fecha validez','F. Validez','Corte'],
  personal: ['No. Personal','No Personal','N° Personal','Nº Personal','Num. Personal','Num Personal','Núm. Personal','Numero Personal','Número Personal','Numero de Personal','Número de Personal','ID Personal','Id Personal','Personal','No. empleado','No empleado','Numero empleado','Número empleado'],
  antiguedad: ['Antiguedad_dias','Antigüedad_dias','Antiguedad dias','Antigüedad días','Dias','Días','Días Activo','Dias Activo'],
  empleado: ['Nombre_empleado','Nombre empleado','Empleado','Colaborador','Nombre colaborador','Nombre del empleado'],
  genero: ['Genero','Género','Sexo'],
  medida: ['Denominación Medida','Denominacion Medida','Medida','Med.'],
  bajas2025: ['2025','Bajas 2025','Total 2025','Bajas_2025'],
  bajas2026: ['2026','Bajas 2026','Total 2026','Bajas_2026','Total de bajas'],
  bajasSemana: ['Bajas temprana','Bajas Semana','Bajas semana','Bajas_semana','Conteo bajas temprana'],
  totalBajas: ['Total de bajas','Total bajas','Bajas','TOTAL BAJAS'],
  colPlazas:   ['Plazas','PLAZAS','Plaza ranking','Nombre Plaza'],
  colBajas:    ['Bajas Plaza','Bajas_Plaza','BAJAS PLAZA','Bajas plazas'],
  edad: ['Edad','EDAD','Edad años','Edad (años)','Edad Años','Edad_anios','Edad_años'],
};

function cleanKey(str){return String(str||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');}
function cleanText(str){return String(str||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ').trim();}
function canonicalPlazaName(value){
  const raw=String(value||'').trim();
  const token=cleanText(raw);
  for(const region of OXXO.getScopeCatalog()){
    for(const plaza of region.plazas){
      const candidates=[plaza.name,plaza.shortName,...plaza.aliases].map(cleanText).filter(Boolean);
      if(candidates.some(candidate=>token===candidate||token.includes(candidate)||candidate.includes(token)))return plaza.shortName||plaza.name;
    }
  }
  return raw||'Sin plaza';
}
// Delegado a core.js (OXXO.metricsFindKey): misma implementacion exacta,
// para que dashboards y presentaciones nunca vuelvan a divergir.
function findRealKey(row, aliases){ return OXXO.metricsFindKey(row, aliases); }
function buildCols(data){
  const sample = data.find(r => Object.values(r).some(v => String(v||'').trim() !== '')) || data[0] || {};
  const cols = {}; Object.entries(ALIASES).forEach(([k,v]) => cols[k] = findRealKey(sample, v));
  return cols;
}
function val(row, cols, key, fallback=''){ const k=cols[key]; const v=k ? row[k] : undefined; return (v===undefined || v===null || String(v).trim()==='') ? fallback : v; }
function num(v){ const n = Number(String(v??'').replace(/[$,%]/g,'').replace(/,/g,'').trim()); return Number.isFinite(n) ? n : 0; }
function countBy(data, getter){ const o={}; data.forEach(r=>{const k = getter(r) || 'Sin dato'; o[k]=(o[k]||0)+1;}); return o; }
function topEntries(obj, limit=15){ return Object.entries(obj).map(([label,total])=>({label,total})).sort((a,b)=>b.total-a.total).slice(0,limit); }
function uniq(data, getter, limit=8){ return [...new Set(data.map(getter).filter(Boolean))].slice(0,limit); }
function chipHTML(values){ return values.length ? values.map(v=>`<span class="chip-orange">${OXXO.truncate(String(v),22)}</span>`).join('') : '<span class="chip-orange">—</span>'; }
const MONTH_ABBR = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const MONTH_MAP = {
  ene:1, enero:1, jan:1, january:1,
  feb:2, febrero:2, february:2,
  mar:3, marzo:3, march:3,
  abr:4, abril:4, apr:4, april:4,
  may:5, mayo:5,
  jun:6, junio:6, june:6,
  jul:7, julio:7, july:7,
  ago:8, agosto:8, aug:8, august:8,
  sep:9, sept:9, septiembre:9, set:9, september:9,
  oct:10, octubre:10, october:10,
  nov:11, noviembre:11, november:11,
  dic:12, diciembre:12, dec:12, december:12,
};
function normalizeMonthKey(value){
  return OXXO.metricsNormalizeMonthKey(value);
}
function monthKeyFromRow(row, cols){
  return normalizeMonthKey(val(row, cols, 'mes')) || normalizeMonthKey(val(row, cols, 'fecha'));
}
function monthLabel(key){
  const m = String(key || '').match(/^(\d{4})-(\d{2})$/);
  if(!m) return key || 'Sin mes';
  const names = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  return `${names[+m[2]-1]} ${m[1]}`;
}
let BASE_BAJAS_DATA = [];
// Filas crudas (con el asesor ya resuelto por catalogo), ANTES del filtro de
// Medida/Puesto de filterData(). Sirve unicamente para calcular que meses
// existen de verdad -- ver uniqueFilterOptions.
let RAW_BAJAS_DATA = [];
let BAJAS_COLS = {};
// Boton local "Ver todas las plazas" del panel Ranking/Comparativo de
// Plazas: por defecto solo muestra la plaza activa (ver renderPlazas).
let PLAZAS_SHOW_ALL = false;
let OTRAS_PLAZAS_DATA = [];
// Meta mensual de bajas por asesor (pestana Compromisos_Bajas: Plaza | Asesor
// | Compromiso), cargada una vez en initDashboard -- antes vivia hardcodeada
// como nombres reales en OXXO.SHEETS_CONFIG.BAJAS_COMMITMENTS (config.js,
// archivo JS publico). byPlaza: Map de plaza normalizada -> {Asesor: valor}.
let COMPROMISOS_BY_PLAZA = new Map();
let FILTER_STATE = {};
let SELECTED_ASESORES = null; // array de asesores seleccionados (multi-select)

const SIN_ASESOR = 'SIN ASESOR ASIGNADO';
function getAsesorValue(row, cols){
  const raw = String(val(row, cols, 'asesor', '') || '').trim();
  if(!raw) return SIN_ASESOR;
  const c = cleanText(raw);
  if(c.includes('SIN ASESOR') || c.includes('NO ASIGNADO')) return SIN_ASESOR;
  return raw;
}
function asesorOptionsList(data, cols){
  const set = new Set(data.map(r => getAsesorValue(r, cols)));
  const arr = [...set].filter(v => v !== SIN_ASESOR).sort((a,b)=>a.localeCompare(b,'es'));
  if(set.has(SIN_ASESOR)) arr.push(SIN_ASESOR);
  return arr;
}
function defaultAsesorSelection(data, cols){
  // Arranca con TODOS los asesores, incluido "Sin asesor asignado" (bajas de
  // tiendas de Entrenamiento y Operaciones). Antes esas quedaban fuera por
  // defecto y la tarjeta "Total Bajas" no era el total: eran bajas reales que
  // no aparecian en ningun KPI y nada en pantalla lo decia. Se sigue pudiendo
  // des-seleccionar a mano desde el filtro de asesor.
  return asesorOptionsList(data, cols);
}
function passesAsesorFilter(row, cols){
  if(!SELECTED_ASESORES) return true;
  return SELECTED_ASESORES.includes(getAsesorValue(row, cols));
}

function getFilterValue(row, cols, key) {
  if (key === 'mes') return monthKeyFromRow(row, cols);
  if (key === 'temporalidad') return getTemporalidad(row, cols);
  if (key === 'puesto') return normalizePuesto(val(row, cols, 'puesto'));
  if (key === 'motivo') return normalizeMotivo(val(row, cols, 'motivo'));
  if (key === 'edadRange') { const g = ageGroup(num(val(row, cols, 'edad', ''))); return g ? g.label : ''; }
  if (key === 'antiguedadRange') { const g = tenureGroupHeatmap(val(row, cols, 'temporalidad', '')); return g ? g.label : ''; }
  return String(val(row, cols, key, '') || '').trim();
}

function uniqueFilterOptions(data, cols, key) {
  // 'mes' se calcula sobre RAW_BAJAS_DATA (crudo), no sobre `data` (que ya
  // paso por filterData(): Medida="BAJA" y Puesto operativo). Esos filtros
  // se aplican al conjunto COMPLETO ("si queda algo, usalo") y pueden dejar
  // fuera TODAS las filas de un mes reciente si, por ejemplo, la carga de
  // hoy todavia no trae la columna Medida poblada -- ese mes desaparecia
  // por completo del selector (ni siquiera aparecia como opcion), en vez de
  // solo quedar vacio al elegirlo. Mismo patron de bug que ya se corrigio en
  // Dashboard 1 (mes vigente elegido sobre datos ya filtrados).
  const source = (key === 'mes' && RAW_BAJAS_DATA.length) ? RAW_BAJAS_DATA : data;
  const values = [...new Set(source.map(r => getFilterValue(r, cols, key)).filter(Boolean))];
  if(key === 'mes') return values.sort((a,b)=>String(a).localeCompare(String(b)));
  return values.sort((a,b) => String(a).localeCompare(String(b), 'es'));
}

function filterOptionLabel(key, value){
  if(key === 'mes') return monthLabel(value);
  return OXXO.truncate(String(value), 28);
}

function latestMonthKey(data, cols){
  return uniqueFilterOptions(data, cols, 'mes').slice(-1)[0] || '';
}

function defaultFilterState(data, cols, restoreShared = true){
  const available = uniqueFilterOptions(data, cols, 'mes');
  const latest = available.slice(-1)[0] || '';
  const mes = restoreShared ? OXXO.restoreDashboardPeriod(available, latest) : latest;
  return mes ? { mes } : {};
}

function updateAsesorLabel(data, cols){
  const label = document.getElementById('asesor-label');
  if(!label) return;
  const total = asesorOptionsList(data, cols).length;
  const n = SELECTED_ASESORES ? SELECTED_ASESORES.length : total;
  if(!SELECTED_ASESORES || n === total) label.textContent = 'Todos los asesores';
  else if(n === 0) label.textContent = 'Ningún asesor';
  else if(n === 1) label.textContent = OXXO.truncate(SELECTED_ASESORES[0], 24);
  else label.textContent = `${n} asesores seleccionados`;
}
function renderAsesorOptions(data, cols, query=''){
  const wrap = document.getElementById('asesor-options');
  if(!wrap) return;
  const q = String(query||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const all = asesorOptionsList(data, cols);
  const filtered = all.filter(v => !q || v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(q));
  const allSelected = SELECTED_ASESORES && SELECTED_ASESORES.length === all.length;
  const rows = [{value:'', label:'Todos los asesores', isAll:true}]
    .concat(filtered.map(v => ({value:v, label:v, isAll:false})))
    .map(opt => {
      const active = opt.isAll ? allSelected : (SELECTED_ASESORES ? SELECTED_ASESORES.includes(opt.value) : true);
      // "Solo" aisla ese asesor de un clic. La regla de abajo (estado implicito
      // "Todos" -> el clic aisla) no alcanza desde una seleccion parcial: ahi el
      // clic solo quita, y quedarse con uno obligaba a apagar los demas a mano.
      const opcion = `<button type="button" class="smart-filter__option ${active?'is-active':''}" data-asesor="${esc2(opt.value)}" title="${esc2(opt.label)}">
        <span class="smart-filter__check"></span>
        <span class="sf-text">${esc2(opt.label)}</span>
      </button>`;
      if(opt.isAll) return `<div class="sf-row">${opcion}</div>`;
      return `<div class="sf-row">${opcion}<button type="button" class="sf-only" data-solo-asesor="${esc2(opt.value)}" title="Ver solo ${esc2(opt.label)}">Solo</button></div>`;
    }).join('');
  wrap.innerHTML = rows || '<div class="smart-filter__empty">Sin resultados</div>';
}
function updateTiendaLabel(){
  const label = document.getElementById('tienda-label');
  if(!label) return;
  label.textContent = FILTER_STATE.tienda ? OXXO.truncate(FILTER_STATE.tienda, 24) : 'Buscar tienda…';
}
function renderTiendaOptions(data, cols, query=''){
  const wrap = document.getElementById('tienda-options');
  if(!wrap) return;
  const q = String(query||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const all = uniqueFilterOptions(data, cols, 'tienda');
  const filtered = all.filter(v => !q || v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(q));
  const rows = [{value:'', label:'Todas las tiendas'}]
    .concat(filtered.map(value => ({value, label:value})))
    .map(opt => {
      const active = opt.value ? FILTER_STATE.tienda === opt.value : !FILTER_STATE.tienda;
      return `<button type="button" class="smart-filter__option ${active?'is-active':''}" data-tienda="${esc2(opt.value)}">
        <span class="smart-filter__check"></span>
        <span>${esc2(opt.label)}</span>
      </button>`;
    }).join('');
  wrap.innerHTML = rows || '<div class="smart-filter__empty">Sin resultados</div>';
}
function esc2(value){
  return String(value??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

let _asesorDocClickBound = false;
function setFilterBar(data, cols){
  const filterDefs = [
    ['mes', 'Mes'],
    ['temporalidad', 'Temporalidad'],
    ['rotTemp', 'Rot. Temp.'],
    ['puesto', 'Puesto'],
  ];

  const asesorBox = `
    <div class="filter-box">
      <label for="asesor-button" class="filter-title">Asesor</label>
      <div class="smart-filter" id="asesor-filter">
        <button class="smart-filter__button" type="button" id="asesor-button">
          <span class="smart-filter__label" id="asesor-label">Todos los asesores</span>
          <span class="smart-filter__chev">▾</span>
        </button>
        <div class="smart-filter__menu" id="asesor-menu">
          <input class="smart-filter__search" id="asesor-search" type="search" placeholder="Buscar asesor..." autocomplete="off">
          <div class="smart-filter__list" id="asesor-options"></div>
        </div>
      </div>
    </div>`;

  const tiendaBox = `
    <div class="filter-box">
      <label for="tienda-button" class="filter-title">Tienda</label>
      <div class="smart-filter" id="tienda-filter">
        <button class="smart-filter__button" type="button" id="tienda-button">
          <span class="smart-filter__button-main">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-4-4"></path></svg>
            <span class="smart-filter__label" id="tienda-label">Buscar tienda…</span>
          </span>
          <span class="smart-filter__chev">▾</span>
        </button>
        <div class="smart-filter__menu" id="tienda-menu">
          <input class="smart-filter__search" id="tienda-search" type="search" placeholder="Escribe el nombre de la tienda..." autocomplete="off">
          <div class="smart-filter__list" id="tienda-options"></div>
        </div>
      </div>
    </div>`;

  const selects = filterDefs.map(([key,title]) => {
    const values = uniqueFilterOptions(data, cols, key);
    const selected = FILTER_STATE[key] || '';
    const options = [''].concat(values).map(v => {
      const label = v === '' ? (key === 'mes' ? 'Todos los meses' : 'Todos') : filterOptionLabel(key, v);
      return `<option value="${String(v).replace(/"/g,'&quot;')}" ${String(v) === String(selected) ? 'selected' : ''}>${label}</option>`;
    }).join('');
    return `
      <div class="filter-box">
        <label class="filter-title" for="filter-${key}">${title}</label>
        <select class="filter-select" id="filter-${key}" data-filter="${key}">${options}</select>
      </div>`;
  }).join('');

  document.getElementById('filter-bar').innerHTML = asesorBox + tiendaBox + selects +
    `<div class="filter-box filter-box--actions" role="group" aria-labelledby="filtros-acciones-label"><label class="filter-title" id="filtros-acciones-label">Acciones</label><div class="filter-actions filter-actions--contact"><button class="reset-filters filter-action-icon" id="reset-filters" type="button" title="Limpiar filtros" aria-label="Limpiar filtros"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 1-2.34-5.66"/><path d="M20 4v7h-7"/></svg><span class="d2-action-text">Limpiar</span></button><button class="reset-filters download-filter filter-action-icon" type="button" id="download-base" title="Descargar base" aria-label="Descargar base"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg><span class="d2-action-text">Base</span></button><button class="reset-filters download-filter filter-action-icon" type="button" id="download-contact" title="Descargar base con contacto" aria-label="Descargar base con contacto protegida"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 5 6v5c0 5 3 8.5 7 10 4-1.5 7-5 7-10V6l-7-3Z"/><path d="M9 12h6"/><path d="M12 9v6"/></svg><span class="d2-action-text">Contacto</span></button></div></div>`;

  document.querySelectorAll('.filter-select').forEach(select => {
    select.addEventListener('change', () => {
      const key = select.dataset.filter;
      FILTER_STATE[key] = select.value;
      if (!FILTER_STATE[key]) delete FILTER_STATE[key];
      if(key === 'mes') OXXO.persistDashboardPeriod(select.value);
      document.querySelectorAll('#kpi-section .kpi-card[data-kpi]').forEach(c => c.classList.remove('active'));
      renderBajasDashboard(applyUserFilters(BASE_BAJAS_DATA, BAJAS_COLS), BAJAS_COLS);
      if(key === 'mes' && BASE_DENOM_DATA.length) renderDenominaciones(filterDenomByMes(BASE_DENOM_DATA));
    });
  });

  // Smart-filter Asesor
  updateAsesorLabel(data, cols);
  renderAsesorOptions(data, cols);
  document.getElementById('asesor-button').addEventListener('click', e => {
    e.stopPropagation();
    const box = document.getElementById('asesor-filter');
    const willOpen = !box.classList.contains('open');
    document.getElementById('tienda-filter')?.classList.remove('open');
    box.classList.toggle('open', willOpen);
    if(willOpen) setTimeout(()=>document.getElementById('asesor-search').focus(),0);
  });
  document.getElementById('asesor-search').addEventListener('input', e => {
    renderAsesorOptions(BASE_BAJAS_DATA, BAJAS_COLS, e.target.value);
  });
  document.getElementById('asesor-options').addEventListener('click', e => {
    const solo = e.target.closest('[data-solo-asesor]');
    if(solo){
      e.stopPropagation();
      SELECTED_ASESORES = [solo.dataset.soloAsesor];
      updateAsesorLabel(BASE_BAJAS_DATA, BAJAS_COLS);
      renderAsesorOptions(BASE_BAJAS_DATA, BAJAS_COLS, document.getElementById('asesor-search').value);
      document.querySelectorAll('#kpi-section .kpi-card[data-kpi]').forEach(c => c.classList.remove('active'));
      renderBajasDashboard(applyUserFilters(BASE_BAJAS_DATA, BAJAS_COLS), BAJAS_COLS);
      return;
    }
    const btn = e.target.closest('[data-asesor]');
    if(!btn) return;
    e.stopPropagation();
    const value = btn.dataset.asesor || '';
    const all = asesorOptionsList(BASE_BAJAS_DATA, BAJAS_COLS);
    if(!value){
      const allSelected = SELECTED_ASESORES && SELECTED_ASESORES.length === all.length;
      SELECTED_ASESORES = allSelected ? [] : [...all];
    } else if(!SELECTED_ASESORES || SELECTED_ASESORES.length === all.length){
      // Estado implicito "Todos": un clic en un asesor puntual selecciona SOLO ese,
      // en vez de quitarlo del grupo completo (lo cual obligaba a deseleccionar
      // uno por uno para quedarse con un solo asesor).
      SELECTED_ASESORES = [value];
    } else {
      const set = new Set(SELECTED_ASESORES);
      set.has(value) ? set.delete(value) : set.add(value);
      SELECTED_ASESORES = [...set];
    }
    updateAsesorLabel(BASE_BAJAS_DATA, BAJAS_COLS);
    renderAsesorOptions(BASE_BAJAS_DATA, BAJAS_COLS, document.getElementById('asesor-search').value);
    document.querySelectorAll('#kpi-section .kpi-card[data-kpi]').forEach(c => c.classList.remove('active'));
    renderBajasDashboard(applyUserFilters(BASE_BAJAS_DATA, BAJAS_COLS), BAJAS_COLS);
  });

  // Buscador de tienda (selección única)
  updateTiendaLabel();
  renderTiendaOptions(data, cols);
  document.getElementById('tienda-button').addEventListener('click', e => {
    e.stopPropagation();
    const box = document.getElementById('tienda-filter');
    const willOpen = !box.classList.contains('open');
    document.getElementById('asesor-filter')?.classList.remove('open');
    box.classList.toggle('open', willOpen);
    if(willOpen) setTimeout(()=>document.getElementById('tienda-search').focus(),0);
  });
  document.getElementById('tienda-search').addEventListener('input', e => {
    renderTiendaOptions(BASE_BAJAS_DATA, BAJAS_COLS, e.target.value);
  });
  document.getElementById('tienda-options').addEventListener('click', e => {
    const btn = e.target.closest('[data-tienda]');
    if(!btn) return;
    e.stopPropagation();
    const value = btn.dataset.tienda || '';
    if(value) FILTER_STATE.tienda = value;
    else delete FILTER_STATE.tienda;
    document.getElementById('tienda-search').value = '';
    updateTiendaLabel();
    renderTiendaOptions(BASE_BAJAS_DATA, BAJAS_COLS);
    document.getElementById('tienda-filter').classList.remove('open');
    document.querySelectorAll('#kpi-section .kpi-card[data-kpi]').forEach(c => c.classList.remove('active'));
    renderBajasDashboard(applyUserFilters(BASE_BAJAS_DATA, BAJAS_COLS), BAJAS_COLS);
  });
  if(!_asesorDocClickBound){
    document.addEventListener('click', e => {
      if(!e.target.closest('#asesor-filter')){
        const box = document.getElementById('asesor-filter');
        if(box) box.classList.remove('open');
      }
      if(!e.target.closest('#tienda-filter')){
        const box = document.getElementById('tienda-filter');
        if(box) box.classList.remove('open');
      }
    });
    _asesorDocClickBound = true;
  }

  document.getElementById('download-base')?.addEventListener('click', event => {
    OXXO.handleDownloadButton(event.currentTarget, () => OXXO.downloadSheetTab(TAB, 'dashboard-2-bajas.csv'));
  });
  document.getElementById('download-contact')?.addEventListener('click', async event => {
    const contactPassword = window.prompt('Contraseña para descargar la base con contacto:');
    if (contactPassword === null || !contactPassword) return;
    const button = event.currentTarget;
    await OXXO.handleDownloadButton(button, async () => {
      const endpoint = OXXO.SHEETS_CONFIG.ADMIN_UPLOAD_URL;
      if (!endpoint) throw new Error('No está configurado el servicio de descarga protegida.');
      const response = await fetch(endpoint, {
        method: 'POST',
        mode: 'cors',
        credentials: 'omit',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'downloadBajasWithContact', contactPassword })
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result || result.ok === false) throw new Error((result && result.error) || 'No se pudo generar la descarga protegida.');
      OXXO.downloadRowsAsCSV(result.rows, 'dashboard-2-bajas-con-contacto.csv', result.headers);
    });
  });

  const resetBtn = document.getElementById('reset-filters');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      FILTER_STATE = defaultFilterState(BASE_BAJAS_DATA, BAJAS_COLS, false);
      OXXO.persistDashboardPeriod(FILTER_STATE.mes || '');
      SELECTED_ASESORES = defaultAsesorSelection(BASE_BAJAS_DATA, BAJAS_COLS);
      document.querySelectorAll('#kpi-section .kpi-card[data-kpi]').forEach(c => c.classList.remove('active'));
      setFilterBar(BASE_BAJAS_DATA, BAJAS_COLS);
      renderBajasDashboard(applyUserFilters(BASE_BAJAS_DATA, BAJAS_COLS), BAJAS_COLS);
    });
  }
}

function applyUserFilters(data, cols) {
  return data.filter(row => {
    if(!passesAsesorFilter(row, cols)) return false;
    return Object.entries(FILTER_STATE).every(([key, selected]) => {
      if (!selected) return true;
      return String(getFilterValue(row, cols, key)) === String(selected);
    });
  });
}

function normalizePuesto(p){
  const t=cleanText(p);
  if(t.includes('AYUDANTE')) return 'Ayudante Tienda';
  if(t.includes('ENCARGADO')) return 'Encargado';
  if(t.includes('LIDER') || t.includes('LÍDER')) return 'Líder';
  return String(p||'Sin puesto').trim() || 'Sin puesto';
}
function normalizeMotivo(m){
  const t=cleanText(m);
  if(!t) return 'Sin motivo';
  if(t.includes('RENUNCIA')) return 'RENUNCIA';
  if(t.includes('CAUSAL')) return 'BAJA CON CAUSAL';
  if(t.includes('ABANDONO')) return 'ABANDONO';
  return String(m).trim();
}
function getTemporalidad(row, cols){
  const direct = val(row, cols, 'temporalidad');
  if(direct) return direct;
  const d = num(val(row, cols, 'antiguedad'));
  if(!d && d !== 0) return 'Sin dato';
  if(d <= 45) return '0 - 45 días';
  if(d <= 90) return '46 - 90 días';
  if(d <= 180) return '3 - 6 meses';
  if(d <= 365) return '6 - 12 meses';
  return '> 1 año';
}
function filterData(data, cols){
  let rows = data.filter(r => Object.values(r).some(v => String(v||'').trim() !== ''));
  // Para base cruda: quedarse solo con movimientos de BAJA.
  if(cols.medida){
    const bajas = rows.filter(r => cleanText(val(r, cols, 'medida')).includes('BAJA'));
    if(bajas.length) rows = bajas;
  }
  // La plaza o región seleccionada ya viene filtrada por fetchSheetData().
  // Puestos operativos que sí entran al tablero.
  if(cols.puesto){
    const operativos = rows.filter(r => {
      const p = cleanText(val(r, cols, 'puesto'));
      return p.includes('AYUDANTE') || p.includes('ENCARGADO') || p.includes('LIDER') || p.includes('LÍDER');
    });
    if(operativos.length) rows = operativos;
  }
  // Se conservan Entrenamiento y Operaciones para que sus bajas aparezcan
  // bajo "Sin asesor asignado" y en el detalle. Se excluyen únicamente del
  // ranking de tiendas, porque no son tiendas operativas; sí cuentan en el
  // total de su plaza para que todos los totales permanezcan sincronizados.
  return rows;
}
function chartTheme(){
  if (window.OXXO && OXXO.getChartThemeColors) return OXXO.getChartThemeColors();
  return { text: '#2D2D44', muted: '#6B6678', grid: 'rgba(128,63,38,.10)', tooltipBg: '#251313' };
}
function chartReady(canvas){
  if (window.Chart) return true;
  if (window.OXXO && OXXO.ensureChartReady) return OXXO.ensureChartReady(canvas);
  canvas.style.display = 'none';
  console.warn('Chart.js no esta disponible.');
  return false;
}
function renderChart(canvasId, type, labels, values, opts={}){
  const canvas = document.getElementById(canvasId); if(!canvas) return;
    if(!chartReady(canvas)) return;
  if(canvas._chartInstance) canvas._chartInstance.destroy();
  const ctx=canvas.getContext('2d');
  const theme = chartTheme();
  const tickColor = theme.text;
  const tickStrokeWidth = 0;
  const isRanking = !!opts.ranking;
  const isLollipop = !!opts.lollipop;
  const colors = opts.colors || labels.map((_, index) => {
    if (!isRanking) return opts.color || '#F07B22';
    return index < 3 ? '#D91F2D' : index < 8 ? '#F07B22' : '#F6B73C';
  });
  const rankingValuePlugin = {
    id: `rankingValueLabels-${canvasId}`,
    afterDatasetsDraw(chart) {
      if(!isRanking) return;
      const { ctx } = chart;
      const meta = chart.getDatasetMeta(0);
      ctx.save();
      ctx.font = '900 12px Barlow, sans-serif';
      ctx.textBaseline = 'middle';
      meta.data.forEach((bar, index) => {
        const value = values[index];
        const text = `${value} ${value === 1 ? 'baja' : 'bajas'}`;
        const sitsInside = bar.x > chart.chartArea.right - 58;
        ctx.fillStyle = sitsInside ? '#FFF8F2' : '#C91825';
        ctx.textAlign = sitsInside ? 'right' : 'left';
        ctx.fillText(text, sitsInside ? bar.x - 10 : bar.x + 10, bar.y);
      });
      ctx.restore();
    }
  };
  const rankingLollipopPlugin = {
    id: `rankingLollipop-${canvasId}`,
    beforeDatasetsDraw(chart) {
      if(!isLollipop) return;
      const average=values.reduce((sum,value)=>sum+Number(value||0),0)/Math.max(values.length,1);
      const {ctx,chartArea,scales}=chart;
      const averageX=scales.x.getPixelForValue(average);
      ctx.save();
      ctx.strokeStyle='rgba(130,92,76,.34)';
      ctx.lineWidth=1;
      ctx.setLineDash([4,4]);
      ctx.beginPath();ctx.moveTo(averageX,chartArea.top);ctx.lineTo(averageX,chartArea.bottom);ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle='#8a6c60';
      ctx.font='800 10px Barlow, sans-serif';
      ctx.textAlign='center';
      ctx.fillText(`Prom. ${average.toFixed(1)}`,averageX,chartArea.top-4);
      ctx.restore();
    },
    afterDatasetsDraw(chart) {
      if(!isLollipop) return;
      const {ctx,chartArea}=chart;
      const meta=chart.getDatasetMeta(0);
      ctx.save();
      ctx.font='900 12px Barlow, sans-serif';
      ctx.textBaseline='middle';
      meta.data.forEach((bar,index)=>{
        const value=Number(values[index])||0;
        const color=colors[index];
        // Cuando el valor máximo toca el límite del eje, reservamos unos
        // píxeles para que el punto y su etiqueta no se recorten.
        const pointX=Math.min(bar.x,chartArea.right-10);
        const labelInside=bar.x>=chartArea.right-28;
        ctx.beginPath();ctx.arc(pointX,bar.y,8,0,Math.PI*2);
        ctx.fillStyle=color;ctx.fill();
        ctx.lineWidth=3;ctx.strokeStyle='rgba(255,255,255,.95)';ctx.stroke();
        ctx.fillStyle=labelInside?'#ad2631':'#ad2631';ctx.textAlign=labelInside?'right':'left';
        ctx.fillText(`${value} ${value===1?'baja':'bajas'}`,labelInside?pointX-13:pointX+13,bar.y);
      });
      ctx.restore();
    }
  };
  canvas._chartInstance = new Chart(ctx, {
    type,
    data:{ labels, datasets:[{ label:opts.label||'Bajas', data:values, backgroundColor:colors, borderColor:'rgba(255,255,255,.68)', borderWidth:isLollipop?0:1, borderRadius: opts.borderRadius ?? 999, borderSkipped:false, barThickness:isLollipop?3:undefined, barPercentage: opts.barPercentage ?? (isRanking ? .62 : .62), categoryPercentage: opts.categoryPercentage ?? (isRanking ? .82 : .7) }]},
    options:{ indexAxis: opts.horizontal ? 'y' : 'x', responsive:true, maintainAspectRatio:false,
      layout: { padding: opts.horizontal ? { top: isLollipop?22:10, right: 74, bottom: 8, left: 4 } : { top: 6, right: 8, bottom: 4, left: 4 } },
      plugins:{ legend:{display:!!opts.legend, position:'top', labels:{color:'#5A4037', usePointStyle:true, pointStyle:'circle', font:{family:'Barlow', size:12, weight:'800'}}}, tooltip:{backgroundColor:'#251313',titleColor:'#FFF8EE',bodyColor:'#FFF8EE',padding:12,cornerRadius:14,displayColors:false}, datalabels:{display:false} },
      scales:{
        x:{ border:{display:false}, grid:{display:!!opts.horizontal, color:'rgba(128,63,38,.045)', drawTicks:false}, ticks:{precision:0, color:tickColor, textStrokeColor:'rgba(0,0,0,0.55)', textStrokeWidth:tickStrokeWidth, font:{family:'Barlow', size: opts.tickSize || 12, weight:'800'}, maxRotation: opts.horizontal ? 0 : (opts.rotate ?? 55), minRotation: opts.horizontal ? 0 : (opts.rotate ?? 0)}, beginAtZero:true, max:isLollipop?opts.max:undefined, suggestedMax: opts.suggestedMax },
        y:{ border:{display:false}, grid:{display:!opts.horizontal, color:'rgba(128,63,38,.045)', drawTicks:false}, ticks:{color:tickColor, textStrokeColor:'rgba(0,0,0,0.55)', textStrokeWidth:tickStrokeWidth, font:{family:'Barlow', size: opts.tickSize || 12, weight:'800'}, crossAlign:'far'}, beginAtZero:true }
      }
    },
    plugins: isLollipop ? [rankingLollipopPlugin] : (isRanking ? [rankingValuePlugin] : [])
  });
}
function renderTotalChart(labels, values){
  const theme = chartTheme();
  const canvas=document.getElementById('chart-total'); if(!canvas) return; if(!chartReady(canvas)) return; if(canvas._chartInstance) canvas._chartInstance.destroy();
  canvas._chartInstance = new Chart(canvas.getContext('2d'),{
    type:'bar', data:{labels,datasets:[{label:'Bajas temprana',data:[values[0],0],backgroundColor:'#1f3b4b',borderRadius:4},{label:'Total de bajas',data:[0,values[1]],backgroundColor:'#ff7924',borderRadius:4}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:true,position:'top',labels:{boxWidth:8,font:{size:11, weight:'700'},color:theme.text}}},scales:{x:{grid:{display:false},ticks:{font:{size:11, weight:'700'},color:theme.text}},y:{beginAtZero:true,grid:{display:false},ticks:{display:false,color:theme.text}}}}
  });
}

function shortAsesorName(fullName){
  const parts=String(fullName||'').trim().split(/\s+/).filter(Boolean);
  if(parts.length<=2)return parts.join(' ');
  return `${parts[0]} ${parts.slice(1).map(part=>`${part[0].toUpperCase()}.`).join('')}`;
}

// Carga la pestana Compromisos_Bajas (Plaza | Asesor | Compromiso) una sola
// vez en initDashboard y arma COMPROMISOS_BY_PLAZA: Map de plaza (texto tal
// cual viene en la hoja) -> {Asesor: valor}. Si la pestana no existe todavia
// o viene vacia, queda vacio y compromisoConfigForScope() usa solo el
// default -- no rompe el dashboard mientras se crea/migra la pestana.
async function loadCompromisosBajas(){
  const sheetName=OXXO.SHEETS_CONFIG.COMMITMENTS_SHEET;
  if(!sheetName)return;
  const rows=await OXXO.fetchSheetData(sheetName,{scoped:false}).catch(()=>null);
  if(!Array.isArray(rows))return;
  const byPlaza=new Map();
  rows.forEach(row=>{
    const plaza=String(row['Plaza']||'').trim();
    const asesor=String(row['Asesor']||'').trim();
    const compromiso=Number(row['Compromiso']);
    if(!plaza||!asesor||!Number.isFinite(compromiso))return;
    if(!byPlaza.has(plaza))byPlaza.set(plaza,{});
    byPlaza.get(plaza)[asesor]=compromiso;
  });
  COMPROMISOS_BY_PLAZA=byPlaza;
}

function compromisoConfigForScope(){
  const scope=OXXO.getActiveDataScope();
  const target=[...COMPROMISOS_BY_PLAZA.entries()].find(([plaza])=>OXXO.matchesScopeValue(plaza,'plaza',scope));
  return {defaultValue:Number(OXXO.SHEETS_CONFIG.BAJAS_COMMITMENTS_DEFAULT)||0,values:target?target[1]:{}};
}

function compromisoRoster(cols){
  const month=FILTER_STATE.mes||latestMonthKey(BASE_BAJAS_DATA,cols);
  const source=month?BASE_BAJAS_DATA.filter(row=>monthKeyFromRow(row,cols)===month):BASE_BAJAS_DATA;
  const roster=new Map();
  source.forEach(row=>{
    const name=getAsesorValue(row,cols);
    if(!name||name===SIN_ASESOR)return;
    roster.set(cleanKey(name),name);
  });
  // Oaxaca ya tenía metas configuradas incluso para asesores con cero bajas.
  // Se agregan al roster únicamente cuando Oaxaca es el alcance activo; las
  // demás plazas se construyen exclusivamente con sus propios datos.
  const configured=compromisoConfigForScope().values;
  Object.keys(configured).forEach(name=>roster.set(cleanKey(name),name));
  return roster;
}

function compPillClass(bajas){
  const n = Number(bajas)||0;
  if(n <= 1) return 'good';
  if(n <= 3) return 'mid';
  if(n <= 5) return 'warn';
  return 'bad';
}

function renderCompromisoChart(items,totalBajas,totalComp,totalDesfase){
  const summary=document.getElementById('compromiso-summary');
  if(summary) summary.innerHTML=`<span><b>${totalBajas}</b> bajas reales</span><span class="is-meta"><b>${totalComp}</b> meta comprometida</span><span class="is-desfase"><b>${totalDesfase > 0 ? '+' : ''}${totalDesfase}</b> desfase</span><span title="Punto lleno = bajas reales · círculo hueco = meta">● bajas reales &nbsp; ○ meta comprometida</span>`;
  const details=document.getElementById('compromiso-details');
  if(details){
    details.style.setProperty('--comp-rows',String(items.length));
    details.innerHTML=`<div class="compromiso-detail-head"><span>REAL</span><span>META</span><span>DIF.</span></div>${items.map(item=>{const diff=item.bajas-item.comp;return `<div class="compromiso-detail-row"><span>${item.bajas}</span><span class="meta">${item.comp}</span><span class="${diff>0?'up':'down'}">${diff>0?'+':''}${diff}</span></div>`;}).join('')}`;
  }
  const canvas=document.getElementById('chart-asesores');
  if(!canvas || !chartReady(canvas)) return;
  if(canvas._chartInstance) canvas._chartInstance.destroy();
  const labels=items.map(item=>OXXO.truncate(item.nombre,30));
  const values=items.map(item=>item.bajas);
  const goals=items.map(item=>item.comp);
  const colors=items.map(item=>item.bajas>item.comp?'#D91F2D':'#20A365');
  const ceiling=Math.max(...values,...goals,1);
  const axisMax=Math.ceil((ceiling+2)/2)*2;
  const commitmentMarkers={
    id:'commitmentMarkers',
    afterDatasetsDraw(chart){
      const {ctx,chartArea,scales}=chart;
      const meta=chart.getDatasetMeta(0);
      const nameX=chartArea.left-336;
      const realX=chartArea.left-128;
      const metaX=chartArea.left-72;
      const diffX=chartArea.left-22;
      ctx.save();ctx.font='800 10px Barlow, sans-serif';ctx.textBaseline='middle';ctx.textAlign='left';ctx.fillStyle='#8b756d';
      ctx.fillText('ASESOR',nameX,chartArea.top-12);ctx.textAlign='center';ctx.fillText('BAJAS',realX,chartArea.top-12);ctx.fillText('META',metaX,chartArea.top-12);ctx.fillText('DESFASE',diffX,chartArea.top-12);
      ctx.font='900 14px Barlow, sans-serif';
      meta.data.forEach((bar,index)=>{
        const pointX=Math.min(bar.x,chartArea.right-10);
        const goalX=Math.max(chartArea.left+8,Math.min(scales.x.getPixelForValue(goals[index]),chartArea.right-10));
        ctx.beginPath();ctx.arc(goalX,bar.y,8,0,Math.PI*2);ctx.fillStyle='rgba(255,255,255,.95)';ctx.fill();ctx.lineWidth=2.5;ctx.strokeStyle='#75645e';ctx.stroke();
        ctx.beginPath();ctx.arc(pointX,bar.y,9,0,Math.PI*2);ctx.fillStyle=colors[index];ctx.fill();ctx.lineWidth=3;ctx.strokeStyle='rgba(255,255,255,.96)';ctx.stroke();
        const diff=values[index]-goals[index];
        ctx.textAlign='left';ctx.fillStyle='#4b3833';ctx.fillText(OXXO.truncate(items[index].nombre,24),nameX,bar.y);
        ctx.textAlign='center';ctx.fillStyle='#3b2925';ctx.fillText(String(values[index]),realX,bar.y);
        ctx.fillStyle='#75645e';ctx.fillText(String(goals[index]),metaX,bar.y);
        ctx.fillStyle=diff>0?'#c91825':'#15945e';ctx.fillText(`${diff>0?'+':''}${diff}`,diffX,bar.y);
      });
      ctx.restore();
    }
  };
  canvas._chartInstance=new Chart(canvas.getContext('2d'),{
    type:'bar',
    data:{labels,datasets:[{label:'Bajas reales',data:values,backgroundColor:colors,borderWidth:0,barThickness:6,borderRadius:4,borderSkipped:false}]},
    options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,layout:{padding:{top:28,right:32,bottom:8,left:350}},
      onClick(_event,elements){
        if(!elements.length)return;
        const item=items[elements[0].index];
        SELECTED_ASESORES=[item.full];updateAsesorLabel(BASE_BAJAS_DATA,BAJAS_COLS);
        renderAsesorOptions(BASE_BAJAS_DATA,BAJAS_COLS,document.getElementById('asesor-search')?.value||'');
        document.querySelectorAll('#kpi-section .kpi-card[data-kpi]').forEach(card=>card.classList.remove('active'));
        renderBajasDashboard(applyUserFilters(BASE_BAJAS_DATA,BAJAS_COLS),BAJAS_COLS);
      },
      plugins:{legend:{display:false},tooltip:{backgroundColor:'#251313',titleColor:'#FFF8EE',bodyColor:'#FFF8EE',padding:12,cornerRadius:14,displayColors:false,callbacks:{title:context=>items[context[0].dataIndex].full,label:context=>{const item=items[context.dataIndex];return [`Bajas reales: ${item.bajas}`,`Meta: ${item.comp}`,`Desfase: ${item.bajas-item.comp}`];}}}},
      scales:{x:{min:0,max:axisMax,border:{display:false},grid:{color:'rgba(128,63,38,.055)',drawTicks:false},ticks:{precision:0,color:chartTheme().text,font:{family:'Barlow',size:11,weight:'800'}},beginAtZero:true},y:{border:{display:false},grid:{display:false},ticks:{display:false}}}
    },plugins:[commitmentMarkers]
  });
}
function renderCompromiso(data, cols){
  const counts = {};
  data.forEach(r => {
    const name=getAsesorValue(r,cols);
    const id=cleanKey(name);
    counts[id]=(counts[id]||0)+1;
  });
  const commitmentConfig=compromisoConfigForScope();
  const configuredByKey=new Map(Object.entries(commitmentConfig.values).map(([name,value])=>[cleanKey(name),Number(value)||0]));
  let totalBajas = 0;
  let totalComp = 0;
  const sinAsesorId=cleanKey(SIN_ASESOR);
  const roster=compromisoRoster(cols);
  // No hay una meta individual para estas bajas, pero se listan con meta 0
  // para que la suma de esta tabla sea exactamente el total filtrado.
  if(counts[sinAsesorId]) roster.set(sinAsesorId,SIN_ASESOR);
  const sorted = [...roster].map(([id,full])=>({
    id,full,nombre:id===sinAsesorId?'Sin asesor asignado':shortAsesorName(full),bajas:counts[id]||0,
    comp:id===sinAsesorId?0:(configuredByKey.has(id)?configuredByKey.get(id):commitmentConfig.defaultValue)
  })).sort((a,b) => b.bajas - a.bajas || a.full.localeCompare(b.full, 'es'));
  const rows = sorted.map(item => {
    const bajas = item.bajas;
    const desfase = bajas - item.comp;
    totalBajas += bajas;
    totalComp += item.comp;
    return `<tr${item.id===sinAsesorId?' class="compromiso-sin-asesor"':''}>
      <td>${item.nombre}</td>
      <td class="num"><span class="pill ${compPillClass(bajas)}">${bajas}</span></td>
      <td class="num">${item.comp}</td>
      <td class="num desfase ${desfase <= 0 ? 'pos' : 'neg'}">${desfase}</td>
    </tr>`;
  }).join('');
  const totalDesfase = totalBajas - totalComp;
  document.getElementById('tabla-compromiso').innerHTML = `
    <div class="d2-scroll" data-scroll-label="Compromiso contra resultado por asesor"><table class="compromiso-table">
      <thead><tr><th>AT</th><th class="num">Bajas</th><th class="num">Comp.</th><th class="num">Desfase</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td>PLAZA</td><td class="num">${totalBajas}</td><td class="num">${totalComp}</td><td class="num">${totalDesfase}</td></tr></tfoot>
    </table></div>`;
  renderChart('chart-asesores','bar',sorted.map(item=>OXXO.truncate(item.nombre,28)),sorted.map(item=>item.bajas),{horizontal:true,ranking:true,tickSize:12,label:'Bajas por asesor'});
}

// Tabla de detalle de bajas: columnas reducidas (lo esencial para escanear rápido).
// El resto de los campos se muestran en la ventana emergente al hacer clic en una fila,
// sin repetir lo que ya se ve en la tabla.
// Misma implementacion que OXXO.escHtml (js/core.js). Antes esta copia no
// escapaba la comilla simple, asi que divergia del resto del sitio: las otras
// cinco copias (dashboards 3, 4, 9, 9-analisis y admin-pptx-rae) si la escapan.
function escHtml(s){ return String(s ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
const DET_MAIN_COLS = [
  ['mes','Mes'], ['asesor','Asesor'], ['tienda','Tienda'], ['empleado','Colaborador'], ['puesto','Puesto'], ['motivo','Motivo'], ['genero','Género']
];
let DET_DATA = [], DET_COLS = null;
let DET_SORT = { col:'mes', dir:'desc' };
function detValue(r, cols, key){
  if(key==='mes') return monthKeyFromRow(r,cols) || '';
  if(key==='puesto') return normalizePuesto(val(r,cols,key));
  if(key==='motivo') return val(r,cols,'detalle') || normalizeMotivo(val(r,cols,key));
  if(key==='temporalidad') return getTemporalidad(r,cols);
  return val(r,cols,key,'');
}
function detDisplay(r, cols, key){
  if(key==='mes') return monthLabel(monthKeyFromRow(r,cols));
  return detValue(r,cols,key) || '—';
}
function renderDetail(data, cols){
  DET_DATA = data; DET_COLS = cols;
  DET_DATA.forEach((r,i)=>{ r.__detIdx = i; });
  renderDetailTable();
}
function renderDetailTable(){
  const data = DET_DATA, cols = DET_COLS;
  const sorted = data.slice().sort((a,b)=>{
    const va = detValue(a,cols,DET_SORT.col), vb = detValue(b,cols,DET_SORT.col);
    const na = Number(va), nb = Number(vb);
    const bothNum = va!=='' && vb!=='' && !isNaN(na) && !isNaN(nb);
    const cmp = bothNum ? (na-nb) : String(va).localeCompare(String(vb), 'es');
    return DET_SORT.dir==='asc' ? cmp : -cmp;
  });
  const arrow = col => DET_SORT.col!==col ? '<span class="d2-sort__icon is-idle" aria-hidden="true">⇅</span>' : (DET_SORT.dir==='asc'?'<span class="d2-sort__icon" aria-hidden="true">↑</span>':'<span class="d2-sort__icon" aria-hidden="true">↓</span>');
  // El orden vive en un boton nativo dentro del encabezado (foco, Enter/Espacio)
  // y el estado se expone con aria-sort; DET_SORT no cambia.
  const ariaSort = col => DET_SORT.col!==col ? 'none' : (DET_SORT.dir==='asc' ? 'ascending' : 'descending');
  const thead = `<tr>${DET_MAIN_COLS.map(([k,label])=>`<th scope="col" data-col="${k}" aria-sort="${ariaSort(k)}"><button type="button" class="d2-sort" data-col="${k}">${label}${arrow(k)}</button></th>`).join('')}</tr>`;
  const rows = sorted.map(r => `<tr class="det-row" data-idx="${r.__detIdx}">` + DET_MAIN_COLS.map(([k]) => {
    const v = detDisplay(r,cols,k);
    return `<td title="${escHtml(v)}">${OXXO.truncate(String(v||'—'), 32)}</td>`;
  }).join('') + '</tr>').join('');
  document.getElementById('tabla-detalle').innerHTML = `<div class="table-wrapper d2-scroll" data-scroll-label="Detalle completo de bajas"><table class="data-table" id="tbl-detalle-bajas" data-rh-tools data-rh-sort="false" data-rh-page-size="25"><thead>${thead}</thead><tbody>${rows}</tbody></table></div><p class="d2-scroll-hint">Desliza para ver más →</p>`;

  document.querySelectorAll('#tbl-detalle-bajas thead .d2-sort').forEach(button=>{
    button.addEventListener('click', ()=>{
      const col = button.dataset.col;
      if(DET_SORT.col===col) DET_SORT.dir = DET_SORT.dir==='asc'?'desc':'asc';
      else { DET_SORT.col = col; DET_SORT.dir='asc'; }
      renderDetailTable();
      // La tabla se reconstruye: el foco vuelve al mismo encabezado.
      document.querySelector(`#tbl-detalle-bajas thead .d2-sort[data-col="${col}"]`)?.focus();
    });
  });
  OXXO_DIALOGS.bindRows(document.querySelectorAll('#tbl-detalle-bajas tbody tr.det-row'), 'Ver detalle de la baja', tr => openBajaModal(Number(tr.dataset.idx)));
  refreshScrollRegions();
}

// ── MODAL: GRAFICA DE PASTEL DE MOTIVOS ───────────────────
let chartMotivosPastel = null;
const PASTEL_COLORS = ['#D91F2D','#F07B22','#F6B73C','#19AD63','#1F6FD9','#7B1FA2','#00838F','#8A7A72','#C0181F','#3F51B5'];
// Semantica, foco y Escape: js/dashboard-dialogs.js. Las funciones open/close
// se conservan como adaptadores.
const dlgMotivos = OXXO_DIALOGS.register({ overlay:'motivos-modal', title:'motivos-title', close:'.baja-close' });
function closeMotivosModal(){ dlgMotivos.close(); }
function openMotivosModal(){
  const cols = DET_COLS;
  const counts = new Map();
  DET_DATA.forEach(r => {
    const label = (val(r,cols,'detalle') || normalizeMotivo(val(r,cols,'motivo'))).trim() || 'Sin dato';
    counts.set(label, (counts.get(label)||0) + 1);
  });
  const entries = [...counts.entries()].sort((a,b)=>b[1]-a[1]);
  const canvas = document.getElementById('chart-motivos-pastel');
  const emptyBox = document.getElementById('motivos-pastel-empty');
  dlgMotivos.open();
  if(!entries.length){
    canvas.style.display = 'none'; emptyBox.style.display = 'block';
    if(chartMotivosPastel){ chartMotivosPastel.destroy(); chartMotivosPastel = null; }
    return;
  }
  canvas.style.display = ''; emptyBox.style.display = 'none';
  if(!chartReady(canvas)) return;
  if(chartMotivosPastel) chartMotivosPastel.destroy();
  const theme = chartTheme();
  chartMotivosPastel = new Chart(canvas.getContext('2d'), {
    type: 'pie',
    data: {
      labels: entries.map(([label]) => label),
      datasets: [{
        data: entries.map(([,n]) => n),
        backgroundColor: entries.map((_,i) => PASTEL_COLORS[i % PASTEL_COLORS.length]),
        borderColor: '#fff',
        borderWidth: 2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right', labels: { color: theme.text, boxWidth: 10, font: { size: 11, weight: '700' } } },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const total = entries.reduce((s,[,n])=>s+n,0);
              const pct = total ? ((ctx.raw/total)*100).toFixed(1) : '0.0';
              return ` ${ctx.label}: ${ctx.raw} (${pct}%)`;
            },
          },
        },
      },
    },
  });
}

// ── MODAL DETALLE DE BAJA ─────────────────────────────────
const dlgBaja = OXXO_DIALOGS.register({ overlay:'baja-modal', title:'baja-title', close:'.baja-close' });
function closeBajaModal(){ dlgBaja.close(); }
function openBajaModal(idx){
  const r = DET_DATA.find(x=>x.__detIdx===idx);
  if(!r) return;
  const cols = DET_COLS;
  const kv = (l,v) => { v = String(v==null?'':v).trim(); return v ? `<tr><td>${l}</td><td>${escHtml(v)}</td></tr>` : ''; };

  document.getElementById('baja-title').textContent = val(r,cols,'empleado','Colaborador');
  document.getElementById('baja-body').innerHTML = `
    <div class="baja-kpis">
      <div class="baja-kpi"><div class="v">${escHtml(val(r,cols,'asesor','—'))}</div><div class="l">Asesor</div></div>
      <div class="baja-kpi"><div class="v">${escHtml(val(r,cols,'tienda','—'))}</div><div class="l">Tienda</div></div>
      <div class="baja-kpi"><div class="v">${escHtml(normalizeMotivo(val(r,cols,'motivo')))}</div><div class="l">Motivo</div></div>
    </div>
    <table class="baja-tbl"><tbody>
      ${kv('Puesto', normalizePuesto(val(r,cols,'puesto')))}
      ${kv('Detalle de baja', val(r,cols,'detalle'))}
      ${kv('Mes', monthLabel(monthKeyFromRow(r,cols)))}
      ${kv('Semana', val(r,cols,'semana'))}
      ${kv('Plaza', val(r,cols,'plaza'))}
      ${kv('Región', val(r,cols,'region'))}
      ${kv('Temporalidad', getTemporalidad(r,cols))}
      ${kv('Rot. Temprana', val(r,cols,'rotTemp'))}
      ${kv('Género', val(r,cols,'genero'))}
      ${kv('Edad', val(r,cols,'edad'))}
      ${kv('Antigüedad (días)', val(r,cols,'antiguedad'))}
      ${kv('Fecha', val(r,cols,'fecha'))}
      ${kv('No. Personal', val(r,cols,'personal'))}
    </tbody></table>`;
  dlgBaja.open();
}
const AGE_GROUPS = [
  {label:'18-25', min:18, max:25},
  {label:'26-35', min:26, max:35},
  {label:'36-45', min:36, max:45},
  {label:'46-55', min:46, max:55},
  {label:'56+',   min:56, max:Infinity},
];
// Antes se agrupaba por 'antiguedad' en días (columna que no existe en el sheet actual).
// Ahora se usa directamente la columna 'Temporalidad' (ya viene en buckets de texto), igual
// que en la página de Análisis de Bajas, para que ambas vistas coincidan siempre.
const TENURE_GROUPS = ['0 - 45 días','46 - 90 días','3 - 6 meses','6 - 12 meses','> 1 año'].map(label => ({label}));
function ageGroup(edad){
  const n = Number(edad);
  if(!Number.isFinite(n) || n <= 0) return null;
  return AGE_GROUPS.find(g => n >= g.min && n <= g.max) || null;
}
function tenureGroupHeatmap(temporalidad){
  const label = String(temporalidad||'').trim();
  if(!label) return null;
  return TENURE_GROUPS.find(g => g.label === label) || null;
}
function heatColor(ratio){
  const r0=[255,242,224], r1=[192,24,31];
  const t = Math.max(0, Math.min(1, ratio));
  const r = Math.round(r0[0] + (r1[0]-r0[0])*t);
  const g = Math.round(r0[1] + (r1[1]-r0[1])*t);
  const b = Math.round(r0[2] + (r1[2]-r0[2])*t);
  return `rgb(${r},${g},${b})`;
}
// Foco logico del mapa de calor (tabindex itinerante) y aviso para lectores de
// pantalla. Viven fuera del contenedor porque renderHeatmapBajas() lo reconstruye
// en cada filtro.
const HEAT = { row: 0, col: 0, message: '' };
function heatSpeak(label){
  return String(label).replace(/^>\s*(.+)$/, 'más de $1').replace(/^(\d+)\+$/, '$1 o más').replace(/\s*-\s*/g, ' a ');
}
function heatRgb(ratio){
  const r0=[255,242,224], r1=[192,24,31];
  const t = Math.max(0, Math.min(1, ratio));
  return [0,1,2].map(i => Math.round(r0[i] + (r1[i]-r0[i])*t));
}
// Texto claro u oscuro segun el relleno: el que dé mayor contraste (WCAG).
function heatTextColor(ratio){
  const lin = v => { v /= 255; return v <= .03928 ? v/12.92 : Math.pow((v+.055)/1.055, 2.4); };
  const [r,g,b] = heatRgb(ratio);
  const lum = .2126*lin(r) + .7152*lin(g) + .0722*lin(b);
  return (1.05/(lum+.05)) > ((lum+.05)/(.0128+.05)) ? '#fff' : '#2b1a17';
}
function toggleHeatmapCell(edad, ant, count){
  const isCurrent = FILTER_STATE.edadRange === edad && FILTER_STATE.antiguedadRange === ant;
  if(isCurrent){
    delete FILTER_STATE.edadRange;
    delete FILTER_STATE.antiguedadRange;
    HEAT.message = 'Filtro del mapa de calor quitado.';
  } else {
    FILTER_STATE.edadRange = edad;
    FILTER_STATE.antiguedadRange = ant;
    HEAT.message = `Filtro aplicado: edad ${heatSpeak(edad)}, antigüedad ${heatSpeak(ant)}. ${count} ${count === 1 ? 'baja' : 'bajas'}.`;
  }
  renderBajasDashboard(applyUserFilters(BASE_BAJAS_DATA, BAJAS_COLS), BAJAS_COLS);
}
function moveHeatmapFocus(container, row, col){
  const next = container.querySelector(`.heatmap-cell[data-r="${row}"][data-c="${col}"]`);
  if(!next) return;
  container.querySelectorAll('.heatmap-cell[tabindex="0"]').forEach(cell => cell.tabIndex = -1);
  next.tabIndex = 0;
  HEAT.row = row; HEAT.col = col;
  next.focus();
}
function bindHeatmapEvents(container){
  if(container.dataset.d2Bound) return;
  container.dataset.d2Bound = '1';
  container.addEventListener('click', event => {
    if(event.target.closest('#heatmap-clear')){
      toggleHeatmapCell(FILTER_STATE.edadRange, FILTER_STATE.antiguedadRange, 0);
      return;
    }
    const cell = event.target.closest('.heatmap-cell');
    if(!cell) return;
    HEAT.row = Number(cell.dataset.r); HEAT.col = Number(cell.dataset.c);
    toggleHeatmapCell(cell.dataset.edad, cell.dataset.ant, Number(cell.dataset.count));
  });
  container.addEventListener('keydown', event => {
    const cell = event.target.closest('.heatmap-cell');
    if(!cell) return;
    const last = AGE_GROUPS.length - 1, lastCol = TENURE_GROUPS.length - 1;
    let row = Number(cell.dataset.r), col = Number(cell.dataset.c);
    switch(event.key){
      case 'ArrowRight': col = Math.min(lastCol, col + 1); break;
      case 'ArrowLeft': col = Math.max(0, col - 1); break;
      case 'ArrowDown': row = Math.min(last, row + 1); break;
      case 'ArrowUp': row = Math.max(0, row - 1); break;
      case 'Home': col = 0; if(event.ctrlKey) row = 0; break;
      case 'End': col = lastCol; if(event.ctrlKey) row = last; break;
      default: return;
    }
    event.preventDefault();
    moveHeatmapFocus(container, row, col);
  });
}
function announceHeatmap(){
  const status = document.getElementById('heatmap-status');
  if(!status || !HEAT.message) return;
  status.textContent = HEAT.message;
  HEAT.message = '';
}
function renderHeatmapBajas(data, cols){
  const container = document.getElementById('heatmap-bajas');
  if(!container) return;
  const hadFocus = container.contains(document.activeElement);
  bindHeatmapEvents(container);
  const heatmapData = BASE_BAJAS_DATA.filter(row => {
    if(!passesAsesorFilter(row, cols)) return false;
    return Object.entries(FILTER_STATE).every(([key, selected]) => {
      if (!selected) return true;
      if (key === 'edadRange' || key === 'antiguedadRange') return true;
      return String(getFilterValue(row, cols, key)) === String(selected);
    });
  });
  const matrix = {};
  AGE_GROUPS.forEach(a => { matrix[a.label] = {}; TENURE_GROUPS.forEach(t => matrix[a.label][t.label] = 0); });
  let any = false;
  heatmapData.forEach(row => {
    const edadRaw = val(row, cols, 'edad', '');
    const temporalidadRaw = val(row, cols, 'temporalidad', '');
    if(edadRaw === '' || temporalidadRaw === '') return;
    const ag = ageGroup(num(edadRaw));
    const tg = tenureGroupHeatmap(temporalidadRaw);
    if(!ag || !tg) return;
    matrix[ag.label][tg.label]++;
    any = true;
  });
  if(!any){
    container.innerHTML = `<div class="heatmap-empty-msg">No hay suficientes datos de edad/antigüedad para construir el mapa de calor.</div>`;
    announceHeatmap();
    return;
  }
  const activeEdad = FILTER_STATE.edadRange || '';
  const activeAnt = FILTER_STATE.antiguedadRange || '';
  let maxVal = 0;
  AGE_GROUPS.forEach(a => TENURE_GROUPS.forEach(t => { maxVal = Math.max(maxVal, matrix[a.label][t.label]); }));
  const headerCells = TENURE_GROUPS.map(t => `<th scope="col" class="heatmap-axis-x">${t.label}</th>`).join('');
  const bodyRows = AGE_GROUPS.map((a, r) => {
    const cells = TENURE_GROUPS.map((t, c) => {
      const v = matrix[a.label][t.label];
      const isActive = activeEdad === a.label && activeAnt === t.label;
      const ratio = maxVal > 0 ? v / maxVal : 0;
      const fill = v === 0 ? '' : ` style="--heat-bg:${heatColor(ratio)};--heat-fg:${heatTextColor(ratio)}"`;
      const name = `Edad ${heatSpeak(a.label)}, antigüedad ${heatSpeak(t.label)}, ${v} ${v === 1 ? 'baja' : 'bajas'}, ${isActive ? 'quitar filtro' : 'activar filtro'}`;
      return `<td><button type="button" class="heatmap-cell${v === 0 ? ' is-empty' : ''}${isActive ? ' is-active' : ''}" data-edad="${a.label}" data-ant="${t.label}" data-r="${r}" data-c="${c}" data-count="${v}" tabindex="${r === HEAT.row && c === HEAT.col ? 0 : -1}" aria-pressed="${isActive}" aria-label="${name}" title="Edad: ${a.label} · Antigüedad: ${t.label} · Bajas: ${v}"${fill}>${v === 0 ? '—' : v}</button></td>`;
    }).join('');
    return `<tr><th scope="row">${a.label}</th>${cells}</tr>`;
  }).join('');
  container.innerHTML = `
    <div class="heatmap-wrap">
      <div class="heatmap-table-wrap">
        <div class="heatmap-axes-label">Antigüedad antes de la baja →  /  Edad ↓</div>
        <div class="heatmap-scroll d2-scroll" data-scroll-label="Mapa de calor de bajas">
          <table class="heatmap-table" aria-describedby="heatmap-help">
            <caption class="d2-sr">Mapa de calor: bajas por rango de edad (filas) y antigüedad antes de la baja (columnas)</caption>
            <thead><tr><td class="heatmap-corner"></td>${headerCells}</tr></thead>
            <tbody>${bodyRows}</tbody>
          </table>
        </div>
        <p class="d2-scroll-hint">Desliza para ver más →</p>
      </div>
      <div class="heatmap-legend">
        <div class="heatmap-legend__title">Intensidad</div>
        <div class="heatmap-legend__item"><span class="heatmap-legend__swatch" style="--heat-bg:${heatColor(0.12)}"></span>Bajo</div>
        <div class="heatmap-legend__item"><span class="heatmap-legend__swatch" style="--heat-bg:${heatColor(0.55)}"></span>Medio</div>
        <div class="heatmap-legend__item"><span class="heatmap-legend__swatch" style="--heat-bg:${heatColor(1)}"></span>Alto</div>
      </div>
    </div>`;
  if(hadFocus) container.querySelector(`.heatmap-cell[data-r="${HEAT.row}"][data-c="${HEAT.col}"]`)?.focus({ preventScroll: true });
  announceHeatmap();
}

// Tarjeta KPI: misma estructura en las cuatro (etiqueta, cifra grande y una
// linea secundaria). "entity" es el nombre completo de un asesor/tienda: el
// nombre accesible nunca se trunca, solo se recorta visualmente en CSS.
function kpiCardHTML({ kpi, tone, label, tip, value, sub, entity, val: kpiVal, aria }){
  const data = kpiVal === undefined ? '' : ` data-kpi-val="${escHtml(kpiVal)}"`;
  const subClass = entity ? 'd2-kpi__entity' : 'd2-kpi__meta';
  const subTitle = entity ? ` title="${escHtml(entity)}"` : '';
  return `<div class="kpi-card d2-kpi ${tone}" data-kpi="${kpi}"${data} aria-label="${escHtml(aria)}"><div class="kpi-card__label">${label}<span class="info-tip" tabindex="0" data-tip="${escHtml(tip)}"></span></div><div class="kpi-card__value">${value}</div><div class="kpi-card__delta ${subClass}"${subTitle}>${escHtml(sub)}</div></div>`;
}
function renderBajasDashboard(data, cols){
  LAST_FILTERED_COUNT = data.length;
  if(!data.length){
    document.getElementById('kpi-section').innerHTML = `
      <div class="kpi-card d2-kpi d2-kpi--empty rojo"><div class="kpi-card__label">Total bajas</div><div class="kpi-card__value">0</div><div class="kpi-card__delta neg d2-kpi__meta">Sin datos con filtros activos</div></div>`;
    document.getElementById('tabla-detalle').innerHTML = `<div class="state-box"><div class="state-box__icon">📭</div><div class="state-box__title">Sin resultados</div><div class="state-box__text">Limpia o cambia los filtros para volver a ver información.</div></div>`;
    document.getElementById('row-count').textContent = '0 bajas';
    ['chart-puesto','chart-total','chart-temporalidad','chart-motivos','chart-asesores','chart-tiendas'].forEach(id => {
      const c = document.getElementById(id);
      if(c && c._chartInstance) c._chartInstance.destroy();
    });
    const heatmapEl = document.getElementById('heatmap-bajas');
    if(heatmapEl){
      // Un cruce sin bajas deja el mapa vacio: se ofrece el camino de regreso y el foco no cae al body.
      const hadFocus = heatmapEl.contains(document.activeElement);
      const hasHeatFilter = Boolean(FILTER_STATE.edadRange && FILTER_STATE.antiguedadRange);
      bindHeatmapEvents(heatmapEl);
      heatmapEl.innerHTML = `<div class="heatmap-empty-msg">Sin datos suficientes para el mapa de calor con los filtros activos.${hasHeatFilter ? ' <button type="button" class="d2-btn d2-btn--red" id="heatmap-clear">Quitar filtro del mapa</button>' : ''}</div>`;
      if(hadFocus) heatmapEl.querySelector('#heatmap-clear')?.focus({ preventScroll: true });
    }
    announceHeatmap();
    renderPlazas(BASE_BAJAS_DATA, cols);
    syncD2UI();
    return;
  }

  const total = data.length;
  const byPuesto = countBy(data, r=>normalizePuesto(val(r,cols,'puesto')));
  const byMotivo = countBy(data, r=>normalizeMotivo(val(r,cols,'motivo')));
  const byTemp = countBy(data, r=>getTemporalidad(r,cols));
  const byAsesor = countBy(data, r=>val(r,cols,'asesor','Sin asesor'));
  const tiendasOperativasData = data.filter(r =>
    !OXXO.metricsIsTiendaEntrenamientoOperacionesD2(val(r, cols, 'tienda'))
  );
  const byTienda = countBy(tiendasOperativasData, r=>val(r,cols,'tienda','Sin tienda'));
  const topAsesor = topEntries(byAsesor,12);
  const topTienda = topEntries(byTienda,10);
  const maxAsesor = topAsesor[0] || {label:'—',total:0};
  const maxTiendaEntry = topTienda[0];
  const bajaTemprana = (byTemp['0 - 45 días'] || 0);
  const byRotTemp = countBy(data, r=>val(r,cols,'rotTemp','No'));
  const rotTemprana = byRotTemp['Si'] || byRotTemp['SI'] || 0;
  const tiendaLabel = maxTiendaEntry?.label || '';
  const tiendaTotal = maxTiendaEntry?.total || 0;
  const filtrosActivos = d2FilterInfo().count > 0;

  document.getElementById('kpi-section').innerHTML =
    kpiCardHTML({ kpi:'todos', tone:'rojo', label:'Total Bajas', value:total,
      tip:'Cuenta cada fila de Dashboard_2_Diario (1 fila = 1 baja) con los filtros activos de Mes, Temporalidad, Rot. Temprana, Puesto y Asesor aplicados.',
      sub: filtrosActivos ? 'Con filtros activos' : (FILTER_STATE.mes ? monthLabel(FILTER_STATE.mes) : 'Todos los meses'),
      aria:`Ver todas las bajas: ${total}` })
    + kpiCardHTML({ kpi:'asesor', tone:'rojo', label:'AT con más bajas', value:maxAsesor.total, val:maxAsesor.label, entity:maxAsesor.label, sub:maxAsesor.label,
      tip:"Agrupa las bajas filtradas por columna 'Asesor' y toma el que tiene mayor número.",
      aria:`Filtrar por ${maxAsesor.label}: ${maxAsesor.total} bajas` })
    + kpiCardHTML({ kpi:'tienda', tone:'naranja', label:'Tienda con más bajas', value:tiendaTotal, val:tiendaLabel, entity:tiendaLabel || '—', sub:tiendaLabel || '—',
      tip:"Agrupa las bajas filtradas por columna 'Tienda' y toma la que tiene mayor número.",
      aria:`Filtrar por ${tiendaLabel || 'tienda'}: ${tiendaTotal} bajas` })
    + kpiCardHTML({ kpi:'rotTemp', tone:'amarillo', label:'Rot. Temprana', value:rotTemprana, val:'Si',
      tip:"Bajas donde la columna 'Rot_Temp' = Sí, es decir colaboradores que se fueron poco después de su ingreso, con los filtros activos aplicados.",
      sub:`${total>0?Math.round((rotTemprana/total)*100):0}% del total`,
      aria:`Filtrar rotación temprana: ${rotTemprana} bajas` });
  // El clic en el "i" de ayuda no debe filtrar: se resuelve aqui y no con un
  // onclick en cada tarjeta.
  document.querySelectorAll('#kpi-section .kpi-card[data-kpi]').forEach(card => {
    const kpi = card.dataset.kpi;
    // La tarjeta refleja el filtro vigente (antes la marca se perdia al
    // reconstruir las tarjetas). "Total" no es un filtro, nunca queda activa.
    card.classList.toggle('active', kpi !== 'todos' && FILTER_STATE[kpi] === card.dataset.kpiVal);
    card.addEventListener('click', event => {
      if(event.target.closest('.info-tip')) return;
      const kpiVal = card.dataset.kpiVal;
      const isActive = card.classList.contains('active');

      // Quitar active de todos
      document.querySelectorAll('#kpi-section .kpi-card[data-kpi]').forEach(c => c.classList.remove('active'));

      if(!isActive) {
        card.classList.add('active');
        if(kpi === 'todos') {
          FILTER_STATE = defaultFilterState(BASE_BAJAS_DATA, BAJAS_COLS);
        } else {
          FILTER_STATE = { ...defaultFilterState(BASE_BAJAS_DATA, BAJAS_COLS), [kpi]: kpiVal };
        }
      } else {
        FILTER_STATE = defaultFilterState(BASE_BAJAS_DATA, BAJAS_COLS);
      }
      updateTiendaLabel();
      renderTiendaOptions(BASE_BAJAS_DATA, BAJAS_COLS);
      renderBajasDashboard(applyUserFilters(BASE_BAJAS_DATA, BAJAS_COLS), BAJAS_COLS);
    });
  });

  renderCompromiso(data, cols);

  const puestoData = topEntries(byPuesto,5);
  renderChart('chart-puesto','bar',puestoData.map(x=>x.label),puestoData.map(x=>x.total),{horizontal:true,color:'#ff7924',tickSize:10});
  renderTotalChart(['Bajas temprana','Total de bajas'], [bajaTemprana,total]);

  const tempOrder = ['0 - 45 días','46 - 90 días','3 - 6 meses','6 - 12 meses','> 1 año'];
  const tempLabels = tempOrder.filter(t=>byTemp[t]!==undefined).concat(Object.keys(byTemp).filter(t=>!tempOrder.includes(t)));
  renderChart('chart-temporalidad','bar',tempLabels,tempLabels.map(t=>byTemp[t]),{color:'#ff7924',tickSize:10,rotate:0});

  const motivoData = topEntries(byMotivo,8);
  renderChart('chart-motivos','bar',motivoData.map(x=>OXXO.truncate(x.label,24)),motivoData.map(x=>x.total),{color:'#ff7924',tickSize:10,rotate:45});

  const maxTienda = Math.max(...topTienda.map(x=>x.total), 1);
  renderChart('chart-tiendas','bar',topTienda.map(x=>OXXO.truncate(x.label,30)),topTienda.map(x=>x.total),{horizontal:true,ranking:true,tickSize:12,label:'Bajas por tienda',suggestedMax:maxTienda + 1,barPercentage:.52,categoryPercentage:.86});

  renderDetail(data, cols);
  renderPlazas(BASE_BAJAS_DATA, cols);
  renderHeatmapBajas(data, cols);
  document.getElementById('row-count').textContent = `${data.length} bajas`;
  OXXO.updateFooterTime('load-time');
  syncD2UI();
}

function renderPlazas(allData, cols) {
  // Leer columnas "Plazas" y "Bajas Plaza" que vienen junto a los datos
  // Estas columnas tienen los datos en las primeras filas (ej: fila 0=Oaxaca/35, fila 1=Chontalpa/21...)
  let plazasData = [];

  // El titulo del panel es "del mes actual": se restringe al mes mas reciente presente en los
  // datos, aunque allData (BASE_BAJAS_DATA) trae el historico completo sin filtro de mes.
  const mesActual = latestMonthKey(allData, cols);
  const data = mesActual ? allData.filter(r => monthKeyFromRow(r, cols) === mesActual) : allData;

  const keyPlaza = cols.colPlazas;
  const keyBajas = cols.colBajas;

  if(keyPlaza && keyBajas) {
    // Leer todas las filas que tengan plaza y bajas
    data.forEach(r => {
      const plaza = String(r[keyPlaza]||'').trim();
      const bajas = Number(String(r[keyBajas]||'').replace(/[^0-9.-]/g,''));
      if(plaza && !isNaN(bajas) && bajas > 0) {
        // Evitar duplicados
        if(!plazasData.find(p => p.plaza === plaza)) {
          plazasData.push({ plaza, bajas });
        }
      }
    });
    plazasData.sort((a,b) => b.bajas - a.bajas);
  }

  // Fallback: contar por columna Plaza. Se normalizan los alias territoriales
  // (p. ej. "OXXO OAXACA"/"Oaxaca" o "Plaza Tuxtla"/"Tuxtla") para que
  // nunca aparezcan duplicados en el comparativo regional.
  if(!plazasData.length && cols.plaza) {
    const byPlaza = countBy(data, r => canonicalPlazaName(val(r, cols, 'plaza', 'Sin plaza')));
    plazasData = Object.entries(byPlaza)
      .map(([plaza, bajas]) => ({ plaza, bajas }))
      .sort((a,b) => b.bajas - a.bajas)
      .slice(0, 8);
  }

  // Agregar otras plazas cargadas desde Dashboard_2_Otras_Plazas. Se usa findRealKey (match
  // flexible) en vez de acceso directo por nombre exacto: si el encabezado llega con texto
  // pegado (bug de exportacion de Google que a veces mezcla la fila "sacrificio" con el
  // encabezado real), el nombre exacto 'Plazas' ya no existe tal cual.
  if(OTRAS_PLAZAS_DATA.length) {
    const keyPlazaOtras = findRealKey(OTRAS_PLAZAS_DATA[0], ['Plazas','PLAZAS']);
    const keyBajasOtras = findRealKey(OTRAS_PLAZAS_DATA[0], ['Bajas Plaza','Bajas_Plaza']);
    OTRAS_PLAZAS_DATA.forEach(r => {
      const plaza = canonicalPlazaName((keyPlazaOtras ? r[keyPlazaOtras] : '') || '');
      const bajas = Number(String((keyBajasOtras ? r[keyBajasOtras] : '') || '').replace(/[^0-9.-]/g, ''));
      if(plaza && !isNaN(bajas) && bajas > 0 && !plazasData.find(p => cleanText(p.plaza) === cleanText(plaza))) {
        plazasData.push({ plaza, bajas });
      }
    });
    plazasData.sort((a, b) => b.bajas - a.bajas);
  }

  // En alcance de plaza, ambos componentes deben hablar únicamente de la
  // plaza seleccionada. El comparativo completo se ve solo si el usuario
  // activa el boton "Ver todas las plazas" (PLAZAS_SHOW_ALL) -- el switch
  // global de Alcance ya no ofrece un nivel de "region", asi que este
  // toggle local es la unica forma de ver el comparativo completo.
  const activeScope=OXXO.getActiveDataScope();
  if(!PLAZAS_SHOW_ALL){
    plazasData=plazasData.filter(item=>OXXO.matchesScopeValue(item.plaza,'plaza',activeScope));
  }

  // El comparativo regional necesita más altura; una plaza individual se
  // presenta automáticamente en una versión compacta.
  const plazasPanel=document.querySelector('.d2-plazas');
  if(plazasPanel){
    plazasPanel.classList.toggle('is-single-plaza', !PLAZAS_SHOW_ALL);
  }
  const plazasToggleBtn=document.getElementById('plazas-scope-toggle');
  if(plazasToggleBtn){
    plazasToggleBtn.textContent=PLAZAS_SHOW_ALL ? `Ver solo · ${String(activeScope.plaza||'Oaxaca').replace(/^Plaza\s+/i,'')}` : 'Ver todas las plazas';
    plazasToggleBtn.classList.toggle('is-active',PLAZAS_SHOW_ALL);
  }

  if(!plazasData.length) {
    document.getElementById('tabla-plazas').innerHTML = '<div class="d2-empty">No se encontraron columnas de plazas en los datos.</div>';
    return;
  }

  // Renderizar tabla
  const maxBajas = Math.max(...plazasData.map(p => p.bajas), 1);
  const totalBajas = plazasData.reduce((s,p) => s + p.bajas, 0);

  const rows = plazasData.map((p, i) => {
    const pct = Math.round(p.bajas / totalBajas * 100);
    const barW = Math.round(p.bajas / maxBajas * 100);
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}`;
    const tone = i === 0 ? 'red' : i === 1 ? 'orange' : i === 2 ? 'gold' : 'neutral';
    return `<div class="plaza-rank-row ${tone}">
      <div class="plaza-rank-medal">${medal}</div>
      <div class="plaza-rank-main">
        <div class="plaza-rank-top">
          <strong>${p.plaza}</strong>
          <span>${pct}% del total</span>
        </div>
        <div class="plaza-rank-track"><div class="plaza-rank-fill" style="--w:${barW}%"></div></div>
      </div>
      <div class="plaza-rank-value">${p.bajas}</div>
    </div>`;
  }).join('');

  const otrasKeyPlaza = OTRAS_PLAZAS_DATA.length ? findRealKey(OTRAS_PLAZAS_DATA[0], ['Actualizado']) : null;
  const otrasActualizado = otrasKeyPlaza ? String(OTRAS_PLAZAS_DATA[0][otrasKeyPlaza]||'').trim() : '';
  document.getElementById('tabla-plazas').innerHTML = `
    <div class="plaza-rank-list">${rows}</div>
    <div class="plaza-rank-total">
      <span>Total acumulado</span>
      <strong>${totalBajas}</strong>
      <em>100%</em>
    </div>
    ${otrasActualizado ? `<div class="d2-note">Otras plazas actualizado: ${otrasActualizado}</div>` : ''}`;

  // Gráfica de plazas
  const canvas = document.getElementById('chart-plazas');
  if(canvas) {
    const theme = chartTheme();
    const tickColor = theme.text;
    const tickStrokeWidth = 0;
    if(!chartReady(canvas)) return;
    if(canvas._chartInstance) canvas._chartInstance.destroy();
    canvas._chartInstance = new Chart(canvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels: plazasData.map(p => p.plaza),
        datasets: [{
          label: 'Bajas', data: plazasData.map(p => p.bajas),
          backgroundColor: plazasData.map((p,i) => ['#D92B2B','#FF6B00','#FFD200','#00A650','#0066CC'][i] || '#8A8A99'),
          borderRadius: 999, borderSkipped: false,
          barPercentage: 0.54, categoryPercentage: 0.82, maxBarThickness: 28
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true, maintainAspectRatio: false,
        layout: { padding: { top: 6, right: 50, bottom: 4, left: 4 } },
        plugins: { legend: { display: false }, tooltip: { backgroundColor: theme.tooltipBg, padding: 10, cornerRadius: 8 }},
        scales: {
          x: { beginAtZero: true, grid: { color: theme.grid }, ticks: { precision: 0, font: { family: 'Barlow', size: 12, weight: '800' }, color: tickColor, textStrokeColor:'rgba(0,0,0,0.55)', textStrokeWidth: tickStrokeWidth }},
          y: { grid: { display: false }, ticks: { font: { family: 'Barlow', size: 13, weight: '900' }, color: tickColor, textStrokeColor:'rgba(0,0,0,0.55)', textStrokeWidth: tickStrokeWidth }}
        }
      }
    });
  }
}

// ─────────────────────────────────────────────────────────
// DENOMINACIONES (cambios de puesto: ascensos / descensos)
// La pestaña puede traer filas de otro origen pegadas por error (distinto
// número de columnas / esquema). Solo se procesan filas que calcen con el
// formato esperado de Denominaciones; el resto se descarta en silencio.
const ALIASES_DENOM = {
  asesor:    ['Asesor'],
  medida:    ['Denominación Medida','Denominacion Medida'],
  motivo:    ['Denominación Motivo','Denominacion Motivo'],
  empleado:  ['Nombre del empleado'],
  fecha:     ['F. Crea.','F.Crea','F. Crea'],
  mes:       ['Mes'],
  // La columna 'Denominación Posición Anterior/Actual' suele venir vacía; el dato real
  // del cambio de puesto está en 'Denominación Función Anterior/Actual' (Func.Ant/Func.Act).
  posAnt:    ['Denominación Función Anterior','Denominacion Funcion Anterior','Denominación Posición Anterior'],
  posAct:    ['Denominación Función Actual','Denominacion Funcion Actual','Denominación Posición Actual'],
  uOrgAct:   ['Denominación  U.Org.Act','Denominación U.Org.Act','Denominacion U.Org.Act','Denominación U.Org. Actual'],
};
function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function jerarquiaPuesto(desc){
  const d=String(desc||'').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
  if(d.includes('LIDER'))return 3;
  if(d.includes('ENCARGADO'))return 2;
  if(d.includes('AYUDANTE')||d.includes('AYUDANTA'))return 1;
  return 0;
}
// Una fila es válida si tiene Asesor, Nombre del empleado y la "Denominación Medida"
// es texto (no un nombre de región/plaza, que es lo que aparece en las filas mezcladas).
function denomRowValida(row, cols){
  const asesor = val(row, cols, 'asesor', '').trim();
  const empleado = val(row, cols, 'empleado', '').trim();
  const medida = val(row, cols, 'medida', '').trim();
  if(!asesor || !empleado || !medida) return false;
  // Las filas mezcladas traen nombres de región/plaza (p.ej. "BAJA") en motivo con
  // numero "36" o "1"/"29" en la columna Med., y el campo 'medida' termina siendo
  // un nombre propio en vez de un tipo de movimiento — se descartan si no contienen
  // ninguna palabra esperada de cambio de puesto.
  const m = medida.toUpperCase();
  return m.includes('CAMBIO') || m.includes('PUESTO') || m.includes('AYUDANTE') || m.includes('ENCARGADO') || m.includes('LIDER') || m.includes('PROMOCION') || m.includes('ASCENSO');
}
let BASE_DENOM_DATA = [];
let DENOM_SORT = 'fecha-desc';
let DENOM_VISIBLE = false;
function syncDenomToggle(rows = BASE_DENOM_DATA){
  const button = document.getElementById('btn-denominaciones');
  if(!button) return;
  const total = rows.length;
  button.hidden = !BASE_DENOM_DATA.length;
  button.textContent = DENOM_VISIBLE
    ? 'Ocultar cambios de puesto'
    : `Ver cambios de puesto${total ? ` (${total})` : ''}`;
  button.setAttribute('aria-expanded', String(DENOM_VISIBLE));
}
function toggleDenominaciones(){
  if(!BASE_DENOM_DATA.length) return;
  DENOM_VISIBLE = !DENOM_VISIBLE;
  const section = document.getElementById('denom-section');
  if(section) {
    section.hidden = !DENOM_VISIBLE;
    if(DENOM_VISIBLE) section.scrollIntoView({ behavior:'smooth', block:'start' });
  }
  syncDenomToggle(filterDenomByMes(BASE_DENOM_DATA));
}
async function loadDenominaciones(rawData){
  const section = document.getElementById('denom-section');
  try {
    const raw = rawData === undefined
      ? await OXXO.fetchSheetData(OXXO.SHEETS_CONFIG.TABS.d2denom)
      : rawData;
    if(!raw || !raw.length) return;
    const cols = buildColsGeneric(raw, ALIASES_DENOM);
    // Misma correccion que en initDashboard: no se descarta a nadie por su nombre.
    const rows = raw.filter(r => denomRowValida(r, cols)).map(r => {
      const posAntDesc = val(r, cols, 'posAnt','');
      const posActDesc = val(r, cols, 'posAct','');
      const jAnt = jerarquiaPuesto(posAntDesc), jAct = jerarquiaPuesto(posActDesc);
      let direccion = 'lateral';
      if(jAnt && jAct){ direccion = jAct>jAnt ? 'up' : jAct<jAnt ? 'down' : 'lateral'; }
      else if(/AUMENTO|INCREMENTO|PROMOCION|ASCENSO/i.test(val(r,cols,'motivo',''))) direccion='up';
      else if(/DISMINUCION|DEGRADACION|REDUCCION/i.test(val(r,cols,'motivo',''))) direccion='down';
      return {
        asesor: val(r,cols,'asesor','Sin asesor').trim(),
        medida: val(r,cols,'medida','').trim(),
        motivo: val(r,cols,'motivo','').trim(),
        empleado: val(r,cols,'empleado','').trim(),
        fecha: val(r,cols,'fecha','').trim(),
        posAnt: posAntDesc.trim(),
        posAct: posActDesc.trim(),
        tienda: val(r,cols,'uOrgAct','').trim(),
        direccion,
        mesKey: monthKeyFromRow(r, cols),
      };
    });
    if(!rows.length) return;
    BASE_DENOM_DATA = rows;
    renderDenominaciones(filterDenomByMes(rows));
  } catch(e){ /* sección opcional: si falla, se mantiene oculta sin afectar el resto */ }
}
function filterDenomByMes(rows){
  const mes = FILTER_STATE.mes || '';
  return mes ? rows.filter(r => r.mesKey === mes) : rows;
}
function denomDateRank(value){
  const raw = String(value || '').trim();
  const m = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (m) {
    const y = Number(m[3].length === 2 ? '20' + m[3] : m[3]);
    return new Date(y, Number(m[2]) - 1, Number(m[1])).getTime();
  }
  const t = Date.parse(raw);
  return Number.isNaN(t) ? 0 : t;
}
function sortDenominaciones(rows){
  const txt = key => (a,b)=>String(a[key] || '').localeCompare(String(b[key] || ''), 'es-MX', { sensitivity:'base' });
  const dateDesc = (a,b)=>denomDateRank(b.fecha) - denomDateRank(a.fecha);
  const rank = { up:1, down:2, lateral:3 };
  const list = rows.slice();
  if (DENOM_SORT === 'asesor-asc') return list.sort((a,b)=>txt('asesor')(a,b) || dateDesc(a,b));
  if (DENOM_SORT === 'empleado-asc') return list.sort((a,b)=>txt('empleado')(a,b) || dateDesc(a,b));
  if (DENOM_SORT === 'tienda-asc') return list.sort((a,b)=>txt('tienda')(a,b) || dateDesc(a,b));
  if (DENOM_SORT === 'movimiento-asc') return list.sort((a,b)=>(rank[a.direccion]||9)-(rank[b.direccion]||9) || dateDesc(a,b));
  if (DENOM_SORT === 'fecha-asc') return list.sort((a,b)=>denomDateRank(a.fecha)-denomDateRank(b.fecha));
  return list.sort(dateDesc);
}
function setDenomSort(value){ DENOM_SORT = value || 'fecha-desc'; renderDenominaciones(BASE_DENOM_DATA); }
function renderDenominaciones(rows){
  const subieron = rows.filter(r=>r.direccion==='up').length;
  const bajaron  = rows.filter(r=>r.direccion==='down').length;
  const laterales= rows.filter(r=>r.direccion==='lateral').length;
  const porAsesor = countBy(rows.filter(r=>!/sin asesor/i.test(r.asesor)), r=>r.asesor);
  const atTop = topEntries(porAsesor,1)[0];

  document.getElementById('denom-count').textContent = `${rows.length} movimiento${rows.length===1?'':'s'}`;
  syncDenomToggle(rows);
  document.getElementById('denom-kpis').innerHTML = `
    <div class="denom-kpi"><div class="denom-kpi__val">${rows.length}</div><div class="denom-kpi__lbl">Total movimientos</div></div>
    <div class="denom-kpi"><div class="denom-kpi__val is-up">${subieron}</div><div class="denom-kpi__lbl">▲ Ascensos</div></div>
    <div class="denom-kpi"><div class="denom-kpi__val is-down">${bajaron}</div><div class="denom-kpi__lbl">▼ Descensos</div></div>
    <div class="denom-kpi"><div class="denom-kpi__val is-lateral">${laterales}</div><div class="denom-kpi__lbl">↔ Laterales</div></div>
    <div class="denom-kpi"><div class="denom-kpi__val is-entity">${atTop?OXXO.truncate(atTop.label,20):'—'}</div><div class="denom-kpi__lbl">AT con más movimientos${atTop?` (${atTop.total})`:''}</div></div>`;

  const sorted = sortDenominaciones(rows);
  const trs = sorted.map(r=>{
    const pillClass = r.direccion==='up'?'up':r.direccion==='down'?'down':'lateral';
    const pillIcon = r.direccion==='up'?'▲':r.direccion==='down'?'▼':'↔';
    const pillTxt = r.direccion==='up'?'Ascenso':r.direccion==='down'?'Descenso':'Lateral';
    const movTxt = `${r.posAnt||'—'} → ${r.posAct||'—'}`;
    return `<tr>
      <td class="is-strong" title="${esc(r.asesor)}">${OXXO.truncate(r.asesor,22)}</td>
      <td title="${esc(r.empleado)}">${OXXO.truncate(r.empleado,24)}</td>
      <td class="text-center"><span class="denom-pill ${pillClass}">${pillIcon} ${pillTxt}</span></td>
      <td class="is-muted" title="${esc(movTxt)}">${OXXO.truncate(r.posAnt||'—',18)} → <strong>${OXXO.truncate(r.posAct||'—',18)}</strong></td>
      <td class="is-muted" title="${esc(r.tienda)}">${OXXO.truncate(r.tienda||'—',20)}</td>
      <td class="is-muted is-date">${r.fecha||'—'}</td>
    </tr>`;
  }).join('');

  document.getElementById('tabla-denominaciones').innerHTML = `
    <div class="denom-toolbar">
      <label for="denom-sort">Ordenar por</label>
      <select class="denom-sort" id="denom-sort">
        <option value="fecha-desc" ${DENOM_SORT==='fecha-desc'?'selected':''}>Fecha reciente primero</option>
        <option value="fecha-asc" ${DENOM_SORT==='fecha-asc'?'selected':''}>Fecha antigua primero</option>
        <option value="empleado-asc" ${DENOM_SORT==='empleado-asc'?'selected':''}>Empleado A-Z</option>
        <option value="asesor-asc" ${DENOM_SORT==='asesor-asc'?'selected':''}>Asesor A-Z</option>
        <option value="tienda-asc" ${DENOM_SORT==='tienda-asc'?'selected':''}>Tienda A-Z</option>
        <option value="movimiento-asc" ${DENOM_SORT==='movimiento-asc'?'selected':''}>Movimiento</option>
      </select>
    </div>
    <div class="tbl-wrap d2-scroll" data-scroll-label="Cambios de puesto"><table class="tbl">
      <colgroup>
        <col class="c-asesor"><col class="c-empleado"><col class="c-mov">
        <col class="c-puesto"><col class="c-tienda"><col class="c-fecha">
      </colgroup>
      <thead><tr>
        <th>Asesor</th><th>Empleado</th><th class="text-center">Movimiento</th><th>Puesto Ant. → Actual</th><th>Tienda</th><th class="text-center">Fecha</th>
      </tr></thead>
      <tbody>${trs || '<tr><td colspan="6" class="d2-empty">Sin denominaciones registradas.</td></tr>'}</tbody>
    </table></div><p class="d2-scroll-hint">Desliza para ver más →</p>`;
  updatePanelScopeLabels();
  refreshScrollRegions();
}
function buildColsGeneric(data, aliases){
  const sample = data.find(r => Object.values(r).some(v => String(v||'').trim() !== '')) || data[0] || {};
  const cols = {}; Object.entries(aliases).forEach(([k,v]) => cols[k] = findRealKey(sample, v));
  return cols;
}

async function initDashboard(){
  OXXO.renderDownloadButton('hero-download','d2','d2-link');
  // Estas cuatro fuentes no dependen entre si. La tabla opcional de
  // denominaciones tambien arranca ya, pero no bloquea el tablero principal.
  const rawDenominacionesPromise = OXXO.fetchSheetData(OXXO.SHEETS_CONFIG.TABS.d2denom);
  const [raw, asesorCatalog, rawOtras] = await Promise.all([
    OXXO.fetchSheetData(TAB),
    OXXO.loadAsesorCatalog(),
    OXXO.fetchSheetData(OXXO.SHEETS_CONFIG.TABS.d2otras,{scoped:false}),
    loadCompromisosBajas(),
  ]);
  if(raw === null){ ['kpi-section','tabla-detalle'].forEach(id=>OXXO.showError(id,'No se pudo conectar con Google Sheets.')); return; }
  if(!raw.length){ ['kpi-section','tabla-detalle'].forEach(id=>OXXO.showEmpty(id)); return; }
  const cols = buildCols(raw);
  // NO se descarta ninguna fila por el nombre de su asesor. Hasta aqui habia
  // un filter que borraba toda baja cuyo Asesor fuera Timoteo Antonio Perez:
  // 79 de 895 filas de Plaza Oaxaca (8.8% de la base; 7 solo en sep-26). Se
  // revisaron una por una y son bajas reales -- nombre, Nº de personal, tienda
  // y motivo distintos, sin duplicados -- asi que el tablero reportaba de
  // menos. Ademas contradecia al comentario de aqui abajo, que dice justo lo
  // contrario: que a ese asesor se le ATRIBUYEN las bajas sin asesor. Entro
  // sin comentario propio dentro de un commit de otro tema (112a9e2, sobre el
  // switch de Alcance), asi que fue un descuido, no una regla de negocio.
  const filasBajas = raw;
  // Corregir el asesor de cada baja contra el catalogo por Tienda (D2 no trae CR):
  // asi las bajas se agrupan bajo el asesor que realmente tiene esa tienda hoy,
  // igual que el resto de dashboards. resolveAsesorD1 aplica la regla completa:
  // "Sin Asesor Asignado" (de tienda real sin AT vigente, crudo o via catalogo)
  // se atribuye a Timoteo; Entrenamiento/Operaciones se queda con su propio
  // "Sin Asesor Asignado" en vez de fusionarse.
  filasBajas.forEach(row => {
    if(!cols.asesor) return;
    row[cols.asesor] = OXXO.resolveAsesorD1(asesorCatalog, {
      tienda: cols.tienda ? row[cols.tienda] : '',
      asesor: row[cols.asesor],
    });
  });
  const data = filterData(filasBajas, cols);
  if(!data.length){ ['kpi-section','tabla-detalle'].forEach(id=>OXXO.showEmpty(id)); return; }

  RAW_BAJAS_DATA = filasBajas;
  BASE_BAJAS_DATA = data;
  BAJAS_COLS = cols;
  if(rawOtras && rawOtras.length) OTRAS_PLAZAS_DATA = rawOtras;
  FILTER_STATE = defaultFilterState(BASE_BAJAS_DATA, BAJAS_COLS);
  OXXO.persistDashboardPeriod(FILTER_STATE.mes || '');
  SELECTED_ASESORES = defaultAsesorSelection(BASE_BAJAS_DATA, BAJAS_COLS);
  setFilterBar(BASE_BAJAS_DATA, BAJAS_COLS);
  renderBajasDashboard(applyUserFilters(BASE_BAJAS_DATA, BAJAS_COLS), BAJAS_COLS);
  void rawDenominacionesPromise.then(loadDenominaciones).catch(() => {});
  document.getElementById('plazas-scope-toggle')?.addEventListener('click', () => {
    PLAZAS_SHOW_ALL = !PLAZAS_SHOW_ALL;
    renderPlazas(BASE_BAJAS_DATA, BAJAS_COLS);
    updatePanelScopeLabels();
  });
}
window.addEventListener('oxxo-theme-change', () => {
  if (BASE_BAJAS_DATA.length && BAJAS_COLS) renderBajasDashboard(applyUserFilters(BASE_BAJAS_DATA, BAJAS_COLS), BAJAS_COLS);
});
document.addEventListener('DOMContentLoaded', initDashboard);

window.buildExcelSheets = async function(){
  // Ademas de Indicador/Valor, cada KPI lleva su detalle (asesor o tienda
  // completos, porcentaje): antes el nombre de la tienda ocupaba "Valor" y el
  // del asesor no se exportaba.
  const kpiCards = [...document.querySelectorAll('#kpi-section .kpi-card')];
  const kpiRows = OXXO.scrapeKpiCards('kpi-section').map((row, i) => {
    const sub = kpiCards[i]?.querySelector('.kpi-card__delta');
    return { ...row, Detalle: sub ? (sub.getAttribute('title') || sub.textContent.trim()) : '' };
  });
  return [
    { name: 'KPIs', rows: kpiRows },
    { name: 'Compromiso', rows: OXXO.scrapeHtmlTable('#tabla-compromiso table') },
    { name: 'Otras Plazas', rows: OXXO.scrapeHtmlTable('#tabla-plazas table') },
    { name: 'Detalle de Bajas', rows: OXXO.scrapeHtmlTable('#tbl-detalle-bajas') },
    { name: 'Denominaciones', rows: OXXO.scrapeHtmlTable('#tabla-denominaciones table') }
  ];
};

// ─────────────────────────────────────────────────────────
// PRESENTACION MOVIL / ACCESIBILIDAD (Dashboard 2)
// Solo mejora lo que ya existe: no duplica datos ni estado. Si este bloque
// no corriera, la pagina sigue mostrando todos los paneles y filtros.
// ─────────────────────────────────────────────────────────
let LAST_FILTERED_COUNT = 0;
const D2_MOBILE = window.matchMedia('(max-width: 767px)');
document.body.classList.add('d2-enhanced');

const D2_STORE_STATUS = { operativas: 'Operativas', preapertura: 'Sin apertura', todas: 'Todas' };
function d2ScopeName(){
  const scope = OXXO.getActiveDataScope();
  return scope.level === 'region' ? `Región ${scope.region}` : (scope.plaza || 'Plaza');
}
function d2StoreStatus(){ return D2_STORE_STATUS[OXXO.getActiveStoreStatus()] || 'Operativas'; }
function d2MonthShort(key){
  const m = String(key || '').match(/^(\d{4})-(\d{2})$/);
  if(!m) return 'Todos los meses';
  const abbr = MONTH_ABBR[+m[2] - 1];
  return `${abbr[0].toUpperCase()}${abbr.slice(1)} ${m[1]}`;
}
function d2MonthLong(key){ return key ? monthLabel(key) : 'Todos los meses'; }

// Filtros secundarios vigentes (todo lo que no es el mes). El cruce del mapa
// de calor cuenta como uno; con ignoreHeat se omite para el propio mapa, que
// no aplica su seleccion a su matriz.
const D2_FILTER_NAMES = { temporalidad: 'Temporalidad', rotTemp: 'Rot. Temp.', puesto: 'Puesto', tienda: 'Tienda', asesor: 'AT', motivo: 'Motivo' };
function d2FilterInfo({ ignoreHeat = false } = {}){
  const items = [];
  Object.entries(FILTER_STATE).forEach(([key, value]) => {
    if(!value || key === 'mes' || key === 'edadRange' || key === 'antiguedadRange') return;
    items.push(`${D2_FILTER_NAMES[key] || key}: ${key === 'rotTemp' && /^si$/i.test(value) ? 'Sí' : value}`);
  });
  if(!ignoreHeat && FILTER_STATE.edadRange && FILTER_STATE.antiguedadRange){
    items.push(`Mapa de calor: edad ${heatSpeak(FILTER_STATE.edadRange)}, antigüedad ${heatSpeak(FILTER_STATE.antiguedadRange)}`);
  }
  if(SELECTED_ASESORES && BASE_BAJAS_DATA.length){
    const all = asesorOptionsList(BASE_BAJAS_DATA, BAJAS_COLS).length;
    if(SELECTED_ASESORES.length !== all){
      items.push(SELECTED_ASESORES.length === 1 ? `Asesor: ${SELECTED_ASESORES[0]}` : `Asesores: ${SELECTED_ASESORES.length} de ${all}`);
    }
  }
  return { items, count: items.length };
}
const d2Plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function setPanelScope(kind, short, full){
  const key = `${short}|${full}`;
  document.querySelectorAll(`[data-d2-scope="${kind}"]`).forEach(el => {
    if(el.dataset.d2Key === key) return;
    el.dataset.d2Key = key;
    el.title = full;
    el.innerHTML = `<span aria-hidden="true">${escHtml(short)}</span><span class="d2-sr">${escHtml(full)}</span>`;
  });
}
// Rotula cada panel con el alcance que de verdad usa. Solo lee el estado
// vigente (alcance, mes, filtros); nunca recalcula datos.
function updatePanelScopeLabels(){
  if(!BASE_BAJAS_DATA.length) return;   // sin datos cargados no hay alcance que rotular
  const scope = d2ScopeName();
  const mes = FILTER_STATE.mes || '';
  const status = `Tiendas: ${d2StoreStatus()}`;
  const filters = d2FilterInfo();
  const noHeat = d2FilterInfo({ ignoreHeat: true });
  const filtersShort = n => n ? d2Plural(n, 'filtro', 'filtros') : 'Sin filtros';
  const filtersFull = info => info.count ? `Filtros: ${info.items.join('; ')}` : 'Sin filtros secundarios';
  const common = `${scope} · ${d2MonthShort(mes)}`;
  const commonFull = `${scope}. ${status}. Mes: ${d2MonthLong(mes)}.`;
  ['compromiso', 'asesores', 'detalle'].forEach(kind => setPanelScope(kind, `${common} · ${filtersShort(filters.count)}`, `${commonFull} ${filtersFull(filters)}.`));
  setPanelScope('tiendas', `${common} · ${filtersShort(filters.count)}`, `${commonFull} ${filtersFull(filters)}. Excluye tiendas de Entrenamiento y Operaciones.`);
  setPanelScope('heatmap', `${common} · ${filtersShort(noHeat.count)}`, `${commonFull} ${filtersFull(noHeat)}. La selección del propio mapa no reduce su matriz.`);
  const mesActual = BASE_BAJAS_DATA.length ? latestMonthKey(BASE_BAJAS_DATA, BAJAS_COLS) : '';
  setPanelScope('plazas',
    `Mes actual · ${PLAZAS_SHOW_ALL ? 'Todas las plazas' : 'Plaza activa'} · Sin filtros secundarios`,
    `${d2MonthLong(mesActual)} (mes más reciente). ${PLAZAS_SHOW_ALL ? 'Todas las plazas.' : `Solo ${scope}.`} No usa los filtros de mes, Temporalidad, Rot. Temp., Puesto, Tienda ni Asesor.`);
  setPanelScope('denom', `${scope} · ${d2MonthShort(mes)} · Solo filtra por mes`,
    `${scope}. Mes: ${d2MonthLong(mes)}. Este panel solo usa el filtro de mes; el resto de filtros no lo afecta.`);
  updateActiveContext(filters);
}
function updateActiveContext(filters = d2FilterInfo()){
  const mes = FILTER_STATE.mes || '';
  const line = document.getElementById('d2-active-context');
  if(line){
    const text = BASE_BAJAS_DATA.length
      ? `${d2MonthLong(mes)} · ${d2Plural(LAST_FILTERED_COUNT, 'baja', 'bajas')} · ${filters.count ? filters.items.join(' · ') : 'Sin filtros adicionales'}`
      : '';
    if(line.textContent !== text) line.textContent = text;
  }
  const summary = document.getElementById('d2-filter-summary');
  if(summary && BASE_BAJAS_DATA.length){
    const text = `${d2MonthShort(mes)} · ${filters.count ? d2Plural(filters.count, 'activo', 'activos') : 'Sin filtros extra'}`;
    if(summary.textContent !== text) summary.textContent = text;
  }
}
// Marca de frescura del encabezado: reutiliza la hora que ya escribe el pie.
function syncHeroFreshness(){
  const hero = document.getElementById('d2-hero-load');
  const foot = document.getElementById('load-time');
  if(hero && foot && hero.textContent !== foot.textContent) hero.textContent = foot.textContent;
}
// Una tabla ancha se desplaza dentro de su contenedor (nunca el documento) y
// solo entonces es enfocable, con nombre y aviso "Desliza para ver más".
function refreshScrollRegions(){
  const regions = [...document.querySelectorAll('.d2-scroll')];
  const overflow = regions.map(el => el.scrollWidth > el.clientWidth + 1);
  regions.forEach((el, i) => {
    el.classList.toggle('has-overflow', overflow[i]);
    if(overflow[i]){
      el.tabIndex = 0;
      el.setAttribute('role', 'region');
      el.setAttribute('aria-label', `${el.dataset.scrollLabel || 'Tabla'}, desplazable horizontalmente`);
    } else {
      el.removeAttribute('tabindex');
      el.removeAttribute('role');
      el.removeAttribute('aria-label');
    }
  });
}
function syncD2UI(){
  updatePanelScopeLabels();
  syncHeroFreshness();
  refreshScrollRegions();
}

// ── Alcance: se conserva el selector de core.js y se le agrega un resumen
// plegable en celular. Los listeners de core (cambio de plaza/estado,
// persistencia, recarga) no se tocan.
function enhanceD2ScopeSelector(){
  const mount = document.getElementById('d2-scope');
  const host = mount?.querySelector('[data-oxxo-scope-selector]');
  if(!mount || !host || mount.querySelector('.d2-scope-toggle')) return;
  host.id = host.id || 'd2-scope-panel';
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'd2-scope-toggle';
  toggle.id = 'd2-scope-toggle';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', host.id);
  toggle.innerHTML = `<svg class="d2-scope-toggle__pin" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 10c0 5.4-8 11-8 11S4 15.4 4 10a8 8 0 1 1 16 0Z"></path><circle cx="12" cy="10" r="2.5"></circle></svg><span class="d2-scope-toggle__text"><span class="d2-scope-toggle__label">Alcance</span><span class="d2-scope-toggle__value">${escHtml(d2ScopeName())} · ${escHtml(d2StoreStatus())}</span></span><svg class="d2-chevron" viewBox="0 0 24 24" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
  mount.insertBefore(toggle, host);
  toggle.addEventListener('click', () => {
    const open = !mount.classList.contains('is-open');
    mount.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
  });
}

// ── Filtros secundarios: en celular quedan plegados detras de un boton real
// (aria-expanded/aria-controls); colapsado, el contenido no recibe foco.
function initFilterDisclosure(){
  const toggle = document.getElementById('d2-filter-toggle');
  const bar = document.getElementById('filter-bar');
  if(!toggle || !bar) return;
  const setOpen = open => {
    bar.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
  };
  toggle.addEventListener('click', () => setOpen(bar.hidden));
  setOpen(!D2_MOBILE.matches);
  D2_MOBILE.addEventListener('change', event => setOpen(!event.matches));
}

// ── Pestañas para vistas hermanas en celular. Ambos paneles son visibles sin
// JS y a partir de 768px; solo en celular se oculta el inactivo. Ocultar no
// vuelve a dibujar nada: se llama a resize() del grafico ya creado.
function resizeChartsIn(panel){
  panel.querySelectorAll('canvas').forEach(canvas => canvas._chartInstance?.resize());
}
function initResponsiveTabs({ key, label, before, tabs }){
  const anchor = document.querySelector(before);
  const panels = tabs.map(tab => document.querySelector(tab.panel));
  if(!anchor || panels.some(panel => !panel)) return;
  const list = document.createElement('div');
  list.className = 'd2-tabs';
  list.setAttribute('role', 'tablist');
  list.setAttribute('aria-label', label);
  const buttons = tabs.map((tab, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'd2-tab';
    button.id = `d2-tab-${key}-${index}`;
    button.setAttribute('role', 'tab');
    button.textContent = tab.label;
    button.dataset.index = String(index);
    list.appendChild(button);
    panels[index].id = panels[index].id || `d2-tabpanel-${key}-${index}`;
    button.setAttribute('aria-controls', panels[index].id);
    return button;
  });
  anchor.parentNode.insertBefore(list, anchor);
  let selected = 0;
  const apply = () => {
    const mobile = D2_MOBILE.matches;
    list.hidden = !mobile;
    buttons.forEach((button, index) => {
      const on = index === selected;
      button.setAttribute('aria-selected', String(on));
      button.tabIndex = on ? 0 : -1;
      const panel = panels[index];
      if(mobile){
        panel.setAttribute('role', 'tabpanel');
        panel.setAttribute('aria-labelledby', button.id);
        panel.hidden = !on;
      } else {
        panel.removeAttribute('role');
        panel.removeAttribute('aria-labelledby');
        panel.hidden = false;
      }
    });
  };
  const select = (index, focus) => {
    selected = index;
    apply();
    if(focus) buttons[index].focus();
    resizeChartsIn(panels[index]);
    refreshScrollRegions();
  };
  list.addEventListener('click', event => {
    const button = event.target.closest('.d2-tab');
    if(button) select(Number(button.dataset.index), false);
  });
  list.addEventListener('keydown', event => {
    const last = buttons.length - 1;
    const map = { ArrowRight: selected === last ? 0 : selected + 1, ArrowLeft: selected === 0 ? last : selected - 1, Home: 0, End: last };
    if(!(event.key in map)) return;
    event.preventDefault();
    select(map[event.key], true);
  });
  apply();
  D2_MOBILE.addEventListener('change', () => { apply(); refreshScrollRegions(); });
}

// ── Exportar: se mueven (no se clonan) los botones Excel/PNG que crea core.js
// a un menu con objetivo tactil; en escritorio quedan en linea.
function initExportMenu(retry = true){
  const excel = document.querySelector('.excel-export-trigger');
  const png = document.querySelector('.png-export-trigger');
  const meta = document.querySelector('.topbar__meta');
  if(!meta || document.getElementById('d2-export')) return;
  if(!excel && !png){
    if(retry) setTimeout(() => initExportMenu(false), 0);
    return;
  }
  const wrap = document.createElement('div');
  wrap.className = 'd2-export';
  wrap.id = 'd2-export';
  wrap.innerHTML = '<button type="button" class="topbar__back d2-export__toggle" aria-expanded="false" aria-controls="d2-export-menu">Exportar</button><div class="d2-export__menu" id="d2-export-menu" role="group" aria-label="Exportar dashboard"></div>';
  const menu = wrap.querySelector('.d2-export__menu');
  const toggle = wrap.querySelector('.d2-export__toggle');
  [excel, png].filter(Boolean).forEach(button => menu.appendChild(button));
  meta.appendChild(wrap);
  const setOpen = open => {
    wrap.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
  };
  toggle.addEventListener('click', () => setOpen(!wrap.classList.contains('is-open')));
  document.addEventListener('click', event => { if(!wrap.contains(event.target)) setOpen(false); });
  wrap.addEventListener('keydown', event => {
    if(event.key === 'Escape' && wrap.classList.contains('is-open')){ setOpen(false); toggle.focus(); }
  });
  // Elegir una opcion cierra el menu; la accion de core.js sigue igual.
  menu.addEventListener('click', () => setOpen(false));
}

function initD2Presentation(){
  enhanceD2ScopeSelector();
  initFilterDisclosure();
  initResponsiveTabs({ key: 'analysis', label: 'Vista del análisis por asesor', before: '#d2-analysis-panels', tabs: [
    { label: 'Compromiso', panel: '#d2-panel-compromiso' },
    { label: 'Bajas por AT', panel: '#d2-panel-asesores' },
  ] });
  initResponsiveTabs({ key: 'plazas', label: 'Vista del comparativo de plazas', before: '#d2-plazas-panels', tabs: [
    { label: 'Ranking', panel: '#d2-plazas-ranking' },
    { label: 'Gráfica', panel: '#d2-plazas-chart' },
  ] });
  initExportMenu();
  document.getElementById('btn-denominaciones')?.addEventListener('click', toggleDenominaciones);
  document.getElementById('btn-motivos-pastel')?.addEventListener('click', openMotivosModal);
  document.getElementById('tabla-denominaciones')?.addEventListener('change', event => {
    if(event.target.id !== 'denom-sort') return;
    setDenomSort(event.target.value);
    document.getElementById('denom-sort')?.focus();
  });
  let timer = 0;
  window.addEventListener('resize', () => { clearTimeout(timer); timer = setTimeout(refreshScrollRegions, 150); });
  syncD2UI();
}
document.addEventListener('DOMContentLoaded', initD2Presentation);
