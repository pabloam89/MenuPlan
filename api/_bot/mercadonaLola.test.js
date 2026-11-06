import { beforeEach, describe, expect, it, vi } from "vitest";

const prueba = vi.hoisted(() => ({ items: [], encargo: {} }));
vi.mock("./menu.js", async () => {
  const { fijarCatalogo } = await import("../../src/lib/storeCatalog.js");
  const { priceShoppingList } = await import("../../src/lib/listPricing.js");
  return { lineasPorComprar: vi.fn(async () => prueba.items), motor: async () => ({ fijarCatalogo, priceShoppingList }) };
});
vi.mock("./mercadonaEncargos.js", () => ({ encargar: vi.fn(async () => prueba.encargo) }));

const { TEXTO_SIN_ENCARGO, pasarAMercadona } = await import("./mercadonaLola.js");
const { encargar } = await import("./mercadonaEncargos.js");
const { resetStoreCatalogCache } = await import("../../src/lib/storeCatalog.js");
const { NO_ENCARGADO } = await import("../../src/lib/vocabularios.js");

const CATALOGO = {
  store: "Mercadona",
  products: [{ id: "10379", name: "Leche entera Hacendado", price: "5.76", unitSize: 6, unitFormat: "l", bulkPrice: "0.96", section: "Huevos, leche y mantequilla", category: "Leche y bebidas vegetales" }],
};
const leerCatalogo = async () => CATALOGO;
const QUIEN = { householdId: "h", userId: "u", chatId: "7", canal: "telegram" };

beforeEach(() => {
  vi.clearAllMocks();
  resetStoreCatalogCache();
  prueba.items = [{ id: "a", name: "Leche entera", qty: 1, unit: "L" }, { id: "b", name: "Unicornio", qty: 1, unit: "ud" }];
  prueba.encargo = { encargo: { id: "e", status: "pendiente" } };
});

describe("pasarAMercadona", () => {
  it("sin persona no encarga", async () => {
    expect(await pasarAMercadona({ ...QUIEN, userId: null }, { leerCatalogo })).toContain("de quién es la cuenta");
    expect(encargar).not.toHaveBeenCalled();
  });

  it("sin nada por comprar, o sin casa, lo dice", async () => {
    prueba.items = [];
    expect(await pasarAMercadona(QUIEN, { leerCatalogo })).toContain("nada por comprar");
    prueba.items = null;
    expect(await pasarAMercadona(QUIEN, { leerCatalogo })).toContain("No encuentro la casa");
    expect(encargar).not.toHaveBeenCalled();
  });

  it("encarga lo que tiene producto, dice lo que queda fuera y que paga la persona", async () => {
    const texto = await pasarAMercadona(QUIEN, { leerCatalogo });
    expect(encargar).toHaveBeenCalledWith({
      casa: "h", por: "u", canal: "telegram", chat_id: "7",
      lista: { name: "Compra HoMenu", products: [{ merca_code: "10379", quantity: 1 }] },
    });
    expect(texto).toContain("con 1 producto.");
    expect(texto).toContain("Unicornio");
    expect(texto).toContain("Pagar y pedir lo haces tú");
  });

  it("sin ningún producto no encarga", async () => {
    prueba.items = [{ id: "b", name: "Unicornio", qty: 1, unit: "ud" }];
    expect(await pasarAMercadona(QUIEN, { leerCatalogo })).toContain("ningún producto");
    expect(encargar).not.toHaveBeenCalled();
  });

  it.each(Object.values(NO_ENCARGADO))("explica el fallo %s", async (fallo) => {
    prueba.encargo = { fallo };
    expect(await pasarAMercadona(QUIEN, { leerCatalogo })).toBe(TEXTO_SIN_ENCARGO[fallo]);
  });
});
