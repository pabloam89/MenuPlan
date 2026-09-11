-- Acceso de solo lectura para el agente de mantenimiento
-- (.github/workflows/agente-fallos.yml).
--
-- El agente no toca las tablas: solo ve ops.generation_events, una vista de
-- los últimos 14 días de fallos y generaciones con lo justo para diagnosticar.
-- Sin emails ni ids reales (la persona va como md5 del user_id o anon_id), con
-- los textos recortados, y con los casts protegidos: user_events también lo
-- escriben los invitados vía /api/track, así que un valor raro en metadata no
-- puede romper la consulta.
--
-- El esquema ops no está expuesto por la API REST de Supabase, así que la
-- vista (que lee las tablas con los permisos de su dueño) no queda al alcance
-- de anon/authenticated.
--
-- Run this in: Supabase Dashboard → SQL Editor → project → Run.
-- Después, dale contraseña al rol (una larga y aleatoria, solo para GitHub):
--   alter role ops_reader with login password '...';

create schema if not exists ops;
revoke all on schema ops from public;

create or replace view ops.generation_events as
select
  e.created_at,
  e.event,
  left(e.metadata->>'error', 160) as error,
  left(e.metadata->>'cause', 80) as cause,
  case when e.metadata->>'network' in ('true', 'false') then (e.metadata->>'network')::boolean end as network,
  case when e.metadata->>'hiddenDuringRequest' in ('true', 'false') then (e.metadata->>'hiddenDuringRequest')::boolean end as hidden_during_request,
  left(coalesce(e.metadata->>'device', p.device_type), 20) as device,
  left(e.metadata->>'plannerModel', 60) as planner_model,
  left(e.metadata->>'plannerFormat', 20) as planner_format,
  case when e.metadata->>'elapsedMs' ~ '^\d{1,9}(\.\d+)?$' then (e.metadata->>'elapsedMs')::numeric end as elapsed_ms,
  case when e.metadata->>'llmCalls' ~ '^\d{1,4}$' then (e.metadata->>'llmCalls')::int end as llm_calls,
  case when e.metadata->>'correctionCalls' ~ '^\d{1,4}$' then (e.metadata->>'correctionCalls')::int end as correction_calls,
  e.user_id is null as is_guest,
  md5(coalesce(e.user_id::text, e.metadata->>'anon_id', '')) as person
from public.user_events e
left join public.user_profiles p on p.user_id = e.user_id
where e.created_at > now() - interval '14 days'
  and (e.event like '%\_failed' escape '\' or e.event = 'menu_generated');

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'ops_reader') then
    create role ops_reader nologin;
  end if;
end
$$;

grant usage on schema ops to ops_reader;
grant select on ops.generation_events to ops_reader;
alter role ops_reader set default_transaction_read_only = on;
alter role ops_reader set statement_timeout = '15s';
