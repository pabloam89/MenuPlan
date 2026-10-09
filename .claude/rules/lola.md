---
paths:
  - "api/_bot/**"
  - "api/bot/**"
---

# Lola

- **Evals antes de mergear** si cambia lo que Lola lee: `api/_bot/conocimiento.md`,
  el SISTEMA de `api/_bot/agente.js` o los textos de las herramientas. Se
  corre `node scripts/bot-evals.mjs --nivel=pr` (24 casos, ~0,6–0,8 $) y, antes
  de cerrar, la pasada completa (~3,5 $; `--nivel=seguridad`, ~3,2–3,4 $, si toca
  alergias, salud o papeles). Un caso nuevo se ve fallar antes del arreglo y
  lleva `id`, `tipo`, `dominio`, `origen` y, si habla de días, `dependeDeFecha`
  (`scripts/lib/evals.mjs`). Las
  evals tienen un tope mensual duro (`PRESUPUESTO_MENSUAL_EUR`, en ese mismo
  módulo y en ningún otro sitio) y cada pasada su `--tope`; lo ya
  medido sin cambios no se vuelve a pagar (`.evals-out/`). Vitest y CI, siempre.
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
