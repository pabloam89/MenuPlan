/**
 * Catálogo canónico de ingredientes y su resolutor desde texto libre.
 *
 * Hoy el mismo producto se escribe de muchas formas por toda la app —
 * "Aceite de oliva" / "Aceite de oliva virgen extra", "Perejil" / "Perejil
 * fresco" — y cada módulo que necesita saber algo de un ingrediente (pasillo,
 * alérgeno, imagen, precio) lo deduce con su propia tabla de palabras clave.
 * Son seis vocabularios distintos que pueden equivocarse por separado.
 *
 * Este módulo es la fuente única: 374 ingredientes con id estable, generados
 * desde el catálogo real por scripts/build-ingredient-catalog.mjs.
 *
 * FASE 1 — NADIE LO CONSUME TODAVÍA, a propósito. Se introduce sin cambiar el
 * comportamiento de nada; los consumidores se migran uno a uno después. Por eso
 * los helpers de conveniencia (ingredientAisleFor, etc.) caen a la heurística
 * de siempre cuando un nombre no está en el catálogo: las recetas de usuario,
 * las generadas por IA y los tickets escaneados traen texto libre que nunca
 * estará aquí, así que el catálogo AÑADE precisión donde la hay y nunca quita
 * cobertura donde no.
 */

import ingredientsJson from "../data/ingredients.json";
import substitutionsJson from "../data/ingredientSubstitutions.json";
import { ES_ACEITE_DE_FREIR, factorAceite, fraccionServida, seFrie, esCostra, ES_SAL, SAL_A_GRANEL } from "./derive/masaServida.js";
import { vieneCocinadaPorId } from "./derive/estadoDeFicha.js";
import { factorRetencion } from "./derive/factorRetencion.js";
// LA COMPOSICIÓN SE LEE DE LA TABLA MAESTRA, no de una copia en el catálogo.
// `alimentos.json` es el output maestro del embudo de alimentos —el número y su
// procedencia viven juntos— y esto es su proyección para el cliente, sellada
// con el hash de la maestra. Ver scripts/build-alimentos.mjs.
import alimentosApp from "../data/derived/alimentosApp.json";
import alimentoPorIngrediente from "../data/alimentoPorIngrediente.json";
import densidadJson from "../data/densidad.json";
import { NUTRIENTES, CAMPOS_NUTRICION, CAMPOS_DUROS, CAMPOS_SECUNDARIOS } from "../data/nutrientes.js";
import { validateIngredients } from "../data/ingredientSchema.js";
import { createIngredientResolver } from "./ingredientResolver.js";
import { guessShoppingAisle, guessIngredientCategory, normalizeName } from "./ingredientCategories.js";
import { gramsForRecipeQuantity, gramsPerPiece, registerPieceCatalog, registerDensityCatalog } from "./kitchenUnits.js";

// Mismo criterio que recipeCatalog.js, y por el mismo motivo: solo en
// desarrollo y en tests. `scripts/validate-catalog.mjs` valida este fichero en
// `prebuild` y en `pretest`, y el JSON va dentro del bundle, así que en
// producción esto revalidaba algo que no puede haber cambiado.
//
// Aquí son ~11-50 ms, bastante menos que los ~210 ms de las recetas — se cambia
// por coherencia entre los dos catálogos, no porque el ahorro lo justifique
// solo. Lo que ya NO es cierto es la frase que había aquí sobre "el generador
// valida antes de escribir": el generador está desarmado desde el 10 sep y este
// fichero es fuente, no artefacto (ver la cabecera de
// scripts/build-ingredient-catalog.mjs).
if (import.meta.env.DEV) {
  const errors = validateIngredients(ingredientsJson);
  if (errors.length > 0) {
    throw new Error(
      `Catálogo de ingredientes inválido (${errors.length} error/es):\n` +
        errors.map((e) => `  - ${e}`).join("\n"),
    );
  }
}

/** @typedef {(typeof ingredientsJson)[number]} Ingredient */

export const ingredientCatalog = ingredientsJson;

