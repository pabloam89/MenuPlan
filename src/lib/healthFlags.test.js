import { describe, it, expect } from "vitest";
import { deriveHealthFlags, ensureHealthFlags, VRN_HIERRO_MG, UMBRAL_RICO_HIERRO_MG } from "./healthFlags.js";

const r = (name, ingredients = [], extra = {}) => ({
  name,
  ingredients: ingredients.map((n) => ({ name: n })),
  ...extra,
});

describe("deriveHealthFlags", () => {
  it("flags fried and high-sodium cured meats", () => {
    const flags = deriveHealthFlags(r("Croquetas de jamón", ["Jamón serrano", "Aceite"]));
    expect(flags).toContain("frito");
    expect(flags).toContain("embutido");
    expect(flags).toContain("alto_sodio");
  });

  it("flags iron-rich legumes and red meat", () => {
    expect(deriveHealthFlags(r("Lentejas", ["Lentejas"], { category: "legumbres" }))).toContain(
      "rico_hierro",
    );
    expect(
      deriveHealthFlags(r("Solomillo de ternera", ["Ternera"], { mainProtein: "ternera" })),
    ).toContain("rico_hierro");
  });

  it("flags added sugar in desserts", () => {
    expect(deriveHealthFlags(r("Flan de huevo", ["Azúcar", "Leche"]))).toContain("azucar_anadido");
  });

  it("keeps a plain grilled fish free of risk flags", () => {
    const flags = deriveHealthFlags(r("Merluza a la plancha", ["Merluza", "Limón"]));
    expect(flags).not.toContain("frito");
    expect(flags).not.toContain("embutido");
  });

  it("merges explicitly declared flags", () => {
    const flags = deriveHealthFlags(r("Plato X", ["Agua"], { healthFlags: ["picante"] }));
    expect(flags).toContain("picante");
  });
});

describe("ensureHealthFlags", () => {
  it("derives healthFlags for a recipe that doesn't have them yet", () => {
    const recipe = r("Croquetas de jamón", ["Jamón serrano", "Aceite"]);
    const result = ensureHealthFlags(recipe);
    expect(result.healthFlags).toContain("frito");
    expect(result.healthFlags).toContain("embutido");
  });

  it("leaves a recipe with existing healthFlags untouched (same reference, no recompute)", () => {
    const recipe = r("Plato X", ["Agua"], { healthFlags: ["picante"] });
    const result = ensureHealthFlags(recipe);
    expect(result).toBe(recipe);
    expect(result.healthFlags).toEqual(["picante"]);
  });

  it("treats an empty healthFlags array as already-derived (no recompute)", () => {
    const recipe = r("Merluza a la plancha", ["Merluza", "Limón"], { healthFlags: [] });
    const result = ensureHealthFlags(recipe);
    expect(result).toBe(recipe);
    expect(result.healthFlags).toEqual([]);
  });
});

describe("el hierro medido, ademas de las palabras", () => {
  const receta = (extra) => ({ name: "Bowl de quinoa y semillas", ingredients: ["Quinoa"], ...extra });

  it("marca rico_hierro cuando la racion llega al 30 % del VRN", () => {
    // Ninguna de las quince palabras de IRON_RE nombra este plato.
    expect(deriveHealthFlags(receta({ macros: { iron_mg: 4.2 } }))).toContain("rico_hierro");
  });

  it("no lo marca por debajo del umbral", () => {
    expect(deriveHealthFlags(receta({ macros: { iron_mg: 1.1 } }))).not.toContain("rico_hierro");
  });

  /**
   * LA FRANJA QUE SE CERRÓ. El umbral vivía en 3,5 mg diciendo ser el corte de
   * «alto contenido en» del reglamento, que en realidad es 4,2 (30 % del VRN
   * de 14 mg). Entre los dos números hay 115 recetas del catálogo, y hasta hoy
   * se anunciaban con una etiqueta que no les correspondía.
   *
   * Esto no comprueba que el umbral valga 4,2 —copiar el número sería
   * congelarlo—: comprueba que un plato DENTRO de la franja ya no se marca.
   */
  it("un plato en la franja vieja (3,5-4,2 mg) ya no se marca", () => {
    expect(deriveHealthFlags(receta({ macros: { iron_mg: 3.8 } }))).not.toContain("rico_hierro");
  });

  it("el umbral es el 30 % del VRN, no un numero suelto", () => {
    expect(UMBRAL_RICO_HIERRO_MG).toBeCloseTo(VRN_HIERRO_MG * 0.3, 10);
    // Y el VRN es el del Anexo XIII, que es dato legal y no se ajusta a ojo.
    expect(VRN_HIERRO_MG).toBe(14);
  });

  // Lo importante del diseno: el dato SUMA, nunca resta. Con el hierro en solo
  // 166 de los 371 ingredientes, sustituir la heuristica por la medida dejaria
  // de marcar platos que hoy se marcan.
  it("sin hierro medido sigue mandando la lista de palabras", () => {
    expect(deriveHealthFlags({ name: "Lentejas estofadas", ingredients: ["Lentejas"] })).toContain("rico_hierro");
  });

  it("un hierro bajo NO desmarca lo que la lista ya marco", () => {
    const f = deriveHealthFlags({ name: "Lentejas estofadas", ingredients: ["Lentejas"], macros: { iron_mg: 0.2 } });
    expect(f).toContain("rico_hierro");
  });
});
