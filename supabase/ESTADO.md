# Estado de las migraciones

Verificado contra el esquema vivo de producción (`mdzwbrworucnummibxrq`) el
**17 sep 2026**, comprobando que existe un objeto testigo de cada migración
(su tabla, su columna o su esquema) — no leyendo ningún registro, porque no hay
ninguno fiable. Ver «El registro miente» más abajo.

## Resumen

| | |
|---|---|
| Ficheros en `supabase/migrations/` | **64** |
| Comprobadas contra producción | 32 |
| Aplicadas | **40** |
| **Sin aplicar** | **1** — `0021_store_products` (la `0055_recipe_share_links` se aplicó el 24 sep 2026; la `0056_menu_share_links`, el 25 sep 2026; la `0057_bot_cimientos`, la `0058_bot_codigos` y la `0059_bot_codigo_por_email`, el 29 sep 2026; la `0060_bot_deshacer`, la `0061_bot_recordatorios_y_uso` la `0062_bot_cron`, la `0063_bot_turnos` y la `0064_catalogo_una_fuente`, el 30 sep 2026) |
| Registradas en `supabase_migrations.schema_migrations` | **12** |

## La 0067, aplicada el 1 oct 2026

`0067_cerrar_casas_ajenas` — fase 0 de specs/roles-de-la-casa-*.md. Trigger
`fila_de_casa_es_del_dueno` en `user_pantry`, `user_menus`, `user_menu_weeks` y
`user_menu_recipes` (una fila con `household_id` va a nombre del dueño de esa
casa, también desde el servidor); las cuatro políticas «Users manage own …»
exigen además `is_household_owner(household_id)`; trigger
`dueno_de_casa_no_cambia` en `households`; `remove_household_member` y
`leave_household` rotan `invite_token`. Antes de aplicarla, 0 filas la
incumplían. Comprobado después con usuarios simulados en una transacción
deshecha: meter una fila en casa ajena se bloquea, en la propia pasa.
(El resumen de arriba no la cuenta todavía: lo actualiza quien suba la 0065 y la 0066.)

## La 0064, aplicada el 30 sep 2026

`0064_catalogo_una_fuente` — solo comentarios: `recipes`, `catalog_meta`,
`recipe_ingredients` y `dish_images` quedan marcadas EN DESUSO. La app ya no
las lee (src/data/recipeCatalog.js carga solo el bundle; lo vigila
src/data/catalogoUnaFuente.test.js). No se borra nada; `ingredients` no se
toca (la despensa apunta a ella). Comprobado con `obj_description` tras
aplicarla.

## La 0063, aplicada el 30 sep 2026

`0063_bot_turnos` — `bot_cola` y `bot_candados` (RLS sin políticas) y
`bot_tomar_candado` / `bot_soltar_candado` (solo service_role; comprobado que
anon no): un turno a la vez por chat y los mensajes seguidos juntos. Probado
con ráfagas simuladas: una respuesta por ráfaga, nunca dos en paralelo.

## La 0062, aplicada el 30 sep 2026

`0062_bot_cron` — extensiones `pg_cron` y `pg_net`. El job `bot-recordatorios`
(cada 5 min, POST a /api/bot/recordatorios con `BOT_CRON_SECRET`) lo programa
`scripts/bot-cron.mjs`, no la migración, porque lleva el secreto. Primera
pasada comprobada: 200 `{ok:true, enviados:0}`.

## La 0061, aplicada el 30 sep 2026

`0061_bot_recordatorios_y_uso` — `bot_reminders.repite` (diario/semanal),
`bot_usage.cache_write_tokens` y `bot_contar_uso()` (suma atómica; ejecutable
solo por service_role, comprobado que anon y authenticated no). Probada en vivo
con una casa de prueba, borrada después.

## La 0060, aplicada el 30 sep 2026

`0060_bot_deshacer` — tabla `bot_deshacer` (RLS sin políticas, solo servidor):
foto de la casa antes de cada escritura del bot, para «deshaz lo último».
Comprobada en vivo con una casa de prueba (compra y menú generado, ida y
vuelta), borrada después.

## La 0059, aplicada el 29 sep 2026

`0059_bot_codigo_por_email` — `bot_codigos` gana `email` e `intentos`: «ya tengo
cuenta» pasa de un enlace que abría la app (se perdía con la caché de la PWA)
a un código de 6 cifras que se escribe en el chat. Columnas añadidas y
comprobadas en vivo.

## La 0058, aplicada el 29 sep 2026

`0058_bot_codigos` — códigos de un solo uso para entrar al bot sin pasar por
Ajustes («ya tengo cuenta» por email y «soy nuevo»). Ensayada en transacción
deshecha y aplicada: `bot_codigos` con RLS y sin políticas; un código `entrar`
sin `user_id` se rechaza.

## La 0057, aplicada el 29 sep 2026

`0057_bot_cimientos` — cimientos del bot de Telegram: `household_state.bot_rev`
y las escrituras condicionadas para que la app no pise lo que escribe el bot
(ver `specs/plan-bot-mensajeria.md`). Probada antes en dos transacciones
deshechas y aplicada después en transacción, verificada en vivo:

