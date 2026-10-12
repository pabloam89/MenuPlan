# Familia AGENTES Y EJECUCIÓN — análisis por entidad

Datos leídos el 12 oct 2026 sobre `C:\dev\MenuPlan` (staging 3164ba0b). Marcas: **Comprobado** (lo he leído o contado ahora) y **Creo** (inferencia).

## Tabla resumen

| Entidad | Registro hoy | Veredicto | Dato que lo decide |
|---|---|---|---|
| agent | `.claude/agents/*.md` (9), `Tipo:` constructor/juez | Se queda, es el perfil | 9 agentes; 4 llevan Edit/Write, 5 no |
| skill | `.claude/skills/` (15), metadata con `tipo` y `dueno` | Se queda, pero NO es solo conocimiento | 7 de 15 son de servicio y la guardia las exige |
| judge | `Tipo: juez` en 5 de los 9 agentes | Pasa a ser **rol/valor** del agente, no entidad aparte | `agentes.mjs` ya lo trata como valor de `TIPOS_AGENTE` |
| eval | `scripts/bot-evals.json` + `casos.json` por skill | Se parte en dos tipos (Lola, skill) | Dos familias sin id común |
| session | sin registro, 4 huellas | Se queda, hay que darle id y resultado | 543 de 814 eventos sin sesión |
| event | 6 formatos, 29 firmas de línea | Se queda; unificar formato y añadir actor | 729 de 814 eventos sin `id` ni `actor` |
| metric | `ops/metricas.json` (44) + metricas[] de módulos | Se queda; se resuelve la duplicidad | 0 de 29 firmas de línea llevan actor o sesión |
| agent-task | `estandares-agentes.json`, 66 con id único | Se queda como entidad (hijo del agente) | 66 ids únicos, 156 reglas |
| tool (herramienta) | lista `tools:` en cada agente + permisos | Todavía NO: es un vocabulario | Sin atributos propios ni lector que las cuente |
| workflow | `.github/workflows` (11) | Se queda como pieza de `service`/automatismo, con id = nombre del fichero | Lo vigila `workflows.test.js` solo como YAML |
| intervención humana | no existe | Tipo de evento con motivo, NO entidad | 0 líneas hoy; solo `permiso_pedido` (8) se parece |
| agent hands_to agent | prosa en §9 Escalado | Relación con campo, a registrar | 16 aristas en prosa, 0 en dato |

**Sobre el punto de partida de Pablo.** Acierta en tres cosas y se matiza en otra:
- Agente = perfil con to-dos (tareas) bajo estándares: confirmado, 66 tareas y 156 reglas.
- Evento sin actor = problema de cableado: confirmado, 0 de 729 eventos antiguos lo llevan, y los 85 nuevos lo llevan a medias (83 con `actor: null`).
- La skill NO es solo conocimiento: matiz abajo.

---

## 1. agent

1. **Qué es.** Un perfil de subagente con `Tipo: constructor|juez`, `Planos`, herramientas y secciones numeradas (plantilla en `.claude/PLANTILLA-AGENTE.md`). Fuente: `.claude/agents/*.md`; el tipo lo lee `scripts/lib/agentes.mjs:17-30`. Comprobado: 9 agentes (5 jueces, 4 constructores). Dos repos de definición: `ops/entidades.json` (`source_of_truth: .claude/agents`, `registry: with_registry`) y el estándar por tarea.
2. **Quién la lee.** `agentes.mjs` (JUECES, CONSTRUCTORES), `ops/tipos-de-encargo.json` (qué agente entra en cada paso), `estandares-agentes.json`, `/orquestar`, `agentes.test.js`. Comprobado.
3. **Nivel.** Plantilla (`PLANTILLA-AGENTE.md`) → pieza (cada agente). La plantilla tiene 10 secciones.
4. **Relaciones.**
   - agent → agent-task: padre-hijo 1:N, enlace en `estandares-agentes.json` (`agentes.<id>.tareas[]`). Comprobado.
   - agent → skill: referencia N:M. Dos enlaces distintos: `skills:` en la cabecera del agente (precarga) y `dueno` en la skill (propiedad). Comprobado: gobierno precarga 13, datos 2, lola 2.
   - agent → tool: referencia N:M, campo `tools:` de la cabecera. Comprobado.
   - agent → agent (hands_to): ver entidad aparte.
   - judge es-un agent (subtipo): `ops/entidades.json` ya lo declara (`judge is_a agent`).
