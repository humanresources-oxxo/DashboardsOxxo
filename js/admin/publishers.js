/* ==========================================================
   OXXO ADMIN - PUBLICACION Y DESCARGAS
   Agrupa descarga CSV, POST a Apps Script y publicaciones
   manuales sin cambiar el flujo visual del panel admin.
   ========================================================== */

window.OXXO_ADMIN_PUBLISHERS = function createAdminPublishers(deps){
  const {
    $,
    state,
    OXXO,
    DEFAULT_UPLOAD_URL,
    dashboard,
    getDashboards,
    periodInfo,
    isoDate,
    getAdminPassword,
    getAdminArea,
    getRuntimeVersion,
    renderPublicationResult,
    rowsFromMatrix,
    getSheetMatrix
  } = deps;

  function isFetchBlocked(error){return /failed to fetch|load failed|networkerror|cors/i.test(String(error?.message||error||''));}
  function isTransientPublishError(error){return /HTTP (404|408|429|5\d\d)\b/i.test(String(error?.message||error||''));}
  function retryUrl(url,attempt){
    if(!attempt)return url;
    return `${url}${url.includes('?')?'&':'?'}_publishRetry=${Date.now()}-${attempt}`;
  }
  async function postAdminPayload(payload){
    const url=publishUrl();
    if(!url)throw new Error('Falta configurar Apps Script.');
    const body=JSON.stringify(payload);
    try{
      // Apps Script puede responder 404 brevemente mientras redirige una
      // petición grande a la versión activa. Reintentamos solo respuestas
      // inequívocamente transitorias; los rechazos de validación y permisos
      // se muestran de inmediato y nunca se reenvían.
      let lastError;
      for(let attempt=0;attempt<3;attempt++){
        try{
          const response=await fetch(retryUrl(url,attempt),{method:'POST',mode:'cors',headers:{'Content-Type':'text/plain;charset=utf-8'},body});
          if(!response.ok)throw new Error('HTTP '+response.status);
          const result=await response.json().catch(()=>({ok:true}));
          if(result.ok===false)throw new Error(result.error||'Apps Script rechazo la publicacion');
          return result;
        }catch(error){
          lastError=error;
          if(isFetchBlocked(error)||!isTransientPublishError(error)||attempt===2)break;
          await new Promise(resolve=>setTimeout(resolve,700*(attempt+1)));
        }
      }
      if(isTransientPublishError(lastError))throw new Error('El servicio de publicación respondió temporalmente sin disponibilidad. Se reintentó 3 veces sin modificar la base; recarga el panel y vuelve a publicar.');
      throw lastError;
    }catch(error){
      if(!isFetchBlocked(error))throw error;
      await fetch(url,{method:'POST',mode:'no-cors',headers:{'Content-Type':'text/plain;charset=utf-8'},body});
      return {ok:true,compatibilityMode:true};
    }
  }

  function downloadCsv(){if(!state.rows.length)return;const dash=dashboard();OXXO.downloadRowsAsCSV(state.rows,`${dash.key}-${dash.tab}.csv`,dash.output);}
  function publishUrl(){return $('apps-script-url').value.trim()||DEFAULT_UPLOAD_URL;}
  // Despues de un publish exitoso, avisa al Apps Script que escriba la fecha
  // de hoy en la fila de este dashboard dentro de la hoja Configuracion —
  // asi "Ultima actualizacion" en la portada (index.html) ya no depende de
  // que alguien la edite a mano, siempre queda igual al ultimo publish real.
  // Fire-and-forget: si falla, no rompe el flujo de publicacion (que ya tuvo
  // exito antes de llegar aqui) ni se le muestra error extra al usuario.
  function notifyConfigDate(dashKey){
    const url=publishUrl();if(!url)return;
    const configId=(String(dashKey||'').match(/^[ds]\d/)||[])[0];
    if(!configId)return;
    fetch(url,{method:'POST',mode:'cors',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'updateConfigDate',adminPassword:getAdminPassword(),dashboardId:configId})}).catch(()=>{});
  }
  function updatePublishState(){const el=$('publish-state');if(!el)return;const ready=Boolean(publishUrl());el.textContent=ready?'Publicacion directa lista':'Falta configurar Apps Script una sola vez';el.classList.toggle('ready',ready);}
  function confirmPublication(label,tab,count,mode,preflight={}){
    const current=Number.isFinite(Number(preflight.currentRows))?`\nFilas actuales: ${Number(preflight.currentRows).toLocaleString('es-MX')}.` : '';
    const projected=Number.isFinite(Number(preflight.projectedRows))?`\nFilas después de publicar: ${Number(preflight.projectedRows).toLocaleString('es-MX')}.` : '';
    const checked=preflight.serverValidated?'\nLa estructura y el impacto fueron validados por Apps Script.':'';
    return window.confirm(`Vas a publicar ${count.toLocaleString('es-MX')} fila(s) en ${tab}.\n\n${mode}${current}${projected}${checked}\n\nAntes de reemplazar datos se creara un respaldo automatico y la operacion quedara registrada en la bitacora.\n\n¿Deseas continuar con ${label}?`);
  }

  async function preflightPublication(dash,rows,period){
    const local={ok:true,currentRows:null,projectedRows:rows.length,incomingRows:rows.length,columns:(dash.output||[]).length,willCreateBackup:true,serverValidated:false};
    if(Number(getRuntimeVersion?.()||0)<37)return local;
    const result=await postAdminPayload({
      action:'preflight',
      adminPassword:getAdminPassword(),
      targetSheet:dash.tab,
      rows,
      requiredHeaders:dash.required||[],
      scopeColumns:dash.scopeColumns||[],
      updateMode:period.enabled?'replacePeriod':'replaceAll',
      periodColumn:period.column,
      periodValues:period.values
    });
    if(result?.compatibilityMode)return local;
    return {...local,...result,serverValidated:true};
  }

  function normHeader(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');}
  function serverVerificationText(result){
    const verification=result?.verification;
    if(!verification)return result?.compatibilityMode?'':' Verificación interna no disponible.';
    return verification.ok
      ?` Verificación interna correcta: ${Number(verification.actualRows||0).toLocaleString('es-MX')} filas y ${Number(verification.expectedColumns||0)} columnas.`
      :' Atención: Apps Script terminó la escritura, pero la comprobación interna requiere revisión.';
  }
  async function verifyPublicReadback(dash,result){
    if(!dash?.tab)return null;
    // Modo compatible (fallback no-cors en postAdminPayload): el navegador
    // nunca pudo leer la respuesta real del servidor, asi que no hay
    // result.verification/rows/keptRows para calcular un conteo esperado --
    // antes esto se saltaba el readback por completo (return null) y una
    // publicacion en modo compatible se quedaba SIN ninguna verificacion
    // automatica, dependiendo solo de que el admin fuera a revisar el
    // dashboard el mismo. Aqui se sigue leyendo la hoja publica igual que en
    // una publicacion normal, solo que sin exigir que el conteo coincida
    // exactamente con uno que no conocemos: basta con que las columnas
    // requeridas esten presentes y haya filas. No es una confirmacion tan
    // fuerte como el conteo exacto de una publicacion normal, pero es real
    // informacion en vez de nada.
    const compatibilityMode=Boolean(result?.compatibilityMode);
    const expectedRows=Number(result?.verification?.expectedRows ?? (Number(result?.rows||0)+Number(result?.keptRows||0)));
    const required=(dash.output||[]).map(normHeader).filter(Boolean);
    let last={ok:false,rows:0,missing:required,error:''};
    for(const delay of [700,1200,1800]){
      await new Promise(resolve=>setTimeout(resolve,delay));
      try{
        OXXO.clearSheetDataCache(dash.tab);
        const rows=await OXXO.fetchSheetData(dash.tab,{fresh:true,allowStale:false,scoped:false});
        if(!Array.isArray(rows)||!rows.length){last={ok:false,rows:0,missing:required,error:'La lectura pública respondió sin filas.'};continue;}
        const headers=Object.keys(rows[0]||{}).map(normHeader);
        const missing=required.filter(header=>!headers.includes(header));
        const countOk=compatibilityMode||rows.length===expectedRows;
        last={ok:countOk&&!missing.length,rows:rows.length,missing,countOk,error:''};
        if(last.ok)return last;
      }catch(error){
        // La escritura ya fue confirmada por Apps Script. Un 404/timeout del
        // readback puede ser transitorio mientras Google refresca la hoja y
        // no debe convertir una publicación correcta en un falso fracaso.
        last={ok:false,rows:0,missing:required,error:String(error?.message||error||'Lectura no disponible')};
      }
    }
    return last;
  }
  function readbackText(readback){
    if(!readback)return '';
    if(readback.ok)return ` Lectura pública comprobada: ${Number(readback.rows||0).toLocaleString('es-MX')} registros visibles en el dashboard.`;
    const detail=readback.error
      ?` la comprobación respondió ${readback.error}`
      :readback.missing?.length?` faltan ${readback.missing.join(', ')}`:` se leyeron ${Number(readback.rows||0).toLocaleString('es-MX')} filas`;
    return ` Atención: la publicación se guardó, pero la lectura del dashboard todavía no coincide (${detail}). Revisa Calidad de datos.`;
  }

  // Dashboards que ya no tienen su propia opcion en el menu porque salen del
  // MISMO archivo que ya se sube para su dashboard "padre": Bajas otras
  // plazas y Movimientos ABC salen del mismo Excel de d2 (hojas "Bajas" y
  // "ABC"); Aprovechamiento otras plazas sale del mismo Excel de d3 (hoja
  // "PLAZAS"). Al publicar el padre se recalculan y publican solos, cada
  // uno buscando su propia hoja preferida dentro del workbook ya cargado
  // (no necesariamente la misma hoja seleccionada para el padre). Si alguno
  // falla no se revierte el publish del padre (que ya tuvo exito): solo se
  // avisa aparte.
  const AUTO_PUBLISH_MAP={d2:['d2otras','d2denom'],d3:['d3plazas']};
  function findSheetInWorkbook(preferredNames){
    const names=state.workbook?.SheetNames||[];
    for(const preferred of preferredNames||[]){
      const found=names.find(n=>n.trim().toLowerCase()===String(preferred).trim().toLowerCase());
      if(found)return found;
    }
    return '';
  }
  async function publishAutoFor(parentKey){
    if(!state.workbook)return [];
    const keys=AUTO_PUBLISH_MAP[parentKey]||[];
    const publicados=[];
    // Cada hoja derivada se publica de forma independiente: si una falla (ej.
    // d2denom), las demas que ya se publicaron con exito (ej. d2otras) no deben
    // perderse de `publicados` -- antes un solo error aqui rechazaba toda la
    // funcion y el admin no podia saber cual de las hojas derivadas si se
    // actualizo y cual no.
    for(const key of keys){
      const dashDef=getDashboards().find(d=>d.key===key);
      if(!dashDef)continue;
      try{
        const sheetName=findSheetInWorkbook(dashDef.preferredSheets)||state.sheetName;
        if(!sheetName)continue;
        const matrix=getSheetMatrix(sheetName);
        if(!matrix.length)continue;
        const parsed=rowsFromMatrix(matrix,dashDef);
        if(!parsed.rows.length)continue;
        const result=await postAdminPayload({adminPassword:getAdminPassword(),targetSheet:dashDef.tab,rows:parsed.rows,requiredHeaders:dashDef.required||[],scopeColumns:dashDef.scopeColumns||[],source:`DashboardsOxxo Admin (auto desde ${parentKey})`,sourceFile:state.fileName||'',updateMode:'replaceAll'});
        OXXO.clearSheetDataCache(dashDef.tab);
        notifyConfigDate(dashDef.key);
        const readback=await verifyPublicReadback(dashDef,result);
        publicados.push({label:dashDef.label,count:parsed.rows.length,verified:Boolean(result?.verification?.ok&&readback?.ok)});
      }catch(error){
        console.error(`No se pudo auto-publicar ${dashDef.label} (${key}) desde ${parentKey}:`,error);
        publicados.push({label:dashDef.label,count:0,verified:false});
      }
    }
    return publicados;
  }

  async function publish(){
    const url=publishUrl();
    if(!url){alert('Falta configurar Apps Script una sola vez. Mientras tanto puedes descargar CSV.');return;}
    if(!state.validation?.ok){alert('La base aun tiene errores de validacion.');return;}
    const dash=dashboard(),period=periodInfo(dash,state.validation.rows);
    if((dash.scopeColumns||[]).length&&Number(getRuntimeVersion?.()||0)<40){
      alert('Publicación regional protegida: primero debe desplegarse Apps Script v40. No se modificó Google Sheets.');
      return;
    }
    // Antes decia "Alcance protegido: <plaza activa del switch>", pero desde
    // que containsOaxaca() dejo de filtrar por esa plaza (ver
    // matchesAnyKnownPlaza en core.js) una sola carga puede traer varias
    // plazas a la vez -- se listan las que de verdad estan en las filas a
    // publicar, no la que estuviera activa en un switch que ya ni se
    // muestra en este panel.
    const scopeMessage=(dash.scopeColumns||[]).length
      ?(()=>{
          const rows=state.validation.rows||[];
          const plazaKey=rows.length?Object.keys(rows[0]||{}).find(k=>/^plaza$/i.test(k))||Object.keys(rows[0]||{}).find(k=>/plaza/i.test(k)):null;
          const plazas=plazaKey?[...new Set(rows.map(r=>String(r[plazaKey]||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es')):[];
          return plazas.length
            ?` Alcance protegido: ${plazas.join(', ')}. Las demás plazas ya publicadas se conservarán.`
            :' Alcance protegido por plaza. Las demás plazas ya publicadas se conservarán.';
        })()
      :'';
    const modeMessage=(period.enabled?`Solo se reemplazara ${period.column}: ${period.values.join(', ')}.`:'Se reemplazara la foto del alcance seleccionado.')+scopeMessage;
    $('publish-btn').disabled=true;$('publish-btn').textContent='Validando impacto...';
    try{
      const preflight=await preflightPublication(dash,state.validation.rows,period);
      if(!confirmPublication(dash.label,dash.tab,state.validation.rows.length,modeMessage,preflight))return;
      $('publish-btn').textContent='Publicando...';
      const payload={adminPassword:getAdminPassword(),targetSheet:dash.tab,rows:state.validation.rows,requiredHeaders:dash.required||[],scopeColumns:dash.scopeColumns||[],source:'DashboardsOxxo Admin',sourceFile:state.fileName||'',updateMode:period.enabled?'replacePeriod':'replaceAll',periodColumn:period.column,periodValues:period.values};
      const result=await postAdminPayload(payload);
      OXXO.clearSheetDataCache(dash.tab);
      if(dash.key==='s7'&&OXXO.SHEETS_CONFIG.STORE_CATALOG_SHEET){
        OXXO.clearSheetDataCache(OXXO.SHEETS_CONFIG.STORE_CATALOG_SHEET);
      }
      notifyConfigDate(dash.key);
      $('publish-btn').textContent='Verificando...';
      const readback=await verifyPublicReadback(dash,result);
      let autoMsg='';
      let autoOk=true;
      if(AUTO_PUBLISH_MAP[dash.key]){
        try{
          const publicados=await publishAutoFor(dash.key);
          if(publicados.length){
            autoMsg=' Tambien se actualizaron: '+publicados.map(p=>`${p.label} (${p.count}) ${p.verified?'✓':'⚠'}`).join(', ')+'.';
            autoOk=publicados.every(p=>p.verified);
          }
        }catch(autoError){
          console.error(`No se pudo publicar los dashboards derivados de ${dash.key} automaticamente:`,autoError);
          autoMsg=' Ojo: no se pudieron actualizar los dashboards derivados, revisalos aparte si hace falta.';
          autoOk=false;
        }
      }
      const catalogMsg=result?.storeCatalog?.ok
        ?` Catálogo de tiendas activas actualizado: ${Number(result.storeCatalog.rows||0).toLocaleString('es-MX')} tiendas desde TREO.`
        :result?.storeCatalog?` TREO quedó publicado, pero el catálogo físico usará el respaldo directo hasta su siguiente sincronización.`:'';
      // orphanedColumns (admin-upload.gs, detectOrphanedColumns): columnas que
      // existian en la hoja con datos reales y ya no aparecen bajo ningun
      // nombre en el esquema nuevo -- senal de que alguien renombro una
      // columna en dashboard-definitions.js y las filas conservadas de
      // periodos/plazas anteriores perdieron esos datos en silencio (el
      // conteo de filas sigue cuadrando, por eso la verificacion normal no lo
      // detecta).
      const orphanedColumns=Array.isArray(result?.orphanedColumns)?result.orphanedColumns:[];
      const orphanedMsg=orphanedColumns.length
        ?` ⚠ Atención: la columna ${orphanedColumns.join(', ')} existía con datos y ya no aparece en el esquema publicado — revisa si se renombró en dashboard-definitions.js, las filas conservadas de periodos anteriores pudieron perder ese dato.`
        :'';
      const message=(result.compatibilityMode?`Solicitud enviada en modo compatible a ${dash.tab}. Espera unos segundos y valida el dashboard.`:`Base publicada correctamente en ${dash.tab}. ${period.enabled?'Periodo actualizado: '+period.values.join(', '):'Pestaña reemplazada completa'}.`)+serverVerificationText(result)+readbackText(readback)+catalogMsg+autoMsg+orphanedMsg;
      renderPublicationResult?.({
        type:result.compatibilityMode||!readback?.ok||!autoOk||orphanedColumns.length?'warn':'ok',
        title:result.compatibilityMode?'Solicitud enviada':'Publicación completada',
        area:getAdminArea?.()||'Panel Admin',
        text:message,
        facts:[`${Number(result.rows||state.validation.rows.length).toLocaleString('es-MX')} filas`,`${Number(result.columns||dash.output.length)} columnas`,result.backupSheet?`Respaldo: ${result.backupSheet}`:'Respaldo pendiente',readback?.ok?'Lectura pública verificada':'Verificación pendiente']
      });
    }catch(error){
      const message=String(error?.message||error||'Error desconocido');
      renderPublicationResult?.({type:'bad',title:'Publicación bloqueada',area:getAdminArea?.()||'Panel Admin',text:`No se modificaron los datos: ${message}`,facts:[dash.tab,`${state.validation.rows.length.toLocaleString('es-MX')} filas revisadas`]});
      alert('No se pudo publicar: '+message);
      console.error(error);
    }finally{
      $('publish-btn').disabled=false;$('publish-btn').textContent='Publicar en Sheets';
    }
  }

  async function publishManualD2Plan(){
    const url=publishUrl();if(!url){alert('Falta configurar Apps Script.');return;}
    const rowEls=[...document.querySelectorAll('#manual-input-d2plan .plan-row')];
    const rows=rowEls.map(tr=>{
      const get=field=>tr.querySelector(`[data-field="${field}"]`)?.value.trim()||'';
      return {Hallazgo:get('Hallazgo'),Accion:get('Accion'),Responsable:get('Responsable'),Plazo:get('Plazo'),Indicador:get('Indicador'),Prioridad:get('Prioridad')||'Media',Actualizado:isoDate(new Date())};
    }).filter(r=>r.Hallazgo&&r.Accion);
    if(!rows.length){alert('Captura al menos una fila con Hallazgo y Accion.');return;}
    const dash=getDashboards().find(d=>d.key==='d2plan');
    if(!confirmPublication(dash.label,dash.tab,rows.length,'Se reemplazara la pestana completa.'))return;
    const btn=$('manual-publish-d2plan-btn');btn.disabled=true;btn.textContent='Publicando...';
    try{
      const payload={adminPassword:getAdminPassword(),targetSheet:dash.tab,rows,requiredHeaders:dash.required||['Hallazgo','Accion'],source:'DashboardsOxxo Admin Manual',sourceFile:'Captura manual',updateMode:'replaceAll'};
      const result=await postAdminPayload(payload);
      OXXO.clearSheetDataCache(dash.tab);
      notifyConfigDate(dash.key);
      btn.textContent='Verificando...';
      const readback=await verifyPublicReadback(dash,result);
      alert(`${rows.length} fila(s) del plan de accion publicadas en ${dash.tab}.`+serverVerificationText(result)+readbackText(readback));
    }catch(error){alert('No se pudo publicar: '+error.message);console.error(error);}
    finally{btn.disabled=false;btn.textContent='Publicar';}
  }

  async function publishManual(){
    const url=publishUrl();if(!url){alert('Falta configurar Apps Script.');return;}
    const inputs=document.querySelectorAll('#manual-input-table [data-plaza]');
    const rows=[...inputs].filter(inp=>inp.value&&Number(inp.value)>0).map(inp=>({'Plazas':inp.dataset.plaza,'Bajas Plaza':inp.value,'Actualizado':isoDate(new Date())})).sort((a,b)=>Number(b['Bajas Plaza'])-Number(a['Bajas Plaza']));
    if(!rows.length){alert('Ingresa al menos una plaza con bajas mayor a 0.');return;}
    const dash=dashboard();
    if(!confirmPublication(dash.label,dash.tab,rows.length,'Se reemplazara la pestana completa.'))return;
    const btn=$('manual-publish-btn');btn.disabled=true;btn.textContent='Publicando...';
    try{
      const payload={adminPassword:getAdminPassword(),targetSheet:dash.tab,rows,requiredHeaders:dash.required||['Plazas','Bajas Plaza'],source:'DashboardsOxxo Admin Manual',sourceFile:'Captura manual',updateMode:'replaceAll'};
      const result=await postAdminPayload(payload);
      OXXO.clearSheetDataCache(dash.tab);
      notifyConfigDate(dash.key);
      btn.textContent='Verificando...';
      const readback=await verifyPublicReadback(dash,result);
      const message=result.compatibilityMode?`Solicitud enviada en modo compatible a ${dash.tab}. Espera unos segundos y valida el dashboard.`:`${rows.length} plaza(s) publicadas en ${dash.tab}.`;
      alert(message+serverVerificationText(result)+readbackText(readback));
    }catch(error){alert('No se pudo publicar: '+error.message);console.error(error);}
    finally{btn.disabled=false;btn.textContent='Publicar';}
  }

  async function publishManualD3(){
    const url=publishUrl();if(!url){alert('Falta configurar Apps Script.');return;}
    const inputs=document.querySelectorAll('#manual-input-d3 [data-plaza]');
    const rows=[...inputs].filter(inp=>inp.value&&Number(inp.value)>0).map(inp=>({'PLAZAS':inp.dataset.plaza,'Aprovechamiento de estructura a hoy':inp.value,'Actualizado':isoDate(new Date())})).sort((a,b)=>Number(b['Aprovechamiento de estructura a hoy'])-Number(a['Aprovechamiento de estructura a hoy']));
    if(!rows.length){alert('Ingresa al menos una plaza con aprovechamiento mayor a 0.');return;}
    const dash=dashboard();
    if(!confirmPublication(dash.label,dash.tab,rows.length,'Se reemplazara la pestana completa.'))return;
    const btn=$('manual-publish-d3-btn');btn.disabled=true;btn.textContent='Publicando...';
    try{
      const payload={adminPassword:getAdminPassword(),targetSheet:dash.tab,rows,requiredHeaders:dash.required||['PLAZAS','Aprovechamiento de estructura a hoy'],source:'DashboardsOxxo Admin Manual',sourceFile:'Captura manual',updateMode:'replaceAll'};
      const result=await postAdminPayload(payload);
      OXXO.clearSheetDataCache(dash.tab);
      notifyConfigDate(dash.key);
      btn.textContent='Verificando...';
      const readback=await verifyPublicReadback(dash,result);
      const message=result.compatibilityMode?`Solicitud enviada en modo compatible a ${dash.tab}. Espera unos segundos y valida el dashboard.`:`${rows.length} plaza(s) publicadas en ${dash.tab}.`;
      alert(message+serverVerificationText(result)+readbackText(readback));
    }catch(error){alert('No se pudo publicar: '+error.message);console.error(error);}
    finally{btn.disabled=false;btn.textContent='Publicar';}
  }

  return {
    downloadCsv,
    publishUrl,
    postAdminPayload,
    notifyConfigDate,
    updatePublishState,
    publish,
    publishManual,
    publishManualD3,
    publishManualD2Plan
  };
};
