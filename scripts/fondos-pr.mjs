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
 *   4. Toda norma de ops/normas.json sin ejecutor (`nada`) apunta a un issue ABIERTO de tipo encargo o
 *      decisión, el que la lleva (#620): ni un caso, ni un fondo, ni uno cerrado. Es lo que el test local no
 *      puede ver sin red (ops/uniones.test.js solo mira que sea un número). FALLA solo el PR responsable:
 *      el que toca ops/normas.json (`tocaNormas`) o el que lleva `Closes #n` con una norma colgando de #n.
 *      Para los demás, lo mismo sale como AVISO (`::warning`, línea `fondos-pr: resultado=warning`): cerrar
 *      el issue de una norma no pone rojo el check obligatorio `tests` de todos los PR (ronda 3).
 *
 * Cada comprobación deja su línea por norma (#621: `norma: <id> resultado: cumple|salta`, medicionNormas.mjs):
 * `pr-agente-y-closes-en-ci` (la línea Agente), `pr-closes-de-su-rama` (el Closes de la rama con número) y
 * `fondo-no-cierra-sin-aprendizaje` (por cada fondo que cierra). Un bot o una API caída no dejan ninguna.
 *
 * El cuerpo del PR se lee con limpiarCuerpo (sin comentarios ni bloques de
 * código: la plantilla explica las líneas en un comentario y no cuenta).
 *
 * Uso (lo lanza el CI): PR_BODY=… PR_AUTOR=… PR_RAMA=… GITHUB_TOKEN=… GITHUB_REPOSITORY=… node scripts/fondos-pr.mjs
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { MAX_CASOS, MAX_NUMERO, limpiarCuerpo } from "../.claude/hooks/casos.mjs";
import { ErrorDeApi, pedir } from "./lib/ghApi.mjs";
import { CAPAS_AGENTE, aprendizajeValido, fichaObligatoria, fondoDeRest, leerFicha } from "./lib/fondos.mjs";
import { porGrupo } from "./lib/issues.mjs";
import { lineaDeNorma } from "./lib/medicionNormas.mjs";

const BOTS = new Set(["dependabot[bot]", "github-actions[bot]"]);

const nombres = (i) => (i.labels ?? []).map((l) => (typeof l === "string" ? l : l.name));
export const tipoDe = (i) => [...porGrupo(nombres(i)).tipo][0] ?? null;

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

/** Los tipos de issue que pueden llevar una norma sin ejecutor: el trabajo que le dará uno o la decisión de dárselo. */
export const TIPOS_QUE_LLEVAN = ["encargo", "decision"];

/**
 * Problemas de las normas sin ejecutor (#620): cada una apunta a un issue abierto de tipo encargo o decisión.
 * Devuelve [{ norma, issue, texto }]; `issue` es null si no tiene. `consultar(n)` → el issue de la API o null;
 * puede lanzar ErrorDeApi (lo recoge quien llama).
 */
export async function problemasDeNormasSinEjecutor(normas, consultar) {
  const malos = [];
  const vistos = new Map();
  for (const n of (normas ?? []).filter((x) => x.ejecutor === "nada")) {
    const mal = (texto) => malos.push({ norma: n.id, issue: Number.isInteger(n.issue) ? n.issue : null, texto: `norma ${n.id}: ${texto}` });
    if (!Number.isInteger(n.issue)) { mal("sin ejecutor y sin issue que la lleve"); continue; }
    if (!vistos.has(n.issue)) vistos.set(n.issue, await consultar(n.issue));
    const i = vistos.get(n.issue);
    if (!i || i.pull_request) mal(`su issue #${n.issue} no existe o es un PR`);
    else if (String(i.state).toLowerCase() !== "open") mal(`su issue #${n.issue} está cerrado; cuélgala de un encargo abierto que le dé ejecutor (#624 si no hay otro)`);
    else if (!TIPOS_QUE_LLEVAN.includes(tipoDe(i))) mal(`su issue #${n.issue} es de tipo ${tipoDe(i) ?? "sin tipo"}; la lleva un encargo o una decisión, no un caso ni un fondo`);
  }
  return malos;
}

/** De esos problemas, los que son de ESTE PR: todos si toca ops/normas.json; si no, los de una norma colgada de un issue que cierra. */
export const deEstePr = (problemas, { tocaNormas, cierres }) => problemas.filter((p) => tocaNormas || (p.issue !== null && cierres.includes(p.issue)));

/**
 * Decide si el PR cumple. `consultar(n)` → el issue de la API o null;
 * `consultarPadre(n)` → su padre o null; ambos pueden lanzar ErrorDeApi.
 */
export async function comprobar({ cuerpo, autor = "", rama = "", consultar, consultarPadre, normas = [], tocaNormas = false }) {
  if (BOTS.has(String(autor).toLowerCase())) return { ok: true, motivo: "PR de un bot: exento." };
  const fallos = [];
  // Lo que pasó con cada norma que se mira (medicionNormas.mjs): se imprime al final.
  const medidas = [];
  const mide = (norma, cumple) => medidas.push({ norma, resultado: cumple ? "cumple" : "salta" });

  const { lineas, malas } = agentesDelPr(cuerpo);
  mide("pr-agente-y-closes-en-ci", lineas.length > 0 && !malas.length);
  if (!lineas.length) fallos.push(`falta la línea «Agente: <nombre>» (${CAPAS_AGENTE.join(", ")}); la plantilla del PR la trae`);
  else if (malas.length) fallos.push(`«Agente: ${malas[0].slice(0, 30).replace(/[^\p{L}\p{N}_-]/gu, "?")}» no es un agente (${CAPAS_AGENTE.join(", ")})`);

  const cierres = cierresDelPr(cuerpo);
  if (cierres.length > MAX_CASOS || cierres.some((n) => n > MAX_NUMERO || n < 1)) {
    return { ok: false, motivo: `El PR cierra demasiados issues o números que no son de un issue (máximo ${MAX_CASOS}).` };
  }
  // `area/193-nombre`: el número va seguido de una letra y es corto; `fix/2026-10-recetas` es una fecha, no un issue.
  const deRama = /^[a-z]+\/(\d{1,5})-[a-z]/.exec(String(rama))?.[1];
  if (deRama) mide("pr-closes-de-su-rama", cierres.includes(Number(deRama)));
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
      if (l.presente || fichaObligatoria(f)) mide("fondo-no-cierra-sin-aprendizaje", l.presente && aprendizajeValido(l.ficha.aprendizaje));
      if (!l.presente) {
        if (fichaObligatoria(f)) fallos.push(`«Closes #${n}»: el fondo no tiene ficha, y sin «aprendizaje» no se cierra. Si este PR solo arregla una parte, cierra el encargo, no el fondo`);
      } else if (!aprendizajeValido(l.ficha.aprendizaje)) {
        fallos.push(`«Closes #${n}»: el fondo no tiene «aprendizaje» en su ficha, y sin él no se cierra. Si este PR solo arregla una parte, cierra el encargo, no el fondo`);
      }
    }
  }

  let avisos = [];
  try {
    const todos = await problemasDeNormasSinEjecutor(normas, consultar);
    const suyos = deEstePr(todos, { tocaNormas, cierres });
    fallos.push(...suyos.map((p) => p.texto));
    avisos = todos.filter((p) => !suyos.includes(p)).map((p) => p.texto);
  } catch (e) {
    if (!(e instanceof ErrorDeApi)) throw e;
    // Un token sin permiso no se arregla relanzando (como al leer un Closes): se dice distinto.
    const como = e.permisos
      ? `La API de GitHub rechaza el token del workflow (${e.message}) al leer los issues de las normas sin ejecutor: no es culpa del PR ni sirve relanzar. Revisa que tests.yml tenga «permissions: issues: read» y que el token no haya caducado.`
      : `No he podido consultar los issues de las normas sin ejecutor en la API de GitHub (${e.message}). No es culpa del PR: relanza el check.`;
    return { ok: false, api: true, motivo: como };
  }

  if (fallos.length) return { ok: false, motivo: `El PR no cumple: ${fallos.join("; ")}.`, avisos, medidas };
  return { ok: true, avisos, medidas, motivo: `Agente: ${lineas.join(", ")}${cierres.length ? `; Closes ${cierres.map((n) => `#${n}`).join(", ")}` : ""}.` };
}

