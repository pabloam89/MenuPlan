/**
 * Resolución de texto libre → ingrediente canónico, sin depender de dónde
 * venga el catálogo.
 *
 * Existe separado de ingredients.js porque el catálogo se consume desde dos
 * mundos que cargan el JSON de formas incompatibles: la app lo importa con
 * Vite (`import x from "./x.json"`) y los scripts de Node lo leen con
 * readFileSync. Si la lógica viviera junto al import, los scripts tendrían que
 * reimplementarla — y una segunda implementación de "qué ingrediente es este
 * texto" es exactamente lo que este proyecto vino a eliminar.
 *
 * Aquí no hay estado de módulo ni imports de datos: se le pasa el catálogo y
 * devuelve las funciones ya cerradas sobre él.
 */

import { normalizeName, ingredientStem } from "./ingredientCategories.js";

/**
 * @param {Array<{id: string, name: string, aliases: string[]}>} catalog
 */
export function createIngredientResolver(catalog) {
  const byId = new Map(catalog.map((ing) => [ing.id, ing]));

  // Nivel 1: nombre o alias exactos, ya normalizados. Es el camino que resuelve
  // las 6.863 líneas del catálogo de recetas.
  const byLabel = new Map();
  for (const ing of catalog) {
    for (const label of [ing.name, ...(ing.aliases ?? [])]) {
      byLabel.set(normalizeName(label), ing.id);
    }
  }

  // Nivel 2: raíz singularizada, para texto que no está literalmente en el
  // catálogo ("Tomates" → "tomate").
  //
  // Un stem que apunta a DOS ingredientes se descarta entero en vez de quedarse
  // con el primero: resolver por orden de array daría un resultado estable pero
  // arbitrario, y aquí un acierto arbitrario puede significar el alérgeno
  // equivocado. Mejor no resolver y que el llamante caiga a su heurística.
  const byStem = new Map();
  const ambiguous = new Set();
  for (const ing of catalog) {
    for (const label of [ing.name, ...(ing.aliases ?? [])]) {
      const stem = ingredientStem(label);
      if (!stem) continue;
      const existing = byStem.get(stem);
      if (existing && existing !== ing.id) ambiguous.add(stem);
      else byStem.set(stem, ing.id);
    }
  }
  for (const stem of ambiguous) byStem.delete(stem);

  /** Nivel 1+2 sobre un texto ya normalizado: exacto, si no raíz. */
  function resolveNormalized(normalized) {
    if (!normalized) return null;
    const exact = byLabel.get(normalized);
    if (exact) return exact;
    return byStem.get(ingredientStem(normalized)) ?? null;
  }

  // Nivel 3, última red: variantes regionales o calificadas de un ingrediente
  // que SÍ está en el catálogo — "Pimentón de la Vera", "Aceite de oliva
  // picual", "Nata montada", "Chocolate negro 70%". Medido contra 88
  // ingredientes de cocina casera real (offal, pescados regionales, quesos
  // DOP, especias, cocina asiática): 23 puntos porcentuales de ellos son
  // exactamente este caso — la base ya existe, solo falta reconocer el
  // calificativo. Sin esto habría que elegir entre cerrar la entrada de
  // ingredientes del wizard (bloquea cocina casera legítima: un 65% de esos
  // mismos 88 son huecos reales del catálogo, no de matching) o dejar esos
  // huecos regionales sin alérgenos/sustituciones exactos.
  //
  // En español el calificativo va casi siempre DETRÁS del nombre base, nunca
  // delante ("Pimentón de la Vera", no "La Vera pimentón"), así que solo se
  // recorta por el FINAL, probando primero el prefijo más largo y parando en
  // el primer acierto. Eso es lo que evita un falso positivo: "Leche de coco
  // light" encuentra "Leche de coco" (quitando solo "light") y nunca llega a
  // probar "Leche" a secas, que sería incorrecto — la leche de coco no es un
  // lácteo. Si la frase completa ya resolvía por nivel 1/2, esta función ni se
  // invoca, así que nunca recorta más de lo estrictamente necesario.
  function resolveByStrippingQualifier(name) {
    const words = normalizeName(name).split(" ").filter(Boolean);
    for (let n = words.length - 1; n >= 1; n--) {
      const id = resolveNormalized(words.slice(0, n).join(" "));
      if (id) return id;
    }
    return null;
  }

  /**
   * @param {string} name
   * @returns {string|null} null si no está en el catálogo — NO es un error.
   */
  function resolveIngredientId(name) {
    const normalized = normalizeName(name);
    if (!normalized) return null;
    return resolveNormalized(normalized) ?? resolveByStrippingQualifier(name);
  }

  /** @param {string} name */
  function resolveIngredient(name) {
    const id = resolveIngredientId(name);
    return id ? (byId.get(id) ?? null) : null;
  }

  return {
    resolveIngredientId,
    resolveIngredient,
    ingredientById: Object.fromEntries(byId),
    ambiguousStems: Object.freeze([...ambiguous].sort()),
  };
}
