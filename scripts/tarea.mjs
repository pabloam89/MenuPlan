/**
 * tarea.mjs — abre una tarea nueva: worktree + rama + entorno, de una vez.
 *
 *   npm run tarea -- datos/descartes           # rama nueva desde origin/staging
 *   npm run tarea -- datos/descartes --sin-deps # sin npm ci (si solo vas a leer)
 *   npm run tarea -- datos/descartes 193       # del issue #193: rama datos/193-descartes
 *
 * Crea `C:\dev\MenuPlan-<nombre>` con la rama `<area>/<nombre>`. Si la rama ya
 * existe en GitHub, la retoma en vez de crearla. Copia `.env.local` (git no lo
 * trae), crea `.env.development.local` con el motor y la pizarra de staging
 * (en `.env.local` romperían tests), instala dependencias y busca un puerto
 * libre para la app. Al acabar: `npm run retirar -- <nombre>`.
 *
 * Con número de issue, lo marca («lo lleva <rama> en <carpeta>», un comentario
 * que quita `retirar`); sin él, avisa y propone `npm run issues -- --nuevo`
 * (scripts/lib/lleva.mjs, #271). Sin red, la marca es un aviso y no un error.
 *
 * No borra ni sobrescribe nada: si la carpeta o la rama local ya existen, para.
 *
 * Una rama nueva lleva un commit vacío desde el primer segundo, ANTES de copiar
 * el entorno y de instalar dependencias. Sin él, la rama es ancestro de
 * `origin/staging` y el hook de usuario `limpiar-worktrees` la da por fusionada
 * y borra la carpeta al abrir cualquier otra sesión (pasó dos veces el 8 oct
 * 2026; la segunda, con `npm ci` todavía instalando). `retirar` no cuenta ese
 * commit como trabajo sin subir.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join } from "node:path";

import { leerInventario, marcar, textoDeRama } from "./lib/lleva.mjs";

export const AREAS = ["bot", "datos", "ux", "fix", "feat", "ops", "motor", "lola", "roles"];

/**
 * «datos/descartes» → { rama, nombre }, o un error en castellano. Con el número
 * de su issue, la rama lo lleva delante del nombre (`datos/193-descartes`) y la
 * guardia pide `Closes #193` al abrir el PR; la carpeta no cambia.
 */
