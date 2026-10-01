# Tres papeles por casa: dueño, cotitular y lector

Propuesta de diseño, 1 oct 2026. Repo estudiado: `MenuPlan-bot` (rama del bot, HEAD `7298869`). La base la he consultado solo con SELECT, dentro de una transacción de solo lectura. No he tocado código ni migraciones.

---

## 0. Lo que hay hoy (y lo que conviene saber antes de tocar nada)

### Datos en producción (consultados hoy)

- 30 casas: 26 `dormant` y 4 `invite_ready`. Ninguna está `active`, aunque el onboarding la debería subir. No bloquea nada, pero choca con lo que dice HOUSEHOLDS.md.
- `household_members`: 30 `owner` y **1 `viewer`** (casa `d918a3cc…`). No hay más invitados que migrar.
- `bot_chats`: 3 chats, los tres **privados**. No hay grupos enlazados, así que endurecer las reglas de los grupos no rompe a nadie.
- Las 30 casas cumplen el invariante «`households.owner_user_id` = la única fila `role='owner'` de `household_members`».
- `user_profiles.locale` existe, pero es telemetría: `src/lib/analytics.js:27` la pisa en cada sesión con `navigator.language`. **No vale como preferencia de idioma.**

### Cómo está montado el permiso

**Base de datos (0017_households.sql)**
- Enum `household_member_role ('owner','viewer')` (L13-16).
- Un dueño por casa (`uq_household_members_one_owner`, L51-53) y **una casa propia por usuario** (`uq_households_one_owner_per_user`, L33-34).
- Hay dos ayudantes: `is_household_member` (L143) e `is_household_owner` (L157). Este último mira `households.owner_user_id`.
- En **todas** las tablas de la casa, la escritura es `is_household_owner(...)`: `household_state`, `household_favorites`, `household_recipe_discards`, `user_pantry`, `user_menus`, `user_menu_weeks` y `user_menu_recipes` (L246-360). Lo he confirmado contra `pg_policies` en vivo.
- `save_household_state` y `save_menu_week` (0057, L34 y L70) son `SECURITY INVOKER`, así que deciden las políticas. `bot_save_casa` (0057 L124) es `SECURITY DEFINER` y solo la llama `service_role`: **el bot se salta la RLS** y todo su control de permisos vive en el código.

**Las filas de la casa van a nombre del dueño.** Las claves primarias llevan `user_id`: `user_menus (user_id, id)`, `user_menu_weeks (user_id, menu_id, week_start)` y `user_menu_recipes (user_id, menu_id, recipe_id)`. Además `user_menu_weeks` y `user_menu_recipes` tienen una FK compuesta a `user_menus(user_id, id)` **sin `ON UPDATE CASCADE`**. Y todas cuelgan de `auth.users ON DELETE CASCADE`.
- La app ya lo sabe a medias. `App.jsx:1348` hace `syncMenuUserId = householdReadOnly ? ownerUserId : user.id` y `App.jsx:1465` hace lo mismo con `menuUserId`.
- Pero escribe con `user.id`: `queueSaveMenuWeek(user.id, …)` en `App.jsx:3016`, y `src/lib/pantry.js` filtra cada escritura con `.eq("user_id", userId)` (L165-574).
- **Consecuencia:** si un cotitular escribiera con su `user.id`, crearía semanas y despensa duplicadas, porque la clave sería otra. Hay que cambiar esto aunque la RLS ya le dejara escribir.

**App**
- `isHouseholdReadOnly` es solo `role === "viewer"` (`src/lib/householdsSync.js:335`).
- `parseHouseholdRow` convierte **cualquier papel que no sea `owner` en `viewer`** (L35). Lo mismo hace `parseHouseholdMemberRow` (L55). Esto nos viene bien: un cliente viejo verá al cotitular como lector y no escribirá nada con claves mal puestas.
- Hay unas 60 comprobaciones de `householdReadOnly` en `App.jsx`, y `setData` / `setShopping` se pasan como `null` al lector (L5988-5999 y L6184-6189). La casilla de la compra se desactiva con `readOnly` (`Shopping.jsx:2493`).

**Invitación**
- Un solo enlace reutilizable por casa (`households.invite_token`), que siempre da `viewer`.
- `join_household_by_token` (0017 L496) crea además una casa propia `dormant` para quien se une (L547-563) y pone un tope de 2 casas como viewer (L539).

**Bot**
- `api/bot/link.js:35`: solo el dueño. Al resto le da 403.
- `casaPropia` (`api/_bot/enlace.js:80`), que usan el enlace por email y «Soy nuevo», también exige ser dueño.
- `/grupo` (`api/bot/telegram.js:719`) firma el código **a nombre del dueño** (`duenoDe`) aunque lo pida otro.
- En un grupo **no se mira quién escribe**: `responder()` solo recibe el nombre (`autor`) para prefijar `[autor]:` (`agente.js:739`). Cualquiera del grupo puede usar todas las herramientas y la vía rápida (`router.js:170-191`, `POLITICA`).
- En privado tampoco se comprueba que `from.id` siga siendo miembro de la casa: el chat queda enlazado a la casa para siempre.

**Borrado de cuenta**
- `api/delete-account.js` borra el usuario de auth sin más.
- Si es el dueño, la cascada se lleva la casa entera, con sus menús y su despensa, y los demás miembros pierden el acceso.
- `api/_bot/borrar.js:69-73` se niega a borrar si la casa tiene más miembros. La app no tiene ese freno.

### Agujeros que existen ya hoy y conviene cerrar en la fase 0

1. **Cualquiera puede inyectar filas en una casa ajena.** Las políticas antiguas «Users manage own pantry/menus/menu weeks/menu recipes» solo comprueban `user_id = auth.uid()`, no el `household_id`.
   - Un usuario autenticado que conozca un `household_id` (un ex-miembro, por ejemplo) puede insertar despensa con ese `household_id`, y los miembros la verán.
   - Con los menús es peor. Puede crearse un `user_menus` propio con el mismo `id` de texto que el menú activo de la casa e insertar `user_menu_weeks` con `household_id` = la casa. `leerCasa` (`api/_bot/casa.js:66-80`) lee las semanas por `household_id` + `menu_id`, así que Lola vería y reescribiría esas filas.
   - Hay que cerrarlo: las políticas antiguas deben exigir `household_id is null`.
2. **Un chat privado enlazado sigue dentro aunque echen a la persona de la casa.** Ver el apartado 4.
3. **Un lector de hoy no puede leer las recetas privadas del dueño.** `loadUserRecipes(ownerId)` (`App.jsx:1504`) choca con la RLS de `user_recipes` (solo `owner_id = auth.uid()` o publicadas). Hoy solo hay un viewer y el fallo pasa desapercibido. Con la asistenta se notaría el primer día.

---

## 1. Modelo de datos

### Decisión: un valor nuevo `'editor'` en el enum, y `owner_user_id` se queda como fuente de la titularidad

