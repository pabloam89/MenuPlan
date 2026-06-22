import { Redis } from "@upstash/redis";

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
    "programas), sin markdown ni texto fuera del JSON.";

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
  const cacheKey = `recipe:steps:${recipeId}`;
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
    } catch (err) {
      console.warn("[recipe-steps] redis write failed:", err?.message);
    }
  }

  return res.status(200).json({ steps, cached: false });
}
