# El flujo de un fallo

De que algo falla a que se aprende de ello. Es la especificación del fondo
**#334**; esta pieza es su fase F0 (**#335**). Dice, para cada paso, qué
entra, qué sale, quién lo hace, qué skill usa, **qué obligación hay y qué la
hace cumplir de verdad**. Lo que no tiene un mecanismo detrás se dice blando,
con la fase que lo endurece. Nada aquí se da por hecho porque esté escrito.

**Dónde vive cada cosa.** El dato está en [`ops/flujo.json`](../../ops/flujo.json)
con vocabulario cerrado; las tablas de este documento **salen de él** y no se
editan a mano (`npm run flujo -- --escribir`). [`ops/flujo.test.js`](../../ops/flujo.test.js)
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
  paso valga. Cada obligación dice **quién la hace cumplir** (el `ejecutor`,
  con el vocabulario del registro de normas #296, que se importa de
  `scripts/lib/normas.mjs` y no se copia) y **cómo de dura es hoy**:
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
- Una obligación **enlazada con una norma** (`norma`) dice lo mismo que el
  registro en ejecutor y en dureza, y el test lo exige. Una obligación sin norma
  solo se declara dura con un `*.test.js` que nombre su fichero. **Límite
  conocido:** que un test nombre un fichero es un indicio, no una prueba de que
  lo vigile.

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
| Paso | Obligación | Lo hace cumplir | Hoy | Norma | Fase que la endurece |
|---|---|---|---|---|---|
| **Detectar** · semidura | | | | | |
| P01.1 | Un fallo de Lola o de la generación en producción avisa en minutos | proveedor · `.github/workflows/vigia-lola.yml` | semidura | — | #315 |
| P01.2 | Un fallo del resto de la app llega a alguien el mismo día | proveedor · `.github/workflows/agente-fallos.yml` | semidura | — | #315, #313 |
| P01.3 | Toda sesión sabe al abrirse qué issues esperan y quién lleva qué | guardia · `.claude/hooks/arranque.mjs` | semidura | — | — |
| **Registrar el caso** · blanda | | | | | |
| P02.1 | Antes de crear un issue se buscan los parecidos | guardia · `.claude/hooks/guardia.mjs` | semidura | `issues-con-buscar-antes` | #325, #337 |
| P02.2 | Las decisiones y pendientes que deja una sesión pasan a un issue | guardia · `.claude/hooks/pendientes.mjs` | semidura | `pendientes-a-issue` | #312 |
| P02.3 | Cada PR declara los casos que vio (línea Casos:), y cada uno es un caso de verdad | ci · `scripts/casos-pr.mjs` | semidura | `cuando-algo-falla` | #341, #185 |
| P02.4 | Nada sensible en un issue: el repo es público | nada · `CLAUDE.md` | blanda | `repo-publico-sin-detalle` | #300 |
| P02.5 | Al terminar, una sesión con fallos y sin casos registrados es frenada una vez | guardia · `.claude/hooks/pendientes.mjs` | semidura | — | — |
| **Triaje** · blanda | | | | | |
| P03.1 | Se fija el alcance y el tipo de causa antes de gastar esfuerzo | nada · `.claude/commands/orquestar.md` | blanda | — | #340 |
| P03.2 | El esfuerzo sale del presupuesto de su alcance, no de lo que decida la sesión | nada · `.claude/commands/orquestar.md` | blanda | `presupuesto-por-alcance` | #340 |
| **Diagnosticar** · blanda | | | | | |
| P04.1 | El caso acaba en una de las cuatro respuestas (nuevo, abierto, no aguantó, puntual) y cuelga de su fondo | script_propio · `scripts/lib/issues.mjs` | semidura | — | #341 |
| P04.2 | Se busca el fondo que ya existe antes de abrir uno | script_propio · `scripts/issues.mjs` | semidura | — | #337 |
| P04.3 | El diagnóstico llega a algo que se puede cambiar con un mecanismo y dice por qué nada lo detectó (causa de escape) | persona · `.claude/skills/causa-raiz/SKILL.md` | blanda | — | #341 |
| P04.4 | Lo que no se ha comprobado se marca como hipótesis y no se copia como hecho | persona · `.claude/skills/causa-raiz/SKILL.md` | blanda | — | #341 |
| P04.5 | Antes de evaluar código, se mira lo ya apuntado en issues y encargos | guardia · `.claude/hooks/buscar-antes.mjs` | semidura | — | — |
| **Fondo** · semidura | | | | | |
| P05.1 | Un fondo lleva arreglo general en el cuerpo y una causa de un vocabulario cerrado | script_propio · `.github/ISSUE_TEMPLATE/2-fondo.yml` | semidura | — | #341 |
| P05.2 | Sin diagnóstico (mecanismo y causa de escape) no hay encargos | ci · `scripts/fondos-pr.mjs` | semidura | — | #341 |
| P05.3 | Cada fondo lleva una ficha válida (bloque fondo, vocabularios cerrados) y sus controles corren en cada evento del issue | script_propio · `.github/workflows/fondos.yml` | semidura | `fondo-con-ficha-y-controles` | #341 |
| **Plan** · blanda | | | | | |
| P06.1 | El arreglo se parte en encargos colgados del fondo, uno por superficie | persona · `.claude/commands/revision-issues.md` | blanda | — | #337 |
| P06.2 | Cada encargo dice de qué depende, qué agente lo construye y qué juez lo juzga | script_propio · `scripts/lib/fondos.mjs` | semidura | `plan-tres-encargos-con-preventivo` | #341 |
| P06.3 | El arreglo usa el escalón más duradero posible de la escalera | persona · `.claude/skills/plan-de-arreglo/SKILL.md` | blanda | — | #341 |
| P06.4 | Un fondo lleva como mucho tres encargos, al menos uno preventivo y automático | script_propio · `scripts/lib/fondos.mjs` | semidura | `plan-tres-encargos-con-preventivo` | #337 |
| **Ejecutar** · blanda | | | | | |
| P07.1 | Un encargo es una rama con el número de su issue, y se ve quién lo lleva | script_propio · `scripts/tarea.mjs` | semidura | — | #337 |
| P07.2 | Un PR de una rama con número de issue lleva Closes de ese issue | guardia · `.claude/hooks/guardia.mjs` | semidura | `pr-al-dia-y-closes` | #337 |
| P07.3 | Quien construye no juzga | nada · `CLAUDE.md` | blanda | `quien-construye-no-juzga` | #341 |
| P07.4 | Como mucho las rondas del presupuesto de constructor y juez; después decide una persona | script_propio · `scripts/lib/fondos.mjs` | semidura | `rondas-tope-duro` | #340 |
| P07.5 | Todo agente sigue la plantilla: tipo, planos, método e informe común | ci · `.claude/PLANTILLA-AGENTE.md` | dura | — | — |
| P07.6 | main solo entra por PR con el check tests en verde | github_regla · `ops/DECISIONES.md` | semidura | `main-solo-por-pr-con-tests` | #330 |
| P07.7 | Nadie cambia las propias reglas (protecciones, permisos, guardia) con credenciales de sesión | nada · no escrita aún | blanda | — | #326 |
| P07.8 | staging exige el check tests (no exige PR) | github_regla · `ops/DECISIONES.md` | semidura | `staging-exige-tests` | #263 |
| P07.9 | Cada PR dice quién lo construyó (línea Agente:) | ci · `scripts/fondos-pr.mjs` | semidura | `pr-agente-y-closes-en-ci` | — |
| P07.10 | Un juez no puede escribir: ni Edit ni Write, contando las que da la memoria | ci · `CLAUDE.md` | dura | `jueces-sin-escritura` | — |
| P07.11 | Un PR de una rama con número de issue lleva Closes de ese issue, para cualquiera que lo abra | ci · `scripts/fondos-pr.mjs` | semidura | `pr-agente-y-closes-en-ci` | — |
| P07.12 | Cada ciclo de un fallo lleva al menos los jueces de su presupuesto, incluidos los que exige su causa | nada · `.claude/commands/orquestar.md` | blanda | — | #340 |
| **Verificar** · blanda | | | | | |
| P08.1 | El CI corre tests, lint y build en cada PR | ci · `.github/workflows/tests.yml` | dura | — | — |
| P08.2 | Un test de clase, no solo del caso, vigila el arreglo de un fondo | persona · `.claude/commands/orquestar.md` | blanda | — | #341 |
| P08.3 | Un test nuevo se ha visto fallar antes de creérselo | nada · `CLAUDE.md` | blanda | `test-visto-fallar` | #341 |
| P08.4 | Si el PR toca un dominio con skill, declara si actualizó su runbook | ci · `scripts/runbook-pr.mjs` | semidura | `linea-runbook` | #337 |
| P08.5 | Un fondo no pasa a en-observacion si el fichero de su verificación no está en origin/staging | script_propio · `scripts/lib/fondos.mjs` | semidura | `fondo-con-ficha-y-controles` | #341 |
| **Observar** · semidura | | | | | |
| P09.1 | Tras cerrar un fondo hay una ventana sin casos nuevos antes de darlo por eficaz | script_propio · `scripts/lib/fondos.mjs` | semidura | `fondo-con-ficha-y-controles` | #341 |
| P09.2 | Un caso que no aguantó reabre el fondo y sube un nivel de alcance | script_propio · `scripts/lib/fondos.mjs` | semidura | `fondo-con-ficha-y-controles` | #341 |
| **Cerrar** · semidura | | | | | |
| P10.1 | Un fondo no se cierra con encargos abiertos, sin el PR de su arreglo ni sin su etiqueta arreglo: | script_propio · `scripts/lib/issues.mjs` | semidura | — | #341 |
| P10.2 | Sin aprendizaje registrado, un fondo no se cierra | script_propio · `scripts/lib/fondos.mjs` | semidura | `fondo-con-ficha-y-controles` | #341 |
| **Aprender** · blanda | | | | | |
| P11.1 | Lo aprendido queda en un test, la guardia, una skill o un catálogo, nunca solo en la memoria | nada · `CLAUDE.md` | blanda | `lecciones-a-un-test` | #337 |
| P11.2 | Toda skill sigue la plantilla de su tipo: tipo, dueño, fecha de comprobación (caducada solo falla en el PR que la toca), secciones, tamaño, rutas y nada copiado | ci · `.claude/PLANTILLA-SKILL.md` | dura | — | — |
| P11.3 | Una skill se prueba con casos y sigue funcionando tras cambiarla | ci · `.claude/PLANTILLA-SKILL.md` | semidura | — | #341 |
| P11.4 | Una pieza nueva (skill, catálogo o agente) solo se crea si cumple la regla de parada | nada · `docs/ops/FLUJO.md` | blanda | — | #341 |
| **Medir** · blanda | | | | | |
| P12.1 | El nivel de cada plano sale de criterios comprobables (los de juicio llevan fecha) | ci · `scripts/lib/planos.mjs` | dura | — | — |
| P12.2 | Los planos miden si la protección resiste, no si el fichero existe | nada · no escrita aún | blanda | — | #321, #341 |
| P12.3 | Rondas, tiempo y coste de cada ciclo se miden por número de issue | persona · `scripts/lib/fabrica.mjs` | blanda | — | #340 |
| P12.4 | Los presupuestos se recalibran cada semana con lo medido | persona · `scripts/lib/fabrica.mjs` | blanda | `presupuestos-se-recalibran` | #340 |
| P12.6 | Cada bloqueo de la guardia, permiso pedido y skill cargada deja una línea en un registro local de eventos | guardia · `.claude/hooks/eventos.mjs` | semidura | `eventos-de-hooks-registrados` | #340 |
| P12.5 | Las normas del proceso que se incumplen se cuentan cada semana | script_propio · `scripts/lib/normas.mjs` | semidura | — | #341, #185 |

