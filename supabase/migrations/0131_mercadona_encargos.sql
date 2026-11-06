-- AUDITADA: auditor-datos 2026-11-06 OK
-- Comprar rellena una lista en la cuenta de Mercadona de la casa: lo pide la app o Lola, y un trabajador con
-- navegador real lo hace por detrás (skill `mercadona`).
--
--   · mercadona_cuenta: la cuenta conectada de cada casa. `sesion_cifrada` llega sellada con la clave pública del
--     trabajador: ni Vercel ni la base pueden abrirla. Es la única copia, y borrarla desconecta la cuenta. Es de quien
--     la conectó: se borra si esa persona borra su usuario o sale de la casa.
--   · mercadona_encargo: cada «Comprar». Uno activo por casa a la vez, para que dos toques no creen dos listas.
--   · tomar_encargo_mercadona: el trabajador coge el más antiguo, de uno en uno, sin pisar a otro trabajador. Uno de
--     más de 15 minutos no lo coge: nadie sigue esperando, y el barrido lo cierra como `caducado`.
--   · El trigger escribe los saltos que valen: pendiente → rellenando → hecho o fallido, y el estado final no cambia.
--     La única excepción, un `hecho` tardío sobre un `caducado`: la lista existe y hay que decir la verdad.
--
-- NO hace: nada de carrito ni de pago, y ninguna contraseña pasa por aquí. Las dos tablas son solo del servidor.
--
-- Plan B (regla migraciones): sin estas tablas, encargar contesta `sin_servicio` y el botón sigue abriendo la lista con
-- la ficha de cada producto, como hasta ahora.
--
-- Lector: api/_bot/mercadonaEncargos.js. Escribe el mismo módulo, y tomar_encargo_mercadona el trabajador.
--
-- Consultas previas:
--   select to_regclass('public.mercadona_encargo');   (debe dar null)
-- Objeto testigo: la tabla public.mercadona_encargo.

set lock_timeout = '5s';

