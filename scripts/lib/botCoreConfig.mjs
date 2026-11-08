// Configuración de esbuild del motor del bot (src/server/botCore.js → api/_bot/core.mjs).
// Vive aparte para que `scripts/build-bot-core.mjs` y su test usen la MISMA: el test
// empaqueta con ella y comprueba que no queda ningún `import.meta.env` sin definir
// (en Node `import.meta.env` no existe y el bundle revienta al cargarlo; #887).
import path from "node:path";

export const RAIZ = path.resolve(import.meta.dirname, "..", "..");

// El bot usa SIEMPRE el solver (instantáneo, sin IA): lo decide aquí y no
// una variable de entorno del navegador.
export const DEFINE_BOT = {
  "import.meta.env.VITE_MOTOR": '"solver"',
  "import.meta.env.DEV": "false",
  "import.meta.env.PROD": "true",
  // El catálogo no se recarga desde Supabase en el servidor: vale el empaquetado.
  "import.meta.env.VITE_SUPABASE_URL": '""',
  "import.meta.env.VITE_SUPABASE_ANON_KEY": '""',
  // La URL de la API solo cambia en la app nativa (src/lib/apiUrl.js); el bot no lo es.
  "import.meta.env.VITE_API_BASE": '""',
};

export function opcionesBotCore(outfile) {
  return {
    entryPoints: [path.join(RAIZ, "src/server/botCore.js")],
    outfile,
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
    define: DEFINE_BOT,
  };
}
