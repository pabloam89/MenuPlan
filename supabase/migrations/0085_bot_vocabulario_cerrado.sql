-- Vocabulario cerrado en las tablas del bot. SOLO AÑADE (salvo una columna que
-- nadie escribe ni lee): producción y staging comparten base, y el bot
-- desplegado sigue escribiendo como hasta ahora mientras convivan.
--
--   1. `channel` con CHECK en las cuatro tablas que no lo tenían (bot_messages,
--      bot_reminders, bot_tareas, bot_cola). bot_identities, bot_chats y
--      bot_codigos ya lo llevan desde 0057/0058; con los mismos valores.
--   2. bot_reminders.tipo: el aviso de la víspera se reconocía por el texto
--      («Aviso de la víspera»). Un recordatorio que alguien escribiera igual se
--      habría portado como el aviso, y cambiar ese texto rompía el aviso. Ahora
--      es una columna con su CHECK (api/_bot/recordatorios.js TIPOS_RECORDATORIO).
--   3. Fuera bot_deshacer.descripcion: se creó en 0060 y ningún código la ha
--      escrito ni leído nunca (ni en main ni en staging).
--
-- Necesaria ANTES de desplegar el bot que filtra por `tipo=eq.vispera`
-- (api/_bot/vispera.js): sin la columna, esa consulta da error.
--
-- Antes de aplicar, en el SQL editor (todas deben dar 0; si no, los CHECK
-- entran igual, NOT VALID, pero no se podrán validar hasta limpiarlas):
--   select 'bot_messages'  t, count(*) from public.bot_messages  where channel not in ('telegram', 'whatsapp')
--   union all select 'bot_reminders', count(*) from public.bot_reminders where channel not in ('telegram', 'whatsapp')
--   union all select 'bot_tareas',    count(*) from public.bot_tareas    where channel not in ('telegram', 'whatsapp')
--   union all select 'bot_cola',      count(*) from public.bot_cola      where channel not in ('telegram', 'whatsapp');
--   select count(*) from public.bot_deshacer where descripcion is not null;
-- Informativo (lo que pasará a tipo = 'vispera', y los datos personales que
-- el bot nuevo ya no escribe):
--   select count(*) from public.bot_reminders where text = 'Aviso de la víspera';
--   select count(*) from public.bot_messages  where author_id  is not null;
--   select count(*) from public.bot_reminders where created_by is not null;
--   select count(*) from public.bot_chats     where lang       is not null;
--
-- Después de aplicar y con el bot nuevo desplegado una semana sin errores:
--   alter table public.bot_messages  validate constraint bot_messages_channel_check;
--   alter table public.bot_reminders validate constraint bot_reminders_channel_check;
--   alter table public.bot_tareas    validate constraint bot_tareas_channel_check;
--   alter table public.bot_cola      validate constraint bot_cola_channel_check;
--   alter table public.bot_reminders validate constraint bot_reminders_tipo_check;
-- Y cuando no quede desplegado ningún bot anterior a este (el viejo escribe
-- estas columnas; quitarlas antes haría fallar sus inserts):
--   alter table public.bot_chats     drop column lang;        -- nadie lo lee: el idioma es user_profiles.ui_lang
--   bot_messages.author_id y bot_reminders.created_by: NO se borran sin más. El
--   plan maestro (8 oct 2026, «Quién y por dónde») pide autor y canal en cada
--   escritura de la casa: se sustituyen por `author_user_id uuid references
--   auth.users on delete set null` (el user_id de quien escribe, nunca su nombre
--   visible) en una migración posterior, y solo entonces se quita la columna vieja.
--   drop trigger if exists bot_reminders_tipo_vispera on public.bot_reminders;
--   drop function if exists public.bot_reminders_tipo_vispera();

-- ── 1. channel: los mismos dos valores en todas las tablas del bot ──
-- NOT VALID: no se mira lo que ya hay (sin bloquear la tabla recorriéndola),
-- sí todo lo que entra.
alter table public.bot_messages drop constraint if exists bot_messages_channel_check;
alter table public.bot_messages add constraint bot_messages_channel_check
  check (channel in ('telegram', 'whatsapp')) not valid;

alter table public.bot_reminders drop constraint if exists bot_reminders_channel_check;
alter table public.bot_reminders add constraint bot_reminders_channel_check
  check (channel in ('telegram', 'whatsapp')) not valid;

alter table public.bot_tareas drop constraint if exists bot_tareas_channel_check;
alter table public.bot_tareas add constraint bot_tareas_channel_check
  check (channel in ('telegram', 'whatsapp')) not valid;

alter table public.bot_cola drop constraint if exists bot_cola_channel_check;
alter table public.bot_cola add constraint bot_cola_channel_check
  check (channel in ('telegram', 'whatsapp')) not valid;

-- ── 2. bot_reminders.tipo ──
-- Default constante: no reescribe la tabla, y el bot viejo (que no la conoce)
-- inserta sin ella y cae en «libre».
alter table public.bot_reminders
  add column if not exists tipo text not null default 'libre';

alter table public.bot_reminders drop constraint if exists bot_reminders_tipo_check;
alter table public.bot_reminders add constraint bot_reminders_tipo_check
  check (tipo in ('libre', 'vispera')) not valid;

update public.bot_reminders set tipo = 'vispera'
 where text = 'Aviso de la víspera' and tipo is distinct from 'vispera';

-- El bot desplegado antes de esta migración crea el aviso solo con el texto:
-- este disparador le pone el tipo, para que el bot nuevo lo encuentre (por
-- tipo) al quitarlo o cambiarlo de hora. Se va cuando no quede bot viejo.
create or replace function public.bot_reminders_tipo_vispera()
returns trigger
language plpgsql
as $$
begin
  if new.text = 'Aviso de la víspera' then
    new.tipo := 'vispera';
  end if;
  return new;
end;
$$;

drop trigger if exists bot_reminders_tipo_vispera on public.bot_reminders;
create trigger bot_reminders_tipo_vispera
  before insert on public.bot_reminders
  for each row execute function public.bot_reminders_tipo_vispera();

revoke all on function public.bot_reminders_tipo_vispera() from public, anon, authenticated;

-- ── 3. Una columna que nunca tuvo uso ──
-- Ningún insert la nombra (PostgREST solo manda las columnas que van en la
-- fila), así que quitarla no rompe al bot desplegado.
alter table public.bot_deshacer drop column if exists descripcion;
