#!/usr/bin/env node
/**
 * El mapa de capacidades (src/lib/capacidades.js): por parte del producto,
 * cuántas cosas se pueden hacer en los dos lados, y los huecos.
 *
 *   npm run capacidades           resumen y huecos
 *   npm run capacidades -- --json todo, en JSON
 */
import { CAPACIDADES, estadoDe, esHueco } from "../src/lib/capacidades.js";

const filas = CAPACIDADES.map((c) => ({ ...c, estado: estadoDe(c), hueco: esHueco(c) }));
if (process.argv.includes("--json")) {
  console.log(JSON.stringify(filas, null, 1));
} else {
  const dos = filas.filter((f) => f.estado === "los_dos").length;
  console.log(`Capacidades: ${filas.length}; en los dos lados: ${dos}; huecos (un lado vacío sin motivo): ${filas.filter((f) => f.hueco).length}.\n`);
  for (const parte of [...new Set(filas.map((f) => f.parte))]) {
    const de = filas.filter((f) => f.parte === parte);
    const n = (e) => de.filter((f) => f.estado === e).length;
    console.log(`${parte.padEnd(9)} ${String(de.length).padStart(2)} · los dos ${n("los_dos")} · solo app ${n("solo_app")} · solo Lola ${n("solo_lola")} · apagadas ${n("apagada")}`);
    for (const f of de.filter((x) => x.hueco)) console.log(`   hueco [${f.estado}] ${f.accion}${f.app?.apagada ? ` (app: ${f.app.apagada})` : ""}`);
  }
}
