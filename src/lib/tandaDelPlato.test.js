import { describe, expect, it } from "vitest";
import { recipeCatalog } from "../data/recipeCatalog.js";
import { componentesDeTanda, vistaConTanda } from "./tandaDelPlato.js";

const porNombre = (re) => recipeCatalog.find((r) => re.test(r.name));

describe("componentesDeTanda", () => {
  it("un plato con dos bases pregunta por las dos, por separado", () => {
    const r = porNombre(/^Lentejas con arroz/);
    const piezas = componentesDeTanda(r, r);
    expect(piezas.every((p) => p.tipo === "base")).toBe(true);
    expect(piezas.length).toBeGreaterThanOrEqual(1);
  });

  it("la lasaña es un plato que se deja montado, y va primero", () => {
    const r = porNombre(/^Lasaña boloñesa clásica/);
    const piezas = componentesDeTanda(r, r);
    expect(piezas[0].tipo).toBe("semi");
  });

  it("una crema que aguanta es un plato hecho entero", () => {
    const r = recipeCatalog.find((x) => componentesDeTanda(x, x)[0]?.tipo === "cocinado");
    expect(r).toBeTruthy();
  });
});

describe("vistaConTanda", () => {
  it("cada base se descuenta sola: decir que no a una deja la otra", () => {
    const r = recipeCatalog.find((x) => {
      const p = componentesDeTanda(x, x);
      return p.length >= 2 && p.every((q) => q.tipo === "base");
    });
    const [a, b] = componentesDeTanda(r, r);
    const todas = vistaConTanda(r, r, []);
    const sinA = vistaConTanda(r, r, [a.clave]);
    const ninguna = vistaConTanda(r, r, [a.clave, b.clave]);
    expect(todas.aplicada).toBe(true);
    expect(sinA.aplicada).toBe(true);
    expect(sinA.pasos.some((p) => p.base === a.clave && !p.deReactivacion)).toBe(true);
    expect(sinA.pasos.some((p) => p.base === b.clave && p.deReactivacion)).toBe(true);
    expect(ninguna.aplicada).toBe(false);
    expect(ninguna.pasos).toBe(r.stepsRich);
  });

  it("el plato montado se come a sus bases y deja solo el remate", () => {
    const r = porNombre(/^Lasaña boloñesa clásica/);
    const piezas = componentesDeTanda(r, r);
    const v = vistaConTanda(r, r, []);
    expect(v.platoHecho).toBe(true);
    for (const b of piezas.filter((p) => p.tipo === "base")) expect(v.incluidas.has(b.clave)).toBe(true);
    expect(v.pasos.length).toBeLessThan(r.stepsRich.length);
    expect(v.minutos).toBeLessThan(r.stepsRich.reduce((s, p) => s + (Number(p.minutes) || 0), 0));
  });

  it("sin el plato montado, vuelven a contar las bases", () => {
    const r = porNombre(/^Lasaña boloñesa clásica/);
    const [plato] = componentesDeTanda(r, r);
    const v = vistaConTanda(r, r, [plato.clave]);
    expect(v.platoHecho).toBe(false);
    expect(v.incluidas.size).toBe(0);
  });

  it("la crema hecha solo se calienta y se sirve", () => {
    const r = recipeCatalog.find((x) => componentesDeTanda(x, x)[0]?.tipo === "cocinado");
    const v = vistaConTanda(r, r, []);
    expect(v.platoHecho).toBe(true);
    expect(v.pasos[0].deReactivacion).toBe(true);
    expect(v.minutos).toBeLessThanOrEqual(10);
  });
});
