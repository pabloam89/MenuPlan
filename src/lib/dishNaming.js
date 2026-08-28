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
 * Build "Plato con guarnición y salsa" (o solo uno de los dos) sin duplicar
 * cuando el nombre base ya los incluye (menús hidratados tras
 * applyGarnishToRecipe). `sauce` es opcional: un plato puede llevar
 * guarnición sin salsa, salsa sin guarnición, o ambas a la vez.
 */
export function formatDishWithGarnish(baseName, garnish, sauce) {
  const base = String(baseName ?? "").trim();
  const g = String(garnish?.shortName ?? garnish?.name ?? "").trim();
  const s = String(sauce?.name ?? "").trim();
  const parts = [g, s].filter(Boolean);
  if (parts.length === 0) return base;
  const suffix = ` con ${parts.join(" y ")}`;
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

/**
 * True when the dish should render as one plate, not principal + side tabs.
 *
 * Antes se forzaba a true para cualquier `type: "completo"` o `mealRole` con
 * "plato_unico", sin mirar si el nombre ya venía fusionado. En la práctica
 * eso era inofensivo mientras el emparejamiento automático (pairGarnishes.js/
 * pairSauces.js) solo actúa sobre `type: "principal"` — nunca sobre
 * "completo" — así que la fusión de nombre (`applyGarnishToRecipe`,
 * aiPlanner.js) tampoco corre para esos platos. Pero cuando SÍ hay una
 * guarnición/salsa pegada a mano a un plato único (combinar plato manual),
 * el atajo escondía las pestañas aunque el nombre siguiera siendo el del
 * plato solo — el usuario perdía visibilidad de qué llevaba exactamente.
 * Ahora se decide siempre por el mismo criterio real: ¿el nombre del plato
 * YA incluye el texto de la guarnición/salsa? Si no, se muestran las
 * pestañas igual que en cualquier otro plato principal.
 */
export function isPlatoUnicoWithGarnish(recipe, catalogEntry, catalogId, garnishRecipe, garnishShortName, sauceRecipe) {
  if (!garnishRecipe && !sauceRecipe) return false;
  const base = baseDishName(recipe, catalogId, catalogEntry ? { [catalogId]: catalogEntry } : {});
  const combined = formatDishWithGarnish(
    base,
    garnishRecipe ? { shortName: garnishShortName, name: garnishRecipe.name } : null,
    sauceRecipe,
  );
  return normalizeDishName(recipe?.name) === normalizeDishName(combined);
}
