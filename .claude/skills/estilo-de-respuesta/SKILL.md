---
name: estilo-de-respuesta
description: Úsala al escribir cualquier respuesta, resumen o aviso a Pablo en una sesión principal («cuéntame cómo va», «explícamelo sencillo», «¿qué decido?», «¿está fusionado?», «¿ha pasado?», «¿seguro?»). Fija la forma: idea raíz en negrita, cuatro ideas como mucho, tres opciones en las decisiones y «Comprobado», «Creo» o «No sé» en lo que afirma. No para: el informe común de un agente (salvo su RESUMEN y sus DECISIONES PENDIENTES), mensajes de Lola, cuerpos de PR, issues ni documentación.
metadata:
  tipo: conocimiento
  opera_proveedor: false
  juzga_artefacto: false
  encadena: false
  pasos_fijos: false
  sintoma_a_causa: false
  elige_opciones: false
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

Vale para toda respuesta de una sesión principal a Pablo. Del informe común de
un agente (`.claude/PLANTILLA-AGENTE.md`), solo el `RESUMEN` y las
`DECISIONES PENDIENTES` siguen esta forma; y la sesión que lo lanzó se lo cuenta a Pablo con ella.

No es para:
- el resto del informe de un agente (`CASOS`, `CAMBIOS`, `EVIDENCIA`,
  `HALLAZGOS`…), el cuerpo de un PR o de un issue y los ficheros de
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
   una a cuatro ideas; si salen cinco, dos son una. Cuatro es un techo, no un
   molde: una pregunta corta (un sí o no, un dato) se contesta con la idea raíz
   y, si hace falta, una línea. No se rellena con ideas para llegar a cuatro.
4. **Quita la jerga.** Un término técnico se evita o se explica en una frase
   la primera vez («rama: una copia de trabajo aparte»). Los nombres de
   ficheros y comandos se dejan fuera salvo que él los pida o los tenga que ejecutar.
   Un issue se nombra por su nombre; el número, si hace falta, va solo entre
   paréntesis, detrás del nombre.
   Los términos del día a día tienen su traducción en «Traducir la jerga».
5. **Si hace falta algo de él, una última línea** con lo que se necesita. Si
   es una decisión, tres opciones en llano (A, B, C), la recomendada primero y
   qué pasa con cada una, y se cierra con «Respóndeme con la letra.».
   Cada opción lleva en su misma línea su «Coste:» (dinero, tiempo o riesgo) y
   «reversible» o «no se puede deshacer» (con «Comprobado» o «Creo» si no lo has
   visto). Elige la plantilla que toca (abajo,
   «Las cinco plantillas»).
6. **El detalle, fuera del chat.** Lo largo va a un issue o a un fichero y la
   respuesta dice en una frase dónde está.
7. **Di cuánto te fías, solo si hace falta.** Cuando afirmas un estado o un
   resultado que Pablo no puede comprobar, una línea «Certeza:» con una de tres
   palabras: «Comprobado» (lo he visto yo, y qué), «Creo» (inferencia, y en qué
   me baso) o «No sé» (y cómo lo averiguo). «Está fusionado» o «pasa el test» solo
   se da como hecho si se comprobó en ese momento. No se añade a un concepto, un
   comando ni un error ya contado, y no quita sitio a las etiquetas de la
   plantilla («Ejemplo:») ni a la línea final con lo que necesita de él.
