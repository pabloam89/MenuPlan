# Análisis de la familia PRODUCTO Y DATOS (vertical HoMenu)

Fecha: 12 oct 2026. Método: la FICHA, en su orden (primero cómo lo define el repo, luego opinión). Fuentes leídas: `ops/entidades.json`, `docs/entidades/SUPER-TABLA.md`, `ops/MODULOS.json`, `src/data/model.js`, `specs/` (shopping-list, modelo-datos, ficha-de-la-casa, INDEX), migraciones 0002, 0005, 0017, 0057, 0079, `supabase/ESTADO.md`. Cifras de producción leídas hoy en solo lectura (`npm run consulta`, 12 oct 2026): marcadas **Comprobado**. Lo demás es **Creo** si se dice.

## Hallazgos que cambian el planteamiento (léelos primero)

1. **Las 55 tablas de MODULOS.json son 54 en la base.** `store_products` está en MODULOS.json pero no existe en producción (`relation does not exist`; ESTADO.md: «0021 sin aplicar»). Comprobado.
2. **«23 módulos» no es lo mismo que 16.** MODULOS.json tiene 16 módulos y 23 valores distintos de `dueno` en sus tablas: los otros 7 son submódulos (`lola-turnos`, `despensa`, `gente`...). La entidad `module` mezcla módulo y submódulo sin decirlo. Comprobado (contado en MODULOS.json).
3. **La relación `channel-identity → person` que anota entidades.json es falsa.** `bot_identities` guarda `user_id → auth.users` (0057), no una persona de la casa. La persona (`persona`) no tiene ninguna columna que la una a una cuenta ni a un canal. Comprobado (0057 y 0079, FK en la base).
4. **La lista de la compra SÍ se guarda.** `specs/shopping-list.md` dice «vista derivada, sin tabla propia», pero `user_menu_weeks.shopping` (jsonb, 239 filas) guarda lo añadido a mano y los tachados (RPC `household_shopping_mark`, 0072/0087). Es derivada **y** tiene estado propio. La spec está desfasada. Comprobado (0005, `menusSync.js:67`, ESTADO.md).
5. **Ninguna casa llega a `active`.** 35 casas: 31 `dormant`, 4 `invite_ready`, 0 `active`, hoy, después de la 0090. El estado `active` no se alcanza o no se lee. Comprobado. (ESTADO.md ya lo conocía el 8 oct; la cifra no se ha movido.)
6. **Padre-hijo del producto: lo que es tabla frente a lo que es JSON dentro de una fila.** casa→personas es relacional con FK (bien). menú→semanas es relacional con FK. **semana→días→comidas no existe como entidad: es el jsonb `plan`** dentro de `user_menu_weeks`. receta→líneas de ingrediente es un array dentro del JSON de la receta. Comprobado.
7. **Un menú, una despensa y una semana pueden no tener casa:** `household_id` es nullable en `user_menus` (17 de 147 sin casa), `user_pantry` (6 de 116) y `user_menu_weeks` (21 de 239). Comprobado. Son filas de antes de las casas (0017) a las que «cuelgan» de un usuario, no de una casa.

---

## Tabla resumen

| Entidad | Eje | Fuente de verdad real | Padre | Hijos | Filas hoy | Veredicto |
|---|---|---|---|---|---|---|
| `household` | vertical | SQL `households` (+ `household_state` jsonb) | (cuenta dueña) | persona, grupo, menú, despensa, chats, favoritos | 35 | Se queda; arreglar su ciclo de vida |
| `person` | vertical | SQL `persona` (+ copia en `household_state`) | household | alergia, intolerancia, estado, perfil de salud | 92 | Se queda; sus hijas son campos, no entidades |
| `channel-identity` | vertical | SQL `bot_identities` | **usuario (cuenta)**, no persona | — | 6 | Se queda; corregir su padre |
| `recipe` | vertical | JSON en git (+ SQL `user_recipes`) | — (o usuario si es propia) | líneas de ingrediente, pasos | JSON; 16 propias | Se parte en dos orígenes bajo una sola entidad |
| `ingredient` | vertical | JSON `ingredients.json` (+ `alimentos.json` para nutrición) | — | alias, sustitución | ~391 | Decidir si ingrediente y alimento son una o dos |
| `menu` | vertical | SQL `user_menus` > `user_menu_weeks` (jsonb) | household (nullable) | semana, receta guardada | 147 / 239 | Se queda; falta `menu-week` |
| `pantry` | vertical | SQL `user_pantry` | household (nullable) + usuario | — | 116 | Se queda; es colección de líneas, no una cosa |
| `shopping-list` | vertical | Derivada en cliente + estado en `user_menu_weeks.shopping` | menu-week | línea | (239 semanas) | Se queda; corregir la spec |
| `lola-conversation` | vertical | SQL `bot_chats` + `bot_messages` | household | mensaje | 8 chats / 230 mensajes | Se queda; renombrar a `chat` o definir bien |
| `table` | puente | `ops/MODULOS.json` | module | — | 55 (54 reales) | Se queda; 1 fantasma |
| `data-source` | puente | `src/data/model.js` `TABLAS` | — | tablas (4 de 40) | 40 | Se queda; no mezclar con `table` |
| `module` | puente | `ops/MODULOS.json` | — | submódulo, tabla | 16 (+7 sub) | Se parte en módulo y submódulo |
| `migration` | puente | ficheros + `supabase/ESTADO.md` | — | crea tablas | 101 ficheros | Se queda; ESTADO.md es copia manual |

