import { etapasServibles } from "./babyStage.js";
import { z } from "zod";
import { isBabyMenuGroup, membersOfGroup, resolveMemberAge } from "./groups.js";
import { DAYS, getMeals, modeForGroupSlot, slotKey } from "./planner.js";
import { basesPedidas } from "./bases.js";
import { ordenarPorSesgo, preferirPorSesgo } from "./sesgos.js";
import { resolverMenu, solverActivo, REGLAS_RELAJABLES, familiasDe } from "./solver.js";
import { DEFAULT_FREQS } from "./defaultFreqs.js";
import { HOLGURA_TOPES, presupuestoDeTopes, repartoAFreqs, freqsAReparto } from "./reparto.js";
import { stageForAge } from "./stages.js";
import { getSchoolDish, hasAnySchoolDish } from "./schoolMenu.js";
import { filterRecipes, filterGarnishes, decisionCatalog, filterOffMenuRecipes, recipeMatchesPreferType } from "../utils/filterRecipes.js";
import { esAnadido, topeDe } from "./cocinaTopes.js";
import { ajustarCuota } from "./cuotaCocinas.js";
import { favoriteIdsForGroup } from "./recipeVotes.js";
import { recetasRecientes } from "./recientes.js";
import { recipeCatalogById } from "../data/recipeCatalog.js";
import { isMontaje, PROTEIN_GROUP_BY_MAIN_PROTEIN } from "../data/recipeSchema.js";
import {
  validateMenu,
  buildCorrectionMessage,
  applyFallback,
  carbTypeFromText,
  getCarbType,
  basesAlcanzables,
  splitAchievableFreqs,
  slotAcceptsRole,
} from "../utils/validateMenu.js";
import guarnicionesData from "../data/recipes/guarniciones.json";
import salsasData from "../data/recipes/salsas.json";
import { formatFixedDishesForAI, pinnedGarnishMap, pinnedSalsaMap, enforceFixedDishes, catalogMatchesForFixedDish } from "./fixedDishes.js";
import { maxCookTime, maxCookTimeFilter, migrateCookTime } from "./cookTime.js";
import { applySeasonalFruit, filterPostrePool } from "./postres.js";
import { pairGarnishes } from "../utils/pairGarnishes.js";
import { pairSauces } from "../utils/pairSauces.js";
import { guessIngredientCategory } from "./ingredientCategories.js";
import { isQualitativeUnit, mergeIngredientLines } from "./ingredientUnits.js";
import { buildAdaptationMap } from "./substitutions.js";
import { assignPreparedToPlan, indexFrozenDishes, indexFridgeDishes, itemPortions, slotUsesPrepared, catalogIdOfPlanRecipe } from "./freezer.js";
import { dominantComponentOf } from "./dominantComponent.js";
import { legumeSubtypeOf, mariscoSubtypeOf } from "./dishSubtype.js";
import { normalizeKidDinnerConfig, schoolAvoidCategories, householdKidPolicy, kidsSlotAction } from "./kidsMenu.js";
import { PLANNER_MODEL, FAST_MODEL } from "./aiModels.js";
import { lowerFirst } from "./dishNaming.js";

// School-menu avoidance categories for the kids' cena. Historically the kids'
// dinner ALWAYS avoided the school's protein + carb base (that's the "cena
// diferente" default, locked in by tests). The per-kid kidDinnerConfig can now
// relax that or add vegetables via the "cena diferente" pop-up, but only when
// the household actually configured it — otherwise we keep the legacy default so
// existing setups (and the test suite) behave exactly as before.
function effectiveSchoolAvoid(data) {
  const cfg = normalizeKidDinnerConfig(data?.kidDinnerConfig);
  if (Object.keys(cfg.byMember).length === 0) {
    return { protein: true, carbs: true, veg: false };
  }
  return schoolAvoidCategories(data);
}

// Whether the school's course that day was vegetable-dominant, so the kids' cena
// can be told to avoid repeating it. Soft signal (name-based), only consulted
// when a kid opted into avoiding veg repetition.
// Runs on accent-stripped, lowercased text (see below), so keep it ascii-only.
const SCHOOL_VEG_RE = /ensalad|verdur|acelg|espinac|calabac|crema de |pure de |menestra|judia verde|brocoli|coliflor|guisante|zanahoria|pisto/;
function schoolServedVeg(text) {
  const t = String(text ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return SCHOOL_VEG_RE.test(t) ? "verdura" : null;
}

// ── Helpers ─────────────────────────────────────────────────────

/**
 * Recipe ids the user has actively discarded and that are still in force:
 * `forever` (permanent "No me gusta") plus any `cooldownUntil` entry whose
 * timestamp hasn't elapsed yet ("Esta semana no" / "Tarda demasiado" = ~7 días,
 * "Lo comí hace poco" = ~14 días). Fed into filterRecipes as `excludeIds` so a
 * rejected dish never reappears on generation or single-slot regeneration.
 *
 * @param {{ discards?: { forever?: string[], cooldownUntil?: Record<string, number> } }} data
 * @returns {string[]}
 */
export function activeDiscardIds(data) {
  const now = Date.now();
  const d = data?.discards ?? {};
  const ids = new Set(Array.isArray(d.forever) ? d.forever : []);
  for (const [id, until] of Object.entries(d.cooldownUntil ?? {})) {
    if (Number(until) > now) ids.add(id);
  }
  return Array.from(ids);
}

const PROTEIN_KEYWORDS = {
  pescado: /pesc|atun|merluza|salmon|bacalao|lenguado|gallo|sardina|boquer|gamba|marisc/,
  carne: /pollo|pavo|ternera|cerdo|carne|lomo|hamburgues|chorizo|salchich|cordero|jamon/,
  legumbres: /lentej|garbanz|alubi|judia|legumbre|frijol|soja|tofu/,
  huevos: /huevo|tortilla|revuelto/,
};

function proteinFromText(text) {
  const t = String(text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  for (const [protein, regex] of Object.entries(PROTEIN_KEYWORDS)) {
    if (regex.test(t)) return protein;
  }
  return null;
}

// Groups catalog mainProtein enums into the same buckets validateMenu.js uses
// for its consecutive-protein rule. Returns null for "vegetal"/"none"/unmapped
// values, i.e. dishes that don't carry a protein course.
function proteinGroupOf(recipe) {
  return recipe ? (PROTEIN_GROUP_BY_MAIN_PROTEIN[recipe.mainProtein] ?? null) : null;
}

// Every protein GROUP a dish carries — its mainProtein PLUS any secondary animal
// proteins declared in `extraProteins` — mirroring validateMenu.js's
// proteinGroupsOf so "no repetir el mismo grupo" means the same thing in the
// planner as in the validator. A compound legume dish (cocido, fabada) keeps
// mainProtein "legumbre" for the frequency/cena rules while its ternera/cerdo
// still counts as carne here, which is what rules 3c and 4 already assume.
function proteinGroupsOf(recipe) {
  const groups = new Set();
  if (!recipe) return groups;
  const add = (p) => {
    const g = PROTEIN_GROUP_BY_MAIN_PROTEIN[p];
    if (g) groups.add(g);
  };
  add(recipe.mainProtein);
  for (const p of recipe.extraProteins ?? []) add(p);
  return groups;
}

// Balanced weekly quotas used when the user hasn't set a meal style — includes
// carbs, meat and eggs so the default menu isn't skewed all-healthy.
//
// Exportado (y solo eso: los valores no cambian) porque lib/reparto.js lo usa
// como punto de partida del eje de reparto, y tenerlo duplicado allí dejaba
// dos defaults que se desincronizan en cuanto alguien afine uno de los dos.
export { DEFAULT_FREQS };

const DAY_SLUG = {
  Lun: "lun", Mar: "mar", Mié: "mie", Jue: "jue",
  Vie: "vie", Sáb: "sab", Dom: "dom",
};

export function extractJson(text) {
  const trimmed = String(text ?? "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
      throw new Error("La respuesta del modelo no contiene JSON.");
    }
    return JSON.parse(trimmed.slice(start, end + 1));
  }
}

export class AIPlannerError extends Error {
  constructor(message, { cause, raw, network, diagnostics } = {}) {
    super(message);
    this.name = "AIPlannerError";
    if (cause) this.cause = cause;
    if (raw) this.raw = raw;
    // `network`: the request never got a response (fetch rejected), as opposed
    // to an error the API actually returned. `diagnostics` travels to analytics.
    if (network) this.network = true;
    if (diagnostics) this.diagnostics = diagnostics;
  }
}

// ── API call ────────────────────────────────────────────────────

const DEFAULT_MODEL = PLANNER_MODEL;
const RETRY_MODEL = FAST_MODEL;
const DEFAULT_MAX_TOKENS = 1024;

// Anthropic's API returns these under normal peak-load conditions (529
// "Overloaded" especially), not because anything is wrong with the request —
// retrying the exact same call a moment later routinely succeeds. Every AI
// feature (menu generation, AI recipe drafting, ingredient suggestions) goes
// through this one function, so this is the single place that needs the
// retry: without it, a transient overload surfaced as an outright failure
// the user had to notice and manually retry themselves.
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 529]);
const RETRY_DELAYS_MS = [600, 1500];

// A rejected fetch ("Load failed" on iOS, "Failed to fetch" on Chrome) means the
// connection dropped before any response arrived. In production this only shows
// up on mobile: a planner call carries the whole catalog and can sit silent for
// tens of seconds, long enough for a WiFi↔4G handoff or a carrier proxy to cut
// it. Like a 529, the same call moments later usually works — and a single
// dropped call used to sink the whole multi-week generation with no retry.
const NETWORK_ERROR_MESSAGE = "No se pudo contactar con el servicio de IA. Comprueba la conexión.";
const NETWORK_RETRY_DELAYS_MS = [1000, 2500, 5000];
// When the page went to the background mid-request (screen locked, app
// switched) the OS suspended it and killed the fetch — nothing wrong with the
// network. Those drops wait until the user is back and retry without spending a
// network retry, capped so bouncing in and out can't loop forever.
const MAX_BACKGROUND_RETRIES = 3;

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new DOMException("Aborted", "AbortError"));
    });
  });
}

function isPageHidden() {
  return typeof document !== "undefined" && document.visibilityState === "hidden";
}

function waitUntilVisible(signal) {
  if (signal?.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));
  if (!isPageHidden()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      document.removeEventListener("visibilitychange", onChange);
      signal?.removeEventListener("abort", onAbort);
    };
    const onChange = () => {
      if (isPageHidden()) return;
      cleanup();
      resolve();
    };
    const onAbort = () => {
      cleanup();
      reject(new DOMException("Aborted", "AbortError"));
    };
    document.addEventListener("visibilitychange", onChange);
    signal?.addEventListener("abort", onAbort);
  });
}

// Remembers whether the page was hidden at any point while a request was in flight.
function watchHidden() {
  if (typeof document === "undefined") return { wasHidden: () => false, stop: () => {} };
  let hidden = isPageHidden();
  const onChange = () => {
    if (isPageHidden()) hidden = true;
  };
  document.addEventListener("visibilitychange", onChange);
  return {
    wasHidden: () => hidden || isPageHidden(),
    stop: () => document.removeEventListener("visibilitychange", onChange),
  };
}

export async function callModel(body, signal, { onResult } = {}) {
  const startedAt = Date.now();
  let statusRetries = 0;
  let networkRetries = 0;
  let backgroundRetries = 0;

  // Dropped connection: waits (and returns, so the loop retries) or throws once
  // the retries are spent.
  const afterNetworkError = async (err, wasHidden) => {
    if (err?.name === "AbortError") throw err;
    if (wasHidden && backgroundRetries < MAX_BACKGROUND_RETRIES) {
      backgroundRetries++;
      await waitUntilVisible(signal);
      return;
    }
    if (networkRetries < NETWORK_RETRY_DELAYS_MS.length) {
      await sleep(NETWORK_RETRY_DELAYS_MS[networkRetries++], signal);
      await waitUntilVisible(signal);
      return;
    }
    throw new AIPlannerError(NETWORK_ERROR_MESSAGE, {
      cause: err,
      network: true,
      diagnostics: {
        cause: `${err?.name ?? "Error"}: ${err?.message ?? ""}`,
        hiddenDuringRequest: wasHidden,
        callElapsedMs: Date.now() - startedAt,
        networkRetries,
        backgroundRetries,
      },
    });
  };

  for (;;) {
    const hidden = watchHidden();
    let response;
    let payload;
    try {
      response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
      });
      // Read the body inside the same try: the connection can also drop while
      // it streams in, which is the same failure as a rejected fetch.
      if (response.ok) payload = await response.json();
    } catch (err) {
      if (err instanceof SyntaxError) {
        throw new AIPlannerError("Respuesta no JSON del proxy.", { cause: err });
      }
      await afterNetworkError(err, hidden.wasHidden());
      continue;
    } finally {
      hidden.stop();
    }

    if (!response.ok) {
      let detail = "";
      try {
        const errBody = await response.json();
        detail = errBody?.error?.message || errBody?.error || JSON.stringify(errBody);
      } catch {
        detail = await response.text().catch(() => "");
      }
      const error = new AIPlannerError(
        `La IA respondió con un error (HTTP ${response.status}). ${detail}`.trim(),
      );
      if (RETRYABLE_STATUSES.has(response.status) && statusRetries < RETRY_DELAYS_MS.length) {
        await sleep(RETRY_DELAYS_MS[statusRetries++], signal);
        continue;
      }
      throw error;
    }

    const text = payload?.content?.[0]?.text;
    if (typeof text !== "string" || text.length === 0) {
      throw new AIPlannerError("La IA devolvió una respuesta vacía.", { raw: payload });
    }
    onResult?.({
      ms: Date.now() - startedAt,
      usage: payload.usage,
      statusRetries,
      networkRetries,
      backgroundRetries,
    });
    return text;
  }
}

// Per-generation counters sent with menu_generated / generation_failed: how many
// model calls a menú took and why, how long they ran, and their tokens. Flat
// numbers so they stay easy to query from user_events.metadata. `llmMs` sums
// every call, so it exceeds wall-clock time when weeks/groups run in parallel.
export function createPlannerStats() {
  return {
    llmCalls: 0,
    plannerCalls: 0,
    formatRetries: 0,
    correctionCalls: 0,
    llmMs: 0,
    slowestCallMs: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    statusRetries: 0,
    networkRetries: 0,
    backgroundRetries: 0,
    invalidFirstPass: 0,
    fallbackUsed: 0,
    groupsReused: 0,
    // Qué motor asignó los platos: "modelo" (LLM + reintentos + fallback) o
    // "solver" (lib/solver.js). Las tres de abajo solo se rellenan con solver.
    // Viajan enteras en el evento de telemetría (App.jsx hace `...plannerStats`),
    // que es lo que permite comparar los dos motores sobre menús reales.
    motor: "modelo",
    solverNodos: 0,
    solverMs: 0,
    solverCompleto: null,
    solverRelajados: 0,
    solverSemilla: null,
  };
}

/**
 * Los topes semanales de un grupo y a dónde apuntar dentro de ellos.
 *
 * Dos orígenes:
 *   · La libreta nueva: App.jsx proyecta `freqsByGroup` CON holgura
 *     (presupuestoDeTopes) y escribe `objetivoByGroup` con el reparto exacto.
 *     Se usan tal cual.
 *   · El wizard viejo o un estilo de comida: `data.freqs` / un `freqsByGroup`
 *     escrito a mano, sin objetivo. Son el PEDIDO exacto ("carne 3, pescado
 *     1…"), y suman 10 u 11 para semanas de 10 a 21 huecos: no hay solución
 *     con ellos como máximos. Medido en una casa real: el solver agotaba
 *     2 s de búsqueda por grupo y semana antes de rendirse y relajar. Así que
 *     se guardan como objetivo y se les da la misma holgura que a los otros.
 *
 * Solo con solver. El camino del modelo conserva sus topes exactos: sus
 * tests los fijan y cambiarlos ahí es otra decisión.
 */
function topesDelGrupo(data, group, huecos) {
  const freqs = data.freqsByGroup?.[group.id] ?? data.freqs ?? DEFAULT_FREQS;
  const objetivo = data.objetivoByGroup?.[group.id] ?? null;
  if (objetivo || !solverActivo()) return { freqs, objetivo };
  // Las familias que NADIE ha nombrado se completan con la semana equilibrada
  // de la app (DEFAULT_FREQS), y lo que el usuario sí dijo manda.
  //
  // Los `freqs` que trae la app por defecto solo hablan de tres familias
  // (legumbres, verdura, pescado). Las otras tres quedaban sin objetivo, y sin
  // objetivo el solver no tiene ninguna razón para preferirlas ni para
  // moderarlas: cogía lo que más abunda en el catálogo y salían TRECE platos
  // de carne en veintiún huecos. Un tope no es solo un techo, es también lo
  // que dice que esa familia tiene que aparecer.
  const completos = {};
  for (const [f, v] of Object.entries({ ...DEFAULT_FREQS, ...freqs })) completos[f] = Number(v) || 0;

  // Los topes se proyectan sobre el MISMO presupuesto que usa el reparto:
  // los huecos de la semana por la holgura, porque un plato gasta 1,4 topes de
  // media (ver HOLGURA_TOPES). Subir cada familia un 40 % por su cuenta no
  // basta: DEFAULT_FREQS suma 14, así que los topes sumaban 20 para 21 huecos
  // y el solver tenía que saltarse la cuota en ocho de ellos.
  //
  // Una familia que el usuario puso a CERO se queda a cero: "nada de carne" no
  // es una proporción que repartir, es una exclusión.
  const ceros = Object.keys(completos).filter((f) => completos[f] === 0);
  const presupuesto = Math.max(
    presupuestoDeTopes(huecos),
    Object.values(completos).reduce((a, b) => a + b, 0),
  );
  const conHolgura = repartoAFreqs(freqsAReparto(completos), { presupuesto });
  for (const f of ceros) conHolgura[f] = 0;
  return { freqs: conHolgura, objetivo: completos };
}

function recordCall(stats, kind, result) {
  if (!stats) return;
  stats.llmCalls++;
  if (kind === "planner") stats.plannerCalls++;
  else if (kind === "correction") stats.correctionCalls++;
  else stats.formatRetries++;
  stats.llmMs += result.ms;
  stats.slowestCallMs = Math.max(stats.slowestCallMs, result.ms);
  const usage = result.usage ?? {};
  stats.inputTokens += usage.input_tokens ?? 0;
  stats.outputTokens += usage.output_tokens ?? 0;
  stats.cacheReadTokens += usage.cache_read_input_tokens ?? 0;
  stats.cacheWriteTokens += usage.cache_creation_input_tokens ?? 0;
  stats.statusRetries += result.statusRetries;
  stats.networkRetries += result.networkRetries;
  stats.backgroundRetries += result.backgroundRetries;
}

// ── System prompt ───────────────────────────────────────────────

// El system prompt que antes vivia aqui (SYSTEM_PROMPT) ahora es propiedad
// del servidor: api/_prompts.js. El cliente solo envia un `task`, para que
// /api/generate no pueda usarse como LLM generico con un prompt cualquiera.


// ── Context builders ────────────────────────────────────────────

