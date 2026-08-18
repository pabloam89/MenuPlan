import { describe, it, expect } from "vitest";
import {
  assignFreezerToPlan,
  assignFridgeToSlot,
  assignFreezerToSlot,
  catalogIdOfPlanRecipe,
  clearFreezerFromSlot,
  cookedAgoLabel,
  cookedEatersFor,
  fridgePortionsFor,
  frozenPortionsFor,
  indexFridgeDishes,
  indexFrozenDishes,
  isFridgeCookedDish,
  isFrozenCookedDish,
  pickFridgeItem,
  pickFrozenItem,
  portionsLabel,
  slotUsesFridge,
  slotUsesFreezer,
  slotUsesPrepared,
  splitSlotPortions,
} from "./freezer.js";

function frozenDish(recipeRef, portions, extra = {}) {
  return {
    id: `p_${recipeRef}_${portions}`,
    itemType: "cooked_dish",
    frozen: true,
    recipeRef,
    portions,
    qty: portions,
    unit: "racion",
    cookedAt: "2026-08-01T12:00:00.000Z",
    ...extra,
  };
}

function fridgeDish(recipeRef, portions, extra = {}) {
  return {
    id: `f_${recipeRef}_${portions}`,
    itemType: "cooked_dish",
    frozen: false,
    recipeRef,
    portions,
    qty: portions,
    unit: "racion",
    cookedAt: "2026-08-10T12:00:00.000Z",
    ...extra,
  };
}

describe("isFrozenCookedDish", () => {
  it("solo acepta platos cocinados, congelados y con receta", () => {
    expect(isFrozenCookedDish(frozenDish("carnes_003", 2))).toBe(true);
    // Un ingrediente congelado (guisantes) no es un plato listo para comer.
    expect(isFrozenCookedDish({ itemType: "ingredient", frozen: true, recipeRef: "x" })).toBe(false);
    // Un tupper en la nevera no vale para el flujo de descongelado.
    expect(isFrozenCookedDish({ itemType: "cooked_dish", frozen: false, recipeRef: "x" })).toBe(false);
    // Sin recipeRef no hay forma de emparejarlo con un hueco del menú.
    expect(isFrozenCookedDish({ itemType: "cooked_dish", frozen: true })).toBe(false);
    expect(isFrozenCookedDish(null)).toBe(false);
  });
});

describe("splitSlotPortions", () => {
  it("cubre el hueco entero cuando hay raciones de sobra", () => {
    expect(splitSlotPortions(2, 4)).toEqual({ frozenPortions: 2, freshPortions: 0 });
  });

  it("reparte cuando el congelador no llega a todos los comensales", () => {
    expect(splitSlotPortions(4, 2)).toEqual({ frozenPortions: 2, freshPortions: 2 });
  });

  it("sin raciones congeladas hay que cocinarlo todo", () => {
    expect(splitSlotPortions(3, 0)).toEqual({ frozenPortions: 0, freshPortions: 3 });
  });

  it("ignora raciones fraccionarias y valores basura", () => {
    expect(splitSlotPortions(4, 2.7)).toEqual({ frozenPortions: 2, freshPortions: 2 });
    expect(splitSlotPortions(4, -5)).toEqual({ frozenPortions: 0, freshPortions: 4 });
    expect(splitSlotPortions(0, 2)).toEqual({ frozenPortions: 1, freshPortions: 0 });
  });
});

describe("cookedEatersFor", () => {
  it("un slot normal cocina para todos sus comensales", () => {
    expect(cookedEatersFor({ eaters: 4 })).toBe(4);
  });

  it("un slot cubierto del todo no cocina nada", () => {
    const slot = { eaters: 2, fromFreezer: true, frozenPortions: 2, freshPortions: 0 };
    expect(cookedEatersFor(slot)).toBe(0);
  });

  it("un slot parcial cocina solo las raciones que faltan", () => {
    const slot = { eaters: 4, fromFreezer: true, frozenPortions: 2, freshPortions: 2 };
    expect(cookedEatersFor(slot)).toBe(2);
  });

  it("fromFreezer con 0 raciones no cuenta: se cocina normal", () => {
    // Un flag mal puesto no puede hacer desaparecer la compra de un plato.
    const slot = { eaters: 4, fromFreezer: true, frozenPortions: 0, freshPortions: 4 };
    expect(slotUsesFreezer(slot)).toBe(false);
    expect(cookedEatersFor(slot)).toBe(4);
  });
});

