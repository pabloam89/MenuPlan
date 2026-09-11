/**
 * Fase 9 — repesca de los ingredientes que salieron SIN NINGÚN CANDIDATO en
 * output/bedca-nutrition-review.json. No inventa nada: vuelve a preguntar a
 * BEDCA (gratis, sin clave) arreglando las dos razones REALES por las que se
 * quedaron a cero, las dos medidas contra el servidor:
 *
 *  1. Filas duplicadas sin macros. BEDCA tiene el mismo alimento repetido
 *     varias veces y solo una de las filas trae los valores. "Naranja" (f_id
 *     2112) devuelve null, "Lenteja, seca, cruda" devuelve null en tres de sus
 *     cuatro ids y los macros buenos en el cuarto (1065). bedca-nutrition.mjs
 *     pide la nutrición solo de los 5 mejores por nombre: si esos 5 son las
 *     copias vacías, el ingrediente sale con 0 candidatos aunque el dato exista.
 *     Aquí se baja por la lista hasta encontrar filas CON macros.
 *
 *  2. Nombre que BEDCA no usa. BEDCA escribe en singular ("Mejillón",
 *     "Sardina", "Higos y brevas") y con su propio vocabulario ("Almidón de
 *     maíz" por maicena, "Pasta alimenticia" por espaguetis). Se reintenta con
 *     el singular automático y con un diccionario de sinónimos escrito a mano.
 *
 * Lo que siga sin candidatos DESPUÉS de esto es ausencia de verdad en BEDCA
 * (sriracha, gochujang, cointreau) y se queda sin nutrición: este script nunca
 * estima un valor.
 *
 *   node scripts/bedca-repesca.mjs [--limit N] [--only id1,id2] [--fresh]
 *
 * Salida: output/bedca-repesca-review.json, con el MISMO shape que el informe
 * original ({ingredientId, ingredientName, candidates:[{foodId, foodName,
 * score, nutrition}]}) para que bedca-triage.mjs lo fusione y
 * apply-bedca-nutrition.mjs pueda consumirlo con --review. Nunca escribe en
 * src/data/ingredients.json.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

import { searchFoodByName, getFoodNutrition } from "./lib/bedcaClient.mjs";
import { words, coreWords, stem } from "./lib/bedcaState.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(ROOT, "output");
const CATALOG_PATH = join(ROOT, "src", "data", "ingredients.json");
const REVIEW_PATH = join(OUT_DIR, "bedca-nutrition-review.json");
const OUT_PATH = join(OUT_DIR, "bedca-repesca-review.json");

// Términos con los que BEDCA sí nombra estos alimentos. Solo equivalencias que
// son el MISMO alimento o el genérico del que este es una variedad — nunca un
// "parecido" (un pesto no es albahaca). Que el candidato valga lo decide
// después el triaje y la revisión; esto solo consigue que haya candidato.
const SYNONYMS = {
  // Pasta: BEDCA no conoce ningún formato por su nombre italiano, todos son
  // "Pasta alimenticia" (y distingue cruda/hervida, que es lo que importa).
  espaguetis: ["pasta alimenticia"], macarrones: ["pasta alimenticia"],
  penne: ["pasta alimenticia"], fusilli: ["pasta alimenticia"],
  farfalle: ["pasta alimenticia"], fettuccine: ["pasta alimenticia"],
  linguine: ["pasta alimenticia"], rigatoni: ["pasta alimenticia"],
  orecchiette: ["pasta alimenticia"], trofie: ["pasta alimenticia"],
  orzo: ["pasta alimenticia"], tallarines: ["pasta alimenticia"],
  "fideo-mediano": ["pasta alimenticia"], fideos: ["pasta alimenticia"],
  "placas-de-cannelones": ["pasta alimenticia"],
  ravioli: ["pasta alimenticia, rellena"],
  cuscus: ["sémola de trigo"],

  // Legumbres: el género en singular.
  lentejas: ["lenteja"], "lentejas-rojas": ["lenteja"],
  "alubias-rojas": ["judía", "alubia"], fabes: ["judía blanca"],
  garrofon: ["judía blanca"], "judias-pintas": ["judía pinta", "judía"],
  garbanzos: ["garbanzo"], edamame: ["soja"],

  // Cerdo: BEDCA nombra por especie + pieza ("Cerdo, lomo, crudo").
  "carne-de-cerdo-en-dado-aguja-o-secreto": ["cerdo, magro", "cerdo"],
  "chuletas-de-cerdo": ["cerdo, chuleta", "cerdo"],
  costilla: ["cerdo, costilla", "cerdo"],
  "filete-de-cerdo": ["cerdo, lomo", "cerdo"],
  "magro-de-cerdo": ["cerdo, magro", "cerdo"],
  "manitas-de-cerdo": ["cerdo, manos", "cerdo"],
  "oreja-de-cerdo": ["cerdo, oreja", "cerdo"],
  "medio-cochinillo": ["cochinillo", "cerdo"],
  "pluma-iberica": ["cerdo, magro", "cerdo"],
  "presa-iberica": ["cerdo, magro", "cerdo"],
  carrillada: ["cerdo, magro", "carrillera"],
  guanciale: ["cerdo, panceta", "panceta"],
  salchicha: ["salchicha"],

  // Pescado y marisco: singular y nombre común de BEDCA.
  boquerones: ["boquerón", "anchoa"], mejillones: ["mejillón"],
  sardinas: ["sardina"], langostinos: ["langostino", "gamba"],
  cigala: ["cigala", "langostino"], navaja: ["navaja", "almeja"],
  vieira: ["vieira", "zamburiña"], sepia: ["sepia", "jibia"],
  corvina: ["corvina", "lubina"],

  // Quesos: BEDCA los tiene casi todos por su nombre, pero el catálogo escribe
  // "Queso X" y BEDCA a veces solo "X" (o al revés).
  parmesano: ["queso parmesano", "parmesano"], "queso-azul": ["queso azul"],
  "queso-brie": ["queso brie", "brie"], "queso-crema": ["queso de untar", "queso fresco"],
  "queso-en-lonchas": ["queso en lonchas", "queso fundido"],
  "queso-feta": ["queso feta", "feta"], roquefort: ["queso roquefort", "roquefort"],
  mascarpone: ["queso mascarpone", "mascarpone"], ricotta: ["requesón", "ricotta"],
  burrata: ["mozzarella", "queso mozzarella"],

  // Verdura y fruta: singular o nombre botánico de BEDCA.
  aceitunas: ["aceituna"], "aceitunas-negras": ["aceituna negra", "aceituna"],
  ajete: ["ajo tierno", "ajo"], "ajetes-tiernos": ["ajo tierno", "ajo"],
  cebolleta: ["cebolla tierna", "cebolla"], chalota: ["chalota", "cebolla"],
  "coles-de-bruselas": ["col de bruselas", "bruselas"], grelo: ["grelo", "nabo"],
  higo: ["higo"], uvas: ["uva"], naranja: ["naranja"], pera: ["pera"],
  melon: ["melón"], sandia: ["sandía"], lima: ["lima", "limón"],
  arandanos: ["arándano"], apionabo: ["apio nabo", "apio"],
  "aji-amarillo": ["guindilla", "pimiento"],
  "pimientos-del-piquillo": ["pimiento"], alcaparras: ["alcaparra"],
  hinojo: ["hinojo"], boletus: ["seta", "boletus"], setas: ["seta", "champiñón"],
  "brote-tierno": ["brote", "germinado"], cilantro: ["cilantro"],
  "alga-nori": ["alga"], "alga-wakame": ["alga"],
  pinones: ["piñón"], cacahuete: ["cacahuete"],

  // Despensa y panadería.
  maicena: ["almidón de maíz", "almidón"], curcuma: ["cúrcuma", "curry"],
  granola: ["cereales de desayuno", "muesli"], "muffin-ingle": ["pan de molde", "pan"],
  obleas: ["masa", "hojaldre"], "bizcocho-de-soletilla": ["bizcocho", "galleta"],
  tahini: ["sésamo", "pasta de sésamo"], "sirope-de-arce": ["jarabe", "miel"],
  levadura: ["levadura"], "levadura-quimica": ["levadura"],

  // Alcoholes: BEDCA los tiene como bebida alcohólica destilada.
  brandy: ["brandy", "coñac"], ron: ["ron"], vodka: ["vodka"],
  cointreau: ["licor"], "pedro-ximenez": ["vino dulce", "vino"],
  sidra: ["sidra"], mirin: ["vino de arroz", "vino"],
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function argValue(flag, fallback) {
  const arg = process.argv.find((a) => a.startsWith(`--${flag}=`));
  return arg ? arg.split("=").slice(1).join("=") : fallback;
}
const LIMIT = Number(argValue("limit", "Infinity"));
const ONLY = argValue("only", null);
const FRESH = process.argv.includes("--fresh");
const RETRY_EMPTY = process.argv.includes("--retry-empty");

// Cuántas filas de BEDCA se abren buscando macros antes de rendirse. 12 es lo
// que hizo falta para los duplicados vacíos medidos (naranja, lenteja).
const MAX_NUTRITION_FETCHES = 12;
const KEEP_CANDIDATES = 5;

// Se puntúa contra el nombre del catálogo Y contra cada sinónimo, quedándose
// con el mejor. Sin esto los sinónimos no sirven de nada: "Orecchiette" no
// comparte ni una letra con "Pasta alimenticia, cruda", así que el candidato
// que la propia búsqueda por sinónimo acaba de encontrar puntuaría 0 y se
// tiraría. El sinónimo es una afirmación ("esto es pasta"), y puntuar contra
// él es lo que la respeta.
function scoreAgainst(reference, foodName) {
  const a = coreWords(reference);
  const b = coreWords(foodName);
  if (a.size === 0 || b.size === 0) return 0;
  const overlap = [...a].filter((w) => b.has(w)).length;
  return Math.round((overlap / Math.max(a.size, b.size)) * 1000) / 1000;
}
function scoreCandidate(ing, foodName) {
  const porNombre = scoreAgainst(ing.name, foodName);
  const porSinonimo = Math.max(0, ...(SYNONYMS[ing.id] ?? []).map((r) => scoreAgainst(r, foodName)));
  // `sinonimo` marca que el match NO se sostiene por el nombre del catálogo,
  // solo por la equivalencia que escribí yo aquí arriba. El triaje nunca manda
  // uno de estos a "auto": "Corvina"→"Lubina" y "Cúrcuma"→"Curry" puntúan 1
  // contra el sinónimo y son decisiones de persona, no coincidencias.
  return { score: Math.max(porNombre, porSinonimo), sinonimo: porNombre === 0 && porSinonimo > 0 };
}

function searchTermsFor(ing) {
  const ws = words(ing.name);
  const singulares = ws.map(stem).filter((w) => !ws.includes(w));
  const terms = [
    ...(SYNONYMS[ing.id] ?? []),
    ing.name,
    ...ws.sort((a, b) => b.length - a.length),
    ...singulares,
  ];
  // Mínimo 4 letras: BEDCA busca con LIKE '%término%' y devuelve como mucho
  // ~30 filas, así que un término corto se llena de basura que CONTIENE esas
  // letras — "ajo" trae 30 filas de "bajo en calorías" y ni una de "Ajo",
  // dejando fuera el alimento de verdad. Medido contra el servidor.
  return [...new Set(terms.map((t) => t.trim()).filter((t) => t.length >= 4))].slice(0, 5);
}

const catalog = JSON.parse(readFileSync(CATALOG_PATH, "utf8"));
const byId = new Map(catalog.map((i) => [i.id, i]));
const review = JSON.parse(readFileSync(REVIEW_PATH, "utf8"));

const onlySet = ONLY ? new Set(ONLY.split(",")) : null;
const targets = review
  .filter((e) => e.candidates.length === 0)
  .map((e) => byId.get(e.ingredientId))
  .filter((ing) => ing && ing.nutrition == null && (!onlySet || onlySet.has(ing.id)))
  .slice(0, LIMIT);

mkdirSync(OUT_DIR, { recursive: true });
let out = !FRESH && existsSync(OUT_PATH) ? JSON.parse(readFileSync(OUT_PATH, "utf8")) : [];
// --retry-empty: vuelve a intentar solo los que quedaron sin candidato (útil
// tras tocar SYNONYMS o el scoring) sin repetir los que ya salieron bien.
if (RETRY_EMPTY) out = out.filter((e) => e.candidates.length > 0);
const done = new Set(out.map((e) => e.ingredientId));

console.log(`Repesca BEDCA para ${targets.length} ingredientes sin candidato (${done.size} ya hechos)\n`);

const stats = { resuelto: 0, sinFilas: 0, sinMacros: 0 };
for (const ing of targets) {
  if (done.has(ing.id)) continue;
  const terms = searchTermsFor(ing);
  const seen = new Map();
  let searchHits = 0;
  for (const term of terms) {
    try {
      const results = await searchFoodByName(term);
      searchHits += results.length;
      for (const r of results) seen.set(r.id, r);
    } catch (err) {
      console.error(`  ! ${ing.name}: búsqueda "${term}" falló (${err.message})`);
    }
    await sleep(120);
    if (seen.size >= 40) break;
  }

  const ranked = [...seen.values()]
    .map((f) => ({ foodId: f.id, foodName: f.name, ...scoreCandidate(ing, f.name) }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score);

  const candidates = [];
  for (const c of ranked.slice(0, MAX_NUTRITION_FETCHES)) {
    const nutrition = await getFoodNutrition(c.foodId);
    await sleep(120);
    if (nutrition) candidates.push({ ...c, nutrition, via: "repesca" });
    if (candidates.length >= KEEP_CANDIDATES) break;
  }

  const entry = { ingredientId: ing.id, ingredientName: ing.name, terminos: terms, filasVistas: seen.size, candidates };
  out.push(entry);
  writeFileSync(OUT_PATH, `${JSON.stringify(out, null, 2)}\n`, "utf8");

  let estado;
  if (candidates.length > 0) { estado = `${candidates.length} candidatos (mejor: "${candidates[0].foodName}", ${candidates[0].score})`; stats.resuelto++; }
  else if (searchHits === 0) { estado = `BEDCA no devuelve nada para ${terms.map((t) => `"${t}"`).join(", ")}`; stats.sinFilas++; }
  else if (ranked.length === 0) { estado = `${seen.size} filas, ninguna es el mismo alimento (ruido del LIKE)`; stats.sinFilas++; }
  else { estado = `${ranked.length} filas del alimento pero ninguna con macros`; stats.sinMacros++; }
  console.log(`  ${ing.name.padEnd(34)} ${estado}`);
}

console.log(`\nResuelto (ya hay candidato): ${stats.resuelto}`);
console.log(`Sin filas en BEDCA:          ${stats.sinFilas}`);
console.log(`Filas sin macros:            ${stats.sinMacros}`);
console.log(`\nEscrito → ${OUT_PATH}`);
console.log(`Nada aplicado al catálogo. Siguiente: node scripts/bedca-triage.mjs`);
