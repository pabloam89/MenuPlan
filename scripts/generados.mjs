// generados.mjs — lo que se genera y se guarda en el repo, y sus drivers de fusión (#551, fondo #504).
//
//   node scripts/generados.mjs               una línea por generado (clase, driver, quién lo escribe y su test)
//                                            y si los drivers están en la configuración de git
//   node scripts/generados.mjs --instalar    escribe los drivers en la configuración de git (la común a
//                                            todos los worktrees; lo hace también `npm run tarea`)
//   node scripts/generados.mjs --escribir    regenera todo con sus scripts (tras fusionar staging, si un
//                                            test «está al día» falla)
//
// El registro y el porqué: scripts/lib/generados.mjs. Lo vigila ops/generados.test.js.
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { CLASES, GENERADOS, comandosDeEscribir, driversQueFaltan, instalarDrivers } from "./lib/generados.mjs";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);

if (args.includes("--instalar")) {
  const puestos = instalarDrivers(RAIZ);
  console.log(puestos.length ? `Drivers de fusión instalados: ${puestos.join(", ")}.` : "Los drivers de fusión ya estaban instalados.");
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

if (!args.includes("--escribir") && !args.includes("--instalar")) {
  for (const g of GENERADOS) console.log(`${g.ruta}  (${g.clase}, driver ${CLASES[g.clase]}; lo escribe ${g.regenera} y lo vigila ${g.test})`);
  const faltan = driversQueFaltan(RAIZ);
  console.log(faltan.length ? `drivers: faltan (${faltan.join(", ")}); instálalos con node scripts/generados.mjs --instalar` : "drivers: instalados");
}
