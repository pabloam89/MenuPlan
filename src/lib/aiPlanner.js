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
  steps: z.array(z.string()).min(1),
  ingredients: z.array(IngredientSchema).min(1),
});

const SlotResponseSchema = z.object({
  groupId: z.string().min(1),
  day: z.enum(DAYS),
  meal: z.string().min(1),
  recipeId: z.string().min(1),
  eaters: z.number().int().nonnegative(),
  mode: z.enum(["casa", "tupper"]),
});

const MenuResponseSchema = z.object({
  recipes: z.array(RecipeSchema).min(1),
  slots: z.array(SlotResponseSchema),
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
    .replace(/[\u0300-\u036f]/g, "");
  for (const [protein, regex] of Object.entries(PROTEIN_KEYWORDS)) {
    if (regex.test(t)) return protein;
  }
  return null;
}

/**
 * Compute the per-slot context that Claude needs to assign recipes correctly.
 * Returns the slots that actually need cooking (skipping fuera/cole/off slots).
 */
function buildSlotsContext(data) {
  const meals = getMeals(data);
  const slots = [];
  for (const group of data.groups) {
    const groupMembers = membersOfGroup(group, data.members);
    if (groupMembers.length === 0) continue;
    const groupHasKids = groupMembers.some((m) => {
      const s = stageForAge(m.age).id;
      return s === "baby" || s === "infantil" || s === "primaria";
    });
    const groupAllergies = Array.from(new Set(groupMembers.flatMap((m) => m.allergies ?? [])));
    const groupDislikes = Array.from(
      new Set([...(data.dislikes ?? []), ...groupMembers.flatMap((m) => m.dislikes ?? [])])
    );
    const groupGoals = data.goalsByGroup?.[group.id] ?? data.goals ?? [];
    const memberGoals = groupMembers.flatMap((m) => data.goalsByGroup?.[m.id] ?? []);
    const goals = Array.from(new Set([...groupGoals, ...memberGoals]));
    const targetKcal = data.kcalByGroup?.[group.id] ?? data.kcal ?? 2000;
    const freqs = data.freqsByGroup?.[group.id] ?? data.freqs ?? {};

    for (const day of DAYS) {
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
          .filter(Boolean)
      );
      for (const meal of meals) {
        const mode = modeForGroupSlot(group, data.members, data.schedule, day, meal);
        if (!mode.cook) continue;
        const eaters = groupMembers.filter((m) => {
          const status = data.schedule[slotKey(m.id, day, meal)] ?? "casa";
          return status === "casa" || status === "tupper";
        }).length;
        slots.push({
          groupId: group.id,
          groupLabel: group.label,
          day,
          meal,
          mealType: meal.toLowerCase() === "cena" ? "cena" : "comida",
          isWeekend,
          timeBudgetMin: isWeekend ? data.timeWeekend ?? 60 : data.timeWeekday ?? 30,
          eaters,
          mode: mode.mode,
          groupHasKids,
          allergies: groupAllergies,
          dislikes: groupDislikes,
          goals,
          targetKcal,
          freqs,
          schoolProteinsToAvoid: Array.from(schoolProteins),
        });
      }
    }
  }
  return { slots, meals };
}

function buildFamilyContext(data) {
  return {
    members: data.members.map((m) => ({
      id: m.id,
      name: m.name,
      age: m.age,
      stage: stageForAge(m.age).id,
      allergies: m.allergies ?? [],
      dislikes: m.dislikes ?? [],
    })),
    groups: data.groups.map((g) => ({ id: g.id, label: g.label, memberIds: g.memberIds })),
    cookLevel: data.cookLevel ?? "normal",
    cookSkills: data.cookSkills ?? [],
    kitchenTools: [
      ...(data.kitchenTools ?? []),
      ...(data.customKitchenTools ?? []),
    ],
    fixedDishes: formatFixedDishesForAI(data.fixedDishes ?? []),
    timeWeekdayMin: data.timeWeekday ?? 30,
    timeWeekendMin: data.timeWeekend ?? 60,
    hasBudget: Boolean(data.hasBudget),
    weeklyBudgetEur: data.hasBudget ? data.budget ?? null : null,
  };
}

