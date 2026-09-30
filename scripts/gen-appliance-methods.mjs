// MenuPlan — generate appliance preparation methods for every recipe (Gemini text)
//
// For each recipe in src/data/recipes/*.json we ask Gemini which alternative
// kitchen appliances can realistically prepare it (airfryer, horno, thermomix,
// vaporera, olla_express, microondas) and, for each one, the estimated time,
// difficulty and a short Spanish prep summary. The result is written back into
// the same recipe object as a `methods[]` array.
//
// The recipe's top-level { time, difficulty, steps } stay as the BASE/default
// version (stovetop / its own technique). `methods[]` only lists the variants.
//
// Usage:
//   node --env-file=.env.local scripts/gen-appliance-methods.mjs --proveedor anthropic --file carnes.json --ids carnes_001,carnes_002
//   node --env-file=.env.local scripts/gen-appliance-methods.mjs --pilot
//   node --env-file=.env.local scripts/gen-appliance-methods.mjs --file carnes.json
//   node --env-file=.env.local scripts/gen-appliance-methods.mjs --limit 20
//   node --env-file=.env.local scripts/gen-appliance-methods.mjs --ids carnes_001,huevos_003
//   node --env-file=.env.local scripts/gen-appliance-methods.mjs --redo carnes_001
//   node --env-file=.env.local scripts/gen-appliance-methods.mjs            (full catalog)
//
// Progress is checkpointed: recipes that already have a non-empty methods[]
// are skipped (unless --redo or --ids targets them). The source file is saved
// after every recipe so a crash never loses work.

import { GoogleGenAI } from "@google/genai";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RECIPES_DIR = join(__dirname, "../src/data/recipes");

/**
 * ESTO ES TEXTO, ASÍ QUE VA POR ANTHROPIC. En este repo el reparto no es una
 * preferencia, es una división de trabajo:
 *
 *   GEMINI / AI Studio  →  IMÁGENES. Las doce herramientas que lo usan piden
 *                          todas `gemini-2.5-flash-image` o Imagen 3:
 *                          gen-all-photos, gen-dish-images-imagen3,
 *                          regen-one-dish, api/generate-dish-photo…
 *   ANTHROPIC           →  TEXTO. bedca-select elige fichas nutricionales,
 *                          enrich-recipe-steps escribe pasos, api/generate
 *                          arma menús.
 *
 * Este script era LA ÚNICA excepción: pedía texto —tiempos, dificultad y un
 * resumen que el usuario lee— a la clave de las fotos. Eso costó una tanda
 * entera el 23 sep 2026, cuando el crédito de prepago de AI Studio se agotó a
 * mitad y devolvió 402 con 263 recetas sin procesar. Y el fallo no fue limpio:
 * las peticiones se quedaban colgadas ~20 minutos antes de dar el error, así
 * que el script parecía estar trabajando.
 *
 * `--proveedor gemini` se queda para poder comparar salidas, no para usarlo.
 * El prompt, el vocabulario de aparatos y `sanitizeMethods` son los mismos por
 * los dos caminos: lo único que cambia es el transporte.
 */
const PROVEEDOR = getOptEarly("--proveedor") || "anthropic";
if (!["gemini", "anthropic"].includes(PROVEEDOR)) {
  console.error(`❌  --proveedor tiene que ser "gemini" o "anthropic", no "${PROVEEDOR}".`);
  process.exit(1);
}

const GEMINI_KEY = process.env.GEMINI_AI_STUDIO_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
if (PROVEEDOR === "gemini" && !GEMINI_KEY) {
  console.error("❌  GEMINI_AI_STUDIO_KEY not found. Check .env.local");
  process.exit(1);
}
if (PROVEEDOR === "anthropic" && !ANTHROPIC_KEY) {
  console.error("❌  ANTHROPIC_API_KEY not found. Check .env.local");
  process.exit(1);
}

