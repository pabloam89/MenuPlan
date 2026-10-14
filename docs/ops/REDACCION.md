# Redacción de reglas

<!-- Generado desde ops/redaccion.json y ops/normas.json con «npm run redaccion -- --escribir». No se edita a mano: ops/redaccion.test.js lo compara. -->

Esta guía dice cómo se escribe cualquier norma de la casa: una norma de la forja, una norma, un aviso de la guardia, una obligación del proceso o el estándar de una tarea de agente. Es una sola, para que todas se lean igual y se puedan contar.

Se apoya en tres ideas. La forma sale de EARS (Mavin et al., 2009) y la fuerza de RFC 2119: la regla se escribe por campos y su frase se genera, sin prosa libre. El idioma es el castellano y cada concepto tiene un solo término, el del glosario. Y lo que se vaya a contar va en un campo de vocabulario cerrado, con el texto libre solo en un hueco declarado.

Cada principio de abajo es el porqué, sin fuerza, con su ejemplo bueno, su ejemplo malo y su fuente; lo que obliga es su norma, en `ops/normas.json` (ámbito `writing`), con su control. Para una regla nueva, se empieza por `scripts/lib/regla.mjs` y por esta lista.

## Principios

- `castellano-siempre` — **Castellano siempre.** Una regla que todo el equipo lee en su idioma se entiende a la primera y se discute menos.
  - Porqué: Quien trabaja en el repo lee en castellano, y mezclar idiomas en una regla la hace más difícil de entender.
  - Norma: `rule-in-spanish` — **Castellano siempre.** Cada norma de la casa DEBE escribirse en castellano, salvo los nombres propios, el código y las citas. Control: juicio.
    - Nota: Las palabras de fuerza de RFC 2119 se traducen: debe, no debe y conviene; no se deja MUST ni SHOULD.
  - Bueno: «Cada skill debe llevar su dueño».
  - Malo: «Each skill must have an owner».
  - Fuente: [I] CLAUDE.md.
- `sin-anglicismos-con-termino` — **Sin anglicismos con término.** El glosario de la casa ya tiene término castellano para lo que se repite, y el préstamo lo duplica.
  - Porqué: Dos palabras para lo mismo parten la búsqueda y el recuento, y el término castellano lo entiende todo el equipo.
  - Norma: `no-anglicism-with-term` — **Sin anglicismos con término.** Cada norma de la casa NO DEBE usar un anglicismo cuando el glosario ya tiene su término en castellano. Control: `ops/glosario.test.js`.
    - Nota: Lo que no tiene término en el glosario (hook, staging, lint) se deja como está y se añade al glosario si se repite.
  - Bueno: «Fusionar el PR con el CI en verde».
  - Malo: «Hacer el merge del PR con el CI en verde».
  - Fuente: [I] ops/glosario/.
- `fuerza-segun-rfc-2119` — **Fuerza según RFC 2119.** La fuerza de una regla se dice con tres palabras de sentido fijo, las de RFC 2119.
  - Porqué: Sin palabras de fuerza fijas cada autor gradúa la exigencia a su manera, y nadie sabe qué es opcional.
  - Norma: `strength-per-rfc-2119` — **Fuerza según RFC 2119.** La fuerza de cada regla DEBE ser debe, no_debe o conviene, con el sentido de MUST, MUST NOT y SHOULD de RFC 2119. Control: `ops/regla.test.js`.
    - Nota: Debe y no_debe son absolutas; conviene admite una razón válida para no cumplirla, que se dice en la nota.
  - Bueno: «fuerza: no_debe, exigencia: llevar fechas en el cuerpo».
  - Malo: «exigencia: no estaría mal evitar fechas en el cuerpo».
  - Fuente: [F] https://www.rfc-editor.org/rfc/rfc2119.
