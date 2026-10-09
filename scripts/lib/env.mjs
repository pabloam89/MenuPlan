/**
 * env.mjs — un solo lector de claves para los scripts, Vite y los tests.
 *
 * Orden: primero el entorno del proceso (CI, `op run` o una variable puesta a
 * mano) y luego `.env.local`. Si el valor es una dirección de 1Password
 * (`op://HoMenu/Supabase/SUPABASE_DB_URL`), se pide a la bóveda: en el disco
 * solo queda la dirección. Ver .claude/skills/1password/SKILL.md.
 *
 * Para no pedir la huella en cada comando, `op` entra con la service account
 * de solo lectura cuyo token está en el llavero de Windows («MenuPlan
 * 1Password»). Sin ella, cae en la app de escritorio, que pide aprobar.
 *
 * Un `.env.local` con valores en claro sigue funcionando igual.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FICHERO = join(RAIZ, ".env.local");
export const LLAVERO = { recurso: "MenuPlan 1Password", usuario: "service-account" };

let fichero;
let token;
const resueltas = new Map();

/** { CLAVE: valor tal cual } de un .env, sin comillas. Vacío si no existe. */
export function leerFichero(ruta = FICHERO) {
  if (!existsSync(ruta)) return {};
  const env = {};
  for (const l of readFileSync(ruta, "utf8").split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(l);
    if (!m) continue;
    const v = m[2].trim().replace(/^(["'])(.*)\1$/, "$2");
    if (v) env[m[1]] = v;
  }
  return env;
}

export const esReferencia = (v) => typeof v === "string" && v.startsWith("op://");

/** El token de la service account: del entorno o del llavero de Windows. */
export function tokenServicio() {
  if (token !== undefined) return token;
  token = process.env.OP_SERVICE_ACCOUNT_TOKEN || null;
  if (!token && process.platform === "win32") {
    const ps = "[void][Windows.Security.Credentials.PasswordVault, Windows.Security.Credentials, ContentType = WindowsRuntime];"
      + ` $c = (New-Object Windows.Security.Credentials.PasswordVault).Retrieve('${LLAVERO.recurso}', '${LLAVERO.usuario}');`
      + " $c.RetrievePassword(); [Console]::Out.Write($c.Password)";
    try {
      token = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", ps], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || null;
    } catch {
      token = null;
    }
  }
  return token;
}

/** El entorno con el que lanzar `op` (con la service account si la hay). */
export function entornoOp(base = process.env) {
  // OP_SIN_SERVICIO=1: sin service account, por la app de escritorio, que pide
  // aprobar a Pablo. Es como Pablo lee lo que solo está en HoMenu (#328).
  if (base.OP_SIN_SERVICIO === "1") {
    const { OP_SERVICE_ACCOUNT_TOKEN: _, ...resto } = base;
    return resto;
  }
  const t = tokenServicio();
  return t ? { ...base, OP_SERVICE_ACCOUNT_TOKEN: t } : { ...base };
}

/** Resuelve varias direcciones en una sola llamada a `op inject`. */
function resolverVarias(pares) {
  const nuevas = pares.filter(([, ref]) => !resueltas.has(ref));
  if (!nuevas.length) return;
  const plantilla = nuevas.map(([k, ref]) => `${k}={{ ${ref} }}`).join("\n");
  let salida;
  try {
    salida = execFileSync("op", ["inject"], { input: plantilla, encoding: "utf8", env: entornoOp(), stdio: ["pipe", "pipe", "pipe"] });
  } catch (e) {
    const motivo = e.code === "ENOENT"
      ? "no encuentro el comando `op` (instala 1Password CLI o reinicia el terminal)"
      : (e.stderr || e.message).trim().split("\n")[0];
    throw new Error(`No pude leer de 1Password ${nuevas.map(([k]) => k).join(", ")}: ${motivo}`);
  }
  const lineas = salida.split(/\r?\n/);
  nuevas.forEach(([k, ref], i) => resueltas.set(ref, lineas[i].slice(k.length + 1)));
}

/** El valor de `clave`, o undefined. Con `obligatoria`, lanza si falta. */
export function leerEnv(clave, { obligatoria = false } = {}) {
  let v = process.env[clave];
  if (!v) {
    fichero ??= leerFichero();
    v = fichero[clave];
  }
  if (esReferencia(v)) {
    resolverVarias([[clave, v]]);
    v = resueltas.get(v);
  }
  if (!v && obligatoria) throw new Error(`Falta ${clave} en .env.local (o en el entorno)`);
  return v || undefined;
}

/**
 * Pone en process.env las claves pedidas que encuentre, sin pisar las que ya
 * hay. Las direcciones op:// van todas en una sola llamada.
 */
export function cargarEnv(claves) {
  fichero ??= leerFichero();
  const refs = [];
  for (const k of claves) {
    const v = process.env[k] || fichero[k];
    if (!v) continue;
    if (esReferencia(v)) refs.push([k, v]);
    else process.env[k] ||= v;
  }
  resolverVarias(refs);
  for (const [k, ref] of refs) process.env[k] = resueltas.get(ref);
}
