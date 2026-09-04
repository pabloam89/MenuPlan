/**
 * derive-main-ingredients.mjs
 *
 * Rellena `mainIngredients` en src/data/recipes/*.json.
 *
 * ── Por qué se deriva y no se marca a mano ────────────────────────────────
 * `estrella`, `montaje`, `apetecible` y `occasion` se marcan a mano porque son
 * JUICIOS: "¿entra por los ojos?", "¿esto se monta o se cocina?". No hay dato
 * del que salgan. `mainIngredients` no es un juicio: es "¿este plato lleva
 * verdura/lácteo/seta/fruta/frutos secos/encurtido como PARTE, no como
 * condimento?", y eso está literalmente en su lista de ingredientes, que está
 * rellena al 100% y estructurada (nombre + cantidad + unidad).
 *
 * ── El único criterio que importa: cantidad, no presencia ─────────────────
 * Etiquetar por "contiene la palabra" convierte el campo en ruido: el ajo sale
 * en 349 recetas y la cebolla en 294 — con presencia a secas, TODO el catálogo
 * sería "verdura" y el filtro no filtraría nada. Es el mismo problema que ya
 * documenta pairGarnishes.js con sus GARNISH_STOPWORDS ("el ajo no puede ser
 * el ingrediente estrella de nada").
 *
 * Así que manda la cantidad POR RACIÓN: 150 g de calabacín son el plato, 20 g
 * de cebolla son el sofrito. Los umbrales de abajo son por ración y salen de
 * mirar el catálogo, no de la nada.
 *
 * Uso:
 *   node scripts/derive-main-ingredients.mjs            (informe, no escribe)
 *   node scripts/derive-main-ingredients.mjs --write    (escribe los JSON)
 *   node scripts/derive-main-ingredients.mjs --show ensalada   (revisar a ojo)
 *   node scripts/derive-main-ingredients.mjs --show :sin       (las que no cogen
 *                                                              ninguna etiqueta)
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

const norm = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").trim();

// Condimentos y aromáticos: no cuentan como composición. Un plato no "lleva
// verdura" por llevar sofrito, igual que no lleva fruta por llevar un chorro
// de limón.
//
// El `\b` del final no es adorno: sin él, `agua` se comía "AGUAcate" y `sal`
// se comía "SALmón". El aguacate desaparecía del catálogo entero por una
// palabra que ni siquiera es un ingrediente suyo.
const NEVER = /^(zumo|ajo|cebolla|cebolleta|cebolla morada|puerro|perejil|cilantro|albahaca|menta|eneldo|cebollino|laurel|tomillo|romero|oregano|salvia|guindilla|jengibre|azafran|pimienta|pimenton|comino|nuez moscada|canela|curry|limon|lima|ralladura|vinagre|aceite|sal|azucar|agua|caldo|vino|salsa de soja|mostaza|miel|tahini|levadura|harina|pan rallado)\b/;

// …salvo cuando el "condimento" ES el plato. 20 g de puerro son sofrito; 200 g
// de puerro son "Puerros confitados". El mismo problema que resuelve
// pairGarnishes con su ingrediente estrella, y aquí se resuelve con la única
// vara que tenemos: la cantidad.
const NEVER_OVERRIDE_PER_SERVING = 100;

/**
 * Los patrones NO van anclados al principio del nombre a proposito: el
 * catalogo dice "Corazones de alcachofa", "Espinacas baby" o "Queso de cabra",
 * y anclando se perdian. La lista NEVER de arriba si va anclada, porque ahi lo
 * que se pregunta es si el ingrediente ES un condimento, no si lo lleva.
 *
 * @type {Array<{tag: string, re: RegExp, perServing: number}>}
 * `perServing` en gramos/ml por ración. Las unidades "ud" cuentan aparte (ver
 * abajo): media pieza de pimiento por ración ya es parte del plato.
 */
const TAGS = [
  // El tomate TRITURADO/frito es salsa, no verdura de plato: se excluye a
  // propósito (sale en 142 recetas y las convertiría todas en "verdura").
  {
    tag: "verdura",
    re: /\b(tomate(?! triturado| frito)|tomate cherry|tomate maduro|pimiento|calabacin|berenjena|espinaca|zanahoria|brocoli|lechuga|rucula|kale|col |coliflor|calabaza|aguacate|repollo|coles|berza|lombarda|judias verdes|esparrago|alcachofa|pepino|guisante|haba|acelga|canonigo|escarola|endi[bv]ia|remolacha|nabo|apio|boniato|alcachofas|puerros|verduras|menestra|pisto|berros|brotes|espinacas)/,
    perServing: 40,
  },
  // La hoja pesa nada: 30 g de rúcula por ración YA son una ensalada, mientras
  // que 30 g de calabaza son un tropiezo. Por eso va con su propio umbral y no
  // con el de la verdura de peso.
  {
    tag: "verdura",
    re: /\b(lechuga|rucula|canonigo|espinacas? baby|berro|kale|brote|escarola|endi[bv]ia|mezclum|mezcla de hojas|hojas verdes)/,
    perServing: 20,
  },
  { tag: "seta", re: /\b(champinon|seta|boletus|portobello|shiitake|nisca|rebozuelo)/, perServing: 25 },
  {
    tag: "lacteo",
    // "Leche de coco/almendra/avena/soja" no es lácteo: es justo lo que usa
    // quien lo evita. Sin esta salvedad, un curry con leche de coco salía
    // etiquetado como lácteo — el contrario exacto de la verdad.
    re: /\b(queso|nata|leche(?! de coco| de almendra| de avena| de soja| de arroz)|yogur|mantequilla|mozzarella|parmesano|feta|burrata|mascarpone|requeson|cuajada|creme fraiche|kefir|bechamel)/,
    perServing: 20,
  },
  {
    tag: "fruta",
    re: /\b(manzana|pera|naranja|mandarina|mango|granada|melocoton|nectarina|albaricoque|fresa|frambuesa|arandano|platano|uva|higo|sandia|melon|pina|kiwi|ciruela|cereza|datil|pasas|orejones)/,
    perServing: 30,
  },
  { tag: "frutos_secos", re: /\b(nuez|nueces|almendra|pinon|anacardo|avellana|pistacho|semilla|sesamo|castana)/, perServing: 8 },
  { tag: "encurtido", re: /\b(pepinillo|aceituna|alcaparra|encurtid|kimchi|chucrut|guindilla en vinagre|cebolleta encurtida)/, perServing: 10 },
];