- El valor en la base y en el código es **`editor`**. En la interfaz se llama «Cotitular» en español y «Co-owner» en inglés. «Visitante» pasa a llamarse **«Lector»** («Viewer» en inglés). Si llamamos al papel por lo que hace y no por el caso de uso (`cotitular`), las políticas se leen solas: `is_household_editor`.
- `households.owner_user_id` sigue siendo el titular: el único que paga en el futuro, al que van los eventos (`duenoDe`) y el que figura como «dueño de los datos» en las claves con `user_id`. La fila `role='owner'` de `household_members` es su espejo. Las RPC mantienen el invariante y un test lo vigila.
- **Las filas de la casa siguen a nombre del titular.** Quien escribe es cualquier editor, pero `user_id` es siempre `owner_user_id`. Esto deja intactas las claves primarias y el bot (que ya lee por `household_id`). Lo que hay que añadir:
  - El `WITH CHECK` de las políticas nuevas exige `user_id = household_owner_id(household_id)`.
  - `save_menu_week` fuerza ese `user_id` en el servidor.
  - La transferencia reescribe `user_id`. Para eso la FK compuesta pasa a `ON UPDATE CASCADE`.
- Alternativa que he descartado por ahora: cambiar las PK a `(household_id, …)`. Es lo limpio a largo plazo, pero toca `menusSync.js`, `pantry.js`, 0057 y el bot a la vez.

### Se quita el «una casa propia por usuario»

`uq_households_one_owner_per_user` impide transferir. Al unirse, a la pareja se le crea su casa `dormant` (0017 L552), así que hoy no podría recibir la titularidad.

Propuesta:
- **Quitar el índice.**
- `ensure_user_household` sigue creando casa propia solo si el usuario no es dueño de ninguna, y elige la más antigua (`order by created_at limit 1`).
- Al transferir, si la casa propia del heredero está `dormant`, sin otros miembros y sin menús, se borra sola. Si tiene contenido, se queda: el usuario pasa a tener dos casas propias, un caso raro pero legítimo.
- `HouseholdsScreen.jsx:267-276` debe aguantar más de una casa propia (hoy asume un hueco «Tu hogar» y dos de visitante).

### Tablas y columnas nuevas

| Qué | Para qué |
|---|---|
| `household_invites` | Invitaciones con papel, caducidad y usos. El enlace de siempre (`invite_token`) se queda como «enlace de lector reutilizable». |
| `user_profiles.ui_lang text check in ('es','en')` | El idioma de cada persona. `null` = automático. |
| `content_translations` | Caché de traducciones (recetas, nombres de platos, textos libres de la compra). Solo la usa el servidor. |
| `ingredients.name_en` | Las 383 filas del catálogo de ingredientes, traducidas una vez con un script. |
| `user_recipes.household_id` (fase 4) | Para distinguir «receta de la casa» de «receta de mi biblioteca personal». |
| `household_state.rev` + `rev_by` (fase 5, opcional) | Que dos editores a la vez no se pisen la casa en silencio. |

### Migración SQL propuesta (texto, sin aplicar)

`ALTER TYPE … ADD VALUE` no puede usarse en la misma transacción en la que se crea, así que van **dos ficheros**. Los números son los siguientes libres hoy: hay que comprobarlos al aplicar, porque hay sesiones en paralelo y `supabase/migrations.test.js` vigila los duplicados.

**`0065_papel_editor.sql`**

```sql
-- Cotitular: edita todo como el dueño salvo borrar la casa, transferirla y pagar.
alter type public.household_member_role add value if not exists 'editor';
```

**`0066_tres_papeles.sql`**

```sql
-- ═══ Tres papeles: owner (titular), editor (cotitular), viewer (lector) ═══

-- ── 1. Ayudantes ────────────────────────────────────────────────────────────
create or replace function public.household_role(p_household_id uuid)
returns public.household_member_role
language sql security definer stable set search_path = public as $$
  select hm.role from public.household_members hm
  where hm.household_id = p_household_id and hm.user_id = (select auth.uid());
$$;

create or replace function public.is_household_editor(p_household_id uuid)
returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.household_members hm
    where hm.household_id = p_household_id
      and hm.user_id = (select auth.uid())
      and hm.role in ('owner', 'editor')
  );
$$;

-- A nombre de quién van las filas de la casa (PK con user_id).
create or replace function public.household_owner_id(p_household_id uuid)
returns uuid
language sql security definer stable set search_path = public as $$
  select owner_user_id from public.households where id = p_household_id;
$$;

-- El tope de casas ajenas cuenta editor + viewer (sustituye a count_viewer_memberships).
create or replace function public.count_foreign_memberships(p_user_id uuid default auth.uid())
returns integer
language sql security definer stable set search_path = public as $$
  select count(*)::integer from public.household_members
  where user_id = p_user_id and role in ('editor', 'viewer');
$$;

-- ── 2. Una casa propia por usuario: ya no es una regla de la base ───────────
drop index if exists public.uq_households_one_owner_per_user;

-- ── 3. Transferir reescribe user_id: la FK compuesta tiene que seguirlo ────
alter table public.user_menu_weeks drop constraint fk_user_menu_weeks_menu,
  add constraint fk_user_menu_weeks_menu foreign key (user_id, menu_id)
  references public.user_menus(user_id, id) on delete cascade on update cascade;
alter table public.user_menu_recipes drop constraint fk_user_menu_recipes_menu,
  add constraint fk_user_menu_recipes_menu foreign key (user_id, menu_id)
  references public.user_menus(user_id, id) on delete cascade on update cascade;

-- ── 4. Idioma por persona ───────────────────────────────────────────────────
alter table public.user_profiles
  add column if not exists ui_lang text check (ui_lang in ('es', 'en'));
comment on column public.user_profiles.ui_lang is
  'Idioma elegido por la persona (app y Lola). null = automático. NO es `locale`, que es telemetría y se pisa en cada sesión (0066).';

-- ── 5. Invitaciones con papel ───────────────────────────────────────────────
create table if not exists public.household_invites (
  token        text primary key default public.gen_invite_token(),
  household_id uuid not null references public.households(id) on delete cascade,
  role         public.household_member_role not null check (role in ('editor', 'viewer')),
  created_by   uuid references auth.users(id) on delete set null,
  lang         text check (lang in ('es', 'en')),
  max_uses     integer not null default 1,
  uses         integer not null default 0,
  expires_at   timestamptz not null default now() + interval '7 days',
  revoked_at   timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists idx_household_invites_household on public.household_invites (household_id);
alter table public.household_invites enable row level security;
-- Sin políticas: solo las RPC de abajo (como bot_codigos y las llaves de 0055/0056).

-- ── 6. RLS: escribir = owner o editor ───────────────────────────────────────
-- households: solo lectura directa; todo cambio va por RPC (el cliente no
-- escribe en la tabla: grep de from("households") en src/ → 0 resultados).
drop policy if exists "Owners manage households" on public.households;

-- household_members: solo lectura directa; altas, bajas y papeles, por RPC.
drop policy if exists "Owners manage memberships" on public.household_members;
drop policy if exists "Viewers delete own membership" on public.household_members;
drop policy if exists "Users insert self as viewer" on public.household_members; -- ya no está en vivo

-- household_state: editores insertan y actualizan; vaciar (delete) solo el titular.
drop policy if exists "Owners write household state" on public.household_state;
create policy "Editors insert household state" on public.household_state
  for insert with check (public.is_household_editor(household_id));
create policy "Editors update household state" on public.household_state
  for update using (public.is_household_editor(household_id))
  with check (public.is_household_editor(household_id));
create policy "Owner deletes household state" on public.household_state
  for delete using (public.is_household_owner(household_id));

drop policy if exists "Owners manage household favorites" on public.household_favorites;
create policy "Editors manage household favorites" on public.household_favorites
  for all using (public.is_household_editor(household_id))
  with check (public.is_household_editor(household_id));

drop policy if exists "Owners manage household discards" on public.household_recipe_discards;
create policy "Editors manage household discards" on public.household_recipe_discards
  for all using (public.is_household_editor(household_id))
  with check (public.is_household_editor(household_id));

-- Las cuatro tablas con user_id + household_id: escribe un editor, pero la
-- fila va a nombre del titular. Y la política vieja «por user_id» deja de
-- valer para filas de casa (cierra la inyección del apartado 0).
do $$
declare t text;
begin
  foreach t in array array['user_pantry', 'user_menus', 'user_menu_weeks', 'user_menu_recipes'] loop
    execute format('drop policy if exists %I on public.%I',
      case t when 'user_pantry' then 'Household owners manage pantry'
             when 'user_menus' then 'Household owners manage menus'
             when 'user_menu_weeks' then 'Household owners manage menu weeks'
             else 'Household owners manage menu recipes' end, t);
    execute format($p$
      create policy "Household editors write" on public.%I for all
        using (household_id is not null and public.is_household_editor(household_id))
        with check (household_id is not null
                    and public.is_household_editor(household_id)
                    and user_id = public.household_owner_id(household_id))
    $p$, t);
  end loop;
end $$;

alter policy "Users manage own pantry" on public.user_pantry
  using ((select auth.uid()) = user_id and household_id is null)
  with check ((select auth.uid()) = user_id and household_id is null);
alter policy "Users manage own menus" on public.user_menus
  using ((select auth.uid()) = user_id and household_id is null)
  with check ((select auth.uid()) = user_id and household_id is null);
alter policy "Users manage own menu weeks" on public.user_menu_weeks
  using ((select auth.uid()) = user_id and household_id is null)
  with check ((select auth.uid()) = user_id and household_id is null);
alter policy "Users manage own menu recipes" on public.user_menu_recipes
  using ((select auth.uid()) = user_id and household_id is null)
  with check ((select auth.uid()) = user_id and household_id is null);
```

