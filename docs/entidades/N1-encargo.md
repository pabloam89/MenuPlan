# N1 — El encargo

Es la forja de la entidad **encargo** (`assignment` en `ops/entidades.json`, eje horizontal), y el **piloto** de la
plantilla N1 para las demás entidades: las secciones de abajo, en este orden, son las que lleva cualquier N1. Obedece a
[N0](N0-principios.md): lo cita por su número, solo añade campos, controles y vocabularios, y no relaja nada (reglas 1 a
4 de N0). Los tipos de encargo (N2) y los subtipos (N3) son valores de vocabularios cerrados de esta entidad, no entidades.

Un **encargo** es un issue con la etiqueta `tipo:encargo`: una parte del arreglo de un problema de fondo, con su
dueño, su juez y su PR. Su fondo es #639; este documento sale del encargo #640.

## 1. Qué hereda de N0

| N0 | Cómo se aplica al encargo |
|---|---|
| 1 y 2, un nombre por concepto | «tipo», «subtipo» y «complejidad» significan una cosa cada una (abajo). `tipo_accion` (preventivo, detectivo, correctivo) es otra cosa y no se llama «tipo». |
| 3, valores discretos | Las condiciones de un paso opcional son banderas con nombre, no texto libre; el texto `si` se queda como compatibilidad con el panel. Cada tipo tiene un subtipo `<tipo>-other` para lo que no encaja, en vez de un valor libre. |
| 4, id estable | El número del issue de GitHub. Los tipos y subtipos llevan un id en minúsculas (kebab los subtipos). |
| 5, forma de los nombres | Los campos, los ids de tipo y los valores nuevos van en inglés y en snake (`assignment_type`, `subtype`, `complexity`, `writes_data`), como pide N0. Los 17 ids de subtipo de siempre se quedan, porque los lee el panel de la factoría. |
| 6, registro con definición | `scripts/lib/issues.mjs` (el formato) y `ops/tipos-de-encargo.json` (tipos, subtipos y banderas). |
| 7, una fuente por dato | La lista de jueces sale de `.claude/agents/` (`scripts/lib/agentes.mjs`); la tabla de `/orquestar` y `docs/ops/ENCARGO.md` se generan; el alcance no se copia al encargo. |
| 8, quién, qué y cuándo | Quién: `constructor` y `juez`. Qué: tipo, subtipo y mecanismo. Cuándo: la fecha de alta del issue, que guarda GitHub. |
| 11, se depreca; no se borra | Un encargo no se borra: se cierra como no planificado o duplicado. |
| 12, ciclo de vida de un vocabulario | Los vocabularios de abajo están anclados en `ops/vocabularios-vida.json`; un valor que deja de usarse se retira, no se reutiliza. |

## 2. Id

`#n`, el número del issue (`id_format: number` en `ops/entidades.json`). La rama de la tarea lleva el número y el PR
dice `Closes #n`. El encargo no tiene otro id.

## 3. Campos

<!-- n1:encargo:campos:inicio -->
Campos comunes del encargo y dónde vive cada uno:

