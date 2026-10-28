-- 0102: qué platos se tiran al regenerar, de quien tiene cuenta y de quien no.
--
-- Cuando alguien regenera el menú, un día o un plato, está diciendo «este no».
-- Hoy eso solo queda en user_events como `day_regenerated` / `dish_replaced`,
-- sin el plato: no se puede saber cuáles se rechazan ni bajarlos de prioridad.
-- Esta tabla guarda una fila por plato descartado, con su alcance (todo el
-- menú, un día o un plato suelto: no pesa igual tirar uno que veinte).
--
-- Dos lectores, y los dos son de este PR o del siguiente (nada sin lector):
--   · la analítica: ops.receta_descartes_resumen (abajo), sin ids reales;
--   · el solver: lee los descartes de la casa y baja de prioridad lo que se
--     rechaza una y otra vez (PR de código, lo siguiente).
--
-- Sin household_id obligatorio a propósito (PRINCIPIOS §1): quien no se
-- registra no tiene casa en la base, y es justo a quien se quiere medir. Su
-- fila va con `anon_id` (el mismo que ya usa /api/track) y la escribe el
-- servidor; la de quien tiene cuenta la escribe el cliente con su sesión.
-- Una de las dos identidades, nunca las dos ni ninguna (CHECK).
--
-- Si se borra la casa, las filas se quedan con la persona (household_id pasa a
-- null): su historial es suyo, no de la casa.
--
-- Aditiva. El código no depende de ella: si la tabla no existe, regenerar
-- funciona igual y el descarte se pierde (plan B).
--
-- Solo hay una base: esta migración sirve a staging y a main a la vez. Se
-- aplica una vez y los dos entornos la ven.
--
-- AUDITADA: auditor-datos 2026-10-28 OK

set lock_timeout = '5s';

create table public.receta_descartes (
  id           bigint generated always as identity primary key,
  user_id      uuid references auth.users(id) on delete cascade,
  household_id uuid references public.households(id) on delete set null,
  anon_id      text,
  receta_id    text not null
               constraint receta_descartes_receta_id_limpio check (receta_id = btrim(receta_id) and receta_id <> '' and char_length(receta_id) <= 120),
  alcance      text not null
               constraint receta_descartes_alcance_vocabulario check (alcance in ('plato', 'dia', 'menu')),
  created_at   timestamptz not null default now(),
  constraint receta_descartes_anon_id_forma check (anon_id is null or anon_id ~ '^[A-Za-z0-9-]{8,64}$'),
  constraint receta_descartes_una_identidad check (num_nonnulls(user_id, anon_id) = 1),
  constraint receta_descartes_casa_con_usuario check (household_id is null or user_id is not null)
);

create index idx_receta_descartes_user_id on public.receta_descartes (user_id) where user_id is not null;
create index idx_receta_descartes_household_id on public.receta_descartes (household_id, created_at desc) where household_id is not null;
create index idx_receta_descartes_anon_purga on public.receta_descartes (created_at) where anon_id is not null;

alter table public.receta_descartes enable row level security;

-- Quien tiene cuenta apunta lo suyo, y si dice una casa tiene que ser miembro.
create policy receta_descartes_insert on public.receta_descartes
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (
      household_id is null
      or exists (
        select 1 from public.household_members hm
        where hm.household_id = receta_descartes.household_id
          and hm.user_id = (select auth.uid())
      )
    )
  );

-- Lee lo suyo y lo de su casa (el solver baja de prioridad por casa, no por persona).
create policy receta_descartes_lectura on public.receta_descartes
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (
      household_id is not null
      and exists (
        select 1 from public.household_members hm
        where hm.household_id = receta_descartes.household_id
          and hm.user_id = (select auth.uid())
      )
    )
  );

-- Solo se añade: ni update ni delete desde la API (el borrado es por cascada
-- al borrar la cuenta o la casa, y la purga de abajo).
revoke update, delete, truncate on table public.receta_descartes from authenticated;

comment on table public.receta_descartes is
  'Un plato descartado al regenerar (plato suelto, día o menú entero). Quien tiene cuenta: user_id (y household_id si hay casa), lo escribe el cliente con su sesión. Quien no: anon_id, lo escribe /api/track con la clave de servidor. Solo se añade. Las filas de invitados se purgan a los 180 días (job receta-descartes-purga); las de cuenta se van con la cuenta o la casa. Lo leen el solver (baja de prioridad) y ops.receta_descartes_resumen. 0102.';
comment on column public.receta_descartes.user_id is
  'Quien regeneró, si tiene cuenta. null = invitado (entonces anon_id). Cascada: se va con la cuenta.';
comment on column public.receta_descartes.household_id is
  'La casa activa al regenerar, si la había. null = invitado, cuenta sin casa o casa ya borrada (set null). El solver baja de prioridad por casa.';
comment on column public.receta_descartes.anon_id is
  'Id aleatorio por navegador del invitado (el de /api/track, metadata.anon_id de user_events). null si hay user_id. Sin FK: es de fuera.';
comment on column public.receta_descartes.receta_id is
  'Id de receta del catálogo del bundle (src/data), sin FK a propósito: el catálogo vive en git. Los ids del catálogo no se reutilizan.';
comment on column public.receta_descartes.alcance is
  'Cuánto se tiró de golpe: plato (uno suelto), dia (un día entero) o menu (la semana). Vocabulario ALCANCES_DESCARTE de src/lib/vocabularios.js. Tirar uno suelto pesa más que tirar veinte.';

-- Purga de invitados: sin cuenta no hay nadie a quien se pueda borrar luego,
-- así que se conservan 180 días. 03:41 UTC = 05:41 en Madrid en verano,
-- 04:41 en invierno (§20).
select cron.unschedule('receta-descartes-purga') where exists (select 1 from cron.job where jobname = 'receta-descartes-purga');
select cron.schedule('receta-descartes-purga', '41 3 * * *', $$delete from public.receta_descartes where anon_id is not null and created_at < now() - interval '180 days'$$);

-- Lo que ve la analítica: qué platos se tiran más, y cuántas personas distintas
-- lo hacen (no es lo mismo que una casa lo tire 9 veces que 9 casas una vez).
-- Sin ids reales: la persona va como md5 (como ops.generation_events, 0051).
create or replace view ops.receta_descartes_resumen as
select
  d.receta_id,
  count(*) as descartes,
  count(*) filter (where d.alcance = 'plato') as descartes_plato,
  count(*) filter (where d.alcance = 'dia') as descartes_dia,
  count(*) filter (where d.alcance = 'menu') as descartes_menu,
  count(distinct md5(coalesce(d.user_id::text, d.anon_id))) as personas,
  count(*) filter (where d.anon_id is not null) as descartes_invitados,
  max(d.created_at) as ultimo
from public.receta_descartes d
where d.created_at > now() - interval '90 days'
group by d.receta_id;

grant select on ops.receta_descartes_resumen to ops_reader;
