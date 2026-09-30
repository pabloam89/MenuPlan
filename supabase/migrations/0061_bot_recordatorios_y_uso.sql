-- ═══ Recordatorios que se repiten, y uso que se cuenta bien ══════════════════
--
-- 1. Recordatorios: `bot_reminders` (0057) ya guardaba lo aceptado; faltaba
--    repetirlos («cada domingo, la compra»). El envío lo hace
--    /api/bot/recordatorios; qué lo llama cada pocos minutos está por decidir
--    (los cron de Vercel solo corren en producción, y el bot vive en staging).
--
-- 2. Uso: el runner del agente hace varias llamadas al modelo por mensaje; se
--    suman todas, y las escrituras de caché (1,25× la entrada) van aparte para
--    que el coste salga real. La suma es atómica (antes era leer y escribir).

alter table public.bot_reminders
  add column if not exists repite text check (repite in ('diario', 'semanal'));

alter table public.bot_usage
  add column if not exists cache_write_tokens bigint not null default 0;

create or replace function public.bot_contar_uso(
  p_household uuid, p_mes date,
  p_input bigint, p_output bigint, p_cache_read bigint, p_cache_write bigint
) returns integer
language sql
security definer
set search_path = public
as $$
  insert into public.bot_usage as u
    (household_id, month, messages, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens)
  values (p_household, p_mes, 1, p_input, p_output, p_cache_read, p_cache_write)
  on conflict (household_id, month) do update set
    messages           = u.messages + 1,
    input_tokens       = u.input_tokens + excluded.input_tokens,
    output_tokens      = u.output_tokens + excluded.output_tokens,
    cache_read_tokens  = u.cache_read_tokens + excluded.cache_read_tokens,
    cache_write_tokens = u.cache_write_tokens + excluded.cache_write_tokens
  returning messages;
$$;

-- Solo el servidor. Revocar de public también: si no, anon y authenticated la
-- heredan (la lección de 0056).
revoke all on function public.bot_contar_uso(uuid, date, bigint, bigint, bigint, bigint) from public, anon, authenticated;
grant execute on function public.bot_contar_uso(uuid, date, bigint, bigint, bigint, bigint) to service_role;
