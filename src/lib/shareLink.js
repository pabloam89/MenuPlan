/**
 * Enlaces para mandar algo fuera de la app.
 *
 * HoMenu no tiene router: la pantalla es un estado en App.jsx. Así que un
 * enlace no puede ser una ruta — es un parámetro que se lee al arrancar y se
 * traduce a "abre esto", igual que ya hacían `?demo=1` y `?tour=1`.
 *
 *   /r/<id receta>?t=<llave>  → abre la ficha del plato
 *   ?r=<id receta>&t=<llave>  → lo mismo (forma antigua; sigue valiendo)
 *   ?u=<@usuario>             → abre el perfil de esa persona
 *
 * Las recetas van por RUTA (/r/…) y no por parámetro porque WhatsApp y
 * compañía piden esa URL para pintar la miniatura: vercel.json la manda a
 * api/share-recipe, que responde con las etiquetas Open Graph y devuelve a la
 * persona a `/?r=…`. Un `?r=` a secas devolvía el index.html de siempre y la
 * preview salía como "HoMenu" sin foto, fuera cual fuera la receta.
 *
 * La llave (`t`) la crea el dueño (recipe_share_token, 0055) y abre la receta
 * a quien la tenga, sin sesión y sin conectar. Sin llave, el enlace solo abre
 * lo que las políticas ya dejaban ver.
 */

export const LINK_PARAMS = { recipe: "r", user: "u", token: "t" };

/** El enlace, con el origen real de donde esté servida la app. */
export function buildShareUrl(kind, value, { token = null } = {}) {
  const key = LINK_PARAMS[kind];
  if (!key || !value) return null;
  const base = typeof window !== "undefined" ? window.location.origin : "";
  if (kind === "recipe") {
    const id = encodeURIComponent(String(value));
    return `${base}/r/${id}${token ? `?${LINK_PARAMS.token}=${encodeURIComponent(token)}` : ""}`;
  }
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
export async function shareOut({ kind, value, token = null, title, text }) {
  const url = buildShareUrl(kind, value, { token });
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

const RECIPE_PATH_RE = /^\/r\/([^/]+)\/?$/;

/**
 * Qué pedía el enlace con el que se ha abierto la app, o null. Se lee una vez
 * al arrancar; después se limpia la barra de direcciones (replaceState) para
 * que recargar no vuelva a abrir lo mismo una y otra vez.
 *
 * Lee también la forma /r/<id>: en desarrollo no hay api/ que redirija, y con
 * la PWA instalada el service worker puede servir el index.html para esa ruta.
 */
export function readIncomingLink() {
  if (typeof window === "undefined") return null;
  const q = new URLSearchParams(window.location.search);
  let recipeId = q.get(LINK_PARAMS.recipe);
  const fromPath = window.location.pathname.match(RECIPE_PATH_RE);
  if (fromPath) {
    try {
      recipeId = decodeURIComponent(fromPath[1]);
    } catch {
      recipeId = null;
    }
  }
  const token = q.get(LINK_PARAMS.token) || null;
  const username = q.get(LINK_PARAMS.user);
  if (!recipeId && !username) return null;

  q.delete(LINK_PARAMS.recipe);
  q.delete(LINK_PARAMS.token);
  q.delete(LINK_PARAMS.user);
  const rest = q.toString();
  const path = fromPath ? "/" : window.location.pathname;
  window.history.replaceState({}, "", path + (rest ? `?${rest}` : ""));

  return recipeId ? { kind: "recipe", id: recipeId, token } : { kind: "user", username };
}