export function buildGroupContext(data, group) {
  const meals = getMeals(data);
  const groupMembers = membersOfGroup(group, data.members);
  const isBabyGroup = isBabyMenuGroup(group, data.members);
  const hasKids =
    !isBabyGroup &&
    groupMembers.some((m) => {
      const s = stageForAge(resolveMemberAge(m)).id;
      return s === "infantil" || s === "primaria";
    });
  const allergies = Array.from(new Set(groupMembers.flatMap((m) => m.allergies ?? [])));
  // Predefined intolerances + temporary dietary states (embarazo/lactancia)
  // are aggregated together and handled by filterRecipes via lib/intolerances.js
  // — most are hard exclusions, lactosa_fina is adapted (see substitutions.js).
  const memberDietaryStates = groupMembers.flatMap((m) => m.dietaryStates ?? []);
  // embarazo/lactancia imply "alcohol_cocina" (adaptable — real alcohol-free
  // wine/beer swap) in addition to their own remaining hard exclusions (raw,
  // cured, high-mercury fish, unpasteurized cheese). Not user-selectable on
  // its own; see lib/intolerances.js#alcohol_cocina.
  const impliesAlcoholCocina = memberDietaryStates.some(
    (s) => s === "embarazo" || s === "lactancia",
  );
  const intolerances = Array.from(
    new Set([
      ...groupMembers.flatMap((m) => m.intolerances ?? []),
      ...memberDietaryStates,
      ...(impliesAlcoholCocina ? ["alcohol_cocina"] : []),
    ]),
  );
  // `data.excluidos` es lo que el panel/wizard proyecta de la libreta ("nada
  // de coliflor"): mismo formato y misma semántica que un dislike —soft, con
  // fallback para no vaciar el pool— así que va al mismo saco. Hasta el 11
  // sep 2026 se proyectaba y no lo leía nadie.
  const dislikes = Array.from(
    new Set([...(data.dislikes ?? []), ...(data.excluidos ?? []), ...groupMembers.flatMap((m) => m.dislikes ?? [])]),
  );

  const kitchenTools = [...(data.kitchenTools ?? []), ...(data.customKitchenTools ?? [])];
  const cookTime = migrateCookTime(data);

  const slots = [];
  const schoolMenuByDay = {};

  // Ad-hoc individual menus (e.g. "dieta blanda") only span a few days, not the
  // whole week. Everything else keeps the standard 7-day window.
  const planDays =
    Number.isInteger(group.days) && group.days > 0 ? DAYS.slice(0, group.days) : DAYS;

  // Kid dinner = adults' lunch: adults' comida must avoid school proteins/carbs
  // from household kids; kids' cena slots are skipped and filled after Adultos.
  const linkKidDinner = Boolean(data.kidDinnerMatchesAdultLunch);
  const isAdultsGroup = group.label === "Adultos";
  const isKidsGroup = group.label === "Niños";
  const schoolSourceMembers =
    linkKidDinner && isAdultsGroup
      ? (data.members ?? []).filter((m) => stageForAge(resolveMemberAge(m)).id !== "adulto")
      : groupMembers;

  for (const day of planDays) {
    const daySlug = DAY_SLUG[day];
    const isWeekend = day === "Sáb" || day === "Dom";

    const schoolProteins = new Set(
      schoolSourceMembers
        .map((m) => {
          const courses = getSchoolDish(data.schoolMenus, m.id, day);
          if (!hasAnySchoolDish(courses)) return null;
          const text = [courses.primero, courses.segundo, courses.postre]
            .filter(Boolean)
            .join(" ");
          return proteinFromText(text);
        })
        .filter(Boolean),
    );

    // Carb base (arroz/pasta/patatas/...) the school already served that day.
    // Only primero+segundo feed this — postre text (e.g. "Arroz con leche")
    // would otherwise false-positive the taxonomy against a dessert, not a
    // real carb-bearing course.
    const schoolCarbs = new Set(
      schoolSourceMembers
        .map((m) => {
          const courses = getSchoolDish(data.schoolMenus, m.id, day);
          if (!hasAnySchoolDish(courses)) return null;
          const text = [courses.primero, courses.segundo].filter(Boolean).join(" ");
          return carbTypeFromText(text);
        })
        .filter(Boolean),
    );

    // Whether the school served vegetables that day (primero+segundo). Only
    // consulted when a kid opted into avoiding veg repetition at dinner.
    const schoolVeg = new Set(
      schoolSourceMembers
        .map((m) => {
          const courses = getSchoolDish(data.schoolMenus, m.id, day);
          if (!hasAnySchoolDish(courses)) return null;
          const text = [courses.primero, courses.segundo].filter(Boolean).join(" ");
          return schoolServedVeg(text);
        })
        .filter(Boolean),
    );

    // Collect school menu text for context
    for (const m of schoolSourceMembers) {
      const courses = getSchoolDish(data.schoolMenus, m.id, day);
      if (hasAnySchoolDish(courses)) {
        const parts = [courses.primero, courses.segundo, courses.postre].filter(Boolean);
        if (parts.length > 0) schoolMenuByDay[daySlug] = parts.join(", ");
      }
    }

    for (const meal of meals) {
      const mode = modeForGroupSlot(group, data.members, data.schedule, day, meal);
      if (!mode.cook) continue;

      // El menú de los niños: los huecos que copian del menú de los adultos
      // (mediodía en familia, "cena como los padres" / "lo del mediodía",
      // finde juntos) o que no se planifican se resuelven tras la generación
      // (ver bloque de copia). Aquí solo generamos los que son "suyos".
      if (isKidsGroup && kidsSlotAction(data, day, meal) !== "generate") continue;

      const eaters = groupMembers.filter((m) => {
        const status = data.schedule[slotKey(m.id, day, meal)] ?? "casa";
        return status === "casa" || status === "tupper";
      }).length;

      const mealType = meal.toLowerCase() === "cena" ? "cena" : "comida";
      const maxTime = maxCookTime(data, { isWeekend, meal });
      // User-marked exception for this exact day+meal ("unico" | "rapida").
      const slotTypeSel = data.slotType?.[`${day}|${meal}`];

      // Per-group override first; si no hay, la estructura global (modo básico);
      // si no, primero+segundo.
      const mealStructure =
        data.mealStructureByGroup?.[group.id] ?? data.mealStructure ?? "primero_segundo";
      // La cena tiene su propia estructura y su propio defecto. No hereda la de
      // la comida: quien come de primero y segundo no cena por fuerza igual, y
      // lo normal en España es cenar una cosa. Por eso el defecto es "1_plato"
      // aunque la comida sea "primero_segundo".
      const estructuraCena =
        data.mealStructureCenaByGroup?.[group.id] ?? data.mealStructureCena ?? "1_plato";

      if (mealType === "comida") {
        if (isBabyGroup) {
          slots.push({ day, daySlug, mealType, eaters, mode: mode.mode, maxTime, slotId: `${daySlug}_comida_1`, position: "plato_unico" });
        } else if (slotTypeSel === "unico" || mealStructure === "1_plato") {
          // Single complete dish: only one slot, no primero+segundo.
          const slot = {
            day, daySlug, mealType, eaters, mode: mode.mode,
            maxTime: slotTypeSel === "rapida" ? Math.min(maxTime, 15) : maxTime,
            slotId: `${daySlug}_comida_1`,
            position: "plato_unico",
            preferType: slotTypeSel === "rapida" ? "comida_rapida" : "plato_unico",
          };
          if (linkKidDinner && isAdultsGroup && schoolProteins.size > 0) {
            slot.schoolProteinsToAvoid = Array.from(schoolProteins);
          }
          if (linkKidDinner && isAdultsGroup && schoolCarbs.size > 0) {
            slot.schoolCarbsToAvoid = Array.from(schoolCarbs);
          }
          slots.push(slot);
        } else if (slotTypeSel === "rapida") {
          // Quick lunch: one light dish ≤15 min (ensalada, plancha…).
          const slot = {
            day, daySlug, mealType, eaters, mode: mode.mode,
            maxTime: Math.min(maxTime, 15),
            slotId: `${daySlug}_comida_1`,
            position: "plato_unico",
            preferType: "comida_rapida",
          };
          if (linkKidDinner && isAdultsGroup && schoolProteins.size > 0) {
            slot.schoolProteinsToAvoid = Array.from(schoolProteins);
          }
          if (linkKidDinner && isAdultsGroup && schoolCarbs.size > 0) {
            slot.schoolCarbsToAvoid = Array.from(schoolCarbs);
          }
          slots.push(slot);
        } else {
          // El deslizador es el presupuesto de la COMIDA ENTERA, no de cada
          // plato. Hubo una versión que lo repartía 40/60 y daba a cada plato
          // un tope propio que sumaba exactamente el presupuesto. Suena bien y
          // es inaplicable: con los 30 minutos que trae la app por defecto, el
          // primero se quedaba en 12 minutos y en TODO el catálogo hay cuatro
          // primeros que caben ahí. Cinco comidas entre semana, cuatro platos
          // posibles: el hueco se quedaba vacío por aritmética, y por eso unos
          // días salían con primero y segundo y otros con un solo plato.
          //
          // Dos platos no se cocinan uno detrás de otro: la ensalada se monta
          // mientras el horno trabaja. Así que cada plato cabe en el
          // presupuesto entero, y lo que se vigila es la PAREJA (regla 8b, con
          // `mealBudget`): no vale juntar dos platos largos.
          const primero = { day, daySlug, mealType, eaters, mode: mode.mode, maxTime, mealBudget: maxTime, slotId: `${daySlug}_comida_1`, position: "primero" };
          const segundo = { day, daySlug, mealType, eaters, mode: mode.mode, maxTime, mealBudget: maxTime, slotId: `${daySlug}_comida_2`, position: "segundo" };
          if (linkKidDinner && isAdultsGroup && schoolProteins.size > 0) {
            segundo.schoolProteinsToAvoid = Array.from(schoolProteins);
          }
          if (linkKidDinner && isAdultsGroup && schoolCarbs.size > 0) {
            segundo.schoolCarbsToAvoid = Array.from(schoolCarbs);
          }
          slots.push(primero, segundo);
        }
      } else {
        // (Los huecos de cena de niños que copian/omiten ya se filtraron arriba
        // con kidsSlotAction; aquí solo llega "cena diferente" o menú propio.)
        const isQuick = slotTypeSel === "rapida";
        // La cena de DOS platos: una crema, un gazpacho o una ensalada delante,
        // y algo ligero detrás. Una crema sola es poca cena —57 de las 69 sopas
        // que pueden cenarse están por debajo de 300 kcal— y con algo al lado
        // deja de serlo.
        //
        // Una cena rápida nunca se parte: quien la marcó pidió justo lo
        // contrario, un solo plato y pronto.
        const dosPlatos = estructuraCena === "primero_segundo" && !isQuick;
        if (dosPlatos) {
          const comun = { day, daySlug, mealType, eaters, mode: mode.mode, maxTime, mealBudget: maxTime };
          const primeroCena = { ...comun, slotId: `${daySlug}_cena_1`, position: "primero" };
          const segundoCena = { ...comun, slotId: `${daySlug}_cena_2`, position: "segundo" };
          const avoid = effectiveSchoolAvoid(data);
          if (avoid.protein && schoolProteins.size > 0) segundoCena.schoolProteinsToAvoid = Array.from(schoolProteins);
          if (avoid.carbs && schoolCarbs.size > 0) segundoCena.schoolCarbsToAvoid = Array.from(schoolCarbs);
          if (avoid.veg && schoolVeg.size > 0) primeroCena.schoolVegToAvoid = Array.from(schoolVeg);
          slots.push(primeroCena, segundoCena);
          continue;
        }
        const slot = {
          day, daySlug, mealType, eaters, mode: mode.mode,
          maxTime: isQuick ? Math.min(maxTime, 15) : maxTime,
          slotId: `${daySlug}_cena`,
        };
        if (isQuick) slot.preferType = "cena_rapida";
        // "Cena diferente": qué NO puede repetir respecto al comedor. Proteína e
        // hidratos por defecto; verdura solo si algún niño lo pidió (pop-up).
        const avoidCats = effectiveSchoolAvoid(data);
        if (avoidCats.protein && schoolProteins.size > 0) {
          slot.schoolProteinsToAvoid = Array.from(schoolProteins);
        }
        if (avoidCats.carbs && schoolCarbs.size > 0) {
          slot.schoolCarbsToAvoid = Array.from(schoolCarbs);
        }
        if (avoidCats.veg && schoolVeg.size > 0) {
          slot.schoolVegToAvoid = Array.from(schoolVeg);
        }
        slots.push(slot);
      }
    }
  }

  return {
    group: { label: group.label, hasKids, allergies, dislikes },
    slots,
    schoolMenuByDay,
    isBabyGroup,
    filterOpts: {
      allergies,
      intolerances,
      dislikes,
      // Permanent + still-live weekly/cooldown discards, excluded by id.
      excludeIds: activeDiscardIds(data),
      hasKids,
      // Cremas, sólidos o las dos. Solo lo mira el grupo de bebés; para el
      // resto filterRecipes lo ignora.
      etapasBebe: etapasServibles(data),
      maxTime: maxCookTimeFilter(data),
      kitchenTools,
      cookLevel: data.cookLevel ?? "normal",
      isBabyGroup,
      // User-created recipes (from the recipe planner) join the same pool as
      // the bundled catalog, so they go through the exact same filters and
      // can be scheduled/scaled/hydrated like any other recipe.
      extraRecipes: data.userRecipes ?? [],
      // "preferred" (default) | "only" (solo mías) | "catalog" (solo catálogo).
      recipeMode: data.recipeMode ?? "preferred",
      // Favorites that apply to THIS group (scope "all" or this group's label).
      favoriteIds: favoriteIdsForGroup(data.recipeVotes, group.label),
      // Cocinas extranjeras pedidas desde la fila de mandos del menú. Vista
      // proyectada de la libreta (ver useWizardMenu), no la libreta: aquí es un
      // mapa cocina → platos por semana. `undefined` para quien nunca lo ha
      // tocado, y entonces filterRecipes no filtra nada.
      cocinas: data.cocinas ?? null,
    },
    config: {
      targetKcal: data.kcalByGroup?.[group.id] ?? data.kcal ?? 2000,
      // `freqs` son los topes y `objetivo` a dónde apuntar dentro de ellos
      // (solo lo lee el solver). Ver topesDelGrupo.
      ...topesDelGrupo(data, group, slots.length),
      cookLevel: data.cookLevel ?? "normal",
      cookTime,
      // "Menú más cuidado" profiles present in the group (soft bias for the LLM).
      // An ad-hoc "dieta blanda" menu reuses the reflux profile as a bland-diet
      // proxy (no fritos/picante/ácido), so the individual menu comes out gentle.
      healthProfiles: Array.from(
        new Set([
          ...groupMembers.flatMap((m) => m.healthProfiles ?? []),
          ...(group.adHoc && group.reason === "dieta_blanda" ? ["reflux"] : []),
        ]),
      ),
    },
  };
}

// Exported for tests only — not used elsewhere outside this module.
// pantryMode: "strict" (solo con lo de casa, sin comprar) | "only" (partir de
// lo de casa, fuerte) | "prefer"/"off" (preferencia blanda). "off" nunca llega
// aquí con nombres porque App vacía la lista antes.
// Preferred column order for the compact ("planner-compact") catalog table.
// Any other field a recipe carries is appended after these, and a column no
// recipe uses is left out, so the table always holds what the JSON form did.
const COMPACT_CATALOG_COLUMNS = [
  "id", "name", "category", "mainProtein", "mealRole", "time", "kcal",
  "kidFriendly", "tupperFriendly", "mainBase", "extraProteins", "cocina",
  "protein_g", "carbs_g", "fat_g", "healthFlags", "pantryScore", "aporte", "montaje", "favorite", "own",
];

function compactCell(value) {
  if (value === undefined || value === null) return "";
  if (typeof value === "boolean") return value ? "1" : "0";
  if (Array.isArray(value)) return value.join(",");
  return String(value).replace(/[|\r\n]+/g, " ");
}

/**
 * The decision catalog as a "|"-separated table: a header line, then one line
 * per recipe. Same content as the JSON form without repeating every field name
 * for each of ~240 recipes. Exported for tests.
 */
export function compactCatalogTable(catalog) {
  const known = new Set(COMPACT_CATALOG_COLUMNS);
  const extra = [...new Set(catalog.flatMap((r) => Object.keys(r)))].filter((k) => !known.has(k));
  const columns = [...COMPACT_CATALOG_COLUMNS, ...extra].filter((c) =>
    catalog.some((r) => r[c] !== undefined),
  );
  return [
    columns.join("|"),
    ...catalog.map((r) => columns.map((c) => compactCell(r[c])).join("|")),
  ].join("\n");
}