// La lógica de resolución vive en ingredientResolver.js para que los scripts de
// Node (que leen el JSON con readFileSync, no con el import de Vite) usen
// exactamente la misma y no haya dos respuestas distintas a "qué ingrediente es
// este texto".
const resolver = createIngredientResolver(ingredientCatalog);

export const ingredientById = resolver.ingredientById;

/** Stems que resolverían a más de un ingrediente y por eso no se usan. */
export const AMBIGUOUS_STEMS = resolver.ambiguousStems;

/**
 * Id canónico de un ingrediente a partir de su nombre en texto libre.
 * @param {string} name
 * @returns {string|null} null si no está en el catálogo — NO es un error.
 */
export const resolveIngredientId = resolver.resolveIngredientId;

/**
 * El ingrediente completo, o null si el nombre no está en el catálogo.
 * @param {string} name
 * @returns {Ingredient|null}
 */
export const resolveIngredient = resolver.resolveIngredient;

// ── Helpers con fallback ─────────────────────────────────────────────────
// La forma en que los consumidores actuales se migrarán: preguntan al catálogo
// y, si no lo conoce, siguen haciendo exactamente lo de hoy.

/** Pasillo de súper, del catálogo si lo conoce y si no por heurística. */
export function ingredientAisleFor(name) {
  return resolveIngredient(name)?.aisle ?? guessShoppingAisle(name);
}

/** Categoría de despensa, del catálogo si lo conoce y si no por heurística. */
export function ingredientCategoryFor(name) {
  return resolveIngredient(name)?.category ?? guessIngredientCategory(name);
}

/**
 * Como se cuenta este ingrediente por piezas: `{ nombre, g }` o null.
 *
 * El nombre importa tanto como el gramaje. "1 ud" no dice de que pieza habla
 * -un diente no es una cabeza, una rebanada no es una hogaza- y esa palabra es
 * la que permite pintar "3 dientes de ajo" o "medio pomelo" en vez de "0,5 ud".
 * @param {string} name
 * @returns {{ nombre: string, g: number }|null}
 */
export function pieceFor(name) {
  const ing = resolveIngredient(name);
  if (!ing) return null;
  // El alias primero: es lo unico que distingue "Cabeza de ajos" de "Ajo"
  // cuando los dos resuelven al mismo id, y entre los dos hay un 10x.
  const porAlias = ing.piezaPorAlias;
  if (porAlias) {
    const buscado = normalizeName(name);
    for (const alias of Object.keys(porAlias)) {
      if (normalizeName(alias) === buscado) return porAlias[alias];
    }
  }
  return ing.pieza ?? null;
}

/**
 * Gramos de una pieza, del catalogo si lo sabe y si no por heuristica.
 *
 * El orden NO es intercambiable. La heuristica de kitchenUnits casa por regex
 * contra el nombre y gana la primera que coincida, asi que un ingrediente puede
 * heredar el peso de otro que solo se le parece: "Pimientos del piquillo" salia
 * a 180 g porque contenia "pimiento". Preguntar al catalogo primero -que resuelve
 * por id- es lo unico que lo impide de raiz; el regex se queda como red para los
 * nombres libres de las recetas del usuario, que no estan en el catalogo.
 * @param {string} name
 * @returns {number|null}
 */
export function pieceGramsFor(name) {
  return pieceFor(name)?.g ?? gramsPerPiece(name);
}

// A partir de aquí kitchenUnits ve el catálogo: sus lentes ("≈ 3 muslos",
// "2 huevos"), convertStockAmount y gramsForRecipeQuantity (y con ella
// computeRecipeNutrition) resuelven la pieza por id antes que por regex. Es lo
// que cierra el viaje de ida de la lista de la compra — ver el comentario de
// registerPieceCatalog en kitchenUnits.js.
registerPieceCatalog(pieceFor);

/**
 * Gramos por mililitro de un ingrediente, o null si el catálogo no lo declara
 * (y entonces kitchenUnits asume 1, que es lo correcto para el agua y los
 * caldos). Resuelve por id, no por texto: la densidad es del alimento, no de
 * cómo lo escriba la receta.
 *
 * @param {string} name
 * @returns {number|null}
 */
export function densityFor(name) {
  const id = resolveIngredientId(name);
  return id ? (densidadJson[id]?.valor ?? null) : null;
}

