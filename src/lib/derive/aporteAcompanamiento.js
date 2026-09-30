/**
 * LO QUE UNA GUARNICIÓN O UNA SALSA LE AÑADEN AL PLATO.
 *
 * ── Los dos fallos que este módulo existe para cerrar ──────────────────────
 *
 * 1. LA MITAD DE LOS MACROS. `applyGarnishToRecipe` sumaba
 *    `garnish.kcal / garnish.baseServings` con el comentario «garnish values
 *    are stored per baseServings». No lo están: en guarniciones.json y en
 *    salsas.json los macros ya vienen POR RACIÓN, y son los INGREDIENTES los
 *    que están por receta entera (400 g de patata para dos raciones). Esa
 *    asimetría —que sí es real y `scaleSideIngredients` usa bien— se leyó como
 *    si valiera para todo, así que cada guarnición aportaba la mitad de sus
 *    calorías y cada salsa, con `baseServings: 4`, una cuarta parte.
 *
 *    Se comprueba por dos vías independientes. El operador, que sí calcula por
 *    ración, da una mediana calculado/declarado de 1,02 en las 43 guarniciones
 *    y 1,04 en las 28 salsas: si el declarado fuese el total, esa mediana
 *    tendría que ser 0,5 y 0,25. Y a mano: el «Puré de patata con mantequilla»
 *    lleva 400 g de patata y 30 g de mantequilla para dos, que son ~300 kcal
 *    por ración — no las 155 que salían de dividir sus 310 declaradas.
 *
 * 2. NINGÚN MICRO. Se sumaban kcal, proteína, hidratos, grasa, fibra y sodio.
 *    Los otros 24 campos no, así que un plato con judías verdes al lado
 *    publicaba el hierro del plato solo. Fibra y sodio se añadieron en su día
 *    por este mismo motivo y con este mismo argumento; esto termina la frase.
 *
 * ── Por qué se calcula aquí y no se lee de la tabla derivada ───────────────
 *
 * `recipeNutrition.json` tiene fila para las 43 guarniciones y las 28 salsas,
 * y sería más barato leerla. Pero entonces el aporte dependería de que el
 * artefacto esté regenerado, y un artefacto viejo no avisa: devuelve números
 * plausibles. Llamando al operador, el aporte y el plato salen siempre de la
 * misma fuente y no pueden desincronizarse. Se memoiza por id, que son 71
 * entradas como mucho.
 *
 * ── La cobertura no se hereda, se pondera ──────────────────────────────────
 *
 * Fundir dos platos funde también sus incertidumbres. Si el plato tiene el
 * hierro sostenido por el 99 % de su masa y la guarnición por el 40 % de la
 * suya, el hierro del conjunto no está sostenido ni por lo uno ni por lo otro:
 * está sostenido por la media ponderada POR MASA. Se pondera por masa y no por
 * el valor aportado, que sería más fácil, porque la ponderación por valor es
 * ciega justo en el caso que importa — un campo con cobertura 0 aporta 0 y no
 * bajaría nada, cuando es exactamente el caso en que más hay que avisar.
 */

import { computeRecipeNutrition } from "../ingredients.js";
import { NUTRIENTES, CAMPOS_SECUNDARIOS } from "../../data/nutrientes.js";

/**
 * Los 24 micros: los secundarios menos los cuatro que ya viajan como macros
 * declaradas. Misma lista y mismo criterio que `withMicronutrientes` en
 * recipeCatalog.js y que `MICRONUTRIENTES_RACION` en aiPlanner.js.
 */
export const MICROS_RACION = CAMPOS_SECUNDARIOS
  .filter((c) => !["fiber100g", "sugar100g", "saturatedFat100g", "sodium100g"].includes(c))
  .map((c) => NUTRIENTES[c].porRacion);

const cache = new Map();

/**
 * El aporte POR RACIÓN de una guarnición o una salsa, con su masa y su
 * cobertura por campo.
 *
 * @param {Object} side - entrada de guarniciones.json o salsas.json
 * @returns {{micros: Object, cobertura: Object, masa: number}|null}
 *   `null` cuando el operador no puede decidir (ninguna línea con ficha), que
 *   es distinto de un aporte de cero.
 */
export function aporteDe(side) {
  if (!side?.id) return null;
  if (cache.has(side.id)) return cache.get(side.id);

  const raciones = side.baseServings ?? 1;
  const n = computeRecipeNutrition(side, raciones);
  if (!n) {
    cache.set(side.id, null);
    return null;
  }

  const micros = {};
  const cobertura = {};
  for (const campo of MICROS_RACION) {
    if (n[campo] == null) continue;
    micros[campo] = n[campo];
    cobertura[campo] = n.coberturaPorCampo?.[campo] ?? 0;
  }

  // `totalGrams` es de la receta entera; la ración es lo que se suma al plato.
  const masa = n.totalGrams > 0 ? n.totalGrams / raciones : 0;
  const out = { micros, cobertura, masa };
  cache.set(side.id, out);
  return out;
}

/**
 * Funde los micros de un acompañamiento en los `macros` de una receta de
 * frontend, ponderando la cobertura por masa.
 *
 * Muta `macros` y lo devuelve, igual que hacen `applyGarnishToRecipe` y
 * `applySauceToRecipe` con el resto del plato.
 *
 * @param {Object} macros - `fr.macros`, con los micros y `cobertura`
 * @param {number} masaPlato - gramos por ración del plato base; 0 o `null` si
 *   no se conoce, y entonces la cobertura se deja como estaba (ver abajo)
 * @param {Object} aporte - lo que devuelve `aporteDe`
 */
export function fundirMicros(macros, masaPlato, aporte) {
  if (!macros || !aporte) return macros;

  for (const campo of MICROS_RACION) {
    const dePlato = macros[campo];
    const deLado = aporte.micros[campo];
    if (dePlato == null && deLado == null) continue;

    // La suma es directa: los dos están por ración y en la misma unidad.
    const decimales = decimalesDe(campo);
    macros[campo] = redondear((dePlato ?? 0) + (deLado ?? 0), decimales);

    // Y la cobertura, ponderada por masa. Sin masa del plato no se inventa un
    // peso: se conserva la del plato, que es la que ya se estaba publicando.
    // Es peor que ponderar, pero no es falso — y el hueco se ve en el código
    // en vez de esconderse en un número.
    if (!macros.cobertura) continue;
    const cPlato = macros.cobertura[campo];
    const cLado = aporte.cobertura[campo] ?? 0;
    if (cPlato == null) continue;
    if (!(masaPlato > 0) || !(aporte.masa > 0)) continue;
    const fundida = (cPlato * masaPlato + cLado * aporte.masa) / (masaPlato + aporte.masa);
    macros.cobertura[campo] = Math.round(fundida * 1000) / 1000;
  }

  return macros;
}

const POR_NOMBRE = Object.fromEntries(
  CAMPOS_SECUNDARIOS.map((c) => [NUTRIENTES[c].porRacion, NUTRIENTES[c].decimales]),
);
const decimalesDe = (campo) => POR_NOMBRE[campo] ?? 1;
const redondear = (v, d) => {
  const f = 10 ** d;
  return Math.round(v * f) / f;
};