// `format`: "json" (task "planner") or "compact" (task "planner-compact").
export function buildUserMessage(filteredRecipes, slots, config, schoolMenuByDay, fixedDishes = [], pantryNames = [], pantryMode = "prefer", frozenDishes = [], recipeMode = "preferred", fridgeDishes = [], cocinas = null, format = "json", bases = null) {
  const catalog = decisionCatalog(filteredRecipes);
  // How a boolean catalog flag reads in each format, for the instructions below.
  const flagText = (field) => (format === "compact" ? `${field} = 1` : `"${field}": true`);
  const slotsForLLM = slots.map((s) => {
    const out = { slotId: s.slotId, mealType: s.mealType, mode: s.mode, maxTime: s.maxTime };
    if (s.position) out.position = s.position;
    if (s.preferType) out.preferType = s.preferType;
    if (s.schoolProteinsToAvoid) out.schoolProteinsToAvoid = s.schoolProteinsToAvoid;
    if (s.schoolCarbsToAvoid) out.schoolCarbsToAvoid = s.schoolCarbsToAvoid;
    if (s.schoolVegToAvoid) out.schoolVegToAvoid = s.schoolVegToAvoid;
    return out;
  });

  const parts = [
    `\nHuecos a rellenar (con sus restricciones):\n${JSON.stringify(slotsForLLM)}`,
    `\nConfig:\n${JSON.stringify(config)}`,
  ];

  if (Object.keys(schoolMenuByDay).length > 0) {
    parts.push(`\nMenú escolar:\n${JSON.stringify(schoolMenuByDay)}`);
  }

  const fixedForAI = formatFixedDishesForAI(fixedDishes);
  if (fixedForAI.length > 0) {
    parts.push(`\nPlatos a repetir:\n${JSON.stringify(fixedForAI)}`);
  }

  if (pantryNames.length > 0) {
    const pantryInstruction =
      pantryMode === "strict"
        ? `\n\nINSTRUCCIÓN ADICIONAL (PRIORIDAD MÁXIMA): El usuario quiere cocinar SOLO con lo que ya tiene en casa, sin comprar. Para CADA hueco, elige exclusivamente recetas cuyos ingredientes principales estén en esta lista. Solo si es imposible cubrir un hueco con lo disponible, recurre a una receta con ingredientes de fuera, y reduce esos casos al mínimo absoluto. Nunca rompas las demás reglas (complementación escolar, alergias) ni fuerces combinaciones sin sentido culinario.`
        : pantryMode === "only"
        // "Sobre todo lo de casa" = GASTAR lo que hay, no "preferir" lo que
        // hay. Decía "elige preferentemente recetas cuyos ingredientes estén
        // en casa", que es una preferencia difusa y dejaba media despensa sin
        // tocar; el objetivo real de quien elige esto es que no se le eche a
        // perder nada. Lo que sobre después, libre.
        ? `

INSTRUCCIÓN ADICIONAL (PRIORIDAD ALTA): GASTA esta lista. Coloca platos que usen estos ingredientes hasta agotarlos, empezando por los que antes se estropean (fresco antes que seco o congelado). No es una preferencia difusa: el objetivo es que al acabar la semana no quede nada de esta lista sin usar. Los huecos que sobren después, elígelos con total libertad del catálogo. Nunca rompas por esto las demás reglas (complementación escolar, variedad, alergias, tipo de plato) ni fuerces combinaciones sin sentido culinario: si un ingrediente no encaja en ningún hueco, déjalo fuera antes que forzarlo.`
        : `\n\nINSTRUCCIÓN ADICIONAL: Cuando haya dos recetas equivalentes para un hueco, prioriza la que use más ingredientes de esta lista. Esta preferencia es SECUNDARIA a todas las demás reglas (complementación escolar, variedad, alergias). No fuerces recetas que no encajen solo por usar ingredientes disponibles.`;
    parts.push(
      `\nINGREDIENTES QUE EL USUARIO YA TIENE EN CASA:\n${pantryNames.map((n) => `- ${n}`).join("\n")}` +
        pantryInstruction,
    );
  }

  // Cocinas pedidas desde la fila de mandos del menú. La PUERTA ya se aplicó
  // en filterRecipes (lo que está a cero no está en este pool), así que aquí
  // solo queda pedir que lo pedido se coloque de verdad — una puerta quita
  // candidatos, no pone platos. Si el modelo no lo cumple, lo repara después
  // `ajustarCuota` (lib/cuotaCocinas.js), que es lo que convierte esto en una
  // promesa y no en una sugerencia.
  const cocinasPedidas = Object.entries(cocinas ?? {})
    .filter(([cocina, n]) => Number(n) > 0 && esAnadido(cocina))
    .map(([cocina, n]) => [cocina, Math.min(Number(n), topeDe(cocina))])
    .filter(([, n]) => n > 0);
  if (cocinasPedidas.length > 0) {
    const lista = cocinasPedidas
      .map(([cocina, n]) => `- ${cocina}: ${n} ${n === 1 ? "plato" : "platos"}`)
      .join("\n");
    parts.push(
      `\nCOCINAS QUE LA CASA QUIERE ESTA SEMANA:\n${lista}` +
        `\n\nINSTRUCCIÓN ADICIONAL (PRIORIDAD ALTA): coloca ESE número de platos de cada una de esas cocinas, repartidos por la semana y no seguidos. Las recetas de esas cocinas llevan su campo "cocina" en el catálogo de arriba. No pongas más de los pedidos, y no metas platos de otras cocinas extranjeras que no estén en esta lista. Nunca rompas por esto las demás reglas: alergias, complementación escolar, tipo de plato, ni dos veces la misma proteína en comidas seguidas.`,
    );
  }

  // BASES pedidas. Va junto a las cocinas porque es la misma forma de petición
  // —"quiero N platos de esto"— y se cumple igual: colocando, no corrigiendo
  // después.
  //
  // Antes esto no se le decía al modelo. La regla existía y se cumplía, pero
  // solo como reparación posterior: el menú se escribía a ciegas y luego se
  // sustituían huecos para meter la base. Funciona, pero cambia platos que el
  // modelo había elegido por otros motivos, y falla en cuanto el hueco que
  // habría que tocar tiene otras restricciones.
  const basesPedidasLista = Object.entries(bases ?? {}).filter(([, n]) => n > 0);
  if (basesPedidasLista.length > 0) {
    const lista = basesPedidasLista
      .map(([clave, n]) => `- ${clave}: ${n} ${n === 1 ? "plato" : "platos"}`)
      .join("\n");
    parts.push(
      `\nBASES QUE LA CASA COCINA EN TANDA ESTA SEMANA:\n${lista}`
      + "\n\nINSTRUCCIÓN ADICIONAL (PRIORIDAD ALTA): coloca ESE número de platos de cada base."
      + " Un plato lleva una base si la nombra en su campo basesAparte, o si su mainBase coincide y además trae baseMode aparte."
      + " El sentido es cocinar esa olla UNA vez el domingo y repartirla entre varios días, así que reparte esos platos por la semana en vez de ponerlos seguidos."
      + " No hace falta pasarse: más de los pedidos no aporta nada. Y nunca rompas por esto las demás reglas: alergias, objetivos semanales, complementación escolar, tipo de plato ni proteína repetida en comidas seguidas.",
    );
  }

  // Congelador: platos YA cocinados y congelados de recetas que están en este
  // catálogo. Colocarlos ahorra cocinar y comprar, así que se empujan fuerte,
  // pero es el modelo quien decide en qué hueco pegan (variedad, tipo de plato,
  // complementación escolar). El reparto exacto de raciones lo hace después una
  // pasada determinista (assignFreezerToPlan) — aquí solo se sesga la elección.
  if (frozenDishes.length > 0) {
    parts.push(
      `\nPLATOS YA COCINADOS EN EL CONGELADOR (raciones listas para comer):\n${frozenDishes
        .map((d) => `- ${d.name} (${d.portions} ${d.portions === 1 ? "ración" : "raciones"}) → recipeId "${d.recipeId}"`)
        .join("\n")}` +
        `\n\nINSTRUCCIÓN ADICIONAL (PRIORIDAD ALTA): coloca estos platos en algún hueco de la semana donde encajen. Ya están hechos: no hay que cocinarlos ni comprarlos, solo descongelar. Usa EXACTAMENTE el recipeId indicado. No repitas el mismo plato congelado en más huecos de los que dan sus raciones, y no lo fuerces en un hueco donde rompa el tipo de plato, la variedad, la complementación escolar o las alergias.`,
    );
  }

  if (fridgeDishes.length > 0) {
    parts.push(
      `\nPLATOS YA COCINADOS EN LA NEVERA (raciones listas para comer pronto):\n${fridgeDishes
        .map((d) => {
          const garnishNote = d.garnishName ? ` con ${d.garnishName}` : "";
          return `- ${d.name}${garnishNote} (${d.portions} ${d.portions === 1 ? "ración" : "raciones"}) → recipeId "${d.recipeId}"`;
        })
        .join("\n")}` +
        `\n\nINSTRUCCIÓN ADICIONAL (PRIORIDAD ALTA): coloca estos platos en los huecos más próximos donde encajen — caducan antes que el congelador. Ya están hechos: no hay que cocinarlos ni comprarlos, solo recalentar. Usa EXACTAMENTE el recipeId indicado. No repitas el mismo plato en más huecos de los que dan sus raciones.`,
    );
  }

  // Favorites nudge: only add it when the pool actually has favorites, so the
  // instruction never confuses the model when there's nothing to prioritize.
  if (catalog.some((r) => r.favorite)) {
    parts.push(
      `\nRECETAS FAVORITAS DEL USUARIO: las marcadas con ${flagText("favorite")} en el catálogo. Cuando encajen en un hueco (respetando tipo de plato, tiempo, variedad y todas las demás reglas), PRIORÍZALAS sobre otras equivalentes. Es una preferencia fuerte pero no absoluta: no repitas la misma favorita más de lo razonable ni rompas la variedad del menú solo por incluirlas.`,
    );
  }

  const ownRecipes = catalog.filter((r) => r.own);
  if (ownRecipes.length > 0 && recipeMode !== "catalog") {
    parts.push(
      recipeMode === "only"
        ? `\nRECETAS PROPIAS DEL USUARIO: las marcadas con ${flagText("own")}. El menú DEBE usar EXCLUSIVAMENTE estas recetas (${ownRecipes.length} disponibles). Repite las que hagan falta para cubrir todos los huecos, respetando tipo de plato, tiempo, variedad y todas las demás reglas.`
        : `\nRECETAS PROPIAS DEL USUARIO: las marcadas con ${flagText("own")} en el catálogo. Cuando encajen en un hueco (respetando tipo de plato, tiempo, variedad y todas las demás reglas), PRIORÍZALAS sobre las del catálogo. Es una preferencia fuerte: incluye al menos una receta propia en la semana si alguna encaja, y no las ignores sistemáticamente a favor del catálogo.`,
    );
  }

  parts.push(`\nAsigna una receta del catálogo a cada hueco.`);

  // Content blocks with a cache breakpoint after the catalog: Anthropic caches
  // the system prompt + catalog prefix, so format/correction retries and
  // regenerations within the TTL read it at ~10% of input cost. The same array
  // reference is reused across retries to keep the prefix byte-identical.
  return [
    {
      type: "text",
      text: `Catálogo:\n${format === "compact" ? compactCatalogTable(catalog) : JSON.stringify(catalog)}`,
      cache_control: { type: "ephemeral" },
    },
    { type: "text", text: parts.join("\n") },
  ];
}

// ── Slot-type exceptions (user-marked "plato único" / "cena rápida") ──────
// recipeMatchesPreferType vive en utils/filterRecipes.js: Inspíranos arma su
// mazo de "cena rápida" con el mismo predicado, y duplicarlo dejaría que el
// mazo y el generador divergieran.

/**
 * Deterministically forces slots the user flagged (preferType) to carry a
 * recipe of the right kind — a single dish for a "plato único" comida, a quick
 * recipe for a "cena rápida". The LLM is asked to do this; this guarantees it.
 * Mutates `poolById` so downstream steps can resolve any forced recipe.
 */
function enforceSlotTypes(slotAssignments, slotsContext, poolById) {
  const ctxBySlot = Object.fromEntries(slotsContext.map((s) => [s.slotId, s]));
  const bySlot = new Map(slotAssignments.map((s) => [s.slotId, { ...s }]));
  const used = new Set(slotAssignments.map((s) => s.recipeId));

  for (const [slotId, a] of bySlot) {
    const ctx = ctxBySlot[slotId];
    const preferType = ctx?.preferType;
    if (!preferType) continue;
    if (recipeMatchesPreferType(poolById[a.recipeId], preferType, ctx.eaters)) continue;

    const fits = (r) => {
      if (!recipeMatchesPreferType(r, preferType, ctx.eaters)) return false;
      if (ctx.maxTime && r.time > ctx.maxTime) return false;
      if (ctx.mode === "tupper" && !r.tupperFriendly) return false;
      return true;
    };

    // Only ever force a recipe that survived the group's allergy/preference
    // filter (poolById). Falling back to the unfiltered catalog here could
    // inject an allergen/alcohol/baby-only dish to honor a soft preferType —
    // safety wins, so if nothing safe fits we leave the LLM's original (valid)
    // pick untouched rather than swapping in something unfiltered.
    const candidate =
      Object.values(poolById).find((r) => fits(r) && !used.has(r.id)) ??
      Object.values(poolById).find(fits);
    if (!candidate) continue;

    if (!poolById[candidate.id]) poolById[candidate.id] = candidate;
    used.delete(a.recipeId);
    used.add(candidate.id);
    bySlot.set(slotId, { slotId, recipeId: candidate.id });
  }

  return slotAssignments.map((s) => bySlot.get(s.slotId) ?? s);
}

// ── Deterministic baby planner ──────────────────────────────────

function extractMainBase(recipe) {
  if (recipe.mainBase) return recipe.mainBase;
  const BASE_RE = /patata|boniato|calabac|zanahoria|calabaza|espinaca|brócoli|puerro|arroz|guisante|lenteja|garbanzo|cuscús|fideos|avena|sémola|coliflor|remolacha|pasta/i;
  const ing = recipe.ingredients?.find((i) => BASE_RE.test(i.name));
  return ing ? ing.name.toLowerCase().split(" ")[0] : null;
}

function generateBabyMenuDeterministic(pool, slots) {
  const slotsByDay = {};
  for (const s of slots) {
    const day = s.daySlug;
    if (!slotsByDay[day]) slotsByDay[day] = [];
    slotsByDay[day].push(s);
  }

  const days = Object.keys(slotsByDay);
  const assignments = [];
  const usedThisWeek = new Set();
  const recentBases = [];

  // comida → complete dishes (not tagged for cena); cena → lighter dishes tagged "cena"
  const comidaPool = pool.filter((r) => !r.mealRole?.includes("cena"));
  const cenaPool = pool.filter((r) => r.mealRole?.includes("cena"));

  const proteinTypes = ["pollo", "pescado_blanco", "ternera", "legumbre", "huevo", "pavo", "pescado_azul"];
  let proteinTypeIdx = 0;

  const pickFrom = (subpool, avoid) => {
    const avoidSet = new Set(avoid);
    return subpool.find((r) => !usedThisWeek.has(r.id) && !avoidSet.has(extractMainBase(r)))
      ?? subpool.find((r) => !usedThisWeek.has(r.id))
      ?? pool.find((r) => !usedThisWeek.has(r.id))
      ?? pool[0];
  };

  const pickByProteinFrom = (subpool, targetType, avoid) => {
    const avoidSet = new Set(avoid);
    return subpool.find((r) => r.mainProtein === targetType && !usedThisWeek.has(r.id) && !avoidSet.has(extractMainBase(r)))
      ?? subpool.find((r) => r.mainProtein === targetType && !usedThisWeek.has(r.id))
      ?? pickFrom(subpool, avoid);
  };

  for (const day of days) {
    const daySlots = slotsByDay[day];
    const comidaSlot = daySlots.find((s) => s.mealType === "comida");
    const cenaSlot = daySlots.find((s) => s.mealType === "cena");
    let comidaBase = null;

    if (comidaSlot) {
      const targetType = proteinTypes[proteinTypeIdx % proteinTypes.length];
      proteinTypeIdx++;
      const candidate = pickByProteinFrom(comidaPool, targetType, recentBases.slice(-2));
      assignments.push({ slotId: comidaSlot.slotId, recipeId: candidate.id });
      usedThisWeek.add(candidate.id);
      comidaBase = extractMainBase(candidate);
      recentBases.push(comidaBase);
    }

    if (cenaSlot) {
      const avoidBases = [comidaBase, ...recentBases.slice(-2)].filter(Boolean);
      const candidate = pickFrom(cenaPool, avoidBases);
      assignments.push({ slotId: cenaSlot.slotId, recipeId: candidate.id });
      usedThisWeek.add(candidate.id);
      recentBases.push(extractMainBase(candidate));
    }
  }

  return assignments;
}

// ── Response schema ─────────────────────────────────────────────

const SlotAssignmentSchema = z.object({
  slotId: z.string().min(1),
  recipeId: z.string().min(1),
});

// "planner-compact" answers {"slots":{"lun_cena":"huevos_004",...}}. Normalize
// that map to the array shape so everything downstream sees a single format.
function normalizeSlotsShape(value) {
  const slots = value?.slots;
  if (!slots || typeof slots !== "object" || Array.isArray(slots)) return value;
  return {
    ...value,
    slots: Object.entries(slots).map(([slotId, recipeId]) => ({ slotId, recipeId })),
  };
}

const LLMResponseSchema = z.preprocess(
  normalizeSlotsShape,
  z.object({
    slots: z.array(SlotAssignmentSchema).min(1),
  }),
);

// ── Cross-week variety (parallel-safe) ──────────────────────────
// Multi-week menús are generated in parallel (see App.jsx#regenerateMenu), so a
// week can't look at what the previous week picked. Instead of a runtime
// exclusion set, each recipe gets a STABLE bucket in [0, weekCount) *within its
// own category*; a week keeps its own bucket and only tops up from other buckets
// to stay above a safe floor. Different weeks therefore lean toward disjoint
// dishes — and toward a comparable mix of meat/fish/legume/etc — deterministically
// and without any inter-week dependency. "relaxed" disables it; "moderate" uses
// a higher floor than "strict" (more overlap allowed, milder bias).

// djb2 — small, fast, stable string hash. Only needs to be deterministic across
// weeks within one generation, not cryptographic.
function hashId(id) {
  let h = 5381;
  const s = String(id);
  for (let i = 0; i < s.length; i++) h = (((h << 5) + h) + s.charCodeAt(i)) >>> 0;
  return h;
}

export function poolForWeek(pool, crossWeek, slotCount) {
  if (!crossWeek) return pool;
  const { weekIndex, weekCount, varietyPref } = crossWeek;
  if (!weekCount || weekCount <= 1 || varietyPref === "relaxed") return pool;

  // Keep enough recipes that per-slot variety/time/type rules still have room.
  const floor =
    varietyPref === "moderate"
      ? Math.max(slotCount * 3, 18)
      : Math.max(slotCount * 2, 12);
  if (pool.length <= floor) return pool;

  // ── Se reparte DENTRO de cada categoría, no sobre el pool entero ────────
  //
  // Antes el cubo salía de `hashId(r.id) % weekCount` sobre la bolsa completa,
  // que es ciego a QUÉ es cada receta: con cuatro semanas, a una le podían
  // tocar seis pescados y a otra uno. La que se queda corta pierde su objetivo
  // semanal —`splitAchievableFreqs` lo descarta con un aviso— y la otra va
  // sobrada. El sesgo entre semanas salía gratis y el desequilibrio también.
  //
  // Estratificando por `category` (que es lo que cuentan las claves de `freqs`)
  // cada semana recibe su parte proporcional de cada familia. Se conservan las
  // dos propiedades que hacen que esto funcione en paralelo: es DETERMINISTA
  // —misma entrada, misma salida— y no depende de lo que eligiera otra semana.
  const porEstrato = new Map();
  for (const r of pool) {
    const k = r.category ?? "sin_categoria";
    if (!porEstrato.has(k)) porEstrato.set(k, []);
    porEstrato.get(k).push(r);
  }
  const elegidos = new Set();
  for (const recetas of porEstrato.values()) {
    // Se ordena por hash y no por id: los ids del catálogo van por orden de
    // alta dentro de su fichero, así que un reparto por posición podía
    // correlacionar con el rol del plato (los primeros cincuenta "carnes" no
    // son una muestra representativa de las carnes).
    const ordenadas = [...recetas].sort(
      (a, b) => hashId(a.id) - hashId(b.id) || (a.id < b.id ? -1 : 1),
    );
    ordenadas.forEach((r, i) => {
      if (i % weekCount === weekIndex % weekCount) elegidos.add(r.id);
    });
  }
  // Se filtra el pool original en vez de devolver las recetas ya agrupadas: el
  // ORDEN del pool significa algo aguas abajo (el fallback coge "el primero que
  // pasa", y `ordenarPorSesgo` es un sort estable encima de él), así que
  // reordenarlo por categoría cambiaría en silencio qué plato sale.
  const own = pool.filter((r) => elegidos.has(r.id));
  const rest = pool.filter((r) => !elegidos.has(r.id));
  if (own.length >= floor) return own;

  const need = floor - own.length;
  // "strict" ("cosas distintas cada semana") wants weeks as disjoint as the pool
  // allows. Buckets are already disjoint by construction; the only cross-week
  // overlap comes from this top-up. So borrow a WEEK-SPECIFIC slice of `rest`
  // (staggered by weekIndex) instead of every under-filled week grabbing the
  // same first recipes — best-effort disjointness without any inter-week
  // dependency (weeks still generate in parallel). "moderate" keeps the milder
  // shared top-up.
  if (varietyPref === "strict" && rest.length > 0) {
    const start = (weekIndex * need) % rest.length;
    const slice = rest.slice(start, start + need);
    const wrapped =
      slice.length < need ? slice.concat(rest.slice(0, need - slice.length)) : slice;
    return own.concat(wrapped);
  }
  return own.concat(rest.slice(0, need));
}

// ── Generation ──────────────────────────────────────────────────

// Exported for tests only — not used elsewhere outside this module.
/**
 * Pasos 1–3 del camino de siempre: llamada al modelo, reintentos de formato y
 * de corrección, y fallback determinista si sigue sin ser válido. Devuelve la
 * primera asignación de platos; lo que viene después (fijados, forzados,
 * cocinas, guarniciones, revalidación) lo hace generateGroupMenu igual para
 * este camino y para el solver.
 */
