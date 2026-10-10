# Redacción de reglas

<!-- Generado desde ops/redaccion.json con «npm run redaccion -- --escribir». No se edita a mano: ops/redaccion.test.js lo compara. -->

Esta guía dice cómo se escribe cualquier regla de la casa: un criterio de la forja, una norma, un aviso de la guardia, una obligación del proceso o el estándar de una tarea de agente. Es una sola, para que todas se lean igual y se puedan contar.

Se apoya en tres ideas. La forma sale de EARS (Mavin et al., 2009) y la fuerza de RFC 2119: la regla se escribe por campos y su frase se genera, sin prosa libre. El idioma es el castellano y cada concepto tiene un solo término, el del glosario. Y lo que se vaya a contar va en un campo de vocabulario cerrado, con el texto libre solo en un hueco declarado.

Cada principio de abajo se escribe él mismo como regla, con su control, su ejemplo bueno, su ejemplo malo y su fuente. Para una regla nueva, se empieza por `scripts/lib/regla.mjs` y por esta lista.

## Principios

- `castellano-siempre` — **Castellano siempre.** Cada regla de la casa DEBE escribirse en castellano, salvo los nombres propios, el código y las citas. Se comprueba con: el juicio de una persona o de un LLM sobre sus casos.
  - Bueno: «Cada skill debe llevar su dueño».
  - Malo: «Each skill must have an owner».
  - Nota: Las palabras de fuerza de RFC 2119 se traducen: debe, no debe y conviene; no se deja MUST ni SHOULD.
  - Fuente: [I] CLAUDE.md.
- `un-termino-por-concepto` — **Un término por concepto.** Cada regla de la casa DEBE llamar a cada concepto con su término de ops/glosario.json, sin sinónimos. Se comprueba con: `ops/glosario.test.js`.
  - Bueno: «Fusionar el PR cuando el CI esté en verde».
  - Malo: «Unir el PR cuando el CI esté en verde».
  - Nota: Mezclar sinónimos hace creer que son cosas distintas; el glosario fija una palabra y la lista de las prohibidas.
  - Fuente: [F] https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices.
- `sin-anglicismos-con-termino` — **Sin anglicismos con término.** Cada regla de la casa NO DEBE usar un anglicismo cuando el glosario ya tiene su término en castellano. Se comprueba con: `ops/glosario.test.js`.
  - Bueno: «Fusionar el PR con el CI en verde».
  - Malo: «Hacer el merge del PR con el CI en verde».
  - Nota: Lo que no tiene término en el glosario (hook, staging, lint) se deja como está y se añade al glosario si se repite.
  - Fuente: [I] ops/glosario.json.
- `fuerza-segun-rfc-2119` — **Fuerza según RFC 2119.** La fuerza de cada regla DEBE ser debe, no_debe o conviene, con el sentido de MUST, MUST NOT y SHOULD de RFC 2119. Se comprueba con: `ops/regla.test.js`.
  - Bueno: «fuerza: no_debe, exigencia: llevar fechas en el cuerpo».
  - Malo: «exigencia: no estaría mal evitar fechas en el cuerpo».
  - Nota: Debe y no_debe son absolutas; conviene admite una razón válida para no cumplirla, que se dice en la nota.
  - Fuente: [F] https://www.rfc-editor.org/rfc/rfc2119.
- `mayusculas-solo-normativas` — **Mayúsculas solo normativas.** La exigencia de cada regla NO DEBE llevar DEBE, NO DEBE ni CONVIENE en mayúsculas: la fuerza solo la pone el campo fuerza. Se comprueba con: el juicio de una persona o de un LLM sobre sus casos.
  - Bueno: «exigencia: empezar por la palabra Úsala».
  - Malo: «exigencia: DEBE empezar por la palabra Úsala».
  - Nota: RFC 8174: las palabras en mayúsculas tienen sentido normativo y las mismas en minúsculas son lenguaje corriente.
  - Fuente: [F] https://www.rfc-editor.org/rfc/rfc8174.
- `condicion-estilo-ears` — **Condición estilo EARS.** La condición de cada regla DEBE empezar por «cuando» o «si» y nombrar el disparador, en una línea y sin punto final. Se comprueba con: `ops/regla.test.js`.
  - Bueno: «condicion: cuando la skill es de tipo servicio».
  - Malo: «condicion: en las skills de tipo servicio.».
  - Nota: El test vigila solo que empiece por cuando o si y que vaya en una línea sin punto final; que nombre un disparador es de juicio. EARS (Mavin et al., 2009) pone el disparador delante: «Cuando <disparador>, <sujeto> debe <respuesta>». Una regla que vale siempre no lleva condición.
  - Fuente: [F] https://alistairmavin.com/ears/.