const SYSTEM_PROMPT = `Eres un planificador experto de menús familiares en España. Tu tarea es diseñar un menú semanal personalizado a partir del contexto JSON que te envía el usuario.

REGLAS DE NEGOCIO (estrictas):
- Cero alergenos del grupo en sus recetas. Cero ingredientes de la lista de dislikes.
- Si el grupo tiene niños, todas las recetas deben ser kidFriendly=true.
- En slots con mode "tupper", la receta debe ser tupperFriendly=true.
- timeBudgetMin del slot es el tope para recipe.time (puede ser inferior, no superior).
- recipe.kcal por ración debe estar dentro de targetKcal ±20% del slot.
- Cumple lo mejor posible las freqs semanales del grupo (mínimos a la semana de cada categoría).
- Evita repetir el mismo recipeId dentro del mismo grupo en la semana (máximo 1 vez).
- Evita la misma proteína (pescado, carne, legumbres, huevos) dos comidas consecutivas del mismo grupo.
- Si schoolProteinsToAvoid no está vacío para el día, NO uses esa proteína en la cena de ese grupo ese día.
- Si fixedDishes tiene platos, inclúyelos timesPerWeek veces en las comidas indicadas (meals: Comida/Cena).
- Las recetas deben ser variadas y mezclar tradición española e internacional.
- macros en gramos coherentes con kcal: 4·protein + 4·carbs + 9·fat ≈ kcal por ración.
- ingredient.category DEBE ser exactamente uno de: "Verduras y frutas", "Carnes y pescados", "Legumbres y pasta", "Lácteos y huevos", "Panadería y cereales", "Despensa".
- ingredient.unit ∈ {"g","ml","ud"}. ingredient.qty es la cantidad TOTAL para recipe.servings raciones (no por ración).
- recipe.iconType ∈ {fish, meat, egg, legume, pasta, rice, greens, soup, chef}.
- recipe.difficulty ∈ {"Fácil", "Normal", "Me gusta"}. cookLevel "novato" implica solo "Fácil"; "normal" implica "Fácil" o "Normal"; "experto" implica cualquiera.

FORMATO DE SALIDA:
- DEVUELVES SOLO un objeto JSON válido. Nada más: ni markdown, ni comentarios, ni texto fuera del JSON.
- Comienza tu respuesta con "{" y termínala con "}".
- Estructura exacta:
{
  "recipes": [
    {
      "id": "kebab-case-unique",
      "name": "Nombre del plato",
      "iconType": "...",
      "kcal": 520,
      "time": 35,
      "difficulty": "Fácil",
      "tags": ["legumbres","guiso"],
      "mealTypes": ["comida"],
      "tupperFriendly": true,
      "kidFriendly": true,
      "allergens": [],
      "servings": 4,
      "macros": { "protein": 28, "carbs": 60, "fat": 14 },
      "prepSummary": "Una línea descriptiva, máx 80 caracteres.",
      "steps": ["Paso 1...", "Paso 2...", "Paso 3..."],
      "ingredients": [
        { "id": "lentejas", "name": "Lentejas", "category": "Legumbres y pasta", "qty": 400, "unit": "g", "pricePerUnit": 0.0025 }
      ]
    }
  ],
  "slots": [
    { "groupId": "...", "day": "Lun", "meal": "Comida", "recipeId": "kebab-case-unique", "eaters": 4, "mode": "casa" }
  ]
}

- Hay un slot del input → un slot del output (mismo groupId, day, meal, eaters, mode).
- Cada recipeId del array slots DEBE existir en el array recipes.
- Las recetas pueden compartirse entre grupos si el plato lo permite.`;

function buildUserMessage(data) {
  const family = buildFamilyContext(data);
  const { slots } = buildSlotsContext(data);
  return `Genera el menú semanal para esta familia. Usa exclusivamente el contexto de abajo.

FAMILIA Y PREFERENCIAS:
${JSON.stringify(family, null, 2)}

SLOTS A CUBRIR (${slots.length} en total, uno por grupo×día×comida que requiera cocina):
${JSON.stringify(slots, null, 2)}

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
const DEFAULT_MAX_TOKENS = 16000;

/**
 * Call the Vercel-side proxy to Anthropic and return the validated menu.
 * Throws AIPlannerError on any failure (network, schema, etc.).
 */
export async function generateMenuWithAI(data, { signal } = {}) {
  if (!data?.groups?.length) {
    throw new AIPlannerError("No hay grupos definidos en el onboarding.");
  }

  const body = {
    model: DEFAULT_MODEL,
    max_tokens: DEFAULT_MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserMessage(data) }],
  };

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

  let parsed;
  try {
    parsed = extractJson(text);
  } catch (err) {
    throw new AIPlannerError("No se pudo parsear el JSON de la IA.", {
      cause: err,
      raw: text,
    });
  }

  const validation = MenuResponseSchema.safeParse(parsed);
  if (!validation.success) {
    throw new AIPlannerError("El JSON de la IA no cumple el formato esperado.", {
      cause: validation.error,
      raw: parsed,
    });
  }

  const { recipes, slots } = validation.data;
  return materializePlan(recipes, slots, data);
}

/**
 * Convert Claude's flat (recipes, slots) into the shape App.jsx consumes:
 *   { _warnings, [groupId]: { 'Lun-Comida': { recipeId, eaters, mode, warnings: [] } } }
 * Also returns the recipe catalogue for downstream registration.
 */
function materializePlan(recipes, slots, data) {
  const recipeIds = new Set(recipes.map((r) => r.id));
  const validSlots = slots.filter((s) => recipeIds.has(s.recipeId));
  if (validSlots.length === 0) {
    throw new AIPlannerError("La IA devolvió slots sin recetas asociadas.");
  }

  const plan = { _warnings: [] };
  for (const group of data.groups) {
    plan[group.id] = {};
  }
  for (const s of validSlots) {
    if (!plan[s.groupId]) plan[s.groupId] = {};
    plan[s.groupId][`${s.day}-${s.meal}`] = {
      recipeId: s.recipeId,
      eaters: s.eaters,
      mode: s.mode,
      warnings: [],
    };
  }

  return { plan, recipes };
}
