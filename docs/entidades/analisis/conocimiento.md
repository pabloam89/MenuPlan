# Familia CONOCIMIENTO Y REGLAS: análisis con la FICHA

Fecha de datos: 12 oct 2026, leídos en `C:\dev\MenuPlan` (staging). «Comprobado» = lo he contado o leído en el fichero citado hoy; «Creo» = inferencia.

## Tabla resumen

| Entidad | Existe hoy como | Nivel | Veredicto |
|---|---|---|---|
| principle | `ops/principios/` (56 propios) + 40 de producto + 15 de redacción = 111 | meta | Se queda. Es el porqué; la norma lo cita (no «genera» en sentido técnico) |
| norm | `ops/normas.json`, 183 | meta (de la norma-pieza) | Se queda. Es la unidad con id; cita 1 principio |
| mechanism | `ops/mecanismos.json`, 12 | plantilla (de control) | Se queda, pero hay que unir su id con `ejecutor` |
| rule (`.claude/rules`) | 6 ficheros sin id; el glosario la define de otra forma | vehículo, no entidad | Se retira como entidad: pasa a ser campo `donde` de la norma |
| hook | 8 scripts en `settings.json` + 10 de apoyo | pieza | Se queda como **ejecutor** (pieza), no como tipo de control ni de mecanismo |
| vocabulary | `ops/vocabularios-vida.json`, 80 vocabularios / 465 valores | pieza | Se queda; la nota del registro (56/327) está desfasada |
| learning | campo `aprendizaje` del fondo | campo | Pasa a ser campo del fondo; `recorded_in` no lo escribe nadie |
| standard (nuevo) | `ops/estandares-agentes.json` + sus 24 criterios de forma | pieza | Entidad nueva, pero **no solo agregación**: 66 tareas, 156 reglas propias |
| check (nuevo) | el campo `control` de la norma (59 ficheros) | pieza | Entidad nueva con otro nombre: **«comprobación»**, no «control» ni «check» |
| template (nuevo) | 7 tipos de skill, plantilla de agente, encargo, formularios | plantilla | No es entidad: es **nivel** (`level: template`), ya existe en el eje |
| forge (nuevo) | `ops/forja/`, 75 criterios | meta | Es la entidad **criterio** (y su catálogo), no «forja» a secas |

## Contraste con el punto de partida de Pablo

1. **«Los principios generan las normas»**: cierto a medias. Comprobado: 183 de 183 normas llevan `principio` (`ops/normas.json`, campo; vigilado por `ops/uniones.test.js`). Pero la flecha es de cita (la norma apunta al principio), no de generación: 3 principios de la casa no tienen norma (`principios_sin_norma`: `axis-language-bridge`, `names-have-form`, `person-vs-identity`). Es relación `referencia` N:1 (muchas normas a un principio; 183 normas citan 108 principios distintos).
2. **«Los estándares son agregaciones de normas»**: cierto solo a medias. Comprobado en `ops/estandares-agentes.json`: 66 tareas de 9 agentes; 176 normas llegan a alguna por consulta ámbito × acción (la tarea no las copia); pero solo 15 citas explícitas (13 normas distintas) y **156 reglas propias** con la misma forma que una norma. Por eso el estándar mezcla dos cosas: agregación derivada y reglas propias.
3. **«El hook es un tipo de control o mecanismo con fuerza dura/semi/blanda»**: falso en tres puntos, todos con dato.
   - El hook no es un tipo de control. El `control` de una norma es el fichero que la vigila, y para las normas con ejecutor `guardia` es casi siempre un **test** (`guardia.test.js` en 20 de 26; 157 de las 183 normas no tienen control en hooks). Comprobado.
   - Sí existe un mecanismo `hook` en `ops/mecanismos.json` (escalón `bloqueo`, ejecutor `guardia`, alcance `solo_claude`, veredicto `semidura`), pero es un **techo**, no el veredicto de la norma.
   - «dura/semi/blanda» es el `veredicto` (`VEREDICTOS` en `scripts/lib/escalas.mjs`: dura, semidura, blanda, rota), no la `fuerza`. `fuerza` es otra cosa: `debe` 141, `no_debe` 41, `conviene` 1. Cruce comprobado: `debe|blanda` 73, `no_debe|blanda` 16, `debe|dura` 17, `no_debe|dura` 7 (no se pueden mezclar).
   - Con ejecutor `guardia`: 23 semiduras, 3 blandas, 0 duras, coherente con el techo. Pero con ejecutor `ci` hay 19 duras, 27 semiduras y 3 blandas: el veredicto lo pone cada norma, no el mecanismo.

