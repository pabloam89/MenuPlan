# Dominio: Autenticación e identidad

## 1. Contrato funcional

**Qué hace.** Gestiona la sesión del usuario (Google OAuth vía Supabase Auth), el modo "sin cuenta" (anónimo, 100% local), el perfil analítico (`user_profiles`), y el borrado completo de cuenta.

**Modos de operación — invariante central**: la app funciona completa sin sesión. `handleGenerateMenu` (`src/App.jsx:2144`) no comprueba `user` antes de generar un menú. Esto no es un detalle menor: condiciona todo el diseño de los endpoints de IA (ver `menu-generation.md`, `api/_guard.js`), que deben aceptar tráfico sin autenticar.

| Función | Input | Output | Efecto |
|---|---|---|---|
| `signInWithGoogle()` (`src/lib/useAuth.js:47`) | — | `{ error }` | Redirige a Google OAuth (`redirectTo: window.location.origin`) |
| `signOut()` (`useAuth.js:69`) | — | `{ error }` | Cierra sesión Supabase; el estado local (localStorage) **no se borra** |
| `doDeleteAccount` (`src/App.jsx`, wired a `handleDeleteAccount`) | — | — | Llama a `POST /api/delete-account` con el JWT del usuario, luego limpia estado local y hace `signOut()` |
| `upsertUserProfile(user, extra)` (`src/lib/analytics.js:8`) | objeto `user` de Supabase Auth | — | Upsert en `user_profiles`, solo una vez por `user.id` por carga de página (`lastUpsertedUserId`, `useAuth.js:12`) |
| `trackEvent(user, event, screen, metadata)` (`analytics.js`) | — | — | Encola evento; vacía cada 5s o cada 10 eventos, o vía `pagehide`/`visibilitychange` con `fetch(..., keepalive:true)` |

**Invariante de auth no soportada**: **no existe flujo de email/contraseña en el código** (`grep signInWithPassword|auth.signUp` → 0 resultados en `src/`). Solo Google OAuth y modo anónimo. Ver Deuda técnica — la política de privacidad publicada (`public/privacidad.html`) menciona "email/contraseña" como método de login, lo cual es falso hoy.

**Borrado de cuenta** (`api/delete-account.js`):
1. Recibe `Authorization: Bearer <access_token>` del cliente.
2. `GET {SUPABASE_URL}/auth/v1/user` con ese token + la service-role key como `apikey`, para resolver el `userId` real — **nunca se confía en un id enviado por el cliente**.
3. `DELETE {SUPABASE_URL}/auth/v1/admin/users/{userId}` con la service-role key.
4. El borrado de `auth.users` dispara `ON DELETE CASCADE` en todas las FK de tablas de usuario (ver Modelo de datos) — no hay lógica de aplicación que borre fila a fila.
5. Timeout duro de 8000ms (`FETCH_TIMEOUT_MS`) para no exceder el límite de 10s de las funciones Vercel Hobby.

**Invariante crítica que ya falló una vez en producción**: el borrado depende por completo de que las FK a `auth.users(id)` tengan `ON DELETE CASCADE`/`SET NULL` correctamente. El 2026-08-15 se detectó que `user_profiles`, `user_events` y `app_feedback` tenían `NO ACTION` en producción pese a que la migración original especificaba `CASCADE` — deriva entre migración y base real, corregida con una migración ad-hoc. **Esto significa que el código fuente NO es la fuente de verdad fiable del estado real de constraints en producción** — hay que verificar contra la base viva.

## 2. Modelo de datos

### `user_profiles` (ver `supabase/migrations/0003_user_data.sql`, extendida sin migración registrada — ver más abajo)
| Campo | Origen de la restricción |
|---|---|
| `user_id` (PK, FK → `auth.users(id)` ON DELETE CASCADE) | DB |
| `email`, `display_name`, `avatar_url` | Sin constraint DB; vienen tal cual de `user.email`/`user_metadata` (código, `analytics.js:10-15`) |
| `login_count` | Incrementado por el trigger `handle_profile_upsert()` (DB, `BEFORE UPDATE`) — no por código de aplicación |
| `active_household_id` (FK → `households.id` ON DELETE SET NULL) | DB — **columna sin ninguna migración en el repo** (ver Deuda técnica) |
| `pending_invite_token` | DB, sin migración en repo |

