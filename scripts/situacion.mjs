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

import { CONSULTA, leerIssue } from "./lib/issues.mjs";
import { leerInventario, leerMarcas } from "./lib/lleva.mjs";
import { situacion } from "./lib/situacion.mjs";

const gh = (...args) => execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 30_000 });
const git = (...args) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 15_000 });
const json = (...args) => JSON.parse(gh(...args));

const principal = () => dirname(git("rev-parse", "--path-format=absolute", "--git-common-dir").trim());

const fuentes = {
  prsAbiertos: () => json("pr", "list", "--state", "open", "--limit", "50", "--json", "number,title,headRefName,statusCheckRollup")
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
  fusionados: () => json("pr", "list", "--state", "merged", "--limit", "40", "--json", "number,title,headRefName,mergedAt"),
  ramas: () => leerInventario(principal()),
  decisiones: () => json("issue", "list", "--label", "tipo:decision", "--state", "open", "--limit", "100", "--json", "number,title,createdAt,comments")
    .map((d) => ({ number: d.number, title: d.title, createdAt: d.createdAt, ultimoComentario: d.comments?.at(-1)?.createdAt ?? null })),
  issues: () => {
    const out = [];
    let cursor = null;
    do {
      const args = ["api", "graphql", "-f", `query=${CONSULTA}`];
      if (cursor) args.push("-f", `cursor=${cursor}`);
      const pag = JSON.parse(gh(...args)).data.repository.issues;
      out.push(...pag.nodes.map((n) => ({ ...leerIssue(n), marcas: leerMarcas(n.comments?.nodes, { soloCasa: true }) })));
      cursor = pag.pageInfo.hasNextPage ? pag.pageInfo.endCursor : null;
    } while (cursor);
    return out;
  },
};

// Lo último que se sabe de origin; si el fetch falla, el atraso se calcula con lo que haya y se dice.
let aviso = "";
try {
  git("-C", principal(), "fetch", "origin", "--quiet");
} catch (e) {
  aviso = `\nAviso: git fetch falló (${String(e.stderr ?? e.message).trim().split("\n")[0]}); el atraso de los PR y las ramas es el de la última vez que se trajo origin.`;
}

console.log(situacion(fuentes, new Date()) + aviso);
