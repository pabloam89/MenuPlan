#!/usr/bin/env node
/**
 * Cuántas carpetas de trabajo de MenuPlan (las hermanas de este repo, `MenuPlan` y `MenuPlan-*`) piden alguna clave
 * de `ops/env.1password` a una bóveda que no es HoMenu-sesiones: leyendo su `.env.local` tal cual (como antes) y con
 * `direcciones()` (como ahora). No llama a `op` ni imprime direcciones: solo cuenta. Skill `1password`, «Lo que falló», 4 nov.
 *
 *   node scripts/direcciones-carpetas.mjs
 */
import { existsSync, readdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { PLANTILLA, RAIZ, direcciones, esReferencia, leerFichero } from "./lib/env.mjs";

const SESIONES = "op://HoMenu-sesiones/";
const claves = Object.keys(leerFichero(PLANTILLA));
const fuera = (env) => claves.some((k) => esReferencia(env[k]) && !env[k].startsWith(SESIONES));

const padre = dirname(RAIZ);
const prefijo = basename(RAIZ).replace(/-.*$/, "");
let carpetas = 0;
let antes = 0;
let despues = 0;
const aviso = console.error;
console.error = () => {}; // el aviso de direcciones() saldría una vez por carpeta
try {
  for (const d of readdirSync(padre).filter((n) => n === prefijo || n.startsWith(`${prefijo}-`))) {
    const local = join(padre, d, ".env.local");
    if (!existsSync(local)) continue;
    carpetas++;
    if (fuera(leerFichero(local))) antes++;
    if (fuera(direcciones({ local, entorno: {} }))) despues++;
  }
} finally {
  console.error = aviso;
}
console.log(`carpetas con .env.local: ${carpetas}; piden a otra bóveda alguna clave de la plantilla: antes ${antes}, después ${despues}`);
