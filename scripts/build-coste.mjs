/**
 * Genera src/data/derived/recipeCoste.json: el coste por ración de cada
 * receta con los precios de Mercadona (src/lib/derive/coste.js).
 *
 *   npm run build:coste
 *
 * Aparte de build-derived.mjs a propósito: los precios cambian cada semana
 * (sync:mercadona) y el catálogo no. Meterlos en el hash de build-derived
 * haría saltar derived.test.js cada lunes sin que nadie hubiera tocado una
 * receta. Por eso sync:mercadona lo regenera al acabar.
 *
 * Corre con Node a secas a través del núcleo del bot (api/_bot/core.mjs, que
 * scripts/build-bot-core.mjs empaqueta con Vite resuelto): los módulos de
 * src/ importan JSON sin atributos y Node 24 no los carga directamente.
 *
 * Es el modo 'granel' de src/lib/coste.js calculado de antemano: los
 * umbrales del nivel y la cobertura mínima viven allí.
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "..");
const DESTINO = path.join(ROOT, "src/data/derived/recipeCoste.json");
const b = spawnSync(process.execPath, [path.join(ROOT, "scripts/build-bot-core.mjs")], { stdio: "inherit" });
if (b.status !== 0) process.exit(b.status ?? 1);
const m = await import(`file:///${path.join(ROOT, "api/_bot/core.mjs").replace(/\\/g, "/")}`);

const tienda = JSON.parse(fs.readFileSync(path.join(ROOT, "public/store/mercadona.json"), "utf8"));
const productos = tienda.products;

const filas = {};
for (const r of m.recipeCatalog) {
  const c = m.costeReceta(r, { modo: "granel", precios: productos });
  filas[r.id] = c
    ? { porRacion: c.porRacion, cobertura: c.cobertura, nivel: c.nivel }
    : { porRacion: null, cobertura: 0, nivel: null };
}

const estrella = m.recipeCatalog.filter((r) => r.estrella);
const conNivel = estrella.filter((r) => filas[r.id].nivel).length;
const salida = {
  _meta: {
    operador: "costeReceta modo granel (src/lib/coste.js)",
    precios: `Mercadona, ${tienda.fetchedAt ?? "fecha desconocida"}, ${productos.length} productos`,
    umbrales: m.UMBRALES,
    coberturaMinima: m.COBERTURA_MINIMA,
    estrellaConNivel: `${conNivel}/${estrella.length}`,
  },
  recetas: filas,
};
fs.writeFileSync(DESTINO, `${JSON.stringify(salida, null, 2)}\n`);
console.log(`recipeCoste.json: ${Object.keys(filas).length} recetas; estrella con nivel ${conNivel}/${estrella.length}.`);
