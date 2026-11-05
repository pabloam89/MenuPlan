import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({ select: vi.fn(), update: vi.fn(), borrar: vi.fn() }));
const casaBot = vi.hoisted(() => ({ conCasa: vi.fn() }));
const menuBot = vi.hoisted(() => ({ grupos: vi.fn(() => []), leerDespensa: vi.fn(), prepararRecetas: vi.fn() }));
const avisos = vi.hoisted(() => ({ avisarFallo: vi.fn() }));
vi.mock("./db.js", () => ({ ...db, eq: (v) => `eq.${encodeURIComponent(v)}` }));
vi.mock("./casa.js", () => casaBot);
vi.mock("./menu.js", () => menuBot);
vi.mock("./avisar.js", () => avisos);

import { applyConsumption } from "../../src/lib/cookPantry.js";
import { barrerDespensa, escribirGasto, planDeLaNoche } from "./barridoDespensa.js";

const HOY = "2026-11-05"; // jueves
const hueco = (nombre) => ({ ingrediente: nombre });
const semana = {
  weekStart: "2026-11-02", weekEnd: "2026-11-08",
  plan: { g1: { "Lun-comida": hueco("Arroz"), "Mar-comida": hueco("Arroz"), "Mié-comida": hueco("Lentejas"), "Jue-comida": hueco("Arroz") } },
};
const casaCon = (data) => ({ householdId: "c1", menu: { id: "m1" }, semanas: [semana], state: { data } });
const fila = (id, nombre, qty) => ({ id, ingredientName: nombre, ingredientNormalized: nombre.toLowerCase(), qty, unit: "g" });
const usados = (dayPlan) => Object.values(dayPlan).flatMap((slots) => Object.values(slots))
  .map((h) => ({ name: h.ingrediente, qty: 100, unit: "g" }));
const plan = (data, stock) => planDeLaNoche({ casa: casaCon(data), stock, hoy: HOY, ahoraMs: 1, usados, aplicar: applyConsumption });

beforeEach(() => vi.clearAllMocks());

describe("lo que toca hacer una noche en una casa", () => {
  it("baja los días cerrados encadenando la despensa, y deja la marca de cada uno", async () => {
    const r = await plan({ pantryEndOfDaySince: "2026-11-02" }, [fila("a", "Arroz", 500), fila("b", "Lentejas", 150)]);
    expect(r.escrituras).toEqual([{ id: "a", leida: 500, quitar: 200 }, { id: "b", leida: 150, quitar: 100 }]);
    expect(Object.keys(r.patch.pantryDayDeltas)).toEqual(["2026-11-02", "2026-11-03", "2026-11-04"]);
    expect(r.patch.pantryDayDeltas["2026-11-02"]).toMatchObject({ menuId: "m1", deltas: [{ name: "Arroz", qty: 100 }] });
  });

  it("repetida con sus propias marcas no vuelve a bajar nada", async () => {
    const stock = [fila("a", "Arroz", 500)];
    const primera = await plan({ pantryEndOfDaySince: "2026-11-02" }, stock);
    expect(await plan({ pantryEndOfDaySince: "2026-11-02", pantryDayDeltas: primera.patch.pantryDayDeltas }, stock)).toBeNull();
  });

  it("una casa de «al cocinar» solo se prepara, y barre desde hoy", async () => {
    const r = await plan({ pantryPrefs: { consume: "onCook", otra: 1 } }, [fila("a", "Arroz", 500)]);
    expect(r).toEqual({ patch: { pantryPrefs: { otra: 1 }, pantryEndOfDaySince: HOY }, escrituras: [] });
  });

  it("una casa sin fecha de inicio solo se prepara: nunca mira hacia atrás", async () => {
    expect(await plan({}, [fila("a", "Arroz", 500)])).toEqual({ patch: { pantryEndOfDaySince: HOY }, escrituras: [] });
  });

  it("una casa que aún tiene algo que devolver («al generar») se deja a la app", async () => {
    const data = {
      pantryPrefs: { consume: "onGenerate" },
      pantryGenDeltas: { x: { menuId: "m1", at: 1, deltas: [{ name: "Arroz", qty: 100, unit: "g" }] } },
    };
    expect(await plan(data, [fila("a", "Arroz", 500)])).toBeNull();
  });
});

