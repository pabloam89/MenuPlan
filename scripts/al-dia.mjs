#!/usr/bin/env node
// Despertador «al día»: tras cada push a staging pone al día, con update-branch,
// UN solo PR: el abierto a staging más antiguo que tiene la fusión automática
// armada y va detrás de la base. Plan puente HoMenu, trozo 15.
//
// Por qué uno solo: con «al día antes de fusionar» (strict), poner al día a
// todos repetiría `tests` y `revisor` en cada PR abierto tras cada fusión.
// Cuando ese PR se fusione, el push a staging vuelve a lanzar esto y le toca al
// siguiente.
//
// Lo lanza .github/workflows/al-dia.yml con el token de la GitHub App
// `homenu-dependabot-merge` (APP_TOKEN): con el GITHUB_TOKEN el push que hace
// update-branch no lanzaría `tests`. Corre con el código de staging, nunca con
// el de un PR: solo lee los PR por la API.
//
// Uso: node scripts/al-dia.mjs        ensayo: dice qué haría, no escribe
//      node scripts/al-dia.mjs --si   pone al día el PR elegido
// Necesita APP_TOKEN y GITHUB_REPOSITORY (por defecto pabloam89/MenuPlan).

import { pathToFileURL } from "node:url";

export const BASE = "staging";

// Vocabulario cerrado: lo que hace con cada PR y por qué (una línea por PR).
export const DECISIONES = ["actualizado", "espera", "error"];
export const MOTIVOS = [
  "-", // actualizado, sin pega
  "al-dia", // no va detrás de staging
  "rechazado", // GitHub dijo 422 (conflicto, o la rama cambió entre medias): se mira el siguiente
  "ensayo", // lo habría hecho, pero sin --si
  "api", // la API de GitHub falló
];

// Los candidatos, el más antiguo primero (empate: el de número menor): armados,
// no borrador, contra staging y desde una rama de este mismo repo (update-branch
// de un fork depende de permisos que no se miran aquí).
export function armadosPorAntiguedad(abiertos, repo) {
  return abiertos
    .filter((p) => p.auto_merge && !p.draft && p.base?.ref === BASE && p.head?.repo?.full_name === repo)
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.number - b.number);
}

// `detras`: commits de staging que el PR no tiene (behind_by de la comparación).
export function decidir({ detras }) {
  return detras > 0 ? { decision: "actualizado", motivo: "-" } : { decision: "espera", motivo: "al-dia" };
}

// Misma forma de línea que scripts/dependabot-auto.mjs (`linea`): una por PR, para contarlas. Una decisión
// o un motivo fuera del vocabulario cerrado lanza, no se escribe.
export function linea({ pr, decision, motivo }) {
  if (!DECISIONES.includes(decision)) throw new Error(`al-dia: decisión fuera del vocabulario: ${decision}`);
  if (!MOTIVOS.includes(motivo)) throw new Error(`al-dia: motivo fuera del vocabulario: ${motivo}`);
  return `al-dia pr: ${pr} decision: ${decision} motivo: ${motivo}`;
}

export async function pasada({ api, paginas, repo, si, log = console.log, avisar = console.error }) {
  let fallos = 0;
  const lineas = [];
  const decir = (l) => {
    lineas.push(l);
    log(l);
  };

  const candidatos = armadosPorAntiguedad(await paginas(`/pulls?state=open&base=${BASE}`), repo);
  log(`al-dia armados: ${candidatos.length} modo: ${si ? "si" : "ensayo"}`);

  for (const p of candidatos) {
    const n = p.number;
    let r;
    try {
      const cmp = await api(`/compare/${BASE}...${p.head.sha}`);
      r = decidir({ detras: cmp.behind_by });
    } catch (e) {
      fallos++;
      decir(linea({ pr: n, decision: "error", motivo: "api" }));
      avisar(`PR #${n}: ${e.message}`);
      continue;
    }
    if (r.decision === "espera") {
      decir(linea({ pr: n, ...r }));
      continue;
    }
    if (!si) {
      decir(linea({ pr: n, decision: "espera", motivo: "ensayo" }) + ` haria: ${r.decision}`);
      return { fallos, lineas }; // uno solo, también en ensayo
    }
    try {
      await api(`/pulls/${n}/update-branch`, { method: "PUT", body: { expected_head_sha: p.head.sha } });
      decir(linea({ pr: n, ...r }));
    } catch (e) {
      if (e.status === 422) {
        decir(linea({ pr: n, decision: "espera", motivo: "rechazado" }));
        continue;
      }
      fallos++;
      decir(linea({ pr: n, decision: "error", motivo: "api" }));
      avisar(`PR #${n}: ${e.message}`);
    }
    return { fallos, lineas }; // uno solo: pone al día o falla en alto, no sigue
  }
  return { fallos, lineas };
}

// --- Red ------------------------------------------------------------------

function cliente(token, repo) {
  const base = `https://api.github.com/repos/${repo}`;
  async function api(ruta, { method = "GET", body } = {}) {
    const res = await fetch(`${base}${ruta}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const texto = await res.text();
    if (!res.ok) {
      const err = new Error(`${method} ${ruta}: ${res.status} ${texto.slice(0, 300)}`);
      err.status = res.status;
      throw err;
    }
    return texto ? JSON.parse(texto) : null;
  }
  async function paginas(ruta) {
    const todo = [];
    for (let p = 1; p <= 30; p++) {
      const r = await api(`${ruta}${ruta.includes("?") ? "&" : "?"}per_page=100&page=${p}`);
      todo.push(...r);
      if (r.length < 100) break;
    }
    return todo;
  }
  return { api, paginas };
}

async function main() {
  const token = process.env.APP_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY || "pabloam89/MenuPlan";
  if (!token) {
    console.error("Falta APP_TOKEN (el token de la App homenu-dependabot-merge).");
    process.exit(2);
  }
  const r = await pasada({ ...cliente(token, repo), repo, si: process.argv.includes("--si") });
  if (r.fallos > 0) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
