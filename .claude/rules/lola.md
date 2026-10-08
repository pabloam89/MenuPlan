---
paths:
  - "api/_bot/**"
  - "api/bot/**"
---

# Lola

- **Evals antes de mergear** si cambia lo que Lola lee: `api/_bot/conocimiento.md`,
  el SISTEMA de `api/_bot/agente.js` o los textos de las herramientas. Se
  corre `node scripts/bot-evals.mjs` (~1,20 $) y un caso nuevo se ve fallar
  antes del arreglo. Vitest y CI, siempre.
- **Lo que no puede fallar va en la base o en código determinista, nunca solo
  en el prompt.** Cada vez que una garantía dependió del modelo, las evals
  fallaron 1 de cada 3 (las tareas abiertas: `bot_tareas` y `pendientes.js`).
- **Modelos**: Anthropic para texto, Gemini para imágenes. Antes de cambiar un
  modelo, mídelo con `node scripts/modelos-evals.mjs`. Plan B: si Sonnet no
  contesta, repite Opus (`MODELO_RESERVA`); si ya intentó escribir, no se
  repite y se avisa.
- **Supervisor** (`api/_bot/supervisor.js`): lo que quita protección (una
  alergia, un comensal) se contrasta con el texto real; lo que la añade no se
  frena.
- **Enrutador** (`api/_bot/router.js`, encendido con `BOT_ROUTER=on`, solo en
  staging): esquema plano, umbral 0,8. Se prueba con
  `node scripts/router-evals.mjs`; lo que importa es 0 «rápida cuando tocaba
  Lola». Las funciones viven en `fra1`, al lado de Supabase.
- Con el SDK de Anthropic, los errores se distinguen con `instanceof`, no con
  `err.name`.
- Solo comida: compra, tareas y recordatorios no aceptan nada que no sea comer
  o beber.
- Sin botón «Deshacer»: si no gusta, se pide otra cosa en otro mensaje.
