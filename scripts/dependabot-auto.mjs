#!/usr/bin/env node
// Fusiona solos en staging los PR de Dependabot pequeños (parche o menor) con
// `tests` en verde, y deja los grandes (mayor) para una sesión. Encargo #193.
//
// Lo lanza .github/workflows/dependabot-auto.yml. Corre con el código de
// staging (la rama por defecto), NUNCA con el del PR: solo lee el PR por la API.
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
//   - npm: solo toca package.json y package-lock.json DE LA RAÍZ (otra carpeta,
//     como dish-gallery/, no la prueba el CI);
//   - actions: solo toca .github/workflows/*.yml y en ellos solo cambian
//     líneas `uses:`, cada una a la misma acción (otro `run:`, no);
//   - es parche o menor: manda el `update-type` del commit de Dependabot si lo
//     trae; si no, cada «from A to B» con la misma mayor (en 0.x, la misma
//     menor), o el grupo `*-menores`. Si alguna fuente dice mayor, gana mayor;
//   - el último check `tests` de su head SHA, en verde;
//   - al día con staging, o atrasado sin que staging haya tocado sus ficheros.
//     Si los tocó, comenta `@dependabot rebase` (una vez por head SHA).
// La fusión lleva el head SHA comprobado: si el PR cambia entre medias, GitHub
// la rechaza.
//
// npm se fusiona con el GITHUB_TOKEN. Actions no puede (cambia workflows): la
// pasada lo deja en GITHUB_OUTPUT (`app_pr`, `app_sha`) y el workflow, en OTRO
// JOB (el único que ve el environment y la clave), saca un token de la GitHub
// App `homenu-dependabot-merge` y llama a `--fusionar-app`, que lo vuelve a
// comprobar todo y solo usa ese token para la fusión. Un PR de actions que
// toque este workflow, o uno que use un environment (sus secretos), no entra
// por aquí: lo mira una sesión.
// Las 0.x directas (CERO) van al grupo npm-cero de dependabot.yml; un PR de
// seguridad suelto de una de ellas también espera (`grupo-manual`). El test
// cruza CERO con dependabot.yml y con package.json.
//
// Uso: node scripts/dependabot-auto.mjs                ensayo: dice qué haría, no escribe
//      node scripts/dependabot-auto.mjs --si           fusiona npm, comenta rebases, apunta actions
//      node scripts/dependabot-auto.mjs --fusionar-app <n> --sha <sha>   (con APP_TOKEN)
// `--fusionar-app` escribe sin `--si` a propósito: solo lo llama el segundo
// job del workflow con un PR que la pasada (con --si) ya apuntó, y sin
// APP_TOKEN no hace nada (`sin-clave-app`). No hay ensayo de ese paso: el de
// la pasada dice `haria: para-app`.
// Necesita GITHUB_TOKEN (o GH_TOKEN) y GITHUB_REPOSITORY (por defecto pabloam89/MenuPlan).

import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const BOT = "dependabot[bot]";
export const BASE = "staging";
export const CHECK = "tests";
export const ESTE_WORKFLOW = ".github/workflows/dependabot-auto.yml";
// Dependencias directas en 0.x: una «menor» puede romper. La misma lista va en
// el grupo npm-cero de .github/dependabot.yml (lo vigila el test).
export const CERO = ["@anthropic-ai/sdk", "eslint-plugin-react-refresh", "sharp"];