registerDensityCatalog(densityFor);

/**
 * Las líneas de ingrediente de una receta, resueltas contra el catálogo — el
 * equivalente en cliente de la tabla `recipe_ingredients` (Fase 2).
 *
 * `recipes.ingredients` (jsonb) SIGUE SIENDO la fuente de verdad y no se toca:
 * esto es una vista derivada que se calcula al vuelo. Por eso `rawName` se
 * conserva siempre — es lo que hay que pintar, no el nombre canónico. Una
 * receta que dice "Merluza o pescado blanco" tiene que seguir diciendo eso
 * aunque resuelva a `merluza`.
 *
 * `ingredientId` es null cuando el catálogo no conoce el nombre, que es lo
 * normal en recetas de usuario y de IA. No es un error y el llamante debe
 * tratarlo como "no lo sé", nunca como "no tiene".
 *
 * @param {{ingredients?: Array<{name: string, amount?: number, unit?: string}>}} recipe
 * @returns {Array<{position: number, rawName: string, amount: number|null, unit: string|null, ingredientId: string|null, ingredient: Ingredient|null}>}
 */
/**
 * El índice de composición, por id de alimento.
 *
 * Se exporta MUTABLE a propósito y solo por los tests, igual que
 * `ingredientById`: un test que quiere «este ingrediente aporta 100 kcal» tiene
 * que poder decirlo por la misma puerta que usa la app, no por una segunda.
 * En producción lo llena la proyección y nadie lo toca.
 */
export const COMPOSICION = new Map(alimentosApp.filas.map((f) => [f.id, f.nutricion]));

/**
 * La fila entera del alimento, por id de INGREDIENTE.
 *
 * `fraccionServida` la necesita para distinguir un hueco de una decisión: sin
 * la taxonomía no puede saber que «Gambas» es marisco y que por tanto su
 * fracción comestible ausente es que nadie la miró, no que se coma el
 * caparazón.
 */
const FILA_ALIMENTO = new Map(alimentosApp.filas.map((f) => [f.id, f]));
const alimentoDeIngrediente = (ingredientId) =>
  (ingredientId ? FILA_ALIMENTO.get(alimentoPorIngrediente[ingredientId] ?? ingredientId) : null) ?? null;

/**
 * La composición de un ingrediente, por su id.
 *
 * Un ingrediente apunta a un alimento por `alimentoPorIngrediente`; hoy es el
 * mapa identidad (391 claves, todas a sí mismas) porque cada ingrediente tiene
 * su ficha, pero el modelo admite N ingredientes → 1 alimento y por eso se
 * pregunta por el mapa y no por el id directamente.
 */
export function composicionDe(ingredientId) {
  if (!ingredientId) return null;
  return COMPOSICION.get(alimentoPorIngrediente[ingredientId] ?? ingredientId) ?? null;
}

export function resolveRecipeIngredients(recipe) {
  return (recipe?.ingredients ?? []).map((line, position) => {
    const ingredient = resolveIngredient(line.name);
    return {
      position,
      rawName: line.name,
      amount: typeof line.amount === "number" ? line.amount : null,
      unit: line.unit ?? null,
      ingredientId: ingredient?.id ?? null,
      ingredient,
    };
  });
}

/**
 * Alérgenos de una receta DERIVADOS de sus ingredientes, en los dos niveles.
 *
 * No sustituye a `recipe.allergens`: ese campo es la declaración revisada y
 * manda siempre. Esto es la segunda opinión, y su utilidad es justamente
 * poder compararlas (`scripts/build-ingredient-catalog.mjs` genera ese informe).
 *
 * `unknownNames` lista los ingredientes que el catálogo no reconoce. Mientras
 * no esté vacío, el resultado es un MÍNIMO, no una lista completa — por eso se
 * devuelve en vez de tragárselo.
 *
 * @returns {{allergens: string[], cookingAllergens: string[], unknownNames: string[]}}
 */