// Piezas contables que, a partir de media por ración, son parte del plato.
// El aguacate va aquí y NO en la fruta: botánicamente lo es, pero nadie que
// pida "algo con fruta" está pidiendo una tostada de aguacate. Se come en
// salado, así que cuenta como verdura.
const COUNTABLE_OK = /\b(tomate|pimiento|calabacin|berenjena|zanahoria|aguacate|manzana|pera|naranja|mango|granada|melocoton|platano|pepino|alcachofa|remolacha|boniato|kiwi|higo)/;

function tagsFor(recipe) {
  const servings = Math.max(1, recipe.baseServings ?? 2);
  const found = new Set();
  for (const ing of recipe.ingredients ?? []) {
    const name = norm(ing.name);
    const unitNow = norm(ing.unit);
    const perRacion = (unitNow === "g" || unitNow === "ml") ? (Number(ing.amount) || 0) / servings : 0;
    if (NEVER.test(name) && perRacion < NEVER_OVERRIDE_PER_SERVING) continue;
    for (const { tag, re, perServing } of TAGS) {
      if (!re.test(name)) continue;
      const amount = Number(ing.amount) || 0;
      const unit = norm(ing.unit);
      const enough =
        (unit === "g" || unit === "ml") ? amount / servings >= perServing
        : (unit === "ud" || unit === "uds") ? COUNTABLE_OK.test(name) && amount / servings >= 0.5
        : false;
      if (enough) found.add(tag);
    }
  }
  // Orden estable: el del enum MAIN_INGREDIENTS, para que dos pasadas del
  // script no generen diffs por reordenar.
  const ORDER = ["verdura", "lacteo", "seta", "fruta", "frutos_secos", "encurtido"];
  return ORDER.filter((t) => found.has(t));
}

const write = process.argv.includes("--write");
// Para revisar a ojo antes de aplicar: la parte cara de esto no es derivar,
// es comprobar que lo derivado no dice tonterías.
const showAt = process.argv.indexOf("--show");
const show = showAt >= 0 ? norm(process.argv[showAt + 1] ?? "") : null;
const shown = [];
const totals = {};
let changed = 0;
let total = 0;
const samples = [];

for (const file of FILES) {
  const path = join(RECIPES_DIR, `${file}.json`);
  const recipes = JSON.parse(readFileSync(path, "utf8"));
  let touched = false;
  for (const recipe of recipes) {
    total++;
    const tags = tagsFor(recipe);
    for (const t of tags) totals[t] = (totals[t] ?? 0) + 1;
    const before = JSON.stringify(recipe.mainIngredients ?? null);
    const after = JSON.stringify(tags.length > 0 ? tags : null);
    if (before !== after) {
      changed++;
      if (samples.length < 25) samples.push(`  ${recipe.id.padEnd(24)} ${recipe.name.slice(0, 46).padEnd(48)} ${tags.join(", ") || "(ninguno)"}`);
    }
    if (show !== null) {
      const wanted = show === ":sin" ? tags.length === 0 : norm(recipe.name).includes(show);
      if (wanted) shown.push(`  ${recipe.id.padEnd(24)} ${recipe.name.slice(0, 50).padEnd(52)} ${tags.join(", ") || "—"}`);
    }
    if (tags.length > 0) recipe.mainIngredients = tags;
    else delete recipe.mainIngredients;
    touched = true;
  }
  if (write && touched) {
    writeFileSync(path, JSON.stringify(recipes, null, 2) + "\n", "utf8");
  }
}

console.log(`Recetas: ${total} · cambian: ${changed}`);
console.log("Por etiqueta:");
for (const [tag, n] of Object.entries(totals).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${tag.padEnd(14)} ${String(n).padStart(4)}  ${Math.round((n / total) * 100)}%`);
}
if (show !== null) {
  console.log(`\nCoinciden con "${show}": ${shown.length}`);
  console.log(shown.join("\n"));
} else {
  console.log("\nMuestra:");
  console.log(samples.join("\n"));
}
console.log(write ? "\n✅ Escrito." : "\n(informe: nada escrito — pasa --write para aplicar)");
