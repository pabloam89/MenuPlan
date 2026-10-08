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
 *      toca después del ensayo, hay que repetirlo);
 *   3. lleve en la cabecera el visto bueno del juez:
 *      `-- AUDITADA: auditor-datos AAAA-MM-DD OK`;
 *   4. y, si trae `-- CONTRAE:`, toca RLS o permisos de tablas que ya existían
 *      o crea `security definer`, que venga `--pablo`. Esa opción la guardia se
 *      la niega a cualquier sesión: solo la usa Pablo con `!`. La RLS y el
 *      revoke de una tabla creada en la misma migración no cuentan (PRINCIPIOS
 *      §8 los exige en toda tabla nueva).
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

const RE_AUDITADA = /^--\s*AUDITADA:\s*auditor-datos\s+(\d{4}-\d{2}-\d{2})\s+(.+?)\s*$/m;

/** El veredicto del juez en la cabecera: { fecha, veredicto } o null. */
export function auditoriaDe(sql) {
  const m = RE_AUDITADA.exec(String(sql));
  if (!m) return null;
  const d = new Date(`${m[1]}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== m[1]) return null;
  return { fecha: m[1], veredicto: m[2] };
}

const nombreTabla = (s) => s.replace(/"/g, "").replace(/^public\./i, "").toLowerCase();

/**
 * Por qué esta migración la lanza Pablo (vacío = no hace falta): borra algo
 * con datos, o cambia RLS o permisos de lo que ya existía.
 */
export function motivosDePablo(sql) {
  const texto = String(sql);
  const r = [];
  if (/^--\s*CONTRAE:/m.test(texto)) r.push("borra algo que ya existía (`-- CONTRAE:`)");
  const codigo = texto.replace(/--[^\n]*/g, "");
  const nuevas = new Set([...codigo.matchAll(/create\s+(?:unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?([\w."]+)/gi)].map((m) => nombreTabla(m[1])));
  const ajena = (t) => !nuevas.has(nombreTabla(t));
  for (const s of codigo.split(";").map((x) => x.trim()).filter(Boolean)) {
    let m;
    if ((m = /^alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?([\w."]+)\s+(?:enable|disable|force|no\s+force)\s+row\s+level\s+security\b/i.exec(s))) {
      if (ajena(m[1])) r.push(`cambia la RLS de ${nombreTabla(m[1])}`);
    } else if ((m = /^(?:create|alter|drop)\s+policy\b[\s\S]*?\bon\s+([\w."]+)/i.exec(s))) {
      if (ajena(m[1])) r.push(`toca una política de ${nombreTabla(m[1])}`);
    } else if ((m = /^(grant|revoke)\b[\s\S]*?\bon\s+(?:(function|schema|all|sequence|table)\s+)?([\w."]+)/i.exec(s))) {
      const sobre = (m[2] ?? "table").toLowerCase();
      if (sobre !== "table" || ajena(m[3])) r.push(`${m[1].toLowerCase()} sobre ${sobre === "table" ? nombreTabla(m[3]) : `${sobre} ${m[3]}`}`);
    }
  }
  if (/\bsecurity\s+definer\b/i.test(codigo)) r.push("crea o cambia una función `security definer` (se salta la RLS)");
  return [...new Set(r)];
}

/**
 * Lo que impide aplicar. Vacío = adelante.
 * @param {{ nombre: string, local: string, enStaging: string|null, ensayo: {hash: string, at: string}|null, pablo?: boolean, ahora?: number }} d
 */
export function motivosParaNoAplicar({ nombre, local, enStaging, ensayo, pablo = false, ahora = Date.now() }) {
  const no = [];
  const juez = auditoriaDe(local);
  if (!juez) {
    no.push(`${nombre} no tiene el visto bueno del juez: pide al juez auditor-datos que la revise y apunta su veredicto en la cabecera (\`-- AUDITADA: auditor-datos AAAA-MM-DD OK\`).`);
  } else if (juez.veredicto !== "OK") {
    no.push(`El juez auditor-datos no dio el OK a ${nombre} (${juez.fecha}: «${juez.veredicto}»). Arregla lo que dice y que la revise otra vez.`);
  }
  const dePablo = motivosDePablo(local);
  if (dePablo.length && !pablo) {
    no.push(`${nombre} ${dePablo.join("; ")}: esta la lanza Pablo con \`!\` y \`--pablo\`.`);
  }
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