// Vocabulario cerrado: lo que hace con cada PR y por qué.
export const DECISIONES = ["fusionado", "para-app", "rebase", "espera", "error"];
export const MOTIVOS = [
  "-", // fusionado, apuntado para la App o rebase pedido, sin pega
  "autor", // no lo abrió dependabot[bot]
  "base", // no va contra staging
  "rama-ajena", // la rama no es de este repo
  "commits-ajenos", // algún commit no es de Dependabot o no está firmado por GitHub
  "ficheros-fuera", // toca algo que no es package*.json de la raíz ni un workflow
  "cambia-mas-que-uses", // en un workflow cambia algo más que una línea `uses:` de la misma acción
  "toca-este-workflow", // actualiza una acción de dependabot-auto.yml: se fusionaría a sí mismo
  "toca-workflow-con-environment", // actualiza una acción de un workflow con environment (sus secretos)
  "mayor", // salto de versión mayor (o de menor en 0.x)
  "grupo-manual", // un grupo que no es -menores, o una dependencia de CERO: lo mira una sesión
  "version-desconocida", // no se ha podido leer de qué versión a cuál va
  "tests-no-verde", // el último `tests` de su head SHA no está en verde
  "conflicto", // GitHub dice que no se puede fusionar (Dependabot lo rebasa solo)
  "mergeable-desconocido", // GitHub aún no ha calculado si se puede fusionar
  "rebase-ya-pedido", // ya se le pidió el rebase para este head SHA
  "app-ocupada", // ya hay otro de actions apuntado en esta pasada
  "sin-clave-app", // el job de la App no ve la clave (o no se pudo sacar el token)
  "sha-cambiado", // al ir a fusionar con la App, el PR ya no está en el SHA apuntado
  "ensayo", // lo habría hecho, pero sin --si
  "api", // la API de GitHub falló
];

// --- Versiones ----------------------------------------------------------

