/**
 * Las semanas se identifican por su fecha y el offset se calcula (#958, clase E).
 */
import { describe, it, expect } from "vitest";
import { semanasEntre } from "./dias.js";
import { indiceSemanaCole, lunesParaCole, replaceSchoolWeeks, schoolMenusForWeekIndex } from "./schoolMenu.js";
import { semanaPorOffset, semanaVivaPorGuardar } from "./menuArchive.js";

describe("semanasEntre", () => {
  it("cuenta lunes a lunes, sin importar el día ni el cambio de hora", () => {
    expect(semanasEntre("2026-10-29", "2026-10-26")).toBe(0);
    expect(semanasEntre("2026-10-29", "2026-11-02")).toBe(1);
    expect(semanasEntre("2026-10-29", "2026-10-19")).toBe(-1);
    // 25 oct 2026: cambio de hora en España.
    expect(semanasEntre("2026-10-24", "2026-10-26")).toBe(1);
    expect(semanasEntre("2027-03-27", "2027-03-29")).toBe(1);
  });
});

describe("la semana del cole por fecha", () => {
  it("el ancla es el lunes de esta semana, o el siguiente en fin de semana", () => {
    expect(lunesParaCole("2026-10-29")).toBe("2026-10-26");
    expect(lunesParaCole("2026-10-31")).toBe("2026-11-02");
    expect(lunesParaCole("2026-11-01")).toBe("2026-11-02");
  });

  it("guardar las semanas pone el ancla, y rotan desde ella", () => {
    const sm = replaceSchoolWeeks(null, { scope: "shared", weeksEntries: [{ "Lun-Primero": "A" }, { "Lun-Primero": "B" }], hoy: "2026-10-27" });
    expect(sm.lunesSemana1).toBe("2026-10-26");
    const plato = (iso) => schoolMenusForWeekIndex(sm, indiceSemanaCole(sm, iso)).shared["Lun-Primero"];
    expect(plato("2026-10-26")).toBe("A");
    expect(plato("2026-11-02")).toBe("B");
    expect(plato("2026-11-09")).toBe("A");
    expect(plato("2026-10-19")).toBe("B");
  });

  it("sin ancla (menús de antes), la primera como siempre", () => {
    expect(indiceSemanaCole({ weeks: [{}, {}] }, "2026-11-02")).toBe(0);
  });
});

describe("la app no guarda en una semana ambigua", () => {
  const menus = {
    m1: { weeks: {
      "2026-10-26": { offset: 0, plan: { g: { "Lun-Cena": { recipeId: "a" } } } },
      "2026-11-02": { offset: 0, plan: { g: { "Lun-Cena": { recipeId: "b" } } } },
    } },
  };

  it("dos semanas con el mismo offset: ninguna", () => {
    expect(semanaPorOffset(menus.m1.weeks, 0)).toBeNull();
    expect(semanaVivaPorGuardar(menus, "m1", 0, { g: { "Lun-Cena": { recipeId: "x" } } }, null)).toBeNull();
  });

  it("una sola: esa", () => {
    expect(semanaPorOffset({ a: { offset: 1 }, b: { offset: 0 } }, 0)[0]).toBe("b");
  });
});
