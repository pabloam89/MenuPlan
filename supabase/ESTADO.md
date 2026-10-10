# Estado de las migraciones

Verificado contra el esquema vivo de producción (`mdzwbrworucnummibxrq`) el
**17 sep 2026**, comprobando que existe un objeto testigo de cada migración
(su tabla, su columna o su esquema) — no leyendo ningún registro, porque no hay
ninguno fiable. Ver «El registro miente» más abajo.

**7 oct 2026:** vuelto a comprobar, solo con consultas de lectura, de la 0065 a
la 0086. Las funciones se comparan por su cuerpo (`pg_proc.prosrc` frente al
fichero), no solo por el nombre. Salieron aplicadas la 0065, la 0066, la 0079
(su segunda versión), la 0081, la 0082 y la 0084 (su versión final). Sin aplicar
quedan la 0080, la 0083, la 0085 y la 0086. Los testigos de cada una, en la
tabla de abajo.

## Resumen

Contado el 7 oct 2026 sobre la rama `staging` (0001–0086, sin la 0085, que está
en otra rama); el 8 oct se suma la 0087, sin aplicar:

| | |
|---|---|
| Ficheros en `supabase/migrations/` | **99** (con la 0093, la 0094, la 0095 y la 0096) |
| Comprobadas contra producción con objeto testigo | 32 el 17 sep; 0065–0086 el 7 oct; las demás, como dice cada sección |
| Aplicadas | **89** (la cuenta histórica de esta tabla, +1 por cada una de la 0093, la 0094 y la 0095; el script de verificación da 71 en estado «aplicada» y el resto «sobrescrita» o sin testigo) |
| **Sin aplicar** | **2** — `0021_store_products` y `0096_anon_sin_permisos_por_defecto` (ensayada, falta el OK de auditor-datos y que Pablo la lance con `--pablo`); el 8 oct se aplicaron 0080, 0080b manual, 0083, 0085, 0086, 0087, 0088, 0089 y 0090; el 9 oct, 0091, 0092 y, por la noche, la 0093, la 0094 y la 0095 con `--pablo` |
| En otras ramas | — |
| Registradas en `supabase_migrations.schema_migrations` | **12** |

Los constraints NOT VALID que quedan por validar están en `PENDIENTES.md`.

## Comprobación automática

Desde el 7 oct 2026, `node scripts/verificar-estado.mjs` saca los objetos
testigo de cada migración (tablas, columnas, funciones con su cuerpo,
constraints con sus valores, políticas, índices, triggers, tipos, vistas y
crons). Después los busca en el catálogo de producción con una transacción de
solo lectura y avisa de lo que no cuadra con la lista «Sin aplicar» de arriba.
No ve grants, comments, datos ni cambios dentro de una columna existente: las
que solo hacen eso salen «sin testigo».

Primera pasada, el 7 oct 2026, sobre las 88. Cuadran todas menos cinco, que
están en producción solo en parte. Ninguna se ha tocado; se deciden aparte:

