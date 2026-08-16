import { createHash } from "node:crypto";
import { Redis } from "@upstash/redis";
import { blocked } from "./_guard.js";

// Lazy, server-side cache of appliance-adapted recipe steps.
//
// The catalog only ships base `steps` + per-method `prepSummary`. When a user
// opens a dish and switches to a non-base method (airfryer, horno, thermomix…),
// the client asks here for the step-by-step adapted to that appliance.
//
// Flow: HGET recipe:steps:<recipeId> <appliance>
//   · hit  → return cached steps (no LLM)
//   · miss → generate with Claude, HSET, return
//
// Redis is optional: if env vars are missing or Redis errors, we still generate
// (just without persistence). This keeps the feature working everywhere.

const APPLIANCE_LABELS = {
  airfryer: "Airfryer",
  horno: "Horno",
  thermomix: "Thermomix",
  vaporera: "Vaporera",
  olla_express: "Olla exprés",
  microondas: "Microondas",
};

const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";
const MAX_STEPS = 6;
const CACHE_TTL_SECONDS = 90 * 24 * 60 * 60; // 90 días

// Versión del prompt de generación. Los pasos se cachean en Redis, así que un
// cambio de prompt no llega a las recetas ya generadas a menos que cambie la
// clave. Súbela cada vez que cambies el `system` de generateSteps().
// v2: prohíbe inventar ingredientes fuera de la lista de la receta.
const PROMPT_VERSION = "v2";

function pickEnv(...names) {
  for (const n of names) {
    const v = process.env[n];
    if (v) return v;
  }
  return null;
}

// La integración Upstash/KV de Vercel inyecta los nombres con prefijos variables
// (KV_REST_API_*, UPSTASH_REDIS_KV_*, etc.). Probamos los patrones habituales
// para que funcione sin tener que renombrar nada en Vercel.
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

// The cache key has to cover the recipe CONTENT, not just its id.
//
// This endpoint takes no session (see api/_guard.js), so the caller controls
// both the id — which used to be the whole cache key — and the name/ingredients
// /baseSteps that build the prompt. That combination let anyone write chosen
// steps into the shared entry for a REAL recipe id and have them served to
// every other user who opened that dish: send `recipeId` of a catalog dish with
// ingredients of your choosing, and the generated result got cached under the
// real id. In an app people rely on for allergies, tampered steps are not a
// prank.
//
// Folding a hash of the content into the key makes the cache content-addressed:
// a caller can only ever read back an entry that matches the exact inputs they
// sent, so a poisoned variant lands on its own key and is never served to
// anyone else. Real clients send the same catalog data for a given id, so they
// still hit the cache — and when a recipe legitimately changes, the key changes
// with it and the steps are regenerated, which is what we'd want anyway.
function recipeFingerprint(parts) {
  return createHash("sha256")
    .update(JSON.stringify(parts))
    .digest("hex")
    .slice(0, 16);
}

function sanitizeSteps(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((s) => String(s ?? "").trim())
    .filter(Boolean)
    .slice(0, MAX_STEPS);
}

function extractJson(text) {
  const trimmed = String(text ?? "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return null;
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

async function generateSteps({ name, applianceLabel, prepSummary, ingredients, baseSteps, time }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured on server");

  const system =
    "Eres un cocinero español. Adaptas el paso a paso de una receta al " +
    "electrodoméstico indicado. Devuelves SOLO un JSON válido " +
    '{"steps":["…"]} con 3 a 5 pasos breves (máx 90 caracteres cada uno), ' +
    "en español, coherentes con el electrodoméstico (temperaturas, tiempos, " +
    "programas), sin markdown ni texto fuera del JSON.\n" +
    // Sin esta restricción el modelo inventaba acompañamientos que no están en
    // la receta ("pone con brócoli pero el modo Thermomix cocina arroz"),
    // contradiciendo el nombre, la foto y la lista de la compra del plato.
    "REGLA CRÍTICA: usa EXCLUSIVAMENTE los ingredientes de la lista " +
    "`ingredientes`. No añadas ni menciones ningún alimento que no esté en esa " +
    "lista — ni guarniciones, ni bases (arroz, pasta, cuscús, patata…), ni " +
    "verduras, ni lácteos. Solo cambia la TÉCNICA de cocinado, nunca los " +
    "ingredientes. Si un paso tradicional usa un ingrediente que no está en la " +
    "lista, omítelo en vez de sustituirlo por otro.";

  const userPayload = {
    receta: name,
    electrodomestico: applianceLabel,
    resumen_metodo: prepSummary || undefined,
    tiempo_total_min: time || undefined,
    ingredientes: ingredients,
    pasos_tradicionales_referencia: baseSteps,
  };

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 512,
      system,
      messages: [{ role: "user", content: JSON.stringify(userPayload) }],
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || `Anthropic HTTP ${response.status}`);
  }
  if (data?.usage) {
    console.log(
      JSON.stringify({ tag: "llm_usage", endpoint: "recipe-steps", model: ANTHROPIC_MODEL, ...data.usage })
    );
  }
  const text = data?.content?.[0]?.text ?? "";
  const parsed = extractJson(text);
  const steps = sanitizeSteps(parsed?.steps);
  if (steps.length === 0) throw new Error("La IA no devolvió pasos válidos.");
  return steps;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (await blocked(req, res, { bucket: "recipe-steps", limit: 40, windowSec: 600 })) return;

  const {
    recipeId,
    appliance,
    name,
    ingredients = [],
    baseSteps = [],
    prepSummary = "",
    time,
  } = req.body ?? {};

  if (!recipeId || !appliance) {
    return res.status(400).json({ error: "recipeId and appliance are required" });
  }

  const applianceLabel = APPLIANCE_LABELS[appliance] ?? appliance;
  const cacheKey = `recipe:steps:${PROMPT_VERSION}:${recipeId}:${recipeFingerprint({ name, ingredients, baseSteps, prepSummary, time })}`;
  const redis = getRedis();

  // 1) Try cache
  if (redis) {
    try {
      const cached = await redis.hget(cacheKey, appliance);
      if (cached) {
        const steps = sanitizeSteps(
          typeof cached === "string" ? JSON.parse(cached) : cached,
        );
        if (steps.length > 0) {
          return res.status(200).json({ steps, cached: true });
        }
      }
    } catch (err) {
      console.warn("[recipe-steps] redis read failed:", err?.message);
    }
  }

  // 2) Generate
  let steps;
  try {
    steps = await generateSteps({
      name,
      applianceLabel,
      prepSummary,
      ingredients,
      baseSteps,
      time,
    });
  } catch (err) {
    console.error("[recipe-steps]", err?.message);
    return res.status(502).json({ error: err?.message ?? "generation failed" });
  }

  // 3) Persist (best-effort)
  if (redis) {
    try {
      await redis.hset(cacheKey, { [appliance]: JSON.stringify(steps) });
      // Keys used to be one-per-recipe and never expired. Now that the content
      // fingerprint is part of the key, every recipe edit mints a new one, so
      // without a TTL the set would grow without bound. Steps are cheap to
      // regenerate, so a long expiry costs nothing and keeps Redis tidy.
      await redis.expire(cacheKey, CACHE_TTL_SECONDS);
    } catch (err) {
      console.warn("[recipe-steps] redis write failed:", err?.message);
    }
  }

  return res.status(200).json({ steps, cached: false });
}
