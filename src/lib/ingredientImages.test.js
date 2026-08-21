import { describe, it, expect } from "vitest";

import {
  ingredientImageSrc,
  ingredientThumbSrc,
  aisleImageSrc,
  categoryImageSrc,
  proteinImageSrc,
} from "./ingredientImages.js";

describe("ingredientImageSrc", () => {
  it("matches a plain ingredient name", () => {
    expect(ingredientImageSrc("Tomate")).toBe("/ingredients/tomate.png");
    expect(ingredientImageSrc("Lentejas")).toBe("/ingredients/lentejas.png");
  });

  it("ignores accents and casing", () => {
    expect(ingredientImageSrc("Salmón")).toBe("/ingredients/salmon.png");
    expect(ingredientImageSrc("CHAMPIÑONES")).toBe("/ingredients/champinon.png");
  });

  it("resolves descriptive names to their base ingredient", () => {
    expect(ingredientImageSrc("Pechuga de pollo")).toBe("/ingredients/pechuga-de-pollo.png");
    expect(ingredientImageSrc("Dientes de ajo")).toBe("/ingredients/ajo.png");
    expect(ingredientImageSrc("Aceite de oliva virgen extra")).toBe("/ingredients/aceite-oliva-virgen.png");
  });

  it("prefers the narrower alias when two could match", () => {
    expect(ingredientImageSrc("Atún en lata")).toBe("/ingredients/atun-lata.png");
    expect(ingredientImageSrc("Atún en conserva")).toBe("/ingredients/atun-lata.png");
    expect(ingredientImageSrc("Atún fresco")).toBe("/ingredients/atun-fresco.png");
    expect(ingredientImageSrc("Salmón fresco")).toBe("/ingredients/salmon-fresco.png");
    expect(ingredientImageSrc("Merluza en lomos")).toBe("/ingredients/merluza-lomos.png");
    expect(ingredientImageSrc("Pescadilla en lomos")).toBe("/ingredients/pescadilla.png");
    expect(ingredientImageSrc("Batata")).toBe("/ingredients/batata.png");
    expect(ingredientImageSrc("Boniato")).toBe("/ingredients/boniato.png");
    expect(ingredientImageSrc("Agua mineral")).toBe("/ingredients/agua-mineral.png");
    expect(ingredientImageSrc("Guacamole")).toBe("/ingredients/guacamole.png");
    expect(ingredientImageSrc("Alioli")).toBe("/ingredients/alioli.png");
    expect(ingredientImageSrc("Judiones")).toBe("/ingredients/alubia-grande.png");
    expect(ingredientImageSrc("Fideos n°2")).toBe("/ingredients/fideo-mediano.png");
    expect(ingredientImageSrc("Queso de cabra")).toBe("/ingredients/queso-cabra.png");
    expect(ingredientImageSrc("Rulo de cabra")).toBe("/ingredients/rulo-de-cabra.png");
    expect(ingredientImageSrc("Queso rallado")).toBe("/ingredients/queso.png");
    expect(ingredientImageSrc("Roquefort")).toBe("/ingredients/roquefort.png");
    expect(ingredientImageSrc("Cabrales")).toBe("/ingredients/cabrales.png");
    expect(ingredientImageSrc("Camembert")).toBe("/ingredients/queso-fresco.png");
    expect(ingredientImageSrc("Baguette")).toBe("/ingredients/baguette.png");
    expect(ingredientImageSrc("Pan rústico")).toBe("/ingredients/pan.png");
    expect(ingredientImageSrc("Pan de payés")).toBe("/ingredients/pan-de-payes.png");
    expect(ingredientImageSrc("Tomate cherry")).toBe("/ingredients/tomate-cherry.png");
    expect(ingredientImageSrc("Tomate frito")).toBe("/ingredients/tomate-frito.png");
    expect(ingredientImageSrc("Cebolla morada")).toBe("/ingredients/cebolla-morada.png");
    expect(ingredientImageSrc("Arroz integral")).toBe("/ingredients/arroz-integral.png");
    expect(ingredientImageSrc("Acelga")).toBe("/ingredients/acelga.png");
    expect(ingredientImageSrc("Espinacas")).toBe("/ingredients/espinacas.png");
  });

  it("matches plural forms of multi-word ingredients", () => {
    expect(ingredientImageSrc("Judías verdes")).toBe("/ingredients/judia-verde.png");
    expect(ingredientImageSrc("Pimientos rojos")).toBe("/ingredients/pimiento-rojo.png");
    expect(ingredientImageSrc("Cebollas moradas")).toBe("/ingredients/cebolla-morada.png");
    expect(ingredientImageSrc("Tortillas de trigo")).toBe("/ingredients/tortillas-trigo.png");
  });

  it("does not let a short alias match inside a longer word", () => {
    // "nata" lives inside "natural"; "sal" inside "salsa".
    expect(ingredientImageSrc("Yogur natural")).toBe("/ingredients/yogur.png");
    expect(ingredientImageSrc("Salsa de soja")).toBe("/ingredients/salsa-soja.png");
  });

  it("reads 'harina de X' as the matching flour subtype", () => {
    expect(ingredientImageSrc("Harina de maíz")).toBe("/ingredients/harina-maiz.png");
    expect(ingredientImageSrc("Harina de garbanzo")).toBe("/ingredients/harina-garbanzo.png");
    expect(ingredientImageSrc("Harina de espelta")).toBe("/ingredients/harina-espelta.png");
    expect(ingredientImageSrc("Maíz dulce")).toBe("/ingredients/maiz-dulce.png");
  });

  it("resolves Mercadona subtypes to their dedicated icons", () => {
    expect(ingredientImageSrc("Vinagre de Módena")).toBe("/ingredients/vinagre-modena.png");
    expect(ingredientImageSrc("Sal fina")).toBe("/ingredients/sal-fina.png");
    expect(ingredientImageSrc("Leche de avena")).toBe("/ingredients/leche-avena.png");
    expect(ingredientImageSrc("Hummus")).toBe("/ingredients/hummus.png");
    expect(ingredientImageSrc("Gambón")).toBe("/ingredients/gambon.png");
    expect(ingredientImageSrc("Queso feta")).toBe("/ingredients/queso-feta.png");
    expect(ingredientImageSrc("Tempeh")).toBe("/ingredients/tempeh.png");
    expect(ingredientImageSrc("Vino tinto")).toBe("/ingredients/vino-tinto.png");
  });

  it("falls back to a visual family for cuts we have no art for", () => {
    expect(ingredientImageSrc("Entrecot")).toBe("/ingredients/entrecot.png");
    expect(ingredientImageSrc("Jarrete de ternera")).toBe("/ingredients/fam_carne_roja.png");
    expect(ingredientImageSrc("Rodaballo")).toBe("/ingredients/fam_pescado_blanco.png");
  });

  it("returns null for something unrecognisable", () => {
    expect(ingredientImageSrc("xyzzy")).toBeNull();
    expect(ingredientImageSrc("")).toBeNull();
    expect(ingredientImageSrc(null)).toBeNull();
  });
});

