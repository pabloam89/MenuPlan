# Familia TRABAJO Y SEGUIMIENTO: análisis por entidad

Fecha: 2026-10-12. Sigue la FICHA de `analisis/FICHA.md`. Certeza: lo leído en el repo (issues.mjs, fondos.mjs, ENCARGO.md, FLUJO.md, entidades.json, glosario, SUPER-TABLA) está **Comprobado**. No pude contar issues vivos: `gh` devolvió «Bad credentials» en esta sesión (**No sé** cuántos fondos, casos, encargos y decisiones hay hoy).

## Tabla resumen

| Entidad | Qué es en una frase | Nivel | Relación clave | Veredicto |
|---|---|---|---|---|
| issue | Contenedor de GitHub que lleva un `tipo:` y campos comunes | pieza (supertipo) | los cuatro tipos son `es-un` Issue | Se queda, como supertipo y no como nivel |
| root-problem (fondo) | La clase de fallo; guarda su ficha, su arreglo y su ventana | pieza | padre de casos (evidencia) y de encargos (arreglo) | Se queda; los dos enlaces a sus hijos se declaran como dos clases distintas |
| case (caso) | Un fallo concreto, analizado | pieza | hijo 0..1 de un fondo | Se queda; el puntual es la excepción declarada |
| assignment (encargo) | Un trozo de trabajo con dueño, juez y PR | pieza (de la plantilla «tipo de encargo») | hijo de un fondo; depende de otros encargos | Se queda |
| decision | Una pregunta a Pablo o Álvaro, con opciones | pieza | no cuelga de nada; asignada a una persona | Se queda, pero hay que unir su issue con la fila de `DECISIONES.md` |
| pull-request | La petición que lleva una rama a staging | pieza (externa, GitHub) | cierra N issues, cita N casos, sale de 1 rama | Se queda; sin registro propio, sus campos son líneas del cuerpo |
| branch (rama) | Línea de git de una tarea | pieza (externa, git) | 0..1 issue; 1 PR | Se queda; se propone la entidad nueva `task` (tarea) |
| assignment-type (tipo y subtipo de encargo), nuevo | Catálogo de 5 tipos y 12 subtipos activos | plantilla | instancia de él: cada encargo | Registrar como plantilla (igual que `mechanism`); el subtipo es fila, no entidad |
| ficha del fondo, nuevo | Bloque `fondo` de 16 campos dentro del cuerpo del fondo | no es entidad | parte del fondo | No es entidad: son los campos propios del fondo |
| task (tarea), nuevo | Carpeta de trabajo + rama + lo que se pidió | pieza | contiene branch; 1:1 con sesión | Candidata, decisión de Pablo |

## Contraste del punto de partida de Pablo

Pablo dijo: «fondo→casos es una relación padre-hijo 1:N, no un nivel; fondo, caso, encargo y decisión son tipos de Issue».

**Acierta en lo grueso y hay dos matices.**

1. *Tipos de Issue: cierto y ya está así.* El registro ya trae cuatro filas `is_a issue` (`ops/entidades.json:700-727`), el glosario marca `amplio: issue` en los cuatro, y la etiqueta `tipo:` admite uno solo por issue (`issues.mjs:36-46,166`). Hay un dato que lo refuerza: lo propio es casi disjunto. El fondo tiene 16 campos (`fondos.mjs:108-128`), el encargo 15 (`ENCARGO.md`), el caso 2 etiquetas (`analisis`, `causa`) y la decisión 0. Solo `mecanismo` y `verificacion` se repiten entre fondo y encargo. **Matiz:** «tipo de Issue» no significa «Issue con N1 por tipo»; el Issue es un sobre (número, título, estado, etiquetas, asignado, fechas) y cada tipo es una plantilla distinta con su ciclo de vida. La SUPER-TABLA (sección 3) llega a la misma conclusión.
2. *Padre-hijo 1:N, no un nivel: cierto.* Es un enlace (sub-issue de GitHub), no un nivel de abstracción: fondo, caso y encargo son piezas del mismo nivel. **Matiz 1: no son «de la misma naturaleza».** Un fondo es una clase de fallo y un caso es una ocurrencia suya; el encargo es trabajo para arreglar la clase. El mismo mecanismo (sub-issue) lleva dos relaciones con reglas distintas: los casos son **evidencia** (crecen después de cerrar el fondo y pueden reabrirlo, `debeReabrir`, `issues.mjs:216`); los encargos son **remedio** (tope de 3 por fondo, deben cerrarse antes que el fondo, `issues.mjs:187`, `ENCARGO.md:31`). **Matiz 2: no es 1:N estricto.** Un caso puntual no cuelga de nada, y si cuelga, `faltas()` lo marca como falta (`issues.mjs:174`). Es N:1 con 0..1 padre. El encargo tampoco depende solo del fondo: tiene `depende_de` hacia otros encargos (N:M).

