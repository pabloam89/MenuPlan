import { describe, expect, it } from "vitest";

import { clasificar, huerfanas, leerRemotas, localesABorrar } from "./podar.mjs";

const AHORA = Date.UTC(2026, 9, 8);
const DIA = 24 * 60 * 60 * 1000;
const vieja = AHORA - 30 * DIA;
const rama = (nombre, extra = {}) => ({ rama: nombre, fusionada: true, prAbierto: false, enWorktree: false, fecha: vieja, ...extra });
const donde = (r, nombre) => Object.entries(r).find(([, xs]) => xs.some((x) => x.rama === nombre))?.[0];

describe("podar: qué rama se borra", () => {
  const r = clasificar(
    [
      rama("main"),
      rama("staging"),
      rama("datos/vieja"),
      rama("fix/juez-altos", { fusionada: false }),
      rama("ux/en-pr", { prAbierto: true }),
      rama("bot/reciente", { fecha: AHORA - 2 * DIA }),
      rama("ops/sacada", { enWorktree: true }),
    ],
    { ahora: AHORA, dias: 7 },
  );

  it("main y staging nunca", () => {
    expect(donde(r, "main")).toBe("protegidas");
    expect(donde(r, "staging")).toBe("protegidas");
  });
  it("la fusionada, vieja, sin PR ni worktree, sí", () => expect(r.borrar.map((x) => x.rama)).toEqual(["datos/vieja"]));
  it("la que no está en staging sale en «sin fusionar», aunque sea vieja", () => expect(donde(r, "fix/juez-altos")).toBe("sinFusionar"));
  it("con PR abierto, no", () => expect(donde(r, "ux/en-pr")).toBe("conPr"));
  it("reciente, no", () => expect(donde(r, "bot/reciente")).toBe("recientes"));
  it("sacada en un worktree, no", () => expect(donde(r, "ops/sacada")).toBe("enWorktree"));
  it("sin fecha conocida cuenta como reciente, no se borra", () =>
    expect(donde(clasificar([rama("x/sin-fecha", { fecha: Number.NaN })], { ahora: AHORA }), "x/sin-fecha")).toBe("recientes"));
});

describe("podar: ramas locales", () => {
  it("solo las fusionadas, sin worktree y no protegidas", () =>
    expect(
      localesABorrar([
        { rama: "staging", fusionada: true, enWorktree: false },
        { rama: "datos/hecha", fusionada: true, enWorktree: false },
        { rama: "datos/a-medias", fusionada: false, enWorktree: false },
        { rama: "ops/sacada", fusionada: true, enWorktree: true },
      ]),
    ).toEqual(["datos/hecha"]));
});

describe("podar: lectura de ls-remote", () => {
  it("saca rama y sha", () =>
    expect(leerRemotas("abc1234def\trefs/heads/staging\n0123456789\trefs/heads/datos/x\n")).toEqual([
      { rama: "staging", sha: "abc1234def" },
      { rama: "datos/x", sha: "0123456789" },
    ]));
});

describe("podar: las huérfanas (#206)", () => {
  const sin = (nombre, extra = {}) => rama(nombre, { fusionada: false, ...extra });
  const lista = [
    sin("rescate/emparejador"),
    sin("bot/mercadona-lista"),
    sin("ops/193-dependabot"),
    sin("dependabot/npm_and_yarn/x"),
    sin("feat/nueva", { fecha: AHORA - DIA }),
  ];
  it("sin PR, sin issue en el nombre, no de Dependabot y de más de 3 días", () =>
    expect(huerfanas(lista, { conPr: new Set(["bot/mercadona-lista"]), ahora: AHORA }).map((x) => x.rama)).toEqual(["rescate/emparejador"]));
});