Las RPC van en el mismo fichero y se detallan una a una en el apartado siguiente. Llevan siempre el patrón de 0056: `revoke all … from public; revoke execute … from anon; grant execute … to authenticated`. Las que solo usa el servidor (`_transfer_household_ownership`, `prepare_account_deletion`) llevan `revoke … from public, anon, authenticated; grant … to service_role`.

### Cambio tabla por tabla (RLS)

| Tabla | Lectura | Escritura hoy | Escritura propuesta |
|---|---|---|---|
| `households` | miembros (sin cambio) | owner, ALL directo | **ninguna directa**; `update_household` (editor), `delete_household` y `transfer_*` (owner) |
| `household_members` | miembros | owner ALL + viewer borra la suya | **ninguna directa**; RPC de unirse, salir, quitar, cambiar papel y transferir |
| `household_state` | miembros | owner | insert/update: editor; delete: owner |
| `household_favorites` | miembros | owner | editor |
| `household_recipe_discards` | miembros | owner | editor |
| `user_pantry` | miembros (filas de casa) | owner + «propias por user_id» | editor con `user_id = titular`; las propias solo si `household_id is null` |
| `user_menus` / `_weeks` / `_recipes` | miembros | igual que la despensa | igual que la despensa |
| `user_recipes` (fase 4) | dueño, publicadas, seguidores | autor | + lectura «miembros de la casa» si `household_id` = la casa; + escritura de editores si `household_id` = la casa |
| `household_invites` | — (solo RPC) | — | — |
| `content_translations` | — (solo servidor) | — | — |
| `bot_*` | — (service_role) | — | sin cambio en la RLS; los permisos se ponen en el código del bot (apartado 4) |
| `shared_menus`, `menu_share_links`, `recipe_share_links` | sin cambio | personales (`owner_id = me`) | sin cambio. Publicar el menú en Gente es un acto personal: el cotitular publica con su perfil y el lector no publica |

### RPC una a una

| RPC | Hoy | Cambio |
|---|---|---|
| `ensure_user_household()` (0018) | casa propia: `limit 1`; `inviteToken` solo para el owner | elige la casa propia más antigua; devuelve `role` con `editor`; `inviteToken` (enlace de lector) también al editor; añade `ownerName` y `uiLang` del perfil |
| `join_household_by_token(token)` (0017 L496) | siempre `viewer`; tope de 2 viewer | mira primero `household_invites` (papel, caducidad, usos y revocación, con `for update` y `uses+1` en la misma transacción) y si no, el `invite_token` de siempre (viewer). Si ya es miembro con un papel **menor**, sube (viewer→editor); **nunca baja**. Tope: `count_foreign_memberships < 2`. Si la invitación trae `lang` y el perfil tiene `ui_lang` nulo, lo fija. Devuelve `role` |
| `preview_household_invite(token)` (0019) | id + nombre | + `role` y nombre del titular («Pablo te invita como cotitular de Casa Artiñano») |
| `create_household_invite(h, role, lang)` **nueva** | — | `editor`: solo el owner. `viewer`: owner o editor. Un uso, 7 días |
| `revoke_household_invite(token)` **nueva** | — | el que la creó o el owner |
| `list_household_members(h)` (0019) | owner primero | orden owner → editor → viewer; añade `telegram: bool` (si tiene `bot_identities`), útil en la pantalla de miembros |
| `set_household_member_role(h, user, role)` **nueva** | — | solo el owner; `role in ('editor','viewer')`; nunca sobre sí mismo ni para nombrar owner (para eso está la transferencia) |
| `remove_household_member(h, user)` (0017 L645) | owner quita viewers | owner quita editor o viewer; editor quita viewers; nadie quita al owner. **Además** borra los `bot_chats` privados con `linked_by = user` de esa casa y sus `bot_link_tokens`, y `active_household_id` del expulsado vuelve a su casa propia |
| `leave_household(h)` (0017 L609) | solo viewer | editor o viewer; owner: «transfiere o borra». Limpia también sus chats privados de esa casa |
| `update_household(h, name, status)` (0017 L673) | owner | **editor** (nombre y estado son ajustes) |
| `delete_household(h)` (0020) | owner | sin cambio (owner). La cascada ya se lleva `bot_chats`, `bot_messages`, `bot_deshacer`, etc. |
| `transfer_household_ownership(h, new)` **nueva** | — | owner → un **editor** de esa casa. Ver más abajo |
| `activate_household_menu(menu)` (0017 L759) | owner | `is_household_editor`. Y el `select` de L773-777 debe buscar el menú por `household_id` con `is_household_editor`, no por `user_id = v_user_id` |
| `save_household_state(h, state, rev)` (0057 L34) | invoker → owner | sin cambio en el cuerpo: las políticas nuevas dejan pasar al editor. Fase 5: control de versión entre editores |
| `save_menu_week(row, rev)` (0057 L70) | invoker; `user_id` del payload | si `household_id` no es nulo: `user_id := household_owner_id(v_hh)` y `is_household_editor(v_hh)` obligatorio. Así un cliente que mande `user.id` no duplica la semana |
| `bot_save_casa` (0057 L124) | service_role | sin cambio (el bot comprueba el papel antes de llamarla) |
| `household_shopping_mark(h, menu, week, ids, have)` **nueva** | — | lo único que escribe un lector (apartado 2) |
| `prepare_account_deletion(user)` **nueva** | — | service_role; la llaman `api/delete-account.js` y `api/_bot/borrar.js` antes de borrar el usuario de auth (apartado 3) |
| `menu_share_token` / `recipe_share_token` | personales | sin cambio |

