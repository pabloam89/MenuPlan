-- Personas y grupos a tablas (paso 1 de 2).
--
-- Hoy los comensales viven en household_state.state.data.members (JSON que se
-- reemplaza entero) y los grupos en data.groups. Esta migración crea las tablas
-- y NO cambia lo que leen el bot ni la app: se rellenan desde el JSON con
-- scripts/backfill-personas.mjs. El paso 2 (leer de aquí) va en otra PR.
--
-- Decisiones:
--   · El id de la persona sigue siendo el texto que ya usan reglas, horario,
--     plan y cole. Así no hay que reescribir nada al migrar.
--   · La clave primaria es (household_id, id): es también el UNIQUE que
--     necesitan las FK compuestas de bot_tareas (migración posterior).
--   · Lo que no tiene columna propia se guarda en `resto` (jsonb), para no
--     perder datos mientras los consumidores migran.
--   · Solo accede el servidor (service role). Igual que las tablas bot_*:
--     RLS activada y sin políticas.

create table if not exists public.persona (
  household_id       uuid not null references public.households(id) on delete cascade,
  id                 text not null,
  nombre             text not null,
  edad               integer check (edad is null or edad between 0 and 120),
  rol_hogar          text,
  alergias_revisadas boolean not null default false,
  peso_kg            numeric check (peso_kg is null or peso_kg between 2 and 300),
  altura_cm          numeric check (altura_cm is null or altura_cm between 40 and 230),
  usa_fecha_nacimiento boolean not null default false,
  fecha_nacimiento   date,
  detalle_etapa      text,
  no_es_bebe         boolean not null default false,
  clave_perfil       text,
  clave_avatar       text,
  color              text,
  resto              jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  primary key (household_id, id)
);

create table if not exists public.persona_alergia (
  household_id uuid not null,
  persona_id   text not null,
  alergeno     text not null,
  primary key (household_id, persona_id, alergeno),
  foreign key (household_id, persona_id) references public.persona(household_id, id) on delete cascade
);

-- Perfiles de salud (glucemico, corazon, bajo_sodio, reflux, anemia…): solo muestran
-- insignias y orientan al planificador. No son exclusiones duras (eso son alergias,
-- intolerancias y estados). Texto libre a propósito: hay valores antiguos que no están
-- en la lista actual.
create table if not exists public.persona_perfil_salud (
  household_id uuid not null,
  persona_id   text not null,
  perfil       text not null,
  primary key (household_id, persona_id, perfil),
  foreign key (household_id, persona_id) references public.persona(household_id, id) on delete cascade
);

create table if not exists public.persona_intolerancia (
  household_id uuid not null,
  persona_id   text not null,
  valor        text not null,
  primary key (household_id, persona_id, valor),
  foreign key (household_id, persona_id) references public.persona(household_id, id) on delete cascade
);

create table if not exists public.persona_estado (
  household_id uuid not null,
  persona_id   text not null,
  estado       text not null,
  hasta        date,
  primary key (household_id, persona_id, estado),
  foreign key (household_id, persona_id) references public.persona(household_id, id) on delete cascade
);

create table if not exists public.grupo (
  household_id uuid not null references public.households(id) on delete cascade,
  id           text not null,
  nombre       text not null,
  color        text,
  orden        integer not null default 0,
  primary key (household_id, id)
);

create table if not exists public.grupo_persona (
  household_id uuid not null,
  grupo_id     text not null,
  persona_id   text not null,
  primary key (household_id, grupo_id, persona_id),
  foreign key (household_id, grupo_id) references public.grupo(household_id, id) on delete cascade,
  foreign key (household_id, persona_id) references public.persona(household_id, id) on delete cascade
);

create index if not exists persona_por_casa on public.persona (household_id);
create index if not exists grupo_persona_por_persona on public.grupo_persona (household_id, persona_id);

