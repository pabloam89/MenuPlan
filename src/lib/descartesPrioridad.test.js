import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  PUNTOS_POR_ALCANCE,
  UMBRAL_DESCARTE,
  VENTANA_DIAS_DESCARTE,
  descartadasVigentes,
  fijarDescartadas,
  recetasDescartadas,
  sinDescartadas,
} from "./descartesPrioridad.js";
import { ALCANCE_DESCARTE } from "./vocabularios.js";
import { resolverMenu } from "./solver.js";
import { buildGroupContext } from "./aiPlanner.js";
import { filterRecipes } from "../utils/filterRecipes.js";
import { splitAchievableFreqs } from "../utils/validateMenu.js";

const AHORA = Date.parse("2026-10-30T12:00:00Z");
const haceDias = (n) => new Date(AHORA - n * 24 * 60 * 60 * 1000).toISOString();
const fila = (receta_id, alcance, dias = 1) => ({ receta_id, alcance, created_at: haceDias(dias) });

describe("recetasDescartadas: el criterio de prioridad", () => {
  it("una sola vez es ruido: un plato suelto (1 punto) no baja un plato", () => {
    expect(UMBRAL_DESCARTE).toBe(20); // décimas de punto: 2 puntos
    expect(recetasDescartadas([fila("a_1", ALCANCE_DESCARTE.PLATO)], { ahora: AHORA }).size).toBe(0);
  });

  it("sumar muchos descartes pequeños no falla por redondeo: 0,5 + 15 × 0,1 llega justo a 2 puntos", () => {
    const filas = [
      fila("a_1", ALCANCE_DESCARTE.DIA),
      ...Array.from({ length: 15 }, () => fila("a_1", ALCANCE_DESCARTE.MENU)),
    ];
    expect(recetasDescartadas(filas, { ahora: AHORA }).has("a_1")).toBe(true);
    expect(recetasDescartadas(filas.slice(0, -1), { ahora: AHORA }).has("a_1")).toBe(false);
  });

  it("dos platos sueltos del mismo plato (2 puntos) ya lo bajan", () => {
    const filas = [fila("a_1", ALCANCE_DESCARTE.PLATO, 1), fila("a_1", ALCANCE_DESCARTE.PLATO, 9)];
    expect([...recetasDescartadas(filas, { ahora: AHORA })]).toEqual(["a_1"]);
  });

  it("pesan distinto: cuatro días (2) lo bajan; veinte menús enteros (2) también, pero uno solo no", () => {
    const dias = Array.from({ length: 4 }, (_, i) => fila("b_2", ALCANCE_DESCARTE.DIA, i + 1));
    expect(recetasDescartadas(dias, { ahora: AHORA }).has("b_2")).toBe(true);
    const menus = Array.from({ length: 20 }, (_, i) => fila("c_3", ALCANCE_DESCARTE.MENU, (i % 50) + 1));
    expect(recetasDescartadas(menus, { ahora: AHORA }).has("c_3")).toBe(true);
    expect(recetasDescartadas([fila("c_3", ALCANCE_DESCARTE.MENU)], { ahora: AHORA }).size).toBe(0);
  });

  it("solo cuenta la ventana: lo de hace más de 60 días no suma", () => {
    const filas = [fila("a_1", ALCANCE_DESCARTE.PLATO, VENTANA_DIAS_DESCARTE + 1), fila("a_1", ALCANCE_DESCARTE.PLATO, 3)];
    expect(recetasDescartadas(filas, { ahora: AHORA }).size).toBe(0);
  });

  it("las favoritas van exentas y las filas raras no rompen nada", () => {
    const filas = [
      fila("a_1", ALCANCE_DESCARTE.PLATO), fila("a_1", ALCANCE_DESCARTE.PLATO),
      { receta_id: "d_4", alcance: "semana", created_at: haceDias(1) },
      { receta_id: null, alcance: ALCANCE_DESCARTE.PLATO, created_at: haceDias(1) },
      { receta_id: "e_5", alcance: ALCANCE_DESCARTE.PLATO, created_at: "no es una fecha" },
      null,
    ];
    expect(recetasDescartadas(filas, { ahora: AHORA, exentos: ["a_1"] }).size).toBe(0);
    expect(recetasDescartadas(filas, { ahora: AHORA }).has("a_1")).toBe(true);
    expect(recetasDescartadas(undefined).size).toBe(0);
  });

  it("los puntos tienen un valor para cada alcance del vocabulario", () => {
    for (const alcance of Object.values(ALCANCE_DESCARTE)) expect(PUNTOS_POR_ALCANCE[alcance]).toBeGreaterThan(0);
  });
});

describe("sinDescartadas: el escalón del cambio de plato", () => {
  const todas = [{ id: "a" }, { id: "b" }, { id: "c" }];

  it("saca los bajados de prioridad", () => {
    expect(sinDescartadas(todas, new Set(["a"])).map((r) => r.id)).toEqual(["b", "c"]);
  });

  it("si no quedaría ninguno, vuelven todos: un hueco sin plato es peor", () => {
    expect(sinDescartadas(todas, new Set(["a", "b", "c"]))).toBe(todas);
  });

  it("sin descartados no toca nada", () => {
    expect(sinDescartadas(todas, new Set())).toBe(todas);
    expect(sinDescartadas(todas, null)).toBe(todas);
  });
});

describe("la cuenta vigente", () => {
  it("empieza vacía, se fija y las exentas no cuentan", () => {
    fijarDescartadas([]);
    expect(descartadasVigentes().size).toBe(0);
    fijarDescartadas(["a_1", "b_2"]);
    expect([...descartadasVigentes()]).toEqual(["a_1", "b_2"]);
    expect([...descartadasVigentes({ exentos: ["a_1"] })]).toEqual(["b_2"]);
    fijarDescartadas([]);
  });
});

// El solver completo: los platos bajados de prioridad se quedan fuera cuando hay otro que sirva.
describe("el solver con platos bajados de prioridad", () => {
  const casa = {
    members: [{ id: "m1", age: 38 }, { id: "m2", age: 40 }],
    groups: [{ id: "g1", label: "Adultos", memberIds: ["m1", "m2"] }],
    meals: ["Comida", "Cena"], schedule: {}, slotType: {}, cookLevel: "normal",
    timeWeekday: 45, timeWeekend: 60, freqs: { legumbres: 2, verdura: 3, pescado: 2 }, allergiesReviewed: true,
  };
  beforeAll(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-29T12:00:00Z")); });
  afterAll(() => { vi.useRealTimers(); });

  function resolver(descartados) {
    const ctx = buildGroupContext(casa, casa.groups[0]);
    const { recipes: pool } = filterRecipes(ctx.filterOpts);
    const { achievable } = splitAchievableFreqs(pool, ctx.config.freqs);
    return resolverMenu(ctx.slots, pool, { freqs: achievable, maxMs: 120000, semilla: 7, descartados });
  }

  it("sin descartados (null o vacío) sale exactamente el mismo menú", () => {
    expect(resolver(new Set()).asignaciones).toEqual(resolver(null).asignaciones);
  }, 180000);

  it("con unos cuantos platos del menú de antes bajados, salen menos de ellos y el menú sigue completo", () => {
    const antes = resolver(null);
    const bajados = new Set([...new Set(antes.asignaciones.map((a) => a.recipeId))].slice(0, 6));
    const despues = resolver(bajados);
    const cuantos = (res) => res.asignaciones.filter((a) => bajados.has(a.recipeId)).length;
    expect(despues.completo).toBe(true);
    expect(cuantos(despues)).toBeLessThan(cuantos(antes));
  }, 180000);
});
