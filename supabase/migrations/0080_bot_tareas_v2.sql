-- Tareas v2, fase T1 (spec «Tareas de Lola» v11). SOLO AÑADE: producción y
-- staging comparten base, y el bot desplegado sigue escribiendo `kind` y
-- `status` como hasta ahora. Nada de esto cambia lo que hace hoy el bot: el
-- código nuevo solo lo usa con BOT_TAREAS_V2 encendido.
--
-- Destino: el modelo probado contra Postgres (schema.sql de la sesión de la
-- Ficha, 252/252). Lo que necesita tablas que aún no existen (persona,
-- restriccion, plato_planificado, invitado…) va SIN FK aquí: las FK
-- compuestas (household_id, x) llegan en una migración posterior, después de
-- la 0079 (personas a tabla).
--
-- Antes de aplicar, en el SQL editor (todas deben dar 0):
--   select count(*) from public.bot_tareas
--    where (status in ('hecha','descartada','caducada','rechazada')) <> (closed_at is not null);
--   select count(*) from public.bot_tareas where kind is null;
-- Informativo (no bloquea, se arregla en una migración posterior):
--   select count(*) from public.bot_reminders where household_id is null;
--
-- Después de aplicar y con el bot nuevo desplegado una semana sin errores:
--   alter table public.bot_tareas validate constraint bot_tareas_tipo_check;
--   alter table public.bot_tareas validate constraint bot_tareas_resultado_check;
--   alter table public.bot_tareas validate constraint bot_tareas_objetivo_check;
--   alter table public.bot_tareas validate constraint bot_tareas_cierre_check;
--   alter table public.bot_tareas validate constraint bot_tareas_v2_reglas_check;
--   alter table public.bot_reminders validate constraint bot_reminders_tarea_fk;
-- Y el índice único que cubre «aplazada»: supabase/manual/0080b_indice_concurrente.sql.

-- ── 1. Columnas nuevas: nulas o con default constante (sin reescribir la tabla) ──
alter table public.bot_tareas
  add column if not exists tipo             text,
  add column if not exists campo            text,
  add column if not exists persona_id       uuid,   -- FK a persona(household_id, id) tras la 0079
  add column if not exists objetivo         text,
  add column if not exists pedido           text,
  add column if not exists vuelve_at        timestamptz,
  add column if not exists version          int not null default 1,
  add column if not exists restriccion_id   uuid,   -- FK a restriccion, ídem
  add column if not exists receta_propuesta text,
  add column if not exists resultado        text;

-- `kind` deja de ser obligatoria: una espera o una decisión no tienen kind viejo.
-- El bot desplegado la sigue escribiendo siempre, así que para él nada cambia.
alter table public.bot_tareas alter column kind drop not null;

-- ── 2. Estados: se suma «aplazada» (los de hoy siguen valiendo) ──
alter table public.bot_tareas drop constraint if exists bot_tareas_status_check;
alter table public.bot_tareas add constraint bot_tareas_status_check
  check (status in ('abierta', 'aplazada', 'hecha', 'descartada', 'caducada', 'rechazada')) not valid;

-- ── 3. CHECK nuevos, NOT VALID: no se mira lo que ya hay, sí lo que entra ──
alter table public.bot_tareas drop constraint if exists bot_tareas_tipo_check;
alter table public.bot_tareas add constraint bot_tareas_tipo_check
  check (tipo is null or tipo in ('espera', 'falta_saber', 'decision', 'seguimiento')) not valid;

alter table public.bot_tareas drop constraint if exists bot_tareas_resultado_check;
alter table public.bot_tareas add constraint bot_tareas_resultado_check
  check (resultado is null or resultado in ('aceptada', 'mantenida')) not valid;

alter table public.bot_tareas drop constraint if exists bot_tareas_objetivo_check;
alter table public.bot_tareas add constraint bot_tareas_objetivo_check
  check (objetivo is null or objetivo in ('ideas_plato', 'calorias', 'generar_menu')) not valid;

-- Estado final si y solo si hay fecha de cierre: la purga nunca deja filas a medias.
alter table public.bot_tareas drop constraint if exists bot_tareas_cierre_check;
alter table public.bot_tareas add constraint bot_tareas_cierre_check
  check ((status in ('hecha', 'descartada', 'caducada', 'rechazada')) = (closed_at is not null)) not valid;

