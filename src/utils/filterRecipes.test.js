import { describe, it, expect } from "vitest";
import { filterRecipes, filterGarnishes, decisionCatalog, scorePantryMatch } from "./filterRecipes.js";
import { recipeHitsIntolerances } from "../lib/intolerances.js";

function recipe(ingredientNames) {
  return { ingredients: ingredientNames.map((name) => ({ name })) };
}

describe("scorePantryMatch", () => {
  it("returns 0 when the pantry is empty or absent", () => {
    const r = recipe(["Pechuga de pollo", "Arroz", "Cebolla"]);
    expect(scorePantryMatch(r, [])).toBe(0);
    expect(scorePantryMatch(r, undefined)).toBe(0);
  });

  it("scores the proportion of recipe ingredients the user already has", () => {
    const r = recipe(["Pechuga de pollo", "Arroz", "Cebolla", "Ajo"]);
    // Has 2 of 4 ingredients (via whole-word overlap, not the exact catalog string)
    expect(scorePantryMatch(r, ["pollo", "arroz"])).toBe(0.5);
  });

  it("does not false-positive match 'pollo' inside 'Repollo'", () => {
    const r = recipe(["Repollo", "Zanahoria"]);
    expect(scorePantryMatch(r, ["pollo"])).toBe(0);
  });

  it("matches a specific cut against its generic pantry entry and vice versa", () => {
    const r = recipe(["Pechuga de pollo"]);
    expect(scorePantryMatch(r, ["pollo"])).toBe(1);
    expect(scorePantryMatch(r, ["pechuga_pollo"])).toBe(1);
  });

  it("does not double count one pantry ingredient matching two recipe ingredients", () => {
    // "pollo" matches both chicken ingredients, but the denominator is still
    // the recipe's total ingredient count, and the numerator counts pantry
    // items with at least one match — not every ingredient pair.
    const r = recipe(["Pechuga de pollo", "Muslos de pollo", "Arroz"]);
    expect(scorePantryMatch(r, ["pollo"])).toBeCloseTo(1 / 3);
  });
});

describe("filterRecipes pantry integration", () => {
  const baseOpts = { maxTime: 999, cookLevel: "pro" };

  it("never changes which recipes survive filtering", () => {
    const without = filterRecipes(baseOpts).recipes.map((r) => r.id);
    const withPantry = filterRecipes({ ...baseOpts, pantryIngredients: ["pollo", "tomate"] }).recipes.map((r) => r.id);
    expect(withPantry).toEqual(without);
  });

  it("attaches pantryScore only when pantryIngredients is provided", () => {
    const { recipes: withoutPantry } = filterRecipes(baseOpts);
    expect(withoutPantry.every((r) => r.pantryScore === undefined)).toBe(true);

    const { recipes: withPantry } = filterRecipes({ ...baseOpts, pantryIngredients: ["pollo"] });
    const scored = withPantry.filter((r) => r.pantryScore > 0);
    expect(scored.length).toBeGreaterThan(0);
  });
});

describe("filterRecipes allergen safety net", () => {
  const baseOpts = { maxTime: 999, cookLevel: "pro" };

  it("excludes recipes with soja ingredients even if not declared", () => {
    const { recipes: all } = filterRecipes(baseOpts);
    const { recipes: noSoja } = filterRecipes({ ...baseOpts, allergies: ["soja"] });
    // Marking soja must remove at least the recipes whose ingredients mention it.
    const hadSoja = all.filter((r) =>
      (r.ingredients ?? []).some((ing) => /soja|tofu|edamame|tempeh|tamari|miso/i.test(ing.name)),
    );
    expect(hadSoja.length).toBeGreaterThan(0);
    expect(noSoja.length).toBeLessThan(all.length);
    for (const r of noSoja) {
      expect(
        (r.ingredients ?? []).some((ing) => /soja|tofu|edamame|tempeh|tamari|miso/i.test(ing.name)),
      ).toBe(false);
    }
  });

  it("still keeps a viable pool for a common gap allergen", () => {
    const { error } = filterRecipes({ ...baseOpts, allergies: ["cacahuetes"] });
    expect(error).toBeNull();
  });
});

