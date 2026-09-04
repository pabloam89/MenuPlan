import { describe, it, expect } from "vitest";
import {
  buildAdaptationMap,
  isAdaptableRestriction,
  planAdaptations,
  isCompatibleWith,
  adaptationsNeededFor,
} from "./substitutions.js";

const recipe = (name, ingredientNames = []) => ({
  name,
  ingredients: ingredientNames.map((n) => ({ name: n })),
});

describe("isAdaptableRestriction", () => {
  it("knows lactose and cooking alcohol are adaptable but other restrictions are not", () => {
    expect(isAdaptableRestriction("lactosa_fina")).toBe(true);
    expect(isAdaptableRestriction("alcohol_cocina")).toBe(true);
    expect(isAdaptableRestriction("fructosa")).toBe(false);
    expect(isAdaptableRestriction("embarazo")).toBe(false);
    expect(isAdaptableRestriction("lactancia")).toBe(false);
    expect(isAdaptableRestriction("unknown")).toBe(false);
  });
});

describe("planAdaptations (alcohol_cocina)", () => {
  it("swaps wine/beer for their alcohol-free versions", () => {
    const { swaps, blocked } = planAdaptations(
      recipe("Merluza en salsa verde", ["Merluza", "Vino blanco", "Perejil"]),
      ["alcohol_cocina"],
    );
    expect(blocked).toBe(false);
    expect(swaps).toEqual([
      { from: "Vino blanco", to: "Vino blanco sin alcohol", restriction: "alcohol_cocina", label: "sin alcohol" },
    ]);
  });

  it("adapts even when alcohol is the dish's namesake ingredient", () => {
    const { swaps, blocked } = planAdaptations(
      recipe("Pollo a la cerveza", ["Pollo troceado", "Cerveza", "Cebolla"]),
      ["alcohol_cocina"],
    );
    expect(blocked).toBe(false);
    expect(swaps).toEqual([
      { from: "Cerveza", to: "Cerveza sin alcohol", restriction: "alcohol_cocina", label: "sin alcohol" },
    ]);
  });

  it("does not false-positive on sherry VINEGAR (jerez keyword was dropped)", () => {
    const { swaps, blocked } = planAdaptations(
      recipe("Gazpacho andaluz", ["Tomate maduro", "Pepino", "Vinagre de Jerez"]),
      ["alcohol_cocina"],
    );
    expect(swaps).toEqual([]);
    expect(blocked).toBe(false);
  });

  it("combines with lactosa_fina independently in the same recipe", () => {
    const { swaps } = planAdaptations(
      recipe("Crema de setas al vino", ["Nata", "Vino blanco", "Setas"]),
      ["lactosa_fina", "alcohol_cocina"],
    );
    expect(swaps).toEqual(
      expect.arrayContaining([
        { from: "Nata", to: "Nata sin lactosa", restriction: "lactosa_fina", label: "sin lactosa" },
        { from: "Vino blanco", to: "Vino blanco sin alcohol", restriction: "alcohol_cocina", label: "sin alcohol" },
      ]),
    );
    expect(swaps.length).toBe(2);
  });
});

describe("planAdaptations (lactosa_fina)", () => {
  it("swaps each dairy ingredient for its lactose-free version", () => {
    const { swaps, blocked } = planAdaptations(
      recipe("Lasaña", ["Leche entera", "Nata para cocinar", "Carne picada"]),
      ["lactosa_fina"],
    );
    expect(blocked).toBe(false);
    expect(swaps).toEqual(
      expect.arrayContaining([
        { from: "Leche entera", to: "Leche entera sin lactosa", restriction: "lactosa_fina", label: "sin lactosa" },
        { from: "Nata para cocinar", to: "Nata para cocinar sin lactosa", restriction: "lactosa_fina", label: "sin lactosa" },
      ]),
    );
    // The non-dairy ingredient is untouched.
    expect(swaps.some((s) => /carne/i.test(s.from))).toBe(false);
  });

  it("leaves recipes with no dairy untouched", () => {
    const { swaps, blocked } = planAdaptations(
      recipe("Merluza a la plancha", ["Merluza", "Limón"]),
      ["lactosa_fina"],
    );
    expect(swaps).toEqual([]);
    expect(blocked).toBe(false);
  });

  it("swaps yogurt for its lactose-free version (previously missing from the keyword list entirely)", () => {
    const { swaps, blocked } = planAdaptations(
      recipe("Pepino con yogur y menta", ["Yogur natural", "Pepino"]),
      ["lactosa_fina"],
    );
    expect(blocked).toBe(false);
    expect(swaps).toEqual(
      expect.arrayContaining([
        { from: "Yogur natural", to: "Yogur natural sin lactosa", restriction: "lactosa_fina", label: "sin lactosa" },
      ]),
    );
  });

  it("does NOT touch tolerated cured cheese / butter (not in the keyword list)", () => {
    const { swaps } = planAdaptations(
      recipe("Tostada", ["Queso curado", "Mantequilla"]),
      ["lactosa_fina"],
    );
    expect(swaps).toEqual([]);
  });

  it("is idempotent for an already lactose-free ingredient", () => {
    const { swaps } = planAdaptations(recipe("Batido", ["Leche sin lactosa"]), ["lactosa_fina"]);
    expect(swaps).toEqual([]);
  });

  it("blocks when the conflict is only in the dish name (nothing to rename)", () => {
    const { swaps, blocked } = planAdaptations(
      recipe("Batido de leche", ["Plátano", "Hielo"]),
      ["lactosa_fina"],
    );
    expect(swaps).toEqual([]);
    expect(blocked).toBe(true);
  });

  it("ignores non-adaptable restriction ids", () => {
    const { swaps, blocked } = planAdaptations(
      recipe("Pescado", ["Vino blanco"]),
      ["embarazo", "fructosa"],
    );
    expect(swaps).toEqual([]);
    expect(blocked).toBe(false);
  });
});

