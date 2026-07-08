// Shared text-matching engine for the dietary layers (allergens, intolerances,
// health flags, substitutions). Before this, each module reimplemented the same
// three helpers (normalize accents/case, build a name+ingredients haystack,
// compile a keyword alternation regex), so a fix in one could silently drift
// from the others. Keep the DATA separate per concern (hard exclusion vs soft
// bias) but share the MACHINERY here.

/** Lowercase + strip diacritics, so "Melocotón" matches "melocoton". */
export function normalizeText(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Ingredient names of a recipe (catalog or frontend shape). */
export function ingredientNames(recipe) {
  return (recipe?.ingredients ?? []).map((ing) => ing?.name).filter(Boolean);
}

/** Normalized "name + ingredient names" blob used for keyword scans. */
export function recipeHaystack(recipe) {
  return normalizeText([recipe?.name, ...ingredientNames(recipe)].filter(Boolean).join(" "));
}

/**
 * Compile a list of keywords into a single word-boundary alternation regex.
 * Matches a keyword at the start of a word (so plurals/suffixes still hit).
 * Keywords are normalized so callers can pass accented forms if they want.
 * @param {string[]} keywords
 * @returns {RegExp}
 */
export function compileKeywordRegex(keywords) {
  const normalized = (keywords ?? []).map(normalizeText).filter(Boolean);
  return new RegExp(`\\b(?:${normalized.join("|")})`);
}