describe("filterRecipes intolerances & dietary states", () => {
  const baseOpts = { maxTime: 999, cookLevel: "pro" };

  it("excludes high-mercury/raw/cured dishes for embarazo (alcohol handled separately)", () => {
    const { recipes: all } = filterRecipes(baseOpts);
    const { recipes: preg, error } = filterRecipes({ ...baseOpts, intolerances: ["embarazo"] });
    expect(error).toBeNull();
    expect(preg.length).toBeLessThan(all.length);
    for (const r of preg) {
      const hay = [r.name, ...(r.ingredients ?? []).map((i) => i.name)]
        .join(" ")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      expect(/\b(sushi|crudo|pez espada|atun rojo)/.test(hay)).toBe(false);
    }
  });

  it("does NOT exclude alcohol on its own (that's alcohol_cocina's job, added by buildGroupContext)", () => {
    const { recipes: all } = filterRecipes(baseOpts);
    const { recipes: preg } = filterRecipes({ ...baseOpts, intolerances: ["embarazo"] });
    const stillHasWine = preg.some((r) =>
      (r.ingredients ?? []).some((ing) => /vino|cerveza/i.test(ing.name)),
    );
    expect(stillHasWine).toBe(true);
    // "embarazo" alone must behave exactly like recipeHitsIntolerances(["embarazo"])
    // — i.e. filterRecipes adds no implicit alcohol exclusion of its own.
    expect(preg.length).toBe(all.filter((r) => !recipeHitsIntolerances(r, ["embarazo"])).length);
  });

  it("adapts (not excludes) cooking-alcohol dishes for embarazo + alcohol_cocina", () => {
    const { recipes: all } = filterRecipes(baseOpts);
    const { recipes: preg } = filterRecipes({
      ...baseOpts,
      intolerances: ["embarazo", "alcohol_cocina"],
    });

    const adaptedForAlcohol = preg.filter((r) =>
      r.adaptations?.some((a) => a.restriction === "alcohol_cocina"),
    );
    expect(adaptedForAlcohol.length).toBeGreaterThan(0);
    for (const r of adaptedForAlcohol) {
      for (const swap of r.adaptations.filter((a) => a.restriction === "alcohol_cocina")) {
        expect(swap.to.toLowerCase()).toContain("sin alcohol");
      }
    }
    // No recipe should still carry a raw wine/beer ingredient once adapted.
    for (const r of preg) {
      const renamed = new Set((r.adaptations ?? []).map((a) => a.from));
      for (const ing of r.ingredients ?? []) {
        if (renamed.has(ing.name)) continue;
        expect(/\bvino\b|\bcerveza\b/i.test(ing.name)).toBe(false);
      }
    }
    // Raw/cured/mercury-fish exclusions from embarazo still apply on top.
    for (const r of preg) {
      const hay = [r.name, ...(r.ingredients ?? []).map((i) => i.name)]
        .join(" ")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      expect(/\b(sushi|crudo|pez espada|atun rojo)/.test(hay)).toBe(false);
    }
    expect(preg.length).toBeLessThan(all.length);
  });

  it("no longer excludes a plain 'Vinagre de Jerez' dish for embarazo (jerez false-positive fix)", () => {
    // Chickpea salad: tomato, cucumber, olives, olive oil, sherry vinegar — no
    // other embarazo-restricted ingredient, so the "jerez" false positive was
    // the ONLY thing excluding it before this fix.
    const { recipes: all } = filterRecipes(baseOpts);
    const dish = all.find((r) => (r.ingredients ?? []).some((ing) => ing.name === "Vinagre de Jerez") && r.category === "legumbres");
    expect(dish).toBeTruthy();

    const { recipes: preg } = filterRecipes({
      ...baseOpts,
      intolerances: ["embarazo", "alcohol_cocina"],
    });
    expect(preg.some((r) => r.id === dish.id)).toBe(true);
  });

  it("keeps a viable pool for lactosa fina", () => {
    const { error } = filterRecipes({ ...baseOpts, intolerances: ["lactosa_fina"] });
    expect(error).toBeNull();
  });

  it("adapts (not excludes) dairy recipes for lactosa fina", () => {
    const { recipes: all } = filterRecipes(baseOpts);
    const { recipes: lf } = filterRecipes({ ...baseOpts, intolerances: ["lactosa_fina"] });

    // Lactose intolerance shouldn't gut the catalog the way an allergen does —
    // dairy dishes stay in, just annotated with lactose-free swaps.
    const adapted = lf.filter((r) => r.adaptations?.length > 0);
    expect(adapted.length).toBeGreaterThan(0);
    for (const r of adapted) {
      for (const swap of r.adaptations) {
        expect(swap.to.toLowerCase()).toContain("sin lactosa");
        expect(swap.label).toBe("sin lactosa");
      }
    }
    // Far more survive than a milk allergy would allow (see next test).
    expect(lf.length).toBeGreaterThan(all.length * 0.8);
  });

  it("still hard-excludes dairy for a milk ALLERGEN (no adaptation)", () => {
    const { recipes: milkFree } = filterRecipes({ ...baseOpts, allergies: ["leche"] });
    expect(milkFree.every((r) => !r.adaptations)).toBe(true);
    // An allergen removes recipes; a lactose intolerance keeps + adapts them.
    const { recipes: lf } = filterRecipes({ ...baseOpts, intolerances: ["lactosa_fina"] });
    expect(milkFree.length).toBeLessThan(lf.length);
  });

  it("does nothing when no intolerances are passed", () => {
    const a = filterRecipes(baseOpts).recipes.map((r) => r.id);
    const b = filterRecipes({ ...baseOpts, intolerances: [] }).recipes.map((r) => r.id);
    expect(b).toEqual(a);
  });
});

