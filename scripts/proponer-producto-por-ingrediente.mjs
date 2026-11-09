/**
 * Propone filas para src/data/productoPorIngrediente.json. No escribe la tabla:
 * saca la propuesta para revisarla, y lo revisado se copia a la tabla.
 *
 *   npx vite-node scripts/proponer-producto-por-ingrediente.mjs [--salida propuesta.json] [--todos]
 *
 * Por cada ingrediente que usa una receta estrella (con --todos, todos los de
 * ingredients.json) que aún no tiene fila, junta sus maneras de escribirlo en
 * las recetas y prueba el emparejador con cada una. Saca los tres mejores
 * candidatos y, si dos maneras de escribirlo caen en productos distintos con
 * confianza, lo marca como `variantes` para decidir si hace falta una fila por
 * alias.
 */
import fs from "node:fs";

import ingredients from "../src/data/ingredients.json" with { type: "json" };
import tabla from "../src/data/productoPorIngrediente.json" with { type: "json" };
import { MATCH_HIGH, matchProductsForIngredient, productIndexFor } from "../src/lib/productMatcher.js";
import { lineasEstrella, productosMercadona } from "./lib/recetarioYCatalogo.mjs";

const args = process.argv.slice(2);
const todos = args.includes("--todos");
let salida = null;
if (args.includes("--salida")) {
  salida = args[args.indexOf("--salida") + 1];
  if (!salida || salida.startsWith("--")) throw new Error("--salida necesita la ruta del fichero");
}

const productos = productosMercadona();
productIndexFor(productos);

// Maneras de escribir cada ingrediente en las recetas estrella, con cuántas líneas.
const maneras = new Map();
for (const l of lineasEstrella()) {
  const m = maneras.get(l.ingredientId) ?? new Map();
  m.set(l.name, (m.get(l.name) ?? 0) + 1);
  maneras.set(l.ingredientId, m);
}

const decididos = new Set(tabla.filas.filter((f) => f.alias == null).map((f) => `${f.supermercado}|${f.ingredientId}`));
const corto = (h) => ({ productId: h.product.id, nombre: h.product.name, confianza: Number(h.confidence.toFixed(2)), via: h.via });

const propuesta = [];
for (const ing of ingredients) {
  if (!todos && !maneras.has(ing.id)) continue;
  if (decididos.has(`Mercadona|${ing.id}`)) continue;
  const nombres = [...new Map([[ing.name, 0], ...(maneras.get(ing.id) ?? [])]).entries()];
  const porNombre = nombres.map(([nombre, lineas]) => {
    const hits = matchProductsForIngredient(nombre, productos, { limit: 3 });
    return { nombre, lineas, candidatos: hits.map(corto) };
  });
  const seguros = new Set(porNombre.map((n) => n.candidatos[0]).filter((c) => c && c.confianza >= MATCH_HIGH).map((c) => c.productId));
  propuesta.push({
    ingredientId: ing.id,
    nombre: ing.name,
    lineas: nombres.reduce((s, [, n]) => s + n, 0),
    variantes: seguros.size > 1,
    porNombre,
  });
}
propuesta.sort((a, b) => b.lineas - a.lineas);

const resumen = {
  ingredientes: propuesta.length,
  conCandidatoSeguro: propuesta.filter((p) => p.porNombre.some((n) => n.candidatos[0]?.confianza >= MATCH_HIGH)).length,
  variantes: propuesta.filter((p) => p.variantes).length,
};
console.log(resumen);
if (salida) fs.writeFileSync(salida, JSON.stringify(propuesta, null, 1));
