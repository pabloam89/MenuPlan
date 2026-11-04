// La app no genera menús (#1210, Pablo, 4 nov 2026): eso es de Lola. En la app, `regenerateMenu` (el motor) solo
// queda detrás de «Reintentar» (retryGenerateMenu), que sale únicamente si una generación anterior falló. Si otro
// botón vuelve a llamarlo, este test lo dice.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CAPACIDADES } from "./capacidades.js";

const app = readFileSync(new URL("../App.jsx", import.meta.url), "utf8");

describe("la app no genera menús (#1210)", () => {
  it("solo «Reintentar» llama al motor", () => {
    const llamadas = app.split("\n").filter((l) => /\bregenerateMenu\(/.test(l) && !/^\s*(\/\/|\*)/.test(l) && !/const regenerateMenu =/.test(l));
    expect(llamadas.map((l) => l.trim())).toEqual(["return regenerateMenu(args.nextData);"]);
  });

  it("los botones que generaban se lo piden a Lola", () => {
    expect(app).toContain('const handleRegenerate = useCallback(() => abrirLola(pedidoMenu("esta")), []);');
  });

  it("en el mapa de capacidades, generar en la app está apagado, a propósito", () => {
    const generar = CAPACIDADES.find((c) => c.id === "generar_menu");
    expect(generar.app.apagada).toMatch(/solo se genera desde Lola/);
    expect(generar.aProposito).toMatch(/#1210/);
  });
});
