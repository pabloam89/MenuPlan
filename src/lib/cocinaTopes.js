/**
 * Cuántos platos de cada cocina puede servir el catálogo en UNA semana.
 *
 * ── No es cuántos platos hay: es de cuántos tipos ─────────────────────────
 * El motor no repite un plato en toda la semana y no encadena la misma
 * proteína en dos comidas seguidas. Así que el techo de una cocina no lo marca
 * su volumen sino su VARIEDAD DE PROTEÍNA: peruana tiene una docena de platos y
 * casi todos son pescado —ceviches, tiraditos, tartares—, así que al segundo ya
 * habría que repetir proteína, el motor lo rechaza, y el hueco acaba
 * rellenándose con un plato español sin avisar a nadie.
 *
 * ── Se MIDE, ya no se escribe ─────────────────────────────────────────────
 * Esto era una tabla a mano con un comentario que decía "si el catálogo crece,
 * se vuelve a medir". No se volvió a medir: el catálogo creció en septiembre de
 * 2026 y la tabla se quedó prometiendo 5 platos franceses cuando ya daban 8, y
 * 2 peruanos cuando solo daba 1. Una tabla que hay que acordarse de actualizar
 * es una tabla que se queda vieja, así que ahora el número sale del catálogo en
 * el momento de leerlo.
 *
 * Vive en lib/ y no dentro del slider porque esto es dato del catálogo: lo
 * necesita el control para no ofrecer un número imposible, y lo necesita la
 * puerta de `filterRecipes` para no dejar entrar más de los que caben.
 */

import { recipeCatalog } from "../data/recipeCatalog.js";

/**
 * Cocinas que NO son un añadido, sino parte del fondo de armario.
 *
 * Italiana es la única, y por un motivo medido: 63 de sus platos servibles son
 * `pasta_arroces` — o sea que en ESTE catálogo `cocina: italiana` es
 * prácticamente un sinónimo de "pasta", no de cocina exótica. Macarrones,
 * espaguetis y lasaña son comida de diario en cualquier casa española.
 *
 * Consecuencia: no entra en la puerta de opt-in. Si se apagara por defecto
 * junto a peruana o india, la casa perdería el bloque de pasta el primer día, y
 * encima habría dos mandos sobre los mismos platos — la pasta ya tiene su
 * slider en el reparto.
 */
export const SIEMPRE_ENCENDIDAS = new Set(["italiana"]);

/** ¿Esta cocina hay que pedirla, o ya está puesta de serie? */
export function esAnadido(cocina) {
  return !SIEMPRE_ENCENDIDAS.has(cocina);
}

/** Tope duro: ninguna cocina AÑADIDA ocupa más de cinco huecos de la semana. */
export const MAX_POR_SEMANA = 5;

/**
 * Las categorías que el planner de comida/cena nunca coloca. Misma lista que
 * `OFF_MENU_CATEGORIES` en utils/filterRecipes.js: un flan italiano no puede
 * contar para el tope de "cuántos italianos caben en la semana" porque nunca va
 * a ocupar uno de esos huecos.
 */
const FUERA_DEL_MENU = new Set(["desayunos", "meriendas", "postres"]);

/** El pool que el motor puede servir de verdad: estrella y de comida o cena. */
function servibles() {
  return recipeCatalog.filter((r) => r?.estrella && !FUERA_DEL_MENU.has(r.category));
}

/**
 * Proteínas distintas por cocina. Es el techo: con N proteínas distintas no se
 * pueden colocar más de N platos sin encadenar dos iguales.
 *
 * `mainProtein` ausente cuenta como una proteína más ("none" es real: una pasta
 * al pesto no lleva ninguna, y dos seguidas sí chocarían entre sí).
 */
function medirTopes() {
  const proteinas = {};
  for (const r of servibles()) {
    if (!r.cocina) continue;
    (proteinas[r.cocina] ??= new Set()).add(r.mainProtein ?? "none");
  }
  const topes = {};
  for (const [cocina, prot] of Object.entries(proteinas)) {
    // Las de serie no llevan tope de "añadido": su límite es la semana entera.
    topes[cocina] = esAnadido(cocina) ? Math.min(prot.size, MAX_POR_SEMANA) : prot.size;
  }
  return topes;
}

export const TOPE_POR_COCINA = medirTopes();

/**
 * El tope de una cocina. Cero cuando el catálogo no tiene NADA servible de
 * ella: el slider entonces no se puede mover, que es la verdad — mejor una
 * barra muerta que una que promete platos que no existen.
 */
export function topeDe(cocina) {
  return TOPE_POR_COCINA[cocina] ?? 0;
}
