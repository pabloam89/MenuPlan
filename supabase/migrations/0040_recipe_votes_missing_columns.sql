-- ═══ recipe_votes: las dos columnas que nunca llegaron ═════════════════════
--
-- En producción, cada carga de la app falla con:
--   [recipeVotes] load failed column recipe_votes.scope does not exist
--   GET /rest/v1/recipe_votes?select=recipe_id,vote,is_favorite,scope → 400
--
-- Comprobado columna a columna contra la base: `recipe_id`, `vote` e
-- `is_favorite` existen; `scope` y `updated_at` no.
--
-- Por qué faltan, que es lo interesante: el `alter table ... add column` de
-- `scope` vive dentro de 0003 (línea 150), una migración que YA estaba
-- aplicada cuando se añadió esa línea. Postgres no vuelve a ejecutar una
-- migración pasada, así que ese ALTER no corrió nunca — y el `if not exists`
-- no ayuda: el problema no es que se ejecute dos veces, es que no se ejecuta
-- ninguna. Es exactamente la misma trampa que nos obligó a sacar 0037 aparte.
--
-- Consecuencia real mientras tanto: los favoritos no cargan de la nube. La
-- app no se cae porque recipeVotes degrada a localStorage, pero quien cambie
-- de dispositivo pierde sus favoritas.

alter table public.recipe_votes
  add column if not exists scope text[];

comment on column public.recipe_votes.scope is
  'Grupos de menú a los que aplica la favorita (NULL = todo el hogar). Sin sentido cuando is_favorite = false.';

-- `updated_at` lo escribe el cliente en cada upsert; sin la columna, PostgREST
-- rechaza la escritura entera.
alter table public.recipe_votes
  add column if not exists updated_at timestamptz not null default now();
