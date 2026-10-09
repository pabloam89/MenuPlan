#!/usr/bin/env node
/**
 * El registro de normas y sus cifras (#296).
 *
 *   npm run normas                 recuento del registro y palabras fuertes sin
 *                                  citar norma, por fichero (solo informa)
 *   npm run normas -- --fondo      las cifras del fondo (#185), con red
 *
 * Lo que bloquea un PR es scripts/normas-pr.mjs (en tests.yml), que mira solo
 * las líneas añadidas. Esto es para mirar el conjunto; la cifra total la vigila
 * `npm run planos` cada semana.
 */
import { resolve } from "node:path";
import { leerRegistro, medirFondo, medirFrases, recuento, totalFrases } from "./lib/normas.mjs";
import { leerIssuesGh } from "./lib/planos.mjs";

const RAIZ = resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);

if (args.includes("--fondo")) {
  const m = medirFondo(leerIssuesGh());
  for (const [k, v] of Object.entries(m)) console.log(`fondo ${k}: ${v}`);
  process.exit(0);
}

const registro = leerRegistro(RAIZ);
const ids = new Set(registro.normas.map((n) => n.id));
const r = recuento(registro.normas);
console.log(`normas total: ${r.total} ${Object.entries(r.veredicto).map(([k, v]) => `${k}: ${v}`).join(" ")}`);
console.log(`normas riesgo ${Object.entries(r.riesgo).map(([k, v]) => `${k}: ${v}`).join(" ")}`);
const { actual, citasMalas } = medirFrases(RAIZ, ids);
console.log(`normas_frases sin_cita: ${totalFrases(actual)} ficheros: ${Object.keys(actual).length} citas_malas: ${citasMalas.length}`);
for (const [ruta, cuenta] of Object.entries(actual)) console.log(`  ${ruta}: ${Object.entries(cuenta).map(([k, v]) => `${k} ${v}`).join(", ")}`);
for (const c of citasMalas) console.log(`  cita a una norma que no existe: ${c}`);
