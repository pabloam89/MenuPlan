#!/usr/bin/env node
/**
 * identidad.mjs — al abrir sesión (SessionStart), la sesión trabaja como la App `homenu-sesiones` (#329, #878).
 *
 * Lo que quedó del arranque al desconectar la Factoría antigua (#878): solo la identidad. Llama a
 * `aplicarIdentidad` (scripts/lib/tokenSesion.mjs), que canjea la clave de la App por un token de
 * 1 hora y escribe en el fichero de entorno de la sesión (CLAUDE_ENV_FILE, lo lee Bash) el PATH con
 * `scripts/bin` delante (el `gh` que pide el token al usarse, #719), el token y el autor de git.
 *
 * Por qué es imprescindible: Pablo cerró su sesión de `gh` (13 oct); sin esto las sesiones se quedan
 * sin GitHub, y si él vuelve a entrar, actúan como él, que es administrador y puede fusionar a main.
 * Con el token de la App, GitHub rechaza la fusión a main (la App no tiene `administration`).
 *
 * Lo que imprime entra en el contexto de la sesión: una línea con la identidad que salió. Nunca rompe
 * el arranque: `aplicarIdentidad` no lanza y tiene su propio tope (el hook muere a los 30 s).
 * La carpeta del shim sale de donde vive ESTE fichero (import.meta.url), nunca del cwd.
 */
import { execFileSync } from "node:child_process";

import { aplicarIdentidad, rutaDeShimDesde } from "../../scripts/lib/tokenSesion.mjs";
import { esSesionDeNube } from "./nube.mjs";

let entrada = {};
try {
  let crudo = "";
  if (!process.stdin.isTTY) for await (const trozo of process.stdin) crudo += trozo;
  entrada = crudo ? JSON.parse(crudo) : {};
} catch {
  // a propósito: sin entrada (o ilegible) se sigue con lo que hay; la carpeta sale de process.cwd()
}

const raiz = entrada.cwd || process.cwd();
let rama = null;
try {
  rama = execFileSync("git", ["-C", raiz, "rev-parse", "--abbrev-ref", "HEAD"], { windowsHide: true, encoding: "utf8", timeout: 4000, stdio: ["ignore", "pipe", "ignore"] }).trim();
} catch {
  // a propósito: sin rama, esSesionDeNube da false (falla cerrado) y se trata como sesión del PC
}

const identidad = await aplicarIdentidad({
  rutaShim: rutaDeShimDesde(import.meta.url),
  nube: esSesionDeNube(process.env, rama, raiz),
});
process.stdout.write(`[identidad MenuPlan] ${identidad}\n`);
process.exit(0);
