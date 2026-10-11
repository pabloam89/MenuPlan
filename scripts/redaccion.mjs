// redaccion.mjs — la guía única de redacción de reglas, de un vistazo (#493).
//
//   npm run redaccion                 cifras: principios, fuerzas y catálogos por estado
//   npm run redaccion -- --escribir   regenera docs/ops/REDACCION.md desde ops/redaccion.json
//                                     y baja ops/redaccion-pendientes.json (se siembra la
//                                     primera vez; luego solo baja)
//
// Lo que sale aquí es lo que dice ops/redaccion.json; ops/redaccion.test.js comprueba que es verdad.
import { existsSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { RUTA_MD, RUTA_PENDIENTES, anclarPendientes, generarMd, leerJsonEn, leerPendientes, leerRedaccion, pendientesDe } from "./lib/redaccion.mjs";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const datos = leerRedaccion(RAIZ);

if (args.includes("--escribir")) {
  writeFileSync(join(RAIZ, RUTA_MD), generarMd(datos, leerJsonEn(RAIZ)));
  console.log(`${RUTA_MD} regenerado desde ops/redaccion.json.`);
  const sembrar = !existsSync(join(RAIZ, RUTA_PENDIENTES));
  const antes = sembrar ? [] : leerPendientes(RAIZ);
  const despues = anclarPendientes(datos, antes, { sembrar });
  writeFileSync(join(RAIZ, RUTA_PENDIENTES), `${JSON.stringify({ $comentario: "Catálogos que aún no siguen la guía de redacción (ops/redaccion.json), anclados al nacer (#493). SOLO BAJA: uno nuevo falla ops/redaccion.test.js, y uno puesto al día también hasta que se baja aquí (npm run redaccion -- --escribir).", pendientes: despues }, null, 2)}\n`);
  console.log(`${RUTA_PENDIENTES}: pendientes ${antes.length} -> ${despues.length}.`);
}

const porEstado = {};
for (const k of datos.catalogos) porEstado[k.estado] = (porEstado[k.estado] ?? 0) + 1;
console.log(`Principios de redacción: ${datos.principios.length}`);
console.log(`redaccion catalogos: ${datos.catalogos.length} ${Object.entries(porEstado).map(([e, n]) => `${e}=${n}`).join(" ")}`);
console.log(`redaccion pendientes: ${pendientesDe(datos).join(", ") || "ninguno"}`);
