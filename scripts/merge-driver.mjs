// merge-driver.mjs — los drivers de fusión de lo generado (#551, fondo #504). Lo lanza git, no una persona.
//
//   <node> <carpeta principal>/scripts/merge-driver.mjs generado    %O %A %B %P   documento: deja la versión de HEAD (%A)
//   <node> <carpeta principal>/scripts/merge-driver.mjs json-claves %O %A %B %P   ancla JSON: fusiona clave a clave contra %O
//
// %O es la base común, %A la versión de HEAD (y donde va el resultado), %B la otra y %P la ruta en
// el repo. En un merge, HEAD es tu rama; en un rebase o un cherry-pick, la rama sobre la que se aplica.
// Sale con 0 si deja el fichero resuelto y con 1 si no: entonces el comando que instala
// scripts/lib/generados.mjs sigue con `|| git merge-file`, que deja las marcas de conflicto. Este
// script no escribe marcas ni deja %A a medias.
// Una línea por fichero en stderr: `generado ruta: <P> driver: <id> resultado: <version-de-HEAD|fusionado|choque>`,
// más `regenera: <comando>` (version-de-HEAD) o `motivo: <texto>` (choque). La lee la skill github (referencias/generados.md).
import { readFileSync, writeFileSync } from "node:fs";

import { GENERADOS, casaRuta, mezclarJson } from "./lib/generados.mjs";

const [driver, base, nuestro, suyo, ruta = "?"] = process.argv.slice(2);

function regenera(r) {
  const g = GENERADOS.find((x) => casaRuta(x.ruta, r));
  return g ? `node ${g.regenera} --escribir` : "node scripts/generados.mjs --escribir";
}

if (!nuestro || !base || !suyo) {
  console.error("Uso: node scripts/merge-driver.mjs <generado|json-claves> %O %A %B %P (lo lanza git)");
  process.exit(1);
}

if (driver === "generado") {
  // %A queda tal cual; el test «está al día» del documento dice si hay que regenerar.
  console.error(`generado ruta: ${ruta} driver: generado resultado: version-de-HEAD regenera: ${regenera(ruta)} (antes de empujar)`);
  process.exit(0);
}

if (driver === "json-claves") {
  let m;
  try {
    m = mezclarJson(readFileSync(base, "utf8"), readFileSync(nuestro, "utf8"), readFileSync(suyo, "utf8"));
  } catch (e) {
    m = { error: `no se pudo leer: ${e.message}` };
  }
  if (m.texto !== undefined) {
    writeFileSync(nuestro, m.texto);
    console.error(`generado ruta: ${ruta} driver: json-claves resultado: fusionado`);
    process.exit(0);
  }
  const motivo = m.error ?? `las dos ramas cambian ${m.choques.join(", ")}`;
  console.error(`generado ruta: ${ruta} driver: json-claves resultado: choque motivo: ${motivo}`);
  process.exit(1);
}

console.error(`generado ruta: ${ruta} driver: ${driver} resultado: choque motivo: driver desconocido`);
process.exit(1);
