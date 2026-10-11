/**
 * avisos-pr.mjs — tres avisos del CI sobre un PR (paso «Avisos del PR» de tests.yml, #576):
 * tests relajados (C8), PR demasiado grande (C1) y fondo cerrado sin lección (C12).
 *
 * SOLO AVISA: sale siempre con 0, también si algo se rompe aquí dentro (un check obligatorio
 * que falla por una heurística bloquearía los PR de las demás sesiones). Una línea
 * `avisos-pr: regla=… resultado=… detalle=…` por regla, que se puede contar; la lógica y el
 * vocabulario, en scripts/lib/avisosPr.mjs.
 *
 * Uso (lo lanza el CI): PR_BODY=… PR_AUTOR=… GITHUB_TOKEN=… GITHUB_REPOSITORY=… node scripts/avisos-pr.mjs <fichero-con-el-diff>
 * El diff es `git diff -U0` de la base del PR a su cabeza. El cuerpo va por entorno, nunca
 * interpolado en el YAML (inyección). Los `Closes #n` se leen con el mismo código que
 * «Fondos del PR» (scripts/fondos-pr.mjs).
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { ErrorDeApi, pedir } from "./lib/ghApi.mjs";
import { REGLAS, avisosDelPr, lineaContable, mensajeAviso } from "./lib/avisosPr.mjs";
import { cierresDelPr, tipoDe } from "./fondos-pr.mjs";

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

const esPrincipal = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (esPrincipal) {
  try {
    const { PR_BODY = "", PR_AUTOR = "", GITHUB_TOKEN = "", GITHUB_REPOSITORY = "" } = process.env;
    const ruta = process.argv[2];
    const hayDiff = Boolean(ruta) && existsSync(ruta);
    const f = await fondosCerrados({ cuerpo: PR_BODY, token: GITHUB_TOKEN, repo: GITHUB_REPOSITORY || "pabloam89/MenuPlan" });
    const avisos = avisosDelPr({
      diff: hayDiff ? readFileSync(ruta, "utf8") : "",
      cuerpo: PR_BODY,
      autor: PR_AUTOR,
      fondosCerrados: f.fondosCerrados ?? null,
      sinComprobar: hayDiff ? (f.sinComprobar ?? null) : "no_diff",
    });
    for (const a of avisos) {
      console.log(lineaContable(a));
      if (a.resultado === "warning") console.log(mensajeAviso(a));
    }
  } catch (e) {
    // Nunca falla: un fallo aquí tiene su línea, que alguien puede contar.
    console.log(`::warning title=Avisos del PR::No he podido calcular los avisos (${String(e?.message ?? e).replace(/[\r\n]+/g, " ").slice(0, 200)}).`);
    for (const regla of REGLAS) console.log(lineaContable({ regla, resultado: "unchecked", detalle: "reason=script_error" }));
  }
  process.exit(0);
}