Lo que no cuadra en el registro, dato aparte: el enlace fondo→hijo se guarda en **tres sitios** (sub-issue de GitHub, `ficha.casos` y `ficha.encargos`, y `encargo.fondo`; `entidades.json:255`). Es una repetición, y la fuente buena es el sub-issue (GitHub lo garantiza; `faltas()` y `leerIssue` ya lo leen de ahí).

---

## issue

1. **Qué es.** «Un elemento de GitHub del repo que lleva su tipo: fondo, caso, encargo o decisión» (`ops/glosario/terminos/issue.json`). La clasificación tiene una sola fuente: `scripts/lib/issues.mjs:36-117` (`GRUPOS`: tipo, analisis, causa, area, arreglo, control). Sin discrepancia en el repo; solo que `entidades.json` pone `registry: with_registry` y la nota «la rama, el título y el área no siempre coinciden».
2. **Quién la lee.** `issues.mjs` (informe), `arranque.mjs` (qué espera), `situacion.mjs`, `fondos-evento.mjs`, `fondos-pr.mjs`, `casos-pr.mjs`, `pendientes.mjs`, `fabrica.mjs`, los workflows `fondos.yml`, y las personas por GitHub. Comprobado.
3. **Nivel.** Supertipo (sobre común). No es meta ni plantilla de la forja: es la clase base de cuatro piezas que tienen cada una su propia plantilla (`.github/ISSUE_TEMPLATE/1-caso, 2-fondo, 3-encargo, 4-decision`).
4. **Relaciones.** `es-un`: fondo, caso, encargo y decisión → issue (campo: etiqueta `tipo:`; 1:1, un issue tiene un solo tipo). `padre-hijo`: sub-issue de GitHub (el enlace es del Issue, pero solo lo usan fondo→caso y fondo→encargo). `referencia`: el PR cierra issues (`Closes #n`); la rama lleva el número.
5. **Ciclo de vida.** Abierto → cerrado (y reabierto). Lo cambian personas, sesiones y el workflow `fondos` (reabre y cierra fondos). El estado de GitHub es el único común; cada tipo añade el suyo (el fondo, 7 estados en la ficha).
6. **Fuente y copias.** Fuente: GitHub (estado, fechas, asignados, padre e hijos). Copias: ninguna en el repo salvo las listas de `ficha.casos` y `ficha.encargos`, y la fila de `DECISIONES.md` (ver decisión).
7. **Quién crea y mantiene.** Crea: agent o human, con `npm run issues -- --nuevo` (la guardia niega `gh issue create`). Mantiene: automatic para etiquetas `control:` y reapertura; human para el análisis. Intervención humana implícita: la clasificación (análisis, causa) la hace una sesión; es evitable solo en parte (el formulario deduce etiquetas, `etiquetasDeFormulario`).
8. **Veredicto.** **Se queda como supertipo.** Dato: cuatro filas `is_a` y campos disjuntos. Cambio pedido: en `entidades.json` la nota debería decir que es un sobre y no un nivel, y que los cuatro tipos no son subniveles.
9. **No sé** cuántos issues hay por tipo hoy. Se averiguaría con `npm run issues` con credenciales de GitHub válidas.

## root-problem (fondo)