- `mayusculas-solo-normativas` — **Mayúsculas solo normativas.** Las palabras de fuerza en mayúsculas tienen sentido normativo y solo las pone el campo de fuerza.
  - Porqué: RFC 8174 separa el sentido normativo del corriente por las mayúsculas, y escribirlas a mano duplica la fuerza.
  - Norma: `uppercase-only-normative` — **Mayúsculas solo normativas.** La exigencia de cada regla NO DEBE llevar DEBE, NO DEBE ni CONVIENE en mayúsculas: la fuerza solo la pone el campo fuerza. Control: juicio.
    - Nota: RFC 8174: las palabras en mayúsculas tienen sentido normativo y las mismas en minúsculas son lenguaje corriente.
  - Bueno: «exigencia: empezar por la palabra Úsala».
  - Malo: «exigencia: DEBE empezar por la palabra Úsala».
  - Fuente: [F] https://www.rfc-editor.org/rfc/rfc8174.
- `condicion-estilo-ears` — **Condición estilo EARS.** La condición de una regla nombra su disparador con «cuando» o «si», al estilo EARS.
  - Porqué: EARS fija la forma del disparador para que una regla diga sin ambigüedad cuándo se aplica.
  - Norma: `condition-ears-style` — **Condición estilo EARS.** La condición de cada regla DEBE empezar por «cuando» o «si» y nombrar el disparador, en una línea y sin punto final. Control: `ops/regla.test.js`.
    - Nota: El test vigila solo que empiece por cuando o si y que vaya en una línea sin punto final; que nombre un disparador es de juicio. EARS (Mavin et al., 2009) pone el disparador delante: «Cuando <disparador>, <sujeto> debe <respuesta>». Una regla que vale siempre no lleva condición.
  - Bueno: «condicion: cuando la skill es de tipo servicio».
  - Malo: «condicion: en las skills de tipo servicio.».
  - Fuente: [F] https://alistairmavin.com/ears/.
- `exigencia-en-infinitivo` — **Exigencia en infinitivo.** La exigencia de una regla es un verbo en infinitivo que se une al sujeto ya escrito.
  - Porqué: Con el sujeto en su campo y el verbo en infinitivo, la frase se genera igual en todas las reglas.
  - Norma: `requirement-in-infinitive` — **Exigencia en infinitivo.** La exigencia de cada regla DEBE empezar por un verbo en infinitivo y en minúscula, sin sujeto: el sujeto ya lo pone el campo sujeto. Control: `ops/regla.test.js`.
    - Nota: La frase generada une sujeto, fuerza y exigencia; repetir el sujeto la rompe. Con conviene la frase empieza por «Para <sujeto>,», así que la exigencia tampoco es reflexiva ni pasiva: «usar frases», no «escribirse en frases». El test comprueba la terminación del verbo; que no lleve sujeto es de juicio.
  - Bueno: «exigencia: llevar un dueño».
  - Malo: «exigencia: La skill lleva un dueño».
  - Fuente: [I] scripts/lib/regla.mjs.
- `exigencia-sin-punto-final` — **Exigencia sin punto final.** La exigencia ocupa una línea sin puntuación final, y la frase la cierra quien la genera.
  - Porqué: Un punto o un salto de línea dentro de la exigencia rompe la frase generada y la tabla que la recoge.
  - Norma: `requirement-without-final-stop` — **Exigencia sin punto final.** La exigencia de cada regla NO DEBE acabar en punto, dos puntos ni punto y coma, ni ocupar más de una línea. Control: `ops/regla.test.js`.
    - Nota: La frase generada añade su propio punto; uno más deja dos.
  - Bueno: «exigencia: llevar un dueño».
  - Malo: «exigencia: llevar un dueño.».
  - Fuente: [I] scripts/lib/regla.mjs.
