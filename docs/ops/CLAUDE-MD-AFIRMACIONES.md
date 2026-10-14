# CLAUDE.md, afirmación por afirmación

Primer entregable de #690 (programa #652), según los «Acuerdos con Pablo (14 oct 2026)»
del issue: cada afirmación de `CLAUDE.md` es un ejemplar de una entidad y va al
registro de esa entidad; lo que ya vive en otro sitio se borra. **Este documento no
mueve nada**: es la tabla que juzga un agente distinto (`revisor`) antes de tocar
`CLAUDE.md`, las normas, los tests o la guardia.

- Fuente medida: `CLAUDE.md` de `origin/staging` el 14 oct 2026 (321 líneas, 19.987
  caracteres). Las líneas citadas son las de esa versión.
- Clases de entidad: las de `ops/entidades.json` (`norm`, `principle`, `standard`,
  `agent`, `skill`, `hook`, `resource`, `service`, `environment`, `repo`, `project`,
  `team-member`, `decision`, `mechanism`, `data-source`, `vocabulary`,
  `assignment-type`), más dos que
  no tienen entidad propia: **regla por carpeta** (`.claude/rules/`) y **pregunta a
  Pablo** (la lista «Qué se le pregunta», que el acuerdo pasa a dato del proyecto).
- Cada ruta de «ya vive en» se ha comprobado con `git grep` en la rama.

## Veredictos (vocabulario cerrado)

| Veredicto | Qué quiere decir |
|---|---|
| `borrar` | La afirmación ya vive en el destino (ruta comprobada); en `CLAUDE.md` es copia. |
| `mover` | Su registro existe (o lo crea el acuerdo), pero hoy no la tiene: se lleva allí y se borra de `CLAUDE.md`. |
| `indice` | Se queda en `CLAUDE.md` como puntero de una línea a su registro. |
| `pendiente` | Choca con otro registro o con un test, o la clase no está clara: decisión para Pablo o para la ronda siguiente. No se resuelve aquí. |

## Cifras

| Veredicto | Afirmaciones | Destino |
|---|---|---|
| `borrar` | 74 | ya viven en `ops/normas.json` (32), en una skill o su plantilla (15), en una regla por carpeta (9), en otro registro, hook o agente (18) |
| `mover` | 25 | registro de preguntas del proyecto (16), normas nuevas (4), ficha del proyecto (2), norma de HoMenu (1), un principio (1), `ops/mecanismos.json` (1) |
| `indice` | 9 | se quedan en `CLAUDE.md` como punteros |
| `pendiente` | 9 | 6 atadas a un test que fija texto en `CLAUDE.md` (D3), 1 por choque de normas (D1), 1 por choque de registros (D2), 1 por el campo de proyecto (D4) |
| **Total** | **117** | |

| | Antes | Después (estimado) |
|---|---|---|
| Líneas de `CLAUDE.md` | 321 | ~85 con las `pendiente` dentro; ~60 cuando se resuelva D3 |
| Caracteres | 19.987 | ~6.500 con las `pendiente` dentro; ~4.800 cuando se resuelva D3 |

La estimación cuenta lo que queda: los 9 punteros (con la sección de voz que fija
`.claude/voz.test.js`, ≤12 líneas, y el párrafo de «Pensar en datos»), el minigrafo
generado de «dónde vive cada cosa» (~10 líneas), la lista de preguntas generada del
registro del proyecto (~20 líneas) y, en la primera cifra, las 9 `pendiente` tal como
están (~25 líneas). Desglose de `borrar` por el primer registro que nombra su columna «Destino».

## Tabla

Columnas: n.º, líneas de `CLAUDE.md`, la afirmación en corto, la clase de entidad de
la que es ejemplar, el destino y el veredicto.

### Cabecera y «Qué es» (L1-13)

| # | L | Afirmación | Entidad | Destino | Veredicto |
|---|---|---|---|---|---|
| 1 | 3-4 | Lo de cada zona salta solo al tocarla (`.claude/rules/`) | regla por carpeta | `CLAUDE.md` (índice) | `indice` |
| 2 | 4 | El detalle de cada dominio, en `specs/INDEX.md` | data-source (HoMenu) | `CLAUDE.md`, parte HoMenu | `indice` |
| 3 | 4-5 | Si una regla choca con un hook, el hook manda | principle | `ops/principios/principios/highest-mechanism.json` (no lo dice hoy) | `mover` |
| 4 | 9 | HoMenu / MenuPlan: menús semanales para familias | project | ficha del proyecto (`ops/entidades.json` → `projects[homenu]` solo tiene el nombre) | `mover` |
| 5 | 9-11 | Lola, bot de mensajería (Telegram hoy, WhatsApp después), es el producto hacia el que vamos | project | ya vive en `specs/plan-bot-mensajeria.md` | `borrar` |
| 6 | 11-12 | La app React + Vite, PWA con funciones en `api/`, es el respaldo | project | ficha del proyecto (pila y papel de la app) | `mover` |
| 7 | 12-13 | Datos en Supabase; catálogo en JSON en git (`src/data/`) | data-source | ya vive en `src/data/model.js` (`TABLAS`) y `docs/datos/PRINCIPIOS.md` | `borrar` |