**Entidades de producto que faltan de verdad (con lector):** `user` (cuenta), `menu-week`, `group`, `chat` (si no se funde con `lola-conversation`) y, con menos prueba, `recipe-folder`, `reminder`/`task`. Detalle al final.

---

## household (Casa)

1. **Qué es de verdad.** La unidad que come y comparte menú, despensa y bot; fila de `households` con dueño único (`uq_households_one_owner_per_user`). Definiciones: `ops/entidades.json:383` (`source_of_truth: specs/modelo-datos.md`, que no la define: es una auditoría del catálogo — Comprobado), `supabase/migrations/0017_households.sql:20`, `specs/ficha-de-la-casa.md` («casa: personas, seguridad, cuenta…»). Sin ficha de glosario (`term: null`).
2. **Quién la lee.** Todo el producto: `src/lib/householdsSync.js`, `api/_bot/casa.js`, `invitacion.js`, `papel.js`; 18 tablas llevan `household_id` (Creo, por el grep de FK; Comprobado en las que listé). `copia_lectura` la copia cada noche. Persona: la familia, indirectamente.
3. **Nivel de abstracción.** Pieza (instancia de «casa»); no hay plantilla. Sus «piezas» son lo que cuelga de ella.
4. **Relaciones.**
   - casa → persona: **padre-hijo, 1:N**, FK `persona.household_id` `on delete cascade`. Comprobado.
   - casa → grupo: padre-hijo 1:N, FK cascade. Comprobado.
   - casa ↔ usuario: **N:M** por `household_members(household_id,user_id,role)`, y además 1:1 dueño por `households.owner_user_id` único. Dos sitios para «quién manda»: `owner_user_id` y `role='owner'` (índice parcial `uq_household_members_one_owner`). Comprobado.
   - casa → menú / despensa / semana: padre-hijo 1:N, FK cascade, pero **nullable** (ver hallazgo 7). Comprobado.
   - casa → `household_state`: 1:1, jsonb que repite personas, grupos y ajustes (35 = 35). Comprobado.
   - casa → chat: 1:N, `bot_chats.household_id` not null cascade. Comprobado.
5. **Ciclo de vida.** `setup_status` enum de Postgres `dormant → invite_ready → active`. Cambia la RPC `ensure_user_household`. Hoy 31/4/0. Comprobado. Hay además un enum nativo, que PRINCIPIOS §6 desaconseja («casi nunca»).
6. **Fuente de verdad y copias.** SQL. Copia en `household_state.state` (jsonb con personas y ajustes) y en `persona`/`grupo`: la 0089 las sincroniza por trigger/RPC `persona_sincronizar_casa`. **Dos fuentes para la misma ficha** hasta que el jsonb se retire. Creo que es transición declarada (modelo-datos / PENDIENTES); no he medido desvíos.
7. **Crea / mantiene.** Crea: automática (la app al registrarse, `ensure_user_household`). Mantiene: humano (la familia) + agent (Lola con confirmación en lo de salud). Intervención humana irreducible (es su dato).
8. **Veredicto.** Se queda. Dos arreglos con dato: (a) declarar `source_of_truth` en el SQL (`households`, `persona`, `grupo`) y no en `modelo-datos.md`; (b) 0 casas `active` con 35 casas: o el estado sobra (se retira el enum y se deja `dormant/invite_ready` como campos) o hay un fallo que arreglar. Decisión de Pablo.
9. **Lo que no sé.** Si algún código lee `setup_status = 'active'`. Se averigua con `grep setup_status src api`.

## person (Persona de la casa)

1. **Qué es de verdad.** Alguien que come en la casa (con edad, alergias, estado), no necesariamente con cuenta. Tabla `persona`, clave `(household_id, id)`. `supabase/migrations/0079_personas_y_grupos.sql:18`; `ops/entidades.json:394` (fuente `specs/modelo-datos.md`, que no la describe — Comprobado). Su nombre en inglés choca con `team-member` (resuelto el 11 oct, nota del propio JSON).
2. **Quién la lee.** `api/_bot/ficha.js` (`montarFicha`), el generador de menús, filtros de alergia (`validateMenu.js`), `bot_tareas`. Las tablas `persona_*` solo se escriben por trigger/RPC (MODULOS.json: `fichero_dueno: null`): **ninguna puerta JS propia**. Creo que la lectura va por `household_state`, no por `persona`; sin medir.
3. **Nivel de abstracción.** Pieza. Sus datos de salud son hijos, no plantilla.
4. **Relaciones.**
   - persona → casa: padre-hijo 1:N, FK cascade. Comprobado.
   - persona → alergia, intolerancia, perfil de salud, estado: padre-hijo 1:N, FK compuesta cascade, 4 tablas. Comprobado. Son **atributos multivalor**: valor de un vocabulario cerrado (alérgenos) o texto libre (`persona_perfil_salud.perfil`, texto libre a propósito según su comentario).
   - persona ↔ grupo: N:M por `grupo_persona`. Comprobado.
   - persona ↔ usuario/cuenta: **no existe enlace** en el esquema (ninguna columna). Hoy, «yo» en el bot se resuelve por otro camino (no lo he rastreado). **No sé.**
   - persona ← `sobre` (hechos aprendidos): FK compuesta, 0 filas. Comprobado.
