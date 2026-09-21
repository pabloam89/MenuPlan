/**
 * build-derived.mjs — genera src/data/derived/*.json
 *
 * Las tablas DERIVADAS del modelo (ver src/data/model.js): lo que se calcula
 * de las fuentes con un operador determinista y se materializa para que la
 * auditoría y el análisis no tengan que recalcularlo cada vez, y sobre todo
 * para que se vea.
 *
 * Tres reglas, y las tres existen por algo que ya salió mal en este repo:
 *
 *   1. NUNCA escribe en las fuentes. Solo en src/data/derived/.
 *   2. Cada tabla lleva su PROCEDENCIA por fila: de qué operador salió y con
 *      qué cobertura. Una fila derivada que no dice de dónde viene acaba
 *      leyéndose como un dato medido, y no lo es.
 *   3. _meta.json lleva el hash de las fuentes. derived.test.js compara: si
 *      una fuente cambió y nadie regeneró, el test lo dice. Una tabla
 *      derivada caducada es peor que no tenerla, porque parece fresca.
 *
 *   node scripts/build-derived.mjs [--check]
 *
 * --check no escribe: falla si lo generado no coincide con lo commiteado.
 */
import { createHash } from "crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

import { computeRecipeNutrition } from "../src/lib/ingredients.js";
import { availablePartsOf, ingredientsByPart, stepsByPart } from "../src/lib/recipeSteps.js";
import { deriveStepParts, medirConcordancia } from "../src/lib/derive/stepParts.js";
import { selectPartsTargets } from "./select-recipes-for-parts.mjs";
import { gramsForRecipeQuantity } from "../src/lib/kitchenUnits.js";
import { resolveIngredient } from "../src/lib/ingredients.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const RECIPES_DIR = join(ROOT, "src", "data", "recipes");
const OUT_DIR = join(ROOT, "src", "data", "derived");
const CHECK = process.argv.includes("--check");

// El hash es del CONTENIDO, no del convenio de fin de línea del checkout: con
// core.autocrlf=true (Windows) git entrega CRLF y el mismo fichero daría otro
// hash, haciendo saltar derived.test.js en un árbol perfectamente fresco.
const hash = (s) => createHash("sha256").update(s.replace(/\r\n/g, "\n")).digest("hex").slice(0, 16);

const ficheros = readdirSync(RECIPES_DIR).filter((f) => f.endsWith(".json")).sort();
const recetas = ficheros.flatMap((f) => JSON.parse(readFileSync(join(RECIPES_DIR, f), "utf8")));
const ingredientesRaw = readFileSync(join(ROOT, "src", "data", "ingredients.json"), "utf8");

const hashFuentes = {
  ingredientes: hash(ingredientesRaw),
  recetas: hash(ficheros.map((f) => readFileSync(join(RECIPES_DIR, f), "utf8")).join("")),
};

// ── recipeNutrition ─────────────────────────────────────────────────────────
// La suma de los ingredientes, por ración, con su cobertura. NO sustituye a
// kcal/protein_g declarados: hoy discrepan y ninguna de las dos fuentes está
// validada (ver el bloque 1 de scripts/audit-catalog.mjs). Se materializa
// justo para poder seguir midiendo esa discrepancia sin recalcularla.
const recipeNutrition = {};
for (const r of recetas) {
  const n = computeRecipeNutrition(r, r.baseServings || 4);
  if (!n) continue;
  recipeNutrition[r.id] = {
    ...n,
    declarado: { kcal: r.kcal, protein_g: r.protein_g, carbs_g: r.carbs_g, fat_g: r.fat_g },
    operador: "computeRecipeNutrition",
  };
}

// ── recipeParts ─────────────────────────────────────────────────────────────
// El vector de masa por componente del plato. Cada fila dice de dónde sale su
// reparto, y solo hay dos orígenes válidos:
//
//   curado          `stepsRich[].part` etiquetado por el pipeline de
//                   enrich-recipe-steps (llm, criterio aparte/dentro).
//   monocomponente  la receta es una sola cosa. No es un hueco.
//
// El operador determinista (deriveStepParts) NO entra aquí: concuerda con lo
// curado solo a medias, y el motivo es de fondo — la parte es propiedad del
// PLATO, no del ingrediente. La misma cebolla es sofrito del principal en una
// receta y la guarnición en otra, y eso una tabla por pasillo no lo sabe. El
// número exacto va en _meta para que se pueda volver a mirar, pero mientras
// no suba mucho, rellenar `part` con esto sería inventar el dato que el resto
// del modelo usa para decidir qué aceite se come.
const MONO_CATEGORIES = new Set(["salsas", "guarniciones", "bases", "bebes", "postres", "desayunos", "meriendas"]);
const MONO_TYPES = new Set(["salsa", "guarnicion", "base"]);

// Juicios tomados a mano con el mismo criterio aparte/dentro que usa el
// pipeline (PART_CRITERION, scripts/enrich-recipe-steps.mjs). Una entrada con
// lista vacía significa "mirada y monocomponente", que NO es lo mismo que
// "sin mirar": la puerta de select-recipes-for-parts es de recall y la mayoría
// de sus objetivos resultan ser un solo componente. Sin este fichero, esas
// recetas se contaban como hueco para siempre.
const JUICIOS = JSON.parse(readFileSync(join(ROOT, "src", "data", "stepPartsLabels.json"), "utf8"));

