import { describe, it, expect } from "vitest";
import { MARCAS_LOCALES, MARCAS_SIN_LECTOR, marcaLocal, apuntarMarcaLocal, ponerMarcaLocal, sinMarcasDePantalla } from "./marcasLocales.js";
import { DATOS_CASA } from "./registroFicha.js";

/** Un localStorage de mentira: lo que el móvil recuerda. */
const movil = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};

describe("una marca es del móvil y de su casa", () => {
  it("se apunta por casa, y sin casa va a «local»", () => {
    const almacen = movil();
    apuntarMarcaLocal("pantryHasItems", "c1", almacen);
    expect(marcaLocal("pantryHasItems", "c1", almacen)).toBe(true);
    expect(marcaLocal("pantryHasItems", "c2", almacen)).toBe(false);
    apuntarMarcaLocal("pantryHasItems", null, almacen);
    expect(marcaLocal("pantryHasItems", undefined, almacen)).toBe(true);
  });

  it("una marca fuera de MARCAS_LOCALES falla en alto, y un fallo del almacén llega a quien llama", () => {
    expect(() => marcaLocal("inventada", "c1", movil())).toThrow(/no es una marca/);
    const lleno = { getItem: () => null, setItem: () => { throw new Error("QuotaExceededError"); } };
    expect(() => apuntarMarcaLocal("pantryHasItems", "c1", lleno)).toThrow("QuotaExceededError");
  });
});

describe("las marcas de pantalla salen de la casa (trozo 22 de #1037)", () => {
  it("«¿tienes algo en casa?» la recuerda el móvil, por casa, y se puede volver a no", () => {
    const almacen = movil();
    expect(marcaLocal("pantryHasItems", "c1", almacen)).toBe(false);
    ponerMarcaLocal("pantryHasItems", "c1", true, almacen);
    expect(marcaLocal("pantryHasItems", "c1", almacen)).toBe(true);
    expect(marcaLocal("pantryHasItems", "c2", almacen)).toBe(false);
    ponerMarcaLocal("pantryHasItems", "c1", false, almacen);
    expect(marcaLocal("pantryHasItems", "c1", almacen)).toBe(false);
  });

  it("ninguna marca de pantalla está en el registro de la casa: no es un dato de la familia", () => {
    for (const k of [...MARCAS_LOCALES, ...MARCAS_SIN_LECTOR]) expect(DATOS_CASA[k], k).toBeUndefined();
  });

  it("el documento que se guarda no las lleva, aunque una casa vieja las traiga; expertMode sí (lo lee el motor)", () => {
    const vieja = { members: [], expertMode: true, modePrompted: true, pantryPrefsSet: true, pantryHasItems: true, pantryPrefsSeen: true };
    expect(sinMarcasDePantalla(vieja)).toEqual({ members: [], expertMode: true });
    const limpia = { members: [] };
    expect(sinMarcasDePantalla(limpia)).toBe(limpia);
  });
});
