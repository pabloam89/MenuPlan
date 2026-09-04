/**
 * mark-catalog-axes.mjs
 *
 * Marca cuatro ejes de curación en src/data/recipes/*.json: `montaje`,
 * `plancha`, `occasion` y `kidFavourite`.
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

// ── montaje ───────────────────────────────────────────────────────────────
// "Se monta, no se cocina": tostas, bocadillos, wraps, tartares, ceviches,
// gazpachos y sopas frías, y la ensalada de asamblaje. Fuera quedan dos que el
// nombre sugería y el plato desmiente: el "pincho moruno" (que es brocheta a la
// brasa, no pincho de barra) y la "tostada francesa" (que es una torrija).
const MONTAJE = [
  "legumbres_012", "legumbres_060",
  "carnes_046", "carnes_070", "carnes_119", "carnes_122",
  "pescados_027", "pescados_038", "pescados_039", "pescados_051", "pescados_079", "pescados_080",
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
];


// ── plancha ───────────────────────────────────────────────────────────────
// La técnica que faltaba, y la única que faltaba.
//
// Se probó a derivar el eje de técnica ENTERO de los pasos y no sale: sartén
// dispara en el 73% del catálogo y olla en el 55%, porque casi todo sofríe
// cebolla — un filtro que acepta a tres de cada cuatro no filtra nada. Es la
// misma trampa del ajo en mainIngredients.
//
// Mirando técnica por técnica, resulta que las demás YA tienen quien las
// represente: horno es requiredAppliance, frito es un healthFlag derivado,
// guiso es isPlatoCuchara (nombre + categoría) y crudo es montaje. La plancha
// no tenía nada, y en una casa española es de lo que más se dice.
//
// Sale del nombre o de los pasos: 57 la llevan en el título ("Pechugas de
// pollo a la plancha") y el resto solo por dentro (hamburguesas, filetes
// rusos, brochetas, entrecot). Para quien pide "algo a la plancha" son lo
// mismo.
const PLANCHA = [
  "legumbres_022", "carnes_002", "carnes_007", "carnes_009", "carnes_014",
  "carnes_018", "carnes_024", "carnes_027", "carnes_030", "carnes_045", "carnes_047",
  "carnes_054", "carnes_056", "carnes_057", "carnes_058", "carnes_059", "carnes_060",
  "carnes_061", "carnes_062", "carnes_063", "carnes_064", "carnes_074", "carnes_082",
  "carnes_083", "carnes_091", "carnes_092", "carnes_101", "carnes_102", "carnes_104",
  "carnes_106", "carnes_109", "carnes_110", "carnes_115", "carnes_120", "carnes_121",
  "carnes_122", "carnes_125", "carnes_129", "carnes_131", "carnes_132", "carnes_133",
  "carnes_134", "carnes_149", "carnes_150", "carnes_151", "carnes_153", "carnes_156",
  "pescados_004", "pescados_006", "pescados_009", "pescados_020", "pescados_023",
  "pescados_032", "pescados_033", "pescados_037", "pescados_043", "pescados_049",
  "pescados_050", "pescados_054", "pescados_055", "pescados_056", "pescados_057",
  "pescados_061", "pescados_064", "pescados_065", "pescados_069", "pescados_071",
  "pescados_078", "pescados_084", "pescados_088", "pescados_094", "pescados_096",
  "pescados_099", "pescados_101", "pescados_103", "pescados_104", "pescados_106",
  "pescados_110", "pescados_124", "pescados_125", "pescados_128", "huevos_069",
  "pasta_arroces_021", "sopas_cremas_030", "sopas_cremas_061",
  "ensaladas_verduras_008", "ensaladas_verduras_018", "ensaladas_verduras_024",
  "ensaladas_verduras_031", "ensaladas_verduras_032", "ensaladas_verduras_048",
  "ensaladas_verduras_052", "ensaladas_verduras_087", "ensaladas_verduras_095",
  "ensaladas_verduras_096", "ensaladas_verduras_100", "ensaladas_verduras_109",
  "ensaladas_verduras_112", "ensaladas_verduras_116", "ensaladas_verduras_119",
  "ensaladas_verduras_123", "platos_unicos_009", "platos_unicos_014",
  "cenas_rapidas_002", "cenas_rapidas_004", "cenas_rapidas_005", "cenas_rapidas_006",
  "cenas_rapidas_008", "cenas_rapidas_017",
];

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

const norm = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");

function isKidFavourite(recipe) {
  if (!recipe.estrella || !recipe.kidFriendly) return false;
  if (recipe.difficulty !== "facil") return false;
  const name = norm(recipe.name);
  return KID_SHAPES.test(name) && !KID_NOPE.test(name);
}

const write = process.argv.includes("--write");
const montajeSet = new Set(MONTAJE);
const especialSet = new Set(ESPECIAL);
const planchaSet = new Set(PLANCHA);
const counts = { montaje: 0, especial: 0, kid: 0, plancha: 0 };
const kidNames = [];

for (const file of FILES) {
  const path = join(RECIPES_DIR, `${file}.json`);
  const recipes = JSON.parse(readFileSync(path, "utf8"));
  for (const recipe of recipes) {
    if (montajeSet.has(recipe.id)) recipe.montaje = true;
    if (especialSet.has(recipe.id)) recipe.occasion = "especial";
    if (planchaSet.has(recipe.id)) recipe.plancha = true;
    if (isKidFavourite(recipe)) {
      recipe.kidFavourite = true;
      kidNames.push(`  ${recipe.id.padEnd(22)}${recipe.name.slice(0, 54)}`);
    }
    if (recipe.montaje === true) counts.montaje++;
    if (recipe.occasion === "especial") counts.especial++;
    if (recipe.kidFavourite === true) counts.kid++;
    if (recipe.plancha === true) counts.plancha++;
  }
  if (write) writeFileSync(path, JSON.stringify(recipes, null, 2) + "\n", "utf8");
}

console.log(`montaje:       ${counts.montaje}`);
console.log(`occasion=esp:  ${counts.especial}`);
console.log(`kidFavourite:  ${counts.kid}`);
console.log(`plancha:       ${counts.plancha}`);
console.log("\nkidFavourite:");
console.log(kidNames.join("\n"));
console.log(write ? "\n✅ Escrito." : "\n(informe: nada escrito — pasa --write para aplicar)");
