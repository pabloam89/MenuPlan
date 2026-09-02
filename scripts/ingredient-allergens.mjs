/**
 * Tabla ingrediente → alérgeno, en dos niveles.
 *
 * Fuente única compartida por los dos scripts que la necesitan:
 *   - build-ingredient-catalog.mjs (genera el catálogo canónico y el informe)
 *   - apply-allergen-findings.mjs  (escribe los hallazgos en el catálogo)
 *
 * Vivía dentro del primero; se extrajo aquí al aparecer el segundo, para que
 * no haya dos copias del vocabulario que puedan divergir.
 */

import { normalizeName } from "../src/lib/ingredientCategories.js";

// ─────────────────────────────────────────────────────────────────────────
// Tabla de alérgenos POR INGREDIENTE (lo único nuevo de este script).
//
// Vocabulario de salida: los ids canónicos de EU_ALLERGENS (allergens.js), no
// el vocabulario histórico del schema ("marisco"/"lactosa"/"huevo"/
// "frutos_secos"). normalizeAllergenId() ya traduce el histórico a éste, así
// que la comparación declarado-vs-computado se hace en un único espacio.
//
// Orden: específico → general. Un ingrediente puede disparar varios alérgenos.
//
// Criterio: sobre-incluir es la dirección segura para un alérgeno (mismo
// criterio ya documentado en allergens.js e intolerances.js). Si dudas, marca.
// ─────────────────────────────────────────────────────────────────────────
export const INGREDIENT_ALLERGEN_RULES = [
  // — gluten —
  [/\btrigo\b|semola|espelta|kamut|cebada|centeno|bulgur|cuscus|seitan/, "gluten"],
  [/\bharina\b/, "gluten"],
  // "tostada" a secas NO va aquí: casaba dentro de "Almendra tostada" y
  // "Avellana tostada" y les colgaba un gluten inexistente. Como pan solo
  // aparece en el catálogo como "Pan tostado", basta con exigir el contexto.
  [/\bpan\b|pan de |pan tostado|pan rallado|panko|picatoste|colin|\bpicos\b|biscote|chapata|baguette|hogaza|payes|molde|pita|brioche|croissant|mollete|bagel|naan|muffin/, "gluten"],
  // Formas de pasta italiana: cada una es un nombre propio distinto y ninguna
  // contiene la palabra "pasta", así que hay que enumerarlas.
  [/pasta|espagueti|macarron|fideo|tallarin|tagliatelle|fettuccine|linguine|pappardelle|penne|rigatoni|bucatini|farfalle|conchiglie|casarecce|orecchiette|trofie|\borzo\b|fusilli|tirabuzon|lacito|espiral|helice|canelon|lasan|raviol|tortellini|noqui|gnocchi/, "gluten"],
  [/\bcereales\b|\bfalafel\b/, "gluten"],
  [/rebozad|empanad|hojaldre|masa quebrada|masa de |obleas?|tortilla de trigo|wrap|pizza|tempura|croqueta|bechamel|besamel|\broux\b/, "gluten"],
  [/galleta|bizcocho|magdalena|sobao|tortita|crepe|gofre|cereales de desayuno|muesli|granola/, "gluten"],
  // La avena es sin gluten por naturaleza pero se contamina en molino; la UE
  // exige declararla salvo certificación. Se marca — dirección segura.
  [/\bavena\b/, "gluten"],
  [/cerveza/, "gluten"],
  [/salsa de soja/, "gluten"],

  // — crustáceos —
  [/gamba|gambon|langostino|carabinero|cigala|langosta|bogavante|necora|centoll|cangrejo|buey de mar|camaron|quisquilla|percebe|\bkrill\b|txangurro|changurro/, "crustaceos"],
  // "marisco" a secas cubre el caso genérico ("Caldo de pollo y marisco",
  // "Sopa de marisco"): en español marisco son crustáceos y moluscos, y el
  // alérgeno declarable más probable de los dos es el crustáceo.
  [/\bmariscos?\b|velout. de marisco|bisque/, "crustaceos"],

  // — moluscos —
  [/mejillon|almeja|chirla|coquina|berberecho|navaja|ostra|vieira|zamburi|caracol/, "moluscos"],
  [/pulpo|calamar|chipiron|chopito|sepia|jibia|\bpota\b|cefalopodo|molusco/, "moluscos"],

  // — huevos —
  [/\bhuevos?\b|clara de huevo|yema de huevo|\byemas?\b|\bclaras?\b/, "huevos"],
  [/mayonesa|alioli|allioli|salsa holandesa|salsa cesar|merengue|pasta fresca|pasta al huevo|surimi/, "huevos"],
  // Pasta al huevo por tradición: las cintas (tagliatelle/pappardelle/
  // fettuccine/tallarines), la pasta rellena y las placas de lasaña.
  [/tagliatelle|pappardelle|fettuccine|tallarin|tortellini|raviol|(placas|laminas) de lasan/, "huevos"],

  // — pescado —
  [/merluza|pescadilla|bacalao|abadejo|atun|bonito|ventresca|mojama|salmon|trucha|sardina|boqueron|anchoa|caballa|jurel|salmonete|dorada|besugo|lubina|corvina|rodaballo|lenguado|\bgallo\b|panga|perca|tilapia|\bmero\b|congrio|\braya\b|halibut|palometa|rape|cazon|emperador|pez espada|\brosada\b|anguila|\bpescado\b|marisco|cabracho/, "pescado"],
  // Perrins = nombre comercial de la Worcestershire en España; ambas llevan
  // anchoa. La César también, además del huevo de su emulsión.
  [/caldo de pescado|fumet|salsa worcester|worcestershire|\bperrins\b|salsa cesar|colatura|garum|surimi|palito de cangrejo/, "pescado"],

  // — cacahuetes —
  [/cacahuete|cacahuate/, "cacahuetes"],

  // — soja —
  [/\bsoja\b|\btofu\b|edamame|tempeh|tamari|\bmiso\b/, "soja"],

  // — leche —
  [/\bleche\b|\bnata\b|mantequilla|\bqueso\b|quesito|yogur|requeson|cuajada|kefir|mozzarella|burrata|ricotta|mascarpone|parmesano|grana padano|pecorino|manchego|cheddar|gouda|\bedam\b|emmental|gruyere|comte|havarti|halloumi|scamorza|provolone|fontina|taleggio|raclette|roquefort|gorgonzola|cabrales|stilton|valdeon|idiazabal|torta del casar|tetilla|mahon|arzua|roncal|zamorano|feta|camembert|\bbrie\b|philadelphia|cottage/, "leche"],
  [/bechamel|besamel|\bhelado\b|batido de leche|crema de leche|suero de leche|\bghee\b|creme fraiche/, "leche"],
  // El pesto genovés lleva parmesano y piñones, y en el catálogo aparece como
  // ingrediente cerrado ("Pesto", "Pesto de albahaca") sin desglosar.
  [/\bpesto\b/, "leche"],
  // El hojaldre es masa de mantequilla; el paté suele llevar nata o leche.
  [/hojaldre|\bpate\b|\bfoie\b/, "leche"],

  // — frutos de cáscara —
  [/almendra|\bnueces?\b|\bnuez\b|avellana|pistacho|anacardo|pecana|macadamia|\bpinones?\b|marcona|turron|mazapan|praline|nutella|crema de cacao|\bpesto\b/, "frutos_cascara"],

  // — apio —
  [/\bapio\b|apionabo|sal de apio/, "apio"],

  // — mostaza —
  [/mostaza|\bdijon\b|salsa cesar/, "mostaza"],

  // — sésamo —
  [/sesamo|tahini|tahina|gomasio|\bhummus\b/, "sesamo"],

  // — sulfitos (nivel duro: producto que se come tal cual) —
  // Encurtidos, conservas y desecados: aquí el E-220 es un aditivo del producto
  // final, no algo que se evapore ni se pueda sustituir por una versión sin.
  [/sulfito|dioxido de azufre/, "sulfitos"],
  [/\bpasas?\b|orejon|fruta desecada|albaricoque seco|\bdatil\b|higo seco/, "sulfitos"],
  [/patatas? prefritas?|patata congelada/, "sulfitos"],
  [/aceituna|pepinillo|alcaparra|corazones de alcachofa|alcachofa (confitada|en conserva)|tinta de calamar|gazpacho/, "sulfitos"],

  // — altramuces —
  [/altramuz|altramuces|\blupino\b/, "altramuces"],
];

