import { describe, it, expect } from "vitest";
import { parseCsvMenu, menuToWeeksFormat, MenuSchema } from "./menuParser.js";

// ---------------------------------------------------------------------------
// CSV parsing
// ---------------------------------------------------------------------------

describe("parseCsvMenu", () => {
  it("parses a well-formed CSV with all fields", () => {
    const csv = `semana,día,primero,segundo,postre,kcal,P,HC,G
1,Lunes,Lentejas estofadas,Pollo asado con patatas,Manzana,640,28,72,20
1,Martes,Sopa de fideos,Merluza a la plancha,Yogur,580,25,65,18
1,Miércoles,Macarrones con tomate,Tortilla francesa,Pera,610,22,70,22
1,Jueves,Arroz a la cubana,Filete de cerdo,Flan,650,30,75,19
1,Viernes,Judías verdes rehogadas,Croquetas de jamón,Fruta del tiempo,600,24,68,21
2,Lunes,Espinacas salteadas con garbanzos,Pescadilla rebozada,Plátano,645,26,70,22`;

    const result = parseCsvMenu(csv);

    expect(result.semanas).toHaveLength(2);
    const s1 = result.semanas[0];
    expect(s1.numero).toBe(1);
    const lunes1 = s1.dias.find((d) => d.dia === "lunes");
    expect(lunes1.primero).toBe("Lentejas estofadas");
    expect(lunes1.kcal).toBe(640);
    expect(lunes1.macros).toEqual({ p: 28, hc: 72, g: 20 });

    const viernes1 = s1.dias.find((d) => d.dia === "viernes");
    expect(viernes1.postre).toBe("Fruta del tiempo");

    const s2 = result.semanas[1];
    expect(s2.numero).toBe(2);
    const lunes2 = s2.dias.find((d) => d.dia === "lunes");
    expect(lunes2.primero).toBe("Espinacas salteadas con garbanzos");
    expect(lunes2.postre).toBe("Plátano");
    expect(lunes2.kcal).toBe(645);
  });

  it("handles sin clase days", () => {
    const csv = `semana,día,primero,segundo,postre
1,Lunes,Sin clase,,
1,Martes,Sopa,Pollo,Fruta`;

    const result = parseCsvMenu(csv);
    const lunes = result.semanas[0].dias.find((d) => d.dia === "lunes");
    const martes = result.semanas[0].dias.find((d) => d.dia === "martes");
    expect(lunes.sinClase).toBe(true);
    expect(lunes.primero).toBeNull();
    expect(martes.sinClase).toBe(false);
    expect(martes.primero).toBe("Sopa");
  });

  it("works without week column (defaults to week 1)", () => {
    const csv = `día,primero,segundo,postre
Lunes,Lentejas,Pollo,Manzana
Martes,Sopa,Merluza,Yogur`;

    const result = parseCsvMenu(csv);
    expect(result.semanas).toHaveLength(1);
    expect(result.semanas[0].numero).toBe(1);
    const lunes = result.semanas[0].dias.find((d) => d.dia === "lunes");
    expect(lunes.primero).toBe("Lentejas");
  });

  it("throws on missing day column", () => {
    const csv = `primero,segundo,postre
Lentejas,Pollo,Manzana`;

    expect(() => parseCsvMenu(csv)).toThrow(/columna de día/);
  });
});

// ---------------------------------------------------------------------------
// Zod schema validation
// ---------------------------------------------------------------------------

describe("MenuSchema", () => {
  it("validates a correct menu", () => {
    const valid = {
      semanas: [
        {
          numero: 1,
          fechaInicio: "1 Jun",
          dias: [
            { dia: "lunes", sinClase: false, primero: "Lentejas", segundo: "Pollo", postre: "Manzana", kcal: 640, macros: { p: 28, hc: 72, g: 20 } },
            { dia: "martes", sinClase: false, primero: "Sopa", segundo: "Merluza", postre: "Yogur" },
            { dia: "miercoles", sinClase: true, primero: null, segundo: null, postre: null },
            { dia: "jueves", sinClase: false, primero: "Arroz", segundo: "Filete", postre: "Flan" },
            { dia: "viernes", sinClase: false, primero: "Judías", segundo: "Croquetas", postre: "Fruta" },
          ],
        },
      ],
    };

    const result = MenuSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("rejects empty semanas array", () => {
    const result = MenuSchema.safeParse({ semanas: [] });
    expect(result.success).toBe(false);
  });

  it("accepts nullable fields", () => {
    const menu = {
      semanas: [
        {
          numero: 1,
          fechaInicio: null,
          dias: [
            { dia: "lunes", sinClase: false, primero: "Sopa", segundo: null, postre: null, kcal: null, macros: null },
          ],
        },
      ],
    };
    const result = MenuSchema.safeParse(menu);
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Bridge: menuToWeeksFormat
// ---------------------------------------------------------------------------

describe("menuToWeeksFormat", () => {
  it("converts new schema to UI weeks format", () => {
    const menu = {
      semanas: [
        {
          numero: 1,
          fechaInicio: "1 Jun",
          dias: [
            { dia: "lunes", sinClase: false, primero: "Lentejas", segundo: "Pollo", postre: "Manzana" },
            { dia: "martes", sinClase: true, primero: null, segundo: null, postre: null },
            { dia: "miercoles", sinClase: false, primero: "Pasta", segundo: "Tortilla", postre: "Pera" },
            { dia: "jueves", sinClase: false, primero: "Arroz", segundo: "Filete", postre: "Flan" },
            { dia: "viernes", sinClase: false, primero: "Judías", segundo: "Croquetas", postre: "Fruta" },
          ],
        },
      ],
    };

    const weeks = menuToWeeksFormat(menu);

    expect(weeks).toHaveLength(1);
    expect(weeks[0].weekLabel).toBe("Semana 1 (1 Jun)");
    expect(weeks[0].entries["Lun-Primero"]).toBe("Lentejas");
    expect(weeks[0].entries["Lun-Segundo"]).toBe("Pollo");
    expect(weeks[0].entries["Lun-Postre"]).toBe("Manzana");
    expect(weeks[0].entries["Mar-Primero"]).toBeUndefined(); // sinClase
    expect(weeks[0].entries["Mié-Primero"]).toBe("Pasta");
    expect(weeks[0].entries["Jue-Postre"]).toBe("Flan");
    expect(weeks[0].entries["Vie-Segundo"]).toBe("Croquetas");
  });

  it("handles menu without fechaInicio", () => {
    const menu = {
      semanas: [
        {
          numero: 3,
          fechaInicio: null,
          dias: [{ dia: "lunes", sinClase: false, primero: "Sopa", segundo: "Pollo", postre: "Fruta" }],
        },
      ],
    };

    const weeks = menuToWeeksFormat(menu);
    expect(weeks[0].weekLabel).toBe("Semana 3");
  });
});
