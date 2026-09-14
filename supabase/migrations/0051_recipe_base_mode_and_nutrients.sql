-- Las cinco columnas que le faltaban al espejo del catálogo.
--
-- (Nada que ver con la 0051 anterior, la de reglas: aquella se retiró antes de
-- aplicarse porque su `with check` permitía inyectar una regla en el hogar de
-- otra familia, y el número quedó libre.)
--
-- ── Qué arregla ────────────────────────────────────────────────────────────
-- La tabla `recipes` es el ESPEJO del catálogo del bundle: existe para poder
-- cambiar recetas sin publicar la app. Gana quien tenga la versión más alta en
-- catalog_meta, y el empate lo gana la nube.
--
-- El problema no es que falten muchos campos — hoy viajan 44 de los 55. Es que
-- cuando falta uno, NO FALLA NADA: el campo llega `undefined` y el motor se
-- comporta como si la receta nunca lo hubiera tenido. Ha pasado cinco veces
-- (apetecible, montaje, estrella, occasion, extraProteins), y el de `estrella`
-- dejaba el pool principal del generador a cero para cualquier grupo sin bebés.
--
-- Estos cinco son los que quedaban con consecuencia real:
--
--   base_mode        356 recetas. Es la clave ENTERA del batch cooking, y sin
--                    ella `main_base` no sirve para lo que existe: main_base
--                    dice qué fécula lleva el plato; base_mode dice si esa
--                    fécula se puede tener hecha del domingo ("aparte", el
--                    arroz de un bowl) o se cocina dentro absorbiendo su caldo
--                    ("dentro", el de un risotto), donde precocinarla no ahorra
--                    tiempo: arruina el plato. Una receta servida desde la nube
--                    sin esta columna no propone ni una sola tanda.
--
--   fiber_g          888 recetas cada uno. Nutrición secundaria, que es la que
--   sugar_g          alimenta los perfiles de "menú más cuidado".
--   saturated_fat_g
--   sodium_mg
--
-- Los otros seis que no viajan NO se añaden, y está decidido a mano:
-- health_flags se deriva al cargar (lib/healthFlags.js), scales_with_eaters no
-- lo escribe ninguna receta del catálogo (es de user_recipes), y los cuatro de
-- rendimiento de una base (rinde, minutos_fijos, minutos_por_racion,
-- capacidad_max) solo los llevan las 7 recetas `type: "base"`, que son off-menu
-- y no se sirven desde aquí. La lista vive también en src/data/recipeRow.test.js,
-- que es el fusible que impide que haya un sexto olvido.
--
-- ── Todas nullable, a propósito ────────────────────────────────────────────
-- Igual que las columnas de 0023/0024/0025: una fila que no las traiga sigue
-- siendo válida, y el mapeador distingue "no hay dato" de un valor de verdad.
-- Por eso base_mode no lleva DEFAULT: ausente significa "sin decidir", que NO
-- es lo mismo que "dentro" (ver el comentario de baseMode en recipeSchema.js).

alter table recipes
  add column if not exists base_mode        text
    check (base_mode is null or base_mode in ('aparte', 'dentro')),
  add column if not exists fiber_g          numeric check (fiber_g         is null or fiber_g         >= 0),
  add column if not exists sugar_g          numeric check (sugar_g         is null or sugar_g         >= 0),
  add column if not exists saturated_fat_g  numeric check (saturated_fat_g is null or saturated_fat_g >= 0),
  add column if not exists sodium_mg        numeric check (sodium_mg       is null or sodium_mg       >= 0);

comment on column recipes.base_mode is
  '¿La base se cocina aparte del plato (batch cooking posible) o dentro de él? Ausente = sin decidir, que no es "dentro".';
