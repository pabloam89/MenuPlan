#!/usr/bin/env node
// Fusiona solos en staging los PR de Dependabot pequeños (parche o menor) con
// `tests` en verde, y deja los grandes (mayor) para una sesión. Encargo #193.
//
// Lo lanza .github/workflows/dependabot-auto.yml al terminar «Tests» sobre una
// rama dependabot/, con el GITHUB_TOKEN. Corre con el código de staging (la
// rama por defecto), NUNCA con el del PR: solo lee el PR por la API.
//
// Cada pasada repasa TODOS los PR abiertos de Dependabot contra staging, no
// solo el del run que la lanzó: así una pasada cancelada por la concurrencia
// del workflow no deja a nadie atrás.
//
// Qué tiene que cumplir un PR para fusionarse (cada «no» es un motivo de
// MOTIVOS, una línea por PR que se puede contar):
//   - lo abrió dependabot[bot] (user de la API, tipo Bot) y va contra staging
//     desde una rama de este mismo repo;
//   - todos sus commits son de dependabot[bot], hechos por GitHub (web-flow) y
//     con firma válida: si alguien más ha empujado, no;
//   - solo toca package.json y package-lock.json (no .github/workflows: el
//     GITHUB_TOKEN no puede escribir workflows);
//   - es parche o menor: grupo `*-menores`, o cada «from A to B» con la misma
//     mayor (en 0.x, la misma menor);
//   - el último check `tests` de su head SHA, en verde;
//   - al día con staging, o atrasado sin que staging haya tocado sus ficheros.
//     Si los tocó, comenta `@dependabot rebase` (una vez por head SHA).
// La fusión lleva el head SHA comprobado: si el PR cambia entre medias, GitHub
// la rechaza.
//
// Uso: node scripts/dependabot-auto.mjs           ensayo: dice qué haría, no escribe
//      node scripts/dependabot-auto.mjs --si      fusiona y comenta (el workflow)
// Necesita GITHUB_TOKEN (o GH_TOKEN) y GITHUB_REPOSITORY (por defecto pabloam89/MenuPlan).

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const BOT = "dependabot[bot]";
export const BASE = "staging";
export const CHECK = "tests";

// Vocabulario cerrado: lo que hace con cada PR y por qué.
export const DECISIONES = ["fusionado", "rebase", "espera", "error"];
export const MOTIVOS = [
  "-", // fusionado o rebase pedido, sin pega
  "autor", // no lo abrió dependabot[bot]
  "base", // no va contra staging
  "rama-ajena", // la rama no es de este repo
  "commits-ajenos", // algún commit no es de Dependabot o no está firmado por GitHub
  "toca-workflows", // cambia .github/workflows: el GITHUB_TOKEN no puede
  "ficheros-fuera", // toca algo que no es package.json ni package-lock.json
  "mayor", // salto de versión mayor (o de menor en 0.x)
  "version-desconocida", // no se ha podido leer de qué versión a cuál va
  "tests-no-verde", // el último `tests` de su head SHA no está en verde
  "tests-otro-sha", // el run que lanzó esto no es del head SHA actual del PR
  "conflicto", // GitHub dice que no se puede fusionar (Dependabot lo rebasa solo)
  "mergeable-desconocido", // GitHub aún no ha calculado si se puede fusionar
  "rebase-ya-pedido", // ya se le pidió el rebase para este head SHA
  "ensayo", // lo habría hecho, pero sin --si
  "api", // la API de GitHub falló
];

// --- Versiones ----------------------------------------------------------

const VER = String.raw`v?(\d+(?:\.\d+)*(?:-[0-9A-Za-z.-]*[0-9A-Za-z])?)`;
const RE_FROM_TO = new RegExp(String.raw`\bfrom\s+\x60?${VER}\x60?\s+to\s+\x60?${VER}\x60?`, "gi");
const RE_TABLA = new RegExp(String.raw`\|\s*\x60${VER}\x60\s*\|\s*\x60${VER}\x60\s*\|`, "g");

export function parsearVersion(v) {
  const m = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:\.\d+)*(-.+)?$/.exec(String(v ?? "").replace(/^v/, ""));
  if (!m) return null;
  return { mayor: Number(m[1]), menor: Number(m[2] ?? 0), pre: Boolean(m[4]) };
}

