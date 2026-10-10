/**
 * fondos-pr.mjs — el PR y su problema de fondo (paso «Fondos del PR» de
 * tests.yml, #337). Mismo patrón que casos-pr.mjs: lógica pura, cliente de la
 * API con reintentos, FALLA CERRADO si la API no responde y los bots, exentos.
 *
 * Hasta ahora `Closes #n` y `Agente:` solo los pedía la guardia, y solo a las
 * sesiones de Claude (P07.2 y P07.9 de ops/flujo.json). Aquí los pide el CI, a
 * cualquiera:
 *
 *   1. El PR lleva una línea `Agente: <nombre>` con un agente de .claude/agents/
 *      o `sesión` (de ahí sale quién arregló qué, `npm run issues`).
 *   2. Si la rama es de un issue (`area/193-nombre`), el cuerpo lleva `Closes #193`.
 *   3. Cada `Closes #n` es un issue de verdad y:
 *      - si es un ENCARGO colgado de un fondo, ese fondo tiene diagnóstico
 *        (mecanismo y causa_escape en su ficha): sin diagnóstico no hay encargos;
 *      - si es un FONDO, su ficha tiene aprendizaje: sin él no se cierra.
 *      Los fondos anteriores a la ficha (FICHA_DESDE) sin ficha no se exigen.
 *
 * El cuerpo del PR se lee con limpiarCuerpo (sin comentarios ni bloques de
 * código: la plantilla explica las líneas en un comentario y no cuenta).
 *
 * Uso (lo lanza el CI): PR_BODY=… PR_AUTOR=… PR_RAMA=… GITHUB_TOKEN=… GITHUB_REPOSITORY=… node scripts/fondos-pr.mjs
 */
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { MAX_CASOS, MAX_NUMERO, limpiarCuerpo } from "../.claude/hooks/casos.mjs";
import { ErrorDeApi, pedir } from "./lib/ghApi.mjs";
import { CAPAS_AGENTE, aprendizajeValido, fichaObligatoria, fondoDeRest, leerFicha } from "./lib/fondos.mjs";
import { porGrupo } from "./lib/issues.mjs";

const BOTS = new Set(["dependabot[bot]", "github-actions[bot]"]);

const nombres = (i) => (i.labels ?? []).map((l) => (typeof l === "string" ? l : l.name));
const tipoDe = (i) => [...porGrupo(nombres(i)).tipo][0] ?? null;

/** Las líneas `Agente:` del cuerpo. → { lineas:[nombre…], malas:[…] }. */
export function agentesDelPr(cuerpo) {
  const re = /^[ \t>*-]*(?:\*\*)?Agente(?:\*\*)?[ \t]*:(?:\*\*)?[ \t]*`?([\p{L}-]{0,40})/gimu;
  const lineas = [...limpiarCuerpo(cuerpo).matchAll(re)].map((m) => m[1].toLowerCase().replace(/^sesion$/, "sesión"));
  return { lineas, malas: lineas.filter((a) => !CAPAS_AGENTE.includes(a)) };
}

/** Los `Closes #n` / `Fixes #n` / `Resolves #n` del cuerpo (como en la guardia), sin repetir. */
export function cierresDelPr(cuerpo) {
  const re = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?):?[ \t]+#(\d{1,8})\b/gi;
  return [...new Set([...limpiarCuerpo(cuerpo).matchAll(re)].map((m) => Number(m[1])))];
}

/**
 * Decide si el PR cumple. `consultar(n)` → el issue de la API o null;
 * `consultarPadre(n)` → su padre o null; ambos pueden lanzar ErrorDeApi.
 */
