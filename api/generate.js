import { blocked } from "./_guard.js";

// Server-side proxy to the Anthropic API.
//
// This endpoint is intentionally callable without a session (MenuPlan generates
// a full menu during onboarding, before any login — see api/_guard.js for the
// reasoning). That makes the request body attacker-controlled, so everything
// that costs money is pinned here rather than taken from the caller:
//
//   · `model` must be one of the two ids the client actually uses. Without this
//     anyone could point the endpoint at the priciest model available and bill
//     it to our key.
//   · `max_tokens` is clamped. 32000 is what the school-menu PDF import needs
//     (src/lib/menuParser.js); nothing legitimate asks for more.
//
// KNOWN GAP: `system` is still taken from the client, because the four callers
// (aiPlanner, menuParser, receiptParser, userRecipes) each build their own and
// moving them server-side is a real refactor. So a determined caller can still
// steer the model — they just can't pick an expensive one, can't ask for
// unbounded output, and get throttled. Closing this properly means owning the
// system prompts here.
//
// Keep ALLOWED_MODELS in sync with src/lib/aiModels.js.
const ALLOWED_MODELS = new Set(["claude-sonnet-4-6", "claude-haiku-4-5-20251001"]);
const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS_CAP = 32000;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // A single menu generation fans out into several calls (planner + format
  // retries + garnish replacements), so this is well above one user's needs
  // while still capping bulk abuse. Mobile carriers share IPs via CGNAT, hence
  // the generous ceiling.
  if (await blocked(req, res, { bucket: "generate", limit: 60, windowSec: 600 })) return;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured on server" });
  }

  try {
    const { model, max_tokens, system, messages } = req.body ?? {};

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages is required" });
    }

    const safeModel = ALLOWED_MODELS.has(model) ? model : DEFAULT_MODEL;
    const requested = Number(max_tokens);
    const safeMaxTokens = Number.isFinite(requested)
      ? Math.min(Math.max(1, Math.floor(requested)), MAX_TOKENS_CAP)
      : 1024;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "pdfs-2024-09-25",
      },
      body: JSON.stringify({
        model: safeModel,
        max_tokens: safeMaxTokens,
        ...(system ? { system } : {}),
        messages,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    // Structured usage log — searchable in Vercel logs ("llm_usage") to track
    // real token spend per model (input/output/cache read+write).
    if (data?.usage) {
      console.log(
        JSON.stringify({ tag: "llm_usage", endpoint: "generate", model: safeModel, ...data.usage })
      );
    }

    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
