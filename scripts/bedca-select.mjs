/**
 * Fase 9 — elección asistida por LLM del candidato de BEDCA para los
 * ingredientes que el triaje (scripts/bedca-triage.mjs) dejó en "revisar":
 * hay candidatos plausibles pero ninguno gana solo por el nombre.
 *
 * El modelo NO inventa nutrición. Su única salida es un foodId de la lista que
 * se le da, o null. Los valores que se acaben aplicando salen siempre de
 * BEDCA, nunca del texto del modelo — por eso la respuesta se valida contra
 * los foodId enviados y cualquier otra cosa se trata como null.
 *
 * Salida: output/bedca-choices.json, el fichero de decisiones que consume
 *   node scripts/apply-bedca-nutrition.mjs --choices=output/bedca-choices.json
 *
 *   node scripts/bedca-select.mjs --dry-run          # no llama, solo cuenta y cotiza
 *   node scripts/bedca-select.mjs --model=claude-haiku-4-5
 *
 * --dry-run no necesita clave: imprime cuántas entradas irían, los tokens
 * estimados y el coste con los dos modelos, y escribe el payload real en
 * output/bedca-select-payload.json para poder leer lo que se enviaría.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(ROOT, "output");
const TRIAGE_PATH = join(OUT_DIR, "bedca-triage.json");
const CHOICES_PATH = join(OUT_DIR, "bedca-choices.json");
const PAYLOAD_PATH = join(OUT_DIR, "bedca-select-payload.json");

function has(flag) { return process.argv.includes(`--${flag}`); }
function val(flag, fallback) {
  const arg = process.argv.find((a) => a.startsWith(`--${flag}=`));
  return arg ? arg.split("=").slice(1).join("=") : fallback;
}

const DRY_RUN = has("dry-run");
const INCLUDE_REJECTED = has("incluir-rechazados");
const BATCH_SIZE = Math.max(1, Number(val("batch", "8")));
const MODEL = val("model", "claude-sonnet-5");

// Precios oficiales por millón de tokens (input/output). Sonnet 5 es el modelo
// por defecto; Haiku 4.5 es la alternativa barata para una tarea que es "elige
// de esta lista", no redacción.
const PRICES = {
  "claude-sonnet-5": { in: 2, out: 10 },
  "claude-haiku-4-5": { in: 1, out: 5 },
  "claude-opus-5": { in: 5, out: 25 },
};

const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!DRY_RUN && !API_KEY) {
  console.error("❌ Falta ANTHROPIC_API_KEY (o usa --dry-run, que no llama a nadie).");
  process.exit(1);
}

// ── El prompt ────────────────────────────────────────────────────────────────
// Dos reglas duras, las dos por la misma razón: una ficha nutricional mal no se
// nota mirándola. El estado (crudo/cocido) cambia los valores por 2,5 —lenteja
// seca 24 g de proteína/100 g, cocida 9,5— y un alimento parecido no es el
// mismo alimento.
const SYSTEM = [
  "Eres un experto en composición de alimentos. Te doy un ingrediente de un catálogo",
  "de cocina española y una lista de candidatos de BEDCA (Base de Datos Española de",
  "Composición de Alimentos). Eliges cuál es el MISMO alimento, o ninguno.",
  "",
  "REGLAS, en este orden:",
  "1. ESTADO. Si el ingrediente es crudo/tal cual se compra y el candidato está",
  "   cocido, hervido, frito, asado, en conserva, en almíbar o precocinado (o al",
  "   revés), NO vale: devuelve null. La nutrición por 100 g cambia hasta ×2,5 al",
  "   cocinar porque cambia el agua. 'Lentejas' no es 'Lenteja, cocida'.",
  "2. MISMO ALIMENTO. Un plato preparado con ese ingrediente dentro no es el",
  "   ingrediente ('Mayonesa con aceite de girasol' no es aceite de girasol;",
  "   'Empanada de carne' no es carne). Una variedad del mismo alimento sí vale",
  "   ('Judía blanca' para 'Alubia blanca'), y un genérico razonable también",
  "   ('Queso curado' para un queso curado concreto) — con menos confianza.",
  "3. Ante la duda, null. Quedarse sin dato es correcto; un dato mal no lo es.",
  "",
  "NUNCA escribas valores nutricionales: no es tu trabajo, los valores salen de",
  "BEDCA. Tu salida es un foodId de la lista que te doy, o null.",
  "",
  "Responde SOLO con JSON, sin texto alrededor:",
  '{"decisiones":[{"ingredientId":"...","foodId":123|null,"confianza":0.0-1.0,"motivo":"máx 15 palabras"}]}',
  "Una entrada por cada ingrediente que te llegue, en el mismo orden.",
].join("\n");

// Lo que ve el modelo de cada candidato: el nombre (donde está el estado) y la
// nutrición RESUMIDA. Los 8 campos completos no aportan nada a la decisión y
// multiplicarían los tokens; kcal y macros bastan para oler un disparate (una
// "lenteja" con 9 g de proteína está cocida aunque el nombre no lo diga).
function candidateForPrompt(c) {
  return {
    foodId: c.foodId,
    foodName: c.foodName,
    kcal: c.nutrition.kcal100g,
    prot: c.nutrition.protein100g,
    carb: c.nutrition.carbs100g,
    grasa: c.nutrition.fat100g,
  };
}

function itemForPrompt(row) {
  return {
    ingredientId: row.ingredientId,
    ingredientName: row.ingredientName,
    category: row.category,
    aisle: row.aisle,
    candidates: row.candidates.map(candidateForPrompt),
  };
}

// ── Entradas ─────────────────────────────────────────────────────────────────
if (!existsSync(TRIAGE_PATH)) {
  console.error(`❌ No existe ${TRIAGE_PATH}. Ejecuta antes: node scripts/bedca-triage.mjs`);
  process.exit(1);
}
const triage = JSON.parse(readFileSync(TRIAGE_PATH, "utf8"));
const rows = triage.rows.filter((r) => (
  r.clase === "revisar"
  // Los rechazados por estado/otro alimento que TIENEN un candidato coherente
  // más abajo no son casos perdidos: son justo donde un humano miraría.
  || (INCLUDE_REJECTED && r.clase === "rechazar" && r.alternativasCoherentes > 0)
));

const batches = [];
for (let i = 0; i < rows.length; i += BATCH_SIZE) {
  batches.push(rows.slice(i, i + BATCH_SIZE));
}

// ── Presupuesto ──────────────────────────────────────────────────────────────
// Estimación offline a propósito: contar tokens de verdad es /v1/messages/count_tokens,
// que es una llamada a Anthropic, y este modo promete no llamar a nadie. ~3,6
// caracteres por token es lo razonable para JSON en español (el ratio real del
// tokenizador queda entre 3,3 y 4 para este tipo de texto); el número sirve
// para decidir si esto cuesta céntimos o euros, no para facturar.
const CHARS_PER_TOKEN = 3.6;
const estTokens = (s) => Math.ceil(s.length / CHARS_PER_TOKEN);
// Cada decisión son ~4 campos cortos de JSON.
const OUTPUT_TOKENS_PER_ITEM = 45;

const payloads = batches.map((batch) => ({ items: batch.map(itemForPrompt) }));
const systemTokens = estTokens(SYSTEM);
let inputTokens = 0;
for (const p of payloads) inputTokens += systemTokens + estTokens(JSON.stringify(p));
const outputTokens = rows.length * OUTPUT_TOKENS_PER_ITEM;

function cost(model) {
  const p = PRICES[model];
  if (!p) return null;
  return (inputTokens / 1e6) * p.in + (outputTokens / 1e6) * p.out;
}

if (DRY_RUN) {
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(PAYLOAD_PATH, `${JSON.stringify({ system: SYSTEM, batches: payloads }, null, 2)}\n`, "utf8");
  const porClase = rows.reduce((acc, r) => ({ ...acc, [r.clase]: (acc[r.clase] ?? 0) + 1 }), {});
  console.log(`[dry-run] NO se ha llamado a la API de Anthropic.\n`);
  console.log(`Entradas a decidir:  ${rows.length}  (${Object.entries(porClase).map(([k, v]) => `${k}: ${v}`).join(", ")})`);
  console.log(`Candidatos en total: ${rows.reduce((n, r) => n + r.candidates.length, 0)}`);
  console.log(`Peticiones:          ${batches.length} (lotes de ${BATCH_SIZE})`);
  console.log(`Tokens estimados:    ${inputTokens} entrada + ${outputTokens} salida  (~${CHARS_PER_TOKEN} car/token)`);
  console.log(`\nCoste estimado:`);
  for (const model of Object.keys(PRICES)) {
    const c = cost(model);
    console.log(`  ${model.padEnd(20)} $${c.toFixed(4)}  (${PRICES[model].in}/${PRICES[model].out} $ por millón)`);
  }
  console.log(`\nPayload exacto que se enviaría → ${PAYLOAD_PATH}`);
  console.log(`Para ejecutarlo de verdad: quita --dry-run y pon ANTHROPIC_API_KEY en el entorno.`);
  process.exit(0);
}

// ── Ejecución real ───────────────────────────────────────────────────────────
async function callModel(payload) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2000,
      system: SYSTEM,
      messages: [{ role: "user", content: JSON.stringify(payload) }],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `Anthropic HTTP ${res.status}`);
  const text = data?.content?.map((b) => b.text ?? "").join("") ?? "";
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("respuesta no-JSON");
  return JSON.parse(text.slice(start, end + 1));
}

const choices = existsSync(CHOICES_PATH) ? JSON.parse(readFileSync(CHOICES_PATH, "utf8")) : {};
let decided = 0, nulls = 0, invalid = 0;

for (const [i, batch] of batches.entries()) {
  const payload = { items: batch.map(itemForPrompt) };
  const byId = new Map(batch.map((r) => [r.ingredientId, r]));
  let parsed;
  try {
    parsed = await callModel(payload);
  } catch (err) {
    console.error(`  ❌ lote ${i + 1}/${batches.length}: ${err.message}`);
    continue;
  }
  for (const d of parsed?.decisiones ?? []) {
    const row = byId.get(d?.ingredientId);
    if (!row) { invalid++; continue; }
    // El foodId TIENE que ser uno de los que le mandamos. Un id inventado se
    // trata como null: es la única defensa contra que el modelo se invente una
    // fila de BEDCA que no existe.
    const valid = row.candidates.some((c) => c.foodId === d.foodId);
    if (d.foodId != null && !valid) {
      console.warn(`  ⚠️  ${row.ingredientName}: foodId ${d.foodId} no estaba entre los candidatos → se ignora`);
      invalid++;
      continue;
    }
    choices[row.ingredientId] = {
      foodId: d.foodId ?? null,
      confianza: typeof d.confianza === "number" ? d.confianza : null,
      motivo: String(d.motivo ?? "").slice(0, 200),
      modelo: MODEL,
    };
    if (d.foodId == null) nulls++; else decided++;
  }
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(CHOICES_PATH, `${JSON.stringify(choices, null, 2)}\n`, "utf8");
  console.log(`  lote ${i + 1}/${batches.length} hecho (${batch.length} ingredientes)`);
}

console.log(`\nElegido candidato: ${decided}. Descartado todo (null): ${nulls}. Respuestas inválidas: ${invalid}.`);
console.log(`Decisiones → ${CHOICES_PATH}`);
console.log(`Nada aplicado aún. Revisa el fichero y luego:`);
console.log(`  node scripts/apply-bedca-nutrition.mjs --choices=${CHOICES_PATH} --dry-run`);