- `exigencia-en-infinitivo` — **Exigencia en infinitivo.** La exigencia de cada regla DEBE empezar por un verbo en infinitivo y en minúscula, sin sujeto: el sujeto ya lo pone el campo sujeto. Se comprueba con: `ops/regla.test.js`.
  - Bueno: «exigencia: llevar un dueño».
  - Malo: «exigencia: La skill lleva un dueño».
  - Nota: La frase generada une sujeto, fuerza y exigencia; repetir el sujeto la rompe. Con conviene la frase empieza por «Para <sujeto>,», así que la exigencia tampoco es reflexiva ni pasiva: «usar frases», no «escribirse en frases». El test comprueba la terminación del verbo; que no lleve sujeto es de juicio.
  - Fuente: [I] scripts/lib/regla.mjs.
- `exigencia-sin-punto-final` — **Exigencia sin punto final.** La exigencia de cada regla NO DEBE acabar en punto, dos puntos ni punto y coma, ni ocupar más de una línea. Se comprueba con: `ops/regla.test.js`.
  - Bueno: «exigencia: llevar un dueño».
  - Malo: «exigencia: llevar un dueño.».
  - Nota: La frase generada añade su propio punto; uno más deja dos.
  - Fuente: [I] scripts/lib/regla.mjs.
- `exigencia-corta-y-unica` — **Exigencia corta y única.** La exigencia de cada regla DEBE caber en 160 caracteres y pedir una sola cosa que se pueda comprobar. Se comprueba con: `ops/regla.test.js`.
  - Bueno: «exigencia: llevar un dueño».
  - Malo: «exigencia: llevar un dueño, una fecha de comprobación, casos de frontera y un enlace a cada skill vecina».
  - Nota: El test vigila solo el tope de 160 caracteres; que pida una sola cosa comprobable es de juicio. Si hay dos cosas, son dos reglas, y lo que sobra del tope va a la nota. La guía de requisitos de INCOSE pide lo mismo: un requisito, una necesidad.
  - Fuente: [I] scripts/lib/regla.mjs.
- `nombre-corto-y-nominal` — **Nombre corto y nominal.** El nombre de cada regla DEBE ser un sustantivo de 2 a 5 palabras, con mayúscula inicial y sin punto final. Se comprueba con: `ops/regla.test.js`.
  - Bueno: «Frontmatter cerrado».
  - Malo: «Que la skill tenga un frontmatter cerrado.».
  - Nota: El test vigila el número de palabras, la mayúscula inicial y el punto final; que sea un sustantivo es de juicio. Es una sola idea, la forma de la etiqueta con la que se cita la regla, y no se repite en el catálogo.
  - Fuente: [I] scripts/lib/regla.mjs.
- `dato-contable-en-campo` — **Dato contable en campo.** Cada dato de una regla que se vaya a contar, filtrar o agrupar DEBE ir en un campo de vocabulario cerrado y no en texto libre. Se comprueba con: el juicio de una persona o de un LLM sobre sus casos.
  - Bueno: «fuerza: debe (vocabulario de tres valores)».
  - Malo: «texto: Esto es muy importante, hazlo siempre».
  - Nota: El texto libre solo se admite en un hueco declarado, y el hueco se cuenta aparte; lo que no es un campo discreto no se puede contar.
  - Fuente: [I] CLAUDE.md.
- `nota-solo-para-el-matiz` — **Nota solo para el matiz.** La nota de cada regla DEBE recoger solo el matiz, la cifra o la heurística que la exigencia no admite, en una línea de 400 caracteres como mucho. Se comprueba con: `ops/regla.test.js`.
  - Bueno: «nota: La description queda por debajo de los 1.024 caracteres del estándar abierto».
  - Malo: «nota: Además, la skill debe llevar un dueño y casos de frontera».
  - Nota: El test vigila solo la forma (una línea, 15 a 400 caracteres); que la nota sea un matiz y no la exigencia es de juicio: si quitarla cambia lo que se exige, esa parte va en la exigencia o en otra regla.
  - Fuente: [I] scripts/lib/regla.mjs.
- `frases-cortas` — **Frases cortas.** Para la nota de cada regla, CONVIENE usar frases de menos de 25 palabras y párrafos de cinco frases como mucho. Se comprueba con: el juicio de una persona o de un LLM sobre sus casos.
  - Bueno: «Las ramas se crean desde staging y vuelven por PR».
  - Malo: «Las ramas, que se crean siempre desde staging, aunque algunas veces no, vuelven por PR cuando el CI, que también vigila otras cosas, está en verde».
  - Nota: Vale también para la prosa de las guías y las skills; los topes de palabras son de la casa, no de la fuente.
  - Fuente: [F] https://www.plainlanguage.gov/guidelines/.
