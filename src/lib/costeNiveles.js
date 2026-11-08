/**
 * Los niveles de coste por ración: el vocabulario, sin el cálculo.
 *
 * Vive aparte de `coste.js` porque aquél carga derived/recipeCoste.json, y lo
 * pedible de Lola (api/_bot/esquemas.js) y el registro de ejes solo necesitan
 * saber qué niveles existen (#939). Los umbrales siguen en `coste.js`.
 */
export const NIVELES_COSTE = ["economico", "medio", "caro"];
