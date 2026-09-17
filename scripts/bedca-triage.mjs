/**
 * Fase 9 — triaje del informe de BEDCA ANTES de que decida nadie (ni Pablo ni
 * un LLM). Lee output/bedca-nutrition-review.json (y, si existe, la repesca de
 * scripts/bedca-repesca.mjs), se salta lo que ya tiene nutrición en el catálogo
 * y clasifica cada ingrediente pendiente en cuatro clases:
 *
 *   auto           candidato único o score >= 0.8, estado coherente, no es otro
 *                  alimento y sus kcal cuadran con sus macros (Atwater). Es lo
 *                  que apply-bedca-nutrition.mjs puede escribir sin que nadie
 *                  mire.
 *   revisar        hay candidatos plausibles pero la elección no es obvia
 *                  (varios, o score bajo). Es la entrada de bedca-select.mjs.
 *   rechazar       el mejor candidato está en OTRO ESTADO de cocinado que el
 *                  ingrediente (la trampa de las lentejas: 24 g de proteína en
 *                  seco, 9,5 g cocidas) o es directamente otro alimento
 *                  ("Carne de zamburiña" → "Empanada de carne").
 *   sin_candidato  BEDCA no devolvió nada utilizable.
 *
 * NO escribe en src/data/ingredients.json (es FUENTE) ni llama a ninguna IA.
 *
 *   node scripts/bedca-triage.mjs [--review=output/bedca-nutrition-review.json]
 *                                 [--repesca=output/bedca-repesca-review.json]
 *
 * Salida: output/bedca-triage.json
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

import { atwaterCheck } from "./lib/bedcaAtwater.mjs";
import { cookState, statesCompatible, looksLikeOtherFood, coreWords } from "./lib/bedcaState.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(ROOT, "output");
const CATALOG_PATH = join(ROOT, "src", "data", "ingredients.json");

function argValue(flag, fallback) {
  const arg = process.argv.find((a) => a.startsWith(`--${flag}=`));
  return arg ? arg.split("=").slice(1).join("=") : fallback;
}

const REVIEW_PATH = join(ROOT, argValue("review", "output/bedca-nutrition-review.json"));
const REPESCA_PATH = join(ROOT, argValue("repesca", "output/bedca-repesca-review.json"));
const OUT_PATH = join(OUT_DIR, "bedca-triage.json");

const AUTO_SCORE = 0.8;
// Suelo para el "candidato único". Sin él, un ingrediente cuyo ÚNICO candidato
// es malo entra en auto solo por estar solo: medido sobre el informe real,
// "Alitas de pollo" → "Grasa de pollo" (0,5) y "Fabes de la granja secas" →
// "Conejo de granja, carne, cruda" (0,25) — los dos con estado coherente y
// Atwater correcto. Estar solo no es ser bueno. Con el suelo bajan a revisar.
const AUTO_MIN_SCORE = Number(argValue("auto-min-score", "0.6"));

// Los umbrales viven en scripts/lib/bedcaAtwater.mjs, compartidos con
// apply-bedca-nutrition.mjs: son el mismo juicio sobre la misma fila.
function atwaterOk(nutrition, foodName, ingredientName) {
  const { ok, diff } = atwaterCheck(nutrition, foodName, ingredientName);
  return { ok, diff };
}

// El score del informe penaliza a BEDCA por describir bien: "Apio" contra
// "Apio, crudo" saca 0,5 (1 palabra en común de 2) siendo el match perfecto.
// Aquí se recalcula quitando de LOS DOS lados las palabras de estado —que ya
// vigila statesCompatible, no hace falta que también puntúen— y comparando en
// singular, para que "Lentejas" y "Lenteja, seca, cruda" no fallen por la "s".
// Se usa el MÁXIMO entre el score original y este: el limpio sube los buenos,
// nunca hunde a uno que ya iba bien.
function cleanScore(ingredientName, foodName) {
  const a = coreWords(ingredientName);
  const b = coreWords(foodName);
  if (a.size === 0 || b.size === 0) return 0;
  const overlap = [...a].filter((w) => b.has(w)).length;
  return Math.round((overlap / Math.max(a.size, b.size)) * 1000) / 1000;
}

function annotate(ingredientName, candidate) {
  const compatible = statesCompatible(ingredientName, candidate.foodName);
  const other = looksLikeOtherFood(ingredientName, candidate.foodName);
  const atwater = atwaterOk(candidate.nutrition, candidate.foodName, ingredientName);
  const limpio = cleanScore(ingredientName, candidate.foodName);
  // Un candidato que solo puntúa porque la repesca lo buscó por un sinónimo
  // escrito a mano ("Pasta alimenticia" para "Orecchiette") no comparte ni una
  // palabra con el ingrediente: el score lo pone la equivalencia, no el dato.
  // Eso es una decisión, así que va a revisar, nunca a auto.
  const viaSinonimo = candidate.sinonimo === true || (candidate.via === "repesca" && limpio === 0 && candidate.score > 0);
  return {
    viaSinonimo,
    ...candidate,
    scoreLimpio: limpio,
    scoreEfectivo: Math.max(candidate.score, limpio),
    estadoIngrediente: cookState(ingredientName),
    estadoCandidato: cookState(candidate.foodName),
    estadoCoherente: compatible,
    otroAlimento: other.other,
    motivoOtroAlimento: other.reason,
    tipoOtroAlimento: other.kind,
    atwaterOk: atwater.ok,
    atwaterDiff: Math.round(atwater.diff),
  };
}

const catalog = JSON.parse(readFileSync(CATALOG_PATH, "utf8"));
const byId = new Map(catalog.map((ing) => [ing.id, ing]));

const review = JSON.parse(readFileSync(REVIEW_PATH, "utf8"));
// La repesca no sustituye al informe: aporta candidatos para ingredientes que
// se habían quedado a cero. Se fusiona por id, sin pisar lo que ya había.
const repesca = existsSync(REPESCA_PATH) ? JSON.parse(readFileSync(REPESCA_PATH, "utf8")) : [];
const repescaById = new Map(repesca.map((e) => [e.ingredientId, e]));

const rows = [];
for (const entry of review) {
  const ing = byId.get(entry.ingredientId);
  if (!ing) continue; // el catálogo cambió desde que se generó el informe
  if (ing.nutrition != null) continue; // ya resuelto, no es trabajo pendiente

  const extra = repescaById.get(entry.ingredientId)?.candidates ?? [];
  const seen = new Set(entry.candidates.map((c) => c.foodId));
  const raw = [...entry.candidates, ...extra.filter((c) => !seen.has(c.foodId))];

  const candidates = raw
    .map((c) => annotate(ing.name, c))
    .sort((a, b) => b.scoreEfectivo - a.scoreEfectivo || b.score - a.score);

  const best = candidates[0] ?? null;
  const coherentes = candidates.filter((c) => c.estadoCoherente && !c.otroAlimento);

  let clase;
  let motivo;
  if (candidates.length === 0) {
    clase = "sin_candidato";
    motivo = "BEDCA no devolvió ningún candidato con macros";
  } else if (!best.estadoCoherente) {
    clase = "rechazar";
    motivo = `estado distinto: el ingrediente es "${best.estadoIngrediente}" y el mejor candidato ("${best.foodName}") es "${best.estadoCandidato}"`;
  // El sinónimo es la excepción a "no comparten ninguna palabra": el
  // diccionario de la repesca existe PRECISAMENTE para los alimentos que BEDCA
  // nombra de otra forma (Espaguetis -> "Pasta alimenticia", Fabes -> "Judía
  // blanca", Edamame -> "Soja"). Rechazarlos por no solapar es rechazarlos por
  // la razón por la que se buscaron. Van a revisar, que es donde se separa ese
  // acierto de un "Cúrcuma -> Curry". Lo que NO se perdona es el estado de
  // cocinado (arriba) ni que el candidato sea otra preparación.
  } else if (best.otroAlimento && !(best.viaSinonimo && best.tipoOtroAlimento === "sin_solape")) {
    clase = "rechazar";
    motivo = `otro alimento: ${best.motivoOtroAlimento} ("${best.foodName}", score ${best.scoreEfectivo})`;
  } else if (!best.atwaterOk) {
    clase = "revisar";
    motivo = `el mejor candidato no cuadra con Atwater (${best.atwaterDiff >= 0 ? "+" : ""}${best.atwaterDiff} kcal/100g): fila sospechosa de BEDCA`;
  } else if (best.viaSinonimo) {
    clase = "revisar";
    motivo = `encontrado por sinónimo, no por su nombre ("${best.foodName}"): lo confirma una persona o el LLM`;
  } else if ((candidates.length === 1 || best.scoreEfectivo >= AUTO_SCORE) && best.scoreEfectivo >= AUTO_MIN_SCORE) {
    clase = "auto";
    motivo = candidates.length === 1
      ? `candidato único, estado coherente ("${best.foodName}", score ${best.scoreEfectivo})`
      : `score ${best.scoreEfectivo} >= ${AUTO_SCORE} y estado coherente ("${best.foodName}")`;
  } else if (candidates.length === 1) {
    clase = "revisar";
    motivo = `candidato único pero flojo (score ${best.scoreEfectivo} < ${AUTO_MIN_SCORE}): "${best.foodName}"`;
  } else {
    clase = "revisar";
    motivo = `${candidates.length} candidatos, mejor score ${best.scoreEfectivo} < ${AUTO_SCORE}`;
  }

  rows.push({
    ingredientId: entry.ingredientId,
    ingredientName: ing.name,
    category: ing.category,
    aisle: ing.aisle,
    clase,
    motivo,
    mejorScore: best?.scoreEfectivo ?? null,
    mejorScoreInforme: best?.score ?? null,
    mejorCandidato: best ? { foodId: best.foodId, foodName: best.foodName } : null,
    // Para los rechazados: ¿había abajo un candidato que sí valía? Si lo hay,
    // no es un caso perdido, es un caso para bedca-select.mjs.
    alternativasCoherentes: coherentes.length,
    candidates,
  });
}

const byClase = (c) => rows.filter((r) => r.clase === c);
const counts = {
  auto: byClase("auto").length,
  revisar: byClase("revisar").length,
  rechazar: byClase("rechazar").length,
  sin_candidato: byClase("sin_candidato").length,
};

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_PATH, `${JSON.stringify({ generadoEn: new Date().toISOString(), counts, rows }, null, 2)}\n`, "utf8");

console.log(`Pendientes de nutrición: ${rows.length} (de ${catalog.length} ingredientes; ${catalog.filter((i) => i.nutrition).length} ya la tienen)\n`);
for (const clase of ["auto", "revisar", "rechazar", "sin_candidato"]) {
  console.log(`  ${clase.padEnd(14)} ${String(counts[clase]).padStart(4)}`);
}
const soloPorEstarSolo = rows.filter((r) => r.clase === "revisar" && r.candidates.length === 1).length;
console.log(`\n  (sin el suelo de score ${AUTO_MIN_SCORE} para el candidato único, auto sería ${counts.auto + soloPorEstarSolo} y revisar ${counts.revisar - soloPorEstarSolo}: esos ${soloPorEstarSolo} entran en auto solo por no tener rival)`);
const rescatables = byClase("rechazar").filter((r) => r.alternativasCoherentes > 0).length;
console.log(`\n  de los "rechazar", ${rescatables} tienen algún candidato coherente por debajo del mejor (van a revisar manual/LLM, no a la basura)`);

for (const clase of ["auto", "revisar", "rechazar"]) {
  console.log(`\n── ejemplos de ${clase} ──`);
  for (const r of byClase(clase).slice(0, 8)) {
    console.log(`  ${r.ingredientName.padEnd(34)} ${r.motivo}`);
  }
}

console.log(`\nEscrito → ${OUT_PATH}`);
console.log(`Nada aplicado al catálogo: eso es scripts/apply-bedca-nutrition.mjs.`);