async function asignarConModelo({
  userMessage, format, plannerModel, signal, stats,
  filteredPool, ctx, achievableFreqs, basesDeLaSemana, data, group, warnings,
}) {
  // The primary planner model is resolvable per-generation (A/B Sonnet vs
  // Haiku); format/correction retries stay on the cheap FAST_MODEL.
  // Answer shape echoed in retry/correction messages, matching the task's format.
  const slotsShape =
    format === "compact"
      ? '{"slots":{"slotId":"recipeId",...}}'
      : '{"slots":[{"slotId":"...","recipeId":"..."},...]}';
  const task = format === "compact" ? "planner-compact" : "planner";
  const request = (messages, model = plannerModel, kind = "planner") =>
    callModel(
      { model, max_tokens: DEFAULT_MAX_TOKENS, task, messages },
      signal,
      { onResult: (result) => recordCall(stats, kind, result) },
    );

  // 1. First LLM call
  let text = await request([{ role: "user", content: userMessage }]);
  let parsed;
  try {
    parsed = extractJson(text);
  } catch {
    // LLM returned non-JSON — ask for a JSON-only retry before giving up
    const retryText = await request(
      [
        { role: "user", content: userMessage },
        { role: "assistant", content: text },
        {
          role: "user",
          content:
            `Tu respuesta no contiene JSON válido. Devuelve SOLO esto, sin texto adicional: ${slotsShape}`,
        },
      ],
      RETRY_MODEL,
      "format_retry",
    );
    try {
      parsed = extractJson(retryText);
      text = retryText;
    } catch (err2) {
      throw new AIPlannerError("No se pudo parsear el JSON de la IA.", { cause: err2, raw: retryText });
    }
  }

  let schemaResult = LLMResponseSchema.safeParse(parsed);

  // Schema retry with Haiku if format is wrong
  if (!schemaResult.success) {
    // TEMPORAL: diagnóstico del fallo "no se pudo parsear el JSON del
    // reintento" reportado en pruebas locales — quitar una vez identificada
    // la causa.
    console.error(
      "[aiPlanner] Primera respuesta no cumplió el esquema:",
      schemaResult.error.issues,
      "\nJSON parseado:", parsed,
    );
    const retryText = await request(
      [
        { role: "user", content: userMessage },
        { role: "assistant", content: text },
        {
          role: "user",
          content: `El JSON no cumple el formato. Devuelve SOLO ${slotsShape}\nErrores:\n${schemaResult.error.issues
            .slice(0, 5)
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("\n")}`,
        },
      ],
      RETRY_MODEL,
      "format_retry",
    );
    try {
      parsed = extractJson(retryText);
    } catch (err) {
      // TEMPORAL: ver comentario de arriba.
      console.error("[aiPlanner] Texto crudo del reintento que no parseó:", retryText);
      throw new AIPlannerError("No se pudo parsear el JSON del reintento.", { cause: err, raw: retryText });
    }
    schemaResult = LLMResponseSchema.safeParse(parsed);
    if (!schemaResult.success) {
      throw new AIPlannerError("La IA no devolvió un formato válido tras reintento.", {
        cause: schemaResult.error,
        raw: parsed,
      });
    }
    text = retryText;
  }

  let slotAssignments = schemaResult.data.slots;

  // 2. Business rule validation + up to 2 correction retries
  const MAX_RETRIES = 2;
  // Tracks the validateMenu() result for the CURRENT slotAssignments as of
  // the end of the loop: the loop only ever reassigns slotAssignments right
  // before looping back around to revalidate it (or, on the very last
  // attempt, not at all) — so this is always still accurate afterwards,
  // making the old unconditional re-validation below redundant.
  let finalCheck = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    finalCheck = validateMenu(slotAssignments, filteredPool, ctx.slots, ctx.config.healthProfiles, achievableFreqs, basesDeLaSemana);
    if (finalCheck.valid) break;
    if (attempt === 0 && stats) stats.invalidFirstPass++;

    if (attempt < MAX_RETRIES - 1) {
      const correctionMsg = buildCorrectionMessage(finalCheck.violations, slotsShape);
      const retryText = await request(
        [
          { role: "user", content: userMessage },
          { role: "assistant", content: text },
          { role: "user", content: correctionMsg },
        ],
        attempt === 0 ? plannerModel : RETRY_MODEL,
        "correction",
      );
      try {
        const retryParsed = extractJson(retryText);
        const retrySchema = LLMResponseSchema.safeParse(retryParsed);
        if (retrySchema.success) {
          slotAssignments = retrySchema.data.slots;
          text = retryText;
        }
      } catch {
        // parse failed, will fallback on next iteration
      }
    }
  }

  // 3. Apply deterministic fallback if still invalid after retries.
  if (!finalCheck.valid) {
    if (stats) stats.fallbackUsed++;
    slotAssignments = applyFallback(
      slotAssignments,
      finalCheck.violations,
      // El fallback coge "el primero del pool que pasa", así que el orden ES
      // la preferencia. Ordenado por los sesgos de la casa (lib/sesgos.js):
      // estable, y el mismo array si no hay sesgos.
      ordenarPorSesgo(filteredPool, data.sesgos, data.favoritos),
      ctx.slots,
      ctx.config.healthProfiles,
      achievableFreqs,
      basesDeLaSemana,
    );
    // A violation the fallback could not repair leaves the offending dish in
    // the menu (dropping it would open a hole). It used to do so with no trace
    // at all — that's how "arroz de primero y arroz de segundo" reached a user.
    for (const v of slotAssignments.unfixedViolations ?? []) {
      warnings.push(`${group.label}: no se pudo corregir "${v.rule}" en ${v.slotId} (no hay ninguna receta alternativa compatible).`);
    }
    // Repetition used as a last resort to avoid an empty slot: tell the user
    // WHY a dish repeats so it reads as a consequence of their constraints,
    // not as a bug.
    const repeated = slotAssignments.repeatedForCompleteness ?? [];
    if (repeated.length > 0) {
      warnings.push(`${group.label}: se han repetido ${repeated.length} plato(s) porque no hay suficientes recetas distintas que cumplan tus restricciones (prueba a subir el tiempo de cocina).`);
    }
  }

  return slotAssignments;
}

/**
 * El otro camino: lib/solver.js. Sin modelo, sin reintentos, sin fallback:
 * construye el menú ya válido, o el parcial válido más largo que encuentre.
 *
 * El OBJETIVO (`ctx.config.objetivo`, el reparto exacto sobre los huecos
 * reales) guía la elección; los TOPES (`achievableFreqs`, con holgura) solo
 * dicen hasta dónde se puede llegar. Ver el comentario de resolverMenu.
 */
function asignarConSolver({
  group, ctx, filteredPool, achievableFreqs, basesDeLaSemana, data, stats, warnings,
}) {
  const semilla = semillaDeGeneracion();
  const res = resolverMenu(
    ctx.slots,
    ordenarPorSesgo(filteredPool, data.sesgos, data.favoritos),
    {
      healthProfiles: ctx.config.healthProfiles,
      freqs: achievableFreqs,
      objetivo: ctx.config.objetivo ?? null,
      basesPedidas: basesDeLaSemana,
      cocinas: ctx.filterOpts.cocinas ?? null,
      // Lo que ya saliste comiendo, para no repetirlo. Las favoritas de este
      // grupo van exentas: si lo marcaste como favorito, que vuelva es lo que
      // querías.
      recientes: recetasRecientes(data, { exentos: ctx.filterOpts.favoriteIds }),
      semilla,
    },
  );
  for (const [cocina, cuantos] of Object.entries(res.cocinasSinSitio)) {
    warnings.push(
      `${group.label}: no cabían ${cuantos} plato(s) de cocina ${cocina} esta semana (el catálogo se queda corto o los huecos estaban ocupados).`,
    );
  }
  if (stats) {
    stats.motor = "solver";
    stats.solverNodos = res.nodos;
    stats.solverMs = res.ms;
    stats.solverCompleto = res.completo;
    stats.solverRelajados = res.relajados.length;
    stats.solverSemilla = semilla;
  }
  // Los huecos SIN candidatos ya los avisa el paso 3c de generateGroupMenu
  // uno a uno. Esto es lo otro: había candidatos, pero ninguno compatible con
  // el resto de la semana.
  if (res.sinCombinacion.length > 0) {
    warnings.push(
      `${group.label}: no se encontró una combinación que cumpla todas las reglas a la vez; ${res.sinCombinacion.length} plato(s) se quedan sin asignar (${res.sinCombinacion.join(", ")}).`,
    );
  }
  if (res.relajados.length > 0) {
    warnings.push(
      `${group.label}: en ${res.relajados.join(", ")} no cabía ningún plato sin pasarse del reparto semanal o del perfil de salud; se ha puesto el mejor disponible.`,
    );
  }
  // La regla 11 culpa del exceso al ÚLTIMO plato de esa familia en orden de
  // comidas, no al que se relajó. Así que la revalidación no puede ignorar el
  // aviso por hueco: tiene que ignorarlo por FAMILIA relajada, o "repara" un
  // plato correcto y arrastra una cascada de cambios (medido: seis huecos
  // cambiados en una semana por un tope relajado en una cena).
  const porId = new Map(filteredPool.map((r) => [r.id, r]));
  const familiasRelajadas = new Set();
  for (const a of res.asignaciones) {
    if (!res.relajados.includes(a.slotId)) continue;
    for (const f of familiasDe(porId.get(a.recipeId) ?? {})) familiasRelajadas.add(f);
  }
  return {
    asignaciones: res.asignaciones,
    relajados: new Set(res.relajados),
    familiasRelajadas,
    // Los huecos que se quedan vacíos A PROPÓSITO: ningún plato cabe ni
    // relajando la orientación. Se dejan vacíos y explicados; rellenarlos con
    // el fallback pondría un plato que rompe una regla dura, que es justo el
    // "arroz de primero y arroz de segundo" que llegó a un usuario.
    vacios: new Set([...res.sinCandidatos, ...res.sinCombinacion]),
  };
}

/**
 * Una semilla nueva por generación, para que "regenerar" dé otra semana. Va a
 * la telemetría (solverSemilla) para poder reproducir un menú concreto.
 */
function semillaDeGeneracion() {
  return (Date.now() % 1_000_000) >>> 0;
}

export async function generateGroupMenu(data, group, signal, pantryIngredients = [], crossWeek = null, plannerModel = DEFAULT_MODEL, pantryMode = "prefer", { stats = null, format = "json" } = {}) {
  const ctx = buildGroupContext(data, group);
  // Pantry is family-wide (not per-group), so it's merged into filterOpts
  // here rather than inside buildGroupContext.
  const filterOpts = {
    ...ctx.filterOpts,
    pantryIngredients: pantryIngredients.map((p) => p.ingredientNormalized),
    // Fase 8: id canónico por fila de despensa cuando resolvió al guardar
    // (user_pantry.ingredient_id) — mismo orden que pantryIngredients, para
    // que scorePantryMatch pueda cruzar por id además de por texto.
    pantryIngredientIds: pantryIngredients.map((p) => p.ingredientId ?? null),
  };

  let { recipes: filteredPool, error: filterError } = filterRecipes(filterOpts);
  if (filterError) {
    throw new AIPlannerError(filterError);
  }

  // Multi-week menús bias against repeating the same dish across weeks. This is
  // a deterministic per-week pool partition (see poolForWeek) rather than a
  // runtime exclusion set, so weeks can be generated in parallel.
  filteredPool = poolForWeek(filteredPool, crossWeek, ctx.slots.length);

  // Baby groups use a deterministic planner — no LLM call needed
  if (ctx.isBabyGroup) {
    const slotAssignments = generateBabyMenuDeterministic(filteredPool, ctx.slots);
    return {
      group,
      slotAssignments,
      filteredPool,
      slotsContext: ctx.slots,
      // Same as the non-baby return below — without this, hydration falls
      // back to buildAdaptationMap's default `[]` and lactosa_fina/etc. never
      // get their ingredient swap applied for baby-only menus.
      restrictions: ctx.filterOpts.intolerances ?? [],
      warnings: [],
    };
  }

  // Garnishes come from a separate catalog (guarniciones.json) that never
  // goes through filterRecipes, so it needs its own allergy/intolerance/
  // alcohol pass — otherwise pairGarnishes could attach a side dish carrying
  // a restriction the main dish was correctly filtered to avoid.
  const safeGarnishes = filterGarnishes(filterOpts);

  // config.freqs (weekly category quotas) can only be enforced for keys the
  // filtered pool actually has enough recipes for — retrying the LLM can't
  // conjure up a 3rd pescado dish that isn't in the pool. Unachievable keys
  // are dropped from what validateMenu checks below and surfaced as a
  // warning instead of silently shipping an unbalanced week.
  const { achievable: achievableFreqs, warnings: freqWarnings } = splitAchievableFreqs(
    filteredPool,
    ctx.config.freqs,
  );
  const warnings = freqWarnings.map((msg) => `${group.label}: ${msg}`);

  // Las BASES que la casa ha pedido para esta semana, y cuáles de ellas caben
  // enteras. Todo o nada: una tanda a medias no ahorra nada (ver
  // basesAlcanzables). Una semana acortada deja fuera las que no quepan y lo
  // dice, en vez de colocar un plato suelto y llamarlo tanda.
  const { alcanzables: basesDeLaSemana, warnings: baseWarnings } = basesAlcanzables(
    filteredPool,
    basesPedidas(data?.tanda),
    ctx.slots.length,
  );
  for (const msg of baseWarnings) warnings.push(`${group.label}: ${msg}`);

  // Los platos cocinados viven en la misma tabla que los ingredientes, así que
  // hay que separarlos: "Lentejas estofadas" no es un ingrediente que sumar a la
  // lista de la despensa, es un plato entero listo para colocar en un hueco.
  //
  // Separados para USARLOS distinto, no para decidir distinto si entran: el
  // modo de despensa manda sobre los dos por igual (ver `pantryIngredients` en
  // App.jsx). Quien sube un táper quiere que entre en el menú, igual que quien
  // sube un bote de garbanzos; lo que se gradúa es cuánto pesa lo de casa, no
  // qué tipo de cosa cuenta.
  // Solo se ofrecen los que sobrevivieron al filtro del grupo (alergias, tiempo,
  // temporada): sugerir un plato congelado que este grupo no puede comer sería
  // peor que no sugerir nada.
  const frozenPoolIds = new Set(filteredPool.map((r) => r.id));
  const frozenDishes = [];
  for (const [recipeRef, items] of indexFrozenDishes(pantryIngredients)) {
    if (!frozenPoolIds.has(recipeRef)) continue;
    frozenDishes.push({
      recipeId: recipeRef,
      name:
        recipeCatalogById[recipeRef]?.name ??
        filteredPool.find((r) => r.id === recipeRef)?.name ??
        items[0].ingredientName,
      portions: items.reduce((s, it) => s + itemPortions(it), 0),
    });
  }

  const fridgeDishes = [];
  for (const [recipeRef, items] of indexFridgeDishes(pantryIngredients)) {
    if (!frozenPoolIds.has(recipeRef)) continue;
    const garnishRef = items.find((it) => it.garnishRef)?.garnishRef ?? null;
    const garnishMatch = garnishRef ? guarnicionesData.find((g) => g.id === garnishRef) : null;
    const garnishName = garnishMatch ? (garnishMatch.shortName ?? garnishMatch.name) : null;
    fridgeDishes.push({
      recipeId: recipeRef,
      name:
        recipeCatalogById[recipeRef]?.name ??
        filteredPool.find((r) => r.id === recipeRef)?.name ??
        items[0].ingredientName,
      portions: items.reduce((s, it) => s + itemPortions(it), 0),
      garnishName,
    });
  }

  // Con solver no hace falta el mensaje para el modelo: construirlo cuesta
  // (serializa el catálogo entero) y nadie lo lee.
  const usarSolver = solverActivo();
  const userMessage = usarSolver ? null : buildUserMessage(
    filteredPool,
    ctx.slots,
    ctx.config,
    ctx.schoolMenuByDay,
    data.fixedDishes,
    pantryIngredients
      .filter((p) => (p.itemType ?? "ingredient") !== "cooked_dish")
      .map((p) => p.ingredientName),
    pantryMode,
    frozenDishes,
    ctx.filterOpts.recipeMode ?? "preferred",
    fridgeDishes,
    ctx.filterOpts.cocinas,
    format,
    basesDeLaSemana,
  );

  // Quién asigna los platos. El solver (lib/solver.js) construye el menú ya
  // válido sin llamar al modelo; el modelo es el camino de siempre: llamada,
  // reintentos de corrección y fallback determinista. Los pasos de después
  // (platos fijados, slots forzados, cocinas, guarniciones, revalidación) son
  // los mismos para los dos: aquí solo cambia de dónde sale la asignación.
  let slotAssignments;
  // Huecos que el solver colocó saltándose una regla de orientación (ver
  // REGLAS_RELAJABLES): la revalidación del paso 6 no los toca, porque
  // "repararlos" con el fallback deshace justo lo que se decidió a propósito.
  let slotsRelajados = new Set();
  let familiasRelajadas = new Set();
  let slotsVacios = new Set();
  if (usarSolver) {
    const resuelto = asignarConSolver({
      group, ctx, filteredPool, achievableFreqs, basesDeLaSemana, data, stats, warnings,
    });
    slotAssignments = resuelto.asignaciones;
    slotsRelajados = resuelto.relajados;
    familiasRelajadas = resuelto.familiasRelajadas;
    slotsVacios = resuelto.vacios;
  } else {
    slotAssignments = await asignarConModelo({
      userMessage, format, plannerModel, signal, stats,
      filteredPool, ctx, achievableFreqs, basesDeLaSemana, data, group, warnings,
    });
  }

  // 3b. Last-resort safety net: hydration (generateMenuWithAI) resolves each
  // recipeId against the FULL unfiltered catalog, not filteredPool — so if a
  // violation survives retries + fallback (e.g. no compliant candidate existed
  // for a tightly-constrained slot), it would otherwise still render with
  // unfiltered data (allergen, alcohol, baby-only...). Drop those slots here
  // instead of letting them reach the user, and surface why. (`warnings` was
  // declared earlier so it can also collect freqWarnings above.)
  const poolIds = new Set(filteredPool.map((r) => r.id));
  slotAssignments = slotAssignments.filter((s) => {
    if (poolIds.has(s.recipeId)) return true;
    warnings.push(`${group.label}: no se encontró una receta que cumpliera todas las restricciones para ${s.slotId}; hueco omitido.`);
    return false;
  });

  // 3c. A slot that applyFallback could not fill never reaches the filter above
  // (it isn't in slotAssignments at all), so it used to vanish with no trace —
  // the user just saw a day with one course instead of the two configured.
  // Surface it as a warning so the gap is at least explained, not silent.
  const assignedSlotIds = new Set(slotAssignments.map((s) => s.slotId));
  for (const slot of ctx.slots) {
    if (!assignedSlotIds.has(slot.slotId)) {
      warnings.push(`${group.label}: no hay ninguna receta compatible para ${slot.slotId}; ese plato se queda sin asignar.`);
    }
  }

  const poolById = Object.fromEntries(filteredPool.map((r) => [r.id, r]));

  // 4. Force fixed dishes to appear exactly timesPerWeek times (hard rule).
  //    The LLM is asked to do this but isn't reliable, so we guarantee it here.
  const fixedDishesResult = enforceFixedDishes(slotAssignments, data.fixedDishes, poolById, filterOpts, ctx.slots);
  slotAssignments = fixedDishesResult.slotAssignments;
  if (fixedDishesResult.warnings.length > 0) warnings.push(...fixedDishesResult.warnings);

  // enforceFixedDishes resolves a pin straight from recipeCatalogById (see its
  // own comment) and already back-fills `poolById` when the pin sits outside
  // it (fixedDishes.js line ~272) — but that mutates the lookup OBJECT only.
  // `filteredPool`, the ARRAY, never gets the same treatment, and step 6's
  // validateMenu below takes the array, not the object — it rebuilds its own
  // poolById from `filteredPool` alone, so fixedDishes.js's fix doesn't reach
  // it. That's academic while filterRecipes() always returned the full
  // catalog, since every pin was already in filteredPool by construction —
  // but now that it prefers the Recetario Estrella tier and only falls back
  // to the full catalog when that tier runs thin (fondo de armario), a fixed
  // dish from the pre-2026 catalog can legitimately sit outside filteredPool
  // while still being pinned. Without this, it becomes invisible to every
  // rule in validateMenu (frequency caps, consecutive-protein checks...).
  // Sync the array to match what poolById already knows — this never widens
  // WHICH dishes the planner can pick, only what a pin already made resolves
  // to for the checks that run after it's placed.
  const filteredPoolIds = new Set(filteredPool.map((r) => r.id));
  for (const id of allFixedDishIds(data.fixedDishes)) {
    if (filteredPoolIds.has(id)) continue;
    const catalogRecipe = poolById[id] ?? recipeCatalogById[id];
    if (!catalogRecipe) continue;
    filteredPool = [...filteredPool, catalogRecipe];
    filteredPoolIds.add(id);
    poolById[id] = catalogRecipe;
  }

  // 4b. Force user-marked slot exceptions (plato único / cena rápida).
  slotAssignments = enforceSlotTypes(slotAssignments, ctx.slots, poolById);

  // 4c. Break protein clusters created AFTER the fallback. The fallback fills
  //     the free slots before fixed dishes are forced in (step 4), so a fixed
  //     e.g. "pollo" cena can land right next to a fallback-picked "pollo"
  //     comida_2 — a clash neither pass could foresee. Re-pick the NON-fixed,
  //     NON-forced side of each such pair with a pool alternative that carries a
  //     different protein. Never touches a fixed/forced slot and never empties a
  //     slot, so it can only improve (or no-op) the menu.
  //
  //     Con el SOLVER no se ejecuta. Su salida ya cumple la regla 3 por
  //     construcción, y esta pasada aplica una regla MÁS ESTRICTA que el
  //     validador (compara por GRUPO de proteína: pollo → cerdo le parece una
  //     repetición, cuando la regla 3 compara la proteína concreta) y re-elige
  //     platos sin mirar el resto de reglas. Medido sobre menús válidos del
  //     solver: era la única fuente de platos de montaje fuera de cena rápida,
  //     conflictos de perfil y comidas desproporcionadas en el menú final. Un
  //     plato fijado que cree un choque real lo ve la revalidación del paso 6.
  if (!usarSolver) {
    slotAssignments = breakProteinClusters(slotAssignments, {
      data,
      ctx,
      poolById,
      filteredPool,
      achievableFreqs,
    });
  }

  // 4d. Cuota de cocinas. La puerta de filterRecipes ya impidió que entrara lo
  //     que la casa NO pidió; esto comprueba que lo que SÍ pidió está puesto, y
  //     si falta lo coloca sobre huecos neutros (plato sin `cocina`, que es de
  //     lo que sobra). Va DESPUÉS de los platos fijados y de breakProteinClusters
  //     para no deshacer su trabajo, y nunca toca un hueco fijado o forzado.
  //
  //     Sin esta pasada, el mando de Cocina cumpliría "casi siempre" —el modelo
  //     se salta instrucciones— y un control que cumple cuatro de cada cinco
  //     veces no se lee como que a veces falla: se lee como que no hace nada.
  //
  //     Con el SOLVER tampoco: la cuota entra como objetivo del propio solver
  //     (ver `cocinas` en resolverMenu), y esta pasada coloca sin validar
  //     (medido: un plato de 60 minutos en un hueco de 30, montaje fuera de
  //     cena rápida). Lo que no quepa lo avisa asignarConSolver.
  if (!usarSolver && ctx.filterOpts.cocinas && Object.keys(ctx.filterOpts.cocinas).length > 0) {
    const forzados = new Set(ctx.slots.filter((sl) => sl.preferType).map((sl) => sl.slotId));
    const fijados = new Set(allFixedDishIds(data.fixedDishes));
    const cuota = ajustarCuota(slotAssignments, {
      pedido: ctx.filterOpts.cocinas,
      recetaDe: (id) => poolById[id] ?? recipeCatalogById[id] ?? null,
      candidatos: filteredPool,
      bloqueado: (slotId, recipeId) => forzados.has(slotId) || fijados.has(recipeId),
    });
    slotAssignments = cuota.asignaciones;
    for (const [cocina, cuantos] of Object.entries(cuota.sinSitio)) {
      warnings.push(
        `${group.label}: no cabían ${cuantos} plato(s) de cocina ${cocina} esta semana (el catálogo se queda corto o los huecos estaban ocupados).`,
      );
    }
  }

  // 5. Pair "principal" recipes with garnishes (deterministic, no LLM).
  //    User-pinned combos (dish chosen from the catalog) take priority.
  // Solo aplica lo que quien cocina fijó a mano: pairGarnishes ya no combina
  // por su cuenta (ver el fichero). `safeGarnishes` y `garnishRepeat` eran
  // argumentos de la combinatoria y ya no significan nada aquí.
  slotAssignments = pairGarnishes(
    slotAssignments,
    poolById,
    pinnedGarnishMap(data.fixedDishes),
    safeGarnishes,
  );

  // 5b. Aplica SOLO la salsa que la propia receta declara suya (sauceId) o la
  //     que el usuario fijó a mano (fixedDishes.sauceId) — pairSauces.js ya no
  //     elige ninguna por su cuenta (ver su cabecera). Ninguno de los dos casos
  //     "combina" el plato con algo ajeno: sauceId nombra la salsa que el
  //     plato ya lleva escrita dentro (para que DishDetail pueda mostrarla
  //     como su propio paso), y lo fijado a mano es una decisión explícita de
  //     quien cocina, igual que un garnishId fijado a mano en el paso 5.
  slotAssignments = pairSauces(
    slotAssignments,
    poolById,
    pinnedSalsaMap(data.fixedDishes),
  );

  // 6. Re-validate the FULLY-enforced menu. Steps 4/4b run AFTER the
  //    validate+fallback loop and can, in principle, reintroduce a rule
  //    violation (a fixed dish forced onto adjacent days, a forced cena rápida
  //    that clashes with the day, a freq cap pushed back over the top, etc.).
  //    A violation on a slot the user themselves pinned/forced is left alone —
  //    swapping it would undo the very choice those steps just guaranteed —
  //    but anything else gets a REAL repair attempt via applyFallback (not
  //    just a warning): a tester's real menu shipped 4 huevo dishes against a
  //    cap of 3, and separately 3 egg dinners on consecutive nights, because
  //    this stage used to only log a warning that (since a since-fixed bug)
  //    never even reached the UI — the violation shipped silently either way.
  //    Whatever applyFallback still can't fix (pool too constrained) is
  //    re-checked and THAT residual is what gets warned about below.
  {
    const postCheck = validateMenu(
      slotAssignments,
      filteredPool,
      ctx.slots,
      ctx.config.healthProfiles,
      achievableFreqs,
      basesDeLaSemana,
    );
    if (!postCheck.valid) {
      const fixedIds = allFixedDishIds(data.fixedDishes);
      const forcedSlotIds = new Set(
        ctx.slots.filter((s) => s.preferType).map((s) => s.slotId),
      );
      const assignBySlot = Object.fromEntries(slotAssignments.map((s) => [s.slotId, s.recipeId]));
      const unexpected = postCheck.violations.filter((v) => {
        if (v.rule === "recipeId_repetido" && fixedIds.has(assignBySlot[v.slotId])) return false;
        if (forcedSlotIds.has(v.slotId)) return false;
        if (slotsRelajados.has(v.slotId) && REGLAS_RELAJABLES.has(v.rule)) return false;
        if (v.rule === "freq_max_exceeded" && familiasRelajadas.has(v.targetKey)) return false;
        if (v.rule === "slot_faltante" && slotsVacios.has(v.slotId)) return false;
        // Un primero sin segundo porque el segundo se dejó vacío a propósito.
        if (v.rule === "comida_sin_segundo" && slotsVacios.has(`${v.slotId.split("_")[0]}_comida_2`)) return false;
        return true;
      });

      // Never let the repair touch a slot that itself currently holds a fixed
      // dish (regardless of WHICH rule flagged it) — that's the one case a
      // real fix would mean overriding the user's own pin, so it stays a
      // warning-only "intentional consequence" like the filtering above.
      const safeToFix = unexpected.filter((v) => !fixedIds.has(assignBySlot[v.slotId]));

      if (safeToFix.length > 0) {
        slotAssignments = applyFallback(
          slotAssignments,
          safeToFix,
          ordenarPorSesgo(filteredPool, data.sesgos, data.favoritos),
          ctx.slots,
          ctx.config.healthProfiles,
          achievableFreqs,
          basesDeLaSemana,
        );
      }

      // Re-check AFTER the repair attempt — only genuinely unresolved
      // violations (the fix failed to find any valid replacement, or the slot
      // was excluded above because it's fixed/forced) get warned about.
      const finalPostCheck = validateMenu(
        slotAssignments,
        filteredPool,
        ctx.slots,
        ctx.config.healthProfiles,
        achievableFreqs,
        basesDeLaSemana,
      );
      const finalAssignBySlot = Object.fromEntries(slotAssignments.map((s) => [s.slotId, s.recipeId]));
      const stillUnexpected = finalPostCheck.violations.filter((v) => {
        if (v.rule === "recipeId_repetido" && fixedIds.has(finalAssignBySlot[v.slotId])) return false;
        if (forcedSlotIds.has(v.slotId)) return false;
        if (slotsRelajados.has(v.slotId) && REGLAS_RELAJABLES.has(v.rule)) return false;
        if (v.rule === "freq_max_exceeded" && familiasRelajadas.has(v.targetKey)) return false;
        if (v.rule === "slot_faltante" && slotsVacios.has(v.slotId)) return false;
        if (v.rule === "comida_sin_segundo" && slotsVacios.has(`${v.slotId.split("_")[0]}_comida_2`)) return false;
        return true;
      });
      for (const v of stillUnexpected) {
        warnings.push(
          `${group.label}: tras fijar platos y slots forzados, "${v.slotId}" incumple una regla (${v.rule}). ${v.message}`,
        );
      }
    }
  }

  return {
    group,
    slotAssignments,
    filteredPool,
    slotsContext: ctx.slots,
    // Active intolerances/states for this group; hydration uses them to apply
    // invisible ingredient swaps (e.g. lactose-free) to the chosen recipes.
    restrictions: ctx.filterOpts.intolerances ?? [],
    warnings,
    // Solo con solver: huecos colocados relajando la orientación, y huecos
    // dejados vacíos a propósito. Vacíos con el modelo (no los distingue).
    relajados: [...slotsRelajados],
    vacios: [...slotsVacios],
  };
}

