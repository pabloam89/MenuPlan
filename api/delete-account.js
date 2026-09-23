import crypto from "node:crypto";

import { cors } from "./_guard.js";

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

// ── Revocación del token de Apple ─────────────────────────────────────────
// Apple obliga a revocar el token de las cuentas creadas con "Iniciar sesión
// con Apple" cuando el usuario borra la cuenta — misma guía que obliga al
// borrado en sí. El refresh token lo copia el cliente en apple_auth_tokens al
// iniciar sesión, porque Supabase no lo persiste (ver la migración 0053).
//
// El secreto de cliente de Apple no es una cadena fija: es un JWT ES256
// firmado con la clave .p8, válido cinco minutos, que hay que fabricar en cada
// llamada. Se firma con node:crypto y `dsaEncoding: "ieee-p1363"`, que da la
// firma cruda r||s que espera JOSE — sin eso, crypto devuelve DER y Apple
// responde invalid_client sin más detalle.
const APPLE_REVOKE_URL = "https://appleid.apple.com/auth/revoke";

function base64url(input) {
  return Buffer.from(input).toString("base64url");
}

function appleClientSecret({ teamId, keyId, servicesId, privateKey }) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "ES256", kid: keyId }));
  const payload = base64url(
    JSON.stringify({
      iss: teamId,
      iat: now,
      exp: now + 300,
      aud: "https://appleid.apple.com",
      sub: servicesId,
    }),
  );
  const signingInput = `${header}.${payload}`;
  const signature = crypto.sign("sha256", Buffer.from(signingInput), {
    key: crypto.createPrivateKey(privateKey),
    dsaEncoding: "ieee-p1363",
  });
  return `${signingInput}.${signature.toString("base64url")}`;
}

/**
 * Revoca el token de Apple del usuario, si tiene uno.
 *
 * Nunca lanza ni corta el borrado: el derecho del usuario a que le borres la
 * cuenta no puede depender de que Apple conteste. Si algo falla queda el log,
 * y la cuenta se borra igual.
 */
async function revokeAppleToken(supabaseUrl, serviceRoleKey, userId) {
  const teamId = process.env.APPLE_TEAM_ID;
  const keyId = process.env.APPLE_KEY_ID;
  const servicesId = process.env.APPLE_SERVICES_ID;
  // En los paneles de entorno la clave se pega con los saltos de línea
  // escapados; sin deshacerlos, createPrivateKey no la reconoce.
  const privateKey = (process.env.APPLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  if (!teamId || !keyId || !servicesId || !privateKey) {
    console.warn("[delete-account] sin env de Apple: no se revoca el token");
    return;
  }

  let refreshToken;
  try {
    const url =
      `${supabaseUrl}/rest/v1/apple_auth_tokens` +
      `?user_id=eq.${encodeURIComponent(userId)}&select=refresh_token`;
    const tokenRes = await fetchWithTimeout(url, {
      headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
    });
    if (!tokenRes.ok) {
      console.error("[delete-account] lectura de apple_auth_tokens falló", tokenRes.status);
      return;
    }
    refreshToken = (await tokenRes.json())?.[0]?.refresh_token;
  } catch (err) {
    console.error("[delete-account] lectura de apple_auth_tokens lanzó", err?.name, err?.message);
    return;
  }
  // Lo normal en una cuenta de Google: no hay nada que revocar.
  if (!refreshToken) return;

  try {
    const body = new URLSearchParams({
      client_id: servicesId,
      client_secret: appleClientSecret({ teamId, keyId, servicesId, privateKey }),
      token: refreshToken,
      token_type_hint: "refresh_token",
    });
    const revokeRes = await fetchWithTimeout(APPLE_REVOKE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!revokeRes.ok) {
      console.error(
        "[delete-account] Apple /auth/revoke falló",
        revokeRes.status,
        (await revokeRes.text()).slice(0, 300),
      );
    }
  } catch (err) {
    console.error("[delete-account] Apple /auth/revoke lanzó", err?.name, err?.message);
  }
}

export default async function handler(req, res) {
  if (cors(req, res)) return;
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

  // Antes de borrar: mientras el usuario exista todavía se puede leer su token.
  await revokeAppleToken(supabaseUrl, serviceRoleKey, userId);

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
