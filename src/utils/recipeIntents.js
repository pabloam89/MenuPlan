import { filterRecipes, recipeMatchesPreferType } from "./filterRecipes.js";
import { BUILT_IN_IDS } from "../lib/recipeCollections.js";

/**
 * Inspíranos: qué recetas entran en cada una de las 4 intenciones que el
 * usuario elige en el paso "Quiero…". Las intenciones comparten id con las
 * carpetas de recipeCollections.js — una receta swipeada a la derecha se
 * archiva en las que cumple.
 *
 * Se apoyan en campos que ya existen y ya son visibles en el navegador de
 * catálogo, en vez de inventar señales nuevas:
 *  - `apetecible` es exactamente lo que hay detrás de la faceta "Platos
 *    gourmet", así que "ocasión especial" y esa faceta no pueden divergir.
 *  - "cena rápida" reusa recipeMatchesPreferType, el mismo predicado que el
 *    generador aplica a un hueco marcado como cena rápida.
 */

export const INTENT_IDS = BUILT_IN_IDS;

/**
 * `kidFriendly` a secas cubre el 84% del catálogo curado, así que como filtro
 * de mazo no filtraba nada: "para mis hijos" añade dificultad fácil, que es
 * lo que la gente quiere decir en la práctica (entre semana, sin líos).
 */
function matchesHijos(recipe) {
  return recipe.kidFriendly === true && recipe.difficulty === "facil";
}

function matchesOcasionEspecial(recipe) {
  return recipe.apetecible === true;
}

function matchesCenaRapida(recipe, eaters) {
  return recipeMatchesPreferType(recipe, "cena_rapida", eaters);
}

/**
 * Whether a recipe belongs to one of the four Inspíranos intents.
 *
 * "Día a día" es el resto por exclusión de gourmet y cena rápida —
 * deliberadamente NO excluye "hijos": que un plato valga para los niños no lo
 * saca del día a día, son ejes ortogonales (67 recetas cumplen ambas).
 */
export function matchesIntent(recipe, intentId, eaters) {
  if (!recipe) return false;
  if (intentId === "hijos") return matchesHijos(recipe);
  if (intentId === "ocasion_especial") return matchesOcasionEspecial(recipe);
  if (intentId === "cena_rapida") return matchesCenaRapida(recipe, eaters);
  if (intentId === "dia_a_dia") {
    return !matchesOcasionEspecial(recipe) && !matchesCenaRapida(recipe, eaters);
  }
  return false;
}

/** The intents a recipe satisfies, restricted to the ones the user picked. */
export function intentsForRecipe(recipe, intentIds, eaters) {
  return (intentIds ?? []).filter((id) => matchesIntent(recipe, id, eaters));
}

/**
 * El catálogo que Inspíranos puede enseñar, con las mismas reglas duras que
 * usa el generador (alergias, intolerancias, alcohol con niños, aislamiento de
 * bebés y off-menu, Recetario Estrella). Se delega en filterRecipes para no
 * tener una segunda copia de las reglas de seguridad que pueda quedarse atrás.
 *
 * Dos opciones se fijan a propósito, distintas de lo que usaría un menú:
 *  - `hasKids: false` — el filtro duro a kidFriendly es del grupo que come, no
 *    del mazo. "Para mis hijos" ya filtra por su cuenta; forzarlo aquí
 *    recortaría también las otras tres intenciones.
 *  - `maxTime` alto — esto es descubrimiento, no la cena de esta noche. El
 *    único límite de tiempo que importa es el que impone "cena rápida".
 * `cookLevel` sí se respeta: es lo que el usuario ha declarado saber cocinar.
 */
/**
 * `extraRecipes` entra por el mismo sitio que las recetas propias en
 * filterRecipes: es lo que permite meter en el mazo las recetas públicas de
 * otra gente. Importante que sea por ahí y no concatenando después — así
 * pasan por las MISMAS reglas duras (alergias, intolerancias, alcohol con
 * niños, aislamiento de bebés). Una receta de un desconocido no puede
 * saltarse el filtro de alergias por venir de fuera del catálogo.
 */
