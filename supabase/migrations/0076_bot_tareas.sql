-- Tareas abiertas del bot: seguimientos («dímelo cuando lo sepas») y preguntas
-- pendientes (lo que Lola necesita saber para atender algo, p. ej. cómo come
-- el bebé). Viven fuera del chat para que Lola las lea en cada turno aunque
-- el chat sea largo. Los recordatorios con hora siguen en bot_reminders.
--
-- scope 'casa': lo ven todos los miembros de la casa.
-- scope 'personal': solo quien lo pidió, y solo en su chat privado.
-- Las filas no se borran: se marcan como hechas o descartadas.

create table if not exists public.bot_tareas (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households(id) on delete cascade,
  channel       text not null,
  chat_id       text not null,
  kind          text not null check (kind in ('seguimiento', 'pregunta')),
  scope         text not null default 'casa' check (scope in ('casa', 'personal')),
  owner_user_id uuid references auth.users(id) on delete cascade,
  texto         text not null,
  falta         text,
  clave         text,
  status        text not null default 'abierta' check (status in ('abierta', 'hecha', 'descartada')),
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  closed_at     timestamptz,
  check (scope = 'casa' or owner_user_id is not null)
);

create index if not exists bot_tareas_abiertas
  on public.bot_tareas (household_id, status, created_at);

alter table public.bot_tareas enable row level security;
