-- `adelanto`: dónde se parte un plato a medio hacer.
--
-- No es lo mismo que una base. `main_base` y `bases_aparte` dicen qué
-- INGREDIENTE se puede tener hecho de antes (una olla de arroz, un sofrito) y
-- sirve para varios platos. Esto es un plato CONCRETO cuya parte lenta se deja
-- hecha: las croquetas formadas y empanadas, la lasaña montada en su fuente,
-- las empanadillas cerradas. El día que toca solo queda freír o encender el
-- horno.
--
-- Tampoco lo cubre `freezable`, que dice "cocínalo entero y congélalo". Para un
-- guiso esa es la respuesta buena, y por eso unas albóndigas en salsa NO llevan
-- este campo. Pero lo rebozado, lo hojaldrado y lo gratinado se arruinan
-- cocinados dos veces, y son justo los platos que más trabajo dan: para esos el
-- ahorro no está en cocinar antes, sino en llegar con el trabajo hecho.
--
-- Va como jsonb y no como tres columnas porque los tres valores no significan
-- nada por separado: un `hasta` sin su `guarda` no dice si eso espera en la
-- nevera o en el congelador, y son siempre el mismo objeto. Mismo criterio que
-- `rinde` en las bases.
--
--   { "hasta": 13, "guarda": "congelador", "dias": 60 }
--
-- `hasta` es el índice del último paso de steps_rich que se hace el día de la
-- tanda. Se guarda el índice y no las dos listas de pasos para que no existan
-- dos copias de la receta que se puedan descuadrar cuando alguien edite un
-- paso. Los minutos de cada lado tampoco se guardan: se suman de los pasos, que
-- ya traen los suyos (src/lib/adelanto.js).
--
-- Nullable y sin default: hoy lo llevan 39 platos del catálogo estrella, y
-- ausente significa "este plato se cocina de una vez", que es lo normal.
--
-- A diferencia de `conservacion` y `reactivacion`, este campo SÍ necesita
-- columna: aquellos solo los llevan las recetas type:base, que viajan siempre
-- en el bundle. Estos 39 son platos corrientes y se sirven desde aquí en
-- cuanto catalog_meta.version alcance a la del bundle.

alter table recipes
  add column if not exists adelanto jsonb;

comment on column recipes.adelanto is
  'Corte de un plato a medio hacer: {hasta, guarda, dias}. Ver src/lib/adelanto.js.';
