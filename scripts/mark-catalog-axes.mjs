/**
 * mark-catalog-axes.mjs
 *
 * Marca cinco ejes en src/data/recipes/*.json: `montaje`, `occasion`,
 * `kidFavourite`, `tecnica` y `cocina`.
 *
 * ── Por qué listas de ids y no reglas ─────────────────────────────────────
 * `mainIngredients` se DERIVA (ver derive-main-ingredients.mjs) porque la
 * respuesta está en los datos: la cantidad de calabacín por ración. Estos cuatro
 * no. "¿Esto se monta o se cocina?", "¿esto se hace un martes?", "¿esto se lo
 * come un niño?" son juicios, y el esquema lo dice explícitamente en cada uno.
 * Así que lo que hay aquí abajo son DECISIONES escritas a mano; el script solo
 * las teclea sin equivocarse. Los candidatos salieron de buscar por familia de
 * nombre y por ausencia de verbos de cocinado en los pasos, pero la lista final
 * está revisada una a una.
 *
 * Uso:
 *   node scripts/mark-catalog-axes.mjs           (informe)
 *   node scripts/mark-catalog-axes.mjs --write   (aplica)
 */

import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RECIPES_DIR = join(__dirname, "..", "src", "data", "recipes");
const FILES = [
  "legumbres", "carnes", "pescados", "huevos", "pasta_arroces", "sopas_cremas",
  "ensaladas_verduras", "platos_unicos", "cenas_rapidas", "bebes",
  "desayunos", "meriendas", "postres",
];

const norm = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");

// ── montaje ───────────────────────────────────────────────────────────────
// "Se MONTA con cosas ya listas": tostas, bocadillos, wraps, tablas, gazpachos
// y la ensalada de asamblaje.
//
// Y OJO: montaje no es lo mismo que "no pasa por el fuego". Eso lo dice
// `tecnica: "crudo"`, que es otro eje. La diferencia importa porque `montaje`
// abre una puerta: recipeMatchesPreferType() acepta como CENA RÁPIDA cualquier
// plato de montaje SALTÁNDOSE el filtro de dificultad y de tiempo (ver
// utils/filterRecipes.js). Eso vale para una tosta de tomate; no vale para un
// tartar de solomillo al cuchillo ni para un ceviche con su leche de tigre,
// que no llevan fuego pero son técnica, cuchillo y punto — de hecho los siete
// están catalogados como dificultad "normal", no "fácil".
//
// Así que los tartares, ceviches, carpaccios y tatakis se quedan FUERA de este
// eje y dentro de `tecnica: "crudo"`, que es lo que de verdad son.
//
// Fuera quedan también dos que el nombre sugería y el plato desmiente: el
// "pincho moruno" (brocheta a la brasa, no pincho de barra) y la "tostada
// francesa" (una torrija).
const MONTAJE = [
  "legumbres_012", "legumbres_060",
  "carnes_119", "carnes_122",
  "pescados_027",
  "sopas_cremas_015", "sopas_cremas_034", "sopas_cremas_036", "sopas_cremas_056", "sopas_cremas_079",
  "ensaladas_verduras_001", "ensaladas_verduras_021", "ensaladas_verduras_026",
  "ensaladas_verduras_027", "ensaladas_verduras_028", "ensaladas_verduras_029",
  "ensaladas_verduras_030", "ensaladas_verduras_039", "ensaladas_verduras_042",
  "ensaladas_verduras_045", "ensaladas_verduras_047", "ensaladas_verduras_055",
  "ensaladas_verduras_062", "ensaladas_verduras_063", "ensaladas_verduras_068",
  "ensaladas_verduras_069", "ensaladas_verduras_073", "ensaladas_verduras_074",
  "ensaladas_verduras_076", "ensaladas_verduras_080", "ensaladas_verduras_085",
  "ensaladas_verduras_122",
  "platos_unicos_009", "platos_unicos_016",
  "desayunos_020", "meriendas_003", "meriendas_004",
  "ensaladas_verduras_124", "ensaladas_verduras_125",
];

