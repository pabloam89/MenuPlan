-- 0087: cada mensaje que llega de fuera se atiende una sola vez.
--
-- Telegram reintenta una actualización si no recibe un 200 a tiempo (el
-- webhook contesta enseguida, pero una cola de Vercel o un corte de red bastan)
-- y la misma actualización llega dos veces con el mismo `update_id`. Hoy no se
-- guarda en ningún sitio, así que se atiende dos veces: Lola apunta dos veces
-- lo mismo en la compra o en las tareas. Ahora el webhook apunta el id al
-- llegar y, si ya estaba, no hace nada (api/_bot/entradas.js).
--
-- Sin household_id a propósito (PRINCIPIOS §1): esto pasa antes de saber de qué
-- casa es el mensaje, y la fila no lleva nada de la casa ni de la persona,
-- solo el id que pone el proveedor. Por eso se guarda poco: 7 días, de sobra
-- para los reintentos (Telegram deja de reintentar a las 24 h).
--
-- Aditiva. El código no depende de ella: si la tabla no existe, el webhook
-- atiende el mensaje como antes (plan B, ver entradas.js).
--
-- Normas 17-21 de PRINCIPIOS (en camino, ops/cimientos): clave identity,
-- created_at, unique (proveedor, *_xid), texto sin espacios sobrantes, comment
-- con el plazo de conservación.

set lock_timeout = '5s';

create table public.bot_entradas (
  id          bigint generated always as identity primary key,
  proveedor   text not null
              constraint bot_entradas_proveedor_vocabulario check (proveedor in ('telegram', 'whatsapp')),
  entrada_xid text not null
              constraint bot_entradas_entrada_xid_limpio check (entrada_xid = btrim(entrada_xid) and entrada_xid <> ''),
  created_at  timestamptz not null default now(),
  constraint uq_bot_entradas_proveedor_xid unique (proveedor, entrada_xid)
);

create index idx_bot_entradas_created_at on public.bot_entradas (created_at);

alter table public.bot_entradas enable row level security;
revoke all on table public.bot_entradas from anon, authenticated;

comment on table public.bot_entradas is
  'Ids de lo que llega de fuera (update_id de Telegram; el de WhatsApp cuando llegue) para atender cada uno una sola vez. Solo servidor. Sin datos de la casa ni de la persona. Se conserva 7 días (job bot-entradas-purga). 0087.';
comment on column public.bot_entradas.entrada_xid is
  'Id externo que pone el proveedor (Telegram update_id). Sin FK: es de fuera.';

-- La purga, aparte de bot_purgar (0065) para no reescribir su cuerpo.
select cron.unschedule('bot-entradas-purga') where exists (select 1 from cron.job where jobname = 'bot-entradas-purga');
select cron.schedule('bot-entradas-purga', '29 3 * * *', $$delete from public.bot_entradas where created_at < now() - interval '7 days'$$);
