// Cómo se organiza el menú de los niños, decidido en su propia pantalla del
// onboarding (OnboardingKidsDinner) justo después del horario — cuando ya se
// sabe qué días come cada niño en el cole y qué días en casa.
//
// El schedule dice DÓNDE come el niño; esto guarda QUÉ le preparamos. El modelo
// se organiza por COMIDA (no por casa/cole/finde), que es el eje donde vive la
// decisión de verdad y evita repetir las mismas tarjetas:
//
//   weekdayLunch → mediodía entre semana los días que come en casa
//                  ("together" = el menú de la familia | "own" = el suyo propio)
//   dinner       → la cena entre semana (siempre en casa):
//                    "sameDinner" = la MISMA cena que cenan los padres
//                    "different"  = algo suyo, sin repetir el comedor (+avoid)
//   reuseColeDinner → aprovechamiento que se SUPERPONE a lo anterior: los días de
//                  comedor, en vez de cocinar la cena, se reutiliza lo que la
//                  familia comió al mediodía (para no repetir el cole). No es una
//                  tercera categoría de cena, es un toggle sobre cualquiera de las
//                  dos. Solo aplica los días que el niño comió en el cole
//                  (ver kidsSlotAction).
//   weekend      → finde y vacaciones ("together" | "own")
//
// Se guarda por niño (byMember[kidId]) para poder pintar avatares y que "Todos"
// escriba sobre todos a la vez. El planner trabaja con UN menú por grupo, así
// que para decidir usa una política de hogar (householdKidPolicy): la del primer
// niño, que "Todos" mantiene sincronizada.

import { slotKey, DAYS } from "./planner.js";
import { splitMembersByStage } from "./groups.js";

const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie"];
const WEEKEND = ["Sáb", "Dom"];

export const KID_DINNER_OPTIONS = {
  weekdayLunch: ["together", "own"],
  dinner: ["sameDinner", "different"],
  weekend: ["together", "own"],
};

// "avoid" solo se usa con dinner === "different": qué NO puede repetir la cena
// respecto al comedor. Proteína e hidratos por defecto; verdura desactivada
// porque a la mayoría le da igual que se repita.
export const KID_DINNER_AVOID_DEFAULTS = { protein: true, carbs: true, veg: false };

export const KID_DINNER_DEFAULTS = {
  weekdayLunch: "together",
  dinner: "sameDinner",
  reuseColeDinner: false,
  weekend: "together",
  // "limited" (niño especial para comer) + "safeFoods" (categorías que sí come)
  // solo pintan cuando el niño tiene menú propio. Los consume el planner para
  // garantizar un alimento seguro en cada hueco (Gap 3, fase motor).
  limited: false,
  safeFoods: [],
  avoid: { ...KID_DINNER_AVOID_DEFAULTS },
};

function normalizeOne(raw) {
  const base = raw && typeof raw === "object" ? raw : {};
  // Migración de nombres antiguos (feature aún no en prod): weekdayHome →
  // weekdayLunch, weekdaySchool → dinner.
  const weekdayLunch = KID_DINNER_OPTIONS.weekdayLunch.includes(base.weekdayLunch)
    ? base.weekdayLunch
    : KID_DINNER_OPTIONS.weekdayLunch.includes(base.weekdayHome)
      ? base.weekdayHome
      : KID_DINNER_DEFAULTS.weekdayLunch;
  // La cena ahora es binaria (sameDinner | different) + un flag de aprovechamiento.
  // El antiguo "mirrorLunch" se descompone en dinner "different" + reuseColeDinner;
  // el antiguo "none" cae a "different" (ya no existe "no planificar").
  const legacyDinner = ["sameDinner", "mirrorLunch", "different", "none"].includes(base.dinner)
    ? base.dinner
    : ["sameDinner", "mirrorLunch", "different", "none"].includes(base.weekdaySchool)
      ? base.weekdaySchool
      : KID_DINNER_DEFAULTS.dinner;
  const dinner = legacyDinner === "sameDinner" ? "sameDinner" : "different";
  const reuseColeDinner = base.reuseColeDinner === true || legacyDinner === "mirrorLunch";
  const weekend = KID_DINNER_OPTIONS.weekend.includes(base.weekend)
    ? base.weekend
    : KID_DINNER_DEFAULTS.weekend;
  const avoidRaw = base.avoid && typeof base.avoid === "object" ? base.avoid : {};
  const limited = base.limited === true;
  const safeFoods = Array.isArray(base.safeFoods)
    ? base.safeFoods.filter((s) => typeof s === "string")
    : [];
  return {
    weekdayLunch,
    dinner,
    reuseColeDinner,
    weekend,
    limited,
    safeFoods,
    avoid: {
      protein: typeof avoidRaw.protein === "boolean" ? avoidRaw.protein : KID_DINNER_AVOID_DEFAULTS.protein,
      carbs: typeof avoidRaw.carbs === "boolean" ? avoidRaw.carbs : KID_DINNER_AVOID_DEFAULTS.carbs,
      veg: typeof avoidRaw.veg === "boolean" ? avoidRaw.veg : KID_DINNER_AVOID_DEFAULTS.veg,
    },
  };
}

/** Canonical { byMember } shape; tolerant of legacy/undefined input. */
export function normalizeKidDinnerConfig(cfg) {
  const base = cfg && typeof cfg === "object" ? cfg : {};
  const byMemberRaw = base.byMember && typeof base.byMember === "object" ? base.byMember : {};
  const byMember = {};
  for (const [id, one] of Object.entries(byMemberRaw)) byMember[id] = normalizeOne(one);
  return { byMember };
}

