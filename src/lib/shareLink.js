/**
 * Enlaces para mandar algo fuera de la app.
 *
 * HoMenu no tiene router: la pantalla es un estado en App.jsx. Así que un
 * enlace no puede ser una ruta — es un parámetro que se lee al arrancar y se
 * traduce a "abre esto", igual que ya hacían `?demo=1` y `?tour=1`.
 *
 *   ?r=<id receta>   → abre la ficha del plato
 *   ?u=<@usuario>    → abre el perfil de esa persona
 *
 * Sin esto, la parte social no tenía puerta de salida: no había forma de
 * enseñarle a nadie lo que cocinas si no estaba ya dentro de la app.
 */

export const LINK_PARAMS = { recipe: "r", user: "u" };

/** El enlace, con el origen real de donde esté servida la app. */
export function buildShareUrl(kind, value) {
  const key = LINK_PARAMS[kind];
  if (!key || !value) return null;
  const base = typeof window !== "undefined" ? window.location.origin : "";
  return `${base}/?${key}=${encodeURIComponent(String(value).replace(/^@/, ""))}`;
}

/**
 * Compartir de verdad si el sistema deja (hoja nativa de iOS/Android), y si
 * no, al portapapeles. Devuelve qué pasó para que quien llama pueda decirlo:
 * un botón que no confirma nada parece roto aunque haya funcionado.
 *
 * "cancelled" no es un error — es que la persona cerró la hoja, y avisar de
 * eso con un toast sería regañarla por cambiar de idea.
 */
export async function shareOut({ kind, value, title, text }) {
  const url = buildShareUrl(kind, value);
  if (!url) return "error";

  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return "shared";
    } catch (err) {
      if (err?.name === "AbortError") return "cancelled";
      // Si la hoja nativa falla por cualquier otra razón, aún queda copiar.
    }
  }

  try {
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch {
    return "error";
  }
}

/**
 * Qué pedía el enlace con el que se ha abierto la app, o null. Se lee una vez
 * al arrancar; después se limpia la barra de direcciones (replaceState) para
 * que recargar no vuelva a abrir lo mismo una y otra vez.
 */
export function readIncomingLink() {
  if (typeof window === "undefined") return null;
  const q = new URLSearchParams(window.location.search);
  const recipeId = q.get(LINK_PARAMS.recipe);
  const username = q.get(LINK_PARAMS.user);
  if (!recipeId && !username) return null;

  q.delete(LINK_PARAMS.recipe);
  q.delete(LINK_PARAMS.user);
  const rest = q.toString();
  window.history.replaceState({}, "", window.location.pathname + (rest ? `?${rest}` : ""));

  return recipeId ? { kind: "recipe", id: recipeId } : { kind: "user", username };
}