- `exigencia-corta-y-unica` — **Exigencia corta y única.** Una exigencia corta pide una sola cosa que se puede comprobar.
  - Porqué: Una exigencia que pide dos cosas no se puede dar por cumplida ni por rota de una vez.
  - Norma: `requirement-short-and-single` — **Exigencia corta y única.** La exigencia de cada regla DEBE caber en 160 caracteres y pedir una sola cosa que se pueda comprobar. Control: `ops/regla.test.js`.
    - Nota: El test vigila solo el tope de 160 caracteres; que pida una sola cosa comprobable es de juicio. Si hay dos cosas, son dos reglas, y lo que sobra del tope va a la nota. La guía de requisitos de INCOSE pide lo mismo: un requisito, una necesidad.
  - Bueno: «exigencia: llevar un dueño».
  - Malo: «exigencia: llevar un dueño, una fecha de comprobación, casos de frontera y un enlace a cada skill vecina».
  - Fuente: [I] scripts/lib/regla.mjs.
- `nombre-corto-y-nominal` — **Nombre corto y nominal.** El nombre de una regla es un sustantivo corto que la identifica en una tabla.
  - Porqué: Un nombre corto y nominal se lee de un vistazo y no repite la exigencia.
  - Norma: `name-short-and-nominal` — **Nombre corto y nominal.** El nombre de cada regla DEBE ser un sustantivo de 2 a 5 palabras, con mayúscula inicial y sin punto final. Control: `ops/regla.test.js`.
    - Nota: El test vigila el número de palabras, la mayúscula inicial y el punto final; que sea un sustantivo es de juicio. Es una sola idea, la forma de la etiqueta con la que se cita la regla, y no se repite en el catálogo.
  - Bueno: «Frontmatter cerrado».
  - Malo: «Que la skill tenga un frontmatter cerrado.».
  - Fuente: [I] scripts/lib/regla.mjs.
- `dato-contable-en-campo` — **Dato contable en campo.** Lo que se va a contar, filtrar o agrupar vive en un campo de vocabulario cerrado.
  - Porqué: Un dato metido en texto libre no se puede contar ni filtrar sin releerlo a mano.
  - Norma: `countable-data-in-field` — **Dato contable en campo.** Cada dato de una regla que se vaya a contar, filtrar o agrupar DEBE ir en un campo de vocabulario cerrado y no en texto libre. Control: juicio.
    - Nota: El texto libre solo se admite en un hueco declarado, y el hueco se cuenta aparte; lo que no es un campo discreto no se puede contar.
  - Bueno: «fuerza: debe (vocabulario de tres valores)».
  - Malo: «texto: Esto es muy importante, hazlo siempre».
  - Fuente: [I] CLAUDE.md.
- `nota-solo-para-el-matiz` — **Nota solo para el matiz.** La nota de una regla guarda el matiz, la cifra o la heurística que la exigencia no admite.
  - Porqué: Una nota que repite la exigencia o la amplía en prosa vuelve a meter la ambigüedad que los campos quitan.
  - Norma: `note-only-for-nuance` — **Nota solo para el matiz.** La nota de cada regla DEBE recoger solo el matiz, la cifra o la heurística que la exigencia no admite, en una línea de 400 caracteres como mucho. Control: `ops/regla.test.js`.
    - Nota: El test vigila solo la forma (una línea, 15 a 400 caracteres); que la nota sea un matiz y no la exigencia es de juicio: si quitarla cambia lo que se exige, esa parte va en la exigencia o en otra regla.
  - Bueno: «nota: La description queda por debajo de los 1.024 caracteres del estándar abierto».
  - Malo: «nota: Además, la skill debe llevar un dueño y casos de frontera».
  - Fuente: [I] scripts/lib/regla.mjs.
- `frases-cortas` — **Frases cortas.** Las frases cortas y los párrafos breves se leen y se entienden a la primera.
  - Porqué: Las guías de lenguaje claro observan que una frase larga se entiende peor y se relee más.
  - Norma: `short-sentences` — **Frases cortas.** Para la nota de cada regla, CONVIENE usar frases de menos de 25 palabras y párrafos de cinco frases como mucho. Control: juicio.
    - Nota: Vale también para la prosa de las guías y las skills; los topes de palabras son de la casa, no de la fuente.
  - Bueno: «Las ramas se crean desde staging y vuelven por PR».
  - Malo: «Las ramas, que se crean siempre desde staging, aunque algunas veces no, vuelven por PR cuando el CI, que también vigila otras cosas, está en verde».
  - Fuente: [F] https://www.plainlanguage.gov/guidelines/.
