/**
 * token-sesion.mjs — el token de la App `homenu-sesiones` a demanda (#329).
 *
 *   node scripts/token-sesion.mjs --comprobar   genera uno y dice si vale (no lo imprime)
 *   node scripts/token-sesion.mjs -- gh pr list  corre el comando con GH_TOKEN puesto
 *
 * El arranque ya deja el token en el entorno de la sesión; esto sirve cuando
 * caduca (1 hora) o para probar la cadena entera sin abrir otra sesión. El
 * token y la clave no salen nunca por pantalla ni a un fichero.
 */
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { ErrorTokenSesion, tokenDeSesion } from "./lib/tokenSesion.mjs";

export async function main(argv, { generar = tokenDeSesion, correr = spawnSync, salida = console } = {}) {
  const corte = argv.indexOf("--");
  const comprobar = argv.includes("--comprobar");
  if (!comprobar && corte < 0) {
    salida.error("uso: node scripts/token-sesion.mjs --comprobar | -- <comando…>");
    return 2;
  }
  let t;
  try {
    t = await generar();
  } catch (e) {
    if (!(e instanceof ErrorTokenSesion)) throw e;
    salida.error(`token-sesion resultado: fallo motivo: ${e.motivo} (${e.message})`);
    return 1;
  }
  if (comprobar) {
    salida.log(`token-sesion resultado: ok expira: ${t.expiraEn ?? "?"} autor: ${t.autor.nombre}`);
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