const ai = GEMINI_KEY ? new GoogleGenAI({ apiKey: GEMINI_KEY }) : null;
const MODEL =
  getOptEarly("--model") ||
  (PROVEEDOR === "anthropic" ? "claude-haiku-4-5-20251001" : "gemini-2.5-flash");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function getOptEarly(f) {
  const a = process.argv.slice(2);
  const i = a.indexOf(f);
  return i >= 0 ? a[i + 1] : null;
}

// ---- Vocabulary ----
const APPLIANCES = ["airfryer", "horno", "thermomix", "vaporera", "olla_express", "microondas"];
const DIFFICULTIES = ["facil", "normal", "elaborada"];

// Default catalog files (skip guarniciones + bebes unless explicitly targeted)
const DEFAULT_FILES = [
  "legumbres.json", "carnes.json", "pescados.json", "huevos.json",
  "pasta_arroces.json", "sopas_cremas.json", "ensaladas_verduras.json",
  "platos_unicos.json", "cenas_rapidas.json",
];

// ---- CLI args ----
const args = process.argv.slice(2);
const hasFlag = (f) => args.includes(f);
const getOpt = (f) => {
  const i = args.indexOf(f);
  return i >= 0 ? args[i + 1] : null;
};
const PILOT = hasFlag("--pilot");
const LIMIT = getOpt("--limit") ? parseInt(getOpt("--limit"), 10) : null;
const IDS = getOpt("--ids") ? new Set(getOpt("--ids").split(",").map((s) => s.trim())) : null;
const REDO = getOpt("--redo") ? new Set(getOpt("--redo").split(",").map((s) => s.trim())) : new Set();
const ONLY_FILE = getOpt("--file");

let files = ONLY_FILE ? [ONLY_FILE] : DEFAULT_FILES;
if (PILOT) files = ["huevos.json"]; // small, varied category for a quick smoke test

// ---- Prompt builder ----
/**
 * Las recetas de bebé NO pueden pasar por el prompt genérico.
 *
 * Ese prompt dice "eres un chef experto en cocina española" y nada más, así que
 * devuelve lo que devolvería para un plato de adulto: salpimentar, dorar bien,
 * que quede crujiente. Escrito en el `prepSummary` de una receta de bebé, eso
 * es una instrucción que un padre lee y sigue. Por eso `bebes.json` estaba
 * fuera de DEFAULT_FILES.
 *
 * Se puede levantar esa exclusión, pero solo dándole aquí lo que le faltaba:
 * las reglas de seguridad y —esto es lo que más se escapa— la obligación de NO
 * cambiar el formato. El formato es lo que hace que la receta sirva a esta
 * edad: unos bastones en airfryer siguen teniendo que ser bastones, y una
 * crema no se convierte en trozos porque el aparato sea otro.
 */
