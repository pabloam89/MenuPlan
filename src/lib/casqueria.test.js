import { describe, expect, it } from "vitest";
import { esCasqueria } from "./casqueria.js";
import { recipeCatalog } from "../data/recipeCatalog.js";

const receta = (extra) => ({ name: "Plato", ingredients: [], ...extra });
const ing = (...nombres) => nombres.map((name) => ({ name }));

describe("qué es casquería", () => {
  it("la reconoce por el nombre", () => {
    expect(esCasqueria(receta({ name: "Hígado encebollado" }))).toBe(true);
    expect(esCasqueria(receta({ name: "Callos a la madrileña" }))).toBe(true);
    expect(esCasqueria(receta({ name: "Rabo de toro al vino de Jerez" }))).toBe(true);
  });

  it("y por el ingrediente, aunque el nombre no la nombre", () => {
    // Los judiones de la Granja llevan oreja de cerdo y no lo dicen en el
    // título: es justo el caso que una lista escrita a mano se deja.
    expect(esCasqueria(receta({ name: "Judiones de la Granja", ingredients: ing("Judiones", "Chorizo", "Oreja de cerdo") }))).toBe(true);
    expect(esCasqueria(receta({ name: "Guiso de la abuela", ingredients: ing("Patata", "Mollejas de cordero") }))).toBe(true);
  });

  it("no confunde un corte de carne con una víscera", () => {
    // "Entraña" es falda, músculo. La cazaba el parecido con "entrañas".
    expect(esCasqueria(receta({ name: "Entraña a la brasa con chimichurri" }))).toBe(false);
  });

  it("ni una palabra que contenga otra por dentro", () => {
    // "morro" dentro de "pimiento morrón", "lengua" dentro de "lenguado".
    expect(esCasqueria(receta({ name: "Lenguado a la meunière" }))).toBe(false);
    expect(esCasqueria(receta({ name: "Pimientos morrones asados" }))).toBe(false);
  });

  it("lo declarado en la ficha manda sobre lo derivado", () => {
    expect(esCasqueria(receta({ name: "Hígado encebollado", casqueria: false }))).toBe(false);
    expect(esCasqueria(receta({ name: "Guiso raro", casqueria: true }))).toBe(true);
  });

  it("no revienta con una receta a medias", () => {
    expect(esCasqueria(null)).toBe(false);
    expect(esCasqueria({})).toBe(false);
    expect(esCasqueria({ name: "Sin ingredientes" })).toBe(false);
  });
});

describe("contra el catálogo real", () => {
  const casqueria = recipeCatalog.filter(esCasqueria);

  it("encuentra los platos de casquería que hay, y no cientos", () => {
    // Si este número se dispara, la derivación ha empezado a coger falsos
    // positivos; si se va a cero, ha dejado de ver los de verdad.
    expect(casqueria.length).toBeGreaterThan(3);
    expect(casqueria.length).toBeLessThan(25);
  });

  it("incluye los clásicos y deja fuera el resto del catálogo", () => {
    const nombres = casqueria.map((r) => r.name);
    expect(nombres).toContain("Callos a la madrileña");
    expect(nombres).toContain("Manitas de cerdo guisadas");
    expect(nombres.some((n) => /entraña/i.test(n))).toBe(false);
  });
});
