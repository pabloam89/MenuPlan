-- ═══ Deshacer desde el chat ═════════════════════════════════════════════════
--
-- «Uy, no, deja lo de antes.» Para que la gente se atreva a dejar que el bot
-- cambie cosas, cada escritura del bot se puede deshacer. Antes de escribir,
-- el bot guarda aquí una foto de cómo estaba la casa (household_state.state),
-- la semana que tocaba (plan y compra) y el menú activo; «deshaz» la restaura.
--
-- Solo se deshace si nadie ha tocado la casa después (la app pone updated_at
-- al guardar): si no, restaurar pisaría lo que alguien hizo en la app, y eso
-- es justo lo que 0057 existe para evitar.
--
-- Se guardan las últimas por casa; la limpieza la hace el bot al escribir.

create table if not exists public.bot_deshacer (
  id                bigserial primary key,
  household_id      uuid not null references public.households(id) on delete cascade,
  bot_rev_despues   bigint not null,
  antes             jsonb not null,
  descripcion       text,
  created_at        timestamptz not null default now(),
  usado_at          timestamptz
);

create index if not exists bot_deshacer_casa on public.bot_deshacer (household_id, created_at desc);

comment on table public.bot_deshacer is
  'Fotos previas a cada escritura del bot, para «deshaz lo último» desde el chat. Solo servidor (0060).';

alter table public.bot_deshacer enable row level security;
