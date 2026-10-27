/**
 * El tope de Lola por casa y mes (api/_bot/uso.js): cuánto es, cuándo avisa y
 * qué contesta al llegar. La base, de mentira.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const t = vi.hoisted(() => ({ filas: [] }));
vi.mock("./db.js", () => ({ select: vi.fn(async () => t.filas), rpc: vi.fn(), eq: (x) => x }));

const { LIMITE_POR_DEFECTO, limiteMensual, diaDeReinicio, textoDeTope, fueraDeLimite, avisoDeLimite } = await import("./uso.js");

beforeEach(() => {
  delete process.env.BOT_LIMITE_MENSUAL;
  delete process.env.BOT_SIN_LIMITE;
  t.filas = [];
});
afterEach(() => {
  delete process.env.BOT_LIMITE_MENSUAL;
  delete process.env.BOT_SIN_LIMITE;
});

describe("límite mensual", () => {
  it("50 por defecto; la variable de Vercel lo cambia", () => {
    expect(LIMITE_POR_DEFECTO).toBe(50);
    expect(limiteMensual()).toBe(50);
    process.env.BOT_LIMITE_MENSUAL = "5";
    expect(limiteMensual()).toBe(5);
  });

  it("una variable que no es un número no deja sin tope", () => {
    process.env.BOT_LIMITE_MENSUAL = "muchos";
    expect(limiteMensual()).toBe(50);
  });
});

describe("día de reinicio", () => {
  it("el 1 del mes siguiente, y en diciembre pasa a enero", () => {
    expect(diaDeReinicio("2026-10-27")).toBe("1 de noviembre");
    expect(diaDeReinicio("2026-11-30")).toBe("1 de diciembre");
    expect(diaDeReinicio("2026-12-15")).toBe("1 de enero");
  });
});

describe("al llegar al tope", () => {
  it("dice cuántos, cuándo vuelve y que la app sigue, sin «versión gratis»", () => {
    const texto = textoDeTope(50, "2026-11-20");
    expect(texto).toContain("50 veces");
    expect(texto).toContain("<b>1 de diciembre</b>");
    expect(texto).toContain("/app");
    expect(texto).not.toMatch(/versión gratis/);
  });

  it("corta justo en el tope, no antes", async () => {
    t.filas = [{ messages: 49 }];
    expect(await fueraDeLimite("casa")).toBeNull();
    t.filas = [{ messages: 50 }];
    expect(await fueraDeLimite("casa")).toContain("50 veces");
  });

  it("una casa del piloto no tiene tope", async () => {
    process.env.BOT_SIN_LIMITE = "otra, casa";
    t.filas = [{ messages: 500 }];
    expect(await fueraDeLimite("casa")).toBeNull();
  });

  it("sin fila este mes, sigue", async () => {
    expect(await fueraDeLimite("casa")).toBeNull();
  });
});

describe("aviso antes del tope", () => {
  it("sale una sola vez, en el 80 %, con los que quedan", () => {
    expect(avisoDeLimite("casa", 39, "2026-11-20")).toBe("");
    expect(avisoDeLimite("casa", 40, "2026-11-20")).toBe("\n\n<i>Te quedan 10 mensajes conmigo este mes. El 1 de diciembre se reinicia.</i>");
    expect(avisoDeLimite("casa", 41, "2026-11-20")).toBe("");
  });

  it("con otro tope, en su 80 %", () => {
    process.env.BOT_LIMITE_MENSUAL = "5";
    expect(avisoDeLimite("casa", 4, "2026-11-20")).toContain("Te queda 1 mensaje conmigo");
  });

  it("a una casa del piloto no se le avisa", () => {
    process.env.BOT_SIN_LIMITE = "casa";
    expect(avisoDeLimite("casa", 40)).toBe("");
  });
});
