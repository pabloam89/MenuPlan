---
name: cierre-eficaz
description: Úsala cuando la ventana de observación de un fondo vence o está a punto («¿aguantó el arreglo?», «¿se puede cerrar este fondo?», «evalúa si sirvió», un fondo en en-observacion). Lleva el fondo hasta el cierre con una cifra antes y después y un veredicto. No para: diagnosticar el fallo (causa-raiz), partir el arreglo en encargos o fijar la cifra de partida (plan-de-arreglo), registrar casos o editar la ficha (issues).
metadata:
  tipo: procedimiento
  opera_proveedor: false
  juzga_artefacto: false
  encadena: false
  pasos_fijos: true
  sintoma_a_causa: false
  elige_opciones: false
  dueno: analista
  comprobado: 2026-10-13
  normas: [fondo-ventana-sin-casos, fondo-no-cierra-sin-aprendizaje, lecciones-a-un-test, quien-construye-no-juzga]
---

# Cierre eficaz

## Cuándo y para qué

Es el último tramo del camino de un fallo (`docs/ops/FLUJO.md`, pasos observar, cerrar, aprender y medir): entra un fondo en
`en-observacion` y sale con un veredicto de vocabulario cerrado, su `aprendizaje` escrito y
una propuesta de cierre o de reapertura. Antes solo se miraba que la ventana venciera limpia
<!-- norma:fondo-ventana-sin-casos -->; aquí se mira además que **la cifra mejoró** con el mismo comando.
La ventana limpia dice que nadie ha vuelto a ver el fallo; la cifra dice que el arreglo hizo algo.

No es para:
- diagnosticar el fallo: `causa-raiz`; partir el arreglo y fijar la cifra de partida: `plan-de-arreglo`;
- registrar casos, colgarlos o editar la ficha: `issues`;
- cerrar el fondo: lo cierra el workflow `fondos` (`.claude/skills/issues/referencias/workflow-fondos.md`) o lo decide otro agente.
  Quien evalúa no cierra <!-- norma:quien-construye-no-juzga -->.

## Método

1. **Lee la ficha** (`gh issue view <fondo> --comments`) y el PR del arreglo. Sale: `barrera`,
   `verificacion`, `barrido`, `ventana_desde`, `ventana_hasta`, `casos`, `encargos`. Si falta algo de esto, el veredicto es `no-evaluable`.
2. **Comprueba la verificación.** El fichero de `verificacion` está en `origin/staging` (tras `git fetch`) y
   pasa: `npx vitest run <fichero>` si es un test; si es un hook, un workflow o un script, el comando que su
   cabecera dice. Sale: pasa o falla, con la salida. Si falla, el veredicto es `insuficiente`.
3. **Saca la cifra de antes** de `barrido` (ficha) o del cuerpo del PR del arreglo: número, comando y condiciones
   (qué rama, qué datos). Sin número y sin comando de donde sale, el veredicto es `no-evaluable` y el fondo vuelve
   a `plan-de-arreglo` para fijarlo; no se inventa una cifra de partida desde la memoria.
4. **Saca la cifra de después** con el **mismo comando y las mismas condiciones**. Si cambiaron el comando, el
   set o los datos a la vez que el código, la comparación no vale: `no-evaluable`. Sale: una línea
   `antes: <n> después: <m> comando: <c>`.
5. **Cuenta los casos nuevos** de la ventana (`npm run issues`, el fondo y sus hijos): creados desde
   `ventana_desde` o `no-aguanto-*`. Sale: n casos, con sus números.
6. **Decide el veredicto** con la tabla de abajo. Uno solo, y su porqué en una frase.
7. **Escribe el aprendizaje**: qué skill, regla, test o catálogo quedó tocado, o `ninguno — <motivo>`
   <!-- norma:lecciones-a-un-test -->. Si el veredicto es `insuficiente`, el aprendizaje es lo que faltaba.
8. **Deja el rastro** en un comentario del fondo con dos líneas contables:
   `cierre-eficaz: veredicto=<v> antes=<n> despues=<m>` y `comando: <c>`; y el campo `aprendizaje` en la ficha.
   No se añaden claves nuevas a la ficha: su vocabulario es cerrado.
