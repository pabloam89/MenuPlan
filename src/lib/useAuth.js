import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase.js";
import { upsertUserProfile } from "./analytics.js";
import { guardarAceptacionPendiente, olvidarDispositivo } from "./legalConsent.js";

/**
 * Tracks the Supabase auth session and exposes Google sign-in / sign-out.
 * Local-only for now: the OAuth redirect is configured for localhost in the
 * Supabase dashboard. Falls back gracefully if Supabase env vars are missing.
 */
// Supabase re-fires SIGNED_IN on token refresh / tab focus; upsert the
// profile only once per user per page load.
let lastUpsertedUserId = null;
// useAuth() se monta varias veces a la vez (App.jsx, PantryInput, Shopping…),
// cada una con su propio onAuthStateChange: sin esto, un mismo SIGNED_IN /
// INITIAL_SESSION dispara tantos guardarAceptacionPendiente concurrentes como
// componentes montados, todos escribiendo la misma fila a la vez. Si fallara,
// se reintenta en el SIGUIENTE arranque de página (nuevo módulo, nuevo null),
// no antes — igual que lastUpsertedUserId de arriba.
let lastConsentimientoIntentado = null;

export function useAuth() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    let mounted = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) return;
        setSession(data?.session ?? null);
        setLoading(false);
      })
      .catch(() => {
        if (mounted) setLoading(false);
      });

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (!next?.user) return;
      // Solo en un login de verdad, no en cada carga: SIGNED_IN llega una vez
      // por sesión iniciada (justo tras el redirect de Google), mientras que
      // INITIAL_SESSION llega en CADA arranque normal de la app con sesión ya
      // guardada — con él aquí, upsertUserProfile (nombre, avatar, idioma…)
      // se reescribiría en cada apertura de la app para toda la base de
      // usuarios, por una cosa que ya estaba bien.
      if (event === "SIGNED_IN" && next.user.id !== lastUpsertedUserId) {
        lastUpsertedUserId = next.user.id;
        upsertUserProfile(next.user);
      }
      // Esto sí en los dos eventos: si el "acepto" se dio ANTES del login (no
      // había user_id donde guardarlo todavía), se escribe en cuanto exista
      // sesión — y si esa escritura fallara, en el SIGUIENTE arranque
      // (INITIAL_SESSION, no otro SIGNED_IN) es donde se reintenta, así que
      // tiene que poder correr ahí. Barato si no hay nada pendiente: una
      // lectura de localStorage y punto (guardarAceptacionPendiente).
      if ((event === "SIGNED_IN" || event === "INITIAL_SESSION") && next.user.id !== lastConsentimientoIntentado) {
        lastConsentimientoIntentado = next.user.id;
        guardarAceptacionPendiente(next.user);
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
    // Siempre, aunque no haya sesión de Supabase que cerrar: un dispositivo
    // compartido no debe quedarse diciendo que "ya aceptó" para quien entre
    // después.
    olvidarDispositivo();
    if (!supabase) return { error: null };
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
