/**
 * El puntero a la semana viva (`data.menuWeek`) sigue al menú que se pone en
 * vivo (#1063). Sin cuenta, generar el menú lo dejaba en null: la compra, el
 * guardado y los favoritos leían la copia archivada de la semana, y un plato
 * cambiado no llegaba a la lista. Con cuenta se quedaba el del menú anterior.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { punteroDeSemana, semanaAbiertaDe, semanaPorOffset } from "./menuArchive.js";

const semana = (offset, extra = {}) => ({ offset, startDayIdx: 0, days: null, plan: {}, shopping: { items: [] }, ...extra });
const menus = {
  m1: { id: "m1", weeks: { "2026-11-09": semana(1), "2026-11-02": semana(0, { startDayIdx: 3, days: [3, 4, 5, 6] }) } },
};

describe("semanaAbiertaDe: el puntero señala una semana del menú activo", () => {
  it("sin puntero, la primera semana (la que se pone en vivo al generar)", () => {
    const p = semanaAbiertaDe(menus, "m1", null);
    expect(p).toEqual({ offset: 0, startDayIdx: 3, days: [3, 4, 5, 6] });
    expect(semanaPorOffset(menus.m1.weeks, p.offset)?.[0]).toBe("2026-11-02");
  });

  it("un offset que no es de este menú se repara igual", () => {
    expect(semanaAbiertaDe(menus, "m1", { offset: 3, startDayIdx: 0 })?.offset).toBe(0);
  });

  it("un puntero válido no se toca, aunque no sea la primera semana", () => {
    const valido = { offset: 1, startDayIdx: 0, days: null };
    expect(semanaAbiertaDe(menus, "m1", valido)).toBe(valido);
  });

  it("sin menú activo no se inventa nada", () => {
    expect(semanaAbiertaDe(menus, null, null)).toBe(null);
    expect(semanaAbiertaDe({}, "m1", null)).toBe(null);
  });

  it("punteroDeSemana copia offset, día de arranque y días", () => {
    expect(punteroDeSemana({ offset: 2, startISO: "x" })).toEqual({ offset: 2, startDayIdx: 0, days: null });
  });
});

// El objeto literal que rodea a la posición `i` del texto (llave a llave).
function objetoQueRodea(src, i) {
  let ini = i;
  for (let prof = 0; ini >= 0; ini--) {
    if (src[ini] === "}") prof++;
    else if (src[ini] === "{" && prof-- === 0) break;
  }
  let fin = i;
  for (let prof = 0; fin < src.length; fin++) {
    if (src[fin] === "{") prof++;
    else if (src[fin] === "}" && prof-- === 0) break;
  }
  return src.slice(ini, fin + 1);
}

describe("App.jsx: quien pone un menú nuevo en vivo pone su puntero", () => {
  const app = readFileSync(new URL("../App.jsx", import.meta.url), "utf8");
  const sitios = [...app.matchAll(/activeMenuId: newMenu\.id/g)].map((m) => m.index);

  it("hay sitios que medir", () => {
    expect(sitios.length).toBeGreaterThanOrEqual(3);
  });

  it("cada uno escribe menuWeek en el mismo objeto", () => {
    const sinPuntero = sitios
      .filter((i) => !/\bmenuWeek: /.test(objetoQueRodea(app, i)))
      .map((i) => app.slice(0, i).split("\n").length);
    expect(sinPuntero, "líneas de App.jsx sin puntero").toEqual([]);
  });

  it("y los menús ya guardados sin puntero se reparan al cargar", () => {
    expect(app).toMatch(/d\.menuWeek = semanaAbiertaDe\(d\.menus, d\.activeMenuId/);
  });
});
