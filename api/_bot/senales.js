/**
 * Señales de que un turno salió mal, para medir (scripts/bot-semanal.mjs) y
 * para sacar huecos (scripts/lola-feedback.mjs). Nunca cambian lo que hace el
 * bot: solo se apuntan.
 */

// Corrige sin ambigüedad: da igual lo que preguntara Lola. «No es así» es
// además el botón que Lola pone tras cada «✅ Apuntado» (staging, 2 oct 2026:
// se pulsó y no contó, porque el mensaje de Lola acababa en pregunta).
const EXPLICITA = /^(deshaz|deshacer|vuelve a como|d[eé]jalo como|eso no\b|as[ií] no\b|no es eso|no era eso|no es as[ií](?![a-zñ])|no te he pedido|te has equivocado|mal\b)/i;
// «no» a secas: es corrección solo si Lola no acababa de preguntar
// («¿alguna alergia?» → «no» es una respuesta, no un fallo).
// Solo el «no» que queda solo: seguido de coma, punto, admiración o nada. «No
// quiero más de dos ensaladas» es una petición nueva (el verbo pegado al «no»),
// no un fallo del turno anterior (#910: el 19–24 oct inflaba «corregidos»).
const NEGATIVA = /^(?:que\s+)?no(?![a-zñáéíóú])\s*(?:[,.!;:]|$)/i;
// Insiste o pide rehacer lo anterior: «te estoy diciendo que…», «reházme la
// semana». También tras un «no, no,» delante, y da igual lo que preguntara Lola.
const OTRA_VEZ = /^(te (lo )?(estoy diciendo|acabo de decir|he dicho)\b|reh[aá]z(me|lo|la|los|las)?\b|reh[aá]cel[oa]s?\b)/i;
// El «no» (o «que no») de delante, con sus comas: «no, no, te estoy…».
const NO_DELANTE = /^(?:que\s+)?(?:no[\s,.!;:]*)+/i;
// El mismo criterio que ultimaDeLola (api/bot/telegram.js): termina en «?»,
// aunque detrás vengan botones [[…]].
const PREGUNTA = /\?\s*(\[\[[^\]]*\]\]\s*)*$/;

/**
 * ¿Este mensaje corrige lo último que hizo el bot?
 * @param {string} texto  lo que escribe la persona
 * @param {string|null} [ultima]  lo último que dijo Lola en el chat
 */
export function esCorreccion(texto, ultima = null) {
  const t = String(texto ?? "").trim().replace(/^[¡¿«"'\s]+/, "");
  if (!t) return false;
  if (EXPLICITA.test(t) || OTRA_VEZ.test(t) || OTRA_VEZ.test(t.replace(NO_DELANTE, ""))) return true;
  if (!NEGATIVA.test(t)) return false;
  const u = String(ultima ?? "").replace(/<[^>]+>/g, "").trim();
  return !PREGUNTA.test(u);
}