5. **Ciclo de vida.** Se crea con un PR; sin estado. Los dos aparcados viven en `.claude/agentes-aparcados/` (rendimiento, arquitecto), o sea hay un estado `aparcado` solo por carpeta. Lo cambia el humano o la sesión con su juez.
6. **Fuente y copias.** Una fuente (la cabecera). Copias: la lista de jueces se repetía en cinco sitios (nota de `entidades.json` sobre judge); `agentes.mjs` ya es la fuente única para el código, el glosario y CLAUDE.md siguen copiándola.
7. **Quién crea/mantiene.** Human (con sesión). Intervención humana: evitable en el mantenimiento, no en la decisión de crear uno.
8. **Veredicto.** Se queda. Falta un campo `tipo` fuera de prosa (hoy es una línea `Tipo:` leída por regex).
9. **No sé.** Cuántas veces se lanza cada agente de verdad: `agente_lanzado` tiene 0 eventos (el hook no recibe «Agent», `settings.json:102-108` solo tiene `Skill|Read`). Se averigua añadiendo `Agent` al matcher de `skill-abierta.mjs`.

## 2. skill

1. **Qué es.** Un runbook cargable por nombre en `.claude/skills/<nombre>/` con `SKILL.md`, `casos.json`, dueño y fecha de comprobación (`CLAUDE.md`, sección Skills; `PLANTILLA-SKILL.md`). Comprobado: 15 skills.
2. **Quién la lee.** Las sesiones, los agentes (por `skills:`), la guardia (`dominios-skills.json` mapea comandos y rutas a skills), `runbook-pr.mjs` en el CI, `skills.test.js`. Comprobado.
3. **Nivel.** Meta (`forja-de-skills`) → plantilla por tipo (siete en `ops/forja/`) → pieza. Comprobado: la nota de CLAUDE.md dice que `forja-de-skills` es la meta de nivel 0 sin tipo.
4. **Relaciones.**
   - skill → agent (`dueno`): referencia N:1, campo `metadata.dueno`. Comprobado: 13 de gobierno, 2 de lola, 0 del resto.
   - agent → skill (precarga): N:M, campo `skills:`. No coincide con `dueno` (datos precarga `supabase` y la dueña es gobierno). Creo que son dos relaciones distintas y deben llamarse distinto.
   - skill → norm: referencia N:M (`metadata.normas`).
   - skill → eval: 1:1 (`casos.json` junto a cada skill). Comprobado.
5. **Ciclo de vida.** Fecha `comprobado` que caduca a 90 días; poda por uso (`poda skills_sin_uso_semana`). Lo cambia un humano o una sesión.
6. **Fuente y copias.** `SKILL.md` es la fuente. Copia generada: moldes en `.claude/plantillas-skill/`.
7. **Quién la crea.** Agent bajo PR; revisión humana no obligada desde #608.
8. **Veredicto.** Se queda, **pero «skill = conocimiento» no es exacto**. Dato: de 15, tipo servicio = 7 (`1password, github, hetzner, supabase, tailscale, telegram, vercel`), más `issues` (flujo); la guardia **bloquea** un comando de riesgo hasta que la sesión abre la skill (`dominios-skills.json`). Es conocimiento con puerta de acceso. Propuesta: conservar el tipo, y separar `conocimiento` (2: `estilo-de-respuesta`, `principios-de-producto`) de las demás con campo, que ya existe (`metadata.tipo`).
9. **No sé.** Si las skills sirven: 52 eventos `skill_cargada` en 2 días, pero no hay denominador (cuántas veces hacía falta). Se averigua con la métrica `skills_utiles` que ya existe.

## 3. judge

