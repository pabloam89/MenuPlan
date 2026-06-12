import { z } from "zod";
import { membersOfGroup } from "./groups.js";
import { DAYS, getMeals, modeForGroupSlot, slotKey } from "./planner.js";
import { stageForAge } from "./stages.js";
import { getSchoolDish, hasAnySchoolDish } from "./schoolMenu.js";
import { formatFixedDishesForAI } from "./fixedDishes.js";

const INGREDIENT_CATEGORIES = [
  "Verduras y frutas",
  "Carnes y pescados",
  "Legumbres y pasta",
  "Lácteos y huevos",
  "Panadería y cereales",
  "Despensa",
];

const ICON_TYPES = ["fish", "meat", "egg", "legume", "pasta", "rice", "greens", "soup", "chef"];

const IngredientSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  category: z.enum(INGREDIENT_CATEGORIES),
  qty: z.number().positive(),
  unit: z.enum(["g", "ml", "ud"]),
  pricePerUnit: z.number().nonnegative().optional(),
});

const RecipeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  iconType: z.enum(ICON_TYPES),
  kcal: z.number().positive(),
  time: z.number().positive(),
  difficulty: z.enum(["Fácil", "Normal", "Me gusta"]),
  tags: z.array(z.string()).default([]),
  mealTypes: z.array(z.enum(["comida", "cena"])).min(1),
  tupperFriendly: z.boolean(),
  kidFriendly: z.boolean(),
  allergens: z.array(z.string()).default([]),
  servings: z.number().int().positive(),
  macros: z.object({
    protein: z.number().nonnegative(),
    carbs: z.number().nonnegative(),
    fat: z.number().nonnegative(),
  }),
  prepSummary: z.string().min(1),
  // Steps se generan bajo demanda al abrir el detalle del plato (ver
  // generateRecipeSteps); el menú llega sin ellos para acortar la respuesta.
  steps: z.array(z.string()).default([]),
  ingredients: z.array(IngredientSchema).min(1),
});

const SlotResponseSchema = z.object({
  day: z.enum(DAYS),
  meal: z.string().min(1),
  recipeId: z.string().min(1),
  firstRecipeId: z.string().min(1).optional(),
  eaters: z.number().int().nonnegative(),
  mode: z.enum(["casa", "tupper"]),
});

const MenuResponseSchema = z.object({
  recipes: z.array(RecipeSchema).min(1),
  slots: z.array(SlotResponseSchema),
});

const StepsResponseSchema = z.object({
  steps: z.array(z.string().min(1)).min(1),
});

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

/**
 * Family-wide preferences shared by every group request. Group-specific
 * constraints (allergies, kcal, freqs…) van en buildGroupContext.
 */
function buildFamilyPrefs(data) {
  return {
    cookLevel: data.cookLevel ?? "normal",
    cookSkills: data.cookSkills ?? [],
    kitchenTools: [...(data.kitchenTools ?? []), ...(data.customKitchenTools ?? [])],
    fixedDishes: formatFixedDishesForAI(data.fixedDishes ?? []),
    timeWeekdayMin: data.timeWeekday ?? 30,
    timeWeekendMin: data.timeWeekend ?? 60,
    weeklyBudgetEur: data.hasBudget ? data.budget ?? null : null,
  };
}

/**
 * Group-level constants stated once, plus the compact list of slots to fill.
 * Per-slot only varía day/meal/eaters/mode (y schoolProteinsToAvoid si aplica).
 */