### «Equipo» (L17-20)

| # | L | Afirmación | Entidad | Destino | Veredicto |
|---|---|---|---|---|---|
| 8 | 17-19 | Pablo y Álvaro (con sus cuentas de GitHub) escriben; Manu, socio, sin acceso a propósito | team-member | `ops/proyectos/homenu/entidades.json` (el acuerdo; hoy la entidad es `without_registry` y su `source_of_truth` es `CLAUDE.md`) | `pendiente` (D4) |
| 9 | 18 | A menudo con varias sesiones a la vez | principle | ya vive en `ops/principios/principios/one-change-one-intent.json` | `borrar` |
| 10 | 20 | Pablo no es informático: en llano, recomendación primero | skill | ya vive en `.claude/skills/estilo-de-respuesta/SKILL.md` | `borrar` |

### «Dónde vive cada cosa» (L22-38): pasa a minigrafo generado del registro (acuerdo)

| # | L | Afirmación | Entidad | Destino | Veredicto |
|---|---|---|---|---|---|
| 11 | 26 | Repo `pabloam89/MenuPlan`, público, el único de verdad | repo | ya vive en `ops/entidades.json` (`projects[homenu].repos`) y `.claude/skills/github/SKILL.md` | `borrar` |
| 12 | 27 | Copia de Pablo en `C:\dev\MenuPlan`; carpetas de trabajo en `C:\dev\MenuPlan-<tarea>` | environment | ya vive en `scripts/tarea.mjs` y en el `CLAUDE.md` de usuario | `borrar` |
| 13 | 28 | Vercel, equipo «menuplan», proyecto `homenu` (nombres de antes) | resource | ya vive en `ops/recursos.json` (`vercel-proyecto-homenu`), `ops/INVENTARIO.md` y `.claude/skills/vercel/SKILL.md` | `borrar` |
| 14 | 29 | Supabase `mdzwbrworucnummibxrq`, una sola, producción, cuelga de Vercel | resource | ya vive en `ops/recursos.json` (`supabase-proyecto-produccion`), `ops/INVENTARIO.md` y `.claude/skills/supabase/SKILL.md` | `borrar` |
| 15 | 30 | Servicios, cuentas y claves: `ops/INVENTARIO.md`, sin valores | service | `CLAUDE.md` (índice; nodo del minigrafo) | `indice` |
| 16 | 31 | Claves en local: 1Password, bóvedas, `.env.local` con direcciones `op://` | resource | ya vive en `ops/recursos.json` (bóvedas) y `.claude/skills/1password/SKILL.md` | `borrar` |
| 17 | 32 | Estado de las migraciones: `supabase/ESTADO.md`, `PENDIENTES.md` | data-source | ya vive en `.claude/rules/migraciones.md` (salta al tocar `supabase/`) | `borrar` |
| 18 | 33 | Cómo deben ser las tablas: `docs/datos/PRINCIPIOS.md` | principle | ya vive en `.claude/rules/migraciones.md` | `borrar` |
| 19 | 34 | Reglas de UI: `DESIGN_SYSTEM.md`, `tokens.js`, `docs/diseno/ESTADO.md` | regla por carpeta | ya vive en `.claude/rules/ui.md` | `borrar` |
| 20 | 35 | Decisiones y hoja de ruta: `ops/DECISIONES.md`, `ops/PLANOS.md` | decision | `CLAUDE.md` (índice, factoría) | `indice` |
| 21 | 36 | Principios de la casa: `docs/PRINCIPIOS.md`, de `ops/principios/` | principle | `CLAUDE.md` (índice, factoría) | `indice` |
| 22 | 38 | `pabloartinano/MenuPlan` y OneDrive son restos de antes del 7 oct | resource | ya vive en `.claude/skills/supabase/SKILL.md`, `.claude/skills/tailscale/SKILL.md` y la norma `fuera-de-onedrive` | `borrar` |

### «Ramas y flujo» (L40-57)

