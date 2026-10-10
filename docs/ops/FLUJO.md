# El flujo de un fallo

De que algo falla a que se aprende de ello. Es la especificación del fondo
**#334**; esta pieza es su fase F0 (**#335**). Dice, para cada paso, qué
entra, qué sale, quién lo hace, qué skill usa, **qué obligación hay y qué la
hace cumplir de verdad**. Lo que no tiene un mecanismo detrás se dice blando,
con la fase que lo endurece. Nada aquí se da por hecho porque esté escrito.

**Dónde vive cada cosa.** El dato está en [`ops/flujo.json`](../../ops/flujo.json)
con vocabulario cerrado; las tablas de este documento **salen de él** (y del
registro de normas `ops/normas.json`) y no se editan a mano
(`npm run flujo -- --escribir`). [`ops/flujo.test.js`](../../ops/flujo.test.js)
falla si el JSON se sale del vocabulario, si cita un fichero o un test que no
existe, si una obligación se dice dura sin serlo o si las tablas no coinciden.
El vocabulario de las clases de issue (tipo, análisis, causa, área, arreglo)
tiene **una sola fuente**: `scripts/lib/issues.mjs`. Aquí no se repite.
Los presupuestos por alcance y causa tienen la suya: [`ops/presupuestos.json`](../../ops/presupuestos.json)
(`ops/presupuestos.test.js`); su tabla de abajo también sale de él.

## El invariante (el objetivo, no el estado de hoy)

> Todo fallo detectado recorre el mismo camino, y cada paso lo impone un
> mecanismo y no una frase. **Detectar → registrar el caso → triaje →
> diagnosticar → fondo → plan → ejecutar → verificar → observar → cerrar →
> aprender → medir.** El esfuerzo de cada ciclo es proporcional a su alcance, y
> los presupuestos se recalibran con datos.

Un fondo (`tipo:fondo`) es el problema de fondo; cuelgan de él los casos
(evidencia) y los encargos (el arreglo). Las cuatro respuestas del análisis de
un caso (nuevo, abierto, no aguantó, puntual) y su definición están en
`scripts/lib/issues.mjs`; el principio, en `CLAUDE.md` («Cuando algo falla»).

**Hoy ningún paso es duro de punta a punta.** La cuenta está debajo de la tabla
de obligaciones (y sale con `npm run flujo`): esa cifra es la que tiene que subir.

## Cómo se lee

