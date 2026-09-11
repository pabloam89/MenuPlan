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
 *   4. `thawSteps`   → si el plato aguanta congelarse (`freezable`), el paso a
 *                      paso para resucitar una ración que sale del congelador.
 *                      La ficha los pinta EN LUGAR de los de cocinado cuando el
 *                      hueco viene de un tupper (ver src/lib/freezer.js).
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
 *   --thaw            solo decide freezable y genera los pasos de descongelado
 *                     (sin ninguna de las cuatro, hace las cuatro)
 *   --parts           MODO APARTE (ver abajo): solo asigna `part` a los pasos
 *                     que YA existen. Ignora --base/--appliances/--nutrients/--thaw.
 *   --category=carnes limita a una categoría (nombre del fichero sin .json)
 *   --ids=a,b,c       limita a ids concretos (repesca tras el lint de estilo)
 *   --ids-file=ruta   lo mismo, pero leyendo un id por línea (una lista de 300
 *                     ids no cabe en la línea de comandos de Windows)
 *   --limit=N         procesa como mucho N recetas (piloto)
 *   --force           regenera aunque ya exista (pisa también lo escrito a mano)
 *   --dry-run         no escribe nada, solo muestra lo que haría
 *   --model=<id>      override del modelo (por defecto claude-sonnet-4-6, o
 *                     claude-sonnet-5 en modo --parts)
 *   --concurrency=N   recetas en vuelo a la vez (por defecto 4)
 *
 * ── MODO `--parts` ──────────────────────────────────────────────────────────
 * Las cuatro tareas de arriba REESCRIBEN texto. `part` no puede ir con ellas:
 * pedirlo dentro de la llamada grande obliga a regenerar `steps` enteros, y eso
 * pisaría el wording ya curado de 985 recetas para cambiar un campo de una
 * palabra. Así que `--parts` hace una llamada distinta: manda los `stepsRich`
 * TAL CUAL están (texto, kind, minutes, marcadores) y pide SOLO el reparto por
 * componente, índice a índice. Escribe únicamente `stepsRich[i].part`; que el
 * resto del paso no se mueve lo comprueba assertOnlyPartChanged() con una huella
 * del texto/kind/minutes/during antes y después, y si algo cambió, revienta.
 *
 * A quién preguntarle sale de scripts/select-recipes-for-parts.mjs (puerta de
 * dos etapas + las ya etiquetadas), no de todo el catálogo.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from "fs";
import { join, dirname, isAbsolute } from "path";
import { fileURLToPath } from "url";

// Mismo normalizador que usan la app y el asistente de recetas, para que el
// formato no se bifurque entre lo que hornea este script y lo que valida y
// pinta el cliente.
import { normalizeRichSteps, stripStepMarkers, STEP_PARTS } from "../src/lib/recipeSteps.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const RECIPES_DIR = join(ROOT, "src", "data", "recipes");
const APPLIANCE_STEPS_PATH = join(ROOT, "src", "data", "recipeStepsByAppliance.json");
// Ledger local (no viaja al bundle): ids cuyos pasos base ya reescribimos, para
// que una segunda pasada sea reanudable sin ensuciar los JSON de receta.
const BASE_LEDGER_PATH = join(__dirname, ".enrich-base-done.json");
// Ledger propio de --parts. Hace falta uno aparte porque el modo re-etiqueta a
// propósito las recetas que YA tienen `part` (las 141 salieron del criterio
// físico viejo), así que "ya tiene part" no puede ser la señal de "hecho".
const PARTS_LEDGER_PATH = join(__dirname, ".enrich-parts-done.json");

