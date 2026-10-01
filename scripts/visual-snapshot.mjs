// Capture a dashboard shell at exact CSS viewport widths, bypassing only the
// client-side site lock/data scripts in a temporary HTML fixture.
// Usage: node scripts/visual-snapshot.mjs dashboard-12 [320 375 768 1440]
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const name = process.argv[2];
if (!/^(?:dashboard-(?:\d+|\d+-analisis)|inventarios|promociones|mi-tienda|mi-dashboard)$/.test(name || '')) throw new Error('Pass a dashboard basename');
const widths = process.argv.slice(3).length ? process.argv.slice(3).map(Number) : [320, 375, 768, 1440];
if (widths.some(width => !Number.isInteger(width) || width < 280 || width > 3000)) throw new Error('Invalid width');
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
if (!chrome) throw new Error('Chrome/Edge not found');
const pageDir = resolve('dashboards');
const source = join(pageDir, `${name}.html`);
const fixture = join(pageDir, `_visual-qa-${name}.html`);
if (!existsSync(source) || existsSync(fixture)) throw new Error('Missing source or fixture already exists');
const outputDir = mkdtempSync(join(tmpdir(), `oxxo-visual-${name}-`));
const profile = join(outputDir, 'chrome-profile');
let html = readFileSync(source, 'utf8');
html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>\s*/gi, '');
html = html.replace(/<style\b[^>]*>\s*html\.oxxo-locked[\s\S]*?<\/style>\s*/i, '');
writeFileSync(fixture, html, 'utf8');

let child;
let ws;
try {
  child = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore', windowsHide: true });
  const portFile = join(profile, 'DevToolsActivePort');
  let port;
  for (let attempt = 0; attempt < 200; attempt++) {
    if (existsSync(portFile)) { port = Number(readFileSync(portFile, 'utf8').split(/\r?\n/)[0]); break; }
    await delay(50);
  }
  if (!port) throw new Error('Chrome DevTools port unavailable');
  const pages = await fetch(`http://127.0.0.1:${port}/json`).then(response => response.json());
  const page = pages.find(tab => tab.type === 'page');
  if (!page) throw new Error('Chrome page target unavailable');
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolveOpen, rejectOpen) => {
    ws.addEventListener('open', resolveOpen, { once: true });
    ws.addEventListener('error', rejectOpen, { once: true });
  });
  let nextId = 1;
  const pending = new Map();
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (!message.id) return;
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
  for (const width of widths) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: pathToFileURL(fixture).href });
    for (let attempt = 0; attempt < 100; attempt++) {
      const state = await send('Runtime.evaluate', { expression: 'document.readyState', returnByValue: true });
      if (state.result?.value === 'complete') break;
      await delay(50);
    }
    await delay(150);
    const metricsResult = await send('Runtime.evaluate', { expression: `JSON.stringify({innerWidth,scrollWidth:document.documentElement.scrollWidth,boxes:Object.fromEntries(['.topbar','.page','.hero','.hero-top','.hero p','.vac-filters','.kpis'].map(name=>{const r=document.querySelector(name)?.getBoundingClientRect();return [name,r?{x:Math.round(r.x),width:Math.round(r.width),right:Math.round(r.right)}:null]}))})`, returnByValue: true });
    const metrics = JSON.parse(metricsResult.result.value);
    const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, fromSurface: true });
    const target = join(outputDir, `${name}-${width}.png`);
    writeFileSync(target, Buffer.from(screenshot.data, 'base64'));
    process.stdout.write(`${width}: ${target}\nmetrics: ${JSON.stringify(metrics)}\n`);
  }
} finally {
  if (ws?.readyState === WebSocket.OPEN) ws.close();
  if (child && !child.killed) child.kill();
  unlinkSync(fixture);
}
