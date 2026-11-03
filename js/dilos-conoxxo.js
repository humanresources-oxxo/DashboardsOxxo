/* ==========================================================
   CASOS DILOS -> APP CONOXXO

   Tarjeta del panel admin (area Administrativo) para subir el reporte de
   casos abiertos DILOS de la Zona Centro Sur ("Reporte DILOS dd.mm.aaaa.xls",
   hoja ZCS: Numero de caso, Region, Plaza, Facilitador, Estatus, Dias
   abiertos). NO se muestra en ningun dashboard de este sitio: el Apps Script
   lo guarda en su propio libro privado (publicarDilos, v64) y solo lo lee la
   app Conoxxo (repo humanresources-oxxo/oxxitoapp, pantalla "Casos DILOS")
   con la accion publica consultarDilos.

   El nombre del facilitador nunca sale del navegador: solo viajan caso,
   region, plaza, estatus, area (RH / ADM) y dias abiertos. La fecha del corte
   sale del nombre del archivo (27.10.2026). Usa la sesion abierta del panel,
   como Cuota Sindical y los contratos colectivos.
   ========================================================== */
(function (global) {
  const sinAcentos = v => String(v == null ? '' : v).normalize('NFD').replace(/[̀-ͯ]/g, '');
  const clave = v => sinAcentos(v).toLowerCase().replace(/[^a-z0-9]/g, '');
  const txt = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();

  // [llave, encabezados posibles]; el facilitador no esta: no se lee.
  const COLUMNAS = {
    caso: ['Número de caso', 'Numero de caso', 'Caso', 'Folio'],
    region: ['Región', 'Region'],
    plaza: ['Plaza'],
    estatus: ['Estatus', 'Status'],
    dias: ['Días abiertos', 'Dias abiertos', 'Días', 'Dias'],
  };

  // "En atención de ADM" y "En atención ADM" son lo mismo.
  function estatusDe(v) {
    const t = txt(v);
    return t.replace(/^en atenci[oó]n de\s+/i, 'En atención ').replace(/^en atenci[oó]n\s+/i, 'En atención ');
  }
  function areaDe(estatus) {
    const t = sinAcentos(estatus).toUpperCase();
    if (/\bRH\b|RECURSOS HUMANOS/.test(t)) return 'RH';
    if (/\bADM\b|ADMINISTRA/.test(t)) return 'ADM';
    return 'Otra';
  }
  // "Reporte_DILOS_.27.10.2026.xls" -> "2026-10-27"
  function corteDe(nombreArchivo) {
    const m = String(nombreArchivo || '').match(/(\d{1,2})[._-](\d{1,2})[._-](\d{4})/);
    if (!m) return '';
    const [d, mes, a] = [+m[1], +m[2], +m[3]];
    return d >= 1 && d <= 31 && mes >= 1 && mes <= 12 ? `${a}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}` : '';
  }

  // hojas: { [nombre]: matriz de filas (XLSX.utils.sheet_to_json con header: 1) }
  function normalizar(hojas, nombreArchivo) {
    for (const filas of Object.values(hojas || {})) {
      const iEnc = (filas || []).slice(0, 15).findIndex(f => (f || []).some(c => COLUMNAS.caso.some(a => clave(a) === clave(c))));
      if (iEnc < 0) continue;
      const enc = filas[iEnc].map(clave);
      const col = Object.fromEntries(Object.entries(COLUMNAS).map(([k, alias]) => [k, enc.findIndex(h => alias.some(a => clave(a) === h))]));
      if (col.dias < 0 || col.estatus < 0) throw new Error('al reporte le faltan las columnas Estatus o Días abiertos');
      const casos = filas.slice(iEnc + 1)
        .map(f => {
          const v = k => (col[k] >= 0 ? f[col[k]] : '');
          const estatus = estatusDe(v('estatus'));
          const dias = Number(v('dias'));
          return { caso: txt(v('caso')), region: txt(v('region')).toUpperCase(), plaza: txt(v('plaza')).toUpperCase(), estatus, area: areaDe(estatus), dias: Number.isFinite(dias) ? Math.round(dias) : NaN };
        })
        .filter(c => c.caso && Number.isFinite(c.dias));
      if (!casos.length) throw new Error('el reporte no trae casos');
      return { casos, corte: corteDe(nombreArchivo) };
    }
    throw new Error('no encontré la hoja de casos (columna "Número de caso")');
  }

  async function pedir(cuerpo) {
    const url = global.OXXO_CONFIG && global.OXXO_CONFIG.ADMIN_UPLOAD_URL;
    if (!url) throw new Error('el Apps Script no está configurado');
    // text/plain evita la consulta previa de CORS que Apps Script no contesta.
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(cuerpo) });
    const datos = await r.json().catch(() => null);
    if (!r.ok || !datos || datos.ok === false) {
      const motivo = (datos && datos.error) || 'el servidor no respondió';
      // Un Apps Script anterior a v64 no conoce publicarDilos / consultarDilos
      // (publicarDilos le llega como publicacion normal sin pestaña).
      if (/no autorizado/i.test(motivo) && cuerpo.action === 'consultarDilos') throw new Error('falta publicar la versión 64 del Apps Script');
      if (/targetSheet requerido/i.test(motivo)) throw new Error('falta publicar la versión 64 del Apps Script');
      throw new Error(motivo);
    }
    return datos;
  }

  async function subir(archivo, adminPassword) {
    if (global.OXXO_ADMIN_ASSETS) await global.OXXO_ADMIN_ASSETS.ensure('xlsx');
    if (!global.XLSX) throw new Error('no cargó el lector de Excel; revisa la conexión');
    const libro = global.XLSX.read(await archivo.arrayBuffer(), { type: 'array', cellDates: true });
    const hojas = Object.fromEntries(libro.SheetNames.map(n => [n, global.XLSX.utils.sheet_to_json(libro.Sheets[n], { header: 1, defval: null, raw: true, blankrows: false })]));
    const { casos, corte } = normalizar(hojas, archivo.name);
    const r = await pedir({ action: 'publicarDilos', adminPassword, casos, corte, archivo: archivo.name });
    return { total: r.casos, corte };
  }

  async function ultimaCarga() {
    const r = await pedir({ action: 'consultarDilos' });
    if (!r.carga || !(r.casos || []).length) return 'Todavía no hay casos cargados.';
    return `Última carga: ${r.carga.fecha}${r.carga.archivo ? ' · ' + r.carga.archivo : ''} · ${r.casos.length} casos${r.carga.corte ? ' (corte ' + r.carga.corte + ')' : ''}.`;
  }

  function montarAdmin() {
    const $ = id => document.getElementById(id);
    if (!$('admin-dilos-panel')) return;
    const avisar = (texto, tipo) => { const el = $('dilos-admin-estado'); el.textContent = texto; el.dataset.tipo = tipo || 'info'; el.hidden = !texto; };
    const password = () => (global.OXXO_ADMIN_CTX ? global.OXXO_ADMIN_CTX.getAdminPassword() : '');
    let consultado = false;
    async function info() {
      if (consultado) return;
      consultado = true;
      try { $('dilos-admin-ultima').textContent = await ultimaCarga(); }
      catch (e) { consultado = false; $('dilos-admin-ultima').textContent = 'No se pudo consultar la última carga: ' + e.message + '.'; }
    }
    document.querySelectorAll('.admin-area[data-admin-area="administrativo"]').forEach(b => b.addEventListener('click', info));
    $('dilos-admin-publicar').addEventListener('click', async () => {
      const archivo = $('dilos-admin-archivo').files[0];
      if (!archivo) { avisar('Elige el reporte DILOS.', 'error'); return; }
      if (!password()) { avisar('Entra al panel admin con su contraseña.', 'error'); return; }
      $('dilos-admin-publicar').disabled = true;
      avisar('Leyendo el reporte…', 'info');
      try {
        const r = await subir(archivo, password());
        $('dilos-admin-archivo').value = '';
        consultado = false; info();
        avisar(`Listo: ${r.total} casos${r.corte ? ' (corte ' + r.corte + ')' : ''}. Ya se ven en la app Conoxxo.`, 'ok');
      } catch (e) {
        avisar('No se pudo subir: ' + e.message + '.', 'error');
      } finally {
        $('dilos-admin-publicar').disabled = false;
      }
    });
  }

  global.OXXO_DILOS = { normalizar, corteDe, montarAdmin };
})(typeof window !== 'undefined' ? window : globalThis);
