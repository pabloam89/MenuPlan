/**
 * El registro de la ficha de la casa y de la persona (#939, fase 4): cada dato
 * que se guarda de una casa (household_state.state.data) o de una persona
 * (data.members[]), una vez, con su entidad, su tema, su estado y su lista
 * cerrada. Lo que no está aquí no debería guardarse; el inventario
 * (`npm run ficha:inventario`) cuenta lo que no cuadra.
 *
 * No sustituye a los registros que ya había: los nombra.
 *  - `campo`: el campo de registroCampos.js (la tabla registro_campo, lo que
 *    Lola pregunta y cómo). Solo 7 datos lo tienen; cambiarlo pide migración.
 *  - `libreta`: el campo de la libreta (notepadFields.js CAMPOS) del que este
 *    dato es la proyección. La libreta manda; el dato es su vista.
 *  - `vocabulario`: la lista de vocabularios.js (VOCABULARIOS). null en un
 *    enum es un hueco que el inventario cuenta (`enum_sin_vocabulario`).
 *
 * Columnas, en vocabulario cerrado (las listas de abajo):
 *  - entidad (ENTIDADES): de qué cosa es el dato.
 *  - tema (TEMAS): de qué habla, para agrupar la ficha.
 *  - clase (CLASES_DATO, vocabularios.js; plan, «Las cuatro clases de dato»):
 *      qué es el dato y, por tanto, cómo se guarda cuando cierre su tramo.
 *      hecho     lo que la casa dice o la app ve: una fila con sobre.
 *      derivado  se calcula de otros hechos (`de`) con la función que dice
 *                `funcion` («src/lib/fichero.js:nombre»); no debería guardarse.
 *      marca     estado de una interfaz o del diálogo (visto, tocado a mano,
 *                modo), no un hecho de la casa: Lola no tiene por qué leerla.
 *                Si acompaña a otro dato («lo tocó la familia»), `de` lo nombra:
 *                con el sobre pasa a ser su `origen`.
 *      historial solo se añade (menús hechos, tickets, lo que descontó la
 *                despensa); vive en una tabla con fecha y poda.
 *  - estado (ESTADOS): la deuda de dónde vive hoy; el inventario la cuenta.
 *      activo    se guarda donde toca por ahora.
 *      copia     un derivado que además se guarda en data (sale de la clase:
 *                no se declara); se mantiene a mano y puede desfasarse.
 *      legado    lo sustituyó otro (`de`, si lo hay) y solo se lee de respaldo
 *                o ya no se lee; `motivo` dice por qué sigue.
 *  - tipo (TIPOS): los de registroCampos.js más tres sin tabular (objeto, mapa,
 *    lista), que el inventario cuenta: cuantos menos, más se puede contar.
 *  - otros: el dato que guarda lo que no está en la lista cerrada (la vía
 *    «otro» del modelo cerrado): kitchenTools → customKitchenTools.
 *  - vive: "data" o la tabla propia donde vive de verdad ("tabla:user_menus").
 *
 * Las columnas del eje (specs/plan-fichas-con-estado.md, trozo 5), las mismas
 * para todo dato; la 0105 las llevará a registro_campo:
 *  - ficha (FICHAS, vocabularios.js): la ficha del plan a la que pertenece. Un
 *    tema que cae entero en una ficha la da por defecto (FICHA_DEL_TEMA); en los
 *    repartidos cada dato la declara, y a un activo sin ficha lo cuenta el
 *    inventario como error.
 *  - defecto: el valor cuando nadie ha dicho nada (origen por_defecto); null si
 *    no lo hay. El inventario comprueba que cuadra con INITIAL_DATA (App.jsx).
 *  - suposicion: si el sistema puede dar por buena una inferencia. La salud,
 *    nunca: una alergia inferida se pregunta (wizardRegistry.js lo lee).
 *  - minimo_para_generar: sin él no se genera, se pregunta (decisión B).
 *  - caduca_dias: cuánto vive la pregunta abierta sobre el dato (lo que ya era
 *    registro_campo.caduca_dias, que lee registroTareas.js); null = el de su tipo.
 *  - peso_menu: cuánto cambia el menú; es el orden de las preguntas del
 *    asistente (wizardRegistry.js lo lee). null = sin pesar.
 *  - politica (POLITICAS), seguridad, aplica (APLICA), columna, minimo, maximo:
 *    las columnas de registro_campo (0097), que registroCampos.js proyecta de
 *    aquí para los datos con `campo`.
 *  - escribe (ESCRITORES): la familia, el sistema o ambos; por defecto la
 *    familia en los hechos activos y el sistema en lo demás (derivados,
 *    marcas, historiales y legados).
 *  - choque (CHOQUES): si dos escrituras chocan, el último gana, el más
 *    restrictivo (salud) o se suman (señales).
 *
 * Los lectores no se escriben aquí: los busca el inventario en el código, para
 * que no se queden viejos.
 */