export function eligibleCatalogPool(data, { excludeIds, extraRecipes = [] } = {}) {
  const members = data?.members ?? [];
  // Lo descartado no vuelve al mazo: ni lo que se rechazó desde el menú ni lo
  // que se descartó aquí mismo (🚫 permanente, 😐 con enfriamiento). Se lee de
  // data.discards en vez de importar activeDiscardIds de aiPlanner.js, que
  // arrastraría el cliente de Gemini a una función pura de filtrado.
  const discards = data?.discards ?? {};
  const now = Date.now();
  const discarded = new Set(Array.isArray(discards.forever) ? discards.forever : []);
  for (const [id, until] of Object.entries(discards.cooldownUntil ?? {})) {
    if (Number(until) > now) discarded.add(id);
  }
  const blocked = excludeIds ?? Array.from(discarded);
  const dietaryStates = members.flatMap((m) => m.dietaryStates ?? []);
  const impliesAlcoholCocina = dietaryStates.some((s) => s === "embarazo" || s === "lactancia");
  const { recipes } = filterRecipes({
    allergies: Array.from(new Set(members.flatMap((m) => m.allergies ?? []))),
    intolerances: Array.from(
      new Set([
        ...members.flatMap((m) => m.intolerances ?? []),
        ...dietaryStates,
        ...(impliesAlcoholCocina ? ["alcohol_cocina"] : []),
      ]),
    ),
    dislikes: Array.from(
      new Set([...(data?.dislikes ?? []), ...members.flatMap((m) => m.dislikes ?? [])]),
    ),
    excludeIds: blocked,
    extraRecipes,
    kitchenTools: [...(data?.kitchenTools ?? []), ...(data?.customKitchenTools ?? [])],
    cookLevel: data?.cookLevel ?? "normal",
    hasKids: false,
    maxTime: 999,
    isBabyGroup: false,
  });
  return recipes;
}

/** Fisher-Yates — un orden distinto cada vez que se entra al mazo. */
function shuffle(items) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * The shuffled deck for the picked intents: the union of everything matching
 * any of them, deduplicated (a recipe that fits two intents is still one card).
 */
export function buildInspireDeck(pool, intentIds, eaters) {
  if (!intentIds?.length) return [];
  const matching = (pool ?? []).filter((r) =>
    intentIds.some((id) => matchesIntent(r, id, eaters)),
  );
  return shuffle(matching);
}

// ── Recetas de otra gente dentro del mazo ───────────────────────────────────
//
// Cinco recetas de gente contra 361 de catálogo: con una baraja uniforme no
// las vería nadie. Se suben a las primeras posiciones — lo que ha cocinado
// alguien a quien sigues interesa más que el plato número 200 del catálogo.
export const SOCIAL_WINDOW = 12;

/** Reparte `cards` por posiciones al azar de la ventana que arranca en `from`. */
export function spliceUpcoming(deck, from, cards, window = SOCIAL_WINDOW) {
  const out = [...deck];
  for (const card of cards ?? []) {
    const start = Math.min(Math.max(0, from), out.length);
    const span = Math.min(window, Math.max(1, out.length - start));
    out.splice(start + Math.floor(Math.random() * span), 0, card);
  }
  return out;
}

/**
 * Saca del mazo las cartas de `social` y las vuelve a meter arriba. No añade
 * nada que no estuviera ya: si una receta social no pasó el filtro de
 * seguridad no está en `deck`, y aquí no se cuela por la puerta de atrás.
 */
export function promoteSocial(deck, social, window = SOCIAL_WINDOW) {
  if (!social?.length || !deck?.length) return deck ?? [];
  const socialIds = new Set(social.map((r) => r.id));
  const mine = deck.filter((r) => socialIds.has(r.id));
  if (mine.length === 0) return deck;
  return spliceUpcoming(deck.filter((r) => !socialIds.has(r.id)), 0, mine, window);
}