create table public.mercadona_cuenta (
  household_id   uuid primary key references public.households(id) on delete cascade,
  sesion_cifrada text not null,
  estado         text not null default 'conectada'
    constraint mercadona_cuenta_estado_vocabulario check (estado in ('conectada', 'caducada')),
  conectada_por  uuid not null references auth.users(id) on delete cascade,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index mercadona_cuenta_conectada_por_idx on public.mercadona_cuenta (conectada_por);
create trigger mercadona_cuenta_updated_at before update on public.mercadona_cuenta
  for each row execute function public.set_updated_at();

comment on table public.mercadona_cuenta is 'La cuenta de Mercadona conectada por una casa. Solo del servidor.';
comment on column public.mercadona_cuenta.sesion_cifrada is
  'Sellada con la clave pública del trabajador; la privada solo vive en su servidor. Nunca la contraseña.';

create table public.mercadona_encargo (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  created_by   uuid references auth.users(id) on delete set null,
  canal        text not null
    constraint mercadona_encargo_canal_vocabulario check (canal in ('app', 'telegram', 'whatsapp')),
  chat_id      text,
  status       text not null default 'pendiente'
    constraint mercadona_encargo_status_vocabulario check (status in ('pendiente', 'rellenando', 'hecho', 'fallido')),
  lista        jsonb not null check (jsonb_typeof(lista) = 'object'),
  lista_xid    text,
  entraron     integer check (entraron is null or entraron >= 0),
  faltan       jsonb check (faltan is null or jsonb_typeof(faltan) = 'array'),
  fallo        text
    constraint mercadona_encargo_fallo_vocabulario check (
      fallo is null or fallo in ('sin_cuenta', 'sesion_caducada', 'bloqueado', 'lista_no_valida', 'caducado', 'error')
    ),
  created_at   timestamptz not null default now(),
  tomado_at    timestamptz,
  hecho_at     timestamptz,
  fallido_at   timestamptz,
  constraint mercadona_encargo_tomado_con_fecha check (
    (status <> 'pendiente' or tomado_at is null) and (status not in ('rellenando', 'hecho') or tomado_at is not null)
  ),
  constraint mercadona_encargo_hecho_con_fecha check ((status = 'hecho') = (hecho_at is not null)),
  constraint mercadona_encargo_fallido_con_fecha check ((status = 'fallido') = (fallido_at is not null)),
  constraint mercadona_encargo_fallido_con_motivo check ((status = 'fallido') = (fallo is not null)),
  constraint mercadona_encargo_hecho_con_lista check ((status = 'hecho') = (lista_xid is not null))
);
create index mercadona_encargo_casa_idx on public.mercadona_encargo (household_id, created_at desc);
create index mercadona_encargo_cola_idx on public.mercadona_encargo (created_at) where status = 'pendiente';
create index mercadona_encargo_en_marcha_idx on public.mercadona_encargo (tomado_at) where status = 'rellenando';
create index mercadona_encargo_created_by_idx on public.mercadona_encargo (created_by);
create unique index mercadona_encargo_uno_activo on public.mercadona_encargo (household_id)
  where status in ('pendiente', 'rellenando');

comment on table public.mercadona_encargo is 'Cada «Comprar»: rellenar una lista en Mercadona. Solo del servidor.';
comment on column public.mercadona_encargo.lista is
  '{ name, products: [{ merca_code, quantity }] }; la forma la valida erroresDeLista (scripts/lib/mercadonaLista.mjs).';
comment on column public.mercadona_encargo.lista_xid is 'El id de la lista en Mercadona, externo: sin FK.';
comment on column public.mercadona_encargo.chat_id is 'A qué chat avisa Lola al acabar; null si se pidió desde la app.';
comment on column public.mercadona_encargo.faltan is
  'Array de los merca_code que no quedaron en la lista. Con `entraron`, null si no se pudo releer.';

create function public.mercadona_encargo_saltos() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if old.status = 'fallido' and old.fallo = 'caducado' and new.status = 'hecho' then
    return new;
  end if;
  if old.status in ('hecho', 'fallido') then
    raise exception 'mercadona_encargo: % ya es final', old.status;
  end if;
  if new.status <> old.status and not (
    (old.status = 'pendiente' and new.status in ('rellenando', 'fallido'))
    or (old.status = 'rellenando' and new.status in ('hecho', 'fallido'))
  ) then
    raise exception 'mercadona_encargo: de % a % no vale', old.status, new.status;
  end if;
  return new;
end;
$$;
-- Solo sobre las columnas del estado: borrar a quien lo pidió pone created_by a null, y eso no se puede frenar.
create trigger mercadona_encargo_saltos
  before update of status, lista, lista_xid, entraron, faltan, fallo, tomado_at, hecho_at, fallido_at
  on public.mercadona_encargo
  for each row execute function public.mercadona_encargo_saltos();

create function public.tomar_encargo_mercadona() returns setof public.mercadona_encargo
language sql security definer set search_path = public, pg_temp as $$
  update public.mercadona_encargo e
     set status = 'rellenando', tomado_at = now()
   where e.id = (
     select id from public.mercadona_encargo
      where status = 'pendiente' and created_at > now() - interval '15 minutes'
      order by created_at
      limit 1
      for update skip locked
   )
  returning e.*;
$$;

-- Quien sale de la casa se lleva su sesión: los demás no siguen escribiendo en su cuenta de Mercadona.
create function public.mercadona_cuenta_al_salir() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  delete from public.mercadona_cuenta where household_id = old.household_id and conectada_por = old.user_id;
  return old;
end;
$$;
create trigger mercadona_cuenta_al_salir after delete on public.household_members
  for each row execute function public.mercadona_cuenta_al_salir();

alter table public.mercadona_cuenta enable row level security;
alter table public.mercadona_encargo enable row level security;
revoke all on table public.mercadona_cuenta from anon, authenticated;
revoke all on table public.mercadona_encargo from anon, authenticated;
revoke all on function public.tomar_encargo_mercadona() from public, anon, authenticated;
revoke all on function public.mercadona_encargo_saltos() from public, anon, authenticated;
revoke all on function public.mercadona_cuenta_al_salir() from public, anon, authenticated;
grant execute on function public.tomar_encargo_mercadona() to service_role;

-- Autoprueba de los saltos: con una casa cualquiera y en un bloque que se deshace.
do $$
declare
  v_casa uuid;
  v_id uuid;
  v_paso boolean;
begin
  select id into v_casa from public.households limit 1;
  if v_casa is null then
    raise notice 'autoprueba 0131: sin ninguna casa, no se ha probado ninguna fila';
    return;
  end if;
  begin
    insert into public.mercadona_encargo (household_id, canal, lista) values (v_casa, 'app', '{}') returning id into v_id;
    -- Sin pasar por rellenando no se llega a hecho.
    v_paso := false;
    begin
      update public.mercadona_encargo
         set status = 'hecho', tomado_at = now(), hecho_at = now(), lista_xid = '1' where id = v_id;
      v_paso := true;
    exception when raise_exception then null; -- a propósito: el rechazo es lo que se prueba
    end;
    if v_paso then
      raise exception 'autoprueba 0131: de pendiente a hecho entró';
    end if;

    update public.mercadona_encargo set status = 'rellenando', tomado_at = now() where id = v_id;
    update public.mercadona_encargo set status = 'hecho', hecho_at = now(), lista_xid = '1' where id = v_id;
    v_paso := false;
    begin
      update public.mercadona_encargo set lista_xid = '2' where id = v_id;
      v_paso := true;
    exception when raise_exception then null; -- a propósito: el rechazo es lo que se prueba
    end;
    if v_paso then
      raise exception 'autoprueba 0131: un hecho se pudo reescribir';
    end if;
    -- Borrar a quien lo pidió (derecho de la persona) pone created_by a null: eso no puede frenarlo el trigger.
    update public.mercadona_encargo set created_by = null where id = v_id;

    -- Un hecho tardío sobre un caducado sí entra: la lista existe.
    insert into public.mercadona_encargo (household_id, canal, lista) values (v_casa, 'app', '{}') returning id into v_id;
    update public.mercadona_encargo set status = 'fallido', fallo = 'caducado', fallido_at = now() where id = v_id;
    update public.mercadona_encargo
       set status = 'hecho', fallo = null, fallido_at = null, tomado_at = now(), hecho_at = now(), lista_xid = '1'
     where id = v_id;
    raise exception 'autoprueba_0131_deshecha';
  exception when others then -- a propósito: así se deshace el bloque; lo que no sea el centinela se relanza
    if sqlerrm <> 'autoprueba_0131_deshecha' then
      raise;
    end if;
  end;
  raise notice 'autoprueba 0131: los saltos que no valen se rechazan y un estado final no cambia';
end;
$$;
