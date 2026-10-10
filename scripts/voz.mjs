/**
 * voz.mjs — el resumen del vigilante de la voz (#453). Sin red.
 *
 *   npm run voz                     la última semana del registro (voz.log)
 *   npm run voz -- --dias 30        otra ventana
 *   npm run voz -- --desde 2026-10-10  desde un día (las respuestas anteriores a la skill no son reproche)
 *   npm run voz -- --transcript <f> mide los turnos de un transcript local, sin guardar nada
 *                                   (la cifra de partida de una sesión que ya existe)
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { dirBuscar } from "./lib/buscarAntes.mjs";
import { diaMadrid } from "./lib/hora.mjs";
import { lineaDe, medir, resumir, respuestasConDia } from "./lib/voz.mjs";

const arg = (n) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : undefined; };
const dias = Math.max(1, Math.min(365, Number(arg("--dias") ?? 7) || 7));
const transcript = arg("--transcript");
const desde = /^\d{4}-\d\d-\d\d$/.test(arg("--desde") ?? "") ? arg("--desde") : null;
const hoy = diaMadrid();

let lineas;
let origen;
if (transcript) {
  if (!existsSync(transcript)) { console.error(`No existe ${transcript}`); process.exit(1); }
  lineas = respuestasConDia(readFileSync(transcript, "utf8")).map((r) => lineaDe(medir(r.texto), r.dia ?? hoy));
  origen = `transcript (${lineas.length} turnos)`;
} else {
  const log = join(dirBuscar(), "voz.log");
  lineas = existsSync(log) ? readFileSync(log, "utf8").split("\n").filter(Boolean) : [];
  origen = log;
}

const r = resumir(lineas, { hoy, dias: desde ? 3650 : dias, desde });
console.log(`voz resumen origen: ${origen} desde: ${r.desde} hasta: ${r.hasta}`);
console.log(`respuestas medidas: ${r.medidas}${r.errores ? ` (más ${r.errores} intentos con error)` : ""}`);
console.log(r.medidas ? `cumplen: ${r.cumplen} de ${r.medidas} (${r.porcentaje}%)` : "cumplen: sin datos todavía");
if (r.reglas.length) {
  console.log("reglas que fallan (veces):");
  for (const { regla, veces } of r.reglas) console.log(`  ${regla}: ${veces}`);
}
if (r.porDia.length) {
  console.log("por día (cumplen/medidas):");
  for (const d of r.porDia) console.log(`  ${d.dia}: ${d.cumplen}/${d.medidas} (${Math.round((100 * d.cumplen) / d.medidas)}%)`);
}
