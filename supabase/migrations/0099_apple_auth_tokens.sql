-- ═══ El token que Apple obliga a revocar al borrar la cuenta ═══════════════
-- AUDITADA: auditor-datos 2026-10-20 OK
--
-- Desde que la app ofrece "Iniciar sesión con Apple", borrar la cuenta ya no
-- es solo borrar la fila de auth.users: Apple exige además revocar el token
-- que emitió, llamando a su endpoint /auth/revoke. Sin esa llamada la cuenta
-- desaparece de nuestro lado pero sigue viva del suyo, y eso es motivo de
-- rechazo en App Review con la misma guía que obliga al borrado (5.1.1(v)).
--
-- CONTRAE: apple_auth_tokens.updated_at, la trae la tabla viva (0053 a mano) y nada la actualizaba ni la leía
--
-- ── Por qué hace falta una tabla y no vale con lo que ya guarda Supabase ───
-- Supabase NO persiste los tokens del proveedor: los entrega dentro de la
-- sesión en el instante del login (`provider_refresh_token`) y ahí se acaban.
-- El día que el usuario pulse "Borrar cuenta" no habrá ninguna sesión de Apple
-- a mano de la que sacarlo, así que hay que copiarlo cuando pasa por delante.
-- Lo copia el cliente en cada SIGNED_IN (`src/lib/appleTokens.js`).
--
-- ── Por qué nadie puede LEER ni tocar esta tabla desde el cliente ──────────
-- Un refresh token de Apple es una credencial: desde el navegador solo hace
-- falta escribirla, y eso lo hace la función guardar_apple_refresh_token (de
-- abajo), no la tabla. La tabla queda con RLS y SIN ninguna política, y sin
-- permisos para anon ni authenticated. Quien la lee es api/delete-account.js
-- con la service-role key, que se salta RLS por definición. Si algún día
-- hiciera falta leerla desde el cliente, la respuesta correcta es otro
-- endpoint de servidor, no una política de select aquí.
--
-- ── Por qué una función y no un upsert del cliente ─────────────────────────
-- La versión anterior daba al dueño una política de insert y otra de update y
-- guardaba con `upsert … onConflict`. Pero un `insert … on conflict do update`
-- que cae en la rama de update lee la fila existente, y para leerla Postgres
-- exige además una política de select (docs de CREATE POLICY: «INSERT … ON
-- CONFLICT DO UPDATE» aplica también las de SELECT a la fila existente; Supabase
-- lo repite para upsert). Esa política no existe, a propósito. Un update suelto
-- con `where user_id = …` tiene el mismo problema (el where lee la fila). Sin
-- ensayo posible desde una sesión, se eligió la forma que no depende de ello:
-- una función security definer que solo escribe la fila de auth.uid(), con
-- search_path fijo y execute solo para authenticated (PRINCIPIOS §8). Corre
-- como dueño de la tabla, así que ni insert ni update necesitan política.
--
-- ── Por qué no se sobrescribe con vacío ────────────────────────────────────
-- Apple solo manda refresh token en la PRIMERA autorización; en los logins
-- siguientes llega vacío. El guard está en el cliente (no se llama a la
-- función sin token), y la función rechaza un token vacío: un intento de
-- guardar nada falla en vez de dejarnos sin credencial que revocar.
--
-- ── Fechas ─────────────────────────────────────────────────────────────────
-- `updated_at` se quita: la función solo cambia el token, nadie actualiza la
-- fecha (no hay trigger set_updated_at) ni la lee, y PRINCIPIOS §9 dice que una
-- columna que nadie actualiza miente. `created_at` se queda porque §9 la exige
-- en toda tabla (test `created-at`); tampoco tiene lector hoy: excepción
-- declarada a «ningún campo sin lector», la misma que lleva cualquier tabla
-- por la norma de la fecha de alta. En las filas vivas vale la hora de esta
-- migración (el valor viejo de updated_at era el de la alta, pero nadie lo usa).
--
-- ── Tabla viva: ya existe en producción (creada a mano, issue #188) ─────────
-- La 0053 de la rama de iOS la creó con user_id, refresh_token y updated_at (sin
-- created_at). Este fichero la deja igual que una tabla nueva: añade created_at
-- (add column if not exists), quita updated_at (drop column if exists), quita
-- las dos políticas que había y revoca los permisos directos. Toca RLS y
-- permisos de algo que ya existía y borra una columna con datos, así que la
-- aplica Pablo con --pablo. Se puede repetir sin fallar.
--
-- Consultas previas (solo lectura, para el ensayo):
--   select to_regclass('public.apple_auth_tokens');
--   select column_name from information_schema.columns where table_schema = 'public' and table_name = 'apple_auth_tokens';
--   select polname from pg_policy where polrelid = 'public.apple_auth_tokens'::regclass;
--   select count(*) from public.apple_auth_tokens;
--
-- Plan B: src/lib/appleTokens.js ignora el error de la función (el login
-- sigue; mientras la migración no esté aplicada, la función no existe y el
-- token no se guarda); api/delete-account.js sigue borrando la cuenta si no
-- hay token que revocar.
-- Objeto testigo: la función public.guardar_apple_refresh_token(text) y la columna public.apple_auth_tokens.created_at.

set lock_timeout = '5s';

create table if not exists public.apple_auth_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  refresh_token text not null,
  created_at timestamptz not null default now()
);