| # | L | Afirmación | Entidad | Destino | Veredicto |
|---|---|---|---|---|---|
| 23 | 42 | `staging` es la rama por defecto y despliega en staging | repo | ya vive en `.claude/skills/github/SKILL.md` | `borrar` |
| 24 | 43-44 | Todo sale de `origin/staging` y vuelve por PR con el CI en verde | norm | ya vive en `ops/normas.json` (`staging-exige-tests`) | `borrar` |
| 25 | 44-45 | Ese PR lo puede fusionar la propia sesión | norm | choca con la norma `fusiona-otro-que-el-constructor` | `pendiente` (D1) |
| 26 | 46-47 | `main` es producción; ninguna sesión sube ni fusiona a `main` | norm | ya vive en `ops/normas.json` (`main-solo-pablo`, `produccion-solo-desde-main`) | `borrar` |
| 27 | 48-50 | Ningún PR a `staging` espera la aprobación de una persona (#608) | norm + decision | ya vive en `ops/normas.json` (`rutas-protegidas-aprobacion-de-dueno`) y `ops/DECISIONES.md` | `borrar` |
| 28 | 50-51 | El control que queda: `tests` en verde y el juez `revisor` (quien construye no juzga) | norm | ya vive en `ops/normas.json` (`quien-construye-no-juzga`) | `borrar` |
| 29 | 51-53 | Un PR que toca `.claude/`, `.github/`, `CLAUDE.md`, hooks o lo que corre con secretos pasa por su juez; nada lo impide | norm | `ops/normas.json` (norma nueva, control `juicio`; ninguna la cubre hoy) | `mover` |
| 30 | 53 | A `main` solo fusiona Pablo, desde el botón del PR | norm | ya vive en `ops/normas.json` (`main-solo-pablo`) | `borrar` |
| 31 | 54 | Los rulesets se aplican con `scripts/rulesets.mjs` (Pablo) | skill | ya vive en `.claude/skills/github/SKILL.md` | `borrar` |
| 32 | 55-56 | Una rama por tarea, prefijo de área y nombre en castellano; lista de prefijos | vocabulary | ya vive en `scripts/tarea.mjs` (`AREAS`, que además tiene `lola` y `roles`: la copia de `CLAUDE.md` está atrasada) | `borrar` |
| 33 | 56-57 | Las sesiones de la nube empujan solo a su rama | norm | `ops/normas.json` (norma nueva; `.claude/hooks/nube.mjs` solo reconoce la sesión, no la frena) | `mover` |
| 34 | 57 | «¿Está en staging?» se mira en `origin/staging` tras `git fetch` | skill + norm | ya vive en `.claude/skills/github/SKILL.md` y `ops/normas.json` (`estado-leido-antes-de-afirmar`) | `borrar` |

### «Una sesión, una tarea» (L59-74)

| # | L | Afirmación | Entidad | Destino | Veredicto |
|---|---|---|---|---|---|
| 35 | 61 | Una sesión = una carpeta = una rama = una tarea | principle | ya vive en `ops/principios/principios/one-change-one-intent.json` y `.claude/agents/constructor.md` | `borrar` |
| 36 | 62-64 | `npm run tarea` abre la carpeta; `npm run retirar` la cierra si no se pierde nada | skill | ya vive en `.claude/skills/github/SKILL.md` («Carpetas de trabajo») | `borrar` |
| 37 | 65-66 | Si la tarea es de un issue, su número: la rama lo lleva y el PR lleva `Closes` | norm | ya vive en `ops/normas.json` (`pr-al-dia-y-closes`, `pr-closes-de-su-rama`) | `borrar` |
| 38 | 67-68 | En la carpeta principal no se trabaja; la guardia no deja | norm | ya vive en `ops/normas.json` (`no-trabajar-en-principal`) | `borrar` |
| 39 | 68 | Nada de borrar carpetas de trabajo a mano | norm | ya vive en `ops/normas.json` (`uniones-antes-de-borrar`) y `.claude/skills/github/SKILL.md` | `borrar` |
| 40 | 69 | Si el arranque avisa de otra sesión en tu carpeta, no trabajes ahí | hook | ya vive en el aviso de `.claude/hooks/arranque.mjs` | `borrar` |
| 41 | 69-70 | App en local: localhost y la IP de la wifi; el login con Google solo vuelve al 5176 | environment | ya vive en `.claude/skills/supabase/SKILL.md`, `scripts/tarea.mjs` y `vite.config.js` | `borrar` |
| 42 | 70-71 | Primer push: `git push -u origin <rama>` | skill | ya vive en `.claude/skills/github/SKILL.md` | `borrar` |
| 43 | 71-72 | Al fusionar tu PR, `npm run retirar` en la misma sesión; la rama remota la borra GitHub | skill | ya vive en `.claude/skills/github/SKILL.md` y `.claude/commands/orquestar.md` | `borrar` |
| 44 | 72-74 | Ramas viejas fusionadas: `npm run podar` (ensayo) y `--si` | skill | ya vive en `.claude/skills/github/SKILL.md` y `scripts/podar.mjs` | `borrar` |

### «Antes del PR» (L76-96)

| # | L | Afirmación | Entidad | Destino | Veredicto |
|---|---|---|---|---|---|
| 45 | 78-81 | Fusiona `origin/staging`; la guardia no deja abrir ni fusionar atrasado; `gh pr update-branch` | norm | ya vive en `ops/normas.json` (`pr-al-dia-y-closes`) y `.claude/skills/github/SKILL.md` | `borrar` |
| 46 | 82-83 | `git status --short` y añadir por nombre solo lo tuyo | norm | ya vive en `ops/normas.json` (`sin-git-add-todo`) y el aviso `add-a-ciegas` | `borrar` |
| 47 | 84-86 | `npm run vecinos`: lo tocado más los vigilantes de conjunto | regla por carpeta | ya vive en `.claude/rules/tests.md` y `ops/vigilantes.json` | `borrar` |
| 48 | 87-91 | Suite, build y lint en el CI; suite local solo si es transversal; el lint cuenta la lista | norm | ya vive en `ops/normas.json` (`tests-del-fichero`, `lint-con-linea-base`) y `.claude/rules/tests.md` | `borrar` |
| 49 | 92-93 | Un test nuevo se ve fallar antes de creérselo | norm | ya vive en `ops/normas.json` (`test-visto-fallar`) y `.claude/rules/tests.md` | `borrar` |
| 50 | 94-96 | El PR lleva `Closes #n` y `Agente:` | norm | ya vive en `ops/normas.json` (`pr-agente-y-closes-en-ci`) | `borrar` |

### «Base de datos» (L98-115)

| # | L | Afirmación | Entidad | Destino | Veredicto |
|---|---|---|---|---|---|
| 51 | 100-101 | Solo hay una base y es la de producción | environment | ya vive en `.claude/rules/migraciones.md` (L8) y `ops/INVENTARIO.md` | `borrar` |
| 52 | 103-105 | Aplicar (`--si`) lo lanza Pablo hasta E5 (#331); las sesiones leen con la URL de lectura | norm + decision | choca con `ops/DECISIONES.md` (2026-10-08), `.claude/rules/migraciones.md` (L19) y `.claude/skills/supabase/SKILL.md`, que dicen que lo lanza la sesión | `pendiente` (D2) |
| 53 | 105-108 | El script pide staging, ensayo de menos de una hora y el OK de `auditor-datos`; `CONTRAE` o RLS, `--pablo`; excepción #440 | norm | ya vive en `ops/normas.json` (`aplicar-migracion-con-permiso`, `migracion-pablo-solo-pablo`) y `.claude/rules/migraciones.md` | `borrar` |
| 54 | 109-110 | El código no depende de que la migración ya esté: plan B | norm | ya vive en `ops/normas.json` (`plan-b-migracion`) y `.claude/rules/migraciones.md` | `borrar` |
| 55 | 111 | Ningún campo ni tabla sin lector; cada dato en un solo sitio | norm | ya vive en `ops/normas.json` (`campo-con-lector`) y `.claude/rules/migraciones.md` | `borrar` |
| 56 | 112-113 | Una tabla, un módulo dueño | norm | ya vive en `ops/normas.json` (`tabla-modulo-dueno`) y `docs/datos/PRINCIPIOS.md` | `borrar` |
| 57 | 115 | El cómo, en la regla `migraciones` | regla por carpeta | salta sola al tocar `supabase/` (`.claude/rules/migraciones.md`) | `borrar` |

### «Cómo se le habla a Pablo» (L117-125)

| # | L | Afirmación | Entidad | Destino | Veredicto |
|---|---|---|---|---|---|
| 58 | 119-120 | El único que le habla a Pablo es el `orquestador` | agent | ya vive en `.claude/agents/orquestador.md` | `pendiente` (D3: `.claude/voz.test.js` exige que la sección nombre al `orquestador`) |
| 59 | 120-123 | Una sola fuente: la skill; la primera línea es la idea raíz en negrita | skill | `CLAUDE.md` (índice: lo esencial para la sesión sin agente, lo fija `.claude/voz.test.js`) | `indice` |
| 60 | 123-125 | De un informe de agente, solo `RESUMEN` y `DECISIONES PENDIENTES` siguen esta forma | agent | ya vive en `.claude/PLANTILLA-AGENTE.md` | `pendiente` (D3: el test exige la copia) |

### «Encargos» y «Agentes» (L127-155)

| # | L | Afirmación | Entidad | Destino | Veredicto |
|---|---|---|---|---|---|
| 61 | 129-131 | Clasifica; hasta lo trivial lleva juez; `/orquestar` y `npm run dimensionar` | assignment-type | ya vive en `.claude/commands/orquestar.md` y `ops/tipos-de-encargo.json` | `borrar` |
| 62 | 131-132 | Regla fija: quien construye no juzga | norm | ya vive en `ops/normas.json` (`quien-construye-no-juzga`) | `borrar` |
| 63 | 136-137 | Los agentes, en `.claude/agents/`, con la plantilla vigilada por su test | agent | `CLAUDE.md` (índice, factoría) | `indice` |
| 64 | 137-138 | Un agente lanzado no pregunta a mitad de trabajo: devuelve decisiones | agent | ya vive en `.claude/PLANTILLA-AGENTE.md` | `borrar` |
| 65 | 140-146 | La tabla de constructores y jueces, con lo que hace cada uno | agent | ya vive en la cabecera de cada `.claude/agents/*.md` | `pendiente` (D3: `.claude/agentes.test.js` exige que `CLAUDE.md` nombre a todos; el acuerdo dice que mire la fuente) |
| 66 | 140 | Los jueces, sin Edit ni Write; no escribir por Bash lo vigila `revisor` | norm | ya vive en `ops/normas.json` (`jueces-sin-escritura`) | `borrar` |
| 67 | 148 | Cada cabecera dice a quién pasa trabajo (`traspasa_a`) | agent | ya vive en `.claude/PLANTILLA-AGENTE.md` | `borrar` |
| 68 | 149 | El diagnóstico del `analista` lo juzga `revisor` (y `auditor-datos`) | agent | ya vive en `.claude/agents/analista.md` | `borrar` |
| 69 | 150-153 | Cada agente lista sus tareas y estándares; `npm run estandar`; el `revisor` los contrasta | norm | ya vive en `ops/normas.json` (`estandar-por-tarea-de-agente`, `estandar-citado-en-el-informe`) | `borrar` |
| 70 | 155 | Aparcados: rendimiento y arquitecto | agent | ya vive en `.claude/commands/orquestar.md` y `docs/ops/FLUJO.md` | `borrar` |

### «Reglas por carpeta y skills» (L157-178)

| # | L | Afirmación | Entidad | Destino | Veredicto |
|---|---|---|---|---|---|
| 71 | 159-163 | Las reglas saltan solas; la lista de zonas de cada una | regla por carpeta | ya vive en el `paths` de cada `.claude/rules/*.md` | `borrar` |
| 72 | 163-171 | La lista de skills, con su clase y para qué sirve cada una | skill | ya vive en cada `.claude/skills/*/SKILL.md` y en `.claude/dominios-skills.json` | `pendiente` (D3: `.claude/skills.test.js` exige que `CLAUDE.md` nombre todas) |
| 73 | 171-177 | Todas siguen `.claude/PLANTILLA-SKILL.md`: tipo, molde, dueño, caducidad, casos, `skills-prueba` | skill | ya vive en `.claude/PLANTILLA-SKILL.md` y `docs/ops/FORJA.md` | `borrar` |
| 74 | 177-178 | Un proveedor nuevo estrena su skill con su primer aprendizaje | skill | ya vive en `.claude/PLANTILLA-SKILL.md` | `borrar` |

### «Vocabulario del catálogo» y «Código» (L180-198)

| # | L | Afirmación | Entidad | Destino | Veredicto |
|---|---|---|---|---|---|
| 75 | 182-185 | «Antiguo» y «nuevo» no se usan; roles de una fuente; Recetario y Reserva; `TABLAS` | vocabulary + data-source | ya vive en `specs/INDEX.md` («Vocabulario del catálogo»), `src/data/model.js` y `.claude/rules/catalogo.md` | `borrar` |
| 76 | 189 | UTF-8 sin BOM | norm | `ops/normas.json` (norma nueva; ningún registro la tiene) | `mover` |
| 77 | 189 | Comentarios en castellano | norm | `ops/normas.json` (`rule-in-spanish` solo habla de normas: ampliarla o norma nueva) | `mover` |
| 78 | 189 | Saltos de línea LF | mechanism | ya lo impone `.gitattributes` (`* text=auto eol=lf`) | `borrar` |
| 79 | 189-190 | Edita con Edit/Write | norm | ya vive en `ops/normas.json` (`edicion-con-edit-y-write`) | `borrar` |
| 80 | 191-192 | Regex sobre nombres de alimento: `\b` por defecto | regla por carpeta | ya vive en `.claude/rules/catalogo.md` | `borrar` |
| 81 | 193-194 | Gemini para imágenes, Anthropic para texto | norm (HoMenu) | `ops/proyectos/homenu/normas.json` (hoy solo en `.claude/rules/api.md` y `lola.md`, que no saltan en `scripts/`) | `mover` |
| 82 | 195 | No cambies de rama con cambios sin commitear | norm | ya vive en `ops/estandares-agentes.json` (tarea `worktrees-y-ramas`) y el principio 2 de `.claude/agents/constructor.md` | `borrar` |
| 83 | 196-198 | La hora es la de Madrid y sale de `npm run hora`; la hora límite la calcula el script | norm | ya vive en `ops/normas.json` (`hora-de-madrid`) y el `CLAUDE.md` de usuario | `borrar` |

### «Pensar en datos» (L200-220)

| # | L | Afirmación | Entidad | Destino | Veredicto |
|---|---|---|---|---|---|
| 84 | 202-208 | Lo que se repite se diseña para contarse; tres capas: principio, norma, estándar | principle | `CLAUDE.md` (índice; lo fijan `scripts/hora.test.js`, `ops/principios.test.js` y `ops/glosario.test.js`) | `indice` |
| 85 | 210-220 | Los diez principios con su id | principle | ya viven en `ops/principios/principios/*.json` y `docs/PRINCIPIOS.md` | `borrar` |

### «Qué se le pregunta a Pablo, y qué no» (L222-257): pasa a dato del proyecto (acuerdo)

Destino de todas: un registro del proyecto (propuesta: `ops/proyectos/homenu/preguntas.json`)
del que `CLAUDE.md` y `.claude/agents/orquestador.md` leen sin copia a mano. Cada fila
dice la norma que ya la cubre, si hay; la lista se borra de `CLAUDE.md` cuando se genere.

| # | L | Afirmación | Entidad | Norma que ya la cubre | Veredicto |
|---|---|---|---|---|---|
| 86 | 224-226 | Solo se pregunta lo irreversible o lo que sale fuera; preguntar de más es un fallo (#185) | pregunta a Pablo + decision | `ops/DECISIONES.md` no la tiene con esa fecha (8 oct) | `mover` |
| 87 | 230 | Subir o fusionar a `main` | pregunta a Pablo | `main-solo-pablo` | `mover` |
| 88 | 231-232 | Borrar o reescribir datos de familias; RLS y permisos (`--pablo`, `CONTRAE`) | pregunta a Pablo | `migracion-pablo-solo-pablo` | `mover` |
| 89 | 233-234 | Borrar recursos de un servicio o ramas sin fusionar | pregunta a Pablo | ninguna | `mover` |
| 90 | 235 | Crear, rotar o cambiar secretos y variables | pregunta a Pablo | `secretos-ok-pablo` | `mover` |
| 91 | 236 | Gastar dinero | pregunta a Pablo | `gasto-ok-pablo` | `mover` |
| 92 | 237 | Escribir a personas o publicar en su nombre | pregunta a Pablo | ninguna | `mover` |
| 93 | 238 | Ampliar permisos de `.claude/settings.json` | pregunta a Pablo | `permisos-ok-pablo` | `mover` |
| 94 | 239 | Reescribir historia de una rama que no es tuya | pregunta a Pablo | `push-forzado-con-permiso` | `mover` |
| 95 | 243-245 | Autorizado: leer producción con `npm run consulta`, `verificar-estado`, ensayos | pregunta a Pablo | `rol-solo-lectura` | `mover` (`scripts/consulta.test.js` exige hoy el texto en `CLAUDE.md`: se cambia con el generador) |
| 96 | 246-247 | Autorizado: aplicar las migraciones que el script deja | pregunta a Pablo | `aplicar-migracion-con-permiso` | `mover` (ver D2) |
| 97 | 248-249 | Autorizado: issues y etiquetas | pregunta a Pablo | `issues-con-buscar-antes` | `mover` |
| 98 | 250-252 | Autorizado: hooks, guardia, reglas, skills y agentes por PR con juez; fusionar a staging | pregunta a Pablo | `rutas-protegidas-aprobacion-de-dueno` | `mover` (ver D1) |
| 99 | 253-254 | Autorizado: ajustes del repo que no tocan permisos ni producción | pregunta a Pablo | ninguna | `mover` |
| 100 | 255-256 | Autorizado: poner al día la carpeta principal y las copias de hooks de usuario | pregunta a Pablo | ninguna | `mover` |
| 101 | 257 | Autorizado: retirar carpetas y ramas ya fusionadas | pregunta a Pablo | ninguna | `mover` |

### «Lo que hace cumplir esto» (L259-298)

| # | L | Afirmación | Entidad | Destino | Veredicto |
|---|---|---|---|---|---|
| 102 | 261-265 | `arranque.mjs` al abrir: carpeta, rama, sesiones, migraciones, issues, identidad de la App | hook + norm | ya vive en `.claude/hooks/arranque.mjs`, `ops/normas.json` (`sesion-con-su-identidad`) y `.claude/skills/github/referencias/app-sesiones.md` | `borrar` |
| 103 | 265 | Cambiar reglas del repo o los ajustes es de Pablo | norm | ya vive en `ops/normas.json` (`ajustes-servicios-ok-pablo`) | `borrar` |
| 104 | 266-277 | La lista de lo que niega y pregunta la guardia | norm | ya vive en `docs/ops/NORMAS.md` («Avisos de la guardia», 42 avisos con su norma; acuerdo) | `borrar` |
| 105 | 279-281 | Avisa sin bloquear al editar lo que otra rama cambió o reservó | norm | ya vive en `ops/normas.json` (`zona-con-dueno`) | `borrar` |
| 106 | 281-282 | Cada regla de la guardia con su test en `guardia.test.js` | norm | ya vive en `ops/normas.json` (`guardia-vigila-cada-orden`) | `borrar` |
| 107 | 283 | `avisos.mjs` tras editar: los issues abiertos que nombran el fichero | hook | ya vive en `.claude/settings.json` y la cabecera de `.claude/hooks/avisos.mjs` | `borrar` |
| 108 | 284-286 | `pendientes.mjs` frena si dejas decisiones o fallos sin issue; las decisiones, a Pablo | norm | ya vive en `ops/normas.json` (`pendientes-a-issue`) | `borrar` |
| 109 | 287 | GitHub: `main` solo por PR con `tests`; secret scanning y Dependabot | norm | ya vive en `ops/normas.json` (`main-solo-por-pr-con-tests`, `push-protection`) y `.claude/skills/github/SKILL.md` | `borrar` |
| 110 | 288-294 | Skills por obligación: la guardia pide la skill; el CI pide la línea «Runbook:»; el `revisor` mira el aprendizaje | norm | ya vive en `ops/normas.json` (`skill-antes-de-riesgo`, `linea-runbook`, `lecciones-a-un-test`) | `borrar` |
| 111 | 295-296 | Las reglas por carpeta solo saltan con Read, Write o Edit: lo crítico va en la guardia | mechanism | `ops/mecanismos.json` (nota del mecanismo `texto`; hoy no lo dice) | `mover` |
| 112 | 297-298 | Cuando algo falla, el aprendizaje va a un test o la guardia; a la memoria, nunca | norm | ya vive en `ops/normas.json` (`lecciones-a-un-test`) y `ops/flujo.json` | `borrar` |

### «Cuando algo falla» (L300-321)

| # | L | Afirmación | Entidad | Destino | Veredicto |
|---|---|---|---|---|---|
| 113 | 302-306 | Ningún fallo se cierra suelto: caso, `analisis:`, fondo, encargos | norm | ya vive en `ops/normas.json` (`cuando-algo-falla`), `docs/ops/FLUJO.md` y `.claude/skills/issues/SKILL.md` | `pendiente` (D3: `scripts/issues.test.js` exige «problema de fondo» y «puntual» en `CLAUDE.md`) |
| 114 | 306-310 | Todo PR lleva `Casos:`; la guardia y el CI lo vigilan | norm | ya vive en `ops/normas.json` (`cuando-algo-falla`) y el aviso `pr-sin-casos` | `pendiente` (D3: `scripts/issues.test.js` exige `Casos:` en `CLAUDE.md`) |
| 115 | 312-315 | El camino completo, en `docs/ops/FLUJO.md`; `npm run flujo` | norm | `CLAUDE.md` (índice; lo exige `ops/flujo.test.js`) | `indice` |
| 116 | 316-317 | Las definiciones, en `scripts/lib/issues.mjs` | vocabulary | ya vive en `docs/ops/FLUJO.md` | `borrar` |
| 117 | 318-321 | Decisiones y trabajo como issues; `npm run issues`, `--colgar`, `/revision-issues`; nada sensible | norm | ya vive en `ops/normas.json` (`pendientes-a-issue`, `repo-publico-sin-detalle`) y `.claude/skills/issues/SKILL.md` | `borrar` |


## Las 33 normas que dicen vivir en `CLAUDE.md`

Las que tienen `CLAUDE.md` en su campo `donde` de `ops/normas.json`. Propuesta una a
una, como pide el acuerdo: **principio**, **norma horizontal** (se queda en
`ops/normas.json` y `CLAUDE.md` sale de su `donde`), **norma de HoMenu** (pasa a
`ops/proyectos/homenu/normas.json`) o **Base/Forja** (parte de la base que heredan
todas las forjas, `docs/ops/BASE-FORJA.md`). «`donde` sin `CLAUDE.md`» dice dónde
queda escrita; si `CLAUDE.md` era el único sitio, se propone otro.

| Norma | Propuesta | `donde` sin `CLAUDE.md` | Nota |
|---|---|---|---|
| `jueces-sin-escritura` | norma horizontal | `.claude/agentes.test.js` | |
| `produccion-solo-desde-main` | norma horizontal | `.claude/skills/vercel/SKILL.md` | |
| `ajustes-servicios-ok-pablo` | norma horizontal | `.claude/skills/github/SKILL.md` | Nombra a Pablo: el dueño que aprueba sería dato del proyecto (D5) |
| `secretos-ok-pablo` | norma horizontal | el registro de preguntas del proyecto (era el único sitio) | Ídem D5 |
| `permisos-ok-pablo` | norma horizontal | el registro de preguntas del proyecto (era el único sitio) | Ídem D5 |
| `main-solo-por-pr-con-tests` | norma horizontal | `ops/DECISIONES.md` | |
| `rutas-protegidas-aprobacion-de-dueno` | norma horizontal | `ops/DECISIONES.md`, `.claude/skills/github/SKILL.md` | El id dice lo contrario que su exigencia («sin aprobación»); los ids no se tocan (BASE-FORJA §1) |
| `main-solo-pablo` | norma horizontal | el registro de preguntas del proyecto (era el único sitio) | Ídem D5 |
| `aplicar-migracion-con-permiso` | norma horizontal | `scripts/lib/permisoAplicar.mjs`, `.claude/rules/migraciones.md` | Ver D2 |
| `guardia-vigila-cada-orden` | norma horizontal | `.claude/hooks/guardia.mjs`, `nube.mjs` | |
| `migracion-pablo-solo-pablo` | norma horizontal | `.claude/hooks/guardia.mjs`, `permisoAplicar.mjs` | Ídem D5 |
| `sin-sql-a-mano` | norma horizontal | `.claude/hooks/guardia.mjs`, `nube.mjs` | |
| `staging-exige-tests` | norma horizontal | `.claude/skills/github/SKILL.md` | |
| `quien-construye-no-juzga` | principio (ya es `builder-does-not-judge`) | `.claude/commands/orquestar.md` | Repite el principio y solapa con `jueces-sin-escritura`; propuesta: que la Forja la herede en toda tarea de acción `juzgar` |
| `test-visto-fallar` | Base/Forja | `.claude/rules/tests.md` | Vale para toda tarea que añade un test: regla común de la forja de `construir` |
| `plan-b-migracion` | norma horizontal | `.claude/rules/migraciones.md` (lo dice en L36; era el único `donde`) | |
| `gasto-ok-pablo` | norma horizontal | el registro de preguntas del proyecto (era el único sitio) | Ídem D5 |
| `linea-runbook` | norma horizontal | `.github/workflows/tests.yml` | |
| `tabla-modulo-dueno` | norma horizontal | `docs/datos/PRINCIPIOS.md` | |
| `pr-al-dia-y-closes` | norma horizontal | `.claude/hooks/guardia.mjs`, `nube.mjs` | |
| `no-trabajar-en-principal` | norma horizontal | `.claude/hooks/guardia.mjs`, `nube.mjs` | La ruta `C:\dev\MenuPlan` es dato del entorno del proyecto |
| `skill-antes-de-riesgo` | norma horizontal | `.claude/dominios-skills.json`, `.claude/hooks/guardia.mjs` (era el único `donde`) | |
| `pendientes-a-issue` | norma horizontal | `.claude/hooks/pendientes.mjs` (era el único `donde`) | |
| `vocabulario-cerrado` | principio (ya es `closed-vocabulary`) y norma de datos | `.claude/rules/migraciones.md` (era el único `donde`) | Se queda como norma de `data`; el texto general es el principio |
| `campo-con-lector` | norma horizontal | `.claude/rules/migraciones.md` (era el único `donde`) | |
| `hora-de-madrid` | norma horizontal con la zona como dato del proyecto | `CLAUDE.md` de usuario, `scripts/hora.mjs` | «Madrid» es la zona del equipo, no de la factoría |
| `tests-del-fichero` | Base/Forja | `CLAUDE.md` de usuario, `.claude/rules/tests.md` | Igual que `test-visto-fallar` |
| `cuando-algo-falla` | norma horizontal | `.claude/skills/issues/SKILL.md` | |
| `repo-publico-sin-detalle` | norma horizontal con condición (repo público, dato del repo) | `.claude/skills/issues/SKILL.md` | |
| `push-forzado-con-permiso` | norma horizontal | `.claude/hooks/guardia.mjs`, `nube.mjs` | |
| `build-con-prebuild` | norma de HoMenu | `.claude/hooks/guardia.mjs`, `nube.mjs` | Vite y el `prebuild` que valida el catálogo son de HoMenu |
| `edicion-con-edit-y-write` | norma horizontal | `.claude/hooks/guardia.mjs`, `nube.mjs` | |
| `fusiona-otro-que-el-constructor` | — | — | `pendiente` (D1): choca con `CLAUDE.md` L44-45 y #608 |

Resumen: 27 normas horizontales (8 tenían `CLAUDE.md` como único `donde` y se les
propone otro), 2 que repiten un principio (`vocabulario-cerrado` también tenía
`CLAUDE.md` como único `donde`), 2 de Base/Forja, 1 de HoMenu y 1 pendiente (D1).
Seis nombran a Pablo y esperan D5. Ningún id cambia.

## Decisiones pendientes

- **D1. ¿Quién fusiona un PR a staging?** `CLAUDE.md` (L44-45) y #608 dicen que la
  propia sesión; la norma `fusiona-otro-que-el-constructor` dice que alguien distinto
  del constructor. Una de las dos sobra.
- **D2. ¿Quién lanza `apply-migration --si`?** `CLAUDE.md` (L103) dice Pablo hasta E5
  (#331), porque las sesiones no tienen la URL de administrador (#328);
  `ops/DECISIONES.md` (2026-10-08), `.claude/rules/migraciones.md` (L19), la skill
  `supabase` y «Autorizado de forma permanente» (L246) dicen que la sesión.
- **D3. Cinco tests fijan texto en `CLAUDE.md`** y bloquean borrar sus copias:
  `.claude/agentes.test.js` (todos los agentes), `.claude/skills.test.js` (todas las
  skills), `.claude/voz.test.js` (sección de voz con el `orquestador` y la frase del
  informe), `scripts/issues.test.js` («problema de fondo», «puntual», `Casos:`) y
  `scripts/consulta.test.js` («Autorizado de forma permanente», `npm run consulta`).
  El acuerdo cubre el primero (que mire su fuente); los otros cuatro, por la misma
  regla, en la ronda de los tests. Además fijan anclas que se quedan:
  `ops/flujo.test.js`, `ops/glosario.test.js`, `ops/principios.test.js` y
  `scripts/hora.test.js`.
- **D4. El campo de proyecto por entidad** (#710): hoy cada entidad es horizontal o
  vertical, sin `project`. El equipo (`team-member`), los recursos y el entorno local
  necesitan decir de qué proyecto son sus ejemplares para el minigrafo y para
  `ops/proyectos/<id>/entidades.json`.
- **D5. «Pablo» en seis normas horizontales** (`main-solo-pablo`,
  `migracion-pablo-solo-pablo`, `ajustes-servicios-ok-pablo`, `secretos-ok-pablo`,
  `permisos-ok-pablo`, `gasto-ok-pablo`): o la norma dice «el dueño del proyecto» y
  quién es sale del registro del proyecto, o se quedan nombrando a Pablo.
- **D6. Otras fuentes que citan `CLAUDE.md`**: 13 principios (`ops/principios/`), 6
  sitios de `ops/estandares-agentes.json`, 5 de `ops/flujo.json` y las fuentes
  `casa-claude` y `casa-docs-ops-sin-claude-md` lo dan como fuente. Al vaciarlo, esas
  citas apuntan a texto que ya no está: hay que reapuntarlas al registro nuevo en la
  misma ronda que borre.
