-- 0074 · Caché de traducciones (fase 7 de specs/roles-de-la-casa-*.md).
--
-- Lo que pinta el código debajo de Lola (el menú de un día o de la semana, los
-- pies de las fotos) está en castellano. Para quien eligió inglés (ui_lang,
-- 0073) se traduce con un modelo pequeño (api/_bot/traducir.js) y se guarda
-- aquí: el mismo menú no se traduce dos veces, y las semanas se repiten mucho.
--
-- La clave es el hash del texto original: si el texto cambia, es otra fila.
-- Solo el servidor (RLS sin políticas, como bot_codigos).
--
-- Idempotente.

create table if not exists public.content_translations (
  source_hash text not null,
  lang        text not null check (lang in ('en')),
  texto       text not null,
  created_at  timestamptz not null default now(),
  primary key (source_hash, lang)
);
alter table public.content_translations enable row level security;
