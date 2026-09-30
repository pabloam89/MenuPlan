-- ═══ «Ya tengo cuenta» sin salir de Telegram: código de 6 cifras ═══════════
--
-- La 0058 conectaba el chat con un ENLACE que abría la app y confirmaba allí.
-- En la prueba real se perdía: la app es una PWA y, al abrir el enlace, el
-- navegador sirve primero la versión en caché, que no conoce el código. Además
-- obligaba a salir de Telegram, que es justo lo que se quiere evitar.
--
-- Ahora el correo lleva un código de 6 cifras (el `{{ .Token }}` de Supabase)
-- y se escribe en el propio chat. El servidor lo verifica contra Supabase y
-- enlaza. Para eso `bot_codigos` tiene que recordar a qué email se mandó, y
-- cuántas veces se ha intentado (un código de 6 cifras se adivina si no se
-- limitan los intentos).

alter table public.bot_codigos
  add column if not exists email    text,
  add column if not exists intentos integer not null default 0;

comment on column public.bot_codigos.email is
  'vincular: email al que Supabase mandó el código de 6 cifras (0059).';
comment on column public.bot_codigos.intentos is
  'vincular: intentos fallidos al escribir el código en el chat; se corta a los 5 (0059).';
