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
 * Quita los comentarios (`--` y `/* *\/`) sin tocar lo que va entre comillas
 * simples: un `'--'` dentro de un literal no es un comentario.
 */
export function sinComentarios(sql) {
  const s = String(sql);
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "'") {
      const fin = s.indexOf("'", i + 1);
      const j = fin < 0 ? s.length : fin;
      out += s.slice(i, j + 1);
      i = j;
    } else if (c === "-" && s[i + 1] === "-") {
      const fin = s.indexOf("\n", i);
      i = fin < 0 ? s.length : fin - 1;
    } else if (c === "/" && s[i + 1] === "*") {
      const fin = s.indexOf("*/", i + 2);
      i = fin < 0 ? s.length : fin + 1;
    } else {
      out += c;
    }
  }
  return out;
}

/** Tablas de una lista `a, public.b, "c"` (hasta `to`/`from` o el final). */
const tablasDeLista = (lista) => lista.split(",").map((t) => nombreTabla(t.trim().split(/\s+/)[0])).filter(Boolean);

/**
 * Lista blanca (#440, caso de la 0096): la ÚNICA forma de `alter default
 * privileges` que no hace falta que lance una persona. Quita a `anon` la
 * plantilla de las tablas o secuencias que `postgres` cree en `public` de ahora
 * en adelante: no cambia ni un permiso de lo que existe. Todo lo que no case
 * letra por letra (otro rol, otro esquema, funciones, `grant`, `cascade`,
 * comillas, varios roles…) sigue siendo de Pablo. Se mira sobre el texto sin
 * comentarios y en minúsculas, y solo si la sentencia empieza donde empieza una
 * sentencia (inicio, tras `;`, `begin` o la apertura de un `$$`): una cola
 * pegada a un `grant … to` no cuenta.
 */
const PRIV_TABLA = "(?:select|insert|update|delete|truncate|references|trigger|maintain)";
const PRIV_SECUENCIA = "(?:usage|select|update)";
const lista = (p) => `(?:all(?:\\s+privileges)?|${p}(?:\\s*,\\s*${p})*)`;
const RE_REVOKE_ANON_POR_DEFECTO = new RegExp(
  "(^|;|\\$[\\w]*\\$|\\bbegin\\b)(\\s*)alter\\s+default\\s+privileges\\s+for\\s+role\\s+postgres\\s+in\\s+schema\\s+public\\s+revoke\\s+" +
    `(?:${lista(PRIV_TABLA)}\\s+on\\s+tables|${lista(PRIV_SECUENCIA)}\\s+on\\s+sequences)\\s+from\\s+anon\\s*(?=;|$)`,
  "g",
);

/** El código sin las sentencias de la lista blanca (que dejan de contar). */
export const sinRevokeAnonPorDefecto = (codigo) => String(codigo).replace(RE_REVOKE_ANON_POR_DEFECTO, "$1$2");

/**
 * Por qué esta migración la lanza Pablo (vacío = no hace falta). Ante la duda,
 * es suya: se mira lo que HACE el SQL, no solo su cabecera. Borrar o vaciar
 * datos, cambiar el tipo de una columna, tocar RLS o permisos de algo que ya
 * existía, `security definer`, vistas que se saltan la RLS y SQL dinámico.
 */
