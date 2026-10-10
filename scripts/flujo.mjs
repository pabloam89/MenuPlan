// flujo.mjs — el flujo de una incidencia, de un vistazo (#335).
//
//   npm run flujo                 resumen: pasos, veredicto de cada uno y qué los endurece
//   npm run flujo -- --json       lo mismo para máquinas
//   npm run flujo -- --escribir   regenera las tablas de docs/ops/FLUJO.md desde ops/flujo.json y ops/normas.json
//                                 y docs/ops/ENCARGO.md desde scripts/lib/issues.mjs (#338)
//
// El veredicto de un paso es el de su obligación más débil (la escala, en scripts/lib/escalas.mjs). Lo que sale aquí es lo
// que dice ops/flujo.json; ops/flujo.test.js comprueba que es verdad.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { ORDEN_VEREDICTO } from "./lib/escalas.mjs";
import { contextoDeNormas, cuentaPorVeredicto, obligacionesDe, regenerar, resolver, veredictoDelPaso } from "./lib/flujo.mjs";
import { formatoEncargoMd } from "./lib/issues.mjs";
import { leerRegistro } from "./lib/normas.mjs";
import { generarTabla } from "./lib/presupuestos.mjs";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RUTA_JSON = join(RAIZ, "ops/flujo.json");
const RUTA_MD = join(RAIZ, "docs/ops/FLUJO.md");
const RUTA_ENCARGO = join(RAIZ, "docs/ops/ENCARGO.md");
const args = process.argv.slice(2);

const datos = JSON.parse(readFileSync(RUTA_JSON, "utf8"));
const ctx = contextoDeNormas(leerRegistro(RAIZ));

if (args.includes("--escribir")) {
  writeFileSync(RUTA_MD, regenerar(readFileSync(RUTA_MD, "utf8"), datos, generarTabla(), ctx));
  console.log("Tablas de docs/ops/FLUJO.md regeneradas desde ops/flujo.json, ops/normas.json y ops/presupuestos.json.");
  writeFileSync(RUTA_ENCARGO, formatoEncargoMd());
  console.log("docs/ops/ENCARGO.md regenerado desde scripts/lib/issues.mjs.");
}

const filas = datos.pasos.map((p) => ({
  paso: p.id,
  veredicto: veredictoDelPaso(p, ctx.normas),
  obligaciones: p.obligaciones.length,
  blandas: p.obligaciones.filter((o) => resolver(o, ctx.normas).veredicto !== "dura").length,
  fases: [...new Set(p.obligaciones.flatMap((o) => o.fase))].sort(),
}));

if (args.includes("--json")) {
  console.log(JSON.stringify({ pasos: filas, cuenta: cuentaPorVeredicto(datos, ctx.normas) }, null, 2));
} else {
  for (const f of filas) {
    console.log(`${f.paso.padEnd(16)} ${f.veredicto.padEnd(9)} ${String(f.obligaciones).padStart(2)} obligaciones, ${f.blandas} sin ser duras   ${f.fases.join(" ")}`);
  }
  const c = cuentaPorVeredicto(datos, ctx.normas);
  const remiten = obligacionesDe(datos).filter((o) => o.norma).length;
  const porVeredicto = ORDEN_VEREDICTO.map((v) => `${c[v]} ${v}s`).join(", ");
  const total = Object.values(c).reduce((x, y) => x + y, 0);
  console.log(`
${total} obligaciones: ${porVeredicto}. ${remiten} remiten a su norma y ${total - remiten} van por campos.`);
}
