/**
 * Lo que leen los scripts de productoPorIngrediente: las líneas de las recetas
 * estrella y el catálogo de Mercadona de la semana. En un sitio, para que los
 * dos scripts no recorran las recetas cada uno a su manera.
 *
 * Las recetas salen de src/data/recipeCatalog.js, el mismo cargador que usa la
 * app: no se adivina la forma de los ficheros de src/data/recipes.
 */
import fs from "node:fs";
import path from "node:path";

import { recipeCatalog } from "../../src/data/recipeCatalog.js";

const ROOT = path.resolve(import.meta.dirname, "../..");

/** Cada línea de cada receta estrella, con las raciones de su receta: `{ name, ingredientId, amount, unit, raciones }`. */
export function lineasEstrella() {
  return recipeCatalog.filter((r) => r.estrella).flatMap((r) => (r.ingredients ?? []).map((l) => ({ ...l, raciones: r.baseServings })));
}

/** Los productos del catálogo de Mercadona; lanza si el fichero no los trae. */
export function productosMercadona() {
  const { products } = JSON.parse(fs.readFileSync(path.join(ROOT, "public/store/mercadona.json"), "utf8"));
  if (!Array.isArray(products) || products.length === 0) throw new Error("public/store/mercadona.json sin productos");
  return products;
}
