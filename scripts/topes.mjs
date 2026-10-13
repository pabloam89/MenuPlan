#!/usr/bin/env node
/**
 * Topes en caracteres y wording por tipo de texto (#689). Solo lee, salvo --escribir.
 *
 *   npm run topes                 → la tabla: por campo, n, mínimo, mediana, p95, máximo, tope y faltas de wording
 *   npm run topes -- --escribir   → baja los topes al máximo de hoy y las excepciones de wording que ya sobran
 *   npm run topes -- --sembrar    → como --escribir, y fija las excepciones de wording a lo que hay hoy (solo la primera vez)
 *
 * Una fila por campo, con su tope y su tipo de texto. Datos: ops/topes.json.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { RAIZ_REPO, RUTA_TOPES, ajustar, faltasDeWording, leerTopes, medir } from "./lib/topes.mjs";

const args = process.argv.slice(2);
const topes = leerTopes();
const medido = medir();
const faltas = faltasDeWording(RAIZ_REPO, topes);

if (args.includes("--escribir") || args.includes("--sembrar")) {
  const nuevo = ajustar(topes, medido, faltas, { sembrar: args.includes("--sembrar") });
  writeFileSync(join(RAIZ_REPO, RUTA_TOPES), `${JSON.stringify(nuevo, null, 2)}\n`);
  console.log(`Escrito ${RUTA_TOPES}: ${Object.keys(nuevo.campos).length} campos y ${Object.keys(nuevo.excepciones_wording).length} excepciones de wording.`);
} else {
  const ancho = Math.max(...Object.keys(medido).map((c) => c.length));
  console.log(`${"campo".padEnd(ancho)}    n   min  mediana   p95   max  tope  tipo`);
  for (const [c, m] of Object.entries(medido)) {
    const d = topes.campos[c];
    console.log(`${c.padEnd(ancho)} ${String(m.n).padStart(4)} ${String(m.min).padStart(5)} ${String(m.mediana).padStart(8)} ${String(m.p95).padStart(5)} ${String(m.max).padStart(5)} ${String(d?.tope ?? "-").padStart(5)}  ${d?.tipo_texto ?? "-"}`);
  }
  const total = Object.values(faltas).reduce((s, n) => s + n, 0);
  console.log(`${Object.keys(medido).length} campos medidos; ${total} textos incumplen la regla de su tipo, en ${Object.keys(faltas).length} combinaciones de campo y código.`);
}
