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
 *  - estado (ESTADOS):
 *      activo    un hecho de la casa con lector.
 *      copia     se deriva de otro dato (`de`); se mantiene a mano y puede
 *                desfasarse. Cuenta hasta que se calcule al leer.
 *      legado    lo sustituyó otro (`de`, si lo hay) y solo se lee de respaldo
 *                o ya no se lee; `motivo` dice por qué sigue.
 *      interfaz  una marca de la app (visto, tocado a mano, modo), no un
 *                hecho de la casa: Lola no tiene por qué leerla.
 *  - tipo (TIPOS): los de registroCampos.js más tres sin tabular (objeto, mapa,
 *    lista), que el inventario cuenta: cuantos menos, más se puede contar.
 *  - otros: el dato que guarda lo que no está en la lista cerrada (la vía
 *    «otro» del modelo cerrado): kitchenTools → customKitchenTools.
 *  - vive: "data" o la tabla propia donde vive de verdad ("tabla:user_menus").
 *
 * Los lectores no se escriben aquí: los busca el inventario en el código, para
 * que no se queden viejos.
 */

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
export const ESTADOS = ["activo", "copia", "legado", "interfaz"];
export const TIPOS = ["enum", "lista_enum", "int", "decimal", "bool", "fecha", "ref", "texto", "objeto", "mapa", "lista"];
export const SIN_TABULAR = ["objeto", "mapa", "lista"];

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

const dato = (d) => ({
  entidad: "casa", tema: null, estado: "activo", tipo: null, vocabulario: null,
  campo: null, libreta: null, otros: null, de: null, motivo: null, vive: "data", modulo: null,
  ...d,
});

