/**
 * Busca ficha en USDA SR Legacy para los huecos que BEDCA y CIQUAL no cierran.
 *
 * Mismo contrato que ciqual-sync.mjs, y a propósito: descarga cacheada en
 * output/ (que está en .gitignore), término de búsqueda escrito a mano en
 * src/data/usdaQueries.json, y NADA se aplica al catálogo desde aquí. Este
 * script PROPONE candidatos a output/usda-review.json; quien decide es una
 * persona escribiendo en src/data/usdaChoices.json, y quien aplica es
 * apply-bedca-nutrition.mjs.
 *
 * A QUIÉN SE LE BUSCA. Igual que el de CIQUAL, dos grupos: los que no tienen
 * nutrición y los que la tienen sin fuente. El segundo debería estar vacío hoy
 * —no queda ningún `heredado`— y se deja por si vuelve a aparecer.
 *
 * LOS CANDIDATOS SE DEVUELVEN TODOS, no solo el mejor. Y no es un detalle: la
 * revisión anterior de CIQUAL cerró cuatro alimentos describiendo el candidato
 * NÚMERO UNO como si fuera el único, con la ficha correcta esperando en la
 * posición dos. Ver src/data/ciqualChoices.json, entradas de alitas, melón,
 * surimi y tortilla de maíz.
 *
 * EL ATWATER YA VIENE COMPROBADO, con los factores propios de cada ficha
 * (scripts/lib/usdaParse.mjs). Por eso los candidatos salen marcados con
 * `atwaterVerificado: true`: si el aplicador volviera a comprobarlos con el
 * 4/4/9 general rechazaría fichas correctas, que es justo lo que pasó con
 * CIQUAL y su convención de fibra.
 */
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { pipeline } from "stream/promises";
import { execFileSync } from "child_process";

import { cargarUsda, fichasUtilesUsda, aNutricionUsda } from "./lib/usdaParse.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const USDA_DIR = join(ROOT, "output", "usda");
const CSV_DIR = join(USDA_DIR, "FoodData_Central_sr_legacy_food_csv_2018-04");
const ZIP = join(ROOT, "output", "usda-sr.zip");
const URL_ZIP = "https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip";

const onlyArg = process.argv.find((a) => a.startsWith("--only"));
const ONLY = onlyArg
  ? new Set((onlyArg.split("=")[1] ?? process.argv[process.argv.indexOf(onlyArg) + 1]).split(","))
  : null;

// ── 1. La tabla, cacheada ───────────────────────────────────────────────────
if (!existsSync(join(CSV_DIR, "food.csv"))) {
  mkdirSync(dirname(ZIP), { recursive: true });
  console.log(`⬇️   Descargando USDA SR Legacy desde ${URL_ZIP} …`);
  const res = await fetch(URL_ZIP);
  if (!res.ok) throw new Error(`USDA devolvió ${res.status}`);
  await pipeline(res.body, createWriteStream(ZIP));
  mkdirSync(USDA_DIR, { recursive: true });
  // Sin dependencias: `tar` viene con Windows 10+, macOS y Linux y lee zip.
  execFileSync("tar", ["-xf", ZIP, "-C", USDA_DIR], { stdio: "inherit" });
  rmSync(ZIP, { force: true });
  console.log("    descomprimida en output/usda/");
}

const alimentosUsda = cargarUsda(CSV_DIR);
const fichas = fichasUtilesUsda(alimentosUsda).map((a) => ({ ...a, nutricion8: aNutricionUsda(a) }));

console.log(
  `📚  USDA SR Legacy: ${alimentosUsda.size} alimentos · ${fichas.length} con los 4 macros y la energía coherente con SUS factores`,
);

// ── 2. A quién buscarle ficha ───────────────────────────────────────────────
const ingredientes = JSON.parse(readFileSync(join(ROOT, "src", "data", "ingredients.json"), "utf8"));
const queriesPath = join(ROOT, "src", "data", "usdaQueries.json");
const queries = existsSync(queriesPath) ? JSON.parse(readFileSync(queriesPath, "utf8")) : {};
delete queries._;

