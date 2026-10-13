/**
 * token-sesion.mjs — el token de la App `homenu-sesiones` a demanda (#329).
 *
 *   node scripts/token-sesion.mjs --comprobar   da un token y dice si vale (no lo imprime)
 *   node scripts/token-sesion.mjs -- gh pr list  corre el comando con GH_TOKEN puesto
 *   … --sin-cache                               fuerza un canje nuevo (antes de `--`)
 *
 * El arranque ya deja el token en el entorno de la sesión; esto sirve cuando
 * caduca (1 hora), cuando la sesión perdió ese entorno (p. ej. al continuar tras
 * compactar) o para probar la cadena entera. El comando sale con el token, el
 * ayudante de git y el autor de la App puestos, sin depender del arranque. Reutiliza
 * el token que guarda la caché por usuario (scripts/lib/cacheTokenSesion.mjs)
 * mientras falten más de 15 minutos; `--comprobar` dice si salió de la caché
 * (`cache: si`) o se canjeó (`cache: no`). El token y la clave no salen nunca por
 * pantalla ni a un fichero que no sea esa caché.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { constants } from "node:os";
import { basename, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { ErrorTokenSesion, entornoDeComando, tokenConCache } from "./lib/tokenSesion.mjs";

/** Código del propio envoltorio cuando no pudo lanzar el comando (el 1 es del comando). */
export const NO_LANZADO = 127;

/**
 * Dónde está el JS de npm o de npx, para lanzarlo con Node y sin shell. En Windows
 * `npm` es un .cmd y Node 24 no lanza un .cmd sin shell (EINVAL); con shell, cmd.exe
 * sustituiría `%GH_TOKEN%` en los argumentos (#720). Sale de `npm_execpath` o de junto a node.
 */
export function rutaCliDe(nombre, { env = process.env, execPath = process.execPath, existe = existsSync } = {}) {
  const fichero = `${nombre}-cli.js`;
  const candidatos = [];
  if (env.npm_execpath) candidatos.push(join(dirname(env.npm_execpath), fichero));
  candidatos.push(join(dirname(execPath), "node_modules", "npm", "bin", fichero));
  candidatos.push(join(dirname(execPath), "..", "lib", "node_modules", "npm", "bin", fichero));
  return candidatos.find((c) => existe(c)) ?? null;
}

/**
 * Qué se lanza de verdad, sin shell nunca: npm/npx pasan a node + su .js; otro
 * .cmd o .bat se rechaza; el resto, tal cual. Devuelve { cmd, args } o { rechazo }.
 */
export function resolverComando(cmd, args, opciones = {}) {
  const base = basename(cmd).toLowerCase().replace(/\.(cmd|bat|exe)$/, "");
  if (base === "npm" || base === "npx") {
    const cli = rutaCliDe(base, opciones);
    if (cli) return { cmd: opciones.execPath ?? process.execPath, args: [cli, ...args] };
    if ((opciones.plataforma ?? process.platform) === "win32") return { rechazo: `sin-${base}-cli` };
    return { cmd, args };
  }
  if (/\.(cmd|bat)$/i.test(cmd)) return { rechazo: "cmd-o-bat-sin-shell" };
  return { cmd, args };
}

/**
 * Lanza el comando y nunca sale mudo. No se pudo lanzar (error de spawn o rechazo) -> 127 y
 * `motivo: comando-no-lanzado (<código>)`. Murió por una señal (status null, sin error) -> no es
 * 127, porque sí se lanzó: `motivo: comando-muerto-por-senal (<señal>)` y 128 + n, como en un shell.
 */
export function lanzar(cmd, args, opcionesHijo, { correr = spawnSync, salida = console, resolver = {} } = {}) {
  const r = resolverComando(cmd, args, resolver);
  if (r.rechazo) {
    salida.error(`token-sesion resultado: fallo motivo: comando-no-lanzado (${r.rechazo})`);
    return NO_LANZADO;
  }
  const h = correr(r.cmd, r.args, opcionesHijo);
  if (h?.error) {
    salida.error(`token-sesion resultado: fallo motivo: comando-no-lanzado (${h.error.code ?? "error"})`);
    return NO_LANZADO;
  }
  if (h?.status == null) {
    const senal = h?.signal ?? "desconocida";
    salida.error(`token-sesion resultado: fallo motivo: comando-muerto-por-senal (${senal})`);
    return 128 + (constants.signals[senal] ?? 1);
  }
  return h.status;
}

export async function main(argv, { generar = tokenConCache, correr = spawnSync, salida = console } = {}) {
  const corte = argv.indexOf("--");
  const opciones = corte < 0 ? argv : argv.slice(0, corte); // lo que va detrás de `--` es del comando
  const comprobar = opciones.includes("--comprobar");
  const sinCache = opciones.includes("--sin-cache");
  if (!comprobar && corte < 0) {
    salida.error("uso: node scripts/token-sesion.mjs [--sin-cache] --comprobar | [--sin-cache] -- <comando…>");
    return 2;
  }
  let t;
  try {
    t = await generar({ sinCache });
  } catch (e) {
    if (!(e instanceof ErrorTokenSesion)) throw e;
    salida.error(`token-sesion resultado: fallo motivo: ${e.motivo} (${e.message})`);
    return 1;
  }
  if ((t.advertencias ?? []).includes("cache-casi-caducada")) {
    salida.error(`token-sesion aviso: 1Password agotó el límite de lecturas; uso el token guardado, que caduca a las ${t.expiraEn ?? "?"} (UTC). Reintenta más tarde con --sin-cache.`);
  }
  if (comprobar) {
    salida.log(`token-sesion resultado: ok expira: ${t.expiraEn ?? "?"} autor: ${t.autor.nombre} cache: ${t.cache === "si" ? "si" : "no"}`);
    return 0;
  }
  const [cmd, ...args] = argv.slice(corte + 1);
  if (!cmd) {
    salida.error("falta el comando después de --");
    return 2;
  }
  return lanzar(cmd, args, { stdio: "inherit", env: entornoDeComando({ token: t.token, autor: t.autor, base: process.env }) }, { correr, salida });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exit(await main(process.argv.slice(2)));
}