import { ESCRITOR, CHOQUE, CLASE } from "./vocabularios.js";

/** Las entidades de la ficha, con los campos de la forja (Fábrica, entities.json: REQUIRED_FIELDS). */
export const ENTIDADES = Object.freeze({
  casa: {
    id: "household", name: "Casa", scope: "vertical", term: "casa",
    source_of_truth: "src/lib/registroFicha.js",
    readers: ["api/_bot/ficha.js", "src/lib/prepararGeneracion.js"],
    nota: "En la base, household_state.state.data (un JSON por casa) y la tabla households.",
  },
  persona: {
    id: "person", name: "Persona de la casa", scope: "vertical", term: "persona de la casa",
    source_of_truth: "src/lib/registroFicha.js",
    readers: ["api/_bot/ficha.js", "src/lib/personasTabla.js"],
    nota: "Vive en data.members y el trigger de 0089 la copia a la tabla persona (personasTabla.js es su gemelo en JS).",
  },
  grupo: {
    id: "group", name: "Grupo de comensales", scope: "vertical", term: "grupo",
    source_of_truth: "src/lib/registroFicha.js",
    readers: ["src/lib/groups.js", "api/_bot/presentes.js"],
    nota: "data.groups, copiado a las tablas grupo y grupo_persona por el mismo trigger.",
  },
  regla: {
    id: "house-rule", name: "Regla de la casa", scope: "vertical", term: "regla",
    source_of_truth: "src/lib/reglas.js",
    readers: ["src/lib/reglas.js", "api/_bot/ficha.js"],
    nota: "Lo que tiene nombre propio, fecha o excepción («el miércoles viene mi hermano»).",
  },
  menu: {
    id: "menu", name: "Menú", scope: "vertical", term: "menú",
    source_of_truth: "specs/menu-generation.md",
    readers: ["src/lib/menusSync.js", "api/_bot/menu.js"],
    nota: "El archivo vive en user_menus y user_menu_weeks; en data quedan el activo y la historia.",
  },
  despensa: {
    id: "pantry", name: "Despensa", scope: "vertical", term: "despensa",
    source_of_truth: "specs/modelo-datos.md",
    readers: ["src/lib/pantryDeltas.js", "api/_bot/despensa.js"],
    nota: "Las líneas viven en user_pantry; en data, cómo se usa y lo que se descontó.",
  },
  compra: {
    id: "shopping", name: "Compra y gasto", scope: "vertical", term: "compra",
    source_of_truth: "specs/shopping-list.md",
    readers: ["src/lib/priceHistory.js", "src/screens/Shopping.jsx"],
    nota: "Súper, presupuesto, precios y tickets.",
  },
  receta: {
    id: "own-recipe", name: "Receta de la casa", scope: "vertical", term: "receta",
    source_of_truth: "src/lib/userRecipesSync.js",
    readers: ["api/_bot/propias.js", "src/lib/recipeCollections.js"],
    nota: "Las propias, los votos, las carpetas y los descartes de la casa.",
  },
});

