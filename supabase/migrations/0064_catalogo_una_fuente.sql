-- El catálogo de recetas tiene UNA fuente: el bundle (src/data/recipes).
--
-- La app leía antes esta copia si catalog_meta.version iba por delante del
-- bundle. Se quedó en la v27 mientras el bundle llegaba a la v39, y desde el
-- 30 sep 2026 nadie la lee (src/data/recipeCatalog.js). No se borra nada: se
-- marca, para que nadie la tome por buena ni vuelva a sembrarla creyendo que
-- sirve. `ingredients` NO entra: la despensa (user_pantry) apunta a ella.

comment on table public.recipes is
  'EN DESUSO desde el 30 sep 2026: copia antigua (v27) del catálogo; la app no la lee. La fuente es src/data/recipes en el repo.';
comment on table public.catalog_meta is
  'EN DESUSO desde el 30 sep 2026: la versión que decidía entre bundle y Supabase. La app ya no la consulta.';
comment on table public.recipe_ingredients is
  'EN DESUSO desde el 30 sep 2026: derivada de la copia antigua del catálogo. Sin lectores.';
comment on table public.dish_images is
  'EN DESUSO desde el 30 sep 2026: las fotos salen de src/assets/dishes/dishImages.json. Sin lectores.';
