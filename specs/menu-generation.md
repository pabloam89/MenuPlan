# Dominio: Generación de menús

## 1. Contrato funcional

**Qué hace.** Genera un menú semanal por grupo familiar, asignando una receta del catálogo (nunca inventada) a cada hueco (día × comida × grupo), respetando restricciones dietéticas/alergias, variedad, y reglas gastronómicas (no repetir proteína el mismo día, primero+segundo coherentes, etc.). Incluye también la importación de menú escolar desde PDF/imagen/CSV (subdominio relacionado, mismo endpoint de IA).

**Entrada** (`generateMenuWithAI(data, opts)`, `src/lib/aiPlanner.js:1274`):
- `data`: perfil del hogar completo (miembros, restricciones, utensilios disponibles, horario semanal).
- `opts.pantryIngredients`, `opts.pantryStrict`: para el modo "usar la despensa".
- `opts.crossWeek`: `{ weekIndex, weekCount, varietyPref }` — evita solapes entre semanas generadas en paralelo (ver más abajo).
- `opts.plannerModel`: `claude-sonnet-4-6` por defecto (`DEFAULT_MODEL = PLANNER_MODEL`, `src/lib/aiModels.js:6`), resoluble a `claude-haiku-4-5-20251001` vía `?planner=haiku`, `localStorage.mp_planner_model`, o AB testing (`resolvePlannerModel()`, `aiModels.js:43`).

**Salida**: `{ plan, warnings }` — un objeto `menuPlan[groupId][`${day}-${meal}`] = { recipeId, firstRecipeId?, eaters, mode }` más avisos en español cuando una regla no se pudo cumplir del todo.

**Invariante central — nunca hueco vacío, con una excepción documentada por el propio código** [CORREGIDO 2026-08-22 tras auditoría de integridad]: la generación pasa por un pipeline de 3 capas, en este orden estricto (`aiPlanner.js:800-899`):
1. **Validación de esquema** (Zod, `LLMResponseSchema`) sobre la respuesta cruda del LLM. Si falla, un reintento con `RETRY_MODEL` (Haiku) pidiendo JSON corregido.
2. **Validación de reglas de negocio** (`validateMenu()`) — hasta `MAX_RETRIES = 2` vueltas pidiendo al LLM que corrija violaciones concretas (mensaje de corrección generado por `buildCorrectionMessage(violations)`, con el intento de reintento en Sonnet la primera vez y Haiku la segunda).
3. **Fallback determinista** (`applyFallback()`, en `src/utils/validateMenu.js:882-904`, no en `aiPlanner.js` como se afirmaba antes) intenta 4 niveles de relajación de reglas antes de repetir un plato. **Verificado que la garantía NO es absoluta**: si tras los 4 niveles ningún candidato del catálogo filtrado cumple las restricciones duras (tiempo máximo, tupper-friendly, rol del slot), la función hace `unfixed.push(v)` sin rellenar el hueco (`validateMenu.js:902-904`), y `aiPlanner.js` (comentario explícito en líneas 900-923, "3b/3c. Last-resort safety net") confirma que en ese caso el usuario ve un día con un curso menos de los configurados, con un `warning` explicando el motivo pero sin plato asignado. Reproducible con restricciones muy estrictas combinadas (p. ej. tiempo máx. 15 min + modo tupper) que dejan el catálogo filtrado sin ningún candidato válido para ese slot concreto. El comentario original de `aiPlanner.js:887` sobre "arroz de primero y arroz de segundo" sigue siendo válido para el caso en que SÍ hay fallback (repetición), pero no cubre este caso límite donde ni repetir es posible.

**Invariante del catálogo**: el LLM **nunca genera recetas nuevas** en este flujo — solo elige `recipeId` de un catálogo cerrado que se le pasa en el prompt. La creación de recetas nuevas por IA es un dominio distinto (ver `recipe-catalog.md`, `generateUserRecipeDraft`).

