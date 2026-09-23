/**
 * LA RACIÓN ES EL DENOMINADOR DE TODO, y por eso tiene test propio.
 *
 * Cada gramo de proteína, cada miligramo de hierro y cada kcal que la app
 * enseña salen de dividir la masa del plato entre `baseServings`. Si ese
 * divisor está mal, todo lo que cuelga de él está mal EN LA MISMA PROPORCIÓN, y
 * el error es invisible porque el número existe y parece razonable.
 *
 * Es el challenge C4 del documento de normalización («baseServings es el
 * denominador») y la tarea 0.8 de su plan, que pedía exactamente esto: un
 * invariante en CI.
 */

import { describe, it, expect } from "vitest";
import { recipeCatalog } from "./recipeCatalog.js";
import { composicionDe } from "../lib/derive/composicion.js";
import { computeRecipeNutrition } from "../lib/ingredients.js";
import { hayCostra, esCostra } from "../lib/derive/masaServida.js";

const gramosPorRacion = (r) => {
  const v = composicionDe(r);
  return v?.masaTotal > 0 ? v.masaTotal / (r.baseServings || 2) : null;
};

describe("la costra no llega al plato, y los DOS carriles lo saben", () => {
  /**
   * EL FALLO QUE ESTO IMPIDE, y es real: la regla de la costra vivía dentro de
   * `ingredients.js`, así que la aplicaba el carril de las kcal y NO el del
   * vector. La «Lubina entera a la sal» declara 1.500 g de sal gruesa sobre
   * 800 g de pescado, y salía bien en calorías y con 1.084 g por ración en
   * masa — tres veces y media la mediana de su categoría.
   *
   * Una regla que solo conoce un carril es peor que no tenerla: hace que dos
   * números del mismo plato se contradigan sin que nada avise.
   */
  it("la lubina a la sal pesa como un plato de pescado, no como la sal", () => {
    for (const id of ["pescados_036", "pescados_068"]) {
      const r = recipeCatalog.find((x) => x.id === id);
      expect(r, `${id} ya no está en el catálogo`).toBeTruthy();
      const g = gramosPorRacion(r);
      expect(g, `${id}: ${Math.round(g)} g por ración`).toBeLessThan(600);
      expect(g).toBeGreaterThan(150);
    }
  });

  it("y el azúcar del curado solo se va cuando hay sal con él", () => {
    const gravlax = [
      { name: "Sal gruesa", gramos: 500 },
      { name: "Azúcar", gramos: 300 },
    ];
    expect(hayCostra(gravlax)).toBe(true);
    expect(esCostra("Azúcar", 300, true)).toBe(true);
    // Un bizcocho lleva azúcar y no lleva costra: su azúcar se come.
    expect(esCostra("Azúcar", 300, false)).toBe(false);
    expect(hayCostra([{ name: "Sal", gramos: 5 }])).toBe(false);
  });
});