function buildBabyPrompt(recipe, ingredients) {
  const cremas = (recipe.etapaBebe ?? "cremas") === "cremas";
  const formato = cremas
    ? `Es un PURÉ/CREMA para bebé: el resultado tiene que seguir siendo una crema lisa y homogénea. Un electrodoméstico que deje trozos NO vale.

EL prepSummary TIENE QUE TERMINAR TRITURANDO, y esto no es una preferencia de
estilo. La primera versión de este prompt decía solo lo de arriba, y 29 de 56
métodos de puré acabaron en «cocina al vapor 25 minutos» y ahí se paraban: un
padre que lo sigue al pie de la letra le pone trozos de patata y de merluza
delante a un bebé de seis meses. Di SIEMPRE, con estas palabras o parecidas,
que se tritura hasta que quede un puré fino y sin grumos, aunque el aparato sea
solo para la cocción y haya que triturar después con otra cosa.`
    : `Es comida SÓLIDA en piezas que el bebé coge con la mano. El formato de "${recipe.name}" (tortita, bastón, tira, albóndiga, porción…) tiene que salir IGUAL del otro electrodoméstico. Si un aparato obliga a cambiar la forma, no lo propongas.`;

  return `Eres un chef especializado en alimentación infantil de 6 a 12 meses. Analiza esta receta.

RECETA: ${recipe.name}
Etapa: ${cremas ? "cremas (purés)" : "sólidos (baby-led weaning)"}
Técnica base: ${recipe.tecnica ?? "sartén/cazuela"}
Tiempo base: ${recipe.time} min
Ingredientes: ${ingredients}

${formato}

REGLAS QUE NO SE NEGOCIAN. El prepSummary lo lee un padre y lo hace tal cual:
- NUNCA menciones sal, salpimentar, sazonar, caldo de brik, pastilla de caldo,
  azúcar, miel ni queso curado o rallado de bolsa. Son las vías por las que
  entra el sodio en un plato "sin sal".
- NUNCA digas "crujiente", "bien dorado" ni "al dente". A esta edad se cocina
  DE MÁS a propósito: todo tiene que aplastarse entre dos dedos.
- Si la receta lleva pescado, recuerda revisar espinas.
- No propongas trocear en rodajas ni en cubos redondos: siempre a lo largo.

TAREA: de [${APPLIANCES.join(", ")}], di en cuáles se prepara ESTA receta con
buen resultado y sin desvirtuarla. Sé restrictivo: es mejor devolver uno bueno
que cuatro forzados. Excluye lo que no tenga sentido (airfryer para una crema,
microondas para algo que necesita dorarse).

Para cada uno devuelve:
- "appliance": uno de [${APPLIANCES.join(", ")}]
- "time": tiempo total estimado en minutos (entero)
- "difficulty": una de [${DIFFICULTIES.join(", ")}]
- "prepSummary": 1-2 frases en español, temperatura y tiempo concretos, y el
  punto en que se sabe que está listo (que se aplaste sin esfuerzo)

Responde SOLO con un array JSON válido, sin texto adicional. Si ninguno aplica, devuelve [].
Ejemplo: [{"appliance":"airfryer","time":14,"difficulty":"facil","prepSummary":"Colócalos separados en la cesta y cocina a 180°C unos 14 minutos, dándoles la vuelta a mitad. Están listos cuando el interior se aplasta sin esfuerzo."}]`;
}

function buildPrompt(recipe) {
  const ingredients = (recipe.ingredients ?? [])
    .map((i) => `${i.name} (${i.amount}${i.unit})`)
    .join(", ");
  if (recipe.category === "bebes") return buildBabyPrompt(recipe, ingredients);
  const base = recipe.requiredAppliance
    ? `técnica base: ${recipe.requiredAppliance}`
    : "técnica base: sartén/plancha/cazuela";

  return `Eres un chef experto en cocina con electrodomésticos. Analiza esta receta española.

RECETA: ${recipe.name}
Categoría: ${recipe.category}
${base}
Tiempo base: ${recipe.time} min · Dificultad base: ${recipe.difficulty}
Ingredientes: ${ingredients}

TAREA: De esta lista de electrodomésticos [${APPLIANCES.join(", ")}], dime en CUÁLES se puede preparar ESTA receta de forma realista y con buen resultado (sin desvirtuarla). Excluye los que no tengan sentido (p.ej. microondas para un filete a la plancha, airfryer para una crema líquida).

Para cada electrodoméstico viable devuelve:
- "appliance": uno de [${APPLIANCES.join(", ")}]
- "time": tiempo total estimado en minutos (entero)
- "difficulty": una de [${DIFFICULTIES.join(", ")}]
- "prepSummary": 1-2 frases en español explicando cómo se hace en ese electrodoméstico (temperatura, tiempo, truco clave)

Responde SOLO con un array JSON válido, sin texto adicional. Si ningún electrodoméstico aplica, devuelve []. Ejemplo:
[{"appliance":"airfryer","time":15,"difficulty":"facil","prepSummary":"Precalienta a 200°C y cocina 15 min dando la vuelta a mitad. Queda dorado por fuera y jugoso por dentro."}]`;
}

