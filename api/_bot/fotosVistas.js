/**
 * Las fotos que se acaban de mandar a un chat no se vuelven a mandar (#932: la
 * misma foto de unas judías llegó 4 veces en 15 minutos, en dos álbumes
 * iguales y otra vez al elegirla). Se guardan, por url, en el último mensaje
 * del bot (bot_messages.content.fotos) y valen VENTANA_FOTOS_MS.
 * Puras.
 */

export const VENTANA_FOTOS_MS = 30 * 60 * 1000;

/** Las urls ya vistas, si el último mensaje del bot es de hace poco. */
export function fotosVistas(ultimo, ahora = Date.now()) {
  const urls = ultimo?.content?.fotos;
  const cuando = Date.parse(ultimo?.created_at ?? "");
  if (!Array.isArray(urls) || !urls.length || !Number.isFinite(cuando)) return [];
  return ahora - cuando <= VENTANA_FOTOS_MS ? urls.filter((u) => typeof u === "string") : [];
}

/** Las fotos de esta respuesta menos las ya vistas. */
export function fotosSinRepetir(fotos = [], vistas = []) {
  const ya = new Set(vistas);
  return (fotos ?? []).filter((f) => f?.url && !ya.has(f.url));
}