function buildGroupContext(data, group) {
  const meals = getMeals(data);
  const groupMembers = membersOfGroup(group, data.members);
  const hasKids = groupMembers.some((m) => {
    const s = stageForAge(m.age).id;
    return s === "baby" || s === "infantil" || s === "primaria";
  });
  const allergies = Array.from(new Set(groupMembers.flatMap((m) => m.allergies ?? [])));
  const dislikes = Array.from(
    new Set([...(data.dislikes ?? []), ...groupMembers.flatMap((m) => m.dislikes ?? [])])
  );
  const groupGoals = data.goalsByGroup?.[group.id] ?? data.goals ?? [];
  const memberGoals = groupMembers.flatMap((m) => data.goalsByGroup?.[m.id] ?? []);
  const goals = Array.from(new Set([...groupGoals, ...memberGoals]));

  const slots = [];
  for (const day of DAYS) {
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
        .filter(Boolean)
    );
    for (const meal of meals) {
      const mode = modeForGroupSlot(group, data.members, data.schedule, day, meal);
      if (!mode.cook) continue;
      const eaters = groupMembers.filter((m) => {
        const status = data.schedule[slotKey(m.id, day, meal)] ?? "casa";
        return status === "casa" || status === "tupper";
      }).length;
      const slot = {
        day,
        meal,
        mealType: meal.toLowerCase() === "cena" ? "cena" : "comida",
        eaters,
        mode: mode.mode,
      };
      if (schoolProteins.size > 0) {
        slot.schoolProteinsToAvoid = Array.from(schoolProteins);
      }
      slots.push(slot);
    }
  }

  return {
    group: {
      label: group.label,
      hasKids,
      allergies,
      dislikes,
      goals,
      targetKcal: data.kcalByGroup?.[group.id] ?? data.kcal ?? 2000,
      freqs: data.freqsByGroup?.[group.id] ?? data.freqs ?? {},
    },
    slots,
  };
}

const SYSTEM_PROMPT = `Eres un planificador experto de menús familiares en España. Diseñas el menú semanal de UN grupo de comensales a partir del contexto JSON del usuario.

REGLAS DE NEGOCIO (estrictas):
- Cero alérgenos de group.allergies en las recetas. Cero ingredientes de group.dislikes.
- Si group.hasKids es true, todas las recetas deben ser kidFriendly=true.
- En slots con mode "tupper", la receta debe ser tupperFriendly=true.
- recipe.time ≤ prefs.timeWeekdayMin (Lun-Vie) o prefs.timeWeekendMin (Sáb-Dom).
- recipe.kcal por ración dentro de group.targetKcal ±20%.
- Cumple lo mejor posible group.freqs (mínimos semanales por categoría).
- No repitas el mismo recipeId en la semana (máximo 1 vez).
- Evita la misma proteína (pescado, carne, legumbres, huevos) en dos comidas consecutivas.
- En slots de mealType "comida": incluye firstRecipeId (1º ligero: crema, ensalada o sopa de verduras) y recipeId (2º principal con proteína). Entre 1º y 2º no repitas proteína, legumbre ni base de carbohidrato (arroz, pasta, cuscús, quinoa…).
- En mealType "cena": solo recipeId.
- No repitas proteína entre la comida y la cena del mismo día.
- Nunca dos platos de cuchara en la misma comida (puré+legumbres, crema+guiso, sopa+lentejas). Tras un 1º de legumbre/sopa/crema/puré, el 2º debe ser proteína sólida, no pasta, paella, arroz ni otra legumbre.
- Paella y pizza son plato único: sin 2º, o solo ensalada/crema muy ligera de 1º.
- Máximo un plato de pasta por día.
- Si un slot trae schoolProteinsToAvoid, NO uses esas proteínas en la cena de ese día.
- Si prefs.fixedDishes tiene platos, inclúyelos timesPerWeek veces en las comidas indicadas.
- Recetas variadas, mezclando tradición española e internacional.
- macros en gramos coherentes con kcal: 4·protein + 4·carbs + 9·fat ≈ kcal por ración.
- Máximo 8 ingredientes por receta (solo los esenciales).
- NO incluyas pasos de preparación: la salida no lleva campo steps.
- ingredient.category DEBE ser exactamente uno de: "Verduras y frutas", "Carnes y pescados", "Legumbres y pasta", "Lácteos y huevos", "Panadería y cereales", "Despensa".
- ingredient.unit ∈ {"g","ml","ud"}. ingredient.qty es la cantidad TOTAL para recipe.servings raciones (no por ración).
- recipe.iconType ∈ {fish, meat, egg, legume, pasta, rice, greens, soup, chef}.
- recipe.difficulty ∈ {"Fácil", "Normal", "Me gusta"}. cookLevel "basic" implica solo "Fácil"; "normal" implica "Fácil" o "Normal"; "pro" implica cualquiera.

FORMATO DE SALIDA:
- DEVUELVES SOLO un objeto JSON válido y compacto (sin sangría). Nada más: ni markdown, ni comentarios, ni texto fuera del JSON. Empieza con "{" y termina con "}".
- Estructura exacta:
{"recipes":[{"id":"kebab-case-unique","name":"Nombre del plato","iconType":"legume","kcal":520,"time":35,"difficulty":"Fácil","tags":["legumbres","guiso"],"mealTypes":["comida"],"tupperFriendly":true,"kidFriendly":true,"allergens":[],"servings":4,"macros":{"protein":28,"carbs":60,"fat":14},"prepSummary":"Una línea descriptiva, máx 80 caracteres.","ingredients":[{"id":"lentejas","name":"Lentejas","category":"Legumbres y pasta","qty":400,"unit":"g","pricePerUnit":0.0025}]}],"slots":[{"day":"Lun","meal":"Comida","firstRecipeId":"crema-calabacin","recipeId":"kebab-case-unique","eaters":4,"mode":"casa"}]}
- Cada recipeId y firstRecipeId de slots DEBE existir en recipes.
- Cubre TODOS los slots de la lista del usuario, exactamente esos (mismo day y meal).`;

