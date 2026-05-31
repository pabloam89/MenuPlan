const STARCH_TAGS = ["arroz", "pasta", "carbos"];

function normalizedText(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Searchable text: name + ingredient names. */
export function recipeText(recipe) {
  const ing = (recipe?.ingredients ?? []).map((i) => i.name).join(" ");
  return normalizedText(`${recipe?.name ?? ""} ${ing}`);
}

/** Finer protein key than tags alone (detects pollo in ensaladas, etc.). */
export function recipeProteinKey(recipe) {
  if (!recipe) return null;
  const text = recipeText(recipe);
  if (/pollo|pavo/.test(text)) return "pollo";
  if (/pesc|atun|merluza|salmon|bacalao|lenguado|gallo/.test(text)) return "pescado";
  if (/ternera|cerdo|vacuno|buey|chorizo|lomo|hamburgues|carne/.test(text)) return "carne";
  if (/huevo|tortilla|revuelto/.test(text)) return "huevos";
  if (/lentej|garbanz|alubi|judia|habas|guisante/.test(text)) return "legumbres";
  const tags = recipe.tags ?? [];
  if (tags.includes("legumbres")) return "legumbres";
  if (tags.includes("pescado")) return "pescado";
  if (tags.includes("carne")) return "carne";
  if (tags.includes("huevos")) return "huevos";
  return null;
}

/** Base de arroz/pasta/massas — no cuenta patata suelta en una crema. */
export function recipeHasStarch(recipe) {
  if (!recipe) return false;
  const tags = recipe.tags ?? [];
  if (STARCH_TAGS.some((t) => tags.includes(t))) return true;
  const text = recipeText(recipe);
  return /cuscus|couscous|quinoa|bulgur|mijo|fideo|pasta|macarron|espaguet|lasaña|ñoqui|arroz|paella|pizza/.test(
    text
  );
}

export function recipeHasLegume(recipe) {
  if (!recipe) return false;
  if ((recipe.tags ?? []).includes("legumbres")) return true;
  return /lentej|garbanz|alubi|judia|habas|guisante|cigron/.test(recipeText(recipe));
}

export function isPastaDish(recipe) {
  if (!recipe) return false;
  if ((recipe.tags ?? []).includes("pasta")) return true;
  return /pasta|macarron|espaguet|fideo|lasaña|ñoqui/.test(recipeText(recipe));
}

/** Plato de cuchara: crema, puré, sopa, guiso, legumbres… */
export function isPlatoCuchara(recipe) {
  if (!recipe) return false;
  const tags = recipe.tags ?? [];
  if (tags.includes("crema") || tags.includes("sopa") || tags.includes("guiso")) return true;
  if (tags.includes("legumbres")) return true;
  return /pur[eé]|potaje|guiso|caldo|crema|lentej|garbanz|alubi|potage/.test(recipeText(recipe));
}

/** Plato que suele ser comida completa: paella, pizza… */
export function isSoloPlato(recipe) {
  if (!recipe) return false;
  const text = recipeText(recipe);
  if (/paella|pizza/.test(text)) return true;
  if ((recipe.tags ?? []).includes("carbos") && /pizza/.test(text)) return true;
  return false;
}

/** Válido como 1º de comida (ligero o legumbre tradicional). */
export function isValidPrimero(recipe) {
  if (!recipe) return false;
  const tags = recipe.tags ?? [];
  if (isSoloPlato(recipe)) return false;
  if (tags.includes("pescado") || tags.includes("carne")) return false;
  if (tags.includes("pasta") || tags.includes("arroz") || tags.includes("carbos")) return false;
  if (isPastaDish(recipe) || recipeHasStarch(recipe)) return false;
  if (recipe.kcal > 400 || recipe.time > 45) return false;

  if (tags.includes("crema") || tags.includes("sopa")) return true;
  if (tags.includes("legumbres")) return true;
  if (tags.includes("verdura") && recipe.kcal <= 350) return true;
  if (/ensalada/.test(recipeText(recipe)) && recipe.kcal <= 380) return true;

  return false;
}

/** Conflicto genérico (mismo día o platos incompatibles). */
export function recipesPairConflict(a, b) {
  if (!a || !b || a.id === b.id) return Boolean(a && b && a.id === b.id);

  const pkA = recipeProteinKey(a);
  const pkB = recipeProteinKey(b);
  if (pkA && pkB && pkA === pkB) return true;

  if (recipeHasLegume(a) && recipeHasLegume(b)) return true;
  if (recipeHasStarch(a) && recipeHasStarch(b)) return true;

  return false;
}

/** Reglas de emparejamiento 1º + 2º en comida. */
export function comidaPairConflict(primero, segundo) {
  if (!primero || !segundo) return false;
  if (recipesPairConflict(primero, segundo)) return true;

  // Dos platos de cuchara (puré + garbanzos, crema + lentejas…)
  if (isPlatoCuchara(primero) && isPlatoCuchara(segundo)) return true;

  // Paella/pizza: plato único; solo admite ensalada/crema muy ligera
  if (isSoloPlato(segundo)) {
    const ok =
      (primero.tags ?? []).includes("crema") ||
      (/ensalada/.test(recipeText(primero)) && primero.kcal <= 280);
    if (!ok) return true;
  }

  // Tras sopa/crema/puré/legumbre de 1º, el 2º no puede ser otro contundente
  if (isPlatoCuchara(primero) || recipeHasLegume(primero)) {
    if (
      isSoloPlato(segundo) ||
      isPastaDish(segundo) ||
      recipeHasStarch(segundo) ||
      recipeHasLegume(segundo)
    ) {
      return true;
    }
  }

  // Pescado/carne completo nunca como 1º con pasta/arroz de 2º
  if (
    ((primero.tags ?? []).includes("pescado") || (primero.tags ?? []).includes("carne")) &&
    (isPastaDish(segundo) || recipeHasStarch(segundo))
  ) {
    return true;
  }

  return false;
}

export function dayProteinPenalty(recipe, dayProteinKeys) {
  if (!recipe || !dayProteinKeys?.size) return 0;
  const pk = recipeProteinKey(recipe);
  if (pk && dayProteinKeys.has(pk)) return 95;
  return 0;
}

export function dayPastaPenalty(recipe, dayHasPasta) {
  if (!recipe || !dayHasPasta) return 0;
  if (isPastaDish(recipe)) return 120;
  return 0;
}

export function trackDayPasta(recipe, dayFlags) {
  if (recipe && isPastaDish(recipe)) dayFlags.hasPasta = true;
}