/** Effective config for a kid: their own row, or the defaults. */
export function resolveKidDinnerConfig(data, memberId) {
  const cfg = normalizeKidDinnerConfig(data?.kidDinnerConfig);
  return cfg.byMember[memberId] ?? { ...KID_DINNER_DEFAULTS, avoid: { ...KID_DINNER_AVOID_DEFAULTS } };
}

/** The kid members a household menu should ask about (Hijo/a, teens — not babies). */
export function kidMembers(members) {
  return splitMembersByStage(members ?? []).children;
}

/** Days (from DAYS) where this member's Comida is the school cafeteria. */
export function kidSchoolDays(schedule, memberId) {
  const sch = schedule ?? {};
  return DAYS.filter((d) => sch[slotKey(memberId, d, "Comida")] === "cole");
}

/** Weekdays where this member eats Comida at home (casa/tupper), cole excluded. */
export function kidHomeWeekdays(schedule, memberId) {
  const sch = schedule ?? {};
  return WEEKDAYS.filter((d) => {
    const s = sch[slotKey(memberId, d, "Comida")] ?? "casa";
    return s === "casa" || s === "tupper";
  });
}

/** True when the household has at least one kid eating at the school cafeteria. */
export function anyKidHasSchool(data) {
  const kids = kidMembers(data?.members);
  return kids.some((m) => kidSchoolDays(data?.schedule, m.id).length > 0);
}

/**
 * Single policy the planner uses for the (one) Niños group: the first kid's
 * resolved config. "Todos" keeps every kid in sync, so this matches the UI for
 * the common case; genuinely divergent per-kid menus aren't representable with a
 * single group anyway.
 */
export function householdKidPolicy(data) {
  const kids = kidMembers(data?.members);
  if (kids.length === 0) return null;
  const cfg = normalizeKidDinnerConfig(data?.kidDinnerConfig);
  if (Object.keys(cfg.byMember).length > 0) {
    return resolveKidDinnerConfig(data, kids[0].id);
  }
  // Sin pantalla configurada: nada que copiar/derivar (los "menús separados"
  // clásicos generan su propio menú). Salvo el antiguo flag suelto, que
  // reproducimos como "cena = lo del mediodía".
  if (data?.kidDinnerMatchesAdultLunch) {
    return { weekdayLunch: "own", dinner: "different", reuseColeDinner: true, weekend: "own", avoid: { ...KID_DINNER_AVOID_DEFAULTS } };
  }
  return null;
}

/**
 * Whether the kids end up eating exactly like the family everywhere (so no
 * separate "Niños" group is needed): family lunch, the parents' dinner, and
 * together on weekends. Any divergence → separate menu.
 */
export function deriveKidsMenuModel(data) {
  const policy = householdKidPolicy(data);
  if (!policy) return null; // no kids → caller keeps whatever it had
  const fullyFamily =
    policy.weekdayLunch === "together" &&
    policy.weekend === "together" &&
    policy.dinner === "sameDinner" &&
    !policy.reuseColeDinner;
  return fullyFamily ? "same" : "separate";
}

/**
 * What the planner should do with the Niños group's slot on a given day+meal:
 *   "generate"    → cook a dish for the kids (own menu / cena diferente)
 *   "adultLunch"  → copy the adults' Comida into this slot
 *   "adultDinner" → copy the adults' Cena into this slot
 *   "skip"        → leave it unplanned
 * modeForGroupSlot still decides whether anyone eats at home at all; this only
 * runs for slots that do cook.
 */
export function kidsSlotAction(data, day, meal) {
  const policy = householdKidPolicy(data);
  if (!policy) return "generate";
  const m = String(meal).toLowerCase();

  if (WEEKEND.includes(day)) {
    if (policy.weekend === "together") return m === "cena" ? "adultDinner" : "adultLunch";
    return "generate";
  }

  if (m === "comida") {
    // Cole days don't cook (modeForGroupSlot handles that); at-home weekday
    // lunch either mirrors the family or is the kid's own.
    return policy.weekdayLunch === "together" ? "adultLunch" : "generate";
  }

  // Weekday dinner. "reuseColeDinner" se superpone: los días que el niño comió
  // en el cole, en vez de cocinar reutilizamos lo que la familia comió al
  // mediodía (adultLunch). El resto de días sigue la base (sameDinner/different).
  if (policy.reuseColeDinner) {
    const kids = kidMembers(data.members);
    const ateCole = kids.some(
      (k) => (data.schedule?.[slotKey(k.id, day, "Comida")] ?? "casa") === "cole",
    );
    if (ateCole) return "adultLunch";
  }
  return policy.dinner === "sameDinner" ? "adultDinner" : "generate";
}

/**
 * Legacy bridge for the planner's mirror machinery: true when kids' dinner
 * should pull from adults' lunch on cole days ("mirrorLunch").
 */
export function deriveKidDinnerMatchesAdultLunch(data) {
  const policy = householdKidPolicy(data);
  return Boolean(policy && policy.reuseColeDinner);
}

/**
 * Avoid-categories for school-day dinner planning. Applies when:
 *  - kids get their own cena ("different"), or
 *  - kids eat the same cena as parents ("sameDinner" without reuseColeDinner) —
 *    then the constraint lands on the adults' cena slot (kids copy it).
 * Not used when kids reuse the family mediodía at dinner (reuseColeDinner).
 */
export function schoolAvoidCategories(data) {
  const policy = householdKidPolicy(data);
  if (!policy) {
    return { protein: false, carbs: false, veg: false };
  }
  const applies =
    policy.dinner === "different" ||
    (policy.dinner === "sameDinner" && !policy.reuseColeDinner);
  if (!applies) {
    return { protein: false, carbs: false, veg: false };
  }
  return { ...KID_DINNER_AVOID_DEFAULTS, ...policy.avoid };
}

export const IS_WEEKEND_DAY = (day) => WEEKEND.includes(day);