// Sonnet fuerte: el mismo que usa el planner (lib/aiModels.js PLANNER_MODEL).
// Es one-off, así que priorizamos calidad sobre coste/latencia.
const DEFAULT_MODEL = "claude-sonnet-4-6";
// En --parts vamos a la generación actual de esa gama. Es UNA pasada sobre ~300
// recetas y la salida es minúscula (una palabra por paso), así que el coste
// total está en céntimos: la única variable que importa aquí es acertar el
// criterio aparte/dentro, que es un juicio fino y con casos límite.
const DEFAULT_PARTS_MODEL = "claude-sonnet-5";
// $ por millón de tokens, solo para el presupuesto del --dry-run.
const PRICES = {
  "claude-sonnet-5": { in: 2, out: 10 },
  "claude-sonnet-4-6": { in: 3, out: 15 },
  "claude-opus-5": { in: 5, out: 25 },
  "claude-haiku-4-5": { in: 1, out: 5 },
};

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
// `--parts` no es "una tarea más": es otra llamada, con otro prompt y otro
// contrato de escritura. Anula las cuatro para que no se pueda pedir a la vez
// "solo el part" y "reescribe los pasos".
const DO_PARTS = has("--parts");
const onlyBase = has("--base");
const onlyAppliances = has("--appliances");
const onlyNutrients = has("--nutrients");
const onlyThaw = has("--thaw");
const doAll = !DO_PARTS && !onlyBase && !onlyAppliances && !onlyNutrients && !onlyThaw;
const DO_BASE = !DO_PARTS && (doAll || onlyBase);
const DO_APPLIANCES = !DO_PARTS && (doAll || onlyAppliances);
const DO_NUTRIENTS = !DO_PARTS && (doAll || onlyNutrients);
const DO_THAW = !DO_PARTS && (doAll || onlyThaw);
const CATEGORY = val("category");
// Lista de ids concretos, para repescar las recetas que falló el lint de estilo
// sin volver a pagar por las 274. `--ids-file` es la misma lista en un fichero:
// los ~300 ids de --parts no caben en la línea de comandos de Windows (8191
// caracteres) y se truncarían en silencio.
const idsFilePath = val("ids-file");
const idsFromFile = idsFilePath
  ? readFileSync(isAbsolute(idsFilePath) ? idsFilePath : join(ROOT, idsFilePath), "utf8")
      .split(/\r?\n/)
  : [];
const idsFromFlag = val("ids") ? val("ids").split(",") : [];
const rawIds = [...idsFromFlag, ...idsFromFile].map((s) => s.trim()).filter(Boolean);
// Si se pidió filtrar y la lista sale vacía, ABORTAR. Caer a `null` aquí
// significa "todo el catálogo": un fichero de ids vacío o mal generado
// convertiría una pasada dirigida de 314 recetas en una de 985, en silencio
// y pagando por ello.
if ((idsFilePath || val("ids")) && rawIds.length === 0) {
  console.error("No hay ni un id que procesar: --ids/--ids-file dieron una lista vacía.");
  process.exit(1);
}
const IDS = rawIds.length > 0 ? new Set(rawIds) : null;
const LIMIT = val("limit") ? Number(val("limit")) : Infinity;
const FORCE = has("--force");
const DRY_RUN = has("--dry-run");
const MODEL = val("model") || process.env.ENRICH_MODEL
  || (DO_PARTS ? DEFAULT_PARTS_MODEL : DEFAULT_MODEL);
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

/**
 * El criterio de `part`, en un solo sitio: lo usan el prompt grande (que genera
 * pasos nuevos) y el de `--parts` (que solo reparte los que ya hay). Si vivieran
 * por separado, una pasada de cada tipo dejaría el catálogo con dos criterios.
 *
 * Es el criterio APARTE/DENTRO que fijó el dueño el 11 sep 2026 y que está
 * escrito entero en src/data/recipeSchema.js (comentario de `llevaSalsa`).
 * SUSTITUYE al criterio FÍSICO que había aquí antes ("¿se cocinan en dos
 * cazos distintos?"), que es el que produjo las 141 etiquetas inconsistentes:
 * una reducción hecha en la misma sartén salía 'principal' y la misma reducción
 * en un cazo aparte salía 'salsa', cuando cocina son la misma cosa.
 */
