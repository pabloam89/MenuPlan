// merge-driver.mjs — los drivers de fusión de lo generado (#551, fondo #504). Lo lanza git, no una persona.
//
//   node scripts/merge-driver.mjs generado    %O %A %B %P   documento generado: se queda con tu versión (%A)
//   node scripts/merge-driver.mjs json-claves %O %A %B %P   ancla JSON: fusiona clave a clave contra la base (%O)
//
// %O es la base común, %A tu versión (y donde va el resultado), %B la suya y %P la ruta en el repo.
// Sale con 0 si deja el fichero resuelto y con 1 si choca (entonces %A lleva las marcas de siempre).
// Una línea por fichero en stderr: `generado ruta: <P> driver: <id> resultado: <tu-version|fusionado|choque>`, más
// `regenera: <comando>` (tu-version) o `motivo: <texto>` (choque). La lee la skill github (referencias/generados.md).
// Qué fichero va con qué driver, y cómo se instalan: scripts/lib/generados.mjs.
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

import { GENERADOS, casaRuta, mezclarJson } from "./lib/generados.mjs";

const [driver, base, nuestro, suyo, ruta = "?"] = process.argv.slice(2);

/** La fusión de siempre de git, con marcas, sobre %A. Devuelve el código de salida del driver. */
function chocarComoSiempre() {
  const r = spawnSync("git", ["merge-file", "-L", "tu versión", "-L", "base", "-L", "la suya", nuestro, base, suyo], { windowsHide: true, encoding: "utf8" });
  return r.status === 0 ? 0 : 1;
}

function regenera(r) {
  const g = GENERADOS.find((x) => casaRuta(x.ruta, r));
  return g ? `node ${g.regenera} --escribir` : "node scripts/generados.mjs --escribir";
}

if (!nuestro || !base || !suyo) {
  console.error("Uso: node scripts/merge-driver.mjs <generado|json-claves> %O %A %B %P (lo lanza git)");
  process.exit(2);
}

if (driver === "generado") {
  // Tu versión queda tal cual en %A; el test «está al día» del documento dice si hay que regenerar.
  console.error(`generado ruta: ${ruta} driver: generado resultado: tu-version regenera: ${regenera(ruta)} (si las dos ramas cambiaron su fuente)`);
  process.exit(0);
}

if (driver === "json-claves") {
  const m = mezclarJson(readFileSync(base, "utf8"), readFileSync(nuestro, "utf8"), readFileSync(suyo, "utf8"));
  if (m.texto !== undefined) {
    writeFileSync(nuestro, m.texto);
    console.error(`generado ruta: ${ruta} driver: json-claves resultado: fusionado`);
    process.exit(0);
  }
  const motivo = m.error ?? `las dos ramas cambian ${m.choques.join(", ")}`;
  console.error(`generado ruta: ${ruta} driver: json-claves resultado: choque motivo: ${motivo}`);
  process.exit(chocarComoSiempre());
}

console.error(`merge-driver: driver desconocido «${driver}»; fusión de siempre para ${ruta}`);
process.exit(chocarComoSiempre());
