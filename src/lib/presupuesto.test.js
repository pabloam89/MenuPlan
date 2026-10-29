import { describe, expect, it } from "vitest";
import {
  VEREDICTOS, PARTE_CONOCIDA_MINIMA, presupuestoSemanal, topePorRacion, precioDePlato,
  estimarSemana, veredicto, frasePresupuesto,
} from "./presupuesto.js";
import recipeCoste from "../data/derived/recipeCoste.json" with { type: "json" };
import { resolverMenu } from "./solver.js";
import { buildGroupContext } from "./aiPlanner.js";
import { filterRecipes } from "../utils/filterRecipes.js";
import { splitAchievableFreqs } from "../utils/validateMenu.js";

// Ids reales de la tabla: uno con todas sus líneas con precio y otro al que
// le falta alguna. Así el test no se rompe cuando cambian los precios.
const filas = Object.entries(recipeCoste.recetas).filter(([, f]) => f.porRacion != null);
const [COMPLETA, fCompleta] = filas.find(([, f]) => f.cobertura >= 1);
const [INCOMPLETA, fIncompleta] = filas.find(([, f]) => f.cobertura < 1);

const plan = (huecos, gid = "g1") => ({ _warnings: ["x"], [gid]: huecos });

describe("presupuestoSemanal: el único que lee hasBudget y budget", () => {
  it("sin el interruptor no hay presupuesto, aunque quede el número", () => {
    expect(presupuestoSemanal({ hasBudget: false, budget: 80 })).toBeNull();
    expect(presupuestoSemanal({ budget: 80 })).toBeNull();
    expect(presupuestoSemanal(null)).toBeNull();
  });
  it("con él, el número; un cero o basura no es un presupuesto", () => {
    expect(presupuestoSemanal({ hasBudget: true, budget: 80 })).toBe(80);
    expect(presupuestoSemanal({ hasBudget: true, budget: "95" })).toBe(95);
    expect(presupuestoSemanal({ hasBudget: true, budget: 0 })).toBeNull();
    expect(presupuestoSemanal({ hasBudget: true, budget: "mucho" })).toBeNull();
  });
  it("el tope por ración reparte el presupuesto entre las raciones", () => {
    expect(topePorRacion(84, 28)).toBe(3);
    expect(topePorRacion(null, 28)).toBeNull();
    expect(topePorRacion(84, 0)).toBeNull();
  });
});

describe("estimarSemana: lo que no tiene precio no cuenta como 0 €", () => {
  it("suma € por ración × raciones, con el id con prefijo de grupo", () => {
    const est = estimarSemana(plan({ "Lun-Cena": { recipeId: `g1__${COMPLETA}`, raciones: 2 } }));
    expect(est.euros).toBeCloseTo(fCompleta.porRacion * 2, 2);
    expect(est).toMatchObject({ raciones: 2, conPrecio: 2, incompletas: 0, sinPrecio: 0 });
  });
  it("un plato al que le falta alguna línea cuenta, pero como incompleto", () => {
    const est = estimarSemana(plan({ "Lun-Cena": { recipeId: INCOMPLETA, eaters: 3 } }));
    expect(est.euros).toBeCloseTo(fIncompleta.porRacion * 3, 2);
    expect(est).toMatchObject({ conPrecio: 0, incompletas: 3 });
  });
  it("un plato sin fila (receta de la familia) suma 0 € pero queda contado y con nombre", () => {
    const est = estimarSemana(
      plan({ "Lun-Cena": { recipeId: "user_123", raciones: 2 }, "Mar-Cena": { recipeId: COMPLETA, raciones: 2 } }),
      { recetas: [{ id: "user_123", name: "Tortilla de la abuela" }] },
    );
    expect(est).toMatchObject({ raciones: 4, conPrecio: 2, sinPrecio: 2, platosSinPrecio: ["Tortilla de la abuela"] });
  });
  it("primero y segundo cuentan los dos; lo del congelador ya está pagado", () => {
    const est = estimarSemana(plan({
      "Lun-Comida": { firstRecipeId: COMPLETA, recipeId: COMPLETA, raciones: 2 },
      "Mar-Comida": { recipeId: COMPLETA, raciones: 2, fromFreezer: true },
    }));
    expect(est.raciones).toBe(4);
  });
  it("con guarnición añadida, el plato pasa a incompleto (su precio no está en la tabla)", () => {
    const est = estimarSemana(plan({ "Lun-Cena": { recipeId: COMPLETA, raciones: 2 } }), { recetas: [{ id: COMPLETA, garnishId: "g_arroz" }] });
    expect(est).toMatchObject({ conPrecio: 0, incompletas: 2 });
  });
});

