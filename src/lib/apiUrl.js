import { Capacitor } from "@capacitor/core";

// En la web y en el TWA de Android la app se sirve desde el mismo dominio que
// /api, así que basta la ruta relativa. Dentro de la app iOS (Capacitor) la web
// va empaquetada y se sirve desde capacitor://localhost: una ruta relativa no
// llegaría a Vercel, hay que usar el dominio completo.
const NATIVE_API_BASE = import.meta.env.VITE_API_BASE || "https://homenu.vercel.app";

export const isNativeApp = Capacitor.isNativePlatform();

// ¿Se ofrece «Continuar con Apple» aquí? En la app nativa (Guideline 4.8) y en la web con VITE_APPLE_WEB (#890).
// Lo leen SignInOptions (src/components/ui.jsx) y «Formas de entrar» de Mi perfil.
export const seOfreceApple = () => isNativeApp || import.meta.env.VITE_APPLE_WEB === "on";

/**
 * ¿La página está abierta en el navegador de dentro de Telegram? (trozo 5 de specs/auth.md §7). Allí Google no deja
 * entrar (`disallowed_useragent`), así que la pantalla de entrada ofrece solo «Entrar con Telegram». Telegram mete en
 * la página `TelegramWebviewProxy` (iOS; su propio telegram-web-app.js lo mira) o `TelegramWebview` (Android), y en
 * Android firma el navegador con «Telegram-Android/» (core.telegram.org/bots/webapps, «User-Agent details»).
 * Lo lee SignInOptions (src/components/ui.jsx).
 */
export function enTelegram(w = typeof window === "undefined" ? null : window) {
  if (!w) return false;
  return "TelegramWebview" in w || "TelegramWebviewProxy" in w || "TelegramWebviewProxyProto" in w
    || /Telegram-Android\//.test(w.navigator?.userAgent ?? "");
}

export function apiUrl(path) {
  return isNativeApp ? `${NATIVE_API_BASE}${path}` : path;
}
