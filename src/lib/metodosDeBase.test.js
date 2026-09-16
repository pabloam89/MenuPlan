import { describe, expect, it } from "vitest";

import { BASES, claveDeBase, manosDeMetodo, sesionDeBases, tiempoDeBase } from "./bases.js";
import { selectMethodForRecipe } from "./applianceMethods.js";

/**
 * El aparato de la casa, dentro de la cuenta de la tanda.
 *
 * Es donde el batch cooking deja de ser marginal. La bechamel a mano son
 * veinte minutos DE ESTAR ALLI removiendo; en Thermomix es cargar el vaso.
 * Mientras la sesion del domingo contaba siempre la cazuela, esa diferencia
 * no aparecia por ningun lado.
 */

const porId = Object.fromEntries(BASES.map((b) => [b.id, b]));
const bechamel = porId.bases_013;
const legumbre = porId.bases_004;

describe("metodos en las bases", () => {
  it("la base que se elige es la del aparato que hay en casa", () => {
    expect(selectMethodForRecipe(bechamel, ["Thermomix"])?.appliance).toBe("thermomix");
    // Sin el aparato declarado no hay metodo: se cocina como siempre.
    expect(selectMethodForRecipe(bechamel, ["Microondas"])).toBeNull();
    expect(selectMethodForRecipe(bechamel, [])).toBeNull();
  });

  it("ningun metodo tarda mas que la version tradicional", () => {
    // Un chip que no ahorra nada estorba: si aparece, es porque gana.
    const peores = [];
    for (const b of BASES) {
      for (const m of b.methods ?? []) {
        if (m.time >= b.time) peores.push(`${b.id}/${m.appliance}`);
      }
    }
    expect(peores).toEqual([]);
  });

  it("todo metodo dice como se hace", () => {
    const mudos = BASES.flatMap((b) => (b.methods ?? [])
      .filter((m) => !(m.prepSummary?.length > 40))
      .map((m) => `${b.id}/${m.appliance}`));
    expect(mudos).toEqual([]);
  });

  it("el aparato baja el reloj Y las manos", () => {
    const aMano = tiempoDeBase(bechamel, [4, 4]);
    const conTM = tiempoDeBase(bechamel, [4, 4], selectMethodForRecipe(bechamel, ["Thermomix"]));
    expect(conTM.minutos).toBeLessThan(aMano.minutos);
    // Lo que de verdad importa: dejar de estar delante.
    expect(conTM.minutosActivos).toBeLessThan(aMano.minutosActivos);
    expect(conTM.minutosActivos).toBeLessThanOrEqual(5);
  });

  it("las manos de un metodo son el picar, no una fraccion del reloj", () => {
    // La legumbre tiene nueve horas de pasos, casi todas de remojo. Una
    // fraccion sobre ese total daba medio minuto de atencion para algo que si
    // pide pelar, lavar y escurrir.
    const olla = selectMethodForRecipe(legumbre, ["Olla rápida"]);
    expect(olla?.appliance).toBe("olla_express");
    expect(manosDeMetodo(legumbre, olla)).toBeGreaterThan(5);
    // Y la Thermomix ademas pica, asi que pide menos que la olla.
    const tm = { appliance: "thermomix", time: 55 };
    expect(manosDeMetodo(legumbre, tm)).toBeLessThan(manosDeMetodo(legumbre, olla));
  });

  it("sin metodo, la cuenta es exactamente la de antes", () => {
    const a = tiempoDeBase(bechamel, [4, 4]);
    const b = tiempoDeBase(bechamel, [4, 4], null);
    expect(b).toEqual(a);
    expect(a.metodo).toBeNull();
  });

  it("la sesion del domingo cuenta con el aparato, y dice con cual", () => {
    const dias = ["Lun", "Mar"];
    const plan = { g1: { "Lun-Cena": { recipeId: "p1", eaters: 2 }, "Mar-Cena": { recipeId: "p2", eaters: 2 } } };
    const receta = (id) => ({ id, name: id, basesAparte: ["bechamel"], mealRole: ["cena"] });
    const catalogo = { p1: receta("p1"), p2: receta("p2") };
    const opts = { dias, comidas: ["Cena"] };

    const aMano = sesionDeBases(plan, catalogo, opts).bases
      .find((b) => claveDeBase(b.base) === "bechamel");
    const conTM = sesionDeBases(plan, catalogo, {
      ...opts,
      metodoDeBase: (b) => selectMethodForRecipe(b, ["Thermomix"]),
    }).bases.find((b) => claveDeBase(b.base) === "bechamel");

    expect(aMano.metodo).toBeNull();
    expect(conTM.metodo.appliance).toBe("thermomix");
    expect(conTM.minutos).toBeLessThan(aMano.minutos);
  });
});
