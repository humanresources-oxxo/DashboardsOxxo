/* Consumido por: dashboard-3, index. */
/* ==========================================================
   OXXO — Formato de fechas de actualizacion

   Fuente unica para convertir lo que publica la pestaña
   `Configuracion` (y las columnas de fecha de las pestañas de
   datos) en un texto legible: "21 sep 2026".

   Acepta los tres formatos que conviven hoy en la hoja:
     2026-09-21T06:00:36.000Z   (fecha real de Sheets, via gviz)
     21/09/2026                 (lo que escribe el publicador)
     21/sept/2026               (lo que se captura a mano)
   y devuelve el texto tal cual si no reconoce nada, para no
   inventar una fecha que no existe.

   Vivia dentro de js/home-navigation.js, que dejo de cargarse
   cuando la portada se rehizo; se extrajo aqui para que la
   portada y los tableros compartan una sola implementacion
   con pruebas (tests/home-dates.test.js).
   ========================================================== */
(function () {
  'use strict';
  const normalize = value => String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  function formatDate(value) {
    const text = String(value || '').trim();
    let match = text.match(/^(\d{4})-(\d{2})(?:-(\d{2})(?:T.*)?)?$/);
    let year, month, day;
    if (match) [, year, month, day] = match;
    else {
      match = text.match(/^(\d{1,2})[\/-](\d{1,2}|[a-záé]+)[\/-](\d{4})$/i);
      if (!match) return text;
      [, day, month, year] = match;
      if (!/^\d+$/.test(month)) month = months.indexOf(normalize(month).slice(0, 3)) + 1;
    }
    const y = Number(year), m = Number(month), d = day == null ? null : Number(day);
    if (m < 1 || m > 12 || (d !== null && (d < 1 || d > new Date(Date.UTC(y, m, 0)).getUTCDate()))) return text;
    return `${d === null ? '' : d + ' '}${months[m - 1]} ${y}`;
  }
  window.OXXO_HOME = { formatDate, normalize };
})();
