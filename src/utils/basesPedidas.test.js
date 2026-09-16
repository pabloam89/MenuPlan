import { describe, expect, it } from "vitest";

import { applyFallback, basesAlcanzables, validateMenu } from "./validateMenu.js";
import { MAX_POR_SEMANA, POR_DEFECTO_POR_SEMANA, basesPedidas } from "../lib/bases.js";

/**
 * La regla 11b: una base pedida sale al menos N veces, o no sale.
 *
 * Es la única de MÍNIMO del validador, y va al revés que los objetivos
 * semanales a propósito. "Como mucho un pescado" es un tope; "ponme dos de
 * sofrito" es lo contrario, porque una tanda existe precisamente porque dos
 * platos comparten la olla. Con uno solo, lo cocinas ese día y no hay nada que
 * partir — de ahí que sea todo o nada.
 */

const receta = (id, extra = {}) => ({
  id,
  name: id,
  mealRole: ["cena"],
  ingredients: [],
  allergens: [],
  time: 20,
  kcal: 400,
  ...extra,
});

const slot = (slotId) => ({ slotId, mode: "normal", maxTime: 90 });

const CON_SOFRITO = receta("con-sofrito", { basesAparte: ["sofrito"] });
const CON_SOFRITO_2 = receta("con-sofrito-2", { basesAparte: ["sofrito"] });
const SIN_NADA_1 = receta("sin-1");
const SIN_NADA_2 = receta("sin-2");
const POOL = [CON_SOFRITO, CON_SOFRITO_2, SIN_NADA_1, SIN_NADA_2];
const SLOTS = [slot("lun_cena"), slot("mar_cena")];

const reglasDe = (asignaciones, pedidas) =>
  validateMenu(asignaciones, POOL, SLOTS, [], {}, pedidas).violations
    .filter((v) => v.rule === "base_pedida_insuficiente");

describe("regla 11b · las bases pedidas salen o no salen", () => {
  it("avisa cuando falta una", () => {
    const v = reglasDe(
      [{ slotId: "lun_cena", recipeId: "con-sofrito" }, { slotId: "mar_cena", recipeId: "sin-1" }],
      { sofrito: 2 },
    );
    expect(v).toHaveLength(1);
    expect(v[0].targetKey).toBe("sofrito");
    // Se ofrece el hueco SIN base, no el que ya la lleva: cambiar ese sería
    // quitar un sofrito para poner otro.
    expect(v[0].slotId).toBe("mar_cena");
  });

  it("no avisa cuando ya salen las que se piden", () => {
    expect(reglasDe(
      [{ slotId: "lun_cena", recipeId: "con-sofrito" }, { slotId: "mar_cena", recipeId: "con-sofrito-2" }],
      { sofrito: 2 },
    )).toEqual([]);
  });

  it("sin bases pedidas no dice nada", () => {
    expect(reglasDe(
      [{ slotId: "lun_cena", recipeId: "sin-1" }, { slotId: "mar_cena", recipeId: "sin-2" }],
      {},
    )).toEqual([]);
  });

  it("dos bases cortas no se pelean por el mismo hueco", () => {
    const pool = [...POOL, receta("con-pesto", { basesAparte: ["pesto"] })];
    const v = validateMenu(
      [{ slotId: "lun_cena", recipeId: "sin-1" }, { slotId: "mar_cena", recipeId: "sin-2" }],
      pool, SLOTS, [], {}, { sofrito: 1, pesto: 1 },
    ).violations.filter((x) => x.rule === "base_pedida_insuficiente");
    expect(v).toHaveLength(2);
    expect(new Set(v.map((x) => x.slotId)).size).toBe(2);
  });

  it("el arreglo mete un plato que SÍ lleva esa base", () => {
    const antes = [
      { slotId: "lun_cena", recipeId: "con-sofrito" },
      { slotId: "mar_cena", recipeId: "sin-1" },
    ];
    const v = reglasDe(antes, { sofrito: 2 });
    const despues = applyFallback(antes, v, POOL, SLOTS);
    expect(despues.find((s) => s.slotId === "mar_cena")?.recipeId).toBe("con-sofrito-2");
  });
});

describe("basesAlcanzables · todo o nada", () => {
  it("deja fuera la base que el recetario no puede dar entera", () => {
    // Solo hay dos platos con sofrito en el pool: pedir tres no cabe.
    const { alcanzables, warnings } = basesAlcanzables(POOL, { sofrito: 3 }, 7);
    expect(alcanzables).toEqual({});
    expect(warnings[0]).toContain("sofrito");
  });

  it("deja fuera la que no cabe en una semana acortada", () => {
    // Dos platos con sofrito existen, pero la semana tiene un solo hueco.
    const { alcanzables, warnings } = basesAlcanzables(POOL, { sofrito: 2 }, 1);
    expect(alcanzables).toEqual({});
    expect(warnings[0]).toContain("hueco");
  });

  it("la que cabe entera pasa tal cual", () => {
    expect(basesAlcanzables(POOL, { sofrito: 2 }, 7).alcanzables).toEqual({ sofrito: 2 });
  });

  it("media tanda no existe: nunca recorta el número pedido", () => {
    // Es la decisión de producto: con una sola aparición la base es inútil,
    // porque ese plato lo cocinas ese día y no hay nada que partir.
    const { alcanzables } = basesAlcanzables(POOL, { sofrito: 4 }, 7);
    expect(alcanzables.sofrito).toBeUndefined();
  });
});

describe("basesPedidas · lo que el selector escribe en la libreta", () => {
  it("lee el número de huecos, no un sí/no", () => {
    expect(basesPedidas({ base: { sofrito: 2, pasta: 1 } })).toEqual({ sofrito: 2, pasta: 1 });
  });

  it("ignora el cero y lo negativo", () => {
    expect(basesPedidas({ base: { sofrito: 0, pasta: -1 } })).toEqual({});
  });

  it("recorta al tope del deslizador", () => {
    expect(basesPedidas({ base: { sofrito: 99 } })).toEqual({ sofrito: MAX_POR_SEMANA });
  });

  it("el valor por defecto del deslizador es el mínimo que hace tanda", () => {
    expect(POR_DEFECTO_POR_SEMANA).toBe(2);
    expect(MAX_POR_SEMANA).toBe(4);
  });

  it("sin libreta no pide nada", () => {
    expect(basesPedidas(null)).toEqual({});
    expect(basesPedidas({})).toEqual({});
  });
});
