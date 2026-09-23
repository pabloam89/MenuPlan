/**
 * EL MODELO DE DATOS, DECLARADO.
 *
 * Qué tablas hay, de qué tipo es cada una, con qué clave se indexa, quién la
 * produce, cada cuánto cambia, quién la consume y qué cobertura tiene cada
 * campo. Hasta ahora esto se sabía leyendo veinte ficheros; aquí está en uno,
 * como dato, para que se pueda medir y para que se pueda mirar.
 *
 * ── Los tres planos ───────────────────────────────────────────────────────
 * Cada campo pertenece a UN plano y solo a uno. Mezclarlos es lo que hizo
 * que la primera versión del árbol de ingredientes tuviera "condimento" y
 * "verdura" como hermanos: uno es función, otro es identidad.
 *
 *   identidad   qué ES la cosa. Un árbol: cada nodo tiene un padre.
 *               (aisle, category, mainProtein, mainBase, cocina, tecnica)
 *   nutricion   qué APORTA, en continuo, por 100 g. Nunca categorías.
 *               (nutrition.*, kcal, protein_g...)
 *   funcion     qué PAPEL juega en el plato. Vive en la LÍNEA o en el PASO,
 *               no en el ingrediente: la patata es principal en la tortilla y
 *               guarnición con la merluza. (stepsRich[].part, type, mealRole)
 *   logistica   cómo se compra, cuenta, guarda y escala.
 *               (defaultUnit, pieza, baseServings, freezable, time)
 *   control     versionado y procedencia. (estrella, catalogVersion)
 *
 * ── Tipos de tabla ────────────────────────────────────────────────────────
 *   fuente      se edita (a mano o por script) y se commitea. Es la verdad.
 *   derivada    se CALCULA de una o más fuentes con un operador determinista.
 *               Si se materializa, lleva el hash de sus entradas y un test la
 *               marca caducada cuando la fuente cambia sin regenerarla.
 *   externa     viene de fuera (BEDCA, Mercadona) por un pipeline con
 *               revisión. Nunca se estima a mano: sin dato es sin dato.
 *   salida      lo que se pinta o se guarda para el usuario. No se edita.
 *
 * ── Frecuencia de actualización ───────────────────────────────────────────
 *   release     cambia cuando entra una tanda de recetas o una corrección.
 *               Sube BUNDLED_CATALOG_VERSION.
 *   pipeline    cambia cuando se corre su pipeline externo con revisión.
 *   llm         la escribió un modelo en una pasada con contrato y ledger
 *               (scripts/enrich-recipe-steps.mjs). Re-etiquetable.
 *   build       se regenera con `npm run build:derived` y se commitea.
 *   carga       se calcula al cargar el catálogo en memoria, no se guarda.
 *   runtime     se calcula por petición.
 *
 * ── Cobertura ─────────────────────────────────────────────────────────────
 * `cobertura_min` es el SUELO medido el día que se declaró, redondeado a la
 * baja. model.test.js mide la real y falla si baja: la cobertura de un campo
 * solo puede subir. No es un objetivo, es un trinquete. El objetivo, cuando
 * lo hay, va en `objetivo` con la razón.
 */

export const PLANOS = ["identidad", "nutricion", "funcion", "logistica", "control"];
export const TIPOS_TABLA = ["fuente", "derivada", "externa", "salida"];
export const FRECUENCIAS = ["release", "pipeline", "llm", "build", "carga", "runtime"];

