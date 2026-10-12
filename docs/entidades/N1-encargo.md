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
| 3, valores discretos | Las condiciones de un paso opcional son banderas con nombre, no texto libre; el texto `si` se queda como compatibilidad con el panel. Lo que no encaja no es un valor libre: cada tipo tiene un subtipo liso o, si no lo tiene, una válvula `<tipo>-other` con su motivo en cada uso (`subtype_note`). Los atributos de un subtipo son valores de vocabulario cerrado o números; el único texto libre es `note`, de longitud acotada. |
| 4, id estable | El número del issue de GitHub. Los tipos y subtipos llevan un id en minúsculas (kebab los subtipos). |
| 5, forma de los nombres | Los campos, los ids de tipo y los valores nuevos van en inglés y en snake (`assignment_type`, `subtype`, `complexity`, `writes_data`), como pide N0. Los subtipos nuevos siguen la plantilla `<tipo>-<objeto>`. Los ids de antes se quedan como alias retirados (`status: retired`, `replaced_by`), porque los lee el panel de la factoría. |
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
| `subtype` | un `id` activo de `tipos` de `ops/tipos-de-encargo.json` que cuelgue de ese tipo (un id retirado vale, con aviso) | sí en los creados desde 2026-10-13; antes, no |
| `complexity` | `trivial`, `normal`, `large` | sí en los creados desde 2026-10-13; antes, no |
| `subtype_note` | texto de hasta 160 caracteres: por qué ningún subtipo encaja; hace falta con una válvula (`<tipo>-other`) en los creados desde 2026-10-13 | solo con una válvula |
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
| `encargo.subtype` | los subtipos activos (12), cada uno con su `type`; los 21 ids de antes están retirados con su sustituto | `ops/tipos-de-encargo.json` (`tipos`) |
| `encargo.differs_in`, `encargo.closing`, `encargo.measure`, `encargo.counter`, `encargo.step_purpose`, `encargo.subtype_status` | lo que puede declarar un subtipo (la puerta de entrada, abajo) | `ops/tipos-de-encargo.json` |
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
| `create` | Algo nuevo o un cambio de lo que hace: pantalla, herramienta, tabla, endpoint, contenido | builder → judge | `create-plain`, `create-person-approved`, `create-planned`, `create-in-session` |
| `fix` | Algo que debía funcionar y no funciona | judge → builder → judge | `fix-bug` |
| `improve` | Mejorar sin cambiar lo que hace: migrar, simplificar, acelerar, abaratar | builder → judge; mide antes y después | `improve-measured`, `improve-structure`, `improve-layers` |
| `operate` | Operar la casa: CI, permisos, hooks, ramas, secretos, despliegues | builder → judge; si es irreversible, cierra con el OK de una persona | `operate-reversible`, `operate-irreversible` |
| `audit` | Mirar sin tocar: solo jueces, en paralelo | judge; solo jueces, en paralelo | `audit-periodic`, `audit-other` |

Banderas de una condición (`flags`):

- `writes_data`: El encargo escribe datos de familias o de la base.
- `touches_rls`: El encargo cambia políticas RLS o permisos de tablas.
- `changes_bot`: El encargo cambia lo que Lola dice o hace.
- `touches_secrets_or_permissions`: El encargo toca secretos, variables de entorno, permisos de Claude o de GitHub.
<!-- n1:encargo:tipos:fin -->

### La puerta de entrada de un subtipo