5. **Ciclo de vida.** Sin estado propio; `persona_estado` (embarazo, enfermo…) lleva `hasta` (fecha). Cambia: la familia. 2 filas hoy. Comprobado.
6. **Fuente y copias.** SQL `persona` + copia jsonb en `household_state`. Los ids son uuid en texto: 0 de 92 sin formato uuid. Comprobado (la 0091 los convirtió; la columna sigue `text`, transición en PENDIENTES).
7. **Crea / mantiene.** Humano (familia, app o Lola). Automático: el trigger copia desde el jsonb.
8. **Veredicto.** Se queda. Sus cuatro tablas hijas **no son entidades**: son campos multivalor de la persona (alergia sí lleva vocabulario cerrado; las otras, texto libre). No crear entidades `allergy`, `intolerance`.
9. **Lo que no sé.** Quién lee `persona` frente a `household_state`. Se averigua con `grep -rn "from('persona" src api`; y con `npm run consulta` comparando recuentos.

## channel-identity (Identidad de canal)

1. **Qué es de verdad.** Una cuenta de Telegram/WhatsApp unida a un usuario de la app: `bot_identities`, clave `(channel, external_id)`, `user_id → auth.users` cascade. `0057_bot_cimientos.sql:173`; `ops/entidades.json:405`.
2. **Quién la lee.** `api/_bot/enlace.js` (dueño en MODULOS.json), el enrutador. 6 filas. Comprobado.
3. **Abstracción.** Pieza.
4. **Relaciones.** identidad → **usuario (cuenta)**: referencia N:1 por `user_id` (FK). entidades.json dice «belongs_to person, unaudited»: **es incorrecto** (hallazgo 3). Además `bot_chats` liga un chat a una casa (`linked_by → auth.users` set null): relación identidad–chat–casa sin FK entre ellas, por texto `(channel, chat_id)`.
5. **Ciclo de vida.** Se crea al enlazar (código `bot_link_tokens` / `bot_codigos`); no hay baja explícita salvo borrar la cuenta (cascade). Sin campo de estado.
6. **Fuente y copias.** Solo SQL. Sin copia.
7. **Crea / mantiene.** Automático por el flujo de enlace (el humano pulsa «Conectar Telegram»: irreducible).
8. **Veredicto.** Se queda, pero **su padre es `user`**, no `person`. Eso exige la entidad `user`. Si no se crea `user`, la relación queda sin destino.
9. **Lo que no sé.** Cómo sabe Lola qué persona de la casa es quien escribe (autor `bot_messages.author_id` es texto). Se averigua leyendo `api/_bot/casa.js`.

## recipe (Receta)

1. **Qué es de verdad.** Un plato con ingredientes, pasos y nutrición. Dos orígenes: catálogo JSON en git (`src/data/recipes/*.json`, desde la 0064 única fuente) y recetas de la casa/usuario en SQL (`user_recipes`, 16 filas). `src/data/model.js:155`; `ops/entidades.json:416`. La nota del JSON dice «recipe_id es polimórfico por prefijo» (Comprobado en `PRINCIPIOS.md:50`: «catálogo del bundle, polimórfica o externa»).
2. **Quién la lee.** `solver.js`, `validateMenu.js`, `aiPlanner.js`, `bases.js`, `api/share-recipe.js`, `api/_bot/propias.js`, Lola. Alta densidad de lectores.
3. **Abstracción.** Pieza de plantilla `recipeSchema.js`. Subtipos por `type`: completo, principal, guarnición, salsa, **base** (`bases.json`): son subtipos **es-un** dentro del mismo esquema.
4. **Relaciones.**
   - receta → ingrediente: **N:M con atributos** (cantidad, unidad), guardado en el JSON como `ingredients[].ingredientId`, cobertura 100% (model.js:200). No es FK de base.
   - receta → paso / pasos por aparato: padre-hijo 1:N dentro del mismo JSON (`steps`, `stepsRich`) y fichero aparte `recipeStepsByAppliance.json`.
   - receta ← menú, favorito, voto, descarte, cocinado: referencias `recipe_id text` **sin FK** (el padre está en git). Comprobado en `household_favorites`, `user_menu_recipes`, `recipe_votes`.
   - receta propia → usuario: `user_recipes.owner_id` cascade. Comprobado.
   - receta ↔ carpeta: N:M por `recipe_collections`.
5. **Ciclo de vida.** Reserva ↔ Recetario por `estrella` (booleano); las propias tienen tabla de lápidas (`user_recipe_deletions`, 0094). Cambia: agent (tandas) + human (juicio manual).
6. **Fuente y copias.** JSON en git = fuente. SQL (`recipes`, `recipe_ingredients`) **retiradas en la 0093** (Comprobado en ESTADO.md). Queda copia en `user_menu_recipes.recipe_snapshot` (3.670 filas, jsonb por menú): copia deliberada (para que el menú no cambie si la receta cambia), aunque sin declarar como proyección. Creo.
7. **Crea / mantiene.** Catálogo: agent (LLM con contrato) + curación humana; propias: humano.
8. **Veredicto.** Se queda como **una entidad con dos orígenes** (`catalogo`/`propia`); no partir en dos entidades. Pero falta decir en el modelo que el id es polimórfico y qué prefijos hay (hoy solo prosa).
9. **Lo que no sé.** El número exacto de prefijos de `recipe_id` y cuántos ids de menú ya no existen en el JSON. Se averigua cruzando los ids de `user_menu_recipes` con `src/data/recipes/*.json` en un script de solo lectura.

## ingredient (Ingrediente)