describe("indexFrozenDishes / pickFrozenItem", () => {
  it("agrupa por receta y gasta primero lo más antiguo", () => {
    const viejo = frozenDish("carnes_003", 2, { id: "viejo", cookedAt: "2026-07-01T10:00:00.000Z" });
    const nuevo = frozenDish("carnes_003", 3, { id: "nuevo", cookedAt: "2026-08-10T10:00:00.000Z" });
    const otra = frozenDish("legumbres_001", 4, { id: "otra" });
    const idx = indexFrozenDishes([nuevo, otra, viejo]);

    expect(idx.get("carnes_003").map((i) => i.id)).toEqual(["viejo", "nuevo"]);
    expect(pickFrozenItem([nuevo, otra, viejo], "carnes_003").id).toBe("viejo");
    expect(pickFrozenItem([nuevo, otra, viejo], "no_existe")).toBe(null);
  });

  it("descarta items sin raciones", () => {
    const idx = indexFrozenDishes([frozenDish("carnes_003", 0)]);
    expect(idx.has("carnes_003")).toBe(false);
  });
});

describe("frozenPortionsFor", () => {
  it("suma las raciones de todos los tuppers de la misma receta", () => {
    const stock = [
      frozenDish("carnes_003", 2, { id: "a" }),
      frozenDish("carnes_003", 3, { id: "b" }),
      frozenDish("legumbres_001", 4, { id: "c" }),
    ];
    expect(frozenPortionsFor(stock, "carnes_003")).toBe(5);
    expect(frozenPortionsFor(stock, "legumbres_001")).toBe(4);
    expect(frozenPortionsFor(stock, "nada")).toBe(0);
    expect(frozenPortionsFor(stock, null)).toBe(0);
  });
});

describe("ámbito por plato dentro del hueco", () => {
  // Un hueco de comida lleva primero y segundo; que uno salga del congelador no
  // puede hacer desaparecer los ingredientes del otro.
  const slot = {
    firstRecipeId: "sopa_001",
    recipeId: "carnes_003",
    eaters: 4,
    fromFreezer: true,
    frozenRecipeId: "carnes_003",
    frozenPortions: 4,
    freshPortions: 0,
  };

  it("solo el plato marcado cuenta como del congelador", () => {
    expect(slotUsesFreezer(slot, "carnes_003")).toBe(true);
    expect(slotUsesFreezer(slot, "sopa_001")).toBe(false);
    // Sin receta: "¿hay algo del congelador en este hueco?".
    expect(slotUsesFreezer(slot)).toBe(true);
  });

  it("el primero se sigue cocinando para todos", () => {
    expect(cookedEatersFor(slot, "carnes_003")).toBe(0);
    expect(cookedEatersFor(slot, "sopa_001")).toBe(4);
  });

  it("un slot viejo sin frozenRecipeId se interpreta como el plato principal", () => {
    const legacy = { recipeId: "carnes_003", firstRecipeId: "sopa_001", eaters: 2, fromFreezer: true, frozenPortions: 2, freshPortions: 0 };
    expect(slotUsesFreezer(legacy, "carnes_003")).toBe(true);
    expect(slotUsesFreezer(legacy, "sopa_001")).toBe(false);
  });
});

describe("assignFreezerToSlot / clearFreezerFromSlot", () => {
  it("marca el slot con el reparto y el item de origen", () => {
    const slot = { recipeId: "carnes_003", eaters: 4 };
    const next = assignFreezerToSlot(slot, frozenDish("carnes_003", 2, { id: "tupper1" }));
    expect(next).toMatchObject({
      fromFreezer: true,
      frozenItemId: "tupper1",
      frozenRecipeId: "carnes_003",
      frozenPortions: 2,
      freshPortions: 2,
    });
    // Puro: el slot original no se toca.
    expect(slot.fromFreezer).toBeUndefined();
  });

  it("puede marcar el primer plato en vez del principal", () => {
    const slot = { firstRecipeId: "sopa_001", recipeId: "carnes_003", eaters: 2 };
    const next = assignFreezerToSlot(slot, frozenDish("sopa_001", 2), "sopa_001");
    expect(next.frozenRecipeId).toBe("sopa_001");
    expect(slotUsesFreezer(next, "sopa_001")).toBe(true);
    expect(slotUsesFreezer(next, "carnes_003")).toBe(false);
  });

  it("no marca nada si el item no tiene raciones", () => {
    const slot = { recipeId: "carnes_003", eaters: 4 };
    expect(assignFreezerToSlot(slot, frozenDish("carnes_003", 0))).toBe(slot);
    expect(assignFreezerToSlot(slot, null)).toBe(slot);
  });

  it("clearFreezerFromSlot deja el slot como estaba", () => {
    const slot = { recipeId: "carnes_003", eaters: 4 };
    const marked = assignFreezerToSlot(slot, frozenDish("carnes_003", 2));
    expect(clearFreezerFromSlot(marked)).toEqual(slot);
    // Un slot que nunca fue del congelador se devuelve tal cual.
    expect(clearFreezerFromSlot(slot)).toBe(slot);
  });
});