Qué puede ser un subtipo (fondo #645, encargo #646): un subtipo es una **naturaleza de trabajo**, no una zona. Pablo decidió el 12 oct 2026 que todos los subtipos viven en el mismo plano y que lo discreto va primero. Se generó del lector:

<!-- n1:encargo:puerta:inicio -->
Las reglas de la puerta (`REGLAS_PUERTA` de `scripts/lib/tiposDeEncargo.mjs`; cada una la comprueba `ops/tipos-de-encargo.test.js`):

- `plano`: Mismo plano: un subtipo describe la naturaleza del trabajo y no la zona. La zona sale de los ficheros (ámbitos de scripts/lib/ambitos.mjs) y de ella salen el constructor y los jueces.
- `difiere`: Difiere de su tipo en algo medible: lo declara en `differs_in` (vocabulario cerrado) y un test lo comprueba contra el esqueleto de su tipo. El subtipo liso (`plain`) es el esqueleto y no declara nada; si no difiere, no es subtipo.
- `repite`: Se repite: al menos 3 encargos con el patrón. Lo mide `npm run fabrica` y solo avisa. La válvula `<tipo>-other` cuenta sus usos, pide un motivo en `subtype_note` y, si se repite, propone un subtipo nuevo.
- `texto-libre`: Lo discreto primero: todo atributo es un valor de vocabulario cerrado o un número; los únicos huecos de texto son `note` (de 160 caracteres como mucho) y la etiqueta `accion` (la definición del valor, de 100).
- `nombre`: Nombre con plantilla <tipo>-<objeto>, en inglés y en kebab-case: el prefijo es su tipo (create, fix, improve, operate, audit) y el objeto, de una a tres palabras.

En qué puede diferir un subtipo de su tipo (`differs_in`, vocabulario cerrado):

| Valor | Se cumple si |
|---|---|
| `steps` | Sus pasos, en orden de roles, no son los del esqueleto de su tipo |
| `closing` | Cierra con el OK de una persona, que el esqueleto no pide |
| `measure` | Mide otra cosa que la medida por defecto de su tipo, o (en audit) mide con un agente que no es juez |
| `plans_first` | Empieza por un plan de la sesión, antes de construir |
| `maps_first` | Empieza por un juez que mapea lo que hay, antes de construir |
| `builds_in_session` | Lo construye la propia sesión, sin subagente constructor |

Los subtipos activos y en qué difieren:

| Subtipo | Es | Difiere en |
|---|---|---|
| `create-plain` | el liso del tipo | — |
| `create-person-approved` | un subtipo | `closing` |
| `create-planned` | un subtipo | `plans_first`, `steps` |
| `create-in-session` | un subtipo | `builds_in_session` |
| `fix-bug` | el liso del tipo | — |
| `improve-measured` | el liso del tipo | — |
| `improve-structure` | un subtipo | `measure` |
| `improve-layers` | un subtipo | `maps_first`, `steps` |
| `operate-reversible` | el liso del tipo | — |
| `operate-irreversible` | un subtipo | `closing` |
| `audit-periodic` | un subtipo | `measure` |
| `audit-other` | la válvula del tipo | — |

Los ids de antes, retirados (alias para el panel de la factoría; el dimensionador usa solo los activos):

| Id retirado | Pasa a |
|---|---|
| `pantalla-nueva` | `create-plain` |
| `assets` | `create-plain` |
| `lola-herramienta` | `create-plain` |
| `lola-conocimiento` | `create-plain` |
| `esquema-o-dato` | `create-person-approved` |
| `recetas-o-catalogo` | `create-in-session` |
| `funcion-entre-dominios` | `create-planned` |
| `endpoint-nuevo` | `create-plain` |
| `create-other` | `create-plain` |
| `bug` | `fix-bug` |
| `fix-other` | `fix-bug` |
| `migrar-a-tokens` | `improve-measured` |
| `dato-en-varias-capas` | `improve-layers` |
| `reducir-cableado` | `improve-measured` |
| `lento-o-caro` | `improve-measured` |
| `refactor-monolito` | `improve-structure` |
| `improve-other` | `improve-measured` |
| `ci-permisos-hooks` | `operate-reversible` |
| `desplegar-produccion` | `operate-irreversible` |
| `operate-other` | `operate-reversible` |
| `revision-periodica` | `audit-periodic` |
<!-- n1:encargo:puerta:fin -->

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
  `opcional` y `especiales` no se quitan ni se renombran; solo se añaden campos (`status`, `replaced_by`, `differs_in`…).
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
| Cada subtipo cumple el esqueleto de su tipo, pasa la puerta de entrada (mismo plano, difiere de verdad, sin texto libre fuera de `note`, nombre con plantilla), ninguno se queda sin juez, las condiciones son banderas, la tabla de `/orquestar` se genera y la lista de jueces sale de `.claude/agents/` | `ops/tipos-de-encargo.test.js` |
| Cuántos encargos usa cada subtipo (aviso, no falla; una línea `subtipo-uso subtype: … aviso: pocos-usos`, `valvula-repetida` o `alias-retirado` por cada uno que no llega a 3) | `npm run fabrica` (`avisosDeUso`) |
| La complejidad cubre su vocabulario y sus jueces no bajan al subir | `ops/presupuestos.test.js` |
| Los vocabularios no pierden valores sin retirarlos | `ops/vocabularios-vida.test.js` |

## 8. Plantilla para las demás entidades

Este N1 es el molde: obedece a, id, campos (con su tabla generada de la fuente), vocabularios, ciclo de vida, registro y
controles. Lo que cambia entre entidades es el contenido, no el orden. Una entidad que añada un campo lo hace con la
misma regla: opcional para lo ya registrado y obligatorio desde la fecha del PR, con el control que lo dice.