// ─────────────────────────────────────────────────────────────────────────
// Alérgenos DE COCINADO — segundo nivel, no declarable duro.
//
// El vino, el vinagre y los destilados de vino llevan sulfitos de verdad, pero
// entran en el plato como ingrediente de cocinado: un chorrito en un sofrito,
// no algo que se coma tal cual. Marcarlos al mismo nivel que un alérgeno
// declarado vaciaría 88 recetas del catálogo para quien filtre por sulfitos.
//
// Es exactamente el patrón que ya existe para `alcohol_cocina` en
// intolerances.js: no se excluye la receta, se ADAPTA (vino sin alcohol es un
// producto real de súper). Aquí igual — el ingrediente conserva su alérgeno
// real, pero la receta lo lleva en un nivel distinto que la UI puede mostrar
// como "lleva vino, se puede hacer sin" en vez de como exclusión.
//
// Decisión de producto tomada explícitamente, no un descuido: ver el informe
// output/allergen-reconciliation.md, sección "Sulfitos de cocinado".
// ─────────────────────────────────────────────────────────────────────────
export const COOKING_ALLERGEN_RULES = [
  [/\bvino\b|\bcava\b|champan|\bjerez\b|\bsidra\b|\bmosto\b|\bmarsala\b|\bvermut\b/, "sulfitos"],
  [/vinagre/, "sulfitos"],
  [/\bbrandy\b|\bcona?c\b|\blicor\b/, "sulfitos"],
];

