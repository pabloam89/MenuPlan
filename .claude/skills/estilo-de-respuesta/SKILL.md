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
5. **Si hace falta algo de él, una última línea** con lo que se necesita y,
   si hay recomendación, la recomendación primero («Necesito tu sí para
   subirlo; yo diría que sí»).
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
- si hace falta algo de él, es la última línea.

Se relaja cuando él lo pide («dame el detalle», «hazme una tabla») y en lo que
él tiene que pegar o ejecutar: un comando para un `!` va en bloque de código,
porque es lo que se le pide y no un detalle.

Por qué funciona (fuentes en el último apartado): la conclusión primero y el
apoyo después es el principio de la pirámide de Minto, y escribir para quien
lee, con palabras corrientes y frases cortas, es lo que pide el lenguaje claro
(plain language). La forma concreta de aquí (negrita y cuatro ideas) es
decisión de Pablo.

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
> - Opción A, la que recomiendo: en el servidor que ya tenemos, sin coste.
> - Opción B: en un servicio aparte, algo más seguro y de pago.
>
> Dime A o B.

## Lo que falló y por qué

- **2026-10-10 · la forma de hablar a Pablo vivía solo en su memoria
  personal.** Causa: es una decisión suya y se guardó como preferencia de una
  sesión, que no ven las demás ni el CI; una regla anterior («prosa corta, sin
  negritas») la contradecía y nada las reconciliaba. Arreglo: esta skill, citada
  en `CLAUDE.md`, y sus casos con comprobaciones que puntúa un corrector en
  `npm run skills-prueba`, porque lo que se puede medir (negrita arriba, cuatro
  ideas, nada de tablas) lo ve un corrector sobre una respuesta y no un hook.

## Registro de cambios

- **2026-10-10** · Primera versión: idea raíz en negrita, cuatro ideas como mucho, petición al final y detalle fuera del chat (#415).

## Fuentes y comprobación

- Barbara Minto, *The Pyramid Principle* (1987): la respuesta primero, el apoyo agrupado debajo. [F]
- https://www.plainlanguage.gov/guidelines/ (Federal Plain Language Guidelines): escribir para quien lee, ir al punto principal primero, frases y secciones cortas, explicar los términos técnicos. [F]
- https://www.iso.org/standard/78907.html (ISO 24495-1, lenguaje claro). [F]
- La forma concreta (negrita en la primera línea, cuatro ideas, petición final) es decisión de Pablo, no de las fuentes. [I]

Sin comprobar: las fuentes se citan de memoria y no se han releído al escribir; cuántas respuestas reales cumplen la forma; y que mejore sobre el modelo solo, porque `skills-prueba` mide la skill con ella y no sin ella.

Comprobado el 2026-10-10: la forma con `.claude/skills.test.js` y los casos con `npm run skills-prueba -- estilo-de-respuesta` (`ops/skills-prueba/estilo-de-respuesta.json`): disparo 8 de 9 y comprobaciones 13 de 16 en la primera pasada (0,07 $); fallan un caso de frontera cercano («comando para pegar» elige ninguna) y tres comprobaciones sobre jerga y ficheros. Una sola pasada, sin segunda.
