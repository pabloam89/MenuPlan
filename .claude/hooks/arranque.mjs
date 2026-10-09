/**
 * arranque.mjs — lo que toda sesión tiene que saber al abrirse (SessionStart).
 *
 * Lo que imprime entra en el contexto de la sesión. Solo avisos que cambian lo
 * que se hace a continuación: en qué carpeta y rama estás, si te falta el
 * entorno, si vas por detrás de staging, qué otras sesiones hay abiertas, qué
 * números de migración están cogidos, cuáles siguen sin aplicar y qué issues
 * esperan a alguien (decisiones de Pablo, encargos, los problemas de fondo que
 * más se repiten y lo que está sin clasificar) y quién lleva qué: encargos con
 * rama viva, carpetas posiblemente paradas y ramas sin número de issue (las
 * líneas salen de `scripts/issues.mjs --arranque`, #271).
 * Además apunta esta sesión en el registro (sesiones.mjs).
 * Nunca rompe el arranque: si algo no se puede mirar, sigue con lo demás. Lo
 * que no pudo mirar lo dice cuando callarlo engañaría (los issues, el registro
 * de sesiones y lo que la limpieza de carpetas no pudo borrar). Cada `catch`
 * que se calla lleva su `a propósito:` (scripts/sinErroresTragados.test.js).
 */
import { execFile, execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

import { ahoraEnMadrid } from "../../scripts/lib/hora.mjs";
import { numeroDeRama } from "../../scripts/lib/lleva.mjs";
import { avisosDeLimpieza, leerPendientes, worktreesVivos } from "../../scripts/limpiar-worktrees.mjs";
import { sinAplicar } from "./guardia.mjs";
import { avisoTrasAdelantar, planAdelantar } from "./principal.mjs";
import { enPrs, enStaging, enWorktrees, pedirPrs, resumen } from "./migraciones.mjs";
import { activas, apuntar, dirSesiones, listar, normaRuta } from "./sesiones.mjs";

let entrada = {};
try {
  let crudo = "";
  if (!process.stdin.isTTY) for await (const trozo of process.stdin) crudo += trozo;
  entrada = crudo ? JSON.parse(crudo) : {};
} catch {
  // a propósito: sin entrada (o ilegible) se sigue con lo que hay; el cwd sale de process.cwd()
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
    // a propósito: null es «no se sabe» (sin red, sin repo, fuera de tiempo) y
    // cada uso lo trata: rama «?», sin aviso de atraso. El arranque no se rompe.
    return null;
  }
};

const avisos = [];
const rama = git("rev-parse", "--abbrev-ref", "HEAD");
const esWorktree = git("rev-parse", "--git-dir") !== git("rev-parse", "--git-common-dir");

// La hora real de Madrid (scripts/lib/hora.mjs, una sola fuente). En Git Bash
// `TZ=Europe/Madrid date` da UTC sin avisar (#210).
avisos.push(`Hora: ${ahoraEnMadrid()}. Durante la sesión, \`npm run hora\`; nunca \`date\` en Git Bash.`);
avisos.push(`Carpeta: ${raiz} · rama: ${rama ?? "?"}${esWorktree ? " (worktree)" : ""}`);

// Toda rama no trivial lleva número de issue (#271): sin él, nada del repo dice
// que la llevas tú (caso #270). El cruce de las demás sale de `npm run issues`.
if (esWorktree && rama && !["staging", "main", "HEAD"].includes(rama) && !numeroDeRama(rama)) {
  avisos.push(`Tu rama ${rama} no lleva número de issue, así que nadie ve que la llevas tú. Si es más que una errata: \`npm run issues -- --nuevo …\` (busca parecidos) y renombra con el número.`);
}
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
} catch (e) {
  // El registro es una ayuda, no un requisito, pero callarlo engaña: sin él no
  // sale el aviso de «otra sesión en esta misma carpeta» (#177).
  avisos.push(`Sesiones: no he podido leer el registro (${String(e?.message ?? e).split("\n")[0]}); no sé si hay otra sesión en esta carpeta.`);
}

// ── Carpetas que la limpieza no pudo borrar (#141) ─────────────────────────
// La limpieza (hook de usuario limpiar-worktrees) corre en silencio al
// arrancar; lo que no pudo borrar lo apunta y aquí se enseña.
try {
  const comun = git("rev-parse", "--path-format=absolute", "--git-common-dir");
  // Sin la lista de worktrees no se avisa: podría mandar borrar uno vivo.
  const lista = git("worktree", "list", "--porcelain");
  if (comun && lista !== null) avisos.push(...avisosDeLimpieza(leerPendientes(comun), existsSync, worktreesVivos(lista)));
} catch (e) {
  avisos.push(`Limpieza de carpetas: no he podido leer lo que dejó pendiente (${String(e?.message ?? e).split("\n")[0]}).`);
}

// ── Staging y migraciones ──────────────────────────────────────────────────
const prs = pedirPrs(raiz, 10_000); // a la vez que el fetch: los dos son red, y gh es el lento
// Lo que se enseña de los issues lo decide scripts/lib/issues.mjs (una sola
// fuente con `npm run issues`); aquí solo se lanza y se espera al final.
const issues = new Promise((ok) => {
  execFile("node", ["scripts/issues.mjs", "--arranque"], { cwd: raiz, encoding: "utf8", timeout: 10_000 }, (error, salida) => ok(error ? null : salida));
});
git("fetch", "-q", "origin", "staging");
let detras = git("rev-list", "--count", "HEAD..origin/staging");

// La carpeta principal se adelanta sola (#192): si no, sus hooks son los viejos.
const plan = planAdelantar({ esWorktree, rama, detras, sucio: git("status", "--porcelain", "--untracked-files=no") });
if (plan.aviso) avisos.push(plan.aviso);
if (plan.adelantar) {
  const antes = git("rev-parse", "HEAD");
  if (git("merge", "--ff-only", "-q", "origin/staging") !== null) {
    const cambiados = (git("diff", "--name-only", `${antes}..HEAD`) ?? "").split("\n").filter(Boolean);
    avisos.push(avisoTrasAdelantar(detras, cambiados));
    detras = "0";
  } else {
    avisos.push(`AVISO: la carpeta principal va ${detras} commits por detrás de origin/staging y no he podido adelantarla (\`git merge --ff-only origin/staging\` falló: ¿un fichero sin seguir que pisaría?). Los hooks que corren son los viejos.`);
  }
}
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
