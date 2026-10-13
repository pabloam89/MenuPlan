# Inventario vertical y horizontal

<!-- Instantánea del 2026-10-13 que escribe `npm run inventario-vertical -- --escribir` (scripts/inventario-vertical.mjs). Las cifras cambian con cada PR ajeno, así que NINGÚN test las compara con el repo de hoy: se regenera al empezar cada PR de #710 y se pone al lado la cifra de después. -->

Primera fase de #710 (programa #652): solo mide, no mueve nada. **Horizontal** es lo que vale para cualquier proyecto; **vertical**, lo que solo vale para HoMenu; **duda**, lo que no se puede decidir con los datos y se enseña con su razón. La regla de Pablo (13 oct 2026): ningún registro mezcla los dos lados, y los agentes (horizontales) reciben lo vertical por referencia (`--proyecto homenu`).

## Cómo se ha medido

Es un **inventario de partida, no un registro de lados**: el lado todavía no es un campo de cada pieza (salvo en normas y entidades), así que se deduce. Las fuentes de datos, todas del propio repo y sin red:

| Capa | De dónde sale el lado |
|---|---|
| Principios | `ops/principios/`, `ops/principios-producto/` y `ops/redaccion.json`, con las fuentes de `ops/fuentes-documentales/` y las zonas de `ops/zonas.json`. Vertical: la lista a mano de `ops/inventario-vertical.json`. Duda: sin fuente externa y su único origen está en un fichero de zona producto; o un principio de producto del área `conversational-ai` |
| Fuentes | Externa: horizontal (salvo la documentación de Supabase y Vercel: duda). De la casa: la zona de su ruta (`ops/zonas.json`) |
| Normas | El registro en que viven. Duda de una horizontal: su texto nombra HoMenu/Lola/MenuPlan, o su ámbito es `bot`/`product`/`catalog`, o su control o `donde` apunta a `api/`, `src/`, `supabase/`, `docs/datos/`, `docs/producto/`, `specs/` o `DESIGN_SYSTEM.md` (las 24 de ámbito `diseno` no cuentan: Pablo decidió el 13 oct que son horizontales) |
| Entidades | Su campo `scope` (`horizontal`, `vertical`, `both`); duda: `both` y las vertical que son un concepto general (lista a mano) |
| Glosario | El `scope` de sus entidades; sin entidad, su dominio (`producto` vertical, `datos` duda); duda también si su definición nombra el proyecto, Vercel o Supabase |
| Skills, reglas, comandos, specs, documentos | La zona de `ops/zonas.json` (factoría = horizontal, producto = vertical, mixto = duda); una skill `tipo: servicio` de factoría = duda |
| Agentes | Horizontales por la regla de Pablo; los tres que trabajan sobre datos de HoMenu, duda (lista a mano) |
| Tests | Zona de su carpeta. En la casa: vertical si lee 3 ficheros de HoMenu o más (existentes, no de ejemplo), duda si lee 1 o 2 |

Límites: «casa» y «bot» son castellano corriente en la factoría, así que no cuentan como pista de proyecto. La zona de `ops/zonas.json` se decidió por nombre de carpeta, no pieza a pieza. Un test que nombra `src/App.jsx` como texto de un ejemplo puede salir como duda sin serlo.

## Resumen por capa

| Capa | Total | Horizontal | Vertical | Duda |
|---|---:|---:|---:|---:|
| principios de la casa (ops/principios/) | 56 | 37 | 2 | 17 |
| principios de producto (delegado: ops/principios-producto/) | 41 | 30 | 0 | 11 |
| guía de redacción (delegado: ops/redaccion.json) | 15 | 15 | 0 | 0 |
| fuentes documentales (ops/fuentes-documentales/) | 161 | 137 | 12 | 12 |
| normas horizontales (ops/normas.json) | 166 | 128 | 0 | 38 |
| normas verticales (ops/proyectos/<id>/normas.json) | 39 | 0 | 39 | 0 |
| entidades activas (ops/entidades.json) | 54 | 22 | 13 | 19 |
| términos activos del glosario (ops/glosario/terminos/) | 116 | 69 | 1 | 46 |
| skills (.claude/skills/) | 18 | 9 | 5 | 4 |
| reglas por carpeta (.claude/rules/) | 6 | 0 | 5 | 1 |
| comandos (.claude/commands/) | 5 | 3 | 2 | 0 |
| agentes (.claude/agents/; por regla de Pablo, horizontales) | 8 | 5 | 0 | 3 |
| specs (specs/*.md) | 17 | 0 | 17 | 0 |
| documentos (docs/**/*.md y los .md de la raíz) | 31 | 21 | 9 | 1 |
| tests (*.test.{js,jsx,mjs}) | 441 | 99 | 332 | 10 |