describe("catalogIdOfPlanRecipe", () => {
  it("quita el prefijo de grupo de los menús multi-grupo", () => {
    expect(catalogIdOfPlanRecipe("g_abc__carnes_003")).toBe("carnes_003");
    expect(catalogIdOfPlanRecipe("carnes_003")).toBe("carnes_003");
    expect(catalogIdOfPlanRecipe(null)).toBe("");
  });
});

describe("assignFreezerToPlan", () => {
  const DAYS = ["Lun", "Mar", "Mie"];
  const MEALS = ["Comida", "Cena"];
  const run = (plan, stock) =>
    assignFreezerToPlan(plan, stock, { days: DAYS, mealLabels: MEALS });

  it("marca el hueco cuyo plato principal está en el congelador", () => {
    const plan = {
      g1: {
        "Lun-Comida": { recipeId: "carnes_003", eaters: 4 },
        "Mar-Comida": { recipeId: "pescados_001", eaters: 4 },
      },
    };
    expect(run(plan, [frozenDish("carnes_003", 4)])).toBe(1);
    expect(plan.g1["Lun-Comida"]).toMatchObject({
      fromFreezer: true,
      frozenRecipeId: "carnes_003",
      frozenPortions: 4,
      freshPortions: 0,
    });
    expect(plan.g1["Mar-Comida"].fromFreezer).toBeUndefined();
  });

  it("no deja que dos huecos reclamen el mismo tupper", () => {
    // 4 raciones, dos huecos de 4: el primero (lunes) se las lleva enteras y el
    // segundo se cocina normal.
    const plan = {
      g1: {
        "Lun-Comida": { recipeId: "carnes_003", eaters: 4 },
        "Mie-Comida": { recipeId: "carnes_003", eaters: 4 },
      },
    };
    expect(run(plan, [frozenDish("carnes_003", 4)])).toBe(1);
    expect(plan.g1["Lun-Comida"].frozenPortions).toBe(4);
    expect(plan.g1["Mie-Comida"].fromFreezer).toBeUndefined();
  });

  it("reparte un stock corto entre huecos consecutivos", () => {
    // 3 raciones y dos huecos de 2: lunes se lleva 2, miércoles la que queda y
    // cocina 1 más.
    const plan = {
      g1: {
        "Lun-Comida": { recipeId: "carnes_003", eaters: 2 },
        "Mie-Comida": { recipeId: "carnes_003", eaters: 2 },
      },
    };
    expect(run(plan, [frozenDish("carnes_003", 3)])).toBe(2);
    expect(plan.g1["Lun-Comida"]).toMatchObject({ frozenPortions: 2, freshPortions: 0 });
    expect(plan.g1["Mie-Comida"]).toMatchObject({ frozenPortions: 1, freshPortions: 1 });
  });

  it("respeta el orden cronológico, no el de las claves del objeto", () => {
    const plan = {
      g1: {
        "Mie-Comida": { recipeId: "carnes_003", eaters: 2 },
        "Lun-Cena": { recipeId: "carnes_003", eaters: 2 },
      },
    };
    run(plan, [frozenDish("carnes_003", 2)]);
    // Lunes cena va antes que miércoles comida aunque esté después en el objeto.
    expect(plan.g1["Lun-Cena"].fromFreezer).toBe(true);
    expect(plan.g1["Mie-Comida"].fromFreezer).toBeUndefined();
  });

  it("funciona con ids prefijados de menús multi-grupo", () => {
    const plan = {
      g_adultos: { "Lun-Comida": { recipeId: "g_adultos__carnes_003", eaters: 2 } },
    };
    expect(run(plan, [frozenDish("carnes_003", 2)])).toBe(1);
    expect(plan.g_adultos["Lun-Comida"].frozenRecipeId).toBe("g_adultos__carnes_003");
  });

  it("no toca un hueco ya marcado ni las claves internas del plan", () => {
    const plan = {
      _warnings: [],
      g1: {
        "Lun-Comida": { recipeId: "carnes_003", eaters: 2, fromFreezer: true, frozenPortions: 2, freshPortions: 0 },
      },
    };
    expect(run(plan, [frozenDish("carnes_003", 2)])).toBe(0);
    expect(plan._warnings).toEqual([]);
  });

  it("sin nada en el congelador no hace nada", () => {
    const plan = { g1: { "Lun-Comida": { recipeId: "carnes_003", eaters: 2 } } };
    expect(run(plan, [])).toBe(0);
    expect(plan.g1["Lun-Comida"].fromFreezer).toBeUndefined();
  });

  it("marca huecos con platos de nevera (fromFridge)", () => {
    const plan = { g1: { "Lun-Comida": { recipeId: "carnes_003", eaters: 2 } } };
    expect(run(plan, [fridgeDish("carnes_003", 2)])).toBe(1);
    expect(plan.g1["Lun-Comida"]).toMatchObject({
      fromFridge: true,
      fridgePortions: 2,
      freshPortions: 0,
    });
  });

  it("nevera va antes que congelador en el mismo plato", () => {
    const plan = {
      g1: {
        "Lun-Comida": { recipeId: "carnes_003", eaters: 2 },
        "Mar-Comida": { recipeId: "carnes_003", eaters: 2 },
      },
    };
    expect(run(plan, [fridgeDish("carnes_003", 2), frozenDish("carnes_003", 2)])).toBe(2);
    expect(plan.g1["Lun-Comida"].fromFridge).toBe(true);
    expect(plan.g1["Mar-Comida"].fromFreezer).toBe(true);
  });

  it("guarda preparedGarnishRef del tupper", () => {
    const plan = { g1: { "Lun-Comida": { recipeId: "carnes_003", eaters: 2 } } };
    run(plan, [fridgeDish("carnes_003", 2, { garnishRef: "guarniciones_001" })]);
    expect(plan.g1["Lun-Comida"].preparedGarnishRef).toBe("guarniciones_001");
  });
});

