// forja.mjs — los criterios de calidad de la forja, de un vistazo (#458).
//
//   npm run forja                 cifras de criterios por capa, por artefacto y por tipo de skill, y campos discretos frente a huecos
//   npm run forja -- --json       lo mismo para máquinas
//   npm run forja -- --escribir   regenera docs/ops/FORJA.md desde ops/forja.json y ancla en
//                                 ops/forja-capas.json los criterios nuevos y las capas que suben
//                                 (nunca baja ni borra nada: eso es una edición a mano)
//                                 y en ops/forja-campos.json los campos nuevos y los que pasan de texto a discreto
//                                 y baja ops/forja-excepciones.json (se siembra la primera vez; luego solo baja)
//   npm run forja -- --urls       comprueba con la red que cada fuente [F] responde 200
//
// Lo que sale aquí es lo que dice ops/forja.json; ops/forja.test.js comprueba que es verdad.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { RUTA_CAMPOS, RUTA_CAPAS, RUTA_MD, anclarCampos, anclarCapas, cifras, cifrasDeCampos, cifrasPorTipo, generarMd, leerCamposGuardados, leerCapas, leerForja } from "./lib/forja.mjs";
import { RUTA_EXCEPCIONES, bajarExcepciones, faltasDeRondas, leerExcepciones, sumaExcepciones } from "./lib/forjaForma.mjs";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const datos = leerForja(RAIZ);

if (args.includes("--escribir")) {
  writeFileSync(join(RAIZ, RUTA_MD), generarMd(datos));
  console.log(`${RUTA_MD} regenerado desde ops/forja.json.`);
  const { guardado, cambios } = anclarCapas(datos, leerCapas(RAIZ));
  writeFileSync(join(RAIZ, RUTA_CAPAS), `${JSON.stringify(guardado, null, 2)}\n`);
  console.log(cambios.length ? `${RUTA_CAPAS}: ${cambios.length} cambios.\n  ${cambios.join("\n  ")}` : `${RUTA_CAPAS}: sin cambios.`);
  const nivelCampos = anclarCampos(datos, leerCamposGuardados(RAIZ));
  writeFileSync(join(RAIZ, RUTA_CAMPOS), `${JSON.stringify(nivelCampos.guardado, null, 2)}\n`);
  console.log(nivelCampos.cambios.length ? `${RUTA_CAMPOS}: ${nivelCampos.cambios.length} cambios.\n  ${nivelCampos.cambios.join("\n  ")}` : `${RUTA_CAMPOS}: sin cambios.`);
  const exc = leerExcepciones(RAIZ);
  const estandares = JSON.parse(readFileSync(join(RAIZ, "ops/estandares-agentes.json"), "utf8"));
  const rondas = bajarExcepciones(faltasDeRondas(estandares, datos), exc.rondas, { sembrar: !exc.sembrado });
  writeFileSync(join(RAIZ, RUTA_EXCEPCIONES), `${JSON.stringify({ ...exc, sembrado: true, rondas }, null, 2)}\n`);
  console.log(`${RUTA_EXCEPCIONES}: rondas ${sumaExcepciones(exc.rondas)} -> ${sumaExcepciones(rondas)}.`);
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
const porTipo = cifrasPorTipo(datos);
const campos = cifrasDeCampos(datos);
if (args.includes("--json")) {
  console.log(JSON.stringify({ ...k, porTipo, campos }, null, 2));
} else {
  console.log(`Criterios de la forja: ${k.total}`);
  for (const [capa, n] of Object.entries(k.porCapa)) console.log(`forja capa: ${capa} criterios: ${n}  ${Object.entries(k.porCapaYArtefacto[capa]).map(([a, x]) => `${a}=${x}`).join(" ")}`);
  for (const [t, n] of Object.entries(porTipo)) console.log(`forja tipo: ${t} criterios: ${n.total}  ${Object.entries(n).filter(([c]) => c !== "total").map(([c, x]) => `${c}=${x}`).join(" ")}`);
  for (const [a, n] of Object.entries(campos)) console.log(`forja campos artefacto: ${a} discretos: ${n.discretos} huecos: ${n.huecos}`);
}
