/**
 * gh-shim.mjs — el `gh` de las sesiones, con el token pedido al usarse (#719, fondo #715).
 *
 * `scripts/bin/gh` (un script de sh de dos líneas) llama aquí, y esta carpeta va delante en el PATH
 * de Bash (la pone el arranque). Cada `gh` pide el token a la caché compartida
 * (`tokenConCache`, sin pasar por `token-sesion.mjs`) y lanza el `gh` REAL con él en su entorno:
 * pasada la hora ya no hay 401, porque el token del entorno del arranque no se usa.
 *
 *   - Nunca imprime el token: lo pone en el entorno del hijo y nada más.
 *   - Falla cerrado: sin un token con forma `ghs_…` el hijo recibe TOKEN_CENTINELA (inválido y nunca
 *     vacío: `gh` da 401 claro y no cae al llavero de Pablo, #673) y por stderr sale
 *     `gh-shim resultado: fallo motivo: <motivo de MOTIVOS>`. Un éxito no escribe nada.
 *   - Tope de 10 s en total, y 30 s sin reintentar tras un canje fallido (`falloReciente`, #508).
 *   - Se niega a sacar credenciales (`auth token`, `status -t`, `login`…): no tienen uso legítimo
 *     dentro de una sesión. `auth git-credential` sí pasa: es lo que `git` necesita.
 *   - Argumentos literales y sin shell (lección de #720): `%GH_TOKEN%`, `$GH_TOKEN`, comillas y
 *     espacios llegan al `gh` real tal cual. Nunca un `gh.cmd`.
 *   - Busca el `gh` real recorriendo el PATH sin la carpeta del shim: no puede hacer bucle consigo.
 */
import { spawnSync } from "node:child_process";
import { existsSync, realpathSync, statSync } from "node:fs";
import { constants } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { FORMA_TOKEN, falloReciente, rutaDeCache } from "./lib/cacheTokenSesion.mjs";
import { ErrorTokenSesion, MOTIVOS, TOKEN_CENTINELA, tokenConCache, tokenDeSesion } from "./lib/tokenSesion.mjs";

/** Tope de todo el canje: por debajo de los 13 s de TOPE_IDENTIDAD_MS. */
export const TOPE_SHIM_MS = 10_000;
/** Código con el que sale el shim cuando se niega (el del comando, si lo hubiera, es del `gh` real). */
export const NEGADO = 2;
/** Código cuando no hay ningún `gh` real en el PATH (el de «orden no encontrada» de un shell). */
export const SIN_GH = 127;

/** La carpeta del propio shim (`scripts/bin`): lo que hay que saltarse al buscar el `gh` real. */
export const CARPETA_SHIM = join(dirname(fileURLToPath(import.meta.url)), "bin");

const AUTH_NEGADOS = ["token", "login", "switch", "refresh", "setup-git"];
const FORMA_TOKEN_A_LA_VISTA = /^(--show-token(=.*)?|-[A-Za-z]*t[A-Za-z]*(=.*)?)$/;

/** ¿Pide este `gh` sacar o cambiar credenciales, o esconder eso detrás de un alias o una extensión? Devuelve el motivo en llano, o null. */
export function negacion(args) {
  if (args[0] === "alias" && args.slice(1).some((a) => a === "set" || a === "import")) return "gh alias: crear alias";
  if (["extension", "extensions", "ext"].includes(args[0]) && args.slice(1).includes("install")) return "gh extension install";
  if (args[0] !== "auth") return null;
  const resto = args.slice(1);
  const sub = resto.find((a) => AUTH_NEGADOS.includes(a));
  if (sub) return `gh auth ${sub}`;
  if (resto.includes("status") && resto.some((a) => FORMA_TOKEN_A_LA_VISTA.test(a))) return "gh auth status con el token a la vista";
  return null;
}

const enWindows = () => process.platform === "win32";

