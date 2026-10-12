# Súper tabla de entidades

Propuesta del 12 oct 2026 (agente `datos`, a petición de Pablo). **Nada de esto cambia
`ops/entidades.json` todavía**: la tabla de abajo la genera
`node scripts/super-tabla-entidades.mjs --escribir` desde el registro más una propuesta
(familia, nivel, ámbito, quién la crea y quién la lee) que vive en ese script hasta que Pablo decida.
Lo vigila `ops/super-tabla.test.js`. Marca de certeza: lo que sale del registro está **comprobado**; las
columnas «quién la crea» y «quién la lee» son **creo** (inferidas de las fuentes, sin leer cada script).

## 0. Lo que dicen los datos del modelo de dos ejes

La propuesta (nivel N0/N1/N2 y ámbito horizontal/vertical, independientes) **sirve con tres correcciones**:

1. **Hay tres escalas de «nivel» ya escritas y no coinciden** (rompe el principio 1 de N0, un nombre por concepto):
   - `docs/ops/FORJA.md`: 0 pieza meta, 1 plantilla por tipo, 2 pieza concreta. Es la de Pablo.
   - `docs/diseno/META-DISENO.md`: N0 leyes, N1 forja (bloques), N2 perfil por tipo de proyecto, y la instancia **no** es un nivel.
   - `docs/entidades/N0-principios.md`: N0 principios, N1 forja de una entidad, N2 tipos, N3 tipos específicos, con una «extensión de la base (vertical)» en medio.
   Además `ops/planos.json` usa «nivel» 0 a 4 para otra cosa (madurez de un plano). Recomendación: la escala de FORJA (3 niveles) y llamar a los valores `meta`, `template` y `piece`, sin números.
2. **El nivel es de la pieza, no de la entidad.** Las 41 filas del registro son **familias** (la familia «skill»); sus niveles son piezas: la forja de skills (meta), las 7 plantillas por tipo (template) y las 15 skills (piece). Por eso el campo `level` de una entidad dice **el nivel de sus piezas**: hoy 4 son `meta` (principle, norm, rule, mechanism) y 37 `piece`; **ninguna es `template`**. Ese hueco es la mayor falta de datos (sección 3).
3. **«N0 y N1 siempre horizontales» falla en dos sitios reales.** `docs/datos/PRINCIPIOS.md` (reglas de las tablas, solo HoMenu: «todo cuelga de la casa») es un N0 vertical, y `docs/entidades/N0-principios.md` ya lo llama «extensión del eje vertical». Los 40 principios de producto (`docs/producto/PRINCIPIOS.md`) son N0 sobre HoMenu y Lola, aunque su base es genérica. Regla que sí aguanta: **un meta o una plantilla vertical es una extensión que cita a su meta horizontal y no relaja nada** (reglas 1 a 4 de N0). El test solo exige lo débil: `meta` o `template` sin ámbito `vertical`, salvo que la pieza se declare extensión.

## 1. La tabla

Eje hoy = lo que dice `ops/entidades.json`. Ámbito propuesto = `horizontal`, `vertical` o `both` (la familia tiene piezas en los dos y cada pieza declara el suyo; ver sección 5).

