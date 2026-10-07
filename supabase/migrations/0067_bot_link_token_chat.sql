-- ═══ bot_link_tokens: recordar en qué chat se paró por el aviso legal ══════
--
-- Cuando enlazarDesdeAjustes (api/bot/telegram.js) para un /start <token> por
-- falta de consentimiento, el token se deja SIN gastar a propósito para poder
-- reintentarlo — pero hasta ahora no había forma de recuperar ESE token desde
-- un mensaje de texto suelto que llegara mientras tanto: atender() solo veía
-- un chat sin enlazar y lo trataba como alguien totalmente nuevo, creando una
-- cuenta y una casa de usar y tirar, desconectadas de la cuenta real que
-- estaba a medio enlazar.
--
-- chat_id, puesto en el momento de parar por el aviso, es lo que permite a
-- atender() reconocer ese chat y retomar el enlace en vez de crear otro.
alter table public.bot_link_tokens
  add column if not exists chat_id text;

-- Ese reconocimiento (enlacePendiente, api/bot/telegram.js) consulta las dos
-- tablas por chat_id en CADA mensaje suelto que llega a un chat sin enlazar
-- — un camino caliente nuevo, sin el índice que tendría si hubiera nacido con
-- la tabla. Ninguna de las dos se poda, así que sin esto el escaneo se iría
-- haciendo más lento según crecieran.
create index if not exists bot_link_tokens_chat on public.bot_link_tokens (chat_id);
create index if not exists bot_codigos_chat on public.bot_codigos (channel, chat_id);