// Los que YA estaban marcados y no debieron estarlo. No basta con sacarlos de
// la lista de arriba: el script solo añade -para no pisar los 58 que venían
// curados de antes- así que retirarlos hay que decirlo.
const NO_MONTAJE = [
  "carnes_046", "carnes_070",                                   // steak tartare, tartar al cuchillo
  "pescados_038", "pescados_051", "pescados_079",               // tartares de atún y salmón
  "pescados_039", "pescados_080",                               // ceviches
];


// ── tecnica ───────────────────────────────────────────────────────────────
// La técnica DOMINANTE del plato: la que decide cómo se cocina, no las que se
// mencionan.
//
// Contar menciones en los pasos no sirve: "sartén" aparece en el 73% del
// catálogo y "olla" en el 55%, porque casi todo empieza sofriendo cebolla. Un
// filtro que acepta a tres de cada cuatro no filtra nada — la misma trampa del
// ajo en mainIngredients.
//
// Lo que sí funciona es una PRIORIDAD: gana lo que define el plato sobre lo
// que solo aparece. Primero el nombre (que es donde la gente pone la técnica:
// "a la plancha", "al horno"), después el electrodoméstico declarado, y solo
// al final los pasos. `sarten` es el resto por descarte y nunca el primer
// candidato, que es exactamente su papel: lo que se hace en una sartén sin más.
//
// Da un reparto que discrimina: olla 36%, sartén 23%, horno 18%, crudo 13%,
// plancha 10%. Ninguno se come el catálogo.
const CUCHARA_RE = /\b(guiso|estofad|potaje|cocido|caldo|fabada|marmitako|puchero|olla|sopa|crema|pisto|alubiada)/;
const HORNO_RE = /\b(al horno|asad[oa]|gratinad|empanada|coca|lasan|pastel|tarta|calzone|pizza|papillote|horne)/;
const PLANCHA_RE = /\b(a la plancha|plancha|parrilla|a la brasa|brasead|grill|entrecot|chuleton|tataki|brocheta|hamburgues|filete ruso|steak)/;
const CRUDO_RE = /\b(tartar|tartare|ceviche|carpaccio|gazpacho|salmorejo|ajoblanco|sopa fria|crema fria|poke bowl)/;
const FRITO_RE = /\b(frit|rebozad|empanad|bu[nñ]uel|croquet|tempura|nugget|varitas|torrezno|churro)/;

function tecnicaDe(recipe) {
  const name = norm(recipe.name);
  const steps = norm((recipe.steps ?? []).join(" "));
  // El crudo se mira ANTES que la plancha, y por una razón tonta pero real:
  // "Steak tartare" lleva la palabra "steak" y se iba derecho a plancha.
  //
  // El tataki NO entra aquí a propósito: se marca por fuera y se queda crudo
  // por dentro, así que su técnica es la plancha — que es justo lo que hay que
  // saber hacer para que salga.
  if (CRUDO_RE.test(name)) return "crudo";
  if (recipe.montaje === true) return "crudo";
  if (PLANCHA_RE.test(name)) return "plancha";
  if (HORNO_RE.test(name) || recipe.requiredAppliance === "horno") return "horno";
  if (FRITO_RE.test(name)) return "sarten";
  if (CUCHARA_RE.test(name) || recipe.category === "sopas_cremas" || recipe.category === "legumbres") return "olla";
  if (PLANCHA_RE.test(steps)) return "plancha";
  if (HORNO_RE.test(steps)) return "horno";
  if (CUCHARA_RE.test(steps)) return "olla";
  return "sarten";
}