alter table public.persona enable row level security;
alter table public.persona_alergia enable row level security;
alter table public.persona_intolerancia enable row level security;
alter table public.persona_estado enable row level security;
alter table public.persona_perfil_salud enable row level security;
alter table public.grupo enable row level security;
alter table public.grupo_persona enable row level security;

revoke all on public.persona, public.persona_alergia, public.persona_intolerancia,
  public.persona_estado, public.persona_perfil_salud, public.grupo, public.grupo_persona from anon, authenticated;

-- Copia completa de una casa: borra lo que hubiera y vuelve a insertar, todo en
-- una transacción (una llamada a una función = una transacción). Recibe las
-- filas que calcula src/lib/personasTabla.js (filasDeCasa). Idempotente.
create or replace function public.persona_reemplazar_casa(p_household uuid, p_filas jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.grupo_persona where household_id = p_household;
  delete from public.grupo where household_id = p_household;
  delete from public.persona_perfil_salud where household_id = p_household;
  delete from public.persona_estado where household_id = p_household;
  delete from public.persona_intolerancia where household_id = p_household;
  delete from public.persona_alergia where household_id = p_household;
  delete from public.persona where household_id = p_household;

  insert into public.persona (household_id, id, nombre, edad, rol_hogar, alergias_revisadas, peso_kg, altura_cm,
    usa_fecha_nacimiento, fecha_nacimiento, detalle_etapa, no_es_bebe, clave_perfil, clave_avatar, color, resto)
  select p_household, x->>'id', x->>'nombre', (x->>'edad')::int, x->>'rol_hogar',
         (x->>'alergias_revisadas')::boolean, (x->>'peso_kg')::numeric, (x->>'altura_cm')::numeric,
         (x->>'usa_fecha_nacimiento')::boolean, (x->>'fecha_nacimiento')::date, x->>'detalle_etapa',
         (x->>'no_es_bebe')::boolean, x->>'clave_perfil', x->>'clave_avatar', x->>'color', coalesce(x->'resto', '{}'::jsonb)
    from jsonb_array_elements(coalesce(p_filas->'personas', '[]'::jsonb)) x;

  insert into public.persona_alergia (household_id, persona_id, alergeno)
  select p_household, x->>'persona_id', x->>'alergeno'
    from jsonb_array_elements(coalesce(p_filas->'alergias', '[]'::jsonb)) x;

  insert into public.persona_perfil_salud (household_id, persona_id, perfil)
  select p_household, x->>'persona_id', x->>'perfil'
    from jsonb_array_elements(coalesce(p_filas->'perfilesSalud', '[]'::jsonb)) x;

  insert into public.persona_intolerancia (household_id, persona_id, valor)
  select p_household, x->>'persona_id', x->>'valor'
    from jsonb_array_elements(coalesce(p_filas->'intolerancias', '[]'::jsonb)) x;

  insert into public.persona_estado (household_id, persona_id, estado, hasta)
  select p_household, x->>'persona_id', x->>'estado', (x->>'hasta')::date
    from jsonb_array_elements(coalesce(p_filas->'estados', '[]'::jsonb)) x;

  insert into public.grupo (household_id, id, nombre, color, orden)
  select p_household, x->>'id', x->>'nombre', x->>'color', (x->>'orden')::int
    from jsonb_array_elements(coalesce(p_filas->'grupos', '[]'::jsonb)) x;

  insert into public.grupo_persona (household_id, grupo_id, persona_id)
  select p_household, x->>'grupo_id', x->>'persona_id'
    from jsonb_array_elements(coalesce(p_filas->'grupoPersona', '[]'::jsonb)) x;

  return jsonb_build_object(
    'personas', jsonb_array_length(coalesce(p_filas->'personas', '[]'::jsonb)),
    'grupos', jsonb_array_length(coalesce(p_filas->'grupos', '[]'::jsonb))
  );
end;
$$;

revoke all on function public.persona_reemplazar_casa(uuid, jsonb) from public, anon, authenticated;