describe("decisionCatalog health fields", () => {
  it("omits macros/healthFlags by default, includes them when includeHealth", () => {
    const { recipes } = filterRecipes({ maxTime: 999, cookLevel: "pro" });
    const plain = decisionCatalog(recipes);
    expect(plain.every((e) => e.carbs_g === undefined && e.fat_g === undefined)).toBe(true);

    const withHealth = decisionCatalog(recipes, { includeHealth: true });
    const anyWithMacros = withHealth.filter(
      (e) => typeof e.carbs_g === "number" || typeof e.fat_g === "number",
    );
    expect(anyWithMacros.length).toBeGreaterThan(0);
  });
});

describe("decisionCatalog pantryScore", () => {
  it("omits pantryScore when zero, includes it (rounded) when positive", () => {
    const { recipes } = filterRecipes({ maxTime: 999, cookLevel: "pro", pantryIngredients: ["pollo"] });
    const entries = decisionCatalog(recipes);
    for (const entry of entries) {
      const recipe = recipes.find((r) => r.id === entry.id);
      if (recipe.pantryScore > 0) {
        expect(entry.pantryScore).toBeCloseTo(recipe.pantryScore, 1);
      } else {
        expect(entry.pantryScore).toBeUndefined();
      }
    }
  });
});

describe("filterRecipes hasKids", () => {
  const baseOpts = { maxTime: 999, cookLevel: "pro" };

  it("excludes recipes with alcohol ingredients, even if marked kidFriendly", () => {
    const { recipes: all } = filterRecipes(baseOpts);
    const hadAlcohol = all.filter((r) =>
      (r.ingredients ?? []).some((ing) => /\bvino\b|\bcerveza\b/i.test(ing.name)),
    );
    expect(hadAlcohol.length).toBeGreaterThan(0); // sanity: fixture data has some

    const { recipes: kidsPool } = filterRecipes({ ...baseOpts, hasKids: true });
    for (const r of kidsPool) {
      const hasAlcohol = (r.ingredients ?? []).some((ing) =>
        /\b(vino|cerveza|sidra|brandy|ron|whisky|vodka|licor|cava|champan)\b/i.test(ing.name),
      );
      expect(hasAlcohol).toBe(false);
    }
  });

  it("only keeps kidFriendly recipes", () => {
    const { recipes: kidsPool } = filterRecipes({ ...baseOpts, hasKids: true });
    expect(kidsPool.length).toBeGreaterThan(0);
    expect(kidsPool.every((r) => r.kidFriendly)).toBe(true);
  });
});