function buildUserMessage(data, group) {
  const prefs = buildFamilyPrefs(data);
  const { group: groupBlock, slots } = buildGroupContext(data, group);
  return `Genera el menú semanal de este grupo. Usa exclusivamente el contexto de abajo.
PREFS: ${JSON.stringify(prefs)}
GROUP: ${JSON.stringify(groupBlock)}
SLOTS A CUBRIR (${slots.length}): ${JSON.stringify(slots)}
Devuelve únicamente el JSON con "recipes" y "slots" descrito en las instrucciones del sistema.`;
}

function extractJson(text) {
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

const DEFAULT_MODEL = "claude-sonnet-4-5-20250929";
const DEFAULT_MAX_TOKENS = 32000;

/** POST al proxy de Vercel y devuelve el texto de la respuesta del modelo. */
async function callModel(body, signal) {
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
      { cause: err }
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
      `La IA respondió con un error (HTTP ${response.status}). ${detail}`.trim()
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

// Enum drift is the main reason a response fails validation. Coerce the common
// synonyms the model emits so we don't burn a whole round-trip on a typo.
const DIFFICULTY_MAP = {
  facil: "Fácil",
  fácil: "Fácil",
  easy: "Fácil",
  baja: "Fácil",
  sencilla: "Fácil",
  normal: "Normal",
  media: "Normal",
  medium: "Normal",
  intermedia: "Normal",
  "me gusta": "Me gusta",
  dificil: "Me gusta",
  difícil: "Me gusta",
  alta: "Me gusta",
  hard: "Me gusta",
  pro: "Me gusta",
};

const UNIT_MAP = {
  g: "g",
  gr: "g",
  gramo: "g",
  gramos: "g",
  ml: "ml",
  mililitro: "ml",
  mililitros: "ml",
  cl: "ml",
  l: "ml",
  ud: "ud",
  uds: "ud",
  u: "ud",
  unidad: "ud",
  unidades: "ud",
};

function normalizeRecipe(r) {
  if (!r || typeof r !== "object") return r;
  const out = { ...r };
  if (typeof out.difficulty === "string") {
    const mapped = DIFFICULTY_MAP[out.difficulty.toLowerCase().trim()];
    if (mapped) out.difficulty = mapped;
  }
  if (typeof out.iconType === "string" && !ICON_TYPES.includes(out.iconType)) {
    out.iconType = "chef"; // generic fallback icon
  }
  if (Array.isArray(out.ingredients)) {
    out.ingredients = out.ingredients.map((ing) => {
      if (!ing || typeof ing !== "object" || typeof ing.unit !== "string") return ing;
      const mapped = UNIT_MAP[ing.unit.toLowerCase().trim()];
      return mapped ? { ...ing, unit: mapped } : ing;
    });
  }
  return out;
}

function normalizeMenuResponse(parsed) {
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.recipes)) {
    return parsed;
  }
  return { ...parsed, recipes: parsed.recipes.map(normalizeRecipe) };
}

function formatZodIssues(error) {
  return error.issues
    .slice(0, 8)
    .map((i) => `${i.path.join(".") || "(raíz)"}: ${i.message}`)
    .join("\n");
}

