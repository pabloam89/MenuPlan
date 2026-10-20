import { describe, expect, it } from "vitest";
import { build } from "esbuild";
import path from "node:path";
import { DEFINE_BOT, RAIZ, opcionesBotCore } from "./botCoreConfig.mjs";

/**
 * El bot empaqueta con esbuild parte de `src/`. En Node `import.meta.env` no existe:
 * cada `import.meta.env.VITE_*` que entra en el bundle sin estar en `define` hace
 * reventar la carga de core.mjs («Cannot read properties of undefined»). Pasó con
 * VITE_API_BASE al llegar la app iOS (#887) y solo lo vio el build de Vercel/CI.
 * Aquí se empaqueta con la config real, en memoria, y no puede quedar ninguno.
 */
describe("bundle del bot (build-bot-core)", () => {
  it("no deja ningún import.meta.env sin definir", async () => {
    const { outputFiles } = await build({
      ...opcionesBotCore(path.join(RAIZ, "api/_bot/core.test-memoria.mjs")),
      write: false,
      logLevel: "silent",
    });
    const texto = outputFiles.map((f) => f.text).join("\n");
    const sueltos = [...new Set(texto.match(/import\.meta\.env[\w.]*/g) ?? [])];
    expect(sueltos, `añádelos a DEFINE_BOT (scripts/lib/botCoreConfig.mjs): ${sueltos.join(", ")}`).toEqual([]);
    expect(Object.keys(DEFINE_BOT).length).toBeGreaterThan(0);
  }, 60000);
});
