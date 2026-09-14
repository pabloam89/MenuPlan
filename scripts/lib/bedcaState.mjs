/**
 * Estado de cocinado de un nombre de alimento — la regla dura que va ANTES de
 * cualquier LLM en el triaje de BEDCA (scripts/bedca-triage.mjs).
 *
 * Por qué existe: la nutrición por 100 g depende del estado, y la diferencia no
 * es un matiz. Lenteja seca: 24 g de proteína /100 g. Lenteja cocida: 9,5 g.
 * Un candidato de BEDCA en otro estado que el ingrediente del catálogo no es
 * "un match un poco peor": es una ficha mal por ×2,5. Por eso aquí el estado
 * NO puntúa (como en scripts/bedca-nutrition.mjs, donde COOKED_STATE_WORDS
 * resta 0,15 al score): descarta.
 *
 * Tres estados y nada más — "crudo", "cocinado" y "neutro" (el nombre no dice
 * nada). Neutro es el caso normal del catálogo ("Lentejas", "Pollo") y se
 * considera COMPATIBLE con un candidato crudo: BEDCA escribe "Lenteja, seca,
 * cruda" para lo que la compra llama simplemente "Lentejas". Lo que nunca es
 * compatible es neutro/crudo contra cocinado, ni al revés.
 */

// Palabras que marcan alimento YA COCINADO. Superconjunto de la lista de
// scripts/bedca-nutrition.mjs (que solo la usa para desempatar): aquí se añaden
// las formas que aparecen de verdad en BEDCA y en el catálogo ("precocinada",
// "plancha", "horno", "tostado", "escalfado"…).
export const COOKED_STATE_WORDS = new Set([
  "cocido", "cocida", "cocidos", "cocidas",
  "cocinado", "cocinada", "cocinados", "cocinadas",
  "precocinado", "precocinada", "precocinados", "precocinadas",
  "hervido", "hervida", "hervidos", "hervidas",
  "frito", "frita", "fritos", "fritas",
  "asado", "asada", "asados", "asadas",
  "guisado", "guisada", "guisados", "guisadas",
  "estofado", "estofada", "estofados", "estofadas",
  "salteado", "salteada", "salteados", "salteadas",
  "rehogado", "rehogada", "braseado", "braseada",
  "escalfado", "escalfada", "confitado", "confitada",
  "tostado", "tostada", "tostados", "tostadas",
  "horneado", "horneada", "gratinado", "gratinada",
  "plancha", "parrilla", "horno", "vapor",
]);

// Palabras que marcan alimento CRUDO / tal cual se compra.
export const RAW_STATE_WORDS = new Set([
  "crudo", "cruda", "crudos", "crudas", "fresco", "fresca", "frescos", "frescas",
]);

// Formas de plato preparado o de producto compuesto. Si el candidato trae una
// de estas y el ingrediente del catálogo NO, es otro alimento, por mucho que
// compartan un sustantivo: "Carne de zamburiña" → "Empanada de carne" (score
// 0,5) es el ejemplo real que salió del informe.
export const DISH_FORM_WORDS = new Set([
  "empanada", "empanadilla", "pizza", "croqueta", "croquetas", "lasana",
  "canelon", "canelones", "tarta", "pastel", "sopa", "crema", "pure",
  "ensalada", "ensaladilla", "bocadillo", "sandwich", "hamburguesa",
  "albondiga", "albondigas", "tortilla", "flan", "helado", "batido",
  "nectar", "refresco", "zumo", "bebida", "licor", "mayonesa", "salsa",
  "guiso", "potaje", "paella", "relleno",
  "rellena", "rellenos", "rellenas", "pate", "conserva", "almibar",
  "enlatada", "enlatado", "envasado", "envasada", "galleta", "galletas",
  "bizcocho", "magdalena", "churro", "churros", "snack", "aperitivo",
]);

const STOPWORDS = new Set(["de", "del", "la", "el", "los", "las", "y", "en", "con", "sin", "un", "una", "al"]);

/** Normaliza a minúsculas sin acentos. Misma intención que normalizeName() de src/lib/ingredientCategories.js, pero sin arrastrar el módulo de la app a un script de datos. */
export function norm(s) {
  return String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function words(name) {
  return norm(name)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
}

// Palabras que no aportan identidad de alimento: estado y muletillas de BEDCA.
const QUALIFIER_WORDS = new Set(["generico", "generica", "genericos", "genericas", "promedio", "variedad", "tipo"]);

/** Singulariza a lo bruto — basta para que "Lentejas" y "Lenteja" sean la misma palabra. */
export function stem(w) {
  if (w.length > 4 && w.endsWith("es")) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s")) return w.slice(0, -1);
  return w;
}

/** Palabras que identifican el ALIMENTO: sin estado, sin muletillas y en singular. */
export function coreWords(name) {
  return new Set(
    words(name)
      .filter((w) => !COOKED_STATE_WORDS.has(w) && !RAW_STATE_WORDS.has(w) && !QUALIFIER_WORDS.has(w))
      .map(stem),
  );
}

/**
 * @param {string} name
 * @returns {"crudo"|"cocinado"|"neutro"}
 */
export function cookState(name) {
  const ws = words(name);
  if (ws.some((w) => COOKED_STATE_WORDS.has(w))) return "cocinado";
  if (ws.some((w) => RAW_STATE_WORDS.has(w))) return "crudo";
  return "neutro";
}

/**
 * ¿El candidato está en el mismo estado que el ingrediente? Neutro se lleva
 * bien con crudo (la compra dice "Lentejas", BEDCA dice "Lenteja, seca, cruda")
 * y nunca con cocinado.
 */
export function statesCompatible(ingredientName, candidateName) {
  const a = cookState(ingredientName);
  const b = cookState(candidateName);
  if (a === b) return true;
  return (a === "neutro" && b === "crudo") || (a === "crudo" && b === "neutro");
}

/**
 * ¿El candidato es claramente OTRO alimento? Dos señales, las dos vistas en el
 * informe real:
 *   1. forma de plato/producto compuesto que el ingrediente no tiene
 *      ("Empanada de carne" para "Carne de zamburiña").
 *   2. el sustantivo principal de BEDCA (lo que va antes de la primera coma:
 *      BEDCA nombra "Pollo, pechuga, cruda") no comparte NINGUNA palabra con el
 *      nombre del catálogo — el solape venía solo de los modificadores.
 */
export function looksLikeOtherFood(ingredientName, candidateName) {
  const ingWords = new Set(words(ingredientName));
  const candWords = words(candidateName);

  const dish = candWords.find((w) => DISH_FORM_WORDS.has(w) && !ingWords.has(w));
  if (dish) return { other: true, kind: "preparacion", reason: `candidato es una preparación distinta ("${dish}")` };

  // Ojo con el orden de BEDCA: nombra "Cerdo, panceta, cruda" y "Pollo,
  // pechuga, cruda", así que mirar solo el primer sustantivo daría por "otro
  // alimento" matches correctos ("Panceta" → "Cerdo, panceta, cruda"). Lo que
  // sí es señal fiable es que no coincida NINGUNA palabra de identidad.
  const ingCore = coreWords(ingredientName);
  const candCore = coreWords(candidateName);
  if (ingCore.size > 0 && candCore.size > 0 && ![...ingCore].some((w) => candCore.has(w))) {
    return { other: true, kind: "sin_solape", reason: `no comparten ninguna palabra de alimento con el ingrediente (el solape del score venía de un modificador)` };
  }
  return { other: false, kind: null, reason: null };
}
