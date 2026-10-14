# Súper tabla de entidades

Segunda versión (12 oct 2026, agente `datos`), tras los seis retos de Pablo. **Pablo ya decidió y el registro
lo aplica** (#652): `ops/entidades.json` pasó a su tercera versión, con nivel (`level`), alcance (`scope`),
familia, quién la crea y quién la lee en cada entidad. Las secciones 0 a 13 son el **análisis que llevó a eso**,
con las cifras del 12 oct; donde choquen con el registro manda el registro. La tabla de la sección 2 y
`MAPA.md` los genera `node scripts/mapa-entidades.mjs --escribir` desde el registro (ya no hay una propuesta
aparte en un script); los vigila `ops/entidades.test.js`. Certeza: lo que sale del registro y de los ficheros
citados está **comprobado**; las columnas «quién la crea» y «quién la lee» vienen de los análisis por familia
(`docs/entidades/analisis/`), leídos y no recontados, y la comparación con Backstage es **creo** (de memoria,
sin consultar la web; GitHub no contestó, así que no conté issues vivos).

## 0. Resumen de lo que dicen los datos

| Reto de Pablo | Veredicto | Dato que lo decide |
|---|---|---|
| 1. Issue N0, cada tipo N1, concreto N2 | **Mal planteado**: es especialización (`is_a`), no abstracción | fondo y encargo comparten 3 de sus campos propios; caso y decisión casi no tienen |
| 2. Principio → Norma → Estándar | **Cierto a medias** | 183 de 183 normas citan principio; pero el estándar lleva 156 reglas propias, no solo normas agregadas |
| 3. Agente = perfil ejecutor | **Cierto.** Tarea de agente es entidad; Herramienta y Relación entre agentes, no | 66 tareas con id en 9 agentes; las herramientas son nombres de un vocabulario de Claude Code |
| 4. Hook = implementación de un Control | **Casi.** Control es entidad; el veredicto no sale del mecanismo | 107 normas con control automático usan 59 ficheros; `ci` da duras, semiduras y blandas |
| 5. Evento sin actor | **Desfasado**: el campo existe, el hueco es otro | `actor` está desde #568 y vale null para Pablo; ninguna de las otras 28 firmas lleva actor |
| 6. Nivel de contención | **Hace falta**, con `project` y sin Programa | el repo mezcla factoría y HoMenu; 82 de 183 normas son de producto |

## 1. Dos ejes, y algo que no es un eje

El mapa mezclaba tres cosas distintas (principio 1 de N0, un nombre por concepto):

1. **Abstracción** (`level`): `meta` (N0: lo que hace buena una pieza de la familia), `template` (N1: plantilla por tipo) y `piece` (N2: la pieza). Es la escala de `docs/ops/FORJA.md`. Otras escalas escritas la contradicen: `docs/diseno/META-DISENO.md` (N2 es el perfil y la instancia no es nivel) y `docs/entidades/N0-principios.md` (N2 son tipos y N3 tipos específicos); y `ops/planos.json` usa «nivel» 0 a 4 para madurez. **Cuatro significados de «nivel».**
2. **Contención** (`project`): factoría > proyecto > entorno o instancia. De quién es una pieza y de qué cuelga. Es lo que llamábamos horizontal y vertical, pero con un id de proyecto (sección 8).
3. **Derivación** (no es un eje): principio → norma → estándar, y fondo → caso → encargo. Una cosa sale de otra o la justifica. No son niveles; por eso los retos 1 y 2 se confunden con la abstracción (secciones 3 y 4).

El nivel es de la pieza, no de la entidad: las filas son **familias**, y `level` de una entidad dice el nivel de sus piezas.
El 12 oct, antes de #652: 3 `meta` (principle, norm, rule), 1 `template` (mechanism) y 37 `piece`. «N0 y N1 siempre horizontales» falla en 2 sitios
reales (`docs/datos/PRINCIPIOS.md`, solo de HoMenu, y los 40 principios de producto). Lo que aguanta: un meta o una plantilla de
proyecto es una **extensión** que cita su meta horizontal (reglas 1 a 4 de N0).

## 2. La tabla

Todo sale de `ops/entidades.json`. Alcance (`scope`): `horizontal` (la clase es de la factoría) o `vertical`
(sus piezas son siempre de un proyecto); `both` y «puente» se retiraron el 14 oct 2026 (#710). Hoy: 41 horizontales
y 13 verticales entre 54 entidades. Ocho se quitaron del registro el 13 oct 2026 (decisión de Pablo, #706): judge, rule, learning,
deployment, secret, vault, criterion y verification; lo que eran ahora es un valor, un campo, un tipo de evento o un tipo
de recurso, y su historial queda en git. El resto de este documento, hasta la sección 9, es el análisis de antes de quitarlas. Las 10 que eran `both` pasaron a horizontal con sus ejemplares del proyecto fuera de la entidad. Lo de trabajo (issue, PR, rama, agente, skill…) es horizontal: que viva hoy en el repo de HoMenu no cambia su lado (sección 8). Nivel de las piezas: 46 `piece`, 4 `meta` y 4 `template`.

<!-- super-tabla:inicio -->
| id | familia | nivel | alcance | quién la crea | dónde vive (registro) | quién la lee | parte de, tipo de o hijo de |
|---|---|---|---|---|---|---|---|
| `session` | work | piece | horizontal | automatic | ninguno (without_registry) | .claude/hooks/guardia.mjs, .claude/hooks/avisos.mjs, .claude/hooks/eventos.mjs | — |
| `team-member` | access | piece | horizontal | human | `scripts/lib/eventosVocabulario.mjs#MIEMBROS` (without_registry) | scripts/lib/eventosVocabulario.mjs, scripts/lib/recursos.mjs, scripts/lib/ensayosRollback.mjs | — |
| `identity` | access | piece | horizontal | human | `scripts/lib/tokenSesion.mjs` (partial) | scripts/lib/tokenSesion.mjs, .claude/hooks/arranque.mjs | resource |
| `service` | access | piece | horizontal | human | `ops/INVENTARIO.md` (without_registry) | ops/INVENTARIO.md, scripts/lib/recursos.mjs | — |
| `environment` | delivery | piece | horizontal | human | `ops/INVENTARIO.md` (without_registry) | ops/planos.json, scripts/apply-migration.mjs | project |
| `event` | measure | piece | horizontal | automatic | `.claude/hooks/eventos.mjs` (partial) | ops/metricas.json, scripts/lib/cumplimiento.mjs | — |
| `norm` | rules | meta | horizontal | agent | `ops/normas.json` (with_registry) | ops/normas.test.js, scripts/lib/estandaresAgentes.mjs, docs/ops/NORMAS.md | project |
| `mechanism` | rules | template | horizontal | agent | `ops/mecanismos.json` (with_registry) | scripts/lib/escalas.mjs, ops/mecanismos.test.js, scripts/lib/tiposDeEncargo.mjs | — |
| `metric` | measure | piece | horizontal | agent | `ops/metricas.json` (with_registry) | scripts/lib/cumplimiento.mjs, ops/metricas.test.js | — |
| `eval` | measure | piece | horizontal | agent | `scripts/bot-evals.json` (partial) | scripts/bot-evals.mjs, scripts/skills-prueba.mjs | — |
| `agent` | agents | piece | horizontal | agent | `.claude/agents` (with_registry) | .claude/agentes.test.js, scripts/lib/agentes.mjs | — |
| `skill` | agents | piece | horizontal | agent | `.claude/skills` (with_registry) | .claude/skills.test.js, scripts/lib/skills.mjs | — |
| `hook` | agents | piece | horizontal | agent | `.claude/settings.json` (partial) | .claude/settings.json, .claude/hooks/arranque.mjs | — |
| `issue` | work | piece | horizontal | agent | `scripts/lib/issues.mjs` (with_registry) | scripts/lib/issues.mjs, .claude/hooks/arranque.mjs, scripts/lib/situacion.mjs | — |
| `root-problem` | work | piece | horizontal | agent | `scripts/lib/fondos.mjs` (with_registry) | scripts/lib/fondos.mjs, .github/workflows/fondos.yml, scripts/fondos-pr.mjs | issue |
| `case` | work | piece | horizontal | agent, automatic | `scripts/lib/issues.mjs` (with_registry) | scripts/casos-pr.mjs, scripts/lib/fondos.mjs, .claude/hooks/guardia.mjs | issue, root-problem |
| `assignment` | work | piece | horizontal | agent | `scripts/lib/issues.mjs` (with_registry) | scripts/lib/tiposDeEncargo.mjs, scripts/lib/fondos.mjs, scripts/fondos-pr.mjs | issue, root-problem |
| `decision` | work | piece | horizontal | agent, human | `ops/DECISIONES.md` (partial) | .claude/hooks/pendientes.mjs, scripts/lib/situacion.mjs, .claude/hooks/arranque.mjs | issue |
| `pull-request` | work | piece | horizontal | agent | ninguno (without_registry) | .claude/hooks/guardia.mjs, scripts/casos-pr.mjs, scripts/fondos-pr.mjs | — |
| `branch` | work | piece | horizontal | automatic | ninguno (without_registry) | scripts/tarea.mjs, .claude/hooks/guardia.mjs | — |
| `migration` | delivery | piece | horizontal | agent | `supabase/ESTADO.md` (partial) | scripts/apply-migration.mjs, scripts/verificar-estado.mjs, supabase/migrations.test.js | — |
| `table` | data | piece | horizontal | agent | `ops/MODULOS.json` (partial) | ops/modulos.test.js, supabase/cableado.test.js | module |
| `data-source` | data | piece | horizontal | agent | `src/data/model.js#TABLAS` (with_registry) | src/data/model.test.js, ops/fuentes.test.js | — |
| `module` | data | piece | horizontal | agent | `ops/MODULOS.json` (with_registry) | ops/modulos.test.js | project, metric |
| `vocabulary` | rules | piece | horizontal | agent | `ops/vocabularios-vida.json` (partial) | ops/vocabularios-vida.test.js, scripts/lib/vocabulariosVida.mjs | — |
| `principle` | rules | meta | horizontal | agent, human | `ops/principios/_catalogo.json` (with_registry) | ops/normas.test.js, ops/principios.test.js, ops/uniones.test.js | — |
| `source` | rules | piece | horizontal | agent, human | `ops/fuentes-documentales/_catalogo.json` (with_registry) | ops/fuentes-documentales.test.js, scripts/lib/fuentesDoc.mjs, ops/principios.test.js, ops/estandares-agentes.test.js | — |
| `household` | home | piece | vertical | automatic, human | `specs/modelo-datos.md` (partial) | src/lib/householdsSync.js, api/_bot/casa.js | — |
| `person` | home | piece | vertical | human | `ops/MODULOS.json#persona` (partial) | api/_bot/ficha.js, src/utils/validateMenu.js | household |
| `channel-identity` | home | piece | vertical | automatic | `ops/MODULOS.json#bot_identities` (partial) | api/_bot/enlace.js | account |
| `recipe` | food | piece | vertical | agent, human | `src/data/recipes` (partial) | src/utils/validateMenu.js, api/_bot/propias.js | — |
| `ingredient` | food | piece | vertical | human | `src/data/ingredients.json` (partial) | src/lib/ingredients.js, src/lib/shoppingBuilder.js | — |
| `menu` | food | piece | vertical | agent, human | `specs/menu-generation.md` (partial) | src/lib/menusSync.js, api/_bot/menu.js | household |
| `pantry` | food | piece | vertical | human | `specs/modelo-datos.md` (partial) | src/lib/pantry.js, api/_bot/despensa.js | household |
| `shopping-list` | food | piece | vertical | automatic, human | `specs/shopping-list.md` (partial) | src/lib/shoppingBuilder.js, api/_bot/menu.js | menu-week |
| `lola-conversation` | lola | piece | vertical | automatic | `ops/MODULOS.json#bot_messages` (partial) | api/_bot/agente.js, scripts/bot-evals.mjs | chat, household |
| `resource` | access | template | horizontal | human | `ops/recursos.json` (with_registry) | ops/recursos.test.js, scripts/cumplimiento.mjs | project |
| `control` | rules | piece | horizontal | agent | `ops/normas.json` (partial) | ops/normas.test.js | — |
| `standard` | rules | piece | horizontal | agent | `ops/estandares-agentes.json` (with_registry) | docs/ops/ESTANDARES.md, scripts/estandares-agentes.mjs, ops/estandares-agentes.test.js | agent-task |
| `plane` | measure | meta | horizontal | agent, human | `ops/planos.json` (with_registry) | scripts/planos.mjs, ops/planos.test.js | — |
| `agent-task` | agents | piece | horizontal | agent | `ops/estandares-agentes.json` (with_registry) | scripts/estandares-agentes.mjs, ops/estandares-agentes.test.js, docs/ops/ESTANDARES.md | agent |
| `workflow` | delivery | piece | horizontal | agent | `.github/workflows` (partial) | ops/workflows.test.js, ops/salud-despliegue.test.js | repo |
| `project` | structure | piece | horizontal | human | `scripts/lib/zonasProyecto.mjs#PROYECTOS` (with_registry) | scripts/lib/normas.mjs, scripts/estandares-agentes.mjs, ops/uniones.test.js, ops/vigilante-lados.test.js, scripts/lib/metricas.mjs, scripts/lib/fabrica.mjs, scripts/lib/recursos.mjs, scripts/cumplimiento.mjs, .claude/hooks/eventos.mjs | — |
| `repo` | structure | piece | horizontal | human | `ops/entidades.json` (partial) | ops/planos.json, scripts/rulesets.mjs | project |
| `design-system` | design | piece | horizontal | agent | `src/design/tokens.js` (partial) | ops/diseno/bloques.json, ops/diseno/bloques.test.js, .claude/skills/revision-de-diseno/SKILL.md, .claude/agents/constructor.md | project |
| `design-profile` | design | template | horizontal | agent | `ops/diseno/bloques.json` (with_registry) | ops/diseno/bloques.test.js, .claude/skills/revision-de-diseno/SKILL.md, .claude/agents/constructor.md | — |
| `token` | design | piece | horizontal | agent | `src/design/tokens.js` (with_registry) | src/design/tokens.test.js, src/design/contraste.js, scripts/diseno/generar-tokens-css.mjs | design-system |
| `component` | design | piece | horizontal | agent | `DESIGN_SYSTEM.md` (partial) | scripts/lib/taxonomiaDiseno.mjs, .claude/skills/revision-de-diseno/SKILL.md, .claude/agents/constructor.md | design-system |
| `pattern` | design | piece | horizontal | agent | `ops/diseno/bloques.json#Patrones` (partial) | ops/diseno/bloques.json, .claude/skills/revision-de-diseno/SKILL.md, .claude/agents/constructor.md | design-system |
| `screen` | design | piece | horizontal | agent | `ops/diseno/taxonomia.json` (with_registry) | scripts/lib/taxonomiaDiseno.mjs, ops/diseno/taxonomia.test.js | — |
| `flow` | design | piece | horizontal | agent | `ops/diseno/taxonomia.json` (with_registry) | scripts/lib/taxonomiaDiseno.mjs, ops/diseno/taxonomia.test.js | — |
| `account` | home | piece | vertical | automatic, human | `ops/MODULOS.json` (partial) | src/lib/useAuth.js, api/_bot/enlace.js | — |
| `group` | home | piece | vertical | human | `supabase/migrations/0079_personas_y_grupos.sql` (partial) | api/_bot/ficha.js | household |
| `menu-week` | food | piece | vertical | agent, human | `supabase/migrations/0005_multiweek_menus.sql` (partial) | src/lib/menusSync.js, src/lib/shoppingBuilder.js | menu |
| `chat` | lola | piece | vertical | automatic | `supabase/migrations/0057_bot_cimientos.sql` (partial) | api/_bot/enlace.js, api/_bot/turnos.js | household |
| `assignment-type` | work | template | horizontal | agent | `ops/tipos-de-encargo.json` (with_registry) | scripts/lib/tiposDeEncargo.mjs, ops/tipos-de-encargo.test.js | — |

Cifras: 56 entidades. Alcance: horizontal 43, vertical 13. Nivel: piece 49, meta 3, template 4. Familias: work 9, access 4, delivery 3, measure 4, rules 7, agents 4, data 3, home 5, food 6, lola 2, structure 2, design 7. Relaciones: 95 (is_a 5, parent_of 4, part_of 23, reference 63).
<!-- super-tabla:fin -->

## 3. Reto 1: Fondo, Caso, Encargo, Decisión

**Son cuatro subtipos de un registro común, no un Issue con N1 por tipo; el registro ya lo dice (`is_a issue`).**

Datos (`scripts/lib/issues.mjs`, `scripts/lib/fondos.mjs`):
- Lo común es de GitHub: número (un solo espacio de ids), título, estado, etiquetas, asignado, padre. El grupo `tipo` tiene 4 valores cerrados.
- Lo propio es casi disjunto: la ficha del fondo tiene 16 campos, el bloque del encargo 15, el caso 2 (etiquetas `analisis` y `causa`) y la decisión 0. Solo `mecanismo` y `verificacion` se repiten entre fondo y encargo.
- Relaciones propias: caso y encargo cuelgan del fondo; el encargo depende de otro encargo; la decisión no cuelga de nada y se asigna a una persona.

Por qué N0, N1 y N2 no encajan: son **generación** (la forja produce plantillas, la plantilla produce piezas). Un fondo no es la plantilla de un issue: es otra cosa con otro ciclo de vida.

Dónde sí hay niveles en esta familia: el **encargo**. `ops/tipos-de-encargo.json` tiene 5 tipos y 12 subtipos activos (21 retirados, que se conservan para el panel) con pasos, banderas y presupuesto: son plantillas (`template`) de las que sale cada encargo (`piece`).

¿Ayuda un N3? **No.** Los subtipos son valores de vocabulario cerrado con atributos y un lector (`tiposDeEncargo.mjs`), que es lo que PRINCIPIOS §6 pide para una tabla catálogo. Un nivel más no añade un lector. Lo que falta son relaciones:
- un caso y un encargo guardan su fondo en tres sitios (sub-issue, ficha y bloque): una sola fuente;
- la decisión tiene dos copias sin enlace (el issue y la fila de `ops/DECISIONES.md`).

Recomendación: mantener las 4 entidades con `is_a issue`, sin N3. Caso y decisión podrían ser solo valores de `kind`, pero ya son ids fijados del registro y retirarlos cuesta más que mantenerlos.

## 4. Reto 2: Principio → Norma → Estándar; Regla y Mecanismo

Comprobado en `ops/normas.json`, `ops/estandares-agentes.json`, `docs/ops/ESTANDARES.md` y `ops/mecanismos.json`:

| Pieza | Qué es de verdad | Dato |
|---|---|---|
| Principio | el porqué, con fuente propia | 56 propios y 40 de producto delegados; las normas citan 108 distintos |
| Norma | lo que debe ser verdad, con control, ejecutor y veredicto. **Siempre cita principio** | 183 normas, 183 con `principio` |
| Estándar | **dos cosas mezcladas**: normas agregadas por ámbito × acción (derivado, no copia) y reglas propias | 66 tareas de 9 agentes; 176 normas llegan a alguna tarea por consulta y 7 a ninguna; **156 reglas propias** y 11 tareas comunes |
| Regla (`.claude/rules`) | un **vehículo de texto**, no un tipo; 6 ficheros sin id | solo 17 de 183 normas dicen `donde` en `.claude/rules/`; 36 en `CLAUDE.md`; 17 en skills |
| Mecanismo (`ops/mecanismos.json`) | un **tipo de control con atributos** (escalón, ejecutor, alcance, veredicto): una plantilla | 12 mecanismos; la norma cita su `ejecutor` (10 valores), no el id del mecanismo |

Lo cierto: el estándar no copia las normas, las consulta. Lo que no es cierto: **no es solo agregación**; tiene 156 reglas propias con la misma plantilla (`scripts/lib/regla.mjs`). Tres hallazgos:
- **`regla` significa dos cosas**: el fichero de `.claude/rules` y la plantilla de `regla.mjs`. Recomiendo que la entidad `rule` sea el vehículo de texto y la unidad con id sea la norma.
- **La cadena es de derivación**: principio → norma (control + ejecutor) → estándar (consulta). Se modela con relaciones (`norm cites principle` ya existe; `standard reads norm` falta), sin niveles.
- **`fuerza` y `veredicto` son dos cosas**: `fuerza` (debe 141, no_debe 41, conviene 1) es cuánto obliga; `veredicto` (90 normas blandas; el resto, de más a menos, semiduras, duras y rotas, en `ops/normas.json`) es cuánto se hace cumplir. Lo que Pablo llama «fuerza dura/semi/blanda» es el `veredicto`.

## 5. Reto 3: Agente, Skill, Herramienta, Tarea de agente, Relación entre agentes

Verificado en `.claude/agents/*.md`, `.claude/agentes.test.js`, `ops/estandares-agentes.json` y `ops/tipos-de-encargo.json`.

- **Agente = perfil ejecutor: cierto.** Cada ficha lleva `Tipo` (constructor o juez), `tools`, `skills` precargadas, misión y estándares de sus tareas. El juez se distingue por no tener herramientas de escritura, y lo vigila `agentes.test.js` (`ESCRITURA`). Es una pieza `both`: `lola` solo trabaja en HoMenu, `gobierno` en la factoría.
- **Skill = conocimiento: cierto.** 15 skills; el `dueno` de cada una es un agente; 7 tipos de plantilla.
- **Tarea de agente: es entidad.** 66 con `id`, registro propio, lectores (`npm run estandar`, `ESTANDARES.md`, el brief de `/orquestar`) y término en el glosario. Falta en el registro de entidades (`agent-task`).
- **Herramienta: no es entidad.** Es un valor de un vocabulario cerrado externo (`HERRAMIENTAS`, 9 nombres de Claude Code, más las del navegador en `qa`) con un lector. Las herramientas de Lola son otra cosa (piezas de producto en `api/_bot`); no tienen registro con id y no las cuento.
- **Relación entre agentes: no es entidad, es una arista con atributos.** Está en tres sitios y solo uno estructurado: los `pasos` de cada subtipo (qué agente sigue a cuál), `constructor` y `juez` del encargo, y las secciones «Gateways» y «Escalado» de cada ficha (texto). El gateway es `agent hands_to agent` (o a una persona) y hoy es prosa. Vale como relación, sin id.

## 6. Reto 4: Hook, Control y Mecanismo

- **Hook:** 9 entradas en `settings.json` y 18 ficheros en `.claude/hooks`. Es un **ejecutor**: `guardia` lo ejecuta en 26 normas.
- **Control: sí es entidad, con un problema de nombre.** De 183 normas, 76 tienen control `juicio` (sin artefacto) y 107 un fichero: **59 ficheros distintos, 14 compartidos**. `guardia.test.js` vigila 20 normas, `ops/planos.json` 7 y `ops/regla.test.js` 7. Es de muchos a uno y con vida propia: si se borra el fichero se rompen todas. `control_tipo` tiene 5 valores (test 92, juicio 76, planos 7, script 7, workflow 1). Pero **el glosario ya usa «control»** para «una comprobación automática… con código que da falta, aviso o bien», y el `control` de una norma es una ruta. Hay que decidir el nombre antes de crear la entidad.
- **Mecanismo = plantilla.** 12 tipos con escalón, ejecutor, alcance y veredicto. Hay **tres vocabularios solapados**: `ejecutor` (10 valores), `control_tipo` (5) y los 12 ids de mecanismo.
- **El veredicto de la norma no sale del mecanismo.** Con ejecutor `ci` hay 19 duras, 27 semiduras y 3 blandas; con `guardia`, 23 semiduras y 3 blandas. El mecanismo pone un **techo** (una norma `dura` exige ejecutor del sistema, `normas.mjs:210`); el veredicto concreto depende del control de cada norma. Copiarlo del mecanismo (`ci` es `dura`) falsearía 30 de las 49 normas con ejecutor `ci` (27 semiduras y 3 blandas).
- Relaciones que faltan: `norm checked_by control`, `control runs_in hook`, `hook implements mechanism`. Sin ellas «¿qué norma se queda sin control si cambio este hook?» solo se contesta leyendo.

## 7. Reto 5: eventos sin actor, y los huecos

**El campo `actor` ya existe** (`.claude/hooks/eventos.mjs`, #568). La nota de `event` en `ops/entidades.json` («ninguno lleva actor») está desfasada. Lo que de verdad falta:
- `actor` solo reconoce la App de sesiones: **Pablo y «desconocido» salen los dos como null**.
- Solo `eventos.jsonl` lleva sesión y actor. Las otras **28 firmas** de las 29 de `ops/metricas.json` no llevan ninguno.
- El destino que falta es el registro de sesiones: `session` no tiene id común (ficha local, carpeta y rama, `eventos.jsonl` y transcripción). Un evento apunta a la sesión por `sesion`, pero las otras tres huellas no se cruzan.
- `nombre` es polimórfico (skill o agente según el evento), señalado en el propio fichero.

Tus siete huecos:

| Hueco | Qué es | Dato |
|---|---|---|
| Intervención humana | **tipo de evento** con `actor` de tipo persona | hoy: `permiso_pedido` y los issues `tipo:decision`; 52 normas con ejecutor `persona` |
| Veredicto | **valor de vocabulario y tipo de evento**, no entidad. Otra colisión: veredicto de cumplimiento (dura…) y veredicto del juez (pasa o no pasa) | `VEREDICTOS` en `escalas.mjs` |
| Riesgo | **campo** (vocabulario alto, medio, bajo) | 32 alto, 64 medio, 87 bajo en las normas |
| Permiso | **entidad candidata, solo si hay registro**: hoy 41 `allow` y 5 `deny` en `settings.json`, más los de la App de GitHub y los `grant` de Postgres, sin id | el evento `permiso_pedido` ya existe |
| Workflow | **entidad (falta)**: 11 ficheros en `.github/workflows`, vigilados por `workflows.test.js` | — |
| Presupuesto | **no es entidad**: `ops/presupuestos.json` es una tabla por complejidad del encargo; el gasto es un tipo de evento (`gasto.jsonl`) | — |
| Ejecución | **tipo de evento** (quién, qué, coste, resultado); hoy en `pasadas.jsonl`, `gasto.jsonl` y la línea de `skills-prueba` | — |

De los siete: **una entidad real** (workflow), **una dudosa** (permiso), **cuatro tipos de evento** y un campo. Recomiendo un esquema único de evento con campos fijos (`id`, `ts`, `session`, `source`, `actor_kind`, `actor`, `subject_type`, `subject_id`, `type`) y un tipo por hueco, en vez de seis registros.

## 8. Reto 6: contención (factoría, proyecto, entorno)

**Hace falta un nivel de contención, que se llama `project` y no necesita Programa ni Portfolio.**

Datos:
- Hay **dos proyectos reales**: HoMenu (con Lola) y el panel (`homenu-panel`, repo privado, Hetzner). La factoría **vive dentro del repo de HoMenu**: de unos 2.700 ficheros, `ops`, `scripts` y `.claude` (881) son factoría y `src`, `api`, `supabase` y `public` (1.752) son producto. El repo no es el proyecto.
- Las normas ya se mezclan: de 183, 82 son de producto (bot 24, data 33, catalog 14, product 9, ui 2), 82 de factoría (process 36, infra 30, writing 16) y 19 dudosas (code 10, api 9). Sin campo `project`, una sesión del panel recibiría las 82 de HoMenu.
- Los 23 recursos de `ops/recursos.json` son de la factoría (GitHub 5, 1Password 6), de HoMenu (Supabase, Telegram, Vercel) o de los dos: Hetzner sirve al panel y a las copias de la base de HoMenu, así que `project`–`service` es **muchos a muchos**.
- Los 16 módulos y las 55 tablas son todos de HoMenu: `project` obligatorio.

Modelo propuesto:

| Capa | Qué es | Entidad |
|---|---|---|
| Factoría | el proceso: equipo, reglas y mecanismos que valen para todos | **no se crea como entidad**: es un valor más de `proyecto` (`factoria`, en scripts/lib/zonasProyecto.mjs) |
| Proyecto | HoMenu, panel | **sí, `project`**: id, nombre, repos, dominios |
| Entorno o instancia | staging, producción; el sistema de diseño de un proyecto | `environment` gana `project`; el sistema de diseño es la instancia de diseño |
| Programa o Portfolio | agrupar proyectos | **no**: sin lector (2 proyectos, equipo de 3) |

Qué cuelga de cada capa (**creo**; es la columna «contención» de la tabla):

| Siempre de un proyecto | De un proyecto o de la factoría | Siempre de la factoría |
|---|---|---|
| módulo, tabla, fuente de datos, despliegue, migración, casa y todo el vertical | entorno, servicio, clave, norma, regla, agente, skill, issue, PR, rama, evento, métrica, eval, vocabulario, principio | sesión, miembro del equipo, identidad, bóveda, juez, hook, aprendizaje |

Falta una entidad que la primera versión no vio: **`repo`**. Factoría y HoMenu comparten repo y el panel tiene otro: issue, PR y rama cuelgan de un repo (hoy `ops/planos.json` lleva uno escrito a mano), y el repo se relaciona con el proyecto por carpetas.

Comparación con Backstage (de memoria, **creo**): Domain agrupa sistemas; System agrupa componentes y recursos; Component es una unidad desplegable con `owner` y `lifecycle`; Resource es infraestructura; Group y User son la propiedad; Template genera componentes. Encaja así:
- nuestro `project` = su System;
- su Component = la app web de HoMenu, Lola o el panel (nuestro `module` es más fino);
- su Resource = nuestro `resource` y `service`;
- su Group o User = `team-member`;
- su Template = nuestro nivel `template`;
- su Domain = nuestro Programa, que con dos proyectos no se justifica;
- su `lifecycle` (experimental, production, deprecated) se parece al `grado` de los módulos (`usable`, `en_marcha`): conviene alinearlos.

Contradice un punto de la primera propuesta: «horizontal/vertical» pierde sentido como valor de la entidad y gana como **campo de la pieza** (`project`). La entidad solo dice si sus piezas pueden llevarlo.

## 9. Los diez puentes, revisados

Con la contención cambian dos veredictos (entorno y migración). **`bridge` no es un valor legítimo del eje**: reunía «una palabra en los dos lados» y los datos dicen otra cosa.

| Entidad | Contención | Por qué (dato) |
|---|---|---|
| `environment` | both | Vercel y Supabase son de HoMenu; los environments de GitHub (`vigia`) son de la factoría; tres sentidos de la palabra |
| `deployment` | vertical | un despliegue es de un proyecto (Vercel de HoMenu, el panel en Hetzner) |
| `event` | both (se parte) | `eventos.jsonl` sin datos de familias frente a `user_events` con usuario y casa: dos regímenes de privacidad |
| `metric` | both (se parte) | 44 métricas GQM de proceso (`ops/metricas.json`) frente a 54 de módulo (`MODULOS.json`), con formas distintas |
| `eval` | both | Lola (`bot-evals.json`, `router-evals.json`) frente a las pruebas de skills |
| `judge` | horizontal | 5 jueces, todos de factoría |
| `migration` | vertical | 101 ficheros que cambian la base de HoMenu; la pasarela es una relación |
| `table`, `data-source`, `module` | vertical | 55, 40 y 16 piezas, todas de HoMenu |

Dos familias con piezas de los dos lados no estaban entre los puentes: `vocabulary` y `principle`.

## 10. Relaciones rotas o ausentes

Comprobado en `ops/entidades.json`: 63 relaciones; 35 en un campo, 5 en un fichero, **13 sin campo** y **10 sin auditar** (todas verticales). 10 entidades no reciben ninguna flecha (deployment, judge, secret, rule, decision, pull-request, migration, data-source, channel-identity, shopping-list).

| Rota o ausente | Nota |
|---|---|
| `migration creates table` | derivable de `scripts/lib/migraciones.mjs`, no hace falta guardarla |
| `norm enforced_by mechanism` | la norma guarda el `ejecutor`, no el id del mecanismo |
| `norm checked_by control`, `control runs_in hook` | no existen (sección 6) |
| `standard reads norm` | es una consulta por ámbito × acción, sin relación |
| `pull-request comes_from branch`; `issue in repo` | no constan |
| `migration judged_by judge` / `made_by agent` | la cabecera exige el OK de `auditor-datos` |
| `module belongs_to agent` | la nota del registro dice que el módulo tiene dueño y `MODULOS.json` no lo guarda |
| `learning recorded_in …` | campo declarado y no escrito en ningún sitio |
| `secret belongs_to environment`; `resource uses project` | la clave de GitHub vive en un environment |
| `event happens_in session` | existe, pero la sesión no tiene id común |
| `session uses identity` y compañeras | no hay registro de identidades |
| `ops/recursos.json` | existe y el registro no lo conoce (`secret` y `vault` figuran sin registro) |

## 11. Entidades que faltan (de verdad)

Criterio: se usa dos veces o más, no repite otra, tiene dueño y **un lector concreto**.

### 11.1 Las necesita ya la factoría

| Entidad | Evidencia | Lector |
|---|---|---|
| `project` | 2 proyectos; 82 de 183 normas son de producto | el campo `project` de toda pieza; el panel |
| `repo` | 2 repos; `ops/planos.json` lleva uno a mano | issues, PR, rulesets, panel |
| `agent-task` | 66 tareas con id | `npm run estandar`, `/orquestar` |
| `control` | 59 ficheros para 107 normas | `normas.test.js` (**decidir el nombre**: choca con el glosario) |
| `standard` | 66 estándares por tarea y 156 reglas propias | `ESTANDARES.md` |
| `workflow` | 11 workflows con test propio | `workflows.test.js` |
| `resource` | 23 recursos con dueño y caducidad; sustituye el registro de `secret` y `vault` | informe semanal |
| `plane` | `ops/planos.json`: 13 planos con escala 0 a 4 | `npm run planos` |
| `template` y `forge` | 7 tipos de skill, 5 de encargo y 6 perfiles de diseño sin id común; una forja por familia | forja de skills, `/orquestar` |
| `zone`, `workspace`, `objective` | términos de glosario, `--zona`, 7 objetivos GQM | guardia, `metricas.test.js` |

### 11.2 Solo con un segundo proyecto de verdad

`campaign`, `sprint` y `tenant`: sin lector hoy, serían campos sin lector. `program` o `portfolio`: no.

**Corregido el 12 oct 2026 (Pablo, #652):** esta sección aplazaba `design-system`, `token`, `component` y `pattern` por haber una sola instancia (HoMenu, 77 tokens). Ya no: HoMenu y el panel tienen instancia, y el diseño tiene lectores reales (`ops/diseno/bloques.json` y su test, `ops/diseno/contraste.json`, `src/design/contraste.js`, la skill `revision-de-diseno` y el agente `diseno`). Entran como entidades `design-system` (pieza, parte de un proyecto), `design-profile` (plantilla: los perfiles P1 a P6 de META-DISENO.md), `token`, `component` y `pattern` (piezas del sistema). Los bloques A a Q y las leyes L01 a L22 son el nivel meta, la base de la que sale todo; no tienen entidad propia. Lo que sigue en duda es si el panel tiene ya un `token` o un `component` registrado (no lo he comprobado: su repo es privado).

### 11.3 Verticales con tablas y sin entidad

55 tablas en 23 módulos y solo 9 entidades: `group`, `allergy`, `favorite` y `rating`, `cooking`, `reminder`, `task`, `shared-menu`, `folder`, `store-product`, `saved-menu`, `user-event`, `invite`. Es auditar el eje vertical, fuera de este ataque.

## 12. Cómo se metieron `level` y `project` en `ops/entidades.json` (aplicado el 12 oct 2026, #652)

Hecho: el eje `axis` se retiró entero y lo sustituye `scope`; `project` y `repo` son entidades con la lista `projects` (homenu y panel); los tests viven en `ops/entidades.test.js` (el antiguo `ops/super-tabla.test.js` se fundió allí) y «ninguna entidad sin lector» lleva su lista de excepciones, que solo baja (hoy `team-member`; `learning` se retiró). Lo que sigue por hacer: la relación `extends` de cada meta o plantilla a su meta, y que toda familia `both` tenga dos registros. El texto original de la propuesta:

1. Vocabularios cerrados `LEVELS` (`meta`, `template`, `piece`) y `SCOPES` (`horizontal`, `vertical`, `both`) en `scripts/lib/entidades.mjs`, anclados en `ops/vocabularios-vida.json`. Campos `level` y `scope` obligatorios; `axis` convive hasta decidir y luego se retira (con `replaced_by`).
2. Entidad `project` con dos filas (homenu, panel) y relación `belongs_to project` en cada entidad no horizontal. Las piezas llevan el campo `project`, validado contra esa lista.
3. Tests escritos (`ops/super-tabla.test.js`): propuesta completa, vocabulario cerrado, ningún meta ni template vertical. Por escribir con la decisión: relación `extends` de cada meta o template a su meta; que toda familia `both` tenga dos registros; «ninguna entidad sin lector» con una lista de excepciones que solo baja (hoy `team-member` y `learning`).
4. `MAPA.md` pierde «Los puentes». Tocar el glosario («eje») y el test de entidades es un encargo propio.
5. Orden: decisión; luego `level` y `scope`; luego `project` y `repo`; luego `control`, `agent-task` y `workflow`.

## 13. Decisiones pendientes

Están en el informe del agente, cada una con tres opciones.
