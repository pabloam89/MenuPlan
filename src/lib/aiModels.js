// Central registry of Claude model ids used by the client.
// Single source of truth — never hardcode model ids elsewhere in src/.
// (api/recipe-steps.js runs server-side and keeps its own constant.)

// Menu generation (main planner call).
export const PLANNER_MODEL = "claude-sonnet-4-6";

// Cheap/fast model: format retries, recipe steps, receipt vision.
export const FAST_MODEL = "claude-haiku-4-5-20251001";

// School menu import (PDF/image → structured JSON).
export const PARSER_MODEL = "claude-sonnet-4-6";

// Short aliases accepted by the planner-model override (URL/localStorage/env),
// so a tester can just pass `?planner=haiku` instead of the full model id.
const PLANNER_ALIASES = {
  sonnet: PLANNER_MODEL,
  haiku: FAST_MODEL,
};

// Full model ids an override is allowed to resolve to. `?planner=`/
// localStorage/env accept arbitrary strings, but Anthropic's API rejects an
// unrecognized `model` with a 400 — and because the localStorage override is
// sticky, a single bad or mistyped value used to break EVERY generation from
// that browser until someone thought to clear it manually. Anything that
// doesn't land on one of these two known-good ids is now rejected instead of
// forwarded to the API as-is.
const ALLOWED_OVERRIDE_MODELS = new Set([PLANNER_MODEL, FAST_MODEL]);

/**
 * Resolves which model the menu planner should use for THIS generation, so we
 * can A/B Sonnet vs Haiku (latency/cost vs quality) without shipping code.
 * Precedence (first match wins, skipping any override that isn't a known
 * model — see ALLOWED_OVERRIDE_MODELS):
 *   1. `?planner=haiku|sonnet|<full-id>`  — per-session manual QA override.
 *   2. localStorage `mp_planner_model`     — sticky override for a browser.
 *   3. env `VITE_PLANNER_MODEL`            — per-deployment default (e.g. staging).
 *   4. env `VITE_PLANNER_AB="1"`           — sticky 50/50 split per browser.
 *   5. Sonnet (product default).
 * The chosen model is echoed in the server `llm_usage` log and the
 * `menu_generated` analytics event, so variants stay comparable end to end.
 */
export function resolvePlannerModel() {
  const wrap = (raw, source) => {
    const model = PLANNER_ALIASES[raw] ?? raw;
    return ALLOWED_OVERRIDE_MODELS.has(model) ? { model, variant: raw, source } : null;
  };

  try {
    const q = new URLSearchParams(window.location.search).get("planner");
    if (q) {
      const resolved = wrap(q, "url");
      if (resolved) return resolved;
    }
  } catch {
    // no window (tests/SSR) — fall through
  }

  try {
    const ls = localStorage.getItem("mp_planner_model");
    if (ls) {
      const resolved = wrap(ls, "storage");
      if (resolved) return resolved;
      // Bad/stale value (e.g. a typo, or a since-retired model id) — clear it
      // so this browser self-heals instead of failing every generation
      // forever until someone manually clears localStorage.
      try {
        localStorage.removeItem("mp_planner_model");
      } catch {
        // ignore
      }
    }
  } catch {
    // localStorage unavailable — fall through
  }

  const env = import.meta.env?.VITE_PLANNER_MODEL;
  if (env) {
    const resolved = wrap(env, "env");
    if (resolved) return resolved;
  }

  if (import.meta.env?.VITE_PLANNER_AB === "1") {
    let bucket = null;
    try {
      bucket = localStorage.getItem("mp_planner_variant");
    } catch {
      // ignore
    }
    if (bucket !== "sonnet" && bucket !== "haiku") {
      bucket = Math.random() < 0.5 ? "sonnet" : "haiku";
      try {
        localStorage.setItem("mp_planner_variant", bucket);
      } catch {
        // ignore
      }
    }
    return { model: PLANNER_ALIASES[bucket], variant: `ab_${bucket}`, source: "ab" };
  }

  return { model: PLANNER_MODEL, variant: "sonnet", source: "default" };
}
