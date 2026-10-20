import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase.js";
import { upsertUserProfile } from "./analytics.js";
import { clearState } from "./storage.js";
import { traeLlaveDeLola } from "./llaveLola.js";
import { rememberAppleRefreshToken } from "./appleTokens.js";
import { isNativeApp } from "./apiUrl.js";

// De quién es la copia de la casa que guarda este navegador (storage.js). Si
// esa cuenta deja de existir (/borrarme en Telegram, o borrada en otro
// dispositivo), la copia no puede quedarse: la app la enseñaba como invitado
// —el «menú raro»— y la subía a la siguiente cuenta que entrara. Al cerrar
// sesión a mano se quita la marca y la copia se queda, como siempre.
const MARCA = "homenu:cuenta";
const leerMarca = () => { try { return localStorage.getItem(MARCA); } catch { return null; } };
const ponerMarca = (id) => { try { localStorage.setItem(MARCA, id); } catch { /* noop */ } };
const quitarMarca = () => { try { localStorage.removeItem(MARCA); } catch { /* noop */ } };

/** La cuenta de la copia local, aunque su sesión ya se haya perdido (BotEnlace). */
export const cuentaDeLaCopia = leerMarca;

/** Borra la copia local y su marca. */
export function olvidarCopia() {
  clearState();
  quitarMarca();
}

// La llave de Lola (?entrar= o la firma de Telegram, llaveLola.js) la gestiona
// BotEnlace, que ya limpia al cambiar de cuenta: aquí no se toca nada mientras
// tanto. Se lee al cargar el módulo, antes de que BotEnlace la quite.
const CON_LLAVE = typeof window !== "undefined" && traeLlaveDeLola();

// «User from sub claim in JWT does not exist»: el token es bueno pero la cuenta ya no está.
const esCuentaBorrada = (error) =>
  error?.code === "user_not_found" || (error?.status === 403 && /sub claim|does not exist/i.test(error?.message ?? ""));

function recargarLimpio() {
  olvidarCopia();
  window.location.replace(window.location.pathname + window.location.search + window.location.hash);
}

/**
 * Tracks the Supabase auth session and exposes Google / Apple sign-in and
 * sign-out.
 * Falls back gracefully if Supabase env vars are missing.
 *
 * En la app nativa (iOS) el login va por otro camino — navegador del sistema y
 * vuelta por com.homenu.app:// — porque Google no admite su pantalla de login
 * dentro de un webview. Ver `nativeAuth.js`, que se carga solo ahí.
 *
 * Los dos proveedores van siempre juntos: en iOS, ofrecer Google sin ofrecer
 * Apple es rechazo de App Store (Guideline 4.8).
 */
// Supabase re-fires SIGNED_IN on token refresh / tab focus; upsert the
// profile only once per user per page load.
let lastUpsertedUserId = null;

export function useAuth() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    let mounted = true;

    supabase.auth
      .getSession()
      .then(async ({ data, error: fallo }) => {
        if (!mounted) return;
        const s = data?.session ?? null;
        if (!CON_LLAVE) {
          // Había cuenta y su sesión se ha perdido sin cerrarla (la cuenta se
          // borró y no se pudo renovar): la copia es de alguien que ya no está.
          // Sin red al renovar (AuthRetryableFetchError), no: no se sabe qué ha
          // pasado. Un rechazo del servidor (la cuenta ya no está), sí.
          if (!s && fallo?.name !== "AuthRetryableFetchError" && leerMarca()) return recargarLimpio();
          // Con sesión, se pregunta al servidor: un token aún vigente de una
          // cuenta borrada sigue pareciendo bueno aquí. Sin red, no se toca nada.
          if (s) {
            const { error } = await supabase.auth.getUser().catch((e) => ({ error: e }));
            if (esCuentaBorrada(error)) {
              await supabase.auth.signOut({ scope: "local" }).catch(() => {});
              return recargarLimpio();
            }
          }
        }
        if (!mounted) return;
        setSession(s);
        setLoading(false);
      })
      .catch(() => {
        if (mounted) setLoading(false);
      });

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      if (next?.user?.id) ponerMarca(next.user.id);
      // La sesión se cae con la app abierta y no la ha cerrado nadie (signOut
      // de aquí quita antes la marca): la cuenta ya no está.
      if (event === "SIGNED_OUT" && !CON_LLAVE && leerMarca()) return recargarLimpio();
      setSession(next);
      if (event === "SIGNED_IN" && next?.user && next.user.id !== lastUpsertedUserId) {
        lastUpsertedUserId = next.user.id;
        upsertUserProfile(next.user);
      }
      // Aparte del guard de arriba: el token de Apple solo viaja en la sesión
      // del login que lo trae, así que se intenta guardar en cada SIGNED_IN y
      // no una vez por carga de página.
      if (event === "SIGNED_IN") rememberAppleRefreshToken(next);
    });

    // En nativo, la sesión no llega por la carga de la página sino por la URL
    // con la que el sistema devuelve el control a la app tras el login.
    let stopNativeListener = () => {};
    if (isNativeApp) {
      import("./nativeAuth.js")
        .then(({ listenForNativeAuthCallback }) => {
          if (mounted) stopNativeListener = listenForNativeAuthCallback(supabase);
        })
        .catch((err) => console.error("[auth] no se pudo escuchar la vuelta del login", err));
    }

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe?.();
      stopNativeListener();
    };
  }, []);

  // Google y Apple solo se diferencian en el nombre del proveedor: el camino
  // (nativo por navegador del sistema, web por redirección) es el mismo.
  const signInWith = useCallback(async (provider, vendorLabel) => {
    // These messages reach the user under the button, so they say what to do
    // rather than naming the vendor. The console keeps the developer detail.
    if (!supabase) {
      console.error(
        `[auth] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing in this build — ${vendorLabel} sign-in cannot work.`,
      );
      return {
        error: new Error("El inicio de sesión no está disponible en este entorno. Puedes entrar sin cuenta."),
      };
    }
    if (isNativeApp) {
      const { startNativeOAuth } = await import("./nativeAuth.js");
      const { error } = await startNativeOAuth(supabase, provider);
      if (error) console.error(`[auth] ${vendorLabel} sign-in failed (nativo)`, error);
      return { error: error ?? null };
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin },
    });
    if (error) {
      console.error(`[auth] ${vendorLabel} sign-in failed`, error);
      return { error };
    }
    return { error: null };
  }, []);

  const signInWithGoogle = useCallback(() => signInWith("google", "Google"), [signInWith]);
  const signInWithApple = useCallback(() => signInWith("apple", "Apple"), [signInWith]);

  const signOut = useCallback(async () => {
    if (!supabase) return { error: null };
    quitarMarca();
    const { error } = await supabase.auth.signOut();
    if (error) console.error("[auth] sign-out failed", error);
    return { error };
  }, []);

  return {
    session,
    user: session?.user ?? null,
    loading,
    signInWithGoogle,
    signInWithApple,
    signOut,
  };
}
