-- ═══ Cimientos del bot: que el chat y la app no se pisen ═══════════════════
--
-- HoMenu va a vivir también en Telegram (y luego en WhatsApp). El bot vive en
-- el servidor y solo ve la copia de la nube; la app, en cambio, trabaja sobre
-- su copia local y SUBE LA CASA ENTERA cada vez que cambias algo (App.jsx,
-- empuje con debounce de household_state) sin volver a mirar la nube. Si el
-- bot cambia la cena del martes y luego la app abierta sube su copia, el
-- cambio del bot desaparece sin un solo error. Ver specs/plan-bot-mensajeria.md.
--
-- ── La regla ───────────────────────────────────────────────────────────────
--
-- Un contador por casa, `bot_rev`, que SOLO sube cuando escribe el bot. La app
-- recuerda el que vio al cargar y manda sus escrituras condicionadas a él: si
-- el bot ha escrito entretanto, la escritura se rechaza y la app recarga la
-- nube en vez de pisarla.
--
-- Por qué un contador solo del bot y no una versión de cualquier escritura: la
-- app hace dos escrituras independientes por cada cambio (la casa y la semana,
-- cada una con su debounce). Con una versión que subiera con todo, la segunda
-- chocaría con la primera de la misma app y la haríamos recargar por nada.
-- Entre dos dispositivos de la app el comportamiento no cambia (el último
-- gana, como hoy); esto solo protege lo que escribe el bot.

-- ── 1. El contador ──────────────────────────────────────────────────────────
alter table public.household_state
  add column if not exists bot_rev bigint not null default 0;

comment on column public.household_state.bot_rev is
  'Sube solo cuando escribe el bot (bot_save_casa). La app condiciona sus escrituras a este valor (0057).';

-- ── 2. La app guarda la casa ────────────────────────────────────────────────
-- SECURITY INVOKER: las políticas de siempre deciden quién escribe (solo el
-- dueño). `p_bot_rev` nulo = cliente antiguo sin la regla: escribe como antes.
create or replace function public.save_household_state(p_household_id uuid, p_state jsonb, p_bot_rev bigint)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_rev bigint;
begin
  update household_state
     set state = p_state, updated_at = now()
   where household_id = p_household_id
     and bot_rev = coalesce(p_bot_rev, bot_rev)
  returning bot_rev into v_rev;
  if found then
    return jsonb_build_object('ok', true, 'bot_rev', v_rev);
  end if;

  select bot_rev into v_rev from household_state where household_id = p_household_id;
  if found then
    return jsonb_build_object('ok', false, 'bot_rev', v_rev);
  end if;

  insert into household_state (household_id, state, updated_at)
  values (p_household_id, p_state, now());
  return jsonb_build_object('ok', true, 'bot_rev', 0);
end;
$$;

revoke execute on function public.save_household_state(uuid, jsonb, bigint) from public, anon;
grant execute on function public.save_household_state(uuid, jsonb, bigint) to authenticated;

-- ── 3. La app guarda una semana ─────────────────────────────────────────────
-- Misma regla para user_menu_weeks, que es lo que la app lee al cargar el menú
-- activo. El `for share` sobre la fila de la casa hace que la comprobación y la
-- escritura no se crucen con una escritura del bot a medias.
create or replace function public.save_menu_week(p_row jsonb, p_bot_rev bigint)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_hh uuid := nullif(p_row->>'household_id', '')::uuid;
  v_rev bigint;
begin
  if v_hh is not null and p_bot_rev is not null then
    select bot_rev into v_rev from household_state where household_id = v_hh for share;
    if found and v_rev <> p_bot_rev then
      return jsonb_build_object('ok', false, 'bot_rev', v_rev);
    end if;
  end if;

  insert into user_menu_weeks (
    user_id, household_id, menu_id, week_start, week_end, week_offset,
    start_day_idx, active_days, plan, shopping, schedule
  ) values (
    (p_row->>'user_id')::uuid,
    v_hh,
    p_row->>'menu_id',
    (p_row->>'week_start')::date,
    (p_row->>'week_end')::date,
    (p_row->>'week_offset')::smallint,
    coalesce((p_row->>'start_day_idx')::smallint, 0),
    case when jsonb_typeof(p_row->'active_days') = 'array'
         then array(select jsonb_array_elements_text(p_row->'active_days')) end,
    coalesce(p_row->'plan', '{}'::jsonb),
    coalesce(p_row->'shopping', '{"items": []}'::jsonb),
    coalesce(p_row->'schedule', '{}'::jsonb)
  )
  on conflict (user_id, menu_id, week_start) do update set
    household_id  = excluded.household_id,
    week_end      = excluded.week_end,
    week_offset   = excluded.week_offset,
    start_day_idx = excluded.start_day_idx,
    active_days   = excluded.active_days,
    plan          = excluded.plan,
    shopping      = excluded.shopping,
    schedule      = excluded.schedule;

  return jsonb_build_object('ok', true, 'bot_rev', coalesce(v_rev, p_bot_rev));