// ── Hydration (Phase 4) ─────────────────────────────────────────

export const ICON_TYPE_MAP = {
  pescado_blanco: "fish", pescado_azul: "fish", marisco: "fish",
  pollo: "meat", cerdo: "meat", ternera: "meat",
  huevo: "egg",
  legumbre: "legume",
  none: "chef",
};

export const CATEGORY_ICON = {
  pasta_arroces: "pasta",
  sopas_cremas: "soup",
  ensaladas_verduras: "greens",
  platos_unicos: "chef",
  cenas_rapidas: "chef",
};

export function catalogToFrontendRecipe(catalogRecipe, eaters, restrictions = []) {
  const r = applySeasonalFruit(catalogRecipe);
  const servings = Math.max(1, eaters);
  const factor = servings / r.baseServings;

  const iconType = ICON_TYPE_MAP[r.mainProtein] ?? CATEGORY_ICON[r.category] ?? "chef";

  // Dietary adaptations (e.g. lactose-free swaps): rename affected ingredient
  // lines in place so the shopping list and dish detail reflect the product the
  // family actually buys, and surface a compact `adaptations` note for the UI.
  const { renameByName, adaptations } = buildAdaptationMap(r, restrictions);

  // Scale ingredient amounts for the actual number of eaters.
  // Round g/ml to multiples of 5, ud to whole numbers.
  // "al gusto" / "pizca" / "c/n" have no fixed amount to scale — they stay
  // qty: null and are shown/summed as a no-quantity reminder line downstream
  // (see Menu.jsx#formatQty, shoppingBuilder.js#scaleIngredient).
  const ingredients = r.ingredients.map((ing) => {
    let scaledQty = null;
    if (!isQualitativeUnit(ing.unit)) {
      scaledQty = ing.amount * factor;
      if (ing.unit === "g" || ing.unit === "ml") {
        scaledQty = Math.round(scaledQty / 5) * 5;
        if (scaledQty < 5) scaledQty = 5;
      } else {
        scaledQty = Math.ceil(scaledQty);
      }
    }
    const name = renameByName.get(ing.name) ?? ing.name;
    return {
      id: name.toLowerCase().replace(/\s+/g, "-"),
      name,
      category: guessIngredientCategory(name),
      qty: scaledQty,
      unit: ing.unit,
    };
  });

  // Una receta puede nombrar el mismo ingrediente en dos sitios (el aceite de
  // pochar y el de aliñar, la sal del agua y la del sofrito). Para cocinar da
  // igual: lo que se quiere saber es cuanto aceite hace falta EN TOTAL, y dos
  // lineas iguales con cantidades distintas solo obligan a sumarlas de cabeza.
  const merged = mergeIngredientLines(ingredients);

  const mealTypes = r.mealRole.map((role) =>
    role === "cena" ? "cena" : "comida",
  );

  const difficultyMap = { facil: "Fácil", normal: "Normal", elaborada: "Me gusta" };

  return {
    id: r.id,
    name: r.name,
    emoji: "",
    iconType,
    kcal: r.kcal,
    time: r.time,
    difficulty: difficultyMap[r.difficulty] ?? "Normal",
    tags: [r.category, r.mainProtein].filter((t) => t && t !== "none"),
    mealTypes: [...new Set(mealTypes)],
    tupperFriendly: r.tupperFriendly,
    kidFriendly: r.kidFriendly,
    allergens: r.allergens,
    servings,
    macros: {
      protein: r.protein_g,
      carbs: r.carbs_g,
      fat: r.fat_g,
      // Secondary nutrients (optional — only present once enriched). Carried
      // through so DishDetail can show the collapsed "más nutrientes" block.
      ...(r.fiber_g != null ? { fiber: r.fiber_g } : {}),
      ...(r.sugar_g != null ? { sugar: r.sugar_g } : {}),
      ...(r.saturated_fat_g != null ? { saturatedFat: r.saturated_fat_g } : {}),
      ...(r.sodium_mg != null ? { sodium: r.sodium_mg } : {}),
    },
    // Heuristic flags (see lib/healthFlags.js) carried through so the menu/
    // dish detail can show a "menú más cuidado" badge (lib/healthProfileMatch.js).
    healthFlags: r.healthFlags ?? [],
    prepSummary: r.description || r.name,
    steps: r.steps ?? [],
    // Structured steps (optional): carried through so DishDetail can render the
    // stepper with time + kind. Falls back to `steps` when absent.
    stepsRich: r.stepsRich,
    // ── El eje de las bases ────────────────────────────────────────────────
    // Se perdía aquí, y es la SEXTA vez que un campo se cae en un puente sin
    // que salte nada (antes: apetecible, montaje, estrella, occasion,
    // extraProteins). `stepsRich` sí viajaba, así que los pasos llegaban
    // etiquetados con su base y nadie podía leerlos: `clavesDeReceta` pregunta
    // por `mainBase` y `basesAparte`, que llegaban undefined.
    //
    // El síntoma era que la vista Tanda salía siempre vacía —ningún plato del
    // menú declaraba base, así que nunca había dos compartiendo olla— y la
    // tarjeta de "ya la tengo hecha" no aparecía en ninguna ficha abierta
    // desde el menú. Todo el trabajo de etiquetar el catálogo moría aquí.
    mainBase: r.mainBase,
    baseMode: r.baseMode,
    basesAparte: r.basesAparte,
    // ── El congelador ──────────────────────────────────────────────────────
    // Y estos se perdían igual, con un síntoma más caro: `canFreezeRecipe` lee
    // `recipe.freezable === true`, así que para TODO plato que entrara por el
    // menú la respuesta era que no se congela. La opción no se ofrecía nunca, y
    // los pasos de descongelado de 291 recetas no se pintaban en ningún sitio.
    // Lo encontró el fusible de este puente el día que se escribió.
    freezable: r.freezable,
    thawSteps: r.thawSteps,
    image: r.photo ?? `/dishes/${r.id}.webp`,
    photo: r.photo ?? undefined,
    ingredients: merged,
    // Appliance variants (airfryer, horno, thermomix…) — used to show the
    // best-fit method for the user's kitchen tools in the menu + dish detail.
    methods: r.methods ?? [],
    // Provenance — who created it (undefined for the built-in MenuPlan catalog),
    // when, and how it's rated. Carried through so DishDetail can show the same
    // owner/vote info the catalog list shows.
    owner: r.owner,
    rating: r.rating,
    createdAt: r.createdAt,
    source: r.source,
    visibility: r.visibility,
    category: r.category,
    // Present only when at least one ingredient was swapped for a dietary
    // restriction (e.g. lactose-free). Undefined otherwise to keep recipes lean.
    adaptations: adaptations.length > 0 ? adaptations : undefined,
  };
}

// ── Deterministic optional meals (desayuno / merienda / postre) ──────────────
//
// These are NEVER AI-picked. They come from the isolated off-menu pool
// (fruit/yogur/pan…) and are assigned here with simple rotation so the week has
// variety without a model call. Babies are skipped (own curated path).
//
// `weekIndex` staggers the rotation's starting point per week (same idea as
// poolForWeek for comida/cena, just an offset instead of a bucket split —
// these pools are small enough, ~6-7 items, that a bucket split would leave
// almost nothing per week). Without it, this function has zero awareness of
// which week it's generating: called once per week with the exact same
// `DAYS.forEach((day, i) => pool[i % pool.length])`, it produces the
// IDENTICAL day-of-week -> dish mapping every single week, forever — a
// tester reported "Natillas" and "Arroz con leche" landing on the same two
// weekdays across every week of a multi-week plan. Defaults to 0 so a
// single-week generation (or any caller that doesn't pass crossWeek) is
// unaffected.
//
// Returns [{ planKey: "Lun-Desayuno", recipeId, eaters, mealKey, when? }].
function planExtraMealsForGroup(group, data, weekIndex = 0) {
  const out = [];
  if (isBabyMenuGroup(group, data.members)) return out;
  const em = data.extraMeals ?? {};
  const members = membersOfGroup(group, data.members);
  if (members.length === 0) return out;

  // Quien come de VERDAD en un hueco, no cuanta gente hay en el grupo.
  //
  // Era `members.length`, y contaba a todo el mundo todos los dias: si tu hija
  // desayuna fuera los martes, el martes salia desayuno para cuatro. Molesto y
  // poco mas... hasta que los invitados entraron por las reglas. Un invitado es
  // un miembro del grupo marcado `fuera` en todos los huecos menos el suyo, asi
  // que con `members.length` el que viene a cenar el miercoles contaba en los
  // SIETE desayunos, las siete meriendas y los siete postres de la semana.
  //
  // Se cuenta por hueco con el mismo criterio que comida y cena: en casa o con
  // tupper cuenta; fuera y cole, no.
  const comenEn = (dia, comida) => members.filter((m) => {
    const estado = data.schedule?.[slotKey(m.id, dia, comida)] ?? "casa";
    return estado === "casa" || estado === "tupper";
  });
  const kids = members.filter((m) => {
    const s = stageForAge(resolveMemberAge(m)).id;
    return s === "infantil" || s === "primaria";
  });
  const hasKids = kids.length > 0;

  const safety = {
    allergies: [...new Set(members.flatMap((m) => m.allergies ?? []))],
    intolerances: [
      ...new Set(members.flatMap((m) => [...(m.intolerances ?? []), ...(m.dietaryStates ?? [])])),
    ],
    dislikes: [...new Set([...(data.dislikes ?? []), ...(data.excluidos ?? []), ...members.flatMap((m) => m.dislikes ?? [])])],
  };

  const weekendIdx = (i) => i >= 5; // Sáb/Dom

  // Desayuno — off | variado | findes | igual
  if (em.desayuno && em.desayuno !== "off") {
    const pool = filterOffMenuRecipes("desayunos", { ...safety, hasKids });
    if (pool.length) {
      DAYS.forEach((day, i) => {
        // Same rule as comida/cena: if nobody eats breakfast at home that day,
        // don't invent a desayuno slot.
        if (!modeForGroupSlot(group, data.members, data.schedule, day, "Desayuno").cook) return;
        let r;
        if (em.desayuno === "igual") r = pool[0];
        else if (em.desayuno === "findes") {
          const wd = weekIndex % pool.length;
          const we = (weekIndex + 1) % pool.length;
          r = weekendIdx(i) ? pool[we] : pool[wd];
        } else r = pool[(i + weekIndex) % pool.length]; // variado
        out.push({ planKey: `${day}-Desayuno`, recipeId: r.id, eaters: comenEn(day, "Desayuno").length, mealKey: "desayuno" });
      });
    }
  }

  // Merienda — kids only. off | semana (7d) | laborables (L-V)
  if (hasKids && em.merienda && em.merienda !== "off") {
    const pool = filterOffMenuRecipes("meriendas", { ...safety, hasKids: true });
    if (pool.length) {
      const days = em.merienda === "laborables" ? DAYS.slice(0, 5) : DAYS;
      days.forEach((day, i) => {
        if (!modeForGroupSlot(group, data.members, data.schedule, day, "Merienda").cook) return;
        out.push({
          planKey: `${day}-Merienda`,
          recipeId: pool[(i + weekIndex) % pool.length].id,
          // Los niños que esa tarde estan en casa, no todos los del grupo.
          eaters: kids.filter((k) => comenEn(day, "Merienda").includes(k)).length,
          mealKey: "merienda",
        });
      });
    }
  }

  // Postre — off | comida | cena | ambas. Only place it when at least one of
  // the meals it's attached to is actually cooked that day (fuera/cole/off on
  // the parent meal → no dessert, same as no comida_rapida / cena_rapida).
  if (em.postre && em.postre !== "off") {
    const pool = filterPostrePool(
      filterOffMenuRecipes("postres", { ...safety, hasKids }),
      em,
    );
    if (pool.length) {
      DAYS.forEach((day, i) => {
        const when = em.postre;
        const cooksComida =
          (when === "comida" || when === "ambas") &&
          modeForGroupSlot(group, data.members, data.schedule, day, "Comida").cook;
        const cooksCena =
          (when === "cena" || when === "ambas") &&
          modeForGroupSlot(group, data.members, data.schedule, day, "Cena").cook;
        if (!cooksComida && !cooksCena) return;
        out.push({
          planKey: `${day}-Postre`,
          recipeId: pool[(i + weekIndex) % pool.length].id,
          eaters: comenEn(day, "Postre").length,
          mealKey: "postre",
          when,
        });
      });
    }
  }

  return out;
}