<!-- super-tabla:inicio -->
| id | familia | nivel | eje hoy | ámbito propuesto | quién la crea | dónde vive (registro) | quién la lee | depende de |
|---|---|---|---|---|---|---|---|---|
| `session` | work | piece | horizontal | horizontal | npm run tarea y el arranque | ninguno (without_registry) | guardia, avisos, eventos.jsonl | branch |
| `team-member` | access | piece | horizontal | horizontal | Pablo (a mano, en prosa) | `CLAUDE.md` (without_registry) | nadie por máquina: decision.assigned_to lo nombra en GitHub | — |
| `identity` | access | piece | horizontal | horizontal | Pablo (alta de App o cuenta) | `scripts/lib/tokenSesion.mjs` (partial) | scripts/lib/tokenSesion.mjs, arranque | team-member |
| `service` | access | piece | horizontal | horizontal | Pablo (alta de cuenta) | `ops/INVENTARIO.md` (without_registry) | ops/INVENTARIO.md, skills de servicio | — |
| `environment` | delivery | piece | bridge | horizontal | gobierno / Vercel | `ops/INVENTARIO.md` (without_registry) | salud-despliegue, apply-migration | service |
| `deployment` | delivery | piece | bridge | horizontal | Vercel al empujar una rama | ninguno (without_registry) | salud-despliegue, qa | environment, branch |
| `event` | measure | piece | bridge | both | hooks y scripts (proceso); la app y Lola (producto, user_events) | `.claude/hooks/eventos.mjs` (partial) | metricas.json (proceso); embudo y evals (producto) | session |
| `norm` | rules | meta | horizontal | horizontal | gobierno, con juez | `ops/normas.json` (with_registry) | ops/normas.test.js, estándares, revisor | — |
| `learning` | work | piece | horizontal | horizontal | quien cierra el fondo (a mano) | ninguno (without_registry) | nadie: recorded_in no se escribe en ningún sitio | — |
| `mechanism` | rules | meta | horizontal | horizontal | gobierno | `ops/mecanismos.json` (with_registry) | plan-de-arreglo, encargo.mecanismo, escalas.mjs | — |
| `metric` | measure | piece | bridge | both | gobierno (proceso); cada módulo (producto) | `ops/metricas.json` (with_registry) | cumplimiento.mjs, informe semanal; MODULOS.json | — |
| `eval` | measure | piece | bridge | horizontal | lola y evaluador (Lola); forja (skills) | `scripts/bot-evals.json` (partial) | bot-evals.mjs, skills-prueba | — |
| `judge` | agents | piece | bridge | horizontal | gobierno (ficha en .claude/agents) | `.claude/agents` (partial) | orquestar, presupuestos, flujo | agent |
| `secret` | access | piece | horizontal | horizontal | Pablo (alta-de-secreto) | `ops/INVENTARIO.md` (without_registry) | ops/recursos.json, scripts/lib/env.mjs | vault, service |
| `vault` | access | piece | horizontal | horizontal | Pablo | `ops/INVENTARIO.md` (without_registry) | ops/recursos.json, ops/env.1password | — |
| `agent` | agents | piece | horizontal | horizontal | gobierno | `.claude/agents` (with_registry) | agentes.test.js, orquestar | — |
| `skill` | agents | piece | horizontal | horizontal | forja-de-skills | `.claude/skills` (with_registry) | skills.test.js, hooks de skill | agent |
| `rule` | rules | meta | horizontal | horizontal | gobierno | `.claude/rules` (partial) | Claude Code (reglas por carpeta) | — |
| `hook` | agents | piece | horizontal | horizontal | gobierno | `.claude/settings.json` (partial) | Claude Code (settings.json) | — |
| `issue` | work | piece | horizontal | horizontal | npm run issues -- --nuevo | `scripts/lib/issues.mjs` (with_registry) | issues.mjs, arranque, informes | — |
| `root-problem` | work | piece | horizontal | horizontal | quien diagnostica el caso | `scripts/lib/fondos.mjs` (with_registry) | fondos.mjs, workflow fondos | issue |
| `case` | work | piece | horizontal | horizontal | quien detecta el fallo | `scripts/lib/issues.mjs` (with_registry) | PR (Casos:), fondos.mjs | issue, root-problem |
| `assignment` | work | piece | horizontal | horizontal | plan-de-arreglo / orquestar | `scripts/lib/issues.mjs` (with_registry) | tipos-de-encargo, panel | issue, root-problem, assignment |
| `decision` | work | piece | horizontal | horizontal | cualquier sesión (issue); Pablo (DECISIONES.md) | `ops/DECISIONES.md` (partial) | pendientes.mjs, Pablo | issue |
| `pull-request` | work | piece | horizontal | horizontal | la sesión | ninguno (without_registry) | guardia, CI, revisor | — |
| `branch` | work | piece | horizontal | horizontal | npm run tarea | ninguno (without_registry) | guardia, deployment | issue |
| `migration` | delivery | piece | bridge | horizontal | datos | `supabase/ESTADO.md` (partial) | apply-migration, verificar-estado, ESTADO.md | environment |
| `table` | data | piece | bridge | vertical | una migración | `ops/MODULOS.json` (partial) | MODULOS.json, cableado.test.js, el código del módulo dueño | module |
| `data-source` | data | piece | bridge | vertical | datos / catálogo | `src/data/model.js` (with_registry) | src/data/model.js, fuentes.test.js, la app | — |
| `module` | data | piece | bridge | vertical | datos (MODULOS.json) | `ops/MODULOS.json` (with_registry) | modulos.test.js, panel | — |
| `vocabulary` | rules | piece | horizontal | both | quien crea el CHECK o la constante | `ops/vocabularios-vida.json` (partial) | vocabularios-vida.test.js, el código que valida | — |
| `principle` | rules | meta | horizontal | both | gobierno (proceso); producto (principios de producto) | `ops/principios/_catalogo.json` (with_registry) | normas, skill principios-de-producto | — |
| `household` | home | piece | vertical | vertical | la app al registrarse | `specs/modelo-datos.md` (partial) | toda tabla con household_id | — |
| `person` | home | piece | vertical | vertical | la familia | `specs/modelo-datos.md` (partial) | menús, alergias, Lola | household |
| `channel-identity` | home | piece | vertical | vertical | el enlace con Telegram | `ops/MODULOS.json` (partial) | api/bot | person |
| `recipe` | food | piece | vertical | vertical | catálogo JSON o la familia | `src/data/recipes` (partial) | menús, Lola | — |
| `ingredient` | food | piece | vertical | vertical | catálogo JSON | `src/data/ingredients.json` (partial) | recetas, despensa, lista | — |
| `menu` | food | piece | vertical | vertical | el generador o la familia | `specs/menu-generation.md` (partial) | lista de la compra, Lola | household |
| `pantry` | food | piece | vertical | vertical | la familia | `specs/modelo-datos.md` (partial) | lista de la compra, menús | household |
| `shopping-list` | food | piece | vertical | vertical | se calcula del menú | `specs/shopping-list.md` (partial) | la familia, Lola | menu |
| `lola-conversation` | lola | piece | vertical | vertical | Lola | `specs/plan-bot-mensajeria.md` (partial) | bot-evals, retención | household |