async function generateGroupMenu(data, group, signal) {
  const userMessage = buildUserMessage(data, group);
  const request = (messages) =>
    callModel(
      {
        model: DEFAULT_MODEL,
        max_tokens: DEFAULT_MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages,
      },
      signal
    );

  const parseText = (text, label) => {
    try {
      return normalizeMenuResponse(extractJson(text));
    } catch (err) {
      throw new AIPlannerError(`No se pudo parsear el JSON de la IA${label}.`, {
        cause: err,
        raw: text,
      });
    }
  };

  let text = await request([{ role: "user", content: userMessage }]);
  let parsed = parseText(text, "");
  let validation = MenuResponseSchema.safeParse(parsed);

  // One corrective round-trip with the exact validation errors fed back —
  // mirrors menuParser and rescues the occasional malformed response instead
  // of failing the whole regeneration.
  if (!validation.success) {
    const retryText = await request([
      { role: "user", content: userMessage },
      { role: "assistant", content: text },
      {
        role: "user",
        content: `El JSON no cumple el esquema. Corrige EXACTAMENTE estos errores y devuelve SOLO el JSON completo corregido, con los mismos slots:\n${formatZodIssues(
          validation.error
        )}`,
      },
    ]);
    parsed = parseText(retryText, " (reintento)");
    validation = MenuResponseSchema.safeParse(parsed);
  }

  if (!validation.success) {
    throw new AIPlannerError("El JSON de la IA no cumple el formato esperado.", {
      cause: validation.error,
      raw: parsed,
    });
  }

  return { group, ...validation.data };
}

/**
 * Genera el menú semanal: una llamada por grupo en paralelo (Promise.all) y
 * fusión en el plan { _warnings, [groupId]: { 'Lun-Comida': {...} } }.
 * Con varios grupos, los ids de receta se prefijan con el groupId para evitar
 * colisiones entre respuestas independientes (cada grupo tiene sus alergias).
 */
export async function generateMenuWithAI(data, { signal } = {}) {
  if (!data?.groups?.length) {
    throw new AIPlannerError("No hay grupos definidos en el onboarding.");
  }

  const activeGroups = data.groups.filter(
    (g) => membersOfGroup(g, data.members).length > 0
  );
  if (activeGroups.length === 0) {
    throw new AIPlannerError("Ningún grupo tiene miembros asignados.");
  }

  const results = await Promise.all(
    activeGroups.map((group) => generateGroupMenu(data, group, signal))
  );

  const multi = results.length > 1;
  const plan = { _warnings: [] };
  for (const group of data.groups) {
    plan[group.id] = {};
  }

  const allRecipes = [];
  let placedSlots = 0;
  for (const { group, recipes, slots } of results) {
    const prefix = multi ? `${group.id}__` : "";
    const recipeIds = new Set(recipes.map((r) => r.id));
    for (const r of recipes) {
      allRecipes.push(prefix ? { ...r, id: prefix + r.id } : r);
    }
    for (const s of slots) {
      if (!recipeIds.has(s.recipeId)) continue;
      plan[group.id][`${s.day}-${s.meal}`] = {
        recipeId: prefix + s.recipeId,
        firstRecipeId:
          s.firstRecipeId && recipeIds.has(s.firstRecipeId)
            ? prefix + s.firstRecipeId
            : null,
        eaters: s.eaters,
        mode: s.mode,
        warnings: [],
      };
      placedSlots++;
    }
  }

  if (placedSlots === 0) {
    throw new AIPlannerError("La IA devolvió slots sin recetas asociadas.");
  }

  return { plan, recipes: allRecipes };
}

const STEPS_SYSTEM_PROMPT = `Eres un cocinero español. Recibes una receta (nombre, tiempo, raciones e ingredientes) y devuelves SOLO un JSON válido {"steps":["…"]} con 3 a 5 pasos de preparación breves (máx 90 caracteres cada uno), en español, sin markdown ni texto fuera del JSON.`;

/**
 * Pide bajo demanda el paso a paso de una receta generada por IA (el menú
 * llega sin steps para acortar la generación). Devuelve un array de strings.
 */
export async function generateRecipeSteps(recipe, { signal } = {}) {
  const body = {
    model: DEFAULT_MODEL,
    max_tokens: 1000,
    system: STEPS_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: JSON.stringify({
          name: recipe.name,
          timeMin: recipe.time,
          servings: recipe.servings,
          ingredients: (recipe.ingredients ?? []).map(
            (i) => `${i.name} ${i.qty}${i.unit}`
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
