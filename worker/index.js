/* ==========================================================
   PUERTA DE DATOS DEL SITIO EN CLOUDFLARE (/api)

   El sitio estatico lo sirve Cloudflare (assets); este Worker solo corre en
   /api/*. Todo el dominio esta detras de Cloudflare Access (codigo por correo
   a la lista autorizada), y aqui se vuelve a comprobar el token de Access:
   si no hay Access configurado o el token no es valido, /api no entrega
   nada (falla cerrado).

   /api/accion (POST) reenvia al Apps Script, con la misma llave, solo las
   acciones de lectura de ACCIONES (hoy la cuota sindical).

   /api/leer (POST, JSON { hoja, consulta?, formato?, headers? }) pide los
   datos al Apps Script (accion leerDatos, v66) con la llave de lectura del
   servidor (secreto LECTURA_KEY, igual a la de Script Properties). Asi la
   hoja de Google puede dejar de ser publica. Las respuestas se guardan
   CACHE_SEGUNDOS en la cache de Cloudflare para no pedirle todo a Google en
   cada visita.

   Variables: APPS_SCRIPT_URL, CACHE_SEGUNDOS (wrangler.jsonc).
   Secretos (panel de Cloudflare): LECTURA_KEY, ACCESS_TEAM (ej. "oxxo-rh"
   de oxxo-rh.cloudflareaccess.com) y, si el panel lo muestra, ACCESS_AUD
   (Application Audience tag). Sin ACCESS_AUD se acepta un token firmado por
   el equipo y emitido por el, que es lo unico que este equipo protege.
   ========================================================== */

const json = (cuerpo, status = 200, extra = {}) =>
  new Response(JSON.stringify(cuerpo), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra },
  });

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    try {
      const usuario = await verificarAccess(request, env);
      if (!usuario) return json({ ok: false, error: 'acceso_requerido' }, 401);
      if (url.pathname === '/api/leer' && request.method === 'POST') return await leer(await request.json().catch(() => null), env, ctx);
      // GET con los mismos campos en la URL: para probar desde el navegador.
      if (url.pathname === '/api/leer' && request.method === 'GET') return await leer(Object.fromEntries(url.searchParams), env, ctx);
      if (url.pathname === '/api/accion' && request.method === 'POST') return await accion(request, env);
      if (url.pathname === '/api/yo') return json({ ok: true, correo: usuario.email || '' });
      return json({ ok: false, error: 'ruta no encontrada' }, 404);
    } catch (err) {
      return json({ ok: false, error: String((err && err.message) || err) }, 500);
    }
  },
};

// ── Cloudflare Access ─────────────────────────────────────
// El token llega en el encabezado Cf-Access-Jwt-Assertion (o en la cookie
// CF_Authorization). Se valida la firma RS256 con las llaves publicas del
// equipo, la audiencia de la aplicacion y la vigencia.
let llavesCache = { equipo: '', vence: 0, llaves: null };

