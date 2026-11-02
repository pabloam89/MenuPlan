/**
 * La entrada del motor (trozo 30 de #1037): la casa de una semana, compilada
 * UNA vez en un problema cerrado que es lo único que lee el motor
 * (aiPlanner.js): huecos, filtro de recetas por grupo, restricciones y
 * objetivos con su peso y su origen. `entradaDelMotor` es la única función que
 * lee `data.*`; lo demás de este fichero son sus piezas.
 */
import { normalizeKidDinnerConfig, schoolAvoidCategories, kidsSlotAction, householdKidPolicy } from "./kidsMenu.js";
import { DAYS, diasActivosDe, getMeals, modeForGroupSlot, slotKey } from "./planner.js";
import { isBabyMenuGroup, membersOfGroup, tipoDeGrupo } from "./groups.js";
import { esMenor, esNino } from "./stages.js";
import { alergiasParaMenu } from "./alergias.js";
import { normalizeAllergenId } from "./allergens.js";
import { vetosDe } from "./vetos.js";
import { etapasServibles } from "./babyStage.js";
import { favoriteIdsForGroup } from "./recipeVotes.js";
import { DIA_SLUG as DAY_SLUG, tipoDeComida, comidaDeTipo } from "./dias.js";
import { maxCookTime, maxCookTimeFilter, migrateCookTime } from "./cookTime.js";
import { estructuraDelGrupo, estructuraCenaDelGrupo, platosDelHueco } from "./estructuraPlatos.js";
import { DEFAULT_FREQS } from "./defaultFreqs.js";
import { solverActivo, PESO_RECIENTE, PESO_PRESUPUESTO } from "./solver.js";
import { PESO_SESGO } from "./sesgos.js";
import { basesPedidas } from "./bases.js";
import { presupuestoSemanal } from "./presupuesto.js";
import { recetasRecientes } from "./recientes.js";
import { presupuestoDeTopes, repartoAFreqs, freqsAReparto } from "./reparto.js";
import { getSchoolDish, hasAnySchoolDish } from "./schoolMenu.js";
import { carbTypeFromText } from "../utils/validateMenu.js";

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

/**
 * Lo que el comedor sirvió un día a `miembros`: la proteína, los hidratos y
 * la verdura que la cena no debe repetir, y el texto del menú del cole.
 */