- Un **paso** tiene **obligaciones**: lo que tiene que ser verdad para que el
  paso valga. Se escribe como una regla (nombre, sujeto, fuerza, condición y
  exigencia; guía en `docs/ops/REDACCION.md`), y su frase sale de esos campos.
  Dice **quién la hace cumplir** (el `ejecutor`, con el vocabulario del registro
  de normas #296, que se importa de `scripts/lib/normas.mjs` y no se copia), con
  qué se **controla** y **cómo de dura es hoy** (su `veredicto`, en la escala
  única de `scripts/lib/escalas.mjs`):
  - **dura**: la hace cumplir el sistema (CI, regla de GitHub, la base…), a
    todos, y un test lo vigila;
  - **semidura**: tiene ejecutor, pero solo alcanza a las sesiones de Claude, a
    quien usa el script, falla abierto o no tiene test;
  - **blanda**: solo texto, o alguien que se acuerda;
  - **rota**: se dice que hay mecanismo y hoy no funciona.
- **Un paso vale lo que su obligación más débil.** Una cadena con un eslabón
  blando es blanda, aunque los demás sean duros.
- Toda obligación que no es dura dice **qué fase la endurece** (`fase`), o se
  acepta como está y por qué (`aceptada`, solo para avisos que no son puertas).
- `ref` es dónde vive el mecanismo o dónde está **escrita** la norma, y
  `contiene` la frase que ese fichero tiene que llevar de verdad: el test la
  busca, porque un fichero que existe no basta. Si la norma no está escrita en
  ningún sitio, `ref` es nulo y la nota dice «No escrita aún».
- Una obligación **remite a su norma** (`norma`) o se **escribe por campos**.
  La que remite no copia su frase, su ejecutor, su veredicto ni su control: salen
  del registro, y el test falla si los copia o si la norma no existe. La que no
  tiene norma lleva sus campos de regla, su `ejecutor`, su `veredicto`, su
  `control` (un fichero o «juicio») y su `control_tipo`, y solo se declara dura con
  un control que sea un `*.test.js` que nombre su fichero. **Límite conocido:**
  que un test nombre un fichero es un indicio, no una prueba de que lo vigile.
- Los **sujetos** de la frase son los de `ops/normas.json` más los propios del
  flujo (`sujetos` de `ops/flujo.json`); uno propio no repite uno del registro.

## Los doce pasos

<!-- flujo:fichas:inicio -->
| # | Paso | Entra | Sale | Quién | Skill | Se mide |
|---|---|---|---|---|---|---|
| 1 | Detectar | Un fallo en producción, en el CI o en el trabajo de una sesión | Una señal que alguien ve: un aviso, un check rojo, un hallazgo de un juez | automatico, juez, persona | (—) | ○ fallos detectados por fuente (vigía, agente de fallos, jueces) (#340) |
| 2 | Registrar el caso | Una señal de fallo | Un issue tipo:caso con su área, buscado antes entre los parecidos | agente_dominio, orquestador, automatico | `issues` | ✓ casos abiertos por área y tipo; ✓ PR con casos frente a PR con «ninguno» |
| 3 | Triaje | Un caso registrado | Alcance (local, módulo o transversal) y tipo de causa fijados | orquestador, agente_dominio | `causa-raiz` | ○ casos por alcance (#337) |
| 4 | Diagnosticar | Un caso con alcance y tipo | Mecanismo, causa de escape y clase del fallo; o una hipótesis marcada como tal | agente_dominio, juez, orquestador | `causa-raiz` | ✓ fondos y casos por causa; ✓ casos puntuales, para ver si eran un patrón |
| 5 | Fondo | Un diagnóstico | Un issue tipo:fondo con su arreglo general, su causa y cómo se probará | agente_dominio, orquestador | `causa-raiz` | ✓ fondos ordenados por casos (dónde duele) |
| 6 | Plan | Un fondo diagnosticado | Encargos colgados del fondo, con dependencias, agente, juez y verificación | orquestador, agente_dominio | `plan-de-arreglo` | ✓ encargos hechos frente a encargos por fondo |
| 7 | Ejecutar | Un encargo colgado de su fondo, con su issue | Un PR con su issue, su agente y su juez | agente_dominio, juez, orquestador | (—) | ✓ tiempo activo, tokens, coste estimado y agentes por encargo y por fondo (npm run fabrica, a mano, con las transcripciones de cada PC); ○ rondas reales por encargo (hoy solo el campo rondas de la ficha, que apunta la sesión) (#340) |
| 8 | Verificar | El PR de un encargo | CI en verde, juez conforme y un test que cubre la clase | automatico, juez | (—) | ○ fondos cerrados con test de clase (#341) |
| 9 | Observar | Un fondo con su arreglo fusionado | Una ventana sin casos nuevos, o el fondo reabierto | automatico, persona | (—) | ✓ fondos que no aguantaron, rotos o cortos |
| 10 | Cerrar | Un fondo cuya ventana de observación pasó limpia | Un fondo cerrado con el escalón en que quedó el arreglo | automatico, persona | (—) | ✓ días hasta cerrar un fondo, por causa y por agente |
| 11 | Aprender | Un fondo cerrado como eficaz | La lección en una skill, un catálogo, la guardia o un test | agente_dominio, juez | (—) | ✓ fondos cerrados con aprendizaje registrado |
| 12 | Medir | Los datos de todos los pasos anteriores | Un informe semanal de cumplimiento y de presupuesto frente a lo real | automatico, persona | (—) | ✓ presupuestado frente a real, por alcance y causa (npm run fabrica -- --recalibrar, a mano; propone solo con datos suficientes); ✓ cumplimiento del flujo (fondos sin diagnóstico, encargos sin juez, cerrados sin aprendizaje, reabiertos por clase corta, ciclos sobre presupuesto) y salud de las skills, cada lunes en el issue «Flujo: informe semanal» |
<!-- flujo:fichas:fin -->

✓ = se mide hoy · ○ = lo trae la fase indicada.

## Obligaciones y qué las hace cumplir

<!-- flujo:pasos:inicio -->
| Paso | Obligación | Fuerza | Lo hace cumplir | Control | Norma | Fase que la endurece |
|---|---|---|---|---|---|---|
| **Detectar** · semidura | | | | | | |
| P01.1 | **Aviso rápido de Lola.** Cuando ocurre en Lola o en la generación en producción, cada fallo DEBE avisar a alguien en minutos. | DEBE | proveedor · semidura · `.github/workflows/vigia-lola.yml` | workflow: `.github/workflows/vigia-lola.yml` | — | #315 |
| P01.2 | **Aviso diario del resto.** Cuando ocurre en el resto de la app, cada fallo DEBE llegar a alguien el mismo día. | DEBE | proveedor · semidura · `.github/workflows/agente-fallos.yml` | workflow: `.github/workflows/agente-fallos.yml` | — | #315, #313 |
| P01.3 | **Sesión informada al abrirse.** Cuando se abre, cada sesión de Claude DEBE saber qué issues esperan y quién lleva qué. | DEBE | guardia · semidura · `.claude/hooks/arranque.mjs` | script: `.claude/hooks/arranque.mjs` | — | — |
| **Registrar el caso** · blanda | | | | | | |
| P02.1 | **Issues con búsqueda previa.** Cuando se crea, cada issue DEBE crearse con npm run issues -- --nuevo. | DEBE | guardia · semidura · `.claude/hooks/guardia.mjs` | test: `.claude/hooks/guardia.test.js` | `issues-con-buscar-antes` | #325, #337 |
| P02.2 | **Pendientes a un issue.** Cuando deja decisiones o pendientes, cada sesión de Claude DEBE registrarlos en un issue. | DEBE | guardia · semidura · `.claude/hooks/pendientes.mjs` | test: `.claude/hooks/pendientes.test.js` | `pendientes-a-issue` | #312 |
| P02.3 | **Hasta el problema de fondo.** Cada fallo DEBE analizarse hasta su problema de fondo y registrarse como caso en un issue. | DEBE | ci · semidura · `scripts/casos-pr.mjs` | test: `scripts/casos-pr.test.js` | `cuando-algo-falla` | #341, #185 |
| P02.4 | **Repo público sin detalle.** El repositorio NO DEBE contener nada sensible en un issue, un commit o un PR. | NO DEBE | nada · blanda · `CLAUDE.md` | juicio | `repo-publico-sin-detalle` | #300 |
| P02.5 | **Freno por casos sin registrar.** Cuando termina con fallos y sin casos registrados, cada sesión de Claude DEBE ser frenada una vez para que los registre. | DEBE | guardia · semidura · `.claude/hooks/pendientes.mjs` | test: `.claude/hooks/pendientes-casos.test.js` | — | — |
| **Triaje** · blanda | | | | | | |
| P03.1 | **Triaje antes del esfuerzo.** Cuando se va a gastar esfuerzo en él, cada fallo DEBE tener fijados su alcance y su tipo de causa. | DEBE | nada · blanda · `.claude/commands/orquestar.md` | test: `ops/presupuestos.test.js` | — | #340 |
| P03.2 | **Presupuesto por alcance.** Cada problema de fondo DEBE sacar su esfuerzo del presupuesto de su alcance y su causa, y no de lo que decida la sesión. | DEBE | nada · blanda · `.claude/commands/orquestar.md` | test: `ops/presupuestos.test.js` | `presupuesto-por-alcance` | #340 |
| **Diagnosticar** · blanda | | | | | | |
| P04.1 | **Caso con respuesta.** Cada caso registrado DEBE acabar en una de las cuatro respuestas del análisis y colgar de su fondo. | DEBE | script_propio · semidura · `scripts/lib/issues.mjs` | test: `scripts/issues.test.js` | — | #341 |
| P04.2 | **Fondo buscado antes.** Cuando va a abrir un fondo, cada sesión de Claude DEBE buscar antes el fondo que ya existe. | DEBE | script_propio · semidura · `scripts/issues.mjs` | test: `scripts/issues.test.js` | — | #337 |
| P04.3 | **Diagnóstico hasta lo cambiable.** Cada diagnóstico DEBE llegar a algo que un mecanismo pueda cambiar y decir por qué nada lo detectó. | DEBE | persona · blanda · `.claude/skills/causa-raiz/SKILL.md` | juicio | — | #341 |
| P04.4 | **Hipótesis marcada como tal.** Cuando algo no se ha comprobado, cada diagnóstico DEBE marcarlo como hipótesis y no copiarlo como hecho. | DEBE | persona · blanda · `.claude/skills/causa-raiz/SKILL.md` | juicio | — | #341 |
| P04.5 | **Mirar lo ya apuntado.** Cuando va a evaluar código, cada sesión de Claude DEBE mirar antes lo ya apuntado en issues y encargos. | DEBE | guardia · semidura · `.claude/hooks/buscar-antes.mjs` | test: `.claude/hooks/buscar-antes.test.js` | — | — |
| **Fondo** · semidura | | | | | | |
| P05.1 | **Fondo con arreglo general.** Cada problema de fondo DEBE llevar en el cuerpo un arreglo general y una causa de un vocabulario cerrado. | DEBE | script_propio · semidura · `.github/ISSUE_TEMPLATE/2-fondo.yml` | test: `scripts/issues.test.js` | — | #341 |
| P05.2 | **Diagnóstico antes del plan.** Cada problema de fondo NO DEBE tener encargos sin diagnóstico (mecanismo y causa de escape). | NO DEBE | ci · semidura · `scripts/fondos-pr.mjs` | test: `scripts/fondos-pr.test.js` | — | #341 |
| P05.3 | **Ficha y controles del fondo.** Cada problema de fondo DEBE llevar una ficha válida y pasar sus controles en cada evento del issue. | DEBE | script_propio · semidura · `.github/workflows/fondos.yml` | test: `scripts/fondos-evento.test.js` | `fondo-con-ficha-y-controles` | #341 |
| **Plan** · blanda | | | | | | |
| P06.1 | **Arreglo en encargos.** Cada problema de fondo DEBE partir su arreglo en encargos colgados de él, uno por superficie. | DEBE | persona · blanda · `.claude/commands/revision-issues.md` | juicio | — | #337 |
| P06.2 | **Plan de tres encargos.** Cada problema de fondo DEBE tener como mucho tres encargos, cada uno con su bloque encargo completo, y al menos uno preventivo con mecanismo automático. | DEBE | script_propio · semidura · `scripts/lib/fondos.mjs` | test: `scripts/fondos-encargos.test.js` | `plan-tres-encargos-con-preventivo` | #341 |
| P06.3 | **Escalón más duradero.** Cada problema de fondo DEBE arreglarse con el escalón más duradero posible de la escalera. | DEBE | persona · blanda · `.claude/skills/plan-de-arreglo/SKILL.md` | test: `ops/mecanismos.test.js` | — | #341 |
| P06.4 | **Plan de tres encargos.** Cada problema de fondo DEBE tener como mucho tres encargos, cada uno con su bloque encargo completo, y al menos uno preventivo con mecanismo automático. | DEBE | script_propio · semidura · `scripts/lib/fondos.mjs` | test: `scripts/fondos-encargos.test.js` | `plan-tres-encargos-con-preventivo` | #337 |
| **Ejecutar** · blanda | | | | | | |
| P07.1 | **Encargo en su rama.** Cada encargo de un fondo DEBE ser una rama con el número de su issue y dejar ver quién lo lleva. | DEBE | script_propio · semidura · `scripts/tarea.mjs` | test: `scripts/lleva.test.js` | — | #337 |
| P07.2 | **PR al día con Closes.** Cada PR DEBE abrirse con la rama al día y, si la rama es de un issue, con Closes #n. | DEBE | guardia · semidura · `.claude/hooks/guardia.mjs` | test: `.claude/hooks/guardia.test.js` | `pr-al-dia-y-closes` | #337 |
| P07.3 | **Constructor distinto del juez.** Cada agente NO DEBE juzgar lo que ha construido. | NO DEBE | nada · blanda · `CLAUDE.md` | juicio | `quien-construye-no-juzga` | #341 |
| P07.4 | **Tope de rondas.** Cada problema de fondo NO DEBE pasar de las rondas del presupuesto de constructor y juez. | NO DEBE | script_propio · semidura · `scripts/lib/fondos.mjs` | test: `scripts/fondos-rondas.test.js` | `rondas-tope-duro` | #340 |
| P07.5 | **Agente con plantilla.** Cada agente DEBE seguir la plantilla: tipo, planos, método e informe común. | DEBE | ci · dura · `.claude/PLANTILLA-AGENTE.md` | test: `.claude/agentes.test.js` | — | — |
| P07.6 | **Main solo por PR.** La rama main DEBE recibir cambios solo por PR con el check tests en verde. | DEBE | github_regla · semidura · `ops/DECISIONES.md` | planos: `ops/planos.json` | `main-solo-por-pr-con-tests` | #330 |
| P07.7 | **Reglas propias intocables.** Cada sesión de Claude NO DEBE cambiar las propias reglas (protecciones, permisos, guardia) con credenciales de sesión. | NO DEBE | nada · blanda · no escrita aún | juicio | — | #326 |
| P07.8 | **Staging exige tests.** La rama staging DEBE recibir cambios solo con el check tests en verde, sea por PR o por push. | DEBE | github_regla · semidura · `ops/DECISIONES.md` | planos: `ops/planos.json` | `staging-exige-tests` | #263 |
| P07.9 | **Agente y Closes del PR.** Cada PR DEBE llevar la línea Agente: y, si la rama es de un issue, su Closes #n. | DEBE | ci · semidura · `scripts/fondos-pr.mjs` | test: `scripts/fondos-pr.test.js` | `pr-agente-y-closes-en-ci` | — |
| P07.10 | **Jueces sin escritura.** Cuando es un juez, cada agente NO DEBE tener Edit ni Write, contando las herramientas que da la memoria. | NO DEBE | ci · dura · `CLAUDE.md` | test: `.claude/agentes.test.js` | `jueces-sin-escritura` | — |
| P07.11 | **Agente y Closes del PR.** Cada PR DEBE llevar la línea Agente: y, si la rama es de un issue, su Closes #n. | DEBE | ci · semidura · `scripts/fondos-pr.mjs` | test: `scripts/fondos-pr.test.js` | `pr-agente-y-closes-en-ci` | — |
| P07.12 | **Jueces del presupuesto.** Cada ciclo de un fallo DEBE llevar al menos los jueces de su presupuesto, incluidos los que exige su causa. | DEBE | nada · blanda · `.claude/commands/orquestar.md` | test: `ops/presupuestos.test.js` | — | #340 |
| **Verificar** · blanda | | | | | | |
| P08.1 | **CI en cada PR.** El CI de cada PR DEBE correr tests, lint y build en cada PR. | DEBE | ci · dura · `.github/workflows/tests.yml` | test: `ops/planos.test.js` | — | — |
| P08.2 | **Test de clase.** Cuando se arregla, cada problema de fondo DEBE llevar un test de la clase, no solo del caso, que vigile el arreglo. | DEBE | persona · blanda · `.claude/commands/orquestar.md` | juicio | — | #341 |
| P08.3 | **Test visto fallar.** Cuando es un test nuevo, el código del producto DEBE verse fallar una vez antes de creérselo. | DEBE | nada · blanda · `CLAUDE.md` | juicio | `test-visto-fallar` | #341 |
| P08.4 | **Línea «Runbook:» del PR.** Cuando toca un dominio, cada PR DEBE llevar la línea «Runbook:». | DEBE | ci · semidura · `scripts/runbook-pr.mjs` | test: `scripts/runbook-pr.test.js` | `linea-runbook` | #337 |
| P08.5 | **Ficha y controles del fondo.** Cada problema de fondo DEBE llevar una ficha válida y pasar sus controles en cada evento del issue. | DEBE | script_propio · semidura · `scripts/lib/fondos.mjs` | test: `scripts/fondos-evento.test.js` | `fondo-con-ficha-y-controles` | #341 |
| **Observar** · semidura | | | | | | |
| P09.1 | **Ficha y controles del fondo.** Cada problema de fondo DEBE llevar una ficha válida y pasar sus controles en cada evento del issue. | DEBE | script_propio · semidura · `scripts/lib/fondos.mjs` | test: `scripts/fondos-evento.test.js` | `fondo-con-ficha-y-controles` | #341 |
| P09.2 | **Ficha y controles del fondo.** Cada problema de fondo DEBE llevar una ficha válida y pasar sus controles en cada evento del issue. | DEBE | script_propio · semidura · `scripts/lib/fondos.mjs` | test: `scripts/fondos-evento.test.js` | `fondo-con-ficha-y-controles` | #341 |
| **Cerrar** · semidura | | | | | | |
| P10.1 | **Cierre completo del fondo.** Cada problema de fondo NO DEBE cerrarse con encargos abiertos, sin el PR de su arreglo ni sin su etiqueta de arreglo. | NO DEBE | script_propio · semidura · `scripts/lib/issues.mjs` | test: `scripts/issues.test.js` | — | #341 |
| P10.2 | **Ficha y controles del fondo.** Cada problema de fondo DEBE llevar una ficha válida y pasar sus controles en cada evento del issue. | DEBE | script_propio · semidura · `scripts/lib/fondos.mjs` | test: `scripts/fondos-evento.test.js` | `fondo-con-ficha-y-controles` | #341 |
| **Aprender** · blanda | | | | | | |
| P11.1 | **Aprendizajes a un test.** Cada fallo DEBE dejar su aprendizaje en un test y nunca en la memoria. | DEBE | nada · blanda · `CLAUDE.md` | juicio | `lecciones-a-un-test` | #337 |
| P11.2 | **Skill con su plantilla.** Cada skill DEBE seguir la plantilla de su tipo: tipo, dueño, fecha de comprobación, secciones, tamaño, rutas y nada copiado. | DEBE | ci · dura · `.claude/PLANTILLA-SKILL.md` | test: `.claude/skills.test.js` | — | — |
| P11.3 | **Skill probada con casos.** Cada skill DEBE probarse con casos y seguir funcionando tras cambiarla. | DEBE | ci · semidura · `.claude/PLANTILLA-SKILL.md` | test: `.claude/skills.test.js` | — | #341 |
| P11.4 | **Regla de parada.** Cuando es nueva, cada pieza (catálogo, skill o agente) DEBE cumplir la regla de parada antes de crearse. | DEBE | nada · blanda · `docs/ops/FLUJO.md` | juicio | — | #341 |
| **Medir** · blanda | | | | | | |
| P12.1 | **Planos con criterios.** El nivel de cada plano DEBE salir de criterios comprobables. | DEBE | ci · dura · `scripts/lib/planos.mjs` | test: `ops/planos.test.js` | — | — |
| P12.2 | **Planos que miden resistencia.** Cada plano de la hoja de ruta DEBE medir si la protección resiste y no solo si el fichero existe. | DEBE | nada · blanda · no escrita aún | juicio | — | #321, #341 |
| P12.3 | **Ciclo medido.** Cada ciclo de un fallo DEBE medirse en rondas, tiempo y coste por número de issue. | DEBE | persona · blanda · `scripts/lib/fabrica.mjs` | juicio | — | #340 |
| P12.4 | **Presupuestos recalibrados.** Cada presupuesto del catálogo de esfuerzo DEBE recalibrarse con lo medido. | DEBE | persona · blanda · `scripts/lib/fabrica.mjs` | test: `scripts/fabrica.test.js` | `presupuestos-se-recalibran` | #340 |
| P12.6 | **Eventos de hooks registrados.** La guardia de Claude DEBE dejar una línea en el registro local de eventos por cada bloqueo, cada permiso que pide y cada skill que se abre. | DEBE | guardia · semidura · `.claude/hooks/eventos.mjs` | test: `.claude/hooks/eventos.test.js` | `eventos-de-hooks-registrados` | #340 |
| P12.5 | **Normas incumplidas contadas.** Cuando se incumple, cada norma del proceso DEBE contarse cada semana. | DEBE | script_propio · semidura · `scripts/lib/normas.mjs` | test: `ops/normas.test.js` | — | #341, #185 |

**53 obligaciones:** 5 duras · 31 semiduras · 17 blandas · 0 rotas. 25 remiten a su norma del registro y 28 están escritas por campos.
<!-- flujo:pasos:fin -->

## Lo que ya existía

Medido el 9 de octubre de 2026 sobre `staging`. Cambia el plan de #334 en cuatro
sitios, y por eso la especificación va antes de construir:

- **La plantilla de skill ya existe** (`.claude/PLANTILLA-SKILL.md`, vigilada por
  `.claude/skills.test.js`), pero solo para skills de **herramienta**. La fase
  C+ (#336) la **amplía** a más tipos y le añade el nivel 2 de pruebas; no la
  crea.
- **Los controles del fondo ya existen como script**, no como puerta:
  `faltas()` y `debeReabrir()` (`scripts/lib/issues.mjs`) comprueban análisis,
  fondo, arreglo, encargos abiertos y reapertura, pero solo cuando alguien lanza
  `npm run issues`. Ningún workflow reaccionaba a un issue abierto, cerrado o
  colgado desde otra vía. La fase B (#337) **mueve** esos controles a los
  eventos de GitHub (`.github/workflows/fondos.yml`, lógica en
  `scripts/lib/fondos.mjs`) y añade la ficha del fondo: un bloque `fondo` en el
  cuerpo, con vocabularios cerrados, explicado en la skill `issues`. El CI de
  cada PR (`scripts/fondos-pr.mjs`) pide además `Agente:`, el `Closes` de la
  rama y el diagnóstico del fondo de cada encargo que cierra. Lo que sigue sin
  puerta: los workflows de issues informan (comentario y etiqueta) y no impiden
  editar; colgar un hijo de un fondo no lanza ningún workflow, y lo revalida el
  pase diario (como mucho 24 h después).
- **La fase A ya está en staging** (PR #349): `ops/normas.json` con el registro de normas y
  su vocabulario en `scripts/lib/normas.mjs`. No esperó a este documento. Las
  obligaciones de aquí se enlazan con su norma y no pueden contradecirla; lo que
  falta de A está en #351. La línea `Casos:` del PR (#312, PR #354) también ya
  está en staging: la comprueba el CI (`scripts/casos-pr.mjs`) y, antes, la
  guardia. Por eso P02.3 ya no es blanda; es semidura porque «Casos: ninguno»
  con motivo es autodeclarado.
- **Ya hay una identidad de máquina.** La App `homenu-dependabot-merge` (PR
  #342) fusiona en staging los PR de actions de Dependabot, con su clave en un
  environment de GitHub y no en una sesión. Es el primer caso del patrón de
  #326 (una App por actor, con su propia clave), pero tiene permiso de escritura
  en `Workflows`: la fase E4 (#330) tiene que decidir cómo convive con exigir la
  revisión de una persona en `.github/**`, y el detector de E7 (#333) debe
  esperar esa identidad en su lista.

## Catálogos, escalera, skills y presupuestos

<!-- flujo:catalogos:inicio -->
### Las cuatro capas

| Capa | Pregunta | Qué contiene | Dónde |
|---|---|---|---|
| **Catálogos** | ¿Qué existe? | Registros estructurados, cada hecho una sola vez: vocabularios, mapas, planos, normas, mecanismos, técnicas y presupuestos | `scripts/lib/issues.mjs`, `ops/MODULOS.json`, `ops/planos.json`, `ops/flujo.json`, `ops/presupuestos.json` |
| **Skills** | ¿Cómo se hace? | Método, técnicas, referencias, scripts y plantillas. De uno de los tipos de tipos_skill de ops/forja.json (un servicio se opera; un diagnóstico piensa un tipo de problema), salvo la pieza meta | `.claude/skills`, `.claude/PLANTILLA-SKILL.md` |
| **Agentes** | ¿Quién lo hace y con qué permisos? | Rol, permisos y qué skills cargan. No llevan método: lo toman de las skills | `.claude/agents`, `.claude/PLANTILLA-AGENTE.md` |
| **Orquestación y reglas duras** | ¿Cuándo, en qué orden y cuánto? | Pipelines, presupuestos, tope de rondas y las reglas que impone un mecanismo | `.claude/commands/orquestar.md`, `.claude/hooks/guardia.mjs`, `.github/workflows/tests.yml` |

### La escala de veredicto

Cómo de dura es una regla hoy. Es la misma para las obligaciones de aquí, las normas (`veredicto`) y los mecanismos (`veredicto`, el más alto que pueden dar). Se declara en `scripts/lib/escalas.mjs` y se lee de allí.

| Veredicto | Qué quiere decir |
|---|---|
| dura | Ejecutor del sistema, para todos, falla cerrado y con un test que lo vigila |
| semidura | Tiene ejecutor, pero no alcanza a todos, falla abierto o no hay test |
| blanda | Solo texto o una persona que se acuerda |
| rota | Se dice que hay ejecutor y hoy no funciona |

### La escalera de durabilidad

De más a menos duradero. Un fondo grave o repetido se cierra con un escalón 1 o 2; los demás, con el más alto posible y su porqué. Se declara en `scripts/lib/escalas.mjs`: el `escalon` de un mecanismo, la `barrera` de la ficha del fondo y la etiqueta `arreglo:` de GitHub salen de ahí.

| Escalón | Qué es | Etiqueta `arreglo:` | Automático |
|---|---|---|---|
| 1 · bloqueo | Un permiso, un hook, una regla de GitHub o una restricción de la base impide hacerlo | `guardia` | sí |
| 2 · test_ci | Un test o un eval en el CI falla si vuelve | `test` | sí |
| 3 · script | Un script lo comprueba, si alguien lo lanza | `script` | no |
| 4 · skill | Un runbook lo explica a quien lo abre | `skill` | no |
| 5 · texto | Una línea en CLAUDE.md o en una regla | `regla` | no |

### Tipos de skill

La lista, qué entra y qué sale de cada tipo y cómo se asigna viven en `ops/forja.json` (`tipos_skill`, vista en `docs/ops/FORJA.md`); el molde de cada uno, en `.claude/plantillas-skill/` (#495).

### Presupuestos por alcance y causa (`ops/presupuestos.json`)

Valores iniciales de F0, a ojo y marcados como tales. `npm run fabrica -- --recalibrar` (fase F) los compara con lo medido y propone cambios; una persona los aplica en /revision-issues (hueco `recalibracion` y fecha `calibrado_el` de `ops/presupuestos.json`).

| Alcance | Diagnostica | ES / NO ES | Hipótesis en paralelo (máx.) | Jueces (mín.) | Rondas (máx.) | Minutos orientativos |
|---|---|---|---|---|---|---|
| **local** | agente_dominio | no | 1 | 1 | 2 | 15 |
| **modulo** | agente_dominio | sí | 1 | 1 | 2 | 30 |
| **transversal** | orquestador_con_diagnosticadores | sí | 3 | 2 | 2 | 60 |

Una causa puede sobrescribir al alcance (`por_causa`):

| Causa | Sobrescribe |
|---|---|
| **modelo-datos** | jueces_obligatorios: auditor-datos |
| **vigilante-falso** | jueces_obligatorios: revisor |
| **vigilante-hueco** | jueces_obligatorios: revisor |
| **entorno** | reproducir_en_ci: true |
<!-- flujo:catalogos:fin -->

La **regla de parada** para toda pieza nueva (catálogo, skill o agente) es
una: solo se crea si se usa al menos dos veces o la leen al menos dos
consumidores, no repite nada que ya esté en otra y tiene dueño y test. Lo que
no se usa se aparca (`arquitecto` y `rendimiento` están en
`.claude/agentes-aparcados/`).

## Proporcionalidad: cuánto esfuerzo, y cuándo parar (objetivo de las fases D y F)

**Esta sección mezcla lo que ya existe (fase D, #339) y lo que aún es objetivo.**
Existe el catálogo de presupuestos (`ops/presupuestos.json`, con test), el
comando que lo consulta (`npm run presupuesto -- <alcance> <causa>`), el paso de
triaje en `/orquestar` y el control `rondas-excedidas` de la ficha del fondo
(P03.1, P03.2, P07.4, P07.12). Sigue siendo objetivo que alguien lo cumpla sin
que se lo recuerden: `/orquestar` es un comando que la sesión lee y el
contador de rondas lo escribe la sesión.

El triaje fija el **alcance** (local, módulo o transversal; definiciones en
`ALCANCES_FALLO` de `scripts/lib/flujo.mjs`) y el tipo de causa antes de gastar
nada. De ahí salen quién diagnostica, las hipótesis, los jueces y el tope.

- **El presupuesto es un dato, no una opinión.** Los valores de arriba son
  iniciales y a ojo (`valores_iniciales` y `calibrado_el` de
  `ops/presupuestos.json`; `recalibracion` es el hueco para la fase F). La fase F
  los comparará cada semana con lo medido (rondas, tiempo, coste, si aguantó,
  por alcance y tipo de causa) y propondrá recalibrarlos. Una persona los
  aplicará. Una causa puede sobrescribir al alcance (p. ej. `modelo-datos` pide
  siempre `auditor-datos`); la celda alcance × causa la resuelve el comando.
- **El diagnóstico se parará por criterio, no por cansancio.** Se dejará de
  preguntar «¿por qué?» cuando se llega a algo que se puede cambiar con un
  mecanismo; cuando se llega a algo fuera de nuestro control (se pone una
  barrera de nuestro lado); o cuando se acaba la evidencia (se marca como
  hipótesis, con lo que habría que observar para confirmarla; nunca se inventa
  la cadena).
- **Las rondas del presupuesto como máximo** de constructor y juez (P07.4).
  Si el juez sigue bloqueando tras la última, no hay otra vuelta: decide una
  persona, con un issue de decisión. El conteo vive en el campo `rondas` de la
  ficha del fondo y la regla `rondas-excedidas` del workflow `fondos` falla la
  ficha que se pasa. Semidura: el contador lo escribe la sesión y el workflow
  no abre la decisión.
- **Si el diagnóstico se queda corto, el sistema lo corregirá solo** (P09.2).
  Un caso que vuelva dentro de la ventana de observación reabrirá su fondo y
  **subirá un nivel de alcance**: lo que se creyó local y vuelve se tratará
  como de módulo. Hoy solo se reabre el fondo, y solo al colgar el caso con
  `npm run issues`; ni sube el alcance ni hay ventana.
- **Un fondo, como mucho tres encargos**, y al menos uno preventivo y
  automático (P06.4, sin mecanismo todavía). Muchas acciones se diluyen y no
  se cierran.

## Estructura y texto

Lo que un programa tiene que leer, contar o comprobar va en campos de
vocabulario cerrado. El texto libre se reserva para lo que la taxonomía no
recoge: el porqué, el matiz, el mecanismo en una frase. **Si un mismo matiz se
repite, es que falta un valor en el vocabulario** y se añade; así la taxonomía
crece desde el uso y no desde el escritorio.

## Dónde interviene una persona

Solo donde ya lo dice `CLAUDE.md` («Qué se le pregunta a Pablo, y qué no»):
producción, datos de familias, permisos, secretos, gasto y publicar en nombre
de alguien. Este flujo añade una más: **la tercera ronda** de un encargo.
Preguntar algo de la otra lista también es un fallo, y se cuenta.

## Cómo se cambia este documento

1. Editar `ops/flujo.json` (nunca las tablas de aquí).
2. `npm run flujo -- --escribir`.
3. `npx vitest run ops/flujo.test.js`.

Una obligación que pasa de blanda a dura **cambia de `ejecutor` y de `veredicto`
en el mismo PR que construye el mecanismo**, con su `control`. El test no deja
declarar `dura` sin ejecutor del sistema y sin un test que exista. Si remite a una
norma, el cambio se hace en la norma (`ops/normas.json`) y aquí se regenera.

El vocabulario de ejecutor se importa de `scripts/lib/normas.mjs`; la escala de
veredicto y la escalera de durabilidad, de `scripts/lib/escalas.mjs`, que es el
único sitio donde se declaran (`ops/escalas.test.js` falla si aparecen escritas
en otro fichero). `ops/flujo.test.js` comprueba que cada obligación con `norma` no
copia nada de ella: si el registro cambia un veredicto, cambia aquí al regenerar.