1. **Qué es.** Un agente con `Tipo: juez`: sin Edit ni Write, que dice pasa/no pasa sobre el trabajo de un constructor (CLAUDE.md, tabla Agentes). Fuente: `agentes.mjs:29`.
2. **Quién la lee.** `presupuestos.mjs`, `flujo.mjs`, `tipos-de-encargo.json` (cada flag lleva su `judge`), `vocabularios-vida.json`. Comprobado.
3. **Nivel.** Pieza de `agent`.
4. **Relaciones.** judge es-un agent. judge juzga encargo (`juez` en el bloque del encargo, N:M). judge juzga eval: sin guardar (`stored_as: none`). Comprobado en `entidades.json`.
5. **Ciclo de vida.** El del agente.
6. **Fuente y copias.** Una (la cabecera). La nota de `entidades.json` dice que la lista está copiada en 5 sitios; creo que parte ya se corrigió con `agentes.mjs` (#640), no lo he contado de nuevo.
7. **Quién crea.** Igual que agent.
8. **Veredicto.** **Se fusiona con agent como valor del campo `tipo`**, no es entidad. Dato: `TIPOS_AGENTE = ["constructor","juez"]` ya es un vocabulario cerrado y no hay un solo atributo de juez que no tenga un constructor. Lo que sí es entidad es el *juicio* (veredicto de un juez sobre un encargo, con pasa/no pasa y motivo): hoy vive en el comentario del PR, sin campo.
9. **No sé.** Cuántos juicios dan «no pasa»: no hay registro. Se averigua leyendo informes de agente, o añadiendo un evento `juicio`.

## 4. eval

1. **Qué es.** Una medida del antes y el después. Dos familias: evals de Lola (`scripts/bot-evals.json`) y evals de skills (`casos.json`, `ops/skills-prueba`). Fuente: `ops/entidades.json` (note de eval). Comprobado: «caso» significa cinco cosas entre las dos.
2. **Quién la lee.** `evaluador`, `npm run skills-prueba`, `bot-evals`. 
3. **Nivel.** Pieza.
4. **Relaciones.** eval mide lola-conversation (N:M, fichero). eval de skill → skill 1:1 (fichero junto a la skill). Juez juzga eval: sin guardar.
5. **Ciclo de vida.** Sin estados. Se corre antes y después; resultado en logs.
6. **Fuente y copias.** Dos fuentes distintas con el mismo nombre.
7. **Quién la crea.** Agent (evaluador) con revisión humana de los casos marcados por Pablo (#482).
8. **Veredicto.** **Se parte en `bot-eval` y `skill-eval`**: no comparten formato, lector ni id (`id_format: unchecked`). Dato: dos ficheros de fuente, dos lectores.
9. **No sé.** Si el resultado de un eval se guarda con id: no vi dónde. Se averigua leyendo `scripts/bot-evals.mjs`.

## 5. session

1. **Qué es.** Una conversación de un agente o de una persona con el repo, que ocupa una carpeta y una rama. Fuente: `entidades.json` (`source_of_truth: none`).
2. **Quién la lee.** Los hooks (ficha local en `~/.claude/menuplan-fabrica/marcas/*.estado`, 6 ficheros hoy), la fábrica (`sesiones medidas`), la guardia. Comprobado.
3. **Nivel.** Pieza.
4. **Relaciones.** session works_in branch (1:1, ficha local). session uses identity (sin guardar). event happens_in session (1:N, campo `sesion`, **solo 271 de 814 eventos lo traen**). Comprobado.
5. **Ciclo de vida.** Abierta, cerrada (hook `SessionEnd`). No guarda resultado.
6. **Fuente y copias.** Cuatro huellas sin id común (la nota dice lo mismo). Comprobado.
7. **Quién la crea.** Automatic (el arranque). Mantenimiento: ninguno.
8. **Veredicto.** Se queda. Hace falta un id estable y escribir el resultado (PR, rama, issue cerrado) en la ficha. Sin eso no se puede contar «cuántas sesiones cerraron sin intervención».
9. **No sé.** Cuántas sesiones hubo: la ficha se borra al retirar la carpeta. Se averigua con `eventos.jsonl` (sesiones distintas).

## 6. event

1. **Qué es.** Una línea que deja un hook o script para poder contarla. Fuente: `.claude/hooks/eventos.mjs:1-30`. Vocabulario cerrado `EVENTOS` de 6 valores. Comprobado.
2. **Quién la lee.** `ops/metricas.json` (44 métricas, 29 firmas de línea), `fabrica.mjs`, el informe semanal.
3. **Nivel.** Plantilla (la línea) con un registro por fuente.
4. **Relaciones.** Todas por campo: sesion, rama, issue, norma. `nombre` es **polimórfico**: es la skill en `skill_cargada` y el agente en `agente_lanzado`, y un motivo en los demás. Esa es una referencia disfrazada de texto (principio «relaciones por id», no cumplido). Comprobado en `entidades.json` y `eventos.mjs:11`.
5. **Ciclo de vida.** Sin estados. Rotación a 5 MB.
6. **Fuente y copias.** `eventos.jsonl` es una de 6 fuentes (+`zonas.log`, `ensayos.log`, `gasto.jsonl`…). Comprobado en la carpeta: `enviar.log`, `eventos.jsonl`, `zonas.log`.
7. **Quién la crea.** Automatic. Sin intervención.
8. **Veredicto.** Se queda. **Dato sobre el actor**: de 814 líneas, 729 no tienen ni el campo `actor` (son anteriores a #568), 83 lo tienen en `null` y solo 2 llevan `homenu-sesiones[bot]`. De los 85 con id: 69 `guardia`, 9 `skill-abierta`, 7 `pendientes`. El actor sale del autor de git (`actorDe`, `eventos.mjs:49`): solo reconoce a la App y deja `null` a Pablo, así que «sin actor» es **diseño** (no se nombra a Pablo por privacidad) y no un olvido. Pablo tiene razón en que es cableado, pero lo que falta es un valor `person` y un `agent` (qué agente lanzó la sesión), no solo el actor de GitHub.
9. **No sé.** Cuántos eventos se pierden por el fallo silencioso: nada lo cuenta. Se averigua con un contador de `false` de `registrarEvento`.

## 7. metric

1. **Qué es.** Una cifra con pregunta, emisor y lector (GQM de Basili). Fuente: `ops/metricas.json` (`metricas` 44, `objetivos` 7, `lineas` 29). Comprobado.
2. **Quién la lee.** `scripts/lib/cumplimiento.mjs`, `flujo-semanal.yml`, `metricas.test.js`.
3. **Nivel.** Pieza de un objetivo.
4. **Relaciones.** metric reads event (N:M, por `lineas`); module has metric (1:N, `MODULOS.json`). Comprobado.
5. **Ciclo de vida.** Con `excepciones` (64) que solo pueden bajar.
6. **Fuente y copias.** Dos registros con el mismo nombre (`metricas.json` y `metricas[]` de módulos). Ya apuntado en `entidades.json`.
7. **Quién la crea.** Agent con PR; evitable.
8. **Veredicto.** Se queda. Dato clave para el 0 %: **ninguna de las 29 firmas de línea lleva campo `actor`, `agente` ni `sesion`** (comprobado contando claves). Por eso hoy no se puede calcular «por agente» ni «por sesión» ninguna cifra salvo las de la guardia.
9. **No sé.** Cuántas de las 44 las lee alguien además del test. Se averigua con el campo `lectores` por tipo.

## 8. agent-task (candidato)

1. **Qué es.** Una tarea de un agente con acción, reglas y `no_hace`. Fuente: `ops/estandares-agentes.json` (`agentes.<id>.tareas[]`). Comprobado: 66 tareas, **66 ids únicos**, sin repetidos entre agentes; 156 reglas.
2. **Quién la lee.** `npm run estandar -- <agente> <tarea>`, el brief de `/orquestar`, el `revisor`, y la lista «Tareas y su estándar» dentro de cada `.md` de agente (generada).
3. **Nivel.** Pieza del agente.
4. **Relaciones.** agent → agent-task: padre-hijo 1:N, campo. Tarea → regla: padre-hijo 1:N. Tarea → acción (vocabulario de 7: `juzgar` 22, `construir` 20, `operar`/`documentar`/`medir` 6, `diagnosticar` 4, `decidir` 2). Tarea → comunes (11, N:M).
5. **Ciclo de vida.** Sin estado. Lo cambia un PR.
6. **Fuente y copias.** JSON es la fuente; el `.md` del agente la copia, generada y vigilada (`estandares-agentes.test.js`).
7. **Quién la crea.** Agent bajo PR.
8. **Veredicto.** **Se queda como entidad**. Hoy es el eslabón que falta: el encargo dice «agente», pero no «tarea». Si el encargo llevara `task_id`, se podría medir qué tarea falla. Dato contra el reto: 128 de 156 reglas tienen `control: juicio` (82 %); solo 28 tienen un test o script. Es decir, la tarea existe, pero su estándar casi no se comprueba con máquina.
9. **No sé.** Cuántas de las 66 tareas se han ejecutado de verdad: no hay evento. Se averigua añadiendo `tarea` al informe común.

## 9. tool (herramienta, candidato)

1. **Qué es.** Una capacidad que un agente puede invocar (Read, Grep, Glob, Bash, Edit, Write, y las MCP de Chrome). Fuente: `tools:` en cada cabecera de `.claude/agents/`; permisos en `.claude/settings.json` (41 allow, 5 deny). Comprobado.
2. **Quién la lee.** Claude Code; `agentes.test.js` comprueba que un juez no lleva Edit ni Write (convención que vigila `revisor`).
3. **Nivel.** Pieza; sin plantilla.
4. **Relaciones.** agent → tool N:M por campo. En dato: los 5 jueces tienen 4 (R/G/G/Bash) menos `qa` con 11 (4 + 7 MCP de Chrome); los 4 constructores tienen 6.
5. **Ciclo de vida.** Ninguno.
6. **Fuente y copias.** Cabecera + `settings.json` (permiso). Dos sitios: lo que puede (cabecera) y lo que se le deja (permisos).
7. **Quién la crea.** Las pone la plataforma, no nosotros.
8. **Veredicto.** **No es entidad todavía: es un vocabulario cerrado** (9 valores base + MCP). Pasa a entidad si se le añade un atributo propio con lector, p. ej. `riesgo` (lee/escribe/ejecuta) que usaría la guardia. Hoy no lo hay.
9. **No sé.** Si `Bash` de un juez puede escribir (puede, vía redirección): lo dice la nota «no escribir por Bash es convención». Se averigua con un test sobre la guardia.

## 10. workflow (candidato)

1. **Qué es.** Un fichero de GitHub Actions. Fuente: `.github/workflows/`. Comprobado: 11.
2. **Quién la lee.** GitHub; `workflows.test.js` (sólo que sea YAML válido); `salud-despliegue.test.js`; la guardia y el skill `github`.
3. **Nivel.** Pieza.
4. **Relaciones.** workflow → script (`node scripts/…`, referencia, hoy sólo en el texto); workflow → environment (referencia; 5 de 11 declaran `environment:`); workflow → issue (escribe comentarios o abre issues: 6 con `issues:write`).
   Disparador: `schedule` en 7, `workflow_dispatch` en 11 (casi todos), `pull_request`/`push` en 2 (`tests`, `ios-testflight`), `workflow_run` en 1.
5. **Ciclo de vida.** Activo/inactivo; lo cambia un PR (con juez `gobierno`).
6. **Fuente y copias.** Una. Su lista de secretos se repite en `ops/INVENTARIO.md`.
7. **Quién la crea.** Agent (gobierno).
8. **Veredicto.** **Se queda como pieza de «automatismo»** junto a hook y cron de `pg_cron`; no como entidad aparte, porque `hook` ya está en `entidades.json` y los dos hacen lo mismo (reaccionan a algo sin humano). Dato: dos de los 11 (`agente-fallos.yml`, `mercadona-sync.yml`) ejecutan un agente o un script que escribe datos. Candidato: `automation` con tipos `hook`, `workflow`, `cron`.
9. **No sé.** Cuántos runs fallan por semana: se ve con `gh run list`, que aquí no pude usar.

## 11. Intervención humana (candidato)

1. **Qué es.** Hoy no es nada: no existe como concepto registrado. Búsqueda en `ops/`, `docs/`, `.claude/`: 0 ocurrencias de «intervención» en JSON o Markdown del repo (las 4 coincidencias son un README de `dotenv`). Comprobado.
2. **Quién la lee.** Nadie.
3. **Nivel.** Sería un tipo de evento.
4. **Relaciones.** event de intervención → session (N:1), → agent (quién pedía), → norm (por qué), → issue.
5. **Ciclo de vida.** Un instante: pedida, resuelta.
6. **Fuente y copias.** Se aproxima hoy con:
   - `permiso_pedido` de la guardia: **8 eventos** (el único «pide a una persona» registrado).
   - `bloqueo_guardia`: 731, pero no es intervención humana, es un freno a la máquina.
   - `estado_sin_leer` (9) y `aviso_guardia` (14): no son intervención.
   - El resto de intervenciones, que son las que importan, **no dejan rastro**: los `!` de Pablo, `--pablo`, la aprobación del permiso de Claude, el OK a una decisión en el chat, el aviso «Decisiones para Pablo» del informe, la asignación de issues a Pablo, el login por Google.
7. **Quién la crea.** Automatic en el hook, human en el hecho.
8. **Veredicto.** **Es un tipo de evento con motivo, no entidad.** Un 0 % solo se puede afirmar si se registra cada vez que una persona tuvo que actuar y si se sabe cuántas veces se pudo evitar.
   - Lo evitable y lo irreducible no pueden decidirse por la persona que interviene; lo decide la regla: `CLAUDE.md` declara 8 cosas que siempre se preguntan (main, datos de familias, borrar recursos, secretos, dinero, escribir a personas, permisos de Claude, historia ajena). Esas son **irreducibles por diseño**. El resto es evitable por definición.
   - Esto contradice un 0 % literal: hay un suelo declarado en el propio CLAUDE.md. La cifra útil es **intervenciones evitables por encargo**, no «todas».

   **Campos mínimos de un evento `intervencion_humana`** (todos de vocabulario cerrado o número, salvo el id de referencia):
   | Campo | Valores | Para qué |
   |---|---|---|
   | `id`, `ts`, `sesion`, `fuente` | los de hoy | ya están en la línea común |
   | `actor_pedido` | `agent` (id) o `session` | quién necesitaba a la persona |
   | `quien` | `pablo`, `alvaro` | quién intervino (no «null»: aquí sí se nombra; es el repo del equipo, no datos de familias) |
   | `motivo` | vocabulario: `gateway`, `permiso`, `decision`, `fallo-herramienta`, `aclaracion`, `arreglo-manual` | por qué hizo falta |
   | `gateway` | id de la lista de gateways del agente (de las 8 irreducibles de CLAUDE.md) o vacío | si es irreducible |
   | `evitable` | `si` / `no` | derivado de `gateway`: `no` si el gateway existe, `si` si no |
   | `norma` | id de `ops/normas.json` | qué norma lo exigió, si hay |
   | `issue` | número | a qué encargo |
   | `espera_s` | entero | tiempo parado, para pesar la cifra |
   | `resultado` | `aprobado`, `rechazado`, `cambiado` | para saber si la pregunta era de más |
   Sin un campo libre; no se guarda texto del chat.

   **Dónde se registra hoy**, de mayor a menor:
   - `permiso_pedido`, `eventos.jsonl` (guardia): cubre sólo lo que la guardia ya convierte en pregunta. Se puede ampliar con el campo `motivo` en el mismo hook.
   - `pendientes.mjs` al terminar de responder: ya detecta «decisiones sin issue», pero no emite evento. Es el sitio natural para `motivo: decision`.
   - `fin.mjs` (SessionEnd): el sitio para cerrar el recuento por sesión.
   - Las líneas `--pablo` y `ensayos.log` de `apply-migration`: ya existen, pero no llevan sesión.
   - Los `!` del chat y la aprobación de permisos de Claude **no pasan por ningún hook**; no se pueden cablear con los hooks actuales. Creo que hace falta el hook `Notification` o `UserPromptSubmit` de Claude Code; no lo he comprobado.
9. **No sé.** Cuántas intervenciones hay hoy: la base es 8 `permiso_pedido` y el resto sin medir. Se averigua con una semana de piloto del evento nuevo.

## 12. Relación agent hands_to agent (gateways entre agentes)

1. **Qué es.** El paso de un resultado de un agente a otro. Fuente: sección «9. Escalado» de cada `.claude/agents/*.md`, **en prosa**. Comprobado.
2. **Distinción importante.** Lo que la plantilla llama **Gateway** (§7) **no es agente→agente**: son las 31 cosas (3+4+5+2+7+4+2+1+3, comprobado) que el agente nunca ejecuta y devuelve a **una persona** («Decisiones pendientes»). La relación agente→agente está en el Escalado.
3. **Aristas contadas** (§9 de los 9 agentes): 16.
   - auditor-datos → datos, seguridad, constructor del dominio
   - datos → gobierno, sesión (→ auditor-datos)
   - diseno → sesión (→ qa)
   - evaluador → lola
   - gobierno → datos, sesión
   - lola → datos, sesión (→ seguridad), evaluador
   - qa → diseno, lola, sesión
   - revisor → sesión (→ seguridad), sesión
   - seguridad → datos, gobierno
   Seis de las 16 pasan por la sesión principal («la sesión principal lo pasa a…»): la sesión es un nodo intermedio, no un agente.
4. **Clase.** Referencia N:M con tipo de relación: `hands_to` con motivo (`fix`, `review`, `security`, `schema`, `ops`). No es parte-de ni padre-hijo.
5. **Ciclo de vida.** Cada traspaso es un evento (hoy no se registra; `agente_lanzado` tiene 0).
6. **Fuente y copias.** Prosa en 9 ficheros; la secuencia estándar está también en `tipos-de-encargo.json` (pasos con roles builder/judge). **Dos fuentes que pueden contradecirse**: p. ej. `lola` dice «al terminar: a evaluador» y el esqueleto de `improve` puede decir otra cosa. No lo he cruzado.
7. **Quién la crea.** Agent (en el PR del agente).
8. **Veredicto.** **Se queda como relación con campo**, hoy `stored_as: none`. Propuesta: un campo `hands_to: [{agent, reason}]` en la cabecera, con test que compruebe que el destino existe y que cada juez de un flag figura como destino de algún constructor. Dato: 5 de 5 jueces tienen al menos una arista de entrada.
9. **No sé.** Si las aristas en prosa coinciden con los pasos de `tipos-de-encargo.json`. Se averigua con un script que las cruce.

---

## Respuesta al reto de Pablo, con el dato

| Frase de Pablo | Veredicto | Dato |
|---|---|---|
| El agente es el perfil que ejecuta to-dos bajo estándares | **Cierto** | 66 tareas, 156 reglas, todas colgadas de 9 agentes |
| ...con herramientas | Cierto, pero poco usado | `tools:` es un vocabulario sin atributos; no justifica entidad |
| ...y relaciones tipo gateway con otros agentes | **Parcial** | El gateway de la plantilla es agente→persona (31). Agente→agente es el Escalado (16 aristas) |
| La skill es conocimiento | **Parcial** | 7 de 15 son de servicio y la guardia las exige antes de un comando; solo 2 son puro conocimiento |
| El evento sin actor es un problema de cableado | **Cierto, con matiz** | 729 de 814 sin campo; 83 con `null` a propósito (no se nombra a Pablo) |

## DECISIONES PENDIENTES

1. **Actor del evento.** ¿Nombrar a Pablo y Álvaro en los eventos del repo (hoy `actor: null`)? Recomendado A: sí, solo con un valor de vocabulario (`pablo`, `alvaro`, `app`), porque el repo ya es del equipo y sin eso no hay 0 %. Coste: leve, reversible. B: dejarlo `null` y medir intervención por otro camino. C: nombrar solo a la App.
2. **Intervención humana.** ¿Se crea el evento `intervencion_humana` con los campos de arriba, empezando por `permiso_pedido` y `pendientes.mjs`? Recomendado A: sí, piloto de una semana. Coste: un PR pequeño. Reversible.
3. **Suelo del 0 %.** ¿Se acepta que las 8 cosas de CLAUDE.md son irreducibles y la meta es «0 % evitable»? Recomendado A. B: 0 % literal (choca con CLAUDE.md). C: sin meta hasta tener la línea base.
4. **judge se fusiona con agent y eval se parte en dos.** Recomendado A: aprobarlo al cerrar la ronda de entidades.
5. **hands_to como campo** en la cabecera del agente, con test. Recomendado A.
6. **Hook `Agent`:** añadir el matcher para que `agente_lanzado` deje de estar a 0 (una línea en `settings.json`; es cambio de permisos de `.claude/`, lo decide Pablo según CLAUDE.md).
