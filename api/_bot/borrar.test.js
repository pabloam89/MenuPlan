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
  it("por el dominio de staging, aunque no lleguen las variables de entorno", () => {
    expect(puedeBorrar(PABLO, {}, "homenu-staging.vercel.app")).toBe(true);
    expect(puedeBorrar(123, {}, "homenu-staging.vercel.app")).toBe(false);
    expect(puedeBorrar(PABLO, {}, "homenu.vercel.app")).toBe(false);
    expect(puedeBorrar(PABLO, {}, "homenu.app")).toBe(false);
    // Que «staging» vaya como palabra, no dentro de otra.
    expect(puedeBorrar(PABLO, {}, "nostagingx.app")).toBe(false);
  });
  it("la rama staging también vale, y se puede encender a mano", () => {
    expect(puedeBorrar(PABLO, { VERCEL_GIT_COMMIT_REF: "staging" })).toBe(true);
    expect(puedeBorrar(PABLO, { BOT_BORRAR_CUENTA: "on" })).toBe(true);
  });
});

describe("tandasHaciaAtras", () => {
  it("de lo más nuevo hacia atrás, en tandas de 100, sin pasar del 1", async () => {
    const { tandasHaciaAtras } = await import("./borrar.js");
    const t = tandasHaciaAtras(250);
    expect(t.map((x) => x.length)).toEqual([100, 100, 50]);
    expect(t[0][0]).toBe(250);
    expect(t.at(-1).at(-1)).toBe(1);
    expect(new Set(t.flat()).size).toBe(250);
  });
  it("como mucho los que se piden hacia atrás", async () => {
    const { tandasHaciaAtras } = await import("./borrar.js");
    const t = tandasHaciaAtras(5000, 3000);
    expect(t.flat().length).toBe(3000);
    expect(Math.min(...t.flat())).toBe(2001);
  });
});