export function deriveRecipeAllergens(recipe) {
  const allergens = new Set();
  const cookingAllergens = new Set();
  const unknownNames = [];

  for (const line of resolveRecipeIngredients(recipe)) {
    if (!line.ingredient) {
      unknownNames.push(line.rawName);
      continue;
    }
    for (const a of line.ingredient.allergens) allergens.add(a);
    for (const a of line.ingredient.cookingAllergens) cookingAllergens.add(a);
  }

  return {
    allergens: [...allergens].sort(),
    // Un alérgeno duro en cualquier ingrediente gana al nivel de cocinado de
    // otro: si el plato ya lleva sulfitos en unas aceitunas, el chorrito de
    // vino no añade nada que el usuario pueda evitar cambiando un producto.
    cookingAllergens: [...cookingAllergens].filter((a) => !allergens.has(a)).sort(),
    unknownNames,
  };
}

// ── Nutrición calculada (Fase 9) ─────────────────────────────────────────
//
// Suma la nutrición por 100g del catálogo (ver ingredientSchema.js#nutrition,
// poblada vía scripts/bedca-nutrition.mjs) sobre los ingredientes de una
// receta que SÍ convierten a gramos (gramsForRecipeQuantity, kitchenUnits.js)
// Y SÍ resuelven a un ingrediente con nutrición BEDCA. Un ingrediente que no
// cumple una de las dos cosas simplemente no suma — nunca lanza, nunca
// inventa un valor.
//
// `coverage` es la fracción de los gramos QUE PUDIMOS PESAR (no de la receta
// completa: un ingrediente en una unidad inconvertible es invisible tanto al
// numerador como al denominador) que además tenía nutrición BEDCA. Es la
// señal que decide si vale la pena sustituir la estimación de la IA
// (generateUserRecipeDraft, userRecipes.js) o dejarla como está.

/**
 * La sal de una COSTRA o de un curado no se come: se apelmaza, se rompe y se
 * tira. Y la sal no tiene calorías, así que este fallo era invisible mirando
 * kcal y catastrófico mirando sodio:
 *
 *   «Dorada a la sal» lleva 1.500 g de sal gruesa y salía a 291.593 mg de
 *   sodio por ración. El límite que recomienda la OMS es 2.000 mg AL DÍA.
 *
 * El umbral son 50 g. Por debajo es sal de sazonar y sí se come; nadie echa
 * cincuenta gramos de sal a un guiso de dos raciones. En el catálogo entero
 * solo lo cruzan tres recetas, y las tres son costra o curado.
 *
 * El AZÚCAR se descarta solo si además hay curado, porque entonces forma parte
 * de la mezcla que se retira —un gravlax lleva sal y azúcar a partes— y no es
 * el azúcar de un postre.
 *
 * LO QUE ESTO NO MODELA, y conviene saberlo: de la costra algo se absorbe. Un
 * pescado a la sal sale salado. Descartarla entera se queda corto, igual que
 * contarla entera se pasaba por un factor de 500. La regla viene de
 * scripts/audit-catalog.mjs, donde lleva tiempo, y aquí se aplica igual.
 */
// Las tres viven ahora en derive/masaServida.js, que es el módulo que contesta
// «de lo que se compra, cuánto llega al plato», al lado de la fracción
// comestible y del aceite absorbido. Estaban AQUÍ, y por eso el vector de
// composición no las conocía: la «Lubina entera a la sal» salía bien en kcal y
// con 1.084 g por ración en masa, porque un carril descartaba la costra y el
// otro la contaba como comida.

// El tope del aceite de freír vive en derive/masaServida.js, que es el módulo
// que contesta a «de lo que se compra, cuánto llega al plato». Aquí estaba una
// de las dos copias que había del mismo 0,06 con significados distintos.

/**
 * @param {{ingredients?: Array<{name: string, amount?: number, unit?: string}>}} recipe
 * @param {number} servings
 * @returns {{kcal:number, protein_g:number, carbs_g:number, fat_g:number, fiber_g:number|null, sugar_g:number|null, saturated_fat_g:number|null, sodium_mg:number|null, coverage:number, coberturaPorCampo:{fiber_g:number, sugar_g:number, saturated_fat_g:number, sodium_mg:number}} | null}
 *   `null` si no hay servings válidos o ningún ingrediente aportó nutrición.
 *
 *   `coverage` es la masa con ficha. `coberturaPorCampo` es la masa que aporta
 *   CADA campo secundario, que es siempre menor o igual y a veces mucho menor:
 *   BEDCA publica azúcar en 42 de sus 198 fichas.
 */
