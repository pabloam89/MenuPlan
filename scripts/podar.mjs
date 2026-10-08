/**
 * podar.mjs — borra las ramas ya fusionadas en staging, solo si no se pierde
 * nada.
 *
 *   npm run podar                 # ensayo: dice qué borraría y por qué
 *   npm run podar -- --si         # borra
 *   npm run podar -- --dias 14    # solo ramas con el último commit de hace más de 14 días
 *
 * Una rama de GitHub se borra si: no es main ni staging; su punta ya está
 * dentro de origin/staging (fusionada entera); no tiene un PR abierto; su
 * último commit tiene más de N días (1 por defecto: una rama recién sacada de staging, aún sin commits, parece fusionada); y no está sacada en
 * ningún worktree. Con `--si` también borra las ramas LOCALES fusionadas y sin
 * worktree, con `git branch -d` (nunca -D).
 *
 * Lo que no está en staging NO se toca nunca, aunque sea vieja: sale en el
 * informe como «sin fusionar: decide Pablo», y aparte las huérfanas (sin PR ni
 * issue, de más de 3 días), para que alguien diga qué son. Un PR fusionado con squash deja
 * la rama «sin fusionar» para git; también se queda, a propósito.
 *
 * Por qué existe: GitHub borra la rama al fusionar el PR, pero las ~100 de
 * antes del 8 oct 2026 se quedaron, y las sesiones no podían limpiar sin
 * pedírselo a Pablo.
 */
import { execFileSync } from "node:child_process";
import { dirname } from "node:path";

import { leerWorktrees } from "./retirar.mjs";

const PROTEGIDAS = new Set(["main", "staging", "HEAD"]);
const DIA = 24 * 60 * 60 * 1000;

const git = (cwd, args) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const intenta = (fn) => {
  try {
    return fn();
  } catch {
    return null;
  }
};

/** `git ls-remote --heads origin` → [{ rama, sha }]. */
export function leerRemotas(lsRemote) {
  return lsRemote
    .split("\n")
    .map((l) => l.trim().match(/^([0-9a-f]{7,40})\s+refs\/heads\/(.+)$/))
    .filter(Boolean)
    .map(([, sha, rama]) => ({ rama, sha }));
}

/**
 * Reparte las ramas. Cada rama: { rama, fusionada, prAbierto, fecha (ms),
 * enWorktree, ultimo }. Devuelve { borrar, sinFusionar, conPr, recientes,
 * enWorktree, protegidas }, cada una con las ramas que caen ahí. Una rama cae
 * en el PRIMER motivo que la frena, en este orden.
 */
export function clasificar(ramas, { ahora = Date.now(), dias = 1 } = {}) {
  const r = { borrar: [], sinFusionar: [], conPr: [], recientes: [], enWorktree: [], protegidas: [] };
  for (const x of ramas) {
    if (PROTEGIDAS.has(x.rama)) r.protegidas.push(x);
    else if (!x.fusionada) r.sinFusionar.push(x);
    else if (x.prAbierto) r.conPr.push(x);
    else if (x.enWorktree) r.enWorktree.push(x);
    else if (!(x.fecha < ahora - dias * DIA)) r.recientes.push(x);
    else r.borrar.push(x);
  }
  return r;
}

/**
 * Huérfanas: sin fusionar, sin ningún PR (ni abierto ni cerrado), sin issue en
 * el nombre (`ops/193-x`) y con el último commit de hace más de `dias`. Nadie
 * sabe ya qué son: el 8 oct 2026 hubo que reconstruir con un agente qué era
 * cada una. Las de Dependabot no cuentan (las gestiona él).
 */
export function huerfanas(sinFusionar, { conPr, ahora = Date.now(), dias = 3 }) {
  return sinFusionar.filter((x) =>
    !conPr.has(x.rama) && !/^[a-z]+\/\d+-/.test(x.rama) && !x.rama.startsWith("dependabot/") && x.fecha < ahora - dias * DIA);
}

/** Locales que se pueden borrar con -d: fusionadas, sin worktree, no protegidas. */
export function localesABorrar(locales) {
  return locales.filter((x) => !PROTEGIDAS.has(x.rama) && x.fusionada && !x.enWorktree).map((x) => x.rama);
}

function prsAbiertos(cwd) {
  const out = intenta(() =>
    execFileSync("gh", ["pr", "list", "--state", "open", "--limit", "200", "--json", "headRefName"], { cwd, encoding: "utf8", timeout: 30000 }),
  );
  if (out === null) return null;
  return new Set(JSON.parse(out).map((p) => p.headRefName));
}

