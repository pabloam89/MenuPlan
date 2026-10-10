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
//   4. a global daily cap per AI bucket (see dailyBudget below) bounds the
//      platform-wide cost per day, whatever the number of callers.
//
// The per-IP rate limit fails OPEN (allows the request) when Redis is
// unavailable: a Redis blip must not take the app down for real users. The
// daily cap is a spending ceiling and fails CLOSED, like globalLimit.

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

// Origen de la app iOS (Capacitor): la web va empaquetada dentro de la app y
// se sirve desde capacitor://localhost, asi que sus llamadas a /api son
// cross-origin y sin esto el guard las rechaza con 403.
const APP_ORIGINS = new Set(["capacitor://localhost"]);

/**
 * CORS solo para la app nativa. Una peticion con cualquier otro Origin (la web,
 * el TWA de Android) no recibe ninguna cabecera nueva y sigue igual que antes.
 * @returns {boolean} true si ya se ha respondido (preflight OPTIONS).
 */
export function cors(req, res) {
  const origin = req.headers.origin;
  if (!APP_ORIGINS.has(origin)) return false;
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  if (req.method !== "OPTIONS") return false;
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");
  res.status(204).end();
  return true;
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
  if (APP_ORIGINS.has(origin)) return false;
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

/**
 * Ventana fija GLOBAL (no por IP): para endpoints que solo llama un
 * planificador y cuestan dinero, como el turno con modelo del canario
 * (api/bot/canario.js). Es un tope de gasto, así que falla CERRADO, al revés
 * que rateLimit: sin Redis, o si Redis da error, no deja pasar. Lo que se
 * pierde es una pasada del canario; lo que se evita, gastar sin techo.
 * @returns {Promise<{ok: boolean, motivo?: "sin_redis" | "error_redis"}>}
 */
export async function globalLimit({ bucket, limit, windowSec }, { redis = getRedis() } = {}) {
  if (!redis) {
    console.warn(`[guard] global limit ${bucket}: no Redis, denying`);
    return { ok: false, motivo: "sin_redis" };
  }
  const key = `ratelimit:${bucket}:global:${Math.floor(Date.now() / 1000 / windowSec)}`;
  try {
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, windowSec);
    return { ok: count <= limit };
  } catch (err) {
    console.warn(`[guard] global limit ${bucket} check failed, denying:`, err?.message);
    return { ok: false, motivo: "error_redis" };
  }
}

// Tope diario GLOBAL por bucket de IA: llamadas al modelo por día UTC, sumando
// a todo el mundo. No va en blocked(): cada handler llama a topeDiarioAgotado()
// justo antes de llamar al modelo, después de validar el cuerpo (y, si hay
// caché, solo cuando falla), para que solo cuente lo que de verdad se paga.
// Es un techo de gasto, así que desplegado falla CERRADO (sin Redis, o con
// Redis fallando, no deja pasar), igual que globalLimit. Fuera de Vercel (sin
// VERCEL_ENV, en local) y sin Redis deja pasar, con su línea.
//
// Cada bucket de IA tiene un tope por defecto aquí, bajo a propósito. La
// variable AI_DAILY_BUDGET_<BUCKET> (en mayúsculas y con _ por -, p. ej.
// AI_DAILY_BUDGET_RECIPE_STEPS) lo cambia sin tocar código; si falta o no es
// un entero de 1 en adelante, vale el de aquí, nunca «sin tope».
export const TOPE_DIARIO_POR_DEFECTO = Object.freeze({
  generate: 200,
  "recipe-steps": 100,
  moderate: 100,
  "dish-photo": 30,
});

export function topeDiario(bucket, env = process.env) {
  const n = Math.floor(Number(env[`AI_DAILY_BUDGET_${bucket.toUpperCase().replace(/-/g, "_")}`]));
  if (Number.isFinite(n) && n >= 1) return n;
  return TOPE_DIARIO_POR_DEFECTO[bucket] ?? null;
}

// Una línea contable por cada vez que no es «contado y dentro», sin nada de
// quien llama: bucket, motivo (MOTIVOS_TOPE_DIARIO en src/lib/vocabularios.js)
// y si corta. `detalle`, solo el mensaje de error de Redis.
function apuntar(bucket, motivo, { corta = true, detalle } = {}) {
  console.warn(JSON.stringify({ tag: "tope_diario", bucket, motivo, corta, ...(detalle ? { detalle } : {}) }));
  return corta ? { ok: false, motivo } : { ok: true, motivo };
}

/**
 * @returns {Promise<{ok: boolean, motivo?: "tope_alcanzado" | "sin_redis" | "error_redis"}>}
 */
export async function dailyBudget(bucket, { redis, env = process.env } = {}) {
  const limit = topeDiario(bucket, env);
  if (limit == null) return { ok: true }; // bucket sin tope por defecto ni variable: no se cuenta

  const r = redis === undefined ? getRedis() : redis;
  if (!r) return apuntar(bucket, "sin_redis", { corta: Boolean(env.VERCEL_ENV) });

  // Día UTC: grueso a propósito, es un techo de gasto y no una ventana exacta.
  const day = new Date().toISOString().slice(0, 10);
  const key = `budget:${bucket}:${day}`;
  try {
    const count = await r.incr(key);
    if (count === 1) await r.expire(key, 172800); // 2 días: margen pasada la medianoche UTC
    if (count > limit) return apuntar(bucket, "tope_alcanzado");
    return { ok: true };
  } catch (err) {
    return apuntar(bucket, "error_redis", { detalle: String(err?.message ?? "").slice(0, 120) });
  }
}

/**
 * Para los handlers: justo antes de la llamada al modelo. Si no hay cupo,
 * contesta 503 él mismo.
 * @returns {Promise<boolean>} true si el handler debe parar.
 */
export async function topeDiarioAgotado(res, bucket, opciones) {
  if ((await dailyBudget(bucket, opciones)).ok) return false;
  res.status(503).json({ error: "Servicio de IA saturado por hoy. Vuelve a intentarlo mañana." });
  return true;
}

/**
 * Runs the per-request checks (origin, per-IP rate limit) and writes the error
 * response itself when blocked. The daily AI cap is not here: see
 * topeDiarioAgotado.
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
  return false;
}
