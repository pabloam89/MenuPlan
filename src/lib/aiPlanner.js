import { z } from "zod";
import { isBabyMenuGroup, membersOfGroup, resolveMemberAge } from "./groups.js";
import { DAYS, getMeals, modeForGroupSlot, slotKey } from "./planner.js";
import { stageForAge } from "./stages.js";
import { getSchoolDish, hasAnySchoolDish } from "./schoolMenu.js";
import { filterRecipes, filterGarnishes, decisionCatalog } from "../utils/filterRecipes.js";
import { favoriteIdsForGroup } from "./recipeVotes.js";
import { recipeCatalogById } from "../data/recipeCatalog.js";
import { validateMenu, buildCorrectionMessage, applyFallback } from "../utils/validateMenu.js";
import guarnicionesData from "../data/recipes/guarniciones.json";
import { formatFixedDishesForAI, pinnedGarnishMap, enforceFixedDishes } from "./fixedDishes.js";
import { maxCookTime, maxCookTimeFilter, migrateCookTime } from "./cookTime.js";
import { pairGarnishes } from "../utils/pairGarnishes.js";
import { guessIngredientCategory, isQualitativeUnit } from "./ingredientCategories.js";
import { buildAdaptationMap } from "./substitutions.js";
import { PLANNER_MODEL, FAST_MODEL } from "./aiModels.js";

// ── Helpers ─────────────────────────────────────────────────────

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
const PROTEIN_GROUP_MAP = {
  pollo: "carne", pavo: "carne", cerdo: "carne", ternera: "carne",
  pescado_blanco: "pescado", pescado_azul: "pescado", marisco: "pescado",
  legumbre: "legumbres", huevo: "huevos",
};
function proteinGroupOf(recipe) {
  return recipe ? (PROTEIN_GROUP_MAP[recipe.mainProtein] ?? null) : null;
}

// Balanced weekly quotas used when the user hasn't set a meal style — includes
// carbs, meat and eggs so the default menu isn't skewed all-healthy.
const DEFAULT_FREQS = { carne: 3, pescado: 2, legumbres: 2, pasta_arroz: 2, huevos: 2, verdura: 3 };

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
  constructor(message, { cause, raw } = {}) {
    super(message);
    this.name = "AIPlannerError";
    if (cause) this.cause = cause;
    if (raw) this.raw = raw;
  }
}

// ── API call ────────────────────────────────────────────────────

const DEFAULT_MODEL = PLANNER_MODEL;
const RETRY_MODEL = FAST_MODEL;
const DEFAULT_MAX_TOKENS = 1024;

export async function callModel(body, signal) {
  let response;
  try {
    response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    throw new AIPlannerError(
      "No se pudo contactar con el servicio de IA. Comprueba la conexión.",
      { cause: err },
    );
  }

  if (!response.ok) {
    let detail = "";
    try {
      const errBody = await response.json();
      detail = errBody?.error?.message || errBody?.error || JSON.stringify(errBody);
    } catch {
      detail = await response.text().catch(() => "");
    }
    throw new AIPlannerError(
      `La IA respondió con un error (HTTP ${response.status}). ${detail}`.trim(),
    );
  }

  let payload;
  try {
    payload = await response.json();
  } catch (err) {
    throw new AIPlannerError("Respuesta no JSON del proxy.", { cause: err });
  }

  const text = payload?.content?.[0]?.text;
  if (typeof text !== "string" || text.length === 0) {
    throw new AIPlannerError("La IA devolvió una respuesta vacía.", { raw: payload });
  }
  return text;
}

// ── System prompt ───────────────────────────────────────────────

