/* ==========================================================
   OXXO ADMIN - DEFINICIONES DE DASHBOARDS
   Configura hojas destino, columnas, reglas y notas de carga.
   La logica de normalizacion se queda privada en admin.js.
   ========================================================== */

window.OXXO_ADMIN_DASHBOARDS = function createAdminDashboards(deps){
  const {
    OXXO,
    state,
    parseDate,
    isoDate,
    containsOaxaca,
    isVacancyRow,
    deriveD1,
    deriveD2,
    deriveD2Denom,
    deriveD3,
    deriveD5,
    deriveD6,
    deriveD7,
    deriveCatalog,
    deriveInventories
  } = deps;

  // d2otras: mismas 4 plazas que ya se capturaban a mano en el formulario
  // manual (Chontalpa, Villahermosa, Costa Istmo, Tuxtla) para el ranking
  // comparativo del Dashboard 2. Ahora se cuentan solas desde la hoja "Bajas"
  // del Excel ABC (una fila por baja, columna Plaza), agrupando y sumando 1
  // por fila -- ya no hace falta escribirlas a mano cada vez.
  function normPlazaNombre(v){return String(v||'').normalize('NFD').replace(/[̀-ͯ]/g,'').trim().toUpperCase();}
  function isOaxacaName(v){return ['OAXACA','PLAZA OAXACA','OXXO OAXACA','10VHT OAXACA'].includes(normPlazaNombre(v));}
  const PEER_PLAZAS_D2OTRAS=['Chontalpa','Villahermosa','Costa Istmo','Tuxtla'];
  const PEER_SET_D2OTRAS=new Set(PEER_PLAZAS_D2OTRAS.map(normPlazaNombre));
  function todayIsoAdmin(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
  // d3plazas: mismas 4 plazas que ya se capturaban a mano (Tuxtla, Istmo,
  // Villahermosa, Chontalpa) para el ranking comparativo del Dashboard 3.
  // El Excel de Aprovechamiento (ZCS) ya trae una hoja "PLAZAS" con el
  // aprovechamiento pre-calculado por plaza (fraccion 0-1): solo hay que
  // leerla, filtrar las 4 conocidas y pasar a porcentaje.
  const PEER_PLAZAS_D3=['Tuxtla','Costa Istmo','Villahermosa','Chontalpa'];
  const PEER_RENAME_D3={'COSTA ISTMO':'ISTMO'}; // nombre publicado historicamente
  // El filter corre DESPUES del derive (ver rowsFromMatrix en normalizers.js),
  // por lo que ya recibe el PLAZAS renombrado (p.ej. "ISTMO", no "COSTA ISTMO").
  // El set tiene que construirse con el nombre ya renombrado o la fila se pierde.
  const PEER_SET_D3=new Set(PEER_PLAZAS_D3.map(p=>normPlazaNombre(PEER_RENAME_D3[normPlazaNombre(p)]||p)));
  // Si la celda en Excel tiene formato de porcentaje, XLSX.js (raw:false) la
  // entrega como texto "72.40%" en vez de 0.724 -- Number() de eso da NaN y
  // por eso se estaba publicando 0 en todas las plazas. Se limpia el simbolo
  // antes de convertir, igual que ya hace toNumber()/pctValue() en
  // normalizers.js para el resto de columnas numericas del panel.
  function toNumberD3(value){const n=Number(String(value??'').replace(/[$,%]/g,'').trim());return Number.isFinite(n)?n:NaN;}
  // El Excel de origen no siempre trae la misma escala/formato mes a mes:
  // - Fraccion sin formato (0.9086) -> falta multiplicar por 100.
  // - Ya en porcentaje (90.86, o texto "90.86%") -> se deja igual.
  // - Celda con formato de Porcentaje aplicado a un valor QUE YA ERA
  //   porcentaje (error comun de captura en Excel): el numero real en la
  //   celda es 94.29 pero Excel lo muestra/exporta como "9429.00%" (lo
  //   multiplica de mas). Un aprovechamiento nunca pasa de 100%, asi que
  //   cualquier resultado por encima de eso se divide entre 100 una vez mas.
  function pctD3(raw){
    if(!Number.isFinite(raw))return 0;
    let valor=raw>0&&raw<=1?raw*100:raw;
    if(valor>100)valor=valor/100;
    return Math.round(valor*100)/100;
  }
  function deriveD3Plazas(row){
    const nombreCrudo=String(row.PLAZAS||'').trim();
    const nombre=PEER_RENAME_D3[normPlazaNombre(nombreCrudo)]||nombreCrudo;
    const valor=pctD3(toNumberD3(row['Aprovechamiento de estructura a hoy']));
    return {...row,PLAZAS:nombre,'Aprovechamiento de estructura a hoy':valor,Actualizado:todayIsoAdmin()};
  }
  function deriveD2Otras(row){
    // Fila ya agregada (formato viejo: Plazas + Bajas Plaza con numero) se
    // deja intacta. Fila cruda (una baja, columna Plaza) se marca para que
    // el filtro/aggregate sepan tratarla como "1 baja de esa plaza".
    const bajasNum=Number(row['Bajas Plaza']);
    const yaAgregada=Number.isFinite(bajasNum)&&bajasNum>0&&String(row['Bajas Plaza']||'').trim()!==''&&String(row.Plazas||'').trim()!=='';
    return yaAgregada?row:{...row,Plaza:String(row.Plaza||'').trim()};
  }
  function aggregateD2Otras(rows){
    const porPlaza=new Map();
    rows.forEach(row=>{
      const bajasNum=Number(row['Bajas Plaza']);
      const yaAgregada=Number.isFinite(bajasNum)&&bajasNum>0&&String(row['Bajas Plaza']||'').trim()!==''&&String(row.Plazas||'').trim()!=='';
      const nombre=yaAgregada?String(row.Plazas).trim():String(row.Plaza||'').trim();
      if(!nombre)return;
      const suma=yaAgregada?bajasNum:1;
      porPlaza.set(nombre,(porPlaza.get(nombre)||0)+suma);
    });
    const hoy=todayIsoAdmin();
    return [...porPlaza.entries()]
      .map(([Plazas,Bajas])=>({Plazas,'Bajas Plaza':Bajas,Actualizado:hoy}))
      .sort((a,b)=>b['Bajas Plaza']-a['Bajas Plaza']);
  }

  // deriveD9 (Faltantes y Sobrantes): la columna Fecha de este reporte llega
  // de SheetJS (raw:false) en formato M/D/AA (ej. "7/31/26" = 31 de julio),
  // al reves del D/M/A que asume parseDate() del resto de los dashboards --
  // confirmado con datos reales: valores como "7/31/26" tienen 31 en la
  // segunda posicion, imposible como mes. Usar el parser compartido
  // corrompia la fecha (ej. "7/31/26" quedaba como 2028-07-07 por overflow
  // de mes en new Date()). Se parsea aqui con su propio formato en vez de
  // tocar parseDate(), que si funciona bien para los demas 8 dashboards.
  function parseFechaD9(value){
    // getSheetMatrix() (normalizers.js) ahora entrega un Date real para
    // celdas de fecha genuinas -- sin ambiguedad de formato, se usa tal
    // cual. El regex M/D/AA de abajo se queda como respaldo para el caso
    // (cada vez menos comun) de que la celda llegue como texto suelto.
    if(value instanceof Date&&!isNaN(value))return value;
    const m=String(value||'').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if(!m)return null;
    let year=Number(m[3]);if(year<100)year+=2000;
    const d=new Date(year,Number(m[1])-1,Number(m[2]));
    return isNaN(d)?null:d;
  }
  function isoDateD9(d){return d?`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`:'';}
  function toNumberD9(value){const n=Number(String(value??'').replace(/[$,]/g,'').trim());return Number.isFinite(n)?n:0;}
  // Tipo (Faltante/Sobrante) se calcula por el signo de Importe, no por el
  // texto de Concepto: el reporte de origen trae decenas de variantes de
  // concepto con errores de captura/acentos inconsistentes (ej. "SOBRANTE EN
  // CONCILACION" vs "CONCILIACIÓN", "ACTA SOBRENTE"), pero el signo es
  // consistente en los 3 meses verificados -- positivo=Faltante (la tienda
  // debe dinero), negativo=Sobrante (credito a favor).
  // Semana viene vacia en ~30 filas por mes (traspasos de saldo entre meses,
  // ej. "SALDO DE JUNIO" cargado en la hoja de junio pero fechado en julio):
  // son movimientos reales, no basura. El Apps Script descarta en silencio
  // las filas con periodColumn vacio en modo replacePeriod (no puede
  // reconciliarlas en publicaciones futuras), asi que se rellenan aqui.
  // Se usa el MES DE LA HOJA (state.sheetName, ej. "06JUN"), no el de la
  // propia Fecha de la fila: probado con datos reales que usar la Fecha
  // etiquetaba estas filas de junio como "Jul 26 sem 0" (su Fecha real cae
  // en julio) -- ese bucket coincidia con filas reales del mes de julio, y
  // la siguiente publicacion (07JUL) las reemplazaba/perdia por compartir
  // el mismo periodo. Anclarlas al mes de la hoja les da un bucket que solo
  // esa hoja publica, evitando la colision entre meses.
  const MESES_D9=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const MES_ABBR_D9={ENE:0,FEB:1,MAR:2,ABR:3,MAY:4,JUN:5,JUL:6,AGO:7,SEP:8,OCT:9,NOV:10,DIC:11};
  function semanaFallbackD9(isoFecha){
    const anioFecha=String(isoFecha||'').match(/^(\d{4})-/);
    const anio=anioFecha?anioFecha[1].slice(2):'';
    const tab=String((state&&state.sheetName)||'').trim().toUpperCase().match(/^\d{1,2}([A-Z]{3})/);
    const mesIdx=tab&&MES_ABBR_D9[tab[1]]!==undefined?MES_ABBR_D9[tab[1]]:null;
    if(mesIdx!==null&&anio)return `${MESES_D9[mesIdx]} ${anio} sem 0`;
    const m=String(isoFecha||'').match(/^(\d{4})-(\d{2})-\d{2}$/);
    return m?`${MESES_D9[Number(m[2])-1]} ${m[1].slice(2)} sem 0`:'';
  }
  function deriveD9(row){
    const importe=toNumberD9(row.Importe);
    const fecha=isoDateD9(parseFechaD9(row.Fecha));
    const semana=String(row.Semana||'').trim()||semanaFallbackD9(fecha);
    return {...row,Fecha:fecha,CR:String(row.CR||'').trim().toUpperCase(),Importe:importe,Tipo:importe>=0?'Faltante':'Sobrante',Semana:semana};
  }

  // ── Dashboard 12: Enfoque del Lider ─────────────────────────────────────
  // Reporte mensual, una fila por tienda por mes. Se publica con
  // periodColumn 'Mes' (replacePeriod), asi que subir el reporte de un mes
  // reemplaza SOLO ese mes y conserva el historico -- es lo que alimenta las
  // graficas de 12 meses del dashboard.
  const ETAPAS_D12=['Líder D-CIEN','Enfoque Cliente','Enfoque Ingreso','Enfoque Equipo','Líder Nuevo'];
  const MESES_D12=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  // 'Mes' llega como fecha del primer dia del mes; XLSX con raw:false la
  // entrega como texto y el formato varia (serial, dd/mm/aaaa, "1 de agosto
  // de 2025"). Se normaliza a AAAA-MM, que es la clave de periodo.
  function mesKeyD12(value){
    // getSheetMatrix() (normalizers.js) ahora entrega un Date real para
    // celdas de fecha genuinas -- sin ambiguedad de formato, se usa tal
    // cual. El resto de esta funcion se queda como respaldo para el caso de
    // que la celda llegue como texto suelto (serial, dd/mm/aaaa, "1 de
    // agosto de 2025").
    if(value instanceof Date&&!isNaN(value)){
      return `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}`;
    }
    const texto=String(value??'').trim();
    if(!texto)return '';
    const yaIso=texto.match(/^(\d{4})[-/](\d{1,2})/);
    if(yaIso)return `${yaIso[1]}-${String(Number(yaIso[2])).padStart(2,'0')}`;
    const dmy=texto.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
    if(dmy){
      const anio=Number(dmy[3])<100?2000+Number(dmy[3]):Number(dmy[3]);
      const mes=Number(dmy[1])>12?Number(dmy[2]):Number(dmy[2])>12?Number(dmy[1]):Number(dmy[2]);
      return `${anio}-${String(mes).padStart(2,'0')}`;
    }
    const largo=texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').match(/([a-z]+)\s+de\s+(\d{4})/);
    if(largo){
      const idx=MESES_D12.indexOf(largo[1]);
      if(idx>=0)return `${largo[2]}-${String(idx+1).padStart(2,'0')}`;
    }
    const serial=Number(texto);
    if(Number.isFinite(serial)&&serial>20000&&serial<80000){
      const d=new Date(Date.UTC(1899,11,30)+serial*86400000);
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`;
    }
    return '';
  }
  // Los importes traen " - " (guion suelto) cuando la tienda no tuvo el dato;
  // Number(' - ') es NaN y publicarlo asi ensucia la hoja, se deja vacio.
  function numeroD12(value){
    const texto=String(value??'').replace(/[$,%\s]/g,'').trim();
    if(!texto||texto==='-')return '';
    const n=Number(texto);
    return Number.isFinite(n)?n:'';
  }
  // Los semaforos vienen con el nombre del pilar pegado ("INGRESO NO OK",
  // "EQUIPO OK", "CLIENTE NO OK"); se dejan solo en OK / NO OK.
  function estatusD12(value){
    const texto=String(value??'').trim().toUpperCase().replace(/^(INGRESO|EQUIPO|CLIENTE)\s+/,'').trim();
    if(texto==='OK')return 'OK';
    if(texto==='NO OK')return 'NO OK';
    return '';
  }
  function etapaD12(value){
    const texto=String(value??'').trim();
    const exacta=ETAPAS_D12.find(e=>e.toLowerCase()===texto.toLowerCase());
    return exacta||texto;
  }
  function deriveD12(row){
    const salida={...row};
    salida.Mes=mesKeyD12(row.Mes);
    salida['CR Tienda']=String(row['CR Tienda']||'').trim().toUpperCase();
    salida.Lider=String(row.Lider||'').trim();
    salida['No Empleado']=String(row['No Empleado']||'').trim().replace(/\.0$/,'');
    ['Meses Ops','Faltante Inventario','Faltante Inventario %','Faltante Efectivo','Plantilla Completa','MEP PP','Venta Lealtad','Evaluacion Operativa','A+ Consecutivos','C Consecutivas','% Var Ventas','Numero de Clientes','% Var Trafico','Ticket Promedio','Venta Neta']
      .forEach(col=>{salida[col]=numeroD12(row[col]);});
    ['Est Faltante Inv','Est Faltante Efectivo','Est Ingreso','Est Equipo Completo','Est MEP PP','Est Equipo','Est Venta Lealtad','Est Evaluacion Op','Est Cliente','Mes Completo']
      .forEach(col=>{salida[col]=estatusD12(row[col]);});
    ['Etapa Anterior','Etapa Final','Clas Final'].forEach(col=>{salida[col]=etapaD12(row[col]);});
    return salida;
  }

  // ── Dashboard 13: Control de Ausentismo ─────────────────────────────────
  // Sabana de incapacidades del IMSS: una fila por folio. El encabezado real
  // esta en la fila 2 del Excel (la 1 trae los titulos de grupo), findHeaderRow
  // lo ubica solo por las columnas obligatorias.
  const PUESTOS_D13={
    'ayudante de tienda':'Ayudante de tienda','ayudanrte de tienda':'Ayudante de tienda',
    'encargado turno':'Encargado de turno','encargado turni':'Encargado de turno','encargardo turno':'Encargado de turno',
    'lider de tienda':'Lider de tienda',
    'ayudante de tienda cubrecontingencias':'Ayudante cubrecontingencias','ayudante cubrecontingencias':'Ayudante cubrecontingencias'
  };
  function planoD13(value){return String(value??'').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,' ').trim();}
  // El Excel trae 11 variantes de puesto por espacios de mas y errores de
  // captura ("Encargado turni", "Ayudanrte de tienda") que en realidad son 4.
  function puestoD13(value){
    const clave=planoD13(value).toLowerCase();
    if(PUESTOS_D13[clave])return PUESTOS_D13[clave];
    const limpio=String(value??'').replace(/\s+/g,' ').trim();
    return limpio?limpio.charAt(0).toUpperCase()+limpio.slice(1).toLowerCase():'';
  }
  // Hay celdas de fecha con el cero de Excel (1899-12-30) y textos sueltos:
  // cualquier cosa fuera de 2015-2035 se descarta en vez de publicarse. Este
  // libro esta formateado M/D/YYYY (p. ej. 12/9/2025 = 9 de diciembre), por
  // eso no debe pasar por el parser general DD/MM usado por otras bases.
  function parseDateD13(value){
    if(value instanceof Date&&!isNaN(value))return value;
    const raw=String(value??'').trim();
    const match=raw.match(/^(\d{1,4})[.\/-](\d{1,2})[.\/-](\d{1,4})/);
    if(!match)return parseDate(value);
    let year,month,day;
    if(match[1].length===4){year=Number(match[1]);month=Number(match[2]);day=Number(match[3]);}
    else{month=Number(match[1]);day=Number(match[2]);year=Number(match[3]);}
    if(year<100)year+=2000;
    const date=new Date(year,month-1,day);
    return date.getFullYear()===year&&date.getMonth()===month-1&&date.getDate()===day?date:null;
  }
  function fechaD13(value){
    const iso=isoDate(parseDateD13(value));
    if(!iso)return '';
    const anio=Number(iso.slice(0,4));
    return anio>=2015&&anio<=2035?iso:'';
  }
  function numeroD13(value){
    const texto=String(value??'').replace(/[$,%\s]/g,'').trim();
    if(!texto||texto==='-')return '';
    const n=Number(texto);
    return Number.isFinite(n)?n:'';
  }
  function clasificacionCalculoD13(clasificacion,calificacionImss){
    const clas=planoD13(clasificacion).toUpperCase();
    const imss=planoD13(calificacionImss).toUpperCase();
    if(clas==='RT'&&imss==='NO DE TRABAJO')return 'EG';
    if(clas==='RTY'&&imss==='NO DE TRAYECTO')return 'EG';
    if(/ENF(ERMEDAD)?\s*PROF(ESIONAL)?/.test(clas)&&imss==='NO PROFESIONAL')return 'EG';
    if(clas==='MATERNIDAD')return 'MATERNIDAD';
    if(clas==='FATALIDAD')return 'FATALIDAD';
    if(/^(IPP|IPT)$/.test(clas))return clas;
    if(clas==='INVALIDEZ')return 'INVALIDEZ';
    if(/ENF(ERMEDAD)?\s*PROF(ESIONAL)?/.test(clas))return 'ENF PROF';
    return clas;
  }
  const MESES_COLS_D13=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  function deriveD13(row){
    const salida={...row};
    salida.Folio=String(row.Folio||'').replace(/\s+/g,' ').trim();
    salida['No Empleado']=String(row['No Empleado']||'').trim().replace(/\.0$/,'');
    salida.Nombre=String(row.Nombre||'').replace(/\s+/g,' ').trim();
    salida.Clasificacion=planoD13(row.Clasificacion).toUpperCase();
    salida.Tipo=String(row.Tipo||'').replace(/\s+/g,' ').trim();
    salida.Puesto=puestoD13(row.Puesto);
    salida.Tienda=String(row.Tienda||'').replace(/\s+/g,' ').trim().toUpperCase();
    salida.CR=String(row.CR||'').trim().toUpperCase();
    salida.Asesor=String(row.Asesor||'').replace(/\s+/g,' ').trim();
    // "Femenino" y "femenino" conviven en el origen
    const genero=String(row.Genero||'').trim();
    salida.Genero=genero?genero.charAt(0).toUpperCase()+genero.slice(1).toLowerCase():'';
    ['Fecha Captura','Fecha Inicio','Fecha Termino','Fecha Ingreso','Fecha Accidente']
      .forEach(col=>{salida[col]=fechaD13(row[col]);});
    ['Dias','Dias Acumulados','Antiguedad','Edad'].forEach(col=>{salida[col]=numeroD13(row[col]);});
    // La columna Edad casi siempre viene vacia, pero Sabana si incluye Fecha
    // de Nac. Se calcula durante la importacion sin publicar la fecha de
    // nacimiento en Sheets, usando Fecha de Captura como fecha de referencia.
    if(salida.Edad===''){
      const nacimiento=parseDateD13(row['Fecha Nacimiento']);
      const referencia=parseDateD13(row['Fecha Captura'])||new Date();
      if(nacimiento&&nacimiento<=referencia){
        let edad=referencia.getFullYear()-nacimiento.getFullYear();
        const antesCumple=referencia.getMonth()<nacimiento.getMonth()||(referencia.getMonth()===nacimiento.getMonth()&&referencia.getDate()<nacimiento.getDate());
        if(antesCumple)edad--;
        if(edad>=15&&edad<=100)salida.Edad=edad;
      }
    }
    salida['Mes Expedicion']=numeroD13(row['Mes Expedicion']);
    salida['Clasificacion Calculo']=clasificacionCalculoD13(salida.Clasificacion,row['Calificacion RT IMSS']);
    salida['Registro Tipo']='INCAPACIDAD';
    MESES_COLS_D13.forEach(m=>{salida['D '+m]=numeroD13(row['D '+m]);});
    return salida;
  }

  // Dashboard 11 · Reporte de marcajes. El libro trae una foto nacional en
  // "Ranking por Tienda" y la region TABASCO completa en el mismo archivo.
  // Esta fuente se publica siempre completa: no usa periodo ni conserva filas
  // de la carga anterior. Los porcentajes quedan como fraccion (0.80 = 80%)
  // para mantener el contrato historico de la hoja Dashboard_11_Semanal.
  function ratioD11(value){
    const raw=String(value??'').trim();
    if(!raw)return '';
    const n=Number(raw.replace(/[%\s]/g,'').replace(',','.'));
    if(!Number.isFinite(n))return '';
    return raw.includes('%')?n/100:n;
  }
  function semanaD11(){
    const source=`${state?.fileName||''} ${state?.sheetName||''}`;
    const match=source.match(/(?:sem(?:ana)?\s*)?(\d{1,2})/i);
    return match?`SEM ${Number(match[1])}`:'SEMANA ACTUAL';
  }
  function deriveD11(row){
    const entrada=ratioD11(row['% Cumpl Reg Entradas']);
    const salida=ratioD11(row['% Cumpl Reg Salidas']);
    const total=ratioD11(row['% Cumpl Reg Total']);
    const puntos=Number(total)*100;
    const estatus=!Number.isFinite(puntos)?'Sin dato':puntos>=90?'Sobresaliente':puntos>=75?'En seguimiento':puntos>=50?'Prioridad':'Critico';
    const fueraRango=[entrada,salida,total].some(v=>Number.isFinite(Number(v))&&Number(v)>1);
    return {
      ...row,
      Semana:semanaD11(),
      Region:String(row.Region||'').replace(/\s+/g,' ').trim(),
      Plaza:String(row.Plaza||'').replace(/\s+/g,' ').trim(),
      Asesor:String(row.Asesor||'').replace(/\s+/g,' ').trim(),
      Tienda:String(row.Tienda||'').replace(/\s+/g,' ').trim(),
      '% Cumpl Reg Entradas':entrada,
      '% Cumpl Reg Salidas':salida,
      '% Cumpl Reg Total':total,
      Estatus:estatus,
      'Alerta Calidad':fueraRango?'PORCENTAJE MAYOR A 100%':''
    };
  }

  const definitions = [
    {key:'d1',label:'Dashboard 1 - Vacantes diarias',tab:OXXO.SHEETS_CONFIG.TABS.d1,periodColumn:'Mes',preferredSheets:['Estructura','Dashboard_1_Diario'],output:['Plaza','Asesor','Unidad org','CR TIENDA','ID posiciones','Descripcion de Posicion','Status ocupacion','Empleados','Fecha','Dias Vacantes','Mes'],required:['Plaza','Asesor','Unidad org','ID posiciones','Descripcion de Posicion','Status ocupacion'],filter:r=>containsOaxaca(r.Plaza),derive:deriveD1,notes:'Estructura cruda. Mes se toma del nombre del archivo; Dias Vacantes se deriva del texto vacante si no viene en el archivo. Se publican TODAS las posiciones (no solo vacantes) para que TREO calcule SAP/Activos por tienda; Dashboard 1 filtra por su cuenta las que son vacante (Status/Empleados vacio).'},
    {key:'d2',label:'Dashboard 2 - Bajas diarias',tab:OXXO.SHEETS_CONFIG.TABS.d2,periodColumn:'Mes',preferredSheets:['Bajas'],output:['Plaza','Asesor','Nombre del empleado','No Personal','Fecha','Mes','Semana','Temporalidad','Rot_Temp','Puesto','Tienda','Motivo','Detalle','Edad','Genero'],required:['Plaza','Asesor','Nombre del empleado','Fecha','Semana','Temporalidad','Rot_Temp','Puesto','Tienda'],filter:r=>containsOaxaca(r.Plaza),derive:deriveD2,notes:'Base principal de bajas. Mes se toma del nombre del archivo si trae fecha; si no, se calcula con F. Validez/Fecha.'},
    {key:'d2otras',label:'Dashboard 2 - Bajas otras plazas',tab:OXXO.SHEETS_CONFIG.TABS.d2otras,periodColumn:'',preferredSheets:['Bajas'],sourceColumns:['Plazas','Bajas Plaza','Plaza'],output:['Plazas','Bajas Plaza','Actualizado'],required:['Plazas','Bajas Plaza'],
      filter:r=>{
        const bajasNum=Number(r['Bajas Plaza']);
        const yaAgregada=Number.isFinite(bajasNum)&&bajasNum>0&&String(r['Bajas Plaza']||'').trim()!==''&&String(r.Plazas||'').trim()!=='';
        if(yaAgregada)return true;
        const plaza=String(r.Plaza||'').trim();
        if(!plaza||isOaxacaName(plaza))return false;
        return PEER_SET_D2OTRAS.has(normPlazaNombre(plaza));
      },
      derive:deriveD2Otras,
      aggregate:aggregateD2Otras,
      notes:'Ranking comparativo de bajas por plaza (Chontalpa, Villahermosa, Costa Istmo, Tuxtla) para el Dashboard 2. Sube la hoja "Bajas" del Excel ABC completo (una fila por baja, columna Plaza): se agrupan y cuentan solas, Oaxaca se excluye porque ya la cubre el Dashboard 2 principal. Tambien acepta el formato viejo ya agregado (columnas Plazas + Bajas Plaza).'},
    {key:'d2denom',label:'Dashboard 2 - Movimientos ABC',tab:OXXO.SHEETS_CONFIG.TABS.d2denom,periodColumn:'',preferredSheets:['ABC'],output:['Plaza','Asesor','Mes','Denominacion Medida','Denominacion Motivo','Nombre del empleado','F.Crea','Denominacion Posicion Anterior','Denominacion Posicion Actual','Denominacion Funcion Anterior','Denominacion Funcion Actual','Denominacion U.Org. Actual'],required:['Plaza','Asesor','Denominacion Medida','Nombre del empleado','F.Crea','Denominacion Funcion Anterior','Denominacion Funcion Actual'],filter:r=>containsOaxaca(r.Plaza)&&/cambio\s+de\s+puesto/i.test(String(r['Denominacion Medida']||'')),derive:deriveD2Denom,notes:'Detalle ABC: solo CAMBIO DE PUESTO. Mes se toma del nombre del archivo si trae fecha; ascenso/descenso lo calcula el dashboard.'},
    {key:'d2plan',label:'Dashboard 2 - Plan de accion (Analisis de Bajas)',tab:OXXO.SHEETS_CONFIG.TABS.d2plan,periodColumn:'',preferredSheets:['Plan de Accion'],output:['Hallazgo','Accion','Responsable','Plazo','Indicador','Prioridad'],required:['Hallazgo','Accion'],filter:r=>Boolean(String(r.Hallazgo||'').trim()),derive:r=>r,notes:'Plan de accion mensual del Analisis de Bajas. Captura manual: Hallazgo, Accion, Responsable, Plazo, Indicador de exito, Prioridad.'},
    {key:'d3plazas',label:'Dashboard 3 - Aprovechamiento otras plazas',tab:OXXO.SHEETS_CONFIG.TABS.d3plazas,periodColumn:'',preferredSheets:['PLAZAS'],output:['PLAZAS','Aprovechamiento de estructura a hoy','Actualizado'],required:['PLAZAS','Aprovechamiento de estructura a hoy'],
      filter:r=>PEER_SET_D3.has(normPlazaNombre(r.PLAZAS)),
      derive:deriveD3Plazas,
      notes:'Ranking comparativo de aprovechamiento por plaza (Tuxtla, Istmo, Villahermosa, Chontalpa) para el Dashboard 3. Sube el Excel de Aprovechamiento (ZCS) completo: la hoja "PLAZAS" ya trae el aprovechamiento pre-calculado por plaza, solo se filtran las 4 conocidas y se pasa a porcentaje. Oaxaca se excluye porque ya la cubre el Dashboard 3 principal.'},
    {key:'d3',label:'Dashboard 3 - Estructura',tab:OXXO.SHEETS_CONFIG.TABS.d3,periodColumn:'',preferredSheets:['Medicion'],output:['Plaza','CR TIENDA','UO','Asesor','Tienda','Esquema','Estructura Diaria','AUSENTISMOS','Vacante','LIDER','ENCARGADO','AYUDANTE','Vacantes','Aprovechamiento Estructura','Aprovechamiento Binario','Estatus Con impacto Ausentismo','EC SIN AUSENTISMO','FECHA','Fecha maxima rescate EC','Fecha maxima rescate TC'],required:['Plaza','CR TIENDA','Asesor','Tienda','Estructura Diaria','Aprovechamiento Estructura','Estatus Con impacto Ausentismo','FECHA'],filter:r=>containsOaxaca(r.Plaza),derive:deriveD3,notes:'Regla D3: Aprovechamiento Estructura >= 92.5% cuenta como 100%, menor a 92.5% cuenta como 0%. La carga también conserva las fechas máximas de rescate EC y TC. Cada carga reemplaza toda la pestaña (es una foto diaria, no un histórico por periodo).'},
    {key:'s4',label:'Dashboard 4 - Tiempo extra',tab:OXXO.SHEETS_CONFIG.TABS.s4,periodColumn:'Semana',preferredSheets:['Base de datos TE'],output:['Zona','Region','Plaza','Asesor','Numero de personal','Nombre del empleado o candidato','Esquema','Textos homologados','Texto breve de unidad organizativa','Cr de Tienda','Cantidad','Importe','Ano','Mes','Semana'],required:['Plaza','Asesor','Nombre del empleado o candidato','Textos homologados','Texto breve de unidad organizativa','Cantidad','Importe','Semana'],filter:r=>containsOaxaca(r.Plaza),derive:r=>r,notes:'Base limpia de tiempo extra. Usar Cantidad como horas e Importe como gasto.'},
    {key:'s5',label:'Dashboard 5 - Vacaciones',tab:OXXO.SHEETS_CONFIG.TABS.s5,preferredSheets:['Vacaciones Op'],output:['Region','Plaza','Asesor','Tienda','Puesto','Posicion','Area','No. De Empleado','Nombre','Fecha_Inicio','Fecha_Fin','Periodo_Anterior','Periodo_Actual','Dias_Restantes','Bucket_Ant','Bucket_Act','Tipo de Conting.'],required:['Plaza','Asesor','Tienda','Puesto','No. De Empleado','Nombre','Dias_Restantes'],filter:r=>containsOaxaca(r.Plaza),derive:deriveD5,notes:'Vacaciones Op. El indicador principal es Total dias restantes.'},
    {key:'s6',label:'Dashboard 6 - Ausentismos',tab:OXXO.SHEETS_CONFIG.TABS.s6,periodColumn:'Semana',preferredSheets:['Absentismos'],output:['Zona','Region','Plaza','Asesor','N de personal','Nombre del empleado o candidato','Estatus','Esquema','Puesto','Cr de Tienda','Tienda','Tipo_Ausentismo','Denominacion','Inicio de validez','Fin de validez','Dias','Horas','Absentismos solo en la semana','Inicio de semana','Fin de semana','Ano','Mes','Semana'],required:['Plaza','Asesor','N de personal','Nombre del empleado o candidato','Tienda','Tipo_Ausentismo','Denominacion','Absentismos solo en la semana','Semana'],filter:r=>containsOaxaca(r.Plaza),derive:deriveD6,notes:'Absentismos. La metrica principal es Absentismos solo en la semana.'},
    {key:'s7',label:'Dashboard 7 - TREO',tab:OXXO.SHEETS_CONFIG.TABS.s7,preferredSheets:['Liberacion','LiberaciÃ³n'],output:['Plaza','CR Reg','CR','Tienda','ID Tienda','Asesor','Accionable sugerido TREO','Estructura Propuesta TREO P2 Jun - Ago','Estructura SAP','Empleados Activos','Vacantes','Dif SAP vs Est Optima Final','Movimiento Inicial','Turnos','Antiguedad'],required:['Plaza','CR','Tienda','Asesor','Estructura Propuesta TREO P2 Jun - Ago','Estructura SAP','Empleados Activos','Vacantes','Movimiento Inicial'],headerContains:{'Estructura Propuesta TREO P2 Jun - Ago':['Estructura Propuesta TREO']},filter:r=>containsOaxaca(r.Plaza),derive:deriveD7,notes:'TREO detecta automáticamente cualquier encabezado que contenga “Estructura Propuesta TREO”; el sufijo mensual puede cambiar. Usa el primer bloque operativo: TREO=L, SAP=M, Activos=N, Vacantes=O, Movimiento=Q.'},
    {key:'d8',label:'Dashboard 8 - Capacidades',tab:OXXO.SHEETS_CONFIG.TABS.d8,preferredSheets:['Sheet1','Capacidades'],output:['Zona','Region','Plaza','Asesor_Correcto','Esquema','Unidad org.','Cr de tienda','Puesto_Correcto','Nº personal','Empleados','Promedio de Código de Ética 2026','Promedio de Seguridad en la persona 2026','Promedio de Cobro dls Sedes Mundialistas 2026','Promedio de Capacidad Tablero Amazon Counter','Promedio de PLD2026Certificacion','Promedio de ModuloCercaSiempre2026','Promedio de Resultado Certificación Alimentos y Bebidas 2026','Pan Horneado'],required:['Plaza','Asesor_Correcto','Puesto_Correcto','Empleados'],filter:r=>containsOaxaca(r.Plaza),derive:r=>r,notes:'Tablero de Capacidades: foto diaria de certificaciones por empleado, sin columna de periodo. Cada carga reemplaza toda la pestana. Las columnas de certificacion vienen 1=completo, 0=pendiente, fraccion=parcial y vacio=no aplica a ese puesto/tienda.'},
    {key:'catalog',label:'Catalogo de asesores',tab:OXXO.SHEETS_CONFIG.CATALOG_SHEET,preferredSheets:['Catalogo_Asesores','Catalogo asesores','Hoja1','ASESORES ACTJUNJUL'],output:['ASESOR','TIENDA','CR TIENDA','Region','Plaza','Zona','ACTIVA'],required:['ASESOR','TIENDA','CR TIENDA'],filter:r=>Boolean(r.ASESOR&&(r.TIENDA||r['CR TIENDA'])),derive:deriveCatalog,notes:'Catalogo maestro por CR. Region y Plaza se completan automaticamente con el contexto activo (hoy Plaza Oaxaca); Zona es opcional y ACTIVA queda en SI si no viene en el archivo.'},
    {key:'s9',label:'Dashboard 9 - Faltantes y sobrantes',tab:OXXO.SHEETS_CONFIG.TABS.s9,periodColumn:'Semana',preferredSheets:[],output:['Region','Plaza','Fecha','CR','Tienda','Asesor','Importe','Tipo','Concepto','Semana'],required:['CR','Importe','Fecha','Semana'],filter:r=>Boolean(String(r.CR||'').trim())&&Number.isFinite(r.Importe),derive:deriveD9,notes:'Faltantes y sobrantes de caja por plaza. Cada mes viene en su propia hoja del Excel de origen; se reemplazan solamente las semanas y la plaza seleccionadas, conservando los demás periodos y plazas.'},
    {key:'d10',label:'Dashboard 10 - Personal FLEX',tab:OXXO.SHEETS_CONFIG.TABS.d10,preferredSheets:['Sheet 1','Hoja1'],output:['Tienda','Zona','Region','Plaza','Asesor','Fecha','COLABORADORESFLEX_NUM'],required:['Tienda','Asesor','Fecha'],filter:r=>containsOaxaca(r.Plaza),derive:r=>r,notes:'Numero de colaboradores FLEX por tienda (foto). Cada carga reemplaza toda la pestana. Fecha llega como texto en espanol (ej. "9 de agosto de 2026"), no requiere parseo.'},
    {key:'d11',label:'Dashboard 11 - Cumplimiento de Marcajes',tab:OXXO.SHEETS_CONFIG.TABS.d11,preferredSheets:['Ranking por Tienda'],sourceColumns:['Semana','Zona','Region','Plaza','Asesor','Tienda','% Cumpl Reg Entradas','% Cumpl Reg Salidas','% Cumpl Reg Total','Estatus','Alerta Calidad'],output:['Semana','Zona','Region','Plaza','Asesor','Tienda','% Cumpl Reg Entradas','% Cumpl Reg Salidas','% Cumpl Reg Total','Estatus','Alerta Calidad'],required:['Region','Plaza','Asesor','Tienda','% Cumpl Reg Total'],scopeColumns:[],filter:r=>normPlazaNombre(r.Region)==='TABASCO'&&Boolean(String(r.Tienda||'').trim()),derive:deriveD11,notes:'Foto semanal regional de marcajes. Lee exclusivamente Ranking por Tienda, filtra Region TABASCO y reemplaza toda la pestana en cada carga; no conserva historico. Semana se deriva del nombre del archivo. Los porcentajes se publican como fraccion y valores mayores a 100% quedan marcados como alerta de calidad.'},
    {key:'m12',label:'Dashboard 12 - Enfoque del Lider',tab:OXXO.SHEETS_CONFIG.TABS.m12,periodColumn:'Mes',preferredSheets:['Hoja1','Sheet1'],output:['Mes','Zona','Region','Plaza','CR Plaza','CR Tienda','Tienda','Asesor','Lider','No Empleado','Tipo Lider','Meses Ops','Faltante Inventario','Faltante Inventario %','Faltante Efectivo','Plantilla Completa','MEP PP','Venta Lealtad','Evaluacion Operativa','Est Faltante Inv','Est Faltante Efectivo','Est Ingreso','Est Equipo Completo','Est MEP PP','Est Equipo','Est Venta Lealtad','Est Evaluacion Op','Est Cliente','Etapa Anterior','Etapa Final','Clas Final','Mes Completo','A+ Consecutivos','C Consecutivas','% Var Ventas','Numero de Clientes','% Var Trafico','Ticket Promedio','Venta Neta'],required:['Mes','Plaza','CR Tienda','Tienda','Asesor','Clas Final'],filter:r=>containsOaxaca(r.Plaza)&&Boolean(String(r.Mes||'').trim())&&Boolean(String(r['CR Tienda']||'').trim()),derive:deriveD12,notes:'Reporte Enfoque del Lider (mensual, una fila por tienda por mes). Se publica por periodo sobre la columna Mes: subir el reporte de un mes reemplaza SOLO ese mes y conserva los anteriores, que es lo que alimenta las graficas de 12 meses. El Excel de origen trae \"MEP P.P.\" y \"EVALUACION OPERATIVA\" repetidas (valor numerico y despues su OK/NO OK): la segunda ocurrencia se resuelve por posicion, ver buildSourceMap en normalizers.js. La letra A+/A/B/C/N no se publica porque es un recodificado 1 a 1 de Clas Final; el dashboard la deriva.'},
    {key:'a13',label:'Dashboard 13 - Control de Ausentismo',tab:OXXO.SHEETS_CONFIG.TABS.a13,periodColumn:'',preferredSheets:['Sábana','Sabana'],supplementalSourceColumns:['Fecha Nacimiento'],output:['Registro Tipo','Fecha Captura','Folio','No Empleado','Nombre','Clasificacion','Clasificacion Calculo','Tipo','Fecha Inicio','Fecha Termino','Dias','Dias Acumulados','Mes Expedicion','Puesto','Tienda','CR','Asesor','Genero','Edad','Fecha Ingreso','Antiguedad','Documento Entregado','Mecanismo RT','Especificacion Mecanismo','Area Anatomica','Fecha Accidente','Turno Accidente','Lugar Accidente','Calificacion RT IMSS','Dictamen ST7','ST2','Acto o Condicion Insegura','Descripcion ST7','D Ene','D Feb','D Mar','D Abr','D May','D Jun','D Jul','D Ago','D Sep','D Oct','D Nov','D Dic','Plaza','Ano Reporte','Mes Numero','Mes','Head Count 2026','Head Count 2025','Casos RT 2025','DP RT 2025','Casos RTY 2025','DP RTY 2025','Casos EG 2025','DP EG 2025','IATP 2025','Tasa DP EG 2025','Costo Diario'],required:['Nombre','Clasificacion','Tienda','Asesor'],filter:r=>Boolean(String(r.Nombre||'').trim()),derive:deriveD13,enrich:'caratulaD13',notes:'Publica la Sabana de incapacidades y agrega 12 filas RESUMEN tomadas de Caratula. Los casos cuentan solo Tipo=Inicial; los dias usan la distribucion Ene-Dic; RT/RTY/Enfermedad Profesional rechazados por IMSS se reclasifican a EG. Head Count 2026 y comparativos 2025 salen de Caratula. Edad se calcula desde Fecha de Nac cuando viene vacia, sin publicar la fecha de nacimiento. Reporte RH, IMSS, Cronicos y Asesores no alimentan los indicadores principales.'},
    {key:'c14',label:'Dashboard 14 - Avance Comercial',tab:OXXO.SHEETS_CONFIG.TABS.c14,preferredSheets:['bd','Hoja1','Sheet1'],output:['Region','Plaza','Tienda','CR','Asesor','Spin','Premia','Cruzada Andatti','Venta Sugerida','Banner','Mep'],required:['Tienda','Asesor','Spin','Premia','Cruzada Andatti','Venta Sugerida','Banner'],filter:r=>Boolean(String(r.Tienda||'').trim()),derive:r=>r,notes:'Avance de indicadores comerciales por tienda y plaza, quincenal. La carga reemplaza solamente la plaza seleccionada y conserva las demás.'},
    {key:'inventories',label:'Administrativo - Inventarios',tab:OXXO.SHEETS_CONFIG.TABS.inventories,periodColumn:'Periodo',preferredSheets:['Resultado de Inventario'],output:['Periodo','#','CR','Tienda','Plaza','Asesor Comercial','Fecha de Inventario Anterior','Fecha de Inventario','# Días de Inventario','Resultado de Inventario','Resultado del Mes Actual','Diferencias','Ventas sin TAE del mes','% Merma / Vta sin TAE del Mes','Tipo Inventario','Resultado Inventarios Mayo','Resultado Inventarios Junio','Resultado Inventarios Julio','Resultado de Merma  (Final c/s proyectos)','Ventas Mayo','Ventas Junio','Ventas Julio','SUMA TOTAL VTA S/TAE','% Merma / Vta sin TAE (Final c/s proyectos)','Observaciones'],required:['CR','Tienda','Plaza','Asesor Comercial','Fecha de Inventario','Resultado de Inventario','Ventas sin TAE del mes'],filter:r=>containsOaxaca(r.Plaza),derive:deriveInventories,notes:'Resultados de Inventario Administrativo. Detecta la hoja "Resultado de Inventario", genera Periodo como AAAA-MM desde el mes y ano del archivo (o desde la fecha del inventario como respaldo) y reemplaza solo el mes cargado, conservando los demas periodos.'}
  ];
  return definitions.map((definition) => ({
    ...definition,
    scopeColumns: definition.scopeColumns || (definition.output.includes('Plaza') ? ['Plaza'] : [])
  }));
};
