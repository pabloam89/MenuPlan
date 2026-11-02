import { describe, it, expect } from "vitest";
import { MARCAS_LOCALES, marcaLocal, apuntarMarcaLocal, abrirPrefsDespensaSola } from "./marcasLocales.js";

/** Un localStorage de mentira: lo que el móvil recuerda. */
const movil = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
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
