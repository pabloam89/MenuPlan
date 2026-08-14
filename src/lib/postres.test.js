import { describe, expect, it } from "vitest";
import {
  currentFruitSeason,
  filterPostrePool,
  applySeasonalFruit,
  SEASONAL_FRUIT_RECIPE_ID,
} from "./postres.js";

const rec = (id, effort, dessertKind) => ({ id, effort, dessertKind });

const POOL = [
  rec("postres_003", "inmediato", "fruta"),
  rec("postres_001", "inmediato", "fruta"),
  rec("postres_008", "inmediato", "yogur"),
  rec("postres_006", "cazo"),
  rec("postres_004", "cazo"),
  rec("postres_005", "horno"),
  rec("postres_016", "horno"),
];

describe("filterPostrePool", () => {
  it("defaults to inmediato when no tipo is set", () => {
    const out = filterPostrePool(POOL, { postre: "cena" });
    expect(out.every((r) => r.effort === "inmediato")).toBe(true);
    expect(out).toHaveLength(3);
  });

  it("keeps only cazo desserts", () => {
    const out = filterPostrePool(POOL, { postreTipo: "cazo" });
    expect(out.map((r) => r.id).sort()).toEqual(["postres_004", "postres_006"]);
  });

  it("keeps only horno desserts", () => {
    const out = filterPostrePool(POOL, { postreTipo: "horno" });
    expect(out.map((r) => r.id).sort()).toEqual(["postres_005", "postres_016"]);
  });

  it("narrows inmediato to fruta or yogur", () => {
    expect(filterPostrePool(POOL, { postreTipo: "inmediato", postreInmediato: "fruta" }).every((r) => r.dessertKind === "fruta")).toBe(true);
    expect(filterPostrePool(POOL, { postreTipo: "inmediato", postreInmediato: "yogur" }).every((r) => r.dessertKind === "yogur")).toBe(true);
  });

  it("falls back if a filter would empty the pool", () => {
    const onlyYogur = [rec("postres_008", "inmediato", "yogur")];
    const out = filterPostrePool(onlyYogur, { postreTipo: "inmediato", postreInmediato: "fruta" });
    expect(out).toEqual(onlyYogur);
  });
});

describe("seasonal fruit", () => {
  it("maps months to the Spanish meteorological season", () => {
    expect(currentFruitSeason(new Date(2026, 0, 15))).toBe("invierno");
    expect(currentFruitSeason(new Date(2026, 3, 15))).toBe("primavera");
    expect(currentFruitSeason(new Date(2026, 6, 15))).toBe("verano");
    expect(currentFruitSeason(new Date(2026, 9, 15))).toBe("otono");
  });

  it("overlays name, ingredients and photo on the generic fruit recipe", () => {
    const base = { id: SEASONAL_FRUIT_RECIPE_ID, name: "Fruta de temporada", ingredients: [] };
    const winter = applySeasonalFruit(base, new Date(2026, 0, 10));
    expect(winter.name).toBe("Naranja y kiwi");
    expect(winter.photo).toBe("/seasonal-fruit/fruta_temporada_invierno.jpg");
    expect(winter.ingredients.some((i) => i.name === "Naranja")).toBe(true);

    const other = applySeasonalFruit({ id: "postres_008", name: "Yogur natural" }, new Date(2026, 0, 10));
    expect(other.name).toBe("Yogur natural");
  });
});
