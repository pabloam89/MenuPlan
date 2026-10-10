#!/usr/bin/env node
/**
 * `npm run situacion` — el estado real, ahora, de lo que varias sesiones
 * cambian a la vez (#459, fondo #231). Una pantalla: hora de Madrid, la fuente
 * de cada bloque y «sin ver: <motivo>» donde una fuente falle.
 *
 * Solo lee (gh y git). La lógica y el formato, en lib/situacion.mjs; las
 * marcas «lo lleva» y el inventario de ramas, de lib/lleva.mjs, y la consulta
 * de issues, de lib/issues.mjs (los mismos que usa `npm run issues`).
 */
import { execFileSync } from "node:child_process";
import { dirname } from "node:path";

import { leerInventario } from "./lib/lleva.mjs";
import { LIMITE_FUSIONADOS, leerTodosLosIssues, situacion } from "./lib/situacion.mjs";

const gh = (...args) => execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 30_000 });
const git = (...args) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 15_000 });
const json = (...args) => JSON.parse(gh(...args));

const principal = () => dirname(git("rev-parse", "--path-format=absolute", "--git-common-dir").trim());

const fuentes = {
  prsAbiertos: () => json("pr", "list", "--state", "open", "--limit", "50", "--json", "number,title,headRefName,statusCheckRollup,isCrossRepository,author")
    .map((p) => ({ ...p, checks: p.statusCheckRollup ?? [] })),
  // Atrasada: origin/staging tiene commits que la rama del PR no tiene. Se mira el origin ya traído (git fetch antes).
  atrasada: (rama) => {
    try {
      git("-C", principal(), "merge-base", "--is-ancestor", "origin/staging", `origin/${rama}`);
      return false;
    } catch (e) {
      if (e.status === 1) return true;
      throw new Error(`no he podido comparar con origin/${rama}: ${String(e.stderr ?? e.message).trim().split("\n")[0]}`);
    }
  },
  // Búsqueda por fecha y no «los últimos 40»: con un día movido, 40 no llegan a 6 h atrás.
  fusionados: (desde) => json("pr", "list", "--state", "merged", "--search", `merged:>=${desde}`, "--limit", String(LIMITE_FUSIONADOS), "--json", "number,title,headRefName,mergedAt,isCrossRepository"),
  ramas: () => leerInventario(principal()),
  // Issues, decisiones incluidas: una sola consulta GraphQL (con tope de páginas) y filtrada por autor de la casa.
  issues: () => leerTodosLosIssues(gh),
};

// Lo último que se sabe de origin; si el fetch falla, el atraso se calcula con lo que haya y la cabecera lo dice.
let avisoFetch = "";
try {
  git("-C", principal(), "fetch", "origin", "--quiet");
} catch (e) {
  avisoFetch = String(e.stderr ?? e.message).trim().split("\n")[0];
}

console.log(situacion(fuentes, new Date(), { avisoFetch }));
