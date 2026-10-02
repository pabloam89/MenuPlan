-- ═══ Los eventos del bot, para el informe semanal de Lola ═══════════════════
--
-- El workflow .github/workflows/bot-semanal.yml mide la semana con el rol
-- ops_reader (0051), que solo ve vistas del esquema ops. Esta le da los
-- eventos del bot de los últimos 21 días (la semana, la anterior y margen)
-- SIN nada de lo que dijo la gente: fuera texto, ultima, anterior, datos y
-- los mensajes de error (pueden repetir lo que se pidió),
-- igual que hace la retención (0065) a los 15 días. El chat va como md5:
-- sirve para saber qué vino después en el mismo chat, no para saber cuál es.
--
-- Run this in: Supabase Dashboard → SQL Editor → project → Run.

create or replace view ops.bot_events as
select
  e.created_at,
  e.event,
  (e.metadata - array['texto', 'ultima', 'anterior', 'datos', 'chat', 'telegram_id', 'error'])
    || case when e.metadata ? 'chat' then jsonb_build_object('chat', md5(e.metadata->>'chat')) else '{}'::jsonb end
    as metadata
from public.user_events e
where e.created_at > now() - interval '21 days'
  and e.event like 'bot\_%' escape '\';

grant select on ops.bot_events to ops_reader;
