/**
 * La coherencia entre las kcal de una fila de BEDCA y sus propios macros
 * (Atwater, 4/4/9 kcal/g), en un solo sitio: lo usan el triaje
 * (scripts/bedca-triage.mjs) y la aplicación (scripts/apply-bedca-nutrition.mjs),
 * que antes llevaban cada uno su copia de los umbrales.
 *
 * Por qué hace falta el filtro: BEDCA tiene filas con las kcal de un estado y
 * los macros de otro. Los dos casos reales medidos —uno por lado—:
 *
 *  · POR DEBAJO. "Kéfir": dos filas con los MISMOS macros, una dice 0,8
 *    kcal/100g y la otra 63,9. La primera es basura y no tiene explicación
 *    nutricional posible: nada puede aportar MENOS energía que la que ya
 *    garantizan su proteína, sus hidratos y su grasa.
 *
 *  · POR ENCIMA. "Garbanzo, hervido": 358,7 kcal con 8,9 g de proteína, 18,7
 *    de hidratos y 2,5 de grasa, que son 133. Los 358 son los del garbanzo
 *    SECO pegados a los macros del cocido — la trampa crudo/cocido otra vez,
 *    pero dentro de una sola fila, donde ni el nombre ni el estado la delatan.
 *
 * El exceso SÍ tiene una explicación legítima, y es una sola: el alcohol, que
 * aporta ~7 kcal/g y no entra en el 4/4/9. Un destilado de 40° puede enseñar
 * +220 kcal/100g sin que le pase nada. Por eso la tolerancia de arriba no es
 * un número: es "¿puede esto llevar alcohol?". Si puede, solo se le pone el
 * techo físico; si no puede, se le exige cuadrar como al resto.
 */

// Nombres con los que el catálogo y BEDCA escriben algo que lleva alcohol.
// Genérico y suelto a propósito: un falso positivo aquí solo relaja el filtro
// de un alimento que de verdad suele llevar alcohol.
const ALCOHOL_WORDS = [
  "vino", "vinos", "cerveza", "sidra", "cava", "champan", "champán", "licor",
  "ron", "whisky", "whiskey", "brandy", "conac", "coñac", "cognac", "ginebra",
  "vodka", "vermut", "vermouth", "anis", "anís", "orujo", "aguardiente",
  "tequila", "mezcal", "oporto", "jerez", "moscatel", "marsala", "sake",
  "cointreau", "amaretto", "kirsch", "calvados", "pacharan", "pacharán",
  "bebida alcoholica", "bebida alcohólica", "destilado", "destilada",
  "vinagre",
];

// El vinagre va en la misma lista por la misma razón física: su energía es
// ácido acético (~3,5 kcal/g), que tampoco entra en el 4/4/9. Medido: el
// "Vinagre" que ya está en el catálogo son 18 kcal con macros que suman 2.
export function mayContainAlcohol(...names) {
  const hay = names.filter(Boolean).join(" ").toLowerCase();
  return ALCOHOL_WORDS.some((w) => hay.includes(w));
}

// Margen fijo además del relativo, para que un alimento casi sin macros no
// falle por un redondeo de dos decimales.
const TOLERANCE_ABS = 5;
const LOW_TOLERANCE_REL = 0.15;
// Más holgado que el de abajo: por arriba caben la fibra que cuenta como
// hidrato en unas tablas y no en otras, los polioles y el redondeo de la grasa.
// +44 kcal sobre 635 (el "Piñon" real) pasa; +226 sobre 133 (el garbanzo) no.
const HIGH_TOLERANCE_REL = 0.25;
// Nada comestible real supera con holgura la grasa pura (900 kcal/100g): por
// encima de esto lo que hay es un kJ etiquetado como kcal.
const ABSOLUTE_KCAL_CEILING = 920;

/**
 * @param {{kcal100g:number, protein100g:number, carbs100g:number, fat100g:number}} n
 * @param {string} [foodName]  nombre del candidato de BEDCA
 * @param {string} [ingredientName]  nombre del ingrediente del catálogo
 * @returns {{diff:number, ok:boolean, motivo:string|null}}
 */
export function atwaterCheck(n, foodName, ingredientName) {
  const expected = 4 * n.protein100g + 4 * n.carbs100g + 9 * n.fat100g;
  const diff = n.kcal100g - expected;

  if (n.kcal100g > ABSOLUTE_KCAL_CEILING) {
    return { diff, ok: false, motivo: `${n.kcal100g} kcal/100g supera el techo físico (${ABSOLUTE_KCAL_CEILING})` };
  }
  if (diff < -Math.max(expected * LOW_TOLERANCE_REL, TOLERANCE_ABS)) {
    return { diff, ok: false, motivo: `kcal por debajo de lo que ya garantizan sus macros (Atwater ${diff.toFixed(0)})` };
  }
  if (diff > Math.max(expected * HIGH_TOLERANCE_REL, TOLERANCE_ABS)
      && !mayContainAlcohol(foodName, ingredientName)) {
    return {
      diff,
      ok: false,
      motivo: `kcal muy por encima de sus macros (Atwater +${diff.toFixed(0)} sobre ${expected.toFixed(0)}) y no es nada que lleve alcohol: fila que mezcla estados`,
    };
  }
  return { diff, ok: true, motivo: null };
}
