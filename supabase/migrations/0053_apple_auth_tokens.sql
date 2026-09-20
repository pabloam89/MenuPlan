-- ═══ El token que Apple obliga a revocar al borrar la cuenta ═══════════════
--
-- Desde que la app ofrece "Iniciar sesión con Apple", borrar la cuenta ya no
-- es solo borrar la fila de auth.users: Apple exige además revocar el token
-- que emitió, llamando a su endpoint /auth/revoke. Sin esa llamada la cuenta
-- desaparece de nuestro lado pero sigue viva del suyo, y eso es motivo de
-- rechazo en App Review con la misma guía que obliga al borrado (5.1.1(v)).
--
-- ── Por qué hace falta una tabla y no vale con lo que ya guarda Supabase ───
-- Supabase NO persiste los tokens del proveedor: los entrega dentro de la
-- sesión en el instante del login (`provider_refresh_token`) y ahí se acaban.
-- El día que el usuario pulse "Borrar cuenta" no habrá ninguna sesión de Apple
-- a mano de la que sacarlo, así que hay que copiarlo cuando pasa por delante.
-- Lo copia el cliente en cada SIGNED_IN (`src/lib/appleTokens.js`).
--
-- ── Por qué nadie puede LEER esta tabla ────────────────────────────────────
-- Hay políticas de insert y update, y deliberadamente ninguna de select: un
-- refresh token de Apple es una credencial, y desde el navegador solo hace
-- falta escribirla. Quien la lee es api/delete-account.js con la service-role
-- key, que se salta RLS por definición. Si algún día hiciera falta leerla
-- desde el cliente, la respuesta correcta es otro endpoint de servidor, no una
-- política de select aquí.
--
-- ── Por qué no se sobrescribe con vacío ────────────────────────────────────
-- Apple solo manda refresh token en la PRIMERA autorización; en los logins
-- siguientes llega vacío. El guard está en el cliente (no se llama al upsert
-- sin token), y el NOT NULL de abajo es la segunda barrera: un intento de
-- guardar nada falla en vez de dejarnos sin credencial que revocar.

create table if not exists public.apple_auth_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  refresh_token text not null,
  updated_at timestamptz not null default now()
);

alter table public.apple_auth_tokens enable row level security;

create policy "Owner stores own apple token"
  on public.apple_auth_tokens for insert
  with check ((select auth.uid()) = user_id);

create policy "Owner refreshes own apple token"
  on public.apple_auth_tokens for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