1. **Qué es de verdad.** Lo que pide una receta (nombre, pasillo, alérgenos, unidad por defecto). Fuente `src/data/ingredients.json`; la nutrición vive aparte en `alimentos.json`. `src/data/model.js:114-153`; `ops/entidades.json:427`.
2. **Quién la lee.** `src/lib/ingredients.js`, `kitchenUnits.js`, `shoppingBuilder.js`, `scripts/audit-catalog.mjs`, build de alimentos.
3. **Abstracción.** Pieza. `model.js:118` dice textualmente: «Ingrediente y alimento son **dos entidades con los mismos ids hoy**, no dos copias: el ingrediente es lo que pide la receta, el alimento es lo que se analiza». entidades.json solo tiene una.
4. **Relaciones.** ingrediente → alimento: **1:1 hoy por identidad de id** (`alimentoPorIngrediente`). ingrediente → alias y sustitución: padre-hijo 1:N, en JSON. Despensa → ingrediente: referencia por `user_pantry.ingredient_id` (texto, sin FK, cobertura 108/116 = 93% — Comprobado), pero la clave única de la despensa sigue siendo el **nombre normalizado**.
5. **Ciclo de vida.** Sin estado; se añade en tandas (frecuencia `release`).
6. **Fuente y copias.** JSON en git. La copia SQL (`ingredients`, `ingredient_aliases`, `ingredient_substitutions`) se borró en la 0093. Densidad, fracción comestible y familia viven en tres JSON aparte por ingrediente y se copian a `alimentos` en el build (derivado declarado).
7. **Crea / mantiene.** Humano (curado a mano) con agent en nutrición.
8. **Veredicto.** Se queda. Decisión abierta: **¿una entidad `ingredient` con dos caras, o dos (`ingredient`, `food`)?** Dato que decide: la nota de `model.js:118` dice dos; MAPA dice una. Mientras el id sea el mismo, recomiendo una entidad y registrar `food` como **fuente de datos** (`alimentos`), que ya lo es. Si un día un alimento sirve a varios ingredientes, se parte.
9. **Lo que no sé.** Si alguna vez id de alimento y de ingrediente divergen. `build-alimentos.mjs` lo diría; leerlo.

## menu (Menú)

1. **Qué es de verdad.** Un plan de comidas generado o editado, con varias semanas. `user_menus` (id texto `(user_id,id)`) > `user_menu_weeks` (jsonb `plan`, `shopping`, `schedule`) > `user_menu_recipes` (receta + snapshot). `0005_multiweek_menus.sql`; `ops/entidades.json:438` (fuente `specs/menu-generation.md`).
2. **Quién la lee.** `src/lib/menusSync.js`, `api/_bot/casa.js` (escribe), `shoppingBuilder.js`, `api/_bot/menu.js`, compartir (`shared_menus`, `menu_share_links`), Lola.
3. **Abstracción.** Pieza; su plantilla es el jsonb `plan` (sin esquema en SQL, solo validación en JS `validateMenu.js`).
4. **Relaciones.**
   - menú → semana: **padre-hijo 1:N**, FK compuesta `(user_id, menu_id)` cascade, `unique (user, menu, week_offset)`. Comprobado.
   - semana → día → comida: **no hay entidad ni tabla**; vive en `plan` (jsonb, `menuPlan[grupo]["día-comida"]`). Contención sin id de base.
   - menú → receta: N:M con snapshot, `user_menu_recipes (menu_id, recipe_id text)`; sin FK a receta. Más la referencia dentro del jsonb.
   - menú → casa: padre-hijo, FK `household_id` cascade, **nullable** (17/147). Y además `user_id → auth.users`: dos padres posibles (usuario y casa) y la clave primaria es `(user_id,id)`, no de casa. Comprobado.
5. **Ciclo de vida.** `is_active` (uno por casa/usuario, índice único parcial), `is_favorite`, `variety_pref` (`strict|moderate|relaxed`, CHECK). Cambia: RPC `activate_user_menu`; la familia o Lola.
6. **Fuente y copias.** SQL. Copias: `user_menu_recipes.recipe_snapshot` y el jsonb `plan` repiten datos de la receta (deliberado). `shared_menus` copia el menú para compartir. Creo que `shopping` se recalcula del `plan`: dato repetido por diseño (caché + estado de tachado mezclados).
7. **Crea / mantiene.** Agent (generador/Lola) o humano; edición humana normal.
8. **Veredicto.** Se queda, y **se añade `menu-week`** (tabla real de 239 filas con su clave y su propio estado: `shopping`, `schedule`). Día y comida **no** son entidades hoy (sin id, sin lector individual): no inventarlas; solo pasarán a serlo si se sacan del jsonb. Hay que decidir `menu` y `menu-week` frente a la casa: hoy cuelgan de `user_id`.
9. **Lo que no sé.** Si el id de menú (`text`, formato libre) tiene CHECK de prefijo (entidades.json dice `prefixed_text`). Se averigua con `pg_constraint` sobre `user_menus`.

## pantry (Despensa)

