---
name: voz-con-pablo
description: Úsala al escribirle a Pablo un resultado, una decisión, un error, una explicación o un resumen («explícamelo sencillo», «uff muy lío», «dame opciones»). No para: el formato del informe de un agente (PLANTILLA-AGENTE), el cuerpo de un issue (issues), la prosa de Lola ni los textos de la app.
metadata:
  tipo: oficio
  dueno: gobierno
  comprobado: 2026-10-10
---

# Voz con Pablo

## Cuándo y para qué

Pablo no es informático y decide rápido si el mensaje cabe en su cabeza. Esta
skill da el detalle de la regla corta de `CLAUDE.md` («Cómo se le habla a
Pablo»): las cinco plantillas fijas, el glosario y los fallos típicos, para
que toda sesión y todo agente suene igual. Entra lo que quieres contarle; sale
un mensaje que cumple la forma y las reglas medibles de abajo.

No es para:
- el informe común de un agente (`ESTADO`, `CASOS`, `EVIDENCIA`…): lo define
  `.claude/PLANTILLA-AGENTE.md`; esta voz es la del chat con Pablo y la del
  `RESUMEN` de ese informe;
- el cuerpo de un issue o de un PR, que lleva el detalle técnico que él no lee
  (skills `issues` y `github`);
- lo que dice Lola a las familias o los textos de la app.

## Método

1. **Elige la plantilla por lo que vas a decir** (sección «Técnicas»): resultado
   de una tarea, decisión, error, concepto o resumen. Un mensaje, una plantilla.
   Si cabrían dos, son dos mensajes.
2. **Escribe primero la idea raíz**: una frase, en negrita, con el resultado o
   la respuesta. Si no sabes decirla en una frase, aún no sabes qué contar.
3. **Añade cuatro ideas cortas, como mucho.** Cada una, media línea o una
   frase. Lo demás se queda fuera y se ofrece con «si quieres te lo cuento». El
   detalle técnico va a un issue o a un fichero, no al chat.
4. **Pasa las reglas medibles**: frases de menos de 25 palabras; párrafos de
   cinco frases como mucho; sin preámbulo («Claro, voy a…»), sin recapitular al
   final, sin autoelogio, sin emojis; negrita solo en la idea raíz y en lo que
   Pablo debe hacer o decidir; listas solo para elementos paralelos.
5. **Pasa el glosario**: cada término técnico se explica la primera vez con la
   frase de la tabla de abajo y después se llama igual en todo el mensaje. Sin
   nombres de ficheros, ramas ni comandos salvo que él los pida.
6. **Cuenta el resultado, no el proceso.** Qué cambia para él, no qué hiciste
   para llegar. Un error dice qué pasa, qué se probó y qué hace falta, con calma.
7. **Cierra con lo que le toca a él**, en una línea. Si es una decisión, tres
   opciones en llano (A, B, C), la recomendada primero y qué pasa con cada una,
   y se acaba con «Respóndeme con la letra.». Si no le toca nada, la última
   línea es el siguiente paso, no una pregunta de cortesía.

Sale bien si: el primer renglón se entiende sin leer el resto, no pasa de
cuatro ideas y un lector sin conocimientos técnicos sabe qué tiene que hacer
(o que no tiene que hacer nada). La voz es constante; el tono se adapta: más
calma y más corto cuando hay un error, más ligero cuando todo ha ido bien.

## Técnicas

Las cinco plantillas fijas, con la misma estructura y las mismas etiquetas
cada vez. Un ejemplo canónico de cada una y dos fallos típicos reescritos están
en `.claude/skills/voz-con-pablo/plantillas/plantillas.md`; ábrelo antes de
escribir el primer mensaje de la sesión.

| Plantilla | Estructura (las etiquetas se escriben tal cual) |
|---|---|
| resultado | Idea raíz en negrita · «Qué cambia para ti:» · «Ojo:» (solo si hay, una cosa) · «Siguiente paso:» |
| decisión | «Necesito que decidas: …» en negrita · opciones A, B y C (la recomendada primero) con lo que pasa con cada una · «Respóndeme con la letra.» |
| error | Idea raíz en negrita (qué no he podido) · «Qué pasa:» · «Qué he probado:» · «Qué hace falta y de quién:» |
| concepto | Qué es, en una frase con una comparación cotidiana, en negrita · «Para qué te sirve:» · «Ejemplo:» |
| resumen | Estado general en una frase en negrita · cuatro temas como mucho, media línea cada uno · «Lo único que te toca a ti:» |

### Glosario (la frase con la que se explica la primera vez)

