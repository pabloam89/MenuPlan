/**
 * arranque.mjs — lo que toda sesión tiene que saber al abrirse (SessionStart).
 *
 * Lo que imprime entra en el contexto de la sesión. Solo avisos que cambian lo
 * que se hace a continuación: en qué carpeta y rama estás, si te falta el
 * entorno, si vas por detrás de staging y qué migraciones siguen sin aplicar.
 * Nunca falla: si algo no se puede mirar, se calla.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { sinAplicar } from "./guardia.mjs";

const raiz = process.cwd();
const git = (...args) => {
  try {
    return execFileSync("git", ["-C", raiz, ...args], { encoding: "utf8", timeout: 8000, stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
};

const avisos = [];
const rama = git("rev-parse", "--abbrev-ref", "HEAD");
const esWorktree = git("rev-parse", "--git-dir") !== git("rev-parse", "--git-common-dir");

avisos.push(`Carpeta: ${raiz} · rama: ${rama ?? "?"}${esWorktree ? " (worktree)" : ""}`);

if (/onedrive/i.test(raiz)) {
  avisos.push("AVISO: esta copia está dentro de OneDrive, que se retira. Trabaja en C:\\dev\\MenuPlan o en un worktree C:\\dev\\MenuPlan-<tarea>.");
}
if ((rama === "staging" || rama === "main") && !esWorktree) {
  avisos.push(`Estás en ${rama} en la carpeta principal: para cualquier cambio, crea un worktree con su rama (ver CLAUDE.md, «Varias sesiones a la vez»).`);
}
if (rama === "main") avisos.push("main es producción: aquí no se commitea.");
if (!existsSync(join(raiz, ".env.local"))) {
  avisos.push("Falta .env.local (git no lo trae a los worktrees): cópialo de C:\\dev\\MenuPlan\\.env.local antes de levantar la app o usar scripts con claves.");
}

git("fetch", "-q", "origin", "staging");
const detras = git("rev-list", "--count", "HEAD..origin/staging");
if (rama && rama !== "staging" && rama !== "main" && Number(detras) > 0) {
  avisos.push(`Tu rama va ${detras} commits por detrás de origin/staging: fusiónala antes de abrir el PR.`);
}

const estado = join(raiz, "supabase", "ESTADO.md");
if (existsSync(estado)) {
  const libres = sinAplicar(readFileSync(estado, "utf8"));
  if (libres?.size) avisos.push(`Migraciones sin aplicar en producción según ESTADO.md: ${[...libres].join(", ")}. El código no puede depender de ellas.`);
}

process.stdout.write(`[arranque MenuPlan]\n- ${avisos.join("\n- ")}\n`);