export const TABLAS = [
  // ── FUENTES ───────────────────────────────────────────────────────────────
  {
    id: "alimentos",
    tipo: "fuente",
    ruta: "src/data/alimentos.json",
    clave: "id",
    actualizacion: "pipeline",
    procedencia: "LA TABLA MAESTRA del embudo de alimentos. BEDCA/CIQUAL/USDA entran por sus "
      + "decisiones curadas y desembocan aquí; el número y su procedencia viven juntos. Hasta el "
      + "22 sep 2026 la nutrición se copiaba de `ingredientes` y la copia que leía la app era "
      + "justo la que no llevaba procedencia.",
    productor: ["scripts/build-alimentos.mjs"],
    consumidores: [
      "src/lib/ingredients.js (via derived/alimentosApp.json)",
      "src/lib/derive/composicion.js",
      "src/lib/derive/masaServida.js",
      "scripts/audit-catalog.mjs",
    ],
    esquema: "src/data/alimentoSchema.js",
    campos: [
      { campo: "id", plano: "identidad", cobertura_min: 100 },
      { campo: "nutricion", plano: "nutricion", cobertura_min: 96, nota: "377 de 391. Los 14 sin ficha están declarados, no escondidos" },
      { campo: "fuente", plano: "control", cobertura_min: 96, nota: "bedca | ciqual | usda | heredado | sin_fuente" },
      { campo: "fuenteId", plano: "control", cobertura_min: 96 },
      { campo: "via", plano: "control", cobertura_min: 96, nota: "CON QUÉ AUTORIDAD se eligió la ficha. `macros` = nadie la eligió: coincidencia de los 4 macros duros. Son 76 de 377" },
      { campo: "motivo", plano: "control", cobertura_min: 76, nota: "solo lo llevan las decisiones humanas; la vía `macros` no tiene ninguno que dar" },
      { campo: "familia", plano: "identidad", cobertura_min: 100 },
      { campo: "rol", plano: "identidad", cobertura_min: 100 },
      { campo: "taxonomia", plano: "identidad", cobertura_min: 100 },
      { campo: "densidad", plano: "logistica", cobertura_min: 4, nota: "solo los que se apartan de 1 g/ml; ausente NO es hueco" },
      { campo: "fraccionComestible", plano: "logistica", cobertura_min: 14, nota: "solo los que descartan algo; ausente = se come todo" },
    ],
  },
  {
    id: "ingredientes",
    tipo: "fuente",
    ruta: "src/data/ingredients.json",
    clave: "id",
    actualizacion: "release",
    procedencia: "curado a mano. La NUTRICIÓN ya no vive aquí: es de la tabla `alimentos` (22 sep 2026)",
    productor: ["scripts/build-ingredient-catalog.mjs (desarmado: el fichero es fuente)"],
    consumidores: ["src/lib/ingredients.js", "src/lib/kitchenUnits.js (via registerPieceCatalog)", "src/lib/shoppingBuilder.js", "scripts/audit-catalog.mjs"],
    esquema: "src/data/ingredientSchema.js",
    campos: [
      { campo: "id", plano: "identidad", cobertura_min: 100 },
      { campo: "name", plano: "identidad", cobertura_min: 100 },
      { campo: "aliases", plano: "identidad", cobertura_min: 46, nota: "vacío = sin variantes en el catálogo, no es hueco" },
      { campo: "aisle", plano: "identidad", cobertura_min: 100, nota: "el nodo de identidad más usado: pasillo del súper" },
      { campo: "category", plano: "identidad", cobertura_min: 100 },
      { campo: "allergens", plano: "identidad", cobertura_min: 38, nota: "vacío = sin alérgeno; el cruce con las recetas da 0 falsos vacíos" },
      { campo: "cookingAllergens", plano: "identidad", cobertura_min: 2 },
      { campo: "conflictsWith", plano: "identidad", cobertura_min: 5 },
      { campo: "isVegetarian", plano: "identidad", cobertura_min: 100 },
      { campo: "isVegan", plano: "identidad", cobertura_min: 100 },
      { campo: "defaultUnit", plano: "logistica", cobertura_min: 100 },
      { campo: "medianAmount", plano: "logistica", cobertura_min: 100 },
      // Bajó de 13 a 12 el 22 sep 2026 y NO porque se perdiera ningún dato:
      // entraron `gambas-enteras` y `bonito-fresco` al partir dos alimentos, y
      // ninguno de los dos se pide nunca en `ud`. El numerador está intacto y
      // creció el denominador. Es la diferencia entre un trinquete que vigila
      // la calidad y uno que castiga por crecer.
      { campo: "pieza", plano: "logistica", cobertura_min: 12, objetivo: "todo ingrediente que alguna receta pida en `ud`", nota: "regex PIECE_WEIGHTS de red; ver piezaRoundTrip.test.js" },
      { campo: "piezaPorAlias", plano: "logistica", cobertura_min: 2 },
    ],
  },
  {
    id: "recetas",
    tipo: "fuente",
    ruta: "src/data/recipes/*.json",
    clave: "id",
    actualizacion: "release",
    procedencia: "generadas por LLM con contrato (api/_prompts.js) y curadas; ejes derivados por scripts deterministas",
    productor: [
      "scripts/add-recipes-*.mjs (tandas nuevas)",
      "scripts/mark-catalog-axes.mjs (tecnica, cocina)",
      "scripts/derive-base-and-proteins.mjs (mainBase, extraProteins)",
      "scripts/derive-main-ingredients.mjs (mainIngredients)",
      "scripts/derive-sauce.mjs (llevaSalsa)",
      "scripts/mark-base-mode.mjs, scripts/mark-bases-aparte.mjs (baseMode, basesAparte)",
      "scripts/enrich-recipe-steps.mjs (stepsRich, part, base — llm)",
      "scripts/add-ingredient-ids.mjs (ingredients[].ingredientId)",
    ],
    consumidores: ["src/data/recipeCatalog.js", "src/lib/solver.js", "src/utils/validateMenu.js", "src/lib/aiPlanner.js", "src/lib/bases.js"],
    esquema: "src/data/recipeSchema.js",
    campos: [
      { campo: "id", plano: "identidad", cobertura_min: 100 },
      { campo: "name", plano: "identidad", cobertura_min: 100 },
      { campo: "category", plano: "identidad", cobertura_min: 100, nota: "dónde vive en el catálogo, no qué es" },
      { campo: "mainProtein", plano: "identidad", cobertura_min: 100, nota: "enum nativo de Postgres (0001_recipe_catalog.sql); añadir valor = ALTER TYPE ADD VALUE" },
      { campo: "extraProteins", plano: "identidad", cobertura_min: 18 },
      { campo: "mainBase", plano: "identidad", cobertura_min: 36, nota: "ausente = sin fécula batcheable; NO es hueco" },
      { campo: "cocina", plano: "identidad", cobertura_min: 20, nota: "ausente = española, por diseño" },
      { campo: "tecnica", plano: "identidad", cobertura_min: 88, nota: "la DOMINANTE; lo frito es `sarten` a propósito, ver healthFlags.frito" },
      { campo: "mainIngredients", plano: "identidad", cobertura_min: 64 },
      { campo: "type", plano: "funcion", cobertura_min: 100, nota: "completo / principal / guarnicion / salsa / base" },
      { campo: "mealRole", plano: "funcion", cobertura_min: 100 },
      { campo: "llevaSalsa", plano: "funcion", cobertura_min: 16 },
      { campo: "baseMode", plano: "funcion", cobertura_min: 35, nota: "solo con mainBase" },
      { campo: "basesAparte", plano: "funcion", cobertura_min: 35 },
      { campo: "kcal", plano: "nutricion", cobertura_min: 100, nota: "POR RACIÓN, declarado por el LLM al generar; no derivado" },
      { campo: "protein_g", plano: "nutricion", cobertura_min: 100, nota: "ídem; discrepa de la suma de ingredientes, ver derivada `recetaNutricion`" },
      { campo: "carbs_g", plano: "nutricion", cobertura_min: 100 },
      { campo: "fat_g", plano: "nutricion", cobertura_min: 100 },
      { campo: "fiber_g", plano: "nutricion", cobertura_min: 88 },
      { campo: "sugar_g", plano: "nutricion", cobertura_min: 88 },
      { campo: "saturated_fat_g", plano: "nutricion", cobertura_min: 88 },
      { campo: "sodium_mg", plano: "nutricion", cobertura_min: 88 },
      { campo: "allergens", plano: "identidad", cobertura_min: 81, nota: "vacío explícito = sin alérgeno, verificado contra ingredientes" },
      { campo: "ingredients", plano: "logistica", cobertura_min: 100 },
      { campo: "ingredients[].ingredientId", plano: "identidad", cobertura_min: 100, nota: "LA relación. Todo lo demás cuelga de aquí" },
      { campo: "baseServings", plano: "logistica", cobertura_min: 100, nota: "51 sospechosos por masa/proteína; corregirlo mejora compra y coste, no toca macros" },
      { campo: "time", plano: "logistica", cobertura_min: 100 },
      { campo: "difficulty", plano: "logistica", cobertura_min: 100 },
      { campo: "season", plano: "logistica", cobertura_min: 100 },
      { campo: "kidFriendly", plano: "logistica", cobertura_min: 100 },
      { campo: "tupperFriendly", plano: "logistica", cobertura_min: 100 },
      { campo: "freezable", plano: "logistica", cobertura_min: 88 },
      { campo: "steps", plano: "logistica", cobertura_min: 100 },
      { campo: "stepsRich", plano: "logistica", cobertura_min: 97 },
      { campo: "stepsRich[].part", plano: "funcion", cobertura_min: 17, objetivo: "las 309 que la puerta de select-recipes-for-parts marca como multicomponente; el resto NO lo lleva por diseño", nota: "llm; ausente en monocomponente = correcto" },
      { campo: "stepsRich[].base", plano: "funcion", cobertura_min: 29 },
      { campo: "estrella", plano: "control", cobertura_min: 72, nota: "juicio manual: el pool del generador" },
      { campo: "occasion", plano: "control", cobertura_min: 5 },
      { campo: "apetecible", plano: "control", cobertura_min: 12 },
      { campo: "montaje", plano: "funcion", cobertura_min: 9 },
    ],
  },
  {
    id: "bases",
    tipo: "fuente",
    ruta: "src/data/recipes/bases.json",
    clave: "baseKey ?? mainBase (claveDeBase)",
    actualizacion: "release",
    procedencia: "curado a mano",
    productor: ["scripts/build-bases.mjs"],
    consumidores: ["src/lib/bases.js", "src/lib/recetaConBases.js", "src/lib/notepadFields.js"],
    esquema: "src/data/recipeSchema.js",
    campos: [],
  },
  {
    id: "sustituciones",
    tipo: "fuente",
    ruta: "src/data/ingredientSubstitutions.json",
    clave: "ingredientId × restriccion",
    actualizacion: "release",
    procedencia: "curado a mano",
    productor: [],
    consumidores: ["src/lib/ingredients.js (substitutionFor, planIngredientSubstitutions)"],
    esquema: "src/data/ingredientSchema.js",
    campos: [],
  },
  {
    id: "pasosPorAparato",
    tipo: "fuente",
    ruta: "src/data/recipeStepsByAppliance.json",
    clave: "recipeId × aparato",
    actualizacion: "llm",
    procedencia: "scripts/enrich-recipe-steps.mjs; contrato en applianceStepsContract.test.js",
    productor: ["scripts/enrich-recipe-steps.mjs"],
    consumidores: ["src/lib/recipeSteps.js (resolveApplianceSteps)"],
    esquema: null,
    campos: [],
  },

  // ── EXTERNAS ──────────────────────────────────────────────────────────────
  {
    id: "bedca",
    tipo: "externa",
    ruta: "https://www.bedca.net (informe local en output/bedca-*.json, no commiteado)",
    clave: "foodId",
    actualizacion: "pipeline",
    procedencia: "Base de Datos Española de Composición de Alimentos",
    productor: ["scripts/bedca-nutrition.mjs → bedca-repesca.mjs → bedca-triage.mjs → bedca-select.mjs → apply-bedca-nutrition.mjs"],
    consumidores: ["alimentos.nutricion"],
    esquema: null,
    campos: [],
    nota: "El pipeline NUNCA estima: propone candidatos, filtra por Atwater y estado de cocinado, y una decisión (humana o de bedca-select con lista cerrada) elige el foodId. 185 ingredientes siguen sin nutrición porque BEDCA no los tiene o no se ha decidido su match.",
  },
  {
    id: "precios",
    tipo: "externa",
    ruta: "supabase: store_products (0021_store_products.sql); caché en output/mercadona-catalog.json",
    clave: "storeId × productId",
    actualizacion: "pipeline",
    procedencia: "scripts/mercadona-sync.mjs",
    productor: ["scripts/mercadona-sync.mjs"],
    consumidores: ["src/lib/priceHistory.js", "src/lib/shoppingBuilder.js (price)"],
    esquema: null,
    campos: [],
  },

  // ── DERIVADAS ─────────────────────────────────────────────────────────────
  {
    id: "recetaNutricion",
    tipo: "derivada",
    ruta: "src/data/derived/recipeNutrition.json",
    clave: "recipeId",
    actualizacion: "build",
    procedencia: "computeRecipeNutrition(receta, baseServings) sobre alimentos.nutricion, pesando por pieza del catálogo",
    productor: ["scripts/build-derived.mjs"],
    consumidores: ["scripts/audit-catalog.mjs (bloque 1)"],
    esquema: null,
    campos: [],
    nota: "Tabla intermedia entre ingredientes y macros de receta. Lleva `coverage` por fila y el hash de sus entradas en _meta.json. NO sustituye a kcal/protein_g declarados: hoy discrepan y ninguna fuente está validada.",
  },
  {
    id: "recetaPartes",
    tipo: "derivada",
    ruta: "src/data/derived/recipeParts.json",
    clave: "recipeId",
    actualizacion: "build",
    procedencia: "ingredientsByPart (curado, llm) o deriveStepParts (determinista, por FK) según la receta; vector de masa y macros por parte",
    productor: ["scripts/build-derived.mjs", "src/lib/derive/stepParts.js"],
    consumidores: ["scripts/audit-catalog.mjs (bloque 5)"],
    esquema: null,
    campos: [],
    nota: "Cada fila dice de dónde sale su `part`: curado (llm), derivado (operador) o monocomponente (no aplica). El operador se valida contra las curadas y la concordancia va en _meta.json: si no es alta, el derivado no se promociona a fuente.",
  },
  {
    id: "healthFlags",
    tipo: "derivada",
    ruta: "(en memoria) recipe.healthFlags",
    clave: "recipeId",
    actualizacion: "carga",
    procedencia: "deriveHealthFlags(receta): regex sobre nombre + ingredientes",
    productor: ["src/lib/healthFlags.js"],
    consumidores: ["src/utils/validateMenu.js (dos_fritos_seguidos)", "src/utils/filterRecipes.js", "api/_prompts.js (planner)"],
    esquema: null,
    campos: [],
    nota: "Clasificador por TEXTO. Candidato a tabla: healthFlags.frito podría salir de tecnica + ingredientes.",
  },
  {
    id: "aporte",
    tipo: "derivada",
    ruta: "(en memoria) aporteDe(receta)",
    clave: "recipeId",
    actualizacion: "runtime",
    procedencia: "gramosPorFamilia sobre ingredientes, umbral por familia (UMBRAL_RACION)",
    productor: ["src/lib/aporte.js"],
    consumidores: ["src/lib/solver.js (completitud, 1 llamada)", "api/_prompts.js (planner)"],
    esquema: null,
    campos: [],
    nota: "familiaDeIngrediente clasifica por palabras del nombre, no por ingredientId. Candidato a resolver por FK.",
  },
  {
    id: "carbType",
    tipo: "derivada",
    ruta: "(en memoria) getCarbType(receta)",
    clave: "recipeId",
    actualizacion: "runtime",
    procedencia: "CARB_TYPE_BY_BASE[mainBase], y regex CARB_PATTERNS de red para las que no declaran mainBase",
    productor: ["src/utils/validateMenu.js", "src/data/recipeSchema.js (CARB_TYPE_BY_BASE)"],
    consumidores: ["src/utils/validateMenu.js (regla 9, 4b)", "src/lib/aiPlanner.js", "src/lib/fixedDishes.js"],
    esquema: null,
    campos: [],
  },
  {
    id: "recetaFrontend",
    tipo: "derivada",
    ruta: "(en memoria) catalogToFrontendRecipe(receta, comensales)",
    clave: "recipeId × comensales",
    actualizacion: "runtime",
    procedencia: "escala ingredientes por comensales/baseServings; macros pasan tal cual (por ración)",
    productor: ["src/lib/aiPlanner.js"],
    consumidores: ["src/screens/Menu.jsx", "src/lib/shoppingBuilder.js"],
    esquema: null,
    campos: [],
    nota: "Aquí es donde un baseServings malo se convierte en el doble de compra. Las macros NO dependen de baseServings.",
  },

  // ── SALIDAS ───────────────────────────────────────────────────────────────
  {
    id: "seedPostgres",
    tipo: "salida",
    ruta: "supabase/seed_recipes_*.sql",
    clave: "id",
    actualizacion: "release",
    procedencia: "scripts/generate-supabase-seed.mjs desde recetas + ingredientes; rowToRecipe (recipeRow.js) hace el viaje de vuelta",
    productor: ["scripts/generate-supabase-seed.mjs"],
    consumidores: ["supabase (recipes, ingredients)", "src/data/recipeRow.js"],
    esquema: "supabase/migrations/0001_recipe_catalog.sql",
    campos: [],
    nota: "recipeRow.test.js es el fusible: un campo nuevo en RecipeSchema que no viaje por rowToRecipe llega undefined desde la nube.",
  },
  {
    id: "menu",
    tipo: "salida",
    ruta: "(en memoria / supabase menus) menuPlan",
    clave: "grupo × dia × comida",
    actualizacion: "runtime",
    procedencia: "resolverMenu (solver) o planner LLM, validado por validateMenu",
    productor: ["src/lib/solver.js", "src/lib/aiPlanner.js", "src/utils/validateMenu.js"],
    consumidores: ["src/screens/Menu.jsx", "src/lib/shoppingBuilder.js"],
    esquema: null,
    campos: [],
  },
  {
    id: "listaCompra",
    tipo: "salida",
    ruta: "(en memoria) buildShoppingList(menuPlan)",
    clave: "ingrediente × unidad",
    actualizacion: "runtime",
    procedencia: "agrega líneas escaladas; ud→g solo si el ingrediente aparece en las dos unidades",
    productor: ["src/lib/shoppingBuilder.js"],
    consumidores: ["src/screens/Shopping.jsx"],
    esquema: null,
    campos: [],
  },
];

