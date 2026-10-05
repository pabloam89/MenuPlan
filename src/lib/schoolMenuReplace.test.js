import { describe, it, expect } from "vitest";
import { replaceSchoolWeeks, normalizeSchoolMenus } from "./schoolMenu.js";

const semana = (n, quien) => ({ "Lun-Primero": `${quien} ${n}` });

// Tres semanas de menú común y tres del menú propio de Leo.
const casa = () => normalizeSchoolMenus({
  weeks: [1, 2, 3].map((n) => ({ label: `Semana ${n}`, shared: semana(n, "común"), byMember: { leo: semana(n, "Leo"), ana: semana(n, "Ana") } })),
});

describe("replaceSchoolWeeks: cambiar un menú no borra el de los demás", () => {
  it("subir 1 semana del menú de Leo deja las 3 del común y las de Ana", () => {
    const sm = replaceSchoolWeeks(casa(), { scope: "individual", kidId: "leo", weeksEntries: [semana(9, "Leo nuevo")] });
    expect(sm.weeks).toHaveLength(3);
    expect(sm.weeks.map((w) => w.shared["Lun-Primero"])).toEqual(["común 1", "común 2", "común 3"]);
    expect(sm.weeks.map((w) => w.byMember.ana?.["Lun-Primero"])).toEqual(["Ana 1", "Ana 2", "Ana 3"]);
    // El de Leo se reemplaza entero: su semana nueva, y nada de sus semanas viejas.
    expect(sm.weeks.map((w) => w.byMember.leo?.["Lun-Primero"])).toEqual(["Leo nuevo 9", undefined, undefined]);
  });

  it("subir 1 semana del común deja las 3 de Leo y Ana", () => {
    const sm = replaceSchoolWeeks(casa(), { scope: "shared", weeksEntries: [semana(9, "común nuevo")] });
    expect(sm.weeks).toHaveLength(3);
    expect(sm.weeks.map((w) => w.byMember.leo?.["Lun-Primero"])).toEqual(["Leo 1", "Leo 2", "Leo 3"]);
    expect(sm.weeks.map((w) => w.shared["Lun-Primero"])).toEqual(["común nuevo 9", undefined, undefined]);
  });

  it("vaciar el común (desmarcar todo en la app) no borra a Leo ni a Ana", () => {
    const sm = replaceSchoolWeeks(casa(), { scope: "shared", weeksEntries: [] });
    expect(sm.weeks.map((w) => w.byMember.ana?.["Lun-Primero"])).toEqual(["Ana 1", "Ana 2", "Ana 3"]);
    expect(sm.weeks.every((w) => Object.keys(w.shared).length === 0)).toBe(true);
  });

  it("las semanas que se quedan vacías del todo se quitan del final", () => {
    const solo = normalizeSchoolMenus({ weeks: [1, 2, 3].map((n) => ({ shared: semana(n, "común"), byMember: {} })) });
    const sm = replaceSchoolWeeks(solo, { scope: "shared", weeksEntries: [semana(9, "nuevo")] });
    expect(sm.weeks).toHaveLength(1);
    expect(sm.shared["Lun-Primero"]).toBe("nuevo 9");
  });
});
