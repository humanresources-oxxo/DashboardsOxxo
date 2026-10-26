/* Consumido por: dashboard-1, dashboard-2, dashboard-4, dashboard-5, dashboard-6, dashboard-7, dashboard-8, dashboard-9, dashboard-11, dashboard-13. */
// Filtros en lateral (ver css/rh-filtros-lateral.css). En escritorio ancho el
// selector de region/plaza y estado de tiendas que core.js monta en el
// encabezado se muda al inicio del panel [data-filtros-lateral], para que
// todos los filtros vivan en un solo lugar; por debajo de 1280px regresa a
// donde core.js lo puso. Ademas expone estado(activos): cada tablero le pasa
// los nombres de sus filtros que difieren de lo que deja "Limpiar". Los
// tableros que no lo llaman y marcan su panel con data-filtros-auto usan el
// modo automatico (ver contarAuto).
(function(){
  'use strict';
  const mq=window.matchMedia('(min-width: 1280px)');
  let origen=null;

  const panel=()=>document.querySelector('[data-filtros-lateral]');

  function slotAlcance(p){
    let slot=p.querySelector(':scope > .rh-lateral-alcance');
    if(slot) return slot;
    slot=document.createElement('div');
    slot.className='rh-lateral-alcance';
    slot.setAttribute('role','group');
    slot.setAttribute('aria-labelledby','rh-lateral-alcance-label');
    slot.hidden=true;
    slot.innerHTML='<span class="rh-lateral-alcance__label" id="rh-lateral-alcance-label">Región y tiendas</span>';
    const estado=p.querySelector(':scope > .rh-lateral-estado');
    if(estado) estado.after(slot); else p.prepend(slot);
    return slot;
  }

  function colocar(){
    const p=panel();
    const selector=document.querySelector('[data-oxxo-scope-selector]');
    if(!p || !selector) return false;
    const slot=slotAlcance(p);
    if(!origen && !slot.contains(selector)) origen=selector.parentElement;
    const destino=mq.matches ? slot : origen;
    if(destino && selector.parentElement!==destino) destino.appendChild(selector);
    slot.hidden=!mq.matches;
    return true;
  }

  function estado(activos){
    const p=panel();
    if(!p) return;
    let el=p.querySelector(':scope > .rh-lateral-estado');
    if(!el){
      el=document.createElement('p');
      el.className='rh-lateral-estado';
      el.setAttribute('aria-live','polite');
      p.prepend(el);
    }
    const n=activos.length;
    const html=n
      ? `<b>${n}</b> ${n===1?'filtro activo':'filtros activos'}<span>${activos.map(a=>String(a).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))).join(' · ')}</span>`
      : 'Vista estándar<span>Sin filtros extra</span>';
    // Sin cambio no se reescribe: evita mutaciones que el modo automatico
    // volveria a procesar.
    if(el.innerHTML===html) return;
    el.classList.toggle('has-active', n>0);
    el.innerHTML=html;
  }

  // Modo automatico: compara cada control del panel contra una foto de la
  // vista por defecto. La foto se toma en la primera interaccion del usuario
  // con la pagina (antes de que su clic cambie nada, por eso en fase de
  // captura) y se vuelve a tomar despues de "Limpiar", que deja justo la
  // vista por defecto. Solo cuenta los controles del panel; los filtros por
  // clic en un indicador tienen su propio aviso en cada tablero.
  function controlesAuto(p){
    return [...p.querySelectorAll('.vac-fbox')].filter(box=>!box.closest('.rh-lateral-alcance')).flatMap(box=>{
      const nombre=box.querySelector(':scope > label')?.textContent?.trim() || 'Filtro';
      const valores=[];
      box.querySelectorAll('select').forEach(el=>valores.push(el.value));
      box.querySelectorAll('input[type="search"],input[type="text"]').forEach(el=>{ if(!el.closest('.smart-filter__menu')) valores.push(el.value.trim()); });
      box.querySelectorAll('.smart-filter__label').forEach(el=>valores.push(el.textContent.trim()));
      return valores.length ? [[nombre, valores.join('|')]] : [];
    });
  }
  function initAuto(p){
    let base=null;
    const foto=()=>new Map(controlesAuto(p));
    const actualizar=()=>{
      if(!base) return estado([]);
      estado(controlesAuto(p).filter(([nombre,valor])=>base.has(nombre) && base.get(nombre)!==valor).map(([nombre])=>nombre));
    };
    const tomarBase=()=>{ if(!base) base=foto(); };
    ['pointerdown','keydown','focusin'].forEach(tipo=>document.addEventListener(tipo, tomarBase, true));
    document.addEventListener('click', event=>{
      if(event.target.closest?.('button') && /limpiar/i.test(event.target.closest('button').textContent)) setTimeout(()=>{ base=foto(); actualizar(); }, 150);
      else setTimeout(actualizar, 80);
    });
    ['change','input'].forEach(tipo=>document.addEventListener(tipo, ()=>setTimeout(actualizar, 0)));
    new MutationObserver(muts=>{ if(muts.some(m=>!m.target.closest?.('.rh-lateral-estado') && !m.target.parentElement?.closest('.rh-lateral-estado'))) setTimeout(actualizar, 0); })
      .observe(p, { childList:true, subtree:true, characterData:true });
    actualizar();
  }

  window.OXXO_FILTROS_LATERAL={ estado, colocar };
  mq.addEventListener('change', colocar);
  let intentos=0;
  const esperar=()=>{ if(!colocar() && intentos++<100) setTimeout(esperar,100); };
  const iniciar=()=>{
    esperar();
    const p=panel();
    if(p && p.hasAttribute('data-filtros-auto')) initAuto(p);
  };
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', iniciar, { once:true });
  else iniciar();
})();