function coleDelDia(schoolMenus, miembros, day) {
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

/**
 * Los huecos de un grupo en una comida de un día (`dia`: lo que el bucle de
 * buildGroupContext sabe de ese día y de ese grupo): ninguno si no se cocina
 * o lo copia el menú de los adultos, uno o dos según la estructura.
 */
function huecosDeLaComida(data, group, meal, dia) {
  const { day, daySlug, tiempo, groupMembers, isBabyGroup, isKidsGroup, isAdultsGroup, linkKidDinner, schoolProteins, schoolCarbs, schoolVeg } = dia;
  const mode = modeForGroupSlot(group, data.members, data.schedule, day, meal);
  if (!mode.cook) return [];

  // El menú de los niños: los huecos que copian del menú de los adultos
  // (mediodía en familia, "cena como los padres" / "lo del mediodía",
  // finde juntos) o que no se planifican se resuelven tras la generación
  // (ver bloque de copia). Aquí solo generamos los que son "suyos".
  if (isKidsGroup && kidsSlotAction(data, day, meal) !== "generate") return [];

  const eaters = groupMembers.filter((m) => {
    const status = data.schedule[slotKey(m.id, day, meal)] ?? "casa";
    return status === "casa" || status === "tupper";
  }).length;

  const mealType = tipoDeComida(meal);
  const maxTime = minutosDelHueco(tiempo, day, meal);
  // User-marked exception for this exact day+meal ("unico" | "rapida").
  const slotTypeSel = data.slotType?.[`${day}|${meal}`];

  // Per-group override first; si no hay, la estructura global (modo básico);
  // si no, primero+segundo. La misma lectura que Lola (estructuraPlatos.js, #958).
  const mealStructure = estructuraDelGrupo(data, group.id);
  // La cena tiene su propia estructura y su propio defecto. No hereda la de
  // la comida: quien come de primero y segundo no cena por fuerza igual, y
  // lo normal en España es cenar una cosa. Por eso el defecto es "1_plato"
  // aunque la comida sea "primero_segundo".
  const estructuraCena = estructuraCenaDelGrupo(data, group.id);
  // Cuántos platos lleva el hueco: la regla es una (estructuraPlatos.js) y
  // la comparte el invariante de completitud (huecosDelPlan.js). Aquí
  // solo se decide la forma de cada hueco.
  const platos = platosDelHueco({ comida: meal, estructura: mealStructure, estructuraCena, slotType: slotTypeSel, esBebe: isBabyGroup });

  if (mealType === "comida") {
    if (isBabyGroup) {
      return [{ day, daySlug, mealType, eaters, mode: mode.mode, maxTime, slotId: `${daySlug}_comida_1`, position: "plato_unico" }];
    } else if (platos.length === 1) {
      // Un solo plato completo (plato único marcado, estructura de un
      // plato o comida rápida: una cosa ligera en ≤15 min).
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
      return [slot];
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
      return [primero, segundo];
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
    // contrario, un solo plato y pronto (platosDelHueco).
    if (platos.length === 2) {
      const comun = { day, daySlug, mealType, eaters, mode: mode.mode, maxTime, mealBudget: maxTime };
      const primeroCena = { ...comun, slotId: `${daySlug}_cena_1`, position: "primero" };
      const segundoCena = { ...comun, slotId: `${daySlug}_cena_2`, position: "segundo" };
      const avoid = effectiveSchoolAvoid(data);
      if (avoid.protein && schoolProteins.size > 0) segundoCena.schoolProteinsToAvoid = Array.from(schoolProteins);
      if (avoid.carbs && schoolCarbs.size > 0) segundoCena.schoolCarbsToAvoid = Array.from(schoolCarbs);
      if (avoid.veg && schoolVeg.size > 0) primeroCena.schoolVegToAvoid = Array.from(schoolVeg);
      return [primeroCena, segundoCena];
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
    return [slot];
  }
}

export function buildGroupContext(data, group, tiempo = tiempoDeCocina(data)) {
  const meals = getMeals(data);
  const groupMembers = membersOfGroup(group, data.members);
  const isBabyGroup = isBabyMenuGroup(group, data.members);
  // Niños de 3 a 11 (etapaDe): el filtro kidFriendly y el de alcohol.
  const hasKids = !isBabyGroup && groupMembers.some((m) => esNino(m));
  const allergies = Array.from(new Set(groupMembers.flatMap((m) => alergiasParaMenu(data, m))));
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
  // Gluten como alergia: en vez de quitar toda la pasta y el pan del menú, se
  // cambian por su versión sin gluten donde la hay (substitutions.js sin_gluten).
  const impliesSinGluten = allergies.some((a) => normalizeAllergenId(a) === "gluten");
  const intolerances = Array.from(
    new Set([
      ...groupMembers.flatMap((m) => m.intolerances ?? []),
      ...memberDietaryStates,
      ...(impliesAlcoholCocina ? ["alcohol_cocina"] : []),
      ...(impliesSinGluten ? ["sin_gluten"] : []),
    ]),
  );
  // Los vetos («nada de coliflor»): la libreta, las reglas y los de cada
  // persona del grupo, calculados al leer (lib/vetos.js). Duros en comida y
  // cena (filterRecipes paso 2), blandos fuera de menú.
  const dislikes = vetosDe(data, { grupo: group });

  const kitchenTools = data.kitchenTools ?? [];
  const cookTime = migrateCookTime(data);

  const slots = [];
  const schoolMenuByDay = {};

  // Solo los días de la semana pedida (data.menuWeek; sin él, los siete): una
  // semana de viernes a domingo no crea huecos de lunes a jueves (#1029). Un
  // menú individual ad hoc («dieta blanda», group.days numérico) dura sus
  // primeros N días DE LOS PLANIFICADOS: tres días de dieta que empiezan en
  // viernes son Vie, Sáb y Dom, no un lunes que ya pasó.
  const diasSemana = diasActivosDe(data);
  const planDays =
    Number.isInteger(group.days) && group.days > 0 ? diasSemana.slice(0, group.days) : diasSemana;

  // Kid dinner = adults' lunch: adults' comida must avoid school proteins/carbs
  // from household kids; kids' cena slots are skipped and filled after Adultos.
  const linkKidDinner = Boolean(data.kidDinnerMatchesAdultLunch);
  const isAdultsGroup = tipoDeGrupo(group) === "adultos";
  const isKidsGroup = tipoDeGrupo(group) === "ninos";
  const schoolSourceMembers =
    linkKidDinner && isAdultsGroup
      ? (data.members ?? []).filter((m) => esMenor(m))
      : groupMembers;

  for (const day of planDays) {
    const daySlug = DAY_SLUG[day];

    // Lo que el comedor sirvió ese día: lo que la cena no repite y su texto.
    const { schoolProteins, schoolCarbs, schoolVeg, texto } = coleDelDia(data.schoolMenus, schoolSourceMembers, day);
    if (texto) schoolMenuByDay[daySlug] = texto;

    for (const meal of meals) {
      slots.push(...huecosDeLaComida(data, group, meal, {
        day, daySlug, tiempo, groupMembers, isBabyGroup, isKidsGroup, isAdultsGroup, linkKidDinner, schoolProteins, schoolCarbs, schoolVeg,
      }));
    }
  }

  // Lo que una regla quita SOLO ciertos días («los lunes, sin carne»):
  // reglas.js lo proyecta por hueco y aquí se cuelga de cada uno, para que lo
  // vean el validador (excluido_en_hueco), la reparación y el solver. Misma
  // clave que `data.slotType`: «Lun|Comida».
  if (data.excluirPorHueco) {
    for (const s of slots) {
      const lista = data.excluirPorHueco[`${s.day}|${comidaDeTipo(s.mealType)}`];
      if (lista?.length) s.excluirHueco = lista;
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
      favoriteIds: favoriteIdsForGroup(data.recipeVotes, group),
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
      // El día en que la casa cocina las tandas (Lun…Dom), si lo ha dicho. Sin él,
      // el domingo de siempre.
      diaTanda: data.diaTanda,
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

/**
 * Los minutos de cocina por día y comida (`cookTime` de la casa, entre semana y
 * finde): el tope de tiempo de cada hueco. Los siete días, para que cambiar un
 * plato de cualquier día lo encuentre.
 */
function tiempoDeCocina(data) {
  return Object.fromEntries(DAYS.map((day) => {
    const isWeekend = day === "Sáb" || day === "Dom";
    return [day, { Comida: maxCookTime(data, { isWeekend, meal: "Comida" }), Cena: maxCookTime(data, { isWeekend, meal: "Cena" }) }];
  }));
}

/** El tope de un hueco: lo de la cena para la cena, lo de la comida para lo demás (maxCookTime). */
export function minutosDelHueco(tiempo, day, meal) {
  return tiempo[day][meal === "Cena" ? "Cena" : "Comida"];
}

/** La forma de la entrada: sube cuando cambia lo que el motor lee de ella. */
export const VERSION_ENTRADA = 1;

const COMPILADAS = new WeakSet();

/** ¿Salió de entradaDelMotor? Lo que no, no es una entrada aunque se le parezca. */
export const esEntrada = (x) => COMPILADAS.has(x);

/**
 * La casa de una semana (lo que deja prepararSemana: reglas proyectadas, cole
 * de esa semana, horario) compilada en el problema que resuelve el motor.
 *
 *   huecos        día × comida × grupo × plato, con quién come en cada uno
 *   contexto      por grupo: sus huecos, el filtro de sus candidatos
 *                 (alergias, intolerancias, vetos, tiempo, aparatos…) y sus
 *                 topes (buildGroupContext)
 *   restricciones lo que no se discute: platos fijos, recetas propias, bases
 *                 de la tanda
 *   objetivos     lo que se prefiere, con el peso con que lo cuenta el motor y
 *                 el dato de la casa del que sale (`origen`); peso y origen
 *                 los leerá el solver del trozo 31 de #1037, que pesa cada
 *                 preferencia por separado
 *   tiempo        minutos de cocina por día y comida: el tope de cada hueco
 *                 del contexto
 *
 * `hoy` es la fecha con la que se leen los vetos y las reglas que caducan.
 * Se congela: el motor la lee y no la cambia.
 */
export function entradaDelMotor(data, { hoy = null } = {}) {
  const ficha = hoy && hoy !== data?.vigenteEn ? { ...data, vigenteEn: hoy } : data;
  const personas = ficha?.members ?? [];
  const grupos = ficha?.groups ?? [];
  const activos = grupos.filter((g) => membersOfGroup(g, personas).length > 0);
  // El tope de cada hueco del contexto sale de esta tabla, la misma que lleva la entrada.
  const tiempo = tiempoDeCocina(ficha);
  const contexto = Object.fromEntries(activos.map((g) => [g.id, buildGroupContext(ficha, g, tiempo)]));
  const dias = diasActivosDe(ficha);
  const accion = Object.fromEntries(dias.map((day) => [day, {
    Comida: kidsSlotAction(ficha, day, "Comida"),
    Cena: kidsSlotAction(ficha, day, "Cena"),
  }]));
  const entrada = Object.freeze({
    version: VERSION_ENTRADA,
    hoy: ficha?.vigenteEn ?? null,
    dias,
    personas,
    grupos,
    activos,
    horario: ficha?.schedule ?? {},
    contexto,
    huecos: activos.flatMap((g) => contexto[g.id].slots.map((s) => ({
      grupo: g.id, dia: s.day, comida: comidaDeTipo(s.mealType), plato: s.position ?? "cena", hueco: s.slotId, comensales: s.eaters,
    }))),
    tiempo,
    ninos: { politica: householdKidPolicy(ficha), accion },
    extras: { comidas: ficha?.extraMeals ?? {}, seguridad: Object.fromEntries(activos.map((g) => [g.id, seguridadFueraDeMenu(ficha, g)])) },
    restricciones: {
      fijos: ficha?.fixedDishes ?? [],
      propias: ficha?.userRecipes ?? [],
      tanda: basesPedidas(ficha?.tanda),
    },
    objetivos: {
      sesgos: { valor: ficha?.sesgos ?? null, peso: PESO_SESGO, origen: "sesgos" },
      favoritos: { valor: ficha?.favoritos ?? [], peso: PESO_SESGO, origen: "favoritos" },
      // Lo que saliste comiendo, por grupo (sus favoritas van exentas).
      recientes: {
        valor: Object.fromEntries(activos.map((g) => [g.id, recetasRecientes(ficha, { exentos: contexto[g.id].filterOpts.favoriteIds })])),
        peso: PESO_RECIENTE,
        origen: "menus",
      },
      presupuesto: { valor: presupuestoSemanal(ficha), peso: PESO_PRESUPUESTO, origen: "presupuesto" },
    },
  });
  COMPILADAS.add(entrada);
  return entrada;
}

/** La entrada tal cual, o compilada si llega la casa (`data`) en crudo. */
export function comoEntrada(x, semana) {
  return esEntrada(x) ? x : entradaDelMotor(x, semana);
}

/**
 * Lo que un grupo no puede comer fuera del menú (desayuno, merienda, postre):
 * sus alergias, intolerancias y estados, y sus vetos. Sin las adaptaciones que
 * implican (alcohol, sin gluten): fuera de menú no hay sustitución.
 */
function seguridadFueraDeMenu(data, group) {
  const members = membersOfGroup(group, data.members);
  return {
    allergies: [...new Set(members.flatMap((m) => alergiasParaMenu(data, m)))],
    intolerances: [...new Set(members.flatMap((m) => [...(m.intolerances ?? []), ...(m.dietaryStates ?? [])]))],
    dislikes: vetosDe(data, { grupo: group }),
  };
}
