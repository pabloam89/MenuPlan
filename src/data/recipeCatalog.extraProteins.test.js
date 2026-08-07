import { describe, it, expect } from "vitest";
import { recipeCatalog } from "./recipeCatalog.js";
import { normalizeText } from "../lib/recipeText.js";

// `mainProtein` + `extraProteins` are the ONLY fields proteinGroupsOf()
// (utils/validateMenu.js) reads, so a dish carrying meat/fish that declares
// neither is invisible to every protein-variety rule and to the school-menu
// avoidance — and to the vegetariano/vegano structural check.
//
// A catalog audit found 29 such dishes: "Revuelto de gambas" (mainProtein
// "huevo"), "Judías verdes rehogadas" with jamón serrano (mainProtein "none"),
// "Ensaladilla rusa" with atún, and so on. This test is the guard that stops a
// newly added recipe from reintroducing the same gap silently.
//
// Scope: this asserts the dish DECLARES the protein it carries. It does not
// assert it counts as a serving of it — FREQ_KEY_MATCHERS reads only
// mainProtein/category, so a sandwich with ham still doesn't count toward the
// weekly "carne" quota. That split is deliberate.

const GROUP = {
  pollo: "carne", pavo: "carne", cerdo: "carne", ternera: "carne",
  pescado_blanco: "pescado", pescado_azul: "pescado", marisco: "pescado",
  legumbre: "legumbres", huevo: "huevos",
};

// Ingredient keyword -> protein group it implies. Deliberately narrow: only
// unambiguous, substantial components. Terms that proved to be false positives
// in the audit are excluded on purpose — "lomo" matches "Lomos de salmón",
// "pollo" matches "Repollo" — so those are matched via more specific phrases.
const INGREDIENT_IMPLIES = [
  [/\bpollo\b|pechuga de pavo|\bpavo\b|contramuslo|muslos de pollo|alitas de pollo/, "carne"],
  [/jamon|chorizo|panceta|tocino|beicon|salchich|morcilla|cecina|sobrasada|lomo de cerdo|cinta de lomo|secreto iberico|magro de cerdo|costillas de cerdo|carne picada/, "carne"],
  [/\bternera\b|redondo de ternera|escalopines/, "carne"],
  [/\batun\b|bacalao|merluza|salmon|sardina|boqueron|anchoa|lubina|dorada|trucha|\brape\b|pescadilla|rosada|emperador/, "pescado"],
  [/\bgamba|langostino|calamar|sepia|pulpo|almeja|mejillon|\bmarisco\b/, "pescado"],
];

// Broths flavor a dish without being a protein serving, and are intentionally
// not treated as a declared protein.
const BROTH_RE = /caldo de (pollo|carne|pescado|ave)/;

function declaredGroups(recipe) {
  return new Set(
    [recipe.mainProtein, ...(recipe.extraProteins ?? [])]
      .filter((p) => p && p !== "none")
      .map((p) => GROUP[p] ?? p),
  );
}

describe("catalog metadata: meat/fish is always declared in mainProtein/extraProteins", () => {
  it("has no recipe carrying an undeclared meat/fish ingredient", () => {
    const offenders = [];

    for (const r of recipeCatalog) {
      const declared = declaredGroups(r);
      for (const ing of r.ingredients ?? []) {
        const name = normalizeText(ing.name);
        if (BROTH_RE.test(name)) continue;
        for (const [re, group] of INGREDIENT_IMPLIES) {
          if (!re.test(name)) continue;
          if (declared.has(group)) continue;
          offenders.push(`${r.id} "${r.name}" — "${ing.name}" implica "${group}" pero declara [${[...declared].join(", ") || "nada"}]`);
          break;
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("still recognises the dishes the audit originally fixed", () => {
    // Sanity check on the detector itself: if these stop being flagged as
    // carrying their secondary protein, the regexes above have silently
    // stopped matching and the test above would pass vacuously.
    const byId = Object.fromEntries(recipeCatalog.map((r) => [r.id, r]));
    expect(declaredGroups(byId["huevos_011"])).toContain("pescado"); // Revuelto de gambas
    expect(declaredGroups(byId["ensaladas_verduras_010"])).toContain("carne"); // Judías verdes con jamón
    expect(declaredGroups(byId["ensaladas_verduras_015"])).toContain("pescado"); // Ensaladilla rusa (atún)
    expect(declaredGroups(byId["platos_unicos_020"])).toContain("carne"); // Huevos a la riojana (chorizo)
  });
});