// ── cocina ────────────────────────────────────────────────────────────────
// De dónde es el plato. Ausente = española, que es lo que este catálogo es de
// serie: marcar 580 recetas como "espanola" sería ruido para decir lo obvio.
//
// Sale SOLO del nombre, nunca de los ingredientes. Derivarlo de la despensa es
// una trampa doble que se comprobó y falla: la salsa de soja convertía en
// "asiáticas" a unas costillas BBQ y a un pollo a la naranja, y "tortilla" en
// España es una cosa y en México otra — etiquetaba de mexicanas la tortilla de
// jamón y queso y hasta el marmitako. El nombre del plato sí dice de dónde es.
const COCINA_RE = {
  italiana: /\b(espagueti|macarron|rigatoni|tagliatelle|risotto|lasan|canelones|pizza|calzone|pesto|carbonara|bolo[nñ]esa|caprese|bruschetta|gnocchi|focaccia|ravioli|fettuccine|penne|linguine|tortellini|vongole|amatriciana|puttanesca|cacio e pepe|parmigiana|saltimbocca|pasta)/,
  asiatica: /\b(teriyaki|wok|noodles|udon|ramen|poke|tataki|edamame|hoisin|gochujang|pad thai|gyoza|yakisoba|estilo asiatico|salteado oriental|curry (rojo|verde|tailandes)|katsu|bibimbap|dumpling)/,
  mexicana: /\b(guacamole|quesadilla|nachos|tacos? de|fajitas?|burrito|chipotle|cochinita|pico de gallo|rancheros|chili con carne|enchilada)/,
  mediterranea: /\b(hummus|falafel|tahini|cuscus|tabule|shakshuka|tzatziki|kebab|baba ganoush|halloumi|labneh|moussaka|pita)/,
};

// Los platos cuyo nombre no lleva ninguna palabra delatora. Una sopa de
// tortilla o unos frijoles charros son mexicanos sin decirlo, y ensanchar la
// expresión para cazarlos acabaría cazando también la tortilla de patatas.
// Para un eje curado, la lista explícita es más honesta que la regla forzada.
const COCINA_IDS = {
  mexicana: [
    "sopas_cremas_087", "sopas_cremas_088", "legumbres_074",
    "ensaladas_verduras_124", "huevos_090", "carnes_157", "carnes_158",
    "pasta_arroces_100", "pescados_129",
  ],
  asiatica: [
    "sopas_cremas_089", "legumbres_075", "ensaladas_verduras_125",
    "carnes_159", "carnes_160", "pasta_arroces_101", "pasta_arroces_102",
  ],
};
const COCINA_POR_ID = new Map(
  Object.entries(COCINA_IDS).flatMap(([cocina, ids]) => ids.map((id) => [id, cocina])),
);

function cocinaDe(recipe) {
  const explicita = COCINA_POR_ID.get(recipe.id);
  if (explicita) return explicita;
  const name = norm(recipe.name);
  for (const [cocina, re] of Object.entries(COCINA_RE)) {
    if (re.test(name)) return cocina;
  }
  return null;
}

// ── occasion: "especial" ──────────────────────────────────────────────────
// Pieza de CELEBRACIÓN, no "plato que tarda". Una fabada tarda dos horas y se
// come un martes de invierno; un cochinillo no. Por eso quedan fuera fabadas,
// potajes, carrilleras, ossobuco, estofados, empanadas gallegas y lasañas
// —cocina de casa, aunque sea larga— y entran los asados de fiesta, las piezas
// caras y el marisco de ración (marcado en una pasada anterior).
const ESPECIAL = [
  "legumbres_063",
  "carnes_038", "carnes_039", "carnes_040", "carnes_041", "carnes_042", "carnes_043",
  "carnes_044", "carnes_053", "carnes_084", "carnes_098", "carnes_099", "carnes_105",
  "pescados_037", "pescados_045", "pescados_083", "pescados_099", "pescados_109", "pescados_112",
  "pasta_arroces_030", "pasta_arroces_034", "pasta_arroces_036", "pasta_arroces_040", "pasta_arroces_082",
  "huevos_032", "huevos_063",
  "sopas_cremas_023", "sopas_cremas_058",
  "ensaladas_verduras_040", "ensaladas_verduras_117",
];

