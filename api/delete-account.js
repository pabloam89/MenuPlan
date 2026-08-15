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
// identity is derived from their own access token (GET /auth/v1/user), never
// from a client-supplied id, so this can only ever delete the caller's own
// account.
//
// Talks to GoTrue's REST API directly with fetch (not the supabase-js SDK):
// a first attempt via admin.auth.admin.deleteUser() failed in production with
// an opaque "AuthRetryableFetchError" that gave no real signal (network-level
// vs. a genuine HTTP error response) — raw fetch + an explicit timeout budget
// tells those apart.
const FETCH_TIMEOUT_MS = 8000; // stay under Vercel Hobby's 10s function cap

async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Different environments got their Supabase vars from different sources
  // (the app's own VITE_-prefixed vars vs. the native Vercel<>Supabase
  // integration's SUPABASE_URL/SUPABASE_SECRET_KEY naming), so accept either.
  const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "").replace(/\/$/, "");
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

  let userId;
  try {
    const userRes = await fetchWithTimeout(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: serviceRoleKey, Authorization: `Bearer ${accessToken}` },
    });
    const userBody = await userRes.text();
    if (!userRes.ok) {
      console.error("[delete-account] GET /auth/v1/user failed", userRes.status, userBody.slice(0, 300));
      return res.status(401).json({ error: "Sesión inválida." });
    }
    userId = JSON.parse(userBody)?.id;
    if (!userId) {
      console.error("[delete-account] GET /auth/v1/user: no id in response", userBody.slice(0, 300));
      return res.status(401).json({ error: "Sesión inválida." });
    }
  } catch (err) {
    console.error("[delete-account] GET /auth/v1/user threw", err?.name, err?.message);
    return res.status(401).json({ error: "Sesión inválida." });
  }

  try {
    const deleteRes = await fetchWithTimeout(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
      method: "DELETE",
      headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
    });
    const deleteBody = await deleteRes.text();
    if (!deleteRes.ok) {
      console.error("[delete-account] DELETE /auth/v1/admin/users failed", deleteRes.status, deleteBody.slice(0, 500));
      return res.status(500).json({ error: "No se pudo eliminar la cuenta." });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(
      "[delete-account] DELETE /auth/v1/admin/users threw",
      err?.name,
      err?.message,
      err?.name === "AbortError" ? `timeout after ${FETCH_TIMEOUT_MS}ms` : "",
    );
    return res.status(500).json({ error: "No se pudo eliminar la cuenta." });
  }
}