const alimentosPath = join(ROOT, "src", "data", "alimentos.json");
const sinFuente = new Set(
  (existsSync(alimentosPath) ? JSON.parse(readFileSync(alimentosPath, "utf8")) : [])
    .filter((a) => a.fuente === "heredado")
    .map((a) => a.id),
);
const objetivo = ingredientes.filter(
  (i) => (!i.nutrition || sinFuente.has(i.id)) && (!ONLY || ONLY.has(i.id)),
);
const sinQuery = objetivo.filter((i) => !queries[i.id]);

// ── 3. Puntuar ──────────────────────────────────────────────────────────────
const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Las palabras casan ENTERAS, no por subcadena. Buscando «Lard» para el unto,
 * la versión con `includes` devolvía «Collards, cooked, boiled» con puntuación
 * 1,00, porque «col-LARD-s» contiene «lard». Es el mismo defecto que tenía el
 * emparejador de la lista de la compra con «fresca» y «fresas», y se arregla
 * igual: comparando palabras y no trozos de palabra.
 */
const PALABRAS = (s) => norm(s).split(/[^a-z0-9]+/).filter(Boolean);

function puntua(nombre, termino) {
  const t = PALABRAS(termino).filter((w) => w.length > 2);
  if (!t.length) return 0;
  const enNombre = new Set(PALABRAS(nombre));
  // Un plural de más no puede romper la coincidencia: «ears» y «ear», «beans»
  // y «bean». Solo se acepta el sufijo, nunca un cambio en la raíz.
  const casa = (w) => enNombre.has(w) || enNombre.has(`${w}s`) || (w.endsWith("s") && enNombre.has(w.slice(0, -1)));
  let s = t.filter(casa).length / t.length;
  // Penaliza los preparados: «Frybread, made with lard» no es manteca, y
  // «Beverages, Acai berry drink» no es pulpa de açaí. Los dos salieron en un
  // sondeo y los dos habrían pasado por parecido de palabras.
  if (/\b(soup|stew|pizza|sandwich|casserole|frybread|beverages|drink|baby food|infant)\b/i.test(nombre)) s -= 0.3;
  return Math.max(0, s);
}

const review = [];
for (const ing of objetivo) {
  const q = queries[ing.id];
  if (!q) continue;
  const terminos = Array.isArray(q) ? q : [q];
  const puntuadas = fichas
    .map((f) => ({ f, score: Math.max(...terminos.map((t) => puntua(f.nombre, t))) }))
    .filter((x) => x.score >= 0.5)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  review.push({
    ingredientId: ing.id,
    ingredientName: ing.name,
    query: terminos,
    candidates: puntuadas.map(({ f, score }) => ({
      foodId: f.code,
      foodName: f.nombre,
      score: +score.toFixed(2),
      nutrition: f.nutricion8,
      factoresAtwater: f.factores,
      // Comprobado en el origen con los factores de ESTA ficha, no con 4/4/9.
      atwaterVerificado: true,
    })),
  });
}

mkdirSync(join(ROOT, "output"), { recursive: true });
writeFileSync(join(ROOT, "output", "usda-review.json"), JSON.stringify(review, null, 2), "utf8");

const con = review.filter((r) => r.candidates.length > 0).length;
const huerfanos = objetivo.filter((i) => i.nutrition).length;
console.log(
  `\n🎯  ${objetivo.length} ingredientes a los que buscar ficha` +
    ` (${objetivo.length - huerfanos} sin nutrición · ${huerfanos} con nutrición pero sin fuente)`,
);
console.log(`    ${review.length} con término de búsqueda escrito · ${con} con al menos un candidato`);
if (sinQuery.length) {
  console.log(`    ${sinQuery.length} SIN término en src/data/usdaQueries.json:`);
  console.log(`      ${sinQuery.map((i) => `${i.id} (${i.name})`).join(", ")}`);
}
console.log("\n→ output/usda-review.json. Nada aplicado al catálogo.");
