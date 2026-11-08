import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";

/**
 * Las funciones de Lola cargan en Node puro, como en Vercel. Vitest entiende .jsx y por eso
 * ningún otro test vio que, desde #1143, api/bot/telegram.js arrastraba src/components/icons.jsx
 * (libretaEnData → panelParser → alergias.js) y contestaba 500 en staging (#1146).
 * Aquí se carga en un proceso de Node aparte, sin el cargador de vitest.
 */
const FUNCIONES_DE_LOLA = ["./api/bot/telegram.js", "./api/bot/canario.js"];

describe("las funciones de Lola cargan en Node sin .jsx", () => {
  for (const ruta of FUNCIONES_DE_LOLA) {
    it(ruta, () => {
      const codigo = `import(${JSON.stringify(ruta)}).catch((e) => { console.error(e.message); process.exit(1); })`;
      let error = "";
      try {
        execFileSync(process.execPath, ["--input-type=module", "-e", codigo], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
      } catch (e) {
        error = String(e.stderr || e.message);
      }
      expect(error).toBe("");
    }, 60_000);
  }
});
