/**
 * cuota.mjs — cuenta lo que dejan los registros de cuota (solo lectura, sin red):
 * las llamadas a `gh` por quien las hace (`gh.log`, #424) y los avisos de cupo del
 * arranque (`cupos.log`, #578). Uso: `npm run cuota`.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { contarCupos } from "./lib/cupos.mjs";
import { contarLog, dirCuota } from "./lib/cuotaGh.mjs";

const leer = (n) => (existsSync(join(dirCuota(), n)) ? readFileSync(join(dirCuota(), n), "utf8") : "");
const muestra = (titulo, cuenta) => {
  const f = Object.entries(cuenta).sort((a, b) => b[1] - a[1]);
  console.log(f.length ? `${titulo}:\n${f.map(([k, v]) => `  ${k}: ${v}`).join("\n")}` : `${titulo}: sin líneas`);
};
muestra("gh.log (caller/api)", contarLog(leer("gh.log")));
muestra("cupos.log (aviso / sin-ver)", contarCupos(leer("cupos.log")));