/** Los datos de la casa: las claves de household_state.state.data. */
export const DATOS_CASA = Object.freeze({
  // ── Quién ──
  members: dato({ entidad: "persona", tema: "quien", tipo: "lista" }),
  groups: dato({ entidad: "grupo", tema: "quien", tipo: "lista" }),
  menuModel: dato({ tema: "quien", tipo: "enum", vocabulario: "modelo_menu" }),
  rosters: dato({ entidad: "persona", tema: "quien", tipo: "lista", estado: "legado", de: "members", motivo: "desde el 8 oct 2026 la familia es una; las casas viejas los traen y no se copian" }),
  activeRosterId: dato({ entidad: "persona", tema: "quien", tipo: "ref", estado: "legado", de: "members", motivo: "va con rosters" }),

  // ── Salud ──
  customAllergies: dato({ entidad: "persona", tema: "salud", tipo: "lista", estado: "activo", motivo: "la vía «otro» de las alergias de cada persona" }),
  allergiesReviewed: dato({ entidad: "persona", tema: "salud", tipo: "bool", estado: "copia", de: "members.alergiasRevisadas", motivo: "resumen: todas las personas revisadas (alergiasBase.js)" }),
  alergiasSilencioRecordado: dato({ entidad: "persona", tema: "salud", tipo: "fecha", motivo: "cuándo se le recordó a la casa que las alergias van por silencio" }),
  etapaBebe: dato({ tema: "salud", tipo: "enum", vocabulario: "etapa_bebe", campo: "etapaBebe" }),
  goals: dato({ tema: "salud", tipo: "lista_enum", motivo: "ids de goalDefs" }),
  goalDefs: dato({ tema: "salud", tipo: "lista", motivo: "el catálogo de objetivos de la casa, con los suyos propios" }),
  goalsByGroup: dato({ entidad: "grupo", tema: "salud", tipo: "mapa" }),
  goalsManualByGroup: dato({ entidad: "grupo", tema: "salud", tipo: "mapa", estado: "interfaz", motivo: "si el usuario tocó a mano los objetivos del grupo" }),
  kcal: dato({ tema: "salud", tipo: "int" }),
  kcalByGroup: dato({ entidad: "grupo", tema: "salud", tipo: "mapa" }),

  // ── Horario: qué comidas, cuándo y dónde ──
  meals: dato({ tema: "horario", tipo: "lista_enum", vocabulario: "comidas" }),
  extraMeals: dato({ tema: "horario", tipo: "objeto", motivo: "desayuno, merienda y postre fuera del menú" }),
  schedule: dato({ tema: "horario", tipo: "mapa", vocabulario: "donde_come", motivo: "quién come dónde cada día" }),
  slotType: dato({ tema: "horario", tipo: "mapa" }),
  manualSlotType: dato({ tema: "horario", tipo: "mapa", estado: "interfaz", motivo: "los huecos que el usuario tocó a mano" }),
  mealStructure: dato({ tema: "horario", tipo: "enum", vocabulario: "estructura_platos" }),
  mealStructureCena: dato({ tema: "horario", tipo: "enum", vocabulario: "estructura_platos" }),
  mealStructureByGroup: dato({ entidad: "grupo", tema: "horario", tipo: "mapa", vocabulario: "estructura_platos" }),
  mealStructureCenaByGroup: dato({ entidad: "grupo", tema: "horario", tipo: "mapa", vocabulario: "estructura_platos" }),
  mealStyleByGroup: dato({ entidad: "grupo", tema: "horario", tipo: "mapa" }),
  menuWeekOffsets: dato({ tema: "horario", tipo: "lista" }),
  menuWeek: dato({ tema: "horario", tipo: "objeto", estado: "copia", de: "menuWeekOffsets", motivo: "siempre el primero de menuWeekOffsets" }),
  menuWeekDays: dato({ tema: "horario", tipo: "mapa" }),
  menuScheduleSameForAllWeeks: dato({ tema: "horario", tipo: "bool" }),
  menuWeekOverrides: dato({ tema: "horario", tipo: "mapa" }),
  kidDinnerConfig: dato({ entidad: "grupo", tema: "horario", modulo: "cole", tipo: "objeto" }),
  kidDinnerMatchesAdultLunch: dato({ entidad: "grupo", tema: "horario", modulo: "cole", tipo: "bool", estado: "copia", de: "kidDinnerConfig", motivo: "el motor del espejo lo lee; la verdad es kidDinnerConfig (kidsMenu.js)" }),
  schoolMenus: dato({ tema: "horario", modulo: "cole", tipo: "objeto", motivo: "el menú del cole, común y por niño" }),

  // ── Agenda: lo que tiene fecha o nombre propio ──
  reglas: dato({ entidad: "regla", tema: "agenda", tipo: "lista" }),

  // ── Gustos: la libreta y sus proyecciones ──
  notepad: dato({ tema: "gustos", tipo: "objeto", motivo: "la libreta: manda sobre sus proyecciones" }),
  freqs: dato({ tema: "gustos", tipo: "mapa", libreta: "freqs" }),
  freqsByGroup: dato({ entidad: "grupo", tema: "gustos", tipo: "mapa", libreta: "freqs" }),
  freqsPedidos: dato({ tema: "gustos", tipo: "mapa", estado: "copia", de: "notepad", libreta: "freqs" }),
  reparto: dato({ tema: "gustos", tipo: "mapa", estado: "copia", de: "notepad", libreta: "reparto" }),
  sesgos: dato({ tema: "gustos", tipo: "objeto", estado: "copia", de: "notepad", libreta: "base" }),
  cocinas: dato({ tema: "gustos", tipo: "mapa", estado: "copia", de: "notepad", libreta: "cocina" }),
  favoritos: dato({ tema: "gustos", tipo: "lista", estado: "copia", de: "notepad", libreta: "favoritos" }),
  excluidos: dato({ tema: "gustos", tipo: "lista", estado: "copia", de: "notepad", libreta: "excluidos" }),
  fixedDishes: dato({ tema: "gustos", tipo: "lista", motivo: "platos fijos de un día" }),
  dislikes: dato({ tema: "gustos", tipo: "lista", estado: "legado", de: "members.dislikes", motivo: "herencia; nadie escribe ya un valor de verdad (vetos.js)" }),
  customDislikes: dato({ tema: "gustos", tipo: "lista", estado: "legado", de: "members.dislikes" }),

  // ── Cocina ──
  cookLevel: dato({ tema: "cocina", tipo: "enum", vocabulario: "nivel_cocina" }),
  cookLevelManual: dato({ tema: "cocina", tipo: "bool", estado: "interfaz", motivo: "si el nivel lo puso el usuario y no el asistente" }),
  cookSkills: dato({ tema: "cocina", tipo: "lista", estado: "legado", motivo: "nadie lo escribe ni lo lee: App.jsx solo lo sanea" }),
  kitchenTools: dato({ tema: "cocina", tipo: "lista_enum", vocabulario: "aparatos", otros: "customKitchenTools" }),
  customKitchenTools: dato({ tema: "cocina", tipo: "lista", motivo: "la vía «otro» de kitchenTools" }),
  cookTime: dato({ tema: "cocina", tipo: "objeto", motivo: "minutos por día y comida" }),
  timeWeekday: dato({ tema: "cocina", tipo: "int", estado: "legado", de: "cookTime", motivo: "respaldo de cookTime en cookTime.js" }),
  timeWeekend: dato({ tema: "cocina", tipo: "int", estado: "legado", de: "cookTime", motivo: "respaldo de cookTime en cookTime.js" }),
  tanda: dato({ tema: "cocina", tipo: "mapa", libreta: "tanda" }),
  tandaPlatos: dato({ tema: "cocina", tipo: "mapa", libreta: "tandaPlatos" }),
  tandaMinutos: dato({ tema: "cocina", tipo: "int" }),
  garnishRepeat: dato({ tema: "cocina", tipo: "enum", estado: "legado", motivo: "el motor ya no lo lee (aiPlanner.js); la app solo lo sanea" }),

  // ── Despensa ──
  pantryMode: dato({ entidad: "despensa", tema: "despensa", tipo: "enum" }),
  useHomeStock: dato({ entidad: "despensa", tema: "despensa", tipo: "bool", estado: "copia", de: "pantryMode", motivo: "booleano viejo que se mantiene a la par" }),
  pantryModeSet: dato({ entidad: "despensa", tema: "despensa", tipo: "bool", estado: "interfaz" }),
  pantryHasItems: dato({ entidad: "despensa", tema: "despensa", tipo: "bool", estado: "interfaz", motivo: "respuesta del asistente: «¿tienes algo en casa?»" }),
  pantryPrefs: dato({ entidad: "despensa", tema: "despensa", tipo: "objeto" }),
  pantryPrefsSet: dato({ entidad: "despensa", tema: "despensa", tipo: "bool", estado: "interfaz" }),
  pantryPrefsSeen: dato({ entidad: "despensa", tema: "despensa", tipo: "bool", estado: "interfaz" }),
  pantryGenDeltas: dato({ entidad: "despensa", tema: "despensa", tipo: "mapa" }),
  pantryDayDeltas: dato({ entidad: "despensa", tema: "despensa", tipo: "mapa" }),
  pantryEndOfDaySince: dato({ entidad: "despensa", tema: "despensa", tipo: "fecha" }),
  cookedDeltas: dato({ entidad: "despensa", tema: "despensa", tipo: "mapa" }),

  // ── Compra y gasto ──
  supermarkets: dato({ entidad: "compra", tema: "compra", tipo: "lista" }),
  hasBudget: dato({ entidad: "compra", tema: "compra", tipo: "bool" }),
  budget: dato({ entidad: "compra", tema: "compra", tipo: "int" }),
  wantsPriceEstimates: dato({ entidad: "compra", tema: "compra", tipo: "bool" }),
  priceObs: dato({ entidad: "compra", tema: "compra", tipo: "lista" }),
  priceAliases: dato({ entidad: "compra", tema: "compra", tipo: "mapa" }),
  receipts: dato({ entidad: "compra", tema: "compra", tipo: "lista" }),

  // ── Menús ──
  menus: dato({ entidad: "menu", tema: "menus", tipo: "mapa", vive: "tabla:user_menus" }),
  activeMenuId: dato({ entidad: "menu", tema: "menus", tipo: "ref" }),
  menuHistory: dato({ entidad: "menu", tema: "menus", tipo: "lista", motivo: "la racha y el contador de menús" }),
  menuVarietyPref: dato({ entidad: "menu", tema: "menus", tipo: "enum" }),
  cookedDishes: dato({ entidad: "menu", tema: "menus", tipo: "mapa" }),

  // ── Recetas de la casa ──
  userRecipes: dato({ entidad: "receta", tema: "recetas", tipo: "lista", vive: "tabla:user_recipes" }),
  recipeVotes: dato({ entidad: "receta", tema: "recetas", tipo: "mapa", vive: "tabla:recipe_votes" }),
  discards: dato({ entidad: "receta", tema: "recetas", tipo: "objeto", vive: "tabla:household_recipe_discards" }),
  recipeCollections: dato({ entidad: "receta", tema: "recetas", tipo: "mapa", vocabulario: "carpetas_fijas" }),
  recipeFolders: dato({ entidad: "receta", tema: "recetas", tipo: "lista" }),

  // ── Cuenta y app ──
  accountMemberIdByUser: dato({ entidad: "persona", tema: "cuenta", tipo: "mapa" }),
  accountMemberId: dato({ entidad: "persona", tema: "cuenta", tipo: "ref", estado: "legado", de: "accountMemberIdByUser", motivo: "compartido por titular y cotitular, que se pisaban; queda de respaldo (stages.js)" }),
  profilePhoto: dato({ tema: "cuenta", tipo: "texto" }),
  expertMode: dato({ tema: "cuenta", tipo: "bool", estado: "interfaz" }),
  modePrompted: dato({ tema: "cuenta", tipo: "bool", estado: "interfaz" }),
});