**Transferencia** (el cuerpo que importa):

```sql
create or replace function public._transfer_household_ownership(p_household_id uuid, p_new_owner uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_old uuid; v_dormida uuid;
begin
  select owner_user_id into v_old from households where id = p_household_id for update;
  if not exists (select 1 from household_members
                 where household_id = p_household_id and user_id = p_new_owner and role = 'editor') then
    raise exception 'El nuevo titular tiene que ser cotitular de la casa';
  end if;
  -- Primero baja el viejo (uq_household_members_one_owner), luego sube el nuevo.
  update household_members set role = 'editor' where household_id = p_household_id and user_id = v_old;
  update household_members set role = 'owner'  where household_id = p_household_id and user_id = p_new_owner;
  update households set owner_user_id = p_new_owner, updated_at = now() where id = p_household_id;
  -- Las filas de la casa, a nombre del nuevo titular (weeks y recipes siguen por ON UPDATE CASCADE).
  update user_menus  set user_id = p_new_owner where household_id = p_household_id and user_id = v_old;
  update user_pantry set user_id = p_new_owner where household_id = p_household_id and user_id = v_old;
  -- La casa propia vacía que le nació al unirse no estorba: se va.
  select h.id into v_dormida from households h
   where h.owner_user_id = p_new_owner and h.id <> p_household_id and h.setup_status = 'dormant'
     and not exists (select 1 from household_members m where m.household_id = h.id and m.user_id <> p_new_owner)
     and not exists (select 1 from user_menus u where u.household_id = h.id);
  if v_dormida is not null then delete from households where id = v_dormida; end if;
end $$;
-- solo service_role

create or replace function public.transfer_household_ownership(p_household_id uuid, p_new_owner uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_household_owner(p_household_id) then
    raise exception 'Solo el titular puede transferir la casa';
  end if;
  perform public._transfer_household_ownership(p_household_id, p_new_owner);
end $$;
-- authenticated
```

Ojo al reescribir `user_menus.user_id`: la PK es `(user_id, id)`. Si el heredero tuviera ya un menú con el mismo `id` de texto, el UPDATE falla y la transacción entera se deshace. Es improbable, pero el error tiene que llegar a la interfaz con un mensaje claro.

---

## 2. Permisos por papel

### Matriz

| | Dueño (titular) | Cotitular | Lector |
|---|---|---|---|
| **App: ver** menú, receta, compra, despensa, familia, alergias, ajustes, recetas de la casa | Sí | Sí | Sí |
| **App: editar** menú (generar, cambiar plato, activar) | Sí | Sí | No |
| **App: editar** compra (añadir, cantidades, quitar) | Sí | Sí | No |
| **App: tachar** en la compra (comprado / no comprado) | Sí | Sí | **Sí** (solo eso; ver abajo) |
| **App: editar** despensa, «Cociné», tickets y gasto | Sí | Sí | No (v1) |
| **App: editar** familia, alergias, salud, horarios, gustos, cole | Sí | Sí | No |
| **App: editar** favoritas, descartes y recetas de la casa | Sí | Sí | No |
| **App: biblioteca personal** (sus favoritas, sus recetas) | Sí | Sí | Sí (la suya) |
| **Lola en privado** | todas las herramientas | todas las herramientas | lectura + `marcar_compra` + sus recordatorios |
| **Lola en grupo** (lo que puede pedir esa persona) | todo | todo | lectura + `marcar_compra` |
| **Lola en grupo**, alguien sin cuenta enlazada | — | — | como un lector, pero sin `marcar_compra` |
| **Conectar su Telegram privado** | Sí | Sí | Sí (solo lectura) |
| **Conectar un grupo** (`/grupo`, link de grupo) | Sí | Sí | No |
| **Invitar lectores** | Sí | Sí | No |
| **Invitar cotitulares** | Sí | No | No |
| **Cambiar papeles** (editor ↔ viewer) | Sí | No | No |
| **Quitar a alguien** | editor y viewer | solo viewers | No |
| **Salir de la casa** | No (transfiere o borra) | Sí | Sí |
| **Renombrar la casa** | Sí | Sí | No |
| **Borrar / vaciar la casa** | Sí | No | No |
| **Transferir la titularidad** | Sí (a un cotitular) | No | No |
| **Pago** (futuro) | Sí | No | No |

Lo único que no sale literal del encargo es **invitar cotitulares y cambiar papeles**. Lo reservo al dueño aunque Pablo no lo listó como exclusivo. El motivo es que hacer cotitular a alguien es dar las llaves de la casa, y que dos cotitulares puedan echarse el uno al otro es una pelea que la app no debería arbitrar. Si Pablo prefiere que el cotitular también pueda, basta con cambiar una línea en `create_household_invite` y `set_household_member_role`.

### Por qué el lector sí puede tachar

- **Es su trabajo.** La asistenta va al súper con la lista. Si no puede tachar en el pasillo, la lista no le sirve de nada, y los dueños no saben qué se ha comprado y qué falta (compras repetidas o «no había» sin avisar).
- **El riesgo es bajo y reversible.** Solo se cambia `have` en ítems que ya existen: no añade, no borra, no cambia cantidades. El dueño lo deshace con un toque.
- **No se abre la RLS de `household_state`.** Si se abriera, el lector podría subir el blob entero de la casa. En su lugar hay una RPC estrecha:

```sql
create or replace function public.household_shopping_mark(
  p_household_id uuid, p_menu_id text, p_week_start date, p_item_ids text[], p_have boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_rev bigint;
begin
  if not public.is_household_member(p_household_id) then raise exception 'No eres de esta casa'; end if;
  select bot_rev into v_rev from household_state where household_id = p_household_id for update;
  -- 1) la semana normalizada
  update user_menu_weeks w
     set shopping = jsonb_set(w.shopping, '{items}', coalesce((
           select jsonb_agg(case when it->>'id' = any(p_item_ids)
                                 then jsonb_set(it, '{have}', to_jsonb(p_have)) else it end)
           from jsonb_array_elements(w.shopping->'items') it), '[]'::jsonb))
   where w.household_id = p_household_id and w.menu_id = p_menu_id and w.week_start = p_week_start;
  -- 2) la copia viva en household_state.state.shopping, si es esa semana (mismo patrón)
  -- 3) sube bot_rev: la app abierta de un editor recarga en vez de pisarlo (0057)
  update household_state set bot_rev = bot_rev + 1, updated_at = now()
   where household_id = p_household_id returning bot_rev into v_rev;
  return jsonb_build_object('ok', true, 'bot_rev', v_rev);
end $$;
```

