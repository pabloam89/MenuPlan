/**
 * Un solo lector de nutrientes para un plato, venga como venga.
 *
 * Un plato llega con dos formas y las dos están vivas:
 *   · plana, la del catálogo y las recetas de usuario: `protein_g`, `iron_mg`…
 *     y la cobertura de los micros en `micronutrientesCobertura`;
 *   · runtime, la de `catalogToFrontendRecipe` (RECIPES_BY_ID, los snapshots
 *     del menú): `kcal` arriba, el resto en `macros` (los 7 declarados con
 *     alias, `macros.protein`…, y los micros con su nombre) y la cobertura en
 *     `macros.cobertura`.
 * Leer solo una de las dos es lo que dejó «más carbos» contestando siempre
 * «no sé»: el plato de ahora venía en runtime y se le pedía `protein_g`.
 */

import { NUTRIENTES, POR_RACION } from "../data/nutrientes.js";
import { recipeCatalogById } from "../data/recipeCatalog.js";
import { stripGroupPrefix } from "./aiPlanner.js";

const ALIAS = {
  protein_g: "protein",
  carbs_g: "carbs",
  fat_g: "fat",
  fiber_g: "fiber",
  sugar_g: "sugar",
  saturated_fat_g: "saturatedFat",
  sodium_mg: "sodium",
};

export const CAMPOS_PLATO = Object.values(POR_RACION);
const CAMPOS = new Set(CAMPOS_PLATO);
// Los ocho que declara la receta no traen cobertura: o están o no están.
const DECLARADOS = new Set(
  Object.entries(NUTRIENTES)
    .filter(([clave, n]) => n.duro || ["fiber100g", "sugar100g", "saturatedFat100g", "sodium100g"].includes(clave))
    .map(([, n]) => n.porRacion),
);

const numero = (v) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

/**
 * @param {object} plato
 * @param {string} campo nombre por ración de src/data/nutrientes.js, o "kcal"
 * @returns {{ valor: number|null, cobertura: number|null, motivo: null|"sin_dato"|"cobertura"|"campo_desconocido" }}
 */
export function nutrienteDe(plato, campo, { umbralCobertura = 0.8 } = {}) {
  if (!CAMPOS.has(campo)) return { valor: null, cobertura: null, motivo: "campo_desconocido" };
  const macros = plato?.macros ?? {};
  const valor = numero(plato?.[campo]) ?? (campo === "kcal" ? null : numero(macros[ALIAS[campo] ?? campo]));
  if (valor === null) return { valor: null, cobertura: null, motivo: "sin_dato" };
  if (DECLARADOS.has(campo)) return { valor, cobertura: 1, motivo: null };
  const cobertura = numero(plato?.micronutrientesCobertura?.[campo]) ?? numero(macros.cobertura?.[campo]);
  // Sin cobertura apuntada no se inventa: se da el valor y la cobertura queda null.
  if (cobertura !== null && cobertura < umbralCobertura) return { valor: null, cobertura, motivo: "cobertura" };
  return { valor, cobertura, motivo: null };
}

/** Los 32 de golpe, en forma plana, con null donde no hay valor fiable. */
export function vectorDe(plato, opciones) {
  const vector = { cobertura: {} };
  for (const campo of CAMPOS_PLATO) {
    const n = nutrienteDe(plato, campo, opciones);
    vector[campo] = n.valor;
    vector.cobertura[campo] = n.cobertura;
  }
  return vector;
}

/**
 * La receta base, en forma plana, de un plato: la que entienden densidadDe,
 * cargaDe y completitudDe. Se compara base contra base porque el plato de ahora
 * puede llevar fundida una guarnición en `macros` y las candidatas no.
 * @param {{ userRecipes?: object[] }} [opciones]
 */
export function crudoDe(plato, { userRecipes = [] } = {}) {
  if (!plato) return plato;
  const id = plato.baseRecipeId ?? stripGroupPrefix(plato.id);
  return recipeCatalogById[id] ?? userRecipes.find((r) => r.id === id) ?? plato;
}
