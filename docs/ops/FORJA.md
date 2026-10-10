# Forja: criterios de calidad

<!-- Generado desde ops/forja.json con «npm run forja -- --escribir». No se edita a mano: ops/forja.test.js lo compara. -->

La única fuente de lo que se le pide a una skill, a un estándar de agente y a lo que venga es `ops/forja.json`. Tres capas, porque convertir algo continuo en atributos discretos nunca cubre todo; para los huecos están los textos que juzga un LLM. La capa de cada criterio solo sube (`ops/forja-capas.json`).

## Cifras

| Capa | skill | estandar | agente | Criterios |
|---|---|---|---|---|
| formal | 26 | 16 | 0 | 42 |
| material | 13 | 4 | 0 | 16 |
| subjetiva | 13 | 3 | 0 | 16 |
| total | 52 | 23 | 0 | 74 |

Un criterio que se aplica a dos artefactos cuenta en las dos columnas y una vez en el total.

## Tipos de skill

Taxonomía decidida por Pablo el 10 oct 2026. Un tipo existe solo si cambia qué entra y sale, cómo se prueba y cómo se corrige. **La fuente de los tipos pasa a ser `ops/forja.json`**; el cambio de la plantilla (`.claude/PLANTILLA-SKILL.md`), de `ops/flujo.json` y de las skills es del encargo de plantillas por tipo, y hasta entonces siguen los ocho tipos de hoy.

| Tipo | Qué hace | Entra → sale | Prueba | Skills de hoy |
|---|---|---|---|---|
| servicio | Operar un sistema externo concreto | petición → comando y resultado esperado | los comandos existen, la salida es comprobable y la caducidad es corta | github, vercel, supabase, telegram, hetzner, tailscale, 1password |
| procedimiento | Pasos fijos que cambian algo | situación → cambio hecho y comprobado | cada paso con su verificación y su marcha atrás | alta-de-secreto |
| diagnostico | De un síntoma a su causa | fallo → causa en campos cerrados | la salida rellena la ficha y hay un criterio de parada | causa-raiz |
| decision | Elegir entre opciones con criterios | dilema → opción y porqué | cada criterio aplicado y la escalera seguida | plan-de-arreglo |
| flujo | Encadenar skills y agentes | caso → cerrado por etapas | cada etapa apunta a una skill o agente que existe y tiene puerta | issues |
| forja | Crear un artefacto nuevo desde su plantilla | necesidad → artefacto o «no hace falta» | regla de parada primero; lo creado pasa su plantilla | forja-de-skills |
| revision | Juzgar un artefacto contra un catálogo y aplicar lo mecánico | artefacto → criterio, estado y arreglo | una pieza mala a propósito da todos sus fallos | higiene-de-skills |
| conocimiento | Lo que hay que saber del negocio | pregunta → dato y dónde vive | cada afirmación apunta a su fuente | ninguna |

El tipo de una skill sale de `tipoDeSkill(respuestas)`: el de la primera pregunta con sí, en este orden; si ninguna, `conocimiento`.

| # | Clave | Pregunta | Tipo |
|---|---|---|---|
| 1 | opera_proveedor | ¿Opera un sistema o proveedor externo concreto? | servicio |
| 2 | crea_artefacto | ¿Crea un artefacto nuevo? | forja |
| 3 | juzga_artefacto | ¿Juzga un artefacto que ya existe? | revision |
| 4 | encadena | ¿Encadena skills o agentes? | flujo |
| 5 | pasos_fijos | ¿Son pasos fijos con comprobación? | procedimiento |
| 6 | sintoma_a_causa | ¿Va de un síntoma a su causa? | diagnostico |
| 7 | elige_opciones | ¿Elige entre opciones con criterios? | decision |

Skills sin ningún sí (provisionales, con su motivo en `skills_provisionales`): `estilo-de-respuesta`.

| Eje de la ficha de una skill | Valores |
|---|---|
| libertad | alta, media, baja |
| invocacion | descripcion, guardia, precarga |

Los tipos de hoy (`ops/flujo.json`) y adónde van:

| Tipo de hoy | Destino |
|---|---|
| herramienta | servicio, flujo |
| oficio | diagnostico, decision |
| dominio | conocimiento |
| estandar | conocimiento |
| receta_cambio | procedimiento |
| rubrica_juez | revision |
| investigacion | procedimiento |
| meta | forja, revision |

Por skill (`migracion_tipos`, sacada de `tipoDeSkill` y comprobada por `ops/forja.test.js`):

