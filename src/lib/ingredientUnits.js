// Unidades de ingrediente y fusión de líneas repetidas.
//
// Módulo HOJA a propósito: no importa nada. Lo necesitan tanto `data/recipes.js`
// (registerRecipes) como `lib/ingredientCategories.js`, y ese último ya importa
// de `data/recipes.js` — meterlo allí cerraría un ciclo de imports, que es
// justo lo que el check:tdz del repo existe para evitar.

// Units that don't carry a fixed numeric amount — how much to use depends on
// taste or on the process, not on a weighable/countable quantity.
//   - "al gusto": personal preference (sal, pimienta, aliño)
//   - "pizca": a pinch, traditionally never weighed (sal, azafrán, canela)
//   - "c/n" ("cantidad necesaria"): whatever the process needs, not taste
//     (aceite para freír, agua para cubrir, harina para espolvorear)
export const QUALITATIVE_INGREDIENT_UNITS = ["al gusto", "pizca", "c/n"];

export function isQualitativeUnit(unit) {
  return QUALITATIVE_INGREDIENT_UNITS.includes(unit);
}

const QUALITATIVE_UNIT_LABELS = {
  "al gusto": "Al gusto",
  "pizca": "Pizca",
  "c/n": "C/N",
};

/** Display label for a qualitative unit on its own (no number attached). */
export function qualitativeUnitLabel(unit) {
  return QUALITATIVE_UNIT_LABELS[unit] ?? unit;
}

const normIngredientName = (s) =>
  String(s ?? "").toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").trim();

/**
 * Junta en una sola linea los ingredientes que son el mismo ingrediente.
 *
 * Un plato con guarnicion (y a veces salsa) es la suma de dos o tres recetas, y
 * las tres llevan sal, aceite y ajo. Sin esto la ficha salia con "Sal" tres
 * veces y "Aceite de oliva" dos, cada una con su cantidad — que ademas es
 * inutil para cocinar: lo que quieres saber es cuanto aceite echas en total, no
 * cuanto le tocaria a cada mitad del plato.
 *
 * Se suman solo las que comparten unidad. Una cuantificada y otra "al gusto"
 * son el mismo ingrediente contado de dos formas: manda la que trae cantidad.
 * Dos unidades reales distintas (g y ml del mismo nombre) no se pueden sumar
 * sin inventarse una densidad, asi que esas se dejan en dos lineas.
 */
export function mergeIngredientLines(list) {
  const out = [];
  const slotByName = new Map();
  for (const ing of list ?? []) {
    const key = normIngredientName(ing.name);
    const at = slotByName.get(key);
    if (at == null) {
      slotByName.set(key, out.length);
      out.push({ ...ing });
      continue;
    }
    const prev = out[at];
    if (prev.unit === ing.unit) {
      prev.qty = prev.qty == null && ing.qty == null ? null : (prev.qty ?? 0) + (ing.qty ?? 0);
      continue;
    }
    if (isQualitativeUnit(prev.unit) && !isQualitativeUnit(ing.unit)) {
      out[at] = { ...prev, qty: ing.qty, unit: ing.unit };
      continue;
    }
    if (isQualitativeUnit(ing.unit)) continue;
    // Unidades reales distintas: sumarlas seria inventarse una equivalencia.
    out.push({ ...ing });
  }
  return out;
}
