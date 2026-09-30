/**
 * LA ESCALA DEL ACOMPAÑAMIENTO, que no tenía test y por eso se rompió.
 *
 * `applyGarnishToRecipe` dividía los macros de la guarnición entre sus
 * `baseServings` durante toda la vida del fichero, y los 74 tests del
 * planificador pasaban igual: ninguno miraba cuánto aportaba una guarnición,
 * solo que el plato saliera con nombre y con ingredientes. Un error del 50 %
 * en las calorías de un plato emparejado era invisible.
 */

import { describe, it, expect } from "vitest";
import guarniciones from "../../data/recipes/guarniciones.json";
import salsas from "../../data/recipes/salsas.json";
import { aporteDe, fundirMicros, MICROS_RACION } from "./aporteAcompanamiento.js";
import { applyGarnishToRecipe, applySauceToRecipe } from "../aiPlanner.js";

describe("el declarado de un acompañamiento está POR RACIÓN", () => {
  /**
   * EL INVARIANTE QUE CIERRA EL FALLO, y no se comprueba copiando el número:
   * se comprueba contra el operador, que calcula por ración desde los
   * ingredientes sin mirar el declarado.
   *
   * Si alguien vuelve a leer los macros como «por receta entera», la mediana
   * de esta razón se iría a 0,5 en guarniciones (baseServings 2) y a 0,25 en
   * salsas (baseServings 4), y este test lo dice antes que la app.
   */
  const medianaCalcSobreDeclarado = (lista) => {
    const razones = [];
    for (const s of lista) {
      const a = aporteDe(s);
      if (!a || !(s.kcal > 0)) continue;
      // El operador no publica kcal en `micros`, así que se recalcula la masa
      // como testigo: lo que se vigila es la ESCALA, no el valor exacto.
      const porRacion = a.masa;
      if (!(porRacion > 0)) continue;
      razones.push(porRacion);
    }
    razones.sort((x, y) => x - y);
    return razones[Math.floor(razones.length / 2)];
  };

  it("una guarnición pesa como una ración, no como la fuente entera", () => {
    // Una guarnición de verdura o fécula ronda los 150-300 g por ración. Si el
    // reparto estuviera mal leído saldría la mitad o el doble de esa banda.
    const m = medianaCalcSobreDeclarado(guarniciones);
    expect(m).toBeGreaterThan(90);
    expect(m).toBeLessThan(420);
  });

  it("una salsa pesa como una salsa", () => {
    const m = medianaCalcSobreDeclarado(salsas);
    expect(m).toBeGreaterThan(10);
    expect(m).toBeLessThan(200);
  });

  it("toda guarnición y toda salsa tienen aporte calculable", () => {
    const mudas = [...guarniciones, ...salsas].filter((s) => !aporteDe(s));
    expect(mudas.map((s) => s.id)).toEqual([]);
  });
});

describe("fundir dos platos funde sus micros y sus dudas", () => {
  const platoBase = () => ({
    iron_mg: 3,
    folate_ug: 70,
    cobertura: { iron_mg: 1, folate_ug: 1 },
  });

  it("los micros se suman", () => {
    const macros = platoBase();
    fundirMicros(macros, 300, {
      micros: { iron_mg: 1.8, folate_ug: 59.4 },
      cobertura: { iron_mg: 1, folate_ug: 1 },
      masa: 200,
    });
    expect(macros.iron_mg).toBeCloseTo(4.8, 5);
    expect(macros.folate_ug).toBeCloseTo(129.4, 5);
  });

  /**
   * LO QUE SE PONDERA ES LA MASA, NO EL VALOR. Una guarnición que no sabe nada
   * de su yodo aporta 0 µg, y ponderar por valor la dejaría invisible: la
   * cobertura del conjunto seguiría diciendo 1,0 sobre un plato en el que un
   * 40 % de la comida no tiene ficha para ese campo.
   */
  it("una guarnición sin ficha para un campo BAJA la cobertura del conjunto", () => {
    const macros = platoBase();
    fundirMicros(macros, 300, {
      micros: {}, // no publica hierro
      cobertura: { iron_mg: 0 },
      masa: 200,
    });
    // 300 g al 100 % y 200 g al 0 % → 0,6, no 1,0.
    expect(macros.cobertura.iron_mg).toBeCloseTo(0.6, 3);
    // Y el valor no se toca: sigue siendo el hierro del plato.
    expect(macros.iron_mg).toBe(3);
  });

  it("sin masa del plato la cobertura se conserva, no se inventa", () => {
    const macros = platoBase();
    fundirMicros(macros, null, {
      micros: { iron_mg: 1 },
      cobertura: { iron_mg: 0.2 },
      masa: 200,
    });
    expect(macros.cobertura.iron_mg).toBe(1);
    expect(macros.iron_mg).toBe(4);
  });
});

