/**
 * El producto del súper para una línea de la compra o de una receta.
 *
 * Primero la decisión guardada (src/data/productoPorIngrediente.json): el
 * nombre de la línea se resuelve a su ingrediente y se busca su fila, la del
 * alias exacto si la hay y si no la del ingrediente. Solo lo que no tiene fila
 * —lo que escribe la familia a mano, un ingrediente aún sin decidir— cae al
 * emparejador por nombre (productMatcher.js).
 *
 * Cada línea sale con un `estado` de un vocabulario cerrado, para poder contar
 * por qué falta un producto en vez de ver solo que falta.
 */
import tabla from "../data/productoPorIngrediente.json" with { type: "json" };
import { ENCAJE_PRODUCTO } from "../data/productoSchema.js";
import { normalizeName } from "./ingredientCategories.js";
import { MATCH_HIGH, matchProductForIngredient } from "./productMatcher.js";
import { resolveIngredientId } from "./ingredients.js";

/**
 * Por qué una línea tiene o no tiene producto.
 *   decidido           su fila lo dice y el producto está en el catálogo de la semana.
 *   emparejado         sin fila: el emparejador por nombre lo encontró con confianza.
 *   no_lo_vende        su fila dice que el súper no lo tiene (mismo valor que el encaje).
 *   no_se_compra       su fila dice que no se compra (mismo valor que el encaje).
 *   falta_esta_semana  su fila tiene producto, pero esta semana no está en el catálogo.
 *   sin_producto       sin fila y el emparejador no encontró nada seguro.
 */
export const ESTADOS_PRODUCTO_LINEA = [
  "decidido", "emparejado", ENCAJE_PRODUCTO.NO_LO_VENDE, ENCAJE_PRODUCTO.NO_SE_COMPRA, "falta_esta_semana", "sin_producto",
];
export const ESTADO_PRODUCTO_LINEA = Object.freeze(
  Object.fromEntries(ESTADOS_PRODUCTO_LINEA.map((v) => [v.toUpperCase(), v])),
);

const clave = (ingredientId, alias, supermercado) => `${supermercado}|${ingredientId}|${alias == null ? "" : normalizeName(alias)}`;

const INDICES = new WeakMap();
function indiceDeFilas(filas) {
  let i = INDICES.get(filas);
  if (!i) {
    i = new Map(filas.map((f) => [clave(f.ingredientId, f.alias, f.supermercado), f]));
    INDICES.set(filas, i);
  }
  return i;
}
const PRODUCTOS = new WeakMap();
function productoPorId(productos) {
  let i = PRODUCTOS.get(productos);
  if (!i) {
    i = new Map(productos.map((p) => [String(p.id), p]));
    PRODUCTOS.set(productos, i);
  }
  return i;
}

/** La fila que decide esta línea, o null: la del alias exacto antes que la del ingrediente. */
export function filaDeLinea(nombre, { supermercado = "Mercadona", filas = tabla.filas, resolver = resolveIngredientId } = {}) {
  const ingredientId = resolver(nombre);
  if (!ingredientId) return null;
  const idx = indiceDeFilas(filas);
  return idx.get(clave(ingredientId, nombre, supermercado)) ?? idx.get(clave(ingredientId, null, supermercado)) ?? null;
}

/**
 * @param {string} nombre la línea tal como la escribe la receta o la familia
 * @param {import('./productMatcher.js').StoreProduct[]} productos el catálogo de la semana
 * @returns {{ estado: string, product: object|null, fila: object|null, confidence: number|null }}
 */
export function productoDeLinea(nombre, productos = [], {
  supermercado = "Mercadona", filas = tabla.filas, resolver = resolveIngredientId, emparejar = matchProductForIngredient,
} = {}) {
  const fila = filaDeLinea(nombre, { supermercado, filas, resolver });
  if (fila) {
    if (fila.productId == null) return { estado: fila.encaje, product: null, fila, confidence: null };
    const product = productoPorId(productos).get(fila.productId) ?? null;
    return product
      ? { estado: ESTADO_PRODUCTO_LINEA.DECIDIDO, product, fila, confidence: 1 }
      : { estado: ESTADO_PRODUCTO_LINEA.FALTA_ESTA_SEMANA, product: null, fila, confidence: null };
  }
  const m = emparejar(nombre, productos);
  if (m?.product && m.confidence >= MATCH_HIGH) {
    return { estado: ESTADO_PRODUCTO_LINEA.EMPAREJADO, product: m.product, fila: null, confidence: m.confidence };
  }
  return { estado: ESTADO_PRODUCTO_LINEA.SIN_PRODUCTO, product: null, fila: null, confidence: m?.confidence ?? null };
}
