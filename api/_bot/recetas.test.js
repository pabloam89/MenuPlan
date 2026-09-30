import { describe, it, expect, vi } from "vitest";

// Solo las piezas puras: el resto del módulo toca la base de datos.
vi.mock("./db.js", () => ({ select: vi.fn(), insert: vi.fn(), eq: (v) => `eq.${v}`, config: vi.fn() }));
vi.mock("./casa.js", () => ({ cargarCasa: vi.fn(), conCasa: vi.fn() }));
vi.mock("./embudo.js", () => ({ duenoDe: vi.fn() }));
vi.mock("./menu.js", () => ({
  motor: vi.fn(),
  prepararRecetas: vi.fn(),
  normal: (s) => String(s ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim(),
}));

const { filtrarRecetas, carpetaDe } = await import("./recetas.js");

const RECETAS = [
  { id: "b1", name: "Palitos de boniato", category: "bebes", etapaBebe: "solidos", time: 30 },
  { id: "b2", name: "Crema de calabacín", category: "bebes", time: 20 },
  { id: "l1", name: "Garbanzos con espinacas", category: "legumbres", time: 25, ingredients: [{ name: "garbanzos cocidos" }] },
  { id: "e1", name: "Ensalada de repollo", category: "ensaladas_verduras", time: 10 },
  { id: "c1", name: "Pollo al horno", category: "carnes", time: 60, ingredients: [{ name: "pollo" }] },
  { id: "u1", name: "Tortilla de la abuela", category: "huevos", source: "user", time: 30 },
];

describe("carpetaDe", () => {
  it("parte a los bebés por etapa, y sin etapa es crema", () => {
    expect(carpetaDe(RECETAS[0])).toBe("bebes_solidos");
    expect(carpetaDe(RECETAS[1])).toBe("bebes_cremas");
    expect(carpetaDe(RECETAS[2])).toBe("legumbres");
  });
});

describe("filtrarRecetas", () => {
  it("una carpeta de bebé trae solo esa etapa", () => {
    expect(filtrarRecetas(RECETAS, { categoria: "bebes_solidos" }).map((r) => r.id)).toEqual(["b1"]);
  });

  it("las palabras de relleno no cuentan: «recetas de algo con garbanzos»", () => {
    expect(filtrarRecetas(RECETAS, { consulta: "recetas de algo con garbanzos" }).map((r) => r.id)).toEqual(["l1"]);
  });

  it("con frontera de palabra: «pollo» no trae la ensalada de repollo", () => {
    expect(filtrarRecetas(RECETAS, { consulta: "pollo" }).map((r) => r.id)).toEqual(["c1"]);
  });

  it("mejor lo que lo dice en el nombre que en los ingredientes", () => {
    const recetas = [
      { id: "a", name: "Arroz tres delicias", ingredients: [{ name: "guisantes" }] },
      { id: "b", name: "Guisantes con jamón" },
    ];
    expect(filtrarRecetas(recetas, { consulta: "guisantes" }).map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("«mias» son las propias de la casa, y el tope de tiempo se respeta", () => {
    expect(filtrarRecetas(RECETAS, { categoria: "mias" }).map((r) => r.id)).toEqual(["u1"]);
    expect(filtrarRecetas(RECETAS, { maxMinutos: 15 }).map((r) => r.id)).toEqual(["e1"]);
  });
});
