/**
 * cuota.mjs — cuenta lo que dejan los registros de cuota (solo lectura, sin red):
 * las llamadas a `gh` por quien las hace (`gh.log`, #424) y los avisos de cupo del
 * arranque (`cupos.log`, #578). Uso:
 *
 *   npm run cuota                       llamadas por origen y API, y avisos de cupo
 *   npm run cuota -- --horas [--dias N] puntos GraphQL por hora (Madrid), por origen y por sesión, la hora más
 *                                       cara, el percentil 95 y cuántas líneas salieron «limitado» (#724, fondo #326).
 *                                       Por defecto 7 días. Las líneas de antes de #724 no traen puntos: cuentan 0.
 *   npm run cuota -- --rafagas [origen] ráfagas de líneas seguidas (menos de 30 s entre una y otra), por defecto de `issues`
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { contarCupos } from "./lib/cupos.mjs";
import { contarLog, dirCuota, leerLineas, porHoras, rafagas, resumenDeHoras } from "./lib/cuotaGh.mjs";

const leer = (n) => (existsSync(join(dirCuota(), n)) ? readFileSync(join(dirCuota(), n), "utf8") : "");
const muestra = (titulo, cuenta) => {
  const f = Object.entries(cuenta).sort((a, b) => b[1] - a[1]);
  console.log(f.length ? `${titulo}:\n${f.map(([k, v]) => `  ${k}: ${v}`).join("\n")}` : `${titulo}: sin líneas`);
};
const argv = process.argv.slice(2);
const valor = (n) => {
  const i = argv.indexOf(n);
  return i >= 0 ? argv[i + 1] : undefined;
};
const top = (o, n = 3) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k}:${v}`).join(" ");

if (argv.includes("--horas")) {
  const dias = /^\d{1,3}$/.test(valor("--dias") ?? "") ? Number(valor("--dias")) : 7;
  const texto = leer("gh.log");
  const lineas = leerLineas(texto);
  const desde = Date.now() - dias * 86_400_000;
  const horas = porHoras(texto, { desde });
  const r = resumenDeHoras(horas);
  const nuevas = lineas.filter((l) => l.t >= desde && l.resultado !== "sin-dato").length;
  const enVentana = lineas.filter((l) => l.t >= desde).length;
  console.log(`gh.log, últimos ${dias} días (corte: ${new Date().toISOString()}): ${enVentana} líneas, ${nuevas} con puntos y resultado`);
  for (const [h, o] of Object.entries(horas).sort()) {
    console.log(`  ${h}  líneas ${String(o.lineas).padStart(4)}  puntos ${String(o.puntos).padStart(5)}  limitadas ${o.limitadas}  origen ${top(o.porOrigen)}  sesión ${top(o.porSesion)}`);
  }
  console.log(`Resumen. La hora más cara gastó ${r.maxima ? `${r.maxima.puntos} puntos (${r.maxima.hora})` : "sin datos"}; percentil 95 de las horas, ${r.p95} puntos; total, ${r.puntos} puntos; líneas limitadas, ${r.limitadas}`);
} else if (argv.includes("--rafagas")) {
  const origen = argv[argv.indexOf("--rafagas") + 1]?.startsWith("--") ? undefined : argv[argv.indexOf("--rafagas") + 1];
  const rs = rafagas(leer("gh.log"), { caller: origen ?? "issues" });
  const largas = rs.filter((x) => x.lineas >= 19);
  console.log(`ráfagas de ${origen ?? "issues"}: ${rs.length}; de 19 líneas o más: ${largas.length}`);
  for (const x of largas) console.log(`  ${x.inicio}  ${x.lineas} líneas  ${x.sesiones} sesión(es)`);
} else {
  muestra("gh.log (caller/api)", contarLog(leer("gh.log")));
  muestra("cupos.log (aviso / sin-ver)", contarCupos(leer("cupos.log")));
}
