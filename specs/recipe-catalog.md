# Dominio: Catálogo de recetas

## 1. Contrato funcional

**Qué hace.** Mantiene el catálogo cerrado de recetas que consume `menu-generation`, el flujo de creación de recetas propias por IA, y la adaptación de pasos por electrodoméstico.

### 1.1 Catálogo base (bundleado + hot-swap Supabase)
Ver detalle del mecanismo en `menu-generation.md` §2 ("Catálogo"). Resumen del contrato: `recipeCatalog` (`src/data/recipeCatalog.js:174`) es siempre un array de recetas válidas contra `RecipeSchema` (Zod, `src/data/recipeSchema.js:83`), resuelto una vez al cargar el módulo, con Supabase como fuente autoritativa **solo si** `catalog_meta.version >= BUNDLED_CATALOG_VERSION` (hoy `10`, `catalogVersion.js:15`); cualquier otro caso cae al JSON bundleado, ya validado de forma incondicional.

**Invariante de campos**: `RecipeSchema` exige (no exhaustivo) `id`, `name`, `category` (enum de 11 valores), `mainProtein` (enum de 10), `mealRole` (≥1 de 5 valores), `steps` (≥1 string), `ingredients` (≥1), `kcal`/`protein_g`/`carbs_g`/`fat_g` no negativos. `stepsRich` es **opcional** (`z.array(StepRichSchema).min(1).optional()`, línea 129) — su ausencia es válida, el renderizado cae a `steps` plano.

### 1.2 Pasos enriquecidos (`stepsRich`)
Formato compartido (`src/lib/recipeSteps.js`, cabecera del fichero lo declara explícitamente como fuente de verdad única entre 3 consumidores: `scripts/enrich-recipe-steps.mjs`, `src/lib/userRecipes.js`, `src/components/RecipeSteps.jsx`):
```
{ text: string, minutes?: number, kind?: STEP_KIND, during?: number }
STEP_KINDS = prep | activo | paralelo | pasivo | espera | opcional | emplatado
```
- `text` puede llevar marcadores (`{{Ingrediente}}`, `{{Ingrediente|modo}}`, `{{@Sartén}}`) resueltos en cliente al pintar (cantidad ya escalada, utensilio con fallback si el usuario no lo tiene).
- `during` (solo en pasos `paralelo`) apunta al índice 0-based de un paso **anterior** con el que corre a la vez; `normalizeRichSteps()` (`recipeSteps.js:90`) degrada a `kind:"activo"` si `during` es inválido o apunta hacia delante — invariante explícita para que nunca quede un "Mientras tanto" colgando de nada.
- `richToPlainSteps()` deriva `steps` planos desde `stepsRich` quitando marcadores — **`steps` sigue siendo la fuente de verdad/fallback**, `stepsRich` es un enriquecimiento opcional en paralelo, nunca al revés.

Estado actual del catálogo (según mensaje del commit `76e8df1`, no verificado independientemente por esta auditoría): 272/274 recetas con `stepsRich` en el método base; 409/409 combinaciones catálogo×electrodoméstico regeneradas con Sonnet.

### 1.3 Pasos por electrodoméstico en tiempo real (`api/recipe-steps.js`)
Para combinaciones no pre-horneadas en `src/data/recipeStepsByAppliance.json` (bundle estático) o para recetas de usuario: `POST /api/recipe-steps` genera con `claude-haiku-4-5-20251001`, cachea en Redis (`recipe:steps:{PROMPT_VERSION}:{recipeId}:{fingerprint}`, TTL 90 días). `PROMPT_VERSION` actual `v3` (pasos enriquecidos; `v2` pedía solo strings). `MAX_STEPS = 14`, límite de seguridad explícito ("no de estilo", comentario en el código) porque el endpoint es público.

