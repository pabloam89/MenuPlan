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

export function apiUrl(path) {
  return isNativeApp ? `${NATIVE_API_BASE}${path}` : path;
}