describe("veredicto: vocabulario cerrado y honesto", () => {
  const est = (o) => ({ euros: 50, raciones: 10, conPrecio: 10, incompletas: 0, sinPrecio: 0, platosSinPrecio: [], ...o });
  it("solo dice uno de VEREDICTOS, o null sin presupuesto", () => {
    expect(VEREDICTOS).toEqual(["cabe", "no_cabe", "incierto"]);
    expect(veredicto(null, est())).toBeNull();
    expect(veredicto(80, est({ raciones: 0 }))).toBeNull();
  });
  it("el mínimo ya pasa: no cabe, aunque falten precios", () => {
    expect(veredicto(40, est({ conPrecio: 2, sinPrecio: 8 }))).toBe("no_cabe");
  });
  it("no pasa, pero mucho sin saber: incierto, nunca «cabe»", () => {
    const conocidas = Math.floor(10 * PARTE_CONOCIDA_MINIMA) - 1;
    expect(veredicto(80, est({ conPrecio: conocidas, sinPrecio: 10 - conocidas }))).toBe("incierto");
    expect(veredicto(80, est())).toBe("cabe");
  });
  it("la frase dice el número, el presupuesto y lo que falta", () => {
    expect(frasePresupuesto(80, est())).toBe("La comida de la semana sale por unos 50 € a precio de Mercadona por kilo: cabe en el presupuesto de 80 €.");
    expect(frasePresupuesto(40, est({ conPrecio: 7, sinPrecio: 3 }))).toMatch(/al menos 50 €.*30 %.*no cabe en el presupuesto de 40 €/);
    expect(frasePresupuesto(null, est())).toBeNull();
  });
});

describe("el solver con presupuesto: lo prefiere sin romper la semana", () => {
  const casa = {
    members: [{ id: "m1", age: 38 }, { id: "m2", age: 40 }],
    groups: [{ id: "g1", label: "Adultos", memberIds: ["m1", "m2"] }],
    meals: ["Comida", "Cena"], schedule: {}, slotType: {}, cookLevel: "normal",
    timeWeekday: 45, timeWeekend: 60, freqs: { legumbres: 2, verdura: 3, pescado: 2 }, allergiesReviewed: true,
  };
  const resolver = (topeRacion) => {
    const ctx = buildGroupContext(casa, casa.groups[0]);
    const { recipes: pool } = filterRecipes(ctx.filterOpts);
    const { achievable } = splitAchievableFreqs(pool, ctx.config.freqs);
    const res = resolverMenu(ctx.slots, pool, { freqs: achievable, maxMs: 120000, semilla: 7, topeRacion });
    const coste = res.asignaciones.reduce((s, a) => s + (precioDePlato(a.recipeId)?.porRacion ?? 0), 0);
    return { res, coste, ctx };
  };

  it("un presupuesto que aprieta baja el coste de la semana y la deja entera", () => {
    const libre = resolver(null);
    const apretado = resolver(1);
    expect(apretado.res.completo).toBe(true);
    expect(apretado.coste).toBeLessThan(libre.coste);
  }, 60000);

  it("uno holgado no cambia ni un plato", () => {
    const libre = resolver(null);
    const holgado = resolver(50);
    expect(holgado.res.asignaciones).toEqual(libre.res.asignaciones);
  }, 60000);
});
