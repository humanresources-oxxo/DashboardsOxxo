// Local, read-only browser smoke. Serves the existing site and lets the page
// execute its own scripts/data reads; no sheet/admin write endpoints are called.
// Usage: node scripts/browser-live-qa.mjs dashboard-9 375 15
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve, sep } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const name = process.argv[2];
const width = Number(process.argv[3] || 375);
const seconds = Number(process.argv[4] || 15);
const action = process.argv[5] || '';
const scopeQuery = process.env.OXXO_TEST_SCOPE === 'region' ? '?scope=region&region=TABASCO' : '';
if (!/^(?:home|dashboard-(?:\d+|\d+-analisis)|inventarios|promociones|mi-tienda|mi-dashboard)$/.test(name || '')) throw new Error('Invalid page');
if (!Number.isInteger(width) || width < 280 || width > 3000 || !Number.isFinite(seconds) || seconds < 1 || seconds > 60) throw new Error('Invalid width/wait');
const root = resolve('.');
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
if (!chrome) throw new Error('Chrome/Edge not found');
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ttf': 'font/ttf' };
const server = createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const path = resolve(root, `.${pathname}`);
  if (!path.startsWith(root + sep) || !existsSync(path)) { response.writeHead(404); response.end(); return; }
  response.setHeader('Content-Type', mime[extname(path)] || 'application/octet-stream');
  response.setHeader('Cache-Control', 'no-store');
  response.end(readFileSync(path));
});
await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
const port = server.address().port;
const outputDir = mkdtempSync(join(tmpdir(), `oxxo-live-${name}-`));
const profile = join(outputDir, 'chrome-profile');
let child;
let ws;
try {
  child = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore', windowsHide: true });
  const portFile = join(profile, 'DevToolsActivePort');
  let debuggerPort;
  for (let attempt = 0; attempt < 200; attempt++) {
    if (existsSync(portFile)) {
      try {
        debuggerPort = Number(readFileSync(portFile, 'utf8').split(/\r?\n/)[0]);
        if (debuggerPort) break;
      } catch (error) {
        if (error.code !== 'EBUSY') throw error;
      }
    }
    await delay(50);
  }
  if (!debuggerPort) throw new Error('Chrome DevTools port unavailable');
  const tabs = await fetch(`http://127.0.0.1:${debuggerPort}/json`).then(response => response.json());
  ws = new WebSocket(tabs.find(tab => tab.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolveOpen, rejectOpen) => { ws.addEventListener('open', resolveOpen, { once: true }); ws.addEventListener('error', rejectOpen, { once: true }); });
  let nextId = 1;
  const pending = new Map();
  const errors = [];
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (!message.id) {
      if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails?.text || 'Runtime exception');
      if (message.method === 'Log.entryAdded' && message.params.entry?.level === 'error') errors.push(message.params.entry.text);
      return;
    }
    const callbacks = pending.get(message.id);
    if (!callbacks) return;
    pending.delete(message.id);
    if (message.error) callbacks.reject(new Error(message.error.message));
    else callbacks.resolve(message.result);
  });
  const send = (method, params = {}) => new Promise((resolveCommand, rejectCommand) => {
    const id = nextId++;
    pending.set(id, { resolve: resolveCommand, reject: rejectCommand });
    ws.send(JSON.stringify({ id, method, params }));
  });
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  if (action === 'plazafocus') await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: "localStorage.setItem('oxxo_site_unlocked','1')" });
  await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/${name === 'home' ? 'index.html' : `dashboards/${name}.html`}${scopeQuery}` });
  await delay(seconds * 1000);
  const actions = {
    kpi: "() => { const button=document.querySelector('.kpi-card[role=button],button.kpi-card'); if(!button) return 'missing KPI'; const id=button.id; button.click(); const current=id?document.getElementById(id):button; return {pressed:current?.getAttribute('aria-pressed'),active:current?.className,banner:document.querySelector('#filter-banner')?.className}; }",
    detail: "() => { const row=document.querySelector('.d7-row,[data-asesor].asesor-detail-link,#tabla-detalle tbody tr'); if(!row) return 'missing row'; row.click(); return {modal:document.querySelector('.d7-overlay.open,.fs-modal-overlay.open,.am-overlay.open')?.id||null}; }",
    d9detail: "() => { const button=document.querySelector('#tabla-detalle .asesor-detail-link'); if(!button) return {error:'missing advisor link',rows:document.querySelectorAll('#tabla-detalle tbody tr').length}; button.click(); return {modal:document.querySelector('#fs-asesor-modal')?.className,advisor:button.dataset.asesor}; }",
    promo: "() => { const card=document.querySelector('.promo-card'); if(!card) return 'missing card'; card.click(); return {modal:document.querySelector('.promo-lightbox.open')?.id||null}; }",
    ranking: "() => { const button=document.querySelector('#mi-ranking-btn'); if(!button) return 'missing ranking'; button.click(); return {modal:document.querySelector('.mi-modal-overlay.show')?.className||null}; }",
    sort: "() => { const header=document.querySelector('.inv-table th.sortable'); if(!header) return 'missing sort header'; header.click(); return {sort:header.className}; }",
    filter: "() => { const select=[...document.querySelectorAll('.filtro-select,.inv-filter select,.promo-filter select')].find(el=>el.options.length>1); if(!select) return 'missing populated select'; const before=select.value; select.selectedIndex=1; select.dispatchEvent(new Event('change',{bubbles:true})); return {id:select.id,before,after:select.value}; }",
    smart: "() => { const button=document.querySelector('.smart-filter__button'); if(!button) return 'missing smart filter'; button.click(); return {expanded:button.getAttribute('aria-expanded'),menu:button.parentElement?.className}; }",
    selectstore: "() => { const root=document.querySelector('#mi-tienda-select,#mi-asesor-select'); if(!root) return 'missing selector'; const button=root.querySelector('.smart-filter__button'); button?.click(); const option=root.querySelector('.smart-filter__option'); if(!option) return 'missing option'; const value=option.dataset.value; option.click(); return {value,label:root.querySelector('.smart-filter__label')?.textContent}; }",
    chartspace: "() => { const panel=document.querySelector('.vac-grid-main > .panel:first-child'); const chart=panel?.querySelector('.vac-chart'); const actions=document.querySelector('.vac-grid-main > .panel:last-child'); if(!panel||!chart||!actions) return 'missing chart row'; panel.scrollIntoView({block:'start'}); const p=panel.getBoundingClientRect(),c=chart.getBoundingClientRect(),a=actions.getBoundingClientRect(); return {panelHeight:p.height,chartHeight:c.height,actionsHeight:a.height,emptyBelowChart:Math.round(p.bottom-c.bottom),chartCanvasHeight:chart.querySelector('canvas')?.getBoundingClientRect().height}; }",
    plazachart: "() => { const chart=document.querySelector('#tabla-plazas'); const card=chart?.closest('.card'); if(!chart||!card) return 'missing plaza chart'; card.scrollIntoView({block:'start'}); const c=chart.getBoundingClientRect(),p=card.getBoundingClientRect(),at=document.querySelector('#tabla-ec-at')?.closest('.card')?.getBoundingClientRect(); return {cardWidth:Math.round(p.width),cardHeight:Math.round(p.height),atCardHeight:at&&Math.round(at.height),chartWidth:Math.round(c.width),chartHeight:Math.round(c.height),chartScrollWidth:chart.scrollWidth,chartClientWidth:chart.clientWidth,cardScrollWidth:card.scrollWidth,cardClientWidth:card.clientWidth,text:chart.innerText.slice(0,500)}; }",
    plazahover: "() => { const chart=[...document.querySelectorAll('.plaza-bars')].find(el=>getComputedStyle(el).display!=='none'); const bar=chart?.querySelector('.plaza-bars__group'); if(!bar) return 'missing visible plaza bar'; bar.scrollIntoView({block:'center'}); const r=bar.getBoundingClientRect(); return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2),before:getComputedStyle(bar.querySelector('.plaza-bars__bar')).transform,plaza:bar.dataset.plaza}; }",
    plazafocus: "() => { const chart=[...document.querySelectorAll('.plaza-bars')].find(el=>getComputedStyle(el).display!=='none'); const bar=chart?.querySelector('.plaza-bars__group'); if(!bar) return 'missing visible plaza bar'; bar.focus(); return {focused:document.activeElement===bar,plaza:bar.dataset.plaza,tooltip:document.querySelector('.plaza-chart__tip')?.innerText,tooltipOpacity:document.querySelector('.plaza-chart__tip')?.style.opacity}; }",
    chartclick: "() => { const canvas=document.querySelector('#chart-asesores'); const chart=window.Chart?.getChart(canvas); const bar=chart?.getDatasetMeta(0).data[0]; if(!bar) return 'missing chart bar'; canvas.scrollIntoView({block:'center'}); const point=bar.getCenterPoint(),rect=canvas.getBoundingClientRect(); canvas.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:rect.left+point.x,clientY:rect.top+point.y})); return {clickedBar:true}; }",
    areacolors: "() => ['rh','comercial','administrativo'].map(area => { const button=document.querySelector(`.area-switch__button[data-area=${area}]`); button?.click(); return {area,active:button?.classList.contains('is-active'),pressed:button?.getAttribute('aria-pressed'),bodyArea:document.body.dataset.area,background:button&&getComputedStyle(button).backgroundImage,accent:button&&getComputedStyle(button).getPropertyValue('--area-color').trim()}; })",
    selectregion: "() => { const button=document.querySelector('[data-scope^=\"region|\"]'); if(!button) return 'region unavailable'; button.click(); return {selected:true}; }",
  };
  let actionResult = null;
  if (action) {
    if (!actions[action]) throw new Error('Invalid action');
    const result = await send('Runtime.evaluate', { expression: `(${actions[action]})()`, returnByValue: true });
    actionResult = result.result.value;
    await delay(action === 'selectregion' ? 10000 : action === 'selectstore' ? 3000 : 500);
    if (action === 'chartclick') {
      const modalResult = await send('Runtime.evaluate', { expression: "({modal:document.querySelector('#asesor-modal')?.className||null,advisor:document.querySelector('#asesor-modal-title')?.textContent||null})", returnByValue: true });
      actionResult = { ...actionResult, ...modalResult.result.value };
    }
    if (action === 'plazahover' && actionResult?.x != null) {
      await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: actionResult.x, y: actionResult.y });
      await delay(350);
      const hoverResult = await send('Runtime.evaluate', { expression: "(() => { const chart=[...document.querySelectorAll('.plaza-bars')].find(el=>getComputedStyle(el).display!=='none'); const bar=chart?.querySelector('.plaza-bars__group'); const tip=document.querySelector('.plaza-chart__tip'); const rows=document.querySelector('.ecat-rows'); return {hovered:bar?.matches(':hover'),transform:bar&&getComputedStyle(bar.querySelector('.plaza-bars__bar')).transform,reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches,tooltip:tip?.innerText,tooltipOpacity:tip&&getComputedStyle(tip).opacity,atRows:rows?.children.length,atOverflow:rows&&getComputedStyle(rows).overflowY,atScrollHeight:rows?.scrollHeight,atClientHeight:rows?.clientHeight}; })()", returnByValue: true });
      actionResult = { ...actionResult, ...hoverResult.result.value };
    }
  }
  const evaluated = await send('Runtime.evaluate', {
    expression: `JSON.stringify({readyState:document.readyState,locked:document.documentElement.classList.contains('oxxo-locked'),innerWidth,scrollWidth:document.documentElement.scrollWidth,scope:window.OXXO?.getActiveDataScope?.(),scopeOptions:document.querySelectorAll('.oxxo-scope-switch__opt').length,regionOption:!!document.querySelector('[data-scope^="region|"]'),activeScopeOption:document.querySelector('.oxxo-scope-switch__opt.is-active')?.dataset.scope||null,bodyText:document.body.innerText.slice(0,800),homeStatusbar:!!document.querySelector('#home-statusbar'),homeSummaryVisible:!!document.querySelector('#home-summary')?.getBoundingClientRect().width&&document.querySelector('#home-summary')?.getBoundingClientRect().width>1,homeRetryPresent:!!document.querySelector('#home-retry'),kpis:document.querySelectorAll('.kpi-card').length,activeKpiPressed:document.querySelector('.kpi-card.kpi-active,.kpi-card.kpi-active-red,.kpi-card.kpi-active-blue')?.getAttribute('aria-pressed')??null,modals:document.querySelectorAll('[role="dialog"]').length,buttons:document.querySelectorAll('button').length,selects:document.querySelectorAll('select').length,errors:[...document.querySelectorAll('.is-source-error')].map(el=>el.dataset.sourceMessage)})`,
    returnByValue: true,
  });
  const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, fromSurface: true });
  const target = join(outputDir, `${name}-${width}.png`);
  writeFileSync(target, Buffer.from(screenshot.data, 'base64'));
  process.stdout.write(`${target}\n${evaluated.result.value}\naction: ${JSON.stringify(actionResult)}\nconsoleErrors: ${JSON.stringify(errors)}\n`);
} finally {
  if (ws?.readyState === WebSocket.OPEN) ws.close();
  if (child && !child.killed) child.kill();
  server.close();
}