(Hay que sacar la forma exacta de `state.shopping` y su semana de `src/lib/householdState.js` antes de escribir el paso 2.)

Dos consecuencias asumidas:

- **Tachar desde el lector no suma a «En casa».** El tachado de la app sí lo hace (`Shopping.jsx:697`, `markItemBought` → `restoreToPantry`). Pero es lo mismo que ya hace Lola con `marcar_compra` (`api/_bot/menu.js:362`, solo toca `have`). Se puede añadir en la fase 5 metiendo en la RPC las filas de despensa a nombre del titular.
- **Subir `bot_rev` hace que la app abierta de un editor recargue.** Si ese editor tenía un cambio sin guardar de hace menos de 1,2 s, lo pierde. Es el mismo trato que da hoy una escritura de Lola.

En la app, `ShoppingScreen` necesita una prop nueva `canTick` aparte de `readOnly`: el lector la recibe a `true` y su `onSwipePurchased` llama a la RPC en vez de a `applyToSources` + `restoreToPantry`.

### Un solo sitio para las reglas: `src/lib/papeles.js`

El bot ya importa de `src/lib` (`router.js:21` importa `src/lib/comidas.js`). Así que la matriz vive en un único módulo puro que comparten la app, el bot y los tests:

```js
export const PAPELES = ["owner", "editor", "viewer"];
export const puede = (papel, accion) => …   // 'editar_casa', 'tachar', 'invitar_viewer', 'invitar_editor',
                                            // 'cambiar_papel', 'quitar:<papel>', 'salir', 'borrar_casa',
                                            // 'transferir', 'enlazar_grupo'
export const HERRAMIENTAS_LECTOR = new Set([...SOLO_LECTURA_sin_compartir, "marcar_compra",
  "crear_recordatorio", "ver_recordatorios", "cancelar_recordatorio", "empezar_de_nuevo"]);
```

---

## 3. Ciclo de vida

**Invitar**
- El dueño (o un cotitular, si es para lector) pulsa «Invitar» en Hogares → Miembros y elige el papel (y, para un lector, el idioma).
- `create_household_invite` devuelve un token y la app arma dos enlaces:
  - `https://…/?join=<token>` para la app (el flujo de hoy, `useHousehold.js:282-345`).
  - `https://t.me/<bot>?start=inv_<token>` para quien prefiere no usar la app. Es el caso de la asistenta.
- El enlace de siempre (`invite_token`) sigue funcionando y da **lector**. Los enlaces ya compartidos no se rompen y no regalan edición.

**Aceptar**
- Desde la app: `join_household_by_token` con el papel de la invitación. El banner de `preview_household_invite` dice el papel.
- Desde Telegram (`inv_…` en `atender`, junto a `partirStart`):
  - Si ese Telegram ya tiene cuenta (`cuentaNacidaAqui` o `bot_identities`), se une con su usuario.
  - Si no, `crearCuentaTelegram` (le nace su casa `dormant`, igual que hoy al unirse por la app) y luego se une.
  - En los dos casos el chat privado queda enlazado **a la casa invitada** y, si la invitación trae `lang: 'en'`, se fija `ui_lang`.
  - Esto pide una variante de `join_household_by_token` para el servidor (`_join_household(user, token)`, solo service_role), porque el bot no tiene la sesión del usuario. O bien usar `sesionDe` como hace hoy `crearCuentaTelegram`.

**Cambiar de papel**
- `set_household_member_role` (solo el dueño).
- No hay que tocar nada del bot: el papel se mira en cada mensaje.

**Quitar a alguien / salir**
- Se borra la fila de miembro y además:
  - sus chats **privados** enlazados a esa casa (`bot_chats where household_id = h and kind = 'private' and linked_by = user`);
  - sus `bot_link_tokens` de esa casa;
  - su `active_household_id`, que vuelve a su casa propia.
- Los grupos que enlazó se quedan: son de la casa, no suyos. `linked_by` sigue apuntándole hasta que alguien lo reenlace.

**El dueño borra su cuenta** (`api/delete-account.js` y `/borrarme`). Antes de borrar el usuario de auth se llama a `prepare_account_deletion(user)` con service_role:

1. Para cada casa de la que es titular:
   - si hay **cotitular**, la titularidad pasa al **más antiguo** (`joined_at asc`) con `_transfer_household_ownership`, y luego se borra su fila de miembro;
   - si solo hay lectores o nadie, la casa se borra con la cascada de siempre y los lectores pierden el acceso. Un lector no hereda nunca: no tiene permiso para gestionar nada, y regalarle una casa sería raro.
2. Se borran sus `bot_chats` privados (`linked_by = user and kind = 'private'`).
3. Fase 4: las `user_recipes` con `household_id` de una casa que se hereda y `visibility = 'private'` pasan a `owner_id = heredero`. Las publicadas son obra suya y se van con él.

Solo después `DELETE /auth/v1/admin/users/:id`. El orden importa: si se borra antes, la cascada por `user_id` se lleva los menús y la despensa aunque la casa ya tuviera nuevo dueño. Con esto, `borrar.js:69-73` («tu casa tiene más miembros») solo tiene que negarse si hay **lectores sin cotitular**, y aun así debe avisar en vez de negarse.

**Un cotitular o un lector borra su cuenta.** La cascada quita su fila de miembro. Antes, `prepare_account_deletion` borra sus chats privados. Si su casa propia `dormant` tiene a alguien más, se aplica la misma regla de arriba.

**Alguien en varias casas**
- El papel es **por casa** (`household_members`). La app usa el de `activeHousehold`.
- En Telegram, un chat privado está enlazado a **una** casa (`bot_chats` PK = chat). Para cambiar de casa desde el chat haría falta un `/casa` futuro. De momento, volver a enlazar desde la app («Conectar Telegram» con otra casa activa) mueve el chat, y `enlazarChat` ya lo permite a quien lo enlazó.
- Tope de casas ajenas: 2 (editor + viewer).

---

## 4. El bot

### Quién escribe y con qué papel

Un único punto, `papelDe(householdId, telegramFromId)`, en `api/_bot/enlace.js` o en un `api/_bot/papel.js` nuevo:

```
bot_identities (telegram, from.id) → user_id
household_members (household_id, user_id) → role
user_profiles.ui_lang → idioma (si no hay, from.language_code empieza por 'en' → 'en', si no 'es')
→ { userId, papel: 'owner'|'editor'|'viewer'|null, idioma }
```

- Se calcula **en cada turno**, en `atenderCola`/`turno` (`telegram.js:289` y `:347`), y viaja a `conversar` → `responder({ papel, idioma })` → `chat.papel`.
- No se guarda en `bot_chats`: así un cambio de papel o una expulsión se aplica al mensaje siguiente.
- **Varios autores juntos** (`juntar(items)` con `variosAutores`, `telegram.js:291`): vale el papel **más bajo** de los autores del lote. Hoy `from` pasa como `null` en ese caso, así que hay que pasar la lista.
- **En privado:**
  - si `papel` es `null` (lo echaron o borró la cuenta y el chat se quedó colgado), se desenlaza el chat y se contesta «ya no estás en esa casa».
  - si no hay identidad pero el chat lo enlazó él (chats anteriores a `bot_identities`), se vale de `linked_by`.
