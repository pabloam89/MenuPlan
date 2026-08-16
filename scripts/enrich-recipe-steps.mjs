/**
 * enrich-recipe-steps.mjs
 *
 * Pasada ONE-OFF de calidad para las recetas del catálogo. En vez de generar
 * los pasos al vuelo (y pagarlo por usuario), los horneamos una sola vez con un
 * Sonnet fuerte y los commiteamos, de forma que la app no procese nada en
 * runtime: los pasos base viven en los JSON de receta y los adaptados por
 * electrodoméstico en src/data/recipeStepsByAppliance.json (que viaja en el
 * bundle; DishDetail los lee antes de tocar /api/recipe-steps).
 *
 * En una única llamada por receta pedimos:
 *   1. `steps`       → paso a paso "tradicional" reescrito con más profundidad
 *                      (mise en place, temperaturas/tiempos, señales de punto,
 *                      un par de tips), pero conciso.
 *   2. `byAppliance` → pasos adaptados a cada electrodoméstico de recipe.methods.
 *   3. `nutrients`   → estimación por ración de fibra, azúcares, grasas
 *                      saturadas (g) y sodio (mg), siguiendo el esquema.
 *
 * Es idempotente/reanudable: por defecto salta lo ya generado. Escribe los
 * cambios en disco por fichero para que el diff de git sea revisable.
 *
 * Uso:
 *   ANTHROPIC_API_KEY=sk-... node scripts/enrich-recipe-steps.mjs [opciones]
 *
 * Opciones:
 *   --base            solo reescribe los pasos base (recipe.steps)
 *   --appliances      solo genera los pasos por electrodoméstico
 *   --nutrients       solo estima los nutrientes secundarios
 *                     (sin ninguna de las tres, hace las tres)
 *   --category=carnes limita a una categoría (nombre del fichero sin .json)
 *   --ids=a,b,c       limita a ids concretos (repesca tras el lint de estilo)
 *   --limit=N         procesa como mucho N recetas (piloto)
 *   --force           regenera aunque ya exista (pisa también lo escrito a mano)
 *   --dry-run         no escribe nada, solo muestra lo que haría
 *   --model=<id>      override del modelo (por defecto claude-sonnet-4-6)
 *   --concurrency=N   recetas en vuelo a la vez (por defecto 4)
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// Mismo normalizador que usan la app y el asistente de recetas, para que el
// formato no se bifurque entre lo que hornea este script y lo que valida y
// pinta el cliente.
import { normalizeRichSteps, stripStepMarkers } from "../src/lib/recipeSteps.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const RECIPES_DIR = join(ROOT, "src", "data", "recipes");
const APPLIANCE_STEPS_PATH = join(ROOT, "src", "data", "recipeStepsByAppliance.json");
// Ledger local (no viaja al bundle): ids cuyos pasos base ya reescribimos, para
// que una segunda pasada sea reanudable sin ensuciar los JSON de receta.
const BASE_LEDGER_PATH = join(__dirname, ".enrich-base-done.json");

// Sonnet fuerte: el mismo que usa el planner (lib/aiModels.js PLANNER_MODEL).
// Es one-off, así que priorizamos calidad sobre coste/latencia.
const DEFAULT_MODEL = "claude-sonnet-4-6";

const APPLIANCE_LABELS = {
  airfryer: "Airfryer",
  horno: "Horno",
  thermomix: "Thermomix",
  vaporera: "Vaporera",
  olla_express: "Olla exprés",
  microondas: "Microondas",
};

// ── CLI ──────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (name) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const onlyBase = has("--base");
const onlyAppliances = has("--appliances");
const onlyNutrients = has("--nutrients");
const doAll = !onlyBase && !onlyAppliances && !onlyNutrients;
const DO_BASE = doAll || onlyBase;
const DO_APPLIANCES = doAll || onlyAppliances;
const DO_NUTRIENTS = doAll || onlyNutrients;
const CATEGORY = val("category");
// Lista de ids concretos, para repescar las recetas que falló el lint de estilo
// sin volver a pagar por las 274.
const IDS = val("ids") ? new Set(val("ids").split(",").map((s) => s.trim()).filter(Boolean)) : null;
const LIMIT = val("limit") ? Number(val("limit")) : Infinity;
const FORCE = has("--force");
const DRY_RUN = has("--dry-run");
const MODEL = val("model") || process.env.ENRICH_MODEL || DEFAULT_MODEL;
const CONCURRENCY = Math.max(1, Number(val("concurrency")) || 4);
// Reintentos ante sobrecarga (429/529) y respuestas que no parsean.
const MAX_ATTEMPTS = 4;
// Cada cuántas recetas se vuelca a disco lo acumulado.
const SAVE_EVERY = 10;

const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!DRY_RUN && !API_KEY) {
  console.error("❌ Falta ANTHROPIC_API_KEY (o usa --dry-run).");
  process.exit(1);
}

// ── IO helpers ───────────────────────────────────────────────────────────────
function loadJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, "utf8"));
}
function saveJson(path, data) {
  if (DRY_RUN) return;
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function extractJson(text) {
  const t = String(text ?? "").trim();
  try {
    return JSON.parse(t);
  } catch {
    const s = t.indexOf("{");
    const e = t.lastIndexOf("}");
    if (s === -1 || e <= s) return null;
    try {
      return JSON.parse(t.slice(s, e + 1));
    } catch {
      return null;
    }
  }
}

/**
 * Reescribe los marcadores al nombre EXACTO del ingrediente. Aunque el payload
 * ya manda nombre y cantidad por separado, el modelo se despista y a veces
 * escribe {{Lentejas (200 g)}} o una variante del nombre. El resolutor de la UI
 * lo salvaría por coincidencia parcial, pero entonces el texto plano de fallback
 * queda con la cantidad duplicada, así que se limpia en origen.
 */