RLS: `select own`/`insert own`/`update own`, todas `auth.uid() = user_id` (envueltas en `(select auth.uid())` desde `0011_rls_wrap_auth_uid.sql`, optimización de InitPlan, no cambio semántico).

### `user_events` / `app_feedback`
Analítica de eventos y feedback. `user_id` nullable con `ON DELETE SET NULL` en `app_feedback` (deliberado: el feedback se anonimiza, no se borra, al borrar la cuenta) y `ON DELETE CASCADE` en `user_events`. RLS: cada usuario solo lee/inserta sus propias filas.

### Sistema de hogares compartidos — **existe en la base, tiene datos reales, y el cliente sigue sin llamarlo** [CORREGIDO 2026-08-22 tras la auditoría de seguridad — ver AUDIT-REPORT.md]

**Corrección sobre la primera versión de esta sección**: se afirmaba que el sistema estaba inerte porque `household_id` era siempre `NULL`. Verificado de nuevo en vivo el 2026-08-22: **existen 6 households reales** (`setup_status='invite_ready'`, creados entre el 19 y el 22 de agosto por 6 `owner_user_id` distintos), con `household_id` ya poblado en filas reales de `user_pantry`/`user_menus`/`user_menu_weeks`. El cliente (verificado también en `origin/main` al día, commit `b2b2579`, 2026-08-21) **sigue sin llamar a `ensure_user_household`/`join_household_by_token`/ninguna función del sistema de hogares** — ni el checkout local ni el remoto más reciente lo hacen. Conclusión: estos 6 households se crearon por una vía distinta a la app (llamada directa a la API REST/RPC de Supabase, no localizable en `src/`) — **origen no determinado, [AMBIGUO]: preguntar quién/qué los creó** antes de asumir que es tráfico de un atacante o de pruebas propias del equipo.

La base de producción contiene un subsistema completo de "households" (hogares compartidos, invitación por token, roles owner/viewer) que **no aparece en ninguna migración del repositorio** (`grep -rl household supabase/migrations/` solo encuentra menciones parciales en `0003_user_data.sql`/`0004_recipe_favorites.sql`, no las tablas reales) y **al que ningún fichero de `src/` hace referencia** (`grep -rn "\.rpc(" src/` solo encuentra una llamada, ver abajo; `grep -rn "from(\"household" src/` → 0 resultados).

Tablas: `households`, `household_members`, `household_favorites`, `household_recipe_discards`, `household_state`. Columnas `household_id` añadidas (nullable) a `user_pantry`, `user_menus`, `user_menu_weeks`, `user_menu_recipes`.

Funciones RPC `SECURITY DEFINER` completas y bien guardadas (14 en total): `ensure_user_household`, `join_household_by_token`, `leave_household`, `remove_household_member`, `set_active_household`, `update_household`, `delete_household`, `list_household_members`, `preview_household_invite`, `gen_invite_token`, `count_viewer_memberships` (límite de 2 viewers por owner), `is_household_member`, `is_household_owner`, `activate_household_menu`. Ciclo de vida `household_setup_status`: `dormant → invite_ready → active`.

**Único punto de contacto real con el cliente**: `activate_user_menu(p_menu_id)` es una función wrapper que llama a `activate_household_menu`, y **sí se invoca desde el cliente** (`src/lib/menusSync.js:242`, vía `supabase.rpc("activate_user_menu", ...)`). Pero como ningún usuario real tiene `household_id` asignado (nadie ha pasado nunca por `ensure_user_household`), esa llamada siempre cae en la rama de compatibilidad "legacy user-scoped menus" dentro de `activate_household_menu` — el 99% de la lógica de esa función (todo lo relativo a `household_id`) es código muerto en la práctica actual, aunque no en el código.

Las RLS de `user_pantry`, `user_menus`, `user_menu_weeks`, `user_menu_recipes` SÍ incluyen políticas `is_household_owner`/`is_household_member` activas (ver `menu-generation.md` y `shopping-list.md`), pero como `household_id` es siempre `NULL` en todas las filas reales, esas políticas nunca conceden ni deniegan nada distinto de las políticas `user_id = auth.uid()` que ya existían.

