import { describe, expect, it } from "vitest";

import { terminada } from "./limpiar-worktrees.mjs";

const base = { rama: "ops/x", subida: true, contenida: false, remotaBorrada: false, sinSubir: "" };

describe("limpiar-worktrees: qué rama está terminada", () => {
  // El 8 oct 2026 borraba la carpeta recién creada de cualquier sesión: una
  // rama nueva desde staging, sin commits, también está «contenida en staging».
  it("una rama nueva, nunca subida, no se borra aunque esté contenida en staging", () =>
    expect(terminada({ ...base, subida: false, contenida: true })).toBe(false));
  it("subida y fusionada en staging, sí", () => expect(terminada({ ...base, contenida: true })).toBe(true));
  it("subida, con la remota borrada tras el merge y nada sin subir, sí", () =>
    expect(terminada({ ...base, remotaBorrada: true })).toBe(true));
  it("con la remota borrada pero commits sin subir, no", () =>
    expect(terminada({ ...base, remotaBorrada: true, sinSubir: "abc123 wip" })).toBe(false));
  it("subida pero ni fusionada ni con la remota borrada, no", () => expect(terminada(base)).toBe(false));
  it("desconectada (sin rama), no", () => expect(terminada({ ...base, rama: null, contenida: true })).toBe(false));
});
