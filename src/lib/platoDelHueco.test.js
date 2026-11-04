import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { generateMenuWithAI, platoDelHueco } from "./aiPlanner.js";
import { casaAleatoria } from "./casasAleatorias.js";

/**
 * El plato de un hueco sale del catálogo con lo que el hueco apunta (#1246): la receta, su guarnición y su salsa,
 * para quién y con qué recambios. Es lo mismo que la copia que hoy guarda la casa (`aiRecipes`) y la foto de cada
 * menú (`user_menu_recipes`): con esto, esas copias sobran.
 *
 * Banco: casas de prueba (casasAleatorias.js), con el motor sin red (solver), la fecha y el azar fijos.
 */
// Una con un plato fijado a mano con su guarnición y su salsa: el motor solo las pone así (pairGarnishes, pairSauces).
const FIJO = { name: "Carrilleras de ternera al vino tinto", catalogId: "carnes_037", garnishId: "guarniciones_024", sauceId: "salsas_001", timesPerWeek: 2, meals: ["Comida"] };
const CASAS = [1, 2, 3, 4, 5, 6].map((n) => casaAleatoria(n, { nivel: 0 }));
CASAS.push({ ...casaAleatoria(7, { nivel: 0 }), fixedDishes: [FIJO] });

const cursos = (hueco) => [
  ...(hueco.recipeId ? [["principal", hueco.recipeId]] : []),
  ...(hueco.firstRecipeId ? [["primero", hueco.firstRecipeId]] : []),
];
const huecosDe = (plan) => Object.entries(plan)
  .filter(([grupo]) => !grupo.startsWith("_"))
  .flatMap(([, huecos]) => Object.values(huecos ?? {}));

describe("el plato sale del hueco, sin copia (#1246)", () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-02T09:00:00Z"));
    vi.stubGlobal("localStorage", { getItem: (k) => (k === "mp_motor" ? "solver" : null) });
    vi.spyOn(Math, "random").mockReturnValue(0.5);
  });
  afterAll(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it("cada receta que guarda el menú es la de algún hueco que la usa, con su guarnición, su salsa y sus raciones", async () => {
    let copias = 0;
    let conGuarnicion = 0;
    let conSalsa = 0;
    for (const [i, casa] of CASAS.entries()) {
      const semilla = i + 1;
      const { plan, recipes } = await generateMenuWithAI(casa);
      const huecos = huecosDe(plan);
      for (const copia of recipes) {
        const delHueco = huecos.flatMap((h) => cursos(h).filter(([, id]) => id === copia.id).map(([c]) => platoDelHueco(h, c)));
        expect(delHueco.length, `casa ${semilla}: ${copia.id} no está en ningún hueco`).toBeGreaterThan(0);
        expect(delHueco, `casa ${semilla}: ${copia.id}`).toContainEqual(copia);
        copias++;
        if (copia.garnishId) conGuarnicion++;
        if (copia.sauceId) conSalsa++;
      }
    }
    // El banco tiene que tener platos con guarnición, o no prueba lo que dice.
    expect(copias).toBeGreaterThan(50);
    expect(conGuarnicion).toBeGreaterThan(0);
    expect(conSalsa).toBeGreaterThan(0);
  }, 300000);

  it("cada hueco apunta su guarnición y su salsa (o null) y sus recambios", async () => {
    const { plan } = await generateMenuWithAI(casaAleatoria(1, { nivel: 0 }));
    for (const h of huecosDe(plan)) {
      expect(h).toHaveProperty("garnishId");
      expect(h).toHaveProperty("sauceId");
      expect(Array.isArray(h.restricciones)).toBe(true);
      expect(h.platoDe).toBe(h.recipeId);
      if (h.firstRecipeId) expect(h.primeroDe).toBe(h.firstRecipeId);
    }
  }, 300000);

  it("un hueco sin receta, o con una que no está en el catálogo, no da plato", () => {
    expect(platoDelHueco({ recipeId: null })).toBeNull();
    expect(platoDelHueco({ recipeId: "no_existe_999", eaters: 2, restricciones: [] })).toBeNull();
  });

  it("un hueco que no apunta sus recambios o para cuántos (uno de antes) lanza, no da el plato sin recambios", () => {
    expect(() => platoDelHueco({ recipeId: "carnes_037", eaters: 2, platoDe: "carnes_037" })).toThrow(/recambios/);
    expect(() => platoDelHueco({ recipeId: "carnes_037", restricciones: [], platoDe: "carnes_037" })).toThrow(/recambios/);
  });

  it("un hueco al que se le cambió la receta sin su guarnición lanza: no le pone la guarnición de la otra", () => {
    const hueco = { recipeId: "carnes_001", eaters: 2, restricciones: [], garnishId: "guarniciones_024", platoDe: "carnes_037" };
    expect(() => platoDelHueco(hueco)).toThrow(/guarnición/);
    expect(() => platoDelHueco({ ...hueco, firstRecipeId: "carnes_037" }, "primero")).toThrow(/guarnición/);
  });

  it("la guarnición y la salsa son del catálogo: una que no está, lanza", () => {
    const hueco = { recipeId: "carnes_037", eaters: 2, restricciones: [], platoDe: "carnes_037" };
    expect(() => platoDelHueco({ ...hueco, garnishId: "guarniciones_999" })).toThrow(/la guarnición «guarniciones_999»/);
    expect(() => platoDelHueco({ ...hueco, sauceId: "salsas_999" })).toThrow(/la salsa «salsas_999»/);
    expect(platoDelHueco({ ...hueco, garnishId: "guarniciones_024", sauceId: "salsas_001" })).toMatchObject({ garnishId: "guarniciones_024", sauceId: "salsas_001" });
  });
});
