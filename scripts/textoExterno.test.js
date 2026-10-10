import { describe, expect, it } from "vitest";

import { limpiarTexto } from "./lib/textoExterno.mjs";

describe("limpiarTexto: invisibles que no son Cf", () => {
  const invisibles = {
    "selector de variación": "️",
    "selector de variación suplementario": "\u{E0100}",
    "relleno de jamo": "ᅟ",
    "vocal de relleno de jamo": "ᅠ",
    "relleno hangul": "ㅤ",
    "relleno hangul de media anchura": "ﾠ",
    "braille en blanco": "⠀",
  };
  for (const [nombre, c] of Object.entries(invisibles)) {
    it(`quita ${nombre}`, () => {
      expect(limpiarTexto(`a${c}b`)).toBe("ab");
      expect(limpiarTexto(c)).toBe("");
    });
  }

  it("corta por puntos de código y no deja un medio carácter", () => {
    const s = "😀".repeat(100);
    const r = limpiarTexto(s, 10);
    expect([...r]).toHaveLength(10);
    expect(r.endsWith("…")).toBe(true);
    expect(r).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
  });

  it("no corta lo que cabe", () => {
    expect(limpiarTexto("😀😀", 2)).toBe("😀😀");
  });
});
