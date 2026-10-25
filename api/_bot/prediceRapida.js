/**
 * ¿Va a ir este turno por la vía rápida? Una señal BARATA (sin modelo) para
 * decidir si merece la pena arrancar a Lola en paralelo al enrutador (#909).
 *
 * Lola especulativa se cancela en el ~31 % de los turnos y esa llamada ya
 * está pagada (~0,015 $, ~14 % del gasto). Si la señal acierta, Lola espera a
 * la decisión del enrutador y, si es rápida, no se llama nunca. Si falla, el
 * turno de Lola arranca ~router_ms (1-1,9 s) más tarde: por eso la señal es
 * estrecha (solo lo que en 30 días de bot_route fue rápido siempre) y la
 * espera tiene tope (ESPERA_MAX_MS).
 *
 * Es solo una predicción: la decisión real sigue siendo vaPorLaRapida().
 */

export const ESPERA_MAX_MS = 1800;

const GENERAR = /^(gen[eé]ra(me)?|rehaz(me)?|rehacer|haz(me)?|hagamos|regenera)\b.{0,40}\b(semana|men[uú])\b/i;
// Lo que añade condiciones o dudas es de Lola, no de la plantilla.
const CONDICION = /\b(pero|teniendo|porque|sin que|menos|aunque|si)\b|\?/i;

/** @returns {string|null} el motivo de la predicción, o null si no se predice rápida */
export function prediceRapida(texto, ultimaTexto) {
  const t = String(texto ?? "").trim();
  if (!t || t.length > 60 || CONDICION.test(t) || t.startsWith("/")) return null;
  // «Genérame la siguiente semana», «Rehacer esta semana»: la plantilla de generar.
  if (GENERAR.test(t)) return "generar";
  // Tras una lista de opciones («👉 …»), una frase corta es elegir una.
  if (/^\s*👉/.test(String(ultimaTexto ?? ""))) return "opciones";
  return null;
}
