/* Consumido por: admin.html (seccion "Inicio" del panel).
   Saludo, accesos rapidos y "Como estan las bases": usa el mismo resumen que
   la Bitacora (accion getAdminOverview, con la sesion del admin) y se consulta
   al desbloquear el panel. Solo lee; no publica nada. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  let consultando = false;

  function saludo() {
    const h = new Date().getHours();
    $('ap-saludo').textContent = h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
  }
  // Nombre amable de la hoja: "Dashboard_1_Diario" -> "Dashboard 1 - Vacantes diarias".
  function nombreDe(hoja) {
    const ctx = window.OXXO_ADMIN_CTX;
    const def = (ctx?.getDashboards?.() || []).find((d) => d.tab === hoja);
    return def ? def.label : String(hoja || '—').replace(/_/g, ' ');
  }
  function dias(n) {
    if (n == null) return 'sin publicación registrada';
    return n === 0 ? 'publicada hoy' : `hace ${n} día${n === 1 ? '' : 's'}`;
  }

  function pintar(result) {
    const fuentes = Array.isArray(result.sources) ? result.sources : [];
    const cuenta = { ok: 0, warn: 0, bad: 0, neutral: 0 };
    fuentes.forEach((f) => { cuenta[f.health in cuenta ? f.health : 'neutral']++; });
    $('ap-salud-kpis').innerHTML = [['ok', 'Al día'], ['warn', 'Por actualizar'], ['bad', 'Requieren atención'], ['neutral', 'Sin registro']]
      .map(([k, t]) => `<div class="ap-kpi ${k === 'neutral' ? '' : k}"><span>${t}</span><strong>${cuenta[k]}</strong></div>`).join('');
    const orden = { bad: 0, warn: 1 };
    const atencion = fuentes.filter((f) => f.health in orden).sort((a, b) => orden[a.health] - orden[b.health] || (b.ageDays || 0) - (a.ageDays || 0));
    $('ap-atencion').innerHTML = atencion.length
      ? atencion.slice(0, 6).map((f) => `<li><span class="ap-dot ${esc(f.health)}"></span><div><strong>${esc(nombreDe(f.sheet))}</strong><small>${esc(f.healthLabel)} · ${esc(dias(f.ageDays))}</small></div></li>`).join('')
        + (atencion.length > 6 ? `<li class="ap-lista__vacio">y ${atencion.length - 6} más en Bitácora y respaldos</li>` : '')
      : '<li class="ap-lista__vacio ok">Todas las bases con registro están al día. 🎉</li>';
    const filas = Array.isArray(result.rows) ? result.rows : [];
    $('ap-recientes').innerHTML = filas.length
      ? filas.slice(0, 6).map((r) => {
        const ok = ['correcta', 'restaurada'].includes(String(r.Estado || '').toLowerCase());
        return `<li><span class="ap-dot ${ok ? 'ok' : 'bad'}"></span><div><strong>${esc(nombreDe(r.Hoja))}</strong><small>${esc(r.Fecha || '—')} · ${esc(r['Filas publicadas'] || 0)} filas · ${esc(r.Estado || '—')}</small></div></li>`;
      }).join('')
      : '<li class="ap-lista__vacio">Aún no hay publicaciones registradas.</li>';
  }

  async function consultar() {
    const ctx = window.OXXO_ADMIN_CTX;
    if (consultando || !ctx?.postAdminPayload || !ctx.getAdminPassword()) return;
    consultando = true;
    $('ap-salud-actualizar').disabled = true;
    try {
      const result = await ctx.postAdminPayload({ action: 'getAdminOverview', adminPassword: ctx.getAdminPassword(), limit: 8 });
      if (result.compatibilityMode) throw new Error('el navegador no pudo leer la respuesta del Apps Script');
      pintar(result);
    } catch (error) {
      const texto = `No se pudo consultar: ${esc(error.message || error)}.`;
      $('ap-atencion').innerHTML = `<li class="ap-lista__vacio">${texto}</li>`;
      $('ap-recientes').innerHTML = '<li class="ap-lista__vacio">Intenta con "Actualizar".</li>';
    } finally {
      consultando = false;
      $('ap-salud-actualizar').disabled = false;
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (!$('tabpanel-inicio')) return;
    saludo();
    $('ap-salud-actualizar').addEventListener('click', consultar);
  });
  document.addEventListener('oxxo:admin-unlocked', consultar);
  window.OXXO_ADMIN_INICIO = { pintar, nombreDe };
})();
