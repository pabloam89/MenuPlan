-- Id canónico del catálogo de ingredientes (src/data/ingredients.json), resuelto
-- en escritura vía resolveIngredientId() y guardado junto al nombre libre de
-- siempre. Nullable a propósito: "no resuelve" no es un error (el catálogo no
-- cubre todo lo que alguien puede tener en la despensa) — mismo criterio que
-- el resto de campos derivados del catálogo (ver ingredients.js). Habilita
-- coincidencia exacta despensa↔receta cuando ambos lados resuelven al mismo id,
-- con el matching por texto de siempre como red de seguridad.
alter table user_pantry add column if not exists ingredient_id text;
