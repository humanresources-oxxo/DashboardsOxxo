(function(){
  'use strict';

  const states=new WeakMap();
  const norm=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
  const rowText=row=>norm([...row.cells].map(cell=>cell.textContent).join(' '));

  function numericValue(value){
    const raw=String(value||'').trim();
    if(!raw)return null;
    const cleaned=raw.replace(/[$%\s,]/g,'');
    if(!/^[+-]?\d+(?:\.\d+)?$/.test(cleaned))return null;
    return Number(cleaned);
  }

  function compareCells(a,b,index){
    const av=a.cells[index]?.textContent||'',bv=b.cells[index]?.textContent||'';
    const an=numericValue(av),bn=numericValue(bv);
    if(an!==null&&bn!==null)return an-bn;
    return av.localeCompare(bv,'es',{numeric:true,sensitivity:'base'});
  }

  function titleFor(table){
    const card=table.closest('.card,.panel,.inv-panel');
    return card?.querySelector('.card-title,h2')?.textContent?.replace(/\s+/g,' ').trim()||'esta tabla';
  }

  function makeToolbar(table,state){
    // Tablas cortas (un puñado de filas) no ganan nada con buscador ni
    // paginacion: con data-rh-toolbar="false" se omite la barra completa y
    // solo se conserva el ordenamiento por encabezado.
    if(table.dataset.rhToolbar==='false')return;
    const toolbar=document.createElement('div');
    toolbar.className='rh-table-toolbar';
    toolbar.innerHTML=`
      <label class="rh-table-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-4-4"></path></svg><input type="search" autocomplete="off" placeholder="Buscar en ${titleFor(table)}…" aria-label="Buscar en ${titleFor(table)}"></label>
      <div class="rh-table-count">— registros</div>
      <div class="rh-table-pager"><select class="rh-table-page-size" aria-label="Filas por página"><option value="10">10 filas</option><option value="15">15 filas</option><option value="25">25 filas</option><option value="50">50 filas</option></select><button type="button" class="rh-table-page-button rh-prev" aria-label="Página anterior">‹</button><span class="rh-table-page-info">Página 1 de 1</span><button type="button" class="rh-table-page-button rh-next" aria-label="Página siguiente">›</button></div>`;
    if(table.dataset.rhSearch==='false')toolbar.querySelector('.rh-table-search').hidden=true;
    state.toolbar=toolbar;
    state.input=toolbar.querySelector('input');
    state.count=toolbar.querySelector('.rh-table-count');
    state.pager=toolbar.querySelector('.rh-table-pager');
    state.pageInfo=toolbar.querySelector('.rh-table-page-info');
    state.pageSelect=toolbar.querySelector('.rh-table-page-size');
    state.prev=toolbar.querySelector('.rh-prev');
    state.next=toolbar.querySelector('.rh-next');
    state.pageSelect.value=String(state.pageSize);
    const wrap=table.closest('.tbl-wrap,.table-wrapper')||table;
    // El MutationObserver que llama a enhance() es asincrono: cuando corre, la
    // tabla que lo disparo ya puede haber salido del DOM (los dashboards
    // reconstruyen sus tablas al filtrar). Sin esta guarda, parentNode venia
    // nulo y el throw abortaba el forEach del observer -- asi que las tablas
    // siguientes se quedaban TAMBIEN sin barra. Medido en Dashboard 2: al
    // filtrar por asesor, las barras pasaban de 2 a 0 y no volvian.
    if(!wrap.parentNode)return;
    wrap.parentNode.insertBefore(toolbar,wrap);
    let timer;
    state.input.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(()=>{state.query=norm(state.input.value);state.page=1;refresh(table);},100);});
    state.pageSelect.addEventListener('change',()=>{state.pageSize=Number(state.pageSelect.value)||15;state.page=1;refresh(table);});
    state.prev.addEventListener('click',()=>{if(state.page>1){state.page--;refresh(table);}});
    state.next.addEventListener('click',()=>{if(state.page<state.totalPages){state.page++;refresh(table);}});
  }

  function bindHeaders(table,state){
    const sorting=table.dataset.rhSort!=='false';
    table.querySelectorAll('thead th').forEach((th,index)=>{
      if(!sorting||th.rowSpan>1||th.colSpan>1)return;
      th.classList.add('rh-sortable');
      if(th.dataset.rhSortBound)return;
      th.dataset.rhSortBound='1';
      th.addEventListener('click',()=>{
        if(state.sortIndex===index)state.sortDirection=state.sortDirection==='asc'?'desc':'asc';
        else{state.sortIndex=index;state.sortDirection='asc';}
        state.page=1;refresh(table);
      });
    });
  }

  function updateHeaders(table,state){
    table.querySelectorAll('thead th').forEach((th,index)=>{
      const active=index===state.sortIndex;
      th.classList.toggle('rh-sort-asc',active&&state.sortDirection==='asc');
      th.classList.toggle('rh-sort-desc',active&&state.sortDirection==='desc');
      if(th.classList.contains('rh-sortable'))th.setAttribute('aria-sort',active?(state.sortDirection==='asc'?'ascending':'descending'):'none');
    });
  }

  function refresh(table){
    const state=states.get(table),tbody=table.tBodies[0];
    if(!state||!tbody)return;
    bindHeaders(table,state);
    let rows=[...tbody.rows].filter(row=>!row.classList.contains('rh-table-empty-filter'));
    const placeholder=rows.length===1&&rows[0].cells.length===1&&rows[0].cells[0].colSpan>1;
    if(state.toolbar)state.toolbar.hidden=placeholder;
    if(placeholder)return;
    if(state.sortIndex!==null){
      rows.sort((a,b)=>compareCells(a,b,state.sortIndex)*(state.sortDirection==='asc'?1:-1));
      state.observer?.disconnect();
      rows.forEach(row=>tbody.appendChild(row));
      state.observer?.observe(tbody,{childList:true,subtree:true,characterData:true});
    }
    const matched=rows.filter(row=>!state.query||rowText(row).includes(state.query));
    state.totalPages=Math.max(1,Math.ceil(matched.length/state.pageSize));
    state.page=Math.min(state.page,state.totalPages);
    const start=(state.page-1)*state.pageSize,end=start+state.pageSize;
    rows.forEach(row=>{row.hidden=true;});
    matched.slice(start,end).forEach(row=>{row.hidden=false;});
    let empty=tbody.querySelector('.rh-table-empty-filter');
    if(!matched.length&&rows.length){
      if(!empty){empty=document.createElement('tr');empty.className='rh-table-empty-filter';empty.innerHTML=`<td colspan="${Math.max(1,table.rows[0]?.cells.length||1)}">No hay coincidencias para esta búsqueda.</td>`;tbody.appendChild(empty);}
      empty.hidden=false;
    }else if(empty)empty.remove();
    if(state.count)state.count.textContent=`${matched.length} ${matched.length===1?'registro':'registros'}`;
    if(state.pageInfo)state.pageInfo.textContent=`Página ${state.page} de ${state.totalPages}`;
    if(state.prev)state.prev.disabled=state.page<=1;
    if(state.next)state.next.disabled=state.page>=state.totalPages;
    if(state.pager)state.pager.hidden=matched.length<=state.pageSize;
    updateHeaders(table,state);
  }

  function enhance(table){
    if(states.has(table))return;
    const requested=Number(table.dataset.rhPageSize)||15;
    const allowed=[10,15,25,50];
    const sinBarra=table.dataset.rhToolbar==='false';
    const state={page:1,pageSize:sinBarra?Number.MAX_SAFE_INTEGER:(allowed.includes(requested)?requested:15),
      totalPages:1,query:'',sortIndex:null,sortDirection:'asc',observer:null};
    states.set(table,state);
    table.dataset.rhTableTools='ready';
    makeToolbar(table,state);
    const observeBody=()=>{
      const tbody=table.tBodies[0];if(!tbody)return;
      state.observer?.disconnect();
      state.observer=new MutationObserver(()=>{state.page=1;refresh(table);});
      state.observer.observe(tbody,{childList:true,subtree:true,characterData:true});
      refresh(table);
    };
    observeBody();
    new MutationObserver(()=>{if(table.tBodies[0]&&table.tBodies[0]!==state.observedBody){state.observedBody=table.tBodies[0];observeBody();}else refresh(table);}).observe(table,{childList:true});
  }

  function scan(root=document){root.querySelectorAll?.('table[data-rh-tools]').forEach(enhance);}
  document.addEventListener('DOMContentLoaded',()=>{
    scan();
    new MutationObserver(records=>records.forEach(record=>record.addedNodes.forEach(node=>{if(node.nodeType===1){if(node.matches?.('table[data-rh-tools]'))enhance(node);scan(node);}}))).observe(document.body,{childList:true,subtree:true});
  });
})();