Principios, las tres filas juntas: 112 en total, 82 horizontales, 2 verticales y 28 en duda.

## Lo que cuenta cada capa

- **Principios.** Solo 2 de los 56 propios de la casa son claramente de HoMenu (`curated-catalog-only` y `household-owns-data`): origen una decisión de producto, sin fuente externa. La mayoría no tiene fuente externa, pero eso no los hace verticales: son del método de trabajo. La duda real son los principios de base de datos cuyo único origen es `docs/datos/PRINCIPIOS.md`. Los 41 de producto tienen literatura detrás y son horizontales; los del área `conversational-ai` solo valen si el proyecto tiene un bot.
- **Fuentes.** 119 externas (literatura) y 42 de la casa (una ruta del repo).
- **Normas.** El registro vertical ya está separado (39). En el horizontal hay 38 que dudan (lista abajo). De las 166, 60 tienen como control «juicio» y 28 acaban en un fichero de zona producto. De las 39 verticales, 0 tienen su control en una carpeta de la factoría.
- **Entidades y glosario.** 0 entidades retiradas no cuentan. El glosario no tiene lado propio: hoy se deduce de sus entidades; es el registro donde más falta el campo.
- **Tests.** 111 tests viven en carpetas de la casa; 2 de ellos leen tres ficheros de HoMenu o más (sin contar `src/App.jsx`, el ejemplo de casi todos). 330 viven en carpetas de producto, coherentes con lo que vigilan.

## Los dudosos, con su razón

### 1. Principios (28)

