-- El registro de cada intento de conectar un chat con una casa (#1238).
-- AUDITADA: auditor-datos 2026-11-04 OK
--   (un agente independiente, que no la escribió, leyendo producción: tabla nueva de solo añadir, sin bloqueos ni datos
--   de Telegram; household_id y user_id con lector en bot-enlaces.mjs, CHECK iguales a las listas JS, RLS sin políticas y
--   plan B que no tumba el enlace. En su primera pasada pidió quitar channel, dar lector a household_id y registrar el
--   sitio de fallo enlace_apuntar: hecho)
--
-- Un mismo Telegram con dos cuentas de la app acababa con Lola en una casa y la persona mirando otra, sin aviso. El
-- 4 nov 2026 se vio que 3 cuentas habían intentado conectar su Telegram desde la app (6 veces) y se habían rechazado
-- («este chat ya está conectado a otra casa»), y solo se supo deduciéndolo de bot_link_tokens: el rechazo no se
-- apuntaba en ninguna parte, ni el camino por el que llega cada enlace. Solo funnel_linked, una vez y si salía bien.
--
-- Con esta tabla, cada intento deja una fila: por qué camino llegó y cómo acabó, los dos con vocabulario cerrado (la
-- lista en src/lib/vocabularios.js, CAMINOS_ENLACE y RESULTADOS_ENLACE). Las columnas se llaman camino_enlace y
-- resultado_enlace, con nombre propio, para que el vigía de vocabularios no las confunda con cualquier «camino» o
-- «resultado» del código. La escribe enlace.js (apuntarEnlace) y la lee scripts/bot-enlaces.mjs, que cuenta por
-- camino y resultado y las cuentas rechazadas que no llegaron a enlazar.
--
--   · bot_enlaces (nueva): registro de solo añadir. Sin datos de Telegram (ni chat ni persona): quién lo pidió es la
--     cuenta (user_id, set null al borrarla) y para qué casa (household_id, cascade al borrarla). El script cuenta con
--     las dos las cuentas que intentan enlazar desde más de una casa, el síntoma de #1238. Sin canal: hoy todo es
--     Telegram y nadie lo leería; cuando haya otro, se añade con su lector.
--   · Aceptado: identidad_de_otra (el Telegram ya es de otra cuenta) gana a nuevo / ya_estaba / casa_cambiada en la
--     misma columna; ese caso no dice si el chat era nuevo. Hoy importa saber que pasó, no de dónde venía el chat.
--
-- NO hace: no toca bot_chats, bot_identities ni bot_link_tokens, ni datos de familias, ni RLS de lo que ya existía.
-- Plan B (regla migraciones): sin ella, el insert de apuntarEnlace falla, se apunta en el log (seguirCon) y el
-- enlace sigue igual que hoy.
-- Testigo: la tabla public.bot_enlaces.

set lock_timeout = '5s';

create table if not exists public.bot_enlaces (
  id               bigint generated always as identity primary key,
  -- Principio 1 roto a la vista (docs/datos/PRINCIPIOS.md): nullable. Un código caducado o de otro tipo se rechaza
  -- sin llegar a saber para qué casa era; sigue siendo un intento que contar.
  household_id     uuid references public.households(id) on delete cascade,
  camino_enlace    text not null check (camino_enlace in ('app', 'grupo', 'email', 'alta_telegram', 'invitacion', 'reenganche')),
  resultado_enlace text not null check (resultado_enlace in (
                 'nuevo', 'ya_estaba', 'casa_cambiada', 'ocupado', 'identidad_de_otra',
                 'caducado', 'no_miembro', 'codigo_de_grupo')),
  user_id          uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now()
);

create index if not exists bot_enlaces_casa on public.bot_enlaces (household_id, created_at desc);
create index if not exists bot_enlaces_cuenta on public.bot_enlaces (user_id);

comment on table public.bot_enlaces is
  'Cada intento de conectar un chat con una casa (#1238): camino_enlace y resultado_enlace. Escribe api/_bot/enlace.js (apuntarEnlace); lee scripts/bot-enlaces.mjs.';
comment on column public.bot_enlaces.user_id is
  'La cuenta que pidió el enlace (quien firmó el código, o la del Telegram). Null si no se supo o si se borró la cuenta.';

-- Como las demás tablas del bot (0057): RLS sin políticas; solo la escribe y la lee el servidor.
alter table public.bot_enlaces enable row level security;
revoke all on public.bot_enlaces from anon, authenticated;
