import { describe, it, expect } from "vitest";
import { idiomaDe, pistaDe } from "./voz.js";

describe("voz", () => {
  it("el idioma de Telegram se pasa a Whisper en dos letras, y español si no hay", () => {
    expect(idiomaDe("es")).toBe("es");
    expect(idiomaDe("es-ES")).toBe("es");
    expect(idiomaDe("PT-br")).toBe("pt");
    expect(idiomaDe(undefined)).toBe("es");
    expect(idiomaDe("")).toBe("es");
  });

  it("la pista lleva primero los nombres de la casa y luego la cocina", () => {
    const p = pistaDe(["Cova", "Manuel"]);
    expect(p.startsWith("Cova, Manuel, ")).toBe(true);
    expect(p).toContain("airfryer");
    // Whisper solo mira ~224 tokens: la pista tiene que ser corta.
    expect(p.length).toBeLessThan(600);
  });
});