const VER = String.raw`v?(\d+(?:\.\d+)*(?:-[0-9A-Za-z.-]*[0-9A-Za-z])?)`;
const RE_FROM_TO = new RegExp(String.raw`\bfrom\s+\x60?${VER}\x60?\s+to\s+\x60?${VER}\x60?`, "gi");
const RE_TABLA = new RegExp(String.raw`\|\s*\x60${VER}\x60\s*\|\s*\x60${VER}\x60\s*\|`, "g");
const RE_UPDATE_TYPE = /\bupdate-type:\s*["']?version-update:semver-(major|minor|patch)\b/g;

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

// Lo que escribe Dependabot, sin las notas de versión que copia de cada
// proyecto (van en <details> y traen «from A to B» de otras cosas: #110 daba
// 19 pares para 2 actualizaciones). Quedan las líneas «Bumps …», «Updates `x`
// from …» y las filas de la tabla del grupo.
export function textoFiable(texto) {
  return String(texto ?? "")
    .replace(/<details>[\s\S]*?(<\/details>|$)/g, "")
    .split("\n")
    .filter((l) => /^(Bumps |Updates `|\|)/.test(l.trim()))
    .join("\n");
}

// Los `update-type` del YAML que Dependabot pone en su commit (no siempre).
export function tiposDeMetadatos(texto) {
  return [...String(texto ?? "").matchAll(RE_UPDATE_TYPE)].map((m) => (m[1] === "major" ? "mayor" : "menor"));
}

export function grupoDe(titulo) {
  return /\bthe\s+([\w.-]+)\s+group\b/i.exec(titulo ?? "")?.[1] ?? null;
}

// { tipo: "menor" | "mayor" | "desconocida" | "grupo-manual", grupo, pares, metadatos }
// Fuente principal: los `update-type` del YAML del commit (a los indirectos
// les falta). Respaldo: el título y el texto fiable. Gana siempre el tamaño
// mayor de cualquiera de las dos. Un grupo que no sea `-menores` (los
// `-mayores`, o `npm-cero` con las 0.x) no entra solo: lo mira una sesión.
export function clasificar({ titulo = "", textos = [] } = {}) {
  const grupo = grupoDe(titulo);
  const metadatos = tiposDeMetadatos(textos.join("\n"));
  const pares = paresDeVersion([titulo, ...textos.map(textoFiable)].join("\n"));
  const saltos = pares.map(([a, b]) => saltoDe(a, b));
  let tipo;
  if (grupo && /-mayores$/.test(grupo)) tipo = "mayor";
  else if (grupo && !/-menores$/.test(grupo)) tipo = "grupo-manual";
  else if (metadatos.includes("mayor") || saltos.includes("mayor")) tipo = "mayor";
  else if (metadatos.length > 0) tipo = "menor"; // el texto no legible (un SHA) no le quita la razón
  else if (saltos.includes("desconocida")) tipo = "desconocida";
  else if (saltos.length > 0) tipo = "menor";
  else if (grupo && /-menores$/.test(grupo)) tipo = "menor";
  else tipo = "desconocida";
  return { tipo, grupo, pares, metadatos };
}

// --- Ficheros y commits -------------------------------------------------

const NPM = /^package(-lock)?\.json$/;
const WORKFLOW = /^\.github\/workflows\/[^/]+\.ya?ml$/;
const LINEA_USES = /^\s*(?:-\s+)?uses:\s*([\w.-]+\/[\w./-]+)@[\w.-]+(?:\s+#.*)?\s*$/;

// ¿El parche de un workflow solo cambia líneas `uses:`, cada una a la misma acción?
export function soloCambiaUses(patch) {
  if (typeof patch !== "string" || patch === "") return false;
  const quitadas = [];
  const puestas = [];
  for (const l of patch.split("\n")) {
    if (l.startsWith("@@") || l.startsWith(" ") || l.startsWith("\\") || l === "") continue;
    const m = LINEA_USES.exec(l.slice(1));
    if (!m) return false;
    (l[0] === "-" ? quitadas : puestas).push(m[1]);
  }
  return quitadas.length > 0 && quitadas.length === puestas.length && quitadas.every((a, i) => a === puestas[i]);
}

// ¿El workflow (su versión en staging) declara un environment? Sin contenido
// (no existe en staging), se da por sí: ante la duda, que lo mire una sesión.
export function usaEnvironment(contenido) {
  if (typeof contenido !== "string") return true;
  const sinComentarios = contenido.replace(/(^|\s)#.*$/gm, "$1");
  return /^\s*environment:/m.test(sinComentarios);
}

// ficheros: [{ filename, patch }]; conEnvironment: los workflows de la lista
// que declaran un environment. Devuelve { ruta: "npm" | "actions" | null, motivo }.
export function revisarFicheros(ficheros, conEnvironment = []) {
  const nombres = ficheros.map((f) => f.filename);
  if (nombres.length > 0 && nombres.every((f) => NPM.test(f))) return { ruta: "npm", motivo: null };
  if (nombres.length > 0 && nombres.every((f) => WORKFLOW.test(f))) {
    if (!ficheros.every((f) => soloCambiaUses(f.patch))) return { ruta: "actions", motivo: "cambia-mas-que-uses" };
    if (nombres.includes(ESTE_WORKFLOW)) return { ruta: "actions", motivo: "toca-este-workflow" };
    if (nombres.some((f) => conEnvironment.includes(f))) return { ruta: "actions", motivo: "toca-workflow-con-environment" };
    return { ruta: "actions", motivo: null };
  }
  return { ruta: null, motivo: "ficheros-fuera" };
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

// Qué dependencias nombra el PR: el YAML del commit, «Updates `x`», «Bumps [x]»
// y el «bump x from» del título.
export function dependenciasDe({ titulo = "", textos = [] } = {}) {
  const todo = textos.join("\n");
  const nombres = new Set();
  for (const m of todo.matchAll(/^- dependency-name:\s*["']?([^"'\n]+?)["']?\s*$/gm)) nombres.add(m[1]);
  for (const m of todo.matchAll(/^Updates `([^`]+)`/gm)) nombres.add(m[1]);
  for (const m of todo.matchAll(/^Bumps \[([^\]]+)\]/gm)) nombres.add(m[1]);
  const t = /\bbump\s+(\S+)\s+from\b/i.exec(titulo);
  if (t) nombres.add(t[1]);
  return [...nombres];
}

// --- La decisión, sin red ----------------------------------------------
// datos: { repo, pr, commits, ficheros: [{ filename, patch }], checks,
//          staging: { atrasado, ficheros, truncado }, rebasePedido, conEnvironment }
// Devuelve { decision, motivo, tipo, ruta }. «fusionado» con ruta "actions"
// quiere decir «fusionable con la App»: quien llama decide cómo.
export function decidir(datos) {
  const { repo, pr, commits, ficheros, checks, staging, rebasePedido, conEnvironment = [] } = datos;
  let ruta = null;
  const espera = (motivo, tipo = null) => ({ decision: "espera", motivo, tipo, ruta });

  if (pr.user?.login !== BOT || pr.user?.type !== "Bot") return espera("autor");
  if (pr.base?.ref !== BASE) return espera("base");
  if (pr.head?.repo?.full_name !== repo) return espera("rama-ajena");
  if (!commitsDeDependabot(commits)) return espera("commits-ajenos");
  const revision = revisarFicheros(ficheros, conEnvironment);
  ruta = revision.ruta;
  if (revision.motivo) return espera(revision.motivo);

  const textos = [pr.body ?? "", ...commits.map((c) => c.commit?.message ?? "")];
  const { tipo } = clasificar({ titulo: pr.title, textos });
  if (tipo === "mayor") return espera("mayor", tipo);
  if (tipo === "grupo-manual") return espera("grupo-manual", tipo);
  if (ruta === "npm" && dependenciasDe({ titulo: pr.title, textos }).some((d) => CERO.includes(d))) return espera("grupo-manual", tipo);
  if (tipo !== "menor") return espera("version-desconocida", tipo);

  // El check del head SHA ACTUAL del PR: un run viejo en verde no cuenta.
  const ultimo = [...checks]
    .filter((c) => c.name === CHECK && c.app?.slug === "github-actions" && c.head_sha === pr.head.sha)
    .sort((a, b) => b.id - a.id)[0];
  if (!ultimo || ultimo.status !== "completed" || ultimo.conclusion !== "success") return espera("tests-no-verde", tipo);

  if (pr.mergeable === false) return espera("conflicto", tipo);
  if (pr.mergeable !== true) return espera("mergeable-desconocido", tipo);

  const nombres = ficheros.map((f) => f.filename);
  if (staging.atrasado && (staging.truncado || seSolapan(nombres, staging.ficheros))) {
    if (rebasePedido) return espera("rebase-ya-pedido", tipo);
    return { decision: "rebase", motivo: "-", tipo, ruta };
  }
  return { decision: "fusionado", motivo: "-", tipo, ruta };
}

export function linea({ pr, decision, motivo, tipo, ruta }) {
  return `dependabot-auto pr: ${pr} decision: ${decision} motivo: ${motivo} tipo: ${tipo ?? "-"} ruta: ${ruta ?? "-"}`;
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

function salidaGithub(clave, valor) {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${clave}=${valor}\n`);
}

// El contenido de un workflow en staging, o null si no existe allí.
async function workflowEnStaging(api, ruta) {
  try {
    const r = await api(`/contents/${ruta}?ref=${BASE}`);
    return Buffer.from(r.content ?? "", "base64").toString("utf8");
  } catch (e) {
    if (e.status === 404) return null; // a propósito: no existe en staging, y usaEnvironment(null) lo trata como sensible
    throw e;
  }
}

// Todo lo que hace falta para decidir sobre un PR, leído con el token de lectura.
async function leerPr({ api, paginas, esperar = dormir }, n) {
  let pr = await api(`/pulls/${n}`);
  for (let i = 0; i < 3 && pr.mergeable === null; i++) {
    await esperar(3000);
    pr = await api(`/pulls/${n}`);
  }
  const commits = await paginas(`/pulls/${n}/commits`);
  const ficheros = (await paginas(`/pulls/${n}/files`)).map((f) => ({ filename: f.filename, patch: f.patch }));
  const conEnvironment = [];
  for (const { filename } of ficheros) {
    if (WORKFLOW.test(filename) && usaEnvironment(await workflowEnStaging(api, filename))) conEnvironment.push(filename);
  }
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
  return { pr, commits, ficheros, checks, staging, rebasePedido, conEnvironment };
}

// La pasada del primer job: no ve la clave de la App ni el environment. Fusiona
// npm, pide rebases y apunta (salida app_pr/app_sha) el primer PR de actions
// fusionable; el segundo job decide si hay clave. Devuelve { fallos, lineas }.
export async function pasada({ api, paginas, repo, si, salida = salidaGithub, log = console.log, esperar = dormir }) {
  let fallos = 0;
  let apuntado = null;
  const lineas = [];
  const decir = (l) => {
    lineas.push(l);
    log(l);
  };

  const abiertos = (await paginas(`/pulls?state=open&base=${BASE}`)).filter((p) => p.user?.login === BOT);
  log(`dependabot-auto abiertos: ${abiertos.length} modo: ${si ? "si" : "ensayo"}`);

  for (const resumen of abiertos) {
    const n = resumen.number;
    try {
      const d = await leerPr({ api, paginas, esperar }, n);
      let r = decidir({ repo, ...d });
      if (r.decision === "fusionado" && r.ruta === "actions") {
        r = apuntado ? { ...r, decision: "espera", motivo: "app-ocupada" } : { ...r, decision: "para-app" };
      }
      if (r.decision !== "espera" && !si) r = { ...r, decision: "espera", motivo: "ensayo", haria: r.decision };
      else if (r.decision === "fusionado") {
        await api(`/pulls/${n}/merge`, { method: "PUT", body: { sha: d.pr.head.sha, merge_method: "merge" } });
      } else if (r.decision === "rebase") {
        await api(`/issues/${n}/comments`, { method: "POST", body: { body: "@dependabot rebase" } });
      }
      // apuntado también en ensayo, para que el segundo de actions salga app-ocupada igual
      if (r.decision === "para-app" || r.haria === "para-app") apuntado = { n, sha: d.pr.head.sha };
      if (r.decision === "para-app") {
        salida("app_pr", n);
        salida("app_sha", d.pr.head.sha);
      }
      decir(linea({ pr: n, ...r }) + (r.haria ? ` haria: ${r.haria}` : ""));
    } catch (e) {
      fallos++;
      decir(linea({ pr: n, decision: "error", motivo: "api", tipo: null, ruta: null }));
      console.error(`PR #${n}: ${e.message}`);
    }
  }
  return { fallos, lineas };
}

// El segundo job: vuelve a comprobarlo todo con el token de lectura y solo usa
// el de la App (appToken) para la fusión. Sin token, no falla: `sin-clave-app`.
// Devuelve la línea.
export async function fusionarConApp({ api, paginas, repo, appToken, clienteApp = cliente, log = console.log, esperar = dormir }, n, sha) {
  const decir = (l) => (log(l), l);
  if (!appToken) return decir(linea({ pr: n, decision: "espera", motivo: "sin-clave-app", tipo: null, ruta: "actions" }));
  const d = await leerPr({ api, paginas, esperar }, n);
  const r = decidir({ repo, ...d });
  if (d.pr.head.sha !== sha) return decir(linea({ pr: n, decision: "espera", motivo: "sha-cambiado", tipo: r.tipo, ruta: r.ruta }));
  if (r.decision !== "fusionado" || r.ruta !== "actions") return decir(linea({ pr: n, ...r }));
  await clienteApp(appToken, repo).api(`/pulls/${n}/merge`, { method: "PUT", body: { sha, merge_method: "merge" } });
  return decir(linea({ pr: n, ...r }));
}

async function main() {
  const args = process.argv.slice(2);
  const si = args.includes("--si");
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY || "pabloam89/MenuPlan";
  if (!token) {
    console.error("Falta GITHUB_TOKEN (o GH_TOKEN).");
    process.exit(2);
  }
  const c = { ...cliente(token, repo), repo, si };
  const iApp = args.indexOf("--fusionar-app");
  if (iApp >= 0) {
    const n = Number(args[iApp + 1]);
    const sha = args[args.indexOf("--sha") + 1];
    if (!Number.isInteger(n) || !/^[0-9a-f]{40}$/.test(sha ?? "")) {
      console.error("Uso: --fusionar-app <n> --sha <sha de 40>");
      process.exit(2);
    }
    await fusionarConApp({ ...c, appToken: process.env.APP_TOKEN }, n, sha);
    return;
  }
  if ((await pasada(c)).fallos > 0) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
