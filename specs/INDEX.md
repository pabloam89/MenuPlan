# Índice de especificaciones — MenuPlan

Specs producidas por ingeniería inversa del código real (`src/`, `api/`, esquema vivo de Supabase), no de documentación previa. Metodología: lectura directa de código + consultas SQL contra la base de producción (`mdzwbrworucnummibxrq`) para el esquema, RLS, constraints, funciones y enums. Fecha: 2026-08-16.

| Fichero | Dominio |
|---|---|
| [auth.md](auth.md) | Autenticación, identidad, borrado de cuenta, sistema de hogares compartidos |
| [menu-generation.md](menu-generation.md) | Generación de menú semanal por IA, importación de menú escolar |
| [shopping-list.md](shopping-list.md) | Lista de la compra (vista derivada, sin tabla propia) |
| [receipt-ocr.md](receipt-ocr.md) | OCR de tickets y fotos de despensa vía visión IA |
| [recipe-catalog.md](recipe-catalog.md) | Catálogo de recetas, pasos enriquecidos, recetas de usuario |
| [batch-cooking.md](batch-cooking.md) | Bases: cocinar una vez para varios platos (`type: "base"`, `mainBase`, `baseMode`) |
| [pagos.md](pagos.md) | No existe — documentado como ausencia, con evidencia |
| [gente-apagada.md](gente-apagada.md) | Gente (lo social) apagada desde el 7 oct 2026: el interruptor `GENTE_ACTIVA`, la etiqueta `[GENTE-APAGADA]` y la lista de todo lo que se oculta y cómo volver a encenderlo |
| [ficha-de-la-casa.md](ficha-de-la-casa.md) | PLAN (1 oct 2026): la ficha que ve Lola en cada mensaje (capas, dos bloques, topes), los menús «definitivos» sin pedir «me gusta», el analista nocturno con salida tabulada y cómo se convierte una observación en eje nuevo; huecos por orden |
| [modelo-datos.md](modelo-datos.md) | Auditoría de normalización del modelo y plan: campos por plano, operadores y calculadoras, magnitudes (tiempo/gramos/macros/raciones/precio), el mapa de tablas por ámbito (global/hogar), sesgos y batch cooking; Fase A: esquema de `alimentos` (alimento/producto/ingrediente, siete dimensiones, procedencia BEDCA) y plan de curación de `familia`, `densidad` y `rendimiento` |

## Vocabulario del catálogo

Nombres fijos (issue #249). **La palabra «antiguo» no se usa** para nada de
esto: hoy significaba cinco cosas (el fondo sin bandera, la copia de Supabase,
las 19 cremas de bebé originales, `BASE_RECIPES`, ingredients frente a
alimentos). Se dice el rol o el nombre de abajo. La lista de fuentes, con su
estado y su fecha de retirada, vive en `src/data/model.js` (`TABLAS`, el único
registro) y la vigila `ops/fuentes.test.js`.

| Rol de una fuente | Qué es |
|---|---|
| `ingesta` | Entra en bruto, de fuera (Mercadona, BEDCA, scripts de alta). Alimenta a la fuente de verdad. |
| `fuente_de_verdad` | Lo único que se edita. Un dato vive aquí y en ningún otro sitio. |
| `derivado` | Se regenera con un script; no se toca a mano. |
| `copia_retirada` | Copia que ya no se lee (las tablas `recipes`… de Supabase). No se usa para nada nuevo. |

Estado: `vivo`, `deprecado` (con `retirar_el`: pasada la fecha, el test se pone
rojo) o `retirado`.

Recetas: el **Recetario** son las recetas con `estrella:true` (las únicas que
Lola y el motor proponen); la **Reserva**, todas las demás (sin bandera o
`false`). Una receta pasa de Reserva a Recetario cambiando esa bandera.

## Documentos de diseño fuera del repo

Artefactos de claude.ai con decisiones que no se derivan del código. Léelos
antes de diseñar lo que tocan.

- **Plan maestro del entorno** (oct 2026): planos, piezas, fases y normas de datos — https://claude.ai/code/artifact/6f0f8c05-8ec0-48ea-b372-a08e6e0f761e
- **Ficha de la casa** (spec viva, oct 2026) — https://claude.ai/artifact/6Dgpfp8raH28qUTte3ahPC
- **Motor de reglas del menú** (ago 2026): 13 operadores, 9 ejes, los 35 campos, el grafo de preguntas y el esquema de `notepad.json` — https://claude.ai/code/artifact/393ab45f-c914-42ee-9fc6-9889eba9dbd7
- **El wizard que se acorta** (ago 2026): el registro de preguntas como datos y el panel de IA como «mando a distancia» — https://claude.ai/code/artifact/4c2155d8-b3ff-4c7c-884c-2fc43c2ee766
- **El menú que se explica** (ago 2026) — https://claude.ai/code/artifact/7b4a0625-08a4-410a-b58f-2a98cb18e075
- **Partir el catálogo** (sep 2026): plan de datos y mapa de entidades — https://claude.ai/code/artifact/b7cdbfa7-1904-4f4b-9885-57c11d1ff153 · https://claude.ai/code/artifact/86e1dbeb-bb2a-4558-af27-b417fa55b0b5

Veredicto del motor de reglas: «El notepad es el 5 % del esfuerzo;
`validateMenu.js` y `filterRecipes.js` son el 95 %».

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
| `recipeSchema.js` (forma de una receta) | `recipe-catalog`, `menu-generation` (prompt server-side), `receipt-ocr` no afectado | 3 sitios sincronizados a mano: JSON bundleado, `UserRecipeDraftSchema`, prompt `structure-recipe` (el mapper `rowToRecipe` es copia retirada) |
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
