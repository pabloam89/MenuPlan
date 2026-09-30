/**
 * Nada que haya que empezar otro día puede proponerse como plato rápido.
 *
 * `time` cuenta el trabajo y no el reloj, que es lo correcto para un guiso:
 * cuatro horas al fuego son cuatro horas que no estás en la cocina. Pero hay
 * pasos que sencillamente no ocurren hoy —congelar el salmón 48 h por el
 * anisakis, el remojo de la noche anterior— y con esos el usuario tiene que
 * enterarse ANTES de elegir el plato, no al abrir la receta.
 */

import { describe, it, expect } from "vitest";
import { recipeCatalog } from "./recipeCatalog.js";
import { necesitaVispera, MINUTOS_DE_VISPERA } from "./recipeSchema.js";
import { recipeMatchesPreferType } from "../utils/filterRecipes.js";

describe("necesitaVispera", () => {
  it("mira los pasos, no el tiempo declarado", () => {
    expect(necesitaVispera({ stepsRich: [{ minutes: 2880 }, { minutes: 5 }] })).toBe(true);
    expect(necesitaVispera({ stepsRich: [{ minutes: 120 }] })).toBe(false);
    expect(necesitaVispera({ stepsRich: [] })).toBe(false);
    expect(necesitaVispera({})).toBe(false);
    expect(necesitaVispera(null)).toBe(false);
  });

  it("corta en 12 h, que es lo que separa esta tarde de otro día", () => {
    expect(MINUTOS_DE_VISPERA).toBe(720);
    expect(necesitaVispera({ stepsRich: [{ minutes: 719 }] })).toBe(false);
    expect(necesitaVispera({ stepsRich: [{ minutes: 720 }] })).toBe(true);
  });
});

describe("los platos rápidos", () => {
  /**
   * EL CASO QUE LO DESTAPÓ. «Carpaccio de salmón con cítricos» es `montaje:
   * true`, y el atajo de `cena_rapida` devolvía true por esa vía sin llegar a
   * mirar el tiempo. La app podía ofrecerlo como cena de hoy teniendo por
   * primer paso «Congelar un mínimo de 48 h antes».
   */
  it("no proponen un carpaccio que había que congelar anteayer", () => {
    const carpaccio = recipeCatalog.find((r) => r.id === "pescados_059");
    expect(carpaccio, "pescados_059 ya no está en el catálogo").toBeTruthy();
    expect(necesitaVispera(carpaccio)).toBe(true);
    expect(recipeMatchesPreferType(carpaccio, "cena_rapida", 2)).toBe(false);
  });

  it("y ninguna receta de víspera pasa por rápida, sea montaje o no", () => {
    const coladas = recipeCatalog
      .filter((r) => necesitaVispera(r))
      .filter(
        (r) =>
          recipeMatchesPreferType(r, "cena_rapida", 2) ||
          recipeMatchesPreferType(r, "comida_rapida", 2),
      )
      .map((r) => `${r.id} ${r.name}`);
    expect(coladas).toEqual([]);
  });

  /**
   * Y el atajo del montaje sigue existiendo para lo que se inventó: un plato
   * que se monta sin cocinar ES una cena rápida aunque el tiempo no lo diga.
   */
  it("pero el montaje sin víspera sigue contando como cena rápida", () => {
    const montajes = recipeCatalog.filter(
      (r) => r.montaje && !necesitaVispera(r) && (r.mealRole ?? []).includes("cena"),
    );
    expect(montajes.length).toBeGreaterThan(10);
    expect(recipeMatchesPreferType(montajes[0], "cena_rapida", 2)).toBe(true);
  });
});
