---
name: cierre-eficaz
description: Úsala cuando la ventana de observación de un fondo vence o está a punto («¿aguantó el arreglo?», «¿se puede cerrar este fondo?», «evalúa si sirvió», un fondo en en-observacion). Lleva el fondo hasta el cierre con una cifra antes y después y un veredicto. No para: diagnosticar el fallo (causa-raiz), partir el arreglo en encargos o fijar la cifra de partida (plan-de-arreglo), registrar casos o editar la ficha (issues).
metadata:
  tipo: revision
  opera_proveedor: false
  juzga_artefacto: true
  encadena: false
  pasos_fijos: false
  sintoma_a_causa: false
  elige_opciones: false
  porque_tipo: "juzga_artefacto es true: el artefacto es el arreglo ya fusionado de un fondo, y lo que sale es un veredicto con su cifra; los pasos del método sirven a ese juicio"
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

## Qué mira

Cinco señales observables, que salen de la ficha del fondo (`gh issue view <fondo> --comments`) y del PR del arreglo:

| Señal | De dónde sale | Código |
|---|---|---|
| La verificación existe y pasa | `verificacion` en `origin/staging` (tras `git fetch`) y su comando (`npx vitest run <fichero>` si es un test) | `verificacion` |
| La cifra de antes, con su comando y condiciones | `barrido` de la ficha o el cuerpo del PR | `sin-partida` |
| La cifra de después, con el mismo comando y las mismas condiciones | el comando repetido hoy | `condiciones` |
| Los casos nuevos de la ventana | `npm run issues`: creados desde `ventana_desde` o `no-aguanto-*` | `casos-nuevos` |
| El aprendizaje | campo `aprendizaje` de la ficha | `sin-aprendizaje` |

## Cómo puntúa

Un solo veredicto por fondo, y su porqué en una frase:

| Veredicto | Cuándo | Después |
|---|---|---|
| `eficaz` | la verificación pasa, la cifra de después es mejor que la de antes (o llega al objetivo fijado), con el mismo comando y sin casos nuevos | el workflow `fondos` cierra |
| `insuficiente` | la verificación falla, o la cifra no mejora, o hay casos nuevos o `no-aguanto-*` | caso nuevo y reapertura del fondo |
| `no-evaluable` | no hay cifra de partida, o no hay comando que se pueda repetir, o cambiaron las condiciones | vuelve a `plan-de-arreglo` para fijarla; la ventana sigue abierta |

La cifra que sale es una línea `antes: <n> después: <m> comando: <c>`. Un `no-evaluable` no cierra ni reabre
el fondo: lo deja donde estaba y pide la cifra de partida.

## Método

1. **Mira el momento y lo apuntado.** `git fetch origin`, la hora con `npm run hora` (no con `date`) y
   `npm run buscar -- "<fondo>"`. El fondo está en `en-observacion` y `ventana_hasta` venció o vence en 7 días;
   si otro agente ya dejó un `cierre-eficaz:` en el fondo, se añade evidencia y no se repite.
2. **Lee la ficha y el PR del arreglo.** Sale: `barrera`, `verificacion`, `barrido`, `ventana_desde`,
   `ventana_hasta`, `casos`, `encargos`. Si falta alguno, el veredicto es `no-evaluable`.
3. **Comprueba la verificación.** Existe en `origin/staging` y pasa. Si falla, es `insuficiente`.
4. **Cifra de antes.** De `barrido` o del PR: número, comando y condiciones. Sin número y sin comando de donde
   sale, es `no-evaluable` y el fondo vuelve a `plan-de-arreglo`; no se inventa una cifra de partida de memoria.
5. **Cifra de después** con el mismo comando y las mismas condiciones. Si cambiaron el comando, el set o los
   datos a la vez que el código, la comparación no vale: `no-evaluable`.
6. **Casos nuevos de la ventana.** Cuéntalos con sus números.
7. **Decide el veredicto** con la tabla de arriba.
8. **Escribe el aprendizaje**: qué skill, regla, test o catálogo quedó tocado, o `ninguno — <motivo>`
   <!-- norma:lecciones-a-un-test -->. En un `insuficiente`, el aprendizaje es lo que faltaba.
9. **Deja el rastro**: un comentario del fondo con `cierre-eficaz: veredicto=<v> antes=<n> despues=<m>` y
   `comando: <c>`, y el campo `aprendizaje` en la ficha. No se añaden claves nuevas a la ficha: su vocabulario es cerrado.
10. **Propón, no cierres.** `eficaz`: cierra el workflow `fondos` al vencer la ventana
    <!-- norma:fondo-no-cierra-sin-aprendizaje -->; si ya cerró sin tu veredicto, lo dejas escrito igualmente.
    `insuficiente`: registra un caso `no-aguanto-corto` o `no-aguanto-roto` (skill `issues`) y cuélgalo con
    `--colgar`, que reabre el fondo. `no-evaluable`: devuélvelo a `plan-de-arreglo`.
11. **Que lo contraste otro**: el informe va al `revisor`, que repite el comando y obtiene la cifra de después.
    Cerrar a mano un fondo que el workflow no cerraría, o cambiar su alcance, su barrera o el vocabulario de la
    ficha, se pregunta a Pablo.

Sale bien si: hay un veredicto, las dos cifras con su comando (o el motivo de que no existan), el
`aprendizaje` escrito y una propuesta que no ejecutaste tú.

## Lo que falló y por qué

- **2026-10-13 · un fondo se daba por eficaz solo porque la ventana vencía limpia.** Causa: el pase diario cierra por silencio, y un fallo raro o una cifra que no cambió también dejan una ventana limpia; de 53 obligaciones del camino, solo 5 eran duras y los pasos verificar, aprender y medir eran blandos. Arreglo: esta skill y la tarea `evaluar-la-eficacia` del analista; el veredicto sigue siendo blando (lo escribe una sesión). Antes: 0 fondos cerrados con la cifra comparada; después: no medido todavía.

## Registro de cambios

- **2026-10-13** · Primera versión: veredicto `eficaz`, `insuficiente` o `no-evaluable`, cifra antes y después con el mismo comando, y quien evalúa no cierra (parte de #652).

## Fuentes y comprobación

- `docs/ops/FLUJO.md` y `ops/flujo.json`: los pasos observar, cerrar, aprender y medir.
- `scripts/lib/fondos.mjs` y `.claude/skills/issues/referencias/workflow-fondos.md`: qué hace ya el workflow.
- https://sre.google/sre-book/postmortem-culture/ : las acciones de un postmortem se siguen hasta comprobar que cumplieron.

Comprobado el 2026-10-13: la forma con `.claude/skills.test.js` y `.claude/cierre-eficaz.test.js`. Sin comprobar: un fondo real evaluado de punta a punta con esta skill, y `npm run skills-prueba -- cierre-eficaz` (cuesta tokens).
