-- 0084: un tercer tipo de código del bot, `alta`.
--
-- «Prefiero rellenarlo en la app», en el saludo de Lola, abre la app de un
-- toque: el botón ya es el enlace (`/?entrar=<código>&ir=alta`). Pero en el
-- saludo aún no hay cuenta, así que el código no puede ser `entrar` (que exige
-- user_id): es `alta`, y la cuenta se crea al abrirlo (api/bot/entrar.js),
-- atada al Telegram que lo pidió (external_id). Un solo uso y 30 minutos,
-- como los de `entrar`.
--
-- Aditiva: solo amplía el check. Los códigos que ya hay no cambian.

alter table public.bot_codigos drop constraint if exists bot_codigos_tipo_check;
alter table public.bot_codigos
  add constraint bot_codigos_tipo_check check (tipo in ('vincular', 'entrar', 'alta'));

comment on table public.bot_codigos is
  'Códigos de un solo uso que nacen en el bot: vincular (cuenta existente, por email), entrar (cuenta creada desde el bot) y alta (la cuenta se crea al abrir la app desde el saludo). Solo servidor (0058, 0084).';
