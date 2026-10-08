# Ataque a «Tres papeles por casa»

Revisión adversarial, 1 oct 2026. Repo `MenuPlan-bot` (HEAD `b713473`; las líneas de `App.jsx` las cito según HEAD, porque otra sesión está editando el fichero ahora mismo y se mueven unas 27 líneas). Base de producción consultada solo con SELECT dentro de `begin transaction read only` … `rollback`, como `postgres`.

## Verificación de las afirmaciones de hecho

| Afirmación | Veredicto | Evidencia |
|---|---|---|
| 30 casas (26 dormant, 4 invite_ready), 30 owner + 1 viewer, invariante owner OK | **Cierto** | `households` agrupado por estado; `household_members` 30/1; 0 casas que violan el invariante |
| 3 chats, todos privados, los 3 con `bot_identities` y `linked_by` = titular | **Cierto** | `bot_chats` kind=private ×3; join con `households` y `bot_identities` |
| `locale` pisado por analytics | **Cierto** | `src/lib/analytics.js:20-28` (`upsert … locale: navigator.language`) en cada sesión; 11 `en*` de 53 perfiles |
| Políticas de escritura = `is_household_owner` en todas las tablas de casa | **Cierto** | `pg_policies` en vivo (ver abajo) |
| `save_household_state` / `save_menu_week` invoker, `bot_save_casa` definer solo service_role | **Cierto** | `pg_proc.prosecdef` y `proacl` |
| FK compuesta sin `ON UPDATE CASCADE` | **Cierto** | `fk_user_menu_weeks_menu`, `fk_user_menu_recipes_menu` |
| `parseHouseholdRow`/`parseHouseholdMemberRow` convierten todo lo que no es owner en viewer | **Cierto** | `householdsSync.js:35` y `:55` |
| «Unas 60 comprobaciones de `householdReadOnly`» | **Corto** | 136 apariciones en `App.jsx` (HEAD). La superficie de la fase 2 es el doble |
| «`user_recipes` privadas: 11 filas» (apartado 7) | **Falso** | 11 es el total; privadas hay **5** (5 public, 1 friends) |
| «Colisión de `id` de menú al transferir: improbable» | **Falso** | Ya pasa en producción, y justo en la única casa con dos miembros (ver H-4) |
| «Una casa `dormant` vacía se borra sola» como criterio seguro | **Falso** | `dormant` no significa vacía: 21 de 26 tienen familia y 5 tienen familia sin menús (ver H-4) |

**a) Inyección en casa ajena: confirmada, y es peor de lo que dice la propuesta.**

Las políticas en vivo de `user_pantry`, `user_menus`, `user_menu_weeks` y `user_menu_recipes` incluyen `"Users manage own …"` con `qual = with_check = (auth.uid() = user_id)`. Ninguna mira `household_id`. Lo único que hay sobre `household_id` es la FK a `households(id)`. No hay triggers de insert, solo `set_updated_at`. Para inyectar basta con conocer un `household_id`, y `preview_household_invite(token)` se lo da a cualquiera que tenga el enlace reutilizable, sin necesidad de unirse.

Lo que llega a leer la víctima:

- **App:** `loadPantry(…, householdId)` filtra por `household_id` (`pantry.js:232`), así que la despensa inyectada aparece. `loadMenuWeekRanges` y `loadMenuDetail` filtran por `household_id` + `menu_id` sin `user_id` (`menusSync.js:163, 206`). Si alguien mete un `user_menus` con el mismo `id`, el `.maybeSingle()` de `loadMenuDetail` falla por «varias filas» y ese menú ya no se abre. Sus semanas además pisan las buenas en el mapa por `week_start`.
- **Bot:**
  - `leerCasa` lee las semanas por `household_id` + `menu_id` (`casa.js:73-77`).
  - `bot_save_casa` actualiza `user_menu_weeks where household_id and menu_id and week_start`, sin `user_id`. Así que cada escritura de Lola **se copia también a la fila del atacante**: un ex-miembro sigue recibiendo la compra y el plan de la semana en una fila suya, que puede leer.
  - `generar.js:221-229` copia `...w` con el `user_id` del atacante a un menú nuevo. La FK `(atacante, menú nuevo)` falla y **generar se rompe**.