9. **Propón, no cierres.** `eficaz`: el workflow `fondos` cierra al vencer la ventana, que sigue siendo suya
   <!-- norma:fondo-no-cierra-sin-aprendizaje -->; si ya cerró sin tu veredicto, lo dejas escrito igualmente.
   `insuficiente`: registra un caso con `analisis: no-aguanto-corto` o `no-aguanto-roto` (skill `issues`) y
   cuélgalo (`--colgar`), que reabre el fondo. `no-evaluable`: devuélvelo a `plan-de-arreglo`.
10. **Que lo juzgue otro**: el informe va al `revisor`, que contrasta las dos cifras con el comando.

Sale bien si: hay un veredicto, las dos cifras con su comando (o el motivo de que no existan), el
`aprendizaje` escrito y una propuesta que no ejecutaste tú.

### Veredictos

| Veredicto | Cuándo | Después |
|---|---|---|
| `eficaz` | la verificación pasa, la cifra de después es mejor que la de antes (o llega al objetivo fijado), con el mismo comando y sin casos nuevos | el workflow `fondos` cierra |
| `insuficiente` | la verificación falla, o la cifra no mejora, o hay casos nuevos o `no-aguanto-*` | caso nuevo y reapertura del fondo |
| `no-evaluable` | no hay cifra de partida, o no hay comando que se pueda repetir, o cambiaron las condiciones | vuelve a `plan-de-arreglo` para fijarla; ventana abierta |

## Antes de empezar

- `git fetch origin` y la hora con `npm run hora` (nunca `date`): la ventana se compara con el día de Madrid.
- El fondo está en `en-observacion` y `ventana_hasta` ya venció o vence en 7 días. Antes, no hay nada que evaluar.
- `npm run buscar -- "<fondo o síntoma>"`: si otro agente ya dejó un `cierre-eficaz:` en el fondo, se añade evidencia y no se repite.

## Cómo se comprueba

- `gh issue view <fondo> --comments` enseña la línea `cierre-eficaz: veredicto=…` y el campo `aprendizaje` en la ficha.
- El comentario del bot del fondo (`<!-- menuplan:fondo -->`) sin `cierre-sin-aprendizaje` ni `verificacion-no-existe`.
- Las dos cifras salen del mismo comando: quien revise lo repite y obtiene la de después.

## Qué requiere el OK de Pablo

- Cerrar a mano un fondo que el workflow no cerraría, o cerrar un `no-evaluable`.
- Cambiar el alcance, la barrera o el vocabulario de la ficha, o añadir una clave nueva.
- Todo lo demás (comentar, registrar el caso, escribir el aprendizaje) es rutina.

## Lo que falló y por qué

- **2026-10-13 · un fondo se daba por eficaz solo porque la ventana vencía limpia.** Causa: el pase diario cierra por silencio, y un fallo raro o una cifra que no cambió también dejan una ventana limpia; de 53 obligaciones del camino, solo 5 eran duras y los pasos verificar, aprender y medir eran blandos. Arreglo: esta skill y la tarea `evaluar-la-eficacia` del analista; el veredicto sigue siendo blando (lo escribe una sesión). Antes: 0 fondos cerrados con la cifra comparada; después: no medido todavía.

## Registro de cambios

- **2026-10-13** · Primera versión: veredicto `eficaz`, `insuficiente` o `no-evaluable`, cifra antes y después con el mismo comando, y quien evalúa no cierra (parte de #652).

## Fuentes y comprobación

- `docs/ops/FLUJO.md` y `ops/flujo.json`: los pasos observar, cerrar, aprender y medir.
- `scripts/lib/fondos.mjs` y `.claude/skills/issues/referencias/workflow-fondos.md`: qué hace ya el workflow.
- https://sre.google/sre-book/postmortem-culture/ : las acciones de un postmortem se siguen hasta comprobar que cumplieron.

Comprobado el 2026-10-13: la forma con `.claude/skills.test.js` y `.claude/cierre-eficaz.test.js`. Sin comprobar: un fondo real evaluado de punta a punta con esta skill, y `npm run skills-prueba -- cierre-eficaz` (cuesta tokens).
