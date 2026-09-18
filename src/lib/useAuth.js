import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase.js";
import { upsertUserProfile } from "./analytics.js";
import { isNativeApp } from "./apiUrl.js";

/**
 * Tracks the Supabase auth session and exposes Google sign-in / sign-out.
 * Falls back gracefully if Supabase env vars are missing.
 *
 * En la app nativa (iOS) el login va por otro camino — navegador del sistema y
 * vuelta por com.homenu.app:// — porque Google no admite su pantalla de login
 * dentro de un webview. Ver `nativeAuth.js`, que se carga solo ahí.
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
      if (event === "SIGNED_IN" && next?.user && next.user.id !== lastUpsertedUserId) {
        lastUpsertedUserId = next.user.id;
        upsertUserProfile(next.user);
      }
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
    if (isNativeApp) {
      const { startNativeOAuth } = await import("./nativeAuth.js");
      const { error } = await startNativeOAuth(supabase, "google");
      if (error) console.error("[auth] Google sign-in failed (nativo)", error);
      return { error: error ?? null };
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