end;
$$;

revoke execute on function public.save_menu_week(jsonb, bigint) from public, anon;
grant execute on function public.save_menu_week(jsonb, bigint) to authenticated;

-- ── 4. El bot guarda la casa ────────────────────────────────────────────────
-- Una sola transacción: comprueba la versión que el bot leyó, escribe la casa
-- y/o la semana, y sube el contador. Solo la llama el servidor (service_role).
create or replace function public.bot_save_casa(
  p_household_id uuid,
  p_base_rev bigint,
  p_state jsonb,
  p_week jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rev bigint;
begin
  select bot_rev into v_rev from household_state where household_id = p_household_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'sin casa en la nube');
  end if;
  if v_rev <> p_base_rev then
    return jsonb_build_object('ok', false, 'bot_rev', v_rev);
  end if;

  update household_state
     set state = coalesce(p_state, state),
         bot_rev = bot_rev + 1,
         updated_at = now()
   where household_id = p_household_id
  returning bot_rev into v_rev;

  if p_week is not null then
    update user_menu_weeks
       set plan = coalesce(p_week->'plan', plan),
           shopping = coalesce(p_week->'shopping', shopping)
     where household_id = p_household_id
       and menu_id = p_week->>'menu_id'
       and week_start = (p_week->>'week_start')::date;
  end if;

  return jsonb_build_object('ok', true, 'bot_rev', v_rev);
end;
$$;

revoke execute on function public.bot_save_casa(uuid, bigint, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.bot_save_casa(uuid, bigint, jsonb, jsonb) to service_role;

-- ── 5. Las tablas del bot ───────────────────────────────────────────────────
-- Todas con RLS y SIN políticas: solo el servidor (service_role) las toca.

-- Quién es quién: una cuenta de Telegram/WhatsApp → un usuario de la app.
create table if not exists public.bot_identities (
  channel      text not null check (channel in ('telegram', 'whatsapp')),
  external_id  text not null,
  user_id      uuid not null references auth.users(id) on delete cascade,
  display_name text,
  created_at   timestamptz not null default now(),
  primary key (channel, external_id)
);

-- Qué chat (privado o grupo) está enlazado a qué casa.
create table if not exists public.bot_chats (
  channel      text not null check (channel in ('telegram', 'whatsapp')),
  chat_id      text not null,
  household_id uuid not null references public.households(id) on delete cascade,
  kind         text not null check (kind in ('private', 'group')),
  linked_by    uuid references auth.users(id) on delete set null,
  lang         text,
  created_at   timestamptz not null default now(),
  primary key (channel, chat_id)
);
create index if not exists bot_chats_household on public.bot_chats (household_id);

-- Códigos de un solo uso para enlazar desde la app («Conectar Telegram»).
create table if not exists public.bot_link_tokens (
  token        text primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  expires_at   timestamptz not null,
  used_at      timestamptz,
  created_at   timestamptz not null default now()
);

-- Historial corto para dar contexto al agente. Se borra a los pocos días: lo
-- que importa se guarda en la casa, no en la charla.
create table if not exists public.bot_messages (
  id           bigserial primary key,
  channel      text not null,
  chat_id      text not null,
  household_id uuid references public.households(id) on delete cascade,
  role         text not null check (role in ('user', 'assistant')),
  author_id    text,
  content      jsonb not null,
  created_at   timestamptz not null default now()
);
create index if not exists bot_messages_chat on public.bot_messages (channel, chat_id, created_at desc);

-- Recordatorios que el usuario ha aceptado.
create table if not exists public.bot_reminders (
  id           uuid primary key default gen_random_uuid(),
  channel      text not null,
  chat_id      text not null,
  household_id uuid references public.households(id) on delete cascade,
  text         text not null,
  due_at       timestamptz not null,
  status       text not null default 'pending' check (status in ('pending', 'sent', 'cancelled')),
  created_by   text,
  created_at   timestamptz not null default now(),
  sent_at      timestamptz
);
create index if not exists bot_reminders_due on public.bot_reminders (status, due_at);

-- Uso por casa y mes: el límite gratis y el coste real.
create table if not exists public.bot_usage (
  household_id      uuid not null references public.households(id) on delete cascade,
  month             date not null,
  messages          integer not null default 0,
  input_tokens      bigint not null default 0,
  output_tokens     bigint not null default 0,
  cache_read_tokens bigint not null default 0,
  primary key (household_id, month)
);

alter table public.bot_identities  enable row level security;
alter table public.bot_chats       enable row level security;
alter table public.bot_link_tokens enable row level security;
alter table public.bot_messages    enable row level security;
alter table public.bot_reminders   enable row level security;
alter table public.bot_usage       enable row level security;