/**
 * Las clases cuyo hierro es HEMO, que es el que se absorbe bien.
 *
 * Hemo es el hierro unido a la hemoglobina y la mioglobina, o sea el del
 * músculo y la sangre de un animal. El huevo y el lácteo son de origen animal
 * y su hierro NO es hemo: por eso la lista va por `clase` y no por `reino`,
 * que es el error fácil aquí.
 */
const CLASES_HEMO = new Set(["mamifero", "ave", "viscera", "pez", "marisco", "cefalopodo"]);

/**
 * `compuesto` es el único que no se puede repartir: un alioli o una bechamel
 * son varias cosas a la vez y su hierro viene de todas. Se cuenta aparte en
 * vez de asignarlo a ojo a uno de los dos lados. Medido sobre el recetario
 * estrella, es el 1,9 % del hierro total.
 */
function origenDelHierro(alimento) {
  const clase = alimento?.taxonomia?.clase;
  if (!clase) return "sinRepartir";
  if (CLASES_HEMO.has(clase)) return "hemo";
  if (clase === "compuesto") return "sinRepartir";
  return "noHemo";
}

export function computeRecipeNutrition(recipe, servings) {
  if (!(servings > 0)) return null;

  // Todo lo que sigue se recorre desde la DECLARACIÓN (src/data/nutrientes.js).
  // La versión anterior escribía los campos a mano aquí, y era la sexta copia
  // de la misma lista: al añadir dos micronutrientes hubo que tocar seis
  // sitios y dos se quedaron atrás sin que nada fallara.
  const totals = Object.fromEntries(CAMPOS_NUTRICION.map((c) => [c, 0]));

  // Gramos que de verdad aportaron CADA campo secundario, no un sí/no.
  //
  // Aquí había un booleano por campo, y bastaba que UN ingrediente trajera
  // azúcar para que la receta publicara un total de azúcar sumando solo ese y
  // callando los otros siete. Medido: 740 de las 747 recetas estrella (99 %)
  // publicaban un azúcar incompleto, y 447 (60 %) una grasa saturada
  // incompleta. Lo que falta suma cero, así que el error siempre va en la
  // misma dirección — por debajo— y eso es sesgo, no ruido.
  //
  // El número se queda: un parcial es mejor proxy que un hueco. Lo que no
  // puede seguir es publicarlo como si estuviera completo, así que cada campo
  // secundario viaja con la fracción de masa que lo sostiene.
  const gramosDelCampo = Object.fromEntries(CAMPOS_SECUNDARIOS.map((c) => [c, 0]));
  let totalGrams = 0;
  let coveredGrams = 0;
  // Los ingredientes a los que no se les supo aplicar retención porque no se
  // sabe si su ficha venía cruda o cocinada. Viaja a la salida en vez de
  // tragarse: un folato corregido y uno sin corregir no son el mismo dato, y
  // la cobertura por campo no lo cuenta porque mide otra cosa.
  const sinDecidir = new Set();

  // EL HIERRO NO SE ABSORBE IGUAL SEGÚN DE DÓNDE VENGA, y el catálogo ya sabe
  // de dónde viene: `taxonomia.clase` está al 100 % en las 396 fichas.
  //
  // El hemo —carne, ave, víscera, pescado, marisco, cefalópodo— se absorbe en
  // torno al 25 %. El no hemo, en torno al 5-10 %, y además depende de lo que
  // le acompañe. Sumar los dos en un número y llamarlo «hierro» dice menos de
  // lo que el dato ya permite: un menú de legumbres y uno de carne con el
  // mismo hierro en el papel no dan el mismo hierro a quien se lo come.
  //
  // Se reparte AQUÍ y no en un módulo aparte a propósito: este bucle ya tiene
  // la masa buena —con merma, con el tope del aceite y sin la costra—, y
  // recalcularla fuera habría abierto un tercer carril que se desincroniza.
  const hierro = { hemo: 0, noHemo: 0, sinRepartir: 0 };

  // El aceite de freír se ABSORBE, no se come entero — ver ACEITE_ABSORBIDO.
  // Hace falta saber la masa sólida antes de contar el aceite, así que las
  // líneas se resuelven una vez y se recorren dos.
  const lineas = [];
  let solidoGramos = 0;
  let aceiteBruto = 0;
  for (const line of resolveRecipeIngredients(recipe)) {
    const comprados = gramsForRecipeQuantity(line.rawName, line.amount, line.unit);
    if (comprados == null || comprados <= 0) continue;
    // La merma es de la LÍNEA, no del ingrediente: unos «Mejillones (sin
    // concha)» no vuelven a perder la concha. Ver derive/masaServida.js — eran
    // 18 líneas restando dos veces, de 21 a 46 kcal por ración.
    const grams = comprados
      * fraccionServida(line.rawName, line.ingredient?.id, alimentoDeIngrediente(line.ingredient?.id)).factor;
    if (grams <= 0) continue;
    const esAceite = ES_ACEITE_DE_FREIR.test(line.ingredient?.id ?? "");
    if (esAceite) aceiteBruto += grams;
    else solidoGramos += grams;
    lineas.push({ line, grams, esAceite, nombre: line.rawName ?? "" });
  }

  // ¿Hay una costra o un curado? Se decide mirando TODA la receta antes de
  // contar nada, porque el azúcar del gravlax solo se tira si hay sal con él.
  const hayCurado = lineas.some((x) => ES_SAL.test(x.nombre) && x.grams >= SAL_A_GRANEL);

  // El tope del aceite es de la RECETA y se reparte entre sus líneas de
  // aceite. Aplicarlo línea a línea daba dos veces el 6 % a las 19 recetas que
  // listan dos aceites: «Chuletón a la parrilla» lleva 300 ml de girasol para
  // freír y 150 de oliva suave para el alioli.
  const tajadaDeAceite = factorAceite(aceiteBruto, solidoGramos, seFrie(recipe));

  for (const { line, grams: brutos, esAceite, nombre } of lineas) {
    // La costra y el curado, fuera: ni su masa ni su sodio llegan al plato.
    if (esCostra(nombre, brutos, hayCurado)) continue;
    const grams = esAceite ? brutos * tajadaDeAceite : brutos;
    if (grams <= 0) continue;

    totalGrams += grams;

    const nutrition = composicionDe(line.ingredient?.id);
    if (!nutrition) continue;
    coveredGrams += grams;

    const factor = grams / 100;
    for (const campo of CAMPOS_DUROS) totals[campo] += nutrition[campo] * factor;

    // LO QUE SE PIERDE AL COCINAR, y solo se le aplica a los secundarios.
    //
    // Los macros no se corrigen a propósito: las kcal, la proteína y la grasa
    // no se destruyen con el calor, se concentran al irse el agua — y esa masa
    // ya la lleva `factorHidratacion` por el otro carril. Lo que sí se destruye
    // o se disuelve son las vitaminas y, en menor medida, los minerales.
    //
    // El estado de la ficha manda sobre la técnica: una legumbre que la tabla
    // analizó ya cocida no vuelve a perder nada. Ver derive/factorRetencion.js.
    const alimento = alimentoDeIngrediente(line.ingredient?.id);
    const cocinada = vieneCocinadaPorId(alimento?.id).cocinada;
    for (const campo of CAMPOS_SECUNDARIOS) {
      if (nutrition[campo] == null) continue;
      const ret = factorRetencion(NUTRIENTES[campo].porRacion, alimento?.familia, recipe?.tecnica, cocinada);
      if (ret.via === "SIN DECIDIR") sinDecidir.add(alimento?.id ?? nombre);
      const aporte = nutrition[campo] * factor * ret.factor;
      totals[campo] += aporte;
      gramosDelCampo[campo] += grams;
      if (campo === "iron100g") hierro[origenDelHierro(alimento)] += aporte;
    }
  }

  if (coveredGrams === 0) return null;

  const perServing = (v, decimals = 1) => {
    const factor = 10 ** decimals;
    return Math.round((v / servings) * factor) / factor;
  };

  // Fracción de la masa TOTAL de la receta que aportó cada campo secundario.
  // Se mide contra `totalGrams` y no contra `coveredGrams` a propósito: al
  // comensal le da igual si el hueco viene de que el ingrediente no tiene
  // ficha o de que su ficha no publica azúcar. El hueco es el mismo.
  const cobertura = {};
  for (const c of CAMPOS_SECUNDARIOS) {
    const nombre = NUTRIENTES[c].porRacion;
    cobertura[nombre] = totalGrams > 0 ? Math.round((gramosDelCampo[c] / totalGrams) * 1000) / 1000 : 0;
  }

  const salida = {};
  for (const c of CAMPOS_DUROS) {
    salida[NUTRIENTES[c].porRacion] = perServing(totals[c], NUTRIENTES[c].decimales);
  }
  for (const c of CAMPOS_SECUNDARIOS) {
    const nombre = NUTRIENTES[c].porRacion;
    // Cobertura 0 significa que NADIE lo aportó: ahí el total es null y no 0,
    // que es la diferencia entre «no lo sé» y «no tiene».
    salida[nombre] = cobertura[nombre] > 0 ? perServing(totals[c], NUTRIENTES[c].decimales) : null;
  }
  salida.coverage = totalGrams > 0 ? Math.round((coveredGrams / totalGrams) * 1000) / 1000 : 0;
  // LA MASA, QUE HASTA HOY NO SALÍA. `coverage` publicaba la FRACCIÓN de masa
  // con ficha y se guardaba el denominador para sí, así que quien quisiera
  // saber cuánta comida hay tenía que recalcularla entera.
  //
  // Es la masa de la RECETA COMPLETA, no la de una ración: los gramos se
  // acumulan antes de dividir por `servings`, igual que `masaTotal` del
  // vector de composición. Para la ración, entre `baseServings`.
  //
  // Hace falta para ponderar coberturas al fundir dos platos (ver
  // `applyGarnishToRecipe`): sin masa, la cobertura de la suma solo se puede
  // aproximar por el valor aportado, y esa aproximación es ciega justo en el
  // caso que importa —un campo con cobertura 0 aporta 0 y no baja nada—.
  salida.totalGrams = Math.round(totalGrams);
  // La retención que no se pudo decidir, por su nombre. Vacío significa que
  // todos los ingredientes de la receta supieron contestar, no que no se haya
  // mirado.
  salida.retencionSinDecidir = [...sinDecidir];

  // De dónde viene el hierro de este plato, por ración. Los tres suman
  // `iron_mg`, así que `sinRepartir` no es una pérdida: es la parte que viene
  // de un `compuesto` y no se puede atribuir.
  salida.hierroPorOrigen = {
    hemo: perServing(hierro.hemo, 2),
    noHemo: perServing(hierro.noHemo, 2),
    sinRepartir: perServing(hierro.sinRepartir, 2),
  };

  // VITAMINA A EN µg RAE, que es la unidad en la que se publican las ingestas
  // de referencia. El repo ya tenía las dos mitades en columnas separadas
  // —`retinol_ug` y `beta_carotene_ug`— y solo faltaba la fórmula: el
  // betacaroteno de la dieta rinde 1 µg de retinol por cada 12 µg, según el
  // factor de conversión del Institute of Medicine que EFSA y la FAO usan.
  //
  // Sale `null` si falta cualquiera de las dos, no 0: media vitamina A no es
  // una vitamina A baja, es media respuesta. Y por eso NO sustituye a los dos
  // campos, que siguen publicándose aparte — un menú vegetariano y uno con
  // hígado pueden dar el mismo RAE y no son lo mismo.
  const retinol = salida.retinol_ug;
  const caroteno = salida.beta_carotene_ug;
  salida.vitamin_a_rae_ug = retinol == null || caroteno == null
    ? null
    : Math.round((retinol + caroteno / 12) * 10) / 10;
  // Qué parte de la receta sostiene cada campo secundario. Un 0,31 en
  // `sugar_g` dice que ese azúcar es el de un tercio del plato.
  salida.coberturaPorCampo = cobertura;
  return salida;
}

