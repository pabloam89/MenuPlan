# Inventario vertical y horizontal

<!-- Instantánea del 2026-10-14 que escribe `npm run inventario-vertical -- --escribir` (scripts/inventario-vertical.mjs). Las cifras cambian con cada PR ajeno, así que NINGÚN test las compara con el repo de hoy: se regenera al empezar cada PR de #710 y se pone al lado la cifra de después. -->

Primera fase de #710 (programa #652): solo mide, no mueve nada. **Horizontal** es lo que vale para cualquier proyecto; **vertical**, lo que solo vale para HoMenu; **duda**, lo que no se puede decidir con los datos y se enseña con su razón. La regla de Pablo (13 oct 2026): ningún registro mezcla los dos lados, y los agentes (horizontales) reciben lo vertical por referencia (`--proyecto homenu`).

## Cómo se ha medido

Es un **inventario de partida, no un registro de lados**: el lado todavía no es un campo de cada pieza (salvo en normas y entidades), así que se deduce. Las fuentes de datos, todas del propio repo y sin red:

| Capa | De dónde sale el lado |
|---|---|
| Principios | `ops/principios/`, `ops/principios-producto/` y `ops/redaccion.json`, con las fuentes de `ops/fuentes-documentales/` y las zonas de `ops/zonas.json`. Vertical: los de `ops/proyectos/<id>/principios/` (el campo `project`). Duda: sin fuente externa y su único origen está en un fichero de zona producto; o un principio de producto del área `conversational-ai` |
| Fuentes | El campo `project` la hace vertical. Sin él: la ruta de un agente o de zona factoría, horizontal; de zona producto, vertical (y debe llevarlo); zona mixta o externa, horizontal |
| Normas | El registro en que viven. Duda de una horizontal: su texto nombra HoMenu/Lola/MenuPlan, o su ámbito es `bot`/`product`/`catalog`, o su control o `donde` apunta a `api/`, `src/`, `supabase/`, `docs/datos/`, `docs/producto/`, `specs/` o `DESIGN_SYSTEM.md` (las 24 de ámbito `diseno` no cuentan: Pablo decidió el 13 oct que son horizontales) |
| Entidades | Su campo `scope` (`horizontal` o `vertical`, uno solo: la clase es horizontal y sus ejemplares son del registro del proyecto); duda: un valor que no sea ninguno de los dos y las vertical que son un concepto general (lista a mano, hoy vacía) |
| Glosario | Su campo `scope` (`horizontal` en ops/glosario/terminos/, `vertical` en ops/proyectos/<id>/glosario/); duda si falta, si choca con el de las entidades que nombra, o si un término horizontal nombra el proyecto o un servicio suyo |
| Skills, reglas, comandos, specs, documentos | La zona de `ops/zonas.json` (factoría = horizontal, producto = vertical, mixto = duda); una skill `tipo: servicio` de factoría = duda |
| Agentes | Horizontales por la regla de Pablo; los tres que trabajan sobre datos de HoMenu, duda (lista a mano) |
| Tests | Zona de su carpeta. En la casa: vertical si lee 3 ficheros de HoMenu o más (existentes, no de ejemplo), duda si lee 1 o 2 |

Límites: «casa» y «bot» son castellano corriente en la factoría, así que no cuentan como pista de proyecto. La zona de `ops/zonas.json` se decidió por nombre de carpeta, no pieza a pieza. Un test que nombra `src/App.jsx` como texto de un ejemplo puede salir como duda sin serlo.

## Resumen por capa

| Capa | Total | Horizontal | Vertical | Duda |
|---|---:|---:|---:|---:|
| principios de la casa (ops/principios/) | 54 | 54 | 0 | 0 |
| principios del proyecto (ops/proyectos/<id>/principios/) | 2 | 0 | 2 | 0 |
| principios de producto (delegado: ops/principios-producto/) | 41 | 41 | 0 | 0 |
| guía de redacción (delegado: ops/redaccion.json) | 15 | 15 | 0 | 0 |
| fuentes documentales (ops/fuentes-documentales/) | 165 | 158 | 7 | 0 |
| normas horizontales (ops/normas.json) | 166 | 120 | 0 | 46 |
| normas verticales (ops/proyectos/<id>/normas.json) | 39 | 0 | 39 | 0 |
| entidades activas (ops/entidades.json) | 56 | 43 | 13 | 0 |
| términos activos del glosario (ops/glosario/terminos/) | 388 | 387 | 1 | 0 |
| skills (.claude/skills/) | 18 | 9 | 5 | 4 |
| reglas por carpeta (.claude/rules/) | 6 | 0 | 5 | 1 |
| comandos (.claude/commands/) | 5 | 3 | 2 | 0 |
| agentes (.claude/agents/; por regla de Pablo, horizontales) | 8 | 8 | 0 | 0 |
| specs (specs/*.md) | 17 | 0 | 17 | 0 |
| documentos (docs/**/*.md y los .md de la raíz) | 31 | 21 | 9 | 1 |
| tests (*.test.{js,jsx,mjs}) | 451 | 108 | 333 | 10 |

