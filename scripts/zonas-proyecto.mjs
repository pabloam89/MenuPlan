/**
 * zonas-proyecto.mjs — la cifra «ficheros por zona» (#652): cuántos ficheros del repo son de
 * la factoría, del producto o de los dos, según `ops/zonas.json`. Sin red.
 *
 *   npm run zonas-proyecto            las líneas de la cifra y, si falta alguno, qué ficheros no tienen zona
 *   npm run zonas-proyecto -- --lista <zona>   los ficheros de una zona (para revisar una regla)
 *
 * Salida: `zonas-proyecto zona: <zona> ficheros: n` por zona y
 * `zonas-proyecto total: n sin_zona: n`. Sale 1 si algún fichero no tiene zona.
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { ficherosDeGit } from "../ops/ficherosGit.js";
import { ZONAS, clasificar, compilar, contarPorZona, leerZonas, lineasDeZonas } from "./lib/zonasProyecto.mjs";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function main(argv = process.argv.slice(2), raiz = RAIZ) {
  const c = compilar(leerZonas(raiz));
  const rutas = ficherosDeGit(raiz);
  const i = argv.indexOf("--lista");
  if (i >= 0) {
    const z = argv[i + 1];
    if (!ZONAS.includes(z)) { console.error(`zonas-proyecto: la zona es una de ${ZONAS.join(", ")}`); return 2; }
    for (const r of rutas) if (clasificar(r, c).zona === z) console.log(r);
    return 0;
  }
  const cuenta = contarPorZona(rutas, c);
  for (const l of lineasDeZonas(cuenta)) console.log(l);
  if (cuenta.sin_zona) {
    console.error(`Sin zona (${cuenta.sin_zona}): añade una regla a ops/zonas.json.`);
    for (const r of cuenta.sin.slice(0, 20)) console.error(`  ${r}`);
    return 1;
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(main());