/**
 * Operadores: lo que convierte una tabla en otra. `determinista: false` marca
 * los que clasifican por TEXTO (regex sobre el nombre) en vez de por clave:
 * son la deuda que queda por tabular, y aquí se ve cuánta es y dónde.
 */
export const OPERADORES = [
  { id: "resolveIngredient", tipo: "conversor", modulo: "src/lib/ingredientResolver.js", entrada: ["nombre libre"], salida: "ingredientes.id", determinista: false, nota: "nombre → id por alias/stem. Es la red para texto libre; las recetas ya llevan el FK" },
  { id: "pieceGramsFor", tipo: "conversor", modulo: "src/lib/ingredients.js", entrada: ["ingredientes.pieza", "PIECE_WEIGHTS"], salida: "gramos", determinista: true, nota: "catálogo primero, regex de red; kitchenUnits lo ve via registerPieceCatalog" },
  { id: "gramsForRecipeQuantity", tipo: "conversor", modulo: "src/lib/kitchenUnits.js", entrada: ["línea de receta"], salida: "gramos", determinista: true, nota: "g/kg/ml/l directos; ud por pieza; cucharadas por DRY_VOLUME; null si no sabe" },
  { id: "computeRecipeNutrition", tipo: "calculadora", modulo: "src/lib/ingredients.js", entrada: ["recetas.ingredients", "alimentos.nutricion"], salida: "recetaNutricion", determinista: true },
  { id: "ingredientsByPart", tipo: "calculadora", modulo: "src/lib/recipeSteps.js", entrada: ["recetas.stepsRich[].part", "recetas.ingredients"], salida: "recetaPartes", determinista: true, nota: "el marcador {{Ingrediente}} atribuye cada línea a la parte de su paso" },
  { id: "deriveStepParts", tipo: "clasificador", modulo: "src/lib/derive/stepParts.js", entrada: ["recetas.stepsRich", "ingredientes.aisle", "recetas.mainProtein"], salida: "stepsRich[].part (derivado)", determinista: true, nota: "por FK y aisle; el texto plano del paso solo se lee cuando ningún marcador vota. 54,5 % de concordancia contra las curadas: se mide, no se escribe" },
  { id: "aporteDe", tipo: "calculadora", modulo: "src/lib/aporte.js", entrada: ["recetas.ingredients"], salida: "aporte", determinista: false, nota: "familiaDeIngrediente va por palabras del nombre" },
  { id: "getCarbType", tipo: "clasificador", modulo: "src/utils/validateMenu.js", entrada: ["recetas.mainBase"], salida: "carbType", determinista: false, nota: "tabla si hay mainBase; CARB_PATTERNS (regex) si no" },
  { id: "deriveHealthFlags", tipo: "clasificador", modulo: "src/lib/healthFlags.js", entrada: ["recetas.name", "recetas.ingredients"], salida: "healthFlags", determinista: false },
  { id: "proteinGroup", tipo: "clasificador", modulo: "src/data/recipeSchema.js", entrada: ["recetas.mainProtein"], salida: "familia de proteína", determinista: true, nota: "PROTEIN_GROUP_BY_MAIN_PROTEIN; estuvo copiada 3 veces" },
  { id: "validateMenu", tipo: "validador", modulo: "src/utils/validateMenu.js", entrada: ["menu", "recetas", "perfil"], salida: "violaciones", determinista: true, nota: "única fuente de verdad de las reglas; el solver la llama" },
  { id: "catalogToFrontendRecipe", tipo: "conversor", modulo: "src/lib/aiPlanner.js", entrada: ["recetas", "comensales"], salida: "recetaFrontend", determinista: true },
  { id: "rowToRecipe", tipo: "conversor", modulo: "src/data/recipeRow.js", entrada: ["seedPostgres"], salida: "recetas", determinista: true },
  { id: "buildShoppingList", tipo: "calculadora", modulo: "src/lib/shoppingBuilder.js", entrada: ["menu", "recetaFrontend", "ingredientes.pieza"], salida: "listaCompra", determinista: true },
];

export const tablaPorId = (id) => TABLAS.find((t) => t.id === id) ?? null;
