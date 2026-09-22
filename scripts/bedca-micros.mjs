/**
 * Vuelve a preguntar a BEDCA por las filas que YA citan una ficha suya, para
 * traerse los campos que el modelo ganó después.
 *
 *   node scripts/bedca-micros.mjs [--dry-run] [--limit N]
 *
 * POR QUÉ HACE FALTA. El pipeline original de BEDCA guardó de cada ficha los
 * ocho campos que existían entonces —cuatro macros, fibra, azúcar, grasa
 * saturada y sodio— y tiró el resto. Cuando el modelo pasó a 32 campos, las
 * 198 filas de BEDCA se quedaron sin ninguno de los 24 nuevos, y eso NO es un
 * hueco de la fuente: BEDCA publica 23 de los 24 (la vitamina K no). El hueco
 * era del cache.
 *
 * Y no se puede resolver con el informe local, porque el informe tampoco los
 * tiene: hay que volver a la API. Son ~200 consultas, una por alimento.
 *
 * LA COMPROBACIÓN QUE HACE QUE ESTO SEA SEGURO. Antes de escribir nada compara
 * los CUATRO MACROS DUROS que ya están en el catálogo con los que devuelve la
 * ficha. Si no coinciden, la fila no cita lo que dice citar —la ficha cambió,
 * o la procedencia se recuperó mal— y se salta con un aviso en vez de
 * sobrescribir. Es la misma regla de siempre: cítala o no la cites, pero no la
 * cites y la contradigas.
 */
import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

import { getFoodNutrition } from "./lib/bedcaClient.mjs";
import { CAMPOS_DUROS, CAMPOS_SECUNDARIOS } from "../src/data/nutrientes.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const CATALOG_PATH = join(ROOT, "src", "data", "ingredients.json");

const DRY_RUN = process.argv.includes("--dry-run");
const limitArg = process.argv.find((a) => a.startsWith("--limit"));
const LIMIT = limitArg ? Number(limitArg.split("=")[1] ?? process.argv[process.argv.indexOf(limitArg) + 1]) : Infinity;

const alimentos = JSON.parse(readFileSync(join(ROOT, "src", "data", "alimentos.json"), "utf8"));
const original = readFileSync(CATALOG_PATH, "utf8");
const usesCrlf = original.includes("\r\n");
const catalogo = JSON.parse(original);
const porId = new Map(catalogo.map((i) => [i.id, i]));

const objetivo = alimentos
  .filter((a) => a.fuente === "bedca" && a.fuenteId != null && a.nutricion)
  .slice(0, LIMIT);

console.log(`🔎  ${objetivo.length} filas citan una ficha de BEDCA. Preguntando de nuevo…\n`);

// Dos decimales: BEDCA devuelve lo mismo que guardamos, pero el kcal se calcula
// desde el kJ y un redondeo distinto no es una discrepancia.
const igual = (a, b) => a == null || b == null || Math.abs(a - b) <= Math.max(Math.abs(a) * 0.01, 0.05);

let actualizados = 0;
let sinCambio = 0;
const discrepan = [];
const falladas = [];
const ganadosPorCampo = Object.fromEntries(CAMPOS_SECUNDARIOS.map((c) => [c, 0]));

for (const [n, a] of objetivo.entries()) {
  const ing = porId.get(a.id);
  if (!ing?.nutrition) continue;

  let ficha;
  try {
    ficha = await getFoodNutrition(a.fuenteId);
  } catch (e) {
    falladas.push(`${a.id} (${a.fuenteId}): ${e.message}`);
    continue;
  }
  if (!ficha) {
    falladas.push(`${a.id} (${a.fuenteId}): la ficha ya no trae los cuatro macros`);
    continue;
  }

  // ¿Es la MISMA ficha que la fila dice citar?
  const malos = CAMPOS_DUROS.filter((c) => !igual(ing.nutrition[c], ficha[c]));
  if (malos.length) {
    discrepan.push(
      `${a.id.padEnd(26)} f_id ${a.fuenteId}: ` +
        malos.map((c) => `${c.replace("100g", "")} ${ing.nutrition[c]}≠${ficha[c]}`).join(", "),
    );
    continue;
  }

  const nuevos = CAMPOS_SECUNDARIOS.filter((c) => ing.nutrition[c] == null && ficha[c] != null);
  if (!nuevos.length) {
    sinCambio++;
  } else {
    for (const c of nuevos) ganadosPorCampo[c]++;
    // Se adopta la ficha ENTERA, no solo los campos nuevos: la fila ya la cita,
    // así que cualquier diferencia en los secundarios es la fila desviándose de
    // su propia fuente.
    ing.nutrition = ficha;
    actualizados++;
  }

  if ((n + 1) % 25 === 0) console.log(`    ${n + 1}/${objetivo.length}…`);
}

console.log(`\n✨  ${DRY_RUN ? "[dry-run] " : ""}Actualizados: ${actualizados} · sin campos nuevos: ${sinCambio} · discrepan: ${discrepan.length} · fallidas: ${falladas.length}`);

const ganados = Object.entries(ganadosPorCampo).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
if (ganados.length) {
  console.log("\n    campos ganados:");
  for (const [c, v] of ganados) console.log(`      ${c.replace("100g", "").padEnd(20)} +${v}`);
}
if (discrepan.length) {
  console.log("\n⚠️   filas que citan una ficha y no cuadran con ella (NO se han tocado):");
  for (const d of discrepan) console.log(`      ${d}`);
}
if (falladas.length) {
  console.log("\n⚠️   consultas que no devolvieron ficha:");
  for (const f of falladas.slice(0, 15)) console.log(`      ${f}`);
}

if (!DRY_RUN && actualizados > 0) {
  const json = JSON.stringify(catalogo, null, 2) + "\n";
  writeFileSync(CATALOG_PATH, usesCrlf ? json.replaceAll("\n", "\r\n") : json, "utf8");
  console.log(`\n✅  src/data/ingredients.json`);
}
