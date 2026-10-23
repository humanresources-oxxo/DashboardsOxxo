/* ==========================================================
   TURNO NOCTURNO — ranking de la oficina
   Consumido por: dashboards/turno-nocturno.html.

   Unico punto del juego que habla con la red: lee y guarda los
   mejores tiempos en la hoja oculta Juego_Ranking a traves del
   Apps Script (acciones publicas "ranking" y "rankingGuardar").
   Solo envia nombre, tiempo, monitos y turnos, y solo cuando el
   jugador termina los 3 turnos y decide guardar. El Apps Script
   valida todo de nuevo: esto es un juego, no un registro oficial.

   Cada dificultad (facil, normal, dificil) tiene su propia tabla.

   Uso: OXXO_TURNO_RANKING.crear(urlAppsScript) -> { listar(dificultad), guardar(marca) }
   o null si no hay URL (el juego sigue con el record local).
   ========================================================== */
(function () {
  'use strict';

  function crear(url) {
    if (!url) return null;
    async function leerJson(respuesta) {
      if (!respuesta.ok) throw new Error('El ranking no respondió (HTTP ' + respuesta.status + ')');
      const datos = await respuesta.json();
      if (!datos || datos.ok === false) throw new Error((datos && datos.error) || 'El ranking no respondió');
      return datos;
    }
    return {
      async listar(dificultad = 'normal') {
        const datos = await leerJson(await fetch(url + (url.includes('?') ? '&' : '?') + 'action=ranking&dificultad=' + encodeURIComponent(dificultad) + '&t=' + Date.now()));
        return Array.isArray(datos.ranking) ? datos.ranking : [];
      },
      async guardar(marca) {
        const cuerpo = JSON.stringify({ action: 'rankingGuardar', nombre: marca.nombre, tiempo: marca.tiempo, monitos: marca.monitos, turnos: marca.turnos, dificultad: marca.dificultad });
        // text/plain evita la consulta previa de CORS que Apps Script no contesta.
        const datos = await leerJson(await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: cuerpo }));
        return { ranking: Array.isArray(datos.ranking) ? datos.ranking : [], lugar: datos.lugar || null };
      }
    };
  }

  window.OXXO_TURNO_RANKING = { crear };
})();