const PART_CRITERION = [
  "COMPONENTE DEL PLATO (`part`, eje aparte de `kind`):",
  "· `kind` es de TIEMPO (¿hay que estar delante?); `part` es de QUÉ COMPONENTE",
  "  del plato trabaja el paso, para que el cocinero pueda hacer cada uno por su",
  "  lado y para poder decirle a un alérgico qué se le puede quitar. Son",
  "  independientes: un paso puede ser kind:'pasivo' y part:'salsa' a la vez.",
  "",
  "· EL CRITERIO ES APARTE vs DENTRO. No es físico: da igual si hay uno o dos",
  "  cazos. Un componente va APARTE cuando se cumplen LAS DOS cosas:",
  "    1. se puede servir en un cuenco al lado, y",
  "    2. el plato SIGUE SIENDO ESE PLATO sin él.",
  "  Si falla cualquiera de las dos, va DENTRO: no es escindible, y sus",
  "  ingredientes no se pueden atribuir por separado.",
  "",
  "· MAPEO A `part`:",
  "    · componente APARTE  → sus pasos llevan 'salsa' o 'guarnicion'.",
  "    · componente DENTRO  → sus pasos son 'principal'. No hay parte separable",
  "      que etiquetar: la preparación entera es el plato.",
  "    · 'principal' es también el cuerpo del plato, y admite más de un",
  "      componente si ninguno es un acompañamiento claro.",
  "    · 'combinado' es el emplatado o la junta final de los componentes ya",
  "      hechos.",
  "",
  "· TEST MECÁNICO DE LAS REDUCCIONES Y SALSAS DE COCCIÓN, comprobable en los",
  "  propios pasos: ¿el líquido de la salsa ha COCINADO el ingrediente principal?",
  "    · NO → aparte ('salsa'). El magret con reducción de frutos rojos: la",
  "      reducción se hace en un cazo y nunca tocó el pato.",
  "    · SÍ → dentro ('principal'). La carrillada al vino: esa reducción ES el",
  "      líquido de braseado y la carne soltó sus jugos en él.",
  "",
  "· CASOS YA RESUELTOS, no vuelvas a discutirlos:",
  "    · Mantequillas compuestas (Café de París, de perejil) → APARTE. Se hacen",
  "      en bol, se enfrían, se cortan y se posan; un entrecot sin ella sigue",
  "      siendo un entrecot.",
  "    · Bacalao al pil-pil → DENTRO. La salsa se emulsiona con el aceite de",
  "      confitar el propio bacalao: no hay frontera que trazar.",
  "    · Patatas bravas → DENTRO. La brava es separable, pero unas bravas sin",
  "      brava son patatas fritas: falla la cláusula 2.",
  "    · Trucha a la navarra con almendras → las almendras NO son salsa ni",
  "      guarnición: se doran en la misma grasa y se echan encima. Todo",
  "      'principal'.",
  "    · Guisos, potajes y técnicas integrales (al ajillo, en salsa verde,",
  "      adobos, gratinados, glaseados que se pincelan, aliños de ensalada) →",
  "      DENTRO, un solo componente.",
  "    · Un wrap o un bocadillo con su salsa → DENTRO: el pan es el portador,",
  "      la salsa va untada y no se sirve al lado.",
  "· El criterio es SIMÉTRICO para la guarnición: un puré que se hace en su cazo",
  "  y se sirve al lado es 'guarnicion'; las patatas que se guisan CON la carne",
  "  y han cogido su jugo son 'principal'.",
  "",
  "· RECETA MONOCOMPONENTE → NINGÚN `part`, en ningún paso. Si al aplicar el",
  "  criterio no queda ni un componente aparte, la receta se queda entera sin",
  "  este campo (es el caso de la gran mayoría del catálogo, y la UI la pinta",
  "  igual que siempre, sin pestañas). No etiquetes 'principal' en todos los",
  "  pasos para 'no dejarlo vacío': una receta con un solo valor de `part` es",
  "  ruido. O hay al menos un componente aparte, o no hay `part`.",
];

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
  "· El VERBO va siempre primero, también cuando el paso es condicional: 'Añadir",
  "  agua si la salsa ha espesado.' es CORRECTO; 'Si la salsa ha espesado, añadir",
  "  agua.' es INCORRECTO (no arranca con el verbo). Nunca empieces un paso por",
  "  'Si', 'Cuando', 'Una vez' ni por un sujeto.",
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
  ...PART_CRITERION,
  "· REGLA MECÁNICA: todo paso kind:'emplatado' es part:'combinado' — medido,",
  "  91 de 91 en el catálogo. Si la receta no lleva `part`, tampoco lo lleva el",
  "  emplatado.",
  "· Cuando SÍ apliques `part`, agrupa los pasos de cada componente seguidos",
  "  (todos los de 'salsa' juntos, luego todos los de 'principal', etc.) y",
  "  termina con uno o más pasos part:'combinado'. No los intercales sueltos.",
  "",
  "Para `steps` (método tradicional): tantos pasos como necesite la receta, SIN",
  "límite máximo. UNA sola acción por paso — mejor 12 pasos claros que 6 apretados.",
  "No metas varias técnicas en un mismo paso (aplanar, batir, disponer y cortar",
  "son 4 pasos, no 1). Cada paso es un OBJETO",
  '{ "text", "minutes", "kind", "part"? }: (`part` solo cuando aplique, ver arriba)',
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
  "",
  "Para `freezable` y `thawSteps` (congelación):",
  "· `freezable` es un booleano: ¿aguanta ESTE plato congelarse ya cocinado y",
  "  volver a la mesa en condiciones? Sé honesto y exigente, porque de esto",
  "  depende que la app le proponga a una familia comerse algo mediocre:",
  "    · SÍ: guisos, potajes y legumbres, carnes en salsa, sofritos, cremas y",
  "      sopas, boloñesas y ragús, albóndigas, empanadas, croquetas (crudas o",
  "      fritas), tartas y bizcochos, purés densos, arroces caldosos NO,",
  "      canelones y lasañas.",
  "    · NO: ensaladas y crudos, gazpacho/salmorejo (se corta la emulsión), platos",
  "      con patata cocida en trozos (se vuelve harinosa), huevo cocido o frito,",
  "      mayonesas y salsas con huevo o nata sin ligar, fritos rebozados que se",
  "      comen crujientes (se quedan blandos), pasta corta ya cocida y aliñada,",
  "      arroz blanco suelto, plancha rápida (pescado o carne a la plancha), y",
  "      cualquier plato cuya gracia sea la textura recién hecha.",
  "· Si `freezable` es false, devuelve `thawSteps` como array VACÍO.",
  "· Si es true, `thawSteps` son los pasos para poner en la mesa una ración que",
  "  YA ESTÁ COCINADA y sale del congelador. MISMO formato y MISMAS reglas que",
  "  `steps` (infinitivo, 140 caracteres, una acción por paso, minutes y kind).",
  "· Reglas propias de esta parte, importantes:",
  "    · NO se cocina nada desde cero: no vuelvas a listar el sofrito ni la",
  "      cocción original. Se descongela, se calienta y se remata.",
  "    · NO uses marcadores {{Ingrediente}} de la receta: el plato ya lleva todo",
  "      dentro. Solo puedes mencionar en texto normal un remate mínimo si de",
  "      verdad mejora el plato (un chorrito de aceite, perejil fresco, queso).",
  "    · El paso de descongelar en la nevera es kind:'espera' con sus minutes en",
  "      minutos reales (una noche ≈ 720 min): es tiempo que el cocinero no está",
  "      en la cocina, y la app lo usa para avisar el día antes.",
  "    · La secuencia es LINEAL, no un menú de alternativas: elige la mejor forma",
  "      de recalentar ESE plato (cazo, sartén, horno, microondas) y escríbela",
  "      como pasos seguidos. Si quieres ofrecer un atajo (microondas a media",
  "      potencia cuando no hay tiempo), va como UN paso kind:'opcional', nunca",
  "      duplicando toda la secuencia.",
  "    · Di qué hay que vigilar para que no se arruine: remover a mitad para que",
  "      no queden zonas frías, tapar para que no se seque, no hervir a borbotones",
  "      una crema, recuperar la textura si ha soltado agua.",
  "    · Entre 3 y 6 pasos. Termina con un 'emplatado'.",
].join("\n");