describe("nevera helpers", () => {
  it("isFridgeCookedDish distingue nevera de congelador", () => {
    expect(isFridgeCookedDish(fridgeDish("carnes_003", 2))).toBe(true);
    expect(isFridgeCookedDish(frozenDish("carnes_003", 2))).toBe(false);
  });

  it("slotUsesPrepared cubre nevera y congelador", () => {
    expect(slotUsesPrepared({ fromFridge: true, fridgePortions: 2, recipeId: "x" }, "x")).toBe(true);
    expect(slotUsesPrepared({ fromFreezer: true, frozenPortions: 2, recipeId: "x" }, "x")).toBe(true);
  });

  it("assignFridgeToSlot marca el slot", () => {
    const slot = { eaters: 4, recipeId: "carnes_003" };
    const next = assignFridgeToSlot(slot, fridgeDish("carnes_003", 3));
    expect(next.fromFridge).toBe(true);
    expect(next.fridgePortions).toBe(3);
    expect(next.freshPortions).toBe(1);
  });
});

describe("etiquetas", () => {
  it("portionsLabel singulariza", () => {
    expect(portionsLabel(1)).toBe("1 ración");
    expect(portionsLabel(3)).toBe("3 raciones");
    expect(portionsLabel(0)).toBe("0 raciones");
  });

  it("cookedAgoLabel usa lenguaje natural", () => {
    const iso = (daysAgo) => new Date(Date.now() - daysAgo * 86400000).toISOString();
    expect(cookedAgoLabel(iso(0))).toBe("hoy");
    expect(cookedAgoLabel(iso(1))).toBe("ayer");
    expect(cookedAgoLabel(iso(5))).toBe("hace 5 días");
    expect(cookedAgoLabel(null)).toBe(null);
    expect(cookedAgoLabel("no-es-fecha")).toBe(null);
  });
});
