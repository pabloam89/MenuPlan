/**
 * El trinquete de `part` y los tres errores concretos que costaron encontrar.
 *
 * La concordancia es el único número que dice si este operador sirve, así que
 * está aquí abajo como suelo: puede subir, no puede bajar. Si alguien toca una
 * regla y el número cae, el test lo dice antes que el catálogo.
 */

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { deriveStepParts, medirConcordancia } from "./stepParts.js";

const R = "src/data/recipes";
const recetas = readdirSync(R)
  .filter((f) => f.endsWith(".json"))
  .flatMap((f) => JSON.parse(readFileSync(`${R}/${f}`, "utf8")));

describe("concordancia contra las recetas curadas", () => {
  const m = medirConcordancia(recetas);

  /**
   * SUELO, no objetivo. 54,5 % sobre 3.313 pasos de 248 recetas (23 sep 2026).
   *
   * EL NÚMERO BAJÓ DE 59,1 % Y NO ES UNA REGRESIÓN, así que conviene dejarlo
   * escrito antes de que alguien lo lea como tal. El 59,1 % se midió contra
   * 180 recetas; al curar `part` en 504 más, el conjunto de medida pasó a 248
   * recetas y 3.313 pasos. El operador no cambió ni una línea: lo que cambió
   * es contra qué se compara, y ahora incluye platos más variados y más
   * difíciles que los 180 primeros.
   *
   * Un 54,5 % medido sobre 248 recetas dice más de la verdad que un 59,1 %
   * medido sobre 180. Comparar los dos números directamente es comparar dos
   * exámenes distintos.
   */
  it("no baja del 54 %", () => {
    expect(m.pasos).toBeGreaterThan(3000);
    expect(m.ratio).toBeGreaterThanOrEqual(0.54);
  });

  /**
   * `salsa` es la parte floja —44 %— y está escrito aquí a propósito: un
   * agregado del 59 % esconde que casi seis de cada diez pasos de salsa están
   * mal. Si alguien quiere usar `part` para algo de salsas, este es el número
   * que tiene que mirar.
   */
  it("deja dicho que salsa es la parte que no se puede usar", () => {
    expect(m.porParte.salsa.ok / m.porParte.salsa.n).toBeLessThan(0.55);
  });
});

describe("los errores que estaban dentro", () => {
  /**
   * NO_VOTA no tenía frontera de cierre, así que `^sal` casaba «Salmón» y
   * `^ajo` casaba «Ajonjolí»: pescados enteros callados en silencio. Con la
   * `\b`, un salmón en una receta de salmón vota, y el paso es del principal.
   */
  it("un salmón no es «sal»", () => {
    const receta = {
      mainProtein: "pescado_azul",
      ingredients: [
        { name: "Lomo de salmón", ingredientId: "salmon" },
        { name: "Patata", ingredientId: "patata" },
      ],
      stepsRich: [
        { text: "Cocer {{Patata}} en agua con sal hasta que esté tierna." },
        { text: "Marcar {{Lomo de salmón}} por el lado de la piel." },
      ],
    };
    expect(deriveStepParts(receta).parts).toEqual(["guarnicion", "principal"]);
  });

  /**
   * El huevo de un rebozado votaba `guarnicion` —pasillo Huevos con la
   * proteína declarada en ternera— y arrastraba por herencia todo lo que
   * venía detrás. Ahora calla, porque ahí el huevo es cómo se trata la carne.
   */
  it("el huevo de rebozar no es una guarnición", () => {
    const receta = {
      mainProtein: "ternera",
      ingredients: [
        { name: "Filetes de ternera", ingredientId: "ternera-filete" },
        { name: "Huevo", ingredientId: "huevo" },
        { name: "Patata", ingredientId: "patata" },
      ],
      stepsRich: [
        { text: "Batir {{Huevo}} en un plato hondo." },
        { text: "Pasar {{Filetes de ternera}} por el huevo batido." },
        { text: "Freír {{Patata}} en aceite abundante." },
      ],
    };
    const parts = deriveStepParts(receta).parts;
    expect(parts[1]).toBe("principal");
    expect(parts[2]).toBe("guarnicion");
  });

  /**
   * El caso del magret: cuatro pasos seguidos que nombran el principal en
   * texto plano, sin un solo marcador, heredando la parte de la salsa.
   */
  it("lee el nombre del ingrediente aunque no lleve marcador", () => {
    const receta = {
      mainProtein: "pato",
      ingredients: [
        { name: "Magret de pato", ingredientId: "magret-pato" },
        { name: "Chalota", ingredientId: "chalota" },
      ],
      stepsRich: [
        { text: "Picar {{Chalota}} en brunoise fina." },
        { text: "Colocar el magret en una sartén fría con la piel hacia abajo." },
        { text: "Voltear el magret y cocinar por el lado de la carne." },
      ],
    };
    const parts = deriveStepParts(receta).parts;
    expect(parts[1]).toBe("principal");
    expect(parts[2]).toBe("principal");
  });

  /**
   * La frontera también va en la lectura del texto plano: sin ella, la raíz
   * «apio» casaría «apionabo», que en varias recetas ES la guarnición y no un
   * condimento que calla.
   */
  it("«apio» no casa «apionabo»", () => {
    const receta = {
      mainProtein: "ternera",
      ingredients: [
        { name: "Carrilleras de ternera", ingredientId: "carrillera" },
        { name: "Apionabo", ingredientId: "apionabo" },
      ],
      stepsRich: [
        { text: "Dorar {{Carrilleras de ternera}} por todos los lados." },
        { text: "Cocer el apionabo troceado hasta que esté muy tierno." },
      ],
    };
    expect(deriveStepParts(receta).parts[1]).toBe("guarnicion");
  });
});
