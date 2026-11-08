-- ═══ Lo que se habla con Lola dura 15 días ═══════════════════════════════════
--
-- Las charlas no se borraban nunca. El bot solo usa los últimos 3 días
-- (16 mensajes) y los borradores de receta 24 h; lo que la casa decide se
-- guarda en household_state con las herramientas, no en la charla. Decisión
-- de Pablo del 1 oct 2026: 15 días.
--
-- Cada noche:
--   · bot_messages y bot_cola de hace más de 15 días, fuera;
--   · en los eventos del bot (bot_route, bot_supervisor…), se quita lo que
--     dijo la gente (texto, ultima, anterior, datos, chat) y queda lo que
--     sirve para medir: modo, confianza, rapida, ms, esGrupo…
--
-- Al borrar una cuenta (api/_bot/borrar.js) se va todo en el momento.
-- Sin secretos: el job se programa aquí mismo (pg_cron ya está, 0062).

create or replace function public.bot_purgar(dias int default 15)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  corte timestamptz := now() - make_interval(days => dias);
  mensajes int;
  cola int;
  eventos int;
begin
  delete from public.bot_messages where created_at < corte;
  get diagnostics mensajes = row_count;
  delete from public.bot_cola where created_at < corte;
  get diagnostics cola = row_count;
  update public.user_events
     set metadata = metadata - array['texto', 'ultima', 'anterior', 'datos', 'chat']
   where event like 'bot\_%'
     and created_at < corte
     and metadata ?| array['texto', 'ultima', 'anterior', 'datos', 'chat'];
  get diagnostics eventos = row_count;
  return jsonb_build_object('mensajes', mensajes, 'cola', cola, 'eventos', eventos);
end;
$$;

revoke all on function public.bot_purgar(int) from public, anon, authenticated;

-- A las 3:17 UTC (de madrugada en España), una vez al día.
select cron.unschedule('bot-retencion') where exists (select 1 from cron.job where jobname = 'bot-retencion');
select cron.schedule('bot-retencion', '17 3 * * *', 'select public.bot_purgar(15)');