function normalizeMarkers(text, ingredientNames) {
  return String(text ?? "").replace(/\{\{([^}]+)\}\}/g, (full, raw) => {
    const inner = String(raw).trim();
    if (inner.startsWith("@")) return full;

    const [rawName, mode] = inner.split("|").map((s) => s.trim());
    const cleaned = rawName.replace(/\s*\([^)]*\)\s*$/, "").trim();
    const key = cleaned.toLowerCase();
    const match = ingredientNames.find((n) => n.toLowerCase() === key)
      ?? ingredientNames.find((n) => n.toLowerCase().includes(key) || key.includes(n.toLowerCase()));

    const name = match ?? cleaned;
    return mode ? `{{${name}|${mode}}}` : `{{${name}}}`;
  });
}

function nonNegNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

// ── LLM ──────────────────────────────────────────────────────────────────────
const SYSTEM = [
  "Eres un chef español que redacta recetas claras y con oficio para una app.",
  "Devuelves SIEMPRE un único JSON válido, sin markdown ni texto fuera del JSON.",
  "",
  "ESTILO DE REDACCIÓN (OBLIGATORIO, sin excepciones — el wording va sistematizado):",
  "· Español de España.",
  "· La ORDEN de cada paso va SIEMPRE en INFINITIVO: 'Cortar…', 'Sofreír…',",
  "  'Hornear…', 'Añadir…', 'Retirar…', 'Servir…'. NUNCA imperativo ('corta'),",
  "  NUNCA gerundio ('cortando'), NUNCA 'yo/nosotros'. Sujeto impersonal.",
  "· Las CONDICIONES y puntos de cocción van en presente con 'cuando…' / 'hasta",
  "  que…': 'hasta que se dore', 'cuando rompa a hervir', 'hasta que esté tierno'.",
  "· Un verbo por técnica, sin sinónimos sueltos. Cortes: picar (fino), cortar",
  "  (en trozos), laminar, rallar, triturar. Calor: calentar, sofreír, saltear,",
  "  hervir / llevar a ebullición, cocer, hornear, freír, asar, dorar. Otros:",
  "  escurrir, salpimentar, mezclar, remover, tapar, reservar, servir.",
  "· Cada paso empieza en Mayúscula y termina en punto.",
  "· LÍMITE DURO: 140 caracteres por paso. No es una recomendación, es lo que",
  "  cabe en la tarjeta. Si un paso se pasa de 140, NO lo recortes quitando",
  "  detalle: PÁRTELO en dos pasos. Como no hay tope de número de pasos, partir",
  "  es SIEMPRE la solución correcta. Cuenta los caracteres antes de devolver.",
  "· Los pasos 'pasivo' y 'espera' llevan SIEMPRE minutes (el reposo o la cocción",
  "  desatendida es justo el dato que el cocinero necesita para organizarse).",
  "· Cifras para cantidades ('2 dientes'), tiempo en 'min', temperatura '200 °C',",
  "  fuego 'suave/medio/fuerte'.",
  "· Cita los ingredientes por su nombre EXACTO de la lista `ingredientes`; no",
  "  inventes ni menciones nada fuera de esa lista.",
  "",
  "MARCADORES DE CANTIDAD (la app los sustituye al pintar el paso):",
  "· La PRIMERA vez que aparece un ingrediente, escríbelo como {{Nombre}} usando",
  "  SOLO el campo `nombre` de la lista `ingredientes`, nunca su `cantidad`:",
  "  {{Lentejas}} es correcto, {{Lentejas (200 g)}} es INCORRECTO. La app lo",
  "  cambia por la cantidad en lenguaje de",
  "  cocina, ya escalada a las raciones del usuario: {{Ajo}} → '2 dientes de ajo',",
  "  {{Huevo}} → '4 huevos', {{Patata}} → '300 g de patata'.",
  "· Por eso NO escribas tú la cantidad ni un artículo delante del marcador:",
  "  'Picar {{Ajo}}.' es CORRECTO; 'Picar 2 dientes de {{Ajo}}.' y 'Picar el",
  "  {{Ajo}}.' son INCORRECTOS (saldría 'Picar el 2 dientes de ajo').",
  "· Variantes cualitativas cuando la cifra no aporta: {{Aceite de oliva|chorrito}}",
  "  → 'un chorrito de aceite de oliva'; {{Aceite de oliva|abundante}} para freír;",
  "  {{Nuez moscada|pizca}} → 'una pizca de nuez moscada'; {{Sal|gusto}} → 'sal al",
  "  gusto'. Usa |gusto o |pizca en sal, especias y hierbas.",
  "· En las referencias POSTERIORES al mismo ingrediente NO repitas el marcador:",
  "  texto normal ('el ajo picado', 'las patatas escurridas').",
  "",
  "MARCADORES DE UTENSILIO:",
  "· {{@Sartén}} y {{@Plancha}} son los ÚNICOS utensilios con marcador. {{@Plancha}}",
  "  cae automáticamente a sartén si el usuario no tiene plancha, así que si la",
  "  receta pide plancha usa el marcador en vez de escribir 'plancha' a pelo.",
  "· El resto (cazo, olla, bol, bandeja, horno, colador) va en texto normal.",
  "",
  "PASOS EN PARALELO:",
  "· Si una acción se puede hacer MIENTRAS otra anterior sigue en marcha, márcala",
  "  kind:'paralelo' y añade `during`: el índice 0-based del paso con el que corre",
  "  en paralelo, que debe ser un paso ANTERIOR del array. La UI los pinta 2a/2b.",
  "· Ejemplo: si el paso de índice 1 es 'Fundir la mantequilla' y quieres calentar",
  "  la leche a la vez, el paso de índice 2 lleva kind:'paralelo' y during:1.",
  "· Solo cuando de verdad ahorre tiempo; no fuerces paralelos artificiales.",
  "· NO des por hecho ninguna preparación. Si un paso usa un ingrediente cortado,",
  "  picado, laminado, rallado, cocido, escurrido, etc., un paso ANTERIOR (normal-",
  "  mente el mise en place) debe haberlo preparado explícitamente. Nunca escribas",
  "  'el ajo picado' o 'las patatas cocidas' si antes no has picado el ajo ni",
  "  cocido las patatas. Explica cada acción; no te saltes pasos que el cocinero",
  "  necesita para llegar a ese punto.",
  "· Todos los ingredientes de la lista deben aparecer y usarse en algún paso.",
  "",
  "Para `steps` (método tradicional): tantos pasos como necesite la receta, SIN",
  "límite máximo. UNA sola acción por paso — mejor 12 pasos claros que 6 apretados.",
  "No metas varias técnicas en un mismo paso (aplanar, batir, disponer y cortar",
  "son 4 pasos, no 1). Cada paso es un OBJETO",
  '{ "text", "minutes", "kind" }:',
  "· text: la instrucción siguiendo el ESTILO de arriba, con mise en place, orden,",
  "  temperaturas/tiempos y señales de punto. Toda la técnica y cantidades DENTRO",
  "  del text.",
  "· minutes: minutos exactos de ESE paso (entero, coherente con lo que dice el text).",
  "· kind: uno de prep | activo | paralelo | pasivo | espera | opcional |",
  "  emplatado. La app usa pasivo/espera para calcular el tiempo que el cocinero",
  "  NO tiene que estar en la cocina, así que el criterio importa:",
  "    · prep      = mise en place previo (pelar, cortar, batir, medir).",
  "    · activo    = requiere estar delante (remover sin parar, dorar, vigilar el",
  "                  punto). Si el paso pide atención continua, es activo.",
  "    · pasivo    = ya está al fuego/horno y puedes irte a otra cosa (hornear,",
  "                  chup-chup tapado, confitar). Un vistazo puntual vale; si hay",
  "                  que remover constantemente NO es pasivo, es activo.",
  "    · espera    = no hay cocción, solo pasa el tiempo (reposar, enfriar,",
  "                  marinar, levar, refrigerar).",
  "    · paralelo  = se hace mientras corre un paso anterior (lleva `during`).",
  "    · emplatado = paso final de servir.",
  "    · opcional  = solo si procede.",
  "  La suma de minutos de los pasos que NO son pasivo/espera debe ser coherente y",
  "  no superar el tiempo_total_min.",
  "",
  "Para `byAppliance`: para CADA electrodoméstico pedido, los pasos adaptados a esa",
  "técnica (programas, temperaturas y tiempos propios del aparato). Son OBJETOS con",
  "EXACTAMENTE el mismo formato y las mismas reglas que `steps`: mismo estilo en",
  "infinitivo, límite duro de 140 caracteres, una sola acción por paso, marcadores",
  "{{Ingrediente}} la primera vez que aparece cada uno, y los campos minutes y kind.",
  "No son strings sueltos: van igual de completos que el método tradicional.",
  "· Usa EXCLUSIVAMENTE los ingredientes de la lista. Solo cambia la TÉCNICA, nunca",
  "  los ingredientes; si un paso tradicional usa algo que no está, omítelo.",
  "· Sin tope de pasos: los que pida el aparato, normalmente 4 a 8.",
  "",
  "EL `kind` EN ELECTRODOMÉSTICOS (lo más importante de esta parte):",
  "La razón de usar estos aparatos es que cocinan SOLOS. Ese es justo el dato que",
  "el cocinero quiere ver, así que afina el kind en vez de marcarlo todo 'activo':",
  "· El paso de cocción del aparato es 'pasivo' casi siempre, con sus minutes: el",
  "  horno hornea, la airfryer fríe, la olla cuece y la Thermomix remueve sola. El",
  "  cocinero se va. Marcar eso 'activo' es el error más grave que puedes cometer",
  "  aquí, porque borra la única ventaja del aparato.",
  "· Es 'activo' solo si de verdad hay que estar delante: dorar en Thermomix con el",
  "  cubilete quitado vigilando, sacar la cesta de la airfryer a media cocción para",
  "  agitar, saltear antes de cerrar la olla.",
  "· 'espera' para los tiempos muertos propios del cacharro, que hoy no se ven y",
  "  descuadran la planificación: despresurizar la olla exprés (2-5 min), reposar",
  "  dentro del horno apagado, atemperar antes de desmoldar.",
  "· 'prep' para el mise en place y 'emplatado' para servir, igual que en el base.",
  "",
  "PARALELOS: AQUÍ DEBE HABER MÁS QUE EN EL MÉTODO TRADICIONAL, NO MENOS.",
  "Estos aparatos dejan un hueco largo de cocción desatendida, y ese hueco es",
  "precisamente cuando se prepara todo lo demás. Aplica esta regla mecánicamente:",
  "· REGLA: si un paso 'pasivo' dura 10 min o más y DESPUÉS hay pasos de 'prep'",
  "  (cortar, picar, rallar, montar la fuente) que no necesitan lo que se está",
  "  cocinando, esos pasos son kind:'paralelo' con `during` = índice del pasivo.",
  "  Se hacen mientras el horno hornea; ponerlos como 'prep' sueltos miente sobre",
  "  el tiempo real y es el fallo más habitual.",
  "· Ejemplo real: airfryer, índice 3 = 'Cocinar las patatas 35 min' (pasivo). Los",
  "  pasos de cortar el tomate, el pimiento y la cebolla que vienen detrás van",
  "  kind:'paralelo' y during:3, no 'prep'.",
  "· Igual con el precalentado: si el índice 0 es 'Precalentar el horno 10 min', el",
  "  mise en place posterior es paralelo con during:0.",
  "· No fuerces paralelos imposibles: si el paso NECESITA lo que se está cocinando",
  "  (pelar las patatas que aún están en el horno), NO es paralelo.",
  "",
  "NOTAS POR APARATO:",
  "· Thermomix: indica siempre tiempo / temperatura / velocidad ('5 min / 100 °C /",
  "  vel 1'), y giro inverso cuando toque no romper el alimento. El vaso hace de",
  "  recipiente único, así que hay pocos paralelos reales dentro del vaso.",
  "· Airfryer: temperatura y minutos, y di cuándo agitar la cesta o dar la vuelta.",
  "  Precalentar suele ser un buen paralelo del mise en place.",
  "· Horno: precalentado (paralelo al mise en place), altura/bandeja si importa, y",
  "  el horneado como pasivo con sus minutes.",
  "· Olla exprés: distingue el tiempo DESDE que sube la válvula, y añade el paso de",
  "  despresurizar como 'espera'.",
  "· Vaporera y microondas: potencia/temperatura y minutos; la cocción es pasiva.",
  "",
  "Para `nutrients`: estima por RACIÓN, coherente con kcal y macros dados,",
  "los gramos de fibra, de azúcares y de grasas saturadas, y los mg de sodio.",
  "Números enteros y realistas.",
].join("\n");

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
      // Holgado a propósito: solo se paga por lo que se genera, y quedarse corto
      // no degrada la respuesta, la corta a media llave y tira la receta entera
      // (una receta con 5 electrodomésticos enriquecidos pasa de 2800 de sobra).
      max_tokens: 8000,
      system: SYSTEM,
      messages: [{ role: "user", content: JSON.stringify(payload) }],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `Anthropic HTTP ${res.status}`);
  const text = data?.content?.[0]?.text ?? "";
  const parsed = extractJson(text);
  if (!parsed) throw new Error("respuesta no-JSON");
  return parsed;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Con concurrencia alta la API devuelve 429/529 a ratos; son transitorios y se