// El choque dejó de decidirse por palabras clave y lo dice el catálogo de
// ingredientes (conflictsWith). Estos casos son adaptaciones que la versión por
// keywords SÍ producía y que llegaban al usuario como una promesa falsa.
describe("adaptaciones que ya no se inventan", () => {
  it("no adapta la leche de coco: no lleva lactosa", () => {
    const { swaps, blocked } = planAdaptations(
      recipe("Curry", ["Leche de coco", "Pollo"]),
      ["lactosa_fina"],
    );
    expect(swaps).toEqual([]);
    expect(blocked).toBe(false);
  });

  it("no adapta el vinagre: su alcohol ya fermentó en ácido acético", () => {
    const { swaps, blocked } = planAdaptations(
      recipe("Escabeche", ["Vinagre", "Pollo"]),
      ["alcohol_cocina"],
    );
    expect(swaps).toEqual([]);
    expect(blocked).toBe(false);
  });

  // Un destilado no tiene versión sin alcohol de súper, así que la receta NO se
  // puede adaptar. Bloquearla es la respuesta honesta; renombrarla "Ron sin
  // alcohol" era prometer un producto inexistente a una embarazada.
  it("bloquea en vez de fingir que adapta un destilado", () => {
    const { swaps, blocked } = planAdaptations(
      recipe("Solomillo al whisky", ["Whisky", "Solomillo"]),
      ["alcohol_cocina"],
    );
    expect(swaps).toEqual([]);
    expect(blocked).toBe(true);
  });

  // La mozzarella era el ejemplo de "lácteo sin recambio" y dejó de serlo: la
  // mozzarella sin lactosa se vende en cualquier súper, y bloquear 12 recetas
  // por un producto que existe es el error contrario al que estos tests vigilan.
  it("adapta la mozzarella, que sí tiene versión sin lactosa", () => {
    const { swaps, blocked } = planAdaptations(
      recipe("Ensalada caprese", ["Mozzarella fresca", "Tomate"]),
      ["lactosa_fina"],
    );
    expect(blocked).toBe(false);
    expect(swaps.map((s) => s.from)).toEqual(["Mozzarella fresca"]);
  });

  // Un ingrediente sustituible no rescata a la receta si otro no lo es. Hoy los
  // 11 ingredientes de lactosa_fina tienen recambio, así que el caso vive en
  // alcohol_cocina: el vino tiene 0,0 de súper y el brandy no.
  it("bloquea aunque parte de los ingredientes sí se puedan cambiar", () => {
    const { blocked } = planAdaptations(
      recipe("Solomillo a la pimienta", ["Vino blanco", "Brandy"]),
      ["alcohol_cocina"],
    );
    expect(blocked).toBe(true);
  });
});

describe("buildAdaptationMap", () => {
  it("returns a rename map and a compact adaptations list", () => {
    const { renameByName, adaptations } = buildAdaptationMap(
      recipe("Crema", ["Nata", "Puerro"]),
      ["lactosa_fina"],
    );
    expect(renameByName.get("Nata")).toBe("Nata sin lactosa");
    expect(renameByName.has("Puerro")).toBe(false);
    expect(adaptations).toEqual([{ from: "Nata", to: "Nata sin lactosa", label: "sin lactosa" }]);
  });
});

describe("isCompatibleWith / adaptationsNeededFor", () => {
  it("un plato sin lácteos es compatible y no necesita ningún cambio", () => {
    const r = recipe("Merluza a la plancha", ["Merluza", "Limón"]);
    expect(isCompatibleWith(r, "lactosa_fina")).toBe(true);
    expect(adaptationsNeededFor(r, "lactosa_fina")).toEqual([]);
  });

  it("un plato con lácteo sustituible es compatible Y dice qué cambiar", () => {
    const r = recipe("Crema de puerros", ["Nata para cocinar", "Puerro"]);
    expect(isCompatibleWith(r, "lactosa_fina")).toBe(true);
    expect(adaptationsNeededFor(r, "lactosa_fina")).toEqual([
      { from: "Nata para cocinar", to: "Nata para cocinar sin lactosa" },
    ]);
  });

  it("un plato con un destilado NO es compatible", () => {
    const r = recipe("Solomillo al whisky", ["Whisky", "Solomillo"]);
    expect(isCompatibleWith(r, "alcohol_cocina")).toBe(false);
    expect(adaptationsNeededFor(r, "alcohol_cocina")).toEqual([]);
  });

  // La distinción que hace que el distintivo signifique algo: sin ella, una
  // ensalada sin lácteos luciría "sin lactosa" igual que una lasaña adaptada.
  it("separa 'ya cumple' de 'hay que cambiar algo'", () => {
    const yaCumple = recipe("Ensalada", ["Lechuga", "Tomate"]);
    const hayQueCambiar = recipe("Crema", ["Leche", "Puerro"]);
    expect(isCompatibleWith(yaCumple, "lactosa_fina")).toBe(true);
    expect(isCompatibleWith(hayQueCambiar, "lactosa_fina")).toBe(true);
    expect(adaptationsNeededFor(yaCumple, "lactosa_fina")).toHaveLength(0);
    expect(adaptationsNeededFor(hayQueCambiar, "lactosa_fina")).toHaveLength(1);
  });

  it("devuelve falso para una restricción que no es adaptable", () => {
    const r = recipe("Tarta", ["Harina"]);
    expect(isCompatibleWith(r, "gluten")).toBe(false);
    expect(isCompatibleWith(r, "fructosa")).toBe(false);
  });
});