/**
 * Valida el menú de los Niños incluyendo los platos que van a copiar de los
 * Adultos, y repara solo los huecos propios del niño. Muta `kidsRes` en sitio
 * (`slotAssignments` y `warnings`), igual que hace el resto del pipeline con
 * sus resultados. Ver el comentario en generateMenuWithAI.
 *
 * Lo que se sintetiza, hueco a hueco, según `kidsSlotAction`:
 *   adultLunch  → Comida   los dos huecos de comida de los adultos, tal cual
 *   adultLunch  → Cena     el SEGUNDO de los adultos como cena del niño (es lo
 *                          que se come; el primero no lleva la proteína del día)
 *   adultDinner → Cena     la cena de los adultos, tal cual
 *
 * Limitación conocida: una violación que caiga SOBRE un hueco copiado (p. ej.
 * la cena propia del lunes choca con la comida copiada del martes — la regla 3
 * señala el segundo de los dos) no se repara, porque tocarla sería cambiar la
 * comida de los padres. Es el caso raro; el común —comida copiada → cena propia
 * el mismo día— cae siempre sobre el hueco propio y sí se arregla.
 */
// Exported for tests only — not used elsewhere outside this module.
export function validarNinosConCopias(data, adultsRes, kidsRes) {
  const adultBySlot = Object.fromEntries(adultsRes.slotAssignments.map((s) => [s.slotId, s]));
  const adultCtxBySlot = Object.fromEntries(adultsRes.slotsContext.map((s) => [s.slotId, s]));
  const adultPoolById = Object.fromEntries(adultsRes.filteredPool.map((r) => [r.id, r]));

  const copiadas = [];
  const copiadasCtx = [];
  const copiadasRecetas = new Map();
  const sintetiza = (dstSlotId, srcSlotId, mealType, position) => {
    const src = adultBySlot[srcSlotId];
    const receta = src && adultPoolById[src.recipeId];
    if (!receta) return;
    const ctx = adultCtxBySlot[srcSlotId] ?? {};
    copiadas.push({ slotId: dstSlotId, recipeId: src.recipeId });
    copiadasCtx.push({
      slotId: dstSlotId, mealType, position,
      day: ctx.day, daySlug: ctx.daySlug, eaters: ctx.eaters, mode: ctx.mode, maxTime: ctx.maxTime,
      // Marca para quien lea el contexto: este hueco es de los padres.
      copiado: true,
    });
    copiadasRecetas.set(receta.id, receta);
  };

  for (const day of DAYS) {
    const slug = DAY_SLUG[day];
    for (const meal of ["Comida", "Cena"]) {
      const action = kidsSlotAction(data, day, meal);
      if (action === "adultLunch" && meal === "Comida") {
        sintetiza(`${slug}_comida_1`, `${slug}_comida_1`, "comida", "primero");
        sintetiza(`${slug}_comida_2`, `${slug}_comida_2`, "comida", "segundo");
      } else if (action === "adultLunch" && meal === "Cena") {
        // Si los adultos comieron plato único, el "segundo" es el comida_1.
        const main = adultBySlot[`${slug}_comida_2`] ? `${slug}_comida_2` : `${slug}_comida_1`;
        sintetiza(`${slug}_cena`, main, "cena", undefined);
      } else if (action === "adultDinner") {
        sintetiza(`${slug}_cena`, `${slug}_cena`, "cena", undefined);
      }
    }
  }
  if (copiadas.length === 0) return;

  const propios = new Set(kidsRes.slotAssignments.map((s) => s.slotId));
  // Los copiados nunca pisan un propio: si por lo que sea coinciden, manda el
  // hueco que el niño generó para sí.
  const copiadasLimpias = copiadas.filter((s) => !propios.has(s.slotId));
  const copiadasCtxLimpias = copiadasCtx.filter((s) => !propios.has(s.slotId));

  const asignaciones = [...kidsRes.slotAssignments, ...copiadasLimpias];
  const contextos = [...kidsRes.slotsContext, ...copiadasCtxLimpias];
  // El pool del niño más las recetas copiadas, para que el validador las
  // resuelva (regla 1) y vea su proteína (reglas 3, 3c, 15). Las copiadas van
  // al FINAL: applyFallback coge "el primero que pasa" y prefiere no usadas,
  // así que solo las elegiría como último recurso — y en ese caso ya son
  // platos que el niño come ese mismo día.
  const kidsIds = new Set(kidsRes.filteredPool.map((r) => r.id));
  const pool = [
    ...kidsRes.filteredPool,
    ...[...copiadasRecetas.values()].filter((r) => !kidsIds.has(r.id)),
  ];

  const check = validateMenu(asignaciones, pool, contextos, [], {}, {});
  if (check.valid) return;
  const sobrePropios = check.violations.filter((v) => propios.has(v.slotId));
  if (sobrePropios.length === 0) return;

  const reparadas = applyFallback(asignaciones, sobrePropios, pool, contextos, [], null, null);
  // Solo vuelven al resultado los huecos propios; los copiados se descartan
  // aquí y la hidratación los volverá a materializar desde el menú de Adultos.
  kidsRes.slotAssignments = reparadas.filter((s) => propios.has(s.slotId));
  for (const v of reparadas.unfixedViolations ?? []) {
    kidsRes.warnings.push(
      `${kidsRes.group.label}: no se pudo evitar "${v.rule}" en ${v.slotId} respecto a lo que comen con los adultos.`,
    );
  }
}

export async function generateMenuWithAI(data, { signal, pantryIngredients = [], pantryMode = "prefer", crossWeek = null, plannerModel = DEFAULT_MODEL, groupCache = null, stats = null, plannerFormat = "json" } = {}) {
  if (!data?.groups?.length) {
    throw new AIPlannerError("No hay grupos definidos en el onboarding.");
  }

  const activeGroups = data.groups.filter(
    (g) => membersOfGroup(g, data.members).length > 0,
  );
  if (activeGroups.length === 0) {
    throw new AIPlannerError("Ningún grupo tiene miembros asignados.");
  }

  // Groups are independent, so one whose connection dropped (even after
  // callModel's own retries) gets one more go on its own instead of failing the
  // rest. `groupCache` (a Map keyed by group id, owned by the caller) keeps the
  // groups that did come back, so retrying the whole generation later redoes
  // only the missing ones. Hydration below only reads these results.
  const runGroup = async (group) => {
    const cached = groupCache?.get(group.id);
    if (cached) {
      if (stats) stats.groupsReused++;
      return cached;
    }
    const run = () =>
      generateGroupMenu(data, group, signal, pantryIngredients, crossWeek, plannerModel, pantryMode, { stats, format: plannerFormat });
    let result;
    try {
      result = await run();
    } catch (err) {
      if (!err?.network || signal?.aborted) throw err;
      await waitUntilVisible(signal);
      result = await run();
    }
    groupCache?.set(group.id, result);
    return result;
  };
  const results = await Promise.all(activeGroups.map(runGroup));

  // ── Los niños, validados CON lo que van a comer copiado ──────────────────
  //
  // Los huecos de Niños que copian del menú de Adultos (mediodía en familia,
  // "cena como los padres", "lo del mediodía" los días de cole, finde juntos)
  // se SALTAN en buildGroupContext y se materializan en la hidratación de más
  // abajo, ya fuera del validador. Así que el grupo Niños se validaba a solas
  // con sus huecos propios — sus cenas, normalmente — sin ver nunca sus
  // comidas. La regla 3 (proteína seguida comida→cena) no podía saltar: los
  // adultos comían pollo, se copiaba a los niños, y a los niños se les
  // generaba aparte un pollo de cena que nadie veía como repetición.
  //
  // Se arregla AQUÍ, sobre los resultados crudos y antes de hidratar, para no
  // tocar ni la hidratación ni el bloque de copia: se sintetizan los huecos
  // copiados con el plato de los adultos, se valida el conjunto, y se reparan
  // SOLO los huecos propios del niño — los copiados son la comida de la
  // familia y no se tocan. Sin serializar los grupos: siguen en paralelo.
  if (householdKidPolicy(data)) {
    const adultsRes = results.find((r) => r.group.label === "Adultos");
    const kidsRes = results.find((r) => r.group.label === "Niños");
    if (adultsRes && kidsRes) validarNinosConCopias(data, adultsRes, kidsRes);
  }

  const multi = results.length > 1;
  const plan = { _warnings: [] };
  for (const group of data.groups) {
    plan[group.id] = {};
  }

  const allRecipes = [];
  const seenRecipeIds = new Set();
  let placedSlots = 0;

  const guarnicionById = Object.fromEntries(guarnicionesData.map((g) => [g.id, g]));
  const salsaById = Object.fromEntries(salsasData.map((s) => [s.id, s]));
  // User-created recipes aren't in the static bundled catalog, so the final
  // hydration step (recipeId -> full frontend recipe) needs its own lookup.
  const userRecipeById = Object.fromEntries((data.userRecipes ?? []).map((r) => [r.id, r]));

  for (const { group, slotAssignments, slotsContext, restrictions, warnings } of results) {
    if (warnings?.length) plan._warnings.push(...warnings);
    const prefix = multi ? `${group.id}__` : "";
    const eatersBySlot = Object.fromEntries(
      slotsContext.map((s) => [s.slotId, s.eaters]),
    );
    const dayBySlot = Object.fromEntries(
      slotsContext.map((s) => [s.slotId, s.day]),
    );
    const modeBySlot = Object.fromEntries(
      slotsContext.map((s) => [s.slotId, s.mode]),
    );

    // Group assignments by day+meal
    const byDayMeal = {};
    for (const { slotId, recipeId, garnishId, sauceId } of slotAssignments) {
      const catalogRecipe = recipeCatalogById[recipeId] ?? userRecipeById[recipeId];
      if (!catalogRecipe) continue;

      const eaters = eatersBySlot[slotId] ?? 2;
      const frontendId = prefix + recipeId;

      if (!seenRecipeIds.has(frontendId)) {
        seenRecipeIds.add(frontendId);
        const fr = catalogToFrontendRecipe(catalogRecipe, eaters, restrictions);
        if (prefix) fr.id = frontendId;
        // Keep the catalog id so the UI can resolve the dish photo even when
        // fr.id carries a group prefix (e.g. "groupId__carnes_007").
        fr.baseRecipeId = recipeId;

        // Merge garnish into the recipe: name, time, macros, ingredients
        if (garnishId) {
          const garnish = guarnicionById[garnishId];
          if (garnish) applyGarnishToRecipe(fr, garnish, eaters, restrictions);
        }
        // Same for sauce — independent of garnish, applied after so the name
        // suffix reads "... con Guarnición y Salsa" when both are present.
        if (sauceId) {
          const sauce = salsaById[sauceId];
          if (sauce) applySauceToRecipe(fr, sauce, eaters, restrictions);
        }

        allRecipes.push(fr);
      }

      // Parse slotId: "lun_comida_1", "lun_comida_2", "lun_cena", y con cena de
      // dos platos tambien "lun_cena_1" y "lun_cena_2".
      const parts = slotId.split("_");
      const daySlug = parts[0];
      const mealType = parts[1]; // "comida" or "cena"
      const position = parts[2]; // "1", "2", o undefined en la cena de un plato

      const day = dayBySlot[slotId] ?? Object.entries(DAY_SLUG).find(([, v]) => v === daySlug)?.[0];
      if (!day) continue;

      const mealLabel = mealType === "cena" ? "Cena" : "Comida";
      const planKey = `${day}-${mealLabel}`;

      if (!byDayMeal[planKey]) {
        byDayMeal[planKey] = {
          recipeId: null,
          firstRecipeId: null,
          eaters: eaters,
          mode: modeBySlot[slotId] ?? "casa",
          warnings: [],
        };
      }

      // Una cena de un plato no trae posición y es el plato de la noche. Una de
      // DOS la trae, y entonces se reparte igual que una comida: el primero al
      // `firstRecipeId` y el segundo al `recipeId`, que es lo que la pantalla
      // ya sabe pintar como dos platos.
      if (mealType === "cena" && !position) {
        byDayMeal[planKey].recipeId = frontendId;
      } else if (position === "1") {
        // Check if it's a plato_unico
        const isPlayoUnico = catalogRecipe.mealRole.includes("plato_unico");
        if (isPlayoUnico) {
          byDayMeal[planKey].recipeId = frontendId;
          byDayMeal[planKey].firstRecipeId = null;
        } else {
          byDayMeal[planKey].firstRecipeId = frontendId;
        }
      } else if (position === "2") {
        byDayMeal[planKey].recipeId = frontendId;
      }
    }

    // Una comida entra en el plan si tiene ALGÚN plato, no solo si tiene el
    // segundo.
    //
    // Con `if (slot.recipeId)` una comida con primero y sin segundo se caía
    // ENTERA y en silencio: no es que se viera el primero sin el segundo, es
    // que ese mediodía desaparecía del menú. Y si además esa noche tampoco
    // había cena, el día entero se esfumaba de la lista — reportado tal cual,
    // "me deja libres jueves y viernes", con el resto de la semana normal.
    //
    // Que falte un plato es información: sale su aviso y se ve el hueco. Que
    // se borre el día es una mentira.
    for (const [key, slot] of Object.entries(byDayMeal)) {
      if (slot.recipeId || slot.firstRecipeId) {
        plan[group.id][key] = slot;
        placedSlots++;
      }
    }
  }

  // Menú de los niños: copiar los platos de los adultos en los huecos que la
  // config de niños marca como "del menú de la familia" — mediodía en familia
  // (adultLunch), "cena como los padres" (adultDinner), "lo del mediodía" los
  // días de comedor (adultLunch), y finde juntos (ambos). kidsSlotAction decide
  // qué hueco copia de qué; aquí solo materializamos la copia.
  const kidsPolicy = householdKidPolicy(data);
  if (kidsPolicy) {
    const adults = activeGroups.find((g) => g.label === "Adultos");
    const kids = activeGroups.find((g) => g.label === "Niños");
    if (adults && kids) {
      const kidsMembers = membersOfGroup(kids, data.members);
      // Clona un plato del menú de los adultos al espacio de nombres de los
      // niños (prefijo de grupo si hay varios menús), arrastrando su guarnición.
      const cloneForKids = (adultFrontendId, eaters) => {
        if (!adultFrontendId) return null;
        const baseId = adultFrontendId.includes("__")
          ? adultFrontendId.split("__").slice(1).join("__")
          : adultFrontendId;
        const catalogRecipe = recipeCatalogById[baseId] ?? userRecipeById[baseId];
        if (!catalogRecipe) return null;
        const kidsFrontendId = multi ? `${kids.id}__${baseId}` : baseId;
        if (!seenRecipeIds.has(kidsFrontendId)) {
          seenRecipeIds.add(kidsFrontendId);
          const fr = catalogToFrontendRecipe(catalogRecipe, eaters, []);
          if (multi) fr.id = kidsFrontendId;
          fr.baseRecipeId = baseId;
          const adultFr = allRecipes.find((r) => r.id === adultFrontendId);
          if (adultFr?.garnishId) {
            const garnish = guarnicionById[adultFr.garnishId];
            if (garnish) applyGarnishToRecipe(fr, garnish, eaters, []);
          }
          allRecipes.push(fr);
        }
        return kidsFrontendId;
      };

      for (const day of DAYS) {
        for (const meal of ["Comida", "Cena"]) {
          const action = kidsSlotAction(data, day, meal);
          if (action !== "adultLunch" && action !== "adultDinner") continue;
          const srcMeal = action === "adultLunch" ? "Comida" : "Cena";
          const src = plan[adults.id]?.[`${day}-${srcMeal}`];
          if (!src?.recipeId && !src?.firstRecipeId) continue;
          const mode = modeForGroupSlot(kids, data.members, data.schedule, day, meal);
          if (!mode.cook) continue;
          const eaters = kidsMembers.filter((m) => {
            const status = data.schedule[slotKey(m.id, day, meal)] ?? "casa";
            return status === "casa" || status === "tupper";
          }).length;
          if (eaters <= 0) continue;

          const mainId = cloneForKids(src.recipeId, eaters);
          const firstId = cloneForKids(src.firstRecipeId, eaters);
          if (!mainId && !firstId) continue;

          plan[kids.id][`${day}-${meal}`] = {
            recipeId: mainId ?? firstId,
            firstRecipeId: mainId ? firstId : null,
            eaters,
            mode: mode.mode,
            warnings: [],
            fromAdultLunch: action === "adultLunch",
            fromAdultDinner: action === "adultDinner",
          };
          placedSlots++;
        }
      }
    }
  }

  // Deterministic optional meals — injected AFTER the AI comida/cena plan so
  // they never touch the model. Same hydration/prefix rules as main dishes.
  // Rotation offset: planExtraMealsForGroup walks its pool with
  // pool[(dayIndex + offset) % pool.length], so with a fixed offset the
  // Lun..Dom mapping is 100% deterministic — e.g. postre always landed on
  // "Macedonia, Yogur, Fruta, Natillas..." in that exact order, week after
  // week, because a plain single-week "Generar menú" has no crossWeek and the
  // offset defaulted to a hardcoded 0 every single call. crossWeek.weekIndex
  // must stay authoritative when this IS one week of a genuine multi-week
  // batch (consecutive weeks need to keep rotating relative to each other,
  // and re-running the SAME weekIndex must reproduce the SAME result — see
  // "varies desayuno/merienda/postre across weeks" below); otherwise pick a
  // fresh random offset per call so hitting "Generar menú" again actually
  // varies the desayuno/merienda/postre picks instead of replaying the same
  // week-shaped sequence forever.
  const extraMealsWeekIndex = crossWeek?.weekIndex ?? Math.floor(Math.random() * 1000);
  for (const group of activeGroups) {
    for (const a of planExtraMealsForGroup(group, data, extraMealsWeekIndex)) {
      const catalogRecipe = recipeCatalogById[a.recipeId];
      if (!catalogRecipe) continue;
      const frontendId = (multi ? `${group.id}__` : "") + a.recipeId;
      if (!seenRecipeIds.has(frontendId)) {
        seenRecipeIds.add(frontendId);
        const fr = catalogToFrontendRecipe(catalogRecipe, a.eaters, []);
        if (multi) fr.id = frontendId;
        fr.baseRecipeId = a.recipeId;
        allRecipes.push(fr);
      }
      plan[group.id][a.planKey] = {
        recipeId: frontendId,
        firstRecipeId: null,
        eaters: a.eaters,
        mode: "casa",
        warnings: [],
        extraMeal: a.mealKey,
        ...(a.when ? { when: a.when } : {}),
      };
      placedSlots++;
    }
  }

  // Congelador: si hay raciones ya cocinadas de alguno de los platos elegidos,
  // se reparten entre los huecos que las puedan usar. Va aquí, al final y de
  // forma determinista, para que el modelo no tenga que hacer aritmética de
  // stock (ver assignFreezerToPlan). En "off" el usuario ha pedido ignorar lo
  // que hay en casa, así que tampoco se toca el congelador.
  if (pantryMode !== "off") {
    assignPreparedToPlan(plan, pantryIngredients, {
      days: DAYS,
      mealLabels: ["Comida", "Cena"],
    });
    applyPreparedGarnishes(plan, allRecipes, guarnicionById, results);
  }

  if (placedSlots === 0) {
    throw new AIPlannerError("La IA devolvió slots sin recetas asociadas.");
  }

  return { plan, recipes: allRecipes };
}

/**
 * Si un hueco se cubrió con un tupper que incluye guarnición (preparedGarnishRef),
 * sustituye la guarnición auto-emparejada por la del tupper.
 */
export function applyPreparedGarnishes(plan, allRecipes, guarnicionById, groupResults) {
  const restrictionsByGroup = Object.fromEntries(
    (groupResults ?? []).map(({ group, restrictions }) => [group.id, restrictions ?? []]),
  );
  for (const [groupId, slots] of Object.entries(plan)) {
    if (groupId.startsWith("_")) continue;
    for (const slot of Object.values(slots ?? {})) {
      const garnishId = slot.preparedGarnishRef;
      if (!garnishId || !slotUsesPrepared(slot, slot.recipeId)) continue;
      const garnish = guarnicionById[garnishId];
      if (!garnish) continue;
      const frIdx = allRecipes.findIndex((r) => r.id === slot.recipeId);
      if (frIdx < 0) continue;
      const fr = allRecipes[frIdx];
      if (fr.garnishId === garnishId) continue;
      const baseId = fr.baseRecipeId ?? catalogIdOfPlanRecipe(slot.recipeId);
      const catalogRecipe = recipeCatalogById[baseId];
      if (!catalogRecipe) continue;
      const eaters = slot.eaters ?? 2;
      const restrictions = restrictionsByGroup[groupId] ?? [];
      const base = catalogToFrontendRecipe(catalogRecipe, eaters, restrictions);
      base.id = fr.id;
      base.baseRecipeId = baseId;
      applyGarnishToRecipe(base, garnish, eaters, restrictions);
      allRecipes[frIdx] = base;
    }
  }
}

