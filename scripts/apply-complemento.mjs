/**
 * Rellena los micronutrientes que la ficha propia de un alimento deja vacíos,
 * tomándolos de la ficha equivalente en otra tabla.
 *
 *   node scripts/apply-complemento.mjs [--dry-run]
 *
 * LA REGLA QUE SE ROMPE AQUÍ, Y POR QUÉ. Hasta ahora una fila tomaba sus 32
 * campos de UNA sola ficha, y eso protegía la procedencia: mirabas `fuente` y
 * sabías de dónde venía todo. El precio era que la fila heredaba los HUECOS de
 * su tabla. BEDCA no publica vitamina K en absoluto y son 198 de las 371
 * filas, así que el techo de ese campo era el 47 % por aritmética.
 *
 * Se rompe de la única forma que no pierde nada: la fila declara la segunda
 * ficha en `fuenteComplemento`, con la lista exacta de campos que vienen de
 * ella. Una fila puede citar dos fichas; lo que no puede es citar dos en el
 * MISMO campo. El invariante deja de ser «una fila, una ficha» y pasa a ser
 * «un campo, una ficha», que es más fino y no más laxo.
 *
 * LO QUE NO HACE, Y ES LA MITAD DE SU VALOR:
 *   · no toca ningún campo que la ficha propia ya rellene, ni siquiera si el
 *     prestado parece mejor;
 *   · no presta un campo que la ficha prestadora también deja vacío;
 *   · no entra donde las dos tablas discrepan en los macros por encima del
 *     30 %, porque entonces no están hablando del mismo alimento.
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

import { cargarUsda, aNutricionUsda } from "./lib/usdaParse.mjs";
import { CAMPOS_SECUNDARIOS } from "../src/data/nutrientes.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const CATALOG = join(ROOT, "src", "data", "ingredients.json");
const DRY = process.argv.includes("--dry-run");

const choices = JSON.parse(readFileSync(join(ROOT, "src", "data", "complementoChoices.json"), "utf8"));
delete choices._;

const usda = cargarUsda(join(ROOT, "output", "usda", "FoodData_Central_sr_legacy_food_csv_2018-04"));
const original = readFileSync(CATALOG, "utf8");
const usesCrlf = original.includes("\r\n");
const catalogo = JSON.parse(original);
const porId = new Map(catalogo.map((i) => [i.id, i]));

// Solo micronutrientes: los cuatro macros secundarios que la receta declara
// —fibra, azúcar, grasa saturada, sodio— nunca se prestan.
const PRESTABLES = CAMPOS_SECUNDARIOS.filter(
  (c) => !["fiber100g", "sugar100g", "saturatedFat100g", "sodium100g"].includes(c),
);

let tocados = 0;
const ganados = {};
const avisos = [];

for (const [id, d] of Object.entries(choices)) {
  const ing = porId.get(id);
  if (!ing?.nutrition) { avisos.push(`${id}: no tiene nutrición propia`); continue; }
  const ficha = usda.get(String(d.foodId));
  if (!ficha) { avisos.push(`${id}: la ficha ${d.foodId} no está en la tabla descargada`); continue; }
  const n = aNutricionUsda(ficha);

  const prestados = [];
  for (const campo of PRESTABLES) {
    if (ing.nutrition[campo] != null) continue;  // lo propio manda SIEMPRE
    if (n[campo] == null) continue;              // no se puede prestar un hueco
    ing.nutrition[campo] = n[campo];
    prestados.push(campo);
    ganados[campo] = (ganados[campo] ?? 0) + 1;
  }
  if (!prestados.length) continue;
  ing.fuenteComplemento = { tabla: d.tabla, foodId: String(d.foodId), nombre: ficha.nombre, campos: prestados };
  tocados++;
  console.log(`✅  ${id.padEnd(26)}← ${ficha.nombre.slice(0, 40).padEnd(42)}${prestados.length} campos`);
}

console.log(`\n✨  ${DRY ? "[dry-run] " : ""}${tocados} alimentos complementados`);
if (Object.keys(ganados).length) {
  console.log("\n    campos ganados:");
  for (const [c, v] of Object.entries(ganados).sort((a, b) => b[1] - a[1])) {
    console.log(`      ${c.replace("100g", "").padEnd(20)} +${v}`);
  }
}
for (const a of avisos) console.log(`⚠️   ${a}`);

if (!DRY && tocados) {
  const json = JSON.stringify(catalogo, null, 2) + "\n";
  writeFileSync(CATALOG, usesCrlf ? json.replaceAll("\n", "\r\n") : json, "utf8");
  console.log("\n✅  src/data/ingredients.json");
}
