import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase.js";
import { upsertUserProfile } from "./analytics.js";
import { clearState } from "./storage.js";
import { traeLlaveDeLola } from "./llaveLola.js";

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
 * Tracks the Supabase auth session and exposes Google sign-in / sign-out.
 * Local-only for now: the OAuth redirect is configured for localhost in the
 * Supabase dashboard. Falls back gracefully if Supabase env vars are missing.
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
    });

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    // These messages reach the user under the button, so they say what to do
    // rather than naming the vendor. The console keeps the developer detail.
    if (!supabase) {
      console.error(
        "[auth] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing in this build — Google sign-in cannot work.",
      );
      return {
        error: new Error("El inicio de sesión no está disponible en este entorno. Puedes entrar sin cuenta."),
      };
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) {
      console.error("[auth] Google sign-in failed", error);
      return { error };
    }
    return { error: null };
  }, []);

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
    signOut,
  };
}