**Esto ya no es solo deuda técnica — es una vulnerabilidad activa con datos reales, ver AUDIT-REPORT.md**: la política RLS `Users insert self as viewer` de `household_members` no comprueba invitación (`invite_token` consumido) ni el límite de 2 viewers declarado por producto — ambas reglas viven únicamente dentro de la función `join_household_by_token`, nunca como constraint de base de datos. Cualquier usuario autenticado que conozca (o adivine) un `household_id` ajeno puede insertarse a sí mismo como `viewer` vía la API REST directa, sin pasar por ningún token, y desde ahí leer `user_pantry`/`user_menus`/`user_menu_weeks`/`user_menu_recipes` del dueño de ese hogar. Con 6 households reales ya existentes, esto no es un riesgo teórico.

## 3. Dependencias externas

| Servicio | Uso | Fallo → comportamiento |
|---|---|---|
| Supabase Auth (Google OAuth) | `signInWithOAuth` | Si `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` faltan, `supabase` es `null` (`src/lib/supabase.js:12`) y `signInWithGoogle` devuelve un error legible sin lanzar excepción — la app sigue operable en modo anónimo |
| Supabase REST (`/auth/v1/user`, `/auth/v1/admin/users/{id}`) | `api/delete-account.js` | Timeout a los 8s (`AbortController`); cualquier fallo devuelve 401/500 con mensaje genérico en español, nunca cuelga la función más allá del timeout |
| `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_SECRET_KEY` (dos nombres posibles, según si la integración Vercel↔Supabase o una var manual las provisionó) | Solo servidor, solo `api/delete-account.js` | Si falta, 500 "Servidor mal configurado" antes de tocar nada |

## 4. Puntos de acoplamiento

- **`api/_guard.js`** (rate limiting + comprobación de origen) es compartido por `api/generate.js`, `api/generate-dish-photo.js`, `api/recipe-steps.js` — no es específico de auth, pero existe *porque* estos endpoints deben aceptar tráfico sin sesión (ver invariante central arriba). Un cambio en `_guard.js` afecta a los tres dominios de IA simultáneamente.
- **`useAuth()` → `App.jsx`**: `user`/`session` se pasan como props a casi todas las pantallas (`Menu.jsx`, `Shopping.jsx`, `Pantry.jsx`, `HomeProfileScreen.jsx`...). Un cambio en la forma del objeto `session` de Supabase Auth JS rompe silenciosamente cualquier pantalla que lea `session.access_token` (usado en `App.jsx` para `doDeleteAccount`).
- **`analytics.js` → `user_profiles`/`user_events`**: si el esquema de estas tablas cambia, `upsertUserProfile`/`trackEvent` fallan con `console.warn` (no lanzan, no bloquean la UI) — un fallo aquí es silencioso e invisible para el usuario y para quien no mire los logs de Vercel.
- **Household RLS**: cualquier futura feature que quiera activar el sistema de hogares heredaría automáticamente las políticas RLS ya escritas — el trabajo de base de datos está hecho; el acoplamiento pendiente es únicamente cliente↔RPC.

## 5. Deuda técnica visible

1. **Deriva migración↔producción ya materializada una vez** (FK CASCADE de `user_profiles`/`user_events`/`app_feedback`, corregida 2026-08-15) y **actualmente activa de nuevo**: las tablas y funciones del sistema de hogares no tienen ningún fichero de migración en el repo. Si alguien reconstruyera la base desde `supabase/migrations/` hoy, el sistema de hogares no existiría.
2. **Política de privacidad inexacta**: `public/privacidad.html` promete login por "email/contraseña", que no existe en el código.
3. **Feature completa sin usar**: sistema de hogares compartidos — coste de mantenimiento (14 funciones RPC, 8 políticas RLS extra) sin ningún beneficio de producto materializado.
4. **Doble nombre de variable de entorno** para la clave de servicio (`SUPABASE_SERVICE_ROLE_KEY` vs `SUPABASE_SECRET_KEY`) por la coexistencia de una integración Vercel↔Supabase nativa y variables manuales — riesgo de que alguien la borre pensando que es redundante.
5. **`signOut()` no limpia el estado local** (`storage.js` `menuplan.state.v1` persiste) — cerrar sesión dentro del mismo dispositivo no resetea el menú/familia visibles, aunque sí deja de sincronizar con la cuenta. [AMBIGUO: no está claro si esto es intencionado (mantener utilidad en modo anónimo tras cerrar sesión) o un descuido — el flujo de *borrado* de cuenta sí limpia el estado (`clearState()` en `doDeleteAccount`), lo que sugiere que el de *cierre* de sesión debería comportarse igual pero no lo hace.]
