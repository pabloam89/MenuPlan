/**
 * NO TODO EL HIERRO ES EL MISMO HIERRO, y la vitamina A tiene dos mitades.
 *
 * Las dos cosas se podían calcular hoy sin un dato nuevo: `taxonomia.clase`
 * está al 100 % en las 396 fichas, y `retinol_ug` y `beta_carotene_ug` ya eran
 * columnas separadas. Solo faltaba preguntar.
 */

import { describe, it, expect } from "vitest";
import { recipeCatalog } from "../data/recipeCatalog.js";
import { computeRecipeNutrition } from "./ingredients.js";

const receta = (id) => recipeCatalog.find((r) => r.id === id);
const nutri = (r) => computeRecipeNutrition(r, r.baseServings || 2);

describe("el hierro se reparte por su origen", () => {
  it("los tres trozos suman el hierro publicado", () => {
    const descuadran = [];
    for (const r of recipeCatalog) {
      const n = nutri(r);
      if (!n?.iron_mg) continue;
      const { hemo, noHemo, sinRepartir } = n.hierroPorOrigen;
      // Los tres se redondean por separado, así que un decimal de holgura.
      if (Math.abs(hemo + noHemo + sinRepartir - n.iron_mg) > 0.15) {
        descuadran.push(`${r.id}: ${hemo}+${noHemo}+${sinRepartir} ≠ ${n.iron_mg}`);
      }
    }
    expect(descuadran).toEqual([]);
  });

  /**
   * LA LISTA VA POR `clase`, NO POR `reino`, y ese es el error fácil. El huevo
   * y el lácteo son de origen animal y su hierro NO es hemo: hemo es el hierro
   * de la hemoglobina y la mioglobina, o sea el del músculo y la sangre.
   */
  it("un plato de legumbres no tiene hierro hemo", () => {
    const n = nutri(receta("legumbres_001"));
    expect(n.hierroPorOrigen.hemo).toBe(0);
    expect(n.hierroPorOrigen.noHemo).toBeGreaterThan(0);
  });

  it("y una carne sí lo tiene", () => {
    const carnes = recipeCatalog.filter((r) => r.category === "carnes" && r.mainProtein === "ternera");
    const conHemo = carnes.filter((r) => (nutri(r)?.hierroPorOrigen.hemo ?? 0) > 0);
    // No todas: una receta de ternera puede llevar más lenteja que carne. Pero
    // la mayoría aplastante tiene que tener algo.
    expect(conHemo.length / carnes.length).toBeGreaterThan(0.8);
  });

  /**
   * EL REPARTO DEL RECETARIO, que es el dato que hace interesante todo esto.
   * Con absorción típica (~25 % hemo, ~5-10 % no hemo) el hierro que de verdad
   * llega es del orden de la mitad del que se publica, y la proporción cambia
   * mucho entre un menú de legumbres y uno de carne. Se vigila el reparto
   * global, no una receta.
   */
  it("el recetario reparte su hierro entre los dos orígenes", () => {
    let hemo = 0; let noHemo = 0; let sinRepartir = 0;
    for (const r of recipeCatalog.filter((x) => x.estrella)) {
      const n = nutri(r);
      if (!n) continue;
      hemo += n.hierroPorOrigen.hemo;
      noHemo += n.hierroPorOrigen.noHemo;
      sinRepartir += n.hierroPorOrigen.sinRepartir;
    }
    const total = hemo + noHemo + sinRepartir;
    // Ni un recetario de carnicería ni uno vegano: las dos mitades pesan.
    expect(hemo / total).toBeGreaterThan(0.3);
    expect(noHemo / total).toBeGreaterThan(0.3);
    // Y lo que no se puede atribuir tiene que seguir siendo marginal. Si esto
    // sube, es que están entrando fichas `compuesto` donde antes había
    // ingredientes con taxonomía.
    expect(sinRepartir / total).toBeLessThan(0.06);
  });
});

describe("la vitamina A en µg RAE", () => {
  it("sale de las dos mitades con el factor 12", () => {
    const r = receta("legumbres_001");
    const n = nutri(r);
    expect(n.vitamin_a_rae_ug).toBeCloseTo(n.retinol_ug + n.beta_carotene_ug / 12, 1);
  });

  /**
   * MEDIA VITAMINA A NO ES UNA VITAMINA A BAJA. Si falta cualquiera de las dos
   * columnas el RAE es `null`, no la mitad que se conoce: es la misma regla de
   * abstención que usa el resto del operador.
   */
  it("con una mitad sola no contesta", () => {
    const conHueco = recipeCatalog
      .map((r) => nutri(r))
      .filter((n) => n && (n.retinol_ug == null) !== (n.beta_carotene_ug == null));
    for (const n of conHueco) expect(n.vitamin_a_rae_ug).toBeNull();
  });

  /**
   * Y NO SUSTITUYE A LAS DOS COLUMNAS, que siguen publicándose. Un menú
   * vegetariano y uno con hígado pueden dar el mismo RAE y no son lo mismo: el
   * retinol preformado tiene límite superior y el betacaroteno no.
   */
  it("las dos columnas siguen estando", () => {
    const n = nutri(receta("legumbres_001"));
    expect(n.retinol_ug).toBeTypeOf("number");
    expect(n.beta_carotene_ug).toBeTypeOf("number");
  });
});
