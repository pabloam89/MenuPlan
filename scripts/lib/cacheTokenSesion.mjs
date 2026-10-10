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
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/** Misma forma que valida `lineasDeEntorno`: va a un fichero que lee un shell. */
export const FORMA_TOKEN = /^ghs_[A-Za-z0-9_.-]{20,}$/;
/** Se reutiliza mientras falte más de esto para caducar: un token servido tiene al menos 15 minutos de vida. */
export const MARGEN_MS = 15 * 60 * 1000;
/** Un token de instalación dura 1 hora; se admite un pequeño desajuste de reloj y nada más. */
export const VIDA_MAX_MS = 60 * 60 * 1000 + 2 * 60 * 1000;
export const ESPERA_BLOQUEO_MS = 6000;
export const SONDEO_MS = 100;
/** Un bloqueo más viejo que esto lo dejó un proceso muerto (un canje normal no pasa de 15 s). */
export const BLOQUEO_VIEJO_MS = 20_000;
/** La fecha de caducidad solo en ISO estricto: se imprime en `--comprobar` y en avisos. */
export const FORMA_FECHA = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z$/;
const VERSION = 1;
const CLAVES = ["v", "token", "expiraEn", "appId", "installationId"];

/** Por qué una entrada de la caché no sirve (vocabulario cerrado). `ok` es que sirve. */
export const MOTIVOS_CACHE = ["ok", "ausente", "corrupto", "forma", "caducado", "otra-app", "permisos"];

const normaliza = (r) => String(r).replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();

/**
 * Dónde vive la caché: la misma ruta para todas las sesiones del mismo usuario del sistema.
 * `LOCALAPPDATA` viene del entorno: solo vale dentro del perfil del usuario y fuera de OneDrive;
 * si no, se usa `~/.claude`. Devuelve null si tampoco ese sitio vale (la caché se desactiva).
 */
export function rutaDeCache(env = process.env, casa = homedir) {
  const perfil = normaliza(casa());
  const vale = (dir) => {
    const d = normaliza(dir);
    return (d === perfil || d.startsWith(`${perfil}/`)) && !/onedrive/.test(d) && !d.split("/").includes("..");
  };
  if (env.LOCALAPPDATA && vale(env.LOCALAPPDATA)) return join(env.LOCALAPPDATA, "MenuPlan", "token-sesion.json");
  const respaldo = join(casa(), ".claude");
  return vale(respaldo) ? join(respaldo, "token-sesion.json") : null;
}

/** Las herramientas de Windows por ruta absoluta: en Git Bash el PATH trae un `whoami` de GNU que no entiende `/user`. */
const SYS32 = (exe) => join(process.env.SystemRoot || "C:\\Windows", "System32", exe);
let identidadEnWindows = null;
/** Quién es el usuario del sistema, sin leer el entorno: { nombre: "DOMINIO\\usuario", sid } (`whoami /user`). */
export function identidadWindows() {
  if (identidadEnWindows) return identidadEnWindows;
  const salida = execFileSync(SYS32("whoami.exe"), ["/user", "/fo", "csv", "/nh"], { encoding: "utf8", timeout: 5000, windowsHide: true });
  const m = /^"([^"]+)","(S-1-[\d-]+)"/.exec(salida.trim());
  if (!m) throw new Error("whoami sin SID");
  identidadEnWindows = { nombre: m[1], sid: m[2] };
  return identidadEnWindows;
}

/**
 * Los usuarios o grupos con acceso que lista `icacls <ruta>`. Lee todo lo que hay antes de `:(`
 * (los nombres pueden llevar espacios) y quita la ruta que abre la primera línea.
 */