| Campo común | Dónde vive hoy |
|---|---|
| id | el número del issue de GitHub (`#n`); no se repite en el bloque |
| tipo | `assignment_type` del bloque |
| subtipo | `subtype` del bloque; tiene que colgar del tipo dicho |
| ámbitos | se deducen de `ficheros` con `ambitosDeFichero` (scripts/lib/ambitos.mjs); no se guardan |
| alcance | el `alcance` de la ficha del fondo del que cuelga; no se copia al encargo |
| complejidad | `complexity` del bloque |
| constructor | `constructor` del bloque |
| jueces | `juez` del bloque es el mínimo; los demás que exige el subtipo salen del lector `encargoDe` (scripts/lib/tiposDeEncargo.mjs); declarar la lista entera en el PR es de E2 (#641) |
| estado | el estado del issue en GitHub (abierto, o cerrado con su motivo); no se guarda en el bloque |

Claves del bloque `encargo` (la fuente es `CAMPOS_ENCARGO` de `scripts/lib/issues.mjs`):

| Clave | Vale | Obligatoria |
|---|---|---|
| `fondo` | `#n` del fondo del que cuelga | sí |
| `tipo_accion` | `preventivo`, `detectivo`, `correctivo` | sí |
| `mecanismo` | un `id` de `ops/mecanismos.json`; su escalón sale de ahí | sí |
| `por_que_no_mas_alto` | texto: por qué no se usa un mecanismo de un escalón más alto | si el escalón no es el primero (bloqueo) |
| `clase` | texto: qué parte de la clase del fondo cubre | sí |
| `depende_de` | `#n, #m` o `ninguno` | sí |
| `constructor` | un agente de `.claude/agents/` o `sesión` | sí |
| `juez` | un agente juez de `.claude/agents/`, distinto del constructor | sí |
| `verificacion` | ruta del fichero que prueba la clase (un `*.test.js` si el escalón es test_ci) | sí |
| `hecho_cuando` | texto: lo que se ve cuando está hecho | sí |
| `ficheros` | rutas que toca, separadas por coma | no |
| `assignment_type` | un tipo de `ops/tipos-de-encargo.json` (`assignment_types`) | sí en los creados desde 2026-10-13; antes, no |
| `subtype` | un `id` de `tipos` de `ops/tipos-de-encargo.json` que cuelgue de ese tipo | sí en los creados desde 2026-10-13; antes, no |
| `complexity` | `trivial`, `normal`, `large` | sí en los creados desde 2026-10-13; antes, no |
<!-- n1:encargo:campos:fin -->

Los tres campos nuevos (`assignment_type`, `subtype`, `complexity`) son **opcionales para los encargos abiertos antes del
13 oct 2026** y obligatorios para los creados desde ese día. Lo dice el control `encargo-incompleto` de
`validarEncargos` (`scripts/lib/fondos.mjs`), que mira la fecha de alta del issue contra el `desde` de cada campo (`ENCARGO_N1_DESDE`); así el
workflow `fondos` no se rompe con los encargos que ya hay. Otro control, `encargo-subtipo`, exige que el subtipo cuelgue
del tipo.

## 4. Vocabularios

Todos cerrados y anclados en `ops/vocabularios-vida.json` (N0 §12):

| Vocabulario | Valores | Fuente |
|---|---|---|
| `issues.tipo_accion` | preventivo, detectivo, correctivo | `scripts/lib/issues.mjs` |
| `encargo.type` | los cinco tipos: create, fix, improve, operate, audit | `ops/tipos-de-encargo.json` (`assignment_types`) |
| `encargo.subtype` | los 17 subtipos y un `<tipo>-other` por tipo, cada uno con su `type` | `ops/tipos-de-encargo.json` (`tipos`) |
| `encargo.flag` | las condiciones de un paso opcional | `ops/tipos-de-encargo.json` (`flags`) |
| `encargo.complexity` | trivial, normal, large | `scripts/lib/issues.mjs` (`COMPLEXITIES`) |
| `encargo.pipeline` | cuánto del pipeline lanza cada complejidad | `scripts/lib/presupuestos.mjs` (`PIPELINES`) |
| `flujo.actores` | quién interviene en un paso; el juez es un agente con «Tipo: juez» | `scripts/lib/flujo.mjs` (`ACTORES`) |

**Qué es cada cosa.** El **tipo** dice qué se hace con la casa y fija un **esqueleto mínimo de pasos**. El **subtipo** cuelga de
un tipo y solo anota lo suyo. La **complejidad** dice el tamaño del cambio (trivial, normal o large); hasta lo trivial lleva un
juez. Qué lanza cada una (jueces mínimos y parte del pipeline) está en `by_complexity` de `ops/presupuestos.json`, y el
lector `encargoDe` lo junta con el alcance y la causa del fondo. Calcularla desde el diff es de E2 (#641). Esta tabla sale
de `ops/tipos-de-encargo.json`:

<!-- n1:encargo:tipos:inicio -->
| Tipo | Qué es | Esqueleto de pasos | Subtipos |
|---|---|---|---|
| `create` | Algo nuevo o un cambio de lo que hace: pantalla, herramienta, tabla, endpoint, contenido | builder → judge | `pantalla-nueva`, `assets`, `lola-herramienta`, `lola-conocimiento`, `esquema-o-dato`, `recetas-o-catalogo`, `funcion-entre-dominios`, `endpoint-nuevo`, `create-other` |
| `fix` | Algo que debía funcionar y no funciona | judge → builder → judge | `bug`, `fix-other` |
| `improve` | Mejorar sin cambiar lo que hace: migrar, simplificar, acelerar, abaratar | builder → judge; mide antes y después | `migrar-a-tokens`, `dato-en-varias-capas`, `reducir-cableado`, `lento-o-caro`, `refactor-monolito`, `improve-other` |
| `operate` | Operar la casa: CI, permisos, hooks, ramas, secretos, despliegues | builder → judge; si es irreversible, cierra con el OK de una persona | `ci-permisos-hooks`, `desplegar-produccion`, `operate-other` |
| `audit` | Mirar sin tocar: solo jueces, en paralelo | judge; solo jueces, en paralelo | `revision-periodica`, `audit-other` |

Banderas de una condición (`flags`):

- `writes_data`: El encargo escribe datos de familias o de la base.
- `touches_rls`: El encargo cambia políticas RLS o permisos de tablas.
- `changes_bot`: El encargo cambia lo que Lola dice o hace.
- `touches_secrets_or_permissions`: El encargo toca secretos, variables de entorno, permisos de Claude o de GitHub.
<!-- n1:encargo:tipos:fin -->

## 5. Ciclo de vida

| Estado | Qué lo marca |
|---|---|
| Registrado | El issue existe, con su bloque `encargo` y colgado de su fondo (sub-issue). |
| En marcha | Tiene asignado o una rama con su número (`npm run tarea -- <rama> <n>`); `npm run issues` lo cruza. |
| En revisión | Hay PR con `Closes #n` y `Agente:`; el juez del bloque lo mira. |
| Hecho | El PR se fusiona en `staging` con el CI en verde y GitHub cierra el issue. |
| Descartado | Cerrado como no planificado o duplicado; no se borra (N0 §11). |

El estado no es un campo del bloque: lo guarda GitHub (N0 §7). Un fondo lleva como mucho tres encargos vigentes y al menos
uno preventivo y automático (`docs/ops/ENCARGO.md`).

## 6. Registro

- **Fuente de verdad:** `scripts/lib/issues.mjs` (`CAMPOS_ENCARGO`, `TIPOS_ACCION`, `COMPLEJIDADES`).
- **Tipos, subtipos y banderas:** `ops/tipos-de-encargo.json`, con su lector único en `scripts/lib/tiposDeEncargo.mjs`.
  También lo lee el panel de la factoría (repo `homenu-panel`): los campos `tipos[].id`, `accion`, `pasos`, `cierra_con`,
  `opcional` y `especiales` no se quitan ni se renombran.
- **Presupuesto:** `ops/presupuestos.json` (rondas, minutos y `by_complexity`). El lector común, `encargoDe`, junta los
  dos catálogos sin duplicar nada.
- **Derivados:** `docs/ops/ENCARGO.md`, la tabla «Qué pipeline» de `.claude/commands/orquestar.md` y las tablas de este
  documento; todos se regeneran con `npm run flujo -- --escribir`.
- **Definición:** en el glosario, término `encargo`.

## 7. Controles

| Qué comprueba | Dónde |
|---|---|
| El bloque se lee, sus valores son del vocabulario y el subtipo cuelga del tipo | `scripts/fondos-encargos.test.js` y el workflow `fondos` |
| El documento de formato y las tablas de este N1 son lo que genera `issues.mjs` | `scripts/encargo.test.js` |
| Cada subtipo cumple el esqueleto de su tipo, ninguno se queda sin juez, las condiciones son banderas, la tabla de `/orquestar` se genera y la lista de jueces sale de `.claude/agents/` | `ops/tipos-de-encargo.test.js` |
| La complejidad cubre su vocabulario y sus jueces no bajan al subir | `ops/presupuestos.test.js` |
| Los vocabularios no pierden valores sin retirarlos | `ops/vocabularios-vida.test.js` |

## 8. Plantilla para las demás entidades

Este N1 es el molde: obedece a, id, campos (con su tabla generada de la fuente), vocabularios, ciclo de vida, registro y
controles. Lo que cambia entre entidades es el contenido, no el orden. Una entidad que añada un campo lo hace con la
misma regla: opcional para lo ya registrado y obligatorio desde la fecha del PR, con el control que lo dice.
