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

## 6. Entrar en la app desde Lola (6 oct 2026)

Tres fallos al pasar de Telegram a la app, y la regla que dejó cada uno:

1. **Decidir con datos que aún no han llegado** (PR #65). La pantalla de
   inicio elegía entre el alta y «Continuar» antes de que llegara la familia
   de la nube, y repetía el alta. Regla: una pantalla que decide con datos de
   la nube espera a que estén (`nubeLista` en `src/App.jsx`), con un plazo por
   si no llegan.
2. **Copia local sin dueño** (PR #66). Tras `/borrarme`, el navegador seguía
   enseñando la casa borrada como invitado. Regla: lo que se guarda en local
   lleva la marca de su cuenta (`homenu:cuenta`, `src/lib/useAuth.js`); si esa
   cuenta ya no existe, la copia se borra.
3. **Cuenta y chat son cosas distintas.** `bot_identities` dice que un Telegram
   ES una cuenta; `bot_chats`, que un chat está conectado a una casa.
   `/borrarme` borra la cuenta a la que apunta la identidad, que puede ser la
   de Google (de ahí el aviso «es tu cuenta de la app»). La llave `?entrar=`
   solo se da a cuentas nacidas en Telegram.

Flujo vigente: Lola saluda sin preguntas de cuenta, con «Prefiero rellenarlo
en la app» a un toque (código `alta`, migración 0084). El alta en la app acaba
en Inicio sin generar el menú, y Lola lo ofrece en el chat.

## 7. Tu chat con Lola es tu llave (plan, 4 nov 2026, #1238)

Decisión de Pablo (4 nov 2026): quien usa a Lola nunca necesita Google. En la
pantalla de entrada, «Entrar con Telegram» va primero, y Google y Apple debajo;
en Mi perfil, «Formas de entrar» dice con qué entra la cuenta y deja añadir las
demás, por si un día no tiene Telegram a mano. Las cuentas de Google y Apple
siguen igual, y conectar a Lola desde la app también.

Cómo entra Telegram: con el login oficial de Telegram (`oauth.telegram.org`,
el mismo que usa su widget), en la misma pestaña. Telegram vuelve a la app con
`#tgAuthResult=` y los mismos campos firmados que el botón de Lola, así que la
firma la comprueba `verificarLogin` (`api/_bot/loginTelegram.js:27`) y la sesión
la abre `api/bot/entrar.js`, como hoy. Solo funciona en el dominio que el bot
tiene en @BotFather. Comprobado el 4 nov:
`curl -s "https://oauth.telegram.org/embed/homenuers_bot?origin=https%3A%2F%2Fhomenu-staging.vercel.app" | grep -o "TWidgetLogin.init([^,]*, [0-9]*"`
→ `TWidgetLogin.init('widget_login', 8808620013`; con `origin=https%3A%2F%2Fejemplo.com`
la página dice `invalid`.

### Chunks

#### 1. «Entrar con Telegram» primero en la pantalla de entrada
Files: `src/lib/llaveLola.js`, `src/lib/llaveLola.test.js`, `src/lib/cuentaTelegram.js`, `src/lib/cuentaTelegram.test.js`, `src/components/ui.jsx`, `src/components/SignInOptions.test.jsx`, `src/App.jsx`, `api/bot/entrar.js`, `api/bot/entrar.test.js`, `api/bot/telegram.js`
Depends on: none
Blocked by: none
Existing: `git grep -n "tgAuthResult\|oauth.telegram.org" -- src api` → sin salida. Un Telegram sin cuenta que llega con una firma buena recibe un 404 (`api/bot/entrar.js:48`, «Aún no tienes cuenta: escríbele a Lola»). El dominio del login vive solo en el servidor (`api/bot/telegram.js:1244`, `DOMINIO_LOGIN`, con `BOT_LOGIN_DOMINIO` por encima): el trozo lo pasa a una sola constante, `DOMINIO_LOGIN_TELEGRAM` en `src/lib/cuentaTelegram.js`, que leen la app y el bot, y quita la variable.
Not done: la app de iOS (ver «No hecho»). Un Telegram atado a una cuenta de Google sigue sin abrirla (punto 3 de la sección 6; trozo 3). Fuera del dominio del bot (local, previews, y producción mientras @BotFather apunte a staging) el botón no sale, porque allí Telegram lo rechaza. No toca @BotFather ni Supabase.
Done:
```sh
git grep -q "tgAuthResult" -- src/lib/llaveLola.test.js && git grep -q "Entrar con Telegram" -- src/components/SignInOptions.test.jsx && npx vitest run src/lib/llaveLola.test.js src/lib/cuentaTelegram.test.js api/bot/entrar.test.js src/components/SignInOptions.test.jsx
```

#### 2. «Formas de entrar» en Mi perfil, en lugar del botón suelto
Files: `src/lib/cuentaTelegram.js`, `src/lib/cuentaTelegram.test.js`, `src/lib/useAuth.js`, `src/lib/useAuth.google.test.jsx`, `src/lib/apiUrl.js`, `src/components/ui.jsx`, `src/screens/HomeProfileScreen.jsx`, `src/screens/HomeProfileScreen.descargar.test.jsx`, `src/App.jsx`
Depends on: 1
Blocked by: none
Existing: `git grep -n "Formas de entrar\|formasDeEntrar" -- src` → sin salida. Hoy hay un botón suelto, «Entrar también con Google» (`src/screens/HomeProfileScreen.jsx:485`, `ofrecerGoogle` en `src/lib/cuentaTelegram.js:21`).
Not done: Telegram sale en la lista solo en las cuentas nacidas en Telegram, que son las que abre (las demás, trozo 3). Apple, solo donde ya se ofrece hoy (`conApple`, `src/components/ui.jsx:913`). Los avisos al volver de añadir un proveedor no cambian (`AVISOS_AL_VOLVER`).
Done:
```sh
git grep -q "formasDeEntrar" -- src/lib/cuentaTelegram.test.js && git grep -q "Formas de entrar" -- src/screens/HomeProfileScreen.descargar.test.jsx && npx vitest run src/lib/cuentaTelegram.test.js src/screens/HomeProfileScreen.descargar.test.jsx src/lib/useAuth.google.test.jsx
```

#### 3. Telegram abre la cuenta a la que se conectó desde dentro de esa cuenta
Decisión de Pablo (4 nov 2026, «una persona, una cuenta, varias llaves»; responde a la A de «Para Pablo»): «Entrar con
Telegram» abre una cuenta de Google o Apple solo si ese Telegram se conectó a Lola desde dentro de esa cuenta, es decir,
con el enlace de «Conectar Telegram» que sacó una sesión de esa cuenta (`api/bot/link.js`) y que se pulsó en el privado
de ese Telegram (prueba `ajustes`, o `cambio` si antes era de otra cuenta y la persona lo confirmó allí). Un Telegram
atado por el código del email, por un grupo o por una invitación no la abre, y una identidad de antes de este trozo
tampoco: no se sabe con qué prueba se apuntó. Para que la abra, se conecta otra vez desde la app.
Files: `supabase/migrations/0129_prueba_de_identidad.sql`, `src/lib/vocabularios.js`, `scripts/lib/columnasVocabulario.mjs`, `api/_bot/enlace.js`, `api/_bot/enlace.test.js`, `api/_bot/cuentas.js`, `api/_bot/cuentas.test.js`, `api/bot/entrar.js`, `api/bot/entrar.test.js`
Depends on: none
Blocked by: la migración del trozo, que aplica Pablo. Sin ella, nada cambia: no hay prueba que leer y la respuesta sigue siendo el 403 de hoy.
Existing: `git grep -n "prueba_identidad" -- api src supabase` → sin salida: bot_identities no guarda con qué prueba se apuntó (`supabase/migrations/0057_bot_cimientos.sql:173`). La prueba solo vive al escribir, en el parámetro `identidad` de `enlazarChat` (`api/_bot/enlace.js:46`; «Conectar Telegram» la pasa en `api/bot/telegram.js:1893`), y un enlace del mismo Telegram a la misma cuenta reescribe la fila sin mirarla (`api/_bot/enlace.js:158`). `api/bot/entrar.js:66` contesta 403 a todo Telegram que ya es de otra cuenta.
Not done: «Formas de entrar» sigue sin enseñar Telegram en las cuentas de Google que ahora abre (la app no lee las tablas del bot; irá por el GET de `api/bot/link.js`, en otro trozo). WhatsApp. No rellena las identidades que ya existen.
Done:
```sh
git grep -q "la cuenta a la que se conectó desde la app" -- api/bot/entrar.test.js && git grep -q "prueba_identidad" -- api/_bot/enlace.test.js && npx vitest run api/bot/entrar.test.js api/_bot/enlace.test.js api/_bot/cuentas.test.js src/lib/vocabularios.test.js
```

#### 4. Entrar con Google por primera vez pregunta antes: «¿Ya hablas con Lola?»
Una persona, una cuenta: quien ya habla con Lola y entra con Google por primera vez acabaría con dos cuentas (#1254).
Antes de crear la casa de una cuenta nueva de Google o Apple, la app pregunta «¿Ya hablas con Lola?» con dos salidas:
«Entrar con Telegram» (y, ya dentro, «¿Añades este Google a tu cuenta?», con el «Añadir» de «Formas de entrar») o «No,
crear cuenta». Supabase crea el usuario al volver de Google, antes de que la app pueda preguntar; la pregunta va justo
después y, hasta que se contesta, no se escribe nada (ni perfil, ni casa). Si elige Telegram, la cuenta vacía se borra
con el mismo borrado de Mi perfil (`api/delete-account`) y se cierra su sesión.
Files: `src/lib/cuentaTelegram.js`, `src/lib/cuentaTelegram.test.js`, `src/lib/useAuth.js`, `src/lib/useAuth.google.test.jsx`, `src/components/ui.jsx`, `src/components/SignInOptions.test.jsx`, `src/App.jsx`
Depends on: 2
Blocked by: none
Existing: `git grep -n "Ya hablas con Lola" -- src` → sin salida. Toda sesión nueva escribe el perfil al entrar (`src/lib/useAuth.js:108`) y crea la casa en cuanto hay usuario (`src/lib/useHousehold.js:109`).
Not done: el Google que ya es otra cuenta con casa sigue en #1254 (unir dos cuentas). No pregunta a quien entra con Telegram (esa cuenta la crea Lola, `cuentaYChat`).
Done:
```sh
git grep -q "Ya hablas con Lola" -- src/components/SignInOptions.test.jsx && git grep -q "esAltaNueva" -- src/lib/cuentaTelegram.test.js && npx vitest run src/lib/cuentaTelegram.test.js src/components/SignInOptions.test.jsx src/lib/useAuth.google.test.jsx
```

#### 5. Dentro de Telegram, solo «Entrar con Telegram»
Google bloquea su login en los navegadores metidos en otras apps: «All embedded webviews will be blocked starting on
September 30, 2021», con el error `disallowed_useragent`
(https://developers.googleblog.com/en/upcoming-security-changes-to-googles-oauth-20-authorization-endpoint-in-embedded-webviews/).
Dentro del navegador de Telegram, la pantalla de entrada enseña solo «Entrar con Telegram» y, debajo, en pequeño,
«¿Con Google o Apple? Ábrelo en el navegador». Fuera de Telegram, igual que hoy. Cómo se sabe que es Telegram: Telegram
mete en la página `window.TelegramWebviewProxy` (iOS; su propio `telegram-web-app.js` lo mira así:
`curl -s https://telegram.org/js/telegram-web-app.js | grep -n "TelegramWebviewProxy !== undefined"` →
`137:    if (window.TelegramWebviewProxy !== undefined) {`) o `window.TelegramWebview` (Android), y en Android firma el
navegador con `Telegram-Android/{app_version} (…)` (https://core.telegram.org/bots/webapps, «User-Agent details»).
Los tres objetos son los que mira `inapp-spy` (`src/detectTelegram.ts`: `"TelegramWebview" in window || // Android`,
`"TelegramWebviewProxy" in window || // iPhone`, `"TelegramWebviewProxyProto" in window`).
Files: `src/lib/apiUrl.js`, `src/lib/apiUrl.clase.test.js`, `src/components/ui.jsx`, `src/components/SignInOptions.test.jsx`
Depends on: 1
Blocked by: none
Existing: `git grep -n "TelegramWebview" -- src` → sin salida; `disallowed_useragent` solo sale para la app nativa (`src/lib/nativeAuth.js:7`).
Not done: un botón que salte solo al navegador del sistema (en iOS no hay una forma fiable): es una indicación. Otros navegadores dentro de apps (Instagram, WhatsApp) siguen como hoy.
Done:
```sh
git grep -q "TelegramWebviewProxy" -- src/lib/apiUrl.clase.test.js && git grep -q "Ábrelo en el navegador" -- src/components/SignInOptions.test.jsx && npx vitest run src/lib/apiUrl.clase.test.js src/components/SignInOptions.test.jsx
```

### No hecho

- **App de iOS.** La guía 4.8 de Apple pide, con un login de terceros, «also offer as an equivalent option another login
  service» (https://developer.apple.com/app-store/review/guidelines/#login-services). La app nativa ya ofrece Apple
  (`conApple = isNativeApp`, `src/components/ui.jsx:913`), así que la guía no lo impide. Lo impide algo técnico: la app
  nativa se sirve desde `capacitor://localhost` (`src/lib/nativeAuth.js:10`), que no es el dominio del bot, y Telegram
  rechaza el login. Hasta resolverlo, en iOS no sale «Entrar con Telegram».

### Decisions taken

- principio 4 | eligió: el login de Telegram vuelve con la firma y la comprueba `verificarLogin`, el de los botones de Lola | descartó: un segundo verificador para el widget | motivo: decidido
- principio 4 | eligió: un Telegram sin cuenta que entra con firma buena recibe la cuenta que crea Lola (`cuentaYChat`, `api/_bot/altaTelegram.js:21`) | descartó: crearla con otro código, dos maneras de nacer una cuenta | motivo: decidido
- principio 1 | eligió: el botón sale solo donde Telegram acepta el login (el dominio de @BotFather) | descartó: enseñarlo en local y en previews, donde siempre acaba en «Bot domain invalid»: un botón que promete lo que no hace | motivo: decidido
- principio 4 | eligió: el login en la misma pestaña, cuya vuelta lee `llaveLola.js` como la llave de Lola | descartó: la ventana aparte del widget, que devuelve los datos por otro camino (postMessage) y pediría un segundo lector de la firma | motivo: decidido
- principio 4 | eligió: el dominio del bot en una sola constante que leen la app y el bot | descartó: mantener `BOT_LOGIN_DOMINIO` en el servidor, una segunda copia que nadie compara | motivo: decidido
- principio 2 | eligió: la prueba con la que se apuntó un Telegram, en su fila de bot_identities (`prueba_identidad`, lista cerrada) | descartó: deducirla de bot_enlaces, dar por probado lo que no se guardó: que no guarda qué Telegram se enlazó y daría por buena la prueba de otro Telegram de la misma cuenta | motivo: decidido
- principio 3 | eligió: una identidad sin prueba guardada (las de antes, o sin la migración) no abre la cuenta | descartó: suponer `ajustes` para las de antes, abrir sesión sin prueba | motivo: decidido
- principio 4 | eligió: si se elige Telegram, la cuenta vacía recién creada se borra | descartó: dejarla, la misma persona en dos cuentas (una segunda cuenta de la misma persona que además ata ese Google y hace fallar luego «Añadir Google») | motivo: decidido
- principio 6 | eligió: el código del email no abre la cuenta (Pablo, 4 nov 2026: solo «desde dentro de esa cuenta») | descartó: la opción 1 de la pregunta A, que también lo contaba, sin preguntárselo | motivo: decidido
- principio 2 | eligió: saber que es el navegador de Telegram por los objetos que mete en la página (`TelegramWebviewProxy`, `TelegramWebview`), los mismos que mira su propio `telegram-web-app.js` (trozo 5) | descartó: el User-Agent, que solo la documentación de Android describe y nada prueba en iPhone: el botón de Google saldría donde falla | motivo: decidido

### Para Pablo

A. Contestada el 4 nov 2026: sí, pero solo si ese Telegram se conectó desde dentro de esa cuenta (trozo 3); el código
   del email no basta.
B. Aplicar la migración del trozo 3 (ensayo y `--si`, `scripts/apply-migration.mjs`); hasta entonces, el trozo 3 no
   abre nada nuevo.

Pasos fuera del repo (Pablo):
- Staging: ninguno. @BotFather ya tiene `homenu-staging.vercel.app` (`/setdomain`, 7 oct 2026).
- Producción, antes de subir a `main`: un bot tiene un solo dominio. En @BotFather, `/setdomain` → el bot → el dominio de producción; desde ese momento el botón de login de Lola y «Entrar con Telegram» dejan de ir en staging. Ese mismo dominio, en un PR, en `DOMINIO_LOGIN_TELEGRAM` (`src/lib/cuentaTelegram.js`, trozo 1), el único sitio; si `BOT_LOGIN_DOMINIO` está puesta en Vercel, ya no la lee nadie y se puede borrar.

### Not verified

- Que `oauth.telegram.org/auth`, abierto en la misma pestaña, vuelve a `return_to` con `#tgAuthResult=`: se lee en el código del widget (`telegram-widget.js?22`, `haveTgAuthResult`), sin probar con una cuenta de Telegram real.
- Dentro del navegador de Telegram: sin probar, ni que el login de Telegram funcione ahí ni cuál de los tres objetos mete cada versión (trozo 5, con un móvil real).
- Cuántas identidades de cuentas de Google o Apple hay hoy (las que tendrían que conectarse otra vez desde la app para que el trozo 3 las abra): `npm run consulta` necesita 1Password, sin lecturas hasta el 5 nov.
