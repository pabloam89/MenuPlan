---
description: Revisión semanal de los issues — juntar casos en problemas de fondo, ver qué arreglos no aguantan y qué atacar primero
---

Mira el conjunto de los issues, que caso a caso no se ve. Es una revisión
CONJUNTA: propones, la persona decide. Las reglas, en CLAUDE.md («Cuando algo
falla») y en la skill `issues`.

1. Corre `npm run issues` y resume en tres líneas: qué problemas de fondo
   tienen más casos, cuáles se reabrieron (¿roto o corto?) y qué ha entrado
   esta semana.
2. **Puntuales.** Lee los de las últimas semanas. Si tres o más se parecen
   (misma causa, mismo sitio, mismo mecanismo), no eran puntuales: propón el
   problema de fondo que los junta, con su arreglo general.
3. **Casos sin colgar o mal colgados.** Los que salen en «Sin clasificar o sin
   trazar», y los que cuelgan de un fondo cuyo mecanismo no es el suyo.
   Propón dónde va cada uno.
4. **Fondos repetidos.** Si dos problemas de fondo son el mismo mecanismo con
   otro nombre, propón juntarlos (los casos y encargos del pequeño pasan al
   grande y el pequeño se cierra con `arreglo:ninguno` y un enlace).
5. **Fondos sin arreglo en marcha.** Los abiertos sin encargos, o con
   encargos que nadie ha cogido. Para cada uno, propón los encargos (uno por
   superficie, o uno solo si es una pieza común) con su agente. Mira también
   el informe de fichas de `npm run issues` (#337): fondos sin ficha, sin
   diagnóstico o con la ventana vencida, y los `matiz` repetidos: si dos
   fondos distintos necesitan el mismo matiz, falta un valor en el vocabulario
   (propón añadirlo en `scripts/lib/fondos.mjs`).
6. **Arreglos que no aguantaron.** Por agente: si a uno se le reabren fondos
   por «corto» a menudo, su forma de arreglar se queda en los casos; propón
   qué cambiar en su fichero de `.claude/agents/` (lo cambia `gobierno`).
7. **Planos.** Corre `npm run planos -- --red` (y mira si el workflow
   `planos-semanal.yml` dejó abierto «Planos: la medición semanal no
   cuadra»). Si un nivel no cuadra, di si es real (se guarda con
   `--escribir` en un PR) o un fallo (encargo para arreglarlo); repasa los
   juicios caducados; y del plano más lejos de su objetivo de «Lanzar»,
   propón como encargo su primer `por_definir`.
8. Enseña una tabla corta con las propuestas y pregunta cuáles se aprueban.
   Aplica SOLO las aprobadas: `npm run issues -- --colgar`, crear fondos y
   encargos, `gh issue edit` para el análisis.
9. Termina con el orden de ataque recomendado: los tres fondos que más casos
   o más daño tienen, con quién los coge.

No cambies código en esta revisión: lo que salga son issues y encargos.
