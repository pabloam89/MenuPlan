#!/usr/bin/env node
// catalogos.mjs — los catálogos partidos en un fichero por entrada (#505; formato en scripts/lib/catalogos.mjs).
//
//   node scripts/catalogos.mjs                         lee cada catálogo partido y dice cuántas entradas tiene
//                                                      cada colección (sale con 1 si alguno no se puede componer)
//   node scripts/catalogos.mjs --ver <carpeta>         el catálogo entero, compuesto, como un JSON (para leerlo o
//                                                      pasarlo a otra herramienta; no se guarda: la carpeta es la fuente)
//   node scripts/catalogos.mjs --partir <fichero.json> <seccion>=<clave> | <seccion>=mapa ...
//                                                      parte un JSON en <fichero sin .json>/: cada <seccion> lista,
//                                                      un fichero por entrada con su <clave>; cada mapa, uno por clave.
//                                                      No borra el fichero viejo: eso va en el mismo commit, con git rm,
//                                                      junto con su entrada en CATALOGOS.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { CATALOGOS, componer, escribirPartido, leerCatalogo, partir } from "./lib/catalogos.mjs";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);

if (args[0] === "--ver") {
  if (!args[1]) { console.error("Falta la carpeta: node scripts/catalogos.mjs --ver ops/forja/"); process.exit(2); }
  console.log(JSON.stringify(leerCatalogo(RAIZ, args[1]), null, 2));
} else if (args[0] === "--partir") {
  const [fichero, ...secciones] = args.slice(1);
  if (!fichero?.endsWith(".json") || !secciones.length) { console.error("Uso: node scripts/catalogos.mjs --partir ops/x.json lista=id mapa_seccion=mapa"); process.exit(2); }
  const colecciones = Object.fromEntries(secciones.map((s) => { const [k, v] = s.split("="); return [k, v === "mapa" ? null : v]; }));
  const objeto = JSON.parse(readFileSync(resolve(RAIZ, fichero), "utf8"));
  const ficheros = partir(objeto, colecciones);
  if (JSON.stringify(componer(ficheros)) !== JSON.stringify(objeto)) { console.error(`${fichero}: partido y vuelto a componer no da lo mismo; no escribo nada`); process.exit(1); }
  const carpeta = `${fichero.slice(0, -".json".length)}/`;
  escribirPartido(RAIZ, carpeta, ficheros);
  console.log(`Partido ${fichero} en ${carpeta} (${ficheros.size} ficheros). Bórralo con git rm y añádelo a CATALOGOS.`);
} else {
  let mal = 0;
  for (const [nombre, c] of Object.entries(CATALOGOS)) {
    try {
      const datos = leerCatalogo(RAIZ, c.carpeta);
      const cuentas = Object.entries(datos).filter(([, v]) => v && typeof v === "object").map(([k, v]) => `${k} ${Object.keys(v).length}`);
      console.log(`${c.carpeta} (${nombre}) se compone bien; entradas por sección = ${cuentas.join(", ")}`);
    } catch (e) {
      mal++;
      console.error(`${c.carpeta} (${nombre}) NO se compone = ${e.message}`);
    }
  }
  process.exitCode = mal ? 1 : 0;
}
