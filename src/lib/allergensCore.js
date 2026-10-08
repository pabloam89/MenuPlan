import { compileKeywordRegex, normalizeText } from "./recipeText.js";

// Nada de importar aquí el catálogo de ingredientes (ingredients.js). Este
// fichero lo usa también el supervisor del bot solo para pareceAlergia, una
// comprobación de texto barata — cargar los 396 ingredientes y construir sus
// resolutores de alias/raíz ahí metía un retraso real en el arranque del
// módulo. Se midió: tardaba lo bastante como para que el freno de deshacer
// (api/_bot/casa.js) comparara marcas de tiempo de más de 5 s de diferencia y
// confundiera "se ha tardado en cargar" con "alguien ha tocado la casa".
// Por eso recipeIngredientIdsHitFreeAllergy recibe el resolutor por
// parámetro: quien ya lo tiene cargado para otra cosa (filterRecipes.js) se
// lo pasa, y quien no lo necesita no paga ese coste.

/** Reglamento UE — 14 alérgenos declarables */
export const EU_ALLERGENS = {
  gluten: {
    label: "Gluten",
    color: "#a67c00",
  },
  crustaceos: {
    label: "Crustáceos",
    color: "#c03818",
  },
  huevos: {
    label: "Huevos",
    color: "#c8a000",
  },
  pescado: {
    label: "Pescado",
    color: "#2072b8",
  },
  cacahuetes: {
    label: "Cacahuetes",
    color: "#b86a2a",
  },
  soja: {
    label: "Soja",
    color: "#5a8f3a",
  },
  leche: {
    label: "Leche",
    color: "#4a7ab8",
  },
  frutos_cascara: {
    label: "Frutos de cáscara",
    color: "#8a5a28",
  },
  apio: {
    label: "Apio",
    color: "#4cba6e",
  },
  mostaza: {
    label: "Mostaza",
    color: "#d4a017",
  },
  sesamo: {
    label: "Sésamo",
    color: "#9a7b4f",
  },
  sulfitos: {
    label: "Sulfitos",
    color: "#8b4a6b",
  },
  altramuces: {
    label: "Altramuces",
    color: "#6b9a3a",
  },
  moluscos: {
    label: "Moluscos",
    color: "#5a6a8a",
  },
};

const ALLERGEN_ALIASES = {
  gluten: "gluten",
  celiaquia: "gluten",
  celiaca: "gluten",
  celiaco: "gluten",
  crustaceos: "crustaceos",
  crustaceo: "crustaceos",
  marisco: "crustaceos",
  mariscos: "crustaceos",
  huevo: "huevos",
  huevos: "huevos",
  pescado: "pescado",
  cacahuete: "cacahuetes",
  cacahuetes: "cacahuetes",
  soja: "soja",
  lactosa: "leche",
  leche: "leche",
  frutos_secos: "frutos_cascara",
  frutos_de_cascara: "frutos_cascara",
  frutos_cascara: "frutos_cascara",
  apio: "apio",
  mostaza: "mostaza",
  sesamo: "sesamo",
  sésamo: "sesamo",
  sulfito: "sulfitos",
  sulfitos: "sulfitos",
  dioxido_de_azufre: "sulfitos",
  altramuz: "altramuces",
  altramuces: "altramuces",
  molusco: "moluscos",
  moluscos: "moluscos",
};

function slugifyAllergen(raw) {
  return String(raw)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");
}

/** @param {string} raw */
export function normalizeAllergenId(raw) {
  const slug = slugifyAllergen(raw);
  return ALLERGEN_ALIASES[slug] ?? slug;
}

// Ingredient-name safety net for allergens the bundled catalog does NOT encode
// in its `allergens` field (see recipeSchema.js ALLERGENS: only 8 of the 14 UE
// allergens are representable). Without this, marking e.g. "Soja" or
// "Cacahuetes" would exclude ZERO recipes — a false sense of safety. Keys are
// normalized allergen ids (see normalizeAllergenId). Over-exclusion is the safe
// direction for an allergen, so lists favor coverage over precision.
export const INGREDIENT_ALLERGEN_KEYWORDS = {
  cacahuetes: ["cacahuete", "cacahuate"],
  soja: ["soja", "tofu", "edamame", "tempeh", "tamari", "miso"],
  apio: ["apio"],
  mostaza: ["mostaza"],
  sulfitos: ["sulfito", "vino", "vinagre"],
  altramuces: ["altramuz", "altramuces", "lupino"],
};

const INGREDIENT_ALLERGEN_RE = Object.fromEntries(
  Object.entries(INGREDIENT_ALLERGEN_KEYWORDS).map(([id, words]) => [id, compileKeywordRegex(words)]),
);

