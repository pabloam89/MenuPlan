/**
 * Fase 9 — aplica los candidatos de output/bedca-nutrition-review.json (ver
 * scripts/bedca-nutrition.mjs) a src/data/ingredients.json. Solo entran los
 * que pasan DOS filtros, no solo el score de nombre:
 *
 *   1. score de nombre >= MIN_SCORE (por defecto 1 — coincidencia exacta).
 *   2. consistencia de Atwater: kcal declarado ≈ 4·proteína + 4·carbohidratos
 *      + 9·grasa (± TOLERANCE). BEDCA a veces tiene el mismo alimento
 *      duplicado con un kcal corrupto en una fila y correcto en otra (caso
 *      real encontrado: "Kéfir" → un id con 0.8 kcal/100g, otro con 63.9,
 *      mismos macros en las dos — la fórmula de Atwater descarta la mala sin
 *      necesidad de mirarlo a mano). Si HAY varios candidatos con el mismo
 *      score, se prefiere el que pasa Atwater sobre el que no.
 *
 * Nunca escribe silenciosamente algo que no pasa los dos filtros: se queda
 * fuera y aparece en el resumen final para revisión manual.
 *
 *   node scripts/apply-bedca-nutrition.mjs [--dry-run] [--min-score=1]
 */
import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const REVIEW_PATH = join(ROOT, "output", "bedca-nutrition-review.json");
const CATALOG_PATH = join(ROOT, "src", "data", "ingredients.json");

const DRY_RUN = process.argv.includes("--dry-run");
const minScoreArg = process.argv.find((a) => a.startsWith("--min-score"));
const MIN_SCORE = minScoreArg ? Number(minScoreArg.split("=")[1] ?? process.argv[process.argv.indexOf(minScoreArg) + 1]) : 1;
// Asimétrico a propósito, y NO en porcentaje relativo a lo esperado (un
// alimento casi sin proteína/carbos/grasa —alcohol puro— tendría un "esperado"
// cercano a 0, y cualquier kcal real dispararía un porcentaje absurdo sin
// significar nada malo). kcal POR DEBAJO de lo que ya garantizan sus propias
// macros (fórmula de Atwater, 4/4/9 kcal/g) no tiene explicación legítima —
// es justo el bug real que este script encontró en BEDCA: "Kéfir" tenía dos
// filas con los MISMOS macros pero una decía 0,8 kcal/100g y la otra 63,9 (la
// consistente con Atwater). kcal POR ENCIMA sí tiene explicaciones legítimas
// que el 4/4/9 no cuenta —el alcohol aporta ~7 kcal/g y aparece con
// normalidad en vino/cerveza/licores—, así que ahí no se compara contra lo
// esperado: solo se pone un techo físico absoluto (nada comestible real
// supera con holgura la grasa pura, 900 kcal/100g) para pillar un kJ
// etiquetado como kcal por error, no una razón nutricional de verdad.
const LOW_TOLERANCE_ABS = 5; // kcal de margen fijo, además del relativo
const LOW_TOLERANCE_REL = 0.15;
const ABSOLUTE_KCAL_CEILING = 920;

function atwaterDeviation({ kcal100g, protein100g, carbs100g, fat100g }) {
  const expectedMin = 4 * protein100g + 4 * carbs100g + 9 * fat100g;
  const diff = kcal100g - expectedMin;
  const tooLow = diff < -Math.max(expectedMin * LOW_TOLERANCE_REL, LOW_TOLERANCE_ABS);
  const tooHigh = kcal100g > ABSOLUTE_KCAL_CEILING;
  return { diff, ok: !tooLow && !tooHigh };
}

function bestValidCandidate(candidates) {
  const scored = candidates.map((c) => {
    const { diff, ok } = atwaterDeviation(c.nutrition);
    return { ...c, diff, deviation: Math.abs(diff), atwaterOk: ok };
  });
  const eligible = scored.filter((c) => c.score >= MIN_SCORE && c.atwaterOk);
  if (eligible.length === 0) return { accepted: null, rejectedReason: reasonFor(scored) };
  // Entre empates de score, gana el más consistente con Atwater.
  eligible.sort((a, b) => b.score - a.score || a.deviation - b.deviation);
  return { accepted: eligible[0], rejectedReason: null };
}

function reasonFor(scored) {
  if (scored.length === 0) return "sin candidatos";
  const best = [...scored].sort((a, b) => b.score - a.score || a.deviation - b.deviation)[0];
  if (best.score < MIN_SCORE) return `mejor score ${best.score} < ${MIN_SCORE}`;
  return `kcal fuera de rango frente a sus macros (Atwater ${best.diff >= 0 ? "+" : ""}${best.diff.toFixed(0)} kcal/100g) en el mejor candidato por nombre`;
}

const review = JSON.parse(readFileSync(REVIEW_PATH, "utf8"));
const original = readFileSync(CATALOG_PATH, "utf8");
const usesCrlf = original.includes("\r\n");
const catalog = JSON.parse(original);
const byId = new Map(catalog.map((ing) => [ing.id, ing]));

let applied = 0, skippedNoCandidates = 0, skippedFiltered = 0, skippedAlreadySet = 0;
const rejectedLog = [];

for (const entry of review) {
  const ing = byId.get(entry.ingredientId);
  if (!ing) continue; // catálogo cambió desde que se generó el informe
  if (ing.nutrition != null) { skippedAlreadySet++; continue; }
  if (entry.candidates.length === 0) { skippedNoCandidates++; continue; }

  const { accepted, rejectedReason } = bestValidCandidate(entry.candidates);
  if (!accepted) {
    skippedFiltered++;
    rejectedLog.push(`${entry.ingredientId.padEnd(28)} ${rejectedReason}`);
    continue;
  }

  ing.nutrition = accepted.nutrition;
  applied++;
  console.log(`✅  ${entry.ingredientId.padEnd(28)} ← "${accepted.foodName}" (score ${accepted.score}, kcal vs. Atwater: ${accepted.diff >= 0 ? "+" : ""}${accepted.diff.toFixed(0)})`);
}

if (!DRY_RUN && applied > 0) {
  const json = `${JSON.stringify(catalog, null, 2)}\n`;
  writeFileSync(CATALOG_PATH, usesCrlf ? json.replaceAll("\n", "\r\n") : json, "utf8");
}

console.log(`\n✨  ${DRY_RUN ? "[dry-run] " : ""}Aplicados: ${applied}. Sin candidatos: ${skippedNoCandidates}. Filtrados (score/Atwater): ${skippedFiltered}. Ya tenían nutrición: ${skippedAlreadySet}.`);
if (rejectedLog.length > 0) {
  console.log(`\nFiltrados (para revisar a mano más adelante, bajando --min-score o mirando el candidato manualmente):`);
  for (const line of rejectedLog) console.log(`  ${line}`);
}
