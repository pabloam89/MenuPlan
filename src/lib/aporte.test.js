import { describe, expect, it } from "vitest";
import { aporteDe, familiaDeIngrediente, gramosPorFamilia, UMBRAL_RACION } from "./aporte.js";

const receta = (ingredients, extra = {}) => ({
  name: "plato", category: "carnes", baseServings: 2, ingredients, ...extra,
});
const ing = (name, amount, unit = "g") => ({ name, amount, unit });

describe("cuenta lo que pinchas, no lo que unta", () => {
  it("un aromático no es ración por mucho que pese", () => {
    // 120 g de cebolla en un guiso son el sofrito. Nadie dice "hoy comí
    // verdura" porque el guiso llevara cebolla.
    expect(familiaDeIngrediente("Cebolla")).toBeNull();
    expect(familiaDeIngrediente("Ajo")).toBeNull();
    expect(familiaDeIngrediente("Perejil")).toBeNull();
    expect(aporteDe(receta([ing("Cebolla", 400), ing("Ajo", 40)])).has("verdura")).toBe(false);
  });

  it("lo que llega disuelto tampoco", () => {
    expect(familiaDeIngrediente("Tomate triturado")).toBeNull();
    expect(familiaDeIngrediente("Tomate frito")).toBeNull();
    expect(familiaDeIngrediente("Salsa de tomate")).toBeNull();
    expect(familiaDeIngrediente("Caldo de carne")).toBeNull();
    // El caso real: "Arroz con tomate frito" no entrega ni un gramo de verdura.
    expect(aporteDe(receta([ing("Arroz", 180), ing("Tomate triturado", 150, "ml")])).has("verdura")).toBe(false);
  });

  it("pero el mismo tomate en trozo sí", () => {
    expect(familiaDeIngrediente("Tomate")).toBe("verdura");
  });

  it("una pieza entera pesa, no cuenta como cero", () => {
    // 4 ud de pimiento en una receta de 2 raciones = 160 g/ración. Sin esto,
    // unos chiles rellenos entregarían "nada" porque sus pimientos van en ud.
    const r = receta([ing("Pimiento verde", 4, "ud")]);
    expect(gramosPorFamilia(r).verdura).toBe(160);
    expect(aporteDe(r).has("verdura")).toBe(true);
  });

  it("las cantidades cualitativas no pesan", () => {
    expect(gramosPorFamilia(receta([ing("Sal", 1, "pizca")]))).toEqual({});
  });
});

describe("los umbrales son por familia, no uno global", () => {
  it("cada familia tiene el suyo, derivado de lo que ya es de esa familia", () => {
    // Una ración de verdura son ~150 g y una de pasta 80 g en seco: un único
    // número clasificaría mal cinco de las siete.
    expect(UMBRAL_RACION.verdura).toBe(100);
    expect(UMBRAL_RACION.pasta_arroz).toBe(80);
    expect(UMBRAL_RACION.carne).toBe(175);
  });

  it("justo por debajo del umbral no cuenta", () => {
    const casi = receta([ing("Calabacín", 198)]); // 99 g/ración con 2 raciones
    expect(aporteDe(casi).has("verdura")).toBe(false);
    const justo = receta([ing("Calabacín", 200)]);
    expect(aporteDe(justo).has("verdura")).toBe(true);
  });
});

describe("desambiguación de ingredientes", () => {
  it("la judía verde es verdura; la judía a secas, legumbre", () => {
    expect(familiaDeIngrediente("Judía verde")).toBe("verdura");
    expect(familiaDeIngrediente("Judías verdes")).toBe("verdura");
    expect(familiaDeIngrediente("Judión")).toBe("legumbres");
  });

  it("la panceta es carne, no pasta (contiene 'pan')", () => {
    // Las proteínas se miran ANTES que los hidratos justo por esto.
    expect(familiaDeIngrediente("Panceta")).toBe("carne");
  });

  it("el repollo es verdura, no pollo", () => {
    expect(familiaDeIngrediente("Repollo")).toBe("verdura");
  });
});

describe("un plato entrega varias familias a la vez", () => {
  it("carne Y verdura: es lo que el conteo por categoría no veía", () => {
    // "Ternera a la jardinera": archivada en carnes, 130 g de verdura por
    // ración. Es carne y entrega verdura, y las dos cosas tienen que contar.
    const jardinera = receta([
      ing("Carne de ternera", 350), ing("Zanahoria", 100),
      ing("Guisantes", 80), ing("Judía verde", 80),
      ing("Cebolla", 80), ing("Tomate triturado", 50),
    ]);
    const a = aporteDe(jardinera);
    expect(a.has("carne")).toBe(true);
    expect(a.has("verdura")).toBe(true);
  });
});

describe("un `aporte` declarado manda sobre la derivación", () => {
  // Mismo patrón que `mainBase` sobre el regex en getCarbType: el campo escrito
  // a mano es el override para cuando la derivación se equivoque.
  it("usa lo declarado y no mira los ingredientes", () => {
    const r = receta([ing("Calabacín", 400)], { aporte: ["carne"] });
    expect([...aporteDe(r)]).toEqual(["carne"]);
  });

  it("ignora valores que no son familias", () => {
    const r = receta([ing("Calabacín", 400)], { aporte: ["carne", "inventado"] });
    expect([...aporteDe(r)]).toEqual(["carne"]);
  });

  it("un `aporte` vacío no apaga la derivación", () => {
    const r = receta([ing("Calabacín", 400)], { aporte: [] });
    expect(aporteDe(r).has("verdura")).toBe(true);
  });
});

describe("tolera recetas incompletas sin romper", () => {
  it("sin ingredientes, sin raciones o sin nada", () => {
    expect([...aporteDe({})]).toEqual([]);
    expect([...aporteDe(null)]).toEqual([]);
    expect([...aporteDe({ ingredients: [] })]).toEqual([]);
    // Sin baseServings se asume 4, que es el default del catálogo.
    expect(aporteDe({ ingredients: [ing("Calabacín", 400)] }).has("verdura")).toBe(true);
  });
});