1. **Qué es.** «La clase de fallo de la que cuelgan casos y encargos, con su ficha, su arreglo general y cómo se probará» (`glosario/fondo.json`; `issues.mjs:41`). La ficha vive en `fondos.mjs:108-128`. Dos nombres: «fondo» y «problema de fondo» (el glosario dice que es el mismo término).
2. **Quién lo lee.** `fondos.mjs`, el workflow `fondos.yml`, `fondos-pr.mjs` (CI de cada PR), `issues.mjs`, `fabrica.mjs`, la skill `causa-raiz` y `/revision-issues`. Comprobado.
3. **Nivel.** Pieza. Su plantilla es el formulario `2-fondo.yml` más la ficha (16 campos, vocabularios cerrados). Sus piezas: una ficha, casos y encargos.
4. **Relaciones.**
   - `es-un` Issue (etiqueta `tipo:fondo`).
   - `padre-hijo` 1:N con casos (**evidencia**), enlace: sub-issue; copia en `ficha.casos`.
   - `padre-hijo` 1:N con encargos (**remedio**, máximo 3), enlace: sub-issue; copias en `ficha.encargos` y `encargo.fondo`.
   - `referencia` N:1 a mecanismo: `barrera` guarda un escalón, no un id de `ops/mecanismos.json`; `mecanismo` es texto libre con la causa (tres cosas llamadas «mecanismo», nota en `entidades.json:106`).
   - `referencia` a agente (`capa_agente`) y a aprendizaje (texto libre, `aprendizaje`).
5. **Ciclo de vida.** Siete estados de la ficha: abierto → diagnosticado → plan → en-curso → en-observacion → cerrado-eficaz (y reabierto) (`fondos.mjs:42-50`). Cambian: la sesión edita `estado`; el workflow reabre (caso `no-aguanto-*` o sin aprendizaje) y cierra la ventana limpia. Se suma el estado de GitHub (abierto/cerrado): dos estados que deben cuadrar.
6. **Fuente y copias.** Fuente: el cuerpo del issue (bloque `fondo`). Copias: el enlace a hijos, en tres sitios (arriba); la etiqueta `causa:` y `ficha.tipo_causa` (dos sitios, el segundo «la misma que la etiqueta», `fondos.mjs:34`); `arreglo:` etiqueta frente a `ficha.barrera`.
7. **Quién crea y mantiene.** Crea: agent (quien diagnostica el caso). Mantiene: mixto. Automatic: reapertura y cierre por ventana. Human implícito: rellenar la ficha a mano y poner la ventana; evitable en parte (estado derivable de los hijos, ver veredicto).
8. **Veredicto.** **Se queda.** Dos cambios: (a) declarar sus dos enlaces a hijos como dos clases de relación (`evidence` y `remedy`) en `entidades.json`, hoy ambas son `hangs_from` sin distinguir; (b) elegir una sola fuente del enlace (el sub-issue) y marcar `ficha.casos` y `ficha.encargos` como derivables. Dato que lo decide: las tres copias del enlace.
9. **No sé** si algún test hoy comprueba que `ficha.casos` coincide con los sub-issues. Se averiguaría leyendo `fondos.test.js` y `fondos-evento.test.js`.

## case (caso)

1. **Qué es.** «Un issue tipo:caso que registra un fallo concreto, con su evidencia y su análisis; cuelga de su fondo o es puntual» (`glosario/caso.json`; `issues.mjs:42`). Discrepancia: «caso» significa cinco cosas (este issue, `casos.json` de una skill, el caso de un eval, la línea `Casos:` del PR y `CASOS:` del informe de agente; `entidades.json:266`). El glosario ya tiene `caso de prueba` como término aparte.
2. **Quién lo lee.** `casos-pr.mjs` y la guardia (línea `Casos:` del PR), `fondos.mjs` (`debeReabrir`), `issues.mjs` (análisis), `/revision-issues`, `situacion.mjs`. Comprobado.
3. **Nivel.** Pieza. Plantilla: `1-caso.yml`. Campos propios: 2 etiquetas (`analisis`, y `causa` si es puntual) más el texto del cuerpo (cuándo, qué pasó, evidencia).
4. **Relaciones.** `es-un` Issue. `hijo` N:1 con 0..1 fondo (sub-issue; copia en `ficha.casos`). `referencia` desde el PR (`Casos: #n`, N:M; un PR cita varios casos y un caso puede citarse en varios PR).
5. **Ciclo de vida.** Registrado → analizado con una de cinco respuestas (`nuevo`, `abierto`, `no-aguanto-roto`, `no-aguanto-corto`, `puntual`) → cuelga de un fondo o se cierra como puntual. Lo hace una sesión; el workflow comprueba. El caso nunca se borra (`issues-no-se-borran`).
6. **Fuente y copias.** Issue de GitHub. Copias: `ficha.casos` del fondo y, para `puntual`, el texto «Puntual porque …».
7. **Quién crea y mantiene.** Crea: agent (quien detecta) o automatic (vigía, agente de fallos). Mantiene: agent. Intervención humana: ninguna obligada.
8. **Veredicto.** **Se queda.** Pablo dijo que caso es un tipo de Issue: sí. La SUPER-TABLA duda si podría ser un valor de `kind` en vez de entidad (solo 2 campos propios); lo que decide mantenerlo: `Casos:` del PR, `analisis:` y la regla de reapertura lo leen por id, y retirarlo cuesta más que mantenerlo. Aclarar el choque de la palabra «caso» es otra tarea (el glosario ya la apunta como decisión pendiente).
9. **No sé** cuántos casos «puntuales» hay frente a los colgados. Se averiguaría con `npm run issues` (la revisión semanal ya lo cuenta).

