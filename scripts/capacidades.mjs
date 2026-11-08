#!/usr/bin/env node
/**
 * El mapa de capacidades (src/lib/capacidades.js): por parte del producto,
 * cuántas cosas se pueden hacer en los dos lados, y los huecos.
 *
 *   npm run capacidades            resumen y huecos
 *   npm run capacidades -- --datos por dato del registro, quién lo pregunta en
 *                                  Lola y quién lo rellena en la app
 *   npm run capacidades -- --json  todo, en JSON
 */
import { CAPACIDADES, estadoDe, esHueco, mapaDeDatos, cifrasDeDatos } from "../src/lib/capacidades.js";

const filas = CAPACIDADES.map((c) => ({ ...c, estado: estadoDe(c), hueco: esHueco(c) }));
if (process.argv.includes("--json")) {
  console.log(JSON.stringify(filas, null, 1));
} else if (process.argv.includes("--datos")) {
  const mapa = mapaDeDatos();
  const { sinPreguntaEnLola, sinPantallaEnApp } = cifrasDeDatos(mapa);
  console.log(`Datos del registro: ${mapa.length}; los que dice la familia (hechos que no escribe solo el sistema): ${mapa.filter((d) => d.cuenta).length}.`);
  console.log(`Sin pregunta en Lola: ${sinPreguntaEnLola}. Sin pantalla en la app: ${sinPantallaEnApp}. (! = le falta un lado)\n`);
  const ancho = Math.max(...mapa.map((d) => d.clave.length));
  for (const clase of [...new Set(mapa.map((d) => d.clase))]) {
    console.log(`── ${clase}`);
    for (const d of mapa.filter((x) => x.clase === clase)) {
      const falta = d.cuenta && (!d.lola.length || !d.app.length) ? "!" : " ";
      console.log(`${falta} ${d.clave.padEnd(ancho)}  Lola: ${d.lola.join(", ") || "—"}  ·  app: ${d.app.join(", ") || "—"}`);
    }
  }
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
