/**
 * Cuántos platos de cada cocina puede servir el catálogo en UNA semana.
 *
 * ── No es cuántos platos hay: es de cuántos tipos ─────────────────────────
 * El motor no repite un plato en toda la semana y no encadena la misma
 * proteína en dos comidas seguidas. Así que el techo de una cocina no lo marca
 * su volumen sino su VARIEDAD DE PROTEÍNA: peruana tiene catorce platos y casi
 * todos son pescado —ceviches, tiraditos, tartares—, así que al tercero ya
 * habría que repetir proteína, el motor lo rechaza, y el hueco acaba
 * rellenándose con un plato español sin avisar a nadie.
 *
 * Medido sobre el pool servible (estrella + comida/cena), no estimado. Si el
 * catálogo crece, se vuelve a medir y se sube — no se sube "a ojo", que es
 * justo lo que produce la promesa que no se cumple.
 *
 * Vive en lib/ y no dentro del slider porque esto es dato del catálogo: lo
 * necesita el control para no ofrecer un número imposible, y lo necesitará el
 * filtro cuando la cocina pase de ser un sesgo a una puerta de entrada.
 */

/**
 * Cocinas que NO son un añadido, sino parte del fondo de armario.
 *
 * Italiana es la única, y por un motivo medido: 52 de sus 62 platos servibles
 * son `pasta_arroces` — o sea que en ESTE catálogo `cocina: italiana` es
 * prácticamente un sinónimo de "pasta", no de cocina exótica. Macarrones,
 * espaguetis y lasaña son comida de diario en cualquier casa española.
 *
 * Consecuencia: no entra en la puerta de opt-in. Si se apagara por defecto
 * junto a peruana o india, la casa perdería dos tercios del bloque de pasta el
 * primer día (78 platos de pasta_arroces se quedarían en 26), y encima habría
 * dos mandos sobre los mismos platos — la pasta ya tiene su slider en el
 * reparto.
 */
export const SIEMPRE_ENCENDIDAS = new Set(["italiana"]);

/** ¿Esta cocina hay que pedirla, o ya está puesta de serie? */
export function esAnadido(cocina) {
  return !SIEMPRE_ENCENDIDAS.has(cocina);
}

/** Tope duro: ninguna cocina AÑADIDA ocupa más de cinco huecos de la semana. */
export const MAX_POR_SEMANA = 5;

export const TOPE_POR_COCINA = {
  // Sin límite práctico: no es un añadido, es el bloque de pasta.
  italiana: 7,
  asiatica: 5,
  mexicana: 5,
  francesa: 5,
  arabe: 5,
  india: 4,
  americana: 4,
  peruana: 2,
};

/** El tope de una cocina, o el general si es una que aún no se ha medido. */
export function topeDe(cocina) {
  return TOPE_POR_COCINA[cocina] ?? MAX_POR_SEMANA;
}
