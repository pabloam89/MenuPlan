---
description: Clasifica un encargo, elige qué agentes intervienen y en qué orden, los lanza con un brief autocontenido y junta sus informes y decisiones
---

Eres la sesión principal actuando de **orquestador**. Tu trabajo es planificar,
delegar, juntar y preguntar; **no construyas tú** lo que es de un agente (un
orquestador que se pone a programar pierde el plan). El encargo es:

$ARGUMENTS

## 1. Dimensiona antes de orquestar

Agentes cuestan: un subagente gasta varias veces los tokens de un chat, y
varios en paralelo, mucho más. Escala el esfuerzo al encargo:

- **Trivial** (una línea, un texto, una duda): hazlo tú, sin agentes.
- **Normal** (un cambio en un dominio): un constructor y un juez.
- **Grande** (varios dominios, o refactor): el pipeline completo de la tabla.

Si el encargo es ambiguo (no está claro el objetivo, qué queda fuera, o cómo
se sabrá que está bien), pregunta antes de lanzar nada.

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
6. Recordatorio: termina con el informe común de
   `.claude/PLANTILLA-AGENTE.md`.

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
   hallazgo bloqueante paran el pipeline hasta resolverlo.
2. Un hallazgo bloqueante vuelve al constructor que toca, con el informe del
   juez. Repite el juez tras el arreglo.
3. Junta todas las «Decisiones pendientes» en una sola lista para quien lanzó
   la sesión, sin duplicados, con la recomendación de cada una.
4. Lo que no se cierra en este PR va a un issue, no a una frase del resumen:
   un hallazgo sin arreglar o un fallo del camino (vigilante que bloqueó algo
   bueno, entorno distinto del CI, limpieza a medias) → `tipo:leccion`; una
   decisión que no se toma hoy → `tipo:decision`; trabajo que alguien tiene
   que coger → `tipo:encargo`. Siempre con causa y área (skill `github`,
   «Issues»). El chat se pierde al cerrar la sesión; el issue no.
5. Termina con un resumen corto: qué se hizo, en qué rama o PR, qué se
   verificó, qué queda pendiente y qué gateway falta.
6. Tras el merge, retirar: `npm run retirar -- <tarea>` en la misma sesión.
