-- Menús generados en las últimas 26 horas: volumen y velocidad por modelo y formato.
-- Lo lanza el workflow agente-fallos con el rol ops_reader.
select
  coalesce(planner_model, '?') as modelo,
  coalesce(planner_format, 'json') as formato,
  count(*) as menus_ok,
  count(distinct person) as personas,
  round(percentile_cont(0.5) within group (order by elapsed_ms)) as p50_ms,
  round(percentile_cont(0.9) within group (order by elapsed_ms)) as p90_ms,
  round(avg(llm_calls), 2) as llamadas_media,
  round(avg(correction_calls), 2) as correcciones_media
from ops.generation_events
where created_at > now() - interval '26 hours'
  and event = 'menu_generated'
group by 1, 2
order by menus_ok desc;