- `fuente-marcada` — **Fuente marcada.** La fuente de cada regla DEBE empezar por [F] con una dirección https, o por [I] con una ruta del repo que exista. Se comprueba con: `ops/forja.test.js`.
  - Bueno: «[F] https://www.rfc-editor.org/rfc/rfc2119».
  - Malo: «Lo dice RFC 2119».
  - Nota: [F] está en una fuente externa; [I] es inferencia o decisión de la casa. Que la dirección [F] responda lo mide npm run forja -- --urls. Lo vigila forja.test.js en los criterios y redaccion.test.js en estos principios.
  - Fuente: [I] docs/ops/FORJA.md.
- `control-declarado` — **Control declarado.** El control de cada regla DEBE ser el fichero que vigila la regla o el valor juicio, y no quedar vacío. Se comprueba con: `ops/forja.test.js`.
  - Bueno: «control: .claude/skills.test.js».
  - Malo: «control: se revisa a mano de vez en cuando».
  - Nota: Una regla sin control es un deseo: si no hay fichero todavía, se declara juicio y se apunta el encargo que lo construye. Lo vigila forja.test.js en los criterios y redaccion.test.js en estos principios.
  - Fuente: [I] CLAUDE.md.
- `catalogo-declara-su-estado` — **Catálogo declara su estado.** Cada catálogo de reglas DEBE figurar en la lista de catálogos como cumple, o como pendiente con el encargo que lo pone al día. Se comprueba con: `ops/redaccion.test.js`.
  - Bueno: «estado: pendiente, encargo: #494».
  - Malo: «estado: pendiente, sin encargo».
  - Nota: La lista de pendientes solo baja: un catálogo nuevo nace cumpliendo la guía.
  - Fuente: [I] ops/redaccion.json.

## Vocabularios y topes

La frase de una regla es: **Nombre.** [Condición,] sujeto DEBE | NO DEBE exigencia. Se comprueba con: control. Con `conviene`: [Condición, para] sujeto, CONVIENE exigencia.

| Fuerza | Palabra | Qué quiere decir |
|---|---|---|
| debe | DEBE | Obligatoria: sin ella la regla no se cumple (RFC 2119, MUST) |
| no_debe | NO DEBE | Prohibida: hacerlo incumple la regla (RFC 2119, MUST NOT) |
| conviene | CONVIENE | Recomendada: se avisa, pero no impide seguir (RFC 2119, SHOULD) |

| Sujeto | En la frase | Se aplica a | Principios |
|---|---|---|---|
| regla | cada regla de la casa | regla | 3 |
| regla.nombre | el nombre de cada regla | regla | 1 |
| regla.fuerza | la fuerza de cada regla | regla | 1 |
| regla.condicion | la condición de cada regla | regla | 1 |
| regla.exigencia | la exigencia de cada regla | regla | 4 |
| regla.nota | la nota de cada regla | regla | 2 |
| regla.fuente | la fuente de cada regla | regla | 1 |
| regla.control | el control de cada regla | regla | 1 |
| regla.dato | cada dato de una regla que se vaya a contar, filtrar o agrupar | regla | 1 |
| catalogo | cada catálogo de reglas | catalogo | 1 |

| Campo | Tope |
|---|---|
| nombre | de 2 a 5 palabras |
| condicion | de 8 a 120 caracteres |
| exigencia | de 10 a 160 caracteres |
| nota | de 15 a 400 caracteres |
| rúbrica (cumple, no_cumple) | 20 caracteres o más |

Marca de la fuente: **[F]** está en una fuente externa (con su URL); **[I]** es de la casa (con la ruta del repo donde está escrito).

## Catálogos que siguen la guía

| Catálogo | Estado | Reglas | Encargo |
|---|---|---|---|
| `ops/forja.json` | cumple | 74 | - |
| `ops/redaccion.json` | cumple | 16 | - |
| `ops/normas.json` | cumple | 92 | - |
| `ops/flujo.json` | pendiente | - | en cola #488 |
| `ops/estandares-agentes.json` | pendiente | - | en cola #488 |

- cumple: Cada entrada pasa las comprobaciones de regla.mjs.
- pendiente: Aún no sigue la guía; lleva el encargo que lo pone al día y la lista solo baja.

Pendientes hoy: 2. La lista solo baja (`ops/redaccion-pendientes.json`).