// ── kidFavourite ──────────────────────────────────────────────────────────
// Lo que un niño PIDE, no lo que puede comer. `kidFriendly` ya cubre lo
// segundo y por eso está al 88% del catálogo: como filtro no distingue nada.
//
// Son los míticos —filetes empanados con patatas, macarrones con tomate,
// tortilla, salchichas— MÁS lo sano que entra con esa misma forma: las cremas
// dulces de calabaza o zanahoria, las lentejas con salchichas, la merluza
// rebozada, el pollo empanado con su ensalada. Ahí está la gracia del eje:
// sirve para colar verdura, no solo para rendirse.
const KID_SHAPES = /\b(empanad[oa]|rebozad|escalope|san jacobo|nugget|croqueta|albondiga|hamburguesa|salchicha|varitas|milanesa|filete ruso|macarrones|espaguetis|bolo[nñ]esa|lasa[nñ]a|canelones|arroz con tomate|arroz blanco|tortilla|huevos fritos|crema de|pure de|pizza|pollo al horno|pollo asado|pechuga|merluza|lenguado|filetes)/;

// Lo que un niño rechaza aunque el plato tenga la forma correcta: quesos
// fuertes, especias, y las verduras que solo funcionan en crema (aquí van
// enteras o asadas).
const KID_NOPE = /\b(cabra|brie|roquefort|azul|curado|gorgonzola|jengibre|especiad|curry|picante|guindilla|mostaza|coliflor|esparrago|pimientos asados|alcaparra|anchoa|nueces|almendra|pistacho|salvia|cacio e pepe|tres quesos|gourmet|teriyaki|ajada|romero)/;


function isKidFavourite(recipe) {
  if (!recipe.estrella || !recipe.kidFriendly) return false;
  if (recipe.difficulty !== "facil") return false;
  const name = norm(recipe.name);
  return KID_SHAPES.test(name) && !KID_NOPE.test(name);
}

const write = process.argv.includes("--write");
const montajeSet = new Set(MONTAJE);
const noMontajeSet = new Set(NO_MONTAJE);
const especialSet = new Set(ESPECIAL);
const counts = { montaje: 0, especial: 0, kid: 0 };
const tecnicas = {};
const cocinas = {};
const kidNames = [];

for (const file of FILES) {
  const path = join(RECIPES_DIR, `${file}.json`);
  const recipes = JSON.parse(readFileSync(path, "utf8"));
  for (const recipe of recipes) {
    if (montajeSet.has(recipe.id)) recipe.montaje = true;
    if (noMontajeSet.has(recipe.id)) delete recipe.montaje;
    if (especialSet.has(recipe.id)) recipe.occasion = "especial";

    if (isKidFavourite(recipe)) {
      recipe.kidFavourite = true;
      kidNames.push(`  ${recipe.id.padEnd(22)}${recipe.name.slice(0, 54)}`);
    }
    if (recipe.montaje === true) counts.montaje++;
    if (recipe.occasion === "especial") counts.especial++;
    if (recipe.kidFavourite === true) counts.kid++;
    // El booleano `plancha` de la pasada anterior se subsume en `tecnica`:
    // dos campos para el mismo concepto se contradicen a la primera.
    delete recipe.plancha;
    recipe.tecnica = tecnicaDe(recipe);
    tecnicas[recipe.tecnica] = (tecnicas[recipe.tecnica] ?? 0) + 1;
    const cocina = cocinaDe(recipe);
    if (cocina) { recipe.cocina = cocina; cocinas[cocina] = (cocinas[cocina] ?? 0) + 1; }
    else delete recipe.cocina;
  }
  if (write) writeFileSync(path, JSON.stringify(recipes, null, 2) + "\n", "utf8");
}

console.log(`montaje:       ${counts.montaje}`);
console.log(`occasion=esp:  ${counts.especial}`);
console.log(`kidFavourite:  ${counts.kid}`);
console.log(`tecnica:       ${JSON.stringify(tecnicas)}`);
console.log(`cocina:        ${JSON.stringify(cocinas)} (el resto, española)`);
console.log("\nkidFavourite:");
console.log(kidNames.join("\n"));
console.log(write ? "\n✅ Escrito." : "\n(informe: nada escrito — pasa --write para aplicar)");
