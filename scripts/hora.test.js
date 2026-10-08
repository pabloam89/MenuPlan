import { describe, it, expect } from "vitest";
import { ahoraEnMadrid, desfaseMadrid, horaMadrid } from "./lib/hora.mjs";

describe("la hora de Madrid", () => {
  it("en verano va dos horas por delante de UTC (lo que Git Bash daba mal, #210)", () => {
    const t = new Date("2026-10-08T17:19:00Z");
    expect(horaMadrid(t)).toBe("19:19");
    expect(desfaseMadrid(t)).toBe("UTC+2");
  });

  it("en invierno, una", () => {
    const t = new Date("2026-12-01T17:19:00Z");
    expect(horaMadrid(t)).toBe("18:19");
    expect(desfaseMadrid(t)).toBe("UTC+1");
  });

  it("la regla está escrita donde la lee cada sesión, junto con «Pensar en datos»", async () => {
    const { readFileSync } = await import("node:fs");
    const leer = (f) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
    expect(leer("CLAUDE.md")).toMatch(/npm run hora/);
    expect(leer("CLAUDE.md")).toMatch(/## Pensar en datos/);
    expect(leer(".claude/PLANTILLA-AGENTE.md")).toMatch(/Piensa en datos/);
    expect(leer(".claude/hooks/arranque.mjs")).toMatch(/ahoraEnMadrid\(\)/);
  });

  it("con el día, para el arranque", () => {
    expect(ahoraEnMadrid(new Date("2026-10-08T17:19:00Z"))).toMatch(/^jueves 8 oct, 19:19 en Madrid \(UTC\+2\)$/);
  });
});