// resuelven esperando. Un 400 (payload mal formado) no mejora reintentando.
async function callModelWithRetry(payload, label) {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await callModel(payload);
    } catch (err) {
      lastErr = err;
      const msg = String(err?.message ?? err);
      const retryable = /429|529|overloaded|rate.?limit|timeout|ETIMEDOUT|ECONNRESET|fetch failed|no-JSON/i.test(msg);
      if (!retryable || attempt === MAX_ATTEMPTS) break;
      const wait = Math.round(1000 * 2 ** attempt * (1 + Math.random()));
      console.log(`  ↻ ${label} — reintento ${attempt}/${MAX_ATTEMPTS - 1} en ${wait} ms (${msg.slice(0, 60)})`);
      await sleep(wait);
    }
  }
  throw lastErr;
}

// El `formato_salida` se arma con lo que esta tarea necesita de verdad. Antes
// pedía siempre las tres cosas y se descartaba lo que sobrara: con los pasos por
// electrodoméstico ya enriquecidos eso desbordaba max_tokens, la respuesta se
// cortaba a media llave y fallaba entera por "respuesta no-JSON". Pedir solo lo
// que se va a aplicar también abarata la repesca de una sola parte.
function enrichPayload(recipe, appliances, { wantBase, wantNutrients } = {}) {
  const formato = {};
  if (wantBase) {
    formato.steps = [
      { text: "string con {{Marcadores}}", minutes: 0, kind: "activo" },
      { text: "string", minutes: 0, kind: "paralelo", during: 0 },
    ];
  }
  if (appliances.length > 0) {
    formato.byAppliance = Object.fromEntries(appliances.map((a) => [a, [
      { text: "string con {{Marcadores}}", minutes: 0, kind: "prep" },
      { text: "string", minutes: 0, kind: "pasivo" },
    ]]));
  }
  if (wantNutrients) {
    formato.nutrients = { fiber_g: 0, sugar_g: 0, saturated_fat_g: 0, sodium_mg: 0 };
  }

  return {
    receta: recipe.name,
    categoria: recipe.category,
    tiempo_total_min: recipe.time,
    raciones: recipe.baseServings,
    kcal_por_racion: recipe.kcal,
    macros_por_racion: { proteina_g: recipe.protein_g, carbohidratos_g: recipe.carbs_g, grasas_g: recipe.fat_g },
    // Nombre y cantidad separados a propósito: cuando iban en una sola cadena
    // ("Lentejas (200 g)"), el modelo copiaba el paréntesis dentro del marcador.
    ingredientes: (recipe.ingredients ?? []).map((i) => ({
      nombre: i.name,
      cantidad: `${i.amount} ${i.unit}`,
    })),
    pasos_actuales_referencia: recipe.steps ?? [],
    electrodomesticos: appliances.map((a) => APPLIANCE_LABELS[a] ?? a),
    formato_salida: formato,
    // Solo devuelve estas claves: sin esto el modelo rellena por su cuenta las
    // partes que ya no le pedimos y vuelve a desbordar el presupuesto.
    devuelve_solo: Object.keys(formato),
  };
}