Cifras: 41 entidades. Nivel: piece 37, meta 4. Ámbito propuesto: horizontal 25, both 4, vertical 12. Familias: work 9, access 5, delivery 3, measure 3, rules 5, agents 4, data 3, home 3, food 5, lola 1.
<!-- super-tabla:fin -->

## 2. Relaciones que faltan o están rotas

Cifras (`ops/entidades.json`, comprobado): 63 relaciones; 35 guardadas en un campo, 5 en un fichero, **13 sin ningún campo que las guarde** y **10 sin auditar** (todas verticales). 10 entidades no reciben ninguna flecha: deployment, judge, secret, rule, decision, pull-request, migration, data-source, channel-identity y shopping-list; 8 de ellas son horizontales o puentes, y significa que nadie las referencia por id.

**Rotas** (existen en el registro y nada las guarda), por orden de importancia:

| Relación | Por qué importa | Qué la arreglaría |
|---|---|---|
| `migration creates table` | La 0003, 0006 y 0051 están repetidas; la tabla no sabe qué migración la creó | `scripts/lib/migraciones.mjs` ya lee los `create table`: derivarla, no guardarla |
| `norm enforced_by mechanism` | `EJECUTORES` y los ids de `ops/mecanismos.json` se escriben distinto (`github_regla` frente a `regla_github`) | unificar vocabulario (ya apuntado en la nota de `norm`) |
| `root-problem uses mechanism` | `ficha.mecanismo` es texto libre | campo con un id de `ops/mecanismos.json` |
| `event produces learning` y `event triggers skill` | propuestos en #568, sin campo | #568 |
| `session uses identity`, `identity belongs_to team-member`, `identity uses vault` | no hay registro de identidades ni de personas del equipo | ver entidad que falta `team-member` con registro |
| `deployment belongs_to environment`, `environment belongs_to service` | los tres «entorno» (Vercel, `VIGIA_ENTORNO`, GitHub) no comparten id | decidir qué es un entorno (sección 4) |
| `rule enforced_by hook` | las reglas sin id no se pueden enlazar | dar id a las reglas, o dejar de decir que son entidad |
| `judge judges eval` | ninguno de los 5 jueces declara qué evals lee | campo `juez` en cada eval |
| `team-member coincides_with person` | dos personas distintas con el mismo nombre en el glosario | renombrar el término «persona» (ya pendiente) |