- **Lo usa la propia app, de buena fe:**
  - `mergeLocalPantryIntoCloud(user.id, householdId)` (`App.jsx:1492`) se ejecuta también para el lector e inserta `user_id = lector` en la casa ajena (`pantry.js:315-317`).
  - El backfill de menús (`App.jsx:~1641-1660`) hace `saveMenuRemote(user.id, …, householdId)` si la casa no tiene menús.

  Hoy hay 0 filas de casa con `user_id` distinto del titular, pero el camino existe.

**b) El chat enlazado sobrevive a la expulsión: cierto, pero hoy es latente.** `remove_household_member` y `leave_household` solo borran `household_members` (cuerpo en vivo) y `atender` usa `bot_chats.household_id` sin comprobar nada. Pero hoy solo el titular puede enlazar (`link.js:35`, `casaPropia` en `enlace.js:80-86`), así que no hay ningún no-titular con chat enlazado. Lo que lo hace real es la propia propuesta, al abrir el enlace a todos los papeles.

**c) El lector no lee las recetas privadas del dueño: cierto.** `user_recipes` solo tiene `Owner manages own recipes` y dos SELECT de publicadas. El titular de `d918a3cc…` tiene 3 privadas que su viewer no ve. Un matiz: el snapshot sí se lee por `user_menu_recipes` (política de miembros), así que el menú se pinta; lo que falla es la biblioteca o cualquier cosa que resuelva por id.

**d) Grupos, en grupo cualquiera usa todo: cierto.** `responder()` solo usa `autor` como prefijo (`agente.js:739-740`), `herramientas(chat)` no filtra por persona (`agente.js:128-185`) y `permitidoEn` no recibe a la persona (`router.js:186`). Hay 0 grupos.

---

## Hallazgos, por prioridad

### CRÍTICO

**C-1. Al cambiar de casa, el cotitular sube SU familia encima de la del titular (y al volver, al revés).**

- **Qué pasa.** El estado de la app (`data`, `menuPlan`, `shopping`) es uno solo por dispositivo, no uno por casa. Al hidratar, la nube solo gana si lo local no tiene miembros:
  - `shouldAdoptRemoteProfile`, en `profileMerge.js:25-29`: `remoteHasProfile && !localHasProfile`;
  - `useRemote`, en `App.jsx:~1542`.

  `handleSwitchHousehold` (`App.jsx:3445`) no fuerza la nube: solo resetea `hydratedUserRef`. Y el guardado con debounce (`App.jsx:~1771-1790`) sube el blob entero a `syncHouseholdId`, frenado únicamente por `householdReadOnly`.
- **Lo que ya ha pasado.** El único viewer (`7d309349…`) tiene en su casa propia `menu_2jjamuv4mrn8s23u` y `menu_6wi5w7jsmrf4m6i6`, los mismos ids que la casa `d918a3cc…`. Se crearon el 19 ago a las 21:23:39 y 21:23:40: es el backfill de `localMenus` cacheados de la casa ajena, escrito en la suya.
- **Por qué importa.** Hoy la fuga va en un solo sentido y el lector no puede escribir en la casa ajena. Con un cotitular, la pareja, que tiene su propia familia hecha en el onboarding, abre la casa compartida y en 1,2 s reescribe miembros, **alergias** y compra del titular.
- **Qué cambiar.** Es requisito de la fase 2, no un detalle:
  - estado local con clave por casa;
  - forzar la nube al cambiar de casa y en cualquier casa donde no seas titular;
  - el backfill de menús solo en `isOwn`;
  - un test que lo vea fallar con dos casas en el mismo dispositivo.

**C-2. Entre dos editores, el último gana y no se entera nadie. La fase 9 no es opcional.**

- **Qué pasa.** `save_household_state` compara solo `bot_rev` (cuerpo en vivo), y `bot_rev` solo lo sube `bot_save_casa`. Una escritura de la app no lo mueve, así que el sondeo de `bot_rev` (`App.jsx:~1794`) no ve lo que guarda el otro editor. Y el siguiente guardado del segundo dispositivo, que salta con cualquier cambio de `data`, sube su blob viejo entero.
- **Por qué importa.** En ese blob van la familia, las alergias, la salud y la compra. La propuesta dice que «el sondeo ya hace que la app recargue cuando escribe Lola o un lector», y es cierto, pero no cuando escribe el otro editor, que es justo el caso nuevo.
- **Qué cambiar.** `rev` que suba con **cualquier** escritura (app incluida), y guardado condicionado a esa versión, **antes** de la fase 2. Pasa a ser fase 1b.

