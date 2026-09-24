/* Carga diferida de librerias del panel admin (CDN jsDelivr, 20 s de tope).
   Solo admin.html la consume. Tras desbloquear el panel se precalienta UNICAMENTE
   XLSX (lo necesita cualquier carga de Excel); JSZip y PptxGenJS (~500 KB) se
   piden solo cuando alguien exporta, con ensure('pptx') / ensure('jszip'). */
(function(){
  const assets={
    xlsx:{src:'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',ready:()=>Boolean(window.XLSX)},
    jszip:{src:'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js',ready:()=>Boolean(window.JSZip)},
    pptx:{src:'https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js',ready:()=>Boolean(window.PptxGenJS),deps:['jszip']}
  };
  const pending=new Map();

  function load(name){
    const asset=assets[name];
    if(!asset)return Promise.reject(new Error(`Recurso desconocido: ${name}`));
    if(asset.ready())return Promise.resolve();
    if(pending.has(name))return pending.get(name);
    const promise=Promise.all((asset.deps||[]).map(load)).then(()=>new Promise((resolve,reject)=>{
      if(asset.ready()){resolve();return;}
      const script=document.createElement('script');
      const timeout=setTimeout(()=>{
        script.remove();
        pending.delete(name);
        reject(new Error(`La carga de ${name} excedio el tiempo de espera.`));
      },20000);
      script.src=asset.src;
      script.async=true;
      script.crossOrigin='anonymous';
      script.onload=()=>{
        clearTimeout(timeout);
        if(asset.ready())resolve();
        else reject(new Error(`${name} no quedo disponible.`));
      };
      script.onerror=()=>{
        clearTimeout(timeout);
        pending.delete(name);
        reject(new Error(`No se pudo descargar ${name}.`));
      };
      document.head.appendChild(script);
    }));
    const tracked=promise.catch(error=>{
      pending.delete(name);
      throw error;
    });
    pending.set(name,tracked);
    return tracked;
  }

  function ensure(...names){return Promise.all(names.flat().map(load));}
  function warmup(){return load('xlsx');}
  window.OXXO_ADMIN_ASSETS={ensure,warmup};
})();