Principios, las cuatro filas juntas: 112 en total, 110 horizontales, 2 verticales y 0 en duda.

## Lo que cuenta cada capa

- **Principios.** Los 2 de HoMenu (`curated-catalog-only` y `household-owns-data`) viven en su registro, `ops/proyectos/homenu/principios/`, con el campo `project`: origen una decisión de producto, sin fuente externa. Los 54 de la casa son horizontales salvo los que dudan: la mayoría no tiene fuente externa, pero eso no los hace verticales, son del método de trabajo. Los de base de datos que solo tenían como origen `docs/datos/PRINCIPIOS.md` son horizontales por decisión de Pablo (13 oct): llevan fuente externa (PostgreSQL, Fowler) y `docs/datos/` es el cómo los aplica HoMenu; el que no la tiene verificable sigue en duda. Los 41 de producto tienen literatura detrás y son horizontales; los del área `conversational-ai` forman el paquete de bots (`dominio: bot`), opcional por proyecto, y también son horizontales.
- **Fuentes.** 130 externas (literatura) y 35 de la casa (una ruta del repo).
- **Normas.** El registro vertical ya está separado (39). En el horizontal hay 46 que dudan (lista abajo). De las 166, 60 tienen como control «juicio» y 28 acaban en un fichero de zona producto. De las 39 verticales, 0 tienen su control en una carpeta de la factoría.
- **Entidades y glosario.** Entidades retiradas (no cuentan): 0. Cada término lleva su `scope` (PR 7); los verticales viven en el glosario de su proyecto, aparte de los de la casa, y un término horizontal no nombra una entidad vertical (techo 0).
- **Tests.** 120 tests viven en carpetas de la casa; 2 de ellos leen tres ficheros de HoMenu o más (sin contar `src/App.jsx`, el ejemplo de casi todos). 331 viven en carpetas de producto, coherentes con lo que vigilan.

## Los dudosos, con su razón

### 3. Normas (46)

- `evals-tope-mensual`, `evals-antes-de-fusionar`, `tope-canario`, `model-least-privilege`, `bot-logic-simple-first`: su texto nombra el proyecto; ámbito «bot» (conducta de un producto con bot, catálogo o familias) (5)
- `tope-diario-ia`, `limite-por-ip`: depende de un fichero de HoMenu (api/_guard.test.js) (2)
- `rol-solo-lectura`: depende de un fichero de HoMenu (supabase/migrations)
- `caducidad-token-vercel`, `vuelta-atras-probada`: su texto nombra el proyecto; su texto nombra un servicio del proyecto (2)
- `caducidad-clave-anthropic-evals`, `build-con-prebuild`, `variables-production-solo-pablo`, `rollback-ensayado`, `estado-de-la-base-verificado`: su texto nombra un servicio del proyecto (5)
- `principios-revision`, `column-not-null-by-default`, `json-solo-de-un-escritor`, `escritura-con-version`, `estado-con-saltos-escritos`: depende de un fichero de HoMenu (docs/datos/PRINCIPIOS.md) (5)
- `principios-auto`, `fk-con-on-delete`, `fechas-con-zona`, `tabla-con-comentario`, `salud-marcada`: depende de un fichero de HoMenu (supabase/principios.test.js) (5)
- `tabla-modulo-dueno`: depende de un fichero de HoMenu (supabase/cableado.test.js)
- `vocabulario-cerrado`: depende de un fichero de HoMenu (src/lib/vocabularios.test.js)
- `claves-de-pablo-solo-pablo`, `sesion-con-su-identidad`, `design-touch-target`, `design-themes`: su texto nombra el proyecto (4)
- `build-valida-catalogo`: su texto nombra un servicio del proyecto; ámbito «catalog» (conducta de un producto con bot, catálogo o familias)
- `columnas-de-texto-clasificadas`: depende de un fichero de HoMenu (supabase/columnasTexto.test.js)
- `endpoint-rechaza-sin-credencial`: depende de un fichero de HoMenu (api/sinCredencial.test.js)
- `business-flow-rate-limited`, `safety-filter-fails-closed`: depende de un fichero de HoMenu (docs/producto/PRINCIPIOS.md) (2)
- `machine-caller-authenticated`: su texto nombra un servicio del proyecto; depende de un fichero de HoMenu (docs/producto/PRINCIPIOS.md)
- `bot-turn-bounded`, `bot-write-idempotent`: su texto nombra el proyecto; su texto nombra un servicio del proyecto; ámbito «bot» (conducta de un producto con bot, catálogo o familias) (2)
- `ai-spend-charged-to-caller`, `no-secrets-in-prompt-or-client`: su texto nombra el proyecto; depende de un fichero de HoMenu (docs/producto/PRINCIPIOS.md) (2)
- `improvement-has-fixed-appetite`, `product-logs-countable-line`: ámbito «product» (conducta de un producto con bot, catálogo o familias) (2)
- `model-output-schema-checked`, `family-text-is-data`: ámbito «bot» (conducta de un producto con bot, catálogo o familias) (2)
- `new-table-closed-to-anon`: depende de un fichero de HoMenu (supabase/anonPorDefecto.test.js)