---

## 1. principle (Principio)

1. **Qué es.** «Una razón de fondo que dice por qué se pide algo, con su fuente» (`ops/glosario/terminos/principio.json`). Registro: `ops/principios/_catalogo.json` (campos `delegados`, `anexos`, `precedencia`, `principios_sin_norma`). Definiciones distintas: `docs/datos/PRINCIPIOS.md` (principios de tablas de HoMenu), `docs/producto/PRINCIPIOS.md` y `docs/entidades/N0-principios.md` (principios de entidades). Los tres siguen la misma idea, solo cambian de sitio.
2. **Quién la lee.** Comprobado: `ops/normas.json` (campo `principio`), `ops/uniones.test.js`, `ops/principios.test.js`, `ops/principios-producto.test.js`, `ops/precedencia.test.js`, skill `principios-de-producto`.
3. **Nivel.** meta. Sus piezas son los principios concretos (111: 56 propios + 40 de producto + 15 de redacción, comprobado; las normas citan 53 + 40 + 15 = 108).
4. **Relaciones.** Norma → principio: referencia, N:1, se guarda en el campo `norm.principio` (`ops/entidades.json` relaciones). Principio → principio: `precedencia` entre conceptos (seguridad, datos de familias, coste…). Principio ← entidad: los principios de N0 no tienen norma hasta que exista el N1 de cada entidad.
5. **Ciclo de vida.** Vivo o retirado (los valores de vocabulario no se borran, `vocabularios-vida.json`). Lo cambia gobierno con juez.
6. **Fuente y copias.** Tres catálogos (propio, producto, redacción) con una lista única (#619). Copias en prosa: `docs/datos/PRINCIPIOS.md`, `docs/producto/PRINCIPIOS.md`. Creo que son generadas o documentación; no lo he comprobado una a una.
7. **Quién la crea.** Human + agent (gobierno), con intervención de Pablo (irreducible: es el juicio de valor).
8. **Veredicto.** **Se queda como meta.** Arreglo menor: llamar a la relación «justifica» o «cita», no «genera».
9. **No sé.** Si los 3 principios sin norma son deseables o un hueco. Se averigua leyendo `principios_sin_norma` y preguntando a Pablo.

## 2. norm (Norma)

1. **Qué es.** «Una obligación del proceso registrada en `ops/normas.json`, con quién la hace cumplir, su dureza y su test» (glosario `norma.json`). Campos reales de cada norma (comprobado): `id, nombre, sujeto, fuerza, exigencia, donde, ejecutor, alcance, ante_fallo, control, control_tipo, veredicto, riesgo, issue, principio, ambito, acciones` (+ opcionales `condicion, nota, test_fallo, concepto, desde`).
2. **Quién la lee.** `ops/normas.test.js`, `docs/ops/NORMAS.md` (generado), `scripts/lib/estandaresAgentes.mjs` (consulta por ámbito × acción), el `revisor`, `npm run estandar`.
3. **Nivel.** Pieza concreta; su plantilla de forma es `scripts/lib/regla.mjs` (compartida con criterios y reglas propias de estándar).
4. **Relaciones.** cita principio (N:1, campo `principio`); aplica a un `sujeto` (vocabulario cerrado); se vigila con un control (N:1, campo `control`, 59 ficheros distintos); la ejecuta un ejecutor (N:1, campo `ejecutor`, 10 valores); refiere a un issue (campo `issue`). **No guarda el id del mecanismo**: `ejecutor` guarda un valor de `EJECUTORES` (`github_regla`) y el mecanismo se llama `regla_github`. Estándar ← norma: por consulta, no por campo.
5. **Ciclo de vida.** Se mide con `veredicto`: dura, semidura, blanda, rota. Comprobado: blanda 90, semidura 67, dura 24, rota 2. Lo sube o baja quien cambia su ejecutor o su test; `forja-capas` y ` ops/` hacen que solo suba.
6. **Fuente y copias.** Fuente: `ops/normas.json`. Copias: `docs/ops/NORMAS.md` (generado), y el campo `donde` apunta a donde está escrita en prosa (17 en `.claude/rules/`, 24 en hooks, 36 en `CLAUDE.md` según el super-tabla, sin recontar).
7. **Quién la crea.** Agent (gobierno) con juez; Pablo cuando es un gateway (52 normas con ejecutor `persona`).
8. **Veredicto.** **Se queda.** Hay que separar en el modelo, con nombre distinto, `fuerza` (debe/no_debe/conviene: RFC 2119) y `veredicto` (cuánto se hace cumplir). Dos columnas, dos vocabularios, no se mezclan.
9. **No sé.** Si `veredicto` se podría calcular (en vez de guardar) a partir de ejecutor + alcance + ante_fallo + control. Se averigua escribiendo la función y comparándola con las 183.

## 3. mechanism (Mecanismo)

1. **Qué es.** «Una forma de hacer cumplir algo que está en el catálogo `ops/mecanismos.json`; el arreglo elige el más alto posible» (glosario `mecanismo.json`). 12 mecanismos con `id, nombre, escalon, ejecutor, alcance, veredicto, cuando, cuesta, ejemplo`. El glosario avisa de tres usos de la palabra (ids del catálogo; `ficha.mecanismo` del fondo; `recorded_in` del aprendizaje).
2. **Quién la lee.** Skills `plan-de-arreglo` y `causa-raiz`, `npm run mecanismos`, `ops/mecanismos.test.js`, el bloque `encargo.mecanismo`.
3. **Nivel.** Plantilla (el tipo de control), no pieza.
4. **Relaciones.** mecanismo → escalón de `ESCALERA` (5: bloqueo, test_ci, script, skill, texto; N:1, campo); mecanismo → ejecutor (N:1, campo; el test cruza los dos vocabularios). Norma → mecanismo: **ninguna** (`stored_as: none` en `ops/entidades.json`). Fondo y encargo → mecanismo: el encargo lo guarda; el fondo guarda un escalón (`barrera`) y texto libre (`mecanismo`).
5. **Ciclo de vida.** Estático; lo cambia gobierno. Su `veredicto` es el techo.
6. **Fuente y copias.** Fuente: `ops/mecanismos.json`. Tres vocabularios solapados: `ejecutor` (10), `control_tipo` (5), ids de mecanismo (12).
7. **Quién la crea.** Agent (gobierno).
8. **Veredicto.** **Se queda como plantilla de control.** Arreglo: que la norma guarde `mecanismo` (id) y el `ejecutor` se derive de él (hoy 12 vs 10 y nombres distintos). Dato que lo decide: de las 183 normas, 49 con ejecutor `ci` tienen veredicto `dura` solo 19 veces, así que el mecanismo no puede imponerlo.
9. **No sé.** Si los ids de mecanismo pueden pasar a ser los de `EJECUTORES` sin romper a `plan-de-arreglo`. Se averigua con `grep` de los lectores.

## 4. rule (Regla, `.claude/rules`)

1. **Qué es.** Hay dos definiciones: el glosario dice «una condición concreta que hay que cumplir, escrita donde se aplica: un fichero de `.claude/rules/`, la guardia o un test» (`regla.json`); el registro de entidades dice «contienen reglas sin id; las que tienen id son normas». Y `scripts/lib/regla.mjs` llama «regla» a la plantilla de forma. Tres significados (comprobado).
2. **Quién la lee.** Claude Code (salta al leer o editar un fichero de su zona). Seis ficheros: `api, catalogo, lola, migraciones, tests, ui`. Ningún script los parsea por regla.
3. **Nivel.** Ni meta ni plantilla: es un vehículo de texto.
4. **Relaciones.** norma → `donde` (campo) apunta a la regla en 17 de 183 normas (comprobado). `enforced_by hook` está como `stored_as: none`.
5. **Ciclo de vida.** Sin estados.
6. **Fuente y copias.** Es copia: la fuente de cada obligación es la norma; el fichero es un recordatorio local.
7. **Quién la crea.** Human/agent, a mano.
8. **Veredicto.** **Se retira como entidad** y queda como lugar (`donde`). La plantilla `regla.mjs` pasa a llamarse con otro nombre (ya hay `criterio`/`norma`). Dato: 17 de 183.
9. **No sé.** Cuántas obligaciones de los 6 ficheros no están en ninguna norma. Se averigua leyendo los 6 ficheros contra `donde`.

## 5. hook (Hook)

1. **Qué es.** «Un script de `.claude/hooks/` que Claude Code lanza solo en un momento fijo» (glosario `hook.json`, estrecho: `guardia`). Comprobado en `.claude/settings.json`: 9 entradas, 8 scripts distintos (`arranque, fin, avisos, buscar-antes, pendientes, voz, guardia, skill-abierta`) en 6 eventos (SessionStart, SessionEnd, PostToolUse, PostToolUseFailure, Stop, PreToolUse). Hay 18 `.mjs` en `.claude/hooks`; los otros 10 son bibliotecas.
2. **Quién la lee.** Claude Code. Nadie más lo cuenta por máquina; el registro dice `partial`.
3. **Nivel.** Pieza.
4. **Relaciones.** hook ← norma: el hook es el ejecutor de 26 normas (`ejecutor: guardia`, N:M; la relación es el campo `ejecutor`, que guarda un tipo, no el hook concreto). Hook ← control: 25 normas tienen su control dentro de `.claude/hooks/` (6 ficheros distintos); el resto son tests. hook → mecanismo: el mecanismo `hook` es el tipo, el hook es la instancia (es-un, no guardado).
5. **Ciclo de vida.** Se activa o desactiva en `settings.json` (human + guardia lo protege).
6. **Fuente y copias.** `settings.json` dice cuáles corren; la definición está en el código y en la norma.
7. **Quién la crea.** Agent (gobierno), OK de Pablo (tocar hooks).
8. **Veredicto.** **Se queda como pieza (ejecutor); no es un tipo de control.** El tipo es el mecanismo `hook`. Dato: 157 de 183 normas con ejecutor guardia no tienen control en hooks; lo vigila un test.
9. **No sé.** Si hace falta un registro por hook con su evento y sus normas. Se averigua si alguien pregunta «¿qué normas cubre este hook?»; hoy solo se contesta leyendo.

## 6. vocabulary (Vocabulario)

1. **Qué es.** «Una lista cerrada de valores, cada uno con definición, en una constante de JS con test (y un CHECK si va a SQL)» (glosario `vocabulario.json`). Registro: `ops/vocabularios-vida.json` (`anclados`, `retirados`, `redefiniciones`, `vocabularios_retirados`). Comprobado hoy: **80 vocabularios y 465 valores anclados**; la nota de `ops/entidades.json` dice 56 y 327 (desfasada).
2. **Quién la lee.** `ops/vocabularios-vida.test.js`, `ops/glosario.test.js`, `src/lib/vocabularios.js` para el producto, `supabase/principios.test.js`.
3. **Nivel.** Pieza. Hay vocabularios de proceso (este registro) y de producto (`vocabularios.js` + CHECK); la nota admite duplicados (MESES en 4 sitios).
4. **Relaciones.** vocabulario ← campo de otra entidad (referencia). Comprobado: norma usa ≥7 (`ejecutor, alcance, ante_fallo, veredicto, riesgo, control_tipo, ambito`).
5. **Ciclo de vida.** Un valor se ancla, se retira (con `pasa_a` y fecha) o se redefine; nunca se borra. Solo crece.
6. **Fuente y copias.** Constante JS = fuente; `anclados` es generado (`npm run glosario -- --vocabularios --escribir`); CHECK SQL = espejo.
7. **Quién la crea.** Agent; automático el anclado.
8. **Veredicto.** **Se queda.** Subtipo posible: `scale` (vocabulario ordenado: veredicto, escalera, riesgo) frente a lista plana. Dato: `ORDEN_VEREDICTO` y `ESCALERA` tienen orden que otros no.
9. **No sé.** Cuántas constantes duplicadas hay realmente. Se averigua con un script que compare valores entre constantes.

## 7. learning (Aprendizaje)

1. **Qué es.** «Un registro de lo que queda de un fondo para que no se repita y dónde quedó» (glosario `aprendizaje.json`, clase `campo`). En la práctica, el campo `aprendizaje` de la ficha del fondo: texto que `aprendizajeValido` exige concreto o «ninguno — motivo de ≥25 caracteres» (`scripts/lib/fondos.mjs:299-305`). El registro de entidades declara `recorded_in` (test, guard, rule, skill).
2. **Quién la lee.** El workflow `fondos` y el CI (para impedir cerrar un fondo sin aprendizaje: «cierre-sin-aprendizaje», `fondos.mjs:465`). Como entidad, nadie: `git grep recorded_in` solo sale en 4 ficheros de documentación y de test del propio registro; ningún script lo escribe.
3. **Nivel.** Pieza, pero sin identidad propia.
4. **Relaciones.** fondo → aprendizaje: padre-hijo 1:1 o 1:N (campo texto en el fondo). Aprendizaje → artefacto tocado (test, guardia, skill): referencia sin campo (va en texto).
5. **Ciclo de vida.** Existe o no; sin estados.
6. **Fuente y copias.** Fuente: la ficha del fondo. Copias: el PR y la ficha de cada agente (según el registro; sin contar).
7. **Quién la crea.** Agent al cerrar el fondo; la valida el CI.
8. **Veredicto.** **Pasa a ser campo del fondo** (ya lo es), no entidad. `recorded_in` solo entra si alguien lo va a leer; hoy es un campo sin lector (viola «ningún campo sin lector»).
9. **No sé.** Cuántos fondos cerrados tienen aprendizaje con test, guardia o skill (para saber si `recorded_in` se puede derivar). Se averigua con un script sobre los fondos cerrados.

## 8. standard (Estándar), candidato nuevo

1. **Qué es.** «El conjunto de criterios que dice qué es hacer bien una tarea de agente o un tipo de skill, con qué comprueba, qué no hace y su fuente» (glosario `estandar.json`). Registro: `ops/estandares-agentes.json` (`agentes`, `comunes`, `fuentes`, `reglas_que_no_son_norma`, `normas_sin_juez`); `docs/ops/ESTANDARES.md` es generado.
2. **Quién la lee.** `npm run estandar`, el brief de `/orquestar`, el `revisor`, `ops/estandares-agentes.test.js`, `ops/uniones.test.js`.
3. **Nivel.** Pieza (de la tarea de agente). Su forma está en la forja (24 criterios de estándar).
4. **Relaciones.** estándar es de una tarea de agente (1:1); lleva reglas propias (156, 1:N, padre-hijo, campo); consulta normas por ámbito × acción (N:M, sin campo, calculado); cita normas aparte (15 citas, 13 distintas); lleva comunes (11 tareas comunes, 19 reglas). La definición del glosario «se compone de criterios»; en realidad se compone de reglas.
5. **Ciclo de vida.** Vivo o retirado; `estandar-estado-cerrado` lo vigila como criterio.
6. **Fuente y copias.** Fuente: JSON. Copias: `ESTANDARES.md` (generado) y la sección «Tareas y su estándar» de cada ficha de agente (generada; la compara un test).
7. **Quién la crea.** Agent (gobierno + dueño del agente), con investigación de fuentes (49 externas, 17 de la casa).
8. **Veredicto.** **Entidad nueva, sí; pero NO «agregación de normas»**. Dato: 156 reglas propias frente a 15 citas. Dos opciones: (a) estándar = tarea + sus reglas propias; las normas llegan por consulta (modelo actual); (b) mover las 156 reglas a normas (con principio y ejecutor) y que el estándar sea solo consulta. (b) es lo que pide el principio 1 de Pablo; el coste es dar principio a 156 reglas.
9. **No sé.** Cuántas de las 156 reglas propias ya están duplicadas como norma (el test `uniones` mide el parecido; no recontado). Se averigua corriendo ese test.

## 9. check, candidato nuevo (el fichero que vigila una norma)

1. **Qué es.** Hoy es el campo `control` de la norma (ruta de fichero o `juicio`) con `control_tipo` (test 92, juicio 76, planos 7, script 7, workflow 1; comprobado). El glosario ya usa «control» para otra cosa: «una comprobación automática concreta con su código de vocabulario cerrado, que da falta, aviso o bien» (`control.json`). Los criterios de la forja también tienen `control` (fichero) y `codigo`: dos nombres para el fichero y el código.
2. **Quién la lee.** `ops/normas.test.js` (comprueba que el fichero existe y es del tipo), `docs/ops/NORMAS.md`, el `revisor`.
3. **Nivel.** Pieza.
4. **Relaciones.** norma → comprobación: N:1 (59 ficheros para 107 normas con control automático; 14 compartidos), campo `control`. comprobación → ejecutor: la comprobación corre dentro de un ejecutor (`ci` ejecuta un test; `guardia` ejecuta una regla de `guardia.mjs`, vigilada por `guardia.test.js`). Comprobado: con ejecutor `ci` hay control_tipo test/workflow/script; con `guardia`, test/juicio.
5. **Ciclo de vida.** Existe (fichero) o es `juicio` (sin artefacto). Si se borra el fichero se rompen todas sus normas.
6. **Fuente y copias.** Un fichero; la norma lo nombra por ruta (relación por texto, no por id).
7. **Quién la crea.** Agent, junto con la norma.
8. **Veredicto.** **Entidad candidata con nombre propio, «comprobación» (id `verification`)**, para no chocar con «control» del glosario. Mientras no tenga id propio, queda como campo de la norma con su vocabulario `control_tipo`. Dato que lo decide: 14 ficheros se comparten, así que ya hay N:1 que se pierde si se deja como texto. No la crearía hasta que alguien pregunte «¿qué normas rompo si cambio este test?» (hoy se contesta con `grep`).
9. **No sé.** Si «control» del glosario (código de falta/aviso) y `control` de la norma se pueden fundir: el primero es el código que emite el script, el segundo es el fichero. Se averigua leyendo `scripts/lib/forja.mjs` y `normas.mjs`.

## 10. template (Plantilla), candidato nuevo

1. **Qué es.** «El molde de una forma común que se repite: la de skills, la de agentes, la del encargo y los formularios de issue» (glosario `plantilla.json`; sinónimo prohibido `template`). Los moldes de skill se generan en `.claude/plantillas-skill/<tipo>.md` desde `ops/forja/tipos_skill/` (7 tipos: conocimiento, decision, diagnostico, flujo, procedimiento, revision, servicio). Otras: `.claude/PLANTILLA-AGENTE.md`, `.claude/PLANTILLA-SKILL.md`, `ops/tipos-de-encargo.json` (5 tipos, 12 subtipos activos) y los formularios.
2. **Quién la lee.** `.claude/agentes.test.js`, `.claude/skills.test.js`, `ops/forja-tipos.test.js`, `scripts/lib/tiposDeEncargo.mjs`.
3. **Nivel.** Es **el** nivel `template` de la escala meta / plantilla / pieza (`docs/ops/FORJA.md`, `docs/entidades/SUPER-TABLA.md` §1).
4. **Relaciones.** plantilla → piezas: 1:N, es-un por tipo (el `tipo` del frontmatter de la skill). Plantilla ← forja: la forja la produce (y los criterios la gobiernan).
5. **Ciclo de vida.** Se cambia por PR con juez; las piezas se comprueban contra ella por test.
6. **Fuente y copias.** Fuente: ficheros JSON de `ops/forja/`; los moldes `.md` son generados.
7. **Quién la crea.** Agent (forja-de-skills), Pablo decide los tipos (decisión del 10 oct 2026).
8. **Veredicto.** **No es una entidad: es un valor de `level` (`template`) que ya tienen mechanism y los tipos de encargo.** Crearla como entidad duplica el eje de nivel. Dato: ya hay 1 entidad con `level: template` (mechanism) y la nota del súper-tabla dice que los 12 subtipos de encargo también.
9. **No sé.** Si «plantilla» (de skill) y «tipo» (de skill) son la misma cosa con dos nombres. Se averigua mirando si algún test distingue ambos.

## 11. forge (Forja), candidato nuevo

1. **Qué es.** «La única fuente de lo que se le pide a una skill, a un estándar de agente y a lo que venga» (`docs/ops/FORJA.md`). Registro: `ops/forja/_catalogo.json` (con `promocion`, `preguntas_tipo`, `libertad`, `invocacion`), 75 criterios en `ops/forja/criterios/`, 7 tipos de skill, 5 fichas de campos (`agente, criterio, estandar, juicio, skill`). Tres capas: formal 43, material 16, subjetiva 16 (suman 75; un criterio que aplica a dos artefactos cuenta una vez en el total).
2. **Quién la lee.** `scripts/lib/forja.mjs`, `ops/forja.test.js`, `ops/forja-forma.test.js`, `ops/forja-tipos.test.js`, `npm run skills-prueba`.
3. **Nivel.** Meta (qué hace buena a una pieza de la familia). Piezas de la forja: criterios.
4. **Relaciones.** forja → criterio: 1:N, padre-hijo, fichero por criterio. criterio → artefacto (`aplica_a`: skill, estándar, agente; N:M, campo). criterio → comprobación (campo `control`) y capa (formal, material o subjetiva). Un criterio **no** cita principio, a diferencia de la norma (sus claves: `id, capa, aplica_a, tipos, nombre, sujeto, fuerza, exigencia, fuente, control, codigo`; comprobado).
5. **Ciclo de vida.** La capa de cada criterio solo sube (`ops/forja-capas.json`); un subjetivo es «listo para subir» si supera los umbrales de `promocion`.
6. **Fuente y copias.** Fuente: JSON por criterio; `FORJA.md` es generado.
7. **Quién la crea.** Agent (gobierno, forja-de-skills); Pablo decide los tipos.
8. **Veredicto.** **Se queda como meta, pero la entidad es «criterio», no «forja»**, y es **un caso de norma sin principio**: mismas columnas (sujeto, fuerza, exigencia, control, fuente). Opciones: (a) fusionar con `norm` añadiendo un `kind` (criterio de calidad) y dándole principio; (b) mantener separado. Dato: son 75 frente a 183, con el mismo molde `regla.mjs` y vigilados por el mismo tipo de control; lo que difiere es que el criterio dice «aplica a» un artefacto y la norma dice «ámbito + acciones».
9. **No sé.** Si los 75 criterios deberían citar principio. Se averigua comparando cada uno con `ops/principios/`.

---

## Resumen de relaciones entre las 11 (con clase)

| Desde | Hacia | Clase | Cardinalidad | Dónde se guarda |
|---|---|---|---|---|
| norma | principio | referencia | N:1 | campo `principio` |
| norma | comprobación (control) | referencia | N:1 (59 ficheros / 107 normas) | campo `control` (ruta) |
| norma | ejecutor | referencia | N:1 | campo `ejecutor` (10 valores) |
| norma | mecanismo | referencia | N:1 | **nada** |
| mecanismo | escalón | referencia | N:1 | campo `escalon` |
| hook | mecanismo `hook` | es-un | 1:1 | nada |
| estándar | norma | referencia derivada | N:M | calculada (consulta) + 15 citas |
| estándar | regla propia | padre-hijo | 1:N (156) | campo (lista `reglas`) |
| criterio (forja) | artefacto | referencia | N:M | campo `aplica_a` |
| fondo | aprendizaje | padre-hijo | 1:1 | campo texto de la ficha |

---

## DECISIONES PENDIENTES (para Pablo)

1. **El estándar, ¿agregación pura o también reglas propias?** Recomendado A: mantener el modelo actual y nombrarlo (estándar = tarea + reglas propias + normas por consulta); B: convertir las 156 reglas en normas (cada una con principio); C: ni lo uno ni lo otro, solo documentar. Coste de B: dar principio a 156 reglas; reversible.
2. **Nombre de la entidad que vigila una norma.** Recomendado A: «comprobación» (id `verification`); B: «verificación» a secas; C: renombrar el «control» del glosario y usar «control» para el fichero. Coste: A cambia solo el registro; C toca glosario y varios tests.
3. **`fuerza` y `veredicto` en el modelo.** Recomendado A: dos campos separados con esos nombres y una línea en el glosario; B: renombrar `veredicto` a «dureza» (el flujo ya lo llamaba así antes de `escalas.mjs`); C: dejarlo. Coste de B: toca `escalas.mjs`, normas y flujo.
4. **`rule` y `template` como entidades.** Recomendado A: retirar `rule` (pasa a lugar, campo `donde`) y no crear `template` (es `level`); B: mantener `rule` como entidad; C: crear ambas. Coste de A: solo el registro; reversible.
5. **Criterios de la forja: ¿llevan principio y se funden con norma?** Recomendado B: mantenerlos separados hasta que alguien necesite listar «todo lo que debe ser verdad»; A: fundirlos con `kind`. No hay prisa.