1. **Qué es de verdad.** Lo que la casa tiene en casa (ingredientes y, desde la 0014, platos cocinados/congelados). Tabla `user_pantry` (116 filas), una fila por ingrediente/estado. `0002_user_pantry.sql`, ampliada 0006/0007/0009/0014/0041. `ops/entidades.json:449` (fuente `specs/modelo-datos.md`, que no la describe).
2. **Quién la lee.** `src/lib/pantry.js`, `pantryDeltas.js`, `cookPantry.js`, `api/_bot/despensa.js`, `shoppingBuilder.js` (descuento), receipt-ocr.
3. **Abstracción.** Es una **colección de líneas**, no una cosa: lo que se maneja es la línea (`user_pantry`), no «la despensa». La despensa es la casa vista a través de sus líneas.
4. **Relaciones.**
   - línea → casa: FK `household_id` cascade, nullable (6/116). Y `user_id → auth.users` cascade. Dos padres.
   - línea → ingrediente: `ingredient_id text` sin FK; 108/116 con valor. **Comprobado.** La clave única es `(household_id, user_id, ingredient_normalized, frozen)`: **por nombre normalizado**, no por id (viola PRINCIPIOS §5, «relaciones por id, nunca por nombre»).
   - línea → receta cocinada: `recipe_ref` (0 de 116 con valor). Comprobado: los campos `item_type`, `portions`, `recipe_ref`, `cooked_at`, `garnish_ref` no tienen uso en producción (`item_type` = «ingredient» en las 116). **Campos sin dato** (PRINCIPIOS §8: ningún campo sin lector); lector sí hay en código (`cookPantry.js`), uso real 0.
5. **Ciclo de vida.** Fila nace al añadir (manual, voz, ticket) y se actualiza (`updated_at`). Sin estado; `frozen`, `location`. Cambia: la familia, Lola, receipt-ocr.
6. **Fuente y copias.** SQL. Sin copias; el nombre se repite como texto (`ingredient_name`, `ingredient_normalized`) además del id.
7. **Crea / mantiene.** Humano (cada compra) con agent (OCR de tickets, voz). Intervención humana irreducible, pero evitable en parte con tickets.
8. **Veredicto.** Se queda como entidad; su clave pasa de nombre a `ingredient_id` cuando la cobertura sea 100% (hoy 93%). Los campos de «cocinado» (4-5 columnas sin uso) son candidatos a otra entidad `leftover` si algún día se usan; hoy se anotan, no se inventa.
9. **Lo que no sé.** Si el 7% sin `ingredient_id` son nombres libres válidos. Se averigua con `select ingredient_name from user_pantry where ingredient_id is null` (contando, no imprimiendo).

## shopping-list (Lista de la compra)

1. **Qué es de verdad.** Dos cosas con el mismo nombre. (a) La **vista derivada** que calcula el cliente: `buildShoppingList(menuPlan, groups, meals, pantryIngredients)` (`specs/shopping-list.md:1`, «no es una entidad persistida»). (b) El **estado persistido**: `user_menu_weeks.shopping` (jsonb), con tachados y ítems manuales, escrito por `household_shopping_mark` (0072/0087) y `menusSync.js:67,331,395`. La spec sólo describe (a). Comprobado.
2. **Quién la lee.** `shoppingBuilder.js`, `shoppingListUtils.js`, `api/_bot/` (lista a Mercadona), la app. Lola.
3. **Abstracción.** Pieza derivada con estado.
4. **Relaciones.** lista → semana de menú: **parte-de 1:1** (una por semana), guardada en columna jsonb. Lista → despensa: referencia por **solapamiento de palabras del nombre** (`matchesPantry`), no por id (nota de entidades.json: «se cruza por nombre y unidad, sin id»). Lista → ingrediente: por `normalizeIngredientKey(name, unit)`, nombre. Comprobado en la spec.
5. **Ciclo de vida.** Se recalcula al cambiar menú o despensa; los tachados se conservan. Cambia: la familia al tachar; Lola.
6. **Fuente y copias.** El menú es la fuente; la lista es proyección **y** guarda parte del estado en la misma celda: un jsonb mezcla caché recalculable y decisión humana (tachado). Riesgo: al regenerar, ¿se pierden los tachados? **No sé.**
7. **Crea / mantiene.** Automática (cálculo) + humano (tachar, añadir).
8. **Veredicto.** Se queda, pero **partir en dos**: `shopping-list` (derivada, no persistida) y `shopping-mark` (estado persistido de una línea tachada o manual, que hoy vive en jsonb). Mientras sea jsonb dentro de la semana, basta con una nota en la spec y en entidades.json (`stored_as: field`, `stored_in: user_menu_weeks.shopping`). Decisión de modelado, no urgente.
9. **Lo que no sé.** Qué pasa con los tachados al regenerar el menú de la semana. Se averigua en `menusSync.js` y en `shoppingListUtils.js`.

## lola-conversation (Conversación con Lola)

1. **Qué es de verdad.** La charla entre una casa y Lola en un canal. Tablas: `bot_chats` (chat → casa, 8 filas), `bot_messages` (historial corto, 230 filas, se purga a los pocos días), `bot_cola` y `bot_candados` (turnos), `bot_entradas`, `bot_idempotencia`. `specs/plan-bot-mensajeria.md`; `0057_bot_cimientos.sql:183-217`; `ops/entidades.json:471`.
2. **Quién la lee.** `api/_bot/agente.js` (historial), `turnos.js`, `entradas.js`, `idempotencia.js`; evals de Lola (`measures`); retención `bot-retencion` (pg_cron 03:17).
3. **Abstracción.** Pieza. Hay mezcla de dos cosas: el **chat** (contenedor estable: canal + chat_id + casa) y la **conversación** (los mensajes, efímera). Y una tercera, la **cola de turnos** (infraestructura, no conversación).
4. **Relaciones.**
   - chat → casa: padre-hijo N:1, FK cascade. Comprobado.
   - mensaje → chat: **por texto `(channel, chat_id)` sin FK** (en la base, `bot_messages` solo tiene FK a `households`). Comprobado en la lista de FK. `household_id` de mensaje es nullable.
   - mensaje → autor: `author_id text`, sin FK (¿persona, usuario, id de Telegram? **No sé**).
   - `bot_candados` se clava solo por `chat_id`, sin canal (nota de entidades.json): un `chat_id` de Telegram y uno de WhatsApp podrían chocar.
   - recordatorio / tarea → casa: FK cascade; recordatorio → tarea con `bot_reminders_tarea_fk NOT VALID` (Comprobado; en PENDIENTES).
