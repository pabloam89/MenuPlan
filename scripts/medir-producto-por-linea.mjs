/**
 * Cuántas líneas de las recetas estrella salen en cada estado de producto
 * (ESTADOS_PRODUCTO_LINEA de src/lib/productoDeLinea.js): la cifra de antes y
 * después de rellenar src/data/productoPorIngrediente.json.
 *
 *   npx vite-node scripts/medir-producto-por-linea.mjs [--sin-tabla]
 *
 * --sin-tabla mide con la tabla vacía: lo que daba el emparejador solo.
 */
import { ESTADOS_PRODUCTO_LINEA, DINERO_DE_MAS_MAX, envaseDesproporcionado, productoDeLinea } from "../src/lib/productoDeLinea.js";
import { gramsForRecipeQuantity } from "../src/lib/kitchenUnits.js";
import { productIndexFor } from "../src/lib/productMatcher.js";
import { lineasEstrella, productosMercadona } from "./lib/recetarioYCatalogo.mjs";

const sinTabla = process.argv.includes("--sin-tabla");
const productos = productosMercadona();
productIndexFor(productos);

const porEstado = Object.fromEntries(ESTADOS_PRODUCTO_LINEA.map((e) => [e, 0]));
const nombres = Object.fromEntries(ESTADOS_PRODUCTO_LINEA.map((e) => [e, new Set()]));
const opciones = sinTabla ? { filas: [] } : {};
// Lo que pide cada línea en una compra de casa (4 raciones), para ver si el
// envase elegido tiene sentido: una receta de bebé de una ración pide 30 g.
const RACIONES_DE_REFERENCIA = 4;
const desproporcionados = new Set();
let lineas = 0;
for (const l of lineasEstrella()) {
  const g = gramsForRecipeQuantity(l.name, Number(l.amount), l.unit);
  const gramos = g > 0 ? (g * RACIONES_DE_REFERENCIA) / (l.raciones || RACIONES_DE_REFERENCIA) : null;
  const { estado, product } = productoDeLinea(l.name, productos, { ...opciones, gramos });
  porEstado[estado]++;
  nombres[estado].add(l.name);
  if (product && gramos && envaseDesproporcionado(product, gramos)) desproporcionados.add(`${l.name} → ${product.name}`);
  lineas++;
}
console.log(`líneas de recetas estrella: ${lineas}${sinTabla ? " (sin tabla)" : ""}`);
console.log("estado               líneas   %     nombres distintos");
for (const e of ESTADOS_PRODUCTO_LINEA) {
  console.log(`${e.padEnd(20)} ${String(porEstado[e]).padStart(6)} ${(100 * porEstado[e] / lineas).toFixed(1).padStart(5)}   ${nombres[e].size}`);
}
console.log(`envase desproporcionado (${DINERO_DE_MAS_MAX} € o más de lo pedido a 4 raciones): ${desproporcionados.size}`);
for (const d of desproporcionados) console.log(`  ${d}`);
