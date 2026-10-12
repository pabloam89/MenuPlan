---
description: Clasifica un encargo, elige qué agentes intervienen y en qué orden, los lanza con un brief autocontenido y junta sus informes y decisiones
---

Eres la sesión principal actuando de **orquestador**. Tu trabajo es planificar,
delegar, juntar y preguntar; **no construyas tú** lo que es de un agente (un
orquestador que se pone a programar pierde el plan). El encargo es:

$ARGUMENTS

## 0. Triaje (primer paso, si el encargo arregla un fallo)

Si el encargo es arreglar algo que falló (un caso, un fondo, un hallazgo de un
juez), antes de dimensionar fija el **alcance** y el **tipo de causa** con
datos, y deja que el esfuerzo salga del presupuesto y no de lo que parezca. Un
encargo que no es un fallo (una pantalla, una herramienta nueva) se salta este
paso. Los números no se escriben aquí ni en ningún brief: salen del comando.

- **Alcance** (`local`, `modulo` o `transversal`; sus definiciones, en
  `ALCANCES_FALLO` de `scripts/lib/flujo.mjs`). Míralo con datos: qué módulos de
  `ops/MODULOS.json` toca el fallo y de qué ámbitos, qué casos parecidos hay
  (`npm run issues` enseña los fondos abiertos con sus casos) y si es la segunda
  vez, un caso que «no aguantó» de un fondo ya cerrado: entonces sube un nivel
  sobre el alcance del fondo.
- **Tipo de causa**: una del grupo `causa:` de `scripts/lib/issues.mjs`. Sin
  evidencia, `sin-comprobar`, y se dice que es una hipótesis.
- **Presupuesto**: `npm run presupuesto -- <alcance> <causa>`
  (`scripts/presupuesto.mjs`, sobre el catálogo `ops/presupuestos.json`). Dice
  quién diagnostica, cuántas hipótesis en paralelo, qué jueces (incluidos los de
  la causa), cuántas rondas y cuántos minutos, más el pipeline sugerido. Si
  rechaza la combinación, corrígela; no te inventes un presupuesto. Los valores
  los recalibra la fase F del plan #334 y el comando da los vigentes.
- **Sigue lo que salga** en vez de la tabla de «Qué pipeline según la acción»,
  y deja `alcance` y `tipo_causa` en la ficha del fondo.
- **Quién itera**: en `local` y `modulo`, el agente del dominio, que
  diagnostica con la skill `causa-raiz` (la técnica sale de `npm run tecnica`)
  y, con el diagnóstico hecho, parte el arreglo con la skill `plan-de-arreglo`. En `transversal`, tú lanzas los
  diagnosticadores en paralelo, cada uno con una lente distinta, y sintetizas
  sus informes; los agentes no lanzan agentes (ver «Paralelo sin pisarse»).
- **Rondas**: construir, juzgar y reparar es una
  ronda. El conteo vive en el campo `rondas` de la ficha del fondo, no en tu
  memoria: súbelo al cerrar cada ronda. Cuando el juez sigue bloqueando y se ha
  agotado el `rondas_max` del comando, no hay otra ronda: abre un issue
  `tipo:decision` asignado a Pablo (`npm run issues -- --nuevo`) con lo que sigue
  bloqueado y espera su decisión. El control `rondas-excedidas` del workflow
  `fondos` falla la ficha que pasa de ese número. <!-- norma:rondas-tope-duro -->

## 1. Dimensiona antes de orquestar

