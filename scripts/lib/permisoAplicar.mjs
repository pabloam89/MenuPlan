/**
 * permisoAplicar.mjs — cuándo se puede aplicar una migración en producción.
 *
 * Solo hay una base y es la de producción (35 casas reales el 8 oct 2026), así
 * que no hay otro sitio donde aplicar. Decidido por Pablo el 8 oct 2026: una
 * sesión puede lanzar `apply-migration.mjs <nombre> --si` sin él, pero el
 * script se niega salvo que:
 *
 *   1. la migración esté ya en origin/staging y sea idéntica a la local (pasó
 *      por PR con el CI en verde, incluidos los tests de principios);
 *   2. haya un ensayo de ESE contenido de hace menos de una hora (si alguien la
 *      toca después del ensayo, hay que repetirlo).
 *
 * Lo comprueba el script y no la buena fe de quien lo lanza, y vale igual para
 * Pablo que para una sesión. El SQL a mano contra la base sigue negado por la
 * guardia: lo que haya que cambiar, en una migración.
 *
 * Los ensayos se apuntan en la carpeta común de git
 * (`C:\dev\MenuPlan\.git\claude-ensayos\`): la ven todos los worktrees y git
 * no la versiona.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const VIGENCIA_MS = 60 * 60 * 1000;

/** Mismo hash para el mismo SQL aunque cambien los saltos de línea. */
export const hashDe = (sql) => createHash("sha256").update(String(sql).replace(/\r\n/g, "\n")).digest("hex");

/**
 * Lo que impide aplicar. Vacío = adelante.
 * @param {{ nombre: string, local: string, enStaging: string|null, ensayo: {hash: string, at: string}|null, ahora?: number }} d
 */
export function motivosParaNoAplicar({ nombre, local, enStaging, ensayo, ahora = Date.now() }) {
  const no = [];
  const h = hashDe(local);
  if (enStaging == null) {
    no.push(`${nombre} no está en origin/staging. Primero su PR, con el CI en verde; luego se aplica.`);
  } else if (hashDe(enStaging) !== h) {
    no.push(`${nombre} en tu carpeta no es igual que en origin/staging. Se aplica lo que está en staging: fusiona staging o descarta tus cambios.`);
  }
  if (!ensayo) {
    no.push(`No hay ensayo de ${nombre}. Lánzalo sin --si y revisa la salida.`);
  } else if (ensayo.hash !== h) {
    no.push(`${nombre} cambió después del último ensayo. Ensáyala otra vez.`);
  } else if (ahora - Date.parse(ensayo.at) > VIGENCIA_MS) {
    no.push(`El ensayo de ${nombre} tiene más de una hora. Ensáyala otra vez: la base puede haber cambiado.`);
  }
  return no;
}

// ── Lo que toca disco y git ────────────────────────────────────────────────

function dirEnsayos(raiz) {
  const comun = execFileSync("git", ["-C", raiz, "rev-parse", "--path-format=absolute", "--git-common-dir"], { encoding: "utf8" }).trim();
  return join(comun, "claude-ensayos");
}

export function apuntarEnsayo(raiz, nombre, sql) {
  const dir = dirEnsayos(raiz);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${nombre}.json`), JSON.stringify({ hash: hashDe(sql), at: new Date().toISOString() }));
}

export function leerEnsayo(raiz, nombre) {
  const f = join(dirEnsayos(raiz), `${nombre}.json`);
  if (!existsSync(f)) return null;
  try {
    return JSON.parse(readFileSync(f, "utf8"));
  } catch {
    return null;
  }
}

export function olvidarEnsayo(raiz, nombre) {
  rmSync(join(dirEnsayos(raiz), `${nombre}.json`), { force: true });
}

/** El fichero tal como está en origin/staging (tras un fetch), o null. */
export function deStaging(raiz, nombre) {
  try {
    execFileSync("git", ["-C", raiz, "fetch", "-q", "origin", "staging"], { stdio: "ignore", timeout: 30000 });
  } catch {
    // sin red: se compara con lo último que se trajo
  }
  try {
    return execFileSync("git", ["-C", raiz, "show", `origin/staging:supabase/migrations/${nombre}.sql`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
}
