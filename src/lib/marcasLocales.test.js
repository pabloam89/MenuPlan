import { describe, it, expect } from "vitest";
import { MARCAS_LOCALES, MARCAS_SIN_LECTOR, marcaLocal, apuntarMarcaLocal, ponerMarcaLocal, abrirPrefsDespensaSola, sinMarcasDePantalla } from "./marcasLocales.js";
import { DATOS_CASA } from "./registroFicha.js";

/** Un localStorage de mentira: lo que el móvil recuerda. */
const movil = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};

const enCasa = (almacen, casa = "c1") => abrirPrefsDespensaSola({ pestana: "home", puedeEditar: true, menuActivo: "m1", casa, almacen });

describe("la hoja de la despensa sale sola una vez por móvil y casa (pantryPrefsSeen, trozo 12 de #1037)", () => {
  it("sale la primera vez en «En casa» con menú; apuntada (contestada o cerrada), ya no sale sola en ese móvil", () => {
    const almacen = movil();
    expect(enCasa(almacen)).toBe(true);
    apuntarMarcaLocal("pantryPrefsSeen", "c1", almacen);
    expect(enCasa(almacen)).toBe(false);
  });

  it("es de cada casa: apuntada en una, en otra sale", () => {
    const almacen = movil();
    apuntarMarcaLocal("pantryPrefsSeen", "c1", almacen);
    expect(enCasa(almacen, "c2")).toBe(true);
    expect(marcaLocal("pantryPrefsSeen", "c2", almacen)).toBe(false);
  });

  it("es del móvil, no de la casa: en otro móvil de la misma casa sale", () => {
    const uno = movil();
    apuntarMarcaLocal("pantryPrefsSeen", "c1", uno);
    expect(enCasa(movil(), "c1")).toBe(true);
  });

  it("sin casa (invitado) también se recuerda", () => {
    const almacen = movil();
    apuntarMarcaLocal("pantryPrefsSeen", null, almacen);
    expect(enCasa(almacen, null)).toBe(false);
  });

  it("fuera de «En casa», sin menú activo o sin poder editar, no sale", () => {
    const almacen = movil();
    const base = { pestana: "home", puedeEditar: true, menuActivo: "m1", casa: "c1", almacen };
    expect(abrirPrefsDespensaSola({ ...base, pestana: "buy" })).toBe(false);
    expect(abrirPrefsDespensaSola({ ...base, menuActivo: null })).toBe(false);
    expect(abrirPrefsDespensaSola({ ...base, puedeEditar: false })).toBe(false);
  });

  it("una marca fuera de MARCAS_LOCALES falla en alto, y un fallo del almacén llega a quien llama", () => {
    expect(MARCAS_LOCALES).toContain("pantryPrefsSeen");
    expect(() => marcaLocal("inventada", "c1", movil())).toThrow(/no es una marca/);
    const lleno = { getItem: () => null, setItem: () => { throw new Error("QuotaExceededError"); } };
    expect(() => apuntarMarcaLocal("pantryPrefsSeen", "c1", lleno)).toThrow("QuotaExceededError");
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