- **En grupo, sin cuenta enlazada:**
  - se le trata como lector **sin** `marcar_compra`: puede preguntar qué hay de cena, pero no cambiar nada;
  - si pide una escritura, Lola contesta (en su idioma): «Para apuntarlo necesito saber quién eres: escríbeme por privado y conecta tu cuenta». Se le ofrece el botón `t.me/<bot>?start=…` solo si alguien de la casa le invita (el enlace `inv_`): **el grupo no basta para entrar en la casa**;
  - hoy no hay ningún grupo enlazado, así que esto no le quita nada a nadie. Si en el futuro se quiere un grupo «abierto» (cualquiera apunta en la compra), se puede añadir `bot_chats.ajenos_apuntan boolean default false`, limitado a `anadir_compra` y `marcar_compra`.

### Enlazar chats

- **`api/bot/link.js:34-37`:**
  - cambiar «owner» por «miembro con papel»;
  - para un lector, devolver solo `privado` (sin `grupo`);
  - guardar el `user_id` real en `bot_link_tokens`, como ya hace.
- **`enlazarDesdeAjustes` (`telegram.js:992`):** al gastar el token, comprobar que `fila.user_id` sigue siendo miembro y, si el chat es un grupo, que es editor u owner.
- **`casaPropia` (`enlace.js:80`):** pasa a `casaConPapel(userId)`, que devuelve la casa activa si es miembro (cualquier papel). La usan el enlace por email (`comprobarCodigo`, `telegram.js:903`) y «Soy nuevo». En «Soy nuevo» (`crearCuenta`, `telegram.js:929`) hay que seguir usando **la casa propia**, como dice el comentario de L925-926.
- **`/grupo` (`telegram.js:719`):** firmar el token con el `userId` de quien lo pide (no con `duenoDe`) y solo si es owner o editor.
- **`enlazarChat` (`enlace.js:17`):** sin cambio. «Solo mueve el chat quien lo enlazó» sigue valiendo.

### Herramientas por papel

Dos capas: el modelo no ve las herramientas que no puede usar, y el envoltorio de `herramientas(chat)` (`agente.js:128-185`) lo vuelve a comprobar antes de `supervisar`, por si acaso.

- `herramientas(chat)` filtra `todas` con `HERRAMIENTAS_LECTOR` cuando `chat.papel` es `viewer` o `null`.
- En el `run`, antes de `supervisar`: si `!permitida(chat.papel, t.name, chat.esGrupo)`, devuelve «No puedes cambiar eso: es de lectura. Díselo con amabilidad y sugiere que se lo pida a <titular/cotitular>».
- En el prompt, una línea de contexto por turno: «Quien te escribe es **lectora** de la casa: puede consultar y tachar la compra, nada más».

**Herramientas de escritura bloqueadas para el lector** (lista explícita, sacada de `agente.js`):

| Herramienta | Por qué |
|---|---|
| `generar_menu`, `cambiar_plato` | escriben el menú |
| `anadir_compra` | añade a la lista |
| `anadir_despensa` | escribe la despensa |
| `guardar_menu_cole` | escribe ajustes de la casa |
| `ajustar_gustos`, `descartar_supuesto`, `ajustar_cocina`, `pedir_tanda`, `ajustar_horario` | ajustes |
| `anadir_invitado`, `anadir_comensal`, `ajustar_persona`, `ajustar_menu_peques`, `quitar_comensal` | familia |
| `ajustar_alergias`, `ajustar_salud` | protección de la familia |
| `deshacer` | deshace escrituras de otros |
| `preparar_receta`, `apartar_foto_plato`, `guardar_receta` | crean recetas de la casa (`preparar` no escribe, pero solo sirve para `guardar`) |
| `compartir` | aunque está en `SOLO_LECTURA`, **escribe**: crea `shared_menus` y `menu_share_links`/`recipe_share_links` **a nombre del dueño** (`api/_bot/compartir.js:57, 97-103`). Que un lector saque un enlace público de la semana de la familia no debe pasar |

**Permitidas al lector:**
- `ver_casa`, `ver_menu`, `ver_receta`, `ver_compra`, `ver_ajustes`, `ver_despensa`, `ver_menu_cole`, `proponer_platos` (solo propone), `buscar_recetas` y **`marcar_compra`**;
- en privado, además, `crear_recordatorio`, `ver_recordatorios`, `cancelar_recordatorio` (son de su chat) y `empezar_de_nuevo` (su memoria). En grupo, estas cuatro no: los recordatorios y la memoria son del grupo.

**Vía rápida y botones**, que hoy no pasan por las herramientas:

- `permitidoEn(modo, { esGrupo, variosAutores })` (`router.js:186`) recibe `papel`. Para el lector solo valen `consulta`, `recomendar` y `compra_marcar`. Se cortan `compra_anadir`, `cambiar`, `generar`, `deshacer` y `eleccion` (`turno.js:367`, aplicar una de las opciones que dio Lola). `POLITICA` gana una columna `lector: boolean`.
- `pulsado` (`telegram.js:775`): los botones `t:` vuelven a pasar por `turno`, así que quedan cubiertos. Los `comp:g` / `comp:m` (`usarCompartido`, `telegram.js:679`: guardar una receta o ponerla en el menú) necesitan su propia comprobación de papel.
- `recibirCompartido` (`telegram.js:649`) solo enseña: vale para todos.
- El uso de Lola por un lector cuenta en el `bot_usage` de la casa. Conviene vigilar `fueraDeLimite`, porque una asistenta que pregunta cada receta cada día gasta.

### Grupos: lo que cambia para el cotitular

Nada que configurar. Si su Telegram está enlazado (por su privado o por una invitación), en el grupo Lola sabe que es cotitular y le deja todo. «Deshacer» sigue siendo solo de quien hizo el cambio (`telegram.js:779-784`).

---

## 5. Idioma por persona

### Dónde se guarda

En `user_profiles.ui_lang` (`'es' | 'en' | null`). No va en `household_state` ni en `bot_chats.lang` (`0057` L189, que hoy se rellena con el `language_code` de Telegram y nadie lo lee), porque es una preferencia **de cada persona**: en una misma casa, Pablo en español y la asistenta en inglés. `bot_chats.lang` puede quedarse como pista para chats sin identidad.

Cómo se fija:
1. por la invitación (`household_invites.lang`) al aceptarla;
2. con un selector «Idioma / Language» en Perfil (`HomeProfileScreen.jsx`) y en Ajustes;
3. desde Lola: «speak English, please» → herramienta `ajustar_idioma` (permitida a todos los papeles, porque toca **su** perfil, no la casa).

### App: lo mínimo que funciona

No hay i18n, y traducir `Menu.jsx` (9.297 líneas), `Shopping.jsx` (4.642) y `Onboarding.jsx` (10.942) con `t()` es un proyecto en sí mismo. Propongo:

- **Una «vista de lector» de tres pantallas**, en `src/screens/lector/`, que reutiliza los componentes que ya hay (tarjeta de plato con su foto, filas de compra, el aspecto de `DESIGN_SYSTEM.md`). Se monta cuando `activeHousehold.role === 'viewer'` y `ui_lang === 'en'`, con un enlace «Open full app (Spanish)» a la vista normal en solo lectura.
  - **Today:** las comidas de hoy (y mañana), con foto y nombre del plato, para quién y a qué hora. Al tocar, se abre la receta.
  - **Recipe:** ingredientes con las cantidades escaladas a los comensales de ese hueco, y los pasos numerados (con sus ilustraciones si las tienen).
  - **Shopping:** la lista por secciones, con tachar (`household_shopping_mark`).