// "menor" (parche o menor), "mayor" o "desconocida".
export function saltoDe(desde, hasta) {
  const a = parsearVersion(desde);
  const b = parsearVersion(hasta);
  if (!a || !b || a.pre || b.pre) return "desconocida";
  if (a.mayor !== b.mayor) return "mayor";
  if (a.mayor === 0 && a.menor !== b.menor) return "mayor";
  return "menor";
}

export function paresDeVersion(texto) {
  const pares = [];
  for (const re of [RE_FROM_TO, RE_TABLA]) {
    for (const m of String(texto ?? "").matchAll(re)) pares.push([m[1], m[2]]);
  }
  return pares;
}

export function grupoDe(titulo) {
  return /\bthe\s+([\w.-]+)\s+group\b/i.exec(titulo ?? "")?.[1] ?? null;
}

// { tipo: "menor" | "mayor" | "desconocida", grupo, pares }
export function clasificar({ titulo = "", textos = [] } = {}) {
  const grupo = grupoDe(titulo);
  const pares = paresDeVersion([titulo, ...textos].join("\n"));
  const saltos = pares.map(([a, b]) => saltoDe(a, b));
  let tipo;
  if (grupo && /-mayores$/.test(grupo)) tipo = "mayor";
  else if (saltos.includes("mayor")) tipo = "mayor";
  else if (saltos.includes("desconocida")) tipo = "desconocida";
  else if (saltos.length > 0) tipo = "menor";
  else if (grupo && /-menores$/.test(grupo)) tipo = "menor";
  else tipo = "desconocida";
  return { tipo, grupo, pares };
}

// --- Ficheros y commits -------------------------------------------------

export function motivoFicheros(ficheros) {
  if (ficheros.some((f) => f.startsWith(".github/workflows/"))) return "toca-workflows";
  if (ficheros.length === 0 || ficheros.some((f) => !/(^|\/)package(-lock)?\.json$/.test(f))) return "ficheros-fuera";
  return null;
}

export function commitsDeDependabot(commits) {
  return (
    commits.length > 0 &&
    commits.every(
      (c) =>
        c.author?.login === BOT &&
        c.committer?.login === "web-flow" &&
        c.commit?.verification?.verified === true &&
        c.commit?.verification?.reason === "valid",
    )
  );
}

export function seSolapan(ficherosPr, ficherosStaging) {
  const mios = new Set(ficherosPr);
  return ficherosStaging.some((f) => mios.has(f));
}

// --- La decisión, sin red ----------------------------------------------
// datos: { repo, pr, commits, ficheros, checks, staging: { atrasado, ficheros, truncado },
//          evento: { headSha, prs } | null, rebasePedido }
// Devuelve { decision, motivo, tipo }.
export function decidir(datos) {
  const { repo, pr, commits, ficheros, checks, staging, evento, rebasePedido } = datos;
  const espera = (motivo, tipo = null) => ({ decision: "espera", motivo, tipo });

  if (pr.user?.login !== BOT || pr.user?.type !== "Bot") return espera("autor");
  if (pr.base?.ref !== BASE) return espera("base");
  if (pr.head?.repo?.full_name !== repo) return espera("rama-ajena");
  if (!commitsDeDependabot(commits)) return espera("commits-ajenos");
  const fueraFicheros = motivoFicheros(ficheros);
  if (fueraFicheros) return espera(fueraFicheros);

  const { tipo } = clasificar({ titulo: pr.title, textos: [pr.body ?? "", ...commits.map((c) => c.commit?.message ?? "")] });
  if (tipo === "mayor") return espera("mayor", tipo);
  if (tipo !== "menor") return espera("version-desconocida", tipo);

  if (evento?.prs?.includes(pr.number) && evento.headSha !== pr.head.sha) return espera("tests-otro-sha", tipo);
  const ultimo = [...checks]
    .filter((c) => c.name === CHECK && c.app?.slug === "github-actions" && c.head_sha === pr.head.sha)
    .sort((a, b) => b.id - a.id)[0];
  if (!ultimo || ultimo.status !== "completed" || ultimo.conclusion !== "success") return espera("tests-no-verde", tipo);

  if (pr.mergeable === false) return espera("conflicto", tipo);
  if (pr.mergeable !== true) return espera("mergeable-desconocido", tipo);

  if (staging.atrasado && (staging.truncado || seSolapan(ficheros, staging.ficheros))) {
    if (rebasePedido) return espera("rebase-ya-pedido", tipo);
    return { decision: "rebase", motivo: "-", tipo };
  }
  return { decision: "fusionado", motivo: "-", tipo };
}