| Skill | Tipo |
|---|---|
| github | servicio |
| vercel | servicio |
| supabase | servicio |
| telegram | servicio |
| hetzner | servicio |
| tailscale | servicio |
| 1password | servicio |
| alta-de-secreto | procedimiento |
| causa-raiz | diagnostico |
| plan-de-arreglo | decision |
| issues | flujo |
| forja-de-skills | forja |
| higiene-de-skills | revision |
| estilo-de-respuesta | conocimiento |

Herencia: esqueleto común (la base) → plantilla por tipo (los criterios que le tocan, `tipos` de cada criterio) → cada skill. Criterios de skill por tipo y capa:

| Tipo | formal | material | subjetiva | Criterios |
|---|---|---|---|---|
| servicio | 25 | 13 | 13 | 51 |
| procedimiento | 26 | 13 | 13 | 52 |
| diagnostico | 26 | 13 | 13 | 52 |
| decision | 26 | 13 | 13 | 52 |
| flujo | 26 | 13 | 13 | 52 |
| forja | 26 | 13 | 13 | 52 |
| revision | 26 | 13 | 13 | 52 |
| conocimiento | 26 | 13 | 13 | 52 |

## Discreto y texto: los campos de cada ficha

Se sistematiza lo máximo posible con atributos discretos, aunque lo continuo nunca cabe entero en ellos. Un texto solo se admite como **hueco** (`hueco: true`) con una frase que diga qué cubre que lo discreto no alcanza; los textos que lee un LLM rellenan los huecos, y corregir es «qué falla en qué hueco». `problemasDeCampos` falla con un texto sin hueco, un enum fuera de vocabulario o una ref que no existe. El trinquete de campos (`ops/forja-campos.json`) solo deja pasar un campo de texto a discreto, nunca al revés.

| Clase | Qué es |
|---|---|
| bool | Verdadero o falso |
| enum | Un valor de un vocabulario cerrado |
| ref | Apunta a algo que existe: skill, agente, criterio, ruta, comando, issue o fuente |
| numero | Un número |
| fecha | Una fecha AAAA-MM-DD |
| texto | Prosa: solo como hueco, con su motivo |

| Artefacto | Campos discretos | Huecos de texto | Campos |
|---|---|---|---|
| skill | 6 | 1 | 7 |
| estandar | 2 | 5 | 7 |
| agente | 3 | 1 | 4 |

### Campos de skill

