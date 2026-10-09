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
  const t = tokenServicio();
  return t ? { ...base, OP_SERVICE_ACCOUNT_TOKEN: t } : { ...base };
}

/**
 * Las dos bóvedas de MenuPlan (#299, #328): la de las sesiones, con solo lo
 * que necesitan, y la de Pablo, con lo de administración.
 */
export const BOVEDA_SESIONES = "HoMenu-sesiones";
export const BOVEDA_PABLO = "HoMenu";

/**
 * Plan B mientras se mueven las claves de una bóveda a otra: la misma
 * dirección en la otra de las dos, o null si la dirección es de cualquier otra
 * bóveda. Así un `.env.local` nuevo (que ya apunta a HoMenu-sesiones) funciona
 * antes de que exista la bóveda, y uno viejo (HoMenu) sigue funcionando
 * después, con la cuenta de servicio que solo lee la de sesiones. El respaldo
 * usa las mismas credenciales: no lee nada que no se pudiera leer ya.
 */
export function enOtraBoveda(ref) {
  const m = /^op:\/\/([^/]+)\/(.+)$/.exec(ref);
  if (!m) return null;
  if (m[1] === BOVEDA_SESIONES) return `op://${BOVEDA_PABLO}/${m[2]}`;
  if (m[1] === BOVEDA_PABLO) return `op://${BOVEDA_SESIONES}/${m[2]}`;
  return null;
}

const motivoDe = (e) => (e.code === "ENOENT"
  ? "no encuentro el comando `op` (instala 1Password CLI o reinicia el terminal)"
  : String(e.stderr || e.message).trim().split("\n")[0]);

/** Los valores de varias direcciones, en una sola llamada a `op inject`. Lanza si falla alguna. */
function inyectar(pares) {
  const plantilla = pares.map(([k, ref]) => `${k}={{ ${ref} }}`).join("\n");
  const salida = execFileSync("op", ["inject"], { input: plantilla, encoding: "utf8", env: entornoOp(), stdio: ["pipe", "pipe", "pipe"] });
  const lineas = salida.split(/\r?\n/);
  return pares.map(([k], i) => lineas[i].slice(k.length + 1));
}

/**
 * Resuelve varias direcciones en una sola llamada a `op inject`. Si esa falla
 * (basta una dirección mala para que `op inject` falle entero), las prueba una
 * a una y la que no está en su bóveda la busca en la otra (`enOtraBoveda`),
 * avisando con una línea por la salida de errores. Lo que no aparece en
 * ninguna, lanza con sus nombres; con `tolerante`, lo avisa y lo devuelve.
 */
function resolverVarias(pares, { tolerante = false } = {}) {
  const nuevas = pares.filter(([, ref]) => !resueltas.has(ref));
  if (!nuevas.length) return [];
  try {
    inyectar(nuevas).forEach((v, i) => resueltas.set(nuevas[i][1], v));
    return [];
  } catch (e) {
    if (e.code === "ENOENT") throw new Error(`No pude leer de 1Password ${nuevas.map(([k]) => k).join(", ")}: ${motivoDe(e)}`);
  }
  const fallan = [];
  let motivo = "";
  for (const [k, ref] of nuevas) {
    try {
      resueltas.set(ref, inyectar([[k, ref]])[0]);
      continue;
    } catch (e) {
      motivo ||= motivoDe(e);
    }
    const otra = enOtraBoveda(ref);
    if (otra) {
      try {
        resueltas.set(ref, inyectar([[k, otra]])[0]);
        const de = ref.split("/")[2];
        const a = otra.split("/")[2];
        console.error(`env-boveda clave: ${k} de: ${de} a: ${a} motivo: respaldo`);
        continue;
      } catch {
        // tampoco está en la otra: cuenta como fallo
      }
    }
    fallan.push(k);
  }
  if (fallan.length && !tolerante) throw new Error(`No pude leer de 1Password ${fallan.join(", ")}: ${motivo}`);
  for (const k of fallan) console.error(`env-boveda clave: ${k} motivo: sin-acceso`);
  return fallan;
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
 *
 * Con `tolerante` (lo usa Vite, que carga todo `.env.local`), una clave que no
 * se puede leer no para el arranque: se avisa (`env-boveda … sin-acceso`) y
 * queda vacía, nunca con la dirección op:// como valor. Es el caso de una
 * sesión con la cuenta de servicio de HoMenu-sesiones y un `.env.local` que aún
 * nombra claves de administración de HoMenu (#299).
 */
export function cargarEnv(claves, { tolerante = false } = {}) {
  fichero ??= leerFichero();
  const refs = [];
  for (const k of claves) {
    const v = process.env[k] || fichero[k];
    if (!v) continue;
    if (esReferencia(v)) refs.push([k, v]);
    else process.env[k] ||= v;
  }
  const fallan = new Set(resolverVarias(refs, { tolerante }));
  for (const [k, ref] of refs) process.env[k] = fallan.has(k) ? "" : resueltas.get(ref);
}
