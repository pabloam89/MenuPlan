/**
 * retirar.mjs — cierra una tarea: borra su worktree y su rama local, solo si
 * no se pierde nada.
 *
 *   npm run retirar -- descartes          # por nombre (C:\dev\MenuPlan-descartes)
 *   npm run retirar -- datos/descartes    # o por rama
 *   npm run retirar -- descartes --ensayo # dice qué haría, sin borrar
 *
 * Se niega si: es la carpeta principal; hay cambios sin commitear o ficheros
 * nuevos sin ignorar; hay commits que no están ni en GitHub ni en staging; o
 * hay una sesión de Claude activa en esa carpeta. No tiene `--forzar` a
 * propósito: si hay algo que perder, se decide a mano.
 *
 * Si la rama lleva número de issue, quita también la marca «lo lleva» que puso
 * `tarea` (scripts/lib/lleva.mjs); sin red, avisa y la carpeta queda retirada.
 *
 * En Windows, `git worktree remove` falla a veces con «Filename too long»
 * (node_modules): entonces borra la carpeta con la ruta larga y hace `prune`.
 */
import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";

import { dirSesiones, enCarpeta, listar, normaRuta } from "../.claude/hooks/sesiones.mjs";
import { desmarcar, numeroDeRama } from "./lib/lleva.mjs";
import { MARCA_INICIAL } from "./tarea.mjs";

const git = (args) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const intenta = (fn) => {
  try {
    return fn();
  } catch {
    return null;
  }
};

/** Worktrees de `git worktree list --porcelain`: [{ ruta, rama }]. */
export function leerWorktrees(porcelana) {
  const out = [];
  for (const bloque of porcelana.split(/\n\n+/)) {
    const ruta = bloque.match(/^worktree (.+)$/m)?.[1]?.trim();
    const rama = bloque.match(/^branch refs\/heads\/(.+)$/m)?.[1]?.trim() ?? null;
    if (ruta) out.push({ ruta, rama });
  }
  return out;
}

/** Busca por nombre de carpeta (MenuPlan-<x>), por <x> o por rama. */
export function elegir(worktrees, texto) {
  const t = texto.toLowerCase();
  return worktrees.filter(
    (w) => w.rama?.toLowerCase() === t || basename(w.ruta).toLowerCase() === t || basename(w.ruta).toLowerCase() === `menuplan-${t}`,
  );
}

/** Quita de «commits sin subir» el commit vacío con el que `tarea` abre la rama: no es trabajo. */
export function sinMarcaInicial(lineas) {
  return lineas.filter((l) => !MARCA_INICIAL.test(l));
}

/** Lo que se perdería. Vacío = se puede borrar. */
export function motivosParaNo({ principal, ruta, sucios, sesiones, sinSubir }) {
  const no = [];
  if (normaRuta(ruta) === normaRuta(principal)) no.push("es la carpeta principal: esa no se retira");
  if (sucios.length) no.push(`tiene cambios sin commitear:\n      ${sucios.slice(0, 10).join("\n      ")}${sucios.length > 10 ? `\n      … y ${sucios.length - 10} más` : ""}`);
  if (sinSubir.length) no.push(`tiene commits que no están en GitHub ni en staging:\n      ${sinSubir.slice(0, 10).join("\n      ")}`);
  if (sesiones.length) no.push(`hay ${sesiones.length} sesión(es) de Claude activa(s) en esa carpeta: ciérrala(s) antes`);
  return no;
}

async function main() {
  const arg = process.argv.slice(2).find((a) => !a.startsWith("--"));
  const ensayo = process.argv.includes("--ensayo");
  if (!arg) {
    console.error("¿Qué tarea? `npm run retirar -- <nombre o rama>`.");
    process.exit(1);
  }

  const principal = dirname(git(["rev-parse", "--path-format=absolute", "--git-common-dir"]));
  const candidatos = elegir(leerWorktrees(git(["-C", principal, "worktree", "list", "--porcelain"])), arg);
  if (candidatos.length !== 1) {
    console.error(candidatos.length ? `«${arg}» encaja con varias: ${candidatos.map((w) => w.ruta).join(", ")}.` : `No hay ningún worktree «${arg}». Mira \`git worktree list\`.`);
    process.exit(1);
  }
  const { ruta, rama } = candidatos[0];

  git(["-C", principal, "fetch", "-q", "origin"]);
  const sucios = existsSync(ruta) ? git(["-C", ruta, "status", "--porcelain"]).split("\n").filter(Boolean) : [];

  // Commits de la rama que no están en ningún sitio de GitHub. Un PR fusionado
  // con squash deja commits «fuera» de staging aunque su contenido esté: si
  // GitHub dice que el PR de esta rama está fusionado, no se pierde nada.
  let sinSubir = [];
  if (rama) {
    const fuera = intenta(() => git(["-C", principal, "log", "--oneline", rama, "--not", "--remotes=origin"])) ?? "";
    sinSubir = sinMarcaInicial(fuera.split("\n").filter(Boolean));
    if (sinSubir.length) {
      const fusionado = intenta(() => execFileSync("gh", ["pr", "list", "--head", rama, "--state", "merged", "--json", "headRefOid"], { cwd: principal, encoding: "utf8", timeout: 15000 }));
      const cabeza = git(["-C", principal, "rev-parse", rama]);
      if (fusionado && JSON.parse(fusionado).some((p) => p.headRefOid === cabeza)) sinSubir = [];
    }
  }
  const sesiones = enCarpeta(listar(dirSesiones(principal)), ruta);

  const no = motivosParaNo({ principal, ruta, sucios, sesiones, sinSubir });
  if (no.length) {
    console.error(`No retiro ${ruta}:\n  - ${no.join("\n  - ")}`);
    process.exit(1);
  }
  if (ensayo) {
    console.log(`Se puede retirar: borraría ${ruta}${rama ? ` y la rama local ${rama}` : ""}.`);
    return;
  }

  if (intenta(() => git(["-C", principal, "worktree", "remove", "--force", ruta])) === null) {
    // «Filename too long»: la ruta larga de Windows llega donde git no.
    const larga = process.platform === "win32" && !ruta.startsWith("\\\\?\\") ? `\\\\?\\${resolve(ruta)}` : ruta;
    rmSync(larga, { recursive: true, force: true, maxRetries: 3 });
    git(["-C", principal, "worktree", "prune"]);
  }
  if (rama) intenta(() => git(["-C", principal, "branch", "-D", rama]));
  console.log(`Retirada: ${ruta}${rama ? ` y la rama local ${rama}` : ""}. Lo de GitHub no se toca.`);

  // Quita la marca «lo lleva» del issue (la puso `tarea`). Sin red, aviso: la carpeta ya está retirada.
  const issue = numeroDeRama(rama);
  if (issue) {
    const r = desmarcar(issue, rama);
    console.log(r.ok ? (r.quitadas ? `Quitada la marca «lo lleva» de #${issue}.` : `#${issue} no tenía marca «lo lleva» de esta rama.`) : `Aviso: ${r.aviso}`);
  }
}

if (process.argv[1]?.endsWith("retirar.mjs")) await main();
