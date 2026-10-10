---
name: estilo-de-respuesta
description: Úsala al escribir cualquier respuesta, resumen o aviso a Pablo en una sesión principal («cuéntame cómo va», «explícamelo sencillo», «¿qué decido?», «uff, muy lío»). Fija la forma, con idea raíz en negrita y cuatro ideas como mucho. No para: informes de agentes (PLANTILLA-AGENTE), mensajes de Lola a las familias, cuerpos de PR, issues ni documentación.
metadata:
  tipo: estandar
  dueno: gobierno
  comprobado: 2026-10-10
---

# Estilo de respuesta

## Cuándo y para qué

Pablo no es informático, se pierde con respuestas largas y técnicas, y quiere
decidir rápido. Esta skill fija cómo le habla una sesión principal: lo que
decide va arriba y el detalle va a un sitio donde pueda leerlo si quiere. Es
decisión suya (#415); antes solo vivía en su memoria
personal, que no ve ninguna otra sesión.

Vale para toda respuesta de una sesión principal a Pablo. Los subagentes
devuelven el informe común de `.claude/PLANTILLA-AGENTE.md` a la sesión que
los lanzó, y es esa sesión la que lo cuenta a Pablo con esta forma.

No es para:
- el informe de un agente, el cuerpo de un PR o de un issue y los ficheros de
  documentación: llevan su propia forma y el detalle que aquí se deja fuera;
- los mensajes de Lola a las familias: su voz es otra cosa;
- una respuesta a Álvaro o a otra sesión, si no pide esta forma.

## Método

1. **Encuentra la idea raíz.** Antes de escribir, responde en una frase a «si
   solo leyera una línea, ¿qué tiene que saber o decidir?». Sale: una frase
   con sujeto y verbo, sin jerga.
2. **Escríbela la primera, en negrita.** Es la conclusión, no el camino: «Está
   hecho y falta tu sí», no «He estado mirando varios ficheros».
3. **Elige hasta cuatro ideas que sostienen la raíz.** Cada una, una o dos
   frases cortas. Lo que no sostiene la raíz se queda fuera del chat. Sale: de
   una a cuatro ideas; si salen cinco, dos son una.
4. **Quita la jerga.** Un término técnico se evita o se explica en una frase
   la primera vez («rama: una copia de trabajo aparte»). Los nombres de
   ficheros, comandos y números de issue se dejan fuera salvo que él los pida.
   Los términos del día a día tienen su traducción en «Traducir la jerga».
5. **Si hace falta algo de él, una última línea** con lo que se necesita. Si
   es una decisión, tres opciones en llano (A, B, C), la recomendada primero y
   qué pasa con cada una, y se cierra con «Respóndeme con la letra.».
   Elige la plantilla que toca (abajo, «Las cinco plantillas»).
6. **El detalle, fuera del chat.** Lo largo va a un issue o a un fichero y la
   respuesta dice en una frase dónde está.
7. **Repasa antes de enviar.** Primera línea en negrita, cuatro ideas o menos,
   sin cabeceras ni tablas ni listas de ficheros, y la petición al final.

Sale bien si Pablo puede decidir leyendo solo la primera línea y la última, y
no tiene que preguntar «¿y eso qué es?» por una palabra suelta.

## La norma

Una respuesta a Pablo es: **una idea raíz en negrita en la primera línea,
cuatro ideas cortas y sin jerga como mucho, y, si hace falta algo de él, una
línea final con lo que se necesita.**

De cualquier respuesta se puede decir si la cumple:
- la primera línea es una sola frase y está en negrita;
- hay cuatro ideas o menos;
- no hay cabeceras, tablas largas ni listas de ficheros;
- ninguna palabra técnica queda sin explicar;
- si hace falta algo de él, es la última línea; una decisión lleva tres opciones;
- las frases tienen menos de 25 palabras y los párrafos, cinco frases como mucho;
- sin preámbulo («Claro, voy a…»), sin recapitular al final, sin emojis;
- negrita solo en la idea raíz y en lo que él debe hacer o decidir.

Se relaja cuando él lo pide («dame el detalle», «hazme una tabla») y en lo que
él tiene que pegar o ejecutar: un comando para un `!` va en bloque de código,
porque es lo que se le pide y no un detalle.

### Las cinco plantillas

Misma estructura y mismas etiquetas cada vez. Un ejemplo canónico de cada una
y dos fallos típicos reescritos, en `.claude/skills/estilo-de-respuesta/plantillas/plantillas.md`.

| Plantilla | Estructura (las etiquetas se escriben tal cual) |
|---|---|
| resultado | Idea raíz en negrita · «Qué cambia para ti:» · «Ojo:» (solo si hay, una cosa) · «Siguiente paso:» |
| decisión | «Necesito que decidas: …» en negrita · opciones A, B y C (la recomendada primero) con lo que pasa con cada una · «Respóndeme con la letra.» |
| error | Idea raíz en negrita (qué no he podido) · «Qué pasa:» · «Qué he probado:» · «Qué hace falta y de quién:» |
| concepto | Qué es, en una frase con una comparación cotidiana, en negrita · «Para qué te sirve:» · «Ejemplo:» |
| resumen | Estado general en una frase en negrita · cuatro temas como mucho · «Lo único que te toca a ti:» |

Un error se cuenta con calma: qué pasa, qué se probó y qué hace falta, sin
volcar el registro. La voz es constante y el tono se adapta.

### Traducir la jerga

Los términos que salen a diario en este repo, dichos en llano. Si hay que usar
uno, va con su traducción la primera vez.

| Término | En llano |
|---|---|
| rama | Una copia de trabajo aparte, para cambiar cosas sin tocar lo que ya funciona. |
| PR | La petición de pasar mis cambios a lo principal, para que se revisen antes. |
| CI | Las pruebas automáticas que corren solas al subir un cambio. |
| lint | Un corrector automático que avisa de descuidos en el código. |
| merge | Juntar los cambios de una copia de trabajo con la principal. |
| migración | Un cambio en la estructura de la base de datos, con los datos de las familias dentro. |
| worktree | Una carpeta de trabajo propia para cada tarea, para que no se pisen. |
| workflow | Una tarea automática que corre sola en GitHub, por ejemplo a una hora fija. |
| deploy key | Una llave que deja a un proceso automático guardar cambios sin usar la cuenta de nadie. |
| ruleset | Las reglas que dicen quién puede cambiar qué en el repositorio. |
| caso | Un fallo concreto que ha pasado, apuntado para poder contarlo. |
| problema de fondo | La causa común de varios casos: se arregla una vez en vez de tapar cada caso. |
| guardia | El vigilante que bloquea órdenes peligrosas de las sesiones. |
| hook | Una pieza automática que salta antes o después de una acción; la guardia es una. |
| staging | La copia de prueba de la app, antes de producción. |
| producción | La app que usan las familias de verdad. |
| issue | Una ficha apuntada en GitHub para no olvidar algo. |
| agente | Un ayudante especializado que lanza una sesión. |
| skill | Una guía escrita que las sesiones abren al tocar un tema. |

### El comando para pegar

Cuando Pablo tiene que ejecutar algo: una línea antes que diga en llano qué
hace, el comando solo en su bloque de código y nada técnico alrededor.

Bien:

> Esto aplica el cambio en la base de datos; tarda un momento.
>
> ```
> npm run ejemplo -- --si
> ```

## Bien y mal

El mismo caso inventado, dicho dos veces.

### Ejemplo 1: contar que algo está listo

Mal:

> He creado la rama ops/999-ejemplo desde origin/staging, he modificado cuatro
> ficheros (scripts/a.mjs, scripts/b.mjs y dos tests), el lint pasa con la
> línea base y el CI está en verde. Queda abrir el PR y fusionarlo, que puede
> hacerlo la sesión, pero antes habría que decidir si el cambio de permisos va
> en este mismo PR o en otro aparte.

No dice qué ha pasado ni qué hay que decidir hasta el final, y mezcla ramas,
ficheros y lint que Pablo no necesita para decidir.

Bien:

> **El cambio está hecho y probado; falta decidir una cosa.**
>
> - Funciona: los avisos ya llegan con el nombre de la tarea.
> - Las pruebas automáticas pasan.
> - El cambio de permisos puede ir ahora o en otro paso aparte.
>
> Necesito saber si lo de permisos va junto o aparte; yo lo separaría.

### Ejemplo 2: explicar un problema

Mal: un párrafo de ocho líneas que empieza por el historial del fallo, nombra
dos ficheros y un workflow, y deja la causa para la última frase.

Bien:

> **Los avisos se repetían porque el sistema no recordaba qué había avisado ya.**
>
> - Pasaba cada vez que una tarea tardaba más de lo normal.
> - Ya está arreglado: ahora apunta lo avisado y no lo repite.
> - Hay un detalle técnico más largo en el issue, por si te interesa.

### Ejemplo 3: pedir una decisión

Mal: una tabla de tres opciones con columnas de coste, riesgo y esfuerzo.

Bien:

> **Hay que elegir dónde guardar las copias, y recomiendo la opción sencilla.**
>
> - A, la que recomiendo: en el servidor que ya tenemos, sin coste.
> - B: en un servicio aparte, algo más seguro y de pago.
> - C: en tu ordenador, gratis pero depende de que esté encendido.
>
> Respóndeme con la letra.

## Lo que falló y por qué

- **2026-10-10 · la forma de hablar a Pablo vivía solo en su memoria
  personal.** Causa: es una decisión suya y se guardó como preferencia de una
  sesión, que no ven las demás ni el CI; una regla anterior («prosa corta, sin
  negritas») la contradecía y nada las reconciliaba. Arreglo: esta skill, citada
  en `CLAUDE.md`, y sus casos con comprobaciones que puntúa un corrector en
  `npm run skills-prueba`, porque lo que se puede medir (negrita arriba, cuatro
  ideas, nada de tablas) lo ve un corrector sobre una respuesta y no un hook.

## Registro de cambios

- **2026-10-10** · Se funde en esta skill la de la voz con Pablo: tres opciones en las decisiones, cinco plantillas con ejemplo canónico (`plantillas/plantillas.md`), glosario ampliado, resumen en `.claude/PLANTILLA-AGENTE.md` y `.claude/voz.test.js` que cruza regla, skill y plantilla de agentes; el ejemplo 3 pasa a tres opciones y se afinan dos comprobaciones de casos (#415).
- **2026-10-10** · Se añaden «Traducir la jerga» y «El comando para pegar»; el caso del comando se reformula (disparo de 8/9 a 9/9, comprobaciones de 13/16 a 14/16) (#415).
- **2026-10-10** · Primera versión: idea raíz en negrita, cuatro ideas como mucho, petición al final y detalle fuera del chat (#415).

## Fuentes y comprobación

- Barbara Minto, *The Pyramid Principle* (1987): la respuesta primero, el apoyo agrupado debajo. [F]
- https://www.plainlanguage.gov/guidelines/ (Federal Plain Language Guidelines): escribir para quien lee, ir al punto principal primero, frases y secciones cortas, explicar los términos técnicos. [F]
- https://www.iso.org/standard/78907.html (ISO 24495-1, lenguaje claro). [F]
- La forma concreta (negrita en la primera línea, cuatro ideas, petición final) es decisión de Pablo, no de las fuentes. [I]
- https://code.claude.com/docs/en/skills , https://code.claude.com/docs/en/memory y https://code.claude.com/docs/en/output-styles : el cuerpo de una skill carga cuando se usa y `CLAUDE.md` en cada sesión; el estilo de salida es una pieza de Claude Code. [F] La regla corta va en `CLAUDE.md`, el detalle aquí, y no usamos el estilo de salida porque cambia toda la sesión y no llega a los subagentes. [I]
- https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices y https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/increase-consistency: instrucciones claras, ejemplos y formato fijo dan salidas consistentes. [F] Un ejemplo canónico por plantilla. [I]
- https://www.nngroup.com/articles/inverted-pyramid/ , https://www.nngroup.com/articles/how-users-read-on-the-web/ , https://www.nngroup.com/articles/minimize-cognitive-load/ , https://www.nngroup.com/articles/progressive-disclosure/ , https://www.nngroup.com/articles/tone-of-voice-dimensions/ y https://styleguide.mailchimp.com/voice-and-tone/: lo importante primero, se lee en diagonal, menos carga, el detalle a petición, tono que cambia según el momento. [F] Negrita solo donde hay que actuar, «si quieres te lo cuento», voz constante y tono que se adapta. [I]
- https://pubmed.ncbi.nlm.nih.gov/11515286/ (Cowan): la memoria de trabajo ronda cuatro elementos [F]; de ahí, cuatro ideas [I]. https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/writing-guidelines/clear-language/: frases y párrafos cortos, en inglés [F]; los umbrales de 25 palabras y 5 frases son nuestros [I].

Sin comprobar: las fuentes se citan de memoria y no se han releído al escribir; las cifras de 5 frases y 25 palabras son de la guía GOV.UK, en inglés, y la de cuatro ideas es de Cowan y habla de memoria de trabajo, no de lectura; que la voz viva en `CLAUDE.md` y el detalle en la skill es inferencia (la documentación solo dice que el cuerpo de una skill carga cuando se usa); no hay fuente primaria sobre plantillas fijas para agentes de IA; las cinco plantillas y las tres opciones no se han medido aún con `skills-prueba`; cuántas respuestas reales cumplen la forma; y que mejore sobre el modelo solo, porque `skills-prueba` mide la skill con ella y no sin ella.

Comprobado el 2026-10-10: la forma con `.claude/skills.test.js` y los casos con `npm run skills-prueba -- estilo-de-respuesta` (`ops/skills-prueba/estilo-de-respuesta.json`): disparo 8 de 9 y comprobaciones 13 de 16 en la primera pasada, y 9 de 9 y 14 de 16 tras añadir la tabla de jerga y la pauta del comando (0,07 $ cada una). Siguen fallando dos comprobaciones: la jerga de la frase con workflow, deploy key y ruleset, y el comando solo en su bloque.
