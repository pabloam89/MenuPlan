/**
 * cacheTokenSesion.mjs — el token de la App `homenu-sesiones` se saca una vez y se reutiliza
 * entre sesiones (fondo #326, E3).
 *
 * Por qué: cada arranque leía la clave `.pem` de 1Password con la cuenta de servicio, y con
 * varias sesiones se agotó el límite de lecturas por hora («Too many requests», 10 oct 2026
 * a las 19:10); además tardaba ~14 s. Un token de instalación vive 1 hora: se guarda y se
 * reutiliza mientras falten más de MARGEN_MS para que caduque.
 *
 * Un solo fichero por usuario de Windows, fuera del repo y de OneDrive
 * (`%LOCALAPPDATA%\MenuPlan\token-sesion.json`; fuera de Windows, `~/.claude/`), solo para ese
 * usuario (ACL con `icacls`; en POSIX 0600). Lleva el token, `expiraEn`, el App ID y la
 * instalación (para invalidarlo si cambian) y nada más: NUNCA la clave `.pem`.
 *
 * Todo lo del disco y del reloj se inyecta para probarlo en un directorio temporal. Ningún
 * mensaje ni valor devuelto por aquí enseña el token más allá de la propia entrada leída.
 */
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import * as fsReal from "node:fs";
import { homedir, userInfo } from "node:os";
import { dirname, join } from "node:path";

/** Misma forma que valida `lineasDeEntorno`: va a un fichero que lee un shell. */
export const FORMA_TOKEN = /^ghs_[A-Za-z0-9_.-]{20,}$/;
/** Se reutiliza mientras falte más de esto para caducar. */
export const MARGEN_MS = 10 * 60 * 1000;
/** Un token de instalación dura 1 hora: una caducidad a más de 2 h es un fichero raro. */
export const VIDA_MAX_MS = 2 * 60 * 60 * 1000;
export const ESPERA_BLOQUEO_MS = 6000;
export const SONDEO_MS = 100;
/** Un bloqueo más viejo que esto lo dejó un proceso muerto. */
export const BLOQUEO_VIEJO_MS = 30_000;
const VERSION = 1;
const CLAVES = ["v", "token", "expiraEn", "appId", "installationId"];

/** Por qué una entrada de la caché no sirve (vocabulario cerrado). `ok` es que sirve. */
export const MOTIVOS_CACHE = ["ok", "ausente", "corrupto", "forma", "caducado", "otra-app", "permisos"];

/** Dónde vive la caché: la misma ruta para todas las sesiones del mismo usuario del sistema. */
export function rutaDeCache(env = process.env, casa = homedir) {
  const base = env.LOCALAPPDATA ? join(env.LOCALAPPDATA, "MenuPlan") : join(casa(), ".claude");
  return join(base, "token-sesion.json");
}

function usuarioActual() {
  return process.env.USERNAME || userInfo().username;
}

/**
 * Deja el fichero solo para el usuario: ACL sin herencia con un único permiso en Windows,
 * 0600 en POSIX. Devuelve false si no pudo (la caché entonces no se escribe).
 */
export function protegerFichero(ruta) {
  try {
    if (process.platform === "win32") {
      // `/reset` primero: `/grant:r` solo sustituye lo del propio usuario y dejaría un permiso ajeno que ya hubiera
      const opciones = { stdio: "ignore", timeout: 5000, windowsHide: true };
      execFileSync("icacls", [ruta, "/reset"], opciones);
      execFileSync("icacls", [ruta, "/inheritance:r", "/grant:r", `${usuarioActual()}:(F)`], opciones);
    } else {
      fsReal.chmodSync(ruta, 0o600);
    }
    return true;
  } catch {
    // a propósito: sin poder cerrar los permisos no se guarda el token; el arranque canjea como antes
    return false;
  }
}

/** ¿Solo el usuario puede tocar el fichero? Cualquier otro permiso (o no poder mirarlo) es «no». */
export function permisosDelUsuario(ruta) {
  try {
    if (process.platform === "win32") {
      const salida = execFileSync("icacls", [ruta], { encoding: "utf8", timeout: 5000, windowsHide: true });
      const principales = [...salida.matchAll(/(\S+):\([^)]*\)/g)].map((m) => m[1].toLowerCase());
      const yo = usuarioActual().toLowerCase();
      return principales.length > 0 && principales.every((p) => p === yo || p.endsWith(`\\${yo}`));
    }
    const st = fsReal.statSync(ruta);
    if (typeof process.getuid === "function" && st.uid !== process.getuid()) return false;
    return (st.mode & 0o077) === 0;
  } catch {
    // a propósito: no poder comprobar los permisos es lo mismo que no fiarse de ellos
    return false;
  }
}

/**
 * Lee y valida la caché. Devuelve { motivo, entrada?, restanteMs? }: `motivo` es de MOTIVOS_CACHE
 * y solo con `ok` hay `entrada` ({ token, expiraEn, appId, installationId }).
 * `ids`: { appId, installationId }; el de la instalación puede ser null (se acepta el guardado).
 */