### 5a. Skills (4)

- `.claude/skills/1password/SKILL.md`, `.claude/skills/github/SKILL.md`, `.claude/skills/hetzner/SKILL.md`, `.claude/skills/tailscale/SKILL.md`: skill de un servicio: el método es general, pero lleva los ids, las bóvedas y el repo de HoMenu (4)

### 5b. Reglas por carpeta (1)

- `.claude/rules/tests.md`: zona mixta en ops/zonas.json

### 5f. Documentos (1)

- `CLAUDE.md`: zona mixta en ops/zonas.json

### 6. Tests (10)

- `.claude/dominios-skills.test.js`: vive en la casa (mixto) y nombra supabase/ESTADO.md: ¿vigila el fichero o lo usa de ejemplo?
- `.claude/hooks/guardia.test.js`: vive en la casa (mixto) y nombra supabase/migrations/0080_bot_tareas_v2.sql, supabase/migrations/0079_personas_y_grupos.sql: ¿vigila el fichero o lo usa de ejemplo?
- `.claude/rutas.test.js`, `ops/principios.test.js`: vive en la casa (factoria) y nombra docs/datos/PRINCIPIOS.md: ¿vigila el fichero o lo usa de ejemplo? (2)
- `ops/modulos.test.js`: vive en la casa (mixto) y nombra src/lib/vocabularios.js, supabase/cableado.json: ¿vigila el fichero o lo usa de ejemplo?
- `ops/normas.test.js`: vive en la casa (factoria) y nombra api/_guard.test.js, docs/datos/PRINCIPIOS.md: ¿vigila el fichero o lo usa de ejemplo?
- `ops/vocabularios-vida.test.js`: vive en la casa (factoria) y nombra src/lib/vocabularios.js: ¿vigila el fichero o lo usa de ejemplo?
- `scripts/avisos-pr.test.js`: vive en la casa (factoria) y nombra src/data/derived/recipeNutrition.json: ¿vigila el fichero o lo usa de ejemplo?
- `scripts/consulta.test.js`: vive en la casa (mixto) y nombra src/data/model.js: ¿vigila el fichero o lo usa de ejemplo?
- `scripts/rulesets.test.js`: vive en la casa (factoria) y nombra public/store/mercadona.json, src/data/derived/recipeCoste.json: ¿vigila el fichero o lo usa de ejemplo?

## Propuesta de orden de PR, con cifra de antes y de después

El orden sigue la dependencia (lo que es registro se separa antes de lo que lo cita) y empieza por el vigilante, para que ninguna cifra suba mientras se trabaja. Cada PR cierra con `Parte de #710`, la cifra de esta tabla recalculada y su juez.

