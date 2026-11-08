-- 0094 · Lápidas de las recetas propias en la nube: lo borrado no resucita.
-- AUDITADA: auditor-datos 2026-10-09 OK
--
-- Qué pasa hoy (issue #355, diagnóstico en #316): borrar una receta propia en
-- el móvil quita su fila de user_recipes y deja la «lápida» solo en el
-- localStorage del móvil. El portátil la sigue teniendo en local, no la ve en
-- la nube y la vuelve a subir como «solo local»: lo borrado reaparece en todos
-- los dispositivos. Y Lola la sigue viendo si quedaba una copia en el JSON de
-- la casa (api/_bot/propias.js toma lo del JSON cuyo id «no está en la tabla»).
--
-- Qué hace (opción B, decidida por Pablo el 9 oct 2026):
-- 1. Tabla user_recipe_deletions: una lápida por (dueño, id de receta), con el
--    instante del borrado. Solo se lee desde el cliente (la suya); no se
--    escribe desde el cliente.
-- 2. RPC borrar_receta_propia(p_receta): en una transacción, apunta la lápida
--    y borra la fila. Es el único camino que escribe lápidas.
-- 3. Trigger trg_user_recipes_no_revivir (before insert): si el id tiene lápida de
--    ese mismo dueño, la fila no entra (return null, sin error, para no tumbar
--    el upsert en bloque de un dispositivo viejo que trae otras recetas
--    buenas). Así la base mantiene la invariante «un id con lápida no está en
--    user_recipes» aunque un cliente con código de antes intente resubirla.
--
-- Por qué una tabla de lápidas y no `deleted_at` en user_recipes: con la
-- columna, la fila seguiría viva y la verían todos los que leen user_recipes
-- sin saberlo: el feed y el perfil (src/lib/social.js, tres consultas), el
-- enlace compartido (recipe_from_link, 0055), Lola al compartir y copiar
-- (api/_bot/compartir.js), las políticas de lectura 'public'/'friends' (0046),
-- las fotos (recipePhotos.js) y las cascadas de comentarios y enlaces. Olvidar
-- el filtro en uno solo enseñaría a los amigos una receta que su dueña borró.
-- Con la tabla aparte, la fila se sigue borrando de verdad (y con ella sus
-- enlaces, en cascada, como hoy) y la lápida solo la leen los dos que la
-- necesitan: la sincronización de la app (src/lib/userRecipesSync.js) y Lola
-- (api/_bot/propias.js).
--
-- Excepción declarada a PRINCIPIOS §1 («no se crean tablas nuevas por
-- usuario»): la lápida es satélite de user_recipes, que es por usuario
-- (excepción congelada); cuelga del mismo dueño y se borra con él.
--
-- Ciclo de vida de una lápida: nace al borrar (solo por la RPC), no se edita
-- nunca, y muere con la cuenta (on delete cascade desde auth.users). No se
-- purga: se revisa si algún dueño se acerca a 2000 lápidas (el tope de lectura
-- de la app, TOPE_LAPIDAS en src/lib/userRecipesSync.js). Una receta editada en otro dispositivo después de borrada no
-- vuelve: el borrado gana (el upsert de la edición lo para el trigger y ese
-- dispositivo quita su copia en la siguiente carga).
--
-- Lectores: loadRecetasBorradas (src/lib/userRecipesSync.js) y
-- recetasPropiasDeCasa (api/_bot/propias.js). Escritor: borrar_receta_propia.
--
-- Consultas previas (deben dar 0 / null, lo comprueba el bloque de abajo):
--   select to_regclass('public.user_recipe_deletions');
--   select count(*) from pg_proc where proname in ('borrar_receta_propia', 'user_recipes_no_revivir');
--   select count(*) from public.user_recipes where id !~ '^user_[0-9a-z-]{1,40}$';
--
-- Al final, una autoprueba dentro de un subbloque que se deshace siempre: con
-- un dueño real cualquiera, crea una receta de prueba, la borra con la RPC,
-- intenta resubirla y comprueba que no entra, todo con el rol authenticated
-- (pasa por la RLS, como la app). No deja nada escrito.
--
-- No toca la RLS ni los permisos de nada que ya existiera, pero crea una
-- función security definer y hace revoke on function: LA LANZA PABLO con
-- --pablo (revisada por seguridad y auditor-datos el 9 oct 2026).
--
-- Testigo: la tabla public.user_recipe_deletions y el trigger
-- trg_user_recipes_no_revivir en public.user_recipes.
--
-- SIN APLICAR.

set lock_timeout = '5s';

do $$
begin
  if to_regclass('public.user_recipes') is null then
    raise exception '0094: falta public.user_recipes';
  end if;
  if to_regclass('public.user_recipe_deletions') is not null then
    raise exception '0094: user_recipe_deletions ya existe';
  end if;
  if exists (select 1 from pg_proc where proname in ('borrar_receta_propia', 'user_recipes_no_revivir')) then
    raise exception '0094: ya hay una función borrar_receta_propia o user_recipes_no_revivir';
  end if;
  -- El check de recipe_id es ids.recetaPropia.viejo (src/lib/ids.js), que
  -- abarca también los nuevos (lo compara supabase/lapidasFormato.test.js):
  -- si alguna receta viva no lo cumple, su borrado fallaría.
  if exists (select 1 from public.user_recipes where id !~ '^user_[0-9a-z-]{1,40}$') then
    raise exception '0094: hay recetas propias con un id fuera del formato de ids.recetaPropia';
  end if;
end $$;

-- ── La tabla ─────────────────────────────────────────────────────────────

create table public.user_recipe_deletions (
  owner_id   uuid not null references auth.users(id) on delete cascade,
  recipe_id  text not null,
  created_at timestamptz not null default now(),
  primary key (owner_id, recipe_id),
  constraint user_recipe_deletions_recipe_id_formato
    check (recipe_id ~ '^user_[0-9a-z-]{1,40}$')
);

comment on table public.user_recipe_deletions is
  'Lápidas de recetas propias borradas (#355): que una receta borrada en un dispositivo no la vuelva a subir otro. '
  'La escribe solo borrar_receta_propia (0094), en la misma transacción que borra la fila de user_recipes; '
  'la leen userRecipesSync.js (app) y api/_bot/propias.js (Lola). El trigger trg_user_recipes_no_revivir impide '
  'que un id con lápida vuelva a entrar en user_recipes. Inmutable; se va con la cuenta.';
comment on column public.user_recipe_deletions.owner_id is
  'Dueño de la receta borrada (el mismo owner_id que tenía en user_recipes). Cascada: la lápida se va con la cuenta.';
comment on column public.user_recipe_deletions.recipe_id is
  'Id de la receta borrada (user_recipes.id). Sin FK a propósito: la fila a la que apuntaba ya no existe, '
  'esa es la razón de ser de la lápida. Formato de ids.recetaPropia (src/lib/ids.js).';
comment on column public.user_recipe_deletions.created_at is
  'Instante del borrado (la lápida nace al borrar y no se edita). Sirve para purgar las viejas.';

alter table public.user_recipe_deletions enable row level security;

-- El cliente solo lee las suyas; no escribe: las lápidas las pone la RPC.
revoke all on table public.user_recipe_deletions from anon, authenticated;
grant select on table public.user_recipe_deletions to authenticated;

create policy "Owner reads own recipe deletions"
  on public.user_recipe_deletions for select
  to authenticated
  using ((select auth.uid()) = owner_id);

-- ── Borrar una receta propia dejando su lápida ───────────────────────────

create function public.borrar_receta_propia(p_receta text)
 returns boolean
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
declare
  v_yo uuid := (select auth.uid());
  v_n integer;
begin
  if v_yo is null then
    raise exception 'borrar_receta_propia: hace falta sesión' using errcode = '42501';
  end if;
  -- El id de una receta ajena no se toca ni deja lápida.
  if exists (select 1 from public.user_recipes where id = p_receta and owner_id <> v_yo) then
    return false;
  end if;
  insert into public.user_recipe_deletions (owner_id, recipe_id)
  values (v_yo, p_receta)
  on conflict (owner_id, recipe_id) do nothing;

  delete from public.user_recipes
  where id = p_receta and owner_id = v_yo;
  get diagnostics v_n = row_count;
  -- true si había fila que borrar; false si ya no estaba (borrada antes, o
  -- nunca llegó a la nube). En los dos casos la lápida queda puesta.
  return v_n > 0;
end;
$function$;

comment on function public.borrar_receta_propia(text) is
  'Borra una receta propia de quien llama y deja su lápida en user_recipe_deletions, en una sola transacción (#355). '
  'La llama deleteUserRecipe (src/lib/userRecipesSync.js). Devuelve si había fila que borrar.';

revoke all on function public.borrar_receta_propia(text) from public, anon, authenticated;
grant execute on function public.borrar_receta_propia(text) to authenticated;

-- ── Lo que tiene lápida no vuelve a entrar ───────────────────────────────

create function public.user_recipes_no_revivir()
 returns trigger
 language plpgsql
 security invoker
 set search_path = public, pg_temp
as $function$
begin
  -- Invoker: quien inserta como usuario ve sus lápidas por la RLS (y la RLS
  -- de user_recipes ya exige owner_id = auth.uid()); el servidor no tiene RLS.
  if exists (
    select 1 from public.user_recipe_deletions d
    where d.owner_id = new.owner_id and d.recipe_id = new.id
  ) then
    -- Sin error a propósito: un dispositivo con código de antes sube sus
    -- recetas en un solo upsert, y un error tumbaría también las buenas.
    return null;
  end if;
  return new;
end;
$function$;

comment on function public.user_recipes_no_revivir() is
  'Trigger before insert de user_recipes (0094): una receta con lápida de su dueño en user_recipe_deletions no vuelve a entrar.';

revoke all on function public.user_recipes_no_revivir() from public, anon, authenticated;

create trigger trg_user_recipes_no_revivir
  before insert on public.user_recipes
  for each row execute function public.user_recipes_no_revivir();

-- ── Autoprueba (se deshace siempre) ──────────────────────────────────────

do $$
declare
  v_dueno uuid;
  v_id constant text := 'user_autoprueba-0094';
  v_habia boolean;
begin
  select owner_id into v_dueno from public.user_recipes limit 1;
  if v_dueno is null then
    raise notice '0094 autoprueba: no hay ninguna receta propia, no se prueba';
    return;
  end if;
  begin
    -- Como si llamara el dueño desde la app, con su rol y su RLS. set_config
    -- local se deshace con el subbloque.
    perform set_config('request.jwt.claims', json_build_object('sub', v_dueno, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    if current_user <> 'authenticated' then
      raise exception '0094 autoprueba: no se pudo pasar a authenticated';
    end if;
    insert into public.user_recipes (id, owner_id, name, category, type)
    values (v_id, v_dueno, 'Autoprueba 0094', 'huevos', 'completo');

    v_habia := public.borrar_receta_propia(v_id);
    if not v_habia then
      raise exception '0094 autoprueba: borrar_receta_propia no encontró la receta';
    end if;
    if exists (select 1 from public.user_recipes where id = v_id) then
      raise exception '0094 autoprueba: la receta sigue en user_recipes';
    end if;
    if not exists (select 1 from public.user_recipe_deletions where owner_id = v_dueno and recipe_id = v_id) then
      raise exception '0094 autoprueba: no quedó la lápida';
    end if;

    -- Un dispositivo viejo la resube, con upsert como hace upsertUserRecipes.
    insert into public.user_recipes (id, owner_id, name, category, type)
    values (v_id, v_dueno, 'Autoprueba 0094 resucitada', 'huevos', 'completo')
    on conflict (id) do update set name = excluded.name;
    if exists (select 1 from public.user_recipes where id = v_id) then
      raise exception '0094 autoprueba: una receta con lápida ha vuelto a entrar';
    end if;

    -- Todo bien: se deshace el subbloque con un código propio.
    raise exception 'autoprueba 0094 bien' using errcode = 'MP355';
  exception when sqlstate 'MP355' then
    raise notice '0094 autoprueba: borrar deja lápida y la receta no se puede resubir (deshecho)';
  end;
end $$;
