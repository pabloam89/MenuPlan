/**
 * La entrada del motor (trozo 30 de #1037): lo que se compila de la casa
 * antes de generar, para que aiPlanner.js deje de leer `data.*`.
 *
 * Por ahora, las piezas que leen la casa para montar el contexto de un
 * grupo, movidas de aiPlanner.js sin cambiar lo que hacen.
 */
import { normalizeKidDinnerConfig, schoolAvoidCategories } from "./kidsMenu.js";
import { DEFAULT_FREQS } from "./defaultFreqs.js";
import { solverActivo } from "./solver.js";
import { presupuestoDeTopes, repartoAFreqs, freqsAReparto } from "./reparto.js";
import { getSchoolDish, hasAnySchoolDish } from "./schoolMenu.js";
import { carbTypeFromText } from "../utils/validateMenu.js";

// School-menu avoidance categories for the kids' cena. Historically the kids'
// dinner ALWAYS avoided the school's protein + carb base (that's the "cena
// diferente" default, locked in by tests). The per-kid kidDinnerConfig can now
// relax that or add vegetables via the "cena diferente" pop-up, but only when
// the household actually configured it — otherwise we keep the legacy default so
// existing setups (and the test suite) behave exactly as before.
export function effectiveSchoolAvoid(data) {
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
export function schoolServedVeg(text) {
  const t = String(text ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return SCHOOL_VEG_RE.test(t) ? "verdura" : null;
}

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

export function proteinFromText(text) {
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
export function topesDelGrupo(data, group, huecos) {
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

/**
 * Lo que el comedor sirvió un día a `miembros`: la proteína, los hidratos y
 * la verdura que la cena no debe repetir, y el texto del menú del cole.
 */
export function coleDelDia(schoolMenus, miembros, day) {
  const schoolProteins = new Set(
    miembros
      .map((m) => {
        const courses = getSchoolDish(schoolMenus, m.id, day);
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
    miembros
      .map((m) => {
        const courses = getSchoolDish(schoolMenus, m.id, day);
        if (!hasAnySchoolDish(courses)) return null;
        const text = [courses.primero, courses.segundo].filter(Boolean).join(" ");
        return carbTypeFromText(text);
      })
      .filter(Boolean),
  );

  // Whether the school served vegetables that day (primero+segundo). Only
  // consulted when a kid opted into avoiding veg repetition at dinner.
  const schoolVeg = new Set(
    miembros
      .map((m) => {
        const courses = getSchoolDish(schoolMenus, m.id, day);
        if (!hasAnySchoolDish(courses)) return null;
        const text = [courses.primero, courses.segundo].filter(Boolean).join(" ");
        return schoolServedVeg(text);
      })
      .filter(Boolean),
  );

  // Collect school menu text for context
  let texto = null;
  for (const m of miembros) {
    const courses = getSchoolDish(schoolMenus, m.id, day);
    if (hasAnySchoolDish(courses)) {
      const parts = [courses.primero, courses.segundo, courses.postre].filter(Boolean);
      if (parts.length > 0) texto = parts.join(", ");
    }
  }
  return { schoolProteins, schoolCarbs, schoolVeg, texto };
}