**Invariante de caché direccionada por contenido**: la clave incluye un hash SHA-256 (16 hex) del `{name, applianceLabel, prepSummary, ingredients, baseSteps, time}` — corregido esta sesión tras confirmar que la clave antigua (solo `recipeId`) permitía envenenar la caché compartida de una receta real con contenido arbitrario, servido después a cualquier usuario que abriera ese plato.

### 1.4 Recetas de usuario (`generateUserRecipeDraft`, `src/lib/userRecipes.js`)
Entrada: nombre, ingredientes con cantidad/unidad, raciones, tiempo, notas de preparación opcionales. Salida: objeto con la misma forma que el catálogo (`source: "user"`). **Invariante fuerte**: `parsed.ingredients = userPayload.ingredients` (`userRecipes.js:673`) — el modelo puede proponer clasificación/pasos, pero **la lista de ingredientes del usuario nunca se sustituye por lo que devuelva el modelo**, precisamente para no depender de que el modelo no invente o re-cuantifique ingredientes.

## 2. Modelo de datos

### `recipes` (catálogo base — ver esquema completo en `menu-generation.md`)
RLS: `select` público (`true`) — no requiere sesión. Sin `insert`/`update`/`delete` para roles de cliente (mantenimiento fuera de la app).

### `user_recipes`
| Campo | Origen restricción |
|---|---|
| `owner_id` (FK → `auth.users`, CASCADE) | DB |
| `visibility` (enum `public\|friends\|private`, default `private`) | DB |
| `steps_rich` (jsonb, nullable) | DB — añadida en migración `0013_user_recipes_steps_rich.sql` esta sesión, tras detectar que su ausencia hacía fallar el upsert completo en silencio (`console.warn` únicamente, ver `userRecipesSync.js`) |
| `owner_snapshot` (jsonb) | Código (`ownerFromUser()`, `RecipePlanner.jsx`) — `{id, name, avatar}`. **Ya no incluye `email`**: se guardaba hasta esta sesión y era legible por cualquiera sin sesión vía la política `Public recipes readable` (RLS `visibility = 'public'`), filtrando el email de todo autor de receta pública. Corregido en código y en los datos ya existentes. |

RLS (`user_recipes`): `Owner manages own recipes` (`auth.uid() = owner_id`), `Public recipes readable` (`visibility='public'`, sin sesión), `Friends read friends recipes` (`visibility='friends' AND are_mutual_follows(auth.uid(), owner_id)`).

### `recipe_votes`
`UNIQUE(user_id, recipe_id)`, campos `vote` e `is_favorite`. [CORREGIDO 2026-08-22]: `vote` **sí tiene CHECK constraint** en producción — `recipe_votes_vote_check: (vote IS NULL) OR (vote = ANY (ARRAY['up','down']))`, verificado en vivo. RLS: `ALL` propio (`auth.uid() = user_id`) — sin lectura pública ni de amigos, a diferencia de `user_recipes`.

### `dish_images`
`combo_id` (PK), FK a `recipes.id` (recipe y garnish, `NO ACTION` en cascada — no `CASCADE`; borrar una receta del catálogo no arrastra su imagen automáticamente). RLS: lectura pública.

## 3. Dependencias externas

| Servicio | Endpoint | Modelo | Notas |
|---|---|---|---|
| Anthropic vía `/api/generate` | `task: "structure-recipe"` | `FAST_MODEL` (Haiku) | Prompt server-side (`api/_prompts.js`), sincronizado manualmente con el formato `stepsRich` del cliente en el mismo commit que lo introdujo (verificado: el prompt ya pedía `{text,minutes,kind}` en el momento de escribir esta spec) |
| Anthropic vía `/api/generate` | `task: "suggest-ingredients"` | `FAST_MODEL` | Sugerencia de ingredientes típicos a partir solo del nombre del plato |
| Anthropic vía `/api/recipe-steps` | — | `claude-haiku-4-5-20251001` (constante propia del fichero, no `aiModels.js`) | Cacheado en Redis (Upstash, vars `UPSTASH_REDIS_*`/`KV_REST_API_*` con fallback de nombres) — **opcional**: sin Redis configurado, genera igual pero sin persistencia (`getRedis()` devuelve `null`, no lanza) |
| Google Gemini (`generate-dish-photo.js`) | — | `gemini-2.5-flash-image` | Genera foto de plato para recetas de usuario bajo demanda; mismo `api/_guard.js` (rate limit más estricto: 20/hora) |