- `fuente-marcada` — **Fuente marcada.** Cada regla dice de dónde sale, una fuente externa, una ruta de la casa o una inferencia propia, con su marca.
  - Porqué: Sin la fuente marcada no se sabe si una regla es un hecho comprobado o una decisión propia.
  - Norma: `source-marked` — **Fuente marcada.** La fuente de cada regla DEBE empezar por [F] y una dirección https, por [I] y una ruta del repo que exista, o por [S] y una dirección https. Control: `ops/forja.test.js`.
    - Nota: [F] está en una fuente externa; [I] está escrito en la casa; [S] es inferencia de la casa o fuente secundaria. Son las letras de MARCAS_FUENTE de scripts/lib/regla.mjs, con un solo significado en todo el repo. Que la dirección [F] responda lo mide npm run forja -- --urls; las marcas de catálogos y textos las vigila principios.test.js.
  - Bueno: «[F] https://www.rfc-editor.org/rfc/rfc2119».
  - Malo: «Lo dice RFC 2119».
  - Fuente: [I] docs/ops/FORJA.md.
- `control-declarado` — **Control declarado.** Cada regla nombra lo que la vigila, un fichero que falla o el juicio de alguien.
  - Porqué: Una regla sin control declarado parece vigilada aunque nadie la mire.
  - Norma: `control-declared` — **Control declarado.** El control de cada regla DEBE ser el fichero que vigila la regla o el valor juicio, y no quedar vacío. Control: `ops/forja.test.js`.
    - Nota: Una regla sin control es un deseo: si no hay fichero todavía, se declara juicio y se apunta el encargo que lo construye. Lo vigila forja.test.js en los criterios y redaccion.test.js en estos principios.
  - Bueno: «control: .claude/skills.test.js».
  - Malo: «control: se revisa a mano de vez en cuando».
  - Fuente: [I] CLAUDE.md.
- `catalogo-declara-su-estado` — **Catálogo declara su estado.** Cada catálogo de reglas declara si ya sigue la guía o qué encargo lo pone al día.
  - Porqué: Sin estado declarado, un catálogo a medias pasa por uno que cumple y la deuda no se ve.
  - Norma: `catalog-declares-status` — **Catálogo declara su estado.** Cada catálogo de reglas DEBE figurar en la lista de catálogos como cumple, o como pendiente con el encargo que lo pone al día. Control: `ops/redaccion.test.js`.
    - Nota: La lista de pendientes solo baja: un catálogo nuevo nace cumpliendo la guía.
  - Bueno: «estado: pendiente, encargo: #494».
  - Malo: «estado: pendiente, sin encargo».
  - Fuente: [I] ops/redaccion.json.

## Principios de la lista única que la guía aplica

No se copian aquí: viven en `ops/principios/` (`docs/PRINCIPIOS.md`) y la guía los cita.

- `one-word-one-meaning` — **Una palabra, un significado.** Cada concepto tiene un solo nombre y cada nombre un solo concepto, y el glosario anota los sinónimos prohibidos.
  - Norma: `glosario-sin-sinonimos-nuevos` — **Sin sinónimos prohibidos nuevos.** Cada texto de proceso (skills, agentes, reglas, CLAUDE.md y ops) NO DEBE usar un sinónimo prohibido del glosario en vez de su término. Control: `ops/glosario.test.js`.
  - Norma: `design-token-per-role` — **Token por rol.** Cada token de diseño DEBE llamarse por su rol, como texto-secundario, y no por su valor, como gris-600. Control: juicio.
  - Norma: `design-declared-voice` — **Voz declarada.** El producto DEBE fijar el tono, el vocabulario y las reglas de redacción de la interfaz, con un nombre por concepto. Control: juicio.

