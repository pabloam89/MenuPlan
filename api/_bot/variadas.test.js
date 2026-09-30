import { describe, it, expect, vi } from "vitest";

vi.mock("./db.js", () => ({ select: vi.fn(), insert: vi.fn(), eq: (v) => `eq.${v}` }));
vi.mock("./casa.js", () => ({ cargarCasa: vi.fn(), conCasa: vi.fn() }));

const { variadas } = await import("./menu.js");

const r = (id, mainProtein, category) => ({ id, mainProtein, category });

describe("variadas", () => {
  it("no da tres veces la misma idea: salta lo que repite proteína o categoría", () => {
    const lista = [
      r("g1", "legumbre", "legumbres"), r("g2", "legumbre", "legumbres"), r("g3", "legumbre", "ensaladas_verduras"),
      r("p1", "pollo", "carnes"), r("a1", "pescado_azul", "platos_unicos"),
    ];
    expect(variadas(lista, 3).map((x) => x.id)).toEqual(["g1", "p1", "a1"]);
  });

  it("si no hay tanta variedad, completa sin repetir la misma combinación antes que repetir", () => {
    const lista = [r("b1", "pavo", "bebes"), r("b2", "pavo", "bebes"), r("b3", "merluza", "bebes"), r("b4", "ternera", "bebes")];
    expect(variadas(lista, 3).map((x) => x.id)).toEqual(["b1", "b3", "b4"]);
  });

  it("con pocas, devuelve las que hay en su orden", () => {
    const lista = [r("x", "pollo", "carnes"), r("y", "pollo", "carnes")];
    expect(variadas(lista, 3).map((x) => x.id)).toEqual(["x", "y"]);
  });
});
