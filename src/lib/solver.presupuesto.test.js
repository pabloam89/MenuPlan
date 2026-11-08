import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { resolverMenu } from "./solver.js";
import { buildGroupContext } from "./aiPlanner.js";
import { precioDePlato, precioAlto } from "./presupuesto.js";
import { filterRecipes } from "../utils/filterRecipes.js";
import { splitAchievableFreqs } from "../utils/validateMenu.js";

/**
 * El presupuesto en el solver (#958): lo prefiere sin romper la semana, y no
 * gana cambiando platos caros por platos sin precio.
 */
const casa = {
  members: [{ id: "m1", age: 38 }, { id: "m2", age: 40 }],
  groups: [{ id: "g1", label: "Adultos", memberIds: ["m1", "m2"] }],
  meals: ["Comida", "Cena"], schedule: {}, slotType: {}, cookLevel: "normal",
  timeWeekday: 45, timeWeekend: 60, freqs: { legumbres: 2, verdura: 3, pescado: 2 }, allergiesReviewed: true,
};

// filterRecipes saca la estación del reloj: con la fecha fija, el pool es
// siempre el mismo, se corra el mes que se corra.
beforeAll(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-29T12:00:00Z")); });
afterAll(() => { vi.useRealTimers(); });

function resolver(topeRacion) {
  const ctx = buildGroupContext(casa, casa.groups[0]);
  const { recipes: pool } = filterRecipes(ctx.filterOpts);
  const { achievable } = splitAchievableFreqs(pool, ctx.config.freqs);
  // La búsqueda la corta el tope de NODOS (400 por defecto), que es
  // determinista; el de milisegundos va alto para que no corte antes en una
  // máquina cargada (como en solver.test.js).
  const res = resolverMenu(ctx.slots, pool, { freqs: achievable, maxMs: 120000, semilla: 7, topeRacion });
  // Lo que no tiene precio no cuenta como 0 €: el plato sin fila se cuenta
  // aparte, y el incompleto va con precioAlto, como lo ordena el solver.
  let estimado = 0;
  let sinPrecio = 0;
  for (const a of res.asignaciones) {
    const p = precioDePlato(a.recipeId);
    if (!p) sinPrecio++;
    else estimado += precioAlto(p);
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
  }, 180000);

  it("uno holgado no cambia ni un plato", () => {
    expect(resolver(50).res.asignaciones).toEqual(resolver(null).res.asignaciones);
  }, 180000);
});