describe("bajar una fila de la despensa", () => {
  it("con la cantidad leída como condición", async () => {
    db.update.mockResolvedValue([{ id: "a" }]);
    expect(await escribirGasto({ id: "a", leida: 500, quitar: 200 })).toBe(true);
    expect(db.update).toHaveBeenCalledWith("user_pantry", "id=eq.a&qty=eq.500", { qty: 300 });
  });

  it("si otro la cambió, resta sobre la nueva sin pisarla", async () => {
    db.update.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: "a" }]);
    db.select.mockResolvedValue([{ qty: 1000 }]);
    expect(await escribirGasto({ id: "a", leida: 500, quitar: 200 })).toBe(true);
    expect(db.update).toHaveBeenLastCalledWith("user_pantry", "id=eq.a&qty=eq.1000", { qty: 800 });
  });

  it("a cero se borra, como en la app", async () => {
    expect(await escribirGasto({ id: "a", leida: 100, quitar: 100 })).toBe(true);
    expect(db.borrar).toHaveBeenCalledWith("user_pantry", "id=eq.a&qty=eq.100");
    expect(db.update).not.toHaveBeenCalled();
  });

  it("si cambia una y otra vez, se rinde y lo dice", async () => {
    db.update.mockResolvedValue([]);
    db.select.mockResolvedValue([{ qty: 900 }]);
    expect(await escribirGasto({ id: "a", leida: 500, quitar: 200 })).toBe(false);
  });
});

describe("la pasada de la noche", () => {
  const conPlan = (data) => casaBot.conCasa.mockImplementation(async (_id, cambiar) => {
    const cambios = await cambiar(casaCon(data));
    return cambios ? { ok: true } : { ok: true, sinCambios: true };
  });
  const m = { getDayMeals: () => ({}), buildShoppingList: (dayPlan) => ({ pantryItems: usados(dayPlan) }), applyConsumption };

  beforeEach(() => {
    menuBot.prepararRecetas.mockResolvedValue(m);
    db.select.mockImplementation(async (tabla) => (tabla === "user_menus" ? [{ household_id: "c1" }] : [{ id: "a" }]));
    db.update.mockResolvedValue([{ id: "a" }]);
  });

  it("guarda la marca antes de tocar la despensa", async () => {
    const orden = [];
    menuBot.leerDespensa.mockResolvedValue([fila("a", "Arroz", 500)]);
    casaBot.conCasa.mockImplementation(async (_id, cambiar) => {
      await cambiar(casaCon({ pantryEndOfDaySince: "2026-11-03" }));
      orden.push("marca");
      return { ok: true };
    });
    db.update.mockImplementation(async () => { orden.push("despensa"); return [{ id: "a" }]; });
    await barrerDespensa({ hoy: HOY });
    expect(orden).toEqual(["marca", "despensa"]);
  });

  it("si la marca no se guarda, la despensa no se toca", async () => {
    menuBot.leerDespensa.mockResolvedValue([fila("a", "Arroz", 500)]);
    casaBot.conCasa.mockImplementation(async (_id, cambiar) => {
      await cambiar(casaCon({ pantryEndOfDaySince: "2026-11-02" }));
      return { ok: false, error: "conflicto persistente" };
    });
    expect(await barrerDespensa({ hoy: HOY })).toMatchObject({ casas: 0, fallos: 1 });
    expect(db.update).not.toHaveBeenCalled();
    expect(avisos.avisarFallo).toHaveBeenCalledWith("despensa_noche", expect.any(Error), { grave: false });
  });

  it("sin poder leer la despensa no se marca ningún día", async () => {
    menuBot.leerDespensa.mockResolvedValue(null);
    conPlan({ pantryEndOfDaySince: "2026-11-02" });
    expect(await barrerDespensa({ hoy: HOY })).toEqual({ casas: 1, filas: 0, sinBajar: 0, fallos: 0 });
    expect(db.update).not.toHaveBeenCalled();
  });

  it("una casa sin despensa ni se carga", async () => {
    db.select.mockImplementation(async (tabla) => (tabla === "user_menus" ? [{ household_id: "c1" }] : []));
    expect(await barrerDespensa({ hoy: HOY })).toEqual({ casas: 0, filas: 0, sinBajar: 0, fallos: 0 });
    expect(casaBot.conCasa).not.toHaveBeenCalled();
    expect(menuBot.prepararRecetas).not.toHaveBeenCalled();
  });

  it("si una casa falla, las demás siguen", async () => {
    db.select.mockImplementation(async (tabla) => (tabla === "user_menus" ? [{ household_id: "c1" }, { household_id: "c2" }] : [{ id: "a" }]));
    menuBot.leerDespensa.mockResolvedValue([fila("a", "Arroz", 500)]);
    casaBot.conCasa.mockRejectedValueOnce(new Error("se cayó"));
    conPlan({ pantryEndOfDaySince: "2026-11-03" });
    expect(await barrerDespensa({ hoy: HOY })).toEqual({ casas: 1, filas: 1, sinBajar: 0, fallos: 1 });
  });
});