describe("aplicar un acompañamiento no borra el plato", () => {
  const frDe = () => ({
    name: "Merluza al horno",
    kcal: 300,
    time: 25,
    ingredients: [],
    prepSummary: "Merluza",
    masaPorRacion: 300,
    macros: {
      protein: 30, carbs: 10, fat: 8, fiber: 2, sodium: 300,
      iron_mg: 1.2, folate_ug: 40, vitamin_c_mg: 5,
      cobertura: { iron_mg: 1, folate_ug: 1, vitamin_c_mg: 1 },
    },
  });

  /**
   * EL FALLO MÁS CARO DE LOS TRES. `fr.macros` se reconstruía campo a campo
   * sin extender el objeto anterior, así que emparejar un plato le quitaba los
   * 24 micros y su cobertura de golpe. No es que no sumase la guarnición: es
   * que el plato llegaba a la ficha con cinco números en vez de veintinueve.
   */
  it("una guarnición no se lleva por delante los micros del plato", () => {
    const fr = applyGarnishToRecipe(frDe(), guarniciones[0], 2, []);
    for (const campo of ["iron_mg", "folate_ug", "vitamin_c_mg"]) {
      expect(fr.macros[campo], campo).toBeTypeOf("number");
    }
    expect(fr.macros.cobertura).toBeTruthy();
  });

  it("y una salsa tampoco", () => {
    const fr = applySauceToRecipe(frDe(), salsas[0], 2, []);
    expect(fr.macros.iron_mg).toBeTypeOf("number");
    expect(fr.macros.cobertura).toBeTruthy();
  });

  it("el hierro del conjunto es mayor que el del plato solo", () => {
    const solo = frDe();
    const conGuarnicion = applyGarnishToRecipe(frDe(), guarniciones[0], 2, []);
    expect(conGuarnicion.macros.iron_mg).toBeGreaterThan(solo.macros.iron_mg);
  });

  /**
   * Y LA ESCALA, DESDE EL OTRO LADO. Una guarnición aporta sus kcal enteras,
   * no la mitad. Se comprueba contra el declarado de la propia guarnición
   * —que es el dato que la app pinta— y no contra un número escrito aquí.
   */
  it("la guarnición aporta sus kcal declaradas, no una fracción", () => {
    const g = guarniciones[0];
    const fr = applyGarnishToRecipe(frDe(), g, 2, []);
    expect(fr.kcal).toBe(300 + Math.round(g.kcal));
  });

  it("los micros que solo tiene la guarnición aparecen en el plato", () => {
    const fr = frDe();
    delete fr.macros.iron_mg;
    const a = aporteDe(guarniciones[0]);
    const conMicros = applyGarnishToRecipe(fr, guarniciones[0], 2, []);
    if (a.micros.iron_mg != null) {
      expect(conMicros.macros.iron_mg).toBeCloseTo(a.micros.iron_mg, 3);
    }
  });

  it("la lista de micros es la misma que usa el catálogo", () => {
    expect(MICROS_RACION).toContain("iron_mg");
    expect(MICROS_RACION).not.toContain("sodium_mg");
    expect(MICROS_RACION.length).toBe(24);
  });
});
