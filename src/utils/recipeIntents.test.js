import { describe, it, expect } from "vitest";
import { matchesIntent, intentsForRecipe, buildInspireDeck, eligibleCatalogPool, promoteSocial, spliceUpcoming, SOCIAL_WINDOW } from "./recipeIntents.js";

function recipe(overrides) {
  return {
    id: "r1",
    name: "Receta",
    category: "carnes",
    difficulty: "normal",
    time: 35,
    mealRole: ["segundo"],
    kidFriendly: false,
    ingredients: [],
    ...overrides,
  };
}

describe("matchesIntent", () => {
  it("'hijos' requires kidFriendly AND easy — kidFriendly alone covers 84% of the catalog", () => {
    expect(matchesIntent(recipe({ kidFriendly: true, difficulty: "facil" }), "hijos")).toBe(true);
    expect(matchesIntent(recipe({ kidFriendly: true, difficulty: "normal" }), "hijos")).toBe(false);
    expect(matchesIntent(recipe({ kidFriendly: false, difficulty: "facil" }), "hijos")).toBe(false);
  });

  it("'ocasion_especial' is the same `apetecible` flag behind the 'Platos gourmet' facet", () => {
    expect(matchesIntent(recipe({ apetecible: true }), "ocasion_especial")).toBe(true);
    expect(matchesIntent(recipe({ apetecible: false }), "ocasion_especial")).toBe(false);
    // Being elaborate is not by itself "special" — the curated flag decides.
    expect(matchesIntent(recipe({ difficulty: "elaborada" }), "ocasion_especial")).toBe(false);
  });

  it("'cena_rapida' accepts a montaje dish regardless of time or difficulty", () => {
    const tabla = recipe({ montaje: true, difficulty: "normal", time: 40 });
    expect(matchesIntent(tabla, "cena_rapida")).toBe(true);
  });

  it("'cena_rapida' otherwise needs the cena role, easy and under 20 min", () => {
    expect(matchesIntent(recipe({ mealRole: ["cena"], difficulty: "facil", time: 15 }), "cena_rapida")).toBe(true);
    // A quick "segundo" is not a full dinner on its own — same role gate the planner applies.
    expect(matchesIntent(recipe({ mealRole: ["segundo"], difficulty: "facil", time: 15 }), "cena_rapida")).toBe(false);
    expect(matchesIntent(recipe({ mealRole: ["cena"], difficulty: "facil", time: 25 }), "cena_rapida")).toBe(false);
  });

  it("'dia_a_dia' is everything that is neither gourmet nor a quick dinner", () => {
    expect(matchesIntent(recipe(), "dia_a_dia")).toBe(true);
    expect(matchesIntent(recipe({ apetecible: true }), "dia_a_dia")).toBe(false);
    expect(matchesIntent(recipe({ montaje: true }), "dia_a_dia")).toBe(false);
  });

  it("'dia_a_dia' does not exclude kid food — the two axes are orthogonal", () => {
    const kidWeeknight = recipe({ kidFriendly: true, difficulty: "facil", time: 35 });
    expect(matchesIntent(kidWeeknight, "hijos")).toBe(true);
    expect(matchesIntent(kidWeeknight, "dia_a_dia")).toBe(true);
  });

  it("returns false for an unknown intent or a missing recipe", () => {
    expect(matchesIntent(recipe(), "no_existe")).toBe(false);
    expect(matchesIntent(null, "dia_a_dia")).toBe(false);
  });
});

describe("intentsForRecipe", () => {
  it("reports only the intents the user actually picked", () => {
    // Qualifies for both hijos and cena_rapida, but the user only asked for dinners.
    const r = recipe({ kidFriendly: true, difficulty: "facil", mealRole: ["cena"], time: 12 });
    expect(intentsForRecipe(r, ["hijos", "cena_rapida"])).toEqual(["hijos", "cena_rapida"]);
    expect(intentsForRecipe(r, ["cena_rapida"])).toEqual(["cena_rapida"]);
  });
});

describe("buildInspireDeck", () => {
  it("deduplicates a recipe that satisfies two of the picked intents", () => {
    const both = recipe({ id: "both", kidFriendly: true, difficulty: "facil", mealRole: ["cena"], time: 10 });
    const deck = buildInspireDeck([both], ["hijos", "cena_rapida"]);
    expect(deck).toHaveLength(1);
  });

  it("unions the intents rather than intersecting them", () => {
    const kid = recipe({ id: "kid", kidFriendly: true, difficulty: "facil", time: 40 });
    const quick = recipe({ id: "quick", mealRole: ["cena"], difficulty: "facil", time: 10 });
    const deck = buildInspireDeck([kid, quick], ["hijos", "cena_rapida"]);
    expect(deck.map((r) => r.id).sort()).toEqual(["kid", "quick"]);
  });

  it("returns an empty deck when no intent is picked", () => {
    expect(buildInspireDeck([recipe()], [])).toEqual([]);
    expect(buildInspireDeck([recipe()], null)).toEqual([]);
  });
});