// ---- Response parsing ----
function extractJsonArray(text) {
  const trimmed = String(text ?? "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("[");
    const end = trimmed.lastIndexOf("]");
    if (start === -1 || end === -1 || end <= start) {
      throw new Error("respuesta sin array JSON");
    }
    return JSON.parse(trimmed.slice(start, end + 1));
  }
}

/**
 * Recorta por la última frase COMPLETA que quepa, no por el carácter 280.
 *
 * El corte a pelo dejaba instrucciones a medias — "Añade el aceite de oliva al
 * fin", "hasta obtener una crema lisa que se". Un prepSummary lo lee alguien
 * que está cocinando: media frase es peor que una frase menos. Si ni la primera
 * frase cabe, entonces sí se corta duro y se marca con puntos suspensivos, para
 * que se vea que falta algo en vez de parecer el final.
 */
function recortar(texto, max) {
  if (texto.length <= max) return texto;
  const cabe = texto.slice(0, max);
  const fin = Math.max(cabe.lastIndexOf(". "), cabe.lastIndexOf("! "), cabe.lastIndexOf("? "));
  if (fin > 0) return cabe.slice(0, fin + 1);
  return cabe.slice(0, max - 1).trimEnd() + "…";
}

/**
 * EL TRITURADO DE UN PURÉ DE BEBÉ NO SE LE PIDE AL MODELO: SE GARANTIZA.
 *
 * El prompt de bebés lo exige con todas las letras, y aun así 29 de 56 métodos
 * de puré terminaban en «cocina al vapor 25 minutos» y ahí se paraban. Se
 * reforzó la instrucción y bajó a 15, que para esto no es bajar: es seguir
 * teniendo quince resúmenes que un padre puede leer y seguir al pie de la
 * letra para acabar poniéndole trozos de patata y de merluza delante a un bebé
 * de seis meses.
 *
 * Falla sobre todo con vaporera y olla exprés, y se entiende: esos dos aparatos
 * NO trituran, así que el modelo describe honestamente lo que hacen y se calla
 * lo que viene después. El error no es suyo, es de quien esperaba que se
 * acordara.
 *
 * Así que el triturado se añade por código cuando falta. Es determinista, no
 * depende de ninguna pasada y no puede volver a olvidarse. Una regla de
 * seguridad que se le pide a un modelo es una regla que se cumple casi siempre,
 * y «casi siempre» aquí no vale.
 */
const MENCIONA_TRITURADO = /tritur|bat[ie]|chafa|aplasta|machaca|homogene|sin grumos|pur[eé] fino/i;
const COLETILLA_TRITURAR = " Después tritura todo hasta obtener un puré fino y sin grumos.";

function garantizarTriturado(metodos, receta) {
  if (receta?.etapaBebe !== "cremas") return metodos;
  return metodos.map((m) => {
    if (MENCIONA_TRITURADO.test(m.prepSummary)) return m;
    // Se recorta el resumen lo justo para que la coletilla quepa en los 280.
    const hueco = 280 - COLETILLA_TRITURAR.length;
    const base = m.prepSummary.length > hueco ? recortar(m.prepSummary, hueco) : m.prepSummary;
    return { ...m, prepSummary: base.trimEnd() + COLETILLA_TRITURAR };
  });
}

function sanitizeMethods(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const m of raw) {
    if (!m || typeof m !== "object") continue;
    const appliance = String(m.appliance ?? "").toLowerCase().trim();
    if (!APPLIANCES.includes(appliance)) continue;
    if (seen.has(appliance)) continue;
    const time = Number.parseInt(m.time, 10);
    if (!Number.isFinite(time) || time <= 0) continue;
    let difficulty = String(m.difficulty ?? "").toLowerCase().trim();
    if (!DIFFICULTIES.includes(difficulty)) difficulty = "facil"; // normalize any "muy_facil" etc.
    const prepSummary = recortar(String(m.prepSummary ?? "").trim(), 280);
    seen.add(appliance);
    out.push({ appliance, time, difficulty, prepSummary });
  }
  return out;
}

