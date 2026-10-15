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
 *   2. Si la rama es de un issue (`area/193-nombre`, numeroDeRama de lleva.mjs), el cuerpo lleva `Closes #193`.
 *   3. Cada `Closes #n` (o `Closes dueño/repo#n`, de un repo de ops/entidades.json, #856) es un issue de verdad,
 *      consultado EN SU REPO; si el token no llega a otro repo (403 o 404), queda un aviso, no un fallo. Y:
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
 * Cada comprobación deja su línea por norma (#621: `norma: <id> resultado: ok|fail pr: <n>`, medicionNormas.mjs):
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

import { MAX_CASOS, limpiarCuerpo } from "../.claude/hooks/casos.mjs";
import { ErrorDeApi, pedir } from "./lib/ghApi.mjs";
import { CAPAS_AGENTE, aprendizajeValido, fichaObligatoria, fondoDeRest, leerFicha, referenciasLocales } from "./lib/fondos.mjs";
import { porGrupo } from "./lib/issues.mjs";
import { numeroDeRama } from "./lib/lleva.mjs";
import { leerRegistro, reposDeProyectos } from "./lib/normas.mjs";
import { escribirReferencia, leerCierres, mismaReferencia, repoDeIssue, sinAccesoAOtroRepo } from "../.claude/hooks/referenciaIssue.mjs";
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

/**
 * Los `Closes` / `Fixes` / `Resolves` del cuerpo, sin repetir: la forma única de leerCierres (la misma que la guardia).
 * → `[{ repo, numero } | { error, texto }]`; un `Closes` a un repo que no es de ops/entidades.json sale como error.
 */
export function cierresDelPr(cuerpo, refs = referenciasLocales()) {
  return leerCierres(cuerpo, refs);
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
export const deEstePr = (problemas, { tocaNormas, cierres, repoPropio }) => problemas.filter((p) => tocaNormas || (p.issue !== null && cierres.some((c) => mismaReferencia(c, { repo: repoPropio, numero: p.issue }))));

/**
 * Decide si el PR cumple. `consultar(n, repo)` → el issue de la API o null;
 * `consultarPadre(n, repo)` → su padre o null; ambos pueden lanzar ErrorDeApi. `refs`: { repoPropio, repos }
 * (en el CI, GITHUB_REPOSITORY y los de ops/entidades.json).
 */
export async function comprobar({ cuerpo, autor = "", rama = "", consultar, consultarPadre, normas = [], tocaNormas = false, refs = referenciasLocales() }) {
  if (BOTS.has(String(autor).toLowerCase())) return { ok: true, motivo: "PR de un bot: exento." };
  const fallos = [];
  // Lo que pasó con cada norma que se mira (medicionNormas.mjs): se imprime al final.
  const medidas = [];
  const mide = (norma, cumple) => medidas.push({ norma, resultado: cumple ? "ok" : "fail" });

  const { lineas, malas } = agentesDelPr(cuerpo);
  mide("pr-agente-y-closes-en-ci", lineas.length > 0 && !malas.length);
  if (!lineas.length) fallos.push(`falta la línea «Agente: <nombre>» (${CAPAS_AGENTE.join(", ")}); la plantilla del PR la trae`);
  else if (malas.length) fallos.push(`«Agente: ${malas[0].slice(0, 30).replace(/[^\p{L}\p{N}_-]/gu, "?")}» no es un agente (${CAPAS_AGENTE.join(", ")})`);

  const leidos = cierresDelPr(cuerpo, refs);
  const cierres = leidos.filter((c) => !c.error);
  if (cierres.length > MAX_CASOS) {
    return { ok: false, motivo: `El PR cierra demasiados issues (máximo ${MAX_CASOS}).` };
  }
  for (const m of leidos.filter((c) => c.error)) fallos.push(`«Closes ${m.texto.replace(/[^\w./#-]/g, "?")}»: ${m.error}`);
  // `area/193-nombre`: la regla única de rama → número (numeroDeRama); `fix/2026-10-recetas` es una fecha, no un issue.
  const deRama = numeroDeRama(rama);
  const deLaRama = deRama === null ? null : { repo: refs.repoPropio, numero: deRama };
  if (deLaRama) mide("pr-closes-de-su-rama", cierres.some((c) => mismaReferencia(c, deLaRama)));
  if (deLaRama && !cierres.some((c) => mismaReferencia(c, deLaRama))) {
    fallos.push(`la rama es del issue #${deRama}: pon «Closes #${deRama}» en el cuerpo del PR (una línea por issue) para que se cierre al fusionar y quede la traza`);
  }

  const avisosDeAcceso = [];
  for (const ref of cierres) {
    // Cómo se nombra en los mensajes: `#193` o `dueño/repo#193`, ya validado (nunca el texto del autor).
    const n = escribirReferencia(ref, refs.repoPropio);
    let issue;
    let padre = null;
    try {
      issue = await consultar(ref.numero, ref.repo);
      if (issue && tipoDe(issue) === "encargo") padre = await consultarPadre(ref.numero, ref.repo);
    } catch (e) {
      if (!(e instanceof ErrorDeApi)) throw e;
      if (sinAccesoAOtroRepo(ref, refs, e)) {
        avisosDeAcceso.push(`«Closes ${ref.repo}#${ref.numero}»: el token no llega a ese repo (${e.message}); no se ha podido comprobar`);
        continue;
      }
      const como = e.permisos
        ? `La API de GitHub rechaza el token del workflow (${e.message}) al leer ${n}: no es culpa del PR ni sirve relanzar. Revisa que tests.yml tenga «permissions: issues: read» y que el token no haya caducado.`
        : `No he podido consultar ${n} en la API de GitHub (${e.message}). No es culpa del PR: relanza el check.`;
      return { ok: false, api: true, motivo: como };
    }
    if (!issue && sinAccesoAOtroRepo(ref, refs)) {
      // Un 404 de otro repo puede ser que el token no lo ve (repo privado): se avisa, no se falla.
      avisosDeAcceso.push(`«Closes ${ref.repo}#${ref.numero}»: no aparece con el token del workflow (no existe o el token no llega a ese repo); no se ha podido comprobar`);
      continue;
    }
    if (!issue) {
      fallos.push(`«Closes ${n}»: ese issue no existe`);
      continue;
    }
    if (issue.pull_request) {
      fallos.push(`«Closes ${n}» es un PR, no un issue`);
      continue;
    }
    const tipo = tipoDe(issue);
    if (tipo === "encargo" && padre && tipoDe(padre) === "fondo") {
      // El padre y su ficha, en su repo: un `#n` de su ficha es de ese repo.
      const repoPadre = repoDeIssue(padre) ?? ref.repo;
      const pn = escribirReferencia({ repo: repoPadre, numero: padre.number }, refs.repoPropio);
      const f = fondoDeRest(padre);
      const l = leerFicha(f.body, { ...refs, repoPropio: repoPadre });
      if (!l.presente) {
        if (fichaObligatoria(f)) fallos.push(`«Closes ${n}»: su fondo ${pn} no tiene ficha; sin diagnóstico (mecanismo y causa_escape) no hay encargos. Añade el bloque «fondo» a ${pn}`);
      } else if (l.errores.length) {
        fallos.push(`«Closes ${n}»: la ficha de su fondo ${pn} tiene errores (mira el comentario del workflow «fondos» en ${pn})`);
      } else if (!l.ficha.mecanismo || !l.ficha.causa_escape) {
        fallos.push(`«Closes ${n}»: su fondo ${pn} no tiene diagnóstico (falta ${["mecanismo", "causa_escape"].filter((c) => !l.ficha[c]).join(" y ")}): sin diagnóstico no hay encargos`);
      }
    } else if (tipo === "fondo") {
      const f = fondoDeRest(issue);
      const l = leerFicha(f.body, { ...refs, repoPropio: ref.repo });
      if (l.presente || fichaObligatoria(f)) mide("fondo-no-cierra-sin-aprendizaje", l.presente && aprendizajeValido(l.ficha.aprendizaje));
      if (!l.presente) {
        if (fichaObligatoria(f)) fallos.push(`«Closes ${n}»: el fondo no tiene ficha, y sin «aprendizaje» no se cierra. Si este PR solo arregla una parte, cierra el encargo, no el fondo`);
      } else if (!aprendizajeValido(l.ficha.aprendizaje)) {
        fallos.push(`«Closes ${n}»: el fondo no tiene «aprendizaje» en su ficha, y sin él no se cierra. Si este PR solo arregla una parte, cierra el encargo, no el fondo`);
      }
    }
  }

  let avisos = [];
  try {
    const todos = await problemasDeNormasSinEjecutor(normas, consultar);
    const suyos = deEstePr(todos, { tocaNormas, cierres, repoPropio: refs.repoPropio });
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

  if (fallos.length) return { ok: false, motivo: `El PR no cumple: ${fallos.join("; ")}.`, avisos, accesos: avisosDeAcceso, medidas };
  return { ok: true, avisos, accesos: avisosDeAcceso, medidas, motivo: `Agente: ${lineas.join(", ")}${cierres.length ? `; Closes ${cierres.map((c) => escribirReferencia(c, refs.repoPropio)).join(", ")}` : ""}.` };
}

const esPrincipal = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (esPrincipal) {
  const { PR_BODY = "", PR_AUTOR = "", PR_NUMBER = "", PR_RAMA = "", GITHUB_TOKEN = "", GITHUB_REPOSITORY = "" } = process.env;
  const base = { token: GITHUB_TOKEN, repo: GITHUB_REPOSITORY || "pabloam89/MenuPlan" };
  const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
  // El repo propio es el del CI; los demás que vale un `Closes dueño/repo#n`, los de ops/entidades.json (#856).
  const refs = { repoPropio: base.repo, repos: reposDeProyectos(raiz) };
  // ¿Toca este PR ops/normas.json? Lo dice el diff del commit de fusión que revisa el CI (HEAD^1 es la base).
  let tocaNormas = false;
  try {
    tocaNormas = execFileSync("git", ["diff", "--name-only", "HEAD^1", "HEAD"], { encoding: "utf8" }).split(/\r?\n/).some((f) => f === "ops/normas.json" || /^ops[/]proyectos[/][^/]+[/]normas[.]json$/.test(f));
  } catch {
    tocaNormas = true; // a propósito: sin diff no se sabe, y es mejor un fallo que se explica que un hueco
  }
  const r = await comprobar({
    cuerpo: PR_BODY,
    autor: PR_AUTOR,
    rama: PR_RAMA,
    // Cada referencia se consulta en SU repo, con el mismo token.
    consultar: (n, repo = base.repo) => pedir({ ...base, repo, ruta: `/issues/${n}` }),
    consultarPadre: (n, repo = base.repo) => pedir({ ...base, repo, ruta: `/issues/${n}/parent` }),
    tocaNormas,
    refs,
    normas: leerRegistro(raiz).normas,
  });
  for (const m of r.medidas ?? []) console.log(lineaDeNorma(m.norma, m.resultado, { pr: PR_NUMBER }));
  for (const a of r.avisos ?? []) console.log(`::warning title=Norma sin ejecutor mal colgada::${a}. No es de este PR: lo arregla quien la toque o quien cierre ese issue.\nfondos-pr: regla=normas-sin-ejecutor resultado=warning detalle=${a.split(":")[0].replace("norma ", "")}`);
  for (const a of r.accesos ?? []) console.log(`::warning title=Closes de otro repo sin comprobar::${a}.
fondos-pr: regla=closes-otro-repo resultado=warning`);
  if (r.ok) {
    console.log(`Fondos: ok. ${r.motivo}`);
  } else {
    console.log(`::error title=${r.api ? "No he podido comprobar" : "Falla"} el fondo del PR::${r.motivo}`);
    console.error(`Fondos: FALLA. ${r.motivo}`);
    process.exit(1);
  }
}
