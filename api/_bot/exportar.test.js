import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({ select: vi.fn() }));
vi.mock("./db.js", () => ({ ...db, eq: (v) => `eq.${encodeURIComponent(v)}` }));

const { exportarCasa } = await import("./exportar.js");
const { TABLAS_EXPORTADAS, LIMITE_FILAS } = await import("../../src/lib/exportarCasa.js");

describe("exportarCasa: cada tabla de la lista, con las filas de esa casa", () => {
  beforeEach(() => db.select.mockReset());

  it("lee cada tabla exportada por su columna de casa, con el límite más una", async () => {
    db.select.mockImplementation(async (tabla) => (tabla === "persona" ? [{ id: "ana" }] : []));
    const r = await exportarCasa("c1", new Date("2026-11-04T10:00:00Z"));
    expect(db.select.mock.calls.map(([t]) => t)).toEqual([...TABLAS_EXPORTADAS]);
    const filtro = (t) => db.select.mock.calls.find(([x]) => x === t)[1];
    expect(filtro("persona")).toBe(`household_id=eq.c1&limit=${LIMITE_FILAS + 1}`);
    expect(filtro("households")).toBe(`id=eq.c1&limit=${LIMITE_FILAS + 1}`);
    expect(r.tablas.persona.filas).toEqual([{ id: "ana" }]);
    expect(r.casa).toBe("c1");
  });

  it("si una tabla falla, falla la exportación entera", async () => {
    db.select.mockImplementation(async (tabla) => {
      if (tabla === "sobre") throw new Error("503");
      return [];
    });
    await expect(exportarCasa("c1")).rejects.toThrow("503");
  });
});