describe("filterRecipes isBabyGroup isolation", () => {
  it("only returns 'bebes' category recipes for baby groups", () => {
    const { recipes } = filterRecipes({ maxTime: 999, cookLevel: "pro", isBabyGroup: true });
    expect(recipes.length).toBeGreaterThan(0);
    expect(recipes.every((r) => r.category === "bebes")).toBe(true);
  });

  it("never returns 'bebes' category recipes for non-baby groups", () => {
    const { recipes } = filterRecipes({ maxTime: 999, cookLevel: "pro", isBabyGroup: false });
    expect(recipes.length).toBeGreaterThan(0);
    expect(recipes.some((r) => r.category === "bebes")).toBe(false);
  });
});

describe("filterGarnishes", () => {
  it("excludes a garnish carrying a blocked allergen", () => {
    const all = filterGarnishes({});
    const hadLactosa = all.filter((g) => g.allergens?.includes("lactosa"));
    expect(hadLactosa.length).toBeGreaterThan(0); // sanity: fixture data has some

    const safe = filterGarnishes({ allergies: ["Leche"] });
    expect(safe.length).toBeLessThan(all.length);
    expect(safe.some((g) => hadLactosa.some((h) => h.id === g.id))).toBe(false);
  });

  it("keeps a lactose-containing garnish (adaptable) instead of excluding it", () => {
    // guarniciones_003 "Puré de patatas" has "Leche" among its ingredients —
    // adaptable, not a hard exclusion: dropping it would be an unnecessary
    // wall when a lactose-free version of the same product exists.
    const all = filterGarnishes({});
    const withDairy = all.find((g) => g.id === "guarniciones_003");
    expect(withDairy).toBeTruthy(); // sanity: fixture data still has it

    const safe = filterGarnishes({ intolerances: ["lactosa_fina"] });
    expect(safe.some((g) => g.id === "guarniciones_003")).toBe(true);
  });

  it("still hard-excludes a non-adaptable intolerance (fructosa)", () => {
    // guarniciones_011 "Zanahoria glaseada" has "Miel" — fructosa has no
    // supermarket swap, so it must still be a hard exclusion.
    const all = filterGarnishes({});
    const withHoney = all.find((g) => g.id === "guarniciones_011");
    expect(withHoney).toBeTruthy(); // sanity: fixture data still has it
    expect(recipeHitsIntolerances(withHoney, ["fructosa"])).toBe(true);

    const safe = filterGarnishes({ intolerances: ["fructosa"] });
    expect(safe.some((g) => g.id === "guarniciones_011")).toBe(false);
  });

  it("excludes alcoholic garnishes when hasKids, via an injected fixture (the real catalog has none today)", () => {
    const fixture = [
      {
        id: "g-wine", name: "Guarnición con vino", shortName: "vino",
        time: 5, allergens: [], ingredients: [{ name: "Vino blanco" }],
      },
      {
        id: "g-plain", name: "Arroz blanco", shortName: "arroz",
        time: 5, allergens: [], ingredients: [{ name: "Arroz" }],
      },
    ];
    const result = filterGarnishes({ hasKids: true }, fixture);
    expect(result.map((g) => g.id)).toEqual(["g-plain"]);
  });

  it("returns the full catalog when no restrictions are active", () => {
    expect(filterGarnishes({}).length).toBeGreaterThan(0);
  });
});
