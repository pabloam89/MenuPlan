/**
 * casos-pr.mjs — comprueba la línea «Casos:» de un PR (paso de tests.yml, #185).
 *
 * Cada PR dice qué casos deja registrados (`Casos: #n, #m`) o por qué no hay
 * (`Casos: ninguno — <motivo>`). Aquí se comprueba, además de la forma (la
 * misma lógica que la guardia: .claude/hooks/casos.mjs), que cada #n existe,
 * es un issue (no un PR), lleva `tipo:caso` y UNA etiqueta `analisis:` válida:
 * un caso sin analizar hasta su problema de fondo no cuenta. Un `dueño/repo#n` (de un repo de
 * ops/entidades.json, #856) se consulta en SU repo; si el token no llega a él (403 o 404), queda un aviso, no un fallo.
 *
 * Si la API de GitHub no responde, FALLA con la causa (tras reintentar): pasar
 * en silencio dejaría colar justo lo que esto vigila. Se arregla relanzando el
 * check. Exentos: los PR de un bot (Dependabot, Actions).
 *
 * Uso (lo lanza el CI): PR_BODY=… PR_AUTOR=… GITHUB_TOKEN=… GITHUB_REPOSITORY=… node scripts/casos-pr.mjs
 */
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { AYUDA, analizarCasos } from "../.claude/hooks/casos.mjs";
import { referenciasLocales } from "./lib/fondos.mjs";
import { ErrorDeApi, pedir } from "./lib/ghApi.mjs";
import { GRUPOS, porGrupo } from "./lib/issues.mjs";
import { reposDeProyectos } from "./lib/normas.mjs";
import { escribirReferencia, sinAccesoAOtroRepo } from "../.claude/hooks/referenciaIssue.mjs";

const BOTS = new Set(["dependabot[bot]", "github-actions[bot]"]);
const ANALISIS = Object.keys(GRUPOS.analisis.valores);

export { ErrorDeApi };

/** ¿Es el issue un caso bien analizado? → null si vale, o el porqué. `n`: el número (de este repo) o la referencia ya escrita (`#301` o `dueño/repo#301`). */
export function falloDeCaso(n, issue) {
  const ref = typeof n === "number" ? `#${n}` : n;
  if (!issue) return `${ref} no existe`;
  const referencia = `${ref} aparece en la línea Casos: pero no es un caso. Si solo es una referencia en el texto, escríbela sin # (por ejemplo PR 15, issue 15)`;
  if (issue.pull_request) return `${ref} es un PR, no un issue. ${referencia}`;
  const g = porGrupo((issue.labels ?? []).map((l) => (typeof l === "string" ? l : l.name)));
  if (!g.tipo.has("caso")) return `${ref} no es tipo:caso (${[...g.tipo].join(", ") || "sin tipo"}). ${referencia}`;
  if (!g.analisis.size) return `${ref} no tiene etiqueta analisis: (${ANALISIS.join(", ")})`;
  if (g.analisis.size > 1) return `${ref} tiene más de un analisis:`;
  const raro = [...g.analisis].find((a) => !ANALISIS.includes(a));
  if (raro) return `${ref} tiene analisis:${raro}, que no es de la lista (${ANALISIS.join(", ")})`;
  return null;
}

/**
 * Decide si el PR cumple. `consultar(n, repo)` devuelve el issue de la API, o null si
 * no existe, o lanza ErrorDeApi. `refs`: { repoPropio, repos } (en el CI, GITHUB_REPOSITORY y ops/entidades.json).
 */
export async function comprobar({ cuerpo, autor = "", consultar, refs = referenciasLocales() }) {
  if (BOTS.has(String(autor).toLowerCase())) return { ok: true, motivo: "PR de un bot: exento." };
  const linea = analizarCasos(cuerpo, refs);
  if (!linea.valida) return { ok: false, motivo: `${linea.motivo} ${AYUDA}` };
  if (linea.ninguno) return { ok: true, motivo: "Casos: ninguno, con su motivo." };
  const fallos = [];
  const avisos = [];
  for (const ref of linea.referencias) {
    // La referencia validada, nunca el texto del autor: `#301` o `dueño/repo#301`.
    const n = escribirReferencia(ref, refs.repoPropio);
    let issue;
    try {
      issue = await consultar(ref.numero, ref.repo);
    } catch (e) {
      if (!(e instanceof ErrorDeApi)) throw e;
      if (sinAccesoAOtroRepo(ref, refs, e)) {
        avisos.push(`${ref.repo}#${ref.numero}: el token no llega a ese repo (${e.message}); no se ha podido comprobar`);
        continue;
      }
      if (e.permisos) {
        return { ok: false, api: true, motivo: `La API de GitHub rechaza el token del workflow (${e.message}) al leer ${n}: no es culpa del PR ni sirve relanzar. Revisa que tests.yml tenga «permissions: issues: read» y que el token no haya caducado.` };
      }
      return { ok: false, api: true, motivo: `No he podido consultar ${n} en la API de GitHub (${e.message}). No es culpa del PR: relanza el check.` };
    }
    if (!issue && sinAccesoAOtroRepo(ref, refs)) {
      avisos.push(`${ref.repo}#${ref.numero}: no aparece con el token del workflow (no existe o el token no llega a ese repo); no se ha podido comprobar`);
      continue;
    }
    const f = falloDeCaso(n, issue);
    if (f) fallos.push(f);
  }
  if (fallos.length) {
    return { ok: false, avisos, motivo: `La línea «Casos:» cita ${fallos.join("; ")}. Un caso es un issue tipo:caso con su analisis: (nuevo, abierto, no-aguanto-roto, no-aguanto-corto o puntual).` };
  }
  return { ok: true, avisos, motivo: `Casos: ${linea.referencias.map((r) => escribirReferencia(r, refs.repoPropio)).join(", ")} (todos tipo:caso con analisis${avisos.length ? ", salvo los de otro repo sin comprobar" : ""}).` };
}

/** Consulta real a la API REST, con reintentos para fallos pasajeros (cliente común: scripts/lib/ghApi.mjs). */
export function consultaReal({ token, repo, fetchFn = globalThis.fetch, espera, intentos = 3 }) {
  // Cada referencia en SU repo, con el mismo token; sin repo, el propio.
  return (n, deRepo = repo) => pedir({ token, repo: deRepo, ruta: `/issues/${n}`, fetchFn, espera, intentos });
}

const esPrincipal = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (esPrincipal) {
  const { PR_BODY = "", PR_AUTOR = "", GITHUB_TOKEN = "", GITHUB_REPOSITORY = "" } = process.env;
  const repo = GITHUB_REPOSITORY || "pabloam89/MenuPlan";
  const refs = { repoPropio: repo, repos: reposDeProyectos(join(dirname(fileURLToPath(import.meta.url)), "..")) };
  const r = await comprobar({ cuerpo: PR_BODY, autor: PR_AUTOR, consultar: consultaReal({ token: GITHUB_TOKEN, repo }), refs });
  for (const a of r.avisos ?? []) console.log(`::warning title=Caso de otro repo sin comprobar::${a}.`);
  if (r.ok) {
    console.log(`Casos: ok. ${r.motivo}`);
  } else {
    console.log(`::error title=${r.api ? "No he podido comprobar" : "Falta o falla"} la línea «Casos:» del PR::${r.motivo}`);
    console.error(`Casos: FALLA. ${r.motivo}`);
    process.exit(1);
  }
}