**Menú escolar** (`src/lib/menuParser.js`): extrae `{semanas:[{numero, dias:[{dia, primero, segundo, postre, kcal, macros}]}]}` desde PDF/imagen (vía `task: "school-menu"` en `/api/generate`, modelo `PARSER_MODEL` = `claude-sonnet-4-6`) o CSV (parseo local con `papaparse`, sin IA). Un solo reintento con los errores de validación Zod inyectados como mensaje de corrección (`menuParser.js:110-144`). [CORREGIDO 2026-08-22]: **sí hay fallback**, verificado en `src/lib/schoolMenuImport.js:608-657` — `importPdfMenu`/`importCsvMenu`/`importImageMenu` envuelven la llamada IA en un `try/catch` que, ante cualquier fallo (incluida la excepción tras el reintento fallido), cae a extracción de texto local (`extractTextFromPdf`/`extractTextFromCsv`/`extractTextFromImage`) + parseo por regex (`parseSchoolMenuText`/`parseSchoolMenuCsv`), sin avisar al usuario de que el pipeline de IA falló — produce un menú (potencialmente más pobre) en vez de propagar el error tal cual.

## 2. Modelo de datos

### `user_menus` / `user_menu_weeks` / `user_menu_recipes`
| Tabla | Campos críticos | Origen de la restricción |
|---|---|---|
| `user_menus` | `id` (text, PK), `user_id`, `is_active` (bool), `variety_pref` | Solo un menú puede ser `is_active=true` por usuario. [CORREGIDO 2026-08-22]: **sí existe constraint DB** — índice único parcial `uq_user_menus_one_active` (`supabase/migrations/0005_multiweek_menus.sql:23-25`, confirmado activo en producción), sobre `(COALESCE(household_id,...), user_id) WHERE is_active`. Un `UPDATE` directo que violara la invariante fallaría con `unique_violation`, no la rompería en silencio. `activate_household_menu()` sigue siendo quien orquesta el cambio en la práctica, pero el índice es quien la garantiza de verdad. `src/lib/menusSync.js:236-238` referencia este índice por nombre. |
| `user_menu_weeks` | `plan` (jsonb), `shopping` (jsonb, default `{"items":[]}`), `schedule` (jsonb), `week_offset`, `start_day_idx` | `UNIQUE (menu_id, user_id, week_offset)` (`uq_user_menu_weeks_offset`) — DB |
| `user_menu_recipes` | `recipe_snapshot` (jsonb) | Snapshot congelado de la receta en el momento de generar el menú — si el catálogo cambia después, el menú histórico no cambia. Sin validación de esquema en el snapshot (jsonb libre) |

Todas con `household_id` (nullable, sin uso real — ver `auth.md`).

RLS: `Users manage own menus/weeks/recipes` (`auth.uid() = user_id`), más las políticas `Household owners/members ...` inertes descritas en `auth.md`.