**C-3. `bot_identities` no es una identidad probada, y la propuesta la convierte en la fuente del papel.**

- **Qué pasa.** `enlazarChat` hace `upsert` de `(channel, external_id) → user_id` con el `user_id` del **token** y el `from.id` de **quien pulsa** (`enlace.js:24-31`, llamado desde `telegram.js:1003-1010`, `:910`, `:936`). El propio código lo avisa (`telegram.js:~971-975`): «una identidad en bot_identities no prueba que este Telegram sea el dueño de la cuenta: se crea también al enlazar por email o desde un grupo».
- **Vías de escalada**, con `papelDe` = identidad → usuario → papel:
  1. Hoy `/grupo` firma con `duenoDe` (`telegram.js:722-724`). Cualquiera con privado enlazado saca un enlace con el `user_id` del titular, y quien lo pulse queda mapeado como titular. La propuesta lo corrige para `/grupo`, pero no el mecanismo.
  2. Un enlace de «Conectar Telegram» que el titular reenvía, o pulsa la asistenta en el móvil de él, mapea el Telegram de ella al titular.
  3. Hay un upsert que **sobrescribe**: un Telegram que era lector pasa a ser otro usuario con solo pulsar un token de ese usuario.
  4. En grupos, un admin anónimo escribe como `GroupAnonymousBot` (1087968824). Si ese id llega a enlazarse, todos los admins anónimos heredan el papel.
- **Qué cambiar.**
  - Separar la identidad probada (nacida aquí, código por email, `inv_` aceptada desde ese Telegram) del enlace de chat.
  - No escribir `bot_identities` desde enlaces de grupo.
  - No sobrescribir una identidad con otro `user_id`.
  - Ignorar los ids de bots y de anónimos.
  - Quitar la vuelta a `linked_by`: los tres chats de hoy tienen identidad, así que no hace falta.
  - `inv_` tampoco debe elegir el usuario por `bot_identities`.

### ALTO

**A-1. La fase 0 tal cual rompe cosas y deja la mitad del agujero.**

- **Lo que rompe.** Con `household_id is null` en las políticas viejas, `mergeLocalPantryIntoCloud` del lector falla, y aun así `writeLocalPantry([])` (`pantry.js:737`) vacía su despensa local: pierde datos.
- **Lo que deja abierto.** El bot sigue sin filtrar por `user_id` en `leerCasa`, `bot_save_casa` y `generar.js`.
- **Qué cambiar.**
  - En las lecturas y escrituras de servidor, añadir `user_id = owner_user_id`.
  - No llamar al merge en casas que no son tuyas.
  - Antes de aplicar, una consulta de limpieza (ya la tengo: hoy da 0 filas).

**A-2. El enlace reutilizable no rota nunca, así que «quitar a alguien» no sirve.** `households.invite_token` solo se genera si es nulo (`update_household`, cuerpo en vivo) y no hay ninguna RPC que lo cambie. Un lector expulsado vuelve a entrar con el mismo enlace. La propuesta además se lo da al editor (`ensure_user_household`), así que un cotitular rebajado o expulsado se queda con una llave de lector para siempre.

Qué cambiar:
- rotar `invite_token` en `remove`, `leave` y `set_role`, y ofrecer «Regenerar enlace»;
- revocar las `household_invites` pendientes de esa casa al quitar o rebajar a alguien. Una invitación de editor sin usar sirve si no para volver a subir con «nunca baja, sí sube».

**A-3. Quitar `uq_households_one_owner_per_user` quita también la única barrera contra casas duplicadas.**

- **Qué pasa.** `ensure_user_household` no bloquea nada: hace `select … limit 1` y, si no encuentra, `insert`. Hoy, si dos llamadas van a la vez, una choca con el índice. `cuentas.js:124-127` ya cuenta con esa carrera.
- **Más sitios con `limit 1` sin `order by`** que pasan a ser ambiguos: `delete_household` (0020:29), `leave_household`, `join_household_by_token` (rama de casa propia) y el bucle de `cuentas.js:130`.
- **Qué cambiar.** `pg_advisory_xact_lock(hashtext(uid))` en `ensure`, o mantener la unicidad con un índice parcial sobre una columna nueva (`households.kind = 'own'`) que la transferencia sí pueda mover. Y poner orden explícito en todos esos sitios.

