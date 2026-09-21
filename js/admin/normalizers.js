/* ==========================================================
   OXXO ADMIN - NORMALIZADORES Y REGLAS
   Lee matrices de Excel, detecta columnas, limpia datos,
   deriva campos por dashboard y calcula periodos de carga.
   ========================================================== */

window.OXXO_ADMIN_NORMALIZERS = function createAdminNormalizers(deps){
  const {state,norm,normLoose,aliasesFor,dashboard,$,OXXO} = deps;

  function getHeaders(rows){const set=new Set();rows.forEach(row=>Object.keys(row||{}).forEach(key=>set.add(key)));return [...set];}
  // Se conserva el nombre por compatibilidad con las definiciones existentes.
  // Antes validaba solo contra la plaza activa del switch de Alcance, lo que
  // rompia cargas consolidadas con varias plazas en un mismo archivo: las
  // filas de cualquier plaza distinta a la activa se descartaban en
  // silencio. El reemplazo real en Google Sheets ya separa cada plaza por su
  // propio valor (scopeColumns -> replaceScope en admin-upload.gs), asi que
  // aqui basta con aceptar cualquier plaza reconocida en el catalogo -- ya
  // no depende de cual este activa arriba.
  function containsOaxaca(value){return OXXO.matchesAnyKnownPlaza(value);}
  function toNumber(value){const n=Number(String(value??'').replace(/[$,%]/g,'').replace(/,/g,'').trim());return Number.isFinite(n)?n:0;}
  function pctValue(value){const n=toNumber(value);if(!n)return 0;return n<=1?n*100:n;}
  function parseDate(value){
    if(value instanceof Date&&!isNaN(value))return value;
    const raw=String(value??'').trim();if(!raw||/^n\/?a$/i.test(raw))return null;
    // El serial de Excel es solo un dia calendario, sin zona horaria, pero
    // Date.UTC(...) construye un instante UTC concreto. isoDate()/monthKey()
    // de aqui abajo leen el resultado con getters LOCALES (getFullYear/
    // getMonth/getDate) -- en el navegador del admin que publica (huso
    // horario de Mexico, UTC-6), medianoche UTC de una fecha cae la tarde del
    // dia anterior en hora local, asi que una celda de Excel tipeada como
    // Fecha (no texto) se publicaba en Google Sheets un dia antes del real
    // (confirmado: subir vacantes con la columna Fecha como fecha de Excel
    // las publicaba en el dia anterior). Se leen los componentes en UTC y se
    // reconstruye la fecha con el constructor LOCAL, para que isoDate() y el
    // resto escriban el dia calendario real sin importar el huso horario.
    if(/^\d+(\.\d+)?$/.test(raw)){
      const serial=Number(raw);
      if(serial>25000&&serial<80000){
        const utc=new Date(Date.UTC(1899,11,30)+serial*86400000);
        return new Date(utc.getUTCFullYear(),utc.getUTCMonth(),utc.getUTCDate());
      }
    }
    const embedded=raw.match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})/);
    const clean=(embedded?embedded[0]:raw.replace(/\s+\d{1,2}:\d{2}(:\d{2})?.*$/,'')).replace(/[.]/g,'/').replace(/-/g,'/');
    const parts=clean.split('/').map(p=>p.trim()).filter(Boolean);
    if(parts.length>=3){let day,month,year;if(parts[0].length===4){year=Number(parts[0]);month=Number(parts[1]);day=Number(parts[2]);}else{day=Number(parts[0]);month=Number(parts[1]);year=Number(parts[2]);}if(year<100)year+=2000;const d=new Date(year,month-1,day);if(!isNaN(d))return d;}
    const d=new Date(raw);return isNaN(d)?null:d;
  }
  function isoDate(date){return date?`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`:'';}
  function monthKey(date){if(!date)return '';const abbr=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'][date.getMonth()];return `${abbr}-${String(date.getFullYear()).slice(-2)}`;}
  function daysBetween(start,end){if(!start||!end)return '';const a=new Date(start.getFullYear(),start.getMonth(),start.getDate()).getTime();const b=new Date(end.getFullYear(),end.getMonth(),end.getDate()).getTime();return Math.max(0,Math.floor((b-a)/86400000));}
  function extractStatusDate(value){const m=String(value??'').match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})/);return m?parseDate(m[0]):null;}
  function vacancyDaysValue(value){
    const raw=String(value??'').trim();
    if(!raw||/finaliz/i.test(raw))return '';
    const d=parseDate(raw);
    if(d&&d.getFullYear()<=1901){
      const base=Date.UTC(1899,11,30);
      return Math.max(0,Math.round((Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())-base)/86400000));
    }
    if(/\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}/.test(raw))return '';
    const n=toNumber(raw);
    return Number.isFinite(n)&&n>=0?n:'';
  }  function isVacancyRow(row){const status=normLoose(row['Status ocupacion']);return status.includes('vacante')||status.includes('no ocupado');}

  function dateFromText(value){const m=String(value||'').match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})/);return m?parseDate(m[0]):null;}
  function monthFromSourceName(){return monthKey(dateFromText(state.fileName)||dateFromText(state.sheetName));}
  function deriveD1(row){const fecha=parseDate(row.Fecha)||extractStatusDate(row['Status ocupacion']);const today=new Date();const sourceMonth=monthFromSourceName();const dias=vacancyDaysValue(row['Dias Vacantes']);return {...row,Fecha:isoDate(fecha),'Dias Vacantes':dias!==''?dias:daysBetween(fecha,today),Mes:sourceMonth||monthKey(parseDate(row.Mes))||monthKey(fecha)};}
  function deriveD2(row){const fecha=parseDate(row.Fecha);const sourceMonth=monthFromSourceName();return {...row,Fecha:isoDate(fecha),Mes:sourceMonth||monthKey(parseDate(row.Mes))||monthKey(fecha)};}
  function deriveD2Denom(row){const fecha=parseDate(row['F.Crea']);const sourceMonth=monthFromSourceName();return {...row,'F.Crea':isoDate(fecha),Mes:sourceMonth||monthKey(parseDate(row.Mes))||monthKey(fecha)};}
  // Umbral 92.5%, no 95%: es el que usa dashboard-3.html en los ~7 lugares
  // donde recalcula su propio binario desde Aprovechamiento Estructura (meta
  // visible en la UI "Meta 92.5%") y rh-dashboard-enhancements.js. Esta
  // columna publicada quedaba huerfana con un umbral distinto al real -- nadie
  // la consume hoy (todos recalculan desde Aprovechamiento Estructura), pero
  // cualquier consumo futuro directo de la hoja heredaria el umbral
  // equivocado.
  function deriveD3(row){const raw=pctValue(row['Aprovechamiento Estructura']);return {...row,'Aprovechamiento Estructura':raw,'Aprovechamiento Binario':raw>=92.5?100:0};}
  function deriveD5(row){return {...row,Fecha_Inicio:isoDate(parseDate(row.Fecha_Inicio)),Fecha_Fin:isoDate(parseDate(row.Fecha_Fin)),Periodo_Anterior:row.Periodo_Anterior||0,Periodo_Actual:row.Periodo_Actual||0,Dias_Restantes:row.Dias_Restantes||row['Total dias restantes']||0};}
  function deriveD6(row){return {...row,'Inicio de validez':isoDate(parseDate(row['Inicio de validez'])),'Fin de validez':isoDate(parseDate(row['Fin de validez'])),'Inicio de semana':isoDate(parseDate(row['Inicio de semana'])),'Fin de semana':isoDate(parseDate(row['Fin de semana'])),Dias:row.Dias||row['Absentismos solo en la semana']||0};}
  function deriveD7(row){return {...row,'Estructura Propuesta TREO P2 Jun - Ago':row['Estructura Propuesta TREO P2 Jun - Ago']||row.TREO,'Estructura SAP':row['Estructura SAP']||row.SAP,'Empleados Activos':row['Empleados Activos']||row.Activos,'Dif SAP vs Est Optima Final':row['Dif SAP vs Est Optima Final']||row.DIF,'Movimiento Inicial':row['Movimiento Inicial']||row.Movimiento};}
  function deriveCatalog(row){return {...row,ASESOR:String(row.ASESOR||'').trim(),TIENDA:String(row.TIENDA||'').trim(),'CR TIENDA':String(row['CR TIENDA']||'').trim().toUpperCase(),ACTIVA:String(row.ACTIVA||'SI').trim().toUpperCase()};}
  function ratioValue(value){
    const raw=String(value??'').trim();
    const number=toNumber(value);
    if(!Number.isFinite(number))return 0;
    if(raw.includes('%'))return number/100;
    return Math.abs(number)>1?number/100:number;
  }
  function inventoryPeriod(value){
    const date=parseDate(value);
    return date?`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`:'';
  }
  function inventorySourcePeriod(){
    const months={enero:1,febrero:2,marzo:3,abril:4,mayo:5,junio:6,julio:7,agosto:8,septiembre:9,setiembre:9,octubre:10,noviembre:11,diciembre:12};
    const source=normLoose(`${state.fileName||''} ${state.sheetName||''}`);
    const match=source.match(/\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\s+(20\d{2})\b/);
    if(!match)return '';
    return `${match[2]}-${String(months[match[1]]).padStart(2,'0')}`;
  }
  function deriveInventories(row){
    const previousDate=parseDate(row['Fecha de Inventario Anterior']);
    const inventoryDate=parseDate(row['Fecha de Inventario']);
    return {
      ...row,
      Periodo:String(row.Periodo||'').trim()||inventorySourcePeriod()||inventoryPeriod(inventoryDate),
      CR:String(row.CR||'').trim().toUpperCase(),
      'Asesor Comercial':String(row['Asesor Comercial']||'').trim(),
      'Fecha de Inventario Anterior':isoDate(previousDate),
      'Fecha de Inventario':isoDate(inventoryDate),
      '# Días de Inventario':toNumber(row['# Días de Inventario']),
      'Resultado de Inventario':toNumber(row['Resultado de Inventario']),
      'Resultado del Mes Actual':toNumber(row['Resultado del Mes Actual']),
      Diferencias:toNumber(row.Diferencias),
      'Ventas sin TAE del mes':toNumber(row['Ventas sin TAE del mes']),
      '% Merma / Vta sin TAE del Mes':ratioValue(row['% Merma / Vta sin TAE del Mes']),
      'Resultado Inventarios Mayo':toNumber(row['Resultado Inventarios Mayo']),
      'Resultado Inventarios Junio':toNumber(row['Resultado Inventarios Junio']),
      'Resultado Inventarios Julio':toNumber(row['Resultado Inventarios Julio']),
      'Resultado de Merma  (Final c/s proyectos)':toNumber(row['Resultado de Merma  (Final c/s proyectos)']),
      'Ventas Mayo':toNumber(row['Ventas Mayo']),
      'Ventas Junio':toNumber(row['Ventas Junio']),
      'Ventas Julio':toNumber(row['Ventas Julio']),
      'SUMA TOTAL VTA S/TAE':toNumber(row['SUMA TOTAL VTA S/TAE']),
      '% Merma / Vta sin TAE (Final c/s proyectos)':ratioValue(row['% Merma / Vta sin TAE (Final c/s proyectos)'])
    };
  }

  function optionalNumber(value){
    const raw=String(value??'').trim();
    if(!raw||/^#/.test(raw))return '';
    const n=Number(raw.replace(/[$,%\s]/g,'').replace(/,/g,''));
    return Number.isFinite(n)?n:'';
  }

  // Dashboard 13 necesita dos fuentes del mismo libro: la Sabana aporta una
  // fila por incapacidad y Caratula aporta los Head Count manuales de 2026 y
  // la tabla historica 2025. Se agregan 12 filas RESUMEN a la misma pestana de
  // Google Sheets para conservar una sola publicacion atomica y auditable.
  function enrichCaratulaD13(rows,dash){
    if(!rows.length||!state.workbook)return rows;
    const caratulaName=(state.workbook.SheetNames||[]).find(name=>norm(name)===norm('Carátula'));
    if(!caratulaName)return rows;
    const matrix=getSheetMatrix(caratulaName);
    if(matrix.length<143)return rows;
    const ano=optionalNumber(matrix[1]?.[2])||new Date().getFullYear();
    const costoDiario=1134.26;
    const resumen=[];
    for(let index=0;index<12;index++){
      const actual=matrix[4+index]||[];     // filas 5-16 de Caratula
      const historico=matrix[131+index]||[];// filas 132-143 de Caratula
      const mesNumero=optionalNumber(actual[0])||index+1;
      const headCount=optionalNumber(actual[2]);
      const headCount2025=optionalNumber(historico[2]);
      const dpRt2025=optionalNumber(historico[16]);
      const dpEg2025=optionalNumber(historico[18]);
      const fila=Object.fromEntries((dash.output||[]).map(col=>[col,'']));
      Object.assign(fila,{
        'Registro Tipo':'RESUMEN',
        'Ano Reporte':ano,
        'Mes Numero':mesNumero,
        'Mes':String(actual[1]||historico[1]||'').trim().toUpperCase(),
        'Head Count 2026':headCount,
        'Head Count 2025':headCount2025,
        'Casos RT 2025':optionalNumber(historico[15]),
        'DP RT 2025':dpRt2025,
        'Casos RTY 2025':optionalNumber(historico[27]),
        'DP RTY 2025':optionalNumber(historico[28]),
        'Casos EG 2025':optionalNumber(historico[17]),
        'DP EG 2025':dpEg2025,
        'IATP 2025':headCount2025?dpRt2025/(headCount2025*166.67)*16666.67:'',
        'Tasa DP EG 2025':headCount2025?dpEg2025/headCount2025*100:'',
        'Costo Diario':costoDiario
      });
      resumen.push(fila);
    }
    return rows.concat(resumen);
  }

  function enrichRows(rows,dash){
    if(dash.enrich==='caratulaD13')return enrichCaratulaD13(rows,dash);
    return rows;
  }

  // Algunas fuentes cambian un sufijo de periodo dentro del encabezado cada
  // mes. El dashboard declara esos casos de forma explicita en
  // dash.headerContains, para no volver flexible la deteccion de columnas
  // ajenas ni confundir encabezados parecidos.
  function headerMatchesColumn(header,column,dash){
    const key=norm(header);
    if(!key)return false;
    if(aliasesFor(column).includes(key))return true;
    return (dash.headerContains?.[column]||[]).map(norm).some(fragment=>fragment&&key.includes(fragment));
  }
  function findHeaderRow(matrix,dash){const limit=Math.min(matrix.length,40);let best={index:0,score:-1};for(let i=0;i<limit;i++){const cells=(matrix[i]||[]).map(norm).filter(Boolean);const score=dash.required.reduce((total,col)=>total+(cells.some(cell=>headerMatchesColumn(cell,col,dash))?1:0),0)+Math.min(cells.length,12)/100;if(score>best.score)best={index:i,score};}return best;}
  // Encabezados repetidos: algunos reportes traen el mismo nombre de columna
  // dos veces con contenidos distintos (el Reporte Enfoque del Lider trae
  // "MEP P.P." y "EVALUACION OPERATIVA" dos veces cada una: primero el valor
  // numerico y despues su OK/NO OK). La primera ocurrencia se queda con la
  // clave limpia -- eso NO cambia para ningun dashboard existente -- y las
  // siguientes se registran ademas con un sufijo 2, 3, ... para que un alias
  // pueda apuntarles. Misma convencion que makeUniqueHeaders() en core.js,
  // que ya hace esto del lado de la lectura del CSV publicado.
  function buildSourceMap(sourceHeaders){
    const sourceMap=new Map();
    const conteo=new Map();
    sourceHeaders.forEach((header,index)=>{
      const key=norm(header);
      if(!key)return;
      const veces=(conteo.get(key)||0)+1;
      conteo.set(key,veces);
      const clave=veces===1?key:`${key}${veces}`;
      if(!sourceMap.has(clave))sourceMap.set(clave,index);
    });
    return sourceMap;
  }
  function matchColumns(sourceMap,columns,dash={}){const matched={};columns.forEach(col=>{const exact=aliasesFor(col).find(alias=>sourceMap.has(alias));const partial=exact?null:[...sourceMap.keys()].find(key=>headerMatchesColumn(key,col,dash));const key=exact||partial;if(key)matched[col]=sourceMap.get(key);});return matched;}
  // dash.sourceColumns: columnas a extraer del Excel crudo, cuando difieren de
  // dash.output (ej. d2otras extrae la columna cruda "Plaza" ademas de
  // "Plazas"/"Bajas Plaza"). Si no se define, se extraen las mismas columnas
  // que el output final (comportamiento previo, sin cambios para el resto).
  // dash.aggregate: transforma las filas ya filtradas/derivadas (una por fila
  // de origen) en las filas finales a publicar, cuando el dashboard necesita
  // agrupar/contar en vez de mapear 1 a 1 (ej. bajas por plaza).
  function rowsFromMatrix(matrix,dash){
    if(!matrix.length)return{rows:[],headers:[],headerRow:0,sourceRows:0,sourceHeaders:[]};
    const headerInfo=findHeaderRow(matrix,dash);
    const sourceHeaders=(matrix[headerInfo.index]||[]).map((value,index)=>String(value||`Columna ${index+1}`).trim());
    const extractColumns=dash.sourceColumns||[...dash.output,...(dash.supplementalSourceColumns||[])];
    const matched=matchColumns(buildSourceMap(sourceHeaders),extractColumns,dash);
    const rawRows=matrix.slice(headerInfo.index+1).map(line=>{const row={};extractColumns.forEach(col=>{row[col]=matched[col]!==undefined?(line[matched[col]]??''):'';});return row;}).filter(row=>Object.values(row).some(v=>String(v??'').trim()!==''));
    const filtered=rawRows.map(row=>dash.derive?dash.derive(row):row).filter(row=>!dash.filter||dash.filter(row)).map(row=>{const cleaned={};extractColumns.forEach(col=>{cleaned[col]=row[col]??'';});return cleaned;});
    const aggregated=dash.aggregate?dash.aggregate(filtered):filtered;
    const finalRows=enrichRows(aggregated,dash).map(row=>OXXO.applyDataContextDefaults(row,{columns:dash.output}));
    const supplemental=Math.max(0,finalRows.length-aggregated.length);
    return{rows:finalRows,headers:dash.output,headerRow:headerInfo.index+1,sourceRows:rawRows.length+supplemental,sourceHeaders};
  }
  // Convertir una hoja de Excel a matriz (XLSX.utils.sheet_to_json) es caro en
  // hojas grandes (se han visto hojas reales de 6000+ filas / 100+ columnas),
  // y sin cache se repetia en cada cambio de dashboard/hoja ademas de dentro
  // de evaluateSheet para CADA hoja del workbook -- eso trababa el panel al
  // subir archivos grandes. Se cachea por nombre de hoja; state.sheetMatrixCache
  // se reinicia solo cuando se sube un archivo nuevo (ver handleFile en admin.js).
  function getSheetMatrix(name){
    if(!state.workbook)return [];
    if(state.sheetMatrixCache.has(name))return state.sheetMatrixCache.get(name);
    const sheet=state.workbook.Sheets[name];
    const matrix=sheet?XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',raw:false}):[];
    // raw:false entrega celdas de fecha real (cellDates:true en XLSX.read)
    // como TEXTO formateado, y ese formato depende del NUMBER FORMAT que
    // traiga la celda en el Excel de origen -- no de una convencion fija.
    // Confirmado con datos reales: varios reportes (Bajas, Enfoque del
    // Lider) formatean fechas M/D/AA (americano), mientras parseDate() en
    // este mismo archivo asume D/M/A (como se captura normalmente aqui).
    // Cuando el dia es <=12 ambas lecturas dan una fecha VALIDA pero
    // DISTINTA (ej. "01/09/2026" = 1 de septiembre o 9 de enero segun la
    // convencion) -- no hay forma de detectar el error solo con el texto,
    // asi que se publicaba en silencio la fecha equivocada (confirmado: una
    // baja con F. Validez "01/09/2026" se publicaba como "2026-01-09").
    // Se sustituye aqui la celda por su objeto Date real (via el mapa crudo
    // de la hoja, que si respeta cellDates) SOLO cuando la celda es
    // genuinamente de tipo fecha en el Excel (cell.t==='d') -- el resto de
    // columnas (numeros, porcentajes, texto) se queda con el texto
    // formateado de raw:false, que es lo que ya esperan toNumber()/
    // pctValue() y los derive*() de cada dashboard. parseDate() ya sabe
    // manejar un objeto Date directamente (su primer chequeo), asi que esto
    // corrige el problema para todos los dashboards que lo usan sin volver
    // a tocar cada parser individual -- salvo los que tienen su propio
    // parser de texto (Dashboard 9 y 12), que se ajustaron aparte para
    // aceptar tambien un Date real.
    if(sheet&&sheet['!ref']){
      const range=XLSX.utils.decode_range(sheet['!ref']);
      for(let r=range.s.r;r<=range.e.r;r++){
        const rowIdx=r-range.s.r;
        if(!matrix[rowIdx])continue;
        for(let c=range.s.c;c<=range.e.c;c++){
          const cell=sheet[XLSX.utils.encode_cell({r,c})];
          if(cell&&cell.t==='d'&&cell.v instanceof Date&&!isNaN(cell.v)){
            matrix[rowIdx][c-range.s.c]=cell.v;
          }
        }
      }
    }
    state.sheetMatrixCache.set(name,matrix);
    return matrix;
  }
  // Una hoja declarada como preferida debe ganar siempre. El bono anterior de
  // 1000 podia ser superado por una hoja derivada con mas filas (Reporte RH
  // tiene 2238 y desplazaba por error a Sabana, que es la fuente real de D13).
  function evaluateSheet(name,dash){const matrix=getSheetMatrix(name);const parsed=rowsFromMatrix(matrix,dash);const missing=dash.required.filter(col=>!parsed.rows.some(row=>String(row[col]??'').trim()!==''));const preference=(dash.preferredSheets||[]).some(s=>norm(s)===norm(name))?1000000:0;return{name,parsed,missing,score:preference+parsed.rows.length-missing.length*100};}
  function autoSelectSheet(){if(!state.workbook)return;const dash=dashboard();const evaluations=state.workbook.SheetNames.map(name=>evaluateSheet(name,dash)).sort((a,b)=>b.score-a.score);const best=evaluations[0];if(best&&best.name&&$('sheet-select').value!==best.name){$('sheet-select').value=best.name;state.sheetName=best.name;}}

  function periodInfo(dash,rows){const column=dash.periodColumn||'';const values=column?[...new Set(rows.map(row=>String(row[column]??'').trim()).filter(Boolean))]:[];return{column,values,enabled:Boolean(column&&values.length)};}

  return {
    getHeaders,
    containsOaxaca,
    toNumber,
    pctValue,
    parseDate,
    isoDate,
    monthKey,
    daysBetween,
    extractStatusDate,
    isVacancyRow,
    dateFromText,
    monthFromSourceName,
    deriveD1,
    deriveD2,
    deriveD2Denom,
    deriveD3,
    deriveD5,
    deriveD6,
    deriveD7,
    deriveCatalog,
    deriveInventories,
    findHeaderRow,
    buildSourceMap,
    matchColumns,
    rowsFromMatrix,
    getSheetMatrix,
    evaluateSheet,
    autoSelectSheet,
    periodInfo
  };
};
