// Shared abuse guard for the AI endpoints (generate, generate-dish-photo,
// recipe-steps).
//
// Why not just require a Supabase session? Because MenuPlan is deliberately
// usable WITHOUT signing in — onboarding generates a full menu before the user
// ever sees a login prompt (App.jsx#handleGenerateMenu never checks `user`).
// Gating these endpoints on a JWT would break the product for every logged-out
// visitor, which is exactly the audience we're trying to grow. So instead of
// authenticating the caller, we cap what any caller can extract:
//
//   1. the endpoint pins the model + max_tokens server-side (see each handler),
//      so the expensive "free unlimited LLM" payoff disappears;
//   2. this module rate-limits per IP, so bulk abuse is throttled;
//   3. this module rejects obvious cross-origin calls;
//   4. an OPTIONAL global daily budget per bucket (see dailyBudget below) caps
//      worst-case platform-wide cost regardless of how many different IPs a
//      sustained abuse pattern spreads across — the per-IP limit alone can't
//      catch that, since a botnet or a rotating-IP script never trips it.
//
// Rate limiting fails OPEN (allows the request) when Redis is unavailable: a
// Redis blip must not take menu generation down for real users, and points 1+3
// still stand on their own.

import { Redis } from "@upstash/redis";

function pickEnv(...names) {
  for (const n of names) {
    const v = process.env[n];
    if (v) return v;
  }
  return null;
}

// Mirrors api/recipe-steps.js#getRedis — the Vercel/Upstash integration injects
// these under several different prefixes depending on how it was linked.
function getRedis() {
  const url = pickEnv(
    "UPSTASH_REDIS_REST_URL",
    "KV_REST_API_URL",
    "UPSTASH_REDIS_KV_REST_API_URL",
    "UPSTASH_REDIS_KV_KV_REST_API_URL",
  );
  const token = pickEnv(
    "UPSTASH_REDIS_REST_TOKEN",
    "KV_REST_API_TOKEN",
    "UPSTASH_REDIS_KV_REST_API_TOKEN",
    "UPSTASH_REDIS_KV_KV_REST_API_TOKEN",
  );
  if (!url || !token) return null;
  try {
    return new Redis({ url, token });
  } catch {
    return null;
  }
}

// Vercel puts the real client IP first in x-forwarded-for. Everything after is
// proxy hops and must not be trusted as an identity.
function clientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length) return xff.split(",")[0].trim();
  return req.headers["x-real-ip"] || "unknown";
}

/**
 * Rejects requests whose Origin belongs to another site. A missing Origin is
 * allowed on purpose: non-browser clients and some privacy proxies strip it,
 * and this check is a speed bump (trivially spoofed with curl), not the real
 * defense — the rate limit and the server-pinned model are.
 * @returns {boolean} true if the request should be blocked.
 */
export function isCrossOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return false;
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  if (!host) return false;
  try {
    return new URL(origin).host !== host;
  } catch {
    return true; // unparseable Origin — treat as hostile
  }
}

/**
 * Fixed-window per-IP rate limit.
 * @returns {Promise<{ok: boolean, retryAfter?: number}>}
 */
export async function rateLimit(req, { bucket, limit, windowSec }) {
  const redis = getRedis();
  if (!redis) return { ok: true }; // no Redis configured — see fail-open note above

  const key = `ratelimit:${bucket}:${clientIp(req)}:${Math.floor(Date.now() / 1000 / windowSec)}`;
  try {
    const count = await redis.incr(key);
    // Only the first hit of a window needs the TTL; setting it every time would
    // slide the window forward and let a steady stream never expire.
    if (count === 1) await redis.expire(key, windowSec);
    if (count > limit) return { ok: false, retryAfter: windowSec };
    return { ok: true };
  } catch (err) {
    console.warn("[guard] rate limit check failed, allowing:", err?.message);
    return { ok: true };
  }
}

// Global, cross-IP daily circuit breaker — off by default.
//
// The per-IP window above (rateLimit) protects against ONE abusive caller,
// but does nothing against cost spread across many IPs (rotating-IP script,
// small botnet, or just an unexpectedly viral spike): each IP individually
// stays under its own limit while the total bill keeps climbing all day with
// no ceiling anywhere in the code.
//
// This adds an optional platform-wide cap per bucket, read from
// AI_DAILY_BUDGET_<BUCKET> (bucket uppercased, e.g. AI_DAILY_BUDGET_GENERATE).
// Unset (the default) = no check at all, zero behavior change from before —
// deliberately opt-in, since the right number depends on real traffic/cost
// tolerance this code has no way to know. Set it once that's known, no
// redeploy of anything else required.
function dailyBudgetEnvLimit(bucket) {
  const raw = process.env[`AI_DAILY_BUDGET_${bucket.toUpperCase().replace(/-/g, "_")}`];
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

/** @returns {Promise<{ok: boolean}>} */
export async function dailyBudget(bucket) {
  const limit = dailyBudgetEnvLimit(bucket);
  if (limit == null) return { ok: true }; // not configured — no-op, see note above

  const redis = getRedis();
  if (!redis) return { ok: true }; // same fail-open policy as rateLimit

  // UTC calendar day: coarse on purpose, this is a cost ceiling, not a
  // precise 24h sliding window.
  const day = new Date().toISOString().slice(0, 10);
  const key = `budget:${bucket}:${day}`;
  try {
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, 172800); // 2 days: safety margin past midnight-UTC edge
    if (count > limit) return { ok: false };
    return { ok: true };
  } catch (err) {
    console.warn("[guard] daily budget check failed, allowing:", err?.message);
    return { ok: true };
  }
}

/**
 * Runs all checks and writes the error response itself when blocked.
 * @returns {Promise<boolean>} true if the handler should stop.
 */
export async function blocked(req, res, opts) {
  if (isCrossOrigin(req)) {
    res.status(403).json({ error: "Origen no permitido." });
    return true;
  }
  const { ok, retryAfter } = await rateLimit(req, opts);
  if (!ok) {
    console.warn(`[guard] rate limited ${opts.bucket} for ${clientIp(req)}`);
    res.setHeader("Retry-After", String(retryAfter));
    res.status(429).json({ error: "Demasiadas peticiones. Inténtalo en un momento." });
    return true;
  }
  const budget = await dailyBudget(opts.bucket);
  if (!budget.ok) {
    console.warn(`[guard] daily budget exceeded for bucket "${opts.bucket}"`);
    res.status(503).json({ error: "Servicio de IA saturado por hoy. Vuelve a intentarlo mañana." });
    return true;
  }
  return false;
}
