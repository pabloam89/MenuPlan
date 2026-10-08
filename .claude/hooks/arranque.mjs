/**
 * arranque.mjs — lo que toda sesión tiene que saber al abrirse (SessionStart).
 *
 * Lo que imprime entra en el contexto de la sesión. Solo avisos que cambian lo
 * que se hace a continuación: en qué carpeta y rama estás, si te falta el
 * entorno, si vas por detrás de staging, qué otras sesiones hay abiertas, qué
 * números de migración están cogidos, cuáles siguen sin aplicar y qué issues
 * esperan a alguien (decisiones de Pablo, encargos, los problemas de fondo que
 * más se repiten y lo que está sin clasificar).
 * Además apunta esta sesión en el registro (sesiones.mjs).
 * Nunca rompe el arranque: si algo no se puede mirar, sigue con lo demás. Lo
 * que no pudo mirar lo dice cuando callarlo engañaría (los issues).
 */
import { execFile, execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

import { sinAplicar } from "./guardia.mjs";
import { enPrs, enStaging, enWorktrees, pedirPrs, resumen } from "./migraciones.mjs";
import { activas, apuntar, dirSesiones, listar, normaRuta } from "./sesiones.mjs";

let entrada = {};
try {
  let crudo = "";
  if (!process.stdin.isTTY) for await (const trozo of process.stdin) crudo += trozo;
  entrada = crudo ? JSON.parse(crudo) : {};
} catch {
  // sin entrada: se sigue con lo que hay
}

const raiz = entrada.cwd || process.cwd();

// Presupuesto de tiempo. Si el hook pasa del timeout de settings.json (30 s),
// Claude Code lo corta y la sesión no ve NADA de esto. Lo local tarda
// milisegundos; lo que se dispara es la red (fetch y gh, medido de 3 a 20 s
// el 8 oct 2026), así que cada llamada de red lleva su tope corto y, si no
// llega, se sigue sin ella.
const LOCAL_MS = 4000;
const RED_MS = 5000;
const git = (...args) => {
  const red = args[0] === "fetch";
  try {
    return execFileSync("git", ["-C", raiz, ...args], { encoding: "utf8", timeout: red ? RED_MS : LOCAL_MS, stdio: ["ignore", "pipe", "ignore"] }).trim();
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
  const aqui = otras.filter((s) => normaRuta(s.cwd) === normaRuta(raiz));
  if (aqui.length) {
    avisos.push(`AVISO: hay ${aqui.length === 1 ? "otra sesión activa" : `${aqui.length} sesiones activas`} en esta MISMA carpeta. Dos sesiones en una carpeta se pisan: abre la tuya con \`npm run tarea\`.`);
  }
  const misma = otras.filter((s) => s.rama === rama && normaRuta(s.cwd) !== normaRuta(raiz) && rama !== "staging");
  if (misma.length) avisos.push(`AVISO: la rama ${rama} también está abierta en ${misma.map((s) => basename(s.cwd)).join(", ")}.`);
  if (otras.length) {
    const h = (x) => (x < 1 ? `${Math.round(x * 60)} min` : `${x.toFixed(1)} h`);
    avisos.push(`Otras sesiones activas: ${otras.map((s) => `${basename(s.cwd)} (${s.rama}, hace ${h(s.horas)})`).join("; ")}.`);
  }
} catch {
  // el registro es una ayuda, no un requisito
}

// ── Staging y migraciones ──────────────────────────────────────────────────
const prs = pedirPrs(raiz, 10_000); // a la vez que el fetch: los dos son red, y gh es el lento
// Lo que se enseña de los issues lo decide scripts/lib/issues.mjs (una sola
// fuente con `npm run issues`); aquí solo se lanza y se espera al final.
const issues = new Promise((ok) => {
  execFile("node", ["scripts/issues.mjs", "--arranque"], { cwd: raiz, encoding: "utf8", timeout: 10_000 }, (error, salida) => ok(error ? null : salida));
});
git("fetch", "-q", "origin", "staging");
const detras = git("rev-list", "--count", "HEAD..origin/staging");
if (rama && rama !== "staging" && rama !== "main" && Number(detras) > 0) {
  avisos.push(`Tu rama va ${detras} commits por detrás de origin/staging: fusiónala antes de abrir el PR.`);
}

const deStaging = enStaging(raiz);
const salidaPrs = await prs;
if (deStaging) {
  const r = resumen(deStaging, [...enWorktrees(raiz, deStaging), ...enPrs(salidaPrs, deStaging)], raiz);
  let linea = `Migraciones: la última en staging es la ${String(r.ultimo).padStart(4, "0")}; el siguiente número libre es la ${r.siguiente}`;
  if (r.ocupados.length) linea += `. Cogidas fuera de staging: ${r.ocupados.map((m) => `${m.nombre} en ${m.donde.join(" y ")}`).join("; ")}`;
  if (salidaPrs === null) linea += " (sin contar los PR abiertos: GitHub no ha contestado a tiempo)";
  avisos.push(`${linea}.`);
  if (r.choques.length) avisos.push(`AVISO: números de migración repetidos: ${r.choques.join("; ")}. Hay que renumerar una antes de fusionar.`);
}

const estado = join(raiz, "supabase", "ESTADO.md");
if (existsSync(estado)) {
  const libres = sinAplicar(readFileSync(estado, "utf8"));
  if (libres?.size) avisos.push(`Sin aplicar en producción según ESTADO.md: ${[...libres].join(", ")}. El código no puede depender de ellas.`);
}

// ── Issues: lo que espera a alguien ──────────────────────────────────────
const lineasIssues = (await issues)?.split("\n").map((l) => l.trim()).filter(Boolean);
if (lineasIssues) avisos.push(...lineasIssues);
// Sin respuesta (sin gh, sin red o tarda más de 10 s) no se calla: se dice, para
// que nadie crea que no hay nada pendiente.
else avisos.push("Issues: no he podido leerlos (GitHub no contesta, gh sin sesión o un fallo del script); míralos con `npm run issues`.");

process.stdout.write(`[arranque MenuPlan]\n- ${avisos.join("\n- ")}\n`);
