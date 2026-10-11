// generados.mjs — lo que se genera y se guarda en el repo, y sus drivers de fusión (#551, fondo #504).
//
//   node scripts/generados.mjs                 una línea por generado (clase, driver, quién lo escribe y su test),
//                                              qué node y qué script usaría el driver y si está instalado
//   node scripts/generados.mjs --instalar      escribe los drivers en la configuración de git (la común a todas
//                                              las carpetas de trabajo; lo hace también `npm run tarea`)
//   node scripts/generados.mjs --desinstalar   los quita (solo los nuestros)
//   node scripts/generados.mjs --escribir      regenera todo con sus scripts: tras traer staging, antes de empujar
//
// El registro y el porqué: scripts/lib/generados.mjs. Lo vigila ops/generados.test.js.
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { CLASES, GENERADOS, comandosDeEscribir, desinstalarDrivers, destinoDrivers, driversQueFaltan, instalarDrivers } from "./lib/generados.mjs";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);

if (args.includes("--desinstalar")) {
  const q = desinstalarDrivers(RAIZ);
  console.log(q.length ? `Drivers de fusión quitados: ${q.join(", ")}.` : "No había drivers nuestros que quitar.");
}

if (args.includes("--instalar")) {
  const r = instalarDrivers(RAIZ);
  if (r.motivo) console.error(`No instalo los drivers: ${r.motivo}.`);
  else console.log(r.puestos.length ? `Drivers de fusión instalados: ${r.puestos.join(", ")}.` : "Los drivers de fusión ya estaban instalados.");
  if (r.ajenos.length) console.error(`Aviso: ya había otro driver en ${r.ajenos.join(", ")}; no lo piso. Míralo con git config --get-regexp ^merge\\.`);
  if (r.motivo || r.ajenos.length) process.exitCode = 1;
}

if (args.includes("--escribir")) {
  let mal = 0;
  for (const script of comandosDeEscribir()) {
    const r = spawnSync(process.execPath, [script, "--escribir"], { cwd: RAIZ, stdio: "inherit", windowsHide: true });
    console.log(r.status === 0 ? `Regenerado con ${script}.` : `FALLA ${script} --escribir (salida ${r.status}).`);
    if (r.status !== 0) mal++;
  }
  if (mal) process.exitCode = 1;
}

if (!["--escribir", "--instalar", "--desinstalar"].some((a) => args.includes(a))) {
  for (const g of GENERADOS) console.log(`${g.ruta}  (${g.clase}, driver ${CLASES[g.clase]}; lo escribe ${g.regenera} y lo vigila ${g.test})`);
  const d = destinoDrivers(RAIZ);
  console.log(d.motivo ? `El driver no se puede instalar: ${d.motivo}.` : `El driver usaría node ${d.node} y el script ${d.script}.`);
  const faltan = driversQueFaltan(RAIZ);
  console.log(faltan.length ? `drivers: faltan o están distintos (${faltan.join(", ")}); instálalos con node scripts/generados.mjs --instalar` : "drivers: instalados");
}