describe("eligibleCatalogPool", () => {
  it("keeps elaborate dishes for a 'pro' cook, so the gourmet deck is not silently emptied", () => {
    const pool = eligibleCatalogPool({ cookLevel: "pro" });
    expect(pool.some((r) => r.difficulty === "elaborada")).toBe(true);
  });

  it("respects the household's declared cook level", () => {
    const basic = eligibleCatalogPool({ cookLevel: "basic" });
    expect(basic.every((r) => r.difficulty === "facil")).toBe(true);
  });

  it("never surfaces baby or off-menu recipes in the deck", () => {
    const pool = eligibleCatalogPool({});
    const forbidden = new Set(["bebes", "desayunos", "meriendas", "postres"]);
    expect(pool.some((r) => forbidden.has(r.category))).toBe(false);
  });

  it("still applies hard allergy filtering", () => {
    const withNuts = eligibleCatalogPool({ cookLevel: "pro" });
    const noNuts = eligibleCatalogPool({
      cookLevel: "pro",
      members: [{ allergies: ["Frutos secos"] }],
    });
    expect(noNuts.length).toBeLessThan(withNuts.length);
  });

  it("does not hard-filter to kidFriendly — that is the 'hijos' intent's job, not the pool's", () => {
    const pool = eligibleCatalogPool({ cookLevel: "pro" });
    expect(pool.some((r) => r.kidFriendly !== true)).toBe(true);
  });

  it("drops a permanently discarded recipe so a 🚫 swipe never comes back", () => {
    const base = eligibleCatalogPool({ cookLevel: "pro" });
    const victim = base[0].id;
    const after = eligibleCatalogPool({ cookLevel: "pro", discards: { forever: [victim] } });
    expect(after.some((r) => r.id === victim)).toBe(false);
  });

  it("drops a 'ni fu ni fa' recipe while its cooldown is live, and lets it back after", () => {
    const base = eligibleCatalogPool({ cookLevel: "pro" });
    const victim = base[0].id;
    const live = eligibleCatalogPool({
      cookLevel: "pro",
      discards: { cooldownUntil: { [victim]: Date.now() + 86400000 } },
    });
    expect(live.some((r) => r.id === victim)).toBe(false);

    const expired = eligibleCatalogPool({
      cookLevel: "pro",
      discards: { cooldownUntil: { [victim]: Date.now() - 1000 } },
    });
    expect(expired.some((r) => r.id === victim)).toBe(true);
  });
});

describe("recetas de otra gente dentro del mazo", () => {
  const catalog = Array.from({ length: 300 }, (_, i) => ({ id: `cat_${i}` }));
  const social = [{ id: "user_a" }, { id: "user_b" }];

  it("las sube a las primeras posiciones en vez de dejarlas donde caiga la baraja", () => {
    // Sin promoción, dos cartas entre 300 caerían de media por la mitad del
    // mazo y no las vería nadie.
    const deck = promoteSocial([...catalog, ...social], social);
    const positions = social.map((r) => deck.findIndex((c) => c.id === r.id));
    for (const pos of positions) {
      expect(pos).toBeGreaterThanOrEqual(0);
      expect(pos).toBeLessThan(SOCIAL_WINDOW + social.length);
    }
  });

  it("no pierde ni duplica cartas", () => {
    const deck = promoteSocial([...catalog, ...social], social);
    expect(deck).toHaveLength(catalog.length + social.length);
    expect(new Set(deck.map((c) => c.id)).size).toBe(deck.length);
  });

  it("no cuela una receta social que no estuviera ya en el mazo", () => {
    // Si no pasó el filtro de seguridad (alergias) no está en `deck`, y la
    // promoción no puede meterla por la puerta de atrás.
    const deck = promoteSocial([...catalog], [{ id: "user_prohibida" }]);
    expect(deck.some((c) => c.id === "user_prohibida")).toBe(false);
    expect(deck).toHaveLength(catalog.length);
  });

  it("spliceUpcoming no toca la carta que estás viendo", () => {
    const deck = spliceUpcoming(catalog, 3, social);
    expect(deck.slice(0, 3).map((c) => c.id)).toEqual(["cat_0", "cat_1", "cat_2"]);
  });

  it("aguanta un mazo vacío", () => {
    expect(promoteSocial([], social)).toEqual([]);
    expect(spliceUpcoming([], 0, social)).toHaveLength(social.length);
  });
});