export function principalesDeIcacls(salida, ruta) {
  const fuera = [];
  for (const linea of String(salida).split(/\r?\n/)) {
    let t = linea.trim();
    if (t.toLowerCase().startsWith(String(ruta).toLowerCase())) t = t.slice(String(ruta).length).trim();
    const m = /^(.+?):\(/.exec(t);
    if (m) fuera.push(m[1]);
  }
  return fuera;
}

/**
 * Deja el fichero solo para el usuario: ACL sin herencia con un único permiso (por SID) en Windows,
 * 0600 en POSIX. Devuelve false si no pudo (la caché entonces no se escribe).
 */
export function protegerFichero(ruta) {
  try {
    if (process.platform === "win32") {
      // `/reset` primero: `/grant:r` solo sustituye lo del propio usuario y dejaría un permiso ajeno que ya hubiera
      const opciones = { stdio: "ignore", timeout: 5000, windowsHide: true };
      execFileSync(SYS32("icacls.exe"), [ruta, "/reset"], opciones);
      execFileSync(SYS32("icacls.exe"), [ruta, "/inheritance:r", "/grant:r", `*${identidadWindows().sid}:(F)`], opciones);
    } else {
      fsReal.chmodSync(ruta, 0o600);
    }
    return true;
  } catch {
    // a propósito: sin poder cerrar los permisos no se guarda el token; el arranque canjea como antes
    return false;
  }
}

/**
 * ¿Solo el usuario puede tocar el fichero? Cualquier otro permiso (o no poder mirarlo) es «no».
 * En Windows el nombre debe ser el completo `DOMINIO\usuario` del sistema: el mismo usuario de otro dominio no vale.
 */
export function permisosDelUsuario(ruta, yo = null) {
  try {
    if (process.platform === "win32") {
      const salida = execFileSync(SYS32("icacls.exe"), [ruta], { encoding: "utf8", timeout: 5000, windowsHide: true });
      const principales = principalesDeIcacls(salida, ruta).map((p) => p.toLowerCase());
      const mio = (yo ?? identidadWindows().nombre).toLowerCase();
      return principales.length > 0 && principales.every((p) => p === mio);
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
  try {
    fs.statSync(ruta);
  } catch {
    // a propósito: sin fichero no hay caché; se canjea
    return { motivo: "ausente" };
  }
  // Los permisos se miran ANTES de leer el contenido: un fichero que no es solo del usuario no se abre
  if (!permisosBien(ruta)) return { motivo: "permisos" };
  let crudo;
  try {
    crudo = fs.readFileSync(ruta, "utf8");
  } catch {
    // a propósito: ilegible es lo mismo que ausente; se canjea
    return { motivo: "ausente" };
  }
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
  if (typeof d.expiraEn !== "string" || !FORMA_FECHA.test(d.expiraEn) || !/^\d{1,12}$/.test(String(d.appId)) || !/^\d{1,12}$/.test(String(d.installationId))) return { motivo: "forma" };
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
    if (!FORMA_FECHA.test(String(expiraEn)) || !FORMA_TOKEN.test(String(token))) throw new Error("forma");
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
 * Ejecuta `fn({ bloqueado, razon })` con un bloqueo de creación exclusiva (`wx`) al lado de la caché.
 * Si otro proceso lo tiene, espera sondeando hasta `esperaMs` y nunca más allá de `hasta` (instante
 * absoluto, el presupuesto que le queda a quien llama); un bloqueo de más de BLOQUEO_VIEJO_MS se da
 * por huérfano y se quita. Si no lo consigue, ejecuta `fn` con `bloqueado: false` y la `razon`:
 * `ocupado` (otro canjea: quien llama NO debe canjear en paralelo) o `error` (no se puede crear el
 * bloqueo, p. ej. permisos: canjear sin él es lo único posible). Dos procesos que quitan a la vez el
 * mismo bloqueo viejo pueden pisarse; el fichero sigue entero porque se escribe de forma atómica.
 */
export async function conBloqueo({ ruta, fn, fs = fsReal, reloj = Date.now, dormir = dormirReal, esperaMs = ESPERA_BLOQUEO_MS, sondeoMs = SONDEO_MS, hasta = Infinity }) {
  const lock = `${ruta}.lock`;
  const limite = Math.min(reloj() + (esperaMs ?? ESPERA_BLOQUEO_MS), hasta);
  let tengo = false;
  let razon = "error";
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
      if (e?.code !== "EEXIST") {
        razon = "error";
        break;
      }
    }
    try {
      if (reloj() - fs.statSync(lock).mtimeMs > BLOQUEO_VIEJO_MS) {
        fs.unlinkSync(lock);
        continue;
      }
    } catch (e) {
      if (e?.code === "ENOENT") continue; // lo soltaron entre medias
      razon = "error";
      break;
    }
    razon = "ocupado";
    if (reloj() >= limite) break;
    await dormir(sondeoMs ?? SONDEO_MS);
  }
  try {
    return await fn({ bloqueado: tengo, razon: tengo ? null : razon });
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