- **Textos fijos:** `src/i18n/lector.js` con un diccionario `{ es, en }` de unas 60-80 cadenas, y un `t(clave)` mínimo. La vista de lector también existe en español (es la misma con `es`), así que sirve para lectores hispanohablantes y se prueba sin trampas.
- **Contenido (nombres de platos, ingredientes, pasos):** se traduce bajo demanda y se guarda en caché.
  - `POST /api/translate` (nuevo; con sesión): `{ householdId, lang, items: [{ kind: 'recipe', id }, { kind: 'text', text }] }`. Comprueba que el usuario es miembro de la casa (con service_role), busca en `content_translations (kind, source_key, lang, source_hash)` y traduce lo que falte en **un lote** con un modelo de Anthropic barato (Haiku; según la memoria, «Gemini es para fotos, Anthropic para texto»). Guarda y devuelve.
  - `source_hash` = hash del contenido original. Si la receta cambia, se vuelve a traducir sola.
  - Catálogo: `source_key` = id de la receta, compartido entre casas, así que se traduce una vez para todos. Recetas propias: id + hash, y solo se sirven a miembros de esa casa (la tabla no tiene políticas de cliente: una receta privada traducida no debe poder leerse sabiendo su id).
  - **Precarga:** al abrir la vista de lector se piden de golpe las recetas de la semana activa (14-21), y la compra se traduce por nombre normalizado.
  - Ingredientes del catálogo: `ingredients.name_en` relleno una vez con `scripts/traducir-ingredientes.mjs` (383 filas, revisables a mano). Lo libre de la lista («pilas») va por `kind: 'text'`.
- Las unidades de cocina (`cda`, `cdta`, `pizca`, `ud`) se traducen con el diccionario, no con el modelo.

### Lola

- `responder()` recibe `idioma` y añade una línea al contexto del turno: «Quien te escribe prefiere **inglés**: contesta en inglés; los platos, con su nombre traducido».
- `conocimiento.md:183` («Las recetas, de momento, están en castellano») y `:274` hay que actualizarlos. Lola ya contesta en el idioma en que le escriben. Lo nuevo es que la preferencia manda aunque escriba en español, y que traduce el contenido de `ver_receta`/`ver_menu`, cosa que el modelo hace solo sin coste aparte.
- **Lo que no pasa por el modelo está en español fijo:**
  - `api/_bot/rapido.js` y `pintar.js`: «Hoy», días, «Comida», «Cena», cabeceras de la compra;
  - mensajes de `telegram.js` (`bienvenida`, `confirmarEnlace`, errores, el teclado fijo `TECLADO`).
  - Propuesta: `api/_bot/textos.js` con `{ es, en }` para esas cadenas, y los nombres de plato de la vía rápida a través de la misma caché `content_translations` (un helper `api/_bot/traducir.js`). Si falta una traducción en caché, la vía rápida devuelve `null` y contesta Lola, que ya sabe traducir.
- **En grupo**, Lola contesta en el idioma de **quien preguntó** (su `ui_lang`). Si escriben varios en el mismo lote, en el del primero.

---

## 6. Riesgos

1. **Base compartida entre staging y producción.** Cada migración se aplica a producción el mismo día. Por eso: (a) las migraciones son aditivas y se aplican antes del código que las usa; (b) los clientes viejos ven `editor` como `viewer` (`parseHouseholdRow` L35) y no escriben mal. (c) Las pruebas de RLS **no** pueden correr contra esta base: van en local (`supabase start`) o en una rama de Supabase.
2. **Dos editores a la vez.** El blob de `household_state` es «el último gana» (0057, comentario L17-22). Hoy eso solo pasaba entre dos dispositivos de una persona; con la pareja pasará de verdad. Mitigación en la fase 5: `household_state.rev` + `rev_by` (sesión), con conflicto solo si el `rev` cambió **y** lo cambió otro, igual que hoy con `bot_rev`. Mientras tanto, el sondeo de `bot_rev` ya hace que la app recargue cuando escribe Lola o un lector.
3. **Que una escritura de cotitular duplique filas** si algún sitio escribe con `user.id` en vez del titular (`App.jsx:3016`; `pantry.js`; `cookPantry.js:100` → `addPantryItems(user.id…)`). Defensas: el `WITH CHECK user_id = household_owner_id(...)` hace que falle en vez de duplicar, `save_menu_week` lo fuerza en el servidor, y hay un test que lo prueba.
4. **Cerrar la política antigua «por user_id» puede romper una ruta que escriba filas de casa a nombre propio sin pasar por la política de casa.** Antes de aplicar, `grep` de `.from("user_pantry"|"user_menus"…)` y una prueba en local con las tres cuentas.
5. **La transferencia en el borrado de cuenta.** Si `prepare_account_deletion` falla a medias, no se borra la cuenta: es una transacción y el endpoint devuelve 500. Nunca debe borrarse el usuario de auth sin haber transferido antes.
6. **El bot se salta la RLS.** Todos los permisos del bot están en código y no hay red debajo. El filtro de herramientas, `permitidoEn` y `usarCompartido` necesitan tests que se vean fallar una vez («tests que no miden nada»).
7. **Datos de salud a la vista del lector.** Hoy el viewer lo ve todo. Las alergias las tiene que ver (cocina ella). Las condiciones de salud (`ajustar_salud`) quizá no: lo decide Pablo. Si no, `ver_casa`/`ver_ajustes` las omiten para `viewer`.
8. **Coste.** Una asistenta que pregunta por Lola cada receta cada día gasta tokens a cuenta de la casa. La vista de lector de la app (receta traducida en caché) es más barata que Lola para eso, así que conviene que el botón de Lola lleve a la receta de la app.

---

## 7. Datos existentes

- **Casas y dueños:** nada que migrar. 30 casas y 30 filas `owner` consistentes.
- **El único viewer** (casa `d918a3cc…`) sigue siendo viewer. En la interfaz pasa a llamarse «Lector».
- **Enlaces `?join=` ya compartidos:** siguen dando lector.
- **`bot_chats` (3 privados, todos de dueños):** nada que migrar. Al activar la comprobación de papel en privado, verificar que los tres tienen `bot_identities` (hay 3) o `linked_by` = el dueño.
- **`user_profiles.ui_lang`:** nace nulo para todos, es decir, español. **No** se rellena desde `locale` (hay 11 `en*`, pero es el idioma del navegador, no una elección).
- **Recetas (fase 4):** `user_recipes.household_id` se rellena con la casa propia del autor para las recetas privadas (hay 11 filas). Las públicas se quedan con `null` (biblioteca personal).
- **`HOUSEHOLDS.md`:** reescribir «Roles y límites», «Permisos» y «Borrados», y quitar «V2 (co-owners, transferir propietario) fuera de alcance».

---

## 8. Orden de implementación (fases pequeñas, cada una se puede desplegar sola)