export async function comprobar({ cuerpo, autor = "", rama = "", consultar, consultarPadre }) {
  if (BOTS.has(String(autor).toLowerCase())) return { ok: true, motivo: "PR de un bot: exento." };
  const fallos = [];

  const { lineas, malas } = agentesDelPr(cuerpo);
  if (!lineas.length) fallos.push(`falta la línea «Agente: <nombre>» (${CAPAS_AGENTE.join(", ")}); la plantilla del PR la trae`);
  else if (malas.length) fallos.push(`«Agente: ${malas[0].slice(0, 30).replace(/[^\p{L}\p{N}_-]/gu, "?")}» no es un agente (${CAPAS_AGENTE.join(", ")})`);

  const cierres = cierresDelPr(cuerpo);
  if (cierres.length > MAX_CASOS || cierres.some((n) => n > MAX_NUMERO || n < 1)) {
    return { ok: false, motivo: `El PR cierra demasiados issues o números que no son de un issue (máximo ${MAX_CASOS}).` };
  }
  // `area/193-nombre`: el número va seguido de una letra y es corto; `fix/2026-10-recetas` es una fecha, no un issue.
  const deRama = /^[a-z]+\/(\d{1,5})-[a-z]/.exec(String(rama))?.[1];
  if (deRama && !cierres.includes(Number(deRama))) {
    fallos.push(`la rama es del issue #${deRama}: pon «Closes #${deRama}» en el cuerpo del PR (una línea por issue) para que se cierre al fusionar y quede la traza`);
  }

  for (const n of cierres) {
    let issue;
    let padre = null;
    try {
      issue = await consultar(n);
      if (issue && tipoDe(issue) === "encargo") padre = await consultarPadre(n);
    } catch (e) {
      if (!(e instanceof ErrorDeApi)) throw e;
      const como = e.permisos
        ? `La API de GitHub rechaza el token del workflow (${e.message}) al leer #${n}: no es culpa del PR ni sirve relanzar. Revisa que tests.yml tenga «permissions: issues: read» y que el token no haya caducado.`
        : `No he podido consultar #${n} en la API de GitHub (${e.message}). No es culpa del PR: relanza el check.`;
      return { ok: false, api: true, motivo: como };
    }
    if (!issue) {
      fallos.push(`«Closes #${n}»: ese issue no existe`);
      continue;
    }
    if (issue.pull_request) {
      fallos.push(`«Closes #${n}» es un PR, no un issue`);
      continue;
    }
    const tipo = tipoDe(issue);
    if (tipo === "encargo" && padre && tipoDe(padre) === "fondo") {
      const f = fondoDeRest(padre);
      const l = leerFicha(f.body);
      if (!l.presente) {
        if (fichaObligatoria(f)) fallos.push(`«Closes #${n}»: su fondo #${padre.number} no tiene ficha; sin diagnóstico (mecanismo y causa_escape) no hay encargos. Añade el bloque «fondo» a #${padre.number}`);
      } else if (l.errores.length) {
        fallos.push(`«Closes #${n}»: la ficha de su fondo #${padre.number} tiene errores (mira el comentario del workflow «fondos» en #${padre.number})`);
      } else if (!l.ficha.mecanismo || !l.ficha.causa_escape) {
        fallos.push(`«Closes #${n}»: su fondo #${padre.number} no tiene diagnóstico (falta ${["mecanismo", "causa_escape"].filter((c) => !l.ficha[c]).join(" y ")}): sin diagnóstico no hay encargos`);
      }
    } else if (tipo === "fondo") {
      const f = fondoDeRest(issue);
      const l = leerFicha(f.body);
      if (!l.presente) {
        if (fichaObligatoria(f)) fallos.push(`«Closes #${n}»: el fondo no tiene ficha, y sin «aprendizaje» no se cierra. Si este PR solo arregla una parte, cierra el encargo, no el fondo`);
      } else if (!aprendizajeValido(l.ficha.aprendizaje)) {
        fallos.push(`«Closes #${n}»: el fondo no tiene «aprendizaje» en su ficha, y sin él no se cierra. Si este PR solo arregla una parte, cierra el encargo, no el fondo`);
      }
    }
  }

  if (fallos.length) return { ok: false, motivo: `El PR no cumple: ${fallos.join("; ")}.` };
  return { ok: true, motivo: `Agente: ${lineas.join(", ")}${cierres.length ? `; Closes ${cierres.map((n) => `#${n}`).join(", ")}` : ""}.` };
}

const esPrincipal = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (esPrincipal) {
  const { PR_BODY = "", PR_AUTOR = "", PR_RAMA = "", GITHUB_TOKEN = "", GITHUB_REPOSITORY = "" } = process.env;
  const base = { token: GITHUB_TOKEN, repo: GITHUB_REPOSITORY || "pabloam89/MenuPlan" };
  const r = await comprobar({
    cuerpo: PR_BODY,
    autor: PR_AUTOR,
    rama: PR_RAMA,
    consultar: (n) => pedir({ ...base, ruta: `/issues/${n}` }),
    consultarPadre: (n) => pedir({ ...base, ruta: `/issues/${n}/parent` }),
  });
  if (r.ok) {
    console.log(`Fondos: ok. ${r.motivo}`);
  } else {
    console.log(`::error title=${r.api ? "No he podido comprobar" : "Falla"} el fondo del PR::${r.motivo}`);
    console.error(`Fondos: FALLA. ${r.motivo}`);
    process.exit(1);
  }
}