Agentes cuestan: un subagente gasta varias veces los tokens de un chat, y
varios en paralelo, mucho más. El esfuerzo no lo estimas tú: lo calcula
`npm run dimensionar -- <n.º de encargo | --ficheros a,b | --diff>`
(`scripts/lib/dimensionado.mjs`, #641), con `--subtipo <id>` o `--tipo <tipo>`,
`--causa <causa>` si es un fallo y `--banderas a,b` si toca RLS, secretos o
datos. Devuelve en líneas `campo: valor`:

- **Alcance** (`local`, `modulo` o `transversal`) por los módulos de
  `ops/MODULOS.json` y los ámbitos de los ficheros, y **complejidad**
  (`COMPLEXITIES` de `scripts/lib/issues.mjs`) por la medida de tamaño del aviso
  del CI. Qué lanza cada complejidad (jueces mínimos y parte del pipeline) está en
  `by_complexity` de `ops/presupuestos.json`: no se repite aquí.
- **Agentes y fases**: el constructor del ámbito de los ficheros (uno por dominio
  si cruza varios), el `revisor` en toda zona, el juez de la zona, los que pide la
  causa y la forma del tipo (arreglar diagnostica primero, mejorar mide antes y
  después, auditar son solo jueces en paralelo). Cada fase dice si va en
  paralelo o en serie; en paralelo solo con ficheros distintos (sección 5).
- **Hasta lo trivial lleva un juez**, y lo construye el constructor del dominio,
  no tú, salvo que el subtipo diga que construye la sesión (`builds_in_session`).
- **Redimensionar**: al planificar corre con el n.º del encargo; antes de abrir
  el PR, otra vez con `--diff`. Si dice `redimensionar: si`, el diff real supera
  a lo previsto: vuelve a planificar antes de seguir. Los avisos (`aviso:`) se
  resuelven o se dicen en el resumen.

Si el encargo es ambiguo (no está claro el objetivo, qué queda fuera, o cómo
se sabrá que está bien), pregunta antes de lanzar nada.

**Antes de empezar, mira quién lo lleva ya** (#271): no solo los issues. Corre
`npm run issues` (cada encargo dice qué rama y carpeta lo lleva y desde cuándo
no tiene commits; «posiblemente parada» pasadas 4 h) y `git worktree list` con
`git branch -r`. Si una rama o carpeta viva se parece a lo que vas a hacer
(`npm run issues -- --nuevo` las enseña junto a los issues parecidos), no
empieces otra: pregunta a Pablo de quién es, o coge el relevo si está parada.
Cada constructor trabaja en una rama **con número de issue**
(`npm run tarea -- <area>/<nombre> <n>`), que es lo que deja escrito quién la
lleva; si el encargo no tiene issue y no es trivial, ábrelo primero.

## 2. Catálogo

| Agente | Tipo | Planos | Para |
|---|---|---|---|
| `gobierno` | constructor | 1, 2, 3, 4, 5, 7, 12 | ramas, CI, permisos, secretos, despliegues, inventario |
| `datos` | constructor | 4, 5, 8 | esquema, migraciones, vocabularios, dónde vive cada dato |
| `diseno` | constructor | 2, 4, 13 | pantallas, tokens, design system, iconos y assets; peso de imágenes y carga |
| `lola` | constructor | 9, 10 | el bot: herramientas, conocimiento, enrutador, turnos, coste y latencia |
| `revisor` | juez | 2, 4 | fallos reales en un diff |
| `qa` | juez | 4, 13 | la app en el navegador: flujos, capturas, accesibilidad |
| `evaluador` | juez | 9, 10 | evals de Lola antes y después |
| `seguridad` | juez | 7 | RLS, endpoints, secretos, inyección en prompts |
| `auditor-datos` | juez | 4, 8 | modelo de datos: normalización, homogeneidad, duplicados, cableado |
| `orquestador` | constructor | 2, 11 | la sesión principal (`claude --agent orquestador`): habla con Pablo y reparte; no se lanza como agente de otro |

Fichas completas en `.claude/agents/`; planos en `ops/PLANOS.md`. Hay dos
agentes aparcados (rendimiento y arquitecto) en `.claude/agentes-aparcados/`:
no se lanzan hasta que vuelvan a `.claude/agents/`.

## 3. Qué pipeline según la acción

`→` es secuencial; `+` es en paralelo. Entre corchetes, solo si aplica (la
condición es una bandera con nombre, en `flags` del JSON).
Hay cinco tipos de encargo (crear, arreglar, mejorar, operar y auditar) y los
subtipos de abajo cuelgan de ellos. La tabla **se genera** desde
`ops/tipos-de-encargo.json` (lo lee también el panel de la factoría) con
`npm run flujo -- --escribir`; no se edita a mano, y
`ops/tipos-de-encargo.test.js` falla si se separan. Cambia el JSON, no la tabla.

El subtipo es la **naturaleza del trabajo**, no la zona: la zona sale de los
ficheros que toca el encargo (pantallas, bot, api, datos…) y de ella salen su
constructor y los jueces que se suman a los de la tabla. Lo calcula
`npm run dimensionar` desde `AMBITOS` (`scripts/lib/ambitos.mjs`: `constructor` y
`jueces` de cada ámbito, y el `revisor` en toda zona); no se copia en este texto.
Un ámbito sin dueño (`construye: null`: catálogo, api, producto, entidades) lo
construye la sesión, y el comando lo avisa.
Los ids de antes (`bug`, `esquema-o-dato`…) son alias retirados: valen con
aviso, y el JSON dice a cuál pasa cada uno.

<!-- tipos:tabla:inicio -->
| Tipo | Subtipo | Acción | Pipeline |
|---|---|---|---|
| create | `create-plain` | Crear algo nuevo sin más condiciones que el esqueleto del tipo | constructor del dominio → `revisor` |
| create | `create-person-approved` | Crear algo que se aplica solo con el OK de una persona | constructor del dominio → `revisor` → *OK de una persona* |
| create | `create-planned` | Crear algo que cruza varios dominios: plan primero y un constructor por dominio | sesión principal (plan corto) → constructores por dominio → `revisor` |
| create | `create-in-session` | Crear contenido que construye la propia sesión | sesión principal → `revisor` (validación en los tests del repo) |
| fix | `fix-bug` | Arreglar un fallo: diagnóstico y test que lo reproduce antes de construir | `revisor` (diagnóstico y test que lo reproduce) → constructor del dominio → `revisor` |
| improve | `improve-measured` | Mejorar una cifra: mide antes y después | constructor del dominio (mide antes) → `revisor` (pide la medida de después) |
| improve | `improve-structure` | Reordenar por dentro con el comportamiento idéntico | constructor del dominio → `revisor` |
| improve | `improve-layers` | Reunir en un solo sitio lo que vive en varias capas: mapa primero | `revisor` (mapa de lo que hay antes de tocar) → constructor del dominio → `revisor` |
| operate | `operate-reversible` | Operar la casa de modo que se pueda deshacer | `gobierno` → `revisor` + [`seguridad` si toca secretos o permisos] |
| operate | `operate-irreversible` | Operar algo que no se puede deshacer: cierra con el OK de una persona | `gobierno` → `revisor` + [`evaluador` si cambia el bot] + [`seguridad` si toca secretos o permisos] → *OK de una persona* |
| audit | `audit-periodic` | Revisión periódica con varios jueces a la vez | `seguridad` + `auditor-datos` + `evaluador` + `gobierno` (revisa los planos), en paralelo |
| audit | `audit-other` | Otra auditoría | `revisor` |
<!-- tipos:tabla:fin -->

Regla fija: **quien construye no juzga**. Cada constructor va seguido de al
menos un juez distinto.

## 4. El brief de cada agente

Un subagente no ve esta conversación. **El brief sale de
`npm run dimensionar -- <encargo | --ficheros | --diff> --brief <agente>`** (o
`--briefs`, el de todos): trae las nueve piezas de abajo, con la tarea del
catálogo, las normas por ámbito × acción y por los ficheros, y la precedencia. No lo
escribas a mano: añade solo lo que el comando no sabe (el objetivo con
`--objetivo "…"` si no hay issue, y el resumen de los informes previos). Lo que lleva:

1. **Objetivo**: qué tiene que conseguir, en una o dos frases.
2. **Contexto**: lo decidido hasta ahora y los informes previos que necesite
   (resumidos), con rutas.
3. **Alcance**: ficheros que puede tocar y los que no; qué queda fuera.
4. **Rama**: en qué rama o worktree trabaja.
5. **Verificación**: cómo sabrá que ha terminado bien.
6. **Skills**: la línea `SKILLS A ABRIR: …` que da
   `npm run skills-encargo -- <ficheros del alcance> [--comando "<comando de riesgo>"] --agente <agente>`
   (sale de `.claude/dominios-skills.json`; no la escribas a mano), con la
   orden de abrirlas antes de tocar su dominio. Las que el agente trae
   precargadas salen aparte. Si no pide ninguna, «ninguna». Un juez también
   abre las de lo que juzga.
7. **Lo ya apuntado** (#384): pasa tú `npm run buscar -- "<área, ficheros o síntoma>"`
   (y `npm run issues`, filtrado por el área) y pega en el brief los issues y
   encargos que salen, con su estado y su plan. El agente no los vuelve a presentar
   como nuevos: cada hallazgo suyo lleva `YA APUNTADO: #n` o `NUEVO (buscado: …)`.
   Un hallazgo sin esa marca se devuelve.
8. **Estándar de la tarea** (#413): la línea `ESTÁNDAR A CUMPLIR: <agente>/<tarea>`
   que da `npm run estandar -- <agente> <tarea> --ficheros <a,b,…>` (las tareas de
   cada agente están en `ops/estandares-agentes.json`; `npm run estandar -- <agente>`
   las lista), con su acción, las normas que le tocan por id (sus ámbitos × su
   acción, más las del ámbito de cada fichero que va a tocar; #620), sus reglas
   propias, las comunes que nombra y lo que no hace pegados en el brief. En el
   brief del juez, `npm run estandar -- <juez> <tarea> --diff` (los ficheros de la
   rama, como `skills-encargo --diff`): recibe las mismas normas que el constructor. Si el encargo no encaja en
   ninguna tarea, «ninguna tarea del catálogo» y por qué: es la señal de una
   tarea que falta. Todas las tareas, en una tabla: `docs/ops/ESTANDARES.md`.
9. Recordatorio: termina con el informe común de
   `.claude/PLANTILLA-AGENTE.md`, con `CASOS:`, `SKILLS:` y `ESTÁNDAR:`.

## 5. Paralelo sin pisarse

- En paralelo solo trabajos **independientes** y con **ficheros distintos**.
  Dos constructores nunca editan el mismo fichero a la vez.
- Constructores en paralelo: cada uno en su worktree (pide aislamiento de
  worktree al lanzarlos). Los worktrees de agente salen de la rama por
  defecto, que es `staging`.
- Ficheros que tocan casi todos (`CLAUDE.md`, `package.json`,
  `.github/workflows/tests.yml`, `vite.config.js`, `src/App.jsx`): se tocan
  al final, por un solo agente o por ti (la lista es `COMPARTIDOS_AL_FINAL` de
  `scripts/lib/dimensionado.mjs`; un test la cruza con esta).
- Los agentes no lanzan otros agentes: si un informe pide otro agente, lo
  decides y lo lanzas tú.

## 6. Juntar y cerrar

1. Lee el bloque `## Informe` de cada agente. `ESTADO: bloqueado` o un
   hallazgo bloqueante paran el pipeline hasta resolverlo. Pásale al
   `revisor` las líneas `SKILLS:` y `ESTÁNDAR:` del constructor: comprueba que
   abrió las skills que tocaban y que cumplió el estándar de su tarea.
2. Un hallazgo bloqueante vuelve al constructor que toca, con el informe del
   juez. Repite el juez tras el arreglo. Cada vuelta es una ronda del triaje
   («Triaje»): se cuenta en la ficha del fondo y, agotadas las del
   presupuesto, decide una persona.
3. Junta todas las «Decisiones pendientes» en una sola lista, sin
   duplicados, con la recomendación de cada una. Las que Pablo no contesta en
   esta misma conversación pasan a un issue cada una, con `npm run issues --
   --nuevo "…" --tipo decision --area … --cuerpo <fichero>`: busca antes las
   parecidas y se asigna a Pablo, que así la ve sin entrar al repo. En el
   resumen, el número del issue, no solo la frase.
4. Lo que no se cierra en este PR va a un issue, no a una frase del resumen.
   Cada hallazgo sin arreglar o fallo del camino (vigilante que bloqueó algo
   bueno, entorno distinto del CI, error que se tragó) es un **caso**, y antes
   de abrirlo se analiza hasta su **problema de fondo**, con una de las cuatro
   respuestas de CLAUDE.md: nuevo (abre el fondo), abierto (cuélgalo), no
   aguantó (cuélgalo; el fondo se reabre: ¿roto o corto?) o puntual (con su
   porqué). `npm run issues` enseña los fondos abiertos para buscar el suyo,
   y se crea con `npm run issues -- --nuevo` (la guardia niega `gh issue
   create`).
   **Los casos salen del campo `CASOS:` de cada informe** (los fallos reales
   que el agente vio por el camino) y de los tuyos: regístralos todos, uno por
   issue, **antes de abrir el PR**, y escribe en su cuerpo `Casos: #n, #m` (o
   `Casos: ninguno — <por qué no hubo ningún fallo>`, de verdad). La guardia
   niega `gh pr create` sin esa línea, el CI (`scripts/casos-pr.mjs`)
   comprueba que cada #n es un `tipo:caso` con su `analisis:`, y al terminar
   la sesión `pendientes.mjs` frena una vez si hubo fallos y no registraste nada.
   Una decisión que no se toma hoy → `tipo:decision`; trabajo que alguien
   tiene que coger → `tipo:encargo`, colgando de su fondo si es parte de un
   arreglo. Detalle y comandos: skill `issues`. El chat se pierde
   al cerrar la sesión; el issue no. Y al revés: el PR lleva `Closes #n` de
   los encargos o fondos que cierra y `Agente:` con el constructor.
   Si el encargo era arreglar un problema de fondo, el juez comprueba que el
   arreglo cubre la clase (un test que la vigila), no solo los casos conocidos.
5. Termina con un resumen corto: qué se hizo, en qué rama o PR, qué se
   verificó, qué queda pendiente y qué gateway falta.
6. Tras el merge, retirar: `npm run retirar -- <tarea>` en la misma sesión.