const SYSTEM_PROMPT = `Eres un planificador de menús familiares españoles. Trabajas EXCLUSIVAMENTE con el catálogo proporcionado. NUNCA inventes recetas ni ids. Tu único trabajo es asignar recetas del catálogo a cada hueco del menú con criterio gastronómico real.

ESTRUCTURA DE UN DÍA EN ESPAÑA:
- COMIDA (mediodía): primero ligero (sopa, crema, ensalada, verdura, legumbre) + segundo principal (carne, pescado, huevo), o un plato_unico solo.
  - Plato único (paella, cocido, pizza): va solo, sin primero ni segundo. Pon el plato_unico en el slot _1 y omite el slot _2.
  - Nunca dos platos de cuchara en la misma comida.
  - Primero y segundo no comparten proteína ni base de carbohidrato.
- CENA: un solo plato, siempre más ligero que la comida.
  - Válidas: tortillas, revueltos, ensaladas, cremas, pescado a la plancha, verdura, sándwiches.
  - NUNCA legumbres ni guisos pesados de cena.
  - Si la comida del día llevó carne, la cena va de pescado/huevo/verdura, y viceversa.

CRITERIO DE VARIEDAD (lo importante de tu trabajo):
- No repetir mainProtein en comidas consecutivas (comida->cena del mismo día y cena->comida del día siguiente cuentan como consecutivas).
- No poner la misma categoría dominante días seguidos aunque sean recetas distintas.
- Distribuir a lo largo de la semana: pescado, legumbres, carne, huevo, pasta - sin amontonar.
- Coherencia estacional: aprovecha platos frescos en verano, de cuchara en invierno.

OBJETIVOS SEMANALES (config.freqs) — cuotas orientativas por semana:
- Cada clave de config.freqs indica cuántas veces por semana debería aparecer ese tipo de plato principal en el menú. Acércate lo máximo posible a esas cantidades SIN romper la estructura, la variedad ni las restricciones de arriba.
- Mapeo de cada clave al catálogo (usa category y mainProtein de cada receta):
  - carne: category "carnes" o mainProtein pollo/pavo/cerdo/ternera
  - pescado: category "pescados" o mainProtein pescado_blanco/pescado_azul/marisco
  - legumbres: category "legumbres" o mainProtein legumbre
  - huevos: category "huevos" o mainProtein huevo
  - pasta_arroz: category "pasta_arroces"
  - verdura: category "ensaladas_verduras" o "sopas_cremas" (van sobre todo en el primero de la comida)
- Son objetivos, no límites rígidos: intenta cumplirlos, pero la coherencia gastronómica y las reglas anteriores mandan siempre.

PERFILES DE SALUD (config.healthProfiles) — ORIENTACIÓN, nunca exclusión:
- Si la lista NO está vacía, inclina el menú hacia lo más adecuado SIN romper estructura, variedad, tiempos ni restricciones. Cuando el catálogo trae carbs_g/fat_g/protein_g y healthFlags, úsalos para decidir:
  - glucemico: prioriza verdura, legumbre y pescado; modera pasta_arroces y platos con carbs_g alto o healthFlags "azucar_anadido".
  - corazon: prioriza pescado, legumbre y verdura; evita healthFlags "frito"/"embutido" y platos con fat_g alto.
  - bajo_sodio: evita healthFlags "alto_sodio" y "embutido".
  - reflux: evita healthFlags "frito", "picante" y "acido".
  - anemia: prioriza platos ricos en hierro (carne roja magra, legumbre, verdura de hoja, pescado) y healthFlags "rico_hierro".
- Es una preferencia FUERTE pero SECUNDARIA a alergias, tipo de plato, variedad y tiempos. Nunca dejes un hueco sin cubrir por cumplir un perfil.

RESTRICCIONES POR SLOT:
- Cada slot incluye un campo "maxTime". La receta asignada DEBE tener time ≤ maxTime.
- Si un slot trae schoolProteinsToAvoid, no uses esas proteínas en la CENA de ese día.
- Si un slot tiene mode "tupper", la receta debe tener tupperFriendly = true.
- Si un slot trae preferType "plato_unico" (excepción marcada por el usuario), asígnale una receta con mealRole "plato_unico" (paella, pizza, guiso completo…). Ese día NO lleva primero ni segundo: solo el slot _comida_1 con ese plato.
- Si un slot trae preferType "cena_rapida", asígnale una receta de category "cenas_rapidas" (sándwich, tosta, ensalada, revuelto…): algo ligero y rápido.
- NUNCA uses una receta de category "cenas_rapidas" en un slot que NO tenga preferType "cena_rapida". Esa categoría es solo para el hueco marcado explícitamente por el usuario como cena rápida.
- Si hay platos a repetir (fixedDishes), cada plato debe aparecer exactamente timesPerWeek veces a lo largo de la semana, en slots del tipo indicado en meals (comida o cena) y REPARTIDO en días distintos (no días seguidos). Colócalo en la posición que le corresponda por su mealRole: si es "primero" va en comida_1, si es "segundo" va en comida_2, si es "cena" en el hueco de cena. NUNCA pongas una verdura/primero como segundo (plato principal): el día debe conservar su proteína. Usa SOLO recipeIds del catálogo: si catalogMatches trae ids usa uno de esos; si está vacío elige la receta más parecida por nombre; NUNCA inventes ids.

IMPORTANTE: Debes cubrir TODOS los slots del listado. Cada día tiene 3 huecos (comida_1, comida_2, cena) o 2 si usas plato_unico. No omitas ninguno.

FORMATO DE RESPUESTA - SOLO esto, JSON compacto, sin texto:
{"slots":[{"slotId":"lun_comida_1","recipeId":"sopas_003"},{"slotId":"lun_comida_2","recipeId":"carnes_012"},{"slotId":"lun_cena","recipeId":"huevos_004"}, ...]}
Si usas un plato_unico en la comida, incluye solo el slot _1 con ese plato y omite el _2. Nada más.`;


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
  const dislikes = Array.from(
    new Set([...(data.dislikes ?? []), ...groupMembers.flatMap((m) => m.dislikes ?? [])]),
  );

  const kitchenTools = [...(data.kitchenTools ?? []), ...(data.customKitchenTools ?? [])];
  const cookTime = migrateCookTime(data);

  const slots = [];
  const schoolMenuByDay = {};

  // Ad-hoc individual menus (e.g. "dieta blanda") only span a few days, not the
  // whole week. Everything else keeps the standard 7-day window.
  const planDays =
    Number.isInteger(group.days) && group.days > 0 ? DAYS.slice(0, group.days) : DAYS;

  for (const day of planDays) {
    const daySlug = DAY_SLUG[day];
    const isWeekend = day === "Sáb" || day === "Dom";

    const schoolProteins = new Set(
      groupMembers
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

    // Collect school menu text for context
    for (const m of groupMembers) {
      const courses = getSchoolDish(data.schoolMenus, m.id, day);
      if (hasAnySchoolDish(courses)) {
        const parts = [courses.primero, courses.segundo, courses.postre].filter(Boolean);
        if (parts.length > 0) schoolMenuByDay[daySlug] = parts.join(", ");
      }
    }

    for (const meal of meals) {
      const mode = modeForGroupSlot(group, data.members, data.schedule, day, meal);
      if (!mode.cook) continue;

      const eaters = groupMembers.filter((m) => {
        const status = data.schedule[slotKey(m.id, day, meal)] ?? "casa";
        return status === "casa" || status === "tupper";
      }).length;

      const mealType = meal.toLowerCase() === "cena" ? "cena" : "comida";
      const maxTime = maxCookTime(data, { isWeekend, meal });
      // User-marked exception for this exact day+meal ("unico" | "rapida").
      const slotTypeSel = data.slotType?.[`${day}|${meal}`];

      const mealStructure = data.mealStructureByGroup?.[group.id] ?? "primero_segundo";

      if (mealType === "comida") {
        if (isBabyGroup) {
          slots.push({ day, daySlug, mealType, eaters, mode: mode.mode, maxTime, slotId: `${daySlug}_comida_1`, position: "plato_unico" });
        } else if (slotTypeSel === "unico" || mealStructure === "1_plato") {
          // Single complete dish: only one slot, no primero+segundo.
          slots.push({ day, daySlug, mealType, eaters, mode: mode.mode, maxTime, slotId: `${daySlug}_comida_1`, position: "plato_unico", preferType: "plato_unico" });
        } else {
          const primeroMaxTime = Math.max(20, Math.round(maxTime * 0.4));
          slots.push({ day, daySlug, mealType, eaters, mode: mode.mode, maxTime: primeroMaxTime, slotId: `${daySlug}_comida_1`, position: "primero" });
          slots.push({ day, daySlug, mealType, eaters, mode: mode.mode, maxTime, slotId: `${daySlug}_comida_2`, position: "segundo" });
        }
      } else {
        const isQuick = slotTypeSel === "rapida";
        const slot = {
          day, daySlug, mealType, eaters, mode: mode.mode,
          maxTime: isQuick ? Math.min(maxTime, 20) : maxTime,
          slotId: `${daySlug}_cena`,
        };
        if (isQuick) slot.preferType = "cena_rapida";
        if (schoolProteins.size > 0) {
          slot.schoolProteinsToAvoid = Array.from(schoolProteins);
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
      hasKids,
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
    },
    config: {
      targetKcal: data.kcalByGroup?.[group.id] ?? data.kcal ?? 2000,
      freqs: data.freqsByGroup?.[group.id] ?? data.freqs ?? DEFAULT_FREQS,
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
export function buildUserMessage(filteredRecipes, slots, config, schoolMenuByDay, fixedDishes = [], pantryNames = []) {
  const includeHealth = Array.isArray(config?.healthProfiles) && config.healthProfiles.length > 0;
  const catalog = decisionCatalog(filteredRecipes, { includeHealth });
  const slotsForLLM = slots.map((s) => {
    const out = { slotId: s.slotId, mealType: s.mealType, mode: s.mode, maxTime: s.maxTime };
    if (s.position) out.position = s.position;
    if (s.preferType) out.preferType = s.preferType;
    if (s.schoolProteinsToAvoid) out.schoolProteinsToAvoid = s.schoolProteinsToAvoid;
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
    parts.push(
      `\nINGREDIENTES QUE EL USUARIO YA TIENE EN CASA:\n${pantryNames.map((n) => `- ${n}`).join("\n")}` +
        `\n\nINSTRUCCIÓN ADICIONAL: Cuando haya dos recetas equivalentes para un hueco, prioriza la que use más ingredientes de esta lista. Esta preferencia es SECUNDARIA a todas las demás reglas (complementación escolar, variedad, alergias). No fuerces recetas que no encajen solo por usar ingredientes disponibles.`,
    );
  }

  // Favorites nudge: only add it when the pool actually has favorites, so the
  // instruction never confuses the model when there's nothing to prioritize.
  if (catalog.some((r) => r.favorite)) {
    parts.push(
      `\nRECETAS FAVORITAS DEL USUARIO: las marcadas con "favorite": true en el catálogo. Cuando encajen en un hueco (respetando tipo de plato, tiempo, variedad y todas las demás reglas), PRIORÍZALAS sobre otras equivalentes. Es una preferencia fuerte pero no absoluta: no repitas la misma favorita más de lo razonable ni rompas la variedad del menú solo por incluirlas.`,
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
      text: `Catálogo:\n${JSON.stringify(catalog)}`,
      cache_control: { type: "ephemeral" },
    },
    { type: "text", text: parts.join("\n") },
  ];
}

// ── Slot-type exceptions (user-marked "plato único" / "cena rápida") ──────

function recipeMatchesPreferType(recipe, preferType) {
  if (!recipe) return false;
  if (preferType === "plato_unico") return (recipe.mealRole ?? []).includes("plato_unico");
  if (preferType === "cena_rapida") return recipe.category === "cenas_rapidas";
  return true;
}

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
    if (recipeMatchesPreferType(poolById[a.recipeId], preferType)) continue;

    const fits = (r) => {
      if (!recipeMatchesPreferType(r, preferType)) return false;
      if (ctx.maxTime && r.time > ctx.maxTime) return false;
      if (ctx.mode === "tupper" && !r.tupperFriendly) return false;
      return true;
    };

    const candidate =
      Object.values(poolById).find((r) => fits(r) && !used.has(r.id)) ??
      Object.values(poolById).find(fits) ??
      Object.values(recipeCatalogById).find(fits);
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

const LLMResponseSchema = z.object({
  slots: z.array(SlotAssignmentSchema).min(1),
});

// ── Generation ──────────────────────────────────────────────────

// Exported for tests only — not used elsewhere outside this module.
export async function generateGroupMenu(data, group, signal, pantryIngredients = []) {
  const ctx = buildGroupContext(data, group);
  // Pantry is family-wide (not per-group), so it's merged into filterOpts
  // here rather than inside buildGroupContext.
  const filterOpts = {
    ...ctx.filterOpts,
    pantryIngredients: pantryIngredients.map((p) => p.ingredientNormalized),
  };

  const { recipes: filteredPool, error: filterError } = filterRecipes(filterOpts);
  if (filterError) {
    throw new AIPlannerError(filterError);
  }

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

  const userMessage = buildUserMessage(
    filteredPool,
    ctx.slots,
    ctx.config,
    ctx.schoolMenuByDay,
    data.fixedDishes,
    pantryIngredients.map((p) => p.ingredientName),
  );

  const request = (messages, model = DEFAULT_MODEL) =>
    callModel(
      { model, max_tokens: DEFAULT_MAX_TOKENS, system: SYSTEM_PROMPT, messages },
      signal,
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
            'Tu respuesta no contiene JSON válido. Devuelve SOLO esto, sin texto adicional: {"slots":[{"slotId":"...","recipeId":"..."},...]}',
        },
      ],
      RETRY_MODEL,
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
    const retryText = await request(
      [
        { role: "user", content: userMessage },
        { role: "assistant", content: text },
        {
          role: "user",
          content: `El JSON no cumple el formato. Devuelve SOLO {"slots":[{"slotId":"...","recipeId":"..."},...]}\nErrores:\n${schemaResult.error.issues
            .slice(0, 5)
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("\n")}`,
        },
      ],
      RETRY_MODEL,
    );
    try {
      parsed = extractJson(retryText);
    } catch (err) {
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
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const check = validateMenu(slotAssignments, filteredPool, ctx.slots, ctx.config.healthProfiles);
    if (check.valid) break;

    if (attempt < MAX_RETRIES - 1) {
      const correctionMsg = buildCorrectionMessage(check.violations);
      const retryText = await request(
        [
          { role: "user", content: userMessage },
          { role: "assistant", content: text },
          { role: "user", content: correctionMsg },
        ],
        attempt === 0 ? DEFAULT_MODEL : RETRY_MODEL,
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

  // 3. Final validation — apply deterministic fallback if still invalid
  const finalCheck = validateMenu(slotAssignments, filteredPool, ctx.slots, ctx.config.healthProfiles);
  if (!finalCheck.valid) {
    slotAssignments = applyFallback(
      slotAssignments,
      finalCheck.violations,
      filteredPool,
      ctx.slots,
      ctx.config.healthProfiles,
    );
  }

  // 3b. Last-resort safety net: hydration (generateMenuWithAI) resolves each
  // recipeId against the FULL unfiltered catalog, not filteredPool — so if a
  // violation survives retries + fallback (e.g. no compliant candidate existed
  // for a tightly-constrained slot), it would otherwise still render with
  // unfiltered data (allergen, alcohol, baby-only...). Drop those slots here
  // instead of letting them reach the user, and surface why.
  const warnings = [];
  const poolIds = new Set(filteredPool.map((r) => r.id));
  slotAssignments = slotAssignments.filter((s) => {
    if (poolIds.has(s.recipeId)) return true;
    warnings.push(`${group.label}: no se encontró una receta que cumpliera todas las restricciones para ${s.slotId}; hueco omitido.`);
    return false;
  });

  const poolById = Object.fromEntries(filteredPool.map((r) => [r.id, r]));

  // 4. Force fixed dishes to appear exactly timesPerWeek times (hard rule).
  //    The LLM is asked to do this but isn't reliable, so we guarantee it here.
  slotAssignments = enforceFixedDishes(slotAssignments, data.fixedDishes, poolById);

  // 4b. Force user-marked slot exceptions (plato único / cena rápida).
  slotAssignments = enforceSlotTypes(slotAssignments, ctx.slots, poolById);

  // 5. Pair "principal" recipes with garnishes (deterministic, no LLM).
  //    User-pinned combos (dish chosen from the catalog) take priority.
  slotAssignments = pairGarnishes(slotAssignments, poolById, pinnedGarnishMap(data.fixedDishes), safeGarnishes);

  return {
    group,
    slotAssignments,
    filteredPool,
    slotsContext: ctx.slots,
    // Active intolerances/states for this group; hydration uses them to apply
    // invisible ingredient swaps (e.g. lactose-free) to the chosen recipes.
    restrictions: ctx.filterOpts.intolerances ?? [],
    warnings,
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
  const r = catalogRecipe;
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
    },
    // Heuristic flags (see lib/healthFlags.js) carried through so the menu/
    // dish detail can show a "menú más cuidado" badge (lib/healthProfileMatch.js).
    healthFlags: r.healthFlags ?? [],
    prepSummary: r.description || r.name,
    steps: r.steps ?? [],
    image: `/dishes/${r.id}.webp`,
    photo: r.photo ?? undefined,
    ingredients,
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

export async function generateMenuWithAI(data, { signal, pantryIngredients = [] } = {}) {
  if (!data?.groups?.length) {
    throw new AIPlannerError("No hay grupos definidos en el onboarding.");
  }

  const activeGroups = data.groups.filter(
    (g) => membersOfGroup(g, data.members).length > 0,
  );
  if (activeGroups.length === 0) {
    throw new AIPlannerError("Ningún grupo tiene miembros asignados.");
  }

  const results = await Promise.all(
    activeGroups.map((group) => generateGroupMenu(data, group, signal, pantryIngredients)),
  );

  const multi = results.length > 1;
  const plan = { _warnings: [] };
  for (const group of data.groups) {
    plan[group.id] = {};
  }

  const allRecipes = [];
  const seenRecipeIds = new Set();
  let placedSlots = 0;

  const guarnicionById = Object.fromEntries(guarnicionesData.map((g) => [g.id, g]));
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
    for (const { slotId, recipeId, garnishId } of slotAssignments) {
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

        allRecipes.push(fr);
      }

      // Parse slotId: "lun_comida_1", "lun_comida_2", "lun_cena"
      const parts = slotId.split("_");
      const daySlug = parts[0];
      const mealType = parts[1]; // "comida" or "cena"
      const position = parts[2]; // "1", "2", or undefined for cena

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

      if (mealType === "cena") {
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

    for (const [key, slot] of Object.entries(byDayMeal)) {
      if (slot.recipeId) {
        plan[group.id][key] = slot;
        placedSlots++;
      }
    }
  }

  if (placedSlots === 0) {
    throw new AIPlannerError("La IA devolvió slots sin recetas asociadas.");
  }

  return { plan, recipes: allRecipes };
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
 * Merge a garnish into a frontend recipe in place: name, time, macros, scaled
 * ingredients, prepSummary and steps. Shared by the generator and the swap flow
 * so a paired dish looks identical regardless of how it entered the menu.
 */
export function applyGarnishToRecipe(fr, garnish, eaters, restrictions = []) {
  if (!fr || !garnish) return fr;

  // Preserve garnishId so the photo lookup can build the combo key
  // "<dish>+<garnish>" that the image is stored under.
  fr.garnishId = garnish.id;
  fr.name = `${fr.name} con ${garnish.shortName}`;

  // Time: dishes are cooked in parallel, show the longest
  fr.time = Math.max(fr.time, garnish.time);

  // Macros: garnish values are stored per baseServings
  const gPerServing = garnish.baseServings ?? 1;
  fr.kcal = fr.kcal + Math.round(garnish.kcal / gPerServing);
  fr.macros = {
    protein: (fr.macros.protein ?? 0) + Math.round(garnish.protein_g / gPerServing),
    carbs: (fr.macros.carbs ?? 0) + Math.round(garnish.carbs_g / gPerServing),
    fat: (fr.macros.fat ?? 0) + Math.round(garnish.fat_g / gPerServing),
  };

  // Ingredients: scale garnish to actual number of eaters. Compute the swap
  // the same way the main dish does (buildAdaptationMap against the group's
  // live restrictions) — filterGarnishes only decided the garnish was
  // *eligible*, not what to rename, so a garnish never needs to be dropped
  // just because it has a swappable ingredient (e.g. lactose-free milk).
  const { renameByName, adaptations: garnishAdaptations } = buildAdaptationMap(garnish, restrictions);
  const gFactor = eaters / gPerServing;
  const gIngredients = garnish.ingredients.map((ing) => {
    let scaledQty = ing.amount * gFactor;
    if (ing.unit === "g" || ing.unit === "ml") {
      scaledQty = Math.round(scaledQty / 5) * 5;
      if (scaledQty < 5) scaledQty = 5;
    } else {
      scaledQty = Math.ceil(scaledQty);
    }
    const name = renameByName.get(ing.name) ?? ing.name;
    return {
      id: `garnish-${name.toLowerCase().replace(/\s+/g, "-")}`,
      name,
      category: guessIngredientCategory(name),
      qty: scaledQty,
      unit: ing.unit,
    };
  });
  fr.ingredients = [...fr.ingredients, ...gIngredients];

  // Surface the garnish's own swaps in the same `adaptations` note the main
  // dish uses, so the UI shows "Adaptado: sin lactosa" regardless of which
  // part of the combined dish needed the swap.
  if (garnishAdaptations.length > 0) {
    fr.adaptations = [...(fr.adaptations ?? []), ...garnishAdaptations];
  }

  if (garnish.description) {
    fr.prepSummary = `${fr.prepSummary}. ${garnish.description}`;
  }
  if (garnish.steps?.length) {
    fr.steps = [...(fr.steps ?? []), ...garnish.steps];
  }
  return fr;
}

/**
 * Pick a replacement recipe for a slot from the rich catalog.
 *
 * @returns {{ frontendRecipe: object, recipeId: string, course: string } | null}
 */
export function pickCatalogReplacement(data, menuPlan, { groupId, day, meal, course = "main" }) {
  const group = (data?.groups ?? []).find((g) => g.id === groupId);
  if (!group) return null;

  const slotKeyStr = `${day}-${meal}`;
  const currentSlot = menuPlan?.[groupId]?.[slotKeyStr];
  if (!currentSlot) return null;

  const currentRecipeId =
    course === "first" ? currentSlot.firstRecipeId : currentSlot.recipeId;
  const currentBaseId = stripGroupPrefix(currentRecipeId);
  const currentCatalog = currentBaseId ? recipeCatalogById[currentBaseId] : null;

  // Target meal roles: mirror the dish being replaced; otherwise infer from the
  // slot shape (a comida with a first course → segundo; plato único; cena).
  let targetRoles;
  if (currentCatalog?.mealRole?.length) {
    targetRoles = new Set(currentCatalog.mealRole);
  } else if (course === "first") {
    targetRoles = new Set(["primero"]);
  } else if (String(meal).toLowerCase() === "cena") {
    targetRoles = new Set(["cena", "plato_unico"]);
  } else {
    targetRoles = new Set(currentSlot.firstRecipeId ? ["segundo"] : ["plato_unico"]);
  }

  // Same constrained pool the AI planner would see for this group.
  const ctx = buildGroupContext(data, group);
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

  // "cenas_rapidas" (nachos, sándwiches...) is only appropriate for the exact
  // slot the user flagged as "cena rápida" — otherwise it can replace a normal
  // dinner with something that doesn't match what the user actually asked for.
  const isCenaRapida = data.slotType?.[`${day}|${meal}`] === "rapida";

  const roleMatch = (r) => r.mealRole?.some((role) => targetRoles.has(role));
  let candidates = pool.filter(
    (r) =>
      roleMatch(r) &&
      r.time <= slotMaxTime &&
      !usedBaseIds.has(r.id) &&
      (isCenaRapida || r.category !== "cenas_rapidas"),
  );
  // Relax the "not already used" rule if nothing else fits (never the same dish).
  if (candidates.length === 0) {
    candidates = pool.filter(
      (r) =>
        roleMatch(r) &&
        r.time <= slotMaxTime &&
        r.id !== currentBaseId &&
        (isCenaRapida || r.category !== "cenas_rapidas"),
    );
  }
  if (candidates.length === 0) return null;

  // Diversity guardrails: this swap path picks from a much smaller pool than
  // the full generator and previously ignored validateMenu.js's rules
  // entirely, which let a single-dish replacement reintroduce a repeated
  // protein/legume next to itself (e.g. garbanzos two days running, or a
  // primero with protein when the segundo already carries one).
  const siblingRecipeId = course === "first" ? currentSlot.recipeId : currentSlot.firstRecipeId;
  const siblingHasProtein = Boolean(
    proteinGroupOf(recipeCatalogById[stripGroupPrefix(siblingRecipeId)]),
  );

  const nearbyProteinGroups = new Set();
  const dayIdx = DAYS.indexOf(day);
  const neighborDays = [DAYS[dayIdx - 1], DAYS[dayIdx + 1]].filter(Boolean);
  for (const d of neighborDays) {
    for (const m of getMeals(data)) {
      const s = menuPlan[groupId]?.[`${d}-${m}`];
      if (!s) continue;
      for (const rid of [s.firstRecipeId, s.recipeId]) {
        const grp = proteinGroupOf(recipeCatalogById[stripGroupPrefix(rid)]);
        if (grp) nearbyProteinGroups.add(grp);
      }
    }
  }
  // Same day, other meal (comida <-> cena) — the slot being replaced is excluded.
  for (const m of getMeals(data)) {
    if (m === meal) continue;
    const s = menuPlan[groupId]?.[`${day}-${m}`];
    if (!s) continue;
    for (const rid of [s.firstRecipeId, s.recipeId]) {
      const grp = proteinGroupOf(recipeCatalogById[stripGroupPrefix(rid)]);
      if (grp) nearbyProteinGroups.add(grp);
    }
  }

  const diverse = candidates.filter((r) => {
    const grp = proteinGroupOf(r);
    if (!grp) return true;
    if (siblingHasProtein) return false; // same comida already has a protein course
    return !nearbyProteinGroups.has(grp);
  });
  if (diverse.length > 0) candidates = diverse;

  const picked = candidates[Math.floor(Math.random() * candidates.length)];

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

  return { frontendRecipe: fr, recipeId: fr.id, course };
}

// ── Recipe steps (on-demand, for catalog recipes without steps) ──

const STEPS_SYSTEM_PROMPT = `Eres un cocinero español. Recibes una receta (nombre, tiempo, raciones e ingredientes) y devuelves SOLO un JSON válido {"steps":["…"]} con 3 a 5 pasos de preparación breves (máx 90 caracteres cada uno), en español, sin markdown ni texto fuera del JSON.`;

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
    system: STEPS_SYSTEM_PROMPT,
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