/** Los datos de una persona: las claves de cada elemento de data.members. */
export const DATOS_PERSONA = Object.freeze(Object.fromEntries(Object.entries({
  id: dato({ tema: "quien", tipo: "ref" }),
  name: dato({ tema: "quien", tipo: "texto" }),
  homeRole: dato({ tema: "quien", tipo: "enum", motivo: "con «Otro» como vía abierta" }),
  age: dato({ tema: "quien", tipo: "int", campo: "edad" }),
  birthDate: dato({ tema: "quien", tipo: "fecha", campo: "nacimiento" }),
  useBirthDate: dato({ tema: "quien", tipo: "bool", estado: "interfaz", motivo: "si la edad sale de la fecha" }),
  stageDetail: dato({ tema: "quien", tipo: "texto", estado: "legado", motivo: "vacío en todas las personas guardadas" }),
  notBaby: dato({ tema: "quien", tipo: "bool", motivo: "corrige la etapa que se deduce de la edad" }),
  allergies: dato({ tema: "salud", tipo: "lista_enum", campo: "alergias", otros: "customAllergies" }),
  alergiasRevisadas: dato({ tema: "salud", tipo: "bool" }),
  intolerances: dato({ tema: "salud", tipo: "lista_enum" }),
  dietaryStates: dato({ tema: "salud", tipo: "lista_enum" }),
  dietaryStatesMeta: dato({ tema: "salud", tipo: "mapa" }),
  healthProfiles: dato({ tema: "salud", tipo: "lista_enum" }),
  healthProfile: dato({ tema: "salud", tipo: "enum", estado: "legado", de: "healthProfiles", motivo: "el singular de antes; personasTabla.js lo junta con la lista" }),
  pesoKg: dato({ tema: "salud", tipo: "decimal" }),
  alturaCm: dato({ tema: "salud", tipo: "int" }),
  dislikes: dato({ tema: "gustos", tipo: "lista" }),
  profileKey: dato({ tema: "cuenta", tipo: "texto", estado: "interfaz", motivo: "la ilustración del perfil" }),
  avatarKey: dato({ tema: "cuenta", tipo: "texto", estado: "interfaz", motivo: "la ilustración del avatar" }),
  color: dato({ tema: "cuenta", tipo: "texto", estado: "interfaz" }),
}).map(([k, v]) => [k, { ...v, entidad: "persona" }])));
