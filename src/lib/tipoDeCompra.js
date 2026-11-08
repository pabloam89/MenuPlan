/**
 * Si una línea de la compra es de fondo de armario o de receta. La decisión
 * está en src/data/fondoDeArmario.json (criterio en fondoDeArmarioSchema.js);
 * aquí solo se resuelve el nombre de la línea a su ingrediente y se mira la
 * tabla. Lo que no resuelve a un ingrediente del catálogo es de receta: mejor
 * enseñarlo en la compra que darlo por hecho.
 */
import tabla from "../data/fondoDeArmario.json";
import { TIPO_DE_COMPRA } from "../data/fondoDeArmarioSchema.js";
import { resolveIngredientId } from "./ingredients.js";

const FONDO = new Set(tabla.filas.map((f) => f.ingredientId));

/** @returns {"fondo_de_armario" | "receta"} */
export function tipoDeCompra(nombre, { resolver = resolveIngredientId } = {}) {
  const id = nombre ? resolver(nombre) : null;
  return id && FONDO.has(id) ? TIPO_DE_COMPRA.FONDO_DE_ARMARIO : TIPO_DE_COMPRA.RECETA;
}

/**
 * Las líneas de la compra en dos partes: las de receta, en su orden, y las de
 * fondo de armario, por nombre. Es lo que pinta la pestaña Compra.
 */
export function separarFondo(items, opciones) {
  const receta = [];
  const fondo = [];
  for (const it of items ?? []) {
    (tipoDeCompra(it?.name, opciones) === TIPO_DE_COMPRA.FONDO_DE_ARMARIO ? fondo : receta).push(it);
  }
  fondo.sort((a, b) => String(a.name).localeCompare(String(b.name), "es"));
  return { receta, fondo };
}