**Que faltan** (la relación no existe en el registro y el repo la usa):

| Relación | Evidencia |
|---|---|
| `pull-request comes_from branch` | cada PR sale de una rama; el registro solo lo dice de `deployment` |
| `migration judged_by judge` / `migration made_by agent` | la cabecera de una migración exige el OK de `auditor-datos` y la hace `datos` |
| `module belongs_to agent` (dueño) | `role_in_axis` de `module` dice «tiene dueño», pero un módulo de `ops/MODULOS.json` no tiene ese campo (sus claves: id, nombre, ambito, hace, grado, motivo_grado, ficheros, tests, metricas, submodulos). La nota del registro afirma algo que el dato no guarda |
| `learning recorded_in` → test, guard, rule, skill | el campo está declarado y no se escribe en ningún sitio; es la entidad sin lector (principio «ningún campo sin lector») |
| `secret belongs_to environment` | una clave de GitHub vive en un environment; ahora solo se ata al servicio |
| `hook implements mechanism` | un hook es un mecanismo del escalón «bloqueo»; sin enlace |
| `metric reads` a `objective` | `ops/metricas.json` tiene 7 objetivos con id; no son entidad |
| `table belongs_to household` (todas) y `data-source has table` (36 de 40 sin él) | la RLS y PRINCIPIOS §1 lo exigen; no consta en el registro |
| vertical, 10 `unaudited` | 55 tablas de 23 módulos y solo 9 entidades verticales; ninguna relación vertical está auditada |