describe("la masa por ración", () => {
  /**
   * RANGOS POR CATEGORÍA, no uno solo para todo. Un postre son 185 g de
   * mediana y un plato de pasta 454: juzgarlos con la misma vara daba 42
   * «errores» de los que la mayoría eran raciones correctas de bebé, de postre
   * o de entrante. Los cortes van holgados a propósito — esto busca disparates,
   * no afina raciones.
   */
  const LIMITES = {
    bebes: [80, 420], postres: [90, 320], meriendas: [100, 320],
    desayunos: [110, 480], cenas_rapidas: [100, 520],
    ensaladas_verduras: [95, 800], huevos: [110, 820], pescados: [105, 700],
    carnes: [130, 900], sopas_cremas: [130, 820], legumbres: [150, 760],
    pasta_arroces: [200, 880], platos_unicos: [140, 700],
    guarniciones: [60, 500], salsas: [10, 300], bases: [50, 1200],
  };

  it("ninguna receta se sale del rango de su categoría", () => {
    const fuera = [];
    for (const r of recipeCatalog) {
      const g = gramosPorRacion(r);
      if (g == null) continue;
      const lim = LIMITES[r.category];
      if (!lim) continue;
      if (g < lim[0] || g > lim[1]) {
        fuera.push(`${r.id} ${r.name.slice(0, 34)}: ${Math.round(g)} g (${r.category} espera ${lim[0]}–${lim[1]})`);
      }
    }
    expect(fuera).toEqual([]);
  });

  /**
   * UNA CREMA DE ADULTO NO CABE EN MEDIA TAZA.
   *
   * Siete sopas del catálogo usaban agua en sus pasos —«cubrir las verduras con
   * 400 ml de agua fría», literal— y no la declaraban en `ingredients`. La
   * «Crema de puerros» daba 145 g por ración: media taza. El líquido de una
   * crema ES el plato, y sin él la masa servida y la densidad quedan mal
   * aunque las kcal salgan bien, porque el agua no tiene calorías.
   *
   * Los purés de bebé quedan fuera a propósito: 100-160 g es la ración correcta
   * a esa edad, y meterlos en la misma vara los convertía en falsos positivos.
   *
   * EL CORTE ESTÁ EN 200 Y NO EN 220, y la diferencia son dos purés. Un «Puré
   * de patatas gratinado» (214 g) y un «Puré de verduras con picatostes»
   * (205 g) son purés ESPESOS, que se comen con tenedor: no les falta líquido,
   * es que no son cremas. El segundo además escurre el agua de cocción en su
   * propio paso —«reservando un poco»—, así que declararla entera habría sido
   * el error contrario al que este test persigue.
   */
  it("ninguna sopa o crema de adulto baja de un plato", () => {
    const cortas = recipeCatalog
      .filter((r) => r.category === "sopas_cremas")
      .map((r) => ({ r, g: gramosPorRacion(r) }))
      .filter(({ g }) => g != null && g < 200)
      .map(({ r, g }) => `${r.id} ${r.name.slice(0, 34)}: ${Math.round(g)} g`);
    expect(cortas).toEqual([]);
  });

  /**
   * Y el catálogo entero no se desplaza. Si la mediana se mueve mucho es que
   * alguien cambió una regla de masa —hidratación, fracción comestible,
   * aceite— y arrastró todo consigo sin darse cuenta.
   */
  it("la mediana del catálogo se queda donde estaba", () => {
    const gs = recipeCatalog.map(gramosPorRacion).filter(Boolean).sort((a, b) => a - b);
    const mediana = gs[Math.floor(gs.length / 2)];
    expect(mediana).toBeGreaterThan(280);
    expect(mediana).toBeLessThan(400);
  });

  /**
   * LOS DOS CARRILES SOBRE EL MISMO PLATO. `computeRecipeNutrition` y
   * `composicionDe` cuentan masa por su cuenta, y desde hoy comparten la
   * costra, el aceite y la fracción comestible. Si uno se desvía del otro más
   * de un 15 %, es que una regla volvió a vivir en un solo sitio.
   */
  it("el carril de las kcal y el del vector miden la misma comida", () => {
    const divergen = [];
    for (const r of recipeCatalog) {
      const n = computeRecipeNutrition(r, r.baseServings || 2);
      const v = composicionDe(r);
      if (!n?.totalGrams || !(v?.masaTotal > 0)) continue;
      // `totalGrams` es de la receta entera, igual que `masaTotal`.
      const ratio = n.totalGrams / v.masaTotal;
      if (ratio < 0.85 || ratio > 1.18) {
        divergen.push(`${r.id}: kcal ${Math.round(n.totalGrams)} g vs vector ${Math.round(v.masaTotal)} g (×${ratio.toFixed(2)})`);
      }
    }
    // El vector hidrata (la pasta seca pesa más cocida) y el de kcal no, así
    // que una diferencia hay siempre. Lo que se vigila es que no crezca.
    expect(divergen.length).toBeLessThanOrEqual(260);
  });
});
