# El flujo de una incidencia

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

## El invariante

> Todo fallo detectado recorre el mismo camino, y cada paso lo impone un
> mecanismo y no una frase. **Detectar → registrar el caso → triaje →
> diagnosticar → fondo → plan → ejecutar → verificar → observar → cerrar →
> aprender → medir.** El esfuerzo de cada ciclo es proporcional a su alcance, y
> los presupuestos se recalibran con datos.

Un fondo (`tipo:fondo`) es el problema de fondo; cuelgan de él los casos
(evidencia) y los encargos (el arreglo). Las cuatro respuestas del análisis de
un caso (nuevo, abierto, no aguantó, puntual) y su definición están en
`scripts/lib/issues.mjs`; el principio, en `CLAUDE.md` («Cuando algo falla»).

## Cómo se lee

- Un **paso** tiene **obligaciones**: lo que tiene que ser verdad para que el
  paso valga. Cada obligación dice **quién la hace cumplir** (el `ejecutor`,
  con el mismo vocabulario que el registro de normas #296) y **cómo de dura es
  hoy**:
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

## Los doce pasos

<!-- flujo:fichas:inicio -->
| # | Paso | Entra | Sale | Quién | Skill | Se mide |
|---|---|---|---|---|---|---|
| 1 | Detectar | Un fallo en producción, en el CI o en el trabajo de una sesión | Una señal que alguien ve: un aviso, un check rojo, un hallazgo de un juez | automatico, juez, persona | (—) | ○ fallos detectados por fuente (vigía, agente de fallos, jueces) (#340) |
| 2 | Registrar el caso | Una señal de fallo | Un issue tipo:caso con su área, buscado antes entre los parecidos | agente_dominio, orquestador, automatico | `github` | ✓ casos abiertos por área y tipo; ○ PR con casos frente a PR con «ninguno» (#312) |
| 3 | Triaje | Un caso registrado | Alcance (local, módulo o transversal) y tipo de causa fijados | orquestador, agente_dominio | (#338) | ○ casos por alcance (#337) |
| 4 | Diagnosticar | Un caso con alcance y tipo | Mecanismo, causa de escape y clase del fallo; o una hipótesis marcada como tal | agente_dominio, juez, orquestador | (#338) | ✓ fondos y casos por causa; ✓ casos puntuales, para ver si eran un patrón |
| 5 | Fondo | Un diagnóstico | Un issue tipo:fondo con su arreglo general, su causa y cómo se probará | agente_dominio, orquestador | (#338) | ✓ fondos ordenados por casos (dónde duele) |
| 6 | Plan | Un fondo diagnosticado | Encargos colgados del fondo, con dependencias, agente, juez y verificación | orquestador, agente_dominio | (#338) | ✓ encargos hechos frente a encargos por fondo |
| 7 | Ejecutar | Un encargo colgado de su fondo, con su issue | Un PR con su issue, su agente y su juez | agente_dominio, juez, orquestador | (—) | ○ rondas, tiempo y coste por encargo (#340) |
| 8 | Verificar | El PR de un encargo | CI en verde, juez conforme y un test que cubre la clase | automatico, juez | (—) | ○ fondos cerrados con test de clase (#341) |
| 9 | Observar | Un fondo con su arreglo fusionado | Una ventana sin casos nuevos, o el fondo reabierto | automatico, persona | (—) | ✓ fondos que no aguantaron, rotos o cortos |
| 10 | Cerrar | Un fondo cuya ventana de observación pasó limpia | Un fondo cerrado con el escalón en que quedó el arreglo | automatico, persona | (—) | ✓ días hasta cerrar un fondo, por causa y por agente |
| 11 | Aprender | Un fondo cerrado como eficaz | La lección en una skill, un catálogo, la guardia o un test | agente_dominio, juez | (#338) | ○ fondos cerrados con aprendizaje registrado (#337) |
| 12 | Medir | Los datos de todos los pasos anteriores | Un informe semanal de cumplimiento y de presupuesto frente a lo real | automatico, persona | (—) | ○ presupuestado frente a real, por alcance y causa (#340) |
<!-- flujo:fichas:fin -->

✓ = se mide hoy · ○ = lo trae la fase indicada.

## Obligaciones y qué las hace cumplir

<!-- flujo:pasos:inicio -->
| Paso | Obligación | Lo hace cumplir | Hoy | Fase que la endurece |
|---|---|---|---|---|
| **Detectar** · semidura | | | | |
| P01.1 | Un fallo de Lola o de la generación en producción avisa en minutos | proveedor · `.github/workflows/vigia-lola.yml` | semidura | #315 |
| P01.2 | Un fallo del resto de la app llega a alguien el mismo día | proveedor · `.github/workflows/agente-fallos.yml` | semidura | #315, #313 |
| P01.3 | Toda sesión sabe al abrirse qué issues esperan y quién lleva qué | guardia · `.claude/hooks/arranque.mjs` | semidura | — |
| **Registrar el caso** · blanda | | | | |
| P02.1 | Antes de crear un issue se buscan los parecidos | guardia · `.claude/hooks/guardia.mjs` | semidura | #325, #337 |
| P02.2 | Todo fallo del camino queda como caso y no solo en el chat | guardia · `.claude/hooks/pendientes.mjs` | semidura | #312 |
| P02.3 | Cada PR declara los casos que vio (línea Casos:) | nada · `.claude/commands/orquestar.md` | blanda | #312 |
| P02.4 | Nada sensible en un issue: el repo es público | nada · `CLAUDE.md` | blanda | #300 |
| **Triaje** · blanda | | | | |
| P03.1 | Se fija el alcance y el tipo de causa antes de gastar esfuerzo | nada · `.claude/commands/orquestar.md` | blanda | #339 |
| P03.2 | El esfuerzo sale del presupuesto de su alcance, no de lo que decida la sesión | nada · `ops/flujo.json` | blanda | #339 |
| **Diagnosticar** · blanda | | | | |
| P04.1 | El caso acaba en una de las cuatro respuestas (nuevo, abierto, no aguantó, puntual) y cuelga de su fondo | script_propio · `scripts/lib/issues.mjs` | semidura | #337 |
| P04.2 | Se busca el fondo que ya existe antes de abrir uno | script_propio · `scripts/issues.mjs` | semidura | #337 |
| P04.3 | El diagnóstico llega a algo que se puede cambiar con un mecanismo y dice por qué nada lo detectó (causa de escape) | nada · `docs/ops/FLUJO.md` | blanda | #338, #337 |
| P04.4 | Lo que no se ha comprobado se marca como hipótesis y no se copia como hecho | nada · `CLAUDE.md` | blanda | #338 |
| P04.5 | Antes de evaluar código, se mira lo ya apuntado en issues y encargos | nada · `.claude/hooks/avisos.mjs` | blanda | #320 |
| **Fondo** · blanda | | | | |
| P05.1 | Un fondo lleva arreglo general en el cuerpo y una causa de un vocabulario cerrado | script_propio · `.github/ISSUE_TEMPLATE/2-fondo.yml` | semidura | #337 |
| P05.2 | Sin diagnóstico (mecanismo y causa de escape) no hay encargos | nada · `scripts/lib/issues.mjs` | blanda | #337 |
| **Plan** · blanda | | | | |
| P06.1 | El arreglo se parte en encargos colgados del fondo, uno por superficie | persona · `.claude/commands/revision-issues.md` | blanda | #337 |
| P06.2 | Cada encargo dice de qué depende, qué agente lo construye y qué juez lo juzga | nada · `.github/ISSUE_TEMPLATE/3-encargo.yml` | blanda | #337, #338 |
| P06.3 | El arreglo usa el escalón más duradero posible de la escalera | nada · `docs/ops/FLUJO.md` | blanda | #338 |
| P06.4 | Un fondo lleva como mucho tres encargos, al menos uno preventivo y automático | nada · `docs/ops/FLUJO.md` | blanda | #337 |
| **Ejecutar** · blanda | | | | |
| P07.1 | Un encargo es una rama con el número de su issue, y se ve quién lo lleva | script_propio · `scripts/tarea.mjs` | semidura | #337 |
| P07.2 | Un PR a staging lleva Closes del issue y la línea Agente: | guardia · `.claude/hooks/guardia.mjs` | semidura | #337 |
| P07.3 | Quien construye no juzga | persona · `.claude/agents/revisor.md` | blanda | #339 |
| P07.4 | Como mucho dos rondas constructor y juez; a la tercera decide una persona | nada · `.claude/commands/orquestar.md` | blanda | #339 |
| P07.5 | Todo agente sigue la plantilla: tipo, planos, método e informe común | ci · `.claude/PLANTILLA-AGENTE.md` | dura | — |
| P07.6 | Nada llega a main ni a staging sin PR y tests en verde | github_regla · `ops/planos.json` | dura | — |
| P07.7 | Nadie cambia las propias reglas (protecciones, permisos, guardia) con credenciales de sesión | nada · `ops/DECISIONES.md` | blanda | #326 |
| **Verificar** · blanda | | | | |
| P08.1 | Tests, lint y build pasan antes de fusionar | ci · `.github/workflows/tests.yml` | dura | — |
| P08.2 | Un test de clase, no solo del caso, vigila el arreglo de un fondo | persona · `.claude/agents/revisor.md` | blanda | #337 |
| P08.3 | Un test nuevo se ha visto fallar antes de creérselo | nada · `CLAUDE.md` | blanda | #341 |
| P08.4 | Si el PR toca un dominio con skill, declara si actualizó su runbook | ci · `scripts/runbook-pr.mjs` | semidura | #337 |
| **Observar** · blanda | | | | |
| P09.1 | Tras cerrar un fondo hay una ventana sin casos nuevos antes de darlo por eficaz | nada · `docs/ops/FLUJO.md` | blanda | #337 |
| P09.2 | Un caso que no aguantó reabre el fondo y sube un nivel de alcance | script_propio · `scripts/lib/issues.mjs` | semidura | #337 |
| **Cerrar** · semidura | | | | |
| P10.1 | Un fondo no se cierra con encargos abiertos, sin el PR de su arreglo ni sin su etiqueta arreglo: | script_propio · `scripts/lib/issues.mjs` | semidura | #337 |
| **Aprender** · blanda | | | | |
| P11.1 | Lo aprendido queda en un test, la guardia, una skill o un catálogo, nunca solo en la memoria | nada · `CLAUDE.md` | blanda | #337, #338 |
| P11.2 | Toda skill de herramienta sigue la plantilla | ci · `.claude/PLANTILLA-SKILL.md` | dura | — |
| P11.3 | Una skill se prueba con casos y sigue funcionando tras cambiarla | nada · `.claude/skills.test.js` | blanda | #336, #341 |
| P11.4 | Una pieza nueva (skill, catálogo o agente) solo se crea si cumple la regla de parada | nada · `docs/ops/FLUJO.md` | blanda | #341 |
| **Medir** · blanda | | | | |
| P12.1 | El nivel de cada plano sale de criterios comprobables, no a ojo | ci · `scripts/lib/planos.mjs` | dura | — |
| P12.2 | Los planos miden si la protección resiste, no si el fichero existe | nada · `ops/planos.json` | blanda | #321, #341 |
| P12.3 | Rondas, tiempo y coste de cada ciclo se miden por número de issue | nada · `docs/ops/FLUJO.md` | blanda | #340 |
| P12.4 | Los presupuestos se recalibran cada semana con lo medido | nada · `docs/ops/FLUJO.md` | blanda | #340 |
| P12.5 | Las normas del proceso que se incumplen se cuentan | nada · `ops/PLANOS.md` | blanda | #296, #185 |

**43 obligaciones:** 5 duras · 13 semiduras · 25 blandas · 0 rotas.
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
  `npm run issues`. Ningún workflow reacciona a un issue abierto, cerrado o
  colgado desde otra vía. La fase B (#337) **mueve** esos controles a los
  eventos de GitHub y añade los campos nuevos.
- **A y la línea Casos: corren a la vez, no después.** El registro de normas
  (#296) y la línea `Casos:` del PR (#312) ya tienen sesión y rama propias en
  curso. No esperan a este documento: cuando entren, las obligaciones P02.3 y
  P12.5 dejarán de ser blandas y el campo `norma` de cada obligación se
  rellenará con su id.
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
| **Catálogos** | ¿Qué existe? | Registros estructurados, cada hecho una sola vez: vocabularios, mapas, planos, normas, mecanismos, técnicas y presupuestos | `scripts/lib/issues.mjs`, `ops/MODULOS.json`, `ops/planos.json`, `ops/flujo.json` |
| **Skills** | ¿Cómo se hace? | Método, técnicas, referencias, scripts y plantillas. De herramienta (cómo se opera un servicio) y de oficio (cómo se piensa un tipo de problema) | `.claude/skills`, `.claude/PLANTILLA-SKILL.md` |
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

| Tipo | Qué guarda | Estado | Fase |
|---|---|---|---|
| **herramienta** | Cómo se opera un servicio (supabase, vercel, telegram…) | existe | — |
| **oficio** | Cómo se piensa un tipo de problema (causa raíz, plan de arreglo, priorizar) | en_plan | #338 |
| **dominio** | El conocimiento del negocio (nutrición, alergias, cómo comen las familias) | reservado | #336 |
| **estandar** | Cómo deben quedar las cosas para ser consistentes (voz de Lola, design system) | reservado | #336 |
| **receta_cambio** | Los pasos de una acción que se repite (añadir una herramienta a Lola, una pantalla, recetas) | reservado | #336 |
| **rubrica_juez** | Qué mira un juez y cómo puntúa | reservado | #336 |
| **investigacion** | Cómo buscar fuera y destilar (radar de mercado, investigación técnica) | reservado | #336 |
| **meta** | Cómo crear, probar y podar las propias piezas | reservado | #336 |

### Presupuesto inicial por alcance

Valores iniciales de F0, a ojo y marcados como tales. La fase D los convierte en el catálogo que lee /orquestar y la fase F los recalibra cada semana con lo medido.

| Alcance | Diagnostica | Hipótesis en paralelo (máx.) | Jueces (mín.) | Rondas (máx.) | Minutos orientativos |
|---|---|---|---|---|---|
| **local** | agente_dominio | 1 | 1 | 2 | 15 |
| **modulo** | agente_dominio | 1 | 1 | 2 | 30 |
| **transversal** | orquestador_con_diagnosticadores | 3 | 2 | 2 | 60 |
<!-- flujo:catalogos:fin -->

La **regla de parada** para toda pieza nueva (catálogo, skill o agente) es
una: solo se crea si se usa al menos dos veces o la leen al menos dos
consumidores, no repite nada que ya esté en otra y tiene dueño y test. Lo que
no se usa se aparca (`arquitecto` y `rendimiento` están en
`.claude/agentes-aparcados/`).

## Proporcionalidad: cuánto esfuerzo, y cuándo parar

El triaje fija el **alcance** (local, módulo o transversal; definiciones en
`ops/flujo.json`) y el tipo de causa antes de gastar nada. De ahí salen la
técnica, los jueces y el tope.

- **El presupuesto es un dato, no una opinión.** Los valores de arriba son
  iniciales y a ojo; la fase F los compara cada semana con lo medido (rondas,
  tiempo, coste, si aguantó, por alcance y tipo de causa) y propone
  recalibrarlos. Una persona los aplica.
- **El diagnóstico se para por criterio, no por cansancio.** Se deja de
  preguntar «¿por qué?» cuando se llega a algo que se puede cambiar con un
  mecanismo; cuando se llega a algo fuera de nuestro control (se pone una
  barrera de nuestro lado); o cuando se acaba la evidencia (se marca como
  hipótesis, con lo que habría que observar para confirmarla; nunca se inventa
  la cadena).
- **Dos rondas como máximo** de constructor y juez. Si el juez sigue
  bloqueando tras la segunda, no hay tercera vuelta: decide una persona, con un
  issue de decisión.
- **Si el diagnóstico se queda corto, el sistema lo corrige solo.** Un caso
  que vuelve dentro de la ventana de observación reabre su fondo y **sube un
  nivel de alcance**: lo que se creyó local y vuelve se trata como de módulo.
- **Un fondo, como mucho tres encargos**, y al menos uno preventivo y
  automático. Muchas acciones se diluyen y no se cierran.

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

Al entrar el registro de normas (#296), `ops/flujo.test.js` comprueba solo que
los vocabularios de ejecutor y de veredicto coinciden con los suyos, y que
cada `norma` citada existe en `ops/normas.json`.
