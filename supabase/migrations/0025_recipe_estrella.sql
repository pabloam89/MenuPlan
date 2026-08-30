-- `estrella`: ¿pertenece al Recetario Estrella (catálogo principal, curado en
-- 2026)? Reemplaza a "¿tiene foto?" como señal de nivel de catálogo — ver el
-- commit "fix(recetas): el nivel de catálogo ya no depende de tener foto"
-- (recipeSchema.js) para el porqué.
--
-- CRÍTICO ejecutar esto (+ el reseed) ANTES de desplegar cualquier código que
-- quite el fallback a "fondo de armario" cuando el pool principal se queda
-- corto: sin esta columna, recipe.estrella es undefined para TODA receta
-- servida desde Supabase (que es el caso normal en producción), así que
-- isPrimaryCatalog() devuelve false para todo salvo recetas propias — el pool
-- principal se queda a 0 para cualquier grupo sin bebés.
--
-- TODO ES ADITIVO, mismo patrón que 0023/0024: nullable, sin default no
-- trivial, las filas existentes quedan intactas.
--
-- Run this in: Supabase Dashboard → SQL Editor → project → Run.

alter table recipes      add column if not exists estrella boolean;
alter table user_recipes add column if not exists estrella boolean;
