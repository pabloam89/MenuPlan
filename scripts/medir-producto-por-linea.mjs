/**
 * Cuántas líneas de las recetas estrella salen en cada estado de producto
 * (ESTADOS_PRODUCTO_LINEA de src/lib/productoDeLinea.js): la cifra de antes y
 * después de rellenar src/data/productoPorIngrediente.json.
 *
 *   npx vite-node scripts/medir-producto-por-linea.mjs [--sin-tabla]
 *
 * --sin-tabla mide con la tabla vacía: lo que daba el emparejador solo.
 */
import fs from "node:fs";
import path from "node:path";

import { ESTADOS_PRODUCTO_LINEA, productoDeLinea } from "../src/lib/productoDeLinea.js";
import { productIndexFor } from "../src/lib/productMatcher.js";

const ROOT = path.resolve(import.meta.dirname, "..");
const sinTabla = process.argv.includes("--sin-tabla");
const productos = JSON.parse(fs.readFileSync(path.join(ROOT, "public/store/mercadona.json"), "utf8")).products;
productIndexFor(productos);

const porEstado = Object.fromEntries(ESTADOS_PRODUCTO_LINEA.map((e) => [e, 0]));
const nombres = Object.fromEntries(ESTADOS_PRODUCTO_LINEA.map((e) => [e, new Set()]));
const opciones = sinTabla ? { filas: [] } : {};
const dir = path.join(ROOT, "src/data/recipes");
let lineas = 0;
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) {
  const j = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
  for (const r of Array.isArray(j) ? j : (j.recipes ?? Object.values(j))) {
    if (!r?.estrella) continue;
    for (const l of r.ingredients ?? []) {
      const { estado } = productoDeLinea(l.name, productos, opciones);
      porEstado[estado]++;
      nombres[estado].add(l.name);
      lineas++;
    }
  }
}
console.log(`líneas de recetas estrella: ${lineas}${sinTabla ? " (sin tabla)" : ""}`);
console.log("estado               líneas   %     nombres distintos");
for (const e of ESTADOS_PRODUCTO_LINEA) {
  console.log(`${e.padEnd(20)} ${String(porEstado[e]).padStart(6)} ${(100 * porEstado[e] / lineas).toFixed(1).padStart(5)}   ${nombres[e].size}`);
}
