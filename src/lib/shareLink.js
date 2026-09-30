/**
 * Enlaces para mandar algo fuera de la app.
 *
 * HoMenu no tiene router: la pantalla es un estado en App.jsx. Así que un
 * enlace no puede ser una ruta — es un parámetro que se lee al arrancar y se
 * traduce a "abre esto", igual que ya hacían `?demo=1` y `?tour=1`.
 *
 *   /r/<id receta>?t=<llave>  → abre la ficha del plato
 *   ?r=<id receta>&t=<llave>  → lo mismo (forma antigua; sigue valiendo)
 *   /m/<id menú>?t=<llave>    → abre una semana entera, en solo lectura
 *   ?u=<@usuario>             → abre el perfil de esa persona
 *
 * El menú va por la misma puerta que la receta y por el mismo motivo: un
 * enlace por plato son catorce enlaces en un mensaje, de los que WhatsApp solo
 * previsualiza el primero. Uno solo trae la semana entera, se ve bien, y desde
 * dentro cada plato ya es tocable.
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

export const LINK_PARAMS = { recipe: "r", menu: "m", user: "u", token: "t" };

/** El enlace, con el origen real de donde esté servida la app. */
export function buildShareUrl(kind, value, { token = null } = {}) {
  const key = LINK_PARAMS[kind];
  if (!key || !value) return null;
  const base = typeof window !== "undefined" ? window.location.origin : "";
  // Las dos que llevan miniatura van por ruta; el perfil no la necesita.
  const RUTA = { recipe: "r", menu: "m" };
  if (RUTA[kind]) {
    const id = encodeURIComponent(String(value));
    return `${base}/${RUTA[kind]}/${id}${token ? `?${LINK_PARAMS.token}=${encodeURIComponent(token)}` : ""}`;
  }
  return `${base}/?${key}=${encodeURIComponent(String(value).replace(/^@/, ""))}`;
}

/** La miniatura que WhatsApp pinta en la preview (api/share-recipe, ?img=1). */
export function buildShareImageUrl(recipeId, { token = null } = {}) {
  if (!recipeId) return null;
  const base = typeof window !== "undefined" ? window.location.origin : "";
  return `${base}/r/${encodeURIComponent(String(recipeId))}/img${token ? `?${LINK_PARAMS.token}=${encodeURIComponent(token)}` : ""}`;
}

/**
 * Calentar la miniatura antes de que el robot la pida. La preview la genera
 * el propio móvil de quien comparte, y WhatsApp en Android la descarta si la
 * imagen tarda: la primera vez que se pide, la función arranca en frío, baja
 * la foto original y la reduce, y eso son uno o dos segundos que el móvil no
 * espera. En escritorio sí los esperaba: por eso salía foto en uno y en otro
 * no, y según qué plato (24 sep 2026). Pedirla aquí deja la respuesta en la
 * CDN, y para cuando la persona elige el chat, llega en milisegundos.
 *
 * Sin esperar a que termine: la hoja nativa tiene que abrirse en el gesto.
 */
function warmShareImage(recipeId, token) {
  const url = buildShareImageUrl(recipeId, { token });
  if (!url || typeof fetch !== "function") return;
  try {
    fetch(url, { mode: "no-cors" }).catch(() => {});
  } catch {
    // Sin red no hay nada que calentar; compartir sigue igual.
  }
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
  if (kind === "recipe") warmShareImage(value, token);

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
const MENU_PATH_RE = /^\/m\/([^/]+)\/?$/;

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
  const deRuta = (re) => {
    const m = window.location.pathname.match(re);
    if (!m) return null;
    try { return decodeURIComponent(m[1]); } catch { return null; }
  };
  const recipeId = deRuta(RECIPE_PATH_RE) ?? q.get(LINK_PARAMS.recipe);
  const menuId = deRuta(MENU_PATH_RE) ?? q.get(LINK_PARAMS.menu);
  const token = q.get(LINK_PARAMS.token) || null;
  const username = q.get(LINK_PARAMS.user);
  if (!recipeId && !menuId && !username) return null;

  for (const k of Object.values(LINK_PARAMS)) q.delete(k);
  const rest = q.toString();
  const enRuta = RECIPE_PATH_RE.test(window.location.pathname) || MENU_PATH_RE.test(window.location.pathname);
  window.history.replaceState({}, "", (enRuta ? "/" : window.location.pathname) + (rest ? `?${rest}` : ""));

  // El orden importa poco porque un enlace trae una cosa, pero la receta va
  // primera por ser la forma antigua: si alguien pega `?r=` y `?m=` a la vez,
  // gana la que ya funcionaba.
  if (recipeId) return { kind: "recipe", id: recipeId, token };
  if (menuId) return { kind: "menu", id: menuId, token };
  return { kind: "user", username };
}