// ── Main ─────────────────────────────────────────────────────────────────────
const applianceSteps = loadJson(APPLIANCE_STEPS_PATH, {});
const baseLedger = loadJson(BASE_LEDGER_PATH, {});

const files = readdirSync(RECIPES_DIR).filter((f) => f.endsWith(".json"));

// 1) Plan completo antes de llamar a nadie: así se puede repartir el trabajo en
// paralelo y el log sabe el total desde la primera línea.
const recipesByPath = new Map();
const tasks = [];

for (const file of files) {
  if (CATEGORY && file !== `${CATEGORY}.json`) continue;
  const path = join(RECIPES_DIR, file);
  const recipes = loadJson(path, []);
  recipesByPath.set(path, recipes);

  for (const recipe of recipes) {
    if (tasks.length >= LIMIT) break;
    if (!recipe?.id) continue;
    if (IDS && !IDS.has(recipe.id)) continue;

    const appliances = DO_APPLIANCES ? (recipe.methods ?? []).map((m) => m.appliance) : [];
    // Una receta que ya trae stepsRich (escrita a mano o de una pasada previa al
    // ledger) no se regenera sin --force: el ledger solo cubre lo que generó
    // este script, y perder wording revisado a mano sería un mal negocio.
    const hasRich = Array.isArray(recipe.stepsRich) && recipe.stepsRich.length > 0;
    const needBase = DO_BASE && (FORCE || (!baseLedger[recipe.id] && !hasRich));
    const needNutrients =
      DO_NUTRIENTS && (FORCE || recipe.fiber_g == null || recipe.sodium_mg == null);
    const missingAppliances = appliances.filter(
      (a) => FORCE || !applianceSteps[recipe.id]?.[a],
    );

    if (!needBase && !needNutrients && missingAppliances.length === 0) continue;
    tasks.push({ path, recipe, appliances, needBase, needNutrients, missingAppliances });
  }
  if (tasks.length >= LIMIT) break;
}