El frontmatter de .claude/skills/<skill>/SKILL.md (name y description arriba; tipo, dueno y comprobado en metadata). Hasta que existan las fichas de skill (#457), es lo que hay.

- `name` — ref a skill
- `description` — texto. Hueco: El cuándo se abre la skill dicho con las palabras de quien pide: lo discreto no lo alcanza, es prosa para que el modelo reconozca una petición
- `tipo` — enum (tipos_skill_vigentes)
- `dueno` — ref a agente
- `comprobado` — fecha
- `libertad` — enum (libertad), opcional
- `invocacion` — enum (invocacion), opcional

### Campos de estandar

Una tarea de un agente en ops/estandares-agentes.json (la clave es su id).

- `tarea` — texto. Hueco: La frase que dice qué se hace en esa tarea: el verbo y su objeto no caben en un vocabulario cerrado
- `origen` — enum (origen_tarea)
- `estandar` — texto, opcional. Hueco: Qué es hacer bien la tarea, dicho con sus matices: un estándar no se reduce a casillas
- `comprueba` — texto, lista, opcional. Hueco: Las comprobaciones concretas de esa tarea, que cambian con cada una y no tienen vocabulario común
- `no_hace` — texto, lista, opcional. Hueco: La frontera con lo que es de otro agente o de una persona, que hay que nombrar caso a caso
- `rondas` — texto, lista, opcional. Hueco: Lo que cambió en cada ronda de investigación, una frase por ronda: el número y las fuentes son discretos, el cambio no cabe en un vocabulario
- `fuentes` — ref a fuente, lista, opcional

### Campos de agente

El frontmatter de .claude/agents/<agente>.md.

- `name` — ref a agente
- `description` — texto. Hueco: El cuándo se usa el agente y su frontera con los demás, dicho con las palabras de quien pide
- `model` — enum (modelo_agente)
- `skills` — ref a skill, lista, opcional

## La forma de una práctica

Datos en `forma_practica` de `ops/forja.json`; se validan con `problemasDePractica` (`scripts/lib/forjaForma.mjs`). El número de bullets, su estructura y la fuente de cada uno son capa formal; la voz, el modo, el tiempo y la persona son capa material, una heurística sobre el texto que **es orientativa hasta que #454 la calibre con estándares reales** (la voz solo mira el verbo que abre la regla; el condicional y el -ó suelto no cuentan como otro tiempo). Aplicarlo a los estándares reales es de #454.

| Artefacto | Bullets | Estructura de cada bullet | Fuente por bullet | Voz | Modo y tiempo | Persona |
|---|---|---|---|---|---|---|
| estandar | de 2 a 5 | regla · porque · ejemplo_bueno · ejemplo_malo | [F] o [I] | activa | imperativo | segunda |

## Método de construcción

Un estándar se escribe tras 3 rondas de investigación o más (buscar, contrastar, destilar), cada una con 1 fuente o más. Cada ronda deja una línea `ronda: n fuentes: k cambios: …` en el campo `estandar.rondas` de su ficha (clase texto, lista, hueco: el cambio no cabe en un vocabulario). Lo que hoy no lo cumple está en `ops/forja-excepciones.json`, que solo baja.

## Vocabularios

| Capa | Qué es |
|---|---|
| formal | Esquema y forma: determinista, lo vigila un test del CI |
| material | Heurística automática; lo que hoy incumple va a una lista de excepciones que solo baja |
| subjetiva | Una rúbrica escrita que un LLM puntúa sobre casos; para lo que no se puede discretizar |

| Estado de una ficha | Qué quiere decir |
|---|---|
| cumple | Lo comprobó un control o un juicio y se cumple |
| no_cumple | Lo comprobó un control o un juicio y no se cumple |
| no_aplica | El criterio no se aplica a este artefacto |
| juicio | Pendiente de juicio: lo puntúa un LLM o una persona y aún no se ha hecho |

Una ficha es una línea `<artefacto>: <nombre> criterio: <id> estado: <estado>`; solo no_cumple y juicio llevan `nota:` (el hueco).

## Promoción de una rúbrica

Un criterio subjetivo lleva casos de calibración (un texto de ejemplo y el estado que se espera, cumple o no_cumple) y solo puede marcarse `listo_para_subir` si sus medidas cumplen la promoción: coincidencia del juez con la respuesta conocida de al menos **0.9** en **10** repeticiones.

**Estos valores son un primer tiro, pendientes de ajustar con datos.** Están en el bloque `promocion` de `ops/forja.json` y se cambian ahí; aún no hay juez montado ni medidas. Subir de capa sigue siendo editar el criterio; el trinquete (`ops/forja-capas.json`) impide bajar.

Marca de la fuente: **[F]** está en una fuente externa (con su URL); **[I]** es de la casa (con la ruta del repo donde está escrito).

## Capa formal

Esquema y forma: determinista, lo vigila un test del CI.

### formal · skill (26)

- `frontmatter` — El frontmatter lleva solo name, description y metadata; name igual que la carpeta; la description empieza por «Úsala », dice «No para:» y tiene de 81 a 600 caracteres, por debajo de los 1.024 del estándar abierto
  - Fuente: [F] https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices. Control: `.claude/skills.test.js`. Código: `frontmatter`.
- `tipo` — metadata.tipo es uno de los ocho tipos de ops/flujo.json y tiene secciones definidas
  - Fuente: [I] scripts/lib/skills.mjs. Control: `.claude/skills.test.js`. Código: `tipo`.
- `dueno` — metadata.dueno es un agente de .claude/agents/ que la carga en su skills:
  - Fuente: [I] scripts/lib/skills.mjs. Control: `.claude/skills.test.js`. Código: `dueno`.
- `comprobado` — metadata.comprobado es una fecha AAAA-MM-DD no futura y el texto dice «Comprobado el <fecha>: …» con qué se comprobó ese día
  - Fuente: [I] scripts/lib/skills.mjs. Control: `.claude/skills.test.js`. Código: `comprobado`.
- `caducada` — Una skill que toca un PR no tiene su fecha de comprobado a más de 90 días; el reloj no va en npm test sino en el paso «Skills del PR» del CI
  - Fuente: [I] scripts/lib/skills.mjs. Control: `scripts/skills-pr.test.js`. Código: `caducada`.
- `secciones` — Las secciones de su tipo, en su orden y ninguna vacía, con el título «# …» arriba
  - Fuente: [I] .claude/PLANTILLA-SKILL.md. Control: `.claude/skills.test.js`. Código: `secciones`.
- `formato` — Tabla de operaciones con «Debe salir» en las herramientas, fallos con fecha, causa y arreglo, registro de cambios fechado y última línea «Comprobado el …» o «Sin comprobar: …»
  - Fuente: [I] .claude/PLANTILLA-SKILL.md. Control: `.claude/skills.test.js`. Código: `formato`.
- `tamano` — SKILL.md de 220 líneas como mucho (la guía oficial pide menos de 500); el detalle va a ficheros de capa
  - Fuente: [F] https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices. Control: `.claude/skills.test.js`. Código: `tamano`.
- `secretos` — Ningún patrón de clave ni cadena de conexión con contraseña en la skill ni en sus capas
  - Fuente: [I] scripts/lib/skills.mjs. Control: `.claude/skills.test.js`. Código: `secretos`.
- `rutas` — Todo fichero del repo citado entre comillas invertidas existe
  - Fuente: [F] https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices. Control: `.claude/skills.test.js`. Código: `rutas`.
- `estructura` — En la carpeta solo SKILL.md, casos.json y las capas conocidas, a un nivel de profundidad, y cada fichero de capa citado desde SKILL.md con su ruta entera
  - Fuente: [F] https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices. Control: `.claude/skills.test.js`. Código: `estructura`.
- `copiado` — Ningún párrafo largo idéntico en dos skills: el saber vive en una y la otra la cita por su nombre
  - Fuente: [I] scripts/lib/skills.mjs. Control: `.claude/skills.test.js`. Código: `copiado`.
- `casos` — casos.json válido, con cuatro casos como mínimo: tres que cargan la skill con debe_salir comprobable y al menos uno de frontera
  - Fuente: [F] https://agentskills.io/skill-creation/evaluating-skills. Control: `.claude/skills.test.js`. Código: `casos`.
- `casos-negativos` — Al menos tres casos de frontera: peticiones parecidas que son de otra skill o de ninguna
  - Fuente: [F] https://agentskills.io/skill-creation/optimizing-descriptions. Control: `.claude/skills.test.js`. Código: `casos-negativos`.
- `fechas` — Sin fechas en el cuerpo fuera de «Lo que falló y por qué», «Registro de cambios» y «Fuentes y comprobación»: se quedan viejas
  - Fuente: [F] https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices. Control: `.claude/skills.test.js`. Código: `fechas`.
- `sin-parada` — El «Método» (salvo en herramienta) dice cuándo se acaba y qué se ve cuando sale bien. Es heurístico: el control detecta la frase («Sale bien si», «Hecho cuando»…), no que el método diga de verdad cuándo acaba; candidato a revisar su capa
  - Fuente: [F] https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices. Control: `.claude/skills.test.js`. Código: `sin-parada`.
- `ejemplos` — Como mucho tres ejemplos por sección de ejemplos: pocos y canónicos
  - Fuente: [I] .claude/skills/forja-de-skills/referencias/criterios.md. Control: `.claude/skills.test.js`. Código: `ejemplos`.
- `tabla` — Las tablas tienen todas las filas del mismo ancho y ninguna celda vacía
  - Fuente: [I] .claude/skills/forja-de-skills/referencias/presentacion.md. Control: `.claude/skills.test.js`. Código: `tabla`.
- `cabeceras` — Las cabeceras bajan de nivel de una en una, sin saltar de ## a ####
  - Fuente: [I] .claude/skills/forja-de-skills/referencias/presentacion.md. Control: `.claude/skills.test.js`. Código: `cabeceras`.
- `tipo-sin-estandar` — Cada tipo de skill tiene su apartado en «El estándar de cada tipo» de la plantilla
  - Fuente: [I] .claude/PLANTILLA-SKILL.md. Control: `.claude/skills.test.js`. Código: `tipo-sin-estandar`.
- `apartado-ausente` — El estándar de cada tipo lleva «Qué lo hace bueno», «Errores típicos» y «Ejemplo mínimo», ninguno vacío
  - Fuente: [I] .claude/PLANTILLA-SKILL.md. Control: `.claude/skills.test.js`. Código: `apartado-ausente`.
- `pocos-puntos` — «Qué lo hace bueno» y «Errores típicos» de cada tipo tienen dos puntos como mínimo
  - Fuente: [I] .claude/PLANTILLA-SKILL.md. Control: `.claude/skills.test.js`. Código: `pocos-puntos`.
- `sin-fuente` — Cada punto del estándar de un tipo lleva su marca [F: fuente] o [I]
  - Fuente: [I] .claude/PLANTILLA-SKILL.md. Control: `.claude/skills.test.js`. Código: `sin-fuente`.
- `ejemplo-sin-origen` — El ejemplo mínimo de cada tipo dice «Real: `skill`» o «Esqueleto:» y va en un bloque de código
  - Fuente: [I] .claude/PLANTILLA-SKILL.md. Control: `.claude/skills.test.js`. Código: `ejemplo-sin-origen`.
- `ejemplo-largo` — El ejemplo mínimo de cada tipo tiene de 3 a 6 líneas
  - Fuente: [I] .claude/PLANTILLA-SKILL.md. Control: `.claude/skills.test.js`. Código: `ejemplo-largo`.
- `ejemplo-no-cuadra` — Un ejemplo «Real» sale tal cual de la skill que cita y es de ese tipo; un esqueleto solo vale mientras no haya ninguna skill del tipo
  - Fuente: [I] .claude/PLANTILLA-SKILL.md. Control: `.claude/skills.test.js`. Código: `ejemplo-no-cuadra`.

### formal · estandar (16)

- `estandar-fuente-con-forma` — Cada fuente del catálogo lleva id en minúsculas con guiones, nombre de diez caracteres o más y, si es externa, una url https válida; si es de la casa, la ruta de un fichero que existe y ninguna url
  - Fuente: [I] scripts/lib/estandaresAgentes.mjs. Control: `ops/estandares-agentes.test.js`.
- `estandar-fuente-documentacion-oficial` — Las fuentes externas son documentación pública de un dominio admitido (DOMINIOS_FUENTE), no blogs
  - Fuente: [I] scripts/lib/estandaresAgentes.mjs. Control: `ops/estandares-agentes.test.js`.
- `estandar-fuente-usada` — Toda fuente del catálogo la cita alguna tarea
  - Fuente: [I] scripts/lib/estandaresAgentes.mjs. Control: `ops/estandares-agentes.test.js`.
- `estandar-agente-con-lista` — Cada agente de .claude/agents/ tiene su lista de tareas en el catálogo y cada agente del catálogo existe
  - Fuente: [I] scripts/lib/estandaresAgentes.mjs. Control: `ops/estandares-agentes.test.js`.
- `estandar-estado-cerrado` — El estado de cada agente es uno del vocabulario (completo o pendiente)
  - Fuente: [I] scripts/lib/estandaresAgentes.mjs. Control: `ops/estandares-agentes.test.js`.
- `estandar-pendientes-solo-bajan` — Un agente pendiente está en la lista PENDIENTES_ADMITIDOS, que solo baja: un agente nuevo nace con todos sus estándares
  - Fuente: [I] scripts/lib/estandaresAgentes.mjs. Control: `ops/estandares-agentes.test.js`.
- `estandar-lista-minima` — La lista de tareas de un agente tiene al menos tres
  - Fuente: [I] scripts/lib/estandaresAgentes.mjs. Control: `ops/estandares-agentes.test.js`.
- `estandar-tarea-id` — El id de cada tarea va en minúsculas con guiones y no se repite dentro del agente
  - Fuente: [I] scripts/lib/estandaresAgentes.mjs. Control: `ops/estandares-agentes.test.js`.
- `estandar-tarea-frase` — «tarea» dice qué se hace en una frase de veinte caracteres o más
  - Fuente: [I] scripts/lib/estandaresAgentes.mjs. Control: `ops/estandares-agentes.test.js`.
- `estandar-tarea-origen` — El origen de cada tarea es una sección del propio agente (Misión y alcance, Disparadores, Método, Entregables): las tareas salen de lo que el agente ya dice
  - Fuente: [I] scripts/lib/estandaresAgentes.mjs. Control: `ops/estandares-agentes.test.js`.
- `estandar-completo-con-forma` — Una tarea de un agente completo lleva estándar de 60 caracteres o más, una lista de comprobaciones y una de lo que no hace; un pendiente no lleva estándar a medias
  - Fuente: [I] scripts/lib/estandaresAgentes.mjs. Control: `ops/estandares-agentes.test.js`.
- `estandar-fuente-citada` — Cada tarea completa cita al menos una fuente y todas están en el catálogo de fuentes
  - Fuente: [I] scripts/lib/estandaresAgentes.mjs. Control: `ops/estandares-agentes.test.js`.
- `estandar-seccion-generada` — La sección «Tareas y su estándar» de cada agente sale del catálogo y no se edita a mano
  - Fuente: [I] scripts/lib/estandaresAgentes.mjs. Control: `ops/estandares-agentes.test.js`.
- `practica-numero-de-bullets` — Una práctica lleva entre el mínimo y el máximo de bullets que declara forma_practica de su artefacto (hoy de 2 a 5 en un estándar)
  - Fuente: [I] scripts/lib/forjaForma.mjs. Control: `ops/forja-forma.test.js`.
- `practica-estructura-del-bullet` — Cada bullet de una práctica lleva sus cuatro partes en orden, regla · porqué · ejemplo bueno · ejemplo malo, ninguna vacía y con el ejemplo bueno distinto del malo
  - Fuente: [I] scripts/lib/forjaForma.mjs. Control: `ops/forja-forma.test.js`.
- `practica-fuente-por-bullet` — Cada bullet lleva su propia fuente: [F] con url https si es externa o [I] con la ruta de un fichero que existe si es de la casa
  - Fuente: [I] scripts/lib/forjaForma.mjs. Control: `ops/forja-forma.test.js`.

### formal · agente (0)

Ninguno todavía.

## Capa material

Heurística automática; lo que hoy incumple va a una lista de excepciones que solo baja.

### material · skill (13)

- `solape` — Dos descripciones no comparten más de un 25 % de sus palabras de cinco letras o más (antes de «No para:»): heurística propia que detecta dos skills que reclaman la misma petición. Casos medidos el 10 oct 2026 (nivel 2, fallos de disparo por solape) que lo prueban: forja-de-skills con higiene-de-skills, hetzner con 1password, issues con causa-raiz
  - Fuente: [I] scripts/lib/skillsForja.mjs. Control: `.claude/skills.test.js`. Código: `solape`.
- `solape-cercano` — Una descripción no se acerca al límite de solape con otra (a partir del 80 % del límite se avisa con la cifra)
  - Fuente: [I] scripts/lib/higieneSkills.mjs. Control: `scripts/higiene-skills.test.js`. Código: `solape-cercano`.
- `comando-suelto` — Un comando de la casa (npm run, gh, git…) va entre comillas invertidas o en un bloque, no suelto en la prosa: heurística sobre los comandos que las skills citan
  - Fuente: [I] scripts/lib/skillsForja.mjs. Control: `.claude/skills.test.js`. Código: `comando-suelto`.
- `caduca-pronto` — Una skill no llega a caducar sin avisar: a menos de 30 días del plazo de 90 se avisa
  - Fuente: [I] scripts/lib/higieneSkills.mjs. Control: `scripts/higiene-skills.test.js`. Código: `caduca-pronto`.
- `comando-muerto` — Todo npm run citado en la parte viva de la skill existe en package.json
  - Fuente: [I] scripts/lib/higieneSkills.mjs. Control: `scripts/higiene-skills.test.js`. Código: `comando-muerto`.
- `ruta-muerta` — Toda ruta del repo citada en la parte viva de la skill existe, también fuera de comillas invertidas
  - Fuente: [I] scripts/lib/higieneSkills.mjs. Control: `scripts/higiene-skills.test.js`. Código: `ruta-muerta`.
- `skill-muerta` — Toda skill nombrada tras la palabra «skill» existe
  - Fuente: [I] scripts/lib/higieneSkills.mjs. Control: `scripts/higiene-skills.test.js`. Código: `skill-muerta`.
- `descripcion-sin-palabras` — El disparador de la descripción trae al menos una frase entre «» tal como la diría quien pide
  - Fuente: [I] scripts/lib/higieneSkills.mjs. Control: `scripts/higiene-skills.test.js`. Código: `descripcion-sin-palabras`.
- `frontera-vaga` — El «No para:» nombra la skill, el agente, el comando o el fichero a donde va lo que no es suyo
  - Fuente: [I] scripts/lib/higieneSkills.mjs. Control: `scripts/higiene-skills.test.js`. Código: `frontera-vaga`.
- `tamano-cerca` — SKILL.md no pasa del 85 % de sus líneas permitidas: la siguiente entrada lo desbordaría
  - Fuente: [I] scripts/lib/higieneSkills.mjs. Control: `scripts/higiene-skills.test.js`. Código: `tamano-cerca`.
- `caso-duplicado` — Dos casos de prueba, de la misma skill o de otra, no piden casi lo mismo (parecido de raíces de cinco letras por debajo de 0,6)
  - Fuente: [I] scripts/lib/higieneSkills.mjs. Control: `scripts/higiene-skills.test.js`. Código: `caso-duplicado`.
- `caso-en-frontera` — Una petición propia de la skill no usa las palabras de lo que su «No para:» deja a otra skill
  - Fuente: [I] scripts/lib/higieneSkills.mjs. Control: `scripts/higiene-skills.test.js`. Código: `caso-en-frontera`.
- `vocabulario-canonico` — Una cosa se llama siempre igual: ningún artefacto usa un sinónimo prohibido en vez del término canónico del glosario único. Su control y su glosario los da el encargo #469 (ops/glosario.json y ops/glosario.test.js); hasta que existan, el control es un juicio
  - Fuente: [I] docs/ops/FORJA.md. Control: juicio (provisional: lo da #469 con `ops/glosario.test.js`).

### material · estandar (4)

- `practica-voz-activa` — La regla y su porqué van en voz activa, sin pasiva con «ser» ni pasiva refleja con «se»: heurística sobre el texto, que no entiende la frase; orientativo hasta que #454 la calibre con estándares reales
  - Fuente: [I] scripts/lib/forjaForma.mjs. Control: `ops/forja-forma.test.js`.
- `practica-modo-tiempo-persona` — La regla usa un solo modo y tiempo verbal y una sola persona, los declarados en forma_practica (hoy imperativo, segunda persona): heurística que detecta futuros, pasados, sujetos nominales y modales; orientativo hasta que #454 la calibre con estándares reales
  - Fuente: [I] scripts/lib/forjaForma.mjs. Control: `ops/forja-forma.test.js`.
- `estandar-rondas-de-investigacion` — Un estándar deja el rastro de tres rondas de investigación o más (buscar, contrastar, destilar), cada una con una línea «ronda: n fuentes: k cambios: …» y fuentes mayores que 0; lo que hoy no lo cumple va a una lista de excepciones que solo baja
  - Fuente: [I] scripts/lib/forjaForma.mjs. Control: `ops/forja-forma.test.js`.
- `vocabulario-canonico` — Una cosa se llama siempre igual: ningún artefacto usa un sinónimo prohibido en vez del término canónico del glosario único. Su control y su glosario los da el encargo #469 (ops/glosario.json y ops/glosario.test.js); hasta que existan, el control es un juicio
  - Fuente: [I] docs/ops/FORJA.md. Control: juicio (provisional: lo da #469 con `ops/glosario.test.js`).

### material · agente (0)

Ninguno todavía.

## Capa subjetiva

Una rúbrica escrita que un LLM puntúa sobre casos; para lo que no se puede discretizar.

### subjetiva · skill (13)

- `descripcion-palabras-de-quien-pide` — La descripción dice qué hace la skill y cuándo se abre, con las palabras con que lo pediría una persona con prisa. Cumple si un lector que solo vea la descripción reconoce su petición en ella. No cumple si es genérica («ayuda con documentos») o repite el vocabulario interno de la skill en vez del de quien pide.
  - Calibración: 3 casos con respuesta conocida (cumple, no_cumple, no_cumple).
  - Fuente: [F] https://agentskills.io/skill-creation/optimizing-descriptions. Control: juicio.
- `frontera-casi-fallos` — Los casos de frontera son casi-fallos: peticiones que se parecen mucho a las de la skill y son de otra. Cumple si una descripción vaga los confundiría con la skill. No cumple si son obvios («¿qué tiempo hace?») y cualquier descripción los separa.
  - Calibración: 3 casos con respuesta conocida (cumple, no_cumple, cumple).
  - Fuente: [F] https://agentskills.io/skill-creation/optimizing-descriptions. Control: juicio.
- `disparador-al-principio` — Lo esencial de la descripción va al principio, porque el listado se trunca. Cumple si el cuándo y las palabras clave están en los primeros 250 caracteres. No cumple si el disparador principal queda al final o cortado.
  - Calibración: 3 casos con respuesta conocida (cumple, no_cumple, cumple).
  - Fuente: [F] https://code.claude.com/docs/en/skills. Control: juicio.
- `solo-lo-que-el-modelo-no-sabe` — Cada párrafo justifica su coste en cada sesión: solo dice lo que el modelo no sabría sin la skill. Cumple si quitar un párrafo cambiaría lo que hace quien la lee. No cumple si explica lo que el modelo ya hace bien o pega la documentación del proveedor.
  - Calibración: 3 casos con respuesta conocida (cumple, no_cumple, cumple).
  - Fuente: [F] https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices. Control: juicio.
- `libertad-ajustada` — La libertad de cada instrucción se ajusta a lo frágil que es la tarea. Cumple si donde un error cuesta caro (un borrado, una clave) hay pasos exactos o un script, y donde no, una heurística. No cumple si hay pasos rígidos en lo abierto o vaguedad en lo irreversible.
  - Calibración: 3 casos con respuesta conocida (cumple, no_cumple, no_cumple).
  - Fuente: [F] https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices. Control: juicio.
- `camino-por-defecto` — Hay un camino por defecto y, aparte, la salida para el caso raro. Cumple si ante una petición normal está claro qué hacer primero. No cumple si ofrece un menú («usa A, o B, o C») sin decir cuál.
  - Calibración: 3 casos con respuesta conocida (cumple, no_cumple, cumple).
  - Fuente: [F] https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices. Control: juicio.
- `pasos-con-salida-observable` — Cada paso dice qué se ve cuando sale bien, de modo que quien lo hace sabe si avanza o debe parar. Cumple si un paso se puede comprobar mirando una salida, un fichero o un estado. No cumple si pide «comprobar que esté bien» sin decir cómo.
  - Calibración: 3 casos con respuesta conocida (cumple, no_cumple, cumple).
  - Fuente: [F] https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices. Control: juicio.
- `vocabulario-unico` — Una palabra por cosa en toda la skill. Cumple si el mismo concepto siempre se llama igual. No cumple si alterna «caso», «incidente» y «fallo» para lo mismo.
  - Calibración: 3 casos con respuesta conocida (cumple, no_cumple, cumple).
  - Fuente: [F] https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices. Control: juicio.
- `ejemplos-canonicos` — Los ejemplos son pocos, representativos y no se contradicen con la norma de la propia skill. Cumple si cada ejemplo enseña la regla sin romperla. No cumple si es una lista de casos límite o un ejemplo viola lo que la skill enseña.
  - Calibración: 3 casos con respuesta conocida (cumple, no_cumple, cumple).
  - Fuente: [I] .claude/skills/forja-de-skills/referencias/criterios.md. Control: juicio.
- `casos-medidos-con-y-sin-skill` — Los casos se escribieron antes que el texto y se midió si la skill mejora sobre el modelo solo, con más de una ejecución. Cumple si hay cifra con y sin skill. No cumple si solo se probó una vez con la skill puesta. Hoy no existe la medida automática con y sin skill: el nivel 2 mide solo con ella. Cifra de partida (comprobaciones del nivel 2, 10 oct 2026): higiene-de-skills cumple 5 de 12 y forja-de-skills 12 de 16.
  - Calibración: 3 casos con respuesta conocida (cumple, no_cumple, cumple).
  - Fuente: [F] https://agentskills.io/skill-creation/evaluating-skills. Control: juicio.
- `skill-contrastada-con-fallo-real` — La skill nace de un fallo real visto sin ella, no de lo que se imagina que hará falta. Cumple si el PR o «Lo que falló y por qué» cuentan en qué fallaba la sesión sin la skill. No cumple si sale de documentación copiada o de una lista de buenas intenciones.
  - Calibración: 3 casos con respuesta conocida (cumple, no_cumple, no_cumple).
  - Fuente: [I] .claude/skills/forja-de-skills/SKILL.md. Control: juicio.
- `forma-adecuada-al-contenido` — Cada contenido va en su forma: tabla para datos comparables, lista numerada para pasos con orden, viñetas sin orden, negrita solo para lo que no puede pasar desapercibido, párrafos cortos. Cumple si cambiar la forma de un trozo lo empeoraría. No cumple si hay razonamiento metido en celdas, negrita decorativa o muros de texto.
  - Calibración: 3 casos con respuesta conocida (cumple, no_cumple, cumple).
  - Fuente: [I] .claude/skills/forja-de-skills/referencias/presentacion.md. Control: juicio.
- `sin-duda-con-vecina` — Una petición real tiene una sola skill dueña. Cumple si dos personas leyendo las descripciones de esta y de su vecina eligen la misma para una petición dada. No cumple si hay peticiones en las que dudarían entre las dos.
  - Calibración: 3 casos con respuesta conocida (cumple, no_cumple, no_cumple).
  - Fuente: [I] .claude/skills/forja-de-skills/referencias/criterios.md. Control: juicio.

### subjetiva · estandar (3)

- `estandar-concreto-y-verificable` — El estándar de una tarea dice qué es hacerla bien de forma que otra persona pueda comprobarlo mirando el resultado. Cumple si cada punto de «comprueba» se puede contrastar con una salida, un diff o un fichero. No cumple si es una declaración de intenciones («con cuidado», «de forma robusta»).
  - Calibración: 3 casos con respuesta conocida (cumple, no_cumple, cumple).
  - Fuente: [I] scripts/lib/estandaresAgentes.mjs. Control: juicio.
- `estandar-respaldado-por-su-fuente` — La fuente citada respalda de verdad lo que dice el estándar. Cumple si quien lee la fuente encuentra la práctica que el estándar enuncia. No cumple si la fuente es de otro tema o solo comparte palabras con el estándar.
  - Calibración: 3 casos con respuesta conocida (cumple, no_cumple, cumple).
  - Fuente: [I] ops/estandares-agentes.json. Control: juicio.
- `estandar-no-hace-delimita` — «no_hace» marca la frontera con lo que es de otro agente o de una persona. Cumple si cada exclusión nombra algo que se podría confundir con la tarea. No cumple si son exclusiones obvias o si deja sin decir lo que más se parece.
  - Calibración: 3 casos con respuesta conocida (cumple, no_cumple, cumple).
  - Fuente: [I] ops/estandares-agentes.json. Control: juicio.

### subjetiva · agente (0)

Ninguno todavía.