// Vetos: cortan un alérgeno que la regla general habría marcado. Se aplican
// DESPUÉS de las reglas (de ambos niveles) y ganan siempre.
//   - "sin gluten"/"sin lactosa" son productos reales del súper.
//   - "harina de maíz/arroz/garbanzo/almendra" y "maicena" no llevan trigo.
//   - "leche de coco/almendra/avena/soja" no son lácteos.
export const ALLERGEN_VETOES = {
  gluten: [
    /sin gluten|libre de gluten/,
    /harina de (maiz|arroz|garbanzo|almendra|coco|trigo sarraceno|castana)/,
    /\bmaicena\b|fecula de maiz|maizena/,
    /pan de maiz|tortilla de maiz/,
  ],
  leche: [
    /sin lactosa|deslactosad|vegana?\b/,
    /leche de (coco|almendra|avena|soja|arroz|anacardo)/,
    /bebida de (soja|avena|almendra|arroz|coco)/,
    /mantequilla de (cacahuete|almendra|anacardo)/,
    /queso vegano|nata de (soja|avena|coco)/,
  ],
  // La nuez moscada NO es un fruto de cáscara: es la semilla de Myristica
  // fragrans y no figura en el Anexo II del Reglamento UE 1169/2011, que
  // enumera exactamente almendras, avellanas, nueces, anacardos, pacanas,
  // nueces de Brasil, pistachos y macadamias. Sin este veto, la palabra "nuez"
  // de su nombre marcaba 33 recetas con un alérgeno inexistente.
  frutos_cascara: [/nuez moscada|\bmacis\b/],
  sulfitos: [/sin alcohol|desalcoholizad/, /vinagre de arroz/],
  huevos: [/sin huevo|mayonesa vegana/],
  // Un caldo de ave o verduras no lleva pescado... salvo que el propio nombre
  // diga que también lleva marisco ("Caldo de pollo y marisco"), y ahí el veto
  // no puede dispararse.
  pescado: [/caldo de (verduras|pollo|carne|ave)(?!.*(marisco|pescado))/],
};