**A-4. La transferencia, tal como está escrita, falla o destruye datos.**

- **Colisión de PK real.** Los dos únicos `id` de menú repetidos en toda la base son los del caso de C-1: los tiene el viewer de la casa con dos miembros. Si hoy se le hace cotitular y heredero, `update user_menus set user_id = nuevo` choca con `user_menus_pkey (user_id, id)` y se deshace todo.
- **El autoborrado de la casa `dormant` destruye datos.** De 26 casas `dormant`, 21 tienen familia en `household_state`, 16 tienen menús y 4 tienen despensa. La condición «sin otros miembros y sin `user_menus`» borraría 5 casas con familia y alergias, y en cascada su `bot_chats` (la casa que crea «Soy nuevo» en Telegram tiene el privado enlazado).
- **Qué cambiar.**
  - No borrar nada automáticamente; o solo si `state` está vacío y no hay filas en ninguna tabla.
  - Resolver las colisiones de `id` antes del UPDATE: renombrar el menú del heredero, que es lo copiado.
  - La alternativa de PK por `household_id` deja de ser «lo limpio a largo plazo»: es lo que quita esta clase de fallos.

**A-5. Ocultar la salud al lector no es privacidad.** La política `Members read household state` da al lector el blob entero por REST, salud incluida. Que `ver_casa`/`ver_ajustes` omitan la salud solo la quita del bot y de la UI. Con una empleada de hogar, y datos de salud de menores (categoría especial del RGPD), si Pablo decide ocultarla hay que separar esos datos del blob (tabla aparte o RPC). Hay que decidirlo antes de la fase 6, no en «Riesgos».

**A-6. Hay entradas al agente que no pasan por `turno`.** La propuesta calcula el papel en `atenderCola`/`turno` (`telegram.js:289, 347`). Pero hay tres caminos que llaman a `conversar` directamente:

| Entrada | Línea | Riesgo |
|---|---|---|
| Fotos y PDF | `telegram.js:240` | un lector manda un ticket y se ejecuta `anadir_despensa` o `guardar_menu_cole` |
| `usarCompartido` | `telegram.js:700` | |
| alta | `telegram.js:960` | |

Qué cambiar: calcular el papel dentro de `conversar`/`responder`, y que `herramientas(chat)` **falle cerrado** si `chat.papel` es `undefined`.

**A-7. «Filas a nombre del titular» solo con WITH CHECK: fallos silenciosos y lecturas equivocadas.**

- **Escrituras** que siguen pasando `user.id` y pocas veces `householdId` (HEAD):
  - `deleteMenuRemote(user.id, id)` sin casa (3121, 3281);
  - `loadMenuDetailRemote(user.id, id)` (3302, 3421);
  - `toggleMenuFavoriteRemote(user.id, …)` sin casa (2340, 3144, 3150, 3393);
  - `loadPantry(user.id)` sin casa (1879, 2086, 2202, 3189, 4407, 4490, 4559): el editor generaría el menú compartido con **su** despensa.
- **Después de una transferencia**, todos los clientes tienen el `ownerUserId` viejo en memoria y sus escrituras fallan sin decir nada (`queueSaveMenuWeek` solo hace `console.warn`).
- **Qué cambiar.**
  - Un trigger `BEFORE INSERT OR UPDATE` en las cuatro tablas que haga `user_id := owner_user_id` cuando `household_id` no es nulo. En PostgreSQL el árbitro de `ON CONFLICT` usa la fila ya reescrita, así que los `upsert … onConflict user_id,…` siguen valiendo. Con eso, el valor que mande el cliente da igual y sobra la lista de unos 20 sitios.
  - Las lecturas sí hay que cambiarlas a `householdId`.

**A-8. `activate_household_menu(p_menu_id)` es ambiguo.** Busca por `id` con `user_id = v_user_id OR is_household_owner` y `limit 1`, y los `id` no son únicos entre usuarios (ya hay dos repetidos). Un editor con un menú de igual id en su casa activaría **su** casa. Qué cambiar: una firma nueva con `p_household_id` y la vieja intacta para los clientes viejos. Esta firma es la que usa `activate_user_menu`, que la propuesta no menciona.

