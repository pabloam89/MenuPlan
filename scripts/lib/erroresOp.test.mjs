import { describe, it, expect } from "vitest";
import { esCupo, esSinAcceso, NO_EXISTE_FICHA } from "./erroresOp.mjs";

// Textos de op 2.40 vistos en este repo (skill 1password, rolLectura.mjs, tokenSesion.test.js, env.test.js).
const CUPO = "[ERROR] 2026/10/11 08:36:59 Too many requests. Your client has been rate-limited. Try again in  seconds";
const SIN_FICHA = '"GitHub App homenu-sesiones" isn\'t an item in the "HoMenu-sesiones" vault.';
const SIN_BOVEDA = '"Panel HoMenu" isn\'t a vault in this account';
const SIN_RESOLVER = "[ERROR] could not resolve item UUID for item Admin";
const RED = "[ERROR] dial tcp: connection refused";

describe("lo que dice op al fallar, reconocido en un solo sitio", () => {
  it("sin cupo es sin cupo, y no falta de acceso", () => {
    expect(esCupo({ stderr: CUPO })).toBe(true);
    expect(esSinAcceso({ stderr: CUPO })).toBe(false);
  });

  it("ficha, bóveda o dirección que no se ve es falta de acceso", () => {
    for (const t of [SIN_FICHA, SIN_BOVEDA, SIN_RESOLVER]) expect(esSinAcceso(new Error(t)), t).toBe(true);
  });

  it("un fallo de red no es ni cupo ni falta de acceso", () => {
    expect(esCupo({ stderr: RED })).toBe(false);
    expect(esSinAcceso({ stderr: RED })).toBe(false);
  });

  it("«la ficha no existe» es solo el texto exacto de la ficha (no una bóveda que no se ve): crearla no la duplica", () => {
    expect(NO_EXISTE_FICHA.test(SIN_FICHA)).toBe(true);
    expect(NO_EXISTE_FICHA.test(SIN_BOVEDA)).toBe(false);
  });
});
