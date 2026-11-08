import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { PRECIOS as BASE } from "./lib/evals.mjs";
import { PRECIOS } from "./lib/bot-semana.mjs";

// Los precios de Anthropic viven en UN sitio (scripts/lib/evals.mjs, #909).
describe("precios de modelos: una sola tabla", () => {
  it("bot-semana reordena la misma tabla: escribir a 1 h = 2x la entrada", () => {
    for (const [k, [i, o, cr, cw, cw1h]] of Object.entries(BASE)) {
      expect(PRECIOS[k]).toEqual({ in: i, out: o, cr, cw, cw1h });
      expect(cw1h).toBeCloseTo(2 * i, 10);
    }
  });
  it("ningún otro script de scripts/ lleva su propia tarifa de caché", () => {
    const sueltos = readdirSync(new URL(".", import.meta.url))
      .filter((f) => /\.mjs$/.test(f))
      .filter((f) => /\b(3\.75|6\.25)\b|cacheWrite:\s*[\d.]+/.test(readFileSync(new URL(f, import.meta.url), "utf8")));
    expect(sueltos).toEqual([]);
  });
  it("bot-coste lee de PRECIOS", () => {
    expect(readFileSync(new URL("bot-coste.mjs", import.meta.url), "utf8")).toMatch(/PRECIOS[^;]*evals\.mjs/);
  });
});
