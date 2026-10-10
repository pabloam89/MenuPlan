// flujo.mjs — el flujo de una incidencia, de un vistazo (#335).
//
//   npm run flujo                 resumen: pasos, dureza de cada uno y qué los endurece
//   npm run flujo -- --json       lo mismo para máquinas
//   npm run flujo -- --escribir   regenera las tablas de docs/ops/FLUJO.md desde ops/flujo.json
//                                 y docs/ops/ENCARGO.md desde scripts/lib/issues.mjs (#338)
//
// La dureza de un paso es la de su obligación más débil. Lo que sale aquí es lo
// que dice ops/flujo.json; ops/flujo.test.js comprueba que es verdad.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { cuentaPorDureza, durezaDelPaso, regenerar } from "./lib/flujo.mjs";
import { formatoEncargoMd } from "./lib/issues.mjs";
import { generarTabla } from "./lib/presupuestos.mjs";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RUTA_JSON = join(RAIZ, "ops/flujo.json");
const RUTA_MD = join(RAIZ, "docs/ops/FLUJO.md");
const RUTA_ENCARGO = join(RAIZ, "docs/ops/ENCARGO.md");
const args = process.argv.slice(2);

const datos = JSON.parse(readFileSync(RUTA_JSON, "utf8"));

if (args.includes("--escribir")) {
  writeFileSync(RUTA_MD, regenerar(readFileSync(RUTA_MD, "utf8"), datos, generarTabla()));
  console.log("Tablas de docs/ops/FLUJO.md regeneradas desde ops/flujo.json y ops/presupuestos.json.");
  writeFileSync(RUTA_ENCARGO, formatoEncargoMd());
  console.log("docs/ops/ENCARGO.md regenerado desde scripts/lib/issues.mjs.");
}

const filas = datos.pasos.map((p) => ({
  paso: p.id,
  dureza: durezaDelPaso(p),
  obligaciones: p.obligaciones.length,
  blandas: p.obligaciones.filter((o) => o.dureza !== "dura").length,
  fases: [...new Set(p.obligaciones.flatMap((o) => o.fase))].sort(),
}));

if (args.includes("--json")) {
  console.log(JSON.stringify({ pasos: filas, cuenta: cuentaPorDureza(datos) }, null, 2));
} else {
  for (const f of filas) {
    console.log(`${f.paso.padEnd(16)} ${f.dureza.padEnd(9)} ${String(f.obligaciones).padStart(2)} obligaciones, ${f.blandas} sin ser duras   ${f.fases.join(" ")}`);
  }
  const c = cuentaPorDureza(datos);
  console.log(`\n${Object.values(c).reduce((a, b) => a + b, 0)} obligaciones: ${c.dura} duras, ${c.semidura} semiduras, ${c.blanda} blandas, ${c.rota} rotas.`);
}
