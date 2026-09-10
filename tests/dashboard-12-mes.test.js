// Dashboard 12 se quedo COMPLETAMENTE vacio en produccion sin que nadie lo
// notara. El publicador escribe el mes como texto "2026-07", pero Google
// Sheets lo reinterpreta como fecha al guardarlo y gviz lo devuelve como
// "2026-07-01". El filtro del tablero exigia exactamente AAAA-MM
// (/^\d{4}-\d{2}$/, anclado al final), asi que descartaba las 2,942 filas:
// 0 lideres, 0 meses, graficas vacias y un "Equipo: undefined%" en el badge.
//
// Esta prueba fija las dos formas que la hoja puede publicar y exige que el
// tablero recorte a AAAA-MM antes de filtrar, porque TODO lo de abajo
// (MESES, POR_TIENDA_MES, HIST_TIENDA, nombreMes) agrupa por esa clave.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'dashboards/dashboard-12.html'), 'utf8');

// El tablero debe normalizar el mes antes de filtrar.
assert.ok(
  /r\[C\.mes\]\s*=\s*`\$\{m\[1\]\}-\$\{m\[2\]\}`/.test(html),
  'dashboard-12 ya no recorta el mes a AAAA-MM antes de filtrar'
);

// La normalizacion y el filtro, tal como estan en la pagina.
function normalizaMes(valor) {
  const m = /^(\d{4})-(\d{2})/.exec(String(valor ?? '').trim());
  return m ? `${m[1]}-${m[2]}` : String(valor ?? '').trim();
}
const pasaFiltro = valor => /^\d{4}-\d{2}$/.test(normalizaMes(valor));

// Lo que la hoja publica hoy (fecha completa) y lo que escribe el publicador.
assert.equal(normalizaMes('2026-07-01'), '2026-07', 'fecha completa de gviz');
assert.equal(normalizaMes('2026-07'), '2026-07', 'texto del publicador');
assert.equal(normalizaMes('2025-08-01'), '2025-08', 'primer mes de la serie');

for (const valor of ['2026-07-01', '2026-07', '2025-08-01', '2025-12-01']) {
  assert.ok(pasaFiltro(valor), `deberia aceptar ${valor}`);
}

// Y lo que sigue sin ser un mes real no debe colarse.
for (const basura of ['', 'Total', '2026', 'jul-26', null, undefined]) {
  assert.ok(!pasaFiltro(basura), `no deberia aceptar ${JSON.stringify(basura)}`);
}

// nombreMes solo entiende AAAA-MM: si la normalizacion se rompe, el corte
// del hero muestra la fecha cruda en vez de "Jul 2026".
const nombreMes = new Function(
  html.match(/function nombreMes\(([\s\S]*?)\n\}/)[0] + '\nreturn nombreMes;'
)();
assert.equal(nombreMes(normalizaMes('2026-07-01')), 'Jul 2026');
