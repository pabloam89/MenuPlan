// forja.mjs — los criterios de calidad de la forja, de un vistazo (#458).
//
//   npm run forja                 cifras de criterios por capa y por artefacto
//   npm run forja -- --json       lo mismo para máquinas
//   npm run forja -- --escribir   regenera docs/ops/FORJA.md desde ops/forja.json y ancla en
//                                 ops/forja-capas.json los criterios nuevos y las capas que suben
//                                 (nunca baja ni borra nada: eso es una edición a mano)
//   npm run forja -- --urls       comprueba con la red que cada fuente [F] responde 200
//
// Lo que sale aquí es lo que dice ops/forja.json; ops/forja.test.js comprueba que es verdad.
import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { RUTA_CAPAS, RUTA_MD, anclarCapas, cifras, generarMd, leerCapas, leerForja } from "./lib/forja.mjs";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const datos = leerForja(RAIZ);

if (args.includes("--escribir")) {
  writeFileSync(join(RAIZ, RUTA_MD), generarMd(datos));
  console.log(`${RUTA_MD} regenerado desde ops/forja.json.`);
  const { guardado, cambios } = anclarCapas(datos, leerCapas(RAIZ));
  writeFileSync(join(RAIZ, RUTA_CAPAS), `${JSON.stringify(guardado, null, 2)}\n`);
  console.log(cambios.length ? `${RUTA_CAPAS}: ${cambios.length} cambios.\n  ${cambios.join("\n  ")}` : `${RUTA_CAPAS}: sin cambios.`);
}

if (args.includes("--urls")) {
  const urls = [...new Set(datos.criterios.map((c) => c.fuente.match(/^\[F\] (\S+)$/)?.[1]).filter(Boolean))];
  let mal = 0;
  for (const u of urls) {
    let estado;
    try { estado = (await fetch(u, { redirect: "follow", signal: AbortSignal.timeout(25000), headers: { "user-agent": "Mozilla/5.0" } })).status; } catch (e) { estado = `error ${e.name}`; }
    if (estado !== 200) mal += 1;
    console.log(`forja-url estado: ${estado} url: ${u}`);
  }
  console.log(`forja-urls total: ${urls.length} fallan: ${mal}`);
  if (mal) process.exitCode = 1;
}

const k = cifras(datos);
if (args.includes("--json")) {
  console.log(JSON.stringify(k, null, 2));
} else {
  console.log(`Criterios de la forja: ${k.total}`);
  for (const [capa, n] of Object.entries(k.porCapa)) console.log(`forja capa: ${capa} criterios: ${n}  ${Object.entries(k.porCapaYArtefacto[capa]).map(([a, x]) => `${a}=${x}`).join(" ")}`);
}