**A-9. La numeración y el banco de pruebas no existen como los da por hechos.**

- **Numeración.** Hay dos `0065` en vuelo: `0065_bot_retencion.sql` en `origin/bot/retencion-15-dias` (y en el worktree `MenuPlan-comidas`), y `0065_consentimiento_legal.sql`, sin seguimiento en `MenuPlan-bot`, que ha aparecido mientras revisaba y toca `user_profiles`. Además `origin/staging` tiene `0064` y `origin/main` se queda en `0063`. Las de la propuesta serían la tercera `0065`.
- **Banco de pruebas.** No hay `supabase/config.toml`. Y `schema_migrations` solo registra 20 nombres, varios que **no están en el repo** (`close_household_members_direct_insert_bypass`, `fix_drifted_auth_users_cascade_constraints`, `rls_wrap_auth_uid_in_select_for_initplan`, `apple_auth_tokens`, `report_*`). «Pruebas RLS en Supabase local» con las migraciones del repo no reproducen producción.
- **Qué cambiar.**
  - Reservar el número al aplicar: el siguiente libre después de las dos `0065` sería `0066`, más el de la fase 0.
  - Montar el banco local desde un `pg_dump --schema-only` de producción, o desde una rama de Supabase.

### MEDIO

- **M-1. El `/borrarme` del bot borra lo heredado.** `borrar.js:74-80` borra `bot_chats`, mensajes, recordatorios, `bot_deshacer` y `bot_usage` de **todas** las casas del titular. Si se transfiere antes, el heredero pierde sus chats y el contador de cuota se pone a cero. Qué cambiar: recalcular `casas` **después** de `prepare_account_deletion`, no solo sustituir L69-73.
- **M-2. `household_shopping_mark` sube `bot_rev` en cada llamada.** Una lectora que tacha 30 cosas en el súper provoca 30 recargas en la app del editor, que pierde lo que no haya guardado, y choques en `bot_save_casa` de Lola. Cualquier lector puede además forzarlo en bucle. Qué cambiar: tachados en lote con debounce en el cliente, subir la versión solo si algo cambió y limitar la frecuencia.
- **M-3. «Vaciar la casa: solo el titular» no es una frontera.** El editor puede hacer `UPDATE household_state` a `{}` y `DELETE` de menús y despensa. O se dice así en la matriz, o se restringe el DELETE.
- **M-4. Un desconocido en el grupo, tratado como lector, puede leer la salud.** Con `ver_casa`/`ver_ajustes` ve salud y alergias de los niños de cualquiera que esté en el grupo familiar. Qué cambiar: limitarlo a consultar el menú y la compra.
- **M-5. Recetas privadas del titular que borra la cuenta.** Antes de la fase 8, sus recetas privadas usadas en los menús heredados desaparecen por la cascada de `user_recipes`. La fase 5 va antes que la 8: o se reordenan, o la herencia copia las recetas.
- **M-6. Carreras en la transferencia.**
  - `generar.js:212` lee `dueno` antes de insertar. Si la transferencia cae en medio, el menú se crea a nombre del viejo titular y muere cuando borre su cuenta.
  - El `for update` de `households` no bloquea esas inserciones. El trigger de A-7, más `for share` sobre `households` en las escrituras de servidor, lo acota.
  - Además, la herencia automática convierte al cotitular en futuro pagador sin preguntarle.
- **M-7. Funciones de ayuda abiertas a cualquiera.** `household_owner_id`, `household_role` y `count_foreign_memberships` son `SECURITY DEFINER` y PostgreSQL da `EXECUTE` a PUBLIC por defecto. Hoy `count_viewer_memberships(p_user_id)` ya la puede ejecutar `anon` con cualquier usuario. Qué cambiar: hacer el revoke también con estas y quitar el parámetro `p_user_id`.
- **M-8. Deshacer y el lector.** El lector tiene `deshacer` bloqueado, pero tras `marcar_compra` se le ofrece el botón (`CON_BOTON_DESHACER`) y no podría usarlo. Y si se le permite, deshace «lo último de la casa», aunque sea de otro.
- **M-9. La memoria del grupo deja al lector dejar órdenes preparadas.** Puede escribir algo para que se ejecute en el turno del titular. `supervisar` solo cubre quitar protecciones. Es un riesgo bajo, pero hay que decir que el papel se aplica al turno, no a la intención.
- **M-10. Clientes viejos.** La PWA es `autoUpdate` (`vite.config.js:182`) y hay rama iOS (Capacitor), con JS embebido que dura semanas. Un lector con cliente viejo pierde su despensa local con la fase 0 (A-1). El titular con cliente viejo pisa al editor (C-2) hasta que actualice.