- `bounded-blast-radius`: sin fuente externa y su único origen es api/_guard.test.js (zona producto): ¿regla general nacida en HoMenu o regla de HoMenu?
- `closed-vocabulary`: sin fuente externa y su único origen es src/lib/vocabularios.js (zona producto): ¿regla general nacida en HoMenu o regla de HoMenu?
- `days-hours-zones`, `expand-and-contract`, `fk-declares-on-delete`, `json-or-table`, `normalised-tables`, `pure-transformations`, `self-describing-catalog`, `status-is-state-machine`, `table-has-owner-module`, `types-and-nulls`, `versioned-concurrency`: sin fuente externa y su único origen es docs/datos/PRINCIPIOS.md (zona producto): ¿regla general nacida en HoMenu o regla de HoMenu? (11)
- `deny-when-in-doubt`: sin fuente externa y su único origen es api/sinCredencial.test.js (zona producto): ¿regla general nacida en HoMenu o regla de HoMenu?
- `plan-evaluated-before-apply`, `rehearsal-undone-and-expires`: sin fuente externa y su único origen es scripts/apply-migration.mjs (zona producto): ¿regla general nacida en HoMenu o regla de HoMenu? (2)
- `progressive-deploy-with-rollback`: sin fuente externa y su único origen es .claude/skills/vercel/SKILL.md (zona producto): ¿regla general nacida en HoMenu o regla de HoMenu?
- `buttons-and-free-text`, `calibrate-not-maximise-trust`, `easy-correction-and-undo`, `escalate-by-explicit-triggers`, `escape-hatch-when-lost`, `explain-why`, `keep-context-no-reask`, `no-pretend-human`, `scope-when-in-doubt`, `simple-first-agents`, `state-capabilities-and-limits`: tiene fuente externa (literatura), pero solo vale para un proyecto con bot conversacional (paquete de bots, línea 2 de #652) (11)

### 2. Fuentes (12)

- `casa-agente-evaluador`: es el agente evaluador; los agentes son horizontales (regla de Pablo, 13 oct) pero este tiene trabajo de producto
- `casa-agente-qa`: es el agente qa; los agentes son horizontales (regla de Pablo, 13 oct) pero este tiene trabajo de producto
- `casa-claude-agents-revisor-md`: la ruta .claude/agents/revisor.md está en zona mixta
- `casa-claude-rules-tests-md`: la ruta .claude/rules/tests.md está en zona mixta
- `casa-claude`: la ruta CLAUDE.md está en zona mixta
- `casa-eslint-config-js`: la ruta eslint.config.js está en zona mixta
- `casa-ops-recursos-json`: la ruta ops/recursos.json está en zona mixta
- `casa-scripts-verificar-estado-mjs`: la ruta scripts/verificar-estado.mjs está en zona mixta
- `sb-functions`, `sb-migrations`, `sb-rls`, `vercel-troubleshoot`: Documentación de un proveedor concreto del proyecto: sirve a cualquiera que lo use, pero la fuente solo la cita HoMenu (4)

### 3. Normas (38)

- `evals-tope-mensual`, `evals-antes-de-fusionar`, `tope-canario`, `bot-turn-bounded`, `bot-write-idempotent`, `model-least-privilege`, `model-output-schema-checked`, `bot-logic-simple-first`, `family-text-is-data`: ámbito «bot» (conducta de un producto con bot, catálogo o familias) (9)
- `tope-diario-ia`, `limite-por-ip`: depende de un fichero de HoMenu (api/_guard.test.js) (2)
- `rol-solo-lectura`: depende de un fichero de HoMenu (supabase/migrations)
- `principios-revision`, `column-not-null-by-default`, `json-solo-de-un-escritor`, `escritura-con-version`, `estado-con-saltos-escritos`: depende de un fichero de HoMenu (docs/datos/PRINCIPIOS.md) (5)
- `principios-auto`, `fk-con-on-delete`, `fechas-con-zona`, `tabla-con-comentario`, `salud-marcada`: depende de un fichero de HoMenu (supabase/principios.test.js) (5)
- `tabla-modulo-dueno`: depende de un fichero de HoMenu (supabase/cableado.test.js)
- `vocabulario-cerrado`: depende de un fichero de HoMenu (src/lib/vocabularios.test.js)
- `claves-de-pablo-solo-pablo`, `sesion-con-su-identidad`, `design-touch-target`: su texto nombra el proyecto (3)
- `build-valida-catalogo`: ámbito «catalog» (conducta de un producto con bot, catálogo o familias)
- `columnas-de-texto-clasificadas`: depende de un fichero de HoMenu (supabase/columnasTexto.test.js)
- `endpoint-rechaza-sin-credencial`: depende de un fichero de HoMenu (api/sinCredencial.test.js)
- `business-flow-rate-limited`, `machine-caller-authenticated`, `ai-spend-charged-to-caller`, `safety-filter-fails-closed`, `no-secrets-in-prompt-or-client`: depende de un fichero de HoMenu (docs/producto/PRINCIPIOS.md) (5)
- `improvement-has-fixed-appetite`, `product-logs-countable-line`: ámbito «product» (conducta de un producto con bot, catálogo o familias) (2)
- `new-table-closed-to-anon`: depende de un fichero de HoMenu (supabase/anonPorDefecto.test.js)

### 4a. Entidades (19)

- `environment`, `event`, `norm`, `metric`, `eval`, `vocabulary`, `principle`, `resource`, `control`, `workflow`: marcada «both»: sirve a los dos lados (10)
- `migration`: La clase «migración» vale para cualquier proyecto con base; sus instancias son de HoMenu
- `table`: La clase «tabla» vale para cualquier proyecto con base; sus instancias son de HoMenu
- `data-source`: Declarada en TABLAS de src/data/model.js, que es de HoMenu, pero el concepto (rol de una fuente de datos) es general
- `module`: ops/MODULOS.json agrupa código y tablas; el concepto es general, el contenido es de HoMenu
- `repo`: Un repositorio es un concepto general; hoy solo existe el de HoMenu
- `design-system`: Pablo decidió el 13 oct que el diseño es horizontal (sus normas lo son), pero la entidad está marcada vertical
- `token`: Igual que design-system: las normas de diseño son horizontales y la entidad sigue vertical
- `component`, `pattern`: Igual que design-system (2)

### 4b. Glosario (46)

- `acción`, `registrar`, `vigilante`: sus entidades son de lados distintos o «both» (horizontal, both) (3)
- `ámbito`, `aviso`, `bóveda`, `caso de prueba`, `clave`, `cobertura`, `comprobación`, `comprobar`, `control`, `despliegue`, `entorno`, `eval`, `evento`, `falta`, `fuerza`, `medir`, `meta`, `métrica`, `norma`, `principio`, `procesador`, `producción`, `recurso`, `retirar`, `staging`, `test del juez`, `veredicto`, `vocabulario`, `workflow`: sus entidades son de lados distintos o «both» (both) (29)
- `aplicar`, `migración`: su entidad migration es un concepto general marcado vertical (2)
- `carpeta de trabajo`: la definición nombra el proyecto o su infraestructura («C:\dev»)
- `carpeta principal`, `repositorio`: su entidad repo es un concepto general marcado vertical (2)
- `componente de diseño`: su entidad component es un concepto general marcado vertical
- `fuente de datos`: su entidad data-source es un concepto general marcado vertical
- `módulo`: su entidad module es un concepto general marcado vertical
- `patrón de diseño`: su entidad pattern es un concepto general marcado vertical
- `proyecto`: la definición nombra el proyecto o su infraestructura («HoMenu»)
- `servicio`: la definición nombra el proyecto o su infraestructura («Vercel»)
- `sistema de diseño`: su entidad design-system es un concepto general marcado vertical
- `tabla`: su entidad table es un concepto general marcado vertical
- `token de diseño`: su entidad token es un concepto general marcado vertical

### 5a. Skills (4)

- `.claude/skills/1password/SKILL.md`, `.claude/skills/github/SKILL.md`, `.claude/skills/hetzner/SKILL.md`, `.claude/skills/tailscale/SKILL.md`: skill de un servicio: el método es general, pero lleva los ids, las bóvedas y el repo de HoMenu (4)

### 5b. Reglas por carpeta (1)

- `.claude/rules/tests.md`: zona mixta en ops/zonas.json

### 5d. Agentes (3)

- `.claude/agents/auditor-datos.md`: Juzga el modelo de datos de HoMenu; el rol vale para cualquier base
- `.claude/agents/evaluador.md`: Mide a Lola: sus casos son datos del producto (línea 2 del programa #652: paquete opcional de bots)
- `.claude/agents/qa.md`: Prueba la app en el navegador; el rol es general, los casos son de HoMenu

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
| PR 2 | Entidades: decidir las `both` y las vertical genéricas; el glosario hereda el lado de su entidad como campo `scope` | entidades en duda = 19 | 0 |
| PR 3 | Principios: campo `project` y registro `ops/proyectos/homenu/principios/`; mover los verticales y resolver los de base de datos | verticales fuera de su registro = 2; en duda = 28 | verticales en su registro = todos; en duda = 0 |
| PR 4 | Fuentes: campo `project` en las de la casa que son de HoMenu y origen (decisión o fallo) en vez de fuente externa para los principios de proyecto | fuentes verticales sin marcar = 12; en duda = 12 | marcadas = todas; en duda = 0 |
| PR 5 | Normas dudosas: mover al registro de HoMenu las que sean suyas, o reescribir (sin nombrar el proyecto) las que sean generales | normas horizontales en duda = 38 | 0 (cada una, horizontal limpia o vertical) |
| PR 6 | Controles: tests de la casa que leen ficheros de HoMenu pasan a recibirlos por referencia (`--proyecto`) o se mueven; retirar `verticales_sin_salida` (#704) | tests de la casa que leen HoMenu = 2; en duda = 10 | 0 y 0 |
| PR 7 | Glosario: términos de proyecto aparte de los de la casa | términos en duda = 46 | 0 |
| PR 8 | Skills, reglas, comandos, specs y docs: marcar el lado de cada una y separar los skills de servicio en método (casa) y datos (proyecto) | en duda = skills 4, documentos 1; verticales sin marca = 27 | en duda = 0; todas marcadas |
| PR 9 | Factoría frente a HoMenu (#690): CLAUDE.md como índice corto con dos partes; `docs/` y `ops/` separados | documentos en duda = 1 | 0 |

Los PR 2 a 8 son independientes entre sí salvo por el 1; el 3 y el 4 van seguidos (una fuente de proyecto la cita un principio de proyecto). El 6 depende de #704 (ya fusionado).

## Dudas de clasificación que solo puede resolver Pablo

Cada una, con la opción recomendada primero; la respuesta decide cuántos de los dudosos de arriba pasan a un lado u otro.

1. **Principios de base de datos con origen solo en `docs/datos/PRINCIPIOS.md`.** A (recomendada): horizontales; se les busca fuente externa (PostgreSQL, Fowler) y `docs/datos/` queda como «cómo los aplica HoMenu». B: verticales, al registro de HoMenu. C: verticales los que dicen «casa» y horizontales el resto.
2. **Lo que solo vale con un bot conversacional** (principios del área `conversational-ai` y normas de ámbito `bot`). A (recomendada): horizontales con una condición `aplica_si: bot` en el registro. B: un tercer lado, «paquete de bots» (línea 2 de #652). C: verticales de HoMenu.
3. **Entidades marcadas `both`.** A (recomendada): obligar a un lado; la clase es horizontal y sus instancias son del proyecto. B: admitir `both` con un techo que solo baja. C: partir cada una en dos entidades.
4. **Skills de servicio** (1password, github, hetzner, tailscale, vercel, supabase). A (recomendada): partir cada una en método (casa) y datos del proyecto (ids, bóvedas, repo), que el agente recibe por referencia. B: dejarlos enteros en la casa. C: marcarlos verticales.
5. **Las zonas de `ops/zonas.json` contradicen la regla de los agentes**: `evaluador`, `qa` y `auditor-datos` están en producto. A (recomendada): moverlos a factoría y que lo vertical llegue por referencia. B: dejar la zona y marcar los tres como duda. C: moverlos a un paquete opcional.

## Qué no mide

- Las reglas de estándar de cada tarea (`ops/estandares-agentes.json`): son de la línea 1 de #652 (estándares asépticos), con su propia cifra (28 de 162 con lenguaje de proyecto, según el comentario del 13 oct).
- El contenido de dentro de cada skill y documento: se clasifica el fichero entero, no sus párrafos. Una skill de servicio mezcla método y datos del proyecto.
- Ficheros de código (`scripts/`, `.claude/hooks/`, `.github/`): solo cuentan como controles de las normas y como tests.
