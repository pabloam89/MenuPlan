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
 *        [--review=a.json,b.json] [--choices=output/bedca-choices.json]
 *
 * ── Decisiones explícitas (--choices) ──────────────────────────────────────
 * Sin --choices este script decide solo, por score de nombre. Eso deja fuera a
 * propósito todo lo que no sea una coincidencia literal, y son la mayoría: el
 * catálogo dice "Pechuga de pollo" donde BEDCA dice "Pollo, pechuga, cruda".
 * --choices es el canal para meter una decisión TOMADA (por Pablo o por
 * scripts/bedca-select.mjs): un JSON
 *
 *   { "<ingredientId>": { "foodId": 1065 | null, "motivo": "...", ... } }
 *
 * foodId = se aplica ESE candidato aunque su score sea bajo (alguien lo ha
 *          mirado), pero SIGUE pasando el filtro de Atwater: una decisión
 *          humana no arregla una fila corrupta de BEDCA.
 * null   = decidido que NINGÚN candidato vale. Se salta y no vuelve a
 *          proponerse, que es distinto de "todavía no se ha mirado".
 * Un ingrediente sin entrada en el fichero sigue el camino automático de
 * siempre. Los ids que no estén en el informe se avisan, no se ignoran.
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";

import { atwaterCheck } from "./lib/bedcaAtwater.mjs";
import { statesCompatible, looksLikeOtherFood } from "./lib/bedcaState.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const CATALOG_PATH = join(ROOT, "src", "data", "ingredients.json");

const DRY_RUN = process.argv.includes("--dry-run");
const minScoreArg = process.argv.find((a) => a.startsWith("--min-score"));
const MIN_SCORE = minScoreArg ? Number(minScoreArg.split("=")[1] ?? process.argv[process.argv.indexOf(minScoreArg) + 1]) : 1;
function argValue(flag, fallback) {
  const arg = process.argv.find((a) => a.startsWith(`--${flag}=`));
  return arg ? arg.split("=").slice(1).join("=") : fallback;
}
// Varios informes separados por coma: el original y la repesca de
// scripts/bedca-repesca.mjs, que aporta candidatos a los que salieron a cero.
const REVIEW_PATHS = argValue("review", "output/bedca-nutrition-review.json").split(",").map((p) => resolve(ROOT, p.trim()));
const CHOICES_PATH = argValue("choices", null);
// Los umbrales y el porqué viven en scripts/lib/bedcaAtwater.mjs, compartidos
// con el triaje para que no se bifurquen.
function atwaterDeviation(nutrition, foodName, ingredientName, candidato) {
  // Un candidato que llega con `atwaterVerificado` ya pasó el filtro en su
  // origen, y con la convención de energía de SU fuente. No se vuelve a
  // comprobar aquí, y no es una excepción de conveniencia: las tablas no
  // cuentan la energía igual. CIQUAL declara la suya según el Reglamento UE
  // 1169/2011, que suma la fibra a 2 kcal/g; BEDCA no la suma —medido: sus
  // fichas con más de 5 g de fibra dan +1 % con 4/4/9, o sea que ya está
  // descontada—. Aplicar aquí la fórmula de BEDCA a una ficha de CIQUAL
  // rechazaba ocho fichas correctas, entre ellas «Basil, fresh» y «Chick pea,
  // boiled», solo por la fibra que una tabla cuenta y la otra no.
  if (candidato?.atwaterVerificado) return { diff: 0, ok: true };
  const { diff, ok } = atwaterCheck(nutrition, foodName, ingredientName);
  return { diff, ok };
}

// Las dos reglas duras del triaje (scripts/lib/bedcaState.mjs), aplicadas
// también aquí. No son un lujo: el camino automático se guía por un score de
// nombre, y la repesca por sinónimo devuelve score 1 POR CONSTRUCCIÓN —lo pone
// el diccionario escrito a mano, no el parecido—, así que sin esto una pasada
// con --review=...,bedca-repesca-review.json escribía con un ✅ "Corvina ←
// Lubina", "Cúrcuma ← Curry" y "Cebolleta ← Cebolla, hervida". Nada de eso es
// un fallo de la repesca —su trabajo es CONSEGUIR candidato—: es que elegir
// entre ellos es una decisión, y las decisiones entran por --choices
// (scripts/bedca-select.mjs o a mano), nunca por score.
function hardFilter(ingredientName, candidate) {
  if (!statesCompatible(ingredientName, candidate.foodName)) {
    return `estado de cocinado distinto ("${candidate.foodName}")`;
  }
  const other = looksLikeOtherFood(ingredientName, candidate.foodName);
  if (other.other) return `${other.reason} ("${candidate.foodName}")`;
  return null;
}