| Término | En llano |
|---|---|
| caso | un fallo concreto que ha pasado, apuntado para poder contarlo |
| problema de fondo | la causa común de varios casos: se arregla una vez en lugar de tapar cada caso |
| carpeta de trabajo (worktree) | una copia del proyecto donde una sesión hace una sola tarea |
| PR | la petición de pasar un cambio a la versión de todos, para que se revise |
| CI | las comprobaciones automáticas que corren en cada PR |
| migración | un cambio en la estructura de la base de datos |
| guardia | el vigilante que bloquea órdenes peligrosas de las sesiones |
| hook | una pieza automática que salta antes o después de una acción (la guardia es una) |
| staging | la copia de prueba de la app, antes de producción |
| producción | la app que usan las familias de verdad |
| issue | una ficha apuntada en GitHub para no olvidarla |
| agente | un ayudante especializado que lanza una sesión |
| skill | una guía escrita que las sesiones abren al tocar un tema |

## Ejemplo resuelto

Un mensaje largo y técnico, y cómo queda con la plantilla de resultado (el
texto completo, y el segundo fallo típico, en el fichero de plantillas):

- Antes: tres párrafos con rutas, número de migración, rama, estado del CI y un
  «en resumen» que repite lo anterior; la decisión, enterrada al final.
- Después: una frase en negrita con el resultado, «Qué cambia para ti:», un
  «Ojo:» con una sola cosa y «Siguiente paso:». Sin rutas ni ramas.

## Lo que falló y por qué

- **2026-10-10 · cada sesión contaba las cosas a su manera.** Causa: la única
  regla era una preferencia en la memoria personal de Pablo, que no leen los
  agentes ni las sesiones de otro PC. Arreglo: la regla corta en `CLAUDE.md`
  (cargada en cada sesión), esta skill con el detalle, el resumen en
  `.claude/PLANTILLA-AGENTE.md` y `.claude/voz.test.js`, que vigila que las tres
  piezas nombren las mismas cinco plantillas y que los ejemplos cumplan las
  reglas medibles.

## Registro de cambios

- **2026-10-10** · Primera versión: forma fija, cinco plantillas, tres opciones en las decisiones, glosario y un test que cruza regla, skill y plantilla de agentes.

## Fuentes y comprobación

Cada punto: [F] está en la fuente, [I] es inferencia nuestra.

- https://code.claude.com/docs/en/skills · [F] el cuerpo de una skill se carga cuando se usa.
- https://code.claude.com/docs/en/memory · [F] `CLAUDE.md` se carga en cada sesión.
- https://code.claude.com/docs/en/output-styles · [F] el estilo de salida es una pieza propia de Claude Code; [I] no lo usamos porque cambia a toda la sesión y no llega a los subagentes.
- https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices · [F] instrucciones claras y ejemplos canónicos; [I] la plantilla fija es un ejemplo canónico por tipo de mensaje.
- https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/increase-consistency · [F] formato fijo y ejemplos para salidas consistentes.
- https://www.nngroup.com/articles/inverted-pyramid/ · [F] lo importante, primero; [I] la idea raíz va en la primera línea.
- https://www.nngroup.com/articles/how-users-read-on-the-web/ · [F] se lee en diagonal; [I] negrita solo donde hay que actuar.
- https://www.nngroup.com/articles/minimize-cognitive-load/ · [F] menos carga cognitiva con menos elementos y menos opciones.
- https://www.nngroup.com/articles/progressive-disclosure/ · [F] lo avanzado, a petición; [I] «si quieres te lo cuento».
- https://www.nngroup.com/articles/tone-of-voice-dimensions/ · [F] el tono se describe en dimensiones; [I] voz constante y tono que se adapta.
- https://pubmed.ncbi.nlm.nih.gov/11515286/ · [F] la memoria de trabajo ronda cuatro elementos (Cowan); [I] de ahí, cuatro ideas.
- https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/writing-guidelines/clear-language/ · [F] frases cortas y párrafos breves (guía en inglés); [I] 25 palabras y 5 frases son nuestros umbrales.
- https://styleguide.mailchimp.com/voice-and-tone/ · [F] la voz es constante y el tono cambia según el momento.

Comprobado el 2026-10-10: la forma con `.claude/skills.test.js` y la coherencia con la regla de `CLAUDE.md` y la plantilla de agentes con `.claude/voz.test.js`, visto fallar una vez. Sin comprobar: las fuentes no se releyeron al escribir (vienen de la investigación del encargo); las cifras de 5 frases y 25 palabras son de la guía GOV.UK, en inglés, y no se han contrastado para castellano; la de cuatro ideas es de Cowan y habla de memoria de trabajo, no de lectura; que la voz viva en `CLAUDE.md` y no en la skill es inferencia (la documentación solo dice que el cuerpo de una skill carga cuando se usa); no hay fuente primaria sobre plantillas fijas para agentes de IA; no se ha medido con `npm run skills-prueba -- voz-con-pablo` (cuesta tokens) ni se sabe aún si a Pablo le sirven estas plantillas tras una semana de uso.
