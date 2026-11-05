import { beforeEach, describe, expect, it, vi } from "vitest";

const insertadas = vi.hoisted(() => []);
const fallo = vi.hoisted(() => ({ siguiente: null }));

vi.mock("./db.js", () => ({
  eq: (v) => `eq.${v}`,
  select: vi.fn(async () => []),
  insert: vi.fn(async (_tabla, filas) => {
    const e = fallo.siguiente;
    fallo.siguiente = null;
    if (e) throw e;
    insertadas.push(...filas);
  }),
}));

const { apuntarMenuGenerado, ultimaVez, ultimoPedido } = await import("./menusGenerados.js");
const { select } = await import("./db.js");
const COMO = { menu_id: "m1", week_start: "2026-11-09", camino: "medio" };
const error = (codigo, message) => Object.assign(new Error(message), { codigo });

beforeEach(() => {
  insertadas.length = 0;
  fallo.siguiente = null;
});

describe("ultimoPedido (trozo 70)", () => {
  it("el último con camino, o null si no hay", async () => {
    select.mockResolvedValueOnce([COMO]);
    expect(await ultimoPedido("casa")).toEqual(COMO);
    expect(select.mock.calls.at(-1)[1]).toContain("camino=not.is.null");
    select.mockResolvedValueOnce([]);
    expect(await ultimoPedido("casa")).toBeNull();
  });

  it("sin la 0130, null; otro fallo lanza", async () => {
    select.mockRejectedValueOnce(error("42703", "column menu_generado.camino does not exist"));
    expect(await ultimoPedido("casa")).toBeNull();
    select.mockRejectedValueOnce(error("57014", "tiempo"));
    await expect(ultimoPedido("casa")).rejects.toThrow("tiempo");
  });
});

describe("ultimaVez (trozo 71)", () => {
  const DIAS = ["Lun", "Mar"];
  it("su camino y los días de esa semana de esa casa", async () => {
    select.mockResolvedValueOnce([COMO]).mockResolvedValueOnce([{ active_days: DIAS }]);
    expect(await ultimaVez("casa")).toEqual({ camino: "medio", dias: DIAS });
    expect(select.mock.calls.at(-1)).toEqual(["user_menu_weeks", "household_id=eq.casa&menu_id=eq.m1&week_start=eq.2026-11-09", "active_days"]);
  });

  it("sin pedido, o sin esa semana, null", async () => {
    select.mockResolvedValueOnce([]);
    expect(await ultimaVez("casa")).toBeNull();
    select.mockResolvedValueOnce([COMO]).mockResolvedValueOnce([]);
    expect(await ultimaVez("casa")).toBeNull();
  });
});

describe("apuntarMenuGenerado (trozo 70)", () => {
  it("apunta cómo se pidió", async () => {
    await apuntarMenuGenerado("casa", COMO);
    expect(insertadas).toEqual([{ household_id: "casa", ...COMO }]);
  });

  it("un camino fuera del vocabulario no llega a la base", async () => {
    await expect(apuntarMenuGenerado("casa", { ...COMO, camino: "rapido" })).rejects.toThrow();
    expect(insertadas).toEqual([]);
  });

  it("sin nada, solo la casa, como la app", async () => {
    await apuntarMenuGenerado("casa");
    expect(insertadas).toEqual([{ household_id: "casa" }]);
  });

  it("sin la 0130, apunta el menú sin cómo se pidió y lo dice en el log", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    fallo.siguiente = error("PGRST204", "Could not find the 'camino' column of 'menu_generado'");
    await apuntarMenuGenerado("casa", COMO);
    expect(insertadas).toEqual([{ household_id: "casa" }]);
    expect(aviso).toHaveBeenCalledOnce();
    aviso.mockRestore();
  });

  it("otra columna u otro fallo no se confunden con la 0130: lanza", async () => {
    fallo.siguiente = error("PGRST204", "Could not find the 'otra' column");
    await expect(apuntarMenuGenerado("casa", COMO)).rejects.toThrow("otra");
    fallo.siguiente = error("23505", "camino");
    await expect(apuntarMenuGenerado("casa", COMO)).rejects.toThrow();
  });
});
