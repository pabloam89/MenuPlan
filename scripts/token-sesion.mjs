/**
 * token-sesion.mjs — el token de la App `homenu-sesiones` a demanda (#329).
 *
 *   node scripts/token-sesion.mjs --comprobar   da un token y dice si vale (no lo imprime)
 *   node scripts/token-sesion.mjs -- gh pr list  corre el comando con GH_TOKEN puesto
 *   … --sin-cache                               fuerza un canje nuevo (antes de `--`)
 *
 * El arranque ya deja el token en el entorno de la sesión; esto sirve cuando
 * caduca (1 hora) o para probar la cadena entera sin abrir otra sesión. Reutiliza
 * el token que guarda la caché por usuario (scripts/lib/cacheTokenSesion.mjs)
 * mientras falten más de 10 minutos; `--comprobar` dice si salió de la caché
 * (`cache: si`) o se canjeó (`cache: no`). El token y la clave no salen nunca por
 * pantalla ni a un fichero que no sea esa caché.
 */
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { ErrorTokenSesion, tokenConCache } from "./lib/tokenSesion.mjs";

export async function main(argv, { generar = tokenConCache, correr = spawnSync, salida = console } = {}) {
  const corte = argv.indexOf("--");
  const comprobar = argv.includes("--comprobar");
  const sinCache = (corte < 0 ? argv : argv.slice(0, corte)).includes("--sin-cache");
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
    salida.error("token-sesion aviso: 1Password agotó el límite de lecturas; uso el token guardado, que caduca pronto. Reintenta más tarde con --sin-cache.");
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
  return correr(cmd, args, { stdio: "inherit", env: { ...process.env, GH_TOKEN: t.token } }).status ?? 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exit(await main(process.argv.slice(2)));
}