/**
 * Prompt del modo `--parts`. No hereda nada del de arriba a propósito: aquí el
 * modelo no redacta, así que las reglas de estilo, marcadores, paralelos,
 * electrodomésticos y congelación no solo sobran — invitan a reescribir. Lo
 * único que comparte es el criterio, que es el mismo objeto literal.
 */
const PARTS_SYSTEM = [
  "Eres un chef español clasificando los pasos de una receta YA ESCRITA.",
  "Devuelves SIEMPRE un único JSON válido, sin markdown ni texto fuera del JSON.",
  "",
  "NO REDACTAS NADA. No reescribes, no corriges, no reordenas, no partes ni",
  "juntas pasos, no tocas los tiempos ni el tipo de paso. Aunque veas una errata",
  "o un paso mejorable, lo dejas como está: tu única salida es una etiqueta por",
  "paso. Cualquier texto que devuelvas se ignora.",
  "",
  ...PART_CRITERION,
  "",
  "FORMATO DE SALIDA:",
  '· Devuelve { "parts": { "<índice>": "principal" | "guarnicion" | "salsa" |',
  '  "combinado" | null } } con UNA entrada por cada paso que recibes, usando el',
  "  índice `i` que viene en cada uno. null = ese paso no lleva `part`.",
  "· Si la receta es monocomponente, devuelve null en TODOS los índices.",
  "· Si etiquetas, etiqueta TODOS los pasos: no dejes null sueltos en una receta",
  "  que sí usa el eje (un paso sin `part` cae en 'principal' por defecto en la",
  "  app, y eso mete ingredientes en la pestaña equivocada).",
  "· Los pasos que te llegan con `part_fijado` YA ESTÁN DECIDIDOS por una regla",
  "  mecánica del proyecto: repite ese valor tal cual y no lo discutas. Hoy la",
  "  regla es una sola: kind:'emplatado' → 'combinado'. La excepción es la",
  "  receta monocomponente: si devuelves null en todo lo demás, devuelve null",
  "  también ahí.",
].join("\n");

