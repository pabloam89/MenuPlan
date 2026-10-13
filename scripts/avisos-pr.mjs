/**
 * avisos-pr.mjs — tres avisos del CI sobre un PR (paso «Avisos del PR» de tests.yml, #576):
 * tests relajados (C8), PR demasiado grande (C1) y fondo cerrado sin aprendizaje (C12).
 *
 * SOLO AVISA: sale con 0, también si algo se rompe aquí dentro (un check obligatorio
 * que falla por una heurística bloquearía los PR de las demás sesiones). La ÚNICA excepción (#621) no es una
 * heurística: un PR con una excepción caducada de una norma DURA que ese mismo PR toca sale con 1 (ver
 * excepcionesDelPr en scripts/lib/avisosPr.mjs). Una línea por regla, la de su norma
 * (`norma: <id> resultado: … pr: <n> detalle: …`, scripts/lib/medicionNormas.mjs), que se puede contar; la lógica y el
 * vocabulario, en scripts/lib/avisosPr.mjs.
 *
 * Uso (lo lanza el CI): PR_BODY=… PR_AUTOR=… PR_NUMBER=… GITHUB_TOKEN=… GITHUB_REPOSITORY=… node scripts/avisos-pr.mjs <fichero-con-el-diff>
 * El diff es `git diff -U0` de la base del PR a su cabeza. El cuerpo va por entorno, nunca
 * interpolado en el YAML (inyección). Los `Closes #n` se leen con el mismo código que
 * «Fondos del PR» (scripts/fondos-pr.mjs).
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { ErrorDeApi, pedir } from "./lib/ghApi.mjs";
import { BOTS, REGLAS, avisosDelPr, excepcionesDelPr, hoyUtc, leerDiff, lineaContable, mensajeAviso } from "./lib/avisosPr.mjs";
import { cierresDelPr, tipoDe } from "./fondos-pr.mjs";
import { leerRegistro } from "./lib/normas.mjs";

/** Los `Closes #n` del cuerpo que son tipo:fondo → { fondosCerrados } o { sinComprobar }. */
export async function fondosCerrados({ cuerpo, token, repo, consultar }) {
  const cierres = cierresDelPr(cuerpo);
  if (!cierres.length) return { fondosCerrados: [] };
  if (!consultar && !token) return { sinComprobar: "no_token" };
  const pide = consultar ?? ((n) => pedir({ token, repo, ruta: `/issues/${n}` }));
  const fondos = [];
  try {
    for (const n of cierres.slice(0, 10)) {
      const issue = await pide(n);
      if (issue && !issue.pull_request && tipoDe(issue) === "fondo") fondos.push(n);
    }
  } catch (e) {
    if (!(e instanceof ErrorDeApi)) throw e;
    return { sinComprobar: "api_error" };
  }
  return { fondosCerrados: fondos };
}

const RAIZ = resolve(fileURLToPath(import.meta.url), "..", "..");
/** Las normas de ops/normas.json (con sus veredictos y ficheros), para validar las excepciones. */
export const leerNormas = () => leerRegistro(RAIZ).normas;

const esPrincipal = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (esPrincipal) {
  let fallo = false;
  try {
    const { PR_BODY = "", PR_AUTOR = "", PR_NUMBER = "", GITHUB_TOKEN = "", GITHUB_REPOSITORY = "" } = process.env;
    const ruta = process.argv[2];
    const hayDiff = Boolean(ruta) && existsSync(ruta);
    const f = await fondosCerrados({ cuerpo: PR_BODY, token: GITHUB_TOKEN, repo: GITHUB_REPOSITORY || "pabloam89/MenuPlan" });
    const diff = hayDiff ? readFileSync(ruta, "utf8") : "";
    // HOY solo lo pone un test; en el CI es el día UTC del run.
    const hoy = /^\d{4}-\d{2}-\d{2}$/.test(process.env.HOY ?? "") ? process.env.HOY : hoyUtc();
    const avisos = avisosDelPr({
      diff,
      cuerpo: PR_BODY,
      autor: PR_AUTOR,
      fondosCerrados: f.fondosCerrados ?? null,
      sinComprobar: hayDiff ? (f.sinComprobar ?? null) : "no_diff",
      hoy,
    });
    const pr = /^\d{1,8}$/.test(PR_NUMBER) ? PR_NUMBER : null;
    for (const a of avisos) {
      console.log(lineaContable(a, pr));
      if (a.resultado === "warning") console.log(mensajeAviso(a));
    }
    // Las excepciones del cuerpo (#621): una forma, con caducidad. Los bots, exentos.
    if (!BOTS.has(PR_AUTOR.toLowerCase())) {
      const e = excepcionesDelPr({ cuerpo: PR_BODY, normas: leerNormas(), ficheros: leerDiff(diff), hoy, pr });
      for (const l of e.lineas) console.log(l);
      for (const a of e.avisos) console.log(`::warning title=Excepción del PR::${a.replace(/[\r\n]+/g, " ")}`);
      for (const x of e.fallos) console.log(`::error title=Excepción caducada de una norma dura::${x.replace(/[\r\n]+/g, " ")}`);
      if (e.fallos.length) fallo = true;
    }
  } catch (e) {
    // Nunca falla: un fallo aquí tiene su línea, que alguien puede contar.
    console.log(`::warning title=Avisos del PR::No he podido calcular los avisos (${String(e?.message ?? e).replace(/[\r\n]+/g, " ").slice(0, 200)}).`);
    for (const regla of REGLAS) console.log(lineaContable({ regla, resultado: "unchecked", detalle: "reason=script_error" }, null));
  }
  process.exit(fallo ? 1 : 0);
}
