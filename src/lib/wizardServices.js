/**
 * La llamada al modelo que hace la burbuja del bot, en un solo sitio.
 *
 * La generación NO está aquí: la hace `regenerateMenu` de App.jsx, la misma de
 * siempre, con su `GeneratingScreen` y su lista de la compra detrás. Esto solo
 * cubre lo nuevo — traducir a ajustes de la libreta lo que el usuario cuenta.
 *
 * ── Hubo aquí dos servicios más ───────────────────────────────────────────
 * `interpretarPrompt` y `aplicarPrompt`, para un modal de entrada por voz o
 * texto que se abría al pulsar "Generar menú". Se quitó entero: el asistente de
 * pantallas es donde están las preguntas que el motor necesita de verdad, y el
 * modal acababa pidiendo una frase para luego mandarte a los mandos igual. Con
 * ellos se fueron `wizardPrompt.js`, `voiceInput.js` y la tarea `wizard` de
 * api/_prompts.js.
 *
 * Lo que sobrevive es lo de después de generar: la fila de mandos sobre el menú
 * y esta burbuja, que es donde entender una frase aporta algo que un control no
 * sabe hacer.
 *
 * Se importa en diferido desde el hook (`await import`) para que ni el parser
 * ni sus prompts entren en el bundle de quien nunca abre la burbuja.
 *
 * El `system` nunca viaja desde aquí: /api/generate lo busca por `task` en
 * api/_prompts.js, para que el endpoint —llamable sin sesión a propósito— no
 * pueda usarse como LLM genérico con el prompt que uno quiera.
 */

import { callModel, extractJson } from "./aiPlanner.js";
import { FAST_MODEL } from "./aiModels.js";

/** El modelo barato basta: la tarea es traducir a un JSON pequeño. */
const MODELO_PARSEO = FAST_MODEL;

export function serviciosReales() {
  return {
    /** Una frase del panel → la respuesta cruda, sin validar (lo hace quien llama). */
    async consultarPanel(frase) {
      const texto = await callModel({
        model: MODELO_PARSEO,
        max_tokens: 1024,
        task: "panel",
        messages: [{ role: "user", content: frase }],
      });
      return extractJson(texto);
    },
  };
}
