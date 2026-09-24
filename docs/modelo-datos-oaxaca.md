# Modelo de datos preparado para crecimiento

El sistema opera para la **Region TABASCO** (Plaza Oaxaca, Costa Istmo, Tuxtla,
Villahermosa y Chontalpa; Oaxaca es la plaza inicial y Dashboard 13 es de alcance
fijo Oaxaca). La identidad geografica se mantiene centralizada en `js/config.js`,
dentro de `DATA_CONTEXT` y `SCOPE_MODEL`. Los dashboards no deben crear valores de plaza propios.

## Llave de tienda

El **CR** es la llave estable para relacionar una tienda entre fuentes. El
nombre de tienda es una etiqueta visible y solo se usa como respaldo cuando la
fuente no incluye CR.

Reglas:

1. Normalizar el CR en mayusculas y sin espacios o simbolos.
2. No unir bases unicamente por el nombre de la tienda.
3. Mantener una sola fila activa por CR en `Catalogo_Asesores`.
4. Si cambia el nombre o asesor, conservar el mismo CR.

## Catalogo maestro actual

`Catalogo_Asesores` conserva sus tres primeras columnas para compatibilidad:

1. `ASESOR`
2. `TIENDA`
3. `CR TIENDA`

Y queda preparado con columnas adicionales:

4. `Region`
5. `Plaza`
6. `Zona`
7. `ACTIVA`

Cuando esas columnas no vienen en el Excel, el panel completa Region y Plaza
con el contexto de Oaxaca, deja Zona vacia y asigna `ACTIVA = SI`.

## Periodos

Cada dashboard conserva su columna temporal actual (`Mes`, `Semana`, `Periodo`
o fecha de corte). El panel sigue reemplazando solamente el periodo cuando el
dashboard lo requiere. No se agrega una columna nueva a hojas antiguas para no
romper consultas existentes.

## Incorporar otra plaza en el futuro

Antes de habilitar una segunda plaza se debe cambiar el contexto fijo por una
seleccion administrativa, agregar sus CR al catalogo y aplicar los filtros
jerarquicos. La estructura de CR, Region, Plaza y Zona ya queda disponible sin
duplicar las paginas de los dashboards.