**Registros que dicen una cosa y hay otra** (comprobado): `secret` y `vault` figuran `without_registry` con fuente `ops/INVENTARIO.md`, pero `ops/recursos.json` (#581) ya tiene **23 recursos** con id, tipo (clave 7, cuenta 4, bóveda 3, app 2, proyecto 2, service-account 2, token 1, deploy-key 1, servidor 1), dueño y caducidad. Ese fichero es el registro de `secret`, `vault` y parte de `service` e `identity`; el registro de entidades no lo conoce.

## 3. Entidades que faltan

Criterio: se usa dos veces o más, no repite otra y tiene dueño (regla de «Añadir una entidad» de N0) y **tiene lector**.

### 3.1 Las necesita ya la factoría

| Entidad propuesta | Por qué | Qué la usaría (lector) | Nivel / ámbito |
|---|---|---|---|
| `project` (Proyecto) | HoMenu y el panel (`homenu-panel`, repo privado) ya son dos; el ámbito horizontal/vertical no tiene a qué colgar. Hoy «vertical» = HoMenu sin nombre | el campo `project` de toda pieza vertical; `ops/MODULOS.json`, `docs/diseno` | piece, horizontal |
| `plane` (Plano) | `ops/planos.json` tiene 13 planos con escala 0 a 4, criterios y test; el glosario no lo tiene como entidad. Es la 4.ª acepción de «nivel» | `npm run planos`, `ops/PLANOS.md`, mi propia ficha (planos 4, 5 y 8) | piece, horizontal |
| `resource` (Recurso) | `ops/recursos.json`: 23 entradas con dueño y caducidad que `secret`, `vault`, `service` e `identity` no referencian | `cumplimiento.mjs --informe` (caducidades) | piece, horizontal; **sustituye** el registro de `secret` y `vault` |
| `template` (Plantilla por tipo) | La N1 de cada familia existe como vocabulario: 7 tipos de skill (`ops/forja/tipos_skill`), 5 tipos de encargo (`ops/tipos-de-encargo.json`), 6 perfiles de diseño (META-DISENO). Hoy no son entidad ni tienen id común | forja de skills, `/orquestar`, el panel | **template**, horizontal |
| `forge` (Forja / pieza meta) | exactamente una por familia (FORJA: «nivel 0»): `ops/forja/`, `docs/entidades/N0-principios.md`, `ops/principios`, `docs/diseno/META-DISENO.md`. No se puede preguntar «¿qué familias tienen forja?» | test de cobertura de forjas por familia | **meta**, horizontal |
| `standard` y `agent-task` (Estándar, Tarea de agente) | `ops/estandares-agentes.json` (el estándar de cada tarea de cada agente) y el término `tarea de agente`; sus sujetos están en `ops/entidades-sujetos.json` pero ellos no | `npm run estandar`, brief de `/orquestar`, `revisor` | piece, horizontal |
| `zone` (Zona) y `workspace` (Carpeta de trabajo) | términos de glosario sin entidad; `npm run tarea -- … --zona`, `issues --zonas` | guardia, arranque | piece, horizontal |
| `objective` (Objetivo de medida) | los 7 objetivos GQM de `ops/metricas.json` | `metricas.test.js` | piece, horizontal |
| `entity` y `level` (la entidad como entidad) | el glosario ya traduce «entidad» a `entity` y no está en el registro | este test | meta, horizontal |

### 3.2 Solo hacen falta con un segundo proyecto de verdad

Lo que Pablo nombró y no hace falta antes (**creo**: no hay segundo proyecto con datos propios; el panel solo tiene 5 líneas de CSS):

| Entidad | Qué sería | Por qué esperar |
|---|---|---|
| `campaign` (Campaña) | un empuje con fecha de inicio y fin que agrupa encargos | hoy un fondo y sus encargos cubren la agrupación; abrirlo sin lector es un campo sin lector |
| `sprint` | ventana de tiempo | idem; el repo no planifica por ventanas |
| `design-system` / `design-instance` (Instancia de diseño), `token`, `component`, `pattern` | META-DISENO ya las propone («cuatro entidades nuevas») | el panel será la primera instancia; con HoMenu solo es una (`DESIGN_SYSTEM.md` + 77 tokens), y una sola instancia no se puede contrastar |
| `style` o `profile` (Estilo/perfil) | un N1 por tipo de proyecto (6 perfiles P1 a P6 de META-DISENO, hoy solo P2 se usará) | misma razón: `template` ya cubre esto como nivel; cada perfil es una pieza de `template` |
| `app` / `brand-identity` (App o identidad de marca) | qué app es (HoMenu, panel) y su voz | es un atributo del `project`, no una entidad aparte, mientras haya un proyecto con marca |
| `tenant` | familia de otro cliente | solo con otro producto vertical |

Verticales con tablas y sin entidad (**comprobado** contra `ops/MODULOS.json`): de 55 tablas en 23 módulos, el producto tiene entidad para 9. Faltan las que tienen datos propios y lector claro: `group` (grupo, grupo_persona), `allergy` (persona_alergia, persona_intolerancia, persona_perfil_salud), `favorite` y `rating`, `cooking` (cookings), `reminder` y `task` (bot_reminders, bot_tareas), `shared-menu` y `share-link`, `folder` y `collection`, `store-product`, `saved-menu`, `user-event` y `feedback`, `invite`. Es el trabajo de auditar el eje vertical (fuera de este ataque), no se cuela aquí.

## 4. Los diez puentes, uno a uno

Pregunta: ¿es `bridge` un valor legítimo del eje, o un cajón de sastre? **Honestamente, es un cajón de sastre.** Lo que reunió fue «una palabra usada en los dos lados»; los datos dicen que hay cuatro cosas distintas dentro (y dos más fuera):

| Entidad | Datos (comprobado) | Veredicto |
|---|---|---|
| `environment` | Hay **una sola base** (producción) para todos; los entornos son de Vercel, de GitHub y `VIGIA_ENTORNO` | **horizontal**. El lado producto es una relación (`table` vive en el entorno producción), no otra pieza |
| `deployment` | Un despliegue sale de una rama; las casas ven «la versión» | **horizontal**. «Lo que ven las casas» es una vista, sin dato propio |
| `event` | `eventos.jsonl` y otros logs de proceso (29 formas de línea en `ops/metricas.json`, sin datos de familias) frente a `user_events` (tabla de la app, con usuario y casa, RGPD) | **partir**: N1 horizontal (campos fijos del principio 10) + N2 de proceso + N2 vertical. Dos regímenes de privacidad distintos justifican dos registros |
| `metric` | `ops/metricas.json`: **44** métricas GQM de proceso; `MODULOS.json`: **54** métricas de módulo (producto), otra forma y otro lector | **partir**: N1 horizontal + N2 de proceso + N2 vertical. Es lo que la nota del registro llama «decisión del N1 de Métrica» |
| `eval` | `scripts/bot-evals.json` y `router-evals.json` (Lola) frente a `casos.json` de skills | **horizontal**: es un instrumento de la factoría; lo que mide (`lola-conversation`) ya es una relación (`measures`). Un campo `subject` lo reparte |
| `judge` | 5 jueces, todos en `.claude/agents` con `Tipo: juez`; ninguno es de producto | **horizontal**. Ya es `is_a agent`; «juzga lo que sale a las casas» es lo que juzga, no lo que es |
| `migration` | 101 ficheros en `supabase/migrations`, pasan por gateway y juez; la cambiada es la base | **horizontal**: la crea y la juzga la factoría. Que cambie datos de casas es la relación `creates table` |
| `table` | 55 tablas, las 55 con módulo dueño de producto | **vertical** |
| `data-source` | 40 fuentes: 17 derivado, 14 fuente_de_verdad, 6 copia_retirada, 3 ingesta; todas datos de la app | **vertical** |
| `module` | 16 módulos con `ambito` compartido 8, lola 7, app 1; son el mapa del producto | **vertical** (y `ambito` aquí es una tercera acepción de la palabra) |

Resultado: **5 horizontales, 3 verticales, 2 partidas**. Ninguno se queda como puente. Además, el criterio «misma palabra en los dos lados» deja fuera dos que sí tienen piezas en los dos ámbitos: **`vocabulary`** (CLAUDE.md: «los de proceso y los del producto», `ops/vocabularios-vida.json`) y **`principle`** (los de la casa y los 40 de producto delegados, `ops/principios/_catalogo.json`). Si `bridge` vale algo, es esto, y se detecta por datos (hay piezas de los dos ámbitos), no a mano.

**Propuesta:** `bridge` no es un valor de eje, es una propiedad **calculada**: «esta familia tiene piezas en los dos ámbitos» (`both`) o «esta relación cruza de ámbito». Entonces cada pieza declara `scope: horizontal | vertical`, y las 4 familias `both` (event, metric, vocabulary, principle) tienen un N1 horizontal y N2 de cada ámbito. Contradice la propuesta de dos ejes solo en un punto: el ámbito es de la **pieza** y no de la entidad.

## 5. Cómo meter `level` en `ops/entidades.json` (propuesta, sin aplicar)

1. **Vocabulario cerrado** `LEVELS` en `scripts/lib/entidades.mjs` (`meta`, `template`, `piece`) y `SCOPES` (`horizontal`, `vertical`, `both`), anclados en `ops/vocabularios-vida.json` (`entidades.level`, `entidades.scope`), como los otros vocabularios del registro (principio 12 de N0).
2. **Campos** `level` en `REQUERIDOS` de `ops/entidades.test.js` (nivel de sus piezas) y `scope` en lugar de `axis`. Mientras `bridge` exista, `scope` y `axis` conviven; tras la decisión, `axis` se retira (status retired, con su sustituto) y `role_in_axis` desaparece.
3. **Tests.** Ya escritos, sobre la propuesta (`ops/super-tabla.test.js`): las 41 entidades tienen familia, nivel y ámbito de vocabulario; ningún `meta` o `template` es `vertical`; el bloque de esta tabla es el generado. **Por escribir** con la decisión: una relación nueva `extends` para que cada `meta` o `template` cite el meta del que cuelga, que toda familia `both` tenga dos registros, y «ninguna entidad sin lector» con una lista de excepciones que solo puede bajar (hoy `team-member` y `learning`).
4. **MAPA.md** pierde el apartado «Los puentes» y gana una columna de nivel. Cuesta tocar `MAPA.md`, el glosario (término «eje») y `PUENTES` del test: es un encargo propio, no se hace aquí.
5. **Orden:** primero la decisión de la sección 6; después `level` y `scope` (un PR); después `project` y `template` (otro).

## 6. Decisiones pendientes

Están en el informe del agente: (A) qué hacer con `bridge`; (B) qué escala de «nivel» queda; (C) si `project` se crea ya.