## Vocabularios y topes

La frase de una regla es: **Nombre.** [Condición,] sujeto DEBE | NO DEBE exigencia. Se comprueba con: control. Con `conviene`: [Condición, para] sujeto, CONVIENE exigencia.

| Fuerza | Palabra | Qué quiere decir |
|---|---|---|
| debe | DEBE | Obligatoria: sin ella la regla no se cumple (RFC 2119, MUST) |
| no_debe | NO DEBE | Prohibida: hacerlo incumple la regla (RFC 2119, MUST NOT) |
| conviene | CONVIENE | Recomendada: se avisa, pero no impide seguir (RFC 2119, SHOULD) |

Los sujetos de las normas de redacción (vocabulario de `ops/normas.json`):

| Sujeto | En la frase | Normas |
|---|---|---|
| texto | cada texto de proceso (skills, agentes, reglas, CLAUDE.md y ops) | 1 |
| regla | cada norma de la casa | 2 |
| regla.fuerza | la fuerza de cada regla | 1 |
| regla.exigencia | la exigencia de cada regla | 4 |
| regla.condicion | la condición de cada regla | 1 |
| regla.nombre | el nombre de cada regla | 1 |
| regla.dato | cada dato de una regla que se vaya a contar, filtrar o agrupar | 1 |
| regla.nota | la nota de cada regla | 2 |
| regla.fuente | la fuente de cada regla | 1 |
| regla.control | el control de cada regla | 1 |
| catalogo.reglas | cada catálogo de reglas | 1 |

| Campo | Tope |
|---|---|
| nombre | de 2 a 5 palabras |
| condicion | de 8 a 120 caracteres |
| exigencia | de 10 a 160 caracteres |
| nota | de 15 a 400 caracteres |
| rúbrica (cumple, no_cumple) | 20 caracteres o más |

Un **principio** (catálogos con forma `principio`, #619) no es una regla: no lleva sujeto, fuerza ni control, porque la obligación es de la norma que lo cita. Su frase es: **Nombre.** Enunciado Por qué: porqué. El nombre, de 2 a 5 palabras; el enunciado, una sola frase en presente con sujeto y verbo, de 25 palabras como mucho, que acaba en punto, sin punto y coma ni dos puntos y sin palabras de fuerza (debe, conviene, hay que); el porqué, una frase así de 30 palabras como mucho. Que el verbo vaya en presente lo juzga el revisor; lo demás lo comprueba `problemasDePrincipio` de `scripts/lib/regla.mjs`.

Marca de la fuente, con un solo significado en todos los catálogos (`MARCAS_FUENTE` de `scripts/lib/regla.mjs`): **[F]** está en una fuente externa (con su URL); **[I]** es de la casa (con la ruta del repo donde está escrito); **[S]** es inferencia nuestra o una fuente secundaria (con su URL).

## Catálogos que siguen la guía

| Catálogo | Forma | Estado | Entradas | Encargo |
|---|---|---|---|---|
| `ops/forja/` | regla | cumple | 75 | - |
| `ops/redaccion.json` | principio | cumple | 15 | - |
| `ops/normas.json` | regla | cumple | 169 | - |
| `ops/flujo.json` | regla | cumple | 53 | - |
| `ops/estandares-agentes.json` | regla | cumple | 191 | - |
| `ops/principios-producto/` | principio | cumple | 41 | - |
| `ops/principios/` | principio | cumple | 54 | - |
| `ops/proyectos/homenu/principios/` | principio | cumple | 2 | - |

- cumple: Cada entrada pasa las comprobaciones de regla.mjs.
- pendiente: Aún no sigue la guía; lleva el encargo que lo pone al día y la lista solo baja.

Pendientes hoy: 0. La lista solo baja (`ops/redaccion-pendientes.json`).
