import { describe, expect, it } from "vitest";

import { avisoDeCopia, lineaDeHuerfanas, rutaCopiaDelHook } from "./copiaHook.mjs";

// #725: el arreglo de la limpieza vive en el repo, pero lo que se ejecuta es la
// copia de ~/.claude/hooks/. Sin este aviso, un arreglo fusionado no llega.
describe("copiaHook: la copia de usuario del hook de limpieza", () => {
  const repo = "export const a = 1;\nexport const b = 2;\n";

  it("con la copia distinta, avisa con una línea campo: valor", () => {
    const aviso = avisoDeCopia({ repo, copia: "export const a = 1;\n", ruta: "C:\\u\\.claude\\hooks\\limpiar-worktrees.mjs" });
    expect(aviso).toMatch(/^limpieza-copia: difiere/);
    expect(aviso).toContain("C:\\u\\.claude\\hooks\\limpiar-worktrees.mjs");
  });
  it("con la copia igual, no dice nada", () => expect(avisoDeCopia({ repo, copia: repo })).toBeNull());
  it("los saltos de línea de Windows y el espacio final no cuentan", () =>
    expect(avisoDeCopia({ repo, copia: repo.replace(/\n/g, "\r\n") + "\r\n\r\n" })).toBeNull());
  it("sin copia en el perfil, lo dice", () => expect(avisoDeCopia({ repo, copia: null })).toMatch(/^limpieza-copia: falta/));
  it("sin la del repo no se acusa a nadie", () => expect(avisoDeCopia({ repo: null, copia: "x" })).toBeNull());

  it("cuenta las huérfanas solo cuando las hay", () => {
    expect(lineaDeHuerfanas(0)).toBeNull();
    expect(lineaDeHuerfanas(4)).toMatch(/^huerfanas: 4 /);
  });
  it("la copia vive en el perfil de usuario", () =>
    expect(rutaCopiaDelHook("C:\\Users\\pablo")).toMatch(/pablo.*\.claude.*hooks.*limpiar-worktrees\.mjs$/));
});
