/**
 * Descarga la tabla CIQUAL y propone candidatos para los ingredientes que
 * BEDCA no pudo cubrir. NUNCA escribe en el catálogo: deja un informe.
 *
 *   node scripts/ciqual-sync.mjs [--only id1,id2]
 *
 * Salida: output/ciqual-review.json, con la misma forma que los informes de
 * BEDCA para que apply-bedca-nutrition.mjs pueda consumirlo con --review.
 *
 * ── El problema del idioma, y por qué la traducción es DATO y no código ──
 *
 * Nuestros ingredientes están en español y CIQUAL publica en inglés. Eso no se
 * adivina con similitud de cadenas: "Garbanzos" y "Chick pea" no comparten una
 * letra en el sitio correcto. Así que el término de búsqueda de cada
 * ingrediente se escribe a mano en src/data/ciqualQueries.json, donde se puede
 * leer, discutir y corregir.
 *
 * Es el mismo criterio que con `part` y con `familia`: lo que hace falta
 * juzgar se registra en un fichero versionado, no se esconde dentro de un
 * operador que nadie puede auditar.
 *
 * ── Qué filtra antes de proponer ──
 *
 *  1. Solo fichas con los CUATRO macros duros.
 *  2. Solo fichas coherentes con Atwater. El criterio que salió del garbanzo
 *     de BEDCA: una ficha que falla Atwater se descarta ENTERA, no se rescata
 *     campo a campo, porque un error demostrable en un valor es motivo para
 *     desconfiar de todos los de esa fila.
 *
 * Lo que queda se ordena por parecido con el término y se deja para decidir a
 * mano, con su motivo, en src/data/ciqualChoices.json.
 */
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { pipeline } from "stream/promises";
import { execFileSync } from "child_process";

import { cargarCiqual, fichasUtiles, aNutricion, energiaEsperada } from "./lib/ciqualParse.mjs";
import { mayContainAlcohol } from "./lib/bedcaAtwater.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const CIQUAL_DIR = join(ROOT, "output", "ciqual");
const ZIP = join(ROOT, "output", "ciqual-xml.zip");
const URL_XML = "https://ciqual.anses.fr/cms/sites/default/files/inline-files/XML_2020_07_07.zip";

const onlyArg = process.argv.find((a) => a.startsWith("--only"));
const ONLY = onlyArg
  ? new Set((onlyArg.split("=")[1] ?? process.argv[process.argv.indexOf(onlyArg) + 1]).split(","))
  : null;

// ── 1. La tabla, cacheada ───────────────────────────────────────────────────
if (!existsSync(join(CIQUAL_DIR, "alim_2020_07_07.xml"))) {
  mkdirSync(dirname(ZIP), { recursive: true });
  console.log(`⬇️   Descargando CIQUAL desde ${URL_XML} …`);
  const res = await fetch(URL_XML);
  if (!res.ok) throw new Error(`CIQUAL devolvió ${res.status}`);
  await pipeline(res.body, createWriteStream(ZIP));
  mkdirSync(CIQUAL_DIR, { recursive: true });
  // Sin dependencias: `tar` viene con Windows 10+, macOS y Linux y lee zip.
  execFileSync("tar", ["-xf", ZIP, "-C", CIQUAL_DIR], { stdio: "inherit" });
  rmSync(ZIP, { force: true });
  console.log("    descomprimida en output/ciqual/");
}

const alimentos = cargarCiqual(CIQUAL_DIR);

// El alcohol queda EXENTO del filtro, y no por indulgencia: el etanol aporta
// 7 kcal/g y no entra en la fórmula 4/4/9, así que un whisky declara 252 kcal
// donde Atwater predice 0. No es una ficha corrupta, es la fórmula que no
// aplica. Sin esta exención ningún ingrediente alcohólico podría emparejarse
// nunca — se habrían descartado todas sus fichas antes de mirarlas.
//
// Los ÁCIDOS ORGÁNICOS quedan exentos por el mismo motivo y no por uno nuevo.
// El ácido cítrico del limón y el acético del vinagre aportan energía y no son
// ni proteína, ni hidrato, ni grasa: «Lemon, pulp, raw» declara 27,6 kcal donde
// 4/4/9 predice 10, y «Vinegar» declara 22,6 donde predice 2,4. Las dos fichas
// son correctas y las dos se estaban descartando antes de que nadie las viera,
// que es cómo el limón y el vinagre seguían siendo los dos últimos alimentos
// del catálogo con un número que nadie podía firmar.
const ACIDO_RE = /\b(lemon|lime|vinegar|verjuice|citric|cranberry|rhubarb|tamarind)\b/i;
const atwaterOk = (n, nombre) => {
  if (mayContainAlcohol(nombre) || ACIDO_RE.test(nombre)) return true;
  const e = energiaEsperada(n);
  return e > 0 && Math.abs(n.kcal100g - e) <= Math.max(e * 0.2, 5);
};
const fichas = fichasUtiles(alimentos)
  .map((a) => ({ ...a, nutricion8: aNutricion(a) }))
  .filter((a) => atwaterOk(a.nutricion8, a.nombre));

console.log(`📚  CIQUAL: ${alimentos.size} alimentos · ${fichas.length} con los 4 macros y coherentes con Atwater`);

// ── 2. Qué buscar ───────────────────────────────────────────────────────────
const ingredientes = JSON.parse(readFileSync(join(ROOT, "src", "data", "ingredients.json"), "utf8"));
const queriesPath = join(ROOT, "src", "data", "ciqualQueries.json");
const queries = existsSync(queriesPath) ? JSON.parse(readFileSync(queriesPath, "utf8")) : {};