### Catálogo (`recipes` — ver detalle completo en `recipe-catalog.md`)
**Corrección del 9 oct 2026** (issue #249): lo que aquí se describía —un hot-swap que dejaba a la tabla `recipes` de Supabase servir el catálogo si `catalog_meta.version` iba por delante— **ya no existe**. Desde el 30 sep 2026 (migración 0064) la generación se sirve **solo del JSON** bundleado (`src/data/recipes/*.json`), validado siempre, incondicionalmente, al importar `recipeCatalog.js`; si está roto, la app falla al arrancar. Las tablas `recipes`, `recipe_ingredients`, `dish_images` y `catalog_meta` son una *copia retirada* (v27, 8 sep 2026) que nadie lee; `src/data/catalogoUnaFuente.test.js` lo vigila. `aiPlanner.js` ve el resultado ya resuelto (`recipeCatalog`/`recipeCatalogById`). Qué recetas se proponen: el **Recetario** (`estrella:true`); la **Reserva** (el resto) no sale. Roles de cada fuente: `ops/MODULOS.json` (`fuentes_de_datos`).

## 3. Dependencias externas

| Servicio | Endpoint | Modelo | Timeout/reintento | Fallo → comportamiento |
|---|---|---|---|---|
| Anthropic (vía `/api/generate`) | planner | `claude-sonnet-4-6` (o `haiku` por override) | 2 reintentos con backoff `[600ms, 1500ms]` solo en `RETRYABLE_STATUSES` (`aiPlanner.js:143,185`) | `AIPlannerError` con mensaje en español; la UI muestra el error, no genera silenciosamente un menú vacío |
| Anthropic (vía `/api/generate`) | school-menu | `claude-sonnet-4-6` | 1 reintento con errores de validación inyectados | Error propagado tal cual, sin fallback |
| `/api/generate` (propio, `api/generate.js`) | — | Modelo restringido a `{claude-sonnet-4-6, claude-haiku-4-5-20251001}` (`ALLOWED_MODELS`), `max_tokens` clamped a 32000 | Rate limit vía `api/_guard.js`: 60 peticiones / 10 min por IP | 429 con `Retry-After`; 400 si `task` es desconocido |

**Nota de seguridad ya corregida esta sesión, relevante para el contrato**: hasta hace poco `/api/generate` aceptaba un `system` prompt arbitrario del cliente — cualquiera podía convertirlo en un LLM de propósito general a coste de la cuenta. Ahora el cliente solo envía `task` (`"planner"`, `"school-menu"`, ...) y el prompt real vive server-side en `api/_prompts.js`, verificado byte a byte contra el original en el momento del cambio.

## 4. Puntos de acoplamiento

- **`aiModels.js` ↔ `api/generate.js`**: los ids de modelo están **duplicados** en dos sitios (`ALLOWED_MODELS` en `api/generate.js` y `PLANNER_MODEL`/`FAST_MODEL` en `src/lib/aiModels.js`) con un comentario explícito "Keep ALLOWED_MODELS in sync with src/lib/aiModels.js" — no hay ningún test ni mecanismo automático que lo garantice; un cambio de modelo en un solo sitio rompe silenciosamente las peticiones (caen al modelo por defecto del servidor en vez de fallar con error claro).
- **`recipeCatalog.js`/`recipeSchema.js` ↔ `aiPlanner.js`**: el prompt del planificador (server-side, `api/_prompts.js`) referencia campos exactos del esquema de receta (`recipeId`, `mainProtein`, `healthFlags`, etc.) — un cambio de nombre de campo en `recipeSchema.js` sin actualizar el prompt server-side rompe la generación de forma silenciosa (el LLM seguiría respondiendo, pero con datos que no casan con lo que el prompt cree que existe).
- **`validateMenu.js`/`filterRecipes.js`** (en `src/utils/`) codifican las mismas reglas de negocio que el prompt intenta comunicarle al LLM en lenguaje natural — **duplicación deliberada y documentada** (comentarios cruzados tipo "ver aiPlanner.js SYSTEM_PROMPT" en `src/utils/menuConflicts.js`, `validateMenu.js`), pero cualquier cambio de regla debe hacerse en dos sitios de naturaleza completamente distinta (código determinista vs. prompt en lenguaje natural) sin ningún test que las mantenga sincronizadas más allá de la revisión humana.
- **`api/_prompts.js` → 5 tareas**: un único fichero centraliza los prompts de planner, steps, school-menu, suggest-ingredients y structure-recipe. Server-owned desde esta sesión; antes cada `src/lib/*.js` tenía su propia copia del prompt, lo que permitía la inyección de `system` arbitrario (ver Deuda técnica en `security` más abajo, o el hallazgo de la auditoría).
- **`menusSync.js` → `activate_user_menu` RPC**: acopla el cliente a una función de base de datos cuya mitad de la lógica (rama `household_id`) es inalcanzable hoy (ver `auth.md`).

## 5. Deuda técnica visible

1. **Duplicación de reglas de negocio** entre prompt (lenguaje natural, server-side) y código determinista (`validateMenu.js`, `filterRecipes.js`) — ver arriba. Alto riesgo de divergencia silenciosa con el tiempo.
2. **Lista de modelos permitidos duplicada** entre `aiModels.js` (cliente) y `api/generate.js` (servidor) sin mecanismo de sincronización automática.
3. **`recipes` (tabla Supabase) no se usa en el flujo real de generación** pese a existir con RLS y datos — coste de mantenimiento sin beneficio claro en este dominio. [AMBIGUO — preguntar si tiene otro consumidor no localizado.]
4. ~~La invariante "solo un menú activo" vive en una función RPC, no en un constraint DB~~ — **descartado, ver §2**: sí hay un índice único parcial que la garantiza a nivel de motor.
5. ~~Importación de menú escolar sin fallback determinista~~ — **descartado, ver §1**: sí cae a extracción de texto + regex sin IA; el riesgo real es que ese fallo es silencioso (el usuario no se entera de que el resultado es del fallback, más pobre, en vez de la lectura por IA).

## 6. El solver y la puerta de cocinas (decisiones, sep–oct 2026)

**Por qué hay solver.** En septiembre de 2026 se midió que el modelo nunca
había escrito un menú que viera un usuario: 19 de 19 unidades grupo×semana
fallaron la validación a la primera y acabaron en `applyFallback` (~31 s,
~50 llamadas). El banco «modelo frente a solver» con 12 casas reales lo
confirmó: el modelo, 144 violaciones y p50 de 40 s; el solver, 0 violaciones
y p50 de 0,7 s.

**Estado.** `src/lib/solver.js` está ENCENDIDO desde el 30 sep 2026 en
staging y producción (ramas `staging` y `main`), apagado en local y en
previews (`VITE_MOTOR`, que vive en `.env.development.local`). El bot lo usa
siempre (fijado en `scripts/build-bot-core.mjs`). Un fallo del solver afecta,
por tanto, a menús reales.

- Tres fases: backtracking con `validateMenu` como oráculo, B&B que salta
  huecos, y relleno que solo relaja perfiles de salud y topes
  (`REGLAS_RELAJABLES`), devuelto con nombre (`relajados`, `vacios`).
- Con el solver NO corren `breakProteinClusters` ni `ajustarCuota`: re-elegían
  sin validar y rompían menús válidos.
- Reintentos con otras semillas y presupuesto corto (PR #14, 1 oct 2026).
- **Holgura de topes 1,4** (`HOLGURA_TOPES`): un plato gasta 1,4 topes de
  media, así que topes = huecos exactos no tiene solución. `DEFAULT_FREQS`
  (suma 14) tampoco la tenía.
- Los máximos leen la identidad del plato (categoría, proteína, fécula), no el
  `aporte`; contar `aporte` convertía «verdura: 3» en «evita la verdura».
- Telemetría en `menu_generated`: `motor`, `solverNodos`, `solverMs`,
  `solverCompleto`, `solverRelajados`, `solverSemilla`.

`src/lib/solver.test.js` vuelve al CI el 9 oct 2026 (#140). Su casa de
prueba lleva las alergias preguntadas: sin ellas, desde #107 el menú esquiva
los 14 alérgenos, quedan 27 platos y la semana no cierra (#229).

**Pendiente de producto:** una casa con 25 min entre semana y cocina básica
solo tiene primeros de montaje, y la regla `cena_rapida_no_solicitada` los
prohíbe fuera de la cena: ¿puede una ensalada de bote ser primero de comida?
Es el primer caso para una pantalla de ajuste (solo inviabilidad).

**La puerta de cocinas (15 sep 2026).** Son dos interruptores distintos:

- `estrella` decide si un plato PUEDE salir (sin foto no puede ser estrella).
- La puerta de `filterRecipes` decide si sale SIN pedirlo: una cocina
  extranjera está apagada salvo que la casa la marque.

La puerta se aplica siempre, también a la casa sin preferencias guardadas
(«no me has pedido nada» = «me has pedido cero»). `italiana` está en
`SIEMPRE_ENCENDIDAS` porque en este catálogo significa pasta, que ya se pide
por el reparto; `francesa`, no.