describe("ingredientThumbSrc", () => {
  it("uses the specific image when there is one", () => {
    expect(ingredientThumbSrc("Zanahoria")).toBe("/ingredients/zanahoria.png");
  });

  it("falls back to the aisle illustration otherwise", () => {
    // Unknown product, but the aisle guesser still places it somewhere.
    expect(ingredientThumbSrc("xyzzy")).toBe(aisleImageSrc("Verduras"));
  });

  it("always returns something for a non-empty name", () => {
    for (const n of ["Pan de centeno", "Refresco de cola", "Kombucha"]) {
      expect(ingredientThumbSrc(n)).toBeTruthy();
    }
  });
});

describe("categoryImageSrc", () => {
  it("maps recipe categories to their illustration", () => {
    expect(categoryImageSrc("ensaladas_verduras")).toBe("/categories/ensaladas_verduras.png");
    expect(categoryImageSrc("cenas_rapidas")).toBe("/categories/cenas_rapidas.png");
    expect(categoryImageSrc("guarniciones")).toBe("/categories/guarniciones.png");
  });

  it("returns null for a category with no art", () => {
    expect(categoryImageSrc("categoria_inventada")).toBeNull();
  });
});

describe("proteinImageSrc", () => {
  // Every filterable protein needs a picture, otherwise one row in the filter
  // sheet silently falls back to no icon at all.
  const REAL_PROTEINS = [
    "cerdo", "huevo", "legumbre", "marisco", "pavo",
    "pescado_azul", "pescado_blanco", "pollo", "ternera",
  ];

  it.each(REAL_PROTEINS)("has an image for %s", (p) => {
    expect(proteinImageSrc(p)).toMatch(/^\/(ingredients|categories)\/.+\.png$/);
  });

  it("falls back to the category plate for legumbre", () => {
    // There is no single "legumbres" ingredient render, only lentejas/garbanzos.
    expect(proteinImageSrc("legumbre")).toBe("/categories/legumbres.png");
  });

  it("returns null for 'none' and for unknown values", () => {
    expect(proteinImageSrc("none")).toBeNull();
    expect(proteinImageSrc("inventada")).toBeNull();
    expect(proteinImageSrc(undefined)).toBeNull();
  });
});