// ── Slot replacement (deterministic, from the rich catalog) ──────────────
//
// When the user swaps a dish, we pick an alternative from the SAME catalog the
// AI planner uses (recipeCatalog) and run it through catalogToFrontendRecipe,
// so the replaced dish is byte-for-byte identical in shape to the rest of the
// menu (photo, methods, macros, scaled ingredients, etc.). The clean catalog id
// is kept in baseRecipeId so the photo resolves; the slot id gets the same
// group prefix the generator uses for multi-group menus.

const stripGroupPrefix = (id) => (id ? String(id).split("__").pop() : null);

/**
 * Pick swap candidates for a slot: recipes matching its structural
 * constraints (role/time/category — encoded by the caller in `matches`) that
 * aren't already used elsewhere in the week. Falls back to allowing an
 * already-used recipe (excluding only the exact dish being replaced) when
 * that strict pool is empty, rather than refusing the swap outright.
 *
 * This is the ONE path in the app where a recipeId can end up duplicated in
 * the week: validateMenu's rule 6 (recipeId_repetido) only runs during the AI
 * generation pass, not on a single-slot swap. `reusedDuplicate` flags exactly
 * when that fallback had to fire, so the caller can tell the user instead of
 * silently duplicating a dish. Extracted as a pure function (no catalog/pool
 * globals) so this edge case is unit-testable without the full 244-recipe
 * bundled catalog.
 *
 * @param {Object[]} pool
 * @param {(recipe: Object) => boolean} matches - structural fit check (role/time/category)
 * @param {Set<string>} usedBaseIds - recipe ids already placed elsewhere this week
 * @param {string|null} currentBaseId - the recipe id currently in the slot being replaced
 * @returns {{ candidates: Object[], reusedDuplicate: boolean }}
 */
export function selectReplacementCandidates(pool, matches, usedBaseIds, currentBaseId) {
  const fresh = pool.filter((r) => matches(r) && !usedBaseIds.has(r.id));
  if (fresh.length > 0) return { candidates: fresh, reusedDuplicate: false };

  const reused = pool.filter((r) => matches(r) && r.id !== currentBaseId);
  return { candidates: reused, reusedDuplicate: reused.length > 0 };
}

/**
 * Escala los ingredientes de una guarnicion o una salsa al numero de comensales.
 *
 * Mismas reglas que el plato principal (catalogToFrontendRecipe): g y ml a
 * multiplos de 5 con minimo 5, unidades hacia arriba, y las CUALITATIVAS -"al
 * gusto", "pizca", "c/n"- se quedan sin numero. Esto ultimo faltaba aqui y por
 * eso la sal de una guarnicion salia como "al gusto · 10 g": dos cosas que se
 * contradicen en la misma linea.
 */
function scaleSideIngredients(side, eaters, renameByName, idPrefix) {
  const perServing = side.baseServings ?? 1;
  const factor = eaters / perServing;
  return (side.ingredients ?? []).map((ing) => {
    let qty = null;
    if (!isQualitativeUnit(ing.unit)) {
      qty = ing.amount * factor;
      if (ing.unit === "g" || ing.unit === "ml") {
        qty = Math.round(qty / 5) * 5;
        if (qty < 5) qty = 5;
      } else {
        qty = Math.ceil(qty);
      }
    }
    const name = renameByName.get(ing.name) ?? ing.name;
    return {
      id: `${idPrefix}-${name.toLowerCase().replace(/\s+/g, "-")}`,
      name,
      category: guessIngredientCategory(name),
      qty,
      unit: ing.unit,
    };
  });
}


/**
 * Merge a garnish into a frontend recipe in place: name, time, macros, scaled
 * ingredients, prepSummary and steps. Shared by the generator and the swap flow
 * so a paired dish looks identical regardless of how it entered the menu.
 */
// Re-exportado desde aqui porque es donde vivia y donde lo buscan sus
// llamantes; la implementacion esta en el modulo hoja para que
// data/recipes.js pueda usarla sin cerrar un ciclo de imports.
export { mergeIngredientLines };

export function applyGarnishToRecipe(fr, garnish, eaters, restrictions = []) {
  if (!fr || !garnish) return fr;

  // Preserve garnishId so the photo lookup can build the combo key
  // "<dish>+<garnish>" that the image is stored under.
  fr.garnishId = garnish.id;
  // shortName es un dato curado a mano que no todas las guarniciones tienen
  // (de hecho NINGUNA receta del catálogo lo trae todavía) — sin fallback,
  // el nombre del plato salía "... con undefined". Mismo fallback (y mismo
  // lowerFirst para no pegar el nombre-título de la guarnición con mayúscula
  // en mitad de la frase) que ya usa formatDishWithGarnish en lib/dishNaming.js.
  const suffix = ` con ${lowerFirst(garnish.shortName ?? garnish.name)}`;
  const norm = (s) => s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
  if (!norm(fr.name).endsWith(norm(suffix))) {
    fr.name = `${fr.name}${suffix}`;
  }

  // Time: dishes are cooked in parallel, show the longest
  fr.time = Math.max(fr.time, garnish.time);

  // Macros: garnish values are stored per baseServings
  const gPerServing = garnish.baseServings ?? 1;
  fr.kcal = fr.kcal + Math.round(garnish.kcal / gPerServing);
  fr.macros = {
    protein: (fr.macros.protein ?? 0) + Math.round(garnish.protein_g / gPerServing),
    carbs: (fr.macros.carbs ?? 0) + Math.round(garnish.carbs_g / gPerServing),
    fat: (fr.macros.fat ?? 0) + Math.round(garnish.fat_g / gPerServing),
    // Fibra y sodio se cargaban en el plato pero NO se sumaban aquí, así que un
    // plato con guarnición declaraba la fibra del plato solo. Con unas judías
    // verdes al lado eso no es un redondeo: es la mitad. Las 40 guarniciones y
    // las 28 salsas traen los dos datos, pero se suma con `?? 0` para que una
    // guarnición futura sin ellos reste precisión en vez de borrar el campo.
    ...(fr.macros.fiber != null
      ? { fiber: fr.macros.fiber + Math.round((garnish.fiber_g ?? 0) / gPerServing) } : {}),
    ...(fr.macros.sodium != null
      ? { sodium: fr.macros.sodium + Math.round((garnish.sodium_mg ?? 0) / gPerServing) } : {}),
  };

  // Ingredients: scale garnish to actual number of eaters. Compute the swap
  // the same way the main dish does (buildAdaptationMap against the group's
  // live restrictions) — filterGarnishes only decided the garnish was
  // *eligible*, not what to rename, so a garnish never needs to be dropped
  // just because it has a swappable ingredient (e.g. lactose-free milk).
  const { renameByName, adaptations: garnishAdaptations } = buildAdaptationMap(garnish, restrictions);
  const gIngredients = scaleSideIngredients(garnish, eaters, renameByName, "garnish");
  fr.ingredients = mergeIngredientLines([...fr.ingredients, ...gIngredients]);

  // Surface the garnish's own swaps in the same `adaptations` note the main
  // dish uses, so the UI shows "Adaptado: sin lactosa" regardless of which
  // part of the combined dish needed the swap.
  if (garnishAdaptations.length > 0) {
    fr.adaptations = [...(fr.adaptations ?? []), ...garnishAdaptations];
  }

  if (garnish.description) {
    fr.prepSummary = `${fr.prepSummary}. ${garnish.description}`;
  }
  // Los pasos ya no se fusionan aquí: DishDetail muestra plato y guarnición
  // por separado (selector Primer plato / Guarnición / Combinado) con stepsRich.
  return fr;
}

/**
 * Mismo patrón que applyGarnishToRecipe, para la salsa (independiente de la
 * guarnición — un plato puede llevar las dos a la vez). Ver pairSauces.js
 * para cómo se decide qué salsa y cuándo.
 */
export function applySauceToRecipe(fr, sauce, eaters, restrictions = []) {
  if (!fr || !sauce) return fr;

  // Preserve sauceId: DishDetail lo re-hidrata para el curso "Salsa" (pasos
  // propios, ver pairSauces.js / SALSA_BY_ID en Menu.jsx).
  fr.sauceId = sauce.id;
  const norm = (s) => s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
  const suffix = norm(fr.name).includes(" con ") ? ` y ${sauce.name}` : ` con ${sauce.name}`;
  if (!norm(fr.name).endsWith(norm(sauce.name))) {
    fr.name = `${fr.name}${suffix}`;
  }

  // Time: se hace en paralelo o justo antes de servir, se muestra la más larga.
  fr.time = Math.max(fr.time, sauce.time);

  // Macros: los valores de la salsa están guardados por baseServings.
  const sPerServing = sauce.baseServings ?? 1;
  fr.kcal = fr.kcal + Math.round(sauce.kcal / sPerServing);
  fr.macros = {
    protein: (fr.macros.protein ?? 0) + Math.round(sauce.protein_g / sPerServing),
    carbs: (fr.macros.carbs ?? 0) + Math.round(sauce.carbs_g / sPerServing),
    fat: (fr.macros.fat ?? 0) + Math.round(sauce.fat_g / sPerServing),
    // Mismo arreglo que en la guarnición: el sodio de una salsa no es un
    // detalle — es justo donde está.
    ...(fr.macros.fiber != null
      ? { fiber: fr.macros.fiber + Math.round((sauce.fiber_g ?? 0) / sPerServing) } : {}),
    ...(fr.macros.sodium != null
      ? { sodium: fr.macros.sodium + Math.round((sauce.sodium_mg ?? 0) / sPerServing) } : {}),
  };

  // Ingredientes: misma lógica de escalado + adaptaciones que la guarnición.
  const { renameByName, adaptations: sauceAdaptations } = buildAdaptationMap(sauce, restrictions);
  const sIngredients = scaleSideIngredients(sauce, eaters, renameByName, "sauce");
  fr.ingredients = mergeIngredientLines([...fr.ingredients, ...sIngredients]);

  if (sauceAdaptations.length > 0) {
    fr.adaptations = [...(fr.adaptations ?? []), ...sauceAdaptations];
  }

  if (sauce.description) {
    fr.prepSummary = `${fr.prepSummary}. ${sauce.description}`;
  }
  // Los pasos no se fusionan aquí, igual que la guarnición: DishDetail los
  // muestra en su propio curso "Salsa".
  return fr;
}

/**
 * Every catalog recipe id a fixed dish could resolve to — recipeId, id,
 * catalogId (fixedDishes entries use different fields depending on how they
 * were created — picked from the catalog vs. typed by name) plus whatever
 * catalogMatchesForFixedDish's name-based lookup finds. Shared by
 * breakProteinClusters (step 4c) and the post-check repair (step 6) so both
 * recognize the SAME slots as "holds a fixed dish, don't touch it" — before
 * this was extracted, step 6 only checked recipeId/id and silently missed
 * catalogId-only entries, which let its repair swap away a dish the user had
 * actually pinned.
 */
function allFixedDishIds(fixedDishes) {
  const ids = new Set();
  for (const fd of fixedDishes ?? []) {
    if (!fd) continue;
    if (fd.recipeId) ids.add(fd.recipeId);
    if (fd.id) ids.add(fd.id);
    if (fd.catalogId) ids.add(fd.catalogId);
    for (const r of catalogMatchesForFixedDish(fd)) ids.add(r.id);
  }
  return ids;
}

/**
 * Break same-protein adjacency created AFTER the deterministic fallback ran.
 * Fixed dishes (step 4) and forced slots (step 4b) are applied after the
 * fallback has already filled the free slots, so a forced e.g. "pollo" cena can
 * land right next to a fallback-picked "pollo" comida_2 — a clash neither pass
 * could foresee. This walks the chronological main-meal chain (each day's
 * segundo — or the primero when it's a plato único — then that day's cena) and,
 * wherever two consecutive mains share a protein GROUP, re-picks the NON-fixed,
 * NON-forced side with a pool alternative of a different protein, respecting the
 * slot's role/time/tupper constraints, the day's carb, the comida sibling /
 * same-day primero protein, and the weekly frequency caps. It never touches a
 * fixed or user-forced slot and never leaves a slot empty (a swap only happens
 * when a compatible alternative exists), so it can only improve — or no-op — the
 * menu.
 */
function breakProteinClusters(slotAssignments, { data, ctx, poolById, filteredPool, achievableFreqs }) {
  const result = slotAssignments.map((s) => ({ ...s }));
  const bySlot = new Map(result.map((s) => [s.slotId, s]));
  const contextBySlot = Object.fromEntries(ctx.slots.map((s) => [s.slotId, s]));
  // Fixed-dish recipe ids grouped by the meal they were pinned for ("comida" /
  // "cena"). A slot is only locked when it holds a fixed recipe IN ITS TARGET
  // MEAL (its sanctioned placement) — a fixed recipe the fallback happened to
  // also drop into another meal is a fixable extra, not a pinned one.
  const fixedByMeal = { comida: new Set(), cena: new Set() };
  for (const fd of data.fixedDishes ?? []) {
    if (!fd) continue;
    const ids = allFixedDishIds([fd]);
    const meals = (fd.meals ?? ["Comida", "Cena"]).map((m) => String(m).toLowerCase());
    for (const meal of meals) {
      const bucket = meal.startsWith("cena") ? "cena" : "comida";
      for (const id of ids) fixedByMeal[bucket].add(id);
    }
  }
  const forcedSlotIds = new Set(ctx.slots.filter((s) => s.preferType).map((s) => s.slotId));
  const isLocked = (slot) => {
    if (forcedSlotIds.has(slot.slotId)) return true;
    const mealType = slot.slotId.split("_")[1] === "cena" ? "cena" : "comida";
    return fixedByMeal[mealType].has(slot.recipeId);
  };
  const groupOf = (slotId) => proteinGroupOf(poolById[bySlot.get(slotId)?.recipeId]);
  const groupsOf = (slotId) => proteinGroupsOf(poolById[bySlot.get(slotId)?.recipeId]);

  // Chronological main-meal chain used for adjacency, mirroring rule 3.
  const chainSlotIds = [];
  for (const day of DAYS) {
    const slug = DAY_SLUG[day];
    if (!slug) continue;
    const comidaMain = bySlot.has(`${slug}_comida_2`) ? `${slug}_comida_2` : `${slug}_comida_1`;
    if (bySlot.has(comidaMain)) chainSlotIds.push(comidaMain);
    if (bySlot.has(`${slug}_cena`)) chainSlotIds.push(`${slug}_cena`);
  }

  const usedIds = new Set(result.map((s) => s.recipeId));

  // `clashGroup` is the protein group we MUST get away from (the reason for the
  // swap) — never relaxed. `neighborGroups` are the other adjacency/sibling
  // groups we'd prefer to avoid too, relaxed only if nothing else fits.
  const replaceSlot = (slotId, clashGroup, neighborGroups) => {
    const slot = bySlot.get(slotId);
    if (!slot || isLocked(slot)) return false;
    const sctx = contextBySlot[slotId] ?? {};
    const parts = slotId.split("_");
    const slug = parts[0];

    // Same-comida sibling / same-day primero protein groups (rules 3b/3c) —
    // soft, like the chain neighbours.
    const soft = new Set(neighborGroups);
    soft.delete(clashGroup);
    if (parts[1] === "comida") {
      const sg = groupOf(`${slug}_comida_${parts[2] === "1" ? "2" : "1"}`);
      if (sg && sg !== clashGroup) soft.add(sg);
    } else if (parts[1] === "cena") {
      const pg = groupOf(`${slug}_comida_1`);
      if (pg && pg !== clashGroup) soft.add(pg);
    }

    // Carbs already used this day (excluding the slot being replaced).
    const dayCarbs = new Set();
    for (const s of result) {
      if (s.slotId === slotId || !s.slotId.startsWith(`${slug}_`)) continue;
      const c = getCarbType(poolById[s.recipeId]);
      if (c) dayCarbs.add(c);
    }

    // Protein-group usage for the frequency caps, excluding this slot.
    const groupCounts = {};
    for (const s of result) {
      if (s.slotId === slotId) continue;
      const g = proteinGroupOf(poolById[s.recipeId]);
      if (g) groupCounts[g] = (groupCounts[g] ?? 0) + 1;
    }

    // The clash group is never acceptable; everything else is a preference.
    // `allowReuse` drops the no-repeat rule for the last-resort tier.
    const baseOk = (r, allowReuse = false) => {
      if (r.id === slot.recipeId) return false;
      if (!allowReuse && usedIds.has(r.id)) return false;
      if (sctx.maxTime && r.time > sctx.maxTime) return false;
      if (sctx.mode === "tupper" && !r.tupperFriendly) return false;
      if (!slotAcceptsRole(r, {
        mealType: sctx.mealType,
        position: sctx.position,
        preferType: sctx.preferType,
      })) return false;
      // Full group set (mainProtein + extraProteins): swapping a clashing dish
      // for a cocido/fabada whose *secondary* protein is the very group we're
      // fleeing would just move the collision out of sight of mainProtein.
      return !proteinGroupsOf(r).has(clashGroup);
    };
    const neighborOk = (r) => {
      const gs = proteinGroupsOf(r);
      for (const g of gs) if (soft.has(g)) return false;
      return true;
    };
    const carbOk = (r) => { const c = getCarbType(r); return !(c && dayCarbs.has(c)); };
    const freqOk = (r) => {
      const g = proteinGroupOf(r);
      if (!g) return true;
      const cap = achievableFreqs?.[g];
      return cap == null || (groupCounts[g] ?? 0) < cap;
    };

    // Prefer the strictest fit, then relax the soft preferences (never the
    // clash group) rather than leave the collision in place. Last resort: reuse
    // a dish already on the menu — a repeat is softer and more explainable than
    // two of the same protein back to back.
    const candidate =
      filteredPool.find((r) => baseOk(r) && neighborOk(r) && carbOk(r) && freqOk(r)) ??
      filteredPool.find((r) => baseOk(r) && neighborOk(r) && freqOk(r)) ??
      filteredPool.find((r) => baseOk(r) && neighborOk(r) && carbOk(r)) ??
      filteredPool.find((r) => baseOk(r) && neighborOk(r)) ??
      filteredPool.find((r) => baseOk(r) && freqOk(r)) ??
      filteredPool.find((r) => baseOk(r)) ??
      filteredPool.find((r) => baseOk(r, true) && neighborOk(r)) ??
      filteredPool.find((r) => baseOk(r, true));
    if (!candidate) return false;

    usedIds.delete(slot.recipeId);
    slot.recipeId = candidate.id;
    usedIds.add(candidate.id);
    return true;
  };

  let guard = 0;
  let changed = true;
  while (changed && guard++ < 12) {
    changed = false;
    for (let i = 1; i < chainSlotIds.length; i++) {
      const prevId = chainSlotIds[i - 1];
      const curId = chainSlotIds[i];
      const gPrev = groupOf(prevId);
      const gCur = groupOf(curId);
      if (!gPrev || !gCur || gPrev !== gCur) continue;

      const nextGroup = groupOf(chainSlotIds[i + 1]);
      const beforePrevGroup = groupOf(chainSlotIds[i - 2]);

      // Prefer re-picking the later slot; fall back to the earlier one. The
      // shared protein is the clash group (must change); the outer neighbours
      // are soft preferences.
      if (
        replaceSlot(curId, gCur, new Set([nextGroup].filter(Boolean))) ||
        replaceSlot(prevId, gPrev, new Set([beforePrevGroup].filter(Boolean)))
      ) {
        changed = true;
      }
    }

    // Same-day primero ↔ cena (rule 3c). The chain above deliberately leaves a
    // comida_1 primero OUT of the sequence — a light starter shouldn't block the
    // next dinner — so a primero that genuinely carries a protein can share its
    // group with that same day's cena unseen. Rule 3c exists to catch exactly
    // that, but nothing re-applied it after enforceFixedDishes/enforceSlotTypes,
    // so a fixed or forced dish could reintroduce the clash and it would only
    // ever surface as a warning (e.g. huevos rellenos de primero + huevos fritos
    // de cena the same day). Re-picks the PRIMERO first: it sits outside the
    // adjacency chain, so changing it can't create a new consecutive-protein
    // clash the way changing the cena could.
    for (const day of DAYS) {
      const slug = DAY_SLUG[day];
      if (!slug) continue;
      const primeroId = `${slug}_comida_1`;
      const cenaId = `${slug}_cena`;
      // Only when the primero is a real starter alongside a segundo — when it's
      // the day's only comida dish it already sits in the chain above.
      if (!bySlot.has(`${slug}_comida_2`) || !bySlot.has(primeroId) || !bySlot.has(cenaId)) continue;
      const primeroGroups = groupsOf(primeroId);
      if (primeroGroups.size === 0) continue;
      const shared = [...groupsOf(cenaId)].find((g) => primeroGroups.has(g));
      if (!shared) continue;

      const cenaNeighbors = new Set();
      const cenaIdx = chainSlotIds.indexOf(cenaId);
      if (cenaIdx !== -1) {
        for (const nid of [chainSlotIds[cenaIdx - 1], chainSlotIds[cenaIdx + 1]]) {
          if (!nid) continue;
          for (const g of groupsOf(nid)) cenaNeighbors.add(g);
        }
      }

      if (
        replaceSlot(primeroId, shared, new Set()) ||
        replaceSlot(cenaId, shared, cenaNeighbors)
      ) {
        changed = true;
      }
    }
  }

  return result;
}

