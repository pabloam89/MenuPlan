#!/usr/bin/env node
/**
 * El inventario del diccionario (#939, fase 1): conceptos, en cuántos sitios
 * vive cada uno y lo que no cuadra. Solo lee código; no llama a nadie.
 *
 *   npm run diccionario:inventario            resumen y fallos
 *   npm run diccionario:inventario -- --json  todo, en JSON
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as receta from "../src/data/recipeSchema.js";
import * as ejes from "../src/data/axisRegistry.js";
import * as pedible from "../api/_bot/esquemas.js";
import * as clasificador from "../api/_bot/router.js";
import * as vocabularios from "../src/lib/vocabularios.js";
import * as ficha from "../src/lib/registroCampos.js";
import * as comidas from "../src/lib/comidas.js";
import * as nutrientes from "../src/data/nutrientes.js";
import * as familias from "../src/lib/notepadFields.js";
import { apariciones, inventario, copiasLiterales, cifras } from "./lib/inventarioDiccionario.mjs";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const aps = apariciones({ receta, ejes, pedible, clasificador, vocabularios, ficha, comidas, nutrientes, familias });
const inv = inventario(aps);
const fallos = [...inv.fallos, ...copiasLiterales(aps, raiz)];

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ ...inv, fallos, cifras: cifras(fallos) }, null, 1));
} else {
  const varios = inv.conceptos.filter((c) => c.fuentes.length > 1);
  console.log(`Conceptos del dominio: ${inv.conceptos.length} (en más de un sitio: ${varios.length}); de sistema, aparte: ${inv.sistema.length}.`);
  for (const c of varios) console.log(`  ${c.concepto}: ${c.apariciones.join(", ")}`);
  console.log("\nFallos:", JSON.stringify(cifras(fallos)));
  for (const f of fallos) console.log(`  [${f.fallo}] ${f.concepto}: ${f.detalle}${f.sobran ? `  sobran ${JSON.stringify(f.sobran)}, faltan ${JSON.stringify(f.faltan)}` : ""}`);
  console.log("\nRecortes (a la copia le faltan valores; no cuentan):");
  for (const r of inv.recortes) console.log(`  ${r.concepto}: ${r.copia} ⊂ ${r.dueno} (faltan ${r.faltan.join(", ")})`);
}