async function callModel(payload, system = SYSTEM, maxTokens = 8000) {
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
      max_tokens: maxTokens,
      system,
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
async function callModelWithRetry(payload, label, system, maxTokens) {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await callModel(payload, system, maxTokens);
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
function enrichPayload(recipe, appliances, { wantBase, wantNutrients, wantThaw } = {}) {
  const formato = {};
  if (wantBase) {
    formato.steps = [
      { text: "string con {{Marcadores}}", minutes: 0, kind: "activo" },
      { text: "string", minutes: 0, kind: "paralelo", during: 0 },
      // "part" es opcional — solo cuando la receta de verdad tenga varios
      // componentes preparados aparte, ver instrucciones arriba.
      { text: "string", minutes: 0, kind: "emplatado", part: "combinado" },
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
  if (wantThaw) {
    formato.freezable = true;
    formato.thawSteps = [
      { text: "string", minutes: 0, kind: "espera" },
      { text: "string", minutes: 0, kind: "activo" },
    ];
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

// ── Modo --parts ─────────────────────────────────────────────────────────────

/**
 * La regla mecánica, aplicada ANTES de llamar: kind:'emplatado' → 'combinado'.
 * Medido sobre las 141 recetas ya etiquetadas: 91 de 91 emplatados llevan
 * 'combinado'. Lo que es determinista no se le pregunta a un modelo — se le
 * dice, para que no lo contradiga y para no pagarlo.
 * @returns {Record<number, string>} índice → part ya decidida
 */
function mechanicalParts(stepsRich) {
  const fixed = {};
  (stepsRich ?? []).forEach((s, i) => {
    if (s?.kind === "emplatado") fixed[i] = "combinado";
  });
  return fixed;
}

/**
 * Huella de todo lo que --parts NO puede tocar. Si cambia entre el antes y el
 * después de aplicar la respuesta, es que se ha colado una reescritura: la
 * pasada de `part` no vale para nada si se lleva por delante el wording curado.
 */
function stepFingerprint(stepsRich) {
  return JSON.stringify((stepsRich ?? []).map((s) => [s?.text, s?.kind, s?.minutes, s?.during]));
}

function assertOnlyPartChanged(before, after, label) {
  if (stepFingerprint(before) !== stepFingerprint(after)) {
    throw new Error(`${label}: --parts ha modificado texto/kind/minutes/during — abortado`);
  }
}

function partsPayload(recipe) {
  const fixed = mechanicalParts(recipe.stepsRich);
  return {
    receta: recipe.name,
    categoria: recipe.category,
    tipo: recipe.type,
    // Los ingredientes hacen falta para decidir: sin la lista no se sabe si el
    // "puré" del paso 4 es un componente con entidad o dos cucharadas de algo.
    ingredientes: (recipe.ingredients ?? []).map((i) => i.name),
    pasos: (recipe.stepsRich ?? []).map((s, i) => {
      const out = { i, text: s.text, kind: s.kind ?? null, minutes: s.minutes ?? null };
      if (fixed[i]) out.part_fijado = fixed[i];
      return out;
    }),
    devuelve_solo: ["parts"],
  };
}

/**
 * Escribe SOLO `stepsRich[i].part`. Reconstruye cada paso desde el original y
 * añade (o quita) el campo: ni siquiera se copia el texto que venga en la
 * respuesta, que es la forma segura de que una reescritura no pueda colarse.
 * Devuelve null si el modelo no devolvió nada aplicable.
 */
function applyParts(recipe, out) {
  const raw = out?.parts;
  if (!raw || typeof raw !== "object") return null;

  const before = recipe.stepsRich;
  const fixed = mechanicalParts(before);

  const assigned = before.map((s, i) => {
    const v = raw[String(i)] ?? raw[i];
    return STEP_PARTS.includes(v) ? v : null;
  });

  // Lo que hace que una receta esté DESGLOSADA es que tenga al menos un
  // componente aparte: una 'salsa' o una 'guarnicion'. Sin eso, lo que queda
  // ('principal' en todo, o 'principal' + el 'combinado' del emplatado) no es
  // un desglose — es una pestaña única, o dos donde la segunda es "servir".
  // El criterio ya lo dice: o hay un componente aparte, o no hay `part`.
  const isMono = !assigned.some((p) => p === "salsa" || p === "guarnicion");

  const after = before.map((s, i) => {
    const { part: _drop, ...rest } = s;
    if (isMono) return rest;
    // La regla mecánica gana siempre: si el modelo la contradijo, se corrige.
    const part = fixed[i] ?? assigned[i];
    return part ? { ...rest, part } : rest;
  });

  assertOnlyPartChanged(before, after, `${recipe.id} — ${recipe.name}`);
  recipe.stepsRich = after;
  return { parts: [...new Set(after.map((s) => s.part).filter(Boolean))] };
}

/** Estimación grosera de tokens (≈4 caracteres por token) para el presupuesto. */
const estimateTokens = (text) => Math.ceil(String(text).length / 4);

// ── Main ─────────────────────────────────────────────────────────────────────
const applianceSteps = loadJson(APPLIANCE_STEPS_PATH, {});
const baseLedger = loadJson(BASE_LEDGER_PATH, {});
const partsLedger = loadJson(PARTS_LEDGER_PATH, {});

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

    // --parts va por su cuenta: ni comparte llamada ni criterio de pendiente.
    if (DO_PARTS) {
      // Sin stepsRich no hay pasos que repartir. Y el ledger, no el `part` que
      // ya tenga: re-etiquetar las 141 con el criterio nuevo es el objetivo.
      if (!Array.isArray(recipe.stepsRich) || recipe.stepsRich.length === 0) continue;
      if (!FORCE && partsLedger[recipe.id]) continue;
      tasks.push({ path, recipe, parts: true, appliances: [], missingAppliances: [] });
      continue;
    }

    const appliances = DO_APPLIANCES ? (recipe.methods ?? []).map((m) => m.appliance) : [];
    // Una receta que ya trae stepsRich (escrita a mano o de una pasada previa al
    // ledger) no se regenera sin --force: el ledger solo cubre lo que generó
    // este script, y perder wording revisado a mano sería un mal negocio.
    const hasRich = Array.isArray(recipe.stepsRich) && recipe.stepsRich.length > 0;
    const needBase = DO_BASE && (FORCE || (!baseLedger[recipe.id] && !hasRich));
    const needNutrients =
      DO_NUTRIENTS && (FORCE || recipe.fiber_g == null || recipe.sodium_mg == null);
    // `freezable` sin definir = nunca se ha evaluado. Una vez decidido (aunque
    // sea false) no se vuelve a preguntar: es un juicio estable del plato, y
    // los "no congelables" son la mayoría del catálogo.
    const needThaw = DO_THAW && (FORCE || recipe.freezable == null);
    const missingAppliances = appliances.filter(
      (a) => FORCE || !applianceSteps[recipe.id]?.[a],
    );

    if (!needBase && !needNutrients && !needThaw && missingAppliances.length === 0) continue;
    tasks.push({ path, recipe, appliances, needBase, needNutrients, needThaw, missingAppliances });
  }
  if (tasks.length >= LIMIT) break;
}

if (DRY_RUN && DO_PARTS) {
  // Presupuesto real de la pasada: se cuenta lo que se va a mandar de verdad
  // (el mismo payload que construye partsPayload) más el prompt de sistema,
  // que va íntegro en cada llamada porque aquí no hay caché entre recetas.
  const systemTokens = estimateTokens(PARTS_SYSTEM);
  let pasos = 0;
  let inTokens = 0;
  let outTokens = 0;
  let yaEtiquetadas = 0;

  for (const t of tasks) {
    const n = t.recipe.stepsRich.length;
    pasos += n;
    if (t.recipe.stepsRich.some((s) => s.part)) yaEtiquetadas += 1;
    inTokens += systemTokens + estimateTokens(JSON.stringify(partsPayload(t.recipe)));
    // La salida es un mapa índice → palabra: ~10 tokens por paso, más las
    // llaves. Es lo que hace que este modo sea barato aunque el modelo sea caro.
    outTokens += 10 * n + 20;
    console.log(`· ${t.recipe.id} — ${t.recipe.name} … ${n} pasos`
      + `${t.recipe.stepsRich.some((s) => s.part) ? " (re-etiqueta)" : ""}`);
  }

  const price = PRICES[MODEL];
  const cost = price
    ? (inTokens / 1e6) * price.in + (outTokens / 1e6) * price.out
    : null;

  console.log(`\n✅ Dry-run --parts — no se ha llamado a la API.`);
  console.log(`   recetas ………………… ${tasks.length} (${yaEtiquetadas} ya tienen \`part\` y se re-etiquetan)`);
  console.log(`   pasos ……………………… ${pasos}`);
  console.log(`   modelo ……………………… ${MODEL}`);
  console.log(`   tokens entrada ≈ ${inTokens.toLocaleString("es-ES")} (incluye ${systemTokens} de sistema × ${tasks.length} llamadas)`);
  console.log(`   tokens salida  ≈ ${outTokens.toLocaleString("es-ES")}`);
  console.log(cost == null
    ? `   coste ………………………… sin precio conocido para ${MODEL}`
    : `   coste estimado ≈ $${cost.toFixed(2)} (batch −50 %: $${(cost / 2).toFixed(2)})`);
  process.exit(0);
}

if (DRY_RUN) {
  for (const t of tasks) {
    console.log(
      `· ${t.recipe.id} — ${t.recipe.name} … [dry-run] base:${t.needBase} `
      + `nutrientes:${t.needNutrients} congelado:${t.needThaw} `
      + `electro:[${t.missingAppliances.join(",")}]`,
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
let touchedPartsLedger = false;
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
  if (touchedPartsLedger) {
    saveJson(PARTS_LEDGER_PATH, partsLedger);
    touchedPartsLedger = false;
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

  if (task.needThaw && typeof out.freezable === "boolean") {
    recipe.freezable = out.freezable;
    if (out.freezable) {
      // Sin normalizeMarkers a propósito: el plato ya está cocinado, así que
      // aquí no hay ingredientes que escalar ni marcadores que resolver, y
      // dejarlos pasar pintaría cantidades de una receta que nadie va a cocinar.
      const rich = normalizeRichSteps(out.thawSteps)
        .map((s) => ({ ...s, text: stripStepMarkers(s.text) }));
      if (rich.length >= 2) recipe.thawSteps = rich;
      else recipe.freezable = false;
    } else {
      // El schema rechaza thawSteps sin freezable: si una pasada anterior los
      // dejó y ahora el juicio cambia, hay que retirarlos.
      delete recipe.thawSteps;
    }
    dirtyPaths.add(task.path);
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
      if (task.parts) {
        // max_tokens corto a propósito: la respuesta es un mapa de índices a
        // una palabra. Si se desborda, es que el modelo se ha puesto a redactar.
        const out = await callModelWithRetry(
          partsPayload(task.recipe), label, PARTS_SYSTEM, 2000,
        );
        const applied = applyParts(task.recipe, out);
        // Sin `parts` en la respuesta no hay nada que escribir: cuenta como
        // fallo para que la siguiente pasada lo repesque (el ledger no se marca).
        if (!applied) throw new Error("respuesta sin `parts`");
        dirtyPaths.add(task.path);
        partsLedger[task.recipe.id] = true;
        touchedPartsLedger = true;
        ok += 1;
        const desglose = applied.parts.length ? applied.parts.join("+") : "sin part (monocomponente)";
        console.log(`✓ [${ok + failed}/${total}] ${label} → ${desglose}`);
        if ((ok + failed) % SAVE_EVERY === 0) flush();
        continue;
      }

      const payload = enrichPayload(task.recipe, task.missingAppliances, {
        wantBase: task.needBase,
        wantNutrients: task.needNutrients,
        wantThaw: task.needThaw,
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

console.log(DO_PARTS
  ? `Asignando \`part\` a ${total} receta(s) con ${MODEL} (concurrencia ${CONCURRENCY})…\n`
  : `Enriqueciendo ${total} receta(s) con ${MODEL} (concurrencia ${CONCURRENCY})…\n`);
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, total) }, worker));
flush();

console.log(`\n✅ ${DO_PARTS ? "Asignación de `part`" : "Enriquecimiento"} completada — ${ok} ok, ${failed} fallidas de ${total}.`);
if (failed > 0) console.log("   Vuelve a lanzar el script: las fallidas se reintentan solas.");
console.log(DO_PARTS
  // Sin check-step-wording: --parts no toca texto, así que el lint de estilo no
  // tiene nada que mirar. Lo que hay que revisar es el diff, que debe ser solo
  // líneas `"part":` entrando o saliendo.
  ? "   Revisa el diff: solo deben aparecer líneas \"part\". Cualquier otra cosa es un fallo."
  : "   Pasa scripts/check-step-wording.mjs y revisa el diff antes de commitear.");