5. **Ciclo de vida.** Mensajes: nacen, se purgan a los N días. Recordatorio: `pending → sent|cancelled`. Tarea: 6 estados (`abierta, aplazada, hecha, descartada, caducada, rechazada`). Cambia: Lola, la familia, cron.
6. **Fuente y copias.** SQL. Sin copias; el contenido es jsonb.
7. **Crea / mantiene.** Automática (cada mensaje) con humano (el que escribe).
8. **Veredicto.** Se queda, **renombrar/partir**: `chat` (`bot_chats`, estable, ya tiene su identidad) frente a `message` (efímero). `lola-conversation` como entidad única esconde que su padre real (el chat) es otra cosa. Recordatorios y tareas (`bot_reminders`, `bot_tareas`) son **entidades de Lola con casa** (ver «Lo que falta»).
9. **Lo que no sé.** El contenido de `bot_messages.author_id`. Se averigua leyendo `api/_bot/agente.js` y `contexto`.

---

## table (puente)

1. **Qué es de verdad.** Una tabla de la base, con su módulo dueño. `ops/MODULOS.json` (`tablas.<t>.dueno`, `fichero_dueno`, `sin_puerta`); nombres/estructura en `PRINCIPIOS.md`. `ops/entidades.json:325`.
2. **Quién la lee.** `ops/modulos.test.js`, `supabase/cableado.test.js`, `ops/fuentes.test.js`, `scripts/verificar-estado.mjs`, `scripts/lib/migraciones.mjs`.
3. **Abstracción.** Pieza.
4. **Relaciones.** tabla → módulo: **parte-de N:1** (campo `dueno`). Comprobado. migración → tabla: «creates», `stored_as: none` (el vínculo vive en el SQL, no en un campo). data-source → tabla: solo 4 de 40 la listan.
5. **Ciclo de vida.** Se crea (migración), se retira (`drop` en una migración, p. ej. la 0093 con 7 tablas) o queda fuera de migraciones (`apple_auth_tokens`: creada a mano en el panel). Cambia: la migración.
6. **Fuente y copias.** Fuente real = la base viva; MODULOS.json es el registro con test. **Un caso sin base:** `store_products` está en MODULOS.json y no existe en producción (hallazgo 1). Comprobado.
7. **Crea / mantiene.** Humano/agent al escribir la migración; el registro lo mantiene el agent `datos`.
8. **Veredicto.** Se queda. Dato: 55 registradas, 54 existentes; la 55ª pertenece a una migración sin aplicar. Distinguir `registrada` de `existente` (campo o estado) evitaría contar la fantasma.
9. **Lo que no sé.** Si hay tablas reales sin registrar (el test `modulos.test.js` lo vigila, creo). Se averigua comparando `information_schema.tables` con MODULOS.json.

## data-source (puente)

1. **Qué es de verdad.** Un sitio de donde sale un dato, con rol (`ingesta`, `fuente_de_verdad`, `derivado`, `copia_retirada`), estado y frecuencia. `src/data/model.js` (`TABLAS`, 40 ids), `ROLES_FUENTE`, `ESTADOS_FUENTE`, `FRECUENCIAS`. Definiciones de roles en `specs/INDEX.md`.
2. **Quién la lee.** `src/data/model.test.js` (cobertura como trinquete), `ops/fuentes.test.js`, `ops/lecturasRetiradas.test.js`, scripts de catálogo.
3. **Abstracción.** Pieza (instancia de una plantilla de campos). Sus «campos» (`campos`, con `plano` y `cobertura_min`) son una mini-plantilla.
4. **Relaciones.** fuente → fichero: parte-de (`ficheros`). fuente → tabla SQL: campo `tablas`, **solo en 4 de 40** (entidades.json). fuente → fuente: «productor/consumidores» en texto. Su id (`recetas`, `ingredientes`, `alimentos`) **no coincide** con el de ninguna tabla ni módulo (Comprobado).
5. **Ciclo de vida.** `vivo → deprecado → retirado`, `fuente_de_verdad → copia_retirada` (Comprobado). Cambia: humano/agent en el PR; `fuentes.test.js` vigila la coherencia con las migraciones.
6. **Fuente y copias.** `model.js` es la fuente. Se repite en `specs/` en prosa.
7. **Crea / mantiene.** Humano/agent, al cambiar el catálogo.
8. **Veredicto.** Se queda **separada de `table`**: una fuente puede ser un JSON (sin tabla) o varias tablas; son planos distintos (dato de producto vs objeto físico). No fusionar; sí completar `tablas` en las 36 fuentes SQL/mixtas que no la declaran (los datos de producto de la casa, p. ej. `user_menus`, **ni siquiera tienen una fuente** en `TABLAS`: Creo, sin contar los 40 ids uno a uno).
9. **Lo que no sé.** Cuántas tablas de las 54 reales tienen una fuente en `model.js`. Se averigua cruzando `TABLAS[].tablas` con MODULOS.json.

