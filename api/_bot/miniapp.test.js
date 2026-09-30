import { describe, it, expect, vi } from "vitest";
import crypto from "node:crypto";

// validarInitData es pura; el resto del módulo toca la base de datos.
vi.mock("./db.js", () => ({ select: vi.fn(), eq: (v) => `eq.${v}` }));
vi.mock("./casa.js", () => ({ cargarCasa: vi.fn(), conCasa: vi.fn() }));
vi.mock("./menu.js", () => ({
  prepararRecetas: vi.fn(),
  grupos: vi.fn(),
  DIAS: ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"],
  FRANJAS: ["Desayuno", "Comida", "Merienda", "Cena", "Postre"],
}));

const { validarInitData, semanaYCompra, marcarPorId, porPasillo } = await import("./miniapp.js");
const casaMod = await import("./casa.js");
const menuMod = await import("./menu.js");

const TOKEN = "123456:prueba";

// Firma como lo hace Telegram, para fabricar initData válidos.
function firmar(campos, token = TOKEN) {
  const datos = Object.entries(campos).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join("\n");
  const secreto = crypto.createHmac("sha256", "WebAppData").update(token).digest();
  const hash = crypto.createHmac("sha256", secreto).update(datos).digest("hex");
  return new URLSearchParams({ ...campos, hash }).toString();
}

const ahora = Date.parse("2026-09-30T12:00:00Z");
const campos = { auth_date: String(ahora / 1000 - 60), query_id: "AAE", user: JSON.stringify({ id: 42, first_name: "Ana" }) };

describe("validarInitData", () => {
  it("acepta lo firmado por el bot y devuelve el usuario", () => {
    expect(validarInitData(firmar(campos), TOKEN, ahora)).toMatchObject({ id: 42, first_name: "Ana" });
  });

  it("rechaza si se toca un campo (otro usuario)", () => {
    const bueno = new URLSearchParams(firmar(campos));
    bueno.set("user", JSON.stringify({ id: 43, first_name: "Ana" }));
    expect(validarInitData(bueno.toString(), TOKEN, ahora)).toBe(null);
  });

  it("rechaza lo firmado con otro token", () => {
    expect(validarInitData(firmar(campos, "999:otro"), TOKEN, ahora)).toBe(null);
  });

  it("rechaza una apertura de hace más de un día", () => {
    const viejo = { ...campos, auth_date: String(ahora / 1000 - 2 * 86400) };
    expect(validarInitData(firmar(viejo), TOKEN, ahora)).toBe(null);
  });

  it("rechaza un hash con otra longitud sin romper", () => {
    const corto = new URLSearchParams(firmar(campos));
    corto.set("hash", "abcd");
    expect(validarInitData(corto.toString(), TOKEN, ahora)).toBe(null);
  });

  it("rechaza sin hash, vacío o sin token", () => {
    expect(validarInitData(new URLSearchParams(campos).toString(), TOKEN, ahora)).toBe(null);
    expect(validarInitData("", TOKEN, ahora)).toBe(null);
    expect(validarInitData(firmar(campos), "", ahora)).toBe(null);
  });
});

describe("semanaYCompra", () => {
  const RECETAS = {
    ensalada_1: { name: "Ensalada verde", time: 10 },
    pollo_1: { name: "Pollo al horno", time: 45 },
    tortilla_1: { name: "Tortilla", time: 20 },
    pure_1: { name: "Puré de verduras", time: 25 },
  };
  menuMod.prepararRecetas.mockResolvedValue({ RECIPES_BY_ID: RECETAS });

  it("días activos, grupos que comen igual juntos, ids sin prefijo y compra sin lo de casa", async () => {
    menuMod.grupos.mockReturnValue([{ id: "g1", label: "Mayores" }, { id: "g2", label: "Bebé" }]);
    casaMod.cargarCasa.mockResolvedValue({
      semana: {
        weekStart: "2026-09-28", weekEnd: "2026-10-04", activeDays: ["Mié", "Jue"],
        plan: {
          _warnings: [],
          g1: { "Mié-Comida": { firstRecipeId: "g1__ensalada_1", recipeId: "g1__pollo_1" }, "Mié-Cena": { recipeId: "g1__tortilla_1" }, "Lun-Cena": { recipeId: "g1__tortilla_1" } },
          g2: { "Mié-Comida": { recipeId: "g2__pure_1" }, "Mié-Cena": { recipeId: "g2__tortilla_1" } },
        },
        shopping: { items: [
          { id: "a", name: "Pollo", category: "Carne", displayQty: "1 kg", have: false },
          { id: "b", name: "Sal", category: "Despensa", atHome: true },
          { id: "c", name: "Huevos", category: "Huevos", qty: 6, unit: "ud", have: true },
        ] },
      },
    });

    const { semana, compra } = await semanaYCompra("casa");
    // Solo los días activos: el lunes no está aunque tenga plan.
    expect(semana.dias.map((d) => d.clave)).toEqual(["Mié"]);
    const [comidaMayores, comidaBebe, cena] = semana.dias[0].comidas;
    expect(comidaMayores).toMatchObject({ franja: "Comida", grupos: ["Mayores"] });
    expect(comidaMayores.platos.map((p) => p.id)).toEqual(["ensalada_1", "pollo_1"]);
    expect(comidaBebe).toMatchObject({ franja: "Comida", grupos: ["Bebé"] });
    // En la cena comen lo mismo: un solo bloque y sin nombres de grupo.
    expect(cena).toMatchObject({ franja: "Cena", grupos: [] });
    expect(cena.platos).toEqual([{ id: "tortilla_1", nombre: "Tortilla", minutos: 20 }]);
    expect(compra).toEqual([
      { id: "a", nombre: "Pollo", seccion: "Carne", cantidad: "1 kg", comprado: false },
      { id: "c", nombre: "Huevos", seccion: "Huevos", cantidad: "6 ud", comprado: true },
    ]);
  });

  it("sin menú activo no rompe", async () => {
    casaMod.cargarCasa.mockResolvedValue({ semana: null });
    expect(await semanaYCompra("casa")).toEqual({ semana: null, compra: [] });
  });
});

describe("porPasillo", () => {
  it("ordena como la app: pasillo de SHOPPING_AISLES y, dentro, por nombre", () => {
    const items = [{ name: "Tomate" }, { name: "Pechuga de pollo" }, { name: "Cebolla" }, { name: "Aceite de oliva" }];
    expect(porPasillo(items).map((it) => [it.name, it.pasillo])).toEqual([
      ["Cebolla", "Verduras"],
      ["Tomate", "Verduras"],
      ["Pechuga de pollo", "Carne"],
      ["Aceite de oliva", "Aceites y conservas"],
    ]);
  });
});

describe("marcarPorId", () => {
  it("tacha sin dejar foto para «deshaz»", async () => {
    let cambios;
    casaMod.conCasa.mockImplementation(async (_id, cambiar) => {
      cambios = await cambiar({ state: {}, semana: { shopping: { items: [{ id: "a", have: false }] } } });
      return { ok: true };
    });
    expect(await marcarPorId("casa", "a", true)).toBe(true);
    expect(cambios.sinDeshacer).toBe(true);
    expect(cambios.semana.shopping.items[0].have).toBe(true);
  });

  it("un id que ya no está no escribe y dice que no", async () => {
    casaMod.conCasa.mockImplementation(async (_id, cambiar) => {
      const c = await cambiar({ state: {}, semana: { shopping: { items: [] } } });
      return c ? { ok: true } : { ok: true, sinCambios: true };
    });
    expect(await marcarPorId("casa", "zz", true)).toBe(false);
  });
});
