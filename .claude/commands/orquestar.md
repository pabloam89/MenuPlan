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
varios en paralelo, mucho más. Escala el esfuerzo al encargo:

- **Trivial** (una línea, un texto, una duda): hazlo tú, sin agentes.
- **Normal** (un cambio en un dominio): un constructor y un juez.
- **Grande** (varios dominios, o refactor): el pipeline completo de la tabla.

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

Fichas completas en `.claude/agents/`; planos en `ops/PLANOS.md`. Hay dos
agentes aparcados (rendimiento y arquitecto) en `.claude/agentes-aparcados/`:
no se lanzan hasta que vuelvan a `.claude/agents/`.

## 3. Qué pipeline según la acción

`→` es secuencial; `+` es en paralelo. Entre corchetes, solo si aplica.

| Acción | Pipeline |
|---|---|
| Pantalla o componente nuevo | `diseno` → `qa` + `revisor` |
| Migrar una pantalla a tokens | `diseno` → `qa` |
| Assets (icono, ilustración, limpieza) | `diseno` → `qa` |
| Herramienta nueva o cambio en Lola | `lola` → `evaluador` + `revisor` → [`seguridad` si escribe datos] |
| Cambiar conocimiento, prompt o enrutador del bot | `lola` → `evaluador` |
| Cambio de esquema o dato nuevo | `datos` → `auditor-datos` + [`seguridad` si toca RLS] → *OK para aplicar* |
| Dato que vive en varias capas (base, catálogo, constantes) | `auditor-datos` (mapa) → `datos` → `auditor-datos` |
| Reducir el cableado de una tabla | `auditor-datos` (qué ficheros) → constructor del dominio → `revisor` |
| Recetas o catálogo (contenido) | sesión principal → `revisor` (validación del catálogo en los tests) |
| Función que cruza dominios | sesión principal (plan corto) → constructores por dominio → `revisor` + `qa` |
| Bug | `revisor` (diagnóstico y test que lo reproduce) → constructor del dominio → `revisor` |
| Algo va lento o cuesta de más | constructor del dominio (mide antes; `lola` si es el bot) → `revisor` (exige la medida de después) |
| Refactor de un monolito | sesión principal (plan por pasos) → constructor por pasos → `revisor` en cada paso |
| Endpoint nuevo en `api/` | constructor → `seguridad` + `revisor` |
| CI, permisos, hooks, ramas, secretos | `gobierno` |
| Desplegar a producción | `gobierno` → [`evaluador` si cambia el bot] → *OK de una persona* |
| Revisión periódica | `seguridad` + `auditor-datos` + `evaluador` + `gobierno` (planos), en paralelo |

Regla fija: **quien construye no juzga**. Cada constructor va seguido de al
menos un juez distinto.

## 4. El brief de cada agente

Un subagente no ve esta conversación. Cada encargo que le pases lleva:

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
7. Recordatorio: termina con el informe común de
   `.claude/PLANTILLA-AGENTE.md`, con `CASOS:` y `SKILLS:`.

## 5. Paralelo sin pisarse

- En paralelo solo trabajos **independientes** y con **ficheros distintos**.
  Dos constructores nunca editan el mismo fichero a la vez.
- Constructores en paralelo: cada uno en su worktree (pide aislamiento de
  worktree al lanzarlos). Los worktrees de agente salen de la rama por
  defecto, que es `staging`.
- Ficheros que tocan casi todos (`CLAUDE.md`, `package.json`,
  `.github/workflows/tests.yml`, `vite.config.js`, `src/App.jsx`): se tocan
  al final, por un solo agente o por ti.
- Los agentes no lanzan otros agentes: si un informe pide otro agente, lo
  decides y lo lanzas tú.

## 6. Juntar y cerrar

1. Lee el bloque `## Informe` de cada agente. `ESTADO: bloqueado` o un
   hallazgo bloqueante paran el pipeline hasta resolverlo. Pásale al
   `revisor` la línea `SKILLS:` del constructor: comprueba que abrió las que
   tocaban.
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
