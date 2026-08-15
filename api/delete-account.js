import { createClient } from "@supabase/supabase-js";

// Real account deletion (Apple App Store Guideline 5.1.1(v)): removes the
// auth.users row for the caller. Every user-scoped table (user_state,
// user_pantry, user_profiles, user_events, recipe_votes, user_follows,
// user_recipes, user_menus + user_menu_weeks/user_menu_recipes,
// user_recipe_discards) references auth.users(id) on delete cascade, so this
// single call is enough to wipe all of it — app_feedback is the deliberate
// exception (on delete set null: anonymized, not deleted).
//
// Must run server-side: deleting another user's auth account requires the
// service-role key, which can never be shipped to the browser. The caller's
// identity is derived from their own access token (admin.auth.getUser), never
// from a client-supplied id, so this can only ever delete the caller's own
// account.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Different environments got their Supabase vars from different sources
  // (the app's own VITE_-prefixed vars vs. the native Vercel<>Supabase
  // integration's SUPABASE_URL/SUPABASE_SECRET_KEY naming), so accept either.
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("[delete-account] missing Supabase URL or service-role/secret key env vars");
    return res.status(500).json({ error: "Servidor mal configurado." });
  }

  const authHeader = req.headers.authorization ?? "";
  const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!accessToken) {
    return res.status(401).json({ error: "Falta el token de sesión." });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const { data: userData, error: userErr } = await admin.auth.getUser(accessToken);
    if (userErr || !userData?.user) {
      return res.status(401).json({ error: "Sesión inválida." });
    }

    const { error: deleteErr } = await admin.auth.admin.deleteUser(userData.user.id);
    if (deleteErr) throw deleteErr;

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[delete-account]", err?.message);
    return res.status(500).json({ error: "No se pudo eliminar la cuenta." });
  }
}