if (DRY_RUN) {
  for (const t of tasks) {
    console.log(
      `· ${t.recipe.id} — ${t.recipe.name} … [dry-run] base:${t.needBase} `
      + `nutrientes:${t.needNutrients} electro:[${t.missingAppliances.join(",")}]`,
    );
  }
  console.log(`\n✅ Dry-run — ${tasks.length} receta(s) pendientes (modelo ${MODEL}).`);
  process.exit(0);
}

// 2) Ejecución. Pool de concurrencia + reintentos, y guardado incremental: una
// pasada de todo el catálogo es larga y un corte no debe tirar lo ya generado
// (la siguiente pasada lo salta por el ledger).
const dirtyPaths = new Set();
let touchedApplianceFile = false;
let touchedLedger = false;
let ok = 0;
let failed = 0;

function flush() {
  for (const p of dirtyPaths) saveJson(p, recipesByPath.get(p));
  dirtyPaths.clear();
  if (touchedApplianceFile) {
    saveJson(APPLIANCE_STEPS_PATH, applianceSteps);
    touchedApplianceFile = false;
  }
  if (touchedLedger) {
    saveJson(BASE_LEDGER_PATH, baseLedger);
    touchedLedger = false;
  }
}

function applyResult(task, out) {
  const { recipe } = task;

  if (task.needBase) {
    const names = (recipe.ingredients ?? []).map((i) => i.name);
    const rich = normalizeRichSteps(out.steps)
      .map((s) => ({ ...s, text: normalizeMarkers(s.text, names) }));
    if (rich.length >= 3) {
      recipe.stepsRich = rich;
      // Mantener `steps` (texto plano) en sincronía: sigue siendo la fuente de
      // verdad / fallback y lo consumen otros sitios (export, API de
      // electrodomésticos como referencia). Va sin marcadores porque ese
      // fallback se pinta tal cual, sin resolverlos.
      recipe.steps = rich.map((s) => stripStepMarkers(s.text));
      baseLedger[recipe.id] = true;
      touchedLedger = true;
      dirtyPaths.add(task.path);
    }
  }

  if (task.needNutrients && out.nutrients && typeof out.nutrients === "object") {
    const map = {
      fiber_g: nonNegNumber(out.nutrients.fiber_g),
      sugar_g: nonNegNumber(out.nutrients.sugar_g),
      saturated_fat_g: nonNegNumber(out.nutrients.saturated_fat_g),
      sodium_mg: nonNegNumber(out.nutrients.sodium_mg),
    };
    for (const [k, v] of Object.entries(map)) {
      if (v != null) {
        recipe[k] = v;
        dirtyPaths.add(task.path);
      }
    }
  }

  if (task.missingAppliances.length > 0 && out.byAppliance && typeof out.byAppliance === "object") {
    const names = (recipe.ingredients ?? []).map((i) => i.name);
    for (const a of task.missingAppliances) {
      // Mismo tratamiento que los pasos base: se guardan enriquecidos y CON
      // marcadores, que la app resuelve al pintar. Antes se aplanaban a string,
      // y por eso cambiar de método tiraba el stepper (tipo de paso, tiempos y
      // cantidades escaladas) justo en los aparatos que más lucen: lo que el
      // cocinero quiere saber de una Thermomix es cuánto rato puede irse.
      const rich = normalizeRichSteps(out.byAppliance[a])
        .map((s) => ({ ...s, text: normalizeMarkers(s.text, names) }));
      if (rich.length >= 2) {
        applianceSteps[recipe.id] = applianceSteps[recipe.id] ?? {};
        applianceSteps[recipe.id][a] = rich;
        touchedApplianceFile = true;
      }
    }
  }
}

const queue = tasks.slice();
const total = tasks.length;

async function worker() {
  while (queue.length > 0) {
    const task = queue.shift();
    const label = `${task.recipe.id} — ${task.recipe.name}`;
    try {
      const payload = enrichPayload(task.recipe, task.missingAppliances, {
        wantBase: task.needBase,
        wantNutrients: task.needNutrients,
      });
      const out = await callModelWithRetry(payload, label);
      applyResult(task, out);
      ok += 1;
      console.log(`✓ [${ok + failed}/${total}] ${label}`);
    } catch (err) {
      failed += 1;
      console.log(`✗ [${ok + failed}/${total}] ${label} — ${err?.message ?? err}`);
    }
    if ((ok + failed) % SAVE_EVERY === 0) flush();
  }
}

console.log(`Enriqueciendo ${total} receta(s) con ${MODEL} (concurrencia ${CONCURRENCY})…\n`);
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, total) }, worker));
flush();

console.log(`\n✅ Enriquecimiento completado — ${ok} ok, ${failed} fallidas de ${total}.`);
if (failed > 0) console.log("   Vuelve a lanzar el script: las fallidas se reintentan solas.");
console.log("   Pasa scripts/check-step-wording.mjs y revisa el diff antes de commitear.");