-- Reglas entre columnas nuevas (todas pasan con las filas de hoy: tipo y el resto son null).
alter table public.bot_tareas drop constraint if exists bot_tareas_v2_reglas_check;
alter table public.bot_tareas add constraint bot_tareas_v2_reglas_check check (
      (vuelve_at is null or status = 'aplazada')
  and (objetivo is null or tipo = 'espera')
  and (restriccion_id is null or tipo = 'decision')
  and (resultado is null or tipo = 'decision')
  and ((tipo = 'decision' and status = 'hecha') is not true or resultado is not null)
  and (pedido is null or length(pedido) <= 240)
) not valid;

-- ── 4. kind ↔ tipo, sincronizados mientras convivan el bot viejo y el nuevo ──
-- El viejo escribe kind; el nuevo, tipo. Este disparador rellena el otro, así
-- el tope de 0078 (que cuenta kind = 'seguimiento') y la lectura vieja siguen
-- funcionando con filas escritas por cualquiera de los dos.
create or replace function public.bot_tareas_kind_tipo()
returns trigger
language plpgsql
as $$
begin
  if new.tipo is null and new.kind is not null then
    new.tipo := case new.kind when 'pregunta' then 'falta_saber' else new.kind end;
  elsif new.kind is null and new.tipo is not null then
    new.kind := case new.tipo when 'falta_saber' then 'pregunta' when 'seguimiento' then 'seguimiento' else null end;
  elsif tg_op = 'UPDATE' and new.tipo is distinct from old.tipo and new.kind is not distinct from old.kind then
    new.kind := case new.tipo when 'falta_saber' then 'pregunta' when 'seguimiento' then 'seguimiento' else null end;
  elsif tg_op = 'UPDATE' and new.kind is distinct from old.kind and new.tipo is not distinct from old.tipo then
    new.tipo := case new.kind when 'pregunta' then 'falta_saber' else new.kind end;
  end if;
  return new;
end;
$$;

drop trigger if exists bot_tareas_kind_tipo on public.bot_tareas;
create trigger bot_tareas_kind_tipo
  before insert or update on public.bot_tareas
  for each row execute function public.bot_tareas_kind_tipo();

revoke all on function public.bot_tareas_kind_tipo() from public, anon, authenticated;

-- ── 5. El recordatorio sabe de qué tarea sale, y cae con ella ──
alter table public.bot_reminders add column if not exists tarea_id uuid;
alter table public.bot_reminders drop constraint if exists bot_reminders_tarea_fk;
alter table public.bot_reminders add constraint bot_reminders_tarea_fk
  foreign key (tarea_id) references public.bot_tareas(id) on delete cascade not valid;
create index if not exists bot_reminders_tarea on public.bot_reminders (tarea_id) where tarea_id is not null;

-- ── 6. Idempotencia: una orden repetida no escribe dos veces ──
-- Por casa: un id de llamada (o un message_id de Telegram) solo es único dentro
-- de su casa, y con la clave sola una casa recibía la respuesta guardada de otra.
create table if not exists public.bot_idempotencia (
  household_id uuid not null references public.households(id) on delete cascade,
  clave        text not null,
  rpc          text not null,
  resultado    jsonb,
  created_at   timestamptz not null default now(),
  primary key (household_id, clave)
);
create index if not exists bot_idempotencia_purga on public.bot_idempotencia (created_at);
alter table public.bot_idempotencia enable row level security;
revoke all on table public.bot_idempotencia from anon, authenticated;

-- ── 7. Purga: misma firma; ahora también caduca lo aplazado y limpia la idempotencia ──
create or replace function public.bot_tareas_purgar()
returns jsonb
language plpgsql
as $$
declare
  caducadas int;
  borradas  int;
  repetidas int;
begin
  update public.bot_tareas
     set status = 'caducada', closed_at = now(), updated_at = now(), vuelve_at = null
   where status in ('abierta', 'aplazada') and caduca_at < now();
  get diagnostics caducadas = row_count;
  delete from public.bot_tareas
   where status in ('hecha', 'descartada', 'caducada')
     and coalesce(closed_at, updated_at) < now() - interval '7 days';
  get diagnostics borradas = row_count;
  delete from public.bot_idempotencia where created_at < now() - interval '7 days';
  get diagnostics repetidas = row_count;
  return jsonb_build_object('ok', true, 'caducadas', caducadas, 'borradas', borradas, 'idempotencia', repetidas);
end;
$$;

revoke all on function public.bot_tareas_purgar() from public, anon, authenticated;