export const TEMAS = ["quien", "salud", "horario", "agenda", "gustos", "cocina", "despensa", "compra", "menus", "recetas", "cuenta"];
export const ESTADOS = ["activo", "copia", "legado"];
/** Los tipos que admite registro_campo (CHECK registro_campo_tipo_vocabulario de la 0097). */
export const TIPOS_CAMPO = ["enum", "lista_enum", "int", "decimal", "bool", "fecha", "ref", "texto"];
export const SIN_TABULAR = ["objeto", "mapa", "lista"];
export const TIPOS = [...TIPOS_CAMPO, ...SIN_TABULAR];
/** Cuándo se pregunta un dato (CHECK registro_campo_politica_vocabulario de la 0097). */
export const POLITICAS = ["nunca", "solo_si_lo_piden", "antes_de_usarlo", "de_pasada", "una_vez"];
/** A quién se le pregunta (CHECK registro_campo_aplica_vocabulario de la 0097). */
export const APLICA = ["todos", "bebe"];

/**
 * La ficha de un tema cuando el tema cae entero en una (plan, tabla de fichas).
 * `quien`, `cocina` y `cuenta` se reparten (persona/grupo/casa, casa/rutina,
 * casa/trato) y no están: sus datos declaran la suya.
 */
export const FICHA_DEL_TEMA = Object.freeze({
  salud: "persona", horario: "rutina", agenda: "regla", gustos: "gusto",
  despensa: "despensa", compra: "compra", menus: "semana", recetas: "receta",
});

/**
 * Las partes del producto (Pablo, 28 oct 2026): menú, recetas, compra (con
 * los precios), despensa y menú del cole, encima de la casa (quién es quién y
 * su salud), que las sirve a todas. Lo demás (Gente y las estadísticas) está
 * apagado: no guarda nada en data, así que aquí no tiene datos. En las partes
 * encendidas la app y Lola leen y escriben la misma fuente: el inventario
 * cuenta lo que solo nombra una de las dos (`lola_no_lo_ve`, `app_no_lo_ve`).
 */
export const MODULOS = ["casa", "menu", "cole", "recetas", "compra", "despensa"];

/** De qué parte es cada tema; un dato puede decir otra con `modulo`. */
export const MODULO_DEL_TEMA = Object.freeze({
  quien: "casa", salud: "casa", cuenta: "casa",
  horario: "menu", agenda: "menu", gustos: "menu", cocina: "menu", menus: "menu",
  despensa: "despensa", compra: "compra", recetas: "recetas",
});

export const moduloDe = (d) => d.modulo ?? MODULO_DEL_TEMA[d.tema];

const dato = (d) => {
  const clase = d.clase ?? CLASE.HECHO;
  // Un derivado que vive en data es una copia: la deuda sale de la clase (el inventario lo exige).
  const estado = d.estado ?? (clase === CLASE.DERIVADO && (d.vive ?? "data") === "data" ? "copia" : "activo");
  return {
    entidad: "casa", tema: null, clase, estado, tipo: null, vocabulario: null,
    campo: null, libreta: null, otros: null, de: null, funcion: null, motivo: null, vive: "data", modulo: null,
    ficha: FICHA_DEL_TEMA[d.tema] ?? null, defecto: null, suposicion: true, minimo_para_generar: false,
    caduca_dias: null, peso_menu: null, politica: null, seguridad: false, aplica: "todos", columna: null, minimo: null, maximo: null,
    escribe: clase === CLASE.HECHO && estado === "activo" ? ESCRITOR.FAMILIA : ESCRITOR.SISTEMA, choque: CHOQUE.ULTIMO_GANA,
    ...d,
  };
};

/** La salud nunca se supone y, en sus listas, añadir gana a quitar en el mismo minuto. */
const salud = { tema: "salud", suposicion: false };
const listaDeSalud = { ...salud, choque: CHOQUE.MAS_RESTRICTIVO };
/** Lo que solo apunta el sistema (contadores, avisos dados, alias aprendidos). */
const delSistema = { escribe: ESCRITOR.SISTEMA };
/** Lo que solo se añade (menús hechos, tickets, lo que descontó la despensa): tabla con fecha y poda (trozo 22). */
const historial = { clase: CLASE.HISTORIAL };
/** Se calcula de `de` con `funcion` («src/lib/fichero.js:nombre»); mientras viva en data es una copia. */
const derivado = (de, funcion) => ({ clase: CLASE.DERIVADO, de, funcion });
/** Una marca de pantalla; si acompaña a otro dato («lo tocó la familia»), `de` lo nombra. */
const marca = (de = null) => ({ clase: CLASE.MARCA, de });
/** La función que proyecta la libreta a sus copias en data (freqsPedidos, reparto, sesgos, cocinas, favoritos, excluidos). */
const LIBRETA_PROYECTADA = "src/lib/libretaEnData.js:dataConLibreta";

