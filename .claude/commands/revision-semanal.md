---
description: Revisión semanal de Lola — sacar huecos, proponer arreglos y pruebas, y pasarlos a bot-evals tras aprobarlos
---

Sigue el ciclo de `specs/mejora-semanal.md`, pasos 2 a 5. Es una revisión
CONJUNTA: propones, la persona decide.

1. Corre `node scripts/bot-semanal.mjs` y resume en 3 líneas qué está en rojo
   y qué empeoró respecto a la semana anterior.
2. Corre `node scripts/lola-feedback.mjs --sugerir` y
   `node scripts/router-feedback.mjs --sugerir`.
3. Lee `scripts/bot-evals-candidatos.json`. Agrupa los huecos parecidos y
   enséñalos en una tabla corta: motivo, frase (recortada), destino propuesto,
   caso propuesto. Comprueba que la `entrada` de cada caso NO lleva nombres,
   edades, lugares ni nada de la familia; si lo lleva, reescríbela.
4. Pregunta cuáles se aprueban. Marca `aprobado: true` SOLO en los que la
   persona apruebe. Nada de alergias, salud o bebés sin que lo diga
   explícitamente.
5. `node scripts/lola-feedback.mjs --anadir` y después
   `node scripts/bot-evals.mjs` filtrando por los casos nuevos: deben fallar
   (si pasan, no cubrían un hueco real; dilo).
6. Propón el arreglo de cada uno según su destino, pero no lo hagas sin
   permiso. Nunca push.

Nunca copies frases de `bot-evals-candidatos.json` a commits, PRs ni issues:
el repo es público.