const norm = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Parecido simple: cuántas palabras del término aparecen en el nombre. */
function puntua(termino, nombre) {
  const t = norm(termino).split(/[^a-z0-9]+/).filter((w) => w.length > 2);
  if (!t.length) return 0;
  const n = norm(nombre);
  const dentro = t.filter((w) => n.includes(w)).length;
  let s = dentro / t.length;
  // Penaliza los platos preparados: "Couscous with meat or chicken" no es pollo.
  if (/\b(soup|stew|pizza|sandwich|pie|dish|prepacked|ready|canned meal|with)\b/i.test(nombre)) s -= 0.25;
  return Math.max(0, s);
}

/**
 * A quién se le busca ficha. Dos grupos, y el segundo no estaba:
 *
 *   1. Los que NO TIENEN nutrición. El hueco se ve solo.
 *   2. Los que la tienen SIN FUENTE, con `fuente: heredado` en alimentos.json.
 *      Números en uso que nadie puede atribuir a ninguna tabla.
 *
 * El segundo grupo parecía el menos urgente y era el peor. Un número sin ficha
 * tampoco tiene la convención de unidades de esa ficha, y así es como el
 * catálogo acabó con el sodio en gramos en unas filas y en miligramos en el
 * resto —cebolla 0,004 junto a cebolla roja 2,5, que son el mismo alimento—.
 * Mientras el sync solo mirase los huecos vacíos, ese fallo era invisible aquí.
 */
const alimentosPath = join(ROOT, "src", "data", "alimentos.json");
const sinFuente = new Set(
  (existsSync(alimentosPath) ? JSON.parse(readFileSync(alimentosPath, "utf8")) : [])
    .filter((a) => a.fuente === "heredado")
    .map((a) => a.id),
);
/**
 * A quién se le busca ficha. Tres grupos:
 *
 *   1. Los que NO TIENEN nutrición. El hueco se ve solo.
 *   2. Los que la tienen SIN FUENTE (`heredado`). Números que nadie puede
 *      atribuir, y que por eso tampoco tienen la unidad de ninguna ficha.
 *   3. Los que YA CITAN una ficha de ESTA tabla. Parece redundante y no lo es:
 *      cuando la tabla gana un campo —los micronutrientes— sus filas se quedan
 *      con la nutrición vieja y siguen citando una ficha que ahora trae más.
 *      Sin este grupo, ampliar el modelo no rellenaba nada y el aplicador
 *      informaba de cero sin que nada estuviera roto.
 */
const choicesCiqual = existsSync(join(ROOT, "src", "data", "ciqualChoices.json"))
  ? JSON.parse(readFileSync(join(ROOT, "src", "data", "ciqualChoices.json"), "utf8"))
  : {};
const yaCitan = new Set(
  Object.entries(choicesCiqual)
    .filter(([clave, v]) => !clave.startsWith("_") && v?.foodId != null)
    .map(([clave]) => clave),
);
const objetivo = ingredientes.filter(
  (i) => (!i.nutrition || sinFuente.has(i.id) || yaCitan.has(i.id)) && (!ONLY || ONLY.has(i.id)),
);
const sinQuery = objetivo.filter((i) => !queries[i.id]);

const review = [];
for (const ing of objetivo) {
  const q = queries[ing.id];
  if (!q) continue;
  const terminos = Array.isArray(q) ? q : [q];
  const puntuadas = fichas
    .map((f) => ({ f, score: Math.max(...terminos.map((t) => puntua(t, f.nombre))) }))
    .filter((x) => x.score > 0.5)
    .sort((a, b) => b.score - a.score || a.f.nombre.length - b.f.nombre.length)
    .slice(0, 6);
  review.push({
    ingredientId: ing.id,
    ingredientName: ing.name,
    termino: terminos.join(" | "),
    candidates: puntuadas.map((x) => ({
      foodId: x.f.code,
      foodName: x.f.nombre,
      score: Math.round(x.score * 1000) / 1000,
      nutrition: x.f.nutricion8,
      confianza: x.f.confianza,
      // Ya filtrado arriba con la fórmula de energía de CIQUAL (Reglamento UE
      // 1169/2011, con la fibra a 2 kcal/g). Se marca para que el aplicador no
      // lo vuelva a comprobar con la de BEDCA, que no cuenta la fibra y
      // rechazaría fichas correctas.
      atwaterVerificado: true,
    })),
  });
}

mkdirSync(join(ROOT, "output"), { recursive: true });
writeFileSync(join(ROOT, "output", "ciqual-review.json"), JSON.stringify(review, null, 2), "utf8");

const con = review.filter((r) => r.candidates.length > 0).length;
const huerfanos = objetivo.filter((i) => i.nutrition).length;
console.log(
  `\n🎯  ${objetivo.length} ingredientes a los que buscar ficha` +
    ` (${objetivo.length - huerfanos} sin nutrición · ${huerfanos} con nutrición pero sin fuente)`,
);
console.log(`    ${review.length} con término de búsqueda escrito · ${con} con al menos un candidato`);
if (sinQuery.length) {
  console.log(`    ${sinQuery.length} SIN término en src/data/ciqualQueries.json:`);
  console.log("      " + sinQuery.map((i) => `${i.id} (${i.name})`).join(", "));
}
console.log("\n→ output/ciqual-review.json. Nada aplicado al catálogo.");
