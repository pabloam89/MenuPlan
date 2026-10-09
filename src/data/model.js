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
 * ── Rol de una fuente (issue #249) ────────────────────────────────────────
 * Cada entrada de TABLAS es UNA fuente de datos y tiene un rol, de un
 * vocabulario cerrado (ROLES_FUENTE). Es el ÚNICO registro de fuentes del
 * repo; ops/fuentes.test.js lo vigila. Las definiciones en llano, para
 * personas, están en specs/INDEX.md («Vocabulario del catálogo»).
 *
 *   ingesta           viene de fuera (BEDCA, Mercadona…) por un pipeline con
 *                     revisión. Nunca se estima a mano: sin dato es sin dato.
 *   fuente_de_verdad  se edita (a mano o por script) y se commitea. Es la verdad.
 *   derivado          se CALCULA de otras fuentes con un operador determinista
 *                     (o es una salida que se pinta). Si se materializa, lleva
 *                     el hash de sus entradas y un test la marca caducada.
 *   copia_retirada    copia que se leyó y ya no, o que se sembró para leerse y
 *                     nunca se leyó. No se usa para nada nuevo; `sustituido_por`
 *                     dice dónde vive ahora el dato.
 *
 * ── Ciclo de vida con fecha ───────────────────────────────────────────────
 *   estado          vivo | deprecado | retirado (ESTADOS_FUENTE).
 *   retirar_el      fecha ISO. Obligatoria si deprecado (cuándo se quita) y si
 *                   retirado (cuándo se dejó de leer). Null si vivo.
 *   sustituido_por  id de OTRA fuente viva, o null con «sin sustituto» en la
 *                   nota. Obligatorio decidirlo si deprecado o retirado.
 *   ficheros        rutas que la fuente posee: ficheros, o un patrón con * en
 *                   el último tramo (src/data/recipes/*.json). Lo usa el test
 *                   que exige que todo JSON de datos pertenezca a una fuente.
 *   tablas, vistas  nombres en Supabase (los crea alguna migración).
 * Lo omitido vale: estado «vivo», sin fecha ni sustituto, sin ficheros.
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
/** Roles de una fuente (definiciones arriba y en specs/INDEX.md). La única definición. */
export const ROLES_FUENTE = ["ingesta", "fuente_de_verdad", "derivado", "copia_retirada"];
/** En qué punto de su vida está una fuente. */
export const ESTADOS_FUENTE = ["vivo", "deprecado", "retirado"];
export const FRECUENCIAS = ["release", "pipeline", "llm", "build", "carga", "runtime"];

const DECLARADAS = [
  // ── FUENTES ───────────────────────────────────────────────────────────────
  {
    id: "alimentos",
    rol: "fuente_de_verdad",
    ruta: "src/data/alimentos.json",
    clave: "id",
    actualizacion: "pipeline",
    ficheros: ["src/data/alimentos.json"],
    nota: "Fuente de verdad SOLO del campo `nutricion` (y su procedencia, que viaja con él). El resto de la fila (ids, taxonomía, familia, dimensiones) se regenera con build-alimentos.mjs desde ingredients.json, familiaLabels.json y los *Choices.json.",
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
    rol: "fuente_de_verdad",
    ruta: "src/data/ingredients.json",
    ficheros: ["src/data/ingredients.json"],
    nota: "Ingrediente y alimento son dos entidades con los mismos ids hoy (alimentoPorIngrediente es la identidad), no dos copias: el ingrediente es lo que pide la receta, el alimento es lo que se analiza.",
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
      // Vacío desde el 30 sep 2026 A PROPÓSITO: vino, vinagre y licores pasaron
      // sus sulfitos a `allergens` (decisión de Pablo: para una alergia, la
      // duda de «se evapora al cocinar» cuenta). El nivel se conserva para lo
      // que venga, pero hoy no hay ninguno.
      { campo: "cookingAllergens", plano: "identidad", cobertura_min: 0, nota: "vacío a propósito desde el 30 sep 2026: los sulfitos del vino y el vinagre son declarados" },
      // «Puede contener» de los elaborados (caldos, embutidos, pan…): dos
      // pasadas, un juez y una revisión escéptica (scripts/alergenos-puede-contener.mjs).
      { campo: "mayContain", plano: "identidad", cobertura_min: 12, nota: "solo elaborados; vacío = producto de un solo componente, no es hueco" },
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
    rol: "fuente_de_verdad",
    ruta: "src/data/recipes/*.json",
    ficheros: ["src/data/recipes/*.json"],
    nota: "Desde el 30 sep 2026 (migración 0064) es la ÚNICA fuente de recetas. Recetario = las de estrella:true; Reserva = el resto. El patrón incluye bases.json, que además tiene su entrada propia (bases).",
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
    rol: "fuente_de_verdad",
    ruta: "src/data/recipes/bases.json",
    ficheros: ["src/data/recipes/bases.json"],
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
    rol: "fuente_de_verdad",
    ruta: "src/data/ingredientSubstitutions.json",
    ficheros: ["src/data/ingredientSubstitutions.json"],
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
    rol: "fuente_de_verdad",
    ruta: "src/data/recipeStepsByAppliance.json",
    ficheros: ["src/data/recipeStepsByAppliance.json"],
    clave: "recipeId × aparato",
    actualizacion: "llm",
    procedencia: "scripts/enrich-recipe-steps.mjs; contrato en applianceStepsContract.test.js",
    productor: ["scripts/enrich-recipe-steps.mjs"],
    consumidores: ["src/lib/recipeSteps.js (resolveApplianceSteps)"],
    esquema: null,
    campos: [],
  },

  {
    id: "emparejamientoAlimentos",
    rol: "fuente_de_verdad",
    ruta: "src/data/*Choices.json",
    ficheros: ["src/data/bedcaChoices.json", "src/data/ciqualChoices.json", "src/data/usdaChoices.json", "src/data/complementoChoices.json"],
    clave: "ingredientId",
    actualizacion: "pipeline",
    procedencia: "decisiones humanas revisadas (con motivo): qué ficha de BEDCA, CIQUAL o USDA corresponde a cada ingrediente",
    productor: ["scripts/ciqual-sync.mjs", "scripts/usda-sync.mjs", "scripts/apply-complemento.mjs"],
    consumidores: ["scripts/build-alimentos.mjs"],
    esquema: null,
    campos: [],
    nota: "Es la parte cara de la ingesta (el emparejamiento, no los números) y vive en el repo a propósito: output/ está en .gitignore.",
  },
  {
    id: "consultasProveedores",
    rol: "fuente_de_verdad",
    ruta: "src/data/*Queries.json",
    ficheros: ["src/data/ciqualQueries.json", "src/data/usdaQueries.json", "src/data/complementoQueries.json"],
    clave: "ingredientId",
    actualizacion: "pipeline",
    procedencia: "traducciones curadas: con qué término buscar cada ingrediente en CIQUAL y USDA",
    productor: [],
    consumidores: ["scripts/ciqual-sync.mjs", "scripts/usda-sync.mjs"],
    esquema: null,
    campos: [],
    nota: "Estar aquí no decide nada: solo hace que el ingrediente llegue a la puerta con candidatos. La decisión vive en emparejamientoAlimentos.",
  },
  {
    id: "densidad",
    rol: "fuente_de_verdad",
    ruta: "src/data/densidad.json",
    ficheros: ["src/data/densidad.json"],
    clave: "ingredientId",
    actualizacion: "release",
    procedencia: "curado a mano: gramos por mililitro de los que se apartan de 1",
    productor: [],
    consumidores: ["scripts/build-alimentos.mjs (se copia a alimentos.densidad)", "src/lib/ingredients.js"],
    esquema: null,
    campos: [],
  },
  {
    id: "fraccionComestible",
    rol: "fuente_de_verdad",
    ruta: "src/data/fraccionComestible.json",
    ficheros: ["src/data/fraccionComestible.json"],
    clave: "ingredientId",
    actualizacion: "release",
    procedencia: "curado a mano: qué fracción de lo comprado se come",
    productor: [],
    consumidores: ["scripts/build-alimentos.mjs (se copia a alimentos.fraccionComestible)", "src/lib/derive/masaServida.js"],
    esquema: null,
    campos: [],
  },
  {
    id: "familiaLabels",
    rol: "fuente_de_verdad",
    ruta: "src/data/familiaLabels.json",
    ficheros: ["src/data/familiaLabels.json"],
    clave: "ingredientId",
    actualizacion: "release",
    procedencia: "juicios de familia y rol decididos a mano, con motivo",
    productor: [],
    consumidores: ["scripts/build-alimentos.mjs"],
    esquema: null,
    campos: [],
  },
  {
    id: "stepPartsLabels",
    rol: "fuente_de_verdad",
    ruta: "src/data/stepPartsLabels.json",
    ficheros: ["src/data/stepPartsLabels.json"],
    clave: "recipeId",
    actualizacion: "release",
    procedencia: "partes de los pasos decididas a mano para validar al operador deriveStepParts",
    productor: [],
    consumidores: ["scripts/build-derived.mjs"],
    esquema: null,
    campos: [],
  },
  {
    id: "productoBuscado",
    rol: "fuente_de_verdad",
    ruta: "src/data/productoBuscado.json",
    ficheros: ["src/data/productoBuscado.json"],
    clave: "ingredientId",
    actualizacion: "release",
    procedencia: "curado a mano: cómo llama el súper a un ingrediente cuando no lo llama por su nombre",
    productor: [],
    consumidores: ["src/lib/productMatcher.js", "scripts/medir-emparejador.mjs"],
    esquema: null,
    campos: [],
  },
  {
    id: "fotosPlatos",
    rol: "fuente_de_verdad",
    ruta: "src/assets/dishes/dishImages.json",
    ficheros: ["src/assets/dishes/dishImages.json"],
    clave: "recipeId",
    actualizacion: "release",
    procedencia: "manifiesto de las fotos de los platos (URL en Blob); lo mantienen los scripts de fotos",
    productor: ["scripts/regen-one-dish.mjs", "scripts/cachebust-fixed.mjs"],
    consumidores: ["src/assets/dishes/dishImages.js", "api/share-recipe.js", "api/_bot/pintar.js"],
    esquema: null,
    campos: [],
    nota: "Sustituye a la tabla dish_images de Supabase (migración 0064).",
  },

  // ── EXTERNAS ──────────────────────────────────────────────────────────────
  {
    id: "bedca",
    rol: "ingesta",
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
    id: "ciqualUsda",
    rol: "ingesta",
    ruta: "https://ciqual.anses.fr y https://fdc.nal.usda.gov (consultas locales en output/, no commiteadas)",
    clave: "foodId",
    actualizacion: "pipeline",
    procedencia: "CIQUAL (ANSES) y USDA SR Legacy: segundo y tercer proveedor tras BEDCA",
    productor: ["scripts/ciqual-sync.mjs", "scripts/usda-sync.mjs"],
    consumidores: ["alimentos.nutricion (vía emparejamientoAlimentos)"],
    esquema: null,
    campos: [],
  },
  {
    id: "precios",
    rol: "ingesta",
    ruta: "public/store/mercadona.json",
    ficheros: ["public/store/mercadona.json"],
    nota: "Se lee en producción (src/lib/storeCatalog.js). La tabla store_products (0021) no está aplicada en producción; la caché local es output/mercadona-catalog.json.",
    clave: "storeId × productId",
    actualizacion: "pipeline",
    procedencia: "scripts/mercadona-sync.mjs",
    productor: ["scripts/mercadona-sync.mjs"],
    consumidores: ["src/lib/storeCatalog.js", "src/lib/priceHistory.js", "src/lib/shoppingBuilder.js (price)"],
    esquema: null,
    campos: [],
  },

  // ── DERIVADAS ─────────────────────────────────────────────────────────────
  {
    id: "recetaNutricion",
    rol: "derivado",
    ruta: "src/data/derived/recipeNutrition.json",
    ficheros: ["src/data/derived/recipeNutrition.json"],
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
    rol: "derivado",
    ruta: "src/data/derived/recipeParts.json",
    ficheros: ["src/data/derived/recipeParts.json"],
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
    id: "recetaCoste",
    rol: "derivado",
    ruta: "src/data/derived/recipeCoste.json",
    ficheros: ["src/data/derived/recipeCoste.json"],
    clave: "recipeId",
    actualizacion: "build",
    procedencia: "coste por ración de cada receta (costeReceta, modo granel) sobre los precios de Mercadona",
    productor: ["scripts/build-coste.mjs"],
    consumidores: ["src/lib/coste.js"],
    esquema: null,
    campos: [],
  },
  {
    id: "recetaFamilias",
    rol: "derivado",
    ruta: "src/data/derived/recipeFamilias.json",
    ficheros: ["src/data/derived/recipeFamilias.json"],
    clave: "recipeId",
    actualizacion: "build",
    procedencia: "gramos por familia de alimento de cada receta",
    productor: ["scripts/build-derived.mjs"],
    consumidores: ["src/data/recipeCatalog.js", "src/lib/menuRecuento.js"],
    esquema: null,
    campos: [],
  },
  {
    id: "derivedMeta",
    rol: "derivado",
    ruta: "src/data/derived/_meta.json",
    ficheros: ["src/data/derived/_meta.json"],
    clave: "—",
    actualizacion: "build",
    procedencia: "hash de las fuentes con que se generaron los derivados y medidas de cobertura",
    productor: ["scripts/build-derived.mjs"],
    consumidores: ["src/data/derived.test.js"],
    esquema: null,
    campos: [],
  },
  {
    id: "alimentosApp",
    rol: "derivado",
    ruta: "src/data/derived/alimentosApp.json",
    ficheros: ["src/data/derived/alimentosApp.json"],
    clave: "id",
    actualizacion: "build",
    procedencia: "la versión de alimentos que lee la app; lleva «NO SE EDITA»",
    productor: ["scripts/build-alimentos.mjs"],
    consumidores: ["src/lib/ingredients.js"],
    esquema: null,
    campos: [],
  },
  {
    id: "alimentoPorIngrediente",
    rol: "derivado",
    ruta: "src/data/alimentoPorIngrediente.json",
    ficheros: ["src/data/alimentoPorIngrediente.json"],
    clave: "ingredientId",
    actualizacion: "build",
    procedencia: "mapa ingrediente → alimento (hoy la identidad), escrito por build-alimentos.mjs",
    productor: ["scripts/build-alimentos.mjs"],
    consumidores: ["src/lib/ingredients.js", "src/lib/derive/composicion.js", "src/lib/derive/ejesDePlato.js", "src/data/ingredientSchema.js"],
    esquema: null,
    campos: [],
  },
  {
    id: "retencion",
    rol: "derivado",
    ruta: "src/data/retencion.json",
    ficheros: ["src/data/retencion.json"],
    clave: "técnica × nutriente",
    actualizacion: "pipeline",
    procedencia: "USDA Table of Nutrient Retention Factors R6 (dominio público), procesada por build-retencion.mjs a partir de un CSV que no está en el repo",
    productor: ["scripts/build-retencion.mjs"],
    consumidores: ["src/lib/derive/factorRetencion.js", "scripts/build-derived.mjs"],
    esquema: null,
    campos: [],
  },
  {
    id: "vectoresRecetas",
    rol: "derivado",
    ruta: "api/_bot/recetasVectores.json",
    ficheros: ["api/_bot/recetasVectores.json"],
    clave: "recipeId",
    actualizacion: "build",
    procedencia: "vectores del Recetario para la búsqueda por significado de Lola",
    productor: ["scripts/build-vectores.mjs"],
    consumidores: ["api/_bot/vectores.js"],
    esquema: null,
    campos: [],
    nota: "Solo vectoriza el Recetario (estrella:true).",
  },
  {
    id: "fotosPlatosDerivadas",
    rol: "derivado",
    ruta: "src/assets/dishes/dishImageDerivatives.json",
    ficheros: ["src/assets/dishes/dishImageDerivatives.json"],
    clave: "recipeId",
    actualizacion: "build",
    procedencia: "versiones optimizadas de las fotos de los platos",
    productor: ["scripts/backfill-dish-derivatives.mjs"],
    consumidores: ["src/lib/dishPhotoOptimize.js"],
    esquema: null,
    campos: [],
    nota: "Se lee en producción; se regenera desde fotosPlatos.",
  },
  {
    id: "catalogoGaleria",
    rol: "derivado",
    estado: "vivo",
    ruta: "dish-gallery/public/catalog.json",
    ficheros: ["dish-gallery/public/catalog.json"],
    clave: "combo_id",
    actualizacion: "build",
    procedencia: "copia plana de recetas con su foto para la herramienta aparte dish-gallery",
    productor: ["scripts/build-catalog.mjs", "scripts/cachebust-fixed.mjs"],
    consumidores: ["dish-gallery/src/App.jsx", "dish-gallery/build-sheets.mjs", "dish-gallery/read-approvals.mjs"],
    esquema: null,
    campos: [],
    nota: "Parado en la v27, sin regenerar (último commit del 8 sep 2026). Solo lo leen las herramientas de dish-gallery, nunca la app ni Lola. Si la herramienta se retira, este fichero pasa a copia_retirada.",
  },
  {
    id: "healthFlags",
    rol: "derivado",
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
    rol: "derivado",
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
    rol: "derivado",
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
    rol: "derivado",
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
    rol: "copia_retirada",
    estado: "retirado",
    retirar_el: "2026-09-30",
    sustituido_por: null,
    ruta: "supabase/seed_*.sql",
    ficheros: ["supabase/seed_*.sql"],
    clave: "id",
    actualizacion: "release",
    procedencia: "scripts/generate-supabase-seed.mjs volcaba recetas + ingredientes a las tablas copia de Supabase",
    productor: ["scripts/generate-supabase-seed.mjs"],
    consumidores: [],
    esquema: "supabase/migrations/0001_recipe_catalog.sql",
    campos: [],
    nota: "Sin sustituto único: los seeds sembraban recetas, ingredientes, fotos y sustituciones, y cada tabla copia dice el suyo. Sin lectores desde la 0064: no se vuelve a ejecutar. Sus restos están registrados aparte (copiaRecetasSupabase…). El traductor de filas de recipes (recipeRow.js) se borró el 9 oct 2026: nadie lo importaba salvo su test.",
  },
  {
    id: "copiaRecetasSupabase",
    rol: "copia_retirada",
    estado: "retirado",
    retirar_el: "2026-09-30",
    sustituido_por: "recetas",
    ruta: "supabase: recipes, recipe_ingredients, catalog_meta",
    tablas: ["recipes", "recipe_ingredients", "catalog_meta"],
    clave: "id",
    actualizacion: "release",
    procedencia: "copia del catálogo de recetas parada en la v27 (8 sep 2026)",
    productor: [],
    consumidores: [],
    esquema: "supabase/migrations/0064_catalogo_una_fuente.sql",
    campos: [],
    nota: "Sin lector desde la 0064 (30 sep 2026). Siguen en la base; borrarlas es decisión de Pablo.",
  },
  {
    id: "copiaFotosSupabase",
    rol: "copia_retirada",
    estado: "retirado",
    retirar_el: "2026-09-30",
    sustituido_por: "fotosPlatos",
    ruta: "supabase: dish_images",
    tablas: ["dish_images"],
    clave: "id",
    actualizacion: "release",
    procedencia: "copia de las fotos de los platos",
    productor: [],
    consumidores: [],
    esquema: "supabase/migrations/0064_catalogo_una_fuente.sql",
    campos: [],
    nota: "Las fotos salen de src/assets/dishes/dishImages.json (0064).",
  },
  {
    id: "copiaIngredientesSupabase",
    rol: "copia_retirada",
    estado: "retirado",
    retirar_el: "2026-09-01",
    sustituido_por: "ingredientes",
    ruta: "supabase: ingredients, ingredient_aliases",
    tablas: ["ingredients", "ingredient_aliases"],
    clave: "id",
    actualizacion: "release",
    procedencia: "copia de los ingredientes y sus alias",
    productor: [],
    consumidores: [],
    esquema: "supabase/migrations/0029_ingredients.sql",
    campos: [],
    nota: "Nunca tuvo lector (nació con c6767be, 1 sep 2026). La 0064 la dejó sin marcar creyendo que la despensa apuntaba a ella: es un error. user_pantry.ingredient_id (0041) es text SIN references y guarda ids de ingredients.json, no de esta tabla.",
  },
  {
    id: "copiaSustitucionesSupabase",
    rol: "copia_retirada",
    estado: "retirado",
    retirar_el: "2026-09-01",
    sustituido_por: "sustituciones",
    ruta: "supabase: ingredient_substitutions y la vista recipe_substitution_options",
    tablas: ["ingredient_substitutions"],
    vistas: ["recipe_substitution_options"],
    clave: "ingredientId × restriccion",
    actualizacion: "release",
    procedencia: "copia de las sustituciones y la vista que las cruzaba con las recetas",
    productor: [],
    consumidores: [],
    esquema: "supabase/migrations/0031_ingredient_substitutions.sql",
    campos: [],
    nota: "Nunca tuvo lector (1 sep 2026). La app lee src/data/ingredientSubstitutions.json.",
  },
  {
    id: "copiaAlergenosSupabase",
    rol: "copia_retirada",
    estado: "retirado",
    retirar_el: "2026-09-01",
    sustituido_por: "recetas",
    ruta: "supabase: vista recipe_derived_allergens",
    vistas: ["recipe_derived_allergens"],
    clave: "recipeId",
    actualizacion: "release",
    procedencia: "vista que sacaba los alérgenos de las recetas desde recipe_ingredients",
    productor: [],
    consumidores: [],
    esquema: "supabase/migrations/0030_recipe_ingredients.sql",
    campos: [],
    nota: "Nunca tuvo lector (1 sep 2026). Los alérgenos se calculan hoy al cargar el catálogo (recipeCatalog.js), no en un script de derivados.",
  },
  {
    id: "recetasPrototipo",
    rol: "fuente_de_verdad",
    estado: "deprecado",
    retirar_el: "2026-12-31",
    sustituido_por: null,
    ruta: "src/data/recipes.js",
    ficheros: ["src/data/recipes.js"],
    clave: "id",
    actualizacion: "release",
    procedencia: "BASE_RECIPES: las recetas semilla del prototipo, escritas a mano dentro del código",
    productor: [],
    consumidores: ["src/data/recipes.js (RECIPES)", "src/lib/planner.js (generateMenu)", "scripts/gen-demo-state.mjs (npm run dev:menu: genera src/dev/demoState.json)", "src/lib/vetos.test.js (el planner local no pone platos vetados)"],
    esquema: null,
    campos: [],
    nota: "Sin sustituto: se borra el array BASE_RECIPES; ninguno de sus ids está en el JSON. NO se borra el registro RECIPES_BY_ID, que llena registerRecipes (App.jsx) con recetas de usuario o de IA y leen App.jsx, consumptionInsights.js, menuExport.js y menuInsights.js. OJO (9 oct 2026): generateMenu SÍ tiene lectores — el script de la demo (dev:menu) y vetos.test.js, que sin BASE_RECIPES se quedarían sin menú. Para borrar el array hay que decidir antes qué pasa con la demo y ese test (issue #250). recipes.js también exporta INGREDIENT_CATEGORIES (lo importan ingredientSchema.js e ingredientCategories.js).",
  },
  {
    id: "menu",
    rol: "derivado",
    ruta: "(en memoria / supabase menus) menuPlan",
    clave: "grupo × dia × comida",
    actualizacion: "runtime",
    procedencia: "resolverMenu (solver) o planner LLM, validado por validateMenu",
    nota: "Salida: la persona lo edita y se guarda en user_menus; no se regenera, por eso el rol «derivado» es solo el más cercano.",
    productor: ["src/lib/solver.js", "src/lib/aiPlanner.js", "src/utils/validateMenu.js"],
    consumidores: ["src/screens/Menu.jsx", "src/lib/shoppingBuilder.js"],
    esquema: null,
    campos: [],
  },
  {
    id: "listaCompra",
    rol: "derivado",
    ruta: "(en memoria) buildShoppingList(menuPlan)",
    clave: "ingrediente × unidad",
    actualizacion: "runtime",
    procedencia: "agrega líneas escaladas; ud→g solo si el ingrediente aparece en las dos unidades",
    nota: "Salida calculada en memoria cada vez; no se guarda como tabla propia.",
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
  { id: "buildShoppingList", tipo: "calculadora", modulo: "src/lib/shoppingBuilder.js", entrada: ["menu", "recetaFrontend", "ingredientes.pieza"], salida: "listaCompra", determinista: true },
];

/**
 * El registro con los valores por omisión puestos (ver «Ciclo de vida con
 * fecha» arriba): lo que una entrada no dice, vale vivo y sin nada.
 */
export const TABLAS = DECLARADAS.map((t) => ({
  estado: "vivo",
  retirar_el: null,
  sustituido_por: null,
  ficheros: [],
  tablas: [],
  vistas: [],
  ...t,
}));

/**
 * Fuentes deprecadas cuya fecha de retirada ya pasó, para quien mida la deuda
 * (issue #253) y para el aviso de ops/fuentes.test.js. `hoy` es AAAA-MM-DD y es obligatorio:
 * quien llama lo saca de isoDeCasa() (src/lib/dias.js); este fichero no importa nada.
 * Una fecha imposible (2026-13-45) no cuenta como vencida: la pilla el test
 * de forma, que sí se pone rojo.
 */
export function fuentesVencidas(hoy, tablas = TABLAS) {
  if (!esFechaIso(hoy)) throw new Error(`fuentesVencidas necesita «hoy» en AAAA-MM-DD (usa isoDeCasa() de src/lib/dias.js); recibió ${JSON.stringify(hoy)}`);
  return tablas.filter((f) => f.estado === "deprecado" && esFechaIso(f.retirar_el) && f.retirar_el < hoy);
}

/** ¿Es una fecha ISO real? (rechaza 2026-13-45 y 2026-02-30). */
export function esFechaIso(s) {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [a, m, dia] = s.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1, dia));
  return d.getUTCFullYear() === a && d.getUTCMonth() === m - 1 && d.getUTCDate() === dia;
}

export const tablaPorId = (id) => TABLAS.find((t) => t.id === id) ?? null;