## module (puente)

1. **Qué es de verdad.** Una unidad de código y datos con dueño, ficheros, tests y métricas. `ops/MODULOS.json` (`modulos`, 16). `ops/entidades.json:349`: «16 módulos; cada tabla tiene un dueño».
2. **Quién la lee.** `ops/modulos.test.js`, `scripts/` de módulos, `/orquestar` (zonas), `metricas`.
3. **Abstracción.** Pieza. Los **submódulos** (`submodulos`) son otra capa: la propiedad de las tablas se asigna a submódulos, no a módulos (`tablas.<t>.dueno` toma valores como `lola-turnos`, `despensa`, `gente`...). 23 valores distintos de dueño frente a 16 módulos. Comprobado.
4. **Relaciones.** módulo → submódulo: **parte-de 1:N** (`submodulos`). submódulo → tabla: parte-de 1:N. módulo → métrica: parte-de (`metricas[]`, que choca con `ops/metricas.json`, ver entidades.json).
5. **Ciclo de vida.** Sin estado salvo `grado` y `apagado` (el módulo `gente` está apagado: `apagado_por`, spec `gente-apagada.md`).
6. **Fuente y copias.** MODULOS.json. Sin copia.
7. **Crea / mantiene.** Humano/agent (`datos`, `gobierno`).
8. **Veredicto.** **Se parte en `module` y `submodule`** (o `module` con campo `parent`): la nota «16 módulos y 55 tablas todos de HoMenu» contradice los 23 dueños. Dato: 16 ≠ 23.
9. **Lo que no sé.** Si los 7 sobrantes son todos submódulos o alguno es un módulo de segundo nivel. Se averigua leyendo el campo `submodulos` de cada módulo (hecho: aparecen todos, creo).

## migration (puente)

1. **Qué es de verdad.** Un fichero SQL numerado que cambia la base (que es producción). `supabase/migrations/`, registro de verdad `supabase/ESTADO.md`; `ops/entidades.json:313` (`number_with_name`). `PRINCIPIOS.md` y la regla `migraciones`.
2. **Quién la lee.** `scripts/apply-migration.mjs`, `verificar-estado.mjs`, `supabase/migrations.test.js`, `ops/fuentes.test.js`, guardia, arranque.
3. **Abstracción.** Pieza con cabecera tipada (qué hace, consultas previas, testigo).
4. **Relaciones.** migración → tabla: «creates», `stored_as: none` (en entidades.json). El enlace vive en el cuerpo SQL y lo extrae `scripts/lib/migraciones.mjs`. migración → entorno: `applied_in`, guardado en ESTADO.md. migración → migración: orden numérico (`0003`, `0006`, `0051` repetidos; la `0080b` es manual).
5. **Ciclo de vida.** Escrita → ensayada (ensayo < 1 h) → con OK de `auditor-datos` → aplicada (Pablo `--si`, `--pablo` si `CONTRAE`/RLS) → registrada en ESTADO.md. Comprobado en CLAUDE.md. Hoy sin aplicar: `0021_store_products` y `0098_enums_salsa`.
6. **Fuente y copias.** La fuente de verdad del «aplicada o no» es la **base viva** (`verificar-estado` con testigos); ESTADO.md es una **copia escrita a mano** (la tabla de Supabase tiene 12 filas de 100; Comprobado en la skill). Un dato en dos sitios, sin generar uno del otro.
7. **Crea / mantiene.** Agent (`datos`) crea; humano (Pablo) aplica. Intervención humana irreducible (decisión de producción).
8. **Veredicto.** Se queda. Mejora: generar ESTADO.md (o su cabecera de resumen) desde `verificar-estado` en vez de a mano; el principio «cada dato en un solo sitio» (§4) lo pide. Con dato: 101 ficheros y 1 registro a mano.
9. **Lo que no sé.** Cuántas filas de ESTADO.md discrepan hoy de la base. Se averigua con `node scripts/verificar-estado.mjs` (solo lectura).

---

## ¿Qué entidades del producto faltan de verdad?

Criterio: tabla o fuente real, con lector en código, y no reducible a un campo. Solo cuento las que cumplen las tres.

