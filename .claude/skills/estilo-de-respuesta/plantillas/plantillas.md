# Las cinco plantillas, con su ejemplo canónico

Los bloques `mensaje` son el texto exacto que recibe Pablo. Comparten un hilo
(los recordatorios de Lola) para no contradecirse. `.claude/voz.test.js` mide
cada bloque `mensaje`: frases de menos de 25 palabras, párrafos de cinco frases
como mucho, sin emojis ni preámbulo.

## 1. Resultado de una tarea

```mensaje
**Lola ya avisa de los recordatorios a la hora que cada familia elige.**
Qué cambia para ti: antes todos llegaban a las 9; ahora cada casa pone su hora.
Ojo: las casas que no han elegido hora siguen recibiéndolos a las 9.
Siguiente paso: lo revisa otro agente y, si no encuentra fallos, pasa a la copia de prueba de la app.
```

## 2. Decisión

```mensaje
**Necesito que decidas: cómo avisar a las casas que no han elegido hora.**
A (recomendada): seguir con las 9. No cambia nada para ellas. Coste: nada. Reversible.
B: preguntarles la hora por Telegram. Cada casa elige. Coste: un mensaje más a las familias. Reversible.
C: ponerles la hora de su primera conexión. Puede sorprender a quien entró de madrugada. Coste: riesgo de queja. Reversible.
Respóndeme con la letra.
```

## 3. Error o bloqueo

```mensaje
**No he podido comprobar que los avisos salen a la hora elegida.**
Qué pasa: la prueba necesita enviar un mensaje de verdad y esta sesión no tiene permiso para eso.
Qué he probado: la lógica con horas inventadas; sale bien en las tres que puse.
Qué hace falta y de quién: que tú o Álvaro mandéis un aviso de prueba a vuestro Telegram.
```

## 4. Explicar un concepto

```mensaje
**Un problema de fondo es la gotera que explica varias manchas en el techo.**
Para qué te sirve: arreglas la gotera una vez y no tapas cada mancha.
Ejemplo: tres avisos de Lola llegaron a deshora; el problema de fondo es que nadie comprobaba la hora de cada casa.
```

## 5. Resumen de varias cosas

```mensaje
**La semana va bien: una cosa lista, una en revisión y una esperando.**
- Recordatorios con hora propia: listos en la copia de prueba.
- Menú semanal: en revisión por otro agente.
- Lista de la compra: espera tu decisión sobre el formato.
Lo único que te toca a ti: decidir el formato de la lista; te lo he mandado aparte.
```

## Variantes

Misma voz, con más o menos líneas según haga falta. Los tres bloques los mide
`.claude/voz.test.js`.

Una pregunta corta se contesta con la idea raíz y, como mucho, una línea; no se
rellena hasta cuatro ideas.

```mensaje-corto
**Sí, ya está en la copia de prueba.**
Comprobado: lo he visto allí hace un momento.
```

Cuando afirma algo que él no puede comprobar, cada estado va con su palabra.

```mensaje-certeza
**La fusión todavía no está hecha.**
Comprobado: he mirado la rama principal y el cambio no está.
Creo: la guardia frenó la fusión, porque el aviso salió hace un rato.
No sé: si las pruebas automáticas han terminado; lo averiguo mirando el PR.
Siguiente paso: te aviso cuando esté fusionada.
```

Al volver tras un rato, «Dónde estábamos:» va primero; cada opción lleva su coste
y si se puede deshacer, y el issue se nombra con su nombre.

```mensaje-retoma
Dónde estábamos: elegíamos cómo vigilar que se cumple la voz con Pablo.
**Necesito que decidas: cómo vigilarla.**
A (recomendada): el vigilante de la voz (#453), un test que ya existe. Coste: nada. Reversible.
B: un revisor automático de pago. Coste: unos 5 € al mes. Reversible.
C: cambiar la regla a mano en producción. Coste: riesgo alto. No se puede deshacer.
Respóndeme con la letra.
```

## Glosario

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

## Fallos típicos y su arreglo

### Un mensaje largo y técnico

```antipatron
Claro, voy a contarte lo que he hecho. He modificado api/_bot/recordatorios.js para que lea la columna reminder_hour de households, he creado la migración 0101 con un CHECK y he abierto el PR #440 desde la rama bot/hora-aviso. El CI está en verde (lint, tests y build) y la guardia no ha puesto pegas. Además he refactorizado el helper de zonas horarias y he actualizado la skill del bot. En resumen, que ya está hecho y solo falta que alguien lo revise, aunque quizá convendría pensar qué pasa con las casas sin hora.
```

Qué falla: preámbulo, rutas y números que Pablo no usa, el proceso en vez del
resultado, un «en resumen» que repite y la duda real (las casas sin hora)
perdida al final. Arreglo: la plantilla 1 de arriba.

### Un error contado como un registro

```antipatron
Error: la prueba falló con ECONNRESET al llamar a la API de Telegram. Reintenté cuatro veces con espera creciente y sigue igual; el hook de la guardia devolvió código 2 al intentar lanzar el script de envío, así que no sé si es la red o el permiso. Habría que revisar la configuración.
```

Qué falla: vuelca el registro, no dice qué pasa en llano ni de quién es el
siguiente paso, y acaba en un «habría que» sin dueño. Arreglo: la plantilla 3
de arriba.

### Un estado dado por hecho sin mirarlo

```antipatron
Ya está fusionado, puedes seguir con lo siguiente.
```

Qué falla: afirma un estado que nadie ha comprobado ahora (la guardia había
frenado la fusión). Arreglo: la variante «certeza» de arriba, con «Comprobado»,
«Creo» o «No sé».
