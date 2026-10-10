# Forja: criterios de calidad

<!-- Generado desde ops/forja.json con «npm run forja -- --escribir». No se edita a mano: ops/forja.test.js lo compara. -->

La única fuente de lo que se le pide a una skill, a un estándar de agente y a lo que venga es `ops/forja.json`. Tres capas, porque convertir algo continuo en atributos discretos nunca cubre todo; para los huecos están los textos que juzga un LLM. La capa de cada criterio solo sube (`ops/forja-capas.json`). Cómo se redacta cada criterio, y cualquier otra regla de la casa: [REDACCION.md](REDACCION.md).

## Cifras

| Capa | skill | estandar | agente | Criterios |
|---|---|---|---|---|
| formal | 26 | 16 | 0 | 42 |
| material | 13 | 4 | 0 | 16 |
| subjetiva | 13 | 3 | 0 | 16 |
| total | 52 | 23 | 0 | 74 |

Un criterio que se aplica a dos artefactos cuenta en las dos columnas y una vez en el total.

## Cómo se escribe un criterio

Cada criterio se escribe por campos y su frase se genera; no hay prosa libre. La forma sigue EARS (Mavin et al., Rolls-Royce, 2009) y las palabras de RFC 2119. El esquema vive en `scripts/lib/regla.mjs`, para que lo reutilicen las normas y las obligaciones del flujo (#488). La frase es: **Nombre.** [Condición,] sujeto DEBE | NO DEBE exigencia. Se comprueba con: control. Con `conviene`: [Condición, para] sujeto, CONVIENE exigencia.

| Campo | Qué es |
|---|---|
| nombre | Sustantivo corto de 2 a 5 palabras, con mayúscula inicial y sin punto; no se repite |
| sujeto | La parte de un artefacto que se juzga, de un vocabulario cerrado (tabla de abajo) |
| fuerza | `debe`, `no_debe` o `conviene` (tabla de abajo) |
| condicion | Opcional; empieza por «cuando» o «si» |
| exigencia | El único hueco de texto: una frase verbal en infinitivo, sin sujeto ni punto final, de 160 caracteres como mucho |
| cumple, no_cumple | Solo en los subjetivos: la rúbrica que puntúa un LLM |
| nota | Opcional: un matiz que la exigencia no admite (una heurística, una cifra); de 400 caracteres como mucho |
| control | Un fichero que lo vigila, o `juicio` |

| Fuerza | Palabra | Qué quiere decir |
|---|---|---|
| debe | DEBE | Obligatoria: sin ella la regla no se cumple (RFC 2119, MUST) |
| no_debe | NO DEBE | Prohibida: hacerlo incumple la regla (RFC 2119, MUST NOT) |
| conviene | CONVIENE | Recomendada: se avisa, pero no impide seguir (RFC 2119, SHOULD) |

| Sujeto | En la frase | Se aplica a | Criterios |
|---|---|---|---|
| skill | cada skill | skill | 4 |
| skill.metadatos | el frontmatter de cada skill | skill | 5 |
| skill.descripcion | la descripción de cada skill | skill | 7 |
| skill.cuerpo | el cuerpo de cada skill | skill | 22 |
| skill.casos | el conjunto de casos de prueba de cada skill | skill | 6 |
| plantilla.tipo | la plantilla de skills | skill | 7 |
| estandar | cada tarea del catálogo de estándares | estandar | 9 |
| estandar.practica | la práctica de un estándar | estandar | 5 |
| estandar.fuente | cada fuente del catálogo de estándares | estandar | 3 |
| agente | cada agente | estandar | 5 |
| artefacto | todo artefacto de la forja | skill, estandar, agente | 1 |

## Tipos de skill

Taxonomía decidida por Pablo el 10 oct 2026. Un tipo existe solo si cambia qué entra y sale, cómo se prueba y cómo se corrige. **La única lista de tipos es la de `ops/forja.json`** (`tipos_skill`). El molde de cada tipo (sus secciones, los campos de la ficha, cómo se prueba y su ejemplo) se genera en `.claude/plantillas-skill/<tipo>.md` con `npm run plantillas -- --escribir` (#495), y el `tipo` del frontmatter de cada skill es el que dan sus respuestas.

| Tipo | Qué hace | Entra → sale | Prueba | Skills de hoy |
|---|---|---|---|---|
| servicio | Operar un sistema externo concreto | petición → comando y resultado esperado | los comandos existen, la salida es comprobable y la caducidad es corta | github, vercel, supabase, telegram, hetzner, tailscale, 1password |
| procedimiento | Pasos fijos que cambian algo | situación → cambio hecho y comprobado | cada paso con su verificación y su marcha atrás | alta-de-secreto |
| diagnostico | De un síntoma a su causa | fallo → causa en campos cerrados | la salida rellena la ficha y hay un criterio de parada | causa-raiz |
| decision | Elegir entre opciones con criterios | dilema → opción y porqué | cada criterio aplicado y la escalera seguida | plan-de-arreglo |
| flujo | Encadenar skills y agentes | caso → cerrado por etapas | cada etapa apunta a una skill o agente que existe y tiene puerta | issues |
| revision | Juzgar un artefacto contra un catálogo y aplicar lo mecánico | artefacto → criterio, estado y arreglo | una pieza mala a propósito da todos sus fallos | higiene-de-skills |
| conocimiento | Lo que hay que saber del negocio | pregunta → dato y dónde vive | cada afirmación apunta a su fuente | ninguna |

El tipo de una skill sale de `tipoDeSkill(respuestas)`: el de la primera pregunta con sí, en este orden; si ninguna, `conocimiento`.

| # | Clave | Pregunta | Tipo |
|---|---|---|---|
| 1 | opera_proveedor | ¿Opera un sistema o proveedor externo concreto? | servicio |
| 2 | juzga_artefacto | ¿Juzga un artefacto que ya existe? | revision |
| 3 | encadena | ¿Encadena skills o agentes? | flujo |
| 4 | pasos_fijos | ¿Son pasos fijos con comprobación? | procedimiento |
| 5 | sintoma_a_causa | ¿Va de un síntoma a su causa? | diagnostico |
| 6 | elige_opciones | ¿Elige entre opciones con criterios? | decision |

Skills sin ningún sí (provisionales, con su motivo en `skills_provisionales`): `estilo-de-respuesta`, `issues`.

| Eje de la ficha de una skill | Valores |
|---|---|
| libertad | alta, media, baja |
| invocacion | descripcion, guardia, precarga |

Los tipos retirados al migrar (#495) y a cuáles pasan; no vuelven a usarse:

| Tipo retirado | Destino |
|---|---|
| herramienta | servicio, flujo |
| oficio | diagnostico, decision |
| dominio | conocimiento |
| estandar | conocimiento |
| receta_cambio | procedimiento |
| rubrica_juez | revision |
| investigacion | procedimiento |
| meta | revision |
| forja | sin sucesor |

Cada skill declara en su ficha (frontmatter) sus respuestas a las preguntas y su `tipo`, que tiene que ser el que ellas dan: la base es norma y no guarda datos de cada pieza (`ops/forja-tipos.test.js` y `.claude/skills.test.js`). Niveles:

| Nivel | Qué es |
|---|---|
| 0 | Pieza meta de una familia (skills hoy; la de estándares vendrá): de ella salen las plantillas por tipo. Sin tipo de skill y exactamente una por familia |
| 1 | Plantilla por tipo, generada en .claude/plantillas-skill/<tipo>.md: no es una skill |
| 2 | Skill concreta, con su tipo (el que dan sus respuestas); es el nivel si la ficha no dice otro |

Herencia: esqueleto común (la base) → plantilla por tipo (los criterios que le tocan, `tipos` de cada criterio) → cada skill. Criterios de skill por tipo y capa:

| Tipo | formal | material | subjetiva | Criterios |
|---|---|---|---|---|
| servicio | 25 | 13 | 13 | 51 |
| procedimiento | 26 | 13 | 13 | 52 |
| diagnostico | 26 | 13 | 13 | 52 |
| decision | 26 | 13 | 13 | 52 |
| flujo | 26 | 13 | 13 | 52 |
| revision | 26 | 13 | 13 | 52 |
| conocimiento | 26 | 13 | 13 | 52 |

## Discreto y texto: los campos de cada ficha

Se sistematiza lo máximo posible con atributos discretos, aunque lo continuo nunca cabe entero en ellos. Un texto solo se admite como **hueco** (`hueco: true`) con una frase que diga qué cubre que lo discreto no alcanza; los textos que lee un LLM rellenan los huecos, y corregir es «qué falla en qué hueco». `problemasDeCampos` falla con un texto sin hueco, un enum fuera de vocabulario o una ref que no existe. El trinquete de campos (`ops/forja-campos.json`) solo deja pasar un campo de texto a discreto, nunca al revés.

| Clase | Qué es |
|---|---|
| bool | Verdadero o falso |
| enum | Un valor de un vocabulario cerrado |
| ref | Apunta a algo que existe: skill, agente, criterio, ruta, comando, issue, fuente, evidencia o versión |
| numero | Un número |
| fecha | Una fecha AAAA-MM-DD |
| texto | Prosa: solo como hueco, con su motivo |
| regla | Una regla por campos (nombre, sujeto, fuerza, exigencia…); la valida problemasDeRegla con el vocabulario de sujetos de su catálogo |

| Artefacto | Campos discretos | Huecos de texto | Campos |
|---|---|---|---|
| skill | 13 | 2 | 15 |
| estandar | 4 | 3 | 7 |
| agente | 3 | 1 | 4 |
| juicio | 6 | 1 | 7 |
| criterio | 2 | 6 | 8 |

### Campos de skill

El frontmatter de .claude/skills/<skill>/SKILL.md (name y description arriba; tipo, dueno y comprobado en metadata). Los juicios de sus criterios de juicio van aparte, en ops/juicios-skills/<skill>.json (campos_ficha.juicio, #457).

- `name` — ref a skill
- `description` — texto. Hueco: El cuándo se abre la skill dicho con las palabras de quien pide: lo discreto no lo alcanza, es prosa para que el modelo reconozca una petición
- `tipo` — enum (tipos_skill), opcional
- `opera_proveedor` — bool, opcional
- `juzga_artefacto` — bool, opcional
- `encadena` — bool, opcional
- `pasos_fijos` — bool, opcional
- `sintoma_a_causa` — bool, opcional
- `elige_opciones` — bool, opcional
- `porque_tipo` — texto, opcional. Hueco: Por qué responde así cuando la respuesta no es evidente (una skill que podría parecer de otro tipo): el motivo cambia con cada skill
- `nivel` — enum (niveles), opcional
- `dueno` — ref a agente
- `comprobado` — fecha
- `libertad` — enum (libertad), opcional
- `invocacion` — enum (invocacion), opcional

### Campos de estandar

Una tarea de un agente en ops/estandares-agentes.json (la clave es su id). Su estándar son sus reglas por campos (#516); las compartidas por varios agentes están en comunes y la tarea las nombra.

- `tarea` — texto. Hueco: La frase que dice qué se hace en esa tarea: el verbo y su objeto no caben en un vocabulario cerrado
- `accion` — enum (accion_tarea)
- `origen` — enum (origen_tarea)
- `comunes` — ref a estandar_comun, lista, opcional
- `reglas` — regla, lista
- `no_hace` — texto, lista, opcional. Hueco: La frontera con lo que es de otro agente o de una persona, que hay que nombrar caso a caso
- `rondas` — texto, lista, opcional. Hueco: Lo que cambió en cada ronda de investigación, una frase por ronda: el número y las fuentes son discretos, el cambio no cabe en un vocabulario

### Campos de agente

El frontmatter de .claude/agents/<agente>.md.

- `name` — ref a agente
- `description` — texto. Hueco: El cuándo se usa el agente y su frontera con los demás, dicho con las palabras de quien pide
- `model` — enum (modelo_agente)
- `skills` — ref a skill, lista, opcional

### Campos de juicio

Un juicio de skill: el estado de un criterio de juicio (control «juicio») sobre una skill, en ops/juicios-skills/<skill>.json bajo el id del criterio (#457). Los criterios con control no se escriben: los calcula su control. Lo valida scripts/lib/juiciosSkills.mjs.

- `estado` — enum (estados_criterio)
- `evidencia` — ref a evidencia, lista, opcional
- `motivo_pendiente` — enum (motivos_pendiente), opcional
- `nota` — texto, opcional. Hueco: Lo propio de esta skill que el estado no dice: qué falla en el hueco o qué falta mirar; lo que es del criterio va al criterio
- `fecha` — fecha, opcional
- `firmante` — enum (firmantes), opcional
- `version_skill_md` — ref a version, opcional

### Campos de criterio

Un criterio de este catálogo, redactado por campos (scripts/lib/regla.mjs): nombre, sujeto, fuerza, condicion, exigencia y, en los subjetivos, cumple y no_cumple. El resto de sus campos (id, capa, aplica_a, fuente, control, codigo) los vigila problemasDeForja.

- `nombre` — texto. Hueco: La etiqueta corta con que se nombra la regla (2 a 5 palabras): un nombre no cabe en un vocabulario cerrado
- `sujeto` — enum (sujeto)
- `fuerza` — enum (fuerza)
- `condicion` — texto, opcional. Hueco: Cuándo se aplica la regla («cuando …» o «si …»): la situación cambia con cada regla y no tiene vocabulario común
- `exigencia` — texto. Hueco: Lo que pide la regla, una frase verbal en infinitivo: el verbo y su objeto no caben en un vocabulario cerrado
- `cumple` — texto, opcional. Hueco: Cuándo da por buena la regla el juicio de un LLM (solo los subjetivos): es la rúbrica y se escribe caso a caso
- `no_cumple` — texto, opcional. Hueco: Cuándo da por mala la regla el juicio de un LLM (solo los subjetivos): es la rúbrica y se escribe caso a caso
- `nota` — texto, opcional. Hueco: Un matiz que la exigencia no admite (una heurística, una cifra medida, un caso que la prueba): es contexto y no cabe en un campo discreto

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

| Estado de un criterio | Qué quiere decir |
|---|---|
| cumple | Lo comprobó un control o un juicio y se cumple |
| no_cumple | Lo comprobó un control o un juicio y no se cumple |
| no_aplica | El criterio no se aplica a este artefacto |
| juicio | Pendiente de juicio: lo puntúa un LLM o una persona y aún no se ha hecho |

El estado de un criterio sobre un artefacto es una línea `<artefacto>: <nombre> criterio: <id> estado: <estado>`; solo no_cumple y juicio llevan `nota:` (el hueco). Los juicios de skill (los criterios de juicio de cada skill, con su evidencia) viven en `ops/juicios-skills/<skill>.json` y sus campos son los de `campos_ficha.juicio`.

| Motivo de un pendiente | Qué quiere decir | Dónde se escribe |
|---|---|---|
| falta_herramienta | Falta el control o la medida que lo comprobaría (un test, el A/B con y sin skill) | criterio, juicio |
| falta_decision | Falta decidir en la base cómo se aplica (a un tipo, o si no existe la pieza que juzga) | criterio, juicio |
| sin_mirar | Nadie lo ha juzgado todavía | juicio |
| sin_pasada | Se juzga con una pasada del nivel 2 vigente, y no la hay | juicio, calculado |
| otra_version | Se juzgó sobre otra versión del SKILL.md: hay que volver a juzgarlo | calculado |

## Promoción de una rúbrica

Un criterio subjetivo lleva casos de calibración (un texto de ejemplo y el estado que se espera, cumple o no_cumple) y solo puede marcarse `listo_para_subir` si sus medidas cumplen la promoción: coincidencia del juez con la respuesta conocida de al menos **0.9** en **10** repeticiones.

**Estos valores son un primer tiro, pendientes de ajustar con datos.** Están en el bloque `promocion` de `ops/forja.json` y se cambian ahí; aún no hay juez montado ni medidas. Subir de capa sigue siendo editar el criterio; el trinquete (`ops/forja-capas.json`) impide bajar.

Marca de la fuente: **[F]** está en una fuente externa (con su URL); **[I]** es de la casa (con la ruta del repo donde está escrito).

## Capa formal

Esquema y forma: determinista, lo vigila un test del CI.

### formal · skill (26)

- `frontmatter` — **Frontmatter cerrado.** El frontmatter de cada skill DEBE llevar solo name, description y metadata, con name igual que la carpeta y la description con «Úsala » al principio, «No para:» y de 81 a 600 caracteres. Se comprueba con: `.claude/skills.test.js`.
  - Nota: La description queda por debajo de los 1.024 caracteres del estándar abierto.
  - Fuente: [F] https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices. Código: `frontmatter`.
- `tipo` — **Tipo de skill.** El frontmatter de cada skill DEBE llevar en metadata.tipo uno de los tipos de tipos_skill de ops/forja.json, el que dan sus respuestas. Se comprueba con: `.claude/skills.test.js`.
  - Fuente: [I] scripts/lib/skills.mjs. Código: `tipo`.
- `dueno` — **Dueño de la skill.** El frontmatter de cada skill DEBE llevar en metadata.dueno un agente de .claude/agents/ que la carga en su campo skills. Se comprueba con: `.claude/skills.test.js`.
  - Fuente: [I] scripts/lib/skills.mjs. Código: `dueno`.
- `comprobado` — **Fecha de comprobación.** El frontmatter de cada skill DEBE llevar en metadata.comprobado una fecha AAAA-MM-DD no futura, y decir en el texto «Comprobado el <fecha>: …» con qué se comprobó ese día. Se comprueba con: `.claude/skills.test.js`.
  - Fuente: [I] scripts/lib/skills.mjs. Código: `comprobado`.
- `caducada` — **Comprobación vigente.** Si un PR toca la skill, el frontmatter de cada skill DEBE tener la fecha de comprobado a 90 días como mucho. Se comprueba con: `scripts/skills-pr.test.js`.
  - Nota: El reloj no va en npm test sino en el paso «Skills del PR» del CI.
  - Fuente: [I] scripts/lib/skills.mjs. Código: `caducada`.
- `secciones` — **Secciones por tipo.** El cuerpo de cada skill DEBE llevar las secciones de su tipo, en su orden y ninguna vacía, con el título «# …» arriba. Se comprueba con: `.claude/skills.test.js`.
  - Fuente: [I] .claude/PLANTILLA-SKILL.md. Código: `secciones`.
- `formato` — **Formato de la skill.** El cuerpo de cada skill DEBE llevar tabla de operaciones, fallos con fecha, causa y arreglo, registro de cambios fechado y última línea «Comprobado el …» o «Sin comprobar: …». Se comprueba con: `.claude/skills.test.js`.
  - Nota: La tabla de operaciones lleva «Debe salir» en las herramientas.
  - Fuente: [I] .claude/PLANTILLA-SKILL.md. Código: `formato`.
- `tamano` — **Tamaño del cuerpo.** El cuerpo de cada skill DEBE tener SKILL.md de 220 líneas como mucho, con el detalle en ficheros de capa. Se comprueba con: `.claude/skills.test.js`.
  - Nota: La guía oficial pide menos de 500 líneas.
  - Fuente: [F] https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices. Código: `tamano`.
- `secretos` — **Sin secretos.** Cada skill NO DEBE contener ningún patrón de clave ni cadena de conexión con contraseña, ni en sus capas. Se comprueba con: `.claude/skills.test.js`.
  - Fuente: [I] scripts/lib/skills.mjs. Código: `secretos`.
- `rutas` — **Rutas existentes.** El cuerpo de cada skill DEBE citar entre comillas invertidas solo ficheros del repo que existen. Se comprueba con: `.claude/skills.test.js`.
  - Fuente: [F] https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices. Código: `rutas`.
- `estructura` — **Estructura de la carpeta.** Cada skill DEBE tener en su carpeta solo SKILL.md, casos.json y las capas conocidas, a un nivel, cada capa citada desde SKILL.md con su ruta entera. Se comprueba con: `.claude/skills.test.js`.
  - Fuente: [F] https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices. Código: `estructura`.
- `copiado` — **Saber sin copiar.** El cuerpo de cada skill NO DEBE repetir un párrafo largo idéntico al de otra skill: el saber vive en una y la otra la cita por su nombre. Se comprueba con: `.claude/skills.test.js`.
  - Fuente: [I] scripts/lib/skills.mjs. Código: `copiado`.
- `casos` — **Casos mínimos.** El conjunto de casos de prueba de cada skill DEBE ser un casos.json válido con cuatro casos como mínimo: tres que cargan la skill con debe_salir comprobable y al menos uno de frontera. Se comprueba con: `.claude/skills.test.js`.
  - Fuente: [F] https://agentskills.io/skill-creation/evaluating-skills. Código: `casos`.
- `casos-negativos` — **Casos de frontera.** El conjunto de casos de prueba de cada skill DEBE incluir al menos tres casos de frontera: peticiones parecidas que son de otra skill o de ninguna. Se comprueba con: `.claude/skills.test.js`.
  - Fuente: [F] https://agentskills.io/skill-creation/optimizing-descriptions. Código: `casos-negativos`.
- `fechas` — **Sin fechas en el cuerpo.** El cuerpo de cada skill NO DEBE llevar fechas fuera de «Lo que falló y por qué», «Registro de cambios» y «Fuentes y comprobación»: se quedan viejas. Se comprueba con: `.claude/skills.test.js`.
  - Fuente: [F] https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices. Código: `fechas`.
- `sin-parada` — **Parada del método.** El cuerpo de cada skill DEBE decir en el «Método» cuándo se acaba y qué se ve cuando sale bien. Se comprueba con: `.claude/skills.test.js`.
  - Nota: Es heurístico: el control detecta la frase («Sale bien si», «Hecho cuando»…), no que el método diga de verdad cuándo acaba; candidato a revisar su capa. Se exceptúa el tipo servicio, que no tiene «Método».
  - Fuente: [F] https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices. Código: `sin-parada`.
- `ejemplos` — **Máximo de ejemplos.** El cuerpo de cada skill DEBE llevar como mucho tres ejemplos por sección de ejemplos: pocos y canónicos. Se comprueba con: `.claude/skills.test.js`.
  - Fuente: [I] .claude/skills/forja-de-skills/referencias/criterios.md. Código: `ejemplos`.
- `tabla` — **Tablas regulares.** El cuerpo de cada skill DEBE tener tablas con todas las filas del mismo ancho y ninguna celda vacía. Se comprueba con: `.claude/skills.test.js`.
  - Fuente: [I] .claude/skills/forja-de-skills/referencias/presentacion.md. Código: `tabla`.
- `cabeceras` — **Cabeceras ordenadas.** El cuerpo de cada skill DEBE bajar las cabeceras de nivel de una en una, sin saltar de ## a ####. Se comprueba con: `.claude/skills.test.js`.
  - Fuente: [I] .claude/skills/forja-de-skills/referencias/presentacion.md. Código: `cabeceras`.
- `tipo-sin-estandar` — **Apartado por tipo.** La plantilla de skills DEBE tener para cada tipo de skill su apartado en «El estándar de cada tipo». Se comprueba con: `.claude/skills.test.js`.
  - Fuente: [I] .claude/PLANTILLA-SKILL.md. Código: `tipo-sin-estandar`.
- `apartado-ausente` — **Apartados del tipo.** La plantilla de skills DEBE llevar en el estándar de cada tipo «Qué lo hace bueno», «Errores típicos» y «Ejemplo mínimo», ninguno vacío. Se comprueba con: `.claude/skills.test.js`.
  - Fuente: [I] .claude/PLANTILLA-SKILL.md. Código: `apartado-ausente`.
- `pocos-puntos` — **Puntos mínimos.** La plantilla de skills DEBE llevar dos puntos como mínimo en «Qué lo hace bueno» y en «Errores típicos» de cada tipo. Se comprueba con: `.claude/skills.test.js`.
  - Fuente: [I] .claude/PLANTILLA-SKILL.md. Código: `pocos-puntos`.
- `sin-fuente` — **Marca de fuente.** La plantilla de skills DEBE marcar cada punto del estándar de un tipo con su [F: fuente] o [I]. Se comprueba con: `.claude/skills.test.js`.
  - Fuente: [I] .claude/PLANTILLA-SKILL.md. Código: `sin-fuente`.
- `ejemplo-sin-origen` — **Origen del ejemplo.** La plantilla de skills DEBE decir en el ejemplo mínimo de cada tipo «Real: `skill`» o «Esqueleto:» y ponerlo en un bloque de código. Se comprueba con: `.claude/skills.test.js`.
  - Fuente: [I] .claude/PLANTILLA-SKILL.md. Código: `ejemplo-sin-origen`.
- `ejemplo-largo` — **Ejemplo breve.** La plantilla de skills DEBE dar al ejemplo mínimo de cada tipo de 3 a 6 líneas. Se comprueba con: `.claude/skills.test.js`.
  - Fuente: [I] .claude/PLANTILLA-SKILL.md. Código: `ejemplo-largo`.
- `ejemplo-no-cuadra` — **Ejemplo fiel.** La plantilla de skills DEBE sacar un ejemplo «Real» tal cual de la skill que cita, que es de ese tipo; un esqueleto solo vale mientras no haya ninguna skill del tipo. Se comprueba con: `.claude/skills.test.js`.
  - Fuente: [I] .claude/PLANTILLA-SKILL.md. Código: `ejemplo-no-cuadra`.

### formal · estandar (16)

- `estandar-fuente-con-forma` — **Forma de la fuente.** Cada fuente del catálogo de estándares DEBE llevar id en minúsculas con guiones y nombre de diez caracteres o más; la externa, url https válida; la de la casa, ruta de un fichero que existe y sin url. Se comprueba con: `ops/estandares-agentes.test.js`.
  - Fuente: [I] scripts/lib/estandaresAgentes.mjs.
- `estandar-fuente-documentacion-oficial` — **Fuente oficial.** Cada fuente del catálogo de estándares DEBE ser, si es externa, documentación pública de un dominio admitido (DOMINIOS_FUENTE), no un blog. Se comprueba con: `ops/estandares-agentes.test.js`.
  - Fuente: [I] scripts/lib/estandaresAgentes.mjs.
- `estandar-fuente-usada` — **Fuente usada.** Cada fuente del catálogo de estándares DEBE estar citada por alguna tarea. Se comprueba con: `ops/estandares-agentes.test.js`.
  - Fuente: [I] scripts/lib/estandaresAgentes.mjs.
- `estandar-agente-con-lista` — **Lista por agente.** Cada agente DEBE tener su lista de tareas en el catálogo de estándares y existir en .claude/agents/. Se comprueba con: `ops/estandares-agentes.test.js`.
  - Fuente: [I] scripts/lib/estandaresAgentes.mjs.
- `estandar-estado-cerrado` — **Estado cerrado.** Cada agente DEBE tener un estado del vocabulario (completo o pendiente). Se comprueba con: `ops/estandares-agentes.test.js`.
  - Fuente: [I] scripts/lib/estandaresAgentes.mjs.
- `estandar-pendientes-solo-bajan` — **Pendientes que solo bajan.** Si está pendiente, cada agente DEBE figurar en la lista PENDIENTES_ADMITIDOS, que solo baja: un agente nuevo nace con todos sus estándares. Se comprueba con: `ops/estandares-agentes.test.js`.
  - Fuente: [I] scripts/lib/estandaresAgentes.mjs.
- `estandar-lista-minima` — **Lista mínima de tareas.** Cada agente DEBE tener al menos tres tareas en su lista. Se comprueba con: `ops/estandares-agentes.test.js`.
  - Fuente: [I] scripts/lib/estandaresAgentes.mjs.
- `estandar-tarea-id` — **Id de la tarea.** Cada tarea del catálogo de estándares DEBE llevar un id en minúsculas con guiones que no se repite dentro del agente. Se comprueba con: `ops/estandares-agentes.test.js`.
  - Fuente: [I] scripts/lib/estandaresAgentes.mjs.
- `estandar-tarea-frase` — **Frase de la tarea.** Cada tarea del catálogo de estándares DEBE decir en «tarea» qué se hace, en una frase de veinte caracteres o más. Se comprueba con: `ops/estandares-agentes.test.js`.
  - Fuente: [I] scripts/lib/estandaresAgentes.mjs.
- `estandar-tarea-origen` — **Origen de la tarea.** Cada tarea del catálogo de estándares DEBE tener como origen una sección del propio agente (Misión y alcance, Disparadores, Método, Entregables): las tareas salen de lo que el agente ya dice. Se comprueba con: `ops/estandares-agentes.test.js`.
  - Fuente: [I] scripts/lib/estandaresAgentes.mjs.
- `estandar-completo-con-forma` — **Forma de la tarea completa.** Cuando es de un agente completo, cada tarea del catálogo de estándares DEBE llevar estándar de 60 caracteres o más, una lista de comprobaciones y una de lo que no hace. Se comprueba con: `ops/estandares-agentes.test.js`.
  - Nota: Una tarea de un agente pendiente no lleva estándar a medias.
  - Fuente: [I] scripts/lib/estandaresAgentes.mjs.
- `estandar-fuente-citada` — **Tarea con fuente.** Cuando es completa, cada tarea del catálogo de estándares DEBE citar al menos una fuente, todas ellas del catálogo de fuentes. Se comprueba con: `ops/estandares-agentes.test.js`.
  - Fuente: [I] scripts/lib/estandaresAgentes.mjs.
- `estandar-seccion-generada` — **Sección generada.** Cada agente DEBE llevar la sección «Tareas y su estándar» generada del catálogo, sin editarla a mano. Se comprueba con: `ops/estandares-agentes.test.js`.
  - Fuente: [I] scripts/lib/estandaresAgentes.mjs.
- `practica-numero-de-bullets` — **Número de bullets.** La práctica de un estándar DEBE llevar entre el mínimo y el máximo de bullets que declara forma_practica de su artefacto (hoy de 2 a 5 en un estándar). Se comprueba con: `ops/forja-forma.test.js`.
  - Fuente: [I] scripts/lib/forjaForma.mjs.
- `practica-estructura-del-bullet` — **Estructura del bullet.** La práctica de un estándar DEBE llevar en cada bullet sus cuatro partes en orden (regla · porqué · ejemplo bueno · ejemplo malo), ninguna vacía y con el ejemplo bueno distinto del malo. Se comprueba con: `ops/forja-forma.test.js`.
  - Fuente: [I] scripts/lib/forjaForma.mjs.
- `practica-fuente-por-bullet` — **Fuente de cada bullet.** La práctica de un estándar DEBE llevar en cada bullet su propia fuente: [F] con url https si es externa o [I] con la ruta de un fichero que existe si es de la casa. Se comprueba con: `ops/forja-forma.test.js`.
  - Fuente: [I] scripts/lib/forjaForma.mjs.

### formal · agente (0)

Ninguno todavía.

## Capa material

Heurística automática; lo que hoy incumple va a una lista de excepciones que solo baja.

### material · skill (13)

- `solape` — **Solape de descripciones.** La descripción de cada skill NO DEBE compartir con otra descripción más de un 25 % de sus palabras de cinco letras o más (antes de «No para:»). Se comprueba con: `.claude/skills.test.js`.
  - Nota: Heurística propia que detecta dos skills que reclaman la misma petición. Casos medidos el 10 oct 2026 (nivel 2, fallos de disparo por solape) que lo prueban: forja-de-skills con higiene-de-skills, hetzner con 1password, issues con causa-raiz.
  - Fuente: [I] scripts/lib/skillsForja.mjs. Código: `solape`.
- `solape-cercano` — **Cercanía al solape.** Para la descripción de cada skill, CONVIENE no acercarse al límite de solape con otra descripción: a partir del 80 % del límite se avisa con la cifra. Se comprueba con: `scripts/higiene-skills.test.js`.
  - Fuente: [I] scripts/lib/higieneSkills.mjs. Código: `solape-cercano`.
- `comando-suelto` — **Comandos entre comillas.** El cuerpo de cada skill DEBE poner todo comando de la casa (npm run, gh, git…) entre comillas invertidas o en un bloque, no suelto en la prosa. Se comprueba con: `.claude/skills.test.js`.
  - Nota: Heurística sobre los comandos que las skills citan.
  - Fuente: [I] scripts/lib/skillsForja.mjs. Código: `comando-suelto`.
- `caduca-pronto` — **Aviso de caducidad.** Para cada skill, CONVIENE no llegar a caducar sin aviso: a menos de 30 días del plazo de 90 se avisa. Se comprueba con: `scripts/higiene-skills.test.js`.
  - Fuente: [I] scripts/lib/higieneSkills.mjs. Código: `caduca-pronto`.
- `comando-muerto` — **Comandos que existen.** El cuerpo de cada skill DEBE citar en su parte viva solo npm run que existen en package.json. Se comprueba con: `scripts/higiene-skills.test.js`.
  - Fuente: [I] scripts/lib/higieneSkills.mjs. Código: `comando-muerto`.
- `ruta-muerta` — **Rutas vivas.** El cuerpo de cada skill DEBE citar en su parte viva solo rutas del repo que existen, también fuera de comillas invertidas. Se comprueba con: `scripts/higiene-skills.test.js`.
  - Fuente: [I] scripts/lib/higieneSkills.mjs. Código: `ruta-muerta`.
- `skill-muerta` — **Skills que existen.** El cuerpo de cada skill DEBE nombrar tras la palabra «skill» solo skills que existen. Se comprueba con: `scripts/higiene-skills.test.js`.
  - Fuente: [I] scripts/lib/higieneSkills.mjs. Código: `skill-muerta`.
- `descripcion-sin-palabras` — **Frase de quien pide.** Para la descripción de cada skill, CONVIENE traer en el disparador al menos una frase entre «» tal como la diría quien pide. Se comprueba con: `scripts/higiene-skills.test.js`.
  - Fuente: [I] scripts/lib/higieneSkills.mjs. Código: `descripcion-sin-palabras`.
- `frontera-vaga` — **Frontera con destino.** Para la descripción de cada skill, CONVIENE nombrar en el «No para:» la skill, el agente, el comando o el fichero a donde va lo que no es suyo. Se comprueba con: `scripts/higiene-skills.test.js`.
  - Fuente: [I] scripts/lib/higieneSkills.mjs. Código: `frontera-vaga`.
- `tamano-cerca` — **Margen de tamaño.** Para el cuerpo de cada skill, CONVIENE no pasar del 85 % de las líneas permitidas en SKILL.md: la siguiente entrada lo desbordaría. Se comprueba con: `scripts/higiene-skills.test.js`.
  - Fuente: [I] scripts/lib/higieneSkills.mjs. Código: `tamano-cerca`.
- `caso-duplicado` — **Casos sin duplicar.** Para el conjunto de casos de prueba de cada skill, CONVIENE no pedir casi lo mismo en dos casos, de la misma skill o de otra (parecido de raíces de cinco letras por debajo de 0,6). Se comprueba con: `scripts/higiene-skills.test.js`.
  - Fuente: [I] scripts/lib/higieneSkills.mjs. Código: `caso-duplicado`.
- `caso-en-frontera` — **Petición fuera de frontera.** Para el conjunto de casos de prueba de cada skill, CONVIENE no usar en una petición propia las palabras de lo que su «No para:» deja a otra skill. Se comprueba con: `scripts/higiene-skills.test.js`.
  - Fuente: [I] scripts/lib/higieneSkills.mjs. Código: `caso-en-frontera`.
- `vocabulario-canonico` — **Término canónico.** Todo artefacto de la forja NO DEBE usar un sinónimo prohibido en vez del término canónico del glosario único (ops/glosario.json, #469). Se comprueba con: `ops/glosario.test.js`.
  - Nota: Una cosa se llama siempre igual.
  - Fuente: [I] ops/glosario.json.

### material · estandar (4)

- `practica-voz-activa` — **Voz activa.** La práctica de un estándar DEBE tener la regla y su porqué en voz activa, sin pasiva con «ser» ni pasiva refleja con «se». Se comprueba con: `ops/forja-forma.test.js`.
  - Nota: Heurística sobre el texto, que no entiende la frase; orientativo hasta que #454 la calibre con estándares reales.
  - Fuente: [I] scripts/lib/forjaForma.mjs.
- `practica-modo-tiempo-persona` — **Modo, tiempo y persona.** La práctica de un estándar DEBE tener la regla en un solo modo y tiempo verbal y en una sola persona, los declarados en forma_practica (hoy imperativo, segunda persona). Se comprueba con: `ops/forja-forma.test.js`.
  - Nota: Heurística que detecta futuros, pasados, sujetos nominales y modales; orientativo hasta que #454 la calibre con estándares reales.
  - Fuente: [I] scripts/lib/forjaForma.mjs.
- `estandar-rondas-de-investigacion` — **Rondas de investigación.** Cada tarea del catálogo de estándares DEBE dejar el rastro de tres rondas de investigación o más, cada una con una línea «ronda: n fuentes: k cambios: …» y fuentes mayores que 0. Se comprueba con: `ops/forja-forma.test.js`.
  - Nota: Las rondas son buscar, contrastar y destilar; lo que hoy no lo cumple va a una lista de excepciones que solo baja.
  - Fuente: [I] scripts/lib/forjaForma.mjs.
- `vocabulario-canonico` — **Término canónico.** Todo artefacto de la forja NO DEBE usar un sinónimo prohibido en vez del término canónico del glosario único (ops/glosario.json, #469). Se comprueba con: `ops/glosario.test.js`.
  - Nota: Una cosa se llama siempre igual.
  - Fuente: [I] ops/glosario.json.

### material · agente (0)

Ninguno todavía.

## Capa subjetiva

Una rúbrica escrita que un LLM puntúa sobre casos; para lo que no se puede discretizar.

### subjetiva · skill (13)

- `descripcion-palabras-de-quien-pide` — **Palabras de quien pide.** La descripción de cada skill DEBE decir qué hace la skill y cuándo se abre, con las palabras con que lo pediría una persona con prisa. Se comprueba con: el juicio de una persona o de un LLM sobre sus casos.
  - Cumple si un lector que solo vea la descripción reconoce su petición en ella. No cumple si es genérica («ayuda con documentos») o repite el vocabulario interno de la skill en vez del de quien pide.
  - Calibración: 3 casos con respuesta conocida (cumple, no_cumple, no_cumple).
  - Fuente: [F] https://agentskills.io/skill-creation/optimizing-descriptions.
- `frontera-casi-fallos` — **Casos casi-fallos.** El conjunto de casos de prueba de cada skill DEBE tener casos de frontera que sean casi-fallos: peticiones que se parecen mucho a las de la skill y son de otra. Se comprueba con: el juicio de una persona o de un LLM sobre sus casos.
  - Cumple si una descripción vaga los confundiría con la skill. No cumple si son obvios («¿qué tiempo hace?») y cualquier descripción los separa.
  - Calibración: 3 casos con respuesta conocida (cumple, no_cumple, cumple).
  - Fuente: [F] https://agentskills.io/skill-creation/optimizing-descriptions.
- `disparador-al-principio` — **Disparador al principio.** La descripción de cada skill DEBE poner lo esencial de la descripción al principio, porque el listado se trunca. Se comprueba con: el juicio de una persona o de un LLM sobre sus casos.
  - Cumple si el cuándo y las palabras clave están en los primeros 250 caracteres. No cumple si el disparador principal queda al final o cortado.
  - Calibración: 3 casos con respuesta conocida (cumple, no_cumple, cumple).
  - Fuente: [F] https://code.claude.com/docs/en/skills.
- `solo-lo-que-el-modelo-no-sabe` — **Solo lo no sabido.** El cuerpo de cada skill DEBE justificar el coste de cada párrafo en cada sesión: decir solo lo que el modelo no sabría sin la skill. Se comprueba con: el juicio de una persona o de un LLM sobre sus casos.
  - Cumple si quitar un párrafo cambiaría lo que hace quien la lee. No cumple si explica lo que el modelo ya hace bien o pega la documentación del proveedor.
  - Calibración: 3 casos con respuesta conocida (cumple, no_cumple, cumple).
  - Fuente: [F] https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices. Pendiente (falta_herramienta): lo da #517.
- `libertad-ajustada` — **Libertad ajustada.** El cuerpo de cada skill DEBE ajustar la libertad de cada instrucción a lo frágil que es la tarea. Se comprueba con: el juicio de una persona o de un LLM sobre sus casos.
  - Cumple si donde un error cuesta caro (un borrado, una clave) hay pasos exactos o un script, y donde no, una heurística. No cumple si hay pasos rígidos en lo abierto o vaguedad en lo irreversible.
  - Calibración: 3 casos con respuesta conocida (cumple, no_cumple, no_cumple).
  - Fuente: [F] https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices.
- `camino-por-defecto` — **Camino por defecto.** El cuerpo de cada skill DEBE tener un camino por defecto y, aparte, la salida para el caso raro. Se comprueba con: el juicio de una persona o de un LLM sobre sus casos.
  - Cumple si ante una petición normal está claro qué hacer primero. No cumple si ofrece un menú («usa A, o B, o C») sin decir cuál.
  - Calibración: 3 casos con respuesta conocida (cumple, no_cumple, cumple).
  - Fuente: [F] https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices. Pendiente (falta_decision): lo da #518.
- `pasos-con-salida-observable` — **Salida observable.** El cuerpo de cada skill DEBE decir en cada paso qué se ve cuando sale bien, de modo que quien lo hace sabe si avanza o debe parar. Se comprueba con: el juicio de una persona o de un LLM sobre sus casos.
  - Cumple si un paso se puede comprobar mirando una salida, un fichero o un estado. No cumple si pide «comprobar que esté bien» sin decir cómo.
  - Calibración: 3 casos con respuesta conocida (cumple, no_cumple, cumple).
  - Fuente: [F] https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices.
- `vocabulario-unico` — **Vocabulario único.** El cuerpo de cada skill DEBE usar una palabra por cosa en toda la skill. Se comprueba con: el juicio de una persona o de un LLM sobre sus casos.
  - Cumple si el mismo concepto siempre se llama igual. No cumple si alterna «caso», «incidente» y «fallo» para lo mismo.
  - Calibración: 3 casos con respuesta conocida (cumple, no_cumple, cumple).
  - Fuente: [F] https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices.
- `ejemplos-canonicos` — **Ejemplos canónicos.** El cuerpo de cada skill DEBE tener ejemplos pocos, representativos y sin contradicción con la norma de la propia skill. Se comprueba con: el juicio de una persona o de un LLM sobre sus casos.
  - Cumple si cada ejemplo enseña la regla sin romperla. No cumple si es una lista de casos límite o un ejemplo viola lo que la skill enseña.
  - Calibración: 3 casos con respuesta conocida (cumple, no_cumple, cumple).
  - Fuente: [I] .claude/skills/forja-de-skills/referencias/criterios.md. Pendiente (falta_decision): lo da #518.
- `casos-medidos-con-y-sin-skill` — **Casos medidos con y sin.** El conjunto de casos de prueba de cada skill DEBE escribirse antes que el texto y medirse con más de una ejecución, para saber si la skill mejora sobre el modelo solo. Se comprueba con: el juicio de una persona o de un LLM sobre sus casos.
  - Cumple si hay cifra con y sin skill. No cumple si solo se probó una vez con la skill puesta.
  - Nota: Hoy no existe la medida automática con y sin skill: el nivel 2 mide solo con ella. Cifra de partida (comprobaciones del nivel 2, 10 oct 2026): higiene-de-skills cumple 5 de 12 y forja-de-skills 12 de 16.
  - Calibración: 3 casos con respuesta conocida (cumple, no_cumple, cumple).
  - Fuente: [F] https://agentskills.io/skill-creation/evaluating-skills. Pendiente (falta_herramienta): lo da #517.
- `skill-contrastada-con-fallo-real` — **Nacida de un fallo.** Cada skill DEBE nacer de un fallo real visto sin ella, no de lo que se imagina que hará falta. Se comprueba con: el juicio de una persona o de un LLM sobre sus casos.
  - Cumple si el PR o «Lo que falló y por qué» cuentan en qué fallaba la sesión sin la skill. No cumple si sale de documentación copiada o de una lista de buenas intenciones.
  - Calibración: 3 casos con respuesta conocida (cumple, no_cumple, no_cumple).
  - Fuente: [I] .claude/skills/forja-de-skills/SKILL.md.
- `forma-adecuada-al-contenido` — **Forma del contenido.** El cuerpo de cada skill DEBE poner cada contenido en su forma: tabla para datos comparables, lista numerada para pasos con orden, viñetas sin orden, párrafos cortos. Se comprueba con: el juicio de una persona o de un LLM sobre sus casos.
  - Cumple si cambiar la forma de un trozo lo empeoraría. No cumple si hay razonamiento metido en celdas, negrita decorativa o muros de texto.
  - Nota: La negrita va solo para lo que no puede pasar desapercibido.
  - Calibración: 3 casos con respuesta conocida (cumple, no_cumple, cumple).
  - Fuente: [I] .claude/skills/forja-de-skills/referencias/presentacion.md.
- `sin-duda-con-vecina` — **Una sola dueña.** La descripción de cada skill DEBE dejar a cada petición real una sola skill dueña. Se comprueba con: el juicio de una persona o de un LLM sobre sus casos.
  - Cumple si dos personas leyendo las descripciones de esta y de su vecina eligen la misma para una petición dada. No cumple si hay peticiones en las que dudarían entre las dos.
  - Calibración: 3 casos con respuesta conocida (cumple, no_cumple, no_cumple).
  - Fuente: [I] .claude/skills/forja-de-skills/referencias/criterios.md.

### subjetiva · estandar (3)

- `estandar-concreto-y-verificable` — **Estándar verificable.** Cada tarea del catálogo de estándares DEBE decir qué es hacer bien la tarea de forma que otra persona pueda comprobarlo mirando el resultado. Se comprueba con: el juicio de una persona o de un LLM sobre sus casos.
  - Cumple si cada punto de «comprueba» se puede contrastar con una salida, un diff o un fichero. No cumple si es una declaración de intenciones («con cuidado», «de forma robusta»).
  - Calibración: 3 casos con respuesta conocida (cumple, no_cumple, cumple).
  - Fuente: [I] scripts/lib/estandaresAgentes.mjs.
- `estandar-respaldado-por-su-fuente` — **Fuente que respalda.** Cada tarea del catálogo de estándares DEBE tener una fuente citada que respalda de verdad lo que dice el estándar. Se comprueba con: el juicio de una persona o de un LLM sobre sus casos.
  - Cumple si quien lee la fuente encuentra la práctica que el estándar enuncia. No cumple si la fuente es de otro tema o solo comparte palabras con el estándar.
  - Calibración: 3 casos con respuesta conocida (cumple, no_cumple, cumple).
  - Fuente: [I] ops/estandares-agentes.json.
- `estandar-no-hace-delimita` — **Frontera de no_hace.** Cada tarea del catálogo de estándares DEBE marcar en «no_hace» la frontera con lo que es de otro agente o de una persona. Se comprueba con: el juicio de una persona o de un LLM sobre sus casos.
  - Cumple si cada exclusión nombra algo que se podría confundir con la tarea. No cumple si son exclusiones obvias o deja sin decir lo que más se parece.
  - Calibración: 3 casos con respuesta conocida (cumple, no_cumple, cumple).
  - Fuente: [I] ops/estandares-agentes.json.

### subjetiva · agente (0)

Ninguno todavía.
