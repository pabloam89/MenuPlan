# Índice de especificaciones — MenuPlan

Specs producidas por ingeniería inversa del código real (`src/`, `api/`, esquema vivo de Supabase), no de documentación previa. Metodología: lectura directa de código + consultas SQL contra la base de producción (`mdzwbrworucnummibxrq`) para el esquema, RLS, constraints, funciones y enums. Fecha: 2026-08-16.

| Fichero | Dominio |
|---|---|
| [auth.md](auth.md) | Autenticación, identidad, borrado de cuenta, sistema de hogares compartidos |
| [menu-generation.md](menu-generation.md) | Generación de menú semanal por IA, importación de menú escolar |
| [shopping-list.md](shopping-list.md) | Lista de la compra (vista derivada, sin tabla propia) |
| [receipt-ocr.md](receipt-ocr.md) | OCR de tickets y fotos de despensa vía visión IA |
| [recipe-catalog.md](recipe-catalog.md) | Catálogo de recetas, pasos enriquecidos, recetas de usuario |
| [pagos.md](pagos.md) | No existe — documentado como ausencia, con evidencia |

## Mapa de dependencias entre dominios

```
                    ┌─────────────────────────────────────────┐
                    │   Supabase Auth + RLS  (auth.md)         │
                    │   user.id / session.access_token         │
                    └──────────────┬────────────────────────────┘
                                   │ (todos los dominios leen sesión;
                                   │  ninguno la exige para operar)
        ┌──────────────────────────┼──────────────────────────┐
        │                          │                          │
        ▼                          ▼                          ▼
┌───────────────┐        ┌──────────────────┐        ┌────────────────┐
│ recipe-catalog │◄───────┤ menu-generation   │        │ receipt-ocr     │
│ (recipes,      │ lee    │ (aiPlanner.js)    │        │ (receiptParser, │
│  user_recipes) │catálogo│                   │        │  visionImage)   │
└───────┬────────┘        └─────────┬─────────┘        └────────┬────────┘
        │                           │                            │
        │ RECIPES_BY_ID             │ menuPlan                   │ items → user_pantry
        │                           ▼                            │
        │                  ┌──────────────────┐                  │
        └─────────────────►│ shopping-list     │◄─────────────────┘
                            │ (buildShoppingList,│  descuenta despensa
                            │  vista derivada)   │  (pantry.js)
                            └──────────────────┘

  Infraestructura compartida, atraviesa 3 dominios:
  ┌────────────────────────────────────────────────────────────┐
  │ api/generate.js + api/_prompts.js + api/_guard.js            │
  │ usado por: menu-generation, recipe-catalog, receipt-ocr       │
  └────────────────────────────────────────────────────────────┘

  pagos.md — nodo aislado, sin aristas de entrada ni salida (no existe)
```

## Quién rompe a quién — tabla de acoplamiento fuerte

| Si cambia... | Rompe (directamente) | Por qué |
|---|---|---|
| `recipeSchema.js` (forma de una receta) | `recipe-catalog`, `menu-generation` (prompt server-side), `receipt-ocr` no afectado | 4 sitios sincronizados a mano: JSON bundleado, mapper `rowToRecipe`, `UserRecipeDraftSchema`, prompt `structure-recipe` |
| `aiModels.js` (ids de modelo) | `menu-generation`, `recipe-catalog` | `api/generate.js` tiene su propia lista `ALLOWED_MODELS` duplicada a mano; `api/recipe-steps.js` tiene una tercera constante propia |
| `api/_guard.js` (rate limit / guard) | `menu-generation`, `recipe-catalog`, `receipt-ocr` | los tres llaman a `/api/generate` o `/api/recipe-steps`, ambos protegidos por el mismo guard compartido |
| `api/_prompts.js` | `menu-generation` (planner, school-menu), `recipe-catalog` (structure-recipe, suggest-ingredients), `recipe-catalog`/API propia (steps) | única fuente server-side de los 5 prompts activos desde esta sesión |
| Esquema de `user_pantry` / normalización de nombres (`ingredientCategories.js`) | `shopping-list` (descuento de despensa), `receipt-ocr` (escritura) | el matching difuso de `shoppingBuilder.js` depende de la misma normalización que usa `pantry.js` al guardar |
| FK de `auth.users` (CASCADE/SET NULL) | **todos** los dominios con tablas `user_*` | ya causó una incidencia real de producción esta sesión (deriva migración↔base) |
| `RLS` de `user_recipes`/`recipe_votes` | `recipe-catalog` | visibilidad pública/amigos depende de `are_mutual_follows()`, función `SECURITY DEFINER` en la base, no en código de aplicación |

## Hallazgo transversal — deriva migración↔producción (patrón recurrente, no incidente aislado)

Aparece de forma independiente en **tres** puntos distintos de esta auditoría:
1. FK de `user_profiles`/`user_events`/`app_feedback` a `auth.users` en `NO ACTION` en producción pese a que la migración original decía `CASCADE` (corregido 2026-08-15).
2. Columna `steps_rich` de `user_recipes` desplegada a producción sin su migración presente en el repo en ese momento (corregido 2026-08-16).
3. **Sistema de hogares compartidos completo** (5 tablas, 14 funciones RPC, ~10 políticas RLS) presente en producción **sin ningún fichero de migración en el repositorio**, no corregido — ver `auth.md`.

La causa común no es un fallo puntual: en algún punto del ciclo de vida de este proyecto se aplicaron cambios de esquema directamente contra la base (dashboard de Supabase, u otra sesión/agente) sin generar el fichero de migración correspondiente. El repositorio, tal cual está, **no reconstruye la base de producción actual**. Cualquier auditoría o trabajo futuro que asuma "las migraciones en `supabase/migrations/` son el esquema" partirá de una premisa falsa a menos que se contraste primero contra el esquema vivo (como se ha hecho para producir estas specs).

## Hallazgo transversal — duplicación de reglas de negocio código↔prompt

`validateMenu.js`/`filterRecipes.js` (deterministas) codifican las mismas reglas gastronómicas que el prompt del planificador (`api/_prompts.js`, lenguaje natural) le pide al LLM que respete. Es una duplicación **deliberada y documentada con comentarios cruzados**, no accidental — pero sin ningún test que mantenga ambas copias sincronizadas más allá de la revisión humana. Ver `menu-generation.md` §4.

## Qué falta por hacer (fuera del alcance de esta fase)

Esta fase es solo documentación de lo existente, sin propuestas de cambio — por instrucción explícita. La auditoría de escalabilidad/integridad/seguridad contra estas specs es la fase siguiente.
