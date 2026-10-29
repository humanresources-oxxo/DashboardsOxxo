/* ==========================================================
   ADMIN · REGISTRO DE ACTAS — consulta por tienda y empleado
   Consumido por: admin.html (pestaña "Registro de actas", area RH).

   El registro vive en un libro PRIVADO del Apps Script (ver enviarActa_).
   La accion "consultarActas" lo entrega con la contraseña del panel admin
   (la de la sesion abierta: OXXO_ADMIN_CTX.getAdminPassword()).

   "Anular" (accion "anularActa", con ACTAS_BORRADO_PASSWORD, otra
   contraseña) no borra la fila: la marca con fecha, motivo y quien, y deja
   de mostrarse y de contar. Esa contraseña se recuerda en esta pestaña del
   navegador (sessionStorage), nunca en localStorage.

   Uso: OXXO_ACTA_REGISTRO.agrupar(actas) -> { tiendas, empleados },
   OXXO_ACTA_REGISTRO.montar() para la pagina.
   ========================================================== */
(function () {
  'use strict';

  const CLAVE_BORRADO = 'oxxo_actas_borrado';
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const norm = v => String(v == null ? '' : v).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const esc = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  function fechaCorta(iso) {
    const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${+m[3]} ${MESES[+m[2] - 1]} ${m[1]}` : (iso || '—');
  }
  // Una tienda se identifica por CR (si lo trae) y una persona por No. de
  // empleado (si lo trae); si no, por el nombre escrito.
  const claveTienda = a => norm(a.cr) || norm(a.tienda);
  const clavePersona = a => norm(a.numEmpleado) || norm(a.trabajador);
  const masReciente = (a, b) => String(b.fecha || b.registrado).localeCompare(String(a.fecha || a.registrado));

  function agrupar(actas) {
    const tiendas = new Map(), empleados = new Map();
    (actas || []).forEach(a => {
      const kt = claveTienda(a);
      if (!tiendas.has(kt)) tiendas.set(kt, { tienda: a.tienda, cr: a.cr, actas: 0, personas: new Set(), ultima: '' });
      const t = tiendas.get(kt);
      t.actas++; if (clavePersona(a)) t.personas.add(clavePersona(a));
      if (String(a.fecha) > t.ultima) t.ultima = a.fecha;
      const ke = clavePersona(a) + '|' + kt;
      // Un acta de hechos sin trabajador cuenta para la tienda, no para una persona.
      if (!clavePersona(a)) return;
      if (!empleados.has(ke)) empleados.set(ke, { numEmpleado: a.numEmpleado, trabajador: a.trabajador, puesto: a.puesto, tienda: a.tienda, cr: a.cr, actas: 0, ultima: '', faltas: [], tipos: {} });
      const e = empleados.get(ke);
      e.actas++;
      const tipo = a.tipo || 'Acta administrativa';
      e.tipos[tipo] = (e.tipos[tipo] || 0) + 1;
      if (String(a.fecha) >= e.ultima) { e.ultima = a.fecha; e.puesto = a.puesto || e.puesto; }
      if (a.falta && !e.faltas.includes(a.falta)) e.faltas.push(a.falta);
    });
    const orden = (a, b) => b.actas - a.actas || String(b.ultima).localeCompare(String(a.ultima));
    return {
      tiendas: [...tiendas.values()].map(t => ({ ...t, personas: t.personas.size })).sort(orden),
      empleados: [...empleados.values()].sort(orden),
    };
  }

  function montar() {
    const $ = id => document.getElementById(id);
    if (!$('tabpanel-actas')) return;
    let actas = [];
    let cargado = false;

    function avisar(texto, tipo) {
      const el = $('reg-estado');
      el.textContent = texto; el.dataset.tipo = tipo || 'info'; el.hidden = !texto;
    }
    // text/plain evita la consulta previa de CORS que Apps Script no contesta.
    async function pedir(cuerpo) {
      const url = window.OXXO_CONFIG && window.OXXO_CONFIG.ADMIN_UPLOAD_URL;
      if (!url) throw new Error('el Apps Script no está configurado');
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(cuerpo) });
      const datos = await r.json().catch(() => null);
      if (!r.ok || !datos || datos.ok === false) throw new Error((datos && datos.error) || 'el servidor no respondió');
      return datos;
    }

    async function consultar() {
      const adminPassword = window.OXXO_ADMIN_CTX ? window.OXXO_ADMIN_CTX.getAdminPassword() : '';
      if (!adminPassword) { avisar('Entra al panel admin con su contraseña para ver el registro.', 'error'); return; }
      $('reg-actualizar').disabled = true;
      avisar('Consultando el registro…', 'info');
      try {
        let datos;
        try { datos = await pedir({ action: 'consultarActas', adminPassword }); } catch (e) {
          // Un Apps Script anterior a v60 pide la contraseña de consulta.
          throw new Error(/no autorizado|contraseña/i.test(e.message) ? 'el Apps Script no aceptó la sesión del admin (¿ya está publicada la v60?)' : e.message);
        }
        cargado = true;
        actas = Array.isArray(datos.actas) ? datos.actas : [];
        const tiendas = [...new Map(actas.map(a => [claveTienda(a), a])).values()].sort((a, b) => String(a.tienda).localeCompare(String(b.tienda), 'es'));
        const sel = $('reg-tienda');
        const previa = sel.value;
        sel.innerHTML = '<option value="">Todas las tiendas</option>' + tiendas.map(a => `<option value="${esc(claveTienda(a))}">${esc(a.tienda)}${a.cr ? ' · ' + esc(a.cr) : ''}</option>`).join('');
        sel.value = previa;
        const selTipo = $('reg-tipo');
        const tipoPrevio = selTipo.value;
        const tipos = [...new Set(actas.map(a => a.tipo || 'Acta administrativa'))].sort((a, b) => a.localeCompare(b, 'es'));
        selTipo.innerHTML = '<option value="">Todos los tipos</option>' + tipos.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('');
        selTipo.value = tipoPrevio;
        avisar(actas.length ? '' : 'Todavía no hay actas registradas. Se registran al enviarlas por correo desde Actas y Formatos.', 'info');
        $('reg-contenido').hidden = !actas.length;
        pintar();
      } catch (e) {
        avisar('No se pudo consultar: ' + e.message + '.', 'error');
      } finally {
        $('reg-actualizar').disabled = false;
      }
    }

    function filtradas() {
      const q = norm($('reg-buscar').value);
      const t = $('reg-tienda').value;
      const tipo = $('reg-tipo').value;
      return actas.filter(a => (!t || claveTienda(a) === t) && (!tipo || (a.tipo || 'Acta administrativa') === tipo)
        && (!q || [a.trabajador, a.numEmpleado, a.tienda, a.cr, a.falta, a.representante, a.puesto].some(v => norm(v).includes(q))));
    }

    function pintar() {
      const lista = filtradas();
      const g = agrupar(lista);
      const reincidentes = g.empleados.filter(e => e.actas > 1).length;
      const kpi = (titulo, valor, sub) => `<div class="reg-kpi"><span>${titulo}</span><strong>${valor}</strong><small>${sub}</small></div>`;
      $('reg-kpis').innerHTML = kpi('Documentos registrados', lista.length, 'con los filtros activos')
        + kpi('Empleados con acta', g.empleados.length, `${reincidentes} con más de una`)
        + kpi('Tiendas', g.tiendas.length, 'con al menos un acta')
        + kpi('Última acta', lista.length ? fechaCorta([...lista].sort(masReciente)[0].fecha) : '—', 'fecha del acta');

      $('reg-badge-tiendas').textContent = `${g.tiendas.length} tiendas`;
      $('reg-tabla-tiendas').innerHTML = '<thead><tr><th>Tienda</th><th>CR</th><th class="center">Actas</th><th class="center">Empleados</th><th>Última</th></tr></thead><tbody>'
        + g.tiendas.map(t => `<tr><td>${esc(t.tienda)}</td><td>${esc(t.cr || '—')}</td><td class="center"><strong>${t.actas}</strong></td><td class="center">${t.personas}</td><td>${fechaCorta(t.ultima)}</td></tr>`).join('') + '</tbody>';

      $('reg-badge-empleados').textContent = `${g.empleados.length} empleados`;
      $('reg-tabla-empleados').innerHTML = '<thead><tr><th>No. empleado</th><th>Trabajador</th><th>Tienda</th><th class="center">Documentos</th><th>Tipos</th><th>Última</th><th>Faltas / motivos</th></tr></thead><tbody>'
        + g.empleados.map(e => `<tr${e.actas > 1 ? ' class="reg-reincide"' : ''}><td>${esc(e.numEmpleado || '—')}</td><td>${esc(e.trabajador)}<small>${esc(e.puesto)}</small></td><td>${esc(e.tienda)}</td><td class="center"><span class="reg-conteo">${e.actas}</span></td>`
          + `<td>${Object.entries(e.tipos).map(([t, n]) => `<span class="reg-tipo">${esc(t)}${n > 1 ? ' ×' + n : ''}</span>`).join(' ')}</td><td>${fechaCorta(e.ultima)}</td><td>${esc(e.faltas.join(' · '))}</td></tr>`).join('') + '</tbody>';

      const detalle = [...lista].sort(masReciente);
      $('reg-badge-detalle').textContent = `${detalle.length} actas`;
      $('reg-tabla-detalle').innerHTML = '<thead><tr><th>Fecha</th><th>Tipo</th><th>Hechos</th><th>Trabajador</th><th>No. empleado</th><th>Tienda</th><th>Falta (proceso)</th><th>Levantó</th><th>Firmas</th><th><span class="sr-only">Acciones</span></th></tr></thead><tbody>'
        + detalle.map(a => `<tr><td>${fechaCorta(a.fecha)}</td><td><span class="reg-tipo">${esc(a.tipo || 'Acta administrativa')}</span></td><td>${fechaCorta(a.fechaHechos)}</td><td>${esc(a.trabajador || '—')}</td><td>${esc(a.numEmpleado || '—')}</td><td>${esc(a.tienda)}${a.cr ? `<small>${esc(a.cr)}</small>` : ''}</td><td>${esc(a.falta)}</td><td>${esc(a.representante)}</td><td>${esc(a.firmas || 'A mano')}</td>`
          + `<td>${a.id ? `<button type="button" class="reg-btn-anular" data-anular="${esc(a.id)}">Anular</button>` : ''}</td></tr>`).join('') + '</tbody>';
    }

    // ── Anular un registro ──
    const dialogo = $('reg-anular');
    let anulando = null;
    function avisarAnular(texto, tipo) {
      const el = $('reg-anular-estado');
      el.textContent = texto; el.dataset.tipo = tipo || 'info'; el.hidden = !texto;
    }
    function abrirAnular(id) {
      anulando = actas.find(a => a.id === id) || null;
      if (!anulando) return;
      $('reg-anular-acta').innerHTML = `${esc(anulando.tipo || 'Acta administrativa')} · ${esc(anulando.trabajador || 'sin trabajador')}`
        + `<small>${esc(anulando.tienda)} · ${fechaCorta(anulando.fecha)}${anulando.falta ? ' · ' + esc(anulando.falta) : ''}</small>`;
      $('reg-anular-motivo').value = '';
      let pw = '';
      try { pw = sessionStorage.getItem(CLAVE_BORRADO) || ''; } catch (e) { /* nada */ }
      $('reg-anular-password').value = pw;
      avisarAnular('', 'info');
      $('reg-anular-confirmar').disabled = false;
      dialogo.showModal();
      $('reg-anular-motivo').focus();
    }
    async function anular() {
      const motivo = $('reg-anular-motivo').value.trim(), quien = $('reg-anular-quien').value.trim(), password = $('reg-anular-password').value;
      const falta = [motivo.length < 5 && 'el motivo', !quien && 'quién anula', !password && 'la contraseña'].filter(Boolean);
      if (falta.length) { avisarAnular('Falta ' + (falta.length > 1 ? falta.slice(0, -1).join(', ') + ' y ' + falta[falta.length - 1] : falta[0]) + '.', 'error'); return; }
      $('reg-anular-confirmar').disabled = true;
      avisarAnular('Anulando…', 'info');
      try {
        try { await pedir({ action: 'anularActa', id: anulando.id, motivo, quien, password }); } catch (e) {
          // Un Apps Script sin la accion "anularActa" contesta "No autorizado".
          throw new Error(/no autorizado/i.test(e.message) ? 'la anulación aún no está activada en el Apps Script' : e.message);
        }
        try { sessionStorage.setItem(CLAVE_BORRADO, password); } catch (e) { /* sin almacenamiento */ }
        const quien1 = anulando.trabajador || 'el documento';
        actas = actas.filter(a => a !== anulando);
        dialogo.close();
        $('reg-contenido').hidden = !actas.length;
        pintar();
        avisar(`Registro de ${quien1} anulado. Ya no cuenta; queda en el libro privado como anulado.`, 'ok');
      } catch (e) {
        if (/contraseña/i.test(e.message)) { try { sessionStorage.removeItem(CLAVE_BORRADO); } catch (x) { /* nada */ } }
        avisarAnular('No se pudo anular: ' + e.message + '.', 'error');
        $('reg-anular-confirmar').disabled = false;
      }
    }
    $('reg-tabla-detalle').addEventListener('click', e => {
      const b = e.target.closest('[data-anular]');
      if (b) abrirAnular(b.dataset.anular);
    });
    $('reg-anular-form').addEventListener('submit', e => { e.preventDefault(); anular(); });
    $('reg-anular-cancelar').addEventListener('click', () => dialogo.close());

    $('reg-actualizar').addEventListener('click', consultar);
    $('reg-buscar').addEventListener('input', pintar);
    $('reg-tienda').addEventListener('change', pintar);
    $('reg-tipo').addEventListener('change', pintar);
    // Se consulta al abrir la pestaña por primera vez (ya con la sesion del admin).
    document.querySelector('.admin-tab[data-tab="actas"]').addEventListener('click', () => { if (!cargado) consultar(); });
  }

  window.OXXO_ACTA_REGISTRO = { agrupar, fechaCorta, montar };
})();