| Migración | Lo que falta en producción | Qué significa |
|---|---|---|
| `0010_recipe_discards` | **la tabla `user_recipe_discards` entera** | **Resuelto por código (8 oct 2026, rama `datos/descartes-de-casa`); la tabla sigue sin existir a propósito y no se va a crear.** Los descartes son de la casa: la app solo lee y escribe `household_recipe_discards` (0017, RLS de la 0071) con el `household_id` de la casa activa; sin casa se quedan en el dispositivo y suben al cargar la casa. `householdDiscardsSync.test.js` falla si alguien vuelve a consultar `user_recipe_discards`. **Queda un fallo en la base:** `ensure_user_household` (0071) la lee dentro de un `begin … exception when others`, así que ese bloque entero se deshace siempre: las casas nuevas nunca copian `user_state`, despensa, menús ni favoritos ni pasan a `active` (el 8 oct, 31 `dormant`, 4 `invite_ready`, 0 `active`). La quita la `0090_casa_nueva_completa` (issue #144); completar las casas que ya se quedaron a medias va aparte |
| `0008_meal_extras_catalog` | la columna `user_recipes.product_aliases` | **No existe en producción y nunca existió**: solo existía `recipes.product_aliases`, que se fue con la 0093 (aplicada el 9 oct 2026) al borrar `recipes`. La deriva está en el fichero 0008, que declara una columna que la base no tiene; no hay nada que quitar de la base. Nadie la lee (`recipeRow.js`, que la leía como opcional, se borró antes; la sembraba `scripts/generate-supabase-seed.mjs`, borrado el 9 oct 2026, #303) |
| `0001_recipe_catalog` / seed (valores de enum) | los valores `salsas` (`recipe_category`), `salsa` (`meal_role`) y `salsa` (`recipe_type`) | Existen en producción y desde que se borró `seed_0_setup.sql` (#303) **ya no los declara ningún fichero del repo**: si hubiera que reconstruir la base desde las migraciones, faltarían. Migración que los declara, pendiente en #366 |
| `0017_households` | la política `household_members` «Users insert self as viewer» | Nadie la recrea ni la quita en otra migración: se quitó a mano. Unirse a una casa va por la RPC `join_household_by_token` (security definer), así que no hace falta. Queda que una migración lo diga |
| `0003_analytics_feedback_votes` | las políticas de `user_profiles`, `user_events` y `app_feedback`, y dos índices de `user_events` | Las tablas se crearon desde el panel antes que el fichero, con otros nombres (las políticas se llaman «insert own» y «select own»: las retoca la 0011). El fichero no es lo que se ejecutó |
| `0003_user_data` | la política `recipe_votes` «Votes are publicly readable» | Igual que la anterior: nombre distinto o quitada a mano. Sin efecto visible |

Sin testigo, y por tanto sin comprobar por el script: 0011, 0038, 0043, 0047,
0048, 0062 y 0064.

## De la 0065 a la 0086

| Migración | Estado | Notas |
|---|---|---|
| `0065_bot_retencion` | aplicada (comprobado el 7 oct 2026) | testigo: `bot_purgar(integer)` con el cuerpo idéntico al fichero, y el job `bot-retencion` (`17 3 * * *`, activo) en `cron.job` |
| `0066_ops_bot_eventos` | aplicada (comprobado el 7 oct 2026) | testigo: la vista `ops.bot_events`, con la definición del fichero (quita `telegram_id` y `error`, chat en md5, 21 días) y SELECT para `ops_reader` |
| `0076_bot_tareas` | aplicada (3 oct 2026) | tabla de tareas abiertas de Lola |
| `0077_bot_tareas_a_fondo` | aplicada (3 oct 2026) | |
| `0078_bot_tareas_tope_sin_olvidos` | aplicada (3 oct 2026) | |
| `0079_personas_y_grupos` | aplicada, versión 2 (comprobado el 7 oct 2026) | personas y grupos a tablas, paso 1. Testigos de la versión 2 (`49e8ec3`): las 7 columnas de presentación y etapa en `persona` (`usa_fecha_nacimiento` … `color`) y la tabla `persona_perfil_salud` con RLS. Su `persona_reemplazar_casa` ya no está: la sustituyó la 0081 |
| `0080_bot_tareas_v2` | **aplicada el 8 oct 2026 (ensayo + `--si`)** | 7 constraints NOT VALID; el índice concurrente va en `manual/0080b_indice_concurrente.sql`. No existen `bot_tareas.tipo`, `bot_reminders.tarea_id` ni `bot_tareas_kind_tipo()` | Índice `bot_tareas_una_viva_por_clave` (manual/0080b) creado el 8 oct; el viejo `bot_tareas_una_abierta_por_clave`, borrado.
| `0081_persona_sincronizar_casa` | aplicada (comprobado el 7 oct 2026) | testigo: `persona_reemplazar_casa` es la de la 0081 (solo delega en `persona_sincronizar_casa`, `language sql`). Su `persona_sincronizar_casa` la sobrescribió después la 0082 |
| `0082_persona_sincronizar_casa_guardas` | aplicada (comprobado el 7 oct 2026) | testigo: el cuerpo de `persona_sincronizar_casa` es idéntico al de la 0082 (con las guardas: «sin lista de personas», «sin lista de grupos», «lista de personas vacía…») |
| `0083_bot_tareas_fk_persona` | **aplicada el 8 oct 2026 (ensayo + `--si`)** | va después de 0080, 0081 y 0082 (las dos últimas ya están); 1 FK NOT VALID. No existen `bot_tareas_persona_fk` ni el índice `bot_tareas_persona` |
| `0084_bot_codigo_alta` | aplicada, versión final (comprobado el 7 oct 2026) | testigos de la versión de `f2187d4`: `bot_codigos_tipo_check` con `vincular`, `entrar` y `alta`, y `bot_codigos_alta_check` (`tipo <> 'alta' or external_id is not null`), los dos validados |
| `0085_bot_vocabulario_cerrado` | **aplicada el 8 oct 2026 (ensayo + `--si`)** | en la rama `datos/sistematizar`; 5 CHECK NOT VALID. No existen los `*_channel_check` de `bot_messages`/`bot_reminders`/`bot_tareas`/`bot_cola` ni `bot_reminders.tipo`, y `bot_deshacer.descripcion` sigue |
| `0086_vocabulario_de_la_app` | **aplicada el 8 oct 2026 (ensayo + `--si`)** | 5 CHECK NOT VALID; las consultas previas, en su cabecera. No hay ninguna constraint `*_vocabulario` |
| `0087_menu_activo_y_casa_propia` | **aplicada el 8 oct 2026 (ensayo + `--si`)** | solo `create or replace` de 4 funciones: `household_shopping_mark` mira `user_menus.is_active` en vez de `data.activeMenuId`; `ensure_user_household`, `_unirse` y `_despedir` eligen la casa propia con `order by propia desc, created_at`, y `ensure_user_household` devuelve `'propia'`. Testigo: ese `order by` en `pg_proc.prosrc` de `_despedir` |
| `0088_bot_entradas` | aplicada el 8 oct 2026 (Pablo, con `--pablo` por el `delete` de la purga); `verificar-estado --solo 0088`: 3/3 | tabla `bot_entradas` (update_id de Telegram, una vez) y el job `bot-entradas-purga`. Aditiva; el código funciona sin ella. Testigo: la tabla y el job en `cron.job` |
| `0089_personas_al_guardar` | **aplicada el 8 oct 2026** (la lanzó Pablo con `--pablo`; auditada por auditor-datos). Tras la puesta al día, las 35 casas cuadran: 92 personas en el JSON y 92 filas en `persona` | triggers `personas_al_crear` y `personas_al_guardar` sobre `household_state`: cada guardado copia la familia activa (`data.members`/`data.groups`, sin rosters aparcados ni invitados) a persona/grupo con `persona_sincronizar_casa`, en la misma transacción; si falla, WARNING y el guardado sigue. Al aplicarse, pone al día todas las casas (borra de persona a quien ya no está en el JSON, con sus tareas por la FK de la 0083: consulta previa en la cabecera). Necesita 0081 y 0082. Testigo: `select tgname from pg_trigger where tgname like 'personas_al_%'` |
| `0090_casa_nueva_completa` | aplicada el 8 oct 2026 (Pablo, con `--pablo` por `security definer`); `verificar-estado --solo 0090`: 1/1 | `ensure_user_household` sin la copia de `user_recipe_discards` (no existe), que deshacía siempre el bloque de preparar la casa; si vuelve a fallar, WARNING en el log. Solo `create or replace` de la función; las casas ya a medias no se tocan. Testigo: `pg_proc.prosrc` de `ensure_user_household` contiene «no se pudo preparar la casa» |
| `0091_ids_persona_grupo_a_uuid` | aplicada el 9 oct 2026 (Pablo, con `--pablo`; issue #194, PR #228); `verificar-estado --solo 0091`: 1/1. 163 ids viejos (92 personas, 34 grupos, 37 solo en JSON), 0 fuera del mapa, 2270 filas revisadas y 0 de otra casa, nada colgando. Paso 2: #234, con #227 | ids viejos de persona y grupo a UUID: copia persona/grupo con el id nuevo, mueve a la copia todas las FK que les apuntan (leídas de `pg_constraint`), borra la vieja ya sin nada colgando, y reescribe como token las columnas sin FK de su INVENTARIO (household_state con `bot_rev + 1`, user_state, user_menu_weeks, user_menu_recipes, cookings, shared_menus, bot_tareas, bot_messages sin el texto, bot_deshacer, user_events). Aborta si queda un id viejo en cualquier columna de texto o JSON de public o si cambia algún recuento. Crea `ids_uuid_equivalencias` (el mapa). Testigo: la tabla `ids_uuid_equivalencias`, y ninguna `persona.id` sin forma de UUID |
| `0092_rol_consulta_lectura` | **aplicada** el 9 oct 2026 por Pablo con `--pablo` (PR #241, issue #233); `verificar-estado --solo 0092` → aplicada 1/1. Ensayo del 9 oct 2026 limpio: lee 62 tablas y vistas de `public` y `ops`; 2 tablas de `net` escribibles por la concesión de Supabase a PUBLIC, que el rol no puede quitar (riesgo aceptado, pendiente de Pablo: la frontera es la URL, ver la cabecera). Inyectando a propósito `pg_signal_backend`, `insert`, `maintain`, `usage` en secuencias, `replication` o `create`, la comprobación final la deshace. La lanza Pablo con `--pablo` (permisos); luego, la contraseña con `node scripts/clave-consulta-lectura.mjs --si` | rol `consulta_lectura` con login y sin contraseña: `select` en `public` y `ops` (y por defecto en lo que cree `postgres` ahí), `bypassrls`, sin pertenencias ni `replication`; por defecto (la sesión los puede cambiar) `default_transaction_read_only = on`, `statement_timeout` 15 s e `idle_session_timeout` 60 s. Un bloque final comprueba en el catálogo que no puede escribir en tablas ni secuencias, crear, ni ejecutar `security definer` volátiles, y aborta si no. Testigo: el rol `consulta_lectura` en `pg_roles` (`verificar-estado` ve roles desde esta rama) |
| `0094_lapidas_recetas_propias` | aplicada el 9 oct 2026 (Pablo, con `--pablo`; issue #355, PR #373); `verificar-estado --solo 0094`: 5/5. Ensayo del 9 oct 2026 válido (segunda ronda, con lo de `seguridad` y `auditor-datos`); la autoprueba del final (receta de prueba de un dueño real, con el rol `authenticated`: borrar con la RPC, intentar resubirla) pasa y se deshace; sin el trigger, o sin la política de lectura, la misma autoprueba aborta. Crea una `security definer` y hace `revoke on function`: la lanza Pablo con `--pablo`, tras el OK de `auditor-datos` | Lápidas de recetas propias en la nube: tabla `user_recipe_deletions` (dueño, id, instante; solo lectura de las suyas para `authenticated`), RPC `borrar_receta_propia` (`security definer`: lápida + borrado en una transacción) y trigger `trg_user_recipes_no_revivir` (before insert: un id con lápida de su dueño no vuelve a entrar). Plan B en el código: sin la tabla o la función, la app y Lola funcionan como antes (`userRecipesSync.lapida.test.js`, `recetasPropias.test.js`); el CHECK de formato lo compara con `ids.recetaPropia` `supabase/lapidasFormato.test.js`. No se purgan: se revisa si algún dueño se acerca a 2000 (tope de lectura de la app). Testigo: la tabla `public.user_recipe_deletions` y el trigger `trg_user_recipes_no_revivir` |
| `0095_rol_copia_lectura` | **aplicada** el 9 oct 2026 por Pablo con `--pablo`; contraseña puesta con `clave-copia-lectura.mjs --si`, que entra y su consulta de prueba pasa (issue #273; era la 0094 hasta que staging cogió ese número). Ensayo del 9 oct 2026 limpio: lee 50 tablas y vistas de `public` y `ops` y todas sus secuencias; 2 tablas de `net` escribibles por PUBLIC (lo mismo que la 0092). Inyectando a propósito `usage` en secuencias, `insert`, `pg_monitor`, `connection limit 3`, `encrypted_password` en la vista, `security_invoker`, `select` a `anon` o a `consulta_lectura` en `copia`, o permisos de más sobre las tablas de códigos efímeros, la comprobación final la deshace. Toca permisos (también de `consulta_lectura`): la lanza Pablo con `--pablo`; luego, la contraseña con `node scripts/clave-copia-lectura.mjs --si` | rol `copia_lectura` con login y sin contraseña, `connection limit 1`, `bypassrls` (pg_dump lo necesita), sin pertenencias: `select` en `public`, `ops` y sus secuencias (y por defecto en lo que cree `postgres` ahí), menos `bot_link_tokens`, `household_invites` y `bot_codigos` (tablas de códigos efímeros que no hacen falta para restaurar; `copia-base.sh` las deja fuera). A `consulta_lectura` se le quitan seis columnas con códigos (`COLUMNAS_SIN_CONSULTA`): pierde el `select` de esas tablas y lo recupera por columnas, así que en ellas `select *` falla. Esquema `copia` con dos vistas de `postgres` sin `security_invoker`: `auth_usuarios` (id, email, phone, email_confirmed_at, phone_confirmed_at, is_anonymous, created_at) y `auth_identidades` (id, user_id, provider, provider_id, created_at), sin tokens ni metadatos; solo las lee `copia_lectura`. Testigo: el rol `copia_lectura` en `pg_roles` |
| `0096_anon_sin_permisos_por_defecto` | **sin aplicar** (issue #367). Cambia los permisos por defecto (`alter default privileges`): la lanza Pablo con `--pablo`, tras el OK de `auditor-datos`. `verificar-estado` la lee con testigos negativos (`permiso_defecto`: `tables:anon` y `sequences:anon` deben faltar de la plantilla de `postgres` en `public`; hoy salen «falta» = sin aplicar). Ensayada el 10 oct 2026 (válida). Autoprueba incluida: crea una tabla con su secuencia de prueba y comprueba que `anon` no tiene nada y `authenticated`, `service_role`, `consulta_lectura` y `copia_lectura` siguen igual; la deshace con un raise controlado | Quita a `anon` la plantilla de privilegios de `postgres` en `public` para tablas y secuencias NUEVAS. Las funciones quedan fuera a propósito (una función nueva sale con PUBLIC por la plantilla de fábrica; quitarlo pide un `alter default privileges` global que tocaría también `extensions`; seguimiento en #367). No toca ningún grant de lo existente (41 tablas con grants a `anon` hoy, 33 funciones ejecutables, 6 secuencias; cifras del 10 oct 2026). Plan B: el código no depende de ella. Vigilada por `supabase/anonPorDefecto.test.js` (rechaza `grant … to anon`/`public` en tablas y secuencias desde la 0096 salvo marca `-- anon: <porqué>`). Testigo, a mano: `select count(*) from pg_default_acl where defaclrole = 'postgres'::regrole and defaclnamespace = 'public'::regnamespace and defaclobjtype in ('r','S') and defaclacl::text like '%anon=%'` debe dar 0 (sin el filtro de tipo daría 1 por la plantilla de funciones, que no se toca) |

## La 0074 y la 0075, aplicadas el 2 oct 2026

`0074_traducciones` — `content_translations` (hash del texto + idioma): la
caché de lo pintado por el código que se traduce al inglés
(api/_bot/traducir.js). Solo servidor.

`0075_herencia` — heredar la casa al borrar la cuenta del titular:
`households.propia` (la regla «una casa propia por persona» pasa a
`uq_households_una_propia`, solo para las propias; la vieja
`uq_households_one_owner_per_user` se quita), semanas y recetas del menú con
ON UPDATE CASCADE, `_transfer_household_ownership`,
`transfer_household_ownership` (titular) y `prepare_account_deletion`
(servidor). Ensayada en transacción deshecha (18 de 18; sin ella la función no
existe) y aplicada con permiso de Pablo. Se re-comprueba con
`node scripts/ensayo-herencia.mjs`.

## La 0073, aplicada el 2 oct 2026

`0073_idioma_y_union_por_telegram` — `user_profiles.ui_lang` (es | en | null)
y `_unirse(usuario, token)`: el cuerpo de unirse, que usan la app
(`join_household_by_token`) y el bot (`bot_unirse_por_invitacion`, solo
service_role, para /start inv_ en Telegram). Si la invitación trae idioma y la
persona no eligió, se le pone. Ensayada en transacción deshecha (8 de 8; sin
ella la función del bot no existe), aplicada con permiso de Pablo, y
`scripts/ensayo-papeles.mjs` sigue limpio contra la base viva.

## La 0072, aplicada el 2 oct 2026

`0072_lector_tacha` — `household_shopping_mark`: el lector (y cualquier
miembro) cambia SOLO `have` de artículos que ya existen, por nombre y unidad,
en la semana y en la copia viva si es esa semana; sube `bot_rev`. Ensayada en
transacción deshecha (10 de 10; sin ella la función no existe) y aplicada con
permiso de Pablo. Comprobada después contra la base viva.

## La 0070 y la 0071, aplicadas el 2 oct 2026

`0070_papel_editor` (el valor `editor` del enum) y `0071_tres_papeles`
(titular, cotitular y lector: RLS de cotitular, filas de casa reescritas a
nombre del titular, household_invites y las RPC de miembros). Con permiso de
Pablo. La 0070 en su transacción; la 0071 solo tras ensayarla en una
transacción deshecha: el primer ensayo dio 2 fallos (los dos de la prueba,
no de la migración), y la 0071 no se aplicó hasta que salió limpio (30 de
30). Comprobado después contra la base viva con `node scripts/ensayo-papeles.mjs`
(siempre deshace lo que hace): todo bien.

## La 0069, aplicada el 2 oct 2026

`0069_bot_activar_menu` (sesión menuplan-79, PR #25) — `bot_save_casa_activando`:
lo mismo que `bot_save_casa`, pero activa además `p_menu_id` en la misma
transacción. Solo service_role. La usan generar y deshacer del bot.

## La 0068, aplicada el 2 oct 2026

`0068_version_en_cada_escritura` — `save_household_state` y `save_menu_week`
suben `household_state.bot_rev` en cada guardado de la app (C-2 de
specs/roles-de-la-casa-revision.md). Ensayada en transacción deshecha (11 de
11) y aplicada por la sesión menuplan-79 a petición de Pablo, ANTES de que el
cliente que la entiende (src/lib/versionCasa.js, en staging desde el PR #24)
llegue a producción: hasta entonces, la app vieja de producción recarga tras
cada guardado propio. Pablo lo acepta («nadie está usando la app»).

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

## La 0093, aplicada el 9 oct 2026 (21:24 Madrid, por Pablo con `--pablo`)

`0093_borrar_copias_catalogo` (issue #303; Pablo decidió el 9 oct 2026 borrar ya,
sin esperar a pasar staging a `main`) — borra las 7 tablas y 2 vistas copia del
catálogo: `recipes` (1002 filas), `recipe_ingredients` (7140), `catalog_meta` (1,
v27 del 8 sep), `dish_images` (2344), `ingredients` (383), `ingredient_aliases`
(419), `ingredient_substitutions` (16) y las vistas `recipe_derived_allergens`
(980) y `recipe_substitution_options` (327). Nadie las lee (el detector
`ops/lecturasRetiradas.test.js`), la copia se quedó en la v27 y estaban abiertas a
la API pública. Una sentencia por objeto, sin `cascade` ni `if exists`; empieza
comprobando que los recuentos son los de la copia previa y acaba comprobando que
`set_updated_at` y los enums de la 0001 siguen. Copia previa de los 9 objetos,
fuera del repo: `C:\dev\copias-previas\2026-10-09-catalogo-copia\` (MANIFIESTO con
filas y sha256, ESQUEMA y LEEME de cómo restaurar). En el mismo PR se borran los
9 `supabase/seed_*.sql`, `scripts/generate-supabase-seed.mjs` y
`scripts/run-seed.mjs`. Efecto en `main` (producción): `src/data/recipeCatalog.js`
consulta `catalog_meta` en cada carga y, si falla, usa el bundle: una petición más
por carga. Testigo (negativo): `recipes` y las otras 8 ya no están en `pg_class`
(`node scripts/verificar-estado.mjs --solo 0093`).

**Aplicada la noche del 9 oct 2026** («aplicada y confirmada»). Testigo: los 9
testigos negativos, `verificar-estado --solo 0093` → aplicada 9/9. Efecto
comprobado con SELECT: las 7 tablas y 2 vistas ya no existen en `public`; los 35
hogares y 147 menús siguen intactos; `set_updated_at()` y los enums siguen. Al
estar aplicada, `verificar-estado` da por borradas las tablas y marca como
«sobrescrita» o «parcial» (falta lo que colgaba de ellas) las migraciones
antiguas que las creaban: 0006, 0029–0032, 0051, 0052 y 0054, y en parte la
0001, 0008, 0012, 0023–0025. No es deriva: es el `drop`.

La copia previa de los 9 objetos está en
`C:\dev\copias-previas\2026-10-09-catalogo-copia\` (fuera del repo, 5,6 MB,
MANIFIESTO con sha256). **No es una copia de la base**: solo de esos 9 objetos.
Aviso conocido: el ensayo de copias (`copias-ensayo`) dará `tablas-distintas`
una sola vez si restaura una copia anterior al borrado; repetir la copia tras
aplicar.

## La 0064, aplicada el 30 sep 2026

`0064_catalogo_una_fuente` — solo comentarios: `recipes`, `catalog_meta`,
`recipe_ingredients` y `dish_images` quedan marcadas EN DESUSO. La app ya no
las lee (src/data/recipeCatalog.js carga solo el bundle; lo vigila
src/data/catalogoUnaFuente.test.js, hoy ops/lecturasRetiradas.test.js). No se
borró nada entonces (las 7 tablas y 2 vistas las borró la 0093, aplicada el 9 oct 2026); `ingredients` no se
tocó (la 0064 creyó que la despensa apuntaba a ella: es falso, ver `copiaIngredientesSupabase` en src/data/model.js). Comprobado con `obj_description` tras
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

## La 0021, sin aplicar a propósito

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
5. **Desde la 0087, `docs/datos/PRINCIPIOS.md`**, vigilado por
   `supabase/principios.test.js`. Cada migración nueva se apunta aquí.

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