// ── Sustituciones (Fase 3) ───────────────────────────────────────────────
//
// Lo que hoy hace substitutions.js concatenando strings sobre una lista de
// palabras clave, pero como datos revisados: ver scripts/ingredient-
// substitutions.mjs para el porqué de cada entrada y de cada omisión.
//
// AVISO QUE NO SE PUEDE PERDER: `restriction` es siempre un id de
// INTOLERANCE_RULES (`lactosa_fina`, `alcohol_cocina`), NUNCA un alérgeno.
// Un producto "sin lactosa" conserva la proteína láctea: sirve para la
// intolerancia y no sirve para la alergia a la leche, que debe seguir
// excluyendo el plato de forma dura.

/** ingredientId → { restriction → sustitución } */
const substitutionsByIngredient = new Map();
for (const sub of substitutionsJson) {
  if (!substitutionsByIngredient.has(sub.ingredientId)) {
    substitutionsByIngredient.set(sub.ingredientId, new Map());
  }
  substitutionsByIngredient.get(sub.ingredientId).set(sub.restriction, sub);
}

export const ingredientSubstitutions = substitutionsJson;

/**
 * ¿Hay forma de sustituir este ingrediente para esta restricción?
 * @param {string} name - nombre en texto libre
 * @param {string} restriction - id de INTOLERANCE_RULES
 * @returns {{ingredientId: string, restriction: string, replacementLabel: string, note?: string}|null}
 */
