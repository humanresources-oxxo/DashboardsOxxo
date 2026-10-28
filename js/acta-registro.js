/* ==========================================================
   REGISTRO DE ACTAS — consulta por tienda y empleado
   Consumido por: dashboards/acta-administrativa.html (pestaña "Registro").

   El registro vive en un libro PRIVADO del Apps Script (ver enviarActa_).
   La accion "consultarActas" lo entrega solo con ACTAS_CONSULTA_PASSWORD;
   la contraseña se recuerda en esta pestaña del navegador (sessionStorage),
   nunca en localStorage.

   Uso: OXXO_ACTA_REGISTRO.agrupar(actas) -> { tiendas, empleados },
   OXXO_ACTA_REGISTRO.montar() para la pagina.
   ========================================================== */
(function () {
  'use strict';

  const CLAVE_SESION = 'oxxo_actas_consulta';
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
      t.actas++; t.personas.add(clavePersona(a));
      if (String(a.fecha) > t.ultima) t.ultima = a.fecha;
      const ke = clavePersona(a) + '|' + kt;
      if (!empleados.has(ke)) empleados.set(ke, { numEmpleado: a.numEmpleado, trabajador: a.trabajador, puesto: a.puesto, tienda: a.tienda, cr: a.cr, actas: 0, ultima: '', faltas: [] });
      const e = empleados.get(ke);
      e.actas++;
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
    const tabs = [$('tab-nueva'), $('tab-registro')];
    let actas = [];

    function mostrarTab(cual) {
      tabs.forEach(t => {
        const activa = t.id === cual;
        t.classList.toggle('is-active', activa);
        t.setAttribute('aria-selected', String(activa));
        t.tabIndex = activa ? 0 : -1;
        $(t.getAttribute('aria-controls')).hidden = !activa;
      });
    }
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => mostrarTab(t.id));
      t.addEventListener('keydown', e => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        const otra = tabs[(i + 1) % tabs.length];
        mostrarTab(otra.id); otra.focus();
      });
    });

    function avisar(texto, tipo) {
      const el = $('reg-estado');
      el.textContent = texto; el.dataset.tipo = tipo || 'info'; el.hidden = !texto;
    }

    async function consultar(password) {
      const url = window.OXXO_CONFIG && window.OXXO_CONFIG.ADMIN_UPLOAD_URL;
      if (!url) { avisar('La consulta no está configurada.', 'error'); return; }
      $('reg-consultar').disabled = true;
      avisar('Consultando el registro…', 'info');
      try {
        // text/plain evita la consulta previa de CORS que Apps Script no contesta.
        const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'consultarActas', password }) });
        const datos = await r.json().catch(() => null);
        if (!r.ok || !datos || datos.ok === false) {
          const motivo = (datos && datos.error) || 'el servidor no respondió';
          throw new Error(/no autorizado/i.test(motivo) ? 'la consulta aún no está activada en el Apps Script' : motivo);
        }
        try { sessionStorage.setItem(CLAVE_SESION, password); } catch (e) { /* sin almacenamiento */ }
        actas = Array.isArray(datos.actas) ? datos.actas : [];
        const tiendas = [...new Map(actas.map(a => [claveTienda(a), a])).values()].sort((a, b) => String(a.tienda).localeCompare(String(b.tienda), 'es'));
        const sel = $('reg-tienda');
        const previa = sel.value;
        sel.innerHTML = '<option value="">Todas las tiendas</option>' + tiendas.map(a => `<option value="${esc(claveTienda(a))}">${esc(a.tienda)}${a.cr ? ' · ' + esc(a.cr) : ''}</option>`).join('');
        sel.value = previa;
        avisar(actas.length ? '' : 'Todavía no hay actas registradas. Se registran al enviarlas por correo.', 'info');
        $('reg-contenido').hidden = !actas.length;
        pintar();
      } catch (e) {
        if (/contraseña/i.test(e.message)) { try { sessionStorage.removeItem(CLAVE_SESION); } catch (x) { /* nada */ } }
        avisar('No se pudo consultar: ' + e.message + '.', 'error');
      } finally {
        $('reg-consultar').disabled = false;
      }
    }

    function filtradas() {
      const q = norm($('reg-buscar').value);
      const t = $('reg-tienda').value;
      return actas.filter(a => (!t || claveTienda(a) === t)
        && (!q || [a.trabajador, a.numEmpleado, a.tienda, a.cr, a.falta, a.representante, a.puesto].some(v => norm(v).includes(q))));
    }

    function pintar() {
      const lista = filtradas();
      const g = agrupar(lista);
      const reincidentes = g.empleados.filter(e => e.actas > 1).length;
      const kpi = (titulo, valor, sub, color) => `<div class="kpi-card ${color}"><div class="kpi-card__label">${titulo}</div><div class="kpi-card__value">${valor}</div><div class="kpi-card__delta neu">${sub}</div></div>`;
      $('reg-kpis').innerHTML = kpi('Actas registradas', lista.length, 'con los filtros activos', 'rojo')
        + kpi('Empleados con acta', g.empleados.length, `${reincidentes} con más de una`, 'naranja')
        + kpi('Tiendas', g.tiendas.length, 'con al menos un acta', 'amarillo')
        + kpi('Última acta', lista.length ? fechaCorta([...lista].sort(masReciente)[0].fecha) : '—', 'fecha del acta', 'verde');

      $('reg-badge-tiendas').textContent = `${g.tiendas.length} tiendas`;
      $('reg-tabla-tiendas').innerHTML = '<thead><tr><th>Tienda</th><th>CR</th><th class="center">Actas</th><th class="center">Empleados</th><th>Última</th></tr></thead><tbody>'
        + g.tiendas.map(t => `<tr><td>${esc(t.tienda)}</td><td>${esc(t.cr || '—')}</td><td class="center"><strong>${t.actas}</strong></td><td class="center">${t.personas}</td><td>${fechaCorta(t.ultima)}</td></tr>`).join('') + '</tbody>';

      $('reg-badge-empleados').textContent = `${g.empleados.length} empleados`;
      $('reg-tabla-empleados').innerHTML = '<thead><tr><th>No. empleado</th><th>Trabajador</th><th>Tienda</th><th class="center">Actas</th><th>Última</th><th>Faltas</th></tr></thead><tbody>'
        + g.empleados.map(e => `<tr${e.actas > 1 ? ' class="reg-reincide"' : ''}><td>${esc(e.numEmpleado || '—')}</td><td>${esc(e.trabajador)}<small>${esc(e.puesto)}</small></td><td>${esc(e.tienda)}</td><td class="center"><span class="reg-conteo">${e.actas}</span></td><td>${fechaCorta(e.ultima)}</td><td>${esc(e.faltas.join(' · '))}</td></tr>`).join('') + '</tbody>';

      const detalle = [...lista].sort(masReciente);
      $('reg-badge-detalle').textContent = `${detalle.length} actas`;
      $('reg-tabla-detalle').innerHTML = '<thead><tr><th>Fecha del acta</th><th>Hechos</th><th>Trabajador</th><th>No. empleado</th><th>Tienda</th><th>Falta (proceso)</th><th>Levantó</th></tr></thead><tbody>'
        + detalle.map(a => `<tr><td>${fechaCorta(a.fecha)}</td><td>${fechaCorta(a.fechaHechos)}</td><td>${esc(a.trabajador)}</td><td>${esc(a.numEmpleado || '—')}</td><td>${esc(a.tienda)}${a.cr ? `<small>${esc(a.cr)}</small>` : ''}</td><td>${esc(a.falta)}</td><td>${esc(a.representante)}</td></tr>`).join('') + '</tbody>';
    }

    $('reg-acceso').addEventListener('submit', e => {
      e.preventDefault();
      const pw = $('reg-password').value;
      if (!pw) { avisar('Escribe la contraseña de consulta.', 'error'); return; }
      consultar(pw);
    });
    $('reg-actualizar').addEventListener('click', () => {
      let pw = '';
      try { pw = sessionStorage.getItem(CLAVE_SESION) || ''; } catch (e) { /* nada */ }
      if (pw) consultar(pw);
    });
    $('reg-buscar').addEventListener('input', pintar);
    $('reg-tienda').addEventListener('change', pintar);

    // Si ya se consulto en esta pestaña, entra directo al abrir "Registro".
    $('tab-registro').addEventListener('click', () => {
      let pw = '';
      try { pw = sessionStorage.getItem(CLAVE_SESION) || ''; } catch (e) { /* nada */ }
      if (pw && !actas.length) { $('reg-password').value = pw; consultar(pw); }
    });
  }

  window.OXXO_ACTA_REGISTRO = { agrupar, fechaCorta, montar };
})();