const esPrincipal = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (esPrincipal) {
  const { PR_BODY = "", PR_AUTOR = "", PR_RAMA = "", GITHUB_TOKEN = "", GITHUB_REPOSITORY = "" } = process.env;
  const base = { token: GITHUB_TOKEN, repo: GITHUB_REPOSITORY || "pabloam89/MenuPlan" };
  // ¿Toca este PR ops/normas.json? Lo dice el diff del commit de fusión que revisa el CI (HEAD^1 es la base).
  let tocaNormas = false;
  try {
    tocaNormas = execFileSync("git", ["diff", "--name-only", "HEAD^1", "HEAD"], { encoding: "utf8" }).split(/\r?\n/).includes("ops/normas.json");
  } catch {
    tocaNormas = true; // a propósito: sin diff no se sabe, y es mejor un fallo que se explica que un hueco
  }
  const r = await comprobar({
    cuerpo: PR_BODY,
    autor: PR_AUTOR,
    rama: PR_RAMA,
    consultar: (n) => pedir({ ...base, ruta: `/issues/${n}` }),
    consultarPadre: (n) => pedir({ ...base, ruta: `/issues/${n}/parent` }),
    tocaNormas,
    normas: JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "ops", "normas.json"), "utf8")).normas,
  });
  for (const m of r.medidas ?? []) console.log(lineaDeNorma(m.norma, m.resultado));
  for (const a of r.avisos ?? []) console.log(`::warning title=Norma sin ejecutor mal colgada::${a}. No es de este PR: lo arregla quien la toque o quien cierre ese issue.\nfondos-pr: regla=normas-sin-ejecutor resultado=warning detalle=${a.split(":")[0].replace("norma ", "")}`);
  if (r.ok) {
    console.log(`Fondos: ok. ${r.motivo}`);
  } else {
    console.log(`::error title=${r.api ? "No he podido comprobar" : "Falla"} el fondo del PR::${r.motivo}`);
    console.error(`Fondos: FALLA. ${r.motivo}`);
    process.exit(1);
  }
}
