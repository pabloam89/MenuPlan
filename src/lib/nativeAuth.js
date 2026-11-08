// Login OAuth dentro de la app nativa (iOS, Capacitor).
//
// En la web basta con `signInWithOAuth`: el propio navegador se va a Google y
// vuelve al origen. Dentro de la app eso no sirve por dos motivos distintos:
//
//   1. Google rechaza su pantalla de login dentro de webviews embebidos
//      ("disallowed_useragent"), así que hay que abrirla en el navegador del
//      sistema — no es una preferencia estética, es la única vía que funciona.
//   2. Al volver no hay "origen" al que redirigir: la web va empaquetada y se
//      sirve desde capacitor://localhost. Se usa un esquema propio
//      (com.homenu.app://, declarado en ios/App/App/Info.plist) y el sistema
//      devuelve el control a la app con esa URL.
//
// Este módulo solo se carga en nativo (import dinámico desde useAuth.js), así
// que los plugins de Capacitor no entran en el bundle de la web.
import { App as CapacitorApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { avisoAlVolver, NO_SE_PUDO_GOOGLE } from "./cuentaTelegram.js";

export const NATIVE_REDIRECT_URL = "com.homenu.app://auth-callback";

/**
 * Extrae de la URL de vuelta lo necesario para abrir sesión.
 *
 * Contempla los dos formatos a propósito: Supabase devuelve `?code=...` con el
 * flujo PKCE y los tokens en el `#` con el implícito, y cuál se use depende de
 * la config del cliente. Soportar ambos evita que un cambio de `flowType` (o
 * una versión distinta del SDK) rompa el login en la app sin avisar.
 *
 * Función pura y exportada suelta para poder testearla sin navegador.
 * @returns {{code: string} | {accessToken: string, refreshToken: string} | null}
 */
export function parseAuthCallback(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  const code = url.searchParams.get("code");
  if (code) return { code };

  const hash = new URLSearchParams((url.hash || "").replace(/^#/, ""));
  const accessToken = hash.get("access_token");
  const refreshToken = hash.get("refresh_token");
  if (accessToken && refreshToken) return { accessToken, refreshToken };

  return null;
}

/**
 * Lanza el login en el navegador del sistema. `skipBrowserRedirect` hace que
 * Supabase devuelva la URL en vez de navegar ella misma (que aquí no serviría).
 */
export async function startNativeOAuth(supabase, provider) {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: NATIVE_REDIRECT_URL, skipBrowserRedirect: true },
  });
  if (error) return { error };
  if (!data?.url) {
    return { error: new Error("No se pudo iniciar el login. Inténtalo de nuevo.") };
  }
  await Browser.open({ url: data.url });
  return { error: null };
}

/**
 * Añade un proveedor (google…) a la cuenta con sesión (linkIdentity), por el navegador del sistema, como el login.
 * La vuelta llega por el mismo listenForNativeAuthCallback.
 */
export async function startNativeLink(supabase, provider) {
  const { data, error } = await supabase.auth.linkIdentity({
    provider,
    options: { redirectTo: NATIVE_REDIRECT_URL, skipBrowserRedirect: true },
  });
  if (error) return { error };
  if (!data?.url) return { error: new Error(NO_SE_PUDO_GOOGLE) };
  await Browser.open({ url: data.url });
  return { error: null };
}

/**
 * Pura. Qué trae una URL de vuelta al móvil: una sesión que canjear, un error que avisar (solo en la de vuelta del
 * login, NATIVE_REDIRECT_URL) o nada: otras URLs con el mismo esquema (enlaces compartidos) no son cosa nuestra.
 */
export function vueltaNativa(url) {
  const sesion = parseAuthCallback(url);
  if (sesion) return { sesion };
  const aviso = String(url).startsWith(NATIVE_REDIRECT_URL) ? avisoAlVolver(url) : null;
  return aviso ? { aviso } : null;
}

/**
 * Escucha la vuelta desde el navegador y canjea lo que traiga por una sesión; si trae un error, lo pasa a `alAvisar`.
 * @returns {() => void} función para dejar de escuchar.
 */
export function listenForNativeAuthCallback(supabase, { alAvisar = () => {} } = {}) {
  if (!supabase) return () => {};

  const handle = CapacitorApp.addListener("appUrlOpen", async ({ url }) => {
    const vuelta = vueltaNativa(url);
    if (!vuelta) return;
    if (vuelta.aviso) {
      console.warn("[auth] el navegador volvió con un error", vuelta.aviso);
      alAvisar(vuelta.aviso);
      Browser.close().catch(() => {});
      return;
    }
    const parsed = vuelta.sesion;

    try {
      if (parsed.code) {
        await supabase.auth.exchangeCodeForSession(parsed.code);
      } else {
        await supabase.auth.setSession({
          access_token: parsed.accessToken,
          refresh_token: parsed.refreshToken,
        });
      }
    } catch (err) {
      console.error("[auth] no se pudo completar el login nativo", err);
    } finally {
      // Sin esto el navegador del sistema se queda abierto por detrás y el
      // usuario lo encuentra al volver a la app.
      Browser.close().catch(() => {});
    }
  });

  return () => {
    Promise.resolve(handle)
      .then((h) => h?.remove?.())
      .catch(() => {});
  };
}
