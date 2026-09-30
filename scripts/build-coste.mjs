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
 * Nivel (solo con cobertura ≥ 0,8; si no, null: un coste a medias engaña):
 *   económico < 1 € · medio · caro > 2,5 € por ración.
 * Umbrales cerca de los percentiles 33 y 75 del Recetario Estrella a 30 sep 2026.
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "..");
const DESTINO = path.join(ROOT, "src/data/derived/recipeCoste.json");
const COBERTURA_MINIMA = 0.8;
const UMBRALES = { economico: 1, caro: 2.5 };

const b = spawnSync(process.execPath, [path.join(ROOT, "scripts/build-bot-core.mjs")], { stdio: "inherit" });
if (b.status !== 0) process.exit(b.status ?? 1);
const m = await import(`file:///${path.join(ROOT, "api/_bot/core.mjs").replace(/\\/g, "/")}`);

const tienda = JSON.parse(fs.readFileSync(path.join(ROOT, "public/store/mercadona.json"), "utf8"));
const productos = tienda.products;

const nivel = (euros, cobertura) => {
  if (euros == null || cobertura < COBERTURA_MINIMA) return null;
  if (euros < UMBRALES.economico) return "economico";
  if (euros > UMBRALES.caro) return "caro";
  return "medio";
};

const filas = {};
for (const r of m.recipeCatalog) {
  const c = m.costeDeReceta(r, productos);
  filas[r.id] = { porRacion: c.porRacion, cobertura: c.cobertura, nivel: nivel(c.porRacion, c.cobertura) };
}

const estrella = m.recipeCatalog.filter((r) => r.estrella);
const conNivel = estrella.filter((r) => filas[r.id].nivel).length;
const salida = {
  _meta: {
    operador: "costeDeReceta (src/lib/derive/coste.js)",
    precios: `Mercadona, ${tienda.fetchedAt ?? "fecha desconocida"}, ${productos.length} productos`,
    umbrales: UMBRALES,
    coberturaMinima: COBERTURA_MINIMA,
    estrellaConNivel: `${conNivel}/${estrella.length}`,
  },
  recetas: filas,
};
fs.writeFileSync(DESTINO, `${JSON.stringify(salida, null, 2)}\n`);
console.log(`recipeCoste.json: ${Object.keys(filas).length} recetas; estrella con nivel ${conNivel}/${estrella.length}.`);
