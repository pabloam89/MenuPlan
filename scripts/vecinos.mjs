/**
 * vecinos.mjs — los tests de lo que tocas MÁS los vigilantes de conjunto que lo
 * miran (#356). Es la selección local de tests antes de un PR; la suite entera
 * (`npm test`) sigue siendo la última comprobación.
 *
 *   npm run vecinos                       → lo tocado: la rama frente a origin/staging + lo sin commitear
 *   npm run vecinos -- a.mjs b/c.md       → esos ficheros
 *   npm run vecinos -- --ensayo [...]     → solo dice qué lanzaría y por qué, sin lanzar nada
 *
 * Imprime cada test con su porqué y una línea final que se puede contar:
 *   vecinos: tocados=<n> vigilantes=<m> ok|falla
 * Sale 0 si todo pasa, 1 si algo falla, 2 si no puede (sin vitest, sin git).
 * Qué vigilantes hay y qué conjunto mira cada uno: ops/vigilantes.json.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative } from "node:path";
import { RAIZ, elegir, ficherosDelRepo, ficherosTocados, indiceDeTests, leerVigilantes } from "./lib/vecinos.mjs";

const argv = process.argv.slice(2);
const ensayo = argv.includes("--ensayo");
const pedidos = argv.filter((a) => !a.startsWith("--"));

let tocados;
if (pedidos.length) {
  tocados = pedidos.map((p) => {
    const ruta = (isAbsolute(p) ? relative(RAIZ, p) : p).split("\\").join("/").replace(/^\.\//, "");
    return { ruta, estado: existsSync(join(RAIZ, ruta)) ? "M" : "D" };
  });
} else {
  const r = ficherosTocados(RAIZ);
  tocados = r.tocados;
  if (r.base === "HEAD") console.warn("vecinos: aviso: no veo origin/staging (haz `git fetch origin`); solo miro lo sin commitear.");
}

const datos = leerVigilantes(RAIZ);
const plan = elegir({ tocados, datos, indice: indiceDeTests(RAIZ, ficherosDelRepo(RAIZ)) });
const vigilantes = plan.tests.filter((t) => t.tipos.includes("vigilante")).length;
const propios = plan.tests.filter((t) => t.tipos.includes("propio")).length;
const linea = (resultado) => console.log(`vecinos: tocados=${tocados.length} vigilantes=${vigilantes} ${resultado}`);

for (const t of plan.tests) console.log(`vecinos: ${t.test}  [${t.porque.slice(0, 3).join("; ")}${t.porque.length > 3 ? `; +${t.porque.length - 3}` : ""}]`);
for (const p of plan.pasos) console.log(`vecinos: paso ${p.id}  [${p.porque}]`);
for (const r of plan.sinEntender) console.log(`vecinos: no entiendo ${r}: lanzo los vigilantes más amplios`);
console.log(`vecinos: propios=${propios} vigilantes=${vigilantes} pasos=${plan.pasos.length}`);

if (ensayo || (!plan.tests.length && !plan.pasos.length)) {
  if (!plan.tests.length && !plan.pasos.length) console.log("vecinos: nada que lanzar para estos ficheros");
  linea("ok");
  process.exit(0);
}

let fallo = false;
if (plan.tests.length) {
  const vitest = join(RAIZ, "node_modules", "vitest", "vitest.mjs");
  if (!existsSync(vitest)) {
    console.error("vecinos: no encuentro vitest (¿falta `npm ci` en esta carpeta?)");
    process.exit(2);
  }
  const r = spawnSync(process.execPath, [vitest, "run", ...plan.tests.map((t) => t.test)], { cwd: RAIZ, stdio: "inherit" });
  if (r.status !== 0) fallo = true;
}

if (plan.pasos.length) {
  const carpeta = mkdtempSync(join(tmpdir(), "vecinos-"));
  const lista = join(carpeta, "ficheros.txt");
  writeFileSync(lista, tocados.filter((t) => t.estado !== "D").map((t) => t.ruta).join("\n") + "\n");
  for (const p of plan.pasos) {
    const [cmd, ...args] = p.cmd.map((a) => (a === "{lista}" ? lista : a));
    const r = spawnSync(cmd === "node" ? process.execPath : cmd, args, { cwd: RAIZ, stdio: "inherit" });
    console.log(`vecinos: paso ${p.id} ${r.status === 0 ? "ok" : "falla"}`);
    if (r.status !== 0) fallo = true;
  }
  rmSync(carpeta, { recursive: true, force: true });
}

linea(fallo ? "falla" : "ok");
process.exit(fallo ? 1 : 0);