export function leerCache({ ruta, ids, reloj = Date.now, fs = fsReal, permisosBien = permisosDelUsuario }) {
  let crudo;
  try {
    crudo = fs.readFileSync(ruta, "utf8");
  } catch {
    // a propósito: sin fichero (o ilegible) no hay caché; se canjea
    return { motivo: "ausente" };
  }
  if (!permisosBien(ruta)) return { motivo: "permisos" };
  let d;
  try {
    d = JSON.parse(crudo);
  } catch {
    // a propósito: un JSON roto es «corrupto»; el motivo sale justo debajo
    return { motivo: "corrupto" };
  }
  if (!d || typeof d !== "object" || Array.isArray(d)) return { motivo: "corrupto" };
  const claves = Object.keys(d);
  if (claves.length !== CLAVES.length || !CLAVES.every((k) => claves.includes(k)) || d.v !== VERSION) return { motivo: "forma" };
  if (typeof d.token !== "string" || !FORMA_TOKEN.test(d.token)) return { motivo: "forma" };
  if (typeof d.expiraEn !== "string" || !/^\d{1,12}$/.test(String(d.appId)) || !/^\d{1,12}$/.test(String(d.installationId))) return { motivo: "forma" };
  const expira = Date.parse(d.expiraEn);
  if (!Number.isFinite(expira)) return { motivo: "forma" };
  if (String(d.appId) !== String(ids.appId)) return { motivo: "otra-app" };
  if (ids.installationId && String(d.installationId) !== String(ids.installationId)) return { motivo: "otra-app" };
  const restanteMs = expira - reloj();
  if (restanteMs > VIDA_MAX_MS) return { motivo: "forma" };
  if (restanteMs <= 0) return { motivo: "caducado" };
  return { motivo: "ok", restanteMs, entrada: { token: d.token, expiraEn: d.expiraEn, appId: d.appId, installationId: d.installationId } };
}

/**
 * Guarda la caché de forma atómica: un fichero temporal vacío con sus permisos cerrados ANTES de
 * escribir el token, y luego `rename` sobre el definitivo. Devuelve true si quedó escrita.
 */
export function escribirCache({ ruta, datos, fs = fsReal, proteger = protegerFichero }) {
  const tmp = `${ruta}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  try {
    fs.mkdirSync(dirname(ruta), { recursive: true, mode: 0o700 });
    fs.writeFileSync(tmp, "", { flag: "wx", mode: 0o600 });
    if (!proteger(tmp)) throw new Error("permisos");
    const { token, expiraEn, appId, installationId } = datos;
    fs.writeFileSync(tmp, JSON.stringify({ v: VERSION, token, expiraEn, appId, installationId }));
    fs.renameSync(tmp, ruta);
    return true;
  } catch {
    // a propósito: no guardar la caché solo cuesta otro canje; nunca rompe el arranque
    try {
      fs.unlinkSync(tmp);
    } catch {
      // a propósito: el temporal puede no haberse creado
    }
    return false;
  }
}

const dormirReal = (ms) => new Promise((ok) => setTimeout(ok, ms));

/**
 * Ejecuta `fn({ bloqueado })` con un bloqueo de creación exclusiva (`wx`) al lado de la caché.
 * Si otro proceso lo tiene, espera hasta `esperaMs` sondeando; un bloqueo de más de
 * BLOQUEO_VIEJO_MS se da por huérfano y se quita. Si no lo consigue (tiempo, permisos), ejecuta
 * `fn` igualmente con `bloqueado: false`: la escritura atómica protege el fichero y lo peor es un
 * canje de más. Dos procesos que quitan a la vez el mismo bloqueo viejo pueden pisarse; sale igual.
 */
export async function conBloqueo({ ruta, fn, fs = fsReal, reloj = Date.now, dormir = dormirReal, esperaMs = ESPERA_BLOQUEO_MS, sondeoMs = SONDEO_MS }) {
  const lock = `${ruta}.lock`;
  const limite = reloj() + esperaMs;
  let tengo = false;
  try {
    fs.mkdirSync(dirname(ruta), { recursive: true, mode: 0o700 });
  } catch {
    // a propósito: si ni la carpeta se crea, el intento de bloqueo falla abajo y se sigue sin él
  }
  for (;;) {
    try {
      fs.writeFileSync(lock, String(process.pid), { flag: "wx" });
      tengo = true;
      break;
    } catch (e) {
      if (e?.code !== "EEXIST") break;
    }
    try {
      if (reloj() - fs.statSync(lock).mtimeMs > BLOQUEO_VIEJO_MS) {
        fs.unlinkSync(lock);
        continue;
      }
    } catch (e) {
      if (e?.code === "ENOENT") continue; // lo soltaron entre medias
      break;
    }
    if (reloj() >= limite) break;
    await dormir(sondeoMs);
  }
  try {
    return await fn({ bloqueado: tengo });
  } finally {
    if (tengo) {
      try {
        fs.unlinkSync(lock);
      } catch {
        // a propósito: si el bloqueo ya no está, nadie lo necesita
      }
    }
  }
}