// Ingredientes NO vegetarianos (carne, pescado, gelatina, embutido…).
export const NON_VEGETARIAN_RE =
  /pollo|pavo|gallina|ternera|\bbuey\b|cerdo|cordero|lechal|conejo|pato|codorniz|perdiz|pichon|cochinillo|jabali|venado|ciervo|jamon|chorizo|salchich|panceta|tocino|beicon|bacon|guanciale|morcilla|butifarra|fuet|salchichon|longaniza|chistorra|sobrasada|cecina|lacon|mortadela|chopped|salami|pastrami|fiambre|embutido|carne|solomillo|entrecot|chuleta|chuleton|costilla|carrillera|carrillada|morcillo|jarrete|oss?obuco|magro|secreto|presa|pluma|iberico|albondig|hamburgues|higado|callos|\blomo\b|cinta de lomo|\bpate\b|\bfoie\b|manitas|\bunto\b|huesos? de|gelatina|manteca de cerdo|salsa (worcestershire|perrins)|worcester|caldo de (carne|cocido|pollo|ave|jamon)|merluza|pescadilla|bacalao|atun|bonito|salmon|trucha|sardina|boqueron|anchoa|caballa|dorada|lubina|corvina|cabracho|rape|pescado|marisco|txangurro|gamba|langostino|calamar|chipiron|sepia|pulpo|mejillon|almeja|berberecho|vieira|surimi|cangrejo|cigala|bogavante|ventresca|mojama|emperador|cazon|jurel|salmonete|congrio|rodaballo|lenguado|abadejo|\brosada\b|panga|perca|tilapia|\bmero\b/;

// Productos animales que además excluyen del veganismo (lácteos, huevo, miel).
export const NON_VEGAN_RE =
  /\bhuevos?\b|\byemas?\b|\bclaras?\b|mayonesa|\bleche\b|\bnata\b|mantequilla|\bqueso\b|quesito|yogur|requeson|cuajada|kefir|mozzarella|burrata|ricotta|mascarpone|parmesano|manchego|cheddar|gouda|emmental|gruyere|feta|camembert|\bbrie\b|roquefort|gorgonzola|cabrales|bechamel|besamel|\bmiel\b|\bhelado\b|\bghee\b/;

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

/**
 * Alérgenos (ids EU canónicos) que dispara un nombre de ingrediente, en dos
 * niveles. `cooking` nunca repite lo que ya está en `hard`: si un ingrediente
 * dispara el mismo alérgeno por las dos vías, gana el nivel duro.
 * @returns {{hard: string[], cooking: string[]}}
 */
export function allergensForIngredientName(name) {
  const n = normalizeName(name);
  if (!n) return { hard: [], cooking: [] };

  const veto = (allergen) => (ALLERGEN_VETOES[allergen] ?? []).some((re) => re.test(n));

  const hard = new Set();
  for (const [re, allergen] of INGREDIENT_ALLERGEN_RULES) {
    if (re.test(n)) hard.add(allergen);
  }
  const cooking = new Set();
  for (const [re, allergen] of COOKING_ALLERGEN_RULES) {
    if (re.test(n)) cooking.add(allergen);
  }
  for (const allergen of [...hard]) if (veto(allergen)) hard.delete(allergen);
  for (const allergen of [...cooking]) {
    if (veto(allergen) || hard.has(allergen)) cooking.delete(allergen);
  }
  return { hard: [...hard].sort(), cooking: [...cooking].sort() };
}