/**
 * Pick a replacement recipe for a slot from the rich catalog.
 *
 * @returns {{ frontendRecipe: object, recipeId: string, course: string, reusedDuplicate: boolean } | null}
 *   `reusedDuplicate` is true when no unused candidate existed for this slot's
 *   role/time constraints and the pick had to reuse a recipe already placed
 *   elsewhere in the week — callers should tell the user rather than silently
 *   duplicating a dish (see App.jsx#handleReplaceSlot).
 */
export function pickCatalogReplacement(data, menuPlan, { groupId, day, meal, course = "main", forcedRecipe = null, sameCategory = false }) {
  const group = (data?.groups ?? []).find((g) => g.id === groupId);
  if (!group) return null;

  const slotKeyStr = `${day}-${meal}`;
  const currentSlot = menuPlan?.[groupId]?.[slotKeyStr];
  if (!currentSlot) return null;

  // Context/pool the AI planner would use for this group — needed for garnish
  // pairing + intolerance-safe scaling in BOTH the auto-pick and the manual
  // "elegir del catálogo" (forcedRecipe) paths, so compute it up front.
  const ctx = buildGroupContext(data, group);

  let picked;
  let reusedDuplicate = false;
  if (forcedRecipe) {
    // Explicit user choice from the catalog: skip candidate scoring/diversity
    // and place it directly (still scaled + garnish-paired below).
    picked = forcedRecipe;
  } else {
  const currentRecipeId =
    course === "first" ? currentSlot.firstRecipeId : currentSlot.recipeId;
  const currentBaseId = stripGroupPrefix(currentRecipeId);
  const currentCatalog = currentBaseId ? recipeCatalogById[currentBaseId] : null;

  // Target meal roles: ALWAYS inferred from the slot's own structural shape
  // (a comida with a first course → segundo; plato único; cena) — never from
  // the dish currently sitting there. This used to mirror the current dish's
  // own mealRole first, which sounds harmless but silently PROPAGATES a
  // misplaced dish: if a "primero"-only recipe ever ended up in a segundo
  // slot, every subsequent "Regenerar" of that same slot mirrored that same
  // wrong role and kept placing more primero-only dishes there — reported as
  // two ensaladas shown as 1º and 2º of the same comida. Slot shape is the
  // one thing that's always correct, since it comes from where the recipe is
  // stored (firstRecipeId vs recipeId), not from what was placed there.
  let targetRoles;
  if (course === "first") {
    targetRoles = new Set(["primero"]);
  } else if (String(meal).toLowerCase() === "cena") {
    targetRoles = new Set(["cena", "plato_unico"]);
  } else {
    targetRoles = new Set(currentSlot.firstRecipeId ? ["segundo"] : ["plato_unico"]);
  }

  // Same constrained pool the AI planner would see for this group.
  const { recipes: pool } = filterRecipes(ctx.filterOpts);

  const isWeekend = day === "Sáb" || day === "Dom";
  const slotMaxTime = maxCookTime(data, { isWeekend, meal });

  // Exclude dishes already used anywhere in this group's menu (+ the current one).
  const usedBaseIds = new Set();
  for (const slot of Object.values(menuPlan[groupId] ?? {})) {
    const a = stripGroupPrefix(slot?.recipeId);
    const b = stripGroupPrefix(slot?.firstRecipeId);
    if (a) usedBaseIds.add(a);
    if (b) usedBaseIds.add(b);
  }

  // A montaje dish (nachos, sándwiches...) is only appropriate for the exact
  // slot the user flagged as "cena rápida" — otherwise it can replace a normal
  // dinner with something that doesn't match what the user actually asked for.
  const isCenaRapida = data.slotType?.[`${day}|${meal}`] === "rapida";

  // "Parecido" (misma categoría): restrict candidates to the category of the
  // dish being replaced, e.g. another salad for a salad. Null = any category.
  const restrictCategory = sameCategory ? currentCatalog?.category ?? null : null;

  const roleMatch = (r) => r.mealRole?.some((role) => targetRoles.has(role));
  const structuralFit = (r) =>
    roleMatch(r) &&
    r.time <= slotMaxTime &&
    (isCenaRapida || !isMontaje(r)) &&
    (!restrictCategory || r.category === restrictCategory);
  const { candidates: selected, reusedDuplicate: rdup } = selectReplacementCandidates(
    pool,
    structuralFit,
    usedBaseIds,
    currentBaseId,
  );
  reusedDuplicate = rdup;
  let candidates = selected;
  if (candidates.length === 0) return null;

  // School-menu avoidance: this swap path (manual "cambiar plato") is a
  // separate code path from the main generator and never runs through
  // validateMenu.js's school_protein_conflict / school_carb_conflict rules —
  // so without this, replacing a cena dish could silently reintroduce the
  // exact protein or carb base the school already served that day, undoing
  // the one guarantee buildGroupContext made for that slot. Soft guardrail
  // like the others here: relaxed (not applied) if it would empty the pool.
  if (String(meal).toLowerCase() === "cena") {
    const schoolSlotCtx = ctx.slots.find((s) => s.slotId === `${DAY_SLUG[day]}_cena`);
    const schoolProteinsToAvoid = new Set(schoolSlotCtx?.schoolProteinsToAvoid ?? []);
    const schoolCarbsToAvoid = new Set(schoolSlotCtx?.schoolCarbsToAvoid ?? []);
    const avoidSchoolVeg = (schoolSlotCtx?.schoolVegToAvoid ?? []).length > 0;
    if (schoolProteinsToAvoid.size > 0 || schoolCarbsToAvoid.size > 0 || avoidSchoolVeg) {
      const schoolSafe = candidates.filter((r) => {
        const proteinGroup = proteinGroupOf(r);
        if (proteinGroup && schoolProteinsToAvoid.has(proteinGroup)) return false;
        const carb = getCarbType(r);
        if (carb && schoolCarbsToAvoid.has(carb)) return false;
        if (avoidSchoolVeg && dominantComponentOf(r) === "verdura") return false;
        return true;
      });
      if (schoolSafe.length > 0) candidates = schoolSafe;
    }
  }

  // Diversity guardrails: this swap path picks from a much smaller pool than
  // the full generator and previously ignored validateMenu.js's rules
  // entirely, which let a single-dish replacement reintroduce a repeated
  // protein/legume next to itself (e.g. garbanzos two days running, or a
  // primero with protein when the segundo already carries one).
  const siblingRecipeId = course === "first" ? currentSlot.recipeId : currentSlot.firstRecipeId;
  const siblingHasProtein =
    proteinGroupsOf(recipeCatalogById[stripGroupPrefix(siblingRecipeId)]).size > 0;

  const collectGroups = (into, dayName, skipMeal = null) => {
    for (const m of getMeals(data)) {
      if (skipMeal && m === skipMeal) continue;
      const s = menuPlan[groupId]?.[`${dayName}-${m}`];
      if (!s) continue;
      for (const rid of [s.firstRecipeId, s.recipeId]) {
        for (const g of proteinGroupsOf(recipeCatalogById[stripGroupPrefix(rid)])) into.add(g);
      }
    }
  };

  // Same day, other meal (comida <-> cena) — the slot being replaced is excluded.
  const sameDayGroups = new Set();
  collectGroups(sameDayGroups, day, meal);
  // Chronologically adjacent days.
  const neighborDayGroups = new Set();
  const dayIdx = DAYS.indexOf(day);
  for (const d of [DAYS[dayIdx - 1], DAYS[dayIdx + 1]].filter(Boolean)) {
    collectGroups(neighborDayGroups, d);
  }

  const sameDayOk = (r) => {
    const gs = proteinGroupsOf(r);
    if (gs.size === 0) return true;
    if (siblingHasProtein) return false; // same comida already has a protein course
    for (const g of gs) if (sameDayGroups.has(g)) return false;
    return true;
  };
  const neighborDayOk = (r) => {
    for (const g of proteinGroupsOf(r)) if (neighborDayGroups.has(g)) return false;
    return true;
  };

  // Two tiers instead of one all-or-nothing filter. Before, when no candidate
  // satisfied BOTH constraints the whole guardrail was dropped at once — which
  // let a swap reintroduce the same protein group twice in a single day just
  // because the neighbouring days happened to be crowded. The same-day clash
  // (rule 3c) is the one the user actually sees on the plate, so it is now only
  // given up when literally nothing else fits; the neighbour-day preference is
  // relaxed first.
  const strict = candidates.filter((r) => sameDayOk(r) && neighborDayOk(r));
  const relaxed = strict.length > 0 ? strict : candidates.filter(sameDayOk);
  if (relaxed.length > 0) candidates = relaxed;

  // Subtype variety across the WHOLE week (not just adjacent days), for the
  // two groups coarse enough to hide a repeat from every check above:
  // legumbres (garbanzo/lenteja/alubia all count as one "legumbres" group,
  // so the neighbour-day guardrail can't stop garbanzos on Thursday AND
  // Sunday) and marisco (mejillones/navajas/gambas all collapse into
  // "pescado"). Reported directly: a swap put garbanzos back on a day that
  // didn't neighbour the other garbanzos of the week, and two shellfish
  // cenas landed in the same week undetected. This is a PREFERENCE, not a
  // hard filter — config.freqs already allows e.g. 3 legume dishes/week on
  // purpose, so it only steers toward the subtype not used yet and falls
  // back to the full pool when that would empty it (e.g. a filtered catalog
  // with just one legume left).
  const usedLegumeSubtypes = new Set();
  const usedMariscoSubtypes = new Set();
  for (const slot of Object.values(menuPlan[groupId] ?? {})) {
    for (const rid of [slot?.firstRecipeId, slot?.recipeId]) {
      const r = recipeCatalogById[stripGroupPrefix(rid)];
      const legume = legumeSubtypeOf(r);
      if (legume) usedLegumeSubtypes.add(legume);
      const marisco = mariscoSubtypeOf(r);
      if (marisco) usedMariscoSubtypes.add(marisco);
    }
  }
  const freshSubtype = (r) => {
    const legume = legumeSubtypeOf(r);
    if (legume && usedLegumeSubtypes.has(legume)) return false;
    const marisco = mariscoSubtypeOf(r);
    if (marisco && usedMariscoSubtypes.has(marisco)) return false;
    return true;
  };
  const withFreshSubtype = candidates.filter(freshSubtype);
  if (withFreshSubtype.length > 0) candidates = withFreshSubtype;

  // Los sesgos de la casa (lib/sesgos.js), con el mismo patrón que los
  // subtipos y el cole justo encima: el sorteo se queda en el escalón
  // preferido —"más horno" sortea entre los de horno— y cae al pool entero
  // si no hay escalón. Sigue siendo azar, para no perder la variedad que es
  // la razón de sortear; solo cambia ENTRE QUÉ se sortea.
  candidates = preferirPorSesgo(candidates, data.sesgos, data.favoritos);
  picked = candidates[Math.floor(Math.random() * candidates.length)];
  }

  // Match the generator's prefixing: only prefix when several groups are active.
  const activeGroups = (data.groups ?? []).filter(
    (g) => membersOfGroup(g, data.members).length > 0,
  );
  const prefix = activeGroups.length > 1 ? `${groupId}__` : "";

  const eaters = currentSlot.eaters ?? 2;
  const fr = catalogToFrontendRecipe(picked, eaters, ctx.filterOpts.intolerances ?? []);
  fr.id = prefix + picked.id;
  fr.baseRecipeId = picked.id;

  // Pair a garnish exactly like the generator does. Many "principal" dishes only
  // have dish+garnish combo photos, so without this the photo would show a side
  // (e.g. rice) that isn't in the recipe.
  const daySlug = DAY_SLUG[day];
  const targetMealType = String(meal).toLowerCase() === "cena" ? "cena" : "comida";
  const targetSlotId =
    targetMealType === "cena"
      ? `${daySlug}_cena`
      : course === "first"
        ? `${daySlug}_comida_1`
        : `${daySlug}_comida_2`;

  // Reconstruct this day's assignments (catalog ids) so carb dedup is correct.
  const dayAssignments = [];
  for (const m of getMeals(data)) {
    const s = menuPlan[groupId]?.[`${day}-${m}`];
    if (!s?.recipeId) continue;
    const mt = String(m).toLowerCase() === "cena" ? "cena" : "comida";
    if (mt === "comida") {
      if (s.firstRecipeId) {
        dayAssignments.push({ slotId: `${daySlug}_comida_1`, recipeId: stripGroupPrefix(s.firstRecipeId) });
      }
      dayAssignments.push({ slotId: `${daySlug}_comida_2`, recipeId: stripGroupPrefix(s.recipeId) });
    } else {
      dayAssignments.push({ slotId: `${daySlug}_cena`, recipeId: stripGroupPrefix(s.recipeId) });
    }
  }
  let swapped = false;
  for (const a of dayAssignments) {
    if (a.slotId === targetSlotId) {
      a.recipeId = picked.id;
      swapped = true;
    }
  }
  if (!swapped) dayAssignments.push({ slotId: targetSlotId, recipeId: picked.id });

  const safeGarnishes = filterGarnishes(ctx.filterOpts);
  const paired = pairGarnishes(dayAssignments, recipeCatalogById, {}, safeGarnishes);
  const targetGarnishId = paired.find((a) => a.slotId === targetSlotId)?.garnishId;
  if (targetGarnishId) {
    const garnish = guarnicionesData.find((g) => g.id === targetGarnishId);
    if (garnish) applyGarnishToRecipe(fr, garnish, eaters, ctx.filterOpts.intolerances ?? []);
  }

  return { frontendRecipe: fr, recipeId: fr.id, course, reusedDuplicate };
}

/**
 * Regenerate ONLY the garnish of a dish, keeping the same main recipe. Used by
 * the menu's "Regenerar → Cambiar guarnición" action. Returns a frontend recipe
 * whose id is unchanged (it encodes only the main dish) but with a fresh garnish
 * merged in, or null when the dish can't be regarnished (no eligible alternative
 * side, or the main isn't in the catalog).
 *
 * @returns {{ frontendRecipe: object, recipeId: string, garnishId: string, course: string } | null}
 */
export function pickGarnishReplacement(data, menuPlan, { groupId, day, meal, course = "main", currentGarnishId = null }) {
  const group = (data?.groups ?? []).find((g) => g.id === groupId);
  if (!group) return null;

  const slotKeyStr = `${day}-${meal}`;
  const currentSlot = menuPlan?.[groupId]?.[slotKeyStr];
  if (!currentSlot) return null;

  const currentRecipeId = course === "first" ? currentSlot.firstRecipeId : currentSlot.recipeId;
  const baseId = stripGroupPrefix(currentRecipeId);
  const mainCatalog = baseId ? recipeCatalogById[baseId] : null;
  if (!mainCatalog) return null;

  const ctx = buildGroupContext(data, group);
  const eaters = currentSlot.eaters ?? 2;

  const daySlug = DAY_SLUG[day];
  const targetMealType = String(meal).toLowerCase() === "cena" ? "cena" : "comida";
  const targetSlotId =
    targetMealType === "cena"
      ? `${daySlug}_cena`
      : course === "first"
        ? `${daySlug}_comida_1`
        : `${daySlug}_comida_2`;

  // Reconstruct this day's assignments so garnish carb-dedup stays correct.
  const dayAssignments = [];
  for (const m of getMeals(data)) {
    const s = menuPlan[groupId]?.[`${day}-${m}`];
    if (!s?.recipeId) continue;
    const mt = String(m).toLowerCase() === "cena" ? "cena" : "comida";
    if (mt === "comida") {
      if (s.firstRecipeId) {
        dayAssignments.push({ slotId: `${daySlug}_comida_1`, recipeId: stripGroupPrefix(s.firstRecipeId) });
      }
      dayAssignments.push({ slotId: `${daySlug}_comida_2`, recipeId: stripGroupPrefix(s.recipeId) });
    } else {
      dayAssignments.push({ slotId: `${daySlug}_cena`, recipeId: stripGroupPrefix(s.recipeId) });
    }
  }

  // Drop the current garnish from the pool so the pairing is guaranteed to
  // change it — unless it's the only eligible option (then leave the pool as-is
  // and bail below when the pick comes back identical).
  let safeGarnishes = filterGarnishes(ctx.filterOpts);
  if (currentGarnishId) {
    const without = safeGarnishes.filter((g) => g.id !== currentGarnishId);
    if (without.length > 0) safeGarnishes = without;
  }

  const paired = pairGarnishes(dayAssignments, recipeCatalogById, {}, safeGarnishes);
  const newGarnishId = paired.find((a) => a.slotId === targetSlotId)?.garnishId;
  if (!newGarnishId || newGarnishId === currentGarnishId) return null;
  const garnish = guarnicionesData.find((g) => g.id === newGarnishId);
  if (!garnish) return null;

  const activeGroups = (data.groups ?? []).filter(
    (g) => membersOfGroup(g, data.members).length > 0,
  );
  const prefix = activeGroups.length > 1 ? `${groupId}__` : "";
  const fr = catalogToFrontendRecipe(mainCatalog, eaters, ctx.filterOpts.intolerances ?? []);
  fr.id = prefix + mainCatalog.id;
  fr.baseRecipeId = mainCatalog.id;
  applyGarnishToRecipe(fr, garnish, eaters, ctx.filterOpts.intolerances ?? []);

  return { frontendRecipe: fr, recipeId: fr.id, garnishId: newGarnishId, course };
}

// ── Recipe steps (on-demand, for catalog recipes without steps) ──

// El system prompt que antes vivia aqui (STEPS_SYSTEM_PROMPT) ahora es propiedad
// del servidor: api/_prompts.js. El cliente solo envia un `task`, para que
// /api/generate no pueda usarse como LLM generico con un prompt cualquiera.

const StepsResponseSchema = z.object({
  steps: z.array(z.string().min(1)).min(1),
});

export async function generateRecipeSteps(recipe, { signal } = {}) {
  // If catalog recipe already has steps, return them
  const catalogRecipe = recipeCatalogById[recipe.id];
  if (catalogRecipe?.steps?.length > 0) {
    return catalogRecipe.steps;
  }

  const body = {
    model: RETRY_MODEL,
    max_tokens: 512,
    task: "steps",
    messages: [
      {
        role: "user",
        content: JSON.stringify({
          name: recipe.name,
          timeMin: recipe.time,
          servings: recipe.servings,
          ingredients: (recipe.ingredients ?? []).map(
            (i) => `${i.name} ${i.qty}${i.unit}`,
          ),
        }),
      },
    ],
  };

  const text = await callModel(body, signal);
  const parsed = extractJson(text);
  const validation = StepsResponseSchema.safeParse(parsed);
  if (!validation.success) {
    throw new AIPlannerError("La IA no devolvió pasos válidos.", {
      cause: validation.error,
      raw: parsed,
    });
  }
  return validation.data.steps;
}