## 4. Puntos de acoplamiento

- **`recipeSchema.js` es la fuente de verdad de forma de receta para TODO el sistema**: catálogo bundleado, catálogo Supabase (vía `rowToRecipe` mapper en `recipeCatalog.js`), recetas de usuario (`UserRecipeDraftSchema` en `userRecipes.js`, que reexporta `StepRichSchema` de aquí), y el prompt server-side de `structure-recipe`. Un cambio de campo aquí toca 4 sitios que deben mantenerse sincronizados a mano.
- **`STEP_KINDS` está duplicado por diseño, con comentario explícito de sincronización manual**: definido en `src/lib/recipeSteps.js:32` y espejado en `api/recipe-steps.js` (`STEP_KINDS` propio, con comentario *"Espejo de STEP_KINDS en src/lib/recipeSteps.js: este fichero se mantiene autocontenido"*) — un test (`api/recipe-steps.test.js`, según commit `215c1c3`) fija el contrato entre ambas listas, mitigando el riesgo de divergencia silenciosa que sí existe en otros puntos de duplicación de este proyecto.
- **`api/_prompts.js` ↔ `src/lib/recipeSteps.js`/`userRecipes.js`**: el prompt de `structure-recipe` referencia la taxonomía de `kind` y el formato de marcadores en lenguaje natural — un cambio en `recipeSteps.js` (p. ej. nuevo `kind`) exige actualizar el prompt server-side a mano, sin ningún mecanismo que lo fuerce salvo revisión humana (mismo patrón de riesgo que en `menu-generation.md`).
- **`api/generate-dish-photo.js` ↔ catálogo curado**: reutiliza *literalmente* la fórmula de estilo del catálogo (`scripts/lib/combos.mjs#buildPrompt`, según comentario en el propio fichero) para que las fotos generadas bajo demanda no desentonen visualmente con el catálogo curado — acoplamiento de estilo, no de datos.

## 5. Deuda técnica visible

1. **Migración de `steps_rich` no registrada en el repo en el momento del deploy** — desplegada a producción sin la columna, causando fallo silencioso de guardado de recetas de usuario durante una ventana de tiempo (corregido esta sesión). Patrón recurrente: la deriva migración↔producción ya ha pasado dos veces en esta sesión (ver también `auth.md`, FK cascade).
2. **Fuga de email vía `owner_snapshot`** en recetas públicas — corregida en código y datos esta sesión, pero es evidencia de que guardar snapshots de identidad en columnas `jsonb` sin un esquema declarado (sin validación de qué campos puede contener `owner_snapshot`) es un vector fácil de reintroducir el mismo error con un campo distinto.
3. ~~`recipe_votes.vote` sin enum DB~~ — **descartado, ver §2**: sí tiene CHECK constraint en producción.
4. **`dish_images` no tiene `ON DELETE CASCADE`** desde `recipes` — una receta borrada del catálogo puede dejar una imagen huérfana referenciando un `recipe_id` inexistente en la práctica (la FK sigue existiendo con `NO ACTION`, así que Postgres impediría el borrado si hay una imagen que la referencia, salvo que se borre la imagen primero — comportamiento no verificado end-to-end en esta pasada).
5. **Modelo Haiku de `api/recipe-steps.js` hardcodeado en el propio fichero** en vez de importar de `aiModels.js` (comentario explícito: *"runs server-side and keeps its own constant"*) — decisión deliberada y documentada, pero es una tercera fuente de verdad de "qué modelo Haiku usamos" junto a `aiModels.js` y `api/generate.js`.
