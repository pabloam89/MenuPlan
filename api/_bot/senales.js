/**
 * Señales de que un turno salió mal, para medir (scripts/bot-semanal.mjs) y
 * para sacar huecos (scripts/lola-feedback.mjs).
 *
 * Dos criterios, a propósito (#910):
 *  - esCorreccionRuta: el AMPLIO de siempre. Decide a quién va el turno (vía
 *    rápida o Lola: router.js vaPorLaRapida / generarConMatices). Ante la duda,
 *    corrección: Lola lee lo que se dijo. No se toca desde un PR de medición.
 *  - esCorreccionMedida: el ESTRECHO. Solo cuenta «turnos corregidos» (el
 *    `corrige` que se guarda en bot_route y lee scripts/lib/bot-semana.mjs).
 *    Nunca cambia lo que hace el bot.
 */

// Corrige sin ambigüedad: da igual lo que preguntara Lola. «No es así» es
// además el botón que Lola pone tras cada «✅ Apuntado» (staging, 2 oct 2026:
// se pulsó y no contó, porque el mensaje de Lola acababa en pregunta).
const EXPLICITA = /^(deshaz|deshacer|vuelve a como|d[eé]jalo como|eso no\b|as[ií] no\b|no es eso|no era eso|no es as[ií](?![a-zñ])|no te he pedido|te has equivocado|mal\b)/i;
// «no» a secas: es corrección solo si Lola no acababa de preguntar
// («¿alguna alergia?» → «no» es una respuesta, no un fallo).
const NEGATIVA_AMPLIA = /^(no\b|que no\b)/i;
// Solo el «no» que queda solo: seguido de coma, punto, admiración o nada. «No
// quiero más de dos ensaladas» es una petición nueva (el verbo pegado al «no»),
// no un fallo del turno anterior (#910: el 19–24 oct inflaba «corregidos»).
const NEGATIVA_ESTRECHA = /^(?:que\s+)?no(?![a-zñáéíóú])\s*(?:[,.!;:]|$)/i;
// Insiste o pide rehacer lo anterior: «te estoy diciendo que…», «reházme la
// semana». También tras un «no, no,» delante, y da igual lo que preguntara Lola.
const OTRA_VEZ = /^(te (lo )?(estoy diciendo|acabo de decir|he dicho)\b|reh[aá]z(me|lo|la|los|las)?\b|reh[aá]cel[oa]s?\b)/i;
// El «no» (o «que no») de delante, con sus comas: «no, no, te estoy…».
const NO_DELANTE = /^(?:que\s+)?(?:no[\s,.!;:]*)+/i;
// El mismo criterio que ultimaDeLola (api/bot/telegram.js): termina en «?»,
// aunque detrás vengan botones [[…]].
const PREGUNTA = /\?\s*(\[\[[^\]]*\]\]\s*)*$/;

const limpio = (texto) => String(texto ?? "").trim().replace(/^[¡¿«"'\s]+/, "");
const eraPregunta = (ultima) => PREGUNTA.test(String(ultima ?? "").replace(/<[^>]+>/g, "").trim());

/**
 * El criterio de la RUTA (amplio): ¿este mensaje corrige, o podría corregir,
 * lo último que hizo el bot? Lo lee vaPorLaRapida: ante la duda, a Lola.
 * @param {string} texto  lo que escribe la persona
 * @param {string|null} [ultima]  lo último que dijo Lola en el chat
 */
// Insiste en algo que ya dijo, en cualquier punto de la frase: «pero si te he
// dicho pasta», «ya te dije que sin cebolla» (#930: la vía rápida repitió las
// mismas tres opciones). Solo para la ruta: ante la duda, Lola.
const INSISTE = /\b(te (lo )?(he dicho|estoy diciendo|acabo de decir|dije)|ya te (lo )?dije|te digo que)\b/i;

export function esCorreccionRuta(texto, ultima = null) {
  const t = limpio(texto);
  if (!t) return false;
  if (EXPLICITA.test(t) || INSISTE.test(t)) return true;
  if (!NEGATIVA_AMPLIA.test(t)) return false;
  return !eraPregunta(ultima);
}

/**
 * El criterio de la MEDIDA (estrecho): ¿este mensaje corrige de verdad lo
 * último que hizo el bot? Solo para contar «turnos corregidos». «No quiero
 * más de dos ensaladas» no; «No, no, te estoy diciendo…» y «Reházme la
 * semana…» sí.
 * @param {string} texto
 * @param {string|null} [ultima]
 */
export function esCorreccionMedida(texto, ultima = null) {
  const t = limpio(texto);
  if (!t) return false;
  if (EXPLICITA.test(t) || OTRA_VEZ.test(t) || OTRA_VEZ.test(t.replace(NO_DELANTE, ""))) return true;
  return NEGATIVA_ESTRECHA.test(t) && !eraPregunta(ultima);
}
