-- Fallos de las últimas 26 horas (margen sobre la ejecución diaria), agrupados.
-- Lo lanza el workflow agente-fallos con el rol ops_reader.
select
  event,
  coalesce(error, '(sin mensaje)') as error,
  count(*) as fallos,
  count(distinct person) as personas,
  count(*) filter (where is_guest) as de_invitados,
  count(*) filter (where network) as de_red,
  count(*) filter (where hidden_during_request) as en_segundo_plano,
  string_agg(distinct cause, ' ; ') as causas,
  string_agg(distinct device, ',') as dispositivos,
  string_agg(distinct planner_model, ',') as modelos,
  min(created_at) as primero,
  max(created_at) as ultimo
from ops.generation_events
where created_at > now() - interval '26 hours'
  and event <> 'menu_generated'
group by 1, 2
order by fallos desc
limit 50;