async function llavesAccess(equipo) {
  if (llavesCache.equipo === equipo && llavesCache.vence > Date.now()) return llavesCache.llaves;
  const r = await fetch(`https://${equipo}.cloudflareaccess.com/cdn-cgi/access/certs`);
  if (!r.ok) throw new Error('no se pudieron leer las llaves de Access');
  const { keys } = await r.json();
  const llaves = {};
  for (const k of keys || []) {
    llaves[k.kid] = await crypto.subtle.importKey('jwk', k, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  }
  llavesCache = { equipo, vence: Date.now() + 60 * 60 * 1000, llaves };
  return llaves;
}

function b64url(texto) {
  const b = atob(texto.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((texto.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

function tokenDe(request) {
  const h = request.headers.get('cf-access-jwt-assertion');
  if (h) return h;
  const m = (request.headers.get('cookie') || '').match(/(?:^|;\s*)CF_Authorization=([^;]+)/);
  return m ? m[1] : '';
}

async function verificarAccess(request, env) {
  const equipo = String(env.ACCESS_TEAM || '').trim();
  const aud = String(env.ACCESS_AUD || '').trim();
  if (!equipo) return null;
  const token = tokenDe(request);
  const partes = token.split('.');
  if (partes.length !== 3) return null;
  const cabeza = JSON.parse(new TextDecoder().decode(b64url(partes[0])));
  const datos = JSON.parse(new TextDecoder().decode(b64url(partes[1])));
  const llave = (await llavesAccess(equipo))[cabeza.kid];
  if (!llave) return null;
  const valida = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', llave, b64url(partes[2]), new TextEncoder().encode(`${partes[0]}.${partes[1]}`));
  if (!valida) return null;
  const audiencias = Array.isArray(datos.aud) ? datos.aud : [datos.aud];
  if (aud && !audiencias.includes(aud)) return null;
  if (!datos.exp || datos.exp * 1000 < Date.now()) return null;
  if (datos.iss !== `https://${equipo}.cloudflareaccess.com`) return null;
  return datos;
}

// ── /api/leer ─────────────────────────────────────────────
async function leer(pedido, env, ctx) {
  if (!env.LECTURA_KEY) return json({ ok: false, error: 'LECTURA_KEY no configurada' }, 503);
  const hoja = String((pedido && pedido.hoja) || '').trim();
  if (!hoja) return json({ ok: false, error: 'hoja requerida' }, 400);
  const cuerpo = {
    hoja,
    consulta: String(pedido.consulta || ''),
    formato: pedido.formato === 'valores' ? 'valores' : 'csv',
    headers: Number(pedido.headers) || 2,
  };

  // La cache de Cloudflare solo guarda GET: la llave es una URL interna
  // armada con el pedido (nunca con la llave de lectura).
  const clave = new Request(`https://cache.dashboardsoxxo.interno/leer?${new URLSearchParams(cuerpo)}`);
  const cache = caches.default;
  // fresco (?fresco=1 en la pagina, ver core.js): siempre al Apps Script; la
  // respuesta nueva si se guarda para los demas.
  const guardada = pedido.fresco ? null : await cache.match(clave);
  if (guardada) return guardada;

  // text/plain: el Apps Script no contesta el preflight de CORS y asi lo
  // piden tambien el panel y la app.
  const r = await fetch(env.APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'content-type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'leerDatos', ...cuerpo, lecturaKey: env.LECTURA_KEY }),
  });
  const datos = await r.json().catch(() => null);
  if (!datos || datos.ok === false) return json({ ok: false, error: (datos && datos.error) || 'el Apps Script no respondio' }, 502);
  const salida = { ok: true, csv: datos.csv, values: datos.values };
  const segundos = Math.max(0, Number(env.CACHE_SEGUNDOS) || 0);
  const respuesta = json(salida, 200, segundos ? { 'cache-control': `private, max-age=0`, 'x-cache-segundos': String(segundos) } : {});
  if (segundos) {
    const paraCache = new Response(respuesta.clone().body, respuesta);
    paraCache.headers.set('cache-control', `public, max-age=${segundos}`);
    ctx.waitUntil(cache.put(clave, paraCache));
  }
  return respuesta;
}

// ── /api/accion ───────────────────────────────────────────
const ACCIONES = ['consultarCuotaSindical'];

async function accion(request, env) {
  if (!env.LECTURA_KEY) return json({ ok: false, error: 'LECTURA_KEY no configurada' }, 503);
  const cuerpo = await request.json().catch(() => null);
  if (!cuerpo || !ACCIONES.includes(cuerpo.action)) return json({ ok: false, error: 'accion no permitida' }, 400);
  const r = await fetch(env.APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'content-type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: cuerpo.action, lecturaKey: env.LECTURA_KEY }),
  });
  const datos = await r.json().catch(() => null);
  if (!datos) return json({ ok: false, error: 'el Apps Script no respondio' }, 502);
  return json(datos, datos.ok === false ? 502 : 200);
}

