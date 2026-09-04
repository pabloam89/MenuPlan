/**
 * derive-sauce.mjs
 *
 * Marca `llevaSalsa` en src/data/recipes/*.json.
 *
 * ── Por qué hace falta ────────────────────────────────────────────────────
 * Aquí NO se combinan platos con salsas: cada receta es la que es. Pero eso no
 * significa que no haya platos con salsa — hay un montón, y la llevan escrita
 * dentro (unas 100 la llevan hasta en el nombre: "Albóndigas en salsa de
 * tomate", "Lomo en salsa", "Merluza en salsa verde").
 *
 * Sin este campo, "quiero más platos con salsa" no tiene respuesta posible: ni
 * combinamos (bien) ni sabemos cuáles ya la traen (mal). Con él, la respuesta
 * honesta —"te doy los que ya la llevan"— pasa a ser servible.
 *
 * `sauceId` existe en el esquema y lo usan 0 recetas: ese campo es para fijar
 * UNA salsa concreta a mano, no para decir "este plato es de salsa". Son cosas
 * distintas y por eso hace falta un booleano aparte.
 *
 * ── Cómo se decide ────────────────────────────────────────────────────────
 * Dos señales, y la segunda con mucho cuidado:
 *
 *   1. El NOMBRE. Es la señal buena: si el plato se llama "en salsa verde",
 *      lleva salsa y no hay discusión.
 *
 *   2. Los INGREDIENTES. Aquí está la trampa. Que una receta lleve tahini no
 *      la hace un plato con salsa: el hummus ES el plato, no su salsa. Igual
 *      con el pesto de una ensalada de pasta fría o la mostaza de un aliño.
 *      Por eso los ingredientes solo cuentan cuando hay CANTIDAD suficiente
 *      para que aquello sea una salsa de verdad y no un toque, y nunca en las
 *      familias donde el propio plato es la crema (hummus, patés, dips).
 *
 * Uso:
 *   node scripts/derive-sauce.mjs           (informe)
 *   node scripts/derive-sauce.mjs --write   (aplica)
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

// El nombre lo dice: no hay falsos positivos que valga la pena perseguir.
// OJO con lo que NO está aquí: guisado, estofado y "a la cazuela". Un guiso
// tiene su jugo, sí, pero cuando alguien pide "platos con salsa" no está
// pidiendo un estofado — para eso ya existe `tecnica: guiso`, y son dos ejes
// que conviene no mezclar. Meterlos subía el campo del 28 % al 40 % diciendo
// dos veces lo mismo y dejando el filtro sin filo.
const NOMBRE = /\b(en salsa|con salsa|salsa de|a la marinera|marinera|alioli|romesco|pesto|carbonara|bolo[nñ]esa|vizcaina|tartara|holandesa|bearnesa|chimichurri|mojo|al curry|curry (rojo|verde|tailandes|de)|teriyaki|en adobo|en escabeche|meuniere|pil ?pil|al ajillo|napolitana|arrabbiata|puttanesca|stroganoff|tikka|masala|katsu|bechamel|tzatziki|hoisin|barbacoa|bbq|gremolata|en su tinta|encebollad|al pedro ximenez|al vino|al whisky|al jerez|a la naranja)/;

// El plato ES la crema (o el caldo): aquí un ingrediente "de salsa" no
// significa nada. Una sopa lleva litro y medio de caldo y no es un plato con
// salsa; un hummus lleva tahini y el hummus es el plato, no su acompañamiento.
const ES_LA_CREMA = /\b(hummus|pate|dip|crema de|pure de|gazpacho|salmorejo|ajoblanco|mayonesa casera|guacamole|baba ganoush|muhammara|tapenade|sopa|caldo|consome|potaje|marmitako)/;

// Ingredientes que SÍ hacen salsa, con el mínimo en gramos o ml por ración
// para que cuente. Un chorrito de soja para saltear no es un plato con salsa;
// 40 ml de nata reducida sí.
const INGREDIENTES = [
  [/\bsalsa\b/, 20],
  [/\bnata (para cocinar|liquida)/, 30],
  [/\btomate frito\b/, 40],
  [/\bsofrito\b/, 40],
  [/\bbechamel\b/, 30],
  [/\bpesto\b/, 15],
  [/\balioli\b/, 15],
  [/\bmayonesa\b/, 20],
  [/\b(salsa de soja|soja)\b/, 15],
  [/\bteriyaki\b/, 10],
  [/\bhoisin\b/, 10],
  [/\bcurry (en pasta|rojo|verde)/, 15],
  [/\bleche de coco\b/, 50],
  [/\btahini\b/, 20],
  [/\byogur griego\b/, 40],
  [/\bmostaza de dijon\b/, 15],
  // Sin vino ni caldo: son líquidos de cocción, no salsas. El vino que SÍ hace
  // salsa ("al Pedro Ximénez", "al vino tinto") ya lo caza el nombre, y el
  // caldo metía cocidos y sopas enteras.
];

function porRacion(ing, servings) {
  const unit = norm(ing.unit);
  const amount = Number(ing.amount) || 0;
  if (unit === "g" || unit === "ml") return amount / servings;
  return 0;
}

function llevaSalsa(recipe) {
  const name = norm(recipe.name);
  if (NOMBRE.test(name)) return "nombre";
  if (ES_LA_CREMA.test(name)) return null;
  const servings = Math.max(1, recipe.baseServings ?? 2);
  for (const ing of recipe.ingredients ?? []) {
    const n = norm(ing.name);
    for (const [re, min] of INGREDIENTES) {
      if (re.test(n) && porRacion(ing, servings) >= min) return "ingrediente";
    }
  }
  return null;
}

const write = process.argv.includes("--write");
let total = 0, conSalsa = 0, porNombre = 0, porIng = 0;
const muestra = { nombre: [], ingrediente: [] };

for (const file of FILES) {
  const path = join(RECIPES_DIR, `${file}.json`);
  const recipes = JSON.parse(readFileSync(path, "utf8"));
  for (const recipe of recipes) {
    total++;
    const via = llevaSalsa(recipe);
    if (via) {
      recipe.llevaSalsa = true;
      conSalsa++;
      if (via === "nombre") porNombre++; else porIng++;
      if (muestra[via].length < 10) muestra[via].push(recipe.name);
    } else if (recipe.llevaSalsa) {
      delete recipe.llevaSalsa;
    }
  }
  if (write) writeFileSync(path, JSON.stringify(recipes, null, 2) + "\n", "utf8");
}

console.log(`Recetas: ${total}`);
console.log(`  llevaSalsa: ${conSalsa} (${Math.round((conSalsa / total) * 100)}%)`);
console.log(`     por nombre:      ${porNombre}`);
console.log(`     por ingrediente: ${porIng}`);
console.log("\nPor nombre:");
for (const n of muestra.nombre) console.log(`   ${n}`);
console.log("\nPor ingrediente (los que hay que mirar con lupa):");
for (const n of muestra.ingrediente) console.log(`   ${n}`);
console.log(write ? "\n✅ Escrito." : "\n(informe: nada escrito — pasa --write para aplicar)");
