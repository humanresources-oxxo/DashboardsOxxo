# Soporte y problemas comunes

## El panel admin muestra "Failed to fetch"

Posibles causas:

- El navegador esta usando una URL vieja de Apps Script guardada en cache.
- Brave bloqueo la respuesta del Web App.
- Se creo una implementacion NUEVA del Apps Script (en vez de publicar una version nueva sobre la existente) y la URL cambio.
- El Apps Script no tiene permisos correctos.

Soluciones:

1. Presiona `Ctrl + F5` en el panel admin.
2. Revisa que `js/config.js` tenga la URL correcta en `ADMIN_UPLOAD_URL`.
3. Si el campo de URL del panel muestra una URL vieja, reemplazala con la nueva y presiona `Guardar URL`.
4. Verifica que el Web App de Apps Script este publicado como:
   - Ejecutar como: propietario.
   - Acceso: cualquiera con el enlace, segun la politica permitida.
5. Si Brave sigue bloqueando, prueba el modo compatible del panel o usa Chrome para validar.

Para evitar que la URL vuelva a cambiar, redespliega siempre editando la
implementacion existente (`Administrar implementaciones` > lapiz > Version:
"Nueva version"), nunca con `Nueva implementacion`. Ver la seccion
"Redesplegar el Apps Script sin romper la URL" en `docs/GUIA_ACTUALIZACION.md`.

## El dashboard no actualiza datos

Revisa:

- Que la publicacion en Sheets haya terminado.
- Que la pestana correcta del Sheet tenga datos.
- Que la pestana este publicada/accesible como CSV.
- Que `SHEETS_CONFIG.TABS` apunte al nombre exacto.
- Que el navegador no este mostrando cache viejo.
- Si aparece un aviso amarillo o rojo, ver la siguiente seccion.

## Avisos de conexion (banner amarillo / rojo)

Los tableros guardan cada lectura de Sheets en Cache Storage (llave = pestana + alcance/consulta):

| Antiguedad de la lectura | Que hace el tablero |
|---|---|
| menos de 2 min | Usa la copia guardada, sin red. |
| 2 a 10 min | Muestra la copia **al instante** con el aviso amarillo "Mostrando datos recientes guardados" y refresca una vez en segundo plano. Al terminar, el aviso ofrece "Actualizar ahora"; la pantalla **no se repinta sola**. |
| mas de 10 min o sin copia | Espera a la red (un solo intento de 18 s). Si falla, aviso rojo "No pudimos conectar con Google Sheets". |

"Actualizar ahora" / "Reintentar" limpia la cache y pide todo de nuevo (`fresh`). Si el aviso rojo persiste: revisa la conexion, que la pestana siga publicada y ejecuta los diagnosticos en vivo (abajo).

## Diagnosticos en vivo

```bash
npm run test:live                          # todos, cada uno con tope de 120 s
node scripts/run-live-tests.mjs plazas     # solo los que contengan "plazas"
```

Imprimen una tabla final PASS/FAIL/TIMEOUT. Son informativos (dependen de produccion y de la red) y no bloquean un merge:

- `live-period-formats`: los periodos de cada hoja se interpretan.
- `live-scoped-queries`: las lecturas por plaza de GViz (pueden tardar 6-15 s).
- `live-plazas-aggregate`: el comparativo por plaza agregado coincide con la lectura completa.
- `live-store-catalog`: exclusiones del catalogo (ACTIVA=NO, preaperturas); las tiendas ausentes de TREO solo se reportan.
- `live-vacancies-regional`: vacantes regionales sin mezclar plazas.
- `live-sheets-smoke`: recorre las ~22 fuentes (puede tardar mas de 2 min; imprime cada hoja al leerla para identificar la lenta). Un `HTTP 404` en una hoja indica que el Apps Script no la encuentra.

## El panel marca columnas faltantes

Revisa:

- Si el Excel trae encabezados en una fila distinta.
- Si el nombre de columna cambio.
- Si el archivo fue exportado con caracteres raros.
- Si la hoja seleccionada no es la correcta.

## Los asesores salen incorrectos

Revisa:

- Que `Catalogo_Asesores` este actualizado.
- Que exista `CR TIENDA` para la tienda.
- Que el CR no tenga espacios o caracteres extra.
- Que la tienda exista en el catalogo.

## GitHub Pages tarda en mostrar cambios

GitHub Pages puede tardar unos minutos en reflejar cambios. Tambien puede quedarse cacheado el navegador.

Acciones:

- Espera de 1 a 5 minutos.
- Usa `Ctrl + F5`.
- Verifica que `admin.html` o el dashboard tenga version nueva en los scripts, por ejemplo `core.js?v=...`. El workflow `versionar-assets.yml` la pone sola en cada push a `main`; `npm run assets:check` confirma que todas las referencias comparten la misma version.

## Recomendacion antes de cambios grandes

Antes de una refactorizacion grande:

1. Ejecuta `git status`.
2. Crea un commit con el estado estable.
3. Haz cambios en partes pequenas.
4. Prueba panel admin y dashboards clave.
5. Sube solo cuando el flujo principal siga funcionando.

## El candado del sitio

`js/site-lock.js` pide una contrasena compartida al abrir el sitio. Es una **disuasion del lado del cliente**: no protege las hojas publicas de Google ni el Apps Script de lectura. Lo que si esta autorizado en el servidor es toda escritura desde el panel admin (contrasena en Script Properties, lista de pestanas permitidas, bitacora y respaldos). Si se necesita confidencialidad real hay que agregar autenticacion y hojas privadas (decision de arquitectura pendiente).

## Redesplegar el Apps Script

Solo cuando cambie `apps-script/admin-upload.gs`. Se pega el `.gs` en el editor y se publica con `Administrar implementaciones` > lapiz > `Nueva version` para conservar la URL `/exec` (ver `docs/GUIA_ACTUALIZACION.md`). Despues verifica que `VERIFIED_ADMIN_RUNTIME_VERSION` de `js/config.js` coincida con `APP_VERSION` del `.gs` (lo comprueba `npm test`).