alter table public.apple_auth_tokens
  add column if not exists created_at timestamptz not null default now();

-- La tabla viva la trae de la 0053; en una base nueva no existe y no pasa nada.
alter table public.apple_auth_tokens
  drop column if exists updated_at;

comment on table public.apple_auth_tokens is
  'Refresh token de Apple de cada usuario, para revocarlo al borrar la cuenta. La escribe solo guardar_apple_refresh_token (0099); solo la lee api/delete-account.js con service role. Sin políticas: el cliente no la toca.';
comment on column public.apple_auth_tokens.created_at is
  'Cuándo se guardó el token por primera vez (fecha de alta de la fila, PRINCIPIOS §9). Sin lector hoy.';

alter table public.apple_auth_tokens enable row level security;

-- Nació como 0053 en la rama de iOS con dos políticas de dueño; con la función
-- ya no hacen falta (y la de update, sin select, nunca pudo funcionar con upsert).
drop policy if exists "Owner stores own apple token" on public.apple_auth_tokens;
drop policy if exists "Owner refreshes own apple token" on public.apple_auth_tokens;
revoke all on table public.apple_auth_tokens from anon, authenticated;

-- ── Guardar el token de quien llama ────────────────────────────────────────

create or replace function public.guardar_apple_refresh_token(p_token text)
 returns void
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
declare
  v_yo uuid := (select auth.uid());
begin
  if v_yo is null then
    raise exception 'guardar_apple_refresh_token: hace falta sesión' using errcode = '42501';
  end if;
  -- Un token vacío no pisa el bueno: Apple solo lo manda en la primera autorización.
  if p_token is null or btrim(p_token) = '' then
    raise exception 'guardar_apple_refresh_token: token vacío' using errcode = '22023';
  end if;
  insert into public.apple_auth_tokens (user_id, refresh_token)
  values (v_yo, p_token)
  on conflict (user_id) do update set refresh_token = excluded.refresh_token;
end;
$function$;

comment on function public.guardar_apple_refresh_token(text) is
  'Guarda (o renueva) el refresh token de Apple de quien llama, sin que el cliente toque la tabla (0099). La llama rememberAppleRefreshToken (src/lib/appleTokens.js). Solo escribe la fila de auth.uid().';

revoke all on function public.guardar_apple_refresh_token(text) from public, anon, authenticated;
grant execute on function public.guardar_apple_refresh_token(text) to authenticated;