// La puerta de dos etapas: a qué recetas tiene sentido preguntarles por `part`.
// Es de RECALL, así que lo que deja fuera no da NINGUNA señal de tener un
// componente aparte — ni en el nombre ni en sus últimos pasos. Llamar "hueco"
// a eso infla el problema: el hueco de verdad son las que dan señal y nadie ha
// mirado todavía.
const CON_SENAL = new Set(selectPartsTargets(recetas).targets.map((r) => r.id));

const recipeParts = {};
for (const r of recetas) {
  const partes = availablePartsOf(r.stepsRich);
  if (!partes.length) {
    const porConstruccion = MONO_TYPES.has(r.type) || MONO_CATEGORIES.has(r.category);
    const juzgada = Array.isArray(JUICIOS[r.id]) && JUICIOS[r.id].length === 0;
    recipeParts[r.id] = {
      origen: porConstruccion
        ? "monocomponente"
        : juzgada
          ? "monocomponente_juzgado"
          : CON_SENAL.has(r.id) ? "sin_curar" : "sin_senal",
      partes: null,
    };
    continue;
  }
  const porParte = ingredientsByPart(r.stepsRich, r.ingredients ?? []);
  const pasosPorParte = stepsByPart(r.stepsRich);
  const vector = {};
  for (const [parte, lineas] of Object.entries(porParte)) {
    let masa = 0;
    const macros = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
    let cubierta = 0;
    for (const l of lineas) {
      const g = gramsForRecipeQuantity(l.name, l.amount, l.unit);
      if (g == null || g <= 0) continue;
      masa += g;
      const nu = (l.ingredientId ? resolveIngredient(l.name) : resolveIngredient(l.name))?.nutrition;
      if (!nu) continue;
      cubierta += g;
      macros.kcal += (nu.kcal100g ?? 0) * g / 100;
      macros.protein_g += (nu.protein100g ?? 0) * g / 100;
      macros.carbs_g += (nu.carbs100g ?? 0) * g / 100;
      macros.fat_g += (nu.fat100g ?? 0) * g / 100;
    }
    vector[parte] = {
      ingredientes: lineas.length,
      pasos: (pasosPorParte[parte] ?? []).length,
      minutos: (pasosPorParte[parte] ?? []).reduce((a, s) => a + (s.minutes ?? 0), 0),
      masa_g: Math.round(masa),
      cobertura: masa > 0 ? +(cubierta / masa).toFixed(3) : 0,
      ...Object.fromEntries(Object.entries(macros).map(([k, v]) => [k, Math.round(v)])),
    };
  }
  const masaTotal = Object.values(vector).reduce((a, v) => a + v.masa_g, 0);
  for (const v of Object.values(vector)) v.fraccion = masaTotal ? +(v.masa_g / masaTotal).toFixed(3) : 0;
  recipeParts[r.id] = { origen: "curado", operador: "ingredientsByPart", partes: vector };
}

const concordancia = medirConcordancia(recetas);
const cuentaOrigen = Object.values(recipeParts).reduce((a, v) => ((a[v.origen] = (a[v.origen] ?? 0) + 1), a), {});

// ── escritura ───────────────────────────────────────────────────────────────
const meta = {
  generado_por: "scripts/build-derived.mjs",
  hash_fuentes: hashFuentes,
  recetas: recetas.length,
  recipeNutrition: {
    filas: Object.keys(recipeNutrition).length,
    cobertura_media: +(Object.values(recipeNutrition).reduce((a, v) => a + v.coverage, 0) / Object.keys(recipeNutrition).length).toFixed(3),
  },
  recipeParts: {
    filas: Object.keys(recipeParts).length,
    por_origen: cuentaOrigen,
    operador_determinista: {
      modulo: "src/lib/derive/stepParts.js",
      concordancia_con_curado: +concordancia.ratio.toFixed(3),
      pasos_medidos: concordancia.pasos,
      promocionable: false,
      motivo: "la parte es propiedad del plato, no del ingrediente: el mismo ingrediente cambia de parte segun la receta",
    },
  },
};

const salidas = {
  "recipeNutrition.json": recipeNutrition,
  "recipeParts.json": recipeParts,
  "_meta.json": meta,
};

mkdirSync(OUT_DIR, { recursive: true });
let cambios = 0;
for (const [nombre, datos] of Object.entries(salidas)) {
  const ruta = join(OUT_DIR, nombre);
  const texto = `${JSON.stringify(datos, null, 2)}\n`;
  let previo = null;
  try { previo = readFileSync(ruta, "utf8"); } catch { /* no existía */ }
  if (previo === texto) continue;
  cambios += 1;
  if (!CHECK) writeFileSync(ruta, texto);
  console.log(`${CHECK ? "DESFASADO" : "escrito"}  ${nombre}`);
}

console.log(`\nrecipeNutrition: ${meta.recipeNutrition.filas} filas, cobertura media ${(meta.recipeNutrition.cobertura_media * 100).toFixed(1)} %`);
console.log(`recipeParts:     ${Object.entries(cuentaOrigen).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
console.log(`operador determinista: ${(concordancia.ratio * 100).toFixed(1)} % de concordancia sobre ${concordancia.pasos} pasos → NO promocionable`);
if (!cambios) console.log("\nsin cambios: lo derivado ya estaba al día");
if (CHECK && cambios) {
  console.error(`\n[--check] ${cambios} fichero(s) derivados desfasados. Corre: node scripts/build-derived.mjs`);
  process.exit(1);
}