export function substitutionFor(name, restriction) {
  const id = resolveIngredientId(name);
  if (!id) return null;
  return substitutionsByIngredient.get(id)?.get(restriction) ?? null;
}

/**
 * Plan de adaptación de una receta: qué líneas hay que cambiar y por cuál.
 *
 * `blocked` reproduce la regla de substitutions.js: si la restricción aparece
 * en el NOMBRE del plato pero en ningún ingrediente, no hay nada que renombrar
 * y mantener la receta sería engañar ("Batido de leche" sin una línea "Leche").
 * El llamante debe excluirla.
 *
 * `unsubstitutable` son los ingredientes que sí chocan con la restricción pero
 * no tienen recambio real (un ron no tiene versión sin alcohol que funcione
 * igual). Se devuelven en vez de ignorarse: una receta con alguno de estos NO
 * se puede adaptar, por muchos otros que sí se sustituyan.
 *
 * @returns {{swaps: Array, unsubstitutable: string[], blocked: boolean}}
 */
export function planIngredientSubstitutions(recipe, restriction) {
  const swaps = [];
  const unsubstitutable = [];
  let matchedAny = false;

  for (const line of resolveRecipeIngredients(recipe)) {
    // El choque se lee de `conflictsWith`, que se deriva de INTOLERANCE_RULES.
    // NO se infiere de los alérgenos: la mantequilla lleva `leche` pero no
    // entra en lactosa_fina, y el vinagre tiene sulfitos pero no alcohol.
    if (!line.ingredient?.conflictsWith?.includes(restriction)) continue;
    matchedAny = true;
    const sub = line.ingredientId
      ? (substitutionsByIngredient.get(line.ingredientId)?.get(restriction) ?? null)
      : null;
    if (sub) {
      swaps.push({
        from: line.rawName,
        to: sub.replacementLabel,
        position: line.position,
        restriction,
        note: sub.note,
      });
    } else {
      unsubstitutable.push(line.rawName);
    }
  }

  return { swaps, unsubstitutable, blocked: !matchedAny };
}

/**
 * Alérgenos de un ingrediente, en los dos niveles.
 *
 * Sin fallback heurístico a propósito: un nombre desconocido devuelve listas
 * VACÍAS, no "no lleva alérgenos". El llamante tiene que seguir aplicando las
 * redes de palabras clave de lib/allergens.js y lib/intolerances.js — este
 * catálogo suma una capa, no sustituye a ninguna.
 *
 * @returns {{allergens: string[], cookingAllergens: string[], known: boolean}}
 */
export function ingredientAllergensFor(name) {
  const ing = resolveIngredient(name);
  if (!ing) return { allergens: [], cookingAllergens: [], known: false };
  return {
    allergens: ing.allergens,
    cookingAllergens: ing.cookingAllergens,
    known: true,
  };
}