async function pedirAGemini(prompt) {
  const resp = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      responseMimeType: "application/json",
      temperature: 0.4,
      httpOptions: { timeout: 60000 },
    },
  });
  return resp?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ?? "";
}

/**
 * Mismo prompt por fetch directo, como scripts/bedca-select.mjs.
 *
 * Con AbortController y no solo con el timeout del SDK: lo que dejó la tanda
 * anterior colgada 20 minutos fue precisamente una petición que no cortaba.
 * Un fallo rápido se reintenta; uno que no vuelve, no.
 */
async function pedirAAnthropic(prompt) {
  const corte = new AbortController();
  const reloj = setTimeout(() => corte.abort(), 60000);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2000,
        temperature: 0.4,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: corte.signal,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message || `Anthropic HTTP ${res.status}`);
    return data?.content?.map((b) => b.text ?? "").join("") ?? "";
  } finally {
    clearTimeout(reloj);
  }
}

async function generateMethods(recipe) {
  const prompt = buildPrompt(recipe);
  const text = PROVEEDOR === "anthropic" ? await pedirAAnthropic(prompt) : await pedirAGemini(prompt);
  return garantizarTriturado(sanitizeMethods(extractJsonArray(text)), recipe);
}

// ---- Main loop ----
const MAX_RETRIES = 5;
let done = 0, skipped = 0, failed = 0;
const failures = [];

for (const file of files) {
  const path = join(RECIPES_DIR, file);
  if (!existsSync(path)) {
    console.warn(`⚠️   File not found, skipping: ${file}`);
    continue;
  }
  const recipes = JSON.parse(readFileSync(path, "utf8"));
  console.log(`\n📂  ${file} — ${recipes.length} recipes`);

  for (let i = 0; i < recipes.length; i++) {
    const r = recipes[i];

    if (IDS && !IDS.has(r.id)) continue;
    const alreadyProcessed = "methods" in r && Array.isArray(r.methods);
    const targeted = REDO.has(r.id) || (IDS && IDS.has(r.id));
    if (alreadyProcessed && !targeted) {
      skipped++;
      continue;
    }
    if (LIMIT !== null && done >= LIMIT) {
      console.log(`\n⏸️   Reached limit of ${LIMIT}. Stopping.`);
      break;
    }

    let attempt = 0;
    while (true) {
      try {
        const methods = await generateMethods(r);
        r.methods = methods;
        // Persist immediately (whole file) so a crash never loses progress.
        writeFileSync(path, JSON.stringify(recipes, null, 2) + "\n", "utf8");
        done++;
        const list = methods.map((m) => `${m.appliance}:${m.time}m`).join(", ") || "—";
        console.log(`✅  [${i + 1}/${recipes.length}] ${r.id} ${r.name} → ${list}`);
        break;
      } catch (err) {
        attempt++;
        const msg = err.message?.slice(0, 120);
        // 404 = model gone / bad name → permanent, don't waste retries
        if (/404|no longer available|not found/i.test(msg ?? "")) {
          console.error(`❌  ${r.id}: ${msg} — permanent error, aborting run`);
          failed++;
          failures.push(r.id);
          process.exit(1);
        }
        if (attempt > MAX_RETRIES) {
          failed++;
          failures.push(r.id);
          console.error(`❌  ${r.id}: ${msg} — giving up`);
          break;
        }
        const is503 = /503|high demand|overloaded|unavailable/i.test(msg ?? "");
        const wait = is503 ? Math.min(20000, 4000 * attempt) : 2500 * attempt;
        console.warn(`   ↻ retry ${attempt}/${MAX_RETRIES} for ${r.id}: ${msg}`);
        await sleep(wait);
      }
    }
    await sleep(400);
  }

  if (LIMIT !== null && done >= LIMIT) break;
}

console.log(`\n✨  Done. generated=${done} skipped=${skipped} failed=${failed}`);
if (failures.length) {
  console.log(`   Failed IDs (rerun with --redo): ${failures.join(",")}`);
}