## assignment (encargo)

1. **Qué es.** «Un issue tipo:encargo con trabajo por hacer que tiene dueño, constructor y juez; si es parte de un arreglo, cuelga de su fondo» (`glosario/encargo.json`). El formato: `docs/ops/ENCARGO.md` (generado desde `issues.mjs`), 15 claves en el bloque `encargo`. Discrepancia: el glosario dice que el encargo «puede» colgar de un fondo; el bloque obliga a `fondo: #n` (obligatoria sí). Creo que la segunda es la regla vigente para los encargos de un arreglo; un encargo suelto sin fondo no lo he visto formalizado.
2. **Quién lo lee.** `fondos.mjs` (valida el bloque), `fondos-pr.mjs` (diagnóstico del fondo de cada encargo que cierra el PR), `tiposDeEncargo.mjs`, el dimensionador (#641), `fabrica.mjs`, `/orquestar`, `plan-de-arreglo`, `tarea.mjs`/`lleva`. Comprobado.
3. **Nivel.** Pieza, con plantilla N1 propia (`docs/entidades/N1-encargo.md`) y una plantilla de contenido: el tipo y subtipo de encargo.
4. **Relaciones.** `es-un` Issue. `hijo` N:1 de un fondo (campo: sub-issue + `encargo.fondo` + `ficha.encargos`, tres sitios). `depende_de` N:M con otros encargos (campo `depende_de`). `referencia` a mecanismo (id de `ops/mecanismos.json`, esta sí por id), a agente (`constructor`, `juez`) y a un tipo/subtipo (`assignment_type`, `subtype`). `1:1` con una rama y 1:N con PR (un PR cierra encargos con `Closes`).
5. **Ciclo de vida.** Abierto → cerrado por el PR que lo cierra (el estado de GitHub; no se guarda en el bloque, `N1-encargo.md` §3). Lo cambia el PR fusionado (automatic). No se borra: se cierra «como no planificado o duplicado».
6. **Fuente y copias.** Fuente: el cuerpo del issue (bloque). Copias: el enlace al fondo (tres sitios); la lista de jueces (sale de `.claude/agents/`, no se copia); la tabla de `/orquestar` y `ENCARGO.md` son generadas.
7. **Quién crea y mantiene.** Crea: agent (`plan-de-arreglo` / `/orquestar`). Mantiene: automatic (cierre por PR). Intervención humana implícita: ninguna salvo el juez de fondo.
8. **Veredicto.** **Se queda.** Pablo acierta: tipo de Issue. Un solo cambio a registrar: `fondo` (clave del bloque) es redundante con el sub-issue; que `faltas()` pida el padre en lugar de que el bloque lo repita.
9. **No sé** si existen encargos sin fondo en uso. Se averiguaría contando issues `tipo:encargo` sin padre.

## decision (decisión)

1. **Qué es.** «Un issue tipo:decision que se asigna a Pablo: la pregunta en llano, las opciones con la recomendada primero y qué pasa si no se decide» (`glosario/decision.json`; `issues.mjs:44`). **Discrepancia en el repo:** `entidades.json:284` pone como fuente de verdad `ops/DECISIONES.md`, que es otra cosa: un registro de lo que pasó por un gateway (19 filas, «qué se decidió, por qué y quién lo aprobó»). Dos objetos con la misma palabra: la **pregunta pendiente** (issue) y la **decisión tomada** (fila).
2. **Quién la lee.** `pendientes.mjs` (que frena si quedan decisiones sin issue), `situacion.mjs` (bloque «Decisiones abiertas» del arranque), `arranque.mjs`, Pablo. `DECISIONES.md` lo lee Pablo y `gobierno`; **no vi ningún script que lo lea** (Creo: sin lector por máquina, solo `ops/planos.json` y los `ref` de normas apuntan a él).
3. **Nivel.** Pieza; plantilla `4-decision.yml`.
4. **Relaciones.** `es-un` Issue. `asignada a` una persona del equipo (campo: asignado de GitHub; N:1, siempre Pablo o Álvaro). No cuelga de ningún padre. Con el PR: ninguna relación formal.
5. **Ciclo de vida.** Abierta (pendiente) → cerrada al contestarla. Quien decide es una persona (irreducible: es la razón de ser). Hoy la fila de `DECISIONES.md` la escribe `gobierno` o cualquier sesión, aparte.
6. **Fuente y copias.** Dos fuentes sin enlace: el issue y la fila (sin campo común). Dato: la nota de `entidades.json:288` lo dice y la SUPER-TABLA (§3) lo repite.
7. **Quién crea y mantiene.** Crea: agent (cualquier sesión). Resuelve: human (irreducible). La fila: agent a mano.
8. **Veredicto.** **Se queda como un solo concepto con dos fases:** la pregunta (issue abierto) y la decisión tomada (issue cerrado + fila del registro). Cambios: añadir a `DECISIONES.md` una columna con el `#n` del issue; que `source_of_truth` diga `scripts/lib/issues.mjs` para la pregunta y que `DECISIONES.md` sea el registro de las tomadas. Alternativa: partir en `decision` (issue) y `decision-record` (fila); la descarto porque separa un ciclo de vida de una sola cosa. Pregunta para Pablo abajo.
9. **No sé** cuántas filas de `DECISIONES.md` nacieron de un issue de decisión. Se averiguaría leyendo las 19 filas contra los issues cerrados `tipo:decision`.

## pull-request (PR)

1. **Qué es.** «Una petición de GitHub que lleva una rama a staging, con el CI y sus líneas de cierre, de agente y de casos» (`glosario/pr.json`). `entidades.json:295`: fuente de verdad `none`, «GitHub; sin registro propio». Comprobado.
2. **Quién lo lee.** `fondos-pr.mjs` (Agente, Closes), `casos-pr.mjs` (Casos), `runbook-pr.mjs` (Runbook), la guardia (rama al día, Closes, Casos), `issues.mjs` (`agenteDe`, de ahí sale quién arregló), `fabrica.mjs`, workflow `tests`.
3. **Nivel.** Pieza, de una plantilla de GitHub (la de PR trae las líneas).
4. **Relaciones.** `cierra` N:M a issue (`Closes #n`; el repo lee hasta 5 PR por issue, `issues.mjs:247`). `cita` N:M a caso (`Casos:`). `hecho por` N:1 agente (`Agente:`). `usa` skill (`Runbook:`). `sale de` 1:1 rama (cabeza del PR). Cada una se guarda como línea del cuerpo, no como campo.
5. **Ciclo de vida.** Abierto → CI → (juez `revisor`) → fusionado o cerrado. Fusiona la sesión; a `main` solo Pablo. Nadie más aprueba (#608).
6. **Fuente y copias.** Fuente: GitHub. La relación PR→issue vive en el PR (`Closes`) y el issue la lee por GraphQL; sin copia. `Agente:` es un texto libre con vocabulario (los nombres de `.claude/agents/`, «sesión» o cualquiera; «mejor verlo raro que perderlo»).
7. **Quién crea y mantiene.** Crea: agent. Mantiene: automatic (CI). Humano implícito: ninguno en staging; irreducible en `main`.
8. **Veredicto.** **Se queda,** como entidad externa. Una sola mejora: `source_of_truth` de `none` a `github` (es externa, no falta). Dato: tres scripts leen sus líneas, así que las líneas son su esquema.
9. **No sé** qué porcentaje de PR lleva `Agente:` correcto. `npm run issues` cuenta los últimos 50; no lo ejecuté sin GitHub.

## branch (rama)

1. **Qué es.** «Una línea de trabajo de git que lleva una sola tarea y se llama con el formato área/nombre, con el número del issue delante del nombre si la tarea sale de uno» (`glosario/rama.json`). Fuente: git (`entidades.json:306`: `none`).
2. **Quién la lee.** `tarea.mjs` (la crea), `retirar`/`podar`, la guardia (niega push a `main`, directo a staging y trabajar en la carpeta principal), `leerIssue` (rama del PR), Vercel (despliega por rama), `lleva`/`zonas` (quién lleva qué).
3. **Nivel.** Pieza. Su plantilla es el formato `<área>/<n>-<nombre>`.
4. **Relaciones.** `pertenece a` 0..1 issue (N:1; campo: el número dentro del nombre; solo va a veces). `1:1` con PR (cabeza) y con carpeta de trabajo y sesión («una sesión = una carpeta = una rama = una tarea», CLAUDE.md). `produce` despliegue en Vercel (1:N).
5. **Ciclo de vida.** Creada por `npm run tarea` → commits → PR → fusionada → retirada por `npm run retirar` o `podar`. Automatic en gran parte.
6. **Fuente y copias.** Fuente: git. Copias: el número de issue va en el nombre y el área también: **dos vocabularios de área**. `AREAS` de `tarea.mjs:62` (9 valores: bot, datos, ux, fix, feat, ops, motor, lola, roles) frente a las 6 del `area:` de las etiquetas (datos, lola, ui, catalogo, motor, ops). Los prefijos son de tipo de trabajo (fix, feat) mezclados con zona (bot, ux), no son lo mismo.
7. **Quién crea y mantiene.** Crea: automatic (script, a petición de agent o human). Mantiene: automatic. Intervención humana: ninguna.
8. **Veredicto.** **Se queda,** pero con un reparo: el prefijo mezcla dos ideas (tipo de trabajo y zona) y no coincide con `area:`. Dato: 9 frente a 6 valores y solapes (`lola`/`bot`, `ui`/`ux`). Resolverlo es una decisión de nombres, no de modelo.
9. **No sé** cuántas ramas vivas no llevan número de issue. Se averiguaría con `git branch -r` y un recuento de las que no empiezan por `<área>/<n>-`.

## assignment-type (tipo y subtipo de encargo) — candidata nueva

1. **Qué es.** Catálogo de 5 tipos (`create, fix, improve, operate, audit`) y sus subtipos (12 activos, 21 retirados que se conservan para el panel) con esqueleto de pasos, banderas y presupuesto: `ops/tipos-de-encargo.json`, lector `scripts/lib/tiposDeEncargo.mjs`. Puerta de entrada de subtipos: #646 (registrada en `DECISIONES.md`, 2026-10-12).
2. **Quién lo lee.** `tiposDeEncargo.mjs`, `fondos.mjs` (vocabulario de `assignment_type` y `subtype`), el dimensionador (#641), `fabrica.mjs`, `/orquestar` (tabla generada), `ENCARGO.md` (generado), el panel de la factoría (repo `homenu-panel`). Comprobado.
3. **Nivel.** Plantilla: de ella sale cada encargo (pieza). Es el mismo caso que `mechanism` (`ops/mecanismos.json`), ya registrado como `template`.
4. **Relaciones.** `instancia de` N:1: cada encargo tiene un tipo y un subtipo (campos del bloque). `es-un` subtipo → tipo (el subtipo cuelga de un tipo, 1:N). `reemplazado por` alias retirado → subtipo activo (`replaced_by`). `referencia` a agentes (los pasos) y a presupuesto.
5. **Ciclo de vida.** Subtipo `active` → `retired` con `replaced_by` (nunca se borra: vocabulario de vida, `ops/vocabularios-vida.json`). Lo cambia `gobierno` por PR con la puerta de admisión (test `ops/tipos-de-encargo.test.js`).
6. **Fuente y copias.** Fuente única: el JSON. Copias generadas: la tabla de `/orquestar`, `ENCARGO.md` y `N1-encargo.md` (no se editan a mano).
7. **Quién crea y mantiene.** Crea y mantiene: agent (`gobierno`). Humano: decide que un tipo nuevo valga la pena (criterio: se repite al menos 3 veces, medido por `npm run fabrica`).
8. **Veredicto.** **Registrar `assignment-type` como plantilla,** como `mechanism`; el subtipo es una fila suya y no una entidad (el N1 y la SUPER-TABLA §3 coinciden: un N3 no añade lector). Dato: tiene registro, lector único y atributos (PRINCIPIOS §6: tabla catálogo). Hoy `entidades.json` no lo nombra: el encargo apunta a un catálogo que el registro no tiene.
9. **No sé** cuántos encargos creados desde el 13 oct usan una válvula. Se averiguaría con `npm run fabrica` cuando haya datos.

## Ficha del fondo — candidata, descartada como entidad

1. **Qué es.** El bloque de código `fondo` del cuerpo del issue, 16 claves (`fondos.mjs:108-128`).
2. **Quién la lee.** `leerFicha` (`fondos.mjs`), workflow `fondos`, `fondos-pr.mjs`, `issues.mjs`. Comprobado.
3. **Nivel.** No es pieza propia: es el conjunto de campos del fondo.
4. **Relaciones.** `parte-de` fondo, 1:1. Sin ciclo de vida propio (es el fondo).
5–7. Vive en el cuerpo del issue; la edita el agente.
8. **Veredicto: no es entidad.** Es el esquema del fondo. Dos lecciones: (a) hay campos que repiten otra fuente (`tipo_causa` = etiqueta `causa:`, `barrera` = etiqueta `arreglo:`, `casos` y `encargos` = sub-issues); (b) `estado` tiene 7 valores de los que varios se derivan (hay encargos colgados → `plan`; PR fusionado → `en-observacion`). Candidato a que parte de la ficha se calcule y no se escriba.
9. **No sé** cuántos campos de la ficha se rellenan de verdad. Se averiguaría contando fichas con `fondos.mjs` sobre los fondos abiertos.

## task (tarea) — candidata nueva, decisión de Pablo

1. **Qué es.** «La unidad de trabajo de una sesión: una carpeta de trabajo, una rama y lo que se pidió (`npm run tarea`)» (`glosario/tarea.json`). Está en el glosario y no en `entidades.json`. El glosario avisa del choque con «tarea de agente».
2. **Quién la lee.** `tarea.mjs`, `retirar`, `podar`, `limpiar-worktrees`, `arranque.mjs`, la guardia, `lleva`/`zonas`.
3. **Nivel.** Pieza compuesta: contiene una rama y una carpeta, y es 1:1 con una sesión.
4. **Relaciones.** `parte-de`: rama y carpeta. `referencia` 0..1 a issue. 1:1 con sesión.
5. **Ciclo de vida.** Abierta (`tarea`) → trabajo → PR fusionado → retirada (`retirar`).
6. **Fuente y copias.** Hoy repartida en cuatro huellas sin id común: la ficha local, la carpeta y la rama, `eventos.jsonl`, la transcripción (`entidades.json:15`).
7. **Quién crea y mantiene.** automatic (scripts) por petición de human o agent.
8. **Veredicto.** **Decisión de Pablo:** o se registra `task` como entidad que agrupa rama y carpeta, con `branch` como parte, o se deja como término del glosario. Lo que decide: las cuatro huellas sin id común hacen que no se pueda unir el trabajo de una tarea con su coste y su resultado.
9. **No sé** si la ficha local de la tarea tiene un identificador estable. Se averiguaría leyendo `scripts/tarea.mjs`.

---

## Otras observaciones de la familia

- **Dos significados de «decisión»** y **cinco de «caso»**: el segundo ya está apuntado en el glosario; el primero (pregunta frente a registro tomado) no figura como choque.
- **La relación `hangs_from`** del registro no distingue evidencia de remedio; ambas tienen reglas de ciclo de vida opuestas.
- **El estado de un fondo está en dos sitios**: la ficha (7 valores) y GitHub (abierto/cerrado), con un workflow que los concilia una vez al día (`FLUJO.md`: «colgar un hijo no lanza ningún workflow»).
- Lo que no incluí como entidad: la línea `Casos:` del PR (es campo del PR), la ventana de observación (dos fechas de la ficha), el comentario del workflow (`<!-- menuplan:fondo -->`, marca técnica).