/** Una carpeta del PATH en forma comparable: barras, mayúsculas de Windows, `/c/…` de Git Bash y enlaces. */
export function normalizarCarpeta(carpeta, windows = enWindows()) {
  let c = String(carpeta).trim().replace(/\\/g, "/");
  if (windows) c = c.replace(/^\/([A-Za-z])\//, "$1:/");
  c = c.replace(/\/+$/, "");
  return windows ? c.toLowerCase() : c;
}

/**
 * El primer `gh` real del PATH que no esté en la carpeta del shim (`gh.exe` en Windows, `gh` fuera).
 * Una carpeta del shim repetida en el PATH se salta todas las veces. Devuelve la ruta o null.
 */
export function buscarGhReal({ path = process.env.PATH ?? process.env.Path ?? "", carpetaShim = CARPETA_SHIM, windows = enWindows(), existe = (f) => existsSync(f) && statSync(f).isFile() } = {}) {
  const propias = new Set([normalizarCarpeta(carpetaShim, windows)]);
  try {
    propias.add(normalizarCarpeta(realpathSync(carpetaShim), windows));
  } catch {
    // a propósito: si la carpeta del shim no se resuelve, vale su forma escrita
  }
  const nombre = windows ? "gh.exe" : "gh";
  for (const carpeta of path.split(windows ? ";" : delimiter)) {
    if (!carpeta.trim()) continue;
    let real = null;
    try {
      real = normalizarCarpeta(realpathSync(carpeta), windows);
    } catch {
      // a propósito: una carpeta del PATH que no existe no puede tener el `gh`
      continue;
    }
    if (propias.has(normalizarCarpeta(carpeta, windows)) || propias.has(real)) continue;
    const candidato = join(carpeta, nombre);
    if (existe(candidato)) return candidato;
  }
  return null;
}

/** El motivo de MOTIVOS de un fallo cualquiera del canje. */
const motivoDe = (e) => (e instanceof ErrorTokenSesion && MOTIVOS.includes(e.motivo) ? e.motivo : "error-interno");

/**
 * El token para este `gh`: de la caché o canjeado, con el tope de tiempo y la espera tras un fallo.
 * Devuelve { token } o { motivo }.
 */
export async function tokenParaUsar({ generar = tokenDeSesion, cache = {}, reloj = Date.now, tope = TOPE_SHIM_MS, rutaFallo = cache.ruta !== undefined ? cache.ruta : rutaDeCache(), fallo = {} } = {}) {
  // Los permisos del fichero de fallo son los de la caché: lo que se inyecte para una vale para el otro
  const opcionesFallo = { fs: cache.fs, proteger: cache.proteger, permisosBien: cache.permisosBien, ...fallo };
  // El fallo reciente se mira DENTRO del generador: tokenConCache solo lo llama si la caché no sirve,
  // así que con un token vivo nunca estorba
  const conEspera = async (opciones) => {
    if (rutaFallo && falloReciente({ ruta: rutaFallo, reloj, ...opcionesFallo })) throw new ErrorTokenSesion("fallo-reciente", "un canje falló hace menos de 30 s");
    try {
      return await generar(opciones);
    } catch (e) {
      if (rutaFallo) falloReciente({ ruta: rutaFallo, guardar: motivoDe(e), reloj, ...opcionesFallo });
      throw e;
    }
  };
  let reloj10;
  const limite = new Promise((ok) => {
    reloj10 = setTimeout(() => {
      // Pasado el tope, los próximos 30 s fallan de inmediato en vez de esperar otros 10 s cada uno
      if (rutaFallo) falloReciente({ ruta: rutaFallo, guardar: "red", reloj, ...opcionesFallo });
      ok({ motivo: "red" });
    }, tope);
  });
  try {
    const trabajo = tokenConCache({ cache, reloj, hasta: reloj() + tope, generar: conEspera }).then(
      (t) => (FORMA_TOKEN.test(String(t?.token)) ? { token: t.token } : { motivo: "token-raro" }),
      (e) => ({ motivo: motivoDe(e) }),
    );
    return await Promise.race([trabajo, limite]);
  } finally {
    clearTimeout(reloj10);
  }
}

/**
 * Lo que hace `gh` en una sesión. Devuelve el código de salida. Todo se inyecta para probarlo:
 * `generar` (el canje), `buscarGh` (el `gh` real), `correr` (spawnSync), `salida` (stderr).
 */
export async function main(argv, { generar = tokenDeSesion, buscarGh = buscarGhReal, correr = spawnSync, env = process.env, salida = console, cache, reloj, tope, fallo } = {}) {
  const negada = negacion(argv);
  if (negada) {
    salida.error(`gh-shim resultado: negado (${negada} no se usa dentro de una sesión; el token de la App lo pone este gh solo)`);
    return NEGADO;
  }
  const real = buscarGh();
  if (!real) {
    salida.error("gh-shim resultado: sin-gh-real (no hay otro gh en el PATH)");
    return SIN_GH;
  }
  const r = await tokenParaUsar({ generar, cache, reloj, tope, fallo });
  if (!r.token) salida.error(`gh-shim resultado: fallo motivo: ${r.motivo}`);
  const h = correr(real, argv, { stdio: "inherit", env: { ...env, GH_TOKEN: r.token ?? TOKEN_CENTINELA } });
  if (h?.error) {
    salida.error(`gh-shim resultado: no-lanzado (${h.error.code ?? "error"})`);
    return SIN_GH;
  }
  if (h?.status == null) return 128 + (constants.signals[h?.signal] ?? 1);
  return h.status;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exit(await main(process.argv.slice(2)));
}
