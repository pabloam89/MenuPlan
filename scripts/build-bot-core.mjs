// Empaqueta el motor (src/server/botCore.js) para las funciones del bot.
// Se ejecuta en `npm run build`, después de `vite build`. La salida,
// api/_bot/core.mjs, no se versiona: se regenera en cada despliegue.

import { build } from "esbuild";
import path from "node:path";
import { opcionesBotCore } from "./lib/botCoreConfig.mjs";

const raiz = path.resolve(import.meta.dirname, "..");

await build(opcionesBotCore(path.join(raiz, "api/_bot/core.mjs")));

console.log("bot core → api/_bot/core.mjs");

// Los dominios del panel de gustos, para la descripción de ajustar_gustos. Se
// sacan aquí y no en cada turno: calcularlos obligaba a cargar el motor entero
// (core.mjs, ~10 MB) antes de llamar al modelo, aunque Lola no fuera a usarlo.
// Se regenera con el motor, así que nunca se queda atrás.
const { pathToFileURL } = await import("node:url");
const fsP = await import("node:fs");
const core = await import(pathToFileURL(path.join(raiz, "api/_bot/core.mjs")).href);
const dominios = core.CAMPOS.filter((c) => c.panel !== false).map((c) =>
  `${c.id} (${c.etiqueta})${Array.isArray(c.dominio) ? `: ${c.dominio.join("/")}` : ": texto libre"}`).join("; ");
// Y la etiqueta de cada campo, para la ficha de la casa (api/_bot/ficha.js),
// que tampoco carga el motor.
const etiquetas = Object.fromEntries(core.CAMPOS.map((c) => [c.id, c.etiqueta]));
fsP.writeFileSync(path.join(raiz, "api/_bot/dominiosGustos.json"), JSON.stringify({ dominios, etiquetas }) + "\n");
console.log("dominios de gustos → api/_bot/dominiosGustos.json");