8. **Ayuda a recordar.** Un issue se nombra por su nombre y su número va solo
   entre paréntesis, detrás («el vigilante de la voz (#453)»). Al volver tras un
   rato o retomar un tema, la idea raíz en negrita lo recuerda
   («**Seguimos con X: falta Y.**»), sin línea aparte.
9. **Repasa antes de enviar.** Primera línea en negrita, cuatro ideas o menos,
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
- negrita solo en la idea raíz y en lo que él debe hacer o decidir;
- una pregunta corta se contesta con la idea raíz y una línea;
- si retoma un tema, la idea raíz lo recuerda dentro de la negrita («**Seguimos con X: falta Y.**»);
- lo que él no puede comprobar lleva «Certeza:» con «Comprobado», «Creo» o «No sé».

Se relaja cuando él lo pide («dame el detalle», «hazme una tabla») y en lo que
él tiene que pegar o ejecutar: un comando para un `!` va en bloque de código,
porque es lo que se le pide y no un detalle.

Esta forma la mide el vigilante de la voz después de cada respuesta (`npm run voz`). No sabe si Pablo pidió el detalle: esas respuestas cuentan como falta.

### Las cinco plantillas

Misma estructura y mismas etiquetas cada vez. Un ejemplo canónico de cada una
y dos fallos típicos reescritos, en `.claude/skills/estilo-de-respuesta/plantillas/plantillas.md`.

| Plantilla | Estructura (las etiquetas se escriben tal cual) |
|---|---|
| resultado | Idea raíz en negrita · «Qué cambia para ti:» · «Ojo:» (solo si hay, una cosa) · «Certeza:» (solo si afirma algo que él no puede comprobar) · «Siguiente paso:» |
| decisión | «Necesito que decidas: …» en negrita · opciones A, B y C (la recomendada primero) con lo que pasa, su «Coste:» y «reversible» o «no se puede deshacer» · «Respóndeme con la letra.» |
| error | Idea raíz en negrita (qué no he podido) · «Qué pasa:» · «Qué he probado:» · «Qué hace falta y de quién:» |
| concepto | Qué es, en una frase con una comparación cotidiana, en negrita · «Para qué te sirve:» · «Ejemplo:» |
| resumen | Estado general en una frase en negrita · cuatro temas como mucho · «Certeza:» si afirma estados · «Lo único que te toca a ti:» |

Un error se cuenta con calma: qué pasa, qué se probó y qué hace falta, sin
volcar el registro. La voz es constante y el tono se adapta.

### Traducir la jerga

El glosario de los términos del día a día (rama, PR, CI, migración, staging…), con su
traducción en llano, está en `.claude/skills/estilo-de-respuesta/plantillas/plantillas.md`.
Si hay que usar uno, va con su traducción la primera vez.

### El comando para pegar

Cuando Pablo tiene que ejecutar algo: una línea antes que diga en llano qué
hace, el comando solo en su bloque de código y nada técnico alrededor.

Bien:

> Esto vuelve a generar los ficheros derivados del catálogo; tarda un momento.
>
> ```
> npm run build:derived
> ```

## Bien y mal

El mismo caso inventado, dicho dos veces.

### Ejemplo 1: contar que algo está listo

Mal:

> He creado la rama ops/999-ejemplo desde origin/staging, he modificado cuatro
> ficheros (dos scripts de importación y dos tests), el lint pasa con la
> línea base y el CI está en verde. Queda abrir el PR y fusionarlo, que puede
> hacerlo la sesión, y el cambio de permisos lo dejo para otro PR.

No dice qué ha pasado hasta el final, y mezcla ramas, ficheros y lint que
Pablo no necesita.

Bien (plantilla de resultado):

> **El cambio está hecho y probado.**
> Qué cambia para ti: los avisos ya llegan con el nombre de la tarea.
> Ojo: el cambio de permisos queda para otro paso aparte.
> Siguiente paso: lo revisa otro agente.

### Ejemplo 2: explicar un problema

Mal: un párrafo de ocho líneas que empieza por el historial del fallo, nombra
dos ficheros y un workflow, y deja la causa para la última frase.

Bien (plantilla de resultado):

> **Los avisos se repetían porque el sistema no recordaba qué había avisado ya.**
> Qué cambia para ti: las familias ya no reciben el mismo aviso dos veces.
> Ojo: pasaba cuando una tarea tardaba más de lo normal.
> Siguiente paso: hay un detalle técnico más largo en el issue, por si te interesa.

### Ejemplo 3: pedir una decisión

Mal: una tabla de tres opciones con columnas de coste, riesgo y esfuerzo.

Bien (plantilla de decisión):

> **Necesito que decidas: dónde guardar las copias.**
> A (recomendada): en el servidor que ya tenemos. Coste: nada. Reversible.
> B: en un servicio aparte, algo más seguro. Coste: de pago. Reversible.
> C: en tu ordenador. Coste: gratis, pero depende de que esté encendido. Reversible.
> Respóndeme con la letra.

## Lo que falló y por qué

- **2026-10-10 · la forma de hablar a Pablo vivía solo en su memoria
  personal.** Causa: es una decisión suya y se guardó como preferencia de una
  sesión, que no ven las demás ni el CI; una regla anterior («prosa corta, sin
  negritas») la contradecía y nada las reconciliaba. Arreglo: esta skill, citada
  en `CLAUDE.md`, y sus casos con comprobaciones que puntúa un corrector en
  `npm run skills-prueba`, porque lo que se puede medir (negrita arriba, cuatro
  ideas, nada de tablas) lo ve un corrector sobre una respuesta y no un hook.
- **2026-10-10 · se dijo «fusionado» a otra sesión el 10 oct 2026 antes de que lo estuviera.**
  Causa: se dio por hecho un estado que no se había mirado; la guardia había
  frenado la fusión y nadie lo comprobó. Arreglo: la certeza en tres palabras
  («Comprobado», «Creo», «No sé») y la regla de que un estado solo es un hecho
  si se comprobó en ese momento; test en `.claude/voz.test.js`.

## Registro de cambios

- **2026-10-10** · Se añade el vigilante de la voz: mide cada respuesta final contra esta forma y cuenta las faltas, sin frenar nada (fase 1; #453).
- **2026-10-10** · Calibración (pedida por Pablo): la forma es un techo y una pregunta corta se contesta en una línea; certeza explícita en una línea «Certeza:» («Comprobado», «Creo», «No sé»), solo cuando hace falta y sin quitar sitio a las etiquetas de la plantilla; el issue por su nombre con el número solo entre paréntesis; al retomar, la idea raíz en negrita recuerda el tema (sin línea aparte); coste y reversibilidad en cada opción; la description gana «¿está fusionado?», «¿ha pasado?» y «¿seguro?»; el glosario pasa a `.claude/skills/estilo-de-respuesta/plantillas/plantillas.md`; `.claude/voz.test.js` vigila las mejoras en la sección de cada pieza; 3 casos nuevos. Medida (dos pasadas seguidas, 0,15 $ y 0,13 $): los 9 casos de antes, 22/29 y 23/29 (antes de la calibración, 24/29 y 23/29; con la primera versión de la certeza llegaron a 20/29 en las dos pasadas, porque el modelo metía «Certeza:» donde no tocaba y le quitaba sitio a «Ejemplo:» y a la línea final); los 3 nuevos, 10/10 y 8/10. Sigue sin medirse contra el modelo solo.
- **2026-10-10** · Se funde en esta skill la de la voz con Pablo: tres opciones en las decisiones, cinco plantillas con ejemplo canónico (en `plantillas/`), glosario ampliado, resumen en `.claude/PLANTILLA-AGENTE.md` y `.claude/voz.test.js` que cruza regla, skill y plantilla de agentes; los ejemplos 1 y 3 siguen las plantillas de resultado y decisión, solo el `RESUMEN` y las `DECISIONES PENDIENTES` de un informe de agente siguen la forma, y los casos pasan a 13 (disparo 13/13, comprobaciones 24/29) (#415). Antes, la primera versión: idea raíz en negrita, cuatro ideas como mucho, petición al final y detalle fuera del chat; después se añaden «Traducir la jerga» y «El comando para pegar» y el caso del comando se reformula (disparo de 8/9 a 9/9, comprobaciones de 13/16 a 14/16) (#415).

## Fuentes y comprobación

- Barbara Minto, *The Pyramid Principle* (1987): la respuesta primero, el apoyo agrupado debajo. [F]
- https://www.plainlanguage.gov/guidelines/ (Federal Plain Language Guidelines): escribir para quien lee, ir al punto principal primero, frases y secciones cortas, explicar los términos técnicos. [F]
- https://www.iso.org/standard/78907.html (ISO 24495-1, lenguaje claro). [F]
- La forma concreta (negrita en la primera línea, cuatro ideas, petición final) es decisión de Pablo, no de las fuentes. [I]
- https://code.claude.com/docs/en/skills , https://code.claude.com/docs/en/memory y https://code.claude.com/docs/en/output-styles : el cuerpo de una skill carga cuando se usa y `CLAUDE.md` en cada sesión; el estilo de salida es una pieza de Claude Code. [F] La regla corta va en `CLAUDE.md`, el detalle aquí, y no usamos el estilo de salida porque cambia toda la sesión y no llega a los subagentes. [I]
- https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices y https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/increase-consistency: instrucciones claras, ejemplos y formato fijo dan salidas consistentes. [F] Un ejemplo canónico por plantilla. [I]
- https://www.nngroup.com/articles/inverted-pyramid/ , https://www.nngroup.com/articles/how-users-read-on-the-web/ , https://www.nngroup.com/articles/minimize-cognitive-load/ , https://www.nngroup.com/articles/progressive-disclosure/ , https://www.nngroup.com/articles/tone-of-voice-dimensions/ y https://styleguide.mailchimp.com/voice-and-tone/: lo importante primero, se lee en diagonal, menos carga, el detalle a petición, tono que cambia según el momento. [F] Negrita solo donde hay que actuar, «si quieres te lo cuento», voz constante y tono que se adapta. [I]
- https://pubmed.ncbi.nlm.nih.gov/11515286/ (Cowan): la memoria de trabajo ronda cuatro elementos [F]; de ahí, cuatro ideas [I]. https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/writing-guidelines/clear-language/: frases y párrafos cortos, en inglés [F]; los umbrales de 25 palabras y 5 frases son nuestros [I].

Sin comprobar: las fuentes se citan de memoria y no se han releído al escribir; las cifras de 5 frases y 25 palabras son de la guía GOV.UK, en inglés, y la de cuatro ideas es de Cowan y habla de memoria de trabajo, no de lectura; que la voz viva en `CLAUDE.md` y el detalle en la skill es inferencia (la documentación solo dice que el cuerpo de una skill carga cuando se usa); no hay fuente primaria sobre plantillas fijas para agentes de IA; cuántas respuestas reales cumplen la forma; y que mejore sobre el modelo solo, porque `skills-prueba` mide la skill con ella y no sin ella.

Comprobado el 2026-10-10: tras la calibración, con 16 casos, dos pasadas seguidas de `npm run skills-prueba -- estilo-de-respuesta` (`ops/skills-prueba/estilo-de-respuesta.json`): disparo 16 de 16 y 16 de 16; los 9 casos de antes, 22/29 y 23/29; los 3 nuevos, 10/10 y 8/10 (0,15 $ y 0,13 $). Antes de la calibración los 9 daban 24/29 y 23/29, y la primera versión de la certeza los bajó a 20/29 en dos pasadas seguidas (no era ruido: ver el registro de cambios). Siguen fallando en las dos pasadas, y no se llaman ruido: `comando-para-pegar` (primera línea en negrita y línea final con lo que necesita), `explicamelo-sencillo` (traducir workflow, deploy key y ruleset), `cuentame-como-va` (no nombrar CI ni lint sin explicarlos) y `resume-informe-agente` (idea raíz en negrita; el modelo describe lo que haría en vez de escribir el resumen). En una pasada anterior `decir-cuanto-te-fias` falló «idea raíz en negrita y corta»; en estas dos pasa. `pregunta-corta-si-no` falló en la segunda pasada (una línea de más). Sigue sin medirse contra el modelo solo.