function bestValidCandidate(candidates, ingredientName) {
  const scored = candidates.map((c) => {
    const { diff, ok } = atwaterDeviation(c.nutrition, c.foodName, ingredientName, c);
    return { ...c, diff, deviation: Math.abs(diff), atwaterOk: ok, veto: hardFilter(ingredientName, c) };
  });
  const eligible = scored.filter((c) => c.score >= MIN_SCORE && c.atwaterOk && !c.veto);
  if (eligible.length === 0) return { accepted: null, rejectedReason: reasonFor(scored) };
  // Entre empates de score, gana el más consistente con Atwater.
  eligible.sort((a, b) => b.score - a.score || a.deviation - b.deviation);
  return { accepted: eligible[0], rejectedReason: null };
}

function reasonFor(scored) {
  if (scored.length === 0) return "sin candidatos";
  const best = [...scored].sort((a, b) => b.score - a.score || a.deviation - b.deviation)[0];
  if (best.score < MIN_SCORE) return `mejor score ${best.score} < ${MIN_SCORE}`;
  if (best.veto) return `${best.veto}: es una decisión, va por --choices`;
  return `kcal fuera de rango frente a sus macros (Atwater ${best.diff >= 0 ? "+" : ""}${best.diff.toFixed(0)} kcal/100g) en el mejor candidato por nombre`;
}

// Fusión de informes por ingrediente: se acumulan candidatos, sin duplicar
// foodId, en el orden en que llegan los ficheros.
const review = [];
const reviewIndex = new Map();
for (const path of REVIEW_PATHS) {
  for (const entry of JSON.parse(readFileSync(path, "utf8"))) {
    const existing = reviewIndex.get(entry.ingredientId);
    if (!existing) {
      const copy = { ...entry, candidates: [...entry.candidates] };
      reviewIndex.set(entry.ingredientId, copy);
      review.push(copy);
      continue;
    }
    const seen = new Set(existing.candidates.map((c) => c.foodId));
    for (const c of entry.candidates) if (!seen.has(c.foodId)) existing.candidates.push(c);
  }
}

const choices = CHOICES_PATH && existsSync(resolve(ROOT, CHOICES_PATH))
  ? JSON.parse(readFileSync(resolve(ROOT, CHOICES_PATH), "utf8"))
  : null;
if (CHOICES_PATH && !choices) {
  console.error(`❌ No existe el fichero de decisiones ${CHOICES_PATH}`);
  process.exit(1);
}

const original = readFileSync(CATALOG_PATH, "utf8");
const usesCrlf = original.includes("\r\n");
const catalog = JSON.parse(original);
const byId = new Map(catalog.map((ing) => [ing.id, ing]));

let applied = 0, skippedNoCandidates = 0, skippedFiltered = 0, skippedAlreadySet = 0;
let appliedByChoice = 0, skippedByChoice = 0;
const rejectedLog = [];

if (choices) {
  const unknown = Object.keys(choices).filter((id) => !reviewIndex.has(id));
  if (unknown.length > 0) console.warn(`⚠️  ${unknown.length} decisiones apuntan a ingredientes que no están en el informe: ${unknown.join(", ")}`);
}

/**
 * Ingredientes cuya nutrición está EN USO pero no la firma nadie: en
 * alimentos.json salen con `fuente: heredado`. Para ellos sí se pisa el valor,
 * y no es una excepción de conveniencia sino el trinquete de siempre leído al
 * derecho: el constructor se niega a sustituir un número por otro con MENOS
 * procedencia, y aquí la gana. Un valor con ficha manda sobre uno sin ella
 * aunque el segundo parezca más bonito.
 *
 * Importa además por una razón que no es de trazabilidad: un número sin ficha
 * tampoco tiene la convención de unidades de esa ficha. Así es como el sodio
 * acabó en gramos en unas filas y en miligramos en el resto.
 */
const ALIMENTOS_PATH = join(ROOT, "src", "data", "alimentos.json");
const alimentos = existsSync(ALIMENTOS_PATH) ? JSON.parse(readFileSync(ALIMENTOS_PATH, "utf8")) : [];
const sinFuente = new Set(alimentos.filter((a) => a.fuente === "heredado").map((a) => a.id));

/**
 * Qué ficha CITA cada fila hoy, y con qué números.
 *
 * Hace falta porque citar una ficha y contradecirla son cosas distintas y el
 * catálogo hacía las dos a la vez. La recuperación de procedencia adjudicaba
 * una ficha a una fila cuando coincidían los CUATRO macros duros —kcal,
 * proteína, hidratos y grasa— y daba por buenos los otros cuatro sin mirarlos.
 * Once filas de 196 llevaban así un sodio en gramos y un azúcar inventado
 * donde su propia ficha dice `null`:
 *
 *   Mantequilla salada   sodio 0,011 y la ficha 870      azúcar 0,5 y la ficha null
 *   Zanahoria, cruda     sodio 0,069 y la ficha 70       azúcar 4,7 y la ficha null
 *   Pimentón, en polvo   sodio 0,068 y la ficha 34       fibra 34,9 y la ficha 20
 *
 * Esos números no salieron nunca de BEDCA. La regla es cítala o no la cites,
 * pero no la cites y la contradigas: si la fila ya nombra esa ficha, adoptar
 * sus valores no cambia de fuente, solo deja de mentir sobre la que hay.
 */
