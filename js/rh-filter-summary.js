/* Consumido por: dashboard-1, dashboard-12, dashboard-13, dashboard-2, dashboard-3, dashboard-4, dashboard-5, dashboard-6, dashboard-7, dashboard-8. */
(function(){
  'use strict';

  const states=new WeakMap();
  const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
  const defaultText=value=>{
    const text=normalize(value);
    return !text || /^(todos?|todas?)(\s|$)/.test(text) || text.includes('tiendas operativas') || text.includes('buscar tienda') || /^\d+ asesores seleccionados$/.test(text) || /^\d+ puestos seleccionados$/.test(text) || /^\d+ antiguedades$/.test(text);
  };

  function titleFor(control){
    const box=control.closest('.vac-fbox,.filter-box');
    return box?.querySelector(':scope > label,.filter-title')?.childNodes?.[0]?.textContent?.trim() || control.getAttribute('aria-label') || 'Filtro';
  }

  function activeFilters(container){
    const found=[];
    container.querySelectorAll('select').forEach(select=>{
      if(select.closest('.rh-table-toolbar'))return;
      const option=select.selectedOptions?.[0];
      const value=String(select.value||'').trim();
      const label=option?.textContent?.trim()||value;
      if(value && !defaultText(label))found.push(`${titleFor(select)}: ${label}`);
    });
    container.querySelectorAll('input[type="text"],input[type="search"]').forEach(input=>{
      if(input.closest('.smart-filter__menu') || input.closest('.rh-table-toolbar'))return;
      const value=String(input.value||'').trim();
      if(value)found.push(`${titleFor(input)}: ${value}`);
    });
    container.querySelectorAll('.smart-filter__button').forEach(button=>{
      const label=button.querySelector('.smart-filter__label')?.textContent?.trim()||button.textContent.trim();
      if(!defaultText(label))found.push(`${titleFor(button)}: ${label}`);
    });
    return [...new Set(found)];
  }

  function findActionLabel(container){
    const boxes=[...container.querySelectorAll('.vac-fbox,.filter-box')];
    const actionBox=boxes.find(box=>/filtros|acciones/i.test(box.querySelector(':scope > label,.filter-title')?.textContent||'')) || boxes.at(-1);
    return actionBox?.querySelector(':scope > label,.filter-title')||null;
  }

  function enhance(container){
    if(container.querySelector('#filter-status'))return;
    let state=states.get(container);
    const ensureBadge=()=>{
      if(state.badge?.isConnected)return state.badge;
      const label=findActionLabel(container);
      if(!label)return null;
      const badge=document.createElement('span');
      badge.className='rh-filter-summary-badge';
      badge.setAttribute('aria-live','polite');
      label.appendChild(badge);
      state.badge=badge;
      return badge;
    };
    const update=()=>{
      const badge=ensureBadge();
      if(!badge)return;
      const filters=activeFilters(container);
      const text=filters.length ? `${filters.length} ${filters.length===1?'activo':'activos'}` : 'Sin filtros extra';
      if(badge.textContent!==text)badge.textContent=text;
      badge.classList.toggle('has-active',filters.length>0);
      badge.title=filters.length ? filters.join(' · ') : 'No hay filtros adicionales aplicados';
    };
    if(!state){
      state={badge:null};
      states.set(container,state);
      container.addEventListener('change',()=>setTimeout(update,0));
      container.addEventListener('input',()=>setTimeout(update,0));
      container.addEventListener('click',()=>setTimeout(update,80));
      new MutationObserver(()=>setTimeout(update,0)).observe(container,{childList:true,subtree:true,characterData:true});
    }
    update();
  }

  function scan(){document.querySelectorAll('.vac-filters,.bajas-filters').forEach(enhance);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',scan,{once:true});else scan();
  new MutationObserver(scan).observe(document.documentElement,{childList:true,subtree:true});
})();
