/**
 * inventario-vertical.mjs — cuánto hay de cada lado (horizontal / vertical / duda) en cada capa del repo (#710).
 *
 *   npm run inventario-vertical               la tabla por capa, una línea por capa con sus cuatro cifras
 *   npm run inventario-vertical -- --escribir  reescribe docs/ops/INVENTARIO-VERTICAL.md (instantánea fechada)
 *
 * Sin red. Cómo se mide cada capa, en scripts/lib/inventarioVertical.mjs.
 */
import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { RUTA_DOC, calcular, documento } from "./lib/inventarioVertical.mjs";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function main(argv = process.argv.slice(2), raiz = RAIZ) {
  const d = calcular(raiz);
  for (const f of d.filas) console.log(`${f.unidad} | total ${f.total} | horizontal ${f.horizontal} | vertical ${f.vertical} | duda ${f.duda}`);
  if (argv.includes("--escribir")) {
    const fecha = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });
    writeFileSync(join(raiz, RUTA_DOC), documento(d, fecha), "utf8");
    console.log(`Escrito ${RUTA_DOC}`);
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(main());