export function linea({ pr, decision, motivo, tipo }) {
  return `dependabot-auto pr: ${pr} decision: ${decision} motivo: ${motivo} tipo: ${tipo ?? "-"}`;
}

// --- Red ------------------------------------------------------------------

function cliente(token, repo) {
  const base = `https://api.github.com/repos/${repo}`;
  async function api(ruta, { method = "GET", body } = {}) {
    const res = await fetch(ruta.startsWith("http") ? ruta : `${base}${ruta}`, {
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
  async function paginas(ruta, clave = null) {
    const todo = [];
    for (let p = 1; p <= 30; p++) {
      const sep = ruta.includes("?") ? "&" : "?";
      const r = await api(`${ruta}${sep}per_page=100&page=${p}`);
      const xs = clave ? r[clave] : r;
      todo.push(...xs);
      if (xs.length < 100) break;
    }
    return todo;
  }
  return { api, paginas };
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

function leerEvento() {
  const ruta = process.env.GITHUB_EVENT_PATH;
  if (!ruta || process.env.GITHUB_EVENT_NAME !== "workflow_run") return null;
  const run = JSON.parse(readFileSync(ruta, "utf8")).workflow_run;
  return { headSha: run.head_sha, prs: (run.pull_requests ?? []).map((p) => p.number) };
}

async function main() {
  const si = process.argv.includes("--si");
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY || "pabloam89/MenuPlan";
  if (!token) {
    console.error("Falta GITHUB_TOKEN (o GH_TOKEN).");
    process.exit(2);
  }
  const { api, paginas } = cliente(token, repo);
  const evento = leerEvento();
  let fallos = 0;

  const abiertos = (await paginas(`/pulls?state=open&base=${BASE}`)).filter((p) => p.user?.login === BOT);
  console.log(`dependabot-auto abiertos: ${abiertos.length} modo: ${si ? "si" : "ensayo"}`);

  for (const resumen of abiertos) {
    const n = resumen.number;
    try {
      let pr = await api(`/pulls/${n}`);
      for (let i = 0; i < 3 && pr.mergeable === null; i++) {
        await dormir(3000);
        pr = await api(`/pulls/${n}`);
      }
      const commits = await paginas(`/pulls/${n}/commits`);
      const ficheros = (await paginas(`/pulls/${n}/files`)).map((f) => f.filename);
      const checks = await paginas(`/commits/${pr.head.sha}/check-runs?check_name=${CHECK}`, "check_runs");
      const cmp = await api(`/compare/${pr.head.sha}...${BASE}`);
      const staging = {
        atrasado: cmp.ahead_by > 0,
        ficheros: (cmp.files ?? []).map((f) => f.filename),
        truncado: (cmp.files ?? []).length >= 300,
      };
      const ultimoCommit = commits.at(-1)?.commit?.committer?.date ?? "1970-01-01T00:00:00Z";
      const comentarios = await paginas(`/issues/${n}/comments`);
      const rebasePedido = comentarios.some(
        (c) => c.user?.login === "github-actions[bot]" && /^@dependabot rebase\b/.test(c.body ?? "") && c.created_at > ultimoCommit,
      );

      let r = decidir({ repo, pr, commits, ficheros, checks, staging, evento, rebasePedido });
      if (r.decision !== "espera" && !si) r = { ...r, decision: "espera", motivo: "ensayo", haria: r.decision };
      else if (r.decision === "fusionado") {
        await api(`/pulls/${n}/merge`, { method: "PUT", body: { sha: pr.head.sha, merge_method: "merge" } });
      } else if (r.decision === "rebase") {
        await api(`/issues/${n}/comments`, { method: "POST", body: { body: "@dependabot rebase" } });
      }
      console.log(linea({ pr: n, ...r }) + (r.haria ? ` haria: ${r.haria}` : ""));
    } catch (e) {
      fallos++;
      console.log(linea({ pr: n, decision: "error", motivo: "api", tipo: null }));
      console.error(`PR #${n}: ${e.message}`);
    }
  }
  if (fallos) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