/** Los datos de la casa: las claves de household_state.state.data. */
export const DATOS_CASA = Object.freeze({
  // ── Quién ──
  members: dato({ entidad: "persona", tema: "quien", ficha: "persona", tipo: "lista", minimo_para_generar: true, peso_menu: 95 }),
  groups: dato({ entidad: "grupo", tema: "quien", ficha: "grupo", tipo: "lista" }),
  menuModel: dato({ tema: "quien", ficha: "casa", tipo: "enum", vocabulario: "modelo_menu", defecto: "same" }),
  rosters: dato({ entidad: "persona", tema: "quien", ficha: "persona", tipo: "lista", estado: "legado", de: "members", motivo: "desde el 8 oct 2026 la familia es una; las casas viejas los traen y no se copian" }),
  activeRosterId: dato({ entidad: "persona", tema: "quien", ficha: "persona", tipo: "ref", estado: "legado", de: "members", motivo: "va con rosters" }),

  // ── Salud ──
  customAllergies: dato({ entidad: "persona", ...listaDeSalud, tipo: "lista", estado: "activo", motivo: "la vía «otro» de las alergias de cada persona" }),
  allergiesReviewed: dato({ entidad: "persona", ...salud, tipo: "bool", ...derivado("members.alergiasRevisadas", "src/lib/alergiasBase.js:marcarRevisadas"), motivo: "resumen: todas las personas revisadas (alergiasBase.js)" }),
  alergiasSilencioRecordado: dato({ entidad: "persona", tema: "salud", tipo: "bool", ...delSistema, motivo: "si ya se le recordó a la casa que las alergias van por silencio (alergiasBase.js escribe true)" }),
  etapaBebe: dato({ ...salud, tipo: "enum", vocabulario: "etapa_bebe", campo: "etapaBebe", politica: "antes_de_usarlo", seguridad: true, aplica: "bebe", caduca_dias: 21 }),
  goals: dato({ tema: "salud", ficha: "gusto", tipo: "lista_enum", motivo: "ids de goalDefs; objetivos como «más legumbres» son gustos con postura" }),
  goalDefs: dato({ tema: "salud", ficha: "gusto", tipo: "lista", motivo: "el catálogo de objetivos de la casa, con los suyos propios" }),
  goalsByGroup: dato({ entidad: "grupo", tema: "salud", ficha: "gusto", tipo: "mapa" }),
  goalsManualByGroup: dato({ entidad: "grupo", tema: "salud", ficha: "gusto", tipo: "mapa", ...marca("goalsByGroup"), motivo: "si el usuario tocó a mano los objetivos del grupo" }),
  // El objetivo de calorías es un objetivo del menú, como goals: ficha Gusto (la ficha Persona lleva peso y altura).
  kcal: dato({ tema: "salud", ficha: "gusto", tipo: "int", defecto: 2000 }),
  kcalByGroup: dato({ entidad: "grupo", tema: "salud", ficha: "gusto", tipo: "mapa" }),

  // ── Horario: qué comidas, cuándo y dónde ──
  meals: dato({ tema: "horario", tipo: "lista_enum", vocabulario: "comidas", defecto: ["Comida", "Cena"], peso_menu: 85 }),
  extraMeals: dato({ tema: "horario", tipo: "objeto", motivo: "desayuno, merienda y postre fuera del menú" }),
  schedule: dato({ tema: "horario", tipo: "mapa", vocabulario: "donde_come", motivo: "quién come dónde cada día" }),
  slotType: dato({ tema: "horario", tipo: "mapa" }),
  manualSlotType: dato({ tema: "horario", tipo: "mapa", ...marca("slotType"), motivo: "los huecos que el usuario tocó a mano; el motor la lee (prepararGeneracion.js) para no simplificarlos" }),
  mealStructure: dato({ tema: "horario", tipo: "enum", vocabulario: "estructura_platos", defecto: "primero_segundo", peso_menu: 55 }),
  mealStructureCena: dato({ tema: "horario", tipo: "enum", vocabulario: "estructura_platos", defecto: "1_plato" }),
  mealStructureByGroup: dato({ entidad: "grupo", tema: "horario", tipo: "mapa", vocabulario: "estructura_platos" }),
  mealStructureCenaByGroup: dato({ entidad: "grupo", tema: "horario", tipo: "mapa", vocabulario: "estructura_platos" }),
  mealStyleByGroup: dato({ entidad: "grupo", tema: "horario", tipo: "mapa" }),
  menuWeekOffsets: dato({ tema: "horario", tipo: "lista", defecto: [0] }),
  menuWeek: dato({ tema: "horario", tipo: "objeto", ...derivado("menuWeekOffsets", "src/lib/semanaDias.js:aplicarDiasDeSemana"), motivo: "siempre el primero de menuWeekOffsets" }),
  menuWeekDays: dato({ tema: "horario", tipo: "mapa", minimo_para_generar: true, motivo: "los días que se planifican, por semana; menuWeekOffsets y menuWeek se derivan de aquí (semanaDias.js)" }),
  menuScheduleSameForAllWeeks: dato({ tema: "horario", tipo: "bool", defecto: true }),
  menuWeekOverrides: dato({ tema: "horario", ficha: "semana", tipo: "mapa", motivo: "el horario propio de una semana es de la semana, no de la rutina (plan, trozo 18)" }),
  kidDinnerConfig: dato({ entidad: "grupo", tema: "horario", modulo: "cole", tipo: "objeto", peso_menu: 80 }),
  kidDinnerMatchesAdultLunch: dato({ entidad: "grupo", tema: "horario", modulo: "cole", tipo: "bool", ...derivado("kidDinnerConfig", "src/lib/kidsMenu.js:deriveKidDinnerMatchesAdultLunch"), motivo: "el motor del espejo lo lee; la verdad es kidDinnerConfig (kidsMenu.js)" }),
  schoolMenus: dato({ tema: "horario", modulo: "cole", tipo: "objeto", peso_menu: 98, motivo: "el menú del cole, común y por niño" }),

  // ── Agenda: lo que tiene fecha o nombre propio ──
  reglas: dato({ entidad: "regla", tema: "agenda", tipo: "lista" }),

  // ── Gustos: la libreta y sus proyecciones ──
  notepad: dato({ tema: "gustos", tipo: "objeto", escribe: ESCRITOR.AMBOS, motivo: "la libreta: manda sobre sus proyecciones" }),
  freqs: dato({ tema: "gustos", tipo: "mapa", libreta: "freqs", escribe: ESCRITOR.AMBOS }),
  freqsByGroup: dato({ entidad: "grupo", tema: "gustos", tipo: "mapa", libreta: "freqs", escribe: ESCRITOR.AMBOS }),
  freqsPedidos: dato({ tema: "gustos", tipo: "mapa", ...derivado("notepad", LIBRETA_PROYECTADA), libreta: "freqs" }),
  reparto: dato({ tema: "gustos", tipo: "mapa", ...derivado("notepad", LIBRETA_PROYECTADA), libreta: "reparto", peso_menu: 70 }),
  sesgos: dato({ tema: "gustos", tipo: "objeto", ...derivado("notepad", LIBRETA_PROYECTADA), libreta: "base", peso_menu: 45, motivo: "también técnica y salsa (libretaEnData.js)" }),
  cocinas: dato({ tema: "gustos", tipo: "mapa", ...derivado("notepad", LIBRETA_PROYECTADA), libreta: "cocina", peso_menu: 60 }),
  favoritos: dato({ tema: "gustos", tipo: "lista", ...derivado("notepad", LIBRETA_PROYECTADA), libreta: "favoritos" }),
  excluidos: dato({ tema: "gustos", tipo: "lista", ...derivado("notepad", LIBRETA_PROYECTADA), libreta: "excluidos" }),
  fixedDishes: dato({ tema: "gustos", tipo: "lista", motivo: "platos fijos de un día" }),
  dislikes: dato({ tema: "gustos", tipo: "lista", estado: "legado", de: "members.dislikes", motivo: "herencia; nadie escribe ya un valor de verdad (vetos.js)" }),
  customDislikes: dato({ tema: "gustos", tipo: "lista", estado: "legado", de: "members.dislikes" }),

  // ── Cocina ──
  cookLevel: dato({ tema: "cocina", ficha: "casa", tipo: "enum", vocabulario: "nivel_cocina", defecto: "normal", peso_menu: 35 }),
  cookLevelManual: dato({ tema: "cocina", ficha: "casa", tipo: "bool", ...marca("cookLevel"), motivo: "si el nivel lo puso el usuario y no el asistente; el motor la lee (prepararGeneracion.js)" }),
  cookSkills: dato({ tema: "cocina", ficha: "casa", tipo: "lista", estado: "legado", motivo: "nadie lo escribe ni lo lee: App.jsx solo lo sanea" }),
  kitchenTools: dato({ tema: "cocina", ficha: "casa", tipo: "lista_enum", vocabulario: "aparatos", otros: "customKitchenTools", peso_menu: 30 }),
  customKitchenTools: dato({ tema: "cocina", ficha: "casa", tipo: "lista", motivo: "la vía «otro» de kitchenTools" }),
  cookTime: dato({ tema: "cocina", ficha: "rutina", tipo: "objeto", peso_menu: 40, motivo: "minutos por día y comida" }),
  timeWeekday: dato({ tema: "cocina", ficha: "rutina", tipo: "int", estado: "legado", de: "cookTime", motivo: "respaldo de cookTime en cookTime.js" }),
  timeWeekend: dato({ tema: "cocina", ficha: "rutina", tipo: "int", estado: "legado", de: "cookTime", motivo: "respaldo de cookTime en cookTime.js" }),
  tanda: dato({ tema: "cocina", ficha: "rutina", tipo: "mapa", libreta: "tanda" }),
  tandaPlatos: dato({ tema: "cocina", ficha: "rutina", tipo: "mapa", libreta: "tandaPlatos" }),
  tandaMinutos: dato({ tema: "cocina", ficha: "rutina", tipo: "int" }),
  diaTanda: dato({ tema: "cocina", ficha: "rutina", tipo: "enum", vocabulario: "dias", motivo: "el día en que se cocina la tanda; sin él, el domingo" }),
  garnishRepeat: dato({ tema: "cocina", ficha: "casa", tipo: "enum", estado: "legado", motivo: "el motor ya no lo lee (aiPlanner.js); la app solo lo sanea" }),

  // ── Despensa ──
  pantryMode: dato({ entidad: "despensa", tema: "despensa", ficha: "casa", tipo: "enum", defecto: "only", peso_menu: 10, motivo: "cómo usa la casa su despensa es de la casa (plan, ficha Casa)" }),
  useHomeStock: dato({ entidad: "despensa", tema: "despensa", tipo: "bool", ...derivado("pantryMode", null), motivo: "booleano viejo que se mantiene a la par; sin función: `pantryMode !== \"off\"` repetido en App.jsx, Onboarding.jsx y ajustes.js (deuda sin_declarar)" }),
  pantryModeSet: dato({ entidad: "despensa", tema: "despensa", tipo: "bool", ...marca("pantryMode"), motivo: "si el modo lo eligió la familia; App.jsx respeta un «off» elegido" }),
  pantryHasItems: dato({ entidad: "despensa", tema: "despensa", tipo: "bool", ...marca(), motivo: "respuesta del asistente («¿tienes algo en casa?») que decide si se salta el paso de la despensa" }),
  pantryPrefs: dato({ entidad: "despensa", tema: "despensa", tipo: "objeto" }),
  pantryPrefsSet: dato({ entidad: "despensa", tema: "despensa", tipo: "bool", ...marca("pantryPrefs") }),
  pantryPrefsSeen: dato({ entidad: "despensa", tema: "despensa", tipo: "bool", ...marca() }),
  pantryGenDeltas: dato({ entidad: "despensa", tema: "despensa", tipo: "mapa", ...historial }),
  pantryDayDeltas: dato({ entidad: "despensa", tema: "despensa", tipo: "mapa", ...historial }),
  pantryEndOfDaySince: dato({ entidad: "despensa", tema: "despensa", tipo: "fecha", ...delSistema }),
  cookedDeltas: dato({ entidad: "despensa", tema: "despensa", tipo: "mapa", ...historial }),

  // ── Compra y gasto ──
  supermarkets: dato({ entidad: "compra", tema: "compra", ficha: "casa", tipo: "lista" }),
  hasBudget: dato({ entidad: "compra", tema: "compra", ficha: "casa", tipo: "bool", defecto: false }),
  budget: dato({ entidad: "compra", tema: "compra", ficha: "casa", tipo: "int", defecto: 80, peso_menu: 20 }),
  wantsPriceEstimates: dato({ entidad: "compra", tema: "compra", ficha: "casa", tipo: "bool", defecto: false }),
  priceObs: dato({ entidad: "compra", tema: "compra", tipo: "lista", ...historial }),
  priceAliases: dato({ entidad: "compra", tema: "compra", tipo: "mapa", ...delSistema }),
  receipts: dato({ entidad: "compra", tema: "compra", tipo: "lista", ...historial, motivo: "los tickets que sube la familia" }),

  // ── Menús ──
  menus: dato({ entidad: "menu", tema: "menus", tipo: "mapa", vive: "tabla:user_menus" }),
  activeMenuId: dato({ entidad: "menu", tema: "menus", tipo: "ref" }),
  menuHistory: dato({ entidad: "menu", tema: "menus", tipo: "lista", ...historial, motivo: "la racha y el contador de menús" }),
  menuVarietyPref: dato({ entidad: "menu", tema: "menus", ficha: "casa", tipo: "enum", defecto: "strict", motivo: "cuánta repetición admite la casa en todos sus menús: de la casa, como el modelo de menú, no de una semana" }),
  cookedDishes: dato({ entidad: "menu", tema: "menus", tipo: "mapa", ...historial }),

  // ── Recetas de la casa ──
  userRecipes: dato({ entidad: "receta", tema: "recetas", tipo: "lista", vive: "tabla:user_recipes" }),
  recipeVotes: dato({ entidad: "receta", tema: "recetas", tipo: "mapa", vive: "tabla:recipe_votes" }),
  discards: dato({ entidad: "receta", tema: "recetas", tipo: "objeto", vive: "tabla:household_recipe_discards" }),
  recipeCollections: dato({ entidad: "receta", tema: "recetas", tipo: "mapa", vocabulario: "carpetas_fijas" }),
  recipeFolders: dato({ entidad: "receta", tema: "recetas", tipo: "lista" }),

  // ── Cuenta y app ──
  accountMemberIdByUser: dato({ entidad: "persona", tema: "cuenta", ficha: "casa", tipo: "mapa", motivo: "quién soy por cuenta es de la casa (plan, ficha Casa)" }),
  accountMemberId: dato({ entidad: "persona", tema: "cuenta", ficha: "casa", tipo: "ref", estado: "legado", de: "accountMemberIdByUser", motivo: "compartido por titular y cotitular, que se pisaban; queda de respaldo (stages.js)" }),
  profilePhoto: dato({ tema: "cuenta", ficha: "casa", tipo: "texto", motivo: "vive en el documento de la casa y la comparten sus cuentas: es la foto de la casa (HomeProfileScreen.jsx)" }),
  expertMode: dato({ tema: "cuenta", ficha: "casa", tipo: "bool", ...marca() }),
  modePrompted: dato({ tema: "cuenta", ficha: "casa", tipo: "bool", ...marca() }),
});

