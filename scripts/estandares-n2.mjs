#!/usr/bin/env node
/**
 * El estándar por combinación acción × ámbitos (N2, #684). Dato: ops/estandares-n2.json.
 *
 *   npm run estandar-n2                 la cifra: combinaciones, tareas y normas de cada una
 *   npm run estandar-n2 -- --escribir   regenera ops/estandares-n2.json y pone `n2` en cada tarea de ops/estandares-agentes.json
 *   npm run estandar-n2 -- --comprobar  los problemas (los mismos que ops/estandares-n2.test.js); sale 1 si hay
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { RUTA_ESTANDARES, leerEstandares, leerNormasEn } from "./lib/estandaresAgentes.mjs";
import { RUTA_N2, conN2EnTareas, contarN2, escribirN2, generarN2, leerN2, problemasDeN2 } from "./lib/estandaresN2.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const normas = leerNormasEn(RAIZ).normas;
const args = process.argv.slice(2);

if (args.includes("--escribir")) {
  // El catálogo se reescribe desde el fichero crudo (leerEstandares le añade `fuentes`, que no se guarda ahí).
  const crudo = JSON.parse(readFileSync(join(RAIZ, RUTA_ESTANDARES), "utf8"));
  const nuevo = conN2EnTareas(crudo);
  writeFileSync(join(RAIZ, RUTA_ESTANDARES), JSON.stringify(nuevo, null, 2) + "\n");
  escribirN2(RAIZ, generarN2(nuevo, normas));
  console.log(`${RUTA_N2} regenerado y «n2» puesto en las tareas de ${RUTA_ESTANDARES}.`);
} else {
  const datos = leerEstandares(RAIZ);
  if (!existsSync(join(RAIZ, RUTA_N2))) { console.error(`Falta ${RUTA_N2}: npm run estandar-n2 -- --escribir`); process.exit(1); }
  const n2 = leerN2(RAIZ);
  if (args.includes("--comprobar")) {
    const malos = problemasDeN2(n2, datos, normas);
    for (const m of malos) console.log(m);
    console.log(`estandar-n2 problemas: ${malos.length}`);
    process.exit(malos.length ? 1 : 0);
  }
  const c = contarN2(n2, datos);
  console.log(`estandar-n2 combinaciones: ${c.combinaciones} tareas: ${c.tareas}`);
  for (const x of c.porCombinacion) console.log(`${x.id.padEnd(42)} tareas: ${x.tareas} normas: ${x.normas}`);
}
