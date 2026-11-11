import { describe, expect, it, vi } from "vitest";
import { ABRIR_EN, abrirEnAppMercadona, guardarAbrirEn, leerAbrirEn } from "./mercadonaAbrir.js";

/** Un localStorage de mentira. */
const almacen = (inicial = {}) => {
  const datos = { ...inicial };
  return { datos, getItem: (k) => datos[k] ?? null, setItem: (k, v) => { datos[k] = v; } };
};

describe("dónde se abre la lista de Mercadona", () => {
  it("el vocabulario es cerrado: web o app", () => {
    expect(Object.values(ABRIR_EN)).toEqual(["web", "app"]);
  });

  it("sin elegir, o con algo que no es del vocabulario, es null (se pregunta)", () => {
    expect(leerAbrirEn(almacen())).toBeNull();
    expect(leerAbrirEn(almacen({ mp_mercadona_abrir: "safari" }))).toBeNull();
    expect(leerAbrirEn(null)).toBeNull();
  });

  it("guarda la elección y la lee después", () => {
    const a = almacen();
    guardarAbrirEn(ABRIR_EN.APP, a);
    expect(leerAbrirEn(a)).toBe("app");
    guardarAbrirEn(ABRIR_EN.WEB, a);
    expect(leerAbrirEn(a)).toBe("web");
  });

  it("no guarda nada fuera del vocabulario", () => {
    const a = almacen();
    guardarAbrirEn("safari", a);
    expect(a.datos).toEqual({});
  });

  it("si el almacén falla, lo dice y sigue: leer da null y guardar no rompe", () => {
    const roto = { getItem: () => { throw new Error("bloqueado"); }, setItem: () => { throw new Error("lleno"); } };
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(leerAbrirEn(roto)).toBeNull();
    expect(() => guardarAbrirEn(ABRIR_EN.APP, roto)).not.toThrow();
    expect(error).toHaveBeenCalledTimes(2);
    error.mockRestore();
  });

  it("abrir en la app de Mercadona manda la dirección de la lista fuera de HoMenu", () => {
    const abrirFuera = vi.fn();
    abrirEnAppMercadona("https://tienda.mercadona.es/shopping-lists/7", abrirFuera);
    expect(abrirFuera).toHaveBeenCalledWith("https://tienda.mercadona.es/shopping-lists/7");
  });
});
