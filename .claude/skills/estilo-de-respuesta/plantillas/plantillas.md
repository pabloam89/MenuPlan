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
A (recomendada): seguir con las 9. No cambia nada para ellas y no hay que escribirles.
B: preguntarles la hora por Telegram. Cada casa elige, pero es un mensaje más a las familias.
C: ponerles la hora de su primera conexión. Parece natural, pero puede sorprender a quien entró de madrugada.
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