**53 obligaciones:** 5 duras · 31 semiduras · 17 blandas · 0 rotas. 25 están enlazadas con su norma del registro.
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

### La escalera de durabilidad

De más a menos duradero. Un fondo grave o repetido se cierra con un escalón 1 o 2; los demás, con el más alto posible y su porqué.

| Escalón | Qué es | Etiqueta `arreglo:` |
|---|---|---|
| 1 · bloqueo | Un permiso, un hook, una regla de GitHub o una restricción de la base impide hacerlo | `guardia` |
| 2 · test_ci | Un test o un eval en el CI falla si vuelve | `test` |
| 3 · script | Un script lo comprueba, si alguien lo lanza | `script` |
| 4 · skill | Un runbook lo explica a quien lo abre | `skill` |
| 5 · texto | Una línea en CLAUDE.md o en una regla | `regla` |

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

Una obligación que pasa de blanda a dura **cambia de `ejecutor` y de `dureza`
en el mismo PR que construye el mecanismo**, con su `test`. El test no deja
declarar `dura` sin ejecutor del sistema y sin un test que exista.

El vocabulario de ejecutor y de veredicto se importa de `scripts/lib/normas.mjs`,
y `ops/flujo.test.js` comprueba que cada obligación enlazada con una `norma` dice
lo mismo que `ops/normas.json`: si el registro cambia un veredicto, cambia aquí
en el mismo PR.
