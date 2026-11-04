/* ==========================================================
   CONTRATOS COLECTIVOS (CCT) -> APP CONOXXO

   Tarjeta del panel admin (area Administrativo) para subir el Excel de
   contratos colectivos ("Data colectiva Tiendas OXXO": hojas "CCTs Tiendas"
   y "CCT ejercicio <año>"). NO se muestra en ningun dashboard de este sitio:
   el Apps Script lo guarda en su propio libro privado (publicarCct, v63) y
   solo lo lee la app Conoxxo (repo humanresources-oxxo/oxxitoapp, pantalla
   "Contratos colectivos") con la accion publica consultarCct.

   El Excel se convierte en el navegador y solo viajan indicadores: los
   nombres de los responsables (laboral y sindical) y las ligas a SharePoint
   nunca salen. Porcentajes mezclados ("4.7%", 0.047, 65) quedan como
   fraccion, fechas como AAAA-MM-DD y "NA"/"N/A" como vacio.

   La carga usa la sesion abierta del panel (la misma contrasena de admin
   que valida el Apps Script, como Cuota Sindical): no pide nada mas. Si
   cambian las columnas que lee la app (oxxitoapp src/services/cct.ts), hay
   que actualizar CAMPOS aqui.
   ========================================================== */
(function (global) {
  const sinAcentos = v => String(v == null ? '' : v).normalize('NFD').replace(/[̀-ͯ]/g, '');
  const clave = v => sinAcentos(v).toLowerCase().replace(/[^a-z0-9%]/g, '');
  const vacio = v => v == null || /^\s*(n\/?a|na|-|)\s*$/i.test(String(v));

  function txt(v) {
    if (vacio(v)) return null;
    return String(v).replace(/\s+/g, ' ').trim();
  }
  function num(v) {
    if (vacio(v)) return null;
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    const m = String(v).replace(/,/g, '').match(/-?\d+(\.\d+)?/);
    return m ? Number(m[0]) : null;
  }
  // "4.7%" -> 0.047 · 0.047 -> 0.047 · 65 (participacion escrita como 65) -> 0.65
  function pct(v) {
    if (vacio(v)) return null;
    const conSigno = typeof v === 'string' && v.includes('%');
    const n = num(v);
    if (n == null) return null;
    const f = conSigno || Math.abs(n) > 1.5 ? n / 100 : n;
    return Math.round(f * 100000) / 100000;
  }
  const dos = n => String(n).padStart(2, '0');
  function fecha(v) {
    if (vacio(v)) return null;
    if (v instanceof Date && !isNaN(v)) return `${v.getFullYear()}-${dos(v.getMonth() + 1)}-${dos(v.getDate())}`;
    if (typeof v === 'number' && v > 20000 && v < 80000) {
      const d = new Date(Math.round((v - 25569) * 86400000)); // serial de Excel
      return `${d.getUTCFullYear()}-${dos(d.getUTCMonth() + 1)}-${dos(d.getUTCDate())}`;
    }
    const s = String(v).trim();
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    return m ? `${m[3]}-${dos(m[2])}-${dos(m[1])}` : null;
  }
  // "CONASIM\nSindicato Nacional de..." -> "CONASIM"
  const sindicato = v => txt(String(v == null ? '' : v).split(/\r?\n/)[0]);
  function doc(v) {
    const t = txt(v);
    if (!t) return null;
    if (/^s[ií]$/i.test(t)) return 'SI';
    if (/^no$/i.test(t)) return 'NO';
    if (/^p(dte|endiente)/i.test(t)) return 'Pendiente';
    return t;
  }

  // [llave que lee la app, encabezados posibles, conversion]
  const CAMPOS = [
    ['anio', ['AÑO'], num],
    ['udn', ['UdN'], txt],
    ['cluster', ['CLUSTER'], txt],
    ['base', ['BASE'], txt],
    ['plaza', ['PLAZA'], txt],
    ['tipo', ['TIPO'], txt],
    ['entidad', ['ENTIDAD FEDERATIVA'], txt],
    ['localidad', ['LOCALIDAD'], txt],
    ['hc', ['HC'], num],
    ['cts', ['CTs'], num],
    ['zona', ['ZONA SALARIAL'], txt],
    ['sindicato', ['SINDICATO'], sindicato],
    ['expediente', ['#CCT/EXPEDIENTE', 'CCT/EXPEDIENTE'], txt],
    ['vencimiento', ['FECHA DE VENCIMIENTO'], fecha],
    ['tipoRevision', ['TIPO DE REVISIÓN', 'TIPO DE REVISIÓN 2026', 'TIPO DE REVISIÓN 2027', 'TIPO DE REVISIÓN 2028'], txt],
    ['estatusRevision', ['ESTATUS REVISION'], txt],
    ['fechaRevision', ['FECHA REVISIÓN'], fecha],
    ['diasRevision', ['DIAS REV VS VENCIMIENTO'], num],
    ['pctSalarioNominal', ['% Salario nominal'], pct],
    ['pctSalario', ['% Salario'], pct],
    ['pctPrestaciones', ['% Prestaciones'], pct],
    ['ultimoAnioCct', ['ULTIMO AÑO CCT'], num],
    ['estatusConsulta', ['ESTATUS CONSULTA'], txt],
    ['fechaConsulta', ['FECHA CONSULTA'], fecha],
    ['diasConsulta', ['DIAS CONSULTA VS REVISION'], num],
    ['formaCreacion', ['FORMA DE CREACIÓN'], txt],
    ['antiguedad', ['ANTIGÜEDAD CCT'], num],
    ['anioLegitimacion', ['AÑO LEGITIMACION / CREACIÓN'], num],
    ['participacionLeg', ['% PARTICIPACION LEG/REP', 'PARTICIPACION LEG/REP'], pct],
    ['aprobacionLeg', ['% APROBACIÓN LEG/REP', 'APROBACIÓN LEG/REP'], pct],
    ['participacion', ['% PARTICIPACIÓN'], pct],
    ['aprobacion', ['% APROBACIÓN'], pct],
    ['docConstancia', ['DOC. CONSTANCIA LEG/REP'], doc],
    ['docCct', ['DOC. CCT'], doc],
    ['docResolucionIntegral', ['DOC. RESOLUCION POSITIVA INTEGRAL'], doc],
    ['docResolucionSalarial', ['DOC. RESOLUCION POSITIVA SALARIAL'], doc],
    ['docConvenioSalarial', ['DOC. CONVENIO SAL'], doc],
    ['docConvenioIntegral', ['DOC. CONVENIO INT'], doc],
    ['nivelCompliance', ['NIVEL COMPLIANCE (3/5)', 'NIVEL COMPLIANCE'], num],
    ['pctCompliance', ['% COMPLIANCE'], pct],
    ['fondoAhorro', ['Fondo de Ahorro'], txt],
    ['valesMin', ['Vales Despensa (min)', 'Vales Despensa'], num],
    ['valesMax', ['Vales Despensa (max)'], num],
    ['aguinaldoDias', ['Aguinaldo'], num],
    ['primaVacacional', ['Prima Vacacional'], pct],
    ['primaDominical', ['Prima Dominical'], pct],
    ['salarioBase', ['Salario Base'], num],
    ['salarioPromedio', ['Salario Promedio'], num],
  ];
  // Nunca se envian: RESPONSABLE LABORAL, RESPONSABLE SINDICAL, EXPEDIENTE
  // COLECTIVO, LIGA CCT, LIGA RIT, RESOLUCION CFCRL (nombres y ligas).

  function tipoHoja(nombre, encabezados) {
    if (clave(nombre).includes('ejercicio')) return 'ejercicio';
    const h = encabezados.map(clave);
    if (h.includes(clave('#CCT/EXPEDIENTE')) && h.some(x => x.startsWith(clave('TIPO DE REVISIÓN')))) return 'historico';
    return null;
  }

  // hojas: { [nombre]: filas como objetos por encabezado (XLSX.utils.sheet_to_json) }
  function normalizar(hojas) {
    const filas = [];
    const resumen = {};
    Object.entries(hojas || {}).forEach(([nombre, rows]) => {
      const lista = (rows || []).filter(r => r && Object.values(r).some(v => !vacio(v)));
      if (!lista.length) return;
      const hoja = tipoHoja(nombre, Object.keys(lista[0]));
      if (!hoja) return;
      const porClave = new Map();
      lista.forEach(r => Object.keys(r).forEach(h => { if (!porClave.has(clave(h))) porClave.set(clave(h), h); }));
      const col = CAMPOS.map(([key, alias, fn]) => [key, alias.map(a => porClave.get(clave(a))).find(Boolean), fn]);
      let n = 0;
      lista.forEach(r => {
        const datos = {};
        col.forEach(([key, h, fn]) => { if (h) { const v = fn(r[h]); if (v != null) datos[key] = v; } });
        if (!datos.plaza && !datos.entidad) return;
        if (!datos.anio && hoja === 'ejercicio') datos.anio = num(nombre);
        filas.push({ hoja, datos });
        n++;
      });
      resumen[hoja] = (resumen[hoja] || 0) + n;
    });
    if (!filas.length) throw new Error('no encontré las hojas del CCT ("CCTs Tiendas" y "CCT ejercicio …")');
    return { filas, resumen };
  }

  async function pedir(cuerpo) {
    const url = global.OXXO_CONFIG && global.OXXO_CONFIG.ADMIN_UPLOAD_URL;
    if (!url) throw new Error('el Apps Script no está configurado');
    // text/plain evita la consulta previa de CORS que Apps Script no contesta.
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(cuerpo) });
    const datos = await r.json().catch(() => null);
    if (!r.ok || !datos || datos.ok === false) {
      const motivo = (datos && datos.error) || 'el servidor no respondió';
      // Un Apps Script anterior a v63 no conoce publicarCct / consultarCct.
      if (/no autorizado/i.test(motivo) && cuerpo.action === 'consultarCct') throw new Error('falta publicar la versión 63 del Apps Script');
      // (v62 trata publicarCct como una publicacion normal sin pestaña: 'targetSheet requerido').
      if (/targetSheet requerido|acci[oó]n|action|no soportad|desconocid/i.test(motivo)) throw new Error('falta publicar la versión 63 del Apps Script');
      throw new Error(motivo);
    }
    return datos;
  }

  async function subir(archivo, adminPassword) {
    if (global.OXXO_ADMIN_ASSETS) await global.OXXO_ADMIN_ASSETS.ensure('xlsx');
    if (!global.XLSX) throw new Error('no cargó el lector de Excel; revisa la conexión');
    const libro = global.XLSX.read(await archivo.arrayBuffer(), { type: 'array', cellDates: true });
    const hojas = Object.fromEntries(libro.SheetNames.map(n => [n, global.XLSX.utils.sheet_to_json(libro.Sheets[n], { defval: null, raw: true })]));
    const { filas, resumen } = normalizar(hojas);
    const r = await pedir({ action: 'publicarCct', adminPassword, filas, archivo: archivo.name });
    return { total: r.filas, resumen };
  }

  // v65: consultar exige la sesion de Conoxxo o, aqui en el panel, su contraseña.
  async function ultimaCarga(adminPassword) {
    const r = await pedir({ action: 'consultarCct', adminPassword });
    if (!r.carga || !(r.filas || []).length) return 'Todavía no hay contratos cargados.';
    const n = h => r.filas.filter(f => f.hoja === h).length;
    return `Última carga: ${r.carga.fecha}${r.carga.archivo ? ' · ' + r.carga.archivo : ''} · ${n('historico')} filas históricas y ${n('ejercicio')} del ejercicio.`;
  }

  function montarAdmin() {
    const $ = id => document.getElementById(id);
    if (!$('admin-cct-panel')) return;
    const avisar = (texto, tipo) => { const el = $('cct-admin-estado'); el.textContent = texto; el.dataset.tipo = tipo || 'info'; el.hidden = !texto; };
    const password = () => (global.OXXO_ADMIN_CTX ? global.OXXO_ADMIN_CTX.getAdminPassword() : '');
    let consultado = false;
    async function info() {
      if (consultado) return;
      consultado = true;
      if (!password()) { consultado = false; return; }
      try { $('cct-admin-ultima').textContent = await ultimaCarga(password()); }
      catch (e) { consultado = false; $('cct-admin-ultima').textContent = 'No se pudo consultar la última carga: ' + e.message + '.'; }
    }
    document.querySelectorAll('.admin-area[data-admin-area="administrativo"]').forEach(b => b.addEventListener('click', info));
    $('cct-admin-publicar').addEventListener('click', async () => {
      const archivo = $('cct-admin-archivo').files[0];
      if (!archivo) { avisar('Elige el Excel de contratos colectivos.', 'error'); return; }
      if (!password()) { avisar('Entra al panel admin con su contraseña.', 'error'); return; }
      $('cct-admin-publicar').disabled = true;
      avisar('Leyendo el Excel…', 'info');
      try {
        const r = await subir(archivo, password());
        $('cct-admin-archivo').value = '';
        consultado = false; info();
        avisar(`Listo: ${r.total} filas (${r.resumen.historico || 0} históricas y ${r.resumen.ejercicio || 0} del ejercicio). Ya se ven en la app Conoxxo.`, 'ok');
      } catch (e) {
        avisar('No se pudo subir: ' + e.message + '.', 'error');
      } finally {
        $('cct-admin-publicar').disabled = false;
      }
    });
  }

  global.OXXO_CCT = { normalizar, pct, fecha, montarAdmin, CAMPOS };
})(typeof window !== 'undefined' ? window : globalThis);
