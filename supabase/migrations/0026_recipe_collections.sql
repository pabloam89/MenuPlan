-- ── Carpetas de recetas (dentro de "Mis recetas") ─────────────
-- Dos clases conviven en el mismo modelo:
--   · las 4 fijas de Inspíranos ('dia_a_dia', 'ocasion_especial',
--     'cena_rapida', 'hijos'), que se rellenan solas al swipear y no se
--     renombran ni se borran — no tienen fila en recipe_folders;
--   · las que crea el usuario, con id 'fld_<uuid>' y nombre libre.
-- Por eso collection_id NO lleva CHECK contra una lista cerrada: sería
-- imposible añadir una carpeta nueva sin migración.
--
-- Todo esto es personal (user_id). El favorito que acompaña a un swipe puede
-- acabar en household_favorites y compartirse con el hogar, pero en qué
-- carpeta lo guardas tú no se comparte.

create table if not exists recipe_folders (
  id         text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now()
);

alter table recipe_folders enable row level security;
create index if not exists idx_recipe_folders_user on recipe_folders(user_id);

create policy "Users manage own recipe folders"
  on recipe_folders for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- recipe_id es text sin FK, igual que en recipe_votes: puede apuntar a un id
-- del catálogo ("carnes_001") o a uno de user_recipes ("user_<uuid>").
-- collection_id sin FK tampoco, porque las 4 fijas no existen como fila.
create table if not exists recipe_collections (
  user_id       uuid not null references auth.users(id) on delete cascade,
  recipe_id     text not null,
  collection_id text not null,
  added_at      timestamptz not null default now(),
  primary key (user_id, recipe_id, collection_id)
);

alter table recipe_collections enable row level security;
create index if not exists idx_recipe_collections_user on recipe_collections(user_id);

create policy "Users manage own collections"
  on recipe_collections for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

comment on table recipe_folders is 'Carpetas de recetas creadas por el usuario. Las 4 fijas de Inspíranos NO viven aquí: son constantes de cliente.';
comment on column recipe_collections.collection_id is 'Id de carpeta: una de las 4 fijas de Inspíranos o un fld_<uuid> de recipe_folders. Sin CHECK a propósito.';