const CAMPOS_NUTRICION = [
  "kcal100g", "protein100g", "carbs100g", "fat100g",
  "fiber100g", "sugar100g", "saturatedFat100g", "sodium100g",
  // Al añadir los micronutrientes esta lista se quedó corta y la reparación no
  // saltaba: las filas citaban una ficha que ya traía hierro y colesterol y
  // ellas no los tenían, pero la comparación no miraba esos dos campos. Un
  // campo nuevo en la nutrición hay que añadirlo AQUÍ o la fila se queda a
  // medias sin que nada lo diga.
  "iron100g", "cholesterol100g",
];
const fichaCitada = new Map(
  alimentos.filter((a) => a.fuenteId != null && a.nutricion).map((a) => [a.id, String(a.fuenteId)]),
);
const contradiceSuFicha = (ing, candidato) =>
  fichaCitada.get(ing.id) === String(candidato.foodId) &&
  CAMPOS_NUTRICION.some((c) => !Object.is(ing.nutrition?.[c] ?? null, candidato.nutrition?.[c] ?? null));

for (const entry of review) {
  const ing = byId.get(entry.ingredientId);
  if (!ing) continue; // catálogo cambió desde que se generó el informe
  // Se pisa un valor ya puesto en dos casos, y en ninguno se elige fuente nueva:
  //   - no tiene ninguna, y hay una decisión escrita a mano que se la da;
  //   - tiene una y la contradice, y se adoptan los números de la que ya cita.
  // Sin una de las dos no se toca nada: el camino automático se guía por un
  // score de nombre y no basta para sobrescribir.
  const decidida = choices?.[entry.ingredientId]?.foodId;
  const reparable = entry.candidates.find((c) => contradiceSuFicha(ing, c));
  const pisable = (sinFuente.has(entry.ingredientId) && decidida != null) || reparable != null;
  if (ing.nutrition != null && !pisable) { skippedAlreadySet++; continue; }

  if (ing.nutrition != null && reparable && decidida == null) {
    const malos = CAMPOS_NUTRICION.filter(
      (c) => !Object.is(ing.nutrition[c] ?? null, reparable.nutrition?.[c] ?? null),
    );
    ing.nutrition = reparable.nutrition;
    applied++;
    console.log(
      `🔧  ${entry.ingredientId.padEnd(28)} ← "${reparable.foodName}" (ya la citaba y la contradecía en ${malos.join(", ")})`,
    );
    continue;
  }

  // Una decisión explícita gana al score, pero no al filtro de Atwater.
  const choice = choices?.[entry.ingredientId];
  if (choice !== undefined) {
    if (choice?.foodId == null) {
      skippedByChoice++;
      continue;
    }
    const chosen = entry.candidates.find((c) => c.foodId === choice.foodId);
    if (!chosen) {
      rejectedLog.push(`${entry.ingredientId.padEnd(28)} decisión con foodId ${choice.foodId}, que no está entre sus candidatos`);
      skippedFiltered++;
      continue;
    }
    const { ok, diff } = atwaterDeviation(chosen.nutrition, chosen.foodName, ing.name, chosen);
    if (!ok) {
      rejectedLog.push(`${entry.ingredientId.padEnd(28)} decidido "${chosen.foodName}" pero sus kcal no cuadran con sus macros (Atwater ${diff >= 0 ? "+" : ""}${diff.toFixed(0)})`);
      skippedFiltered++;
      continue;
    }
    ing.nutrition = chosen.nutrition;
    applied++;
    appliedByChoice++;
    console.log(`✅  ${entry.ingredientId.padEnd(28)} ← "${chosen.foodName}" (decidido${choice.motivo ? `: ${choice.motivo}` : ""})`);
    continue;
  }

  if (entry.candidates.length === 0) { skippedNoCandidates++; continue; }

  const { accepted, rejectedReason } = bestValidCandidate(entry.candidates, ing.name);
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

console.log(`\n✨  ${DRY_RUN ? "[dry-run] " : ""}Aplicados: ${applied}${choices ? ` (${appliedByChoice} por decisión explícita)` : ""}. Sin candidatos: ${skippedNoCandidates}. Filtrados (score/Atwater): ${skippedFiltered}. Ya tenían nutrición: ${skippedAlreadySet}.${choices ? ` Decididos a null: ${skippedByChoice}.` : ""}`);
if (rejectedLog.length > 0) {
  console.log(`\nFiltrados (para revisar a mano más adelante, bajando --min-score o mirando el candidato manualmente):`);
  for (const line of rejectedLog) console.log(`  ${line}`);
}
