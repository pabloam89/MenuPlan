-- 0084: un tercer tipo de código del bot, `alta`.
--
-- «Prefiero rellenarlo en la app», en el saludo de Lola, abre la app de un
-- toque: el botón ya es el enlace (`/?entrar=<código>&ir=alta`). Pero en el
-- saludo aún no hay cuenta, así que el código no puede ser `entrar` (que exige
-- user_id): es `alta`, y la cuenta se crea al abrirlo (api/bot/entrar.js),
-- atada al Telegram que lo pidió (external_id). Un solo uso y 30 minutos,
-- como los de `entrar`.
--
-- Aditiva: amplía el check y añade la regla de `alta`. Los códigos que ya
-- hay no cambian.
--
-- Check y no enum ni tabla catálogo: es un vocabulario corto que cambia con
-- el código (un tipo nuevo = código nuevo que lo entienda), sin atributos
-- propios ni nadie que lo edite fuera de un despliegue. Lo que sí tiene cada
-- tipo es una regla, y esa va en la base: `entrar` exige user_id (0058) y
-- `alta`, el Telegram al que se atará la cuenta.
--
-- Sin `if exists` a propósito: si el nombre no fuera este, el drop no haría
-- nada en silencio y el check viejo seguiría rechazando `alta`. Mejor que
-- falle aquí (nombre comprobado en pg_constraint, 6 oct 2026).

alter table public.bot_codigos drop constraint bot_codigos_tipo_check;
alter table public.bot_codigos
  add constraint bot_codigos_tipo_check check (tipo in ('vincular', 'entrar', 'alta'));
alter table public.bot_codigos
  add constraint bot_codigos_alta_check check (tipo <> 'alta' or external_id is not null);

comment on table public.bot_codigos is
  'Códigos de un solo uso que nacen en el bot: vincular (cuenta existente, por email), entrar (cuenta creada desde el bot) y alta (la cuenta se crea al abrir la app desde el saludo). Solo servidor (0058, 0084).';
