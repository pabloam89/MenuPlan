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
import { MATCH_HIGH, matchProductsForIngredient } from "./productMatcher.js";
import { resolveIngredientId } from "./ingredients.js";
import { porNombre } from "./vocabularios.js";

/**
 * Por qué una línea tiene o no tiene producto.
 *   decidido           su fila lo dice y el producto está en el catálogo de la semana.
 *   emparejado         sin fila: el emparejador por nombre lo encontró con confianza.
 *   no_lo_vende        su fila dice que el súper no lo tiene (mismo valor que el encaje).
 *   no_se_compra       su fila dice que no se compra (mismo valor que el encaje).
 *   falta_esta_semana  su fila tiene producto, pero esta semana no está en el catálogo.
 *   sin_producto       sin fila, y el emparejador no encontró nada seguro o solo
 *                      envases desproporcionados para lo que se pide.
 */
export const ESTADOS_PRODUCTO_LINEA = [
  "decidido", "emparejado", ENCAJE_PRODUCTO.NO_LO_VENDE, ENCAJE_PRODUCTO.NO_SE_COMPRA, "falta_esta_semana", "sin_producto",
];
export const ESTADO_PRODUCTO_LINEA = porNombre(ESTADOS_PRODUCTO_LINEA);

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
 * Lo que se paga de más por comprar el envase entero cuando se necesitan
 * `gramos`: el precio del envase menos lo que valen esos gramos a granel. Un
 * jamón entero de 6,8 kg a 58 € para 100 g son 57 € de más; una botella de
 * aceite de 1 l para 30 ml, menos de 5 €.
 * Null cuando no se puede saber: sin precio a granel, o un producto que se
 * vende por pieza y no por peso o volumen.
 */
export function dineroDeMas(product, gramos) {
  const precio = Number(product?.price);
  const granel = Number(product?.bulkPrice);
  const formato = String(product?.unitFormat ?? "").toLowerCase();
  if (!(precio > 0) || !(granel > 0) || !(gramos > 0) || !FORMATOS_A_GRANEL.has(formato)) return null;
  return precio - (granel * gramos) / 1000;
}
const FORMATOS_A_GRANEL = new Set(["kg", "g", "l", "ml"]);

/** A partir de cuántos euros de más un envase no tiene sentido para lo que se pide. */
export const DINERO_DE_MAS_MAX = 10;

/** ¿El envase cuesta DINERO_DE_MAS_MAX o más de lo que vale lo pedido? Sin dato para saberlo, no se marca. */
export function envaseDesproporcionado(product, gramos) {
  const demas = dineroDeMas(product, gramos);
  return demas != null && demas >= DINERO_DE_MAS_MAX;
}

/**
 * @param {string} nombre la línea tal como la escribe la receta o la familia
 * @param {import('./productMatcher.js').StoreProduct[]} productos el catálogo de la semana
 * @param {{ gramos?: number|null }} [opciones] `gramos`, lo que pide la línea: sin fila, el
 *   emparejador descarta los envases desproporcionados para esa cantidad
 * @returns {{ estado: string, product: object|null, fila: object|null, confidence: number|null }}
 */
export function productoDeLinea(nombre, productos = [], {
  supermercado = "Mercadona", filas = tabla.filas, resolver = resolveIngredientId, candidatos = matchProductsForIngredient, gramos = null,
} = {}) {
  const fila = filaDeLinea(nombre, { supermercado, filas, resolver });
  if (fila) {
    if (fila.productId == null) return { estado: fila.encaje, product: null, fila, confidence: null };
    const product = productoPorId(productos).get(fila.productId) ?? null;
    return product
      ? { estado: ESTADO_PRODUCTO_LINEA.DECIDIDO, product, fila, confidence: 1 }
      : { estado: ESTADO_PRODUCTO_LINEA.FALTA_ESTA_SEMANA, product: null, fila, confidence: null };
  }
  // Sin fila: entre los que casan por nombre con confianza, el primero cuyo
  // envase tenga sentido para lo que se pide (el jamón de 6,8 kg salió de aquí).
  const m = candidatos(nombre, productos, { limit: CANDIDATOS, minConfidence: MATCH_HIGH })
    .find((c) => !envaseDesproporcionado(c.product, gramos));
  return m
    ? { estado: ESTADO_PRODUCTO_LINEA.EMPAREJADO, product: m.product, fila: null, confidence: m.confidence }
    : { estado: ESTADO_PRODUCTO_LINEA.SIN_PRODUCTO, product: null, fila: null, confidence: null };
}
/** Cuántos candidatos por nombre mira el emparejador antes de rendirse. */
const CANDIDATOS = 5;
