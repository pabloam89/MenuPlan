/**
 * casos-pr.mjs — comprueba la línea «Casos:» de un PR (paso de tests.yml, #185).
 *
 * Cada PR dice qué casos deja registrados (`Casos: #n, #m`) o por qué no hay
 * (`Casos: ninguno — <motivo>`). Aquí se comprueba, además de la forma (la
 * misma lógica que la guardia: .claude/hooks/casos.mjs), que cada #n existe,
 * es un issue (no un PR), lleva `tipo:caso` y UNA etiqueta `analisis:` válida:
 * un caso sin analizar hasta su problema de fondo no cuenta.
 *
 * Si la API de GitHub no responde, FALLA con la causa (tras reintentar): pasar
 * en silencio dejaría colar justo lo que esto vigila. Se arregla relanzando el
 * check. Exentos: los PR de un bot (Dependabot, Actions).
 *
 * Uso (lo lanza el CI): PR_BODY=… PR_AUTOR=… GITHUB_TOKEN=… GITHUB_REPOSITORY=… node scripts/casos-pr.mjs
 */
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { AYUDA, analizarCasos } from "../.claude/hooks/casos.mjs";
import { GRUPOS, porGrupo } from "./lib/issues.mjs";

const BOTS = new Set(["dependabot[bot]", "github-actions[bot]"]);
const ANALISIS = Object.keys(GRUPOS.analisis.valores);

/** Error de la API (no del PR): el mensaje dice la causa. */
export class ErrorDeApi extends Error {
  /** `permisos`: 401, el token no sirve; relanzar no lo arregla. */
  constructor(mensaje, { permisos = false } = {}) {
    super(mensaje);
    this.permisos = permisos;
  }
}

/** ¿Es el issue un caso bien analizado? → null si vale, o el porqué. */
export function falloDeCaso(n, issue) {
  if (!issue) return `#${n} no existe`;
  if (issue.pull_request) return `#${n} es un PR, no un issue`;
  const g = porGrupo((issue.labels ?? []).map((l) => (typeof l === "string" ? l : l.name)));
  if (!g.tipo.has("caso")) return `#${n} no es tipo:caso (${[...g.tipo].join(", ") || "sin tipo"})`;
  if (!g.analisis.size) return `#${n} no tiene etiqueta analisis: (${ANALISIS.join(", ")})`;
  if (g.analisis.size > 1) return `#${n} tiene más de un analisis:`;
  const raro = [...g.analisis].find((a) => !ANALISIS.includes(a));
  if (raro) return `#${n} tiene analisis:${raro}, que no es de la lista (${ANALISIS.join(", ")})`;
  return null;
}

/**
 * Decide si el PR cumple. `consultar(n)` devuelve el issue de la API, o null si
 * no existe, o lanza ErrorDeApi.
 */
export async function comprobar({ cuerpo, autor = "", consultar }) {
  if (BOTS.has(String(autor).toLowerCase())) return { ok: true, motivo: "PR de un bot: exento." };
  const linea = analizarCasos(cuerpo);
  if (!linea.valida) return { ok: false, motivo: `${linea.motivo} ${AYUDA}` };
  if (linea.ninguno) return { ok: true, motivo: "Casos: ninguno, con su motivo." };
  const fallos = [];
  for (const n of linea.numeros) {
    let issue;
    try {
      issue = await consultar(n);
    } catch (e) {
      if (!(e instanceof ErrorDeApi)) throw e;
      if (e.permisos) {
        return { ok: false, api: true, motivo: `La API de GitHub rechaza el token del workflow (${e.message}) al leer #${n}: no es culpa del PR ni sirve relanzar. Revisa que tests.yml tenga «permissions: issues: read» y que el token no haya caducado.` };
      }
      return { ok: false, api: true, motivo: `No he podido consultar #${n} en la API de GitHub (${e.message}). No es culpa del PR: relanza el check.` };
    }
    const f = falloDeCaso(n, issue);
    if (f) fallos.push(f);
  }
  if (fallos.length) {
    return { ok: false, motivo: `La línea «Casos:» cita ${fallos.join("; ")}. Un caso es un issue tipo:caso con su analisis: (nuevo, abierto, no-aguanto-roto, no-aguanto-corto o puntual).` };
  }
  return { ok: true, motivo: `Casos: ${linea.numeros.map((n) => `#${n}`).join(", ")} (todos tipo:caso con analisis).` };
}

/** Consulta real a la API REST, con reintentos para fallos pasajeros. */
export function consultaReal({ token, repo, fetchFn = globalThis.fetch, espera = (ms) => new Promise((r) => setTimeout(r, ms)), intentos = 3 }) {
  return async (n) => {
    let causa = "";
    let permisos = false;
    for (let i = 1; i <= intentos; i++) {
      try {
        const r = await fetchFn(`https://api.github.com/repos/${repo}/issues/${n}`, {
          headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" },
          signal: AbortSignal.timeout(10_000),
        });
        if (r.status === 404) return null;
        if (r.ok) return await r.json();
        causa = `HTTP ${r.status}`;
        if (r.status === 401) {
          permisos = true; // el token no vale: reintentar no lo arregla
          break;
        }
      } catch (e) {
        causa = e?.message ?? String(e);
      }
      if (i < intentos) await espera(1000 * i);
    }
    throw new ErrorDeApi(causa, { permisos });
  };
}

const esPrincipal = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (esPrincipal) {
  const { PR_BODY = "", PR_AUTOR = "", GITHUB_TOKEN = "", GITHUB_REPOSITORY = "" } = process.env;
  const r = await comprobar({ cuerpo: PR_BODY, autor: PR_AUTOR, consultar: consultaReal({ token: GITHUB_TOKEN, repo: GITHUB_REPOSITORY || "pabloam89/MenuPlan" }) });
  if (r.ok) {
    console.log(`Casos: ok. ${r.motivo}`);
  } else {
    console.log(`::error title=${r.api ? "No he podido comprobar" : "Falta o falla"} la línea «Casos:» del PR::${r.motivo}`);
    console.error(`Casos: FALLA. ${r.motivo}`);
    process.exit(1);
  }
}
