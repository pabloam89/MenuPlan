import { describe, it, expect } from "vitest";
import { recipeCatalog, recipeCatalogById } from "./recipeCatalog.js";
import { normalizeText } from "../lib/recipeText.js";

// ── Regressions for two under-declared-allergen bugs found during the Fase 4
// catalog audit (14-allergen exhaustive ingredient sweep) ──────────────────

describe("Fase 4 allergen audit fixes", () => {
  it("declares gluten for 'Brócoli gratinado' (contains Bechamel, a wheat-flour sauce)", () => {
    const r = recipeCatalogById["ensaladas_verduras_011"];
    expect(r.name).toBe("Brócoli gratinado");
    expect(r.allergens).toContain("gluten");
    expect(r.allergens).toContain("lactosa");
  });

  it("declares soja for 'Arroz tres delicias' (contains Salsa de soja)", () => {
    const r = recipeCatalogById["pasta_arroces_015"];
    expect(r.name).toBe("Arroz tres delicias");
    expect(r.allergens).toContain("soja");
  });
});

// ── Exhaustive ingredient-vs-declared-allergen sweep, catalog-wide ─────────
// Guards against future recipes being added with a missing allergen for the
// 8 EU allergens that have NO ingredient-level safety net in
// src/lib/allergens.js (INGREDIENT_ALLERGEN_KEYWORDS only covers 6:
// cacahuetes, soja, apio, mostaza, sulfitos, altramuces). For those 8, the
// `allergens` field on each recipe is the ONLY thing standing between a user
// and an allergic reaction, so this test re-runs (a conservative subset of)
// the audit that found the two bugs above, permanently.
const AUDIT_KEYWORDS = {
  gluten: [
    "harina", "pan\\b", "pasta", "espagueti", "macarron", "fideo", "tallarin", "penne",
    "fusilli", "lasa[nñ]a", "canelones", "ravioli", "cuscus", "couscous", "cerveza", "panko",
    "pan rallado", "semola", "bulgur", "seitan", "picatostes", "empanad", "rebozad", "crep",
    "tortita", "bizcocho", "galleta", "sobao", "hojaldre", "masa quebrada", "wrap", "bollo",
    "brioche", "bechamel", "besamel", "trigo", "oblea",
  ],
  marisco: ["gamba", "langostino", "langosta", "cigala", "bogavante", "camaron", "cangrejo", "marisco"],
  huevo: ["huevo", "clara de huevo", "yema", "mayonesa", "alioli"],
  pescado: [
    "merluza", "salmon", "bacalao", "atun", "sardina", "anchoa", "boqueron", "rape", "lubina",
    "rodaballo", "dorada", "besugo", "lenguado", "emperador", "caballa", "trucha", "rosada",
    "bonito", "pescadilla", "gallo", "pescado",
  ],
  lactosa: [
    "leche", "nata", "queso", "yogur", "mantequilla", "requeson", "mozzarella", "parmesano",
    "cuajada", "bechamel", "besamel", "mascarpone", "ricotta", "kefir", "crema pastelera",
  ],
  // "castana" (chestnut) deliberately excluded: botanically and legally it's
  // not one of the EU-regulated tree nuts (Reglamento (UE) 1169/2011 anexo II
  // solo lista almendra/avellana/nuez/anacardo/pacana/nuez de Brasil/
  // pistacho/macadamia), así que declararlo "frutos_secos" sería alarmar de
  // un alérgeno que la castaña no porta.
  frutos_secos: ["almendra", "nuez", "nueces", "avellana", "pistacho", "anacardo", "pinon", "macadamia"],
  sesamo: ["sesamo", "tahini", "gomasio"],
  moluscos: [
    "calamar", "sepia", "pulpo", "mejillon", "almeja", "chirla", "navaja", "coquina",
    "berberecho", "vieira", "ostra",
  ],
};

const COMPILED = Object.fromEntries(
  Object.entries(AUDIT_KEYWORDS).map(([id, words]) => [id, new RegExp(`\\b(?:${words.join("|")})`)]),
);

function ingredientHitsAllergen(name, allergenId) {
  const n = normalizeText(name);
  if (allergenId === "frutos_secos" && /nuez moscada/.test(n)) return false; // nutmeg, not a tree nut
  if (allergenId === "gluten" && /\bcaldo\b/.test(n)) return false; // stock, no wheat by itself
  // "pasta" también significa "pasta/puré" en español (pasta de miso, ají en
  // pasta...), no solo la pasta de trigo — sin esta exclusión el matcher
  // marca falsos positivos de gluten en salsas/condimentos sin harina.
  if (allergenId === "gluten" && /pasta de (miso|curry|tomate|pimenton|aji|guindilla|umami)|en pasta\b/.test(n)) return false;
  // "leche de coco" y las mantequillas de fruto seco/semilla no son lácteos:
  // el matcher de "lactosa" solo mira la palabra "leche"/"mantequilla" suelta,
  // así que hay que excluir explícitamente estos falsos positivos.
  if (allergenId === "lactosa" && /leche de coco/.test(n)) return false;
  if (allergenId === "lactosa" && /mantequilla de (cacahuete|almendra|anacardo|avellana)/.test(n)) return false;
  return COMPILED[allergenId].test(n);
}

describe("catalog-wide allergen declaration sweep (8 allergens without an ingredient safety net)", () => {
  it("has a non-empty catalog to check", () => {
    expect(recipeCatalog.length).toBeGreaterThan(200);
  });

  for (const allergenId of Object.keys(AUDIT_KEYWORDS)) {
    it(`every recipe with a ${allergenId}-indicating ingredient declares "${allergenId}"`, () => {
      const undeclared = [];
      for (const r of recipeCatalog) {
        const declared = new Set(r.allergens ?? []);
        if (declared.has(allergenId)) continue;
        const hit = (r.ingredients ?? []).find((ing) => ingredientHitsAllergen(ing.name, allergenId));
        if (hit) undeclared.push(`${r.id} "${r.name}" (ingredient: ${hit.name})`);
      }
      expect(undeclared).toEqual([]);
    });
  }
});
