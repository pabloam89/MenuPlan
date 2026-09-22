import { describe, expect, it } from "vitest";

import { MANOS_MINIMAS_DE_ADELANTO, ahorroDelDia, partirReceta, tieneAdelanto } from "./adelanto.js";
import { recipeCatalog as recipes } from "../data/recipeCatalog.js";
import { validateRecipes } from "../data/recipeSchema.js";

const porId = (id) => recipes.find((r) => r.id === id);

describe("partir un plato a medio hacer", () => {
  it("una receta sin corte no se parte", () => {
    expect(tieneAdelanto({ stepsRich: [{ text: "a", minutes: 1 }] })).toBe(false);
    expect(partirReceta({ stepsRich: [{ text: "a", minutes: 1 }] })).toBeNull();
  });

  it("los dos lados suman todos los pasos", () => {
    const receta = porId("carnes_137");
    const { antes, despues } = partirReceta(receta);
    expect(antes.length + despues.length).toBe(receta.stepsRich.length);
  });

  it("el remate de las croquetas es freír, y el trabajo se queda en el domingo", () => {
    const { antes, despues, manosAntes, manosDespues } = partirReceta(porId("carnes_137"));
    expect(antes.at(-1).text).toMatch(/pan rallado/i);
    expect(despues.some((p) => /freír/i.test(p.text))).toBe(true);
    expect(manosAntes).toBeGreaterThan(manosDespues);
  });

  it("el precalentado del horno se lo lleva el día que toca, no el de la tanda", () => {
    // La lasaña empieza por "Precalentar el horno", así que por posición caería
    // en el adelanto: precalentar el domingo para hornear el jueves.
    const receta = porId("pasta_arroces_059");
    expect(receta.stepsRich[0].text).toMatch(/precalentar el horno/i);
    const { antes, despues } = partirReceta(receta);
    expect(antes.some((p) => /precalentar el horno/i.test(p.text))).toBe(false);
    expect(despues[0].text).toMatch(/precalentar el horno/i);
  });

  it("si el remate no usa horno, el precalentado no se cuela en él", () => {
    const { despues } = partirReceta(porId("carnes_137"));
    expect(despues.some((p) => /precalentar el horno/i.test(p.text))).toBe(false);
  });

  it("el ahorro son las manos que el plato deja de pedir ese día", () => {
    expect(ahorroDelDia(porId("pasta_arroces_059"))).toBeGreaterThan(20);
    expect(ahorroDelDia({ name: "sin adelanto" })).toBe(0);
  });
});

describe("los platos marcados en el catálogo", () => {
  const marcados = recipes.filter((r) => r.adelanto);

  it("todos parten dejando cocción para el día que toca", () => {
    expect(marcados.length).toBeGreaterThan(30);
    for (const r of marcados) {
      const { despues } = partirReceta(r);
      expect(despues.length, r.id).toBeGreaterThan(0);
      expect(
        despues.some((p) => /freír|hornear|gratinar|dorar|cocer|hervir|saltear|plancha|vapor/i.test(p.text)),
        `${r.id} ${r.name}`,
      ).toBe(true);
    }
  });

  it("ninguno baja del suelo de manos: por debajo, adelantar no compensa", () => {
    for (const r of marcados) {
      expect(ahorroDelDia(r), `${r.id} ${r.name}`).toBeGreaterThanOrEqual(MANOS_MINIMAS_DE_ADELANTO);
    }
  });

  it("ninguno es un guiso disfrazado: el remate nunca pasa de media hora de manos", () => {
    for (const r of marcados) {
      expect(partirReceta(r).manosDespues, `${r.id} ${r.name}`).toBeLessThanOrEqual(30);
    }
  });
});

describe("el fusible del corte", () => {
  const base = () => JSON.parse(JSON.stringify(recipes.find((r) => r.id === "carnes_137")));
  const fallos = (r) => validateRecipes([r]).filter((e) => /adelanto|cocción/i.test(e));

  it("deja pasar el catálogo tal y como está", () => {
    expect(fallos(base())).toEqual([]);
  });

  it("no admite un corte que se coma la receta entera", () => {
    const r = base();
    r.adelanto = { ...r.adelanto, hasta: r.stepsRich.length - 1 };
    expect(fallos(r)[0]).toMatch(/no deja ningún paso/);
  });

  it("no admite un corte cuyo remate sea solo emplatar", () => {
    const r = base();
    r.stepsRich = [
      { text: "Formar las croquetas.", minutes: 10, kind: "prep" },
      { text: "Servir las croquetas.", minutes: 1, kind: "emplatado" },
    ];
    r.steps = r.stepsRich.map((s) => s.text);
    r.adelanto = { ...r.adelanto, hasta: 0 };
    expect(fallos(r)[0]).toMatch(/no queda ninguna cocción/);
  });
});
