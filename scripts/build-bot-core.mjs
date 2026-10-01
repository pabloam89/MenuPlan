// Empaqueta el motor (src/server/botCore.js) para las funciones del bot.
// Se ejecuta en `npm run build`, después de `vite build`. La salida,
// api/_bot/core.mjs, no se versiona: se regenera en cada despliegue.

import { build } from "esbuild";
import path from "node:path";

const raiz = path.resolve(import.meta.dirname, "..");

await build({
  entryPoints: [path.join(raiz, "src/server/botCore.js")],
  outfile: path.join(raiz, "api/_bot/core.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  logLevel: "warning",
  charset: "ascii",
  // Algún módulo del grafo trae JSX (iconos): runtime automático, para que no
  // dependa de un `React` global que en el servidor no existe.
  jsx: "automatic",
  // El cliente de Supabase no se empaqueta: en el servidor el catálogo no se
  // recarga (ver `define`), y su código trae un separador 0x1F literal que
  // fuentesLimpias.test.js caza con razón. Se resuelve desde node_modules.
  external: ["@supabase/*"],
  // El bot usa SIEMPRE el solver (instantáneo, sin IA): lo decide aquí y no
  // una variable de entorno del navegador.
  define: {
    "import.meta.env.VITE_MOTOR": '"solver"',
    "import.meta.env.DEV": "false",
    "import.meta.env.PROD": "true",
    // El catálogo no se recarga desde Supabase en el servidor: vale el empaquetado.
    "import.meta.env.VITE_SUPABASE_URL": '""',
    "import.meta.env.VITE_SUPABASE_ANON_KEY": '""',
  },
});

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
