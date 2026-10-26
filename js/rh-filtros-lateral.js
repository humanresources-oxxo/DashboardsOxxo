/* Consumido por: dashboard-1, dashboard-2, dashboard-4. */
// Filtros en lateral (ver css/rh-filtros-lateral.css). En escritorio ancho el
// selector de region/plaza y estado de tiendas que core.js monta en el
// encabezado se muda al inicio del panel [data-filtros-lateral], para que
// todos los filtros vivan en un solo lugar; por debajo de 1280px regresa a
// donde core.js lo puso. Ademas expone estado(activos): cada tablero le pasa
// los nombres de sus filtros que difieren de lo que deja "Limpiar".
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
    el.classList.toggle('has-active', n>0);
    el.innerHTML=n
      ? `<b>${n}</b> ${n===1?'filtro activo':'filtros activos'}<span>${activos.map(a=>String(a).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))).join(' · ')}</span>`
      : 'Vista estándar<span>Sin filtros extra</span>';
  }

  window.OXXO_FILTROS_LATERAL={ estado, colocar };
  mq.addEventListener('change', colocar);
  let intentos=0;
  const esperar=()=>{ if(!colocar() && intentos++<100) setTimeout(esperar,100); };
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', esperar, { once:true });
  else esperar();
})();
