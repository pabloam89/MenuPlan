import { describe, it, expect } from "vitest";
import { puedeBorrar } from "./borrar.js";

// Staging y producción comparten base de datos: esto borra datos reales, así
// que las dos llaves (entorno y quién) tienen que hacer falta las dos.
describe("puedeBorrar", () => {
  const PABLO = 491628449;
  it("en staging, solo el administrador", () => {
    expect(puedeBorrar(PABLO, { VERCEL_TARGET_ENV: "staging" })).toBe(true);
    expect(puedeBorrar(123, { VERCEL_TARGET_ENV: "staging" })).toBe(false);
    expect(puedeBorrar(null, { VERCEL_TARGET_ENV: "staging" })).toBe(false);
  });
  it("fuera de staging, nadie, ni el administrador", () => {
    expect(puedeBorrar(PABLO, { VERCEL_TARGET_ENV: "production" })).toBe(false);
    expect(puedeBorrar(PABLO, { VERCEL_GIT_COMMIT_REF: "main" })).toBe(false);
    expect(puedeBorrar(PABLO, {})).toBe(false);
  });
  it("la rama staging también vale, y se puede encender a mano", () => {
    expect(puedeBorrar(PABLO, { VERCEL_GIT_COMMIT_REF: "staging" })).toBe(true);
    expect(puedeBorrar(PABLO, { BOT_BORRAR_CUENTA: "on" })).toBe(true);
  });
});