export function motivosDePablo(sql) {
  const texto = String(sql);
  const r = [];
  if (/^--\s*CONTRAE:/m.test(texto)) r.push("borra algo que ya existía (`-- CONTRAE:`)");
  const conCuerpos = sinComentarios(texto).toLowerCase();
  // El cuerpo de una función (`as $x$ … $x$`) no se ejecuta al aplicar: un
  // `update` dentro de una RPC no toca datos ahora. Los bloques `do $$ … $$`
  // sí se ejecutan, y se quedan.
  const codigo = sinRevokeAnonPorDefecto(conCuerpos.replace(/\bas\s+(\$[\w]*\$)[\s\S]*?\1/g, "as $cuerpo$"));
  // Solo cuenta como nueva una tabla creada sin `if not exists`: con él, la
  // tabla puede existir ya y la RLS que se le ponga sería la de una ajena.
  const nuevas = new Set([...codigo.matchAll(/create\s+(?:unlogged\s+)?table\s+(?!if\s+not\s+exists)([\w."]+)/g)].map((m) => nombreTabla(m[1])));
  const ajena = (t) => !nuevas.has(nombreTabla(t));

  // Datos que se pierden o se reescriben.
  if (/\bdrop\s+(?:table|view|materialized\s+view|schema|type|sequence|extension)\b/.test(codigo)) r.push("borra una tabla, vista, esquema, tipo o secuencia");
  if (/\bdrop\s+column\b|\balter\s+table\b[^;]*\bdrop\s+(?!constraint\b|default\b|not\s+null\b)(?:if\s+exists\s+)?[\w"]+/.test(codigo)) r.push("borra una columna");
  // `'truncate'` como palabra de un literal (la lista de permisos de una
  // autoprueba, 0096) no vacía nada; un `execute '…truncate…'` lo para la regla
  // del SQL dinámico de más abajo, que mira el `execute` y no el literal.
  if (/\btruncate\b/.test(codigo.replace(/'(?:[^']|'')*'/g, "''"))) r.push("vacía una tabla (`truncate`)");
  if (/\bdelete\s+from\b/.test(codigo)) r.push("borra filas (`delete from`)");
  if (/\bupdate\s+[\w."]+\s+set\b/.test(codigo)) r.push("reescribe filas (`update … set`)");
  if (/\balter\s+column\s+[\w"]+\s+(?:set\s+data\s+)?type\b/.test(codigo)) r.push("cambia el tipo de una columna");

  // RLS, políticas y permisos.
  for (const m of codigo.matchAll(/alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?([\w."]+)[^;]*?\b(enable|disable|force|no\s+force)\s+row\s+level\s+security/g)) {
    if (m[2] !== "enable" || ajena(m[1])) r.push(`cambia la RLS de ${nombreTabla(m[1])}`);
  }
  for (const m of codigo.matchAll(/\b(?:create|alter|drop)\s+policy\b[^;]*?\bon\s+([\w."]+)/g)) {
    if (ajena(m[1])) r.push(`toca una política de ${nombreTabla(m[1])}`);
  }
  for (const m of codigo.matchAll(/\b(grant|revoke)\b([^;]*)/g)) {
    const resto = m[2];
    const on = /\bon\s+(?:(table|function|schema|all\s+tables\s+in\s+schema|all\s+functions\s+in\s+schema|sequence|all)\s+)?([\s\S]*?)\s+(?:to|from)\b/.exec(resto);
    if (!on) {
      r.push(`${m[1]} de un rol a otro`);
    } else if (on[1] && on[1] !== "table") {
      r.push(`${m[1]} sobre ${on[1]}`);
    } else {
      for (const t of tablasDeLista(on[2])) if (ajena(t)) r.push(`${m[1]} sobre ${t}`);
    }
  }
  if (/\balter\s+default\s+privileges\b/.test(codigo)) r.push("cambia los permisos por defecto");
  if (/\bsecurity\s+definer\b/.test(conCuerpos)) r.push("crea o cambia una función `security definer` (se salta la RLS)");
  for (const m of codigo.matchAll(/\bcreate\s+(?:or\s+replace\s+)?(?:materialized\s+)?view\s+[\w."]+([^;]*)/g)) {
    if (!/security_invoker\s*=\s*(?:true|on)/.test(m[1])) r.push("crea una vista sin `security_invoker` (se salta la RLS)");
  }
  // SQL dinámico: lo que ejecuta no se puede leer aquí.
  if (/\bexecute\s+(?:format\s*\(|'|\$)/.test(codigo) || /\bexecute\s+[\w]+\s*;/.test(codigo)) r.push("ejecuta SQL dinámico (`execute`), que este script no puede revisar");
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