// Alergias libres: cualquier cosa que la persona escriba que NO sea uno de
// los 14 de la UE («Brócoli», «Judías verdes»…) no tiene campo declarado que
// la cubra — `recipe.allergens` solo admite el vocabulario UE — así que el
// nombre del ingrediente es la ÚNICA red posible. Antes esto se saltaba en
// silencio (`if (!re) continue`): una alergia fuera de la lista UE se
// guardaba confirmada y no protegía ningún plato. El id normalizado (p. ej.
// "judias_verdes") se deshace a palabras ("judias verdes") y se compila con
// la misma frontera de palabra que el resto, nunca un substring suelto.
//
// El texto es LIBRE (sin filtro al escribirlo), así que:
//  - se escapa antes de compilarlo: «Kiwi (leve» o «C++» no pueden tumbar la
//    generación del menú, ni un patrón como «(.*a){12}x» colgar el proceso;
//  - se acota (60 caracteres, 6 palabras);
//  - cada palabra se compara por su raíz sin plural, porque la gente escribe
//    «Pimientos» y el catálogo «Pimiento rojo» (y al revés: «Judías verdes» /
//    «Judía verde»). Sobrebloquear es la dirección segura.
const MAX_CARACTERES_ALERGIA_LIBRE = 60;
const MAX_PALABRAS_ALERGIA_LIBRE = 6;

function escaparParaRegex(texto) {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, (c) => `\\${c}`);
}

function raizSinPlural(palabra) {
  if (palabra.length <= 3) return palabra;
  if (palabra.length > 4 && palabra.endsWith("es")) return palabra.slice(0, -2);
  if (palabra.endsWith("s")) return palabra.slice(0, -1);
  return palabra;
}

/**
 * El texto libre de una alergia como lista de ALTERNATIVAS, cada una una lista
 * de palabras: «Fresas, kiwi» son dos («fresas» y «kiwi»), «Tomate (crudo)» es
 * una sola («tomate»; lo de entre paréntesis es una nota, no el ingrediente) y
 * la puntuación pegada («Tomates.») no se queda en la palabra. Sirve igual al
 * id normalizado (con «_») que al texto original. Tokens de una letra fuera:
 * no son un alimento y bloquearían todo lo que empiece por ella.
 * @param {string} texto
 * @returns {string[][]}
 */
function alternativasDeAlergiaLibre(texto) {
  return normalizeText(String(texto ?? "").slice(0, MAX_CARACTERES_ALERGIA_LIBRE).replace(/_/g, " "))
    .replace(/\([^)]*\)?/g, " ")
    .split(/[,;/+]|\s(?:y|o|e)\s/)
    .map((alt) => alt.split(/[^\p{L}\p{N}]+/u).filter((p) => p.length >= 2).slice(0, MAX_PALABRAS_ALERGIA_LIBRE))
    .filter((palabras) => palabras.length > 0);
}

// Tope de lo que se recuerda: son pocas alergias por casa, pero el texto es
// libre y el servidor vive mucho.
const MAX_ENTRADAS_CACHE = 500;
const regexDeAlergiaLibre = new Map();
function regexParaAlergiaLibre(id) {
  if (regexDeAlergiaLibre.has(id)) return regexDeAlergiaLibre.get(id);
  const alternativas = alternativasDeAlergiaLibre(id).map((palabras) =>
    // «\w*\s+» entre palabras deja que una lleve plural («judias verdes»
    // encuentra «judia verde») sin saltar de una palabra a otra a ciegas.
    palabras.map((p) => escaparParaRegex(raizSinPlural(p))).join("\\w*\\s+"),
  );
  const re = alternativas.length ? new RegExp(`\\b(?:${alternativas.join("|")})`) : null;
  if (regexDeAlergiaLibre.size >= MAX_ENTRADAS_CACHE) regexDeAlergiaLibre.clear();
  regexDeAlergiaLibre.set(id, re);
  return re;
}

/**
 * Safety net: does any of a recipe's ingredient names reveal a blocked allergen
 * that the catalog's `allergens` field cannot encode? Checks the allergens en
 * INGREDIENT_ALLERGEN_KEYWORDS (de los 14 UE sin campo declarado) y, para
 * cualquier id que no sea de los 14 UE, una alergia libre por nombre.
 *
 * @param {string[]} ingredientNames
 * @param {Set<string>|Iterable<string>} blockedAllergenIds - normalized ids
 * @returns {boolean}
 */
export function recipeIngredientsHitAllergens(ingredientNames, blockedAllergenIds) {
  const names = (ingredientNames ?? []).map(normalizeText);
  for (const id of blockedAllergenIds) {
    const re = INGREDIENT_ALLERGEN_RE[id] ?? (EU_ALLERGENS[id] ? null : regexParaAlergiaLibre(id));
    if (!re) continue;
    if (names.some((name) => re.test(name))) return true;
  }
  return false;
}

