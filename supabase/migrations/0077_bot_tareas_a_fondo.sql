-- bot_tareas, a fondo: lo que no puede depender del modelo se garantiza aquí.
--
-- · Sujeto y encargado: «lo de Cova», «que lo compre Isa» (ids de data.members).
-- · Tiempo: vence (fecha límite) y caduca_at (cuándo deja de tener sentido,
--   distinto por tipo: lo pone el código).
-- · Duplicados: una sola tarea abierta por (casa, clave). Dos padres pidiendo
--   lo mismo a la vez chocan aquí, no en una comprobación previa.
-- · Tope: como mucho 8 abiertas por casa. Si llega la novena, se descarta la
--   más vieja (primero seguimientos, luego preguntas), con un candado por casa
--   para que dos inserciones a la vez no lo salten.
-- · Purga: el texto puede llevar salud o menores; lo cerrado o caducado se
--   borra a los 7 días (bot_tareas_purgar, desde el cron de recordatorios).

alter table public.bot_tareas
  add column if not exists para_member     text,
  add column if not exists asignado_member text,
  add column if not exists vence           date,
  add column if not exists caduca_at       timestamptz not null default (now() + interval '30 days'),
  add column if not exists updated_at      timestamptz not null default now();

alter table public.bot_tareas drop constraint if exists bot_tareas_status_check;
alter table public.bot_tareas add constraint bot_tareas_status_check
  check (status in ('abierta', 'hecha', 'descartada', 'caducada'));

create unique index if not exists bot_tareas_una_abierta_por_clave
  on public.bot_tareas (household_id, clave)
  where status = 'abierta' and clave is not null;

create or replace function public.bot_tareas_tope()
returns trigger
language plpgsql
as $$
declare
  abiertas int;
  sobra    uuid;
begin
  if new.status <> 'abierta' then return new; end if;
  perform pg_advisory_xact_lock(hashtext('bot_tareas:' || new.household_id::text));
  select count(*) into abiertas
    from public.bot_tareas
   where household_id = new.household_id and status = 'abierta';
  if abiertas >= 8 then
    select id into sobra
      from public.bot_tareas
     where household_id = new.household_id and status = 'abierta'
     order by (kind = 'pregunta'), created_at
     limit 1;
    update public.bot_tareas
       set status = 'descartada', closed_at = now(), updated_at = now()
     where id = sobra;
  end if;
  return new;
end;
$$;

drop trigger if exists bot_tareas_tope on public.bot_tareas;
create trigger bot_tareas_tope
  before insert on public.bot_tareas
  for each row execute function public.bot_tareas_tope();

create or replace function public.bot_tareas_purgar()
returns jsonb
language plpgsql
as $$
declare
  caducadas int;
  borradas  int;
begin
  update public.bot_tareas
     set status = 'caducada', closed_at = now(), updated_at = now()
   where status = 'abierta' and caduca_at < now();
  get diagnostics caducadas = row_count;
  delete from public.bot_tareas
   where status <> 'abierta' and coalesce(closed_at, updated_at) < now() - interval '7 days';
  get diagnostics borradas = row_count;
  return jsonb_build_object('ok', true, 'caducadas', caducadas, 'borradas', borradas);
end;
$$;

revoke all on function public.bot_tareas_purgar() from public, anon, authenticated;
revoke all on function public.bot_tareas_tope() from public, anon, authenticated;
