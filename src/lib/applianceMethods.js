// Appliance preparation methods — shared selection logic + labels.
//
// Each recipe may carry `methods[]`, where every entry is:
//   { appliance: "airfryer"|"horno"|"thermomix"|"vaporera"|"olla_express"|"microondas",
//     time: number, difficulty: "facil"|"normal"|"elaborada", prepSummary: string }
//
// The recipe's top-level { time, difficulty } stays as the BASE version
// (stovetop / its own technique). Methods are alternatives the user can pick
// based on the kitchen tools they declared in onboarding.

export const APPLIANCE_LABELS = {
  airfryer: "Airfryer",
  horno: "Horno",
  thermomix: "Thermomix",
  vaporera: "Vaporera",
  olla_express: "Olla exprés",
  microondas: "Microondas",
};

// Per-appliance accent colour (UI chips/icons).
export const APPLIANCE_COLORS = {
  airfryer: "#f97316",
  horno: "#ef4444",
  thermomix: "#8b5cf6",
  vaporera: "#06b6d4",
  olla_express: "#6b7280",
  microondas: "#3b82f6",
};

// Onboarding tool label (lowercased) → method appliance slug.
const TOOL_TO_APPLIANCE = {
  "airfryer": "airfryer",
  "freidora de aire": "airfryer",
  "horno": "horno",
  "microondas": "microondas",
  "robot/thermomix": "thermomix",
  "thermomix": "thermomix",
  "robot de cocina": "thermomix",
  "olla rápida": "olla_express",
  "olla rapida": "olla_express",
  "olla exprés": "olla_express",
  "olla express": "olla_express",
  "olla a presión": "olla_express",
  "vaporera": "vaporera",
};

/** Maps a list of onboarding kitchen tool labels to a Set of appliance slugs. */
export function userApplianceSlugs(kitchenTools = []) {
  const out = new Set();
  for (const t of kitchenTools) {
    const slug = TOOL_TO_APPLIANCE[String(t).toLowerCase().trim()];
    if (slug) out.add(slug);
  }
  return out;
}

/**
 * Picks the best method for the user's tools (fastest matching appliance),
 * or null when the recipe has no methods or none match the user's tools
 * (in which case the base/top-level version is used).
 */
export function selectMethodForRecipe(recipe, kitchenTools = []) {
  const methods = recipe?.methods;
  if (!Array.isArray(methods) || methods.length === 0) return null;
  const slugs = userApplianceSlugs(kitchenTools);
  if (slugs.size === 0) return null;
  const candidates = methods.filter((m) => slugs.has(m.appliance));
  if (candidates.length === 0) return null;
  return candidates.reduce((best, m) => (m.time < best.time ? m : best));
}

const DIFFICULTY_LABELS = { facil: "Fácil", normal: "Normal", elaborada: "Elaborada" };
export function methodDifficultyLabel(difficulty) {
  return DIFFICULTY_LABELS[difficulty] ?? "Normal";
}
