import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase.js";
import { upsertUserProfile } from "./analytics.js";

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
