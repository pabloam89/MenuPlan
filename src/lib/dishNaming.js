/** Normalize for fuzzy name comparison (accents, case, punctuation). */
export function normalizeDishName(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Build "Plato con guarnición" without duplicating when the base name already
 * includes the garnish (menus hydrated after applyGarnishToRecipe).
 */
export function formatDishWithGarnish(baseName, garnish) {
  const base = String(baseName ?? "").trim();
  const g = String(garnish?.shortName ?? garnish?.name ?? "").trim();
  if (!g) return base;
  const suffix = ` con ${g}`;
  if (normalizeDishName(base).endsWith(normalizeDishName(suffix))) return base;
  return `${base}${suffix}`;
}

/** Catalog base name before garnish fusion mutated recipe.name. */
export function baseDishName(recipe, catalogId, catalogById) {
  const fromCatalog = catalogId ? catalogById?.[catalogId]?.name : null;
  if (fromCatalog) return fromCatalog;
  const name = String(recipe?.name ?? "").trim();
  const idx = name.toLowerCase().indexOf(" con ");
  return idx === -1 ? name : name.slice(0, idx).trim();
}

/** True when the dish should render as one plate, not principal + side tabs. */
export function isPlatoUnicoWithGarnish(recipe, catalogEntry, catalogId, garnishRecipe, garnishShortName) {
  if (!garnishRecipe) return false;
  const roles = catalogEntry?.mealRole ?? recipe?.mealRole ?? [];
  const type = catalogEntry?.type ?? recipe?.type;
  if (type === "completo" || roles.includes("plato_unico")) return true;
  const base = baseDishName(recipe, catalogId, catalogEntry ? { [catalogId]: catalogEntry } : {});
  const combined = formatDishWithGarnish(base, {
    shortName: garnishShortName,
    name: garnishRecipe.name,
  });
  return normalizeDishName(recipe?.name) === normalizeDishName(combined);
}