### BAJO

- **`ALTER TYPE … ADD VALUE`.** Si alguien pega las dos migraciones juntas en el editor SQL, que ejecuta todo como una transacción, la segunda falla con «unsafe use of new value». Hay que aplicarlas por separado, y decirlo en la cabecera.
- **El tope de 2 casas ajenas** deja fuera a una asistenta que trabaja para tres familias.
- **`inv_` sin cuenta de Telegram vinculada a su Google** crea una segunda cuenta a la misma persona.
- **La propuesta ignora `activate_user_menu`**, el envoltorio que la app llama de verdad (`menusSync.js:263`).
- **«Owners manage households» de hoy** deja al titular cambiar `owner_user_id` por REST. La comprobación de `is_household_owner` ve la fila vieja y el cambio pasa. Se arregla al quitar la política, pero conviene hacerlo ya en la fase 0, porque `is_household_editor` se apoya en `household_members` y una deriva del invariante dejaría dos «dueños».

---

## Veredicto

**Lo que aguanta tal cual**

- El valor `editor` en el enum, y que los clientes viejos lo lean como `viewer`.
- La matriz de permisos, salvo M-3 y M-4.
- Quitar la escritura directa en `households` y `household_members` (grep de `src/`: 0 escrituras directas).
- La RPC estrecha para que el lector tache, en vez de abrirle la RLS.
- El papel calculado en cada turno y no guardado.
- `prepare_account_deletion` antes de borrar en auth.
- `ui_lang` aparte de `locale`, y `bot_chats.lang` sin lectores (confirmado).
- El plan de evaluaciones del bot.

**Lo que hay que rehacer**

1. **Fase 2 (app del cotitular).** Sin C-1 (estado por casa) y C-2 (versión en cada escritura), dar permiso de escritura al cotitular corrompe la casa. Las dos van **antes** de soltar la RLS de editor.
2. **El modelo de identidad del bot (C-3).** `papelDe` no puede apoyarse en `bot_identities` tal como se escribe hoy.
3. **«Filas a nombre del titular».** Con trigger y no con WITH CHECK más 20 cambios en el cliente (A-7); `activate_household_menu` con casa explícita (A-8). Y reconsiderar en serio la PK por `household_id`, porque A-4 demuestra que los `id` de menú ya colisionan.
4. **Transferencia.** Sin autoborrado de casas `dormant`, resolviendo las colisiones de id y con exclusión mutua en `ensure` (A-3, A-4).
5. **Fase 0.** Añadir el filtro por titular en el bot, no romper el merge del lector y rotar el enlace al expulsar (A-1, A-2).
6. **Salud y lector (A-5).** Es una decisión de producto con coste técnico real: hay que tomarla antes de invitar a nadie de fuera de la familia.
7. **Numeración y pruebas (A-9).** Renumerar y montar el banco desde un volcado de producción.

---

## Decisiones de Pablo (3 oct 2026)

Cierran parte de lo anterior. La propuesta de «alergias solo en privado» queda
descartada; no se reabre sin preguntarle.

- **Alergias y salud las puede cambiar el cotitular** (editor), también en
  grupo. En grupo escriben titular y editor; lector y ajeno solo consultan y
  tachan la compra.
- **El cotitular puede enlazar un chat privado**, no solo el titular.
  Pendiente: hoy `api/_bot/enlace.js` solo deja al titular
  (`owner_user_id`), la matriz de `src/lib/papeles.js` no lo recoge y la app
  no se lo enseña a los editores.
- **Una persona puede ser titular de más de una casa**, en teoría sí. El caso
  raro es una casa `dormant` con contenido tras una transferencia. La UI no lo
  muestra.

Sigue abierta la A-5 (salud y lector): ocultar la salud al lector exige
sacarla del blob de la casa.
