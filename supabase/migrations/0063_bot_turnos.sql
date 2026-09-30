-- ═══ Un turno a la vez por chat ═════════════════════════════════════════════
--
-- La gente escribe en ráfagas: «quiero cambiar la cena» · «la del jueves» ·
-- «algo ligero». Cada mensaje es una llamada al webhook, y cada una arrancaba
-- su propia respuesta: tres respuestas cruzadas, a veces contradiciéndose. Y
-- si se escribía mientras Lola contestaba, dos agentes en paralelo sobre la
-- misma casa.
--
-- Ahora: cada mensaje entra en una cola por chat, y solo quien tiene el
-- candado del chat responde; espera un par de segundos, toma TODO lo que haya
-- en la cola y lo atiende en un solo turno; si mientras tanto llega más, va al
-- turno siguiente. El candado caduca solo (hasta), por si una función muere a
-- medias. Solo servidor (RLS sin políticas), como el resto de tablas del bot.

create table if not exists public.bot_cola (
  id          bigserial primary key,
  channel     text not null default 'telegram',
  chat_id     text not null,
  item        jsonb not null,
  created_at  timestamptz not null default now(),
  tomado_at   timestamptz
);
create index if not exists bot_cola_pendientes on public.bot_cola (chat_id, id) where tomado_at is null;

create table if not exists public.bot_candados (
  chat_id  text primary key,
  hasta    timestamptz not null
);

alter table public.bot_cola enable row level security;
alter table public.bot_candados enable row level security;

-- Tomar el candado si está libre o caducado. true = es tuyo.
create or replace function public.bot_tomar_candado(p_chat text, p_segundos integer default 150)
returns boolean
language sql
security definer
set search_path = public
as $$
  with tomado as (
    insert into public.bot_candados (chat_id, hasta)
    values (p_chat, now() + make_interval(secs => p_segundos))
    on conflict (chat_id) do update set hasta = excluded.hasta
      where public.bot_candados.hasta < now()
    returning 1
  )
  select exists (select 1 from tomado);
$$;

create or replace function public.bot_soltar_candado(p_chat text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.bot_candados where chat_id = p_chat;
$$;

-- Solo el servidor (0056: revocar de public no basta).
revoke all on function public.bot_tomar_candado(text, integer) from public, anon, authenticated;
revoke all on function public.bot_soltar_candado(text) from public, anon, authenticated;
grant execute on function public.bot_tomar_candado(text, integer) to service_role;
grant execute on function public.bot_soltar_candado(text) to service_role;
