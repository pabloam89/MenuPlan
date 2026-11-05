/**
 * Lo elegido, a la vista (#1277). Al pulsar un botón de Lola, el teclado del mensaje se cambia por una sola fila con
 * la elección («✓ Solo los días»), en vez de quedarse vacío: si no, parece que Lola pregunta dos veces. El texto del
 * mensaje no se toca (editarlo pierde su HTML). El botón «✓» no hace nada: `pulsado` lo contesta y no entra en la cola.
 */

/** El dato del botón «✓»: no es de ninguna acción. */
export const BOTON_ELEGIDO = "elegido";

/**
 * Pura. El teclado tras pulsar `dato` en un mensaje con `teclado` (el `reply_markup` que trae el callback_query):
 * una fila con «✓ » y el texto del botón pulsado. Si el botón no está (mensaje viejo, sin teclado), vacío, como antes.
 * @param {{ inline_keyboard?: { text: string, callback_data?: string }[][] } | undefined} teclado
 * @param {string | undefined} dato
 * @returns {{ inline_keyboard: { text: string, callback_data: string }[][] }}
 */
export function tecladoElegido(teclado, dato) {
  const pulsado = (teclado?.inline_keyboard ?? []).flat().find((b) => dato != null && b?.callback_data === dato);
  return pulsado ? { inline_keyboard: [[{ text: `✓ ${pulsado.text}`, callback_data: BOTON_ELEGIDO }]] } : { inline_keyboard: [] };
}