/** Los datos de una persona: las claves de cada elemento de data.members. */
export const DATOS_PERSONA = Object.freeze(Object.fromEntries(Object.entries({
  id: dato({ tema: "quien", tipo: "ref" }),
  name: dato({ tema: "quien", tipo: "texto" }),
  homeRole: dato({ tema: "quien", tipo: "enum", motivo: "con «Otro» como vía abierta" }),
  age: dato({ tema: "quien", tipo: "int", campo: "edad", politica: "nunca", minimo: 0, maximo: 120, columna: "persona.edad" }),
  birthDate: dato({ tema: "quien", tipo: "fecha", campo: "nacimiento", politica: "nunca", columna: "persona.fecha_nacimiento" }),
  useBirthDate: dato({ tema: "quien", tipo: "bool", ...marca("members.birthDate"), motivo: "si la edad sale de la fecha; la leen stages.js y la tabla persona (usa_fecha_nacimiento)" }),
  stageDetail: dato({ tema: "quien", tipo: "texto", estado: "legado", motivo: "vacío en todas las personas guardadas" }),
  notBaby: dato({ tema: "quien", tipo: "bool", motivo: "corrige la etapa que se deduce de la edad" }),
  allergies: dato({ ...listaDeSalud, tipo: "lista_enum", vocabulario: "alergenos", campo: "alergias", otros: "customAllergies", politica: "una_vez", seguridad: true, columna: "persona_alergia", caduca_dias: 30, minimo_para_generar: true, peso_menu: 90 }),
  alergiasRevisadas: dato({ ...salud, tipo: "bool" }),
  intolerances: dato({ ...listaDeSalud, tipo: "lista_enum" }),
  dietaryStates: dato({ ...listaDeSalud, tipo: "lista_enum" }),
  dietaryStatesMeta: dato({ ...salud, tipo: "mapa" }),
  healthProfiles: dato({ ...listaDeSalud, tipo: "lista_enum" }),
  healthProfile: dato({ ...salud, tipo: "enum", estado: "legado", de: "healthProfiles", motivo: "el singular de antes; personasTabla.js lo junta con la lista" }),
  pesoKg: dato({ ...salud, tipo: "decimal" }),
  alturaCm: dato({ ...salud, tipo: "int" }),
  dislikes: dato({ tema: "gustos", tipo: "lista" }),
  // Avatar y color son hechos de la ficha Persona (plan: «nombre, rol, nacimiento, avatar, color»), no marcas.
  profileKey: dato({ tema: "cuenta", tipo: "texto", motivo: "la ilustración del perfil" }),
  avatarKey: dato({ tema: "cuenta", tipo: "texto", motivo: "la ilustración del avatar" }),
  color: dato({ tema: "cuenta", tipo: "texto" }),
  // Campos de la ficha v18 (0097) que no viven en data.members: su valor va en
  // sobre.valor (0 filas hoy) y nunca se preguntan; están aquí porque
  // registro_campo se proyecta de este registro (registroCampos.js).
  sexo: dato({ tema: "quien", tipo: "enum", vocabulario: "sexo", campo: "sexo", politica: "nunca", vive: "tabla:sobre", motivo: "solo para calorías" }),
  colegio: dato({ tema: "quien", tipo: "texto", campo: "colegio", politica: "nunca", vive: "tabla:sobre" }),
  patronSemanas: dato({ tema: "quien", tipo: "enum", vocabulario: "patron_semanas", campo: "patronSemanas", politica: "nunca", vive: "tabla:sobre", motivo: "custodia: semanas alternas" }),
  // Lo de la persona que no es salud ni gusto (quién es, avatar, color) es de su ficha.
}).map(([k, v]) => [k, { ...v, entidad: "persona", ficha: v.ficha ?? "persona" }])));

/**
 * El dato de una clave tal como la escriben capacidades.js, wizardRegistry.js y
 * los `de`/`otros` de arriba: «members.x» es de la persona; lo demás, de la
 * casa. null si no existe: quien lo llama decide si es error.
 */
export function datoDe(clave) {
  const [raiz, sub] = String(clave ?? "").split(".");
  if (sub) return raiz === "members" ? DATOS_PERSONA[sub] ?? null : null;
  return DATOS_CASA[raiz] ?? null;
}
