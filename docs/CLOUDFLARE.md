# Sitio en Cloudflare (Workers + Access)

El mismo sitio que publica GitHub Pages se sirve tambien desde Cloudflare,
detras de **Cloudflare Access**: para entrar hay que escribir un correo de la
lista autorizada y el codigo que llega a ese correo. Los datos ya no salen de
la hoja publica sino de la puerta `/api` del Worker, que los pide al Apps
Script con una llave de servidor.

```
Persona -> Cloudflare Access -> sitio (dist/) y /api (worker/index.js)
        -> Apps Script leerDatos (LECTURA_KEY) -> Google Sheet
```

## Archivos

| Archivo | Para que |
|---|---|
| `wrangler.jsonc` | Configuracion del Worker: `dist/` como sitio, `/api/*` pasa por el Worker. |
| `scripts/build-cloudflare.mjs` | Arma `dist/` solo con el sitio (index, admin, robots, assets, css, js, dashboards). Pruebas, scripts, docs y el Apps Script nunca se publican. |
| `worker/index.js` | `/api/leer` (POST `{ hoja, consulta?, formato?, headers? }`) y `/api/yo`. Valida el token de Access en cada peticion y falla cerrado si Access no esta configurado. Guarda las respuestas `CACHE_SEGUNDOS` (120) en la cache de Cloudflare. |

## Configuracion en el panel de Cloudflare

- Proyecto (Workers & Pages) conectado a `humanresources-oxxo/DashboardsOxxo`, rama `main`.
- **Build command:** `node scripts/build-cloudflare.mjs` · **Deploy command:** `npx wrangler deploy`.
- **Secretos** (Settings -> Variables and Secrets, tipo *Secret*):
  - `LECTURA_KEY`: la misma cadena que `LECTURA_KEY` en Script Properties del Apps Script (32+ caracteres al azar).
  - `ACCESS_TEAM`: el nombre del equipo de Zero Trust (`<equipo>.cloudflareaccess.com`).
  - `ACCESS_AUD`: el *Application Audience (AUD) tag* de la aplicacion de Access.
- **Access:** una aplicacion que cubre todo el dominio del Worker, con una politica *Allow* para la lista de correos autorizados.

## Cierre de la hoja (cuando todo lea por /api y leerDatos)

1. Script Properties del Apps Script: `LECTURA_PRIVADA = SI` (readSheet por GET deja de responder y la cuota sindical exige sesion).
2. Google Sheet -> Compartir: quitar "Cualquier persona con el enlace".
3. Apagar GitHub Pages y hacer privado el repositorio.