/** Ramas que han tenido algún PR, abierto, cerrado o fusionado. */
function prsTodos(cwd) {
  const out = intenta(() =>
    execFileSync("gh", ["pr", "list", "--state", "all", "--limit", "1000", "--json", "headRefName"], { cwd, encoding: "utf8", timeout: 60000 }),
  );
  return out === null ? null : new Set(JSON.parse(out).map((p) => p.headRefName));
}

async function main() {
  const args = process.argv.slice(2);
  const si = args.includes("--si");
  const iDias = args.indexOf("--dias");
  const dias = iDias >= 0 ? Number(args[iDias + 1]) : 1;
  if (!Number.isFinite(dias) || dias < 0) {
    console.error("`--dias` necesita un número.");
    process.exit(1);
  }

  const principal = dirname(git(process.cwd(), ["rev-parse", "--path-format=absolute", "--git-common-dir"]));
  git(principal, ["fetch", "-q", "origin"]);

  const abiertos = prsAbiertos(principal);
  if (abiertos === null) {
    // Sin saber qué PR están abiertos no se borra nada: podría ser el de otro.
    console.error("No puedo leer los PR abiertos (`gh pr list`). No borro nada.");
    process.exit(1);
  }
  const sacadas = new Set(leerWorktrees(git(principal, ["worktree", "list", "--porcelain"])).map((w) => w.rama).filter(Boolean));
  const fusionadaEn = (sha) => intenta(() => git(principal, ["merge-base", "--is-ancestor", sha, "origin/staging"])) !== null;

  const remotas = leerRemotas(git(principal, ["ls-remote", "--heads", "origin"])).map(({ rama, sha }) => {
    const info = intenta(() => git(principal, ["log", "-1", "--format=%ct|%s", sha])) ?? "0|";
    const [ct, ...asunto] = info.split("|");
    return {
      rama,
      sha,
      fusionada: fusionadaEn(sha),
      prAbierto: abiertos.has(rama),
      enWorktree: sacadas.has(rama),
      fecha: Number(ct) * 1000,
      ultimo: `${sha.slice(0, 7)} ${new Date(Number(ct) * 1000).toISOString().slice(0, 10)} ${asunto.join("|")}`,
    };
  });
  const c = clasificar(remotas, { dias });

  const locales = git(principal, ["for-each-ref", "--format=%(refname:short)", "refs/heads"])
    .split("\n")
    .filter(Boolean)
    .map((rama) => ({ rama, fusionada: fusionadaEn(rama), enWorktree: sacadas.has(rama) }));
  const localesFuera = localesABorrar(locales);

  const lista = (xs) => xs.map((x) => `      ${x.rama}  (${x.ultimo})${x.prAbierto ? "  — PR abierto" : ""}`).join("\n");
  console.log(`Ramas en GitHub: ${remotas.length}.`);
  console.log(`  - ${si ? "Borro" : "Borraría"} ${c.borrar.length} (fusionadas en staging, sin PR abierto, de hace más de ${dias} días):`);
  if (c.borrar.length) console.log(lista(c.borrar));
  console.log(`  - Sin fusionar: decide Pablo (${c.sinFusionar.length}):`);
  if (c.sinFusionar.length) console.log(lista(c.sinFusionar));
  const conPr = prsTodos(principal);
  const solas = conPr ? huerfanas(c.sinFusionar, { conPr }) : [];
  if (conPr === null) console.log("  - Huérfanas: no he podido leer los PR (`gh pr list`).");
  else {
    console.log(`  - Huérfanas, sin PR ni issue y de hace más de 3 días (${solas.length}): abre un issue que diga qué son, o pide a Pablo borrarlas.`);
    if (solas.length) console.log(lista(solas));
  }
  console.log(`  - Con PR abierto: ${c.conPr.length}. Recientes (< ${dias} días): ${c.recientes.length}. Sacadas en un worktree: ${c.enWorktree.length}.`);
  console.log(`Ramas locales fusionadas y sin worktree: ${localesFuera.length}${localesFuera.length ? ` (${localesFuera.join(", ")})` : ""}.`);

  if (!si) {
    console.log("\nEnsayo: no he borrado nada. Para borrar: `npm run podar -- --si`.");
    return;
  }

  let hechas = 0;
  for (const x of c.borrar) {
    if (intenta(() => git(principal, ["push", "-q", "origin", "--delete", x.rama])) !== null) hechas++;
    else console.error(`  No pude borrar ${x.rama} en GitHub.`);
  }
  let localesHechas = 0;
  for (const rama of localesFuera) {
    if (intenta(() => git(principal, ["branch", "-d", rama])) !== null) localesHechas++;
  }
  console.log(`\nBorradas: ${hechas} en GitHub y ${localesHechas} locales.`);
}

if (process.argv[1]?.endsWith("podar.mjs")) await main();