| Candidata | Prueba (dato) | Lector | Veredicto |
|---|---|---|---|
| **`user` (cuenta de la app)** | `auth.users` es el padre de 34 FK de 29 tablas (skill `supabase`); `user_profiles` 58 filas; `household_members.user_id`; `bot_identities.user_id`; `owner_id` de recetas propias | login (`useAuth.js`), RLS, todas las `user_*` | **Falta. La más clara.** Hoy hay `person` y `team-member` pero no la cuenta. Sin ella, `channel-identity` y `household-member` no tienen padre. Ojo con el nombre en inglés: `user` frente a `team-member` (equipo) y `person` (comensal). Sugiero `account`. |
| **`menu-week`** | Tabla `user_menu_weeks`, 239 filas, clave `(user,menu,week_start)`, con `plan`/`shopping`/`schedule` | `menusSync.js`, `shoppingBuilder`, bot | **Falta.** Es la unidad real de lectura y escritura del menú (no el menú entero). |
| **`group` (grupo)** | `grupo` 34 filas + `grupo_persona`; los nombres de los grupos van a la ficha de Lola | `ficha.js`, planificador | **Falta, pero es una entidad pequeña dentro de casa.** Pertenece a household. |
| **`chat`** | `bot_chats` 8 filas, clave `(channel,chat_id)`, la liga a casa; mensajes por texto sin FK | enlace, enrutador | **Falta como entidad separada de `lola-conversation`** (ver ficha). |
| **`household-member`** (relación casa–cuenta con rol) | `household_members` 36 filas, `role` | `papel.js`, RLS `is_household_member` | **Relación con atributo**, no entidad; documentar en `relations`. |
| **`recipe-folder`** | `recipe_folders` 6, `recipe_collections` | `recipeCollections.js` | Entidad del usuario, pequeña: **añadir si se deja la app como respaldo largo**; hoy bajo `recetas`. Creo. |
| **`reminder` / `task`** | `bot_reminders` 1, `bot_tareas` 0 filas; estados y vocabularios propios | `recordatorios.js`, `tareas.js` | **Existen en código y vocabulario** (6 estados en un CHECK `NOT VALID`) pero sin uso real (1 y 0 filas). Registrar cuando haya uso; no antes. |
| `cooking` (cocinado) | `cookings` 3 filas | `cookingsSync.js` | **Es un evento**, no una entidad (anota «cocinada la receta X el día D»). Pasa a tipo de evento. |
| `recipe-vote`, `favorite`, `discard` | 20 / 14 / 0 filas | sync por tabla | **Son relaciones casa–receta con atributo**, no entidades. |
| `allergy`, `intolerance`, `health-profile`, `state` de persona | 14, ?, ?, 2 filas | `ficha.js` | **Campos multivalor de `person`**, no entidades. |
| `share-link` (`recipe_share_links`, `menu_share_links`), `shared_menu`, perfiles sociales | 0 / 0 / 5 / 32 filas | `compartir.js`, `social.js` | Módulos **apagados o sin uso** (`gente-apagada.md`). No entidades hasta que se reactiven. |
| `store-product` / precio | `store_products` **no existe**; precios en `public/store/mercadona.json` | `storeCatalog.js` | **Fuente de datos (`precios`), no entidad SQL.** Retirar la tabla del registro hasta que exista. |
| `batch` / tanda | solo `specs/batch-cooking.md`; ningún campo real en uso (las columnas de «cocinado» de la despensa no tienen datos) | — | **No inventar.** Sin lector con datos. |
| `day` / `meal` (comida) | solo dentro del jsonb `plan` | `validateMenu.js` y el generador leen el jsonb | **No son entidades hoy.** Lo serían solo al sacarlas del jsonb. |

## Relaciones padre-hijo: resumen con su estado real

| Padre → hijo | Clase | Enlace real | Estado |
|---|---|---|---|
| casa → persona | padre-hijo 1:N | FK `persona.household_id`, cascade | Sólido (Comprobado) |
| persona → alergia/intolerancia/estado/salud | padre-hijo 1:N | FK compuesta cascade | Sólido; 3 de 4 con texto libre |
| casa → grupo; grupo ↔ persona | padre-hijo + N:M | FK compuestas cascade | Sólido |
| menú → semana | padre-hijo 1:N | FK `(user_id, menu_id)` cascade | Sólido, pero cuelga de usuario |
| semana → día → comida | contención | **jsonb `plan`** | Sin entidad ni id |
| menú → casa / despensa → casa | padre-hijo | `household_id` nullable (17/147, 6/116, 21/239 sin casa) | **Con huecos** |
| receta → línea de ingrediente | N:M con atributos | JSON `ingredients[].ingredientId` (100%) | Sólido en JSON, sin FK |
| menú/favorito/voto → receta | referencia | `recipe_id text`, sin FK, polimórfico | **Sin garantía** (el padre está en git) |
| despensa → ingrediente | referencia | `ingredient_id` (93%), clave por **nombre** | **Cruce por nombre** |
| lista → despensa | referencia | solapamiento de palabras | **Cruce por nombre** |
| chat → mensaje | padre-hijo | `(channel, chat_id)` texto, sin FK | **Sin FK** |
| identidad de canal → persona | (como figura) | **no existe**; es identidad → cuenta | **Relación mal anotada** |

## DECISIONES PENDIENTES (para la sesión principal)

1. **Añadir la entidad `account` (cuenta de la app)** y corregir `channel-identity → account`. Recomendado. Coste: editar `ops/entidades.json` y MAPA y las relaciones `unaudited` (poco tiempo). Reversible.
2. **Corregir entidades.json con lo comprobado:** `channel-identity` pasa de «belongs_to person» a «belongs_to account»; `shopping-list` pasa a «derivada + estado en `user_menu_weeks.shopping`»; `module` separa submódulo. Hoy esas relaciones son `unaudited`, con datos para auditarlas.
3. **Casas `active`: 0 de 35.** Decidir si el estado `setup_status` se arregla o se retira el enum. Toca RLS/permisos de datos de familias → `--pablo` si cambia. Es de `datos`.
4. **`menu-week` como entidad** y decidir si menú y despensa cuelgan de la casa (no del usuario): hay 44 filas sin casa (17+6+21). Migración con `CONTRAE` posible → `--pablo`.
5. **`ingredient` + `food`:** una o dos entidades (la nota de `model.js:118` dice dos; MAPA, una).
6. **`store_products`:** está en MODULOS.json y no existe en la base. Quitarla del registro o aplicar la 0021 (nadie la lee: «ningún campo sin lector»).
7. **Spec desfasada:** `specs/shopping-list.md` dice «sin tabla propia». Actualizarla.
