/**
 * «Vaciar hogar» deja vacía la casa que queda solo si de verdad lo está, y
 * con su versión (#958, clase G). Antes App.jsx guardaba la casa vacía sin
 * versión encima de la que quedara activa, que podía ser otra con familia.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { empezarCasaVacia, CASA_VACIA } from "./householdState.js";

const vacia = { data: { members: [] }, menuPlan: {} };
const guardar = () => vi.fn(async () => ({ ok: true, botRev: 8 }));

describe("empezar vacía la casa que queda (#958)", () => {
  it("una casa con familia no se pisa", async () => {
    const g = guardar();
    const r = await empezarCasaVacia("h", vacia, { cargar: async () => ({ state: { data: { members: [{ id: "a" }] } }, botRev: 7 }), guardar: g });
    expect(r).toBe(CASA_VACIA.TENIA_CASA);
    expect(g).not.toHaveBeenCalled();
  });

  it("una vacía se guarda condicionada a la versión leída", async () => {
    const g = guardar();
    const r = await empezarCasaVacia("h", vacia, { cargar: async () => ({ state: { data: { members: [] } }, botRev: 7 }), guardar: g });
    expect(r).toBe(CASA_VACIA.GUARDADA);
    expect(g).toHaveBeenCalledWith("h", vacia, 7);
  });

  it("si no se puede leer, no se escribe", async () => {
    const g = guardar();
    expect(await empezarCasaVacia("h", vacia, { cargar: async () => ({ state: null, botRev: null, error: true }), guardar: g })).toBe(CASA_VACIA.SIN_LEER);
    expect(g).not.toHaveBeenCalled();
  });

  it("si alguien escribió entretanto, conflicto, y no se repite", async () => {
    const r = await empezarCasaVacia("h", vacia, { cargar: async () => ({ state: { data: {} }, botRev: 7 }), guardar: async () => ({ ok: false, conflict: true, botRev: 9 }) });
    expect(r).toBe(CASA_VACIA.CONFLICTO);
  });

  it("App.jsx vacía el hogar por aquí, no con un saveHouseholdState sin versión", () => {
    const app = readFileSync(new URL("../App.jsx", import.meta.url), "utf8");
    const vaciar = app.slice(app.indexOf("const handleDestroyHousehold"), app.indexOf('showToast("Hogar vaciado")'));
    expect(vaciar).toContain("empezarCasaVacia(");
    expect(vaciar).not.toContain("saveHouseholdState(");
  });
});
