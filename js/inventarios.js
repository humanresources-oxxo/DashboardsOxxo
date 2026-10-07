(function(){
  'use strict';

  const TAB=OXXO.SHEETS_CONFIG.TABS.inventories||'Inventarios';
  const charts={trend:null,types:null,stores:null};
  let records=[];
  let advisorCatalog=null;
  let filtered=[];
  let currentPage=1;
  let pageSize=25;
  let controlsBound=false;
  const tableSort={key:'finalResult',direction:'desc'};

  const $=id=>document.getElementById(id);
  const norm=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
  const esc=value=>String(value==null?'':value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');

  function valueByAlias(row,aliases){
    const lookup=new Map(Object.keys(row||{}).map(key=>[norm(key),row[key]]));
    for(const alias of aliases){if(lookup.has(norm(alias)))return lookup.get(norm(alias));}
    return '';
  }
  function keyByAlias(row,aliases){
    const lookup=new Map(Object.keys(row||{}).map(key=>[norm(key),key]));
    for(const alias of aliases){if(lookup.has(norm(alias)))return lookup.get(norm(alias));}
    return '';
  }

  function parseNumber(value){
    if(typeof value==='number')return Number.isFinite(value)?value:0;
    let raw=String(value??'').trim();
    if(!raw||raw==='-')return 0;
    const isPercent=raw.includes('%');
    raw=raw.replace(/[$%\s]/g,'').replace(/[^0-9,.-]/g,'');
    if(raw.includes(',')&&raw.includes('.'))raw=raw.replace(/,/g,'');
    else if(raw.includes(',')){
      const parts=raw.split(',');
      // Google Sheets returns decimal commas for this Spanish-locale tab,
      // including ratios with six or more decimal places.
      raw=parts.length===2?parts.join('.'):parts.join('');
    }
    const parsed=Number(raw);
    if(!Number.isFinite(parsed))return 0;
    return isPercent&&Math.abs(parsed)>1?parsed/100:parsed;
  }

  function parseDate(value){
    if(value instanceof Date&&!Number.isNaN(value.getTime()))return value;
    const raw=String(value||'').trim();
    if(!raw||raw==='-')return null;
    let match=raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if(match)return new Date(Number(match[1]),Number(match[2])-1,Number(match[3]));
    match=raw.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})/);
    if(match){const year=Number(match[3])+(match[3].length===2?2000:0);return new Date(year,Number(match[2])-1,Number(match[1]));}
    if(/^\d+(?:\.\d+)?$/.test(raw))return new Date(1899,11,30+Math.floor(Number(raw)));
    const parsed=new Date(raw);return Number.isNaN(parsed.getTime())?null:parsed;
  }

  function periodKey(value){
    const raw=String(value||'').trim();
    if(!raw)return '';
    const direct=raw.match(/^(20\d{2})[-/](\d{1,2})/);
    if(direct)return `${direct[1]}-${String(direct[2]).padStart(2,'0')}`;
    const normalized=norm(raw);
    const months=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    const month=months.findIndex(name=>normalized.includes(name));
    const year=normalized.match(/20\d{2}/)?.[0];
    if(month>=0&&year)return `${year}-${String(month+1).padStart(2,'0')}`;
    const date=parseDate(raw);return date?`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`:raw;
  }

  const MONTHS=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  function monthlyField(row,prefix,period,offset){
    const match=String(period||'').match(/^(20\d{2})-(\d{2})$/);
    if(!match)return null;
    const date=new Date(Number(match[1]),Number(match[2])-1+offset,1);
    const expected=norm(`${prefix}${MONTHS[date.getMonth()]}`);
    const key=Object.keys(row||{}).find(name=>norm(name)===expected);
    return key?parseNumber(row[key]):null;
  }

  function formatPeriod(key){
    const match=String(key||'').match(/^(20\d{2})-(\d{2})$/);
    if(!match)return key||'Sin periodo';
    return new Intl.DateTimeFormat('es-MX',{month:'long',year:'numeric'}).format(new Date(Number(match[1]),Number(match[2])-1,1));
  }

  function formatDate(date){return date?new Intl.DateTimeFormat('es-MX',{day:'2-digit',month:'short',year:'numeric'}).format(date):'Sin fecha';}
  function formatMoney(value){return new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:0}).format(value||0);}
  function formatMoneyCompact(value){return new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',notation:'compact',maximumFractionDigits:1}).format(value||0);}
  function formatPercent(value){return new Intl.NumberFormat('es-MX',{style:'percent',minimumFractionDigits:2,maximumFractionDigits:2}).format(value||0);}
  function itemRatio(item){return item.totalSales?item.finalResult/item.totalSales:item.finalRatio;}
  function ratioTone(value){return value>.01?'ratio-critical':value>.005?'ratio-watch':'ratio-good';}

  function mapRecord(row,index){
    const inventoryDate=parseDate(valueByAlias(row,['Fecha de Inventario','Fecha Inventario','Fecha inventario actual']));
    let period=periodKey(valueByAlias(row,['Periodo','Período','Mes','Corte']));
    if(!period&&inventoryDate)period=`${inventoryDate.getFullYear()}-${String(inventoryDate.getMonth()+1).padStart(2,'0')}`;
    return{
      id:index,
      period,
      cr:String(valueByAlias(row,['CR','Código CR','Codigo CR'])||'').trim(),
      store:String(valueByAlias(row,['Tienda','Nombre Tienda'])||'').trim(),
      plaza:OXXO.metricsCanonicalPlazaLabel(String(valueByAlias(row,['Plaza'])||'Oaxaca').trim()),
      advisor:OXXO.resolveAsesorD1(advisorCatalog,{cr:valueByAlias(row,['CR','Código CR','Codigo CR']),tienda:valueByAlias(row,['Tienda','Nombre Tienda']),asesor:valueByAlias(row,['Asesor Comercial','Asesor','AT'])}) || 'Sin asesor',
      previousDate:parseDate(valueByAlias(row,['Fecha de Inventario Anterior','Fecha Inventario Anterior'])),
      inventoryDate,
      days:parseNumber(valueByAlias(row,['# Días de Inventario','Dias de Inventario','Días de Inventario'])),
      inventoryResult:parseNumber(valueByAlias(row,['Resultado de Inventario','Resultado Inventario'])),
      monthResult:parseNumber(valueByAlias(row,['Resultado del Mes Actual','Resultado Mes Actual'])),
      difference:parseNumber(valueByAlias(row,['Diferencias','Diferencia'])),
      monthSales:parseNumber(valueByAlias(row,['Ventas sin TAE del mes','Ventas sin TAE Mes','Venta sin TAE del mes'])),
      monthRatio:parseNumber(valueByAlias(row,['% Merma / Vta sin TAE del Mes','% Merma/Venta Mes','Porcentaje Merma Mes'])),
      type:String(valueByAlias(row,['Tipo Inventario','Tipo de Inventario'])||'Sin tipo').trim(),
      resultPrev2:monthlyField(row,'Resultado Inventarios',period,-2)??parseNumber(valueByAlias(row,['Resultado Mes -2','Resultado M-2'])),
      resultPrev1:monthlyField(row,'Resultado Inventarios',period,-1)??parseNumber(valueByAlias(row,['Resultado Mes -1','Resultado M-1'])),
      resultCurrent:monthlyField(row,'Resultado Inventarios',period,0)??parseNumber(valueByAlias(row,['Resultado Mes Vigente','Resultado M','Resultado del Mes Actual'])),
      finalResult:parseNumber(valueByAlias(row,['Resultado de Merma (Final c/s proyectos)','Resultado de Merma  (Final c/s proyectos)','Resultado Merma Final','Resultado Final'])),
      salesPrev2:monthlyField(row,'Ventas',period,-2)??parseNumber(valueByAlias(row,['Ventas Mes -2','Ventas M-2'])),
      salesPrev1:monthlyField(row,'Ventas',period,-1)??parseNumber(valueByAlias(row,['Ventas Mes -1','Ventas M-1'])),
      salesCurrent:monthlyField(row,'Ventas',period,0)??parseNumber(valueByAlias(row,['Ventas Mes Vigente','Ventas M','Ventas sin TAE del mes'])),
      totalSales:parseNumber(valueByAlias(row,['SUMA TOTAL VTA S/TAE','Suma Total Ventas sin TAE','Total Ventas sin TAE'])),
      finalRatio:parseNumber(valueByAlias(row,['% Merma / Vta sin TAE (Final c/s proyectos)','% Merma/Venta Final','Porcentaje Merma Final'])),
      notes:String(valueByAlias(row,['Observaciones','Notas'])||'').trim(),
      source:row
    };
  }

  function sum(data,key){return data.reduce((total,item)=>total+(Number(item[key])||0),0);}
  function unique(data,key){return [...new Set(data.map(item=>item[key]).filter(Boolean))];}
  function aggregateBy(data,key){
    const map=new Map();
    data.forEach(item=>{const name=item[key]||'Sin dato';const current=map.get(name)||[];current.push(item);map.set(name,current);});
    return [...map].map(([name,items])=>({name,items,count:items.length,result:sum(items,'finalResult'),sales:sum(items,'totalSales')}));
  }

  function fillSelect(select,values,labeler=value=>value){
    const first=select.options[0];select.innerHTML='';select.appendChild(first);
    values.forEach(value=>{const option=document.createElement('option');option.value=value;option.textContent=labeler(value);select.appendChild(option);});
  }

  function chartDefaults(){
    if(typeof Chart==='undefined')return;
    Chart.defaults.font.family=getComputedStyle(document.body).getPropertyValue('--font-body')||'Arial';
    Chart.defaults.color='#617987';
    Chart.defaults.borderColor='rgba(101,82,154,.09)';
  }

  function destroyChart(name){if(charts[name]){charts[name].destroy();charts[name]=null;}}
  function emptyChart(canvasId,message){const canvas=$(canvasId);if(!canvas)return;const parent=canvas.parentElement;parent.querySelector('.inv-chart-empty')?.remove();const empty=document.createElement('div');empty.className='inv-chart-empty inv-panel-empty';empty.textContent=message;parent.appendChild(empty);canvas.style.visibility='hidden';}
  function showCanvas(canvasId){const canvas=$(canvasId);if(canvas){canvas.style.visibility='visible';canvas.parentElement.querySelector('.inv-chart-empty')?.remove();}}

  function trendLabels(){
    const selected=$('filter-period').value||filtered.find(item=>item.period)?.period;
    const match=String(selected||'').match(/^(20\d{2})-(\d{2})$/);
    if(!match)return['Mes -2','Mes -1','Mes actual'];
    const base=new Date(Number(match[1]),Number(match[2])-1,1);
    return[-2,-1,0].map(offset=>new Intl.DateTimeFormat('es-MX',{month:'short',year:'2-digit'}).format(new Date(base.getFullYear(),base.getMonth()+offset,1)));
  }

  function renderTrend(){
    destroyChart('trend');
    if(!filtered.length||typeof Chart==='undefined'){emptyChart('chart-trend','Sin datos para la tendencia');return;}
    showCanvas('chart-trend');
    const ctx=$('chart-trend').getContext('2d');
    charts.trend=new Chart(ctx,{type:'bar',data:{labels:trendLabels(),datasets:[
      {label:'Resultado',data:[sum(filtered,'resultPrev2'),sum(filtered,'resultPrev1'),sum(filtered,'resultCurrent')],backgroundColor:['rgba(161,143,203,.72)','rgba(128,106,178,.80)','rgba(101,82,154,.9)'],borderRadius:8,yAxisID:'y'},
      {type:'line',label:'Venta',data:[sum(filtered,'salesPrev2'),sum(filtered,'salesPrev1'),sum(filtered,'salesCurrent')],borderColor:'#b9aae1',backgroundColor:'#b9aae1',borderWidth:3,pointRadius:4,pointBackgroundColor:'#fff',pointBorderWidth:2,tension:.32,yAxisID:'y1'}
    ]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},plugins:{legend:{display:false},tooltip:{callbacks:{label:context=>`${context.dataset.label}: ${formatMoney(context.raw)}`}}},scales:{x:{grid:{display:false},ticks:{font:{weight:'700'}}},y:{beginAtZero:true,grid:{color:'rgba(101,82,154,.08)'},ticks:{callback:value=>formatMoneyCompact(value)}},y1:{beginAtZero:true,position:'right',grid:{display:false},ticks:{callback:value=>formatMoneyCompact(value)}}}}});
  }

  function renderTypes(){
    destroyChart('types');
    const data=aggregateBy(filtered,'type').sort((a,b)=>b.count-a.count);
    $('type-total').textContent=filtered.length;
    if(!data.length||typeof Chart==='undefined'){emptyChart('chart-types','Sin tipos disponibles');return;}
    showCanvas('chart-types');
    charts.types=new Chart($('chart-types').getContext('2d'),{type:'doughnut',data:{labels:data.map(item=>item.name),datasets:[{data:data.map(item=>item.count),backgroundColor:['#403265','#51407d','#65529a','#806ab2','#9d8bc8','#b9aae1','#d8d0ec'],borderColor:'#fff',borderWidth:3,hoverOffset:4}]},options:{responsive:true,maintainAspectRatio:false,cutout:'72%',plugins:{legend:{position:'bottom',labels:{boxWidth:9,usePointStyle:true,pointStyle:'circle',padding:12,font:{size:9,weight:'700'}}},tooltip:{callbacks:{label:context=>`${context.label}: ${context.raw} registros`}}}}});
  }

  function renderStores(){
    destroyChart('stores');
    const data=aggregateBy(filtered,'cr').map(group=>({...group,store:group.items[0]?.store||group.name})).sort((a,b)=>b.result-a.result).slice(0,10);
    if(!data.length||typeof Chart==='undefined'){emptyChart('chart-stores','Sin tiendas para mostrar');return;}
    showCanvas('chart-stores');
    charts.stores=new Chart($('chart-stores').getContext('2d'),{type:'bar',data:{labels:data.map(item=>item.store),datasets:[{data:data.map(item=>item.result),backgroundColor:data.map((_,index)=>`rgba(101,82,154,${.94-index*.055})`),borderRadius:7,barThickness:15}]},options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:context=>formatMoney(context.raw)}}},scales:{x:{beginAtZero:true,grid:{color:'rgba(101,82,154,.08)'},ticks:{callback:value=>formatMoneyCompact(value)}},y:{grid:{display:false},ticks:{font:{size:10,weight:'700'},callback:function(value){const label=this.getLabelForValue(value);return label.length>22?`${label.slice(0,22)}…`:label;}}}}}});
  }

  function renderAdvisors(){
    const data=aggregateBy(filtered,'advisor').sort((a,b)=>b.result-a.result);
    $('advisor-count').textContent=`${data.length} ${data.length===1?'asesor':'asesores'}`;
    if(!data.length){$('advisor-list').innerHTML='<div class="inv-panel-empty">Sin asesores para mostrar</div>';return;}
    const max=Math.max(...data.map(item=>Math.abs(item.result)),1);
    $('advisor-list').innerHTML=data.map(item=>{const ratio=item.sales?item.result/item.sales:0;return `<div class="inv-advisor-row"><div class="inv-advisor-name"><strong>${esc(item.name)}</strong><small>${item.count} ${item.count===1?'registro':'registros'}</small></div><div class="inv-advisor-bar"><i style="width:${Math.max(3,Math.abs(item.result)/max*100).toFixed(1)}%"></i></div><div class="inv-advisor-value"><strong>${esc(formatMoneyCompact(item.result))}</strong><small>${esc(formatPercent(ratio))}</small></div></div>`;}).join('');
  }

  function renderTable(){
    $('detail-count').textContent=`${filtered.length} ${filtered.length===1?'registro':'registros'}`;
    updateSortHeaders();
    if(!filtered.length){
      currentPage=1;
      $('inventory-table').innerHTML='<tr><td colspan="8" class="inv-table-message">No hay registros con los filtros seleccionados.</td></tr>';
      renderPagination(1,0,0);
      return;
    }
    const sorted=[...filtered].sort((a,b)=>compareTableItems(a,b,tableSort.key)*(tableSort.direction==='asc'?1:-1));
    const totalPages=Math.max(1,Math.ceil(sorted.length/pageSize));
    currentPage=Math.min(currentPage,totalPages);
    const start=(currentPage-1)*pageSize;
    const pageRows=sorted.slice(start,start+pageSize);
    $('inventory-table').innerHTML=pageRows.map(item=>{const ratio=itemRatio(item);return `<tr><td><strong>${esc(item.cr||'—')}</strong></td><td>${esc(item.store||'Sin nombre')}</td><td>${esc(item.advisor)}</td><td>${esc(formatDate(item.inventoryDate))}</td><td>${esc(item.type)}</td><td class="num"><strong>${esc(formatMoney(item.finalResult))}</strong></td><td class="num">${esc(formatMoney(item.totalSales))}</td><td class="num"><span class="ratio-pill ${ratioTone(ratio)}">${esc(formatPercent(ratio))}</span></td></tr>`;}).join('');
    renderPagination(totalPages,start,pageRows.length);
  }

  function sortValue(item,key){
    if(key==='ratio')return itemRatio(item);
    if(key==='inventoryDate')return item.inventoryDate?.getTime()||0;
    return item[key];
  }
  function compareTableItems(a,b,key){
    const av=sortValue(a,key),bv=sortValue(b,key);
    if(typeof av==='number'||typeof bv==='number')return(Number(av)||0)-(Number(bv)||0);
    return String(av||'').localeCompare(String(bv||''),'es',{numeric:true,sensitivity:'base'});
  }
  function updateSortHeaders(){
    document.querySelectorAll('.inv-table th.sortable').forEach(th=>{
      const active=th.dataset.sort===tableSort.key;
      th.classList.toggle('sort-asc',active&&tableSort.direction==='asc');
      th.classList.toggle('sort-desc',active&&tableSort.direction==='desc');
      th.setAttribute('aria-sort',active?(tableSort.direction==='asc'?'ascending':'descending'):'none');
    });
  }
  function renderPagination(totalPages,start,count){
    const end=start+count;
    $('inventory-page-summary').textContent=filtered.length?`Mostrando ${start+1}–${end} de ${filtered.length} · Página ${currentPage} de ${totalPages}`:'Sin resultados';
    const pages=[...new Set([1,currentPage-1,currentPage,currentPage+1,totalPages].filter(page=>page>=1&&page<=totalPages))].sort((a,b)=>a-b);
    let last=0;
    const pageButtons=[];
    pages.forEach(page=>{if(last&&page-last>1)pageButtons.push('<span class="inv-page-ellipsis">…</span>');pageButtons.push(`<button type="button" class="inv-page-button${page===currentPage?' active':''}" data-page="${page}" aria-label="Ir a la página ${page}"${page===currentPage?' aria-current="page"':''}>${page}</button>`);last=page;});
    $('inventory-page-buttons').innerHTML=`<button type="button" class="inv-page-button" data-page="${currentPage-1}" aria-label="Página anterior" ${currentPage<=1?'disabled':''}>‹</button>${pageButtons.join('')}<button type="button" class="inv-page-button" data-page="${currentPage+1}" aria-label="Página siguiente" ${currentPage>=totalPages?'disabled':''}>›</button>`;
  }

  function renderKpis(){
    const stores=unique(filtered,'cr').length;
    const inventoried=unique(filtered.filter(item=>item.inventoryDate),'cr').length;
    const result=sum(filtered,'finalResult');
    const sales=sum(filtered,'totalSales');
    const ratio=sales?result/sales:0;
    $('kpi-stores').textContent=stores.toLocaleString('es-MX');
    $('kpi-records').textContent=`${filtered.length} registros cargados`;
    $('kpi-inventories').textContent=inventoried.toLocaleString('es-MX');
    $('kpi-coverage').textContent=stores?`${Math.round(inventoried/stores*100)}% de cobertura`:'Sin cobertura';
    $('kpi-result').textContent=formatMoneyCompact(result);
    $('kpi-sales').textContent=formatMoneyCompact(sales);
    $('kpi-ratio').textContent=formatPercent(ratio);
    $('kpi-ratio-note').textContent='Resultado final / venta total';
  }

  function applyFilters(){
    const period=$('filter-period').value;
    const advisor=$('filter-advisor').value;
    const type=$('filter-type').value;
    const search=norm($('detail-search').value||$('filter-store').value);
    filtered=records.filter(item=>{
      const searchable=norm(`${item.cr} ${item.store} ${item.advisor} ${item.type} ${formatDate(item.inventoryDate)} ${item.period} ${item.finalResult} ${item.totalSales} ${item.finalRatio}`);
      return(!period||item.period===period)&&(!advisor||item.advisor===advisor)&&(!type||item.type===type)&&(!search||searchable.includes(search));
    });
    currentPage=1;
    $('inventory-results').textContent=`Mostrando ${filtered.length} de ${records.length} registros`;
    $('inventory-period-note').textContent=period?`Corte: ${formatPeriod(period)}`:'Todos los periodos';
    renderKpis();renderTrend();renderTypes();renderStores();renderAdvisors();renderTable();
  }

  function showSetup(){
    ['kpi-stores','kpi-inventories','kpi-result','kpi-sales','kpi-ratio'].forEach(id=>$(id).textContent='0');
    $('inventory-results').textContent='Configuración pendiente';
    $('inventory-cut').innerHTML='<span></span>Esperando pestaña Inventarios';
    document.querySelector('.inv-analysis-grid').innerHTML='<article class="inv-panel inv-setup" style="grid-column:1/-1"><h2>Prepara la pestaña “Inventarios”</h2><p>Copia la base consolidada del Excel y agrega “Periodo” como primera columna. El dashboard reconocerá los encabezados originales automáticamente.</p><code>Periodo · # · CR · Tienda · Plaza · Asesor Comercial · … · Observaciones</code></article>';
    $('inventory-table').innerHTML='<tr><td colspan="8" class="inv-table-message">La pestaña Inventarios todavía no tiene datos.</td></tr>';
  }

  function downloadFiltered(){
    const rows=filtered.map(item=>({Periodo:item.period,CR:item.cr,Tienda:item.store,Plaza:item.plaza,'Asesor Comercial':item.advisor,'Fecha de Inventario':item.inventoryDate?item.inventoryDate.toISOString().slice(0,10):'', 'Tipo Inventario':item.type,'Resultado de Merma Final':item.finalResult,'Total Ventas sin TAE':item.totalSales,'% Merma / Venta Final':item.totalSales?item.finalResult/item.totalSales:item.finalRatio,Observaciones:item.notes}));
    OXXO.downloadRowsAsCSV(rows,`inventarios-filtrados-${new Date().toISOString().slice(0,10)}.csv`);
  }

  function bind(){
    if(controlsBound)return;
    controlsBound=true;
    ['filter-period','filter-advisor','filter-type'].forEach(id=>$(id).addEventListener('change',applyFilters));
    let timer;
    const queueSearch=()=>{clearTimeout(timer);timer=setTimeout(applyFilters,120);};
    $('filter-store').addEventListener('input',event=>{$('detail-search').value=event.target.value;queueSearch();});
    $('detail-search').addEventListener('input',event=>{$('filter-store').value=event.target.value;queueSearch();});
    $('filter-reset').addEventListener('click',()=>{$('filter-period').value='';$('filter-advisor').value='';$('filter-type').value='';$('filter-store').value='';$('detail-search').value='';applyFilters();});
    $('download-inventory').addEventListener('click',downloadFiltered);
    document.querySelector('.inv-table thead').addEventListener('click',event=>{const th=event.target.closest('th[data-sort]');if(!th)return;tableSort.direction=tableSort.key===th.dataset.sort&&tableSort.direction==='asc'?'desc':'asc';tableSort.key=th.dataset.sort;currentPage=1;renderTable();});
    $('inventory-page-size').addEventListener('change',event=>{pageSize=Number(event.target.value)||25;currentPage=1;renderTable();});
    $('inventory-page-buttons').addEventListener('click',event=>{const button=event.target.closest('button[data-page]');if(!button||button.disabled)return;currentPage=Number(button.dataset.page)||1;renderTable();document.querySelector('.inv-table-wrap').scrollTop=0;});
  }

  async function init(){
    chartDefaults();bind();
    const [rows,catalog]=await Promise.all([OXXO.fetchSheetData(TAB),OXXO.loadAsesorCatalog()]);
    advisorCatalog=catalog;
    if(rows===null){OXXO.showError('advisor-list','Google Sheets no respondió. Los inventarios no fueron modificados.');$('inventory-cut').innerHTML='<span></span>Sin conexión';return;}
    if(!rows.length){showSetup();return;}
    const tiendaKey=keyByAlias(rows[0],['Tienda','Nombre Tienda']);
    const crKey=keyByAlias(rows[0],['CR','Código CR','Codigo CR']);
    const validRows=OXXO.filterValidTiendas(rows,catalog,tiendaKey,crKey);
    records=validRows.filter(row=>Object.values(row||{}).some(value=>String(value??'').trim())).map(mapRecord).filter(item=>item.cr||item.store);
    if(!records.length){showSetup();return;}
    const periodCounts=records.reduce((map,item)=>{if(item.period)map.set(item.period,(map.get(item.period)||0)+1);return map;},new Map());
    const defaultPeriod=[...periodCounts].sort((a,b)=>b[1]-a[1])[0]?.[0]||'';
    records.forEach(item=>{if(!item.period)item.period=defaultPeriod||'Sin periodo';});
    const periods=unique(records,'period').sort((a,b)=>b.localeCompare(a));
    fillSelect($('filter-period'),periods,formatPeriod);
    fillSelect($('filter-advisor'),unique(records,'advisor').sort((a,b)=>a.localeCompare(b,'es')));
    fillSelect($('filter-type'),unique(records,'type').sort((a,b)=>a.localeCompare(b,'es')));
    if(periods.length)$('filter-period').value=periods[0];
    $('inventory-cut').innerHTML=`<span></span>${unique(records,'cr').length} tiendas disponibles`;
    OXXO.updateFooterTime?.('load-time');
    applyFilters();
  }

  OXXO.setRetryHandler(init);
  document.addEventListener('DOMContentLoaded',init);
})();