| Fase | Qué | Ficheros |
|---|---|---|
| **0. Cerrar agujeros** (sin papeles nuevos) | Políticas antiguas con `household_id is null`; en privado, comprobar que `from.id` sigue siendo miembro; `remove`/`leave` limpian chats privados | migración `0065_cerrar_inyeccion.sql`, `api/bot/telegram.js`, `api/_bot/enlace.js` |
| **1. Enum + ayudantes + RLS de editor** | `0065`/`0066` (renumerar si la 0 se lleva la 0065); ninguna interfaz todavía. Con SQL a mano en local se puede crear un editor y probar | `supabase/migrations/` |
| **2. App para el cotitular** | `parseHouseholdRow`/`MemberRow` con `editor`; `src/lib/papeles.js`; `readOnly` = `!puede(papel,'editar_casa')`; **`dataOwnerId = activeHousehold.ownerUserId`** en lugar de `user.id` para menús, semanas, despensa y `activateMenu` (`App.jsx` 1348, 1465, 1504, 3016 y los ~11 `user.id` de `Shopping.jsx`/`Pantry.jsx`/`cookPantry.js`); `save_menu_week` fuerza al titular | `src/lib/householdsSync.js`, `useHousehold.js`, `App.jsx`, `pantry.js`, `cookPantry.js`, `menusSync.js` |
| **3. Invitaciones con papel y gestión de miembros** | `household_invites` y sus RPC; HouseholdsScreen: elegir papel, cambiar papel, quitar, transferir; banner con el papel | `HouseholdsScreen.jsx`, `useHousehold.js` |
| **4. Bot con papeles** | `papelDe`; `link.js` abierto a miembros; `/grupo` con el usuario real; filtro de herramientas; `permitidoEn` con papel; `usarCompartido`; desconocidos en grupo; `inv_` desde Telegram | `api/bot/link.js`, `api/bot/telegram.js`, `api/_bot/agente.js`, `router.js`, `turno.js`, `enlace.js` |
| **5. Borrado de cuenta con herencia** | `prepare_account_deletion` + `_transfer_household_ownership`; llamarla en `api/delete-account.js` (antes de L181) y en `api/_bot/borrar.js` (sustituye L69-73) | ídem |
| **6. Lector que tacha** | `household_shopping_mark`; `canTick` en Shopping; `marcar_compra` en el bot ya va | `Shopping.jsx`, `App.jsx` |
| **7. Idioma** | `ui_lang` + selector; `api/translate.js` + `content_translations`; `ingredients.name_en`; vista de lector `src/screens/lector/*` + `src/i18n/lector.js`; Lola con `idioma`; `api/_bot/textos.js` | ídem |
| **8. Recetas de la casa** | `user_recipes.household_id` + RLS de miembros (cierra el fallo 3 del apartado 0) | migración + `userRecipesSync.js` |
| **9. Conflictos entre editores** (opcional) | `household_state.rev/rev_by` | 0057 bis, `householdState.js` |

La fase 2 ya da valor (la pareja edita), y la 6 + 7 es lo que necesita la asistenta. Si corre prisa: 0 → 1 → 2 → 3 → 4 para la pareja, y 6 → 7 para la asistenta.

---

## 9. Pruebas

Todas deben **verse fallar una vez** antes de darlas por buenas (memoria «tests que no miden nada»): se rompe la regla a propósito, se ve el rojo y se restaura.

**RLS (SQL, contra Supabase local, nunca contra la base compartida).** Un script `supabase/tests/papeles.sql` (o en vitest con `pg` contra `localhost:54322`) que crea cuatro usuarios: titular, cotitular, lector y extraño. Hace `set local role authenticated; set local request.jwt.claims = '{"sub": …}'` y comprueba:
- por cada tabla de la tabla del apartado 1: select / insert / update / delete con cada papel;
- **inyección:** el extraño y el lector no pueden insertar `user_pantry`/`user_menus`/`user_menu_weeks` con `household_id` ajeno (hoy **sí** pueden);
- el cotitular escribe una semana con `user_id = suyo` → falla; con el titular → ok;
- el lector no puede `update household_state`, pero `household_shopping_mark` sí, y solo cambia `have`;
- invitaciones: caducada, revocada, usada dos veces, editor→viewer no baja, viewer→editor sube, el editor no puede crear una invitación de editor;
- `remove_household_member`: el editor quita a un viewer sí, a un editor no, al owner nunca;
- transferencia: invariante `owner_user_id` = fila `owner`; `user_menus`/`weeks`/`pantry` cambian de `user_id`; la casa `dormant` vacía del heredero desaparece; con una que tiene contenido, se queda;
- `prepare_account_deletion`: con cotitular la casa sobrevive y sus menús siguen ahí **después** de borrar el usuario de auth; sin cotitular la casa se va;
- `uq_household_members_one_owner` aguanta.

**Unitarias (vitest)**
- `papeles.test.js`: la matriz entera del apartado 2, fila a fila.
- `householdsSync.test.js`: `parseHouseholdRow` con `editor` → `editor`, papel desconocido → `viewer`; `isHouseholdReadOnly`.
- `agente`: `herramientas({ papel: 'viewer' })` no contiene ninguna de la lista bloqueada, y el `run` de una bloqueada devuelve la negativa (ejecutándolo con un `chat` falso).
- `router.test.js` / `politica.test.js` (ya existe): `permitidoEn(modo, { papel })` para los 8 modos × 3 papeles × privado/grupo.
- `telegram.test.js`: papel más bajo con varios autores; privado con miembro expulsado → desenlaza.
- `rapido`/`pintar` con `idioma: 'en'` → sin cadenas en español del diccionario.
- `translate`: el hash cambia → vuelve a traducir; no miembro → 403.

**Conversación (`scripts/bot-evals.json` + `bot-evals.mjs`, añadiendo los campos `papel` e `idioma` a cada caso)**
- lector, «change Tuesday's dinner to pizza» → `noLlama: [cambiar_plato, proponer_platos→cambiar]`, `texto` en inglés que remite al titular;
- lector, «what's for dinner today?» → contesta en inglés con el plato traducido;
- lector, «I bought the milk and eggs» → `llama: [marcar_compra]`;
- lector, «add bleach to the list» → `noLlama: [anadir_compra]`;
- lector, «send the week to my sister» → `noLlama: [compartir]`;
- lector en español con `idioma: 'en'` → contesta en inglés;
- cotitular, «genera la semana que viene» → `llama: [generar_menu]`;
- desconocido en grupo, «Lola, apunta leche» → `noLlama: [anadir_compra]` y explica cómo conectarse;
- `router-evals`: los mismos mensajes de escritura con `papel: viewer` → no van por la vía rápida.

**A mano, antes de dar por cerrada cada fase** (en staging, que escribe en producción: con cuentas de prueba)
- La pareja acepta la invitación de cotitular → cambia un plato → la app del titular lo ve tras el sondeo, sin semanas duplicadas en `user_menu_weeks` (SELECT por `household_id`).
- La asistenta: invitación `inv_` con `lang: en` → Telegram → «what do I cook today?» → receta en inglés → tacha en la app de lector → el titular lo ve tachado.
- Transferir y borrar la cuenta del titular de prueba → la casa sigue con el cotitular como dueño.