export function leerRama(texto, issue) {
  const m = String(texto ?? "").match(/^([a-z]+)\/([a-z0-9][a-z0-9-]{1,40})$/);
  if (!m) return { error: "Pon la rama como <area>/<nombre>, en minúsculas y con guiones: `npm run tarea -- datos/descartes`." };
  if (!AREAS.includes(m[1])) return { error: `El área «${m[1]}» no existe. Vale: ${AREAS.join(", ")}.` };
  if (issue == null) return { rama: texto, nombre: m[2] };
  const n = String(issue).replace(/^#/, "");
  if (!/^\d+$/.test(n)) return { error: `«${issue}» no es un número de issue: \`npm run tarea -- datos/descartes 193\`.` };
  const nombre = m[2].replace(new RegExp(`^${n}-`), "");
  return { rama: `${m[1]}/${n}-${nombre}`, nombre, issue: Number(n) };
}

/**
 * Lo que se dice cuando la tarea no lleva número de issue (#271): toda rama no
 * trivial lleva uno, y sin él nadie sabe quién la lleva (caso #270). No para la
 * tarea —una errata no necesita issue—, pero no se puede pasar por alto. Crear
 * el issue es cosa de quien lanza el comando: `--nuevo` busca los parecidos.
 */
export function avisoSinIssue(rama) {
  return [
    `AVISO: esta rama no lleva número de issue, así que nada del repo dirá que la llevas tú: \`npm run issues\` la enseñará como rama sin número.`,
    `  Si es más que una errata, abre el encargo (busca antes los parecidos) y relanza con su número:`,
    `    npm run issues -- --nuevo "<título>" --tipo encargo --area <ops|datos|lola|ui|catalogo|motor> --cuerpo <fichero.md>`,
    `    npm run tarea -- ${rama} <número>`,
    `  Si ya hay un issue, es el segundo comando con su número. Si es trivial, sigue sin él.`,
  ].join("\n");
}

/** Una línea de `git log --oneline` que es el commit inicial de una tarea. */
export const MARCA_INICIAL = /^[0-9a-f]+ tarea: arranca /;

/** El commit vacío que hace que la rama deje de ser ancestro de staging. */
export function commitInicial(destino, rama) {
  execFileSync(
    "git",
    [
      "-C",
      destino,
      "commit",
      "-q",
      "--allow-empty",
      "-m",
      `tarea: arranca ${rama}\n\nCommit vacío a propósito (lo pone \`npm run tarea\`): sin él, el hook limpiar-worktrees\nve la rama como fusionada y borra la carpeta. \`npm run retirar\` no lo cuenta como trabajo.`,
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
}

const git = (args, opciones = {}) => execFileSync("git", args, { encoding: "utf8", ...opciones }).trim();
const hay = (args) => {
  try {
    git(args, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};

const libre = (puerto) =>
  new Promise((ok) => {
    const s = createServer();
    s.once("error", () => ok(false));
    s.once("listening", () => s.close(() => ok(true)));
    s.listen(puerto, "0.0.0.0");
  });

async function main() {
  const [arg, numero] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const { rama, nombre, issue, error } = leerRama(arg, numero);
  if (error) {
    console.error(error);
    process.exit(1);
  }

  // La carpeta principal es la que tiene el .git común, aunque se lance desde un worktree.
  const comun = git(["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  const principal = dirname(comun);
  const destino = join(dirname(principal), `MenuPlan-${nombre}`);

  if (existsSync(destino)) {
    console.error(`Ya existe ${destino}. Si es una tarea vieja, ciérrala antes con \`npm run retirar -- ${nombre}\`.`);
    process.exit(1);
  }
  if (hay(["-C", principal, "show-ref", "--verify", "--quiet", `refs/heads/${rama}`])) {
    console.error(`La rama ${rama} ya existe en este PC. ¿Está abierta en otro worktree? Mira \`git worktree list\`.`);
    process.exit(1);
  }

  if (!issue) console.warn(`${avisoSinIssue(rama)}\n`);

  console.log("Trayendo lo último de GitHub…");
  git(["-C", principal, "fetch", "-q", "origin"]);
  // ¿Alguien ya lleva este issue? Se dice antes de crear nada, sin parar: puede ser
  // una continuación a propósito. Lo que falte por mirar no impide abrir la tarea.
  if (issue) {
    try {
      const otras = leerInventario(principal).filter((r) => r.numero === issue && r.rama !== rama);
      for (const o of otras) console.warn(`AVISO: #${issue} ya lo lleva otra rama: ${textoDeRama({ ...o, horas: o.ultimo ? (Date.now() - o.ultimo) / 3_600_000 : null })}. ¿Seguro que quieres abrir otra carpeta sobre lo mismo?`);
    } catch {
      // a propósito: es un aviso extra; si git no deja leer las ramas, la tarea se abre igual
    }
  }
  const enRemoto = hay(["-C", principal, "show-ref", "--verify", "--quiet", `refs/remotes/origin/${rama}`]);
  if (enRemoto) {
    console.log(`La rama ${rama} ya está en GitHub: la retomo.`);
    git(["-C", principal, "worktree", "add", "-q", "--track", "-b", rama, destino, `origin/${rama}`]);
  } else {
    // Sin seguimiento: si no, la rama queda enganchada a staging y un `git pull`
    // o un `git push` despistados van a staging. El primer push: `git push -u origin <rama>`.
    git(["-C", principal, "worktree", "add", "-q", "--no-track", "-b", rama, destino, "origin/staging"]);
    try {
      commitInicial(destino, rama);
    } catch (e) {
      console.warn(`Aviso: no pude hacer el commit inicial (${String(e.stderr || e.message).trim().split("\n")[0]}). Hazlo ya a mano, o el hook limpiar-worktrees puede borrar esta carpeta: git -C "${destino}" commit --allow-empty -m "tarea: arranca ${rama}"`);
    }
  }

  // La marca en el issue: rama, carpeta y hora. Idempotente; sin red es un aviso (lib/lleva.mjs).
  if (issue) {
    const r = marcar(issue, { rama, carpeta: `MenuPlan-${nombre}` });
    console.log(r.ok ? `Marcado #${issue}: «lo lleva ${rama}» (lo quita \`npm run retirar\`).` : `Aviso: ${r.aviso}`);
  }

  const env = join(principal, ".env.local");
  if (existsSync(env)) copyFileSync(env, join(destino, ".env.local"));
  else console.warn("Aviso: no hay .env.local en la carpeta principal; la app y los scripts con claves no arrancarán.");
  writeFileSync(join(destino, ".env.development.local"), "# Como en staging (ver CLAUDE.md). Aquí y no en .env.local: allí romperían tests.\nVITE_MOTOR=solver\nVITE_PIZARRA=on\n");

  if (!process.argv.includes("--sin-deps")) {
    console.log("Instalando dependencias (npm ci, un par de minutos)…");
    const r = spawnSync("npm", ["ci", "--no-audit", "--no-fund", "--loglevel=error"], { cwd: destino, stdio: "inherit", shell: true });
    if (r.status !== 0) console.warn("Aviso: npm ci ha fallado; lánzalo a mano dentro de la carpeta.");
  }

  let puerto = null;
  for (let p = 5180; p < 5200 && !puerto; p++) if (await libre(p)) puerto = p;

  console.log(`
Lista: ${destino}
  rama    ${rama}${enRemoto ? " (retomada de GitHub)" : " (nueva, desde origin/staging)"}
  app     npm run dev -- --port ${puerto ?? "<libre>"} --host   (el login con Google solo vuelve al 5176)
  cerrar  npm run retirar -- ${nombre}
  issue   ${issue ? `#${issue}: el PR lleva \`Closes #${issue}\` (la guardia lo pide)` : "ninguno: queda como rama sin número. Si hace falta uno, mira el aviso de arriba"}

Abre la sesión de Claude en esa carpeta: cd "${destino}" y luego claude.`);
}

if (process.argv[1]?.endsWith("tarea.mjs")) await main();