| | |
|---|---|
| `household_state.bot_rev` | creada, `bigint default 0`; las 28 casas en 0 |
| `bot_identities`, `bot_chats`, `bot_link_tokens`, `bot_messages`, `bot_reminders`, `bot_usage` | creadas, con RLS y sin políticas (solo servidor) |
| `save_household_state` / `save_menu_week` | como usuario: versión buena → `ok`; tras una escritura del bot → `ok:false`; casa ajena → rechazada por RLS |
| `bot_save_casa` | solo `service_role` (ni `anon` ni `authenticated`); versión vieja → `ok:false` |

## La 0056, aplicada el 25 sep 2026

`0056_menu_share_links` — enlaces con llave para mandar una SEMANA, hermana de
la 0055. Aplicada en transacción contra producción y verificada en vivo:

| | |
|---|---|
| `public.menu_share_links` | creada, con RLS activo y 1 política de lectura |
| `menu_share_token` / `menu_share_revoke` / `menu_from_link` | las tres, creadas |
| `menu_from_link` con un uuid inexistente, como `anon` | devuelve `{"status":"gone"}` |
| `menu_share_token` sin sesión | rechaza con «sin sesión» |

**Y algo que salió al verificarla y afecta también a la 0055:** `revoke all on
function … from public` **no le quita el permiso a `anon`**. Supabase trae un
`alter default privileges` que concede EXECUTE a `anon` y `authenticated` sobre
las funciones nuevas del esquema `public`, y eso es una concesión DIRECTA que
revocarle a `public` no toca.

No es un agujero: las tres funciones de escritura empiezan mirando `auth.uid()`
y responden «sin sesión». Pero la concesión dice lo contrario de lo que se
pretendía. En la 0056 se ha añadido un `revoke execute … from anon` explícito;
**`recipe_share_token` (0055) sigue con `anon = true`** y convendría hacerle lo
mismo.

## La única sin aplicar

**`0021_store_products`** — la tabla `store_products` no existe en producción.

**No es un problema, y no hay que correr a aplicarla.** La propia migración lo
dice: *"Client reads bundled JSON in `public/store/`; this table is optional for
server-side queries, analytics, and future multi-store support"*. Comprobado:
**ningún fichero de `src/`, `api/` o `scripts/` la consulta**. Los precios de
Mercadona se leen del JSON del bundle.

Queda escrito para que nadie asuma que está ahí. Si algún día se quiere el
catálogo de productos en servidor, se aplica entonces.

## El registro miente, y por eso esto se verifica a mano

`supabase_migrations.schema_migrations` —la tabla de la CLI de Supabase—
contiene **12 filas para 54 ficheros**, y con otro esquema de nombres:

```
20260704154726  user_pantry
20260710112331  multiweek_menus
...
20260911074059  0051_ops_reader
```

Son *timestamps* de la CLI, no los `00NN_` del repo, y los nombres tampoco
coinciden con los ficheros. La causa está escrita en las propias migraciones:
casi todas llevan «Run this in: Supabase Dashboard → SQL Editor», o sea que se
han ido aplicando **a mano**, sin pasar por la CLI que alimenta esa tabla.

Consecuencia práctica, que ya señalaba la auditoría de agosto: **el repo no
reconstruye producción y el registro tampoco lo cuenta.** La única fuente de
verdad es el esquema vivo. De ahí este fichero.

## Números repetidos

Tres, y se quedan como están:

| Número | Ficheros |
|---|---|
| `0003` | `analytics_feedback_votes` + `user_data` |
| `0006` | `catalog_meta` + `pantry_quantity` |
| `0051` | `ops_reader` + `recipe_base_mode_and_nutrients` |

**No se renumeran.** Los seis están aplicados, y `0051_ops_reader` está
registrado en la tabla de control **por su nombre**: renombrarlo rompería la
única trazabilidad que queda entre repo y base, a cambio de que `ls` se vea
mejor. `migrations.test.js` impide que aparezca un cuarto.

No rompían el despliegue (`supabase db push` ordena por nombre y desempata de
forma determinista). Rompían a las personas: «aplica la 0051» no significaba
nada, y así se quedó sin aplicar durante meses la de `base_mode`.

## Convención

1. **Número nuevo = el siguiente libre.** Sin reutilizar, sin sufijos.
2. **Aditiva y nullable** siempre que se pueda: una columna nueva con `NULL`
   significa «como antes», y no hace falta backfill ni ventana de parada.
3. **Encabezado con el porqué**, no con el qué: el `alter table` ya dice qué
   hace. Lo que no se ve en el SQL es qué se rompía sin él.
4. **Comprobar antes de escribir.** Media docena de columnas de este repo ya
   existían en producción cuando alguien fue a añadirlas.

## Aviso: aplicada ≠ con datos

Las cinco columnas de `0051_recipe_base_mode_and_nutrients` llevan aplicadas
desde septiembre y están **vacías en las 1002 filas**, porque el catálogo no se
ha vuelto a subir a Supabase desde entonces. Una migración aplicada solo
garantiza la forma, no el contenido.

Es la razón de que `aporte` (el campo de `lib/aporte.js`) **no tenga columna
todavía**: se deriva en runtime y ninguna receta lo declara, así que una columna
hoy sería una sexta columna vacía. Está declarado en `NO_VIAJAN`
(`src/data/recipeRow.test.js`) con esa razón y con lo que hay que hacer el día
que se cure a mano.
