/**
 * Señales de que un turno salió mal, para medir (scripts/bot-semanal.mjs) y
 * para sacar huecos (scripts/lola-feedback.mjs). Nunca cambian lo que hace el
 * bot: solo se apuntan.
 */

// Corrige sin ambigüedad: da igual lo que preguntara Lola.
const EXPLICITA = /^(deshaz|deshacer|vuelve a como|d[eé]jalo como|eso no\b|as[ií] no\b|no es eso|no era eso|no te he pedido|te has equivocado|mal\b)/i;
// «no» a secas: es corrección solo si Lola no acababa de preguntar
// («¿alguna alergia?» → «no» es una respuesta, no un fallo).
const NEGATIVA = /^(no\b|que no\b)/i;
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
  if (EXPLICITA.test(t)) return true;
  if (!NEGATIVA.test(t)) return false;
  const u = String(ultima ?? "").replace(/<[^>]+>/g, "").trim();
  return !PREGUNTA.test(u);
}