/**
 * Nivel 2 de la red de alergias libres: en vez de buscar la palabra suelta,
 * resuelve el texto de la alergia al mismo ingrediente canónico que ya usan
 * las recetas (alias, raíz singularizada, calificativo recortado — ver
 * ingredientResolver.js) y comprueba por id. Es exacto donde el nivel 1 solo
 * aproxima: "Brócolis al vapor" como alergia encuentra el ingrediente
 * "brocoli" igual que lo encontraría esa misma frase en una receta, sin
 * depender de que el nombre de la receta use la palabra literal.
 *
 * Solo entra en juego para alergias que NO sean ya de los 14 UE ni de
 * INGREDIENT_ALLERGEN_KEYWORDS: esas se cubren arriba y no hay que
 * resolverlas dos veces. Si el texto no resuelve a ningún ingrediente real,
 * no dice nada — el nivel 1 sigue siendo la red para ese caso.
 *
 * @param {string[]} allergiesRaw - el texto ORIGINAL de cada alergia (no el id normalizado: el resolutor necesita la frase)
 * @param {Array<{ingredientId?: string}>} recipeIngredients
 * @param {(texto: string) => string|null} resolveIngredientIdFn - el resolutor del catálogo (ver comentario de arriba: lo pasa quien ya lo tenga cargado)
 * @returns {boolean}
 */
export function recipeIngredientIdsHitFreeAllergy(allergiesRaw, recipeIngredients, resolveIngredientIdFn) {
  // Sin resolutor no hay red: que se note (error de programación) en vez de
  // dejar pasar en silencio una alergia declarada.
  if (typeof resolveIngredientIdFn !== "function") {
    throw new TypeError("recipeIngredientIdsHitFreeAllergy necesita el resolutor de ingredientes");
  }
  const ids = new Set((recipeIngredients ?? []).map((i) => i.ingredientId).filter(Boolean));
  if (ids.size === 0) return false;
  for (const raw of allergiesRaw ?? []) {
    const normalizado = normalizeAllergenId(raw);
    if (EU_ALLERGENS[normalizado] || INGREDIENT_ALLERGEN_KEYWORDS[normalizado]) continue;
    if (idsDeAlergiaLibre(raw, resolveIngredientIdFn).some((id) => ids.has(id))) return true;
  }
  return false;
}

// Resolver una alergia cuesta (el resolutor prueba alias, raíz y recortes), y
// se llama una vez por receta y por alergia en cada filterRecipes: se resuelve
// una sola vez y se recuerda. Acotado como el resto: el texto se recorta y la
// lista de alternativas también (ver alternativasDeAlergiaLibre).
const idsResueltosPorResolutor = new WeakMap();
function idsDeAlergiaLibre(raw, resolveIngredientIdFn) {
  let recuerdo = idsResueltosPorResolutor.get(resolveIngredientIdFn);
  if (!recuerdo) {
    recuerdo = new Map();
    idsResueltosPorResolutor.set(resolveIngredientIdFn, recuerdo);
  }
  const clave = String(raw);
  if (recuerdo.has(clave)) return recuerdo.get(clave);
  const resueltos = alternativasDeAlergiaLibre(raw)
    .map((palabras) => resolveIngredientIdFn(palabras.join(" ")))
    .filter(Boolean);
  if (recuerdo.size >= MAX_ENTRADAS_CACHE) recuerdo.clear();
  recuerdo.set(clave, resueltos);
  return resueltos;
}

/**
 * `tabla`: de dónde salen los datos de cada alérgeno. Por defecto esta, sin
 * iconos (el bot); la UI pasa la suya con `Icon` (allergens.js). Sin el
 * parámetro, la de allergens.js reexportaba esta tal cual y devolvía alérgenos
 * sin icono: la ficha de cualquier plato con alérgenos pintaba `<undefined>`
 * y se caía (React #130, del 3 al 7 oct 2026).
 * @param {string[] | undefined} allergens
 */
export function resolveRecipeAllergens(allergens, tabla = EU_ALLERGENS) {
  const seen = new Set();
  const items = [];
  for (const raw of allergens ?? []) {
    const id = normalizeAllergenId(raw);
    const meta = tabla[id];
    if (!meta || seen.has(id)) continue;
    seen.add(id);
    items.push({ id, ...meta });
  }
  return items;
}

/** @param {string[] | undefined} allergens */
export function formatAllergenLabels(allergens) {
  return resolveRecipeAllergens(allergens)
    .map((a) => a.label)
    .join(", ");
}
