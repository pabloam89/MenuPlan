// Heuristic health flags derived from a recipe's name + ingredients (+ macros).
//
// Re-tagging all 244 catalog recipes by hand is not worth it, so flags are
// derived at catalog-load time (see data/recipeCatalog.js) and merged with any
// explicitly declared `healthFlags`. They feed the LLM's "menú más cuidado"
// bias (see aiPlanner.js SYSTEM_PROMPT + decisionCatalog includeHealth).
//
// These are coarse signals, not medical claims: a missing flag is not a promise.

import { recipeHaystack } from "./recipeText.js";

export const HEALTH_FLAGS = [
  "frito",
  "embutido",
  "alto_sodio",
  "picante",
  "acido",
  "azucar_anadido",
  "rico_hierro",
];

const PATTERNS = {
  frito: /\b(frito|frita|rebozad|empanad|bunuelo|croqueta|tempura|fritura|churro|a la romana|a la andaluza|san ?jacobo|escalope|flamenqu|milanesa|varita|nugget|bravas|padron|palitos de merluza|palitos de pescado|huevos rotos)/,
  embutido: /\b(chorizo|salchichon|salchicha|bacon|panceta|fuet|salami|mortadela|jamon|sobrasada|butifarra|morcilla|cecina|lomo embuchado)/,
  picante: /\b(picante|guindilla|chili|jalapeno|cayena|tabasco|sriracha|pimenton picante|salsa brava|harissa)/,
  acido: /\b(vinagre|escabeche|encurtido|limon|lima|salsa de tomate|tomate frito|citric)/,
  azucar_anadido: /\b(azucar|miel|chocolate|nocilla|nutella|caramelo|sirope|jarabe|mermelada|leche condensada|galleta|bizcocho|reposteria|flan|natilla|helado|dulce de leche)/,
};

/**
 * VRN de hierro: 14 mg. Reglamento (UE) 1169/2011, Anexo XIII, parte A
 * («Ingestas de referencia de vitaminas y minerales» para adultos).
 *
 * NO es una necesidad individual: es el valor único de etiquetado, sin sexo ni
 * edad. Una mujer en edad fértil necesita más y un hombre menos. Para un «%
 * de tu hierro» por persona hace falta otra tabla (EFSA publica PRI por edad,
 * sexo y estado); esta solo sirve para decir si un plato destaca.
 */
export const VRN_HIERRO_MG = 14;

/**
 * 30 % del VRN: el corte de «alto contenido en» del Reglamento (CE) 1924/2006,
 * Anexo, que es el doble del 15 % de «fuente de». Se guarda como producto y no
 * como literal para que el número no pueda separarse de su procedencia.
 */
export const UMBRAL_RICO_HIERRO_MG = VRN_HIERRO_MG * 0.3;

// alto_sodio and rico_hierro have extra (non-name) signals, handled separately.
const HIGH_SODIUM_RE = /\b(cubito|pastilla de caldo|caldo concentrado|salsa de soja|anchoa|aceituna|encurtido|conserva|bacalao salado|queso curado|feta|beicon|panceta)/;
const IRON_RE = /\b(lenteja|garbanzo|alubia|judia blanca|higado|morcilla|espinaca|acelga|berberecho|almeja|mejillon|ternera|solomillo|carne roja|remolacha)/;

/**
 * Derive coarse health flags for a raw catalog recipe.
 * @param {Object} recipe - catalog shape (name, ingredients, mainProtein, category, macros)
 * @returns {string[]}
 */
export function deriveHealthFlags(recipe) {
  const hay = recipeHaystack(recipe);
  const flags = new Set(Array.isArray(recipe?.healthFlags) ? recipe.healthFlags : []);

  for (const [flag, re] of Object.entries(PATTERNS)) {
    if (re.test(hay)) flags.add(flag);
  }

  // Sodium: cured meats already imply it, plus salty pantry staples.
  if (flags.has("embutido") || HIGH_SODIUM_RE.test(hay)) flags.add("alto_sodio");

  // Iron: red meat / legumes / leafy greens / iron-rich shellfish.
  //
  // El HIERRO MEDIDO se suma a la lista de palabras, no la sustituye, y eso es
  // deliberado: el hierro solo llega a 166 de los 371 ingredientes con ficha
  // —CIQUAL y USDA lo publican, y las 198 fichas de BEDCA no lo traen—, así que
  // sustituir la heurística por el dato DEJARÍA DE MARCAR platos que hoy sí se
  // marcan. Sumándolo, la bandera solo puede mejorar: nunca se quita una que ya
  // estaba, y aparece en platos con hierro de verdad que ninguna de las quince
  // palabras nombra. Cuando el hierro esté en toda la tabla, esta función podrá
  // invertirse y la lista pasará a ser el respaldo.
  //
  // EL UMBRAL SALE DEL VRN, y antes decía salir de otro sitio.
  //
  // Aquí ponía «3,5 mg, el 25 % del VRN (14 mg), que es el corte del
  // Reglamento UE 1169/2011 para decir "alto contenido en"». El VRN es
  // correcto —Anexo XIII del 1169/2011, hierro 14 mg— pero el 25 % no existe:
  // los cortes del Reglamento 1924/2006 son el 15 % para «fuente de» y el
  // doble, 30 %, para «alto contenido en». 3,5 mg no era ninguno de los dos.
  // El número invocaba una norma que no lo sostenía, y es el único número de
  // referencia del repo.
  //
  // Se sube al corte que el comentario ya decía estar usando: 30 % del VRN.
  // Y la traslación se declara en vez de esconderse: el Reglamento mide POR
  // 100 g de producto envasado, no por ración de un plato cocinado. Esto toma
  // prestado su listón, no aplica la norma — una receta no es una etiqueta.
  const hierroPorRacion = recipe?.macros?.iron_mg ?? recipe?.iron_mg ?? null;
  if (
    IRON_RE.test(hay) ||
    recipe?.mainProtein === "ternera" ||
    recipe?.category === "legumbres" ||
    (hierroPorRacion != null && hierroPorRacion >= UMBRAL_RICO_HIERRO_MG)
  ) {
    flags.add("rico_hierro");
  }

  return Array.from(flags);
}

/**
 * Defensive helper for any place that registers/joins a recipe at runtime
 * (user-created recipes, AI-generated recipes, remote merges): returns the
 * recipe unchanged if it already carries healthFlags, otherwise derives them.
 * Keeps every registration point honest without recomputing on recipes that
 * already went through the catalog pipeline.
 * @param {Object} recipe
 * @returns {Object}
 */
export function ensureHealthFlags(recipe) {
  return Array.isArray(recipe?.healthFlags) ? recipe : { ...recipe, healthFlags: deriveHealthFlags(recipe) };
}
