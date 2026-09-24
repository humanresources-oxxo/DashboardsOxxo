const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const htmlFiles = [
  path.join(root, 'index.html'),
  path.join(root, 'admin.html'),
  ...fs.readdirSync(path.join(root, 'dashboards'))
    .filter(name => name.endsWith('.html'))
    .sort()
    .map(name => path.join(root, 'dashboards', name)),
];

const failures = [];
const checkedAssets = new Set();

function fail(file, detail) {
  failures.push(`${path.relative(root, file)}: ${detail}`);
}

function checkInlineScripts(file, html) {
  const scriptPattern = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(scriptPattern)) {
    const attributes = match[1] || '';
    const source = (match[2] || '').trim();
    if (!source || /\bsrc\s*=/i.test(attributes) || /type\s*=\s*["'](?:application\/json|application\/ld\+json)["']/i.test(attributes)) continue;
    if (/type\s*=\s*["']module["']/i.test(attributes)) continue;
    try {
      new vm.Script(source, { filename: path.relative(root, file) });
    } catch (error) {
      fail(file, `script embebido inválido (${error.message})`);
    }
  }
}

function checkLocalAssets(file, html) {
  const assetPattern = /\b(?:src|href)\s*=\s*["']([^"']+)["']/gi;
  for (const match of html.matchAll(assetPattern)) {
    const reference = match[1].trim();
    if (!reference || /^(?:https?:|data:|mailto:|tel:|javascript:|#|\/\/)/i.test(reference)) continue;
    const cleanReference = reference.split(/[?#]/, 1)[0];
    if (!cleanReference || /[{}]/.test(cleanReference)) continue;
    const resolved = path.resolve(path.dirname(file), cleanReference);
    checkedAssets.add(resolved);
    if (!fs.existsSync(resolved)) fail(file, `recurso local inexistente: ${reference}`);
  }
}

function checkResponsiveFoundation(file, html) {
  if (!/<meta\s+name=["']viewport["'][^>]*content=["'][^"']*width=device-width/i.test(html)) {
    fail(file, 'falta meta viewport para celular');
  }

  const cssParts = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(match => match[1]);
  for (const match of html.matchAll(/<link\b[^>]*href=["']([^"']+\.css(?:\?[^"']*)?)["'][^>]*>/gi)) {
    const reference = match[1].split('?', 1)[0];
    if (/^(?:https?:|\/\/)/i.test(reference)) continue;
    const cssFile = path.resolve(path.dirname(file), reference);
    if (fs.existsSync(cssFile)) cssParts.push(fs.readFileSync(cssFile, 'utf8'));
  }
  if (!cssParts.some(css => /@media\s*\([^)]*max-width\s*:/i.test(css))) {
    fail(file, 'no carga reglas responsive con breakpoint max-width');
  }
}

for (const file of htmlFiles) {
  const html = fs.readFileSync(file, 'utf8');
  assert(html.includes('<!DOCTYPE html>') || html.includes('<!doctype html>'), `${path.relative(root, file)} no tiene doctype`);
  checkInlineScripts(file, html);
  checkLocalAssets(file, html);
  checkResponsiveFoundation(file, html);
}

for (const directory of ['js']) {
  const stack = [path.join(root, directory)];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const file = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(file);
      else if (entry.name.endsWith('.js')) {
        try {
          new vm.Script(fs.readFileSync(file, 'utf8'), { filename: path.relative(root, file) });
        } catch (error) {
          fail(file, `JavaScript inválido (${error.message})`);
        }
      }
    }
  }
}

for (const name of fs.readdirSync(path.join(root, 'apps-script')).filter(name => name.endsWith('.gs'))) {
  const file = path.join(root, 'apps-script', name);
  try {
    new vm.Script(fs.readFileSync(file, 'utf8'), { filename: path.relative(root, file) });
  } catch (error) {
    fail(file, `Apps Script inválido (${error.message})`);
  }
}

const configSource = fs.readFileSync(path.join(root, 'js', 'config.js'), 'utf8');
const appScriptSource = fs.readFileSync(path.join(root, 'apps-script', 'admin-upload.gs'), 'utf8');
const configuredVersion = configSource.match(/VERIFIED_ADMIN_RUNTIME_VERSION:\s*(\d+)/)?.[1];
const sourceVersion = appScriptSource.match(/const APP_VERSION\s*=\s*['"](\d+)['"]/)?.[1];
if (!configuredVersion || configuredVersion !== sourceVersion) {
  fail(path.join(root, 'js', 'config.js'), `versión esperada (${configuredVersion || 'vacía'}) distinta de Apps Script (${sourceVersion || 'vacía'})`);
}

// Assets compartidos de esta fase: cada pagina que los necesita debe cargarlos.
for (const shared of ['js/dashboard-dialogs.js', 'css/dashboard-dialogs.css', 'js/home.js', 'css/home.css']) {
  if (!fs.existsSync(path.join(root, shared))) fail(path.join(root, shared), 'asset compartido inexistente');
}
const paginas = Object.fromEntries(htmlFiles.map(file => [path.relative(root, file).replace(/\\/g, '/'), fs.readFileSync(file, 'utf8')]));
for (const n of [1, 2, 3, 4, 7, 8, 9, 12, 13]) {
  const html = paginas[`dashboards/dashboard-${n}.html`];
  if (!/js\/dashboard-dialogs\.js/.test(html) || !/css\/dashboard-dialogs\.css/.test(html)) fail(path.join(root, 'dashboards', `dashboard-${n}.html`), 'debe cargar el controlador de dialogos y su css');
}
if (!/css\/home\.css/.test(paginas['index.html']) || !/js\/home\.js/.test(paginas['index.html'])) fail(path.join(root, 'index.html'), 'la portada debe cargar home.css y home.js');
// Orden de carga: config -> core -> modulos de la pagina.
for (const [rel, html] of Object.entries(paginas)) {
  const config = html.indexOf('js/config.js');
  const core = html.indexOf('js/core.js');
  if (core !== -1 && (config === -1 || config > core)) fail(path.join(root, rel), 'js/config.js debe cargarse antes que js/core.js');
}

// Apps Script: la lista de escritura conserva todas las pestanas configuradas
// (Promociones es de edicion directa y NO se publica desde el panel).
const permitidas = new Set([...appScriptSource.match(/const ALLOWED_SHEETS = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map(m => m[1]));
const tabsConfig = Object.values(Function('window', configSource + '; return window.OXXO_CONFIG.TABS;')({}));
const faltantes = tabsConfig.filter(tab => tab !== 'Promociones' && !permitidas.has(tab));
if (faltantes.length) fail(path.join(root, 'apps-script', 'admin-upload.gs'), `ALLOWED_SHEETS no incluye: ${faltantes.join(', ')}`);
if (permitidas.has('Promociones')) fail(path.join(root, 'apps-script', 'admin-upload.gs'), 'Promociones debe seguir siendo de solo lectura desde el panel');

assert.deepStrictEqual(failures, [], failures.join('\n'));
console.log(`smoke general: ${htmlFiles.length} páginas y ${checkedAssets.size} recursos locales correctos`);
