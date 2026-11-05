import { describe, expect, it } from "vitest";
import { VENTANA_MS, conLosCaminos, contarPedidos } from "./pedidos-menu.mjs";

const H = 60 * 60 * 1000;
const AHORA = 100 * VENTANA_MS;
const antes = (horas) => AHORA - horas * H;
const p = (horas, casa = "a") => ({ casa, at: antes(horas) });

describe("contarPedidos (trozo 62)", () => {
  it("preguntar dos veces sin menú entre medias es un pedido con una repetida", () => {
    expect(contarPedidos([p(50), p(49)], [], AHORA)).toEqual({ preguntas: 2, pedidos: 1, repetidas: 1, sin_menu: 1, abiertos: 0 });
  });

  it("con un menú entre medias son dos pedidos y no hay repetida", () => {
    const r = contarPedidos([p(50), p(40)], [p(45), p(39)], AHORA);
    expect(r).toEqual({ preguntas: 2, pedidos: 2, repetidas: 0, sin_menu: 0, abiertos: 0 });
  });

  it("más de un día después es otro pedido, y el primero queda sin menú", () => {
    expect(contarPedidos([p(100), p(50)], [], AHORA)).toMatchObject({ pedidos: 2, repetidas: 0, sin_menu: 2 });
  });

  it("un pedido de hace menos de un día sin menú sigue abierto, no abandonado", () => {
    expect(contarPedidos([p(2)], [], AHORA)).toMatchObject({ abiertos: 1, sin_menu: 0 });
  });

  it("cada casa cuenta aparte", () => {
    expect(contarPedidos([p(50, "a"), p(49, "b")], [], AHORA)).toMatchObject({ pedidos: 2, repetidas: 0 });
  });

  it("el filtro pide los tres caminos", () => {
    expect(conLosCaminos().split(" and ")).toHaveLength(3);
  });
});
