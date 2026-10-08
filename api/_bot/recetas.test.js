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
// El modelo contesta sin JSON: la receta se queda en el borrador, que es lo
// único que hace falta para ver qué aparato le llegó.
vi.mock("@anthropic-ai/sdk", () => ({
  default: class { messages = { create: async () => ({ content: [{ type: "text", text: "sin receta" }] }) }; },
}));

const { filtrarRecetas, carpetaDe } = await import("./recetas.js");
// Arriba y no dentro del test: cargar el motor entero tarda más que el tope de un it.
const core = await import("../../src/server/botCore.js");

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

describe("guardar_receta no dice «guardada» sin guardar", () => {
  it("una casa sin dueño: ni llega al recetario, y se dice tal cual", async () => {
    const { select, insert } = await import("./db.js");
    const { duenoDe } = await import("./embudo.js");
    const { guardarReceta } = await import("./recetas.js");
    select.mockResolvedValueOnce([{ content: { receta: { id: "user_x", name: "Tortilla de la abuela" } } }]);
    duenoDe.mockResolvedValueOnce(null);
    const texto = await guardarReceta("h1", { confirmado: true }, { channel: "telegram", chatId: "1" });
    expect(texto).toMatch(/^NO GUARDADA/);
    expect(texto).not.toMatch(/Guardada en el recetario/);
    expect(insert).not.toHaveBeenCalled();
  });
});

describe("crear_receta guarda el aparato que dicen", () => {
  // Con el motor de verdad (botCore), no con un doble: el fallo era que
  // KITCHEN_TOOLS son objetos {id, img} y se comparaba un nombre contra ellos,
  // así que ninguna receta creada por el bot llevaba required_appliances.
  it("«al horno» llega al borrador como requiredAppliances", async () => {
    const { motor } = await import("./menu.js");
    const { duenoDe } = await import("./embudo.js");
    const { prepararReceta } = await import("./recetas.js");
    const payloadDeBorrador = vi.fn(core.payloadDeBorrador);
    motor.mockResolvedValueOnce({ ...core, payloadDeBorrador });
    duenoDe.mockResolvedValueOnce("u1");
    await prepararReceta("h1", {
      nombre: "Pollo asado", electrodomestico: "Horno",
      ingredientes: [{ nombre: "pollo", cantidad: 1, unidad: "ud" }],
    }, { channel: "telegram", chatId: "1" });
    expect(payloadDeBorrador).toHaveBeenCalledTimes(1);
    expect(payloadDeBorrador.mock.calls[0][0].requiredAppliances).toEqual(["Horno"]);
  });
});