| PR | Qué hace | Cifra de antes | Cifra objetivo |
|---|---|---|---|
| PR 1 | El vigilante primero (punto 7 de #710): test que lee `lado`/`project` de cada registro y falla si una horizontal cita una vertical; techos que solo bajan | tests de vigilancia de lados = 0 | 1 (con los techos de esta tabla) |
| PR 2 | Entidades: cada una de un lado (sin `both`); las vertical genéricas pasan a horizontal; el glosario hereda el lado de su entidad (en el PR 7 pasa a ser un campo propio de cada término) | entidades en duda = 0 | 0 |
| PR 3 | Principios: campo `project` y registro `ops/proyectos/homenu/principios/`; mover los verticales y resolver los de base de datos | verticales fuera de su registro = 0; en duda = 0 | verticales en su registro = todos; en duda = 0 |
| PR 4 | Fuentes: campo `project` en las de la casa que son de HoMenu y origen (decisión o fallo) en vez de fuente externa para los principios de proyecto | fuentes verticales sin marcar = 7; en duda = 0 | marcadas = todas; en duda = 0 |
| PR 5 | Normas dudosas: mover al registro de HoMenu las que sean suyas, o reescribir (sin nombrar el proyecto) las que sean generales | normas horizontales en duda = 46 | 0 (cada una, horizontal limpia o vertical) |
| PR 6 | Controles: tests de la casa que leen ficheros de HoMenu pasan a recibirlos por referencia (`--proyecto`) o se mueven (el techo `verticales_sin_salida` ya se retiró, #710) | tests de la casa que leen HoMenu = 2; en duda = 10 | 0 y 0 |
| PR 7 | Glosario: campo `scope` propio en cada término, exigido por test; los de proyecto aparte de los de la casa y ningún horizontal nombra una entidad vertical | términos en duda = 0; verticales dentro de la carpeta de la casa = 0 | 0 y 0 |
| PR 8 | Skills, reglas, comandos, specs y docs: marcar el lado de cada una y separar los skills de servicio en método (casa) y datos (proyecto) | en duda = skills 4, documentos 1; verticales sin marca = 27 | en duda = 0; todas marcadas |
| PR 9 | Factoría frente a HoMenu (#690): CLAUDE.md como índice corto con dos partes; `docs/` y `ops/` separados | documentos en duda = 1 | 0 |

Los PR 2 a 8 son independientes entre sí salvo por el 1; el 3 y el 4 van seguidos (una fuente de proyecto la cita un principio de proyecto). El 6 depende de #704 (ya fusionado).

## Dudas de clasificación que solo puede resolver Pablo

Cada una, con la opción recomendada primero; la respuesta decide cuántos de los dudosos de arriba pasan a un lado u otro.

1. **Principios de base de datos con origen solo en `docs/datos/PRINCIPIOS.md`. Resuelta por Pablo el 14 oct (opción A):** horizontales, con fuente externa verificada (PostgreSQL, Fowler, Google, HashiCorp…); `docs/datos/` queda como «cómo los aplica HoMenu». Un principio sin fuente que se pueda verificar sigue en duda, dicho.
2. **Lo que solo vale con un bot conversacional. Resuelta por Pablo el 14 oct (opción B):** forma el «paquete de bots», opcional por proyecto (dominio `bot` de `DOMINIOS_OPCIONALES`, `scripts/lib/ambitos.mjs`); sin tercer lado. Un principio del paquete lleva `dominio: bot` y solo lo cita una norma de ámbito `bot`.
3. **Entidades marcadas `both`. Resuelta por Pablo el 14 oct (opción A):** cada entidad es de un lado; la clase es horizontal y sus ejemplares son del proyecto. `both` ya no existe y un test lo rechaza.
4. **Skills de servicio** (hoy en duda: 1password, github, hetzner y tailscale, que están en zona factoría; vercel y supabase ya están en zona producto y cuentan como verticales, pero mezclan igual método y datos del proyecto). A (recomendada): partir cada una en método (casa) y datos del proyecto (ids, bóvedas, repo), que el agente recibe por referencia. B: dejarlos enteros en la casa. C: marcarlos verticales.
5. **Las zonas de `ops/zonas.json` contradicen la regla de los agentes**: `evaluador`, `qa` y `auditor-datos` están en producto. A (recomendada): moverlos a factoría y que lo vertical llegue por referencia. B: dejar la zona y marcar los tres como duda. C: moverlos a un paquete opcional.

## Qué no mide

- Las reglas de estándar de cada tarea (`ops/estandares-agentes.json`): son de la línea 1 de #652 (estándares asépticos), con su propia cifra (28 de 162 con lenguaje de proyecto, según el comentario del 13 oct).
- El contenido de dentro de cada skill y documento: se clasifica el fichero entero, no sus párrafos. Una skill de servicio mezcla método y datos del proyecto.
- Ficheros de código (`scripts/`, `.claude/hooks/`, `.github/`): solo cuentan como controles de las normas y como tests.
