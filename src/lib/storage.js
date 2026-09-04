import {
  collectMenuRecipeIds,
  pruneAiRecipes,
  pruneMenuHistory,
} from "./menuArchive.js";

const KEY = "menuplan.state.v1";

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function recipeIdsFromPlan(plan) {
  const ids = new Set();
  if (!plan || typeof plan !== "object") return ids;
  for (const [key, slots] of Object.entries(plan)) {
    if (key.startsWith("_") || !slots || typeof slots !== "object") continue;
    for (const slot of Object.values(slots)) {
      if (slot?.recipeId) ids.add(slot.recipeId);
      if (slot?.firstRecipeId) ids.add(slot.firstRecipeId);
    }
  }
  return ids;
}

/**
 * Shrinks the heaviest local blobs so a QuotaExceeded write can still succeed.
 * Light = recent history / spend still mostly intact; hard = keep the active
 * menú usable and drop older archive + spend noise.
 */
function compactState(state, level) {
  const data = { ...(state.data ?? {}) };
  const maxMenus = level === "hard" ? 3 : 10;
  const maxObs = level === "hard" ? 40 : 120;
  const maxReceipts = level === "hard" ? 5 : 20;

  data.menus = pruneMenuHistory(data.menus, maxMenus);
  if (Array.isArray(data.priceObs) && data.priceObs.length > maxObs) {
    data.priceObs = data.priceObs.slice(-maxObs);
  }
  if (Array.isArray(data.receipts) && data.receipts.length > maxReceipts) {
    data.receipts = data.receipts.slice(-maxReceipts);
  }

  let aiRecipes = Array.isArray(state.aiRecipes) ? state.aiRecipes : [];
  if (level === "hard") {
    const keep = collectMenuRecipeIds(data.menus);
    for (const id of recipeIdsFromPlan(state.menuPlan)) keep.add(id);
    aiRecipes = pruneAiRecipes(aiRecipes, keep);
  } else if (aiRecipes.length > 80) {
    aiRecipes = aiRecipes.slice(-80);
  }

  return { ...state, data, aiRecipes };
}

function tryWrite(payload) {
  localStorage.setItem(KEY, JSON.stringify(payload));
}

/**
 * Persist app state. On QuotaExceeded / private-mode failures, progressively
 * compact menus + spend history and retry before giving up.
 *
 * @returns {{ ok: boolean, pruned: boolean, saved: object|null }}
 */
export function saveState(state) {
  const attempts = [
    { pruned: false, payload: state },
    { pruned: true, payload: compactState(state, "light") },
    { pruned: true, payload: compactState(state, "hard") },
  ];

  for (const attempt of attempts) {
    try {
      tryWrite(attempt.payload);
      return { ok: true, pruned: attempt.pruned, saved: attempt.payload };
    } catch {
      // try next compaction level
    }
  }
  return { ok: false, pruned: false, saved: null };
}

export function clearState() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // noop
  }
}
