-- ═══ Cocinadas: "hoy he hecho esto", con foto ══════════════════════════════
--
-- Una receta es permanente, estructurada y copiable; vive en el catálogo o en
-- user_recipes y no caduca. Una cocinada es un EVENTO sobre esa receta: esta
-- vez, esta foto, esta mesa. La misma receta acumula cocinadas — y ahí está lo
-- que ninguna app de fotos puede hacer, porque en un álbum dos fotos de
-- lentejas no saben que son la misma cosa.
--
-- De esa separación salen las dos velocidades del producto:
--   · el río de cocinadas corre rápido y admite borradores;
--   · el catálogo crece despacio y solo acepta fichas terminadas.
--
-- ── La regla que impide que esto sea Instagram ─────────────────────────────
-- Una cocinada NO PUEDE existir sin una receta debajo: `recipe_id` y
-- `recipe_name` son NOT NULL. En Instagram la unidad es el post y no hay nada
-- debajo, y por eso puedes subir lo que quieras. Aquí siempre hay un objeto
-- detrás de la foto, así que cada foto del feed es una puerta a algo que te
-- puedes copiar a tu semana. El ancla es estructural, no una norma de estilo.
--
-- ── Por qué recipe_id es TEXT y no una FK ──────────────────────────────────
-- Apunta a tres sitios distintos: un id del catálogo ('legumbres_001'), un
-- user_recipes.id, o un BORRADOR ('draft_...') que todavía no es ficha de
-- nada. Una clave foránea obligaría a que la receta existiera ANTES, y eso
-- convertiría el asistente de 7 pasos en un peaje para publicar la cena de un
-- martes — que es justo lo que el borrador existe para evitar.
--
-- ── Por qué esto no cuelga de shared_menus ─────────────────────────────────
-- Un menú publicado es una instantánea de una SEMANA y se republica entera;
-- una cocinada es un evento suelto de un día que caduca de la fila a las 48 h.
-- Meterlas en la misma tabla obligaría a que compartieran ciclo de vida.

create table if not exists public.cookings (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users(id) on delete cascade,

  -- Catálogo, receta propia o borrador. Ver arriba.
  recipe_id    text not null,
  -- Desnormalizado a propósito: la tarjeta pinta el nombre sin resolver la
  -- receta, y si el borrador nunca llega a escribirse el nombre sigue ahí.
  recipe_name  text not null,
  is_draft     boolean not null default false,

  -- URL pública en el bucket cooking-photos. Nula si publicó sin foto: el
  -- cliente cae entonces al cartel del catálogo del plato vinculado.
  photo_url    text,

  -- El adhesivo: { text, id, x, y, anchor, color }. La POSICIÓN forma parte
  -- del dato — dos personas con la misma frase no producen la misma imagen.
  sticker      jsonb,

  -- Quién comió, con los avatares ANÓNIMOS de la casa ({ avatar, role }),
  -- igual que el payload de shared_menus: aquí no entra ni un nombre.
  eaters       jsonb not null default '[]'::jsonb,
  -- Los invitados sí son usuarios reales, así que van por id y se pueden
  -- resolver a su perfil público.
  guests       uuid[] not null default '{}',

  visibility   public.social_visibility not null default 'followers',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint chk_cookings_recipe_name_len check (length(recipe_name) between 1 and 160)
);

alter table public.cookings enable row level security;

-- El río se lee por fecha y se corta a las 48 h; el índice parcial deja fuera
-- lo privado, que es la mayoría de lo que no se consulta nunca.
create index if not exists idx_cookings_feed
  on public.cookings (created_at desc)
  where visibility <> 'private';

create index if not exists idx_cookings_owner
  on public.cookings (owner_id, created_at desc);

-- "Las veces que se ha cocinado esta receta" es la consulta que hace especial
-- a este objeto, y sin este índice sería un escaneo completo.
create index if not exists idx_cookings_recipe
  on public.cookings (recipe_id, created_at desc);

-- ── Quién ve qué ───────────────────────────────────────────────────────────
-- Mismas tres políticas que shared_menus: el dueño manda sobre lo suyo, lo
-- público lo lee cualquiera (incluido anónimo) y lo de 'followers' solo quien
-- te sigue. Ver is_following() en 0027.

drop policy if exists "Owner manages own cookings" on public.cookings;
create policy "Owner manages own cookings"
  on public.cookings for all
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

drop policy if exists "Public cookings readable" on public.cookings;
create policy "Public cookings readable"
  on public.cookings for select
  using (visibility = 'public');

drop policy if exists "Followers read followers-only cookings" on public.cookings;
create policy "Followers read followers-only cookings"
  on public.cookings for select
  using (visibility = 'followers' and public.is_following((select auth.uid()), owner_id));

drop trigger if exists trg_cookings_updated_at on public.cookings;
create trigger trg_cookings_updated_at
  before update on public.cookings
  for each row execute function public.set_updated_at();


-- ── El cubo de las fotos ───────────────────────────────────────────────────
--
-- Mismo criterio que recipe-photos (0039): público para leer, porque estas
-- fotos acompañan a algo que se publica y tienen que verse sin sesión y sin
-- firmar URLs. Lo que se protege es quién ESCRIBE.
--
-- Y por la misma razón que allí, la foto es un fichero y no un data: URL en la
-- fila: una foto de cena incrustada como texto pesa un 33% más, no se cachea
-- por separado y viaja aunque solo quieras el nombre del plato.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'cooking-photos',
  'cooking-photos',
  true,
  5242880,  -- 5 MB: de sobra para una foto de móvil ya comprimida
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Las rutas son "<user_id>/<cooking_id>.jpg", así que la primera carpeta del
-- nombre es el dueño: comparándola con auth.uid() nadie puede pisar las fotos
-- de otro ni llenar el cubo a su nombre.

drop policy if exists "Cooking photos are publicly readable" on storage.objects;
create policy "Cooking photos are publicly readable"
  on storage.objects for select
  using (bucket_id = 'cooking-photos');

drop policy if exists "Owner uploads own cooking photos" on storage.objects;
create policy "Owner uploads own cooking photos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'cooking-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Owner replaces own cooking photos" on storage.objects;
create policy "Owner replaces own cooking photos"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'cooking-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Owner deletes own cooking photos" on storage.objects;
create policy "Owner deletes own cooking photos"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'cooking-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

comment on table public.cookings is
  'Un evento de "hoy he cocinado esto": foto + adhesivo + quién comió, SIEMPRE colgando de una receta (recipe_id). Caduca de la fila de Gente a las 48 h pero la fila no se borra: es la historia de esa receta.';
