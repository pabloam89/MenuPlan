import { describe, expect, it } from "vitest";
import { resolverMenu } from "./solver.js";
import { buildGroupContext } from "./aiPlanner.js";
import { costeReceta } from "./coste.js";
import { filterRecipes } from "../utils/filterRecipes.js";
import { splitAchievableFreqs } from "../utils/validateMenu.js";

/**
 * El presupuesto en el solver (#958): lo prefiere sin romper la semana, y no
 * gana cambiando platos caros por platos sin precio. Este fichero solo usa lo
 * que ya existía (coste.js), para que con el solver de antes falle.
 */
const casa = {
  members: [{ id: "m1", age: 38 }, { id: "m2", age: 40 }],
  groups: [{ id: "g1", label: "Adultos", memberIds: ["m1", "m2"] }],
  meals: ["Comida", "Cena"], schedule: {}, slotType: {}, cookLevel: "normal",
  timeWeekday: 45, timeWeekend: 60, freqs: { legumbres: 2, verdura: 3, pescado: 2 }, allergiesReviewed: true,
};

function resolver(topeRacion) {
  const ctx = buildGroupContext(casa, casa.groups[0]);
  const { recipes: pool } = filterRecipes(ctx.filterOpts);
  const { achievable } = splitAchievableFreqs(pool, ctx.config.freqs);
  // Solo el tope de nodos, que es determinista (ver solver.test.js).
  const res = resolverMenu(ctx.slots, pool, { freqs: achievable, maxMs: 120000, semilla: 7, topeRacion });
  // Lo que no tiene precio no cuenta como 0 €: el plato sin fila se cuenta
  // aparte, y al incompleto se le sube el precio en proporción a las líneas
  // que le faltan (lo mismo que hace el solver para ordenar).
  let estimado = 0;
  let sinPrecio = 0;
  for (const a of res.asignaciones) {
    const c = costeReceta({ id: a.recipeId }, { modo: "granel" });
    if (c?.porRacion == null) sinPrecio++;
    else estimado += c.cobertura >= 1 ? c.porRacion : c.porRacion / Math.max(c.cobertura, 0.5);
  }
  return { res, estimado, sinPrecio };
}

describe("el solver con presupuesto", () => {
  it("uno que aprieta baja lo que se sabe que cuesta, deja la semana entera y no tira de lo sin precio", () => {
    const libre = resolver(null);
    const apretado = resolver(1);
    expect(apretado.res.completo).toBe(true);
    expect(apretado.estimado).toBeLessThan(libre.estimado);
    expect(apretado.sinPrecio).toBeLessThanOrEqual(libre.sinPrecio);
  }, 60000);

  it("uno holgado no cambia ni un plato", () => {
    expect(resolver(50).res.asignaciones).toEqual(resolver(null).res.asignaciones);
  }, 60000);
});
