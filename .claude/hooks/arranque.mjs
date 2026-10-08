/**
 * arranque.mjs — lo que toda sesión tiene que saber al abrirse (SessionStart).
 *
 * Lo que imprime entra en el contexto de la sesión. Solo avisos que cambian lo
 * que se hace a continuación: en qué carpeta y rama estás, si te falta el
 * entorno, si vas por detrás de staging, qué otras sesiones hay abiertas, qué
 * números de migración están cogidos y cuáles siguen sin aplicar.
 * Además apunta esta sesión en el registro (sesiones.mjs).
 * Nunca falla: si algo no se puede mirar, se calla.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

import { sinAplicar } from "./guardia.mjs";
import { enPrs, enStaging, enWorktrees, resumen } from "./migraciones.mjs";
import { activas, apuntar, dirSesiones, listar } from "./sesiones.mjs";

let entrada = {};
try {
  let crudo = "";
  if (!process.stdin.isTTY) for await (const trozo of process.stdin) crudo += trozo;
  entrada = crudo ? JSON.parse(crudo) : {};
} catch {
  // sin entrada: se sigue con lo que hay
}

const raiz = entrada.cwd || process.cwd();
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
  avisos.push("AVISO: esta copia está dentro de OneDrive, que se retira. Trabaja en C:\\dev\\MenuPlan o en un worktree (`npm run tarea -- <area>/<nombre>`).");
}
if ((rama === "staging" || rama === "main") && !esWorktree) {
  avisos.push(`Estás en ${rama} en la carpeta principal: para cualquier cambio, abre un worktree con \`npm run tarea -- <area>/<nombre>\`.`);
}
if (rama === "main") avisos.push("main es producción: aquí no se commitea.");
if (!existsSync(join(raiz, ".env.local"))) {
  avisos.push("Falta .env.local (git no lo trae a los worktrees): cópialo de C:\\dev\\MenuPlan\\.env.local; `npm run tarea` ya lo hace.");
}

// ── Otras sesiones ─────────────────────────────────────────────────────────
const dir = dirSesiones(raiz);
try {
  const otras = activas(listar(dir)).filter((s) => s.id !== entrada.session_id);
  apuntar(dir, { id: entrada.session_id, cwd: raiz, rama });
  const aqui = otras.filter((s) => s.cwd.toLowerCase() === raiz.toLowerCase());
  if (aqui.length) {
    avisos.push(`AVISO: hay ${aqui.length === 1 ? "otra sesión activa" : `${aqui.length} sesiones activas`} en esta MISMA carpeta. Dos sesiones en una carpeta se pisan: abre la tuya con \`npm run tarea\`.`);
  }
  const misma = otras.filter((s) => s.rama === rama && s.cwd.toLowerCase() !== raiz.toLowerCase() && rama !== "staging");
  if (misma.length) avisos.push(`AVISO: la rama ${rama} también está abierta en ${misma.map((s) => basename(s.cwd)).join(", ")}.`);
  if (otras.length) {
    const h = (x) => (x < 1 ? `${Math.round(x * 60)} min` : `${x.toFixed(1)} h`);
    avisos.push(`Otras sesiones activas: ${otras.map((s) => `${basename(s.cwd)} (${s.rama}, hace ${h(s.horas)})`).join("; ")}.`);
  }
} catch {
  // el registro es una ayuda, no un requisito
}

// ── Staging y migraciones ──────────────────────────────────────────────────
git("fetch", "-q", "origin", "staging");
const detras = git("rev-list", "--count", "HEAD..origin/staging");
if (rama && rama !== "staging" && rama !== "main" && Number(detras) > 0) {
  avisos.push(`Tu rama va ${detras} commits por detrás de origin/staging: fusiónala antes de abrir el PR.`);
}

const deStaging = enStaging(raiz);
if (deStaging) {
  const r = resumen(deStaging, [...enWorktrees(raiz, deStaging), ...enPrs(raiz, deStaging)], raiz);
  let linea = `Migraciones: la última en staging es la ${String(r.ultimo).padStart(4, "0")}; el siguiente número libre es la ${r.siguiente}`;
  if (r.ocupados.length) linea += `. Cogidas fuera de staging: ${r.ocupados.map((m) => `${m.nombre} en ${m.donde.join(" y ")}`).join("; ")}`;
  avisos.push(`${linea}.`);
  if (r.choques.length) avisos.push(`AVISO: números de migración repetidos: ${r.choques.join("; ")}. Hay que renumerar una antes de fusionar.`);
}

const estado = join(raiz, "supabase", "ESTADO.md");
if (existsSync(estado)) {
  const libres = sinAplicar(readFileSync(estado, "utf8"));
  if (libres?.size) avisos.push(`Sin aplicar en producción según ESTADO.md: ${[...libres].join(", ")}. El código no puede depender de ellas.`);
}

process.stdout.write(`[arranque MenuPlan]\n- ${avisos.join("\n- ")}\n`);
