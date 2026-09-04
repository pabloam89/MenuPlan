/**
 * derive-base-and-proteins.mjs
 *
 * Rellena `mainBase` y `extraProteins` en src/data/recipes/*.json.
 *
 * ── Por qué importan más de lo que parece ─────────────────────────────────
 * No son etiquetas informativas: son MOTOR. `mainBase` es lo que impide "arroz
 * de primero y arroz de segundo" (regla 9 de validateMenu.js, vía getCarbType)
 * y `extraProteins` lo que hace que un cocido cuente como carne además de como
 * legumbre para la regla de no repetir proteína el mismo día (proteinGroupsOf).
 *
 * Estaban al 30% y al 18%. Una regla que solo mira un tercio de los platos no
 * es una regla, es una lotería — y explica que se colaran cosas que el motor
 * "debería" haber parado.
 *
 * ── Y por qué se pueden derivar ───────────────────────────────────────────
 * Porque la respuesta está en la lista de ingredientes, igual que en
 * mainIngredients: si un plato lleva 80 g de arroz por ración, su base es el
 * arroz; si lleva jamón, su proteína secundaria es el cerdo. Con el mismo
 * cuidado de siempre: manda la CANTIDAD, no la mención. El chorizo que da
 * sabor a unas lentejas cuenta (es proteína animal de verdad); los 5 g de
 * queso rallado por encima de una pasta, no.
 *
 * Lo que NO se toca: `mainProtein`. Ese ya está al 100% y es una decisión
 * tomada — la proteína secundaria se añade AL LADO, nunca la sustituye.
 *
 * Uso:
 *   node scripts/derive-base-and-proteins.mjs           (informe)
 *   node scripts/derive-base-and-proteins.mjs --write   (aplica)
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

// Bases de carbohidrato, con el vocabulario EXACTO de getCarbType
// (utils/validateMenu.js). Si aquí se inventara un valor nuevo, la regla que
// lo consume no lo reconocería y el campo no serviría para nada.
const BASES = [
  ["arroz", /\b(arroz|risotto)/, 40],
  ["pasta", /\b(espagueti|macarron|pasta|tallarin|fideo|penne|rigatoni|tagliatelle|lasan|canelon|ravioli|tortellini|fettuccine|linguine|noodle)/, 40],
  ["patatas", /\b(patata|boniato)/, 80],
  ["quinoa", /\bquinoa/, 40],
  ["cuscus", /\b(cuscus|bulgur)/, 40],
  // `pan` con frontera por los DOS lados: sin la de la derecha se comía la
  // PANceta y convertía una fabada asturiana en un plato de pan.
  ["pan", /\b(pan\b|tortillas? de (trigo|maiz)|masa de pizza|base de pizza|hojaldre)/, 40],
  ["avena", /\b(avena|copos)/, 30],
];

// Proteína animal secundaria: la que está en el plato pero no manda. El
// vocabulario es el de MAIN_PROTEINS — no se puede inventar ninguno.
const PROTEINAS = [
  ["cerdo", /\b(jamon|chorizo|bacon|beicon|panceta|lomo de cerdo|secreto|presa|costilla de cerdo|morcilla|sobrasada|butifarra|salchicha|lacon|cinta de lomo|pluma iberica|solomillo de cerdo|compango|chistorra)/, 15],
  ["ternera", /\b(ternera|vacuno|buey|carne picada|morcillo|carrillera|entrecot|solomillo de ternera|redondo|jarrete|osobuco|ossobuco|pastrami)/, 20],
  // Sin "pechuga" ni "muslo" a secas: "Pechuga de pavo" salía catalogada como
  // pollo, que es justo la confusión que este campo existe para evitar.
  ["pollo", /\b(pollo|contramuslo de pollo|muslos? de pollo|alitas de pollo)/, 20],
  ["pavo", /\bpavo/, 20],
  ["pescado_blanco", /\b(merluza|bacalao|lubina|dorada|rape|lenguado|corvina|rodaballo|mero|gallo)/, 25],
  ["pescado_azul", /\b(salmon|atun|bonito|sardina|caballa|boqueron|anchoa|ventresca|melva)/, 15],
  ["marisco", /\b(gamba|langostino|almeja|mejillon|calamar|sepia|pulpo|chipiron|cigala|navaja|vieira|berberecho|zamburi|bogavante|carabinero|percebe)/, 20],
  // Un huevo por ración o más. Con el umbral a cero, el huevo batido de un
  // rebozado contaba como proteína del plato y disparaba la regla de "no
  // repetir proteína el mismo día" en media docena de empanados.
  ["huevo", /\bhuevo/, 55],
];

function porRacion(ing, servings) {
  const unit = norm(ing.unit);
  const amount = Number(ing.amount) || 0;
  if (unit === "g" || unit === "ml") return amount / servings;
  // Una pieza por cada dos raciones ya es presencia de verdad.
  if (unit === "ud" || unit === "uds") return (amount / servings) * 60;
  return 0;
}

function baseDe(recipe) {
  const servings = Math.max(1, recipe.baseServings ?? 2);
  for (const ing of recipe.ingredients ?? []) {
    const name = norm(ing.name);
    // El pan rallado de un empanado no es la base del plato, es el rebozado.
    if (/^pan rallado/.test(name)) continue;
    for (const [base, re, min] of BASES) {
      if (re.test(name) && porRacion(ing, servings) >= min) return base;
    }
  }
  return null;
}

function proteinasExtra(recipe) {
  const servings = Math.max(1, recipe.baseServings ?? 2);
  const found = new Set();
  for (const ing of recipe.ingredients ?? []) {
    const name = norm(ing.name);
    for (const [prot, re, min] of PROTEINAS) {
      if (re.test(name) && porRacion(ing, servings) >= min) found.add(prot);
    }
  }
  // La principal no se repite: `extraProteins` es lo que hay ADEMÁS.
  found.delete(recipe.mainProtein);
  return [...found].sort();
}

const write = process.argv.includes("--write");
let conBase = 0, conExtra = 0, total = 0, cambios = 0;
const muestra = [];

for (const file of FILES) {
  const path = join(RECIPES_DIR, `${file}.json`);
  const recipes = JSON.parse(readFileSync(path, "utf8"));
  for (const recipe of recipes) {
    total++;
    const antes = JSON.stringify([recipe.mainBase ?? null, recipe.extraProteins ?? null]);

    // Lo ya escrito a mano manda: esto RELLENA huecos, no reescribe juicios.
    if (!recipe.mainBase) {
      const base = baseDe(recipe);
      if (base) recipe.mainBase = base;
    }
    if (!recipe.extraProteins?.length) {
      const extra = proteinasExtra(recipe);
      if (extra.length > 0) recipe.extraProteins = extra;
    }

    if (recipe.mainBase) conBase++;
    if (recipe.extraProteins?.length) conExtra++;
    const despues = JSON.stringify([recipe.mainBase ?? null, recipe.extraProteins ?? null]);
    if (antes !== despues) {
      cambios++;
      if (muestra.length < 18) {
        muestra.push(`  ${recipe.id.padEnd(22)}${recipe.name.slice(0, 42).padEnd(44)}${(recipe.mainBase ?? "—").padEnd(10)}${(recipe.extraProteins ?? []).join(",")}`);
      }
    }
  }
  if (write) writeFileSync(path, JSON.stringify(recipes, null, 2) + "\n", "utf8");
}

const pct = (n) => `${n} (${Math.round((n / total) * 100)}%)`;
console.log(`Recetas: ${total} · cambian: ${cambios}`);
console.log(`  mainBase       ${pct(conBase)}`);
console.log(`  extraProteins  ${pct(conExtra)}`);
console.log("\nMuestra:");
console.log(muestra.join("\n"));
console.log(write ? "\n✅ Escrito." : "\n(informe: nada escrito — pasa --write para aplicar)");
