import { describe, expect, it } from "vitest";

import { recipeCatalog, withMicronutrientes } from "./recipeCatalog.js";
import { deriveHealthFlags } from "../lib/healthFlags.js";
import legumbres from "./recipes/legumbres.json";
import carnes from "./recipes/carnes.json";
import pescados from "./recipes/pescados.json";

/**
 * Lo que estos tests protegen es la costura por la que los micronutrientes
 * pasan del catálogo de ingredientes a la receta. Antes de ella, los 24
 * micros se calculaban en `derived/recipeNutrition.json` y no los leía NADIE:
 * la receta lleva ocho macros escritos a mano y la app enseña esos.
 */
describe("los micronutrientes llegan a la receta", () => {
  const conMicros = recipeCatalog.filter((r) => r.iron_mg != null);

  it("la mayoria del catalogo los recibe", () => {
    expect(conMicros.length).toBeGreaterThan(recipeCatalog.length * 0.8);
  });

  it("cada micro viaja con su cobertura", () => {
    // Un hierro sostenido por el 30 % del plato no es un hierro, y quien lo
    // pinte tiene derecho a saberlo antes de pintarlo.
    for (const r of conMicros.slice(0, 40)) {
      expect(r.micronutrientesCobertura, r.id).toBeTruthy();
      expect(typeof r.micronutrientesCobertura.iron_mg, r.id).toBe("number");
    }
  });

  // La regla que hace que esto NO sea una decisión de producto: los ocho que
  // la receta declara a mano se quedan como están, aunque esté medido que el
  // calculado es mejor. Los micros entran porque no tienen con qué competir.
  it("no pisa ninguno de los ocho declarados", () => {
    const declarados = [
      "kcal", "protein_g", "carbs_g", "fat_g",
      "fiber_g", "sugar_g", "saturated_fat_g", "sodium_mg",
    ];
    const crudas = new Map([...legumbres, ...carnes, ...pescados].map((r) => [r.id, r]));
    const pisados = [];
    for (const r of recipeCatalog) {
      const cruda = crudas.get(r.id);
      if (!cruda) continue;
      for (const c of declarados) {
        if (cruda[c] !== undefined && !Object.is(cruda[c], r[c])) pisados.push(`${r.id}.${c}`);
      }
    }
    expect(pisados).toEqual([]);
  });

  // El hierro medido SUMA a la lista de palabras de healthFlags, nunca resta.
  // Con la cobertura a medias, sustituir la heurística por el dato habría
  // dejado de marcar platos que ya se marcaban.
  it("el hierro medido solo puede anadir rico_hierro, nunca quitarlo", () => {
    const perdidas = recipeCatalog.filter((r) => {
      if (!r.healthFlags || r.healthFlags.includes("rico_hierro")) return false;
      const sinDato = { ...r, iron_mg: undefined, macros: undefined };
      return deriveHealthFlags(sinDato).includes("rico_hierro");
    });
    expect(perdidas.map((r) => r.id)).toEqual([]);
  });

  it("una receta que ya trae el campo no se pisa", () => {
    // Las de Supabase y las del usuario pueden traer el suyo; el cableado solo
    // rellena huecos.
    const conPropio = recipeCatalog.filter(
      (r) => r.iron_mg != null && r.micronutrientesCobertura?.iron_mg === undefined,
    );
    for (const r of conPropio) expect(typeof r.iron_mg, r.id).toBe("number");
  });
});

/**
 * LA RECETA QUE LA TABLA NO CONOCE.
 *
 * `recipeNutrition.json` se calcula en build sobre el catálogo DEL BUILD. Pero
 * el catálogo puede venir de la nube: si la versión remota supera a la del
 * bundle, `loadCatalog` se baja `recipes` entera de Supabase y usa esa. Una
 * receta que no existía cuando se generó el artefacto no tiene fila.
 *
 * Hasta hoy eso era un `if (!n) return r`: la receta llegaba sin los 24
 * micros, sin cobertura y sin la corrección por cocción, y no fallaba nada —
 * simplemente no los tenía. El mismo patrón que ya se ha comido cinco campos
 * en `recipeRow.js`, un piso más abajo.
 *
 * Este bloque no se puede probar con el catálogo real, porque en el bundle
 * TODAS las recetas tienen fila. Por eso `withMicronutrientes` se exporta.
 */
describe("una receta que la tabla derivada no conoce", () => {
  const deLaNube = {
    id: "remota_9999_que_no_esta_en_la_tabla",
    name: "Lentejas con chorizo",
    baseServings: 4,
    tecnica: "olla",
    ingredients: [
      { name: "Lentejas", ingredientId: "lentejas", amount: 320, unit: "g" },
      { name: "Chorizo", ingredientId: "chorizo", amount: 120, unit: "g" },
      { name: "Zanahoria", ingredientId: "zanahoria", amount: 150, unit: "g" },
      { name: "Aceite de oliva", ingredientId: "aceite-oliva", amount: 20, unit: "ml" },
    ],
  };

  it("gana sus micros igual, calculados al vuelo", () => {
    const [r] = withMicronutrientes([deLaNube]);
    expect(r.iron_mg, "sin hierro: la receta llegó muda de la nube").toBeTypeOf("number");
    expect(r.iron_mg).toBeGreaterThan(0);
    expect(r.folate_ug).toBeTypeOf("number");
  });

  it("y con su cobertura, igual que las del bundle", () => {
    const [r] = withMicronutrientes([deLaNube]);
    expect(r.micronutrientesCobertura?.iron_mg).toBeTypeOf("number");
  });

  /**
   * EL DIVISOR TIENE QUE SER EL MISMO QUE EL DEL ARTEFACTO (`baseServings || 4`,
   * ver build-derived.mjs). Con otro, los números de las recetas nuevas no
   * serían comparables con los de las viejas y nadie lo notaría: las dos
   * ramas publican un número plausible.
   */
  it("con el mismo divisor que usa el artefacto", () => {
    const solo = withMicronutrientes([{ ...deLaNube, baseServings: 4 }])[0];
    const doble = withMicronutrientes([{ ...deLaNube, id: "otra", baseServings: 2 }])[0];
    // La misma comida entre 2 en vez de entre 4 da el doble por ración.
    expect(doble.iron_mg / solo.iron_mg).toBeCloseTo(2, 1);
  });

  it("y si no se puede calcular, no inventa", () => {
    const sinNada = { id: "x", name: "Plato vacío", baseServings: 2, ingredients: [] };
    const [r] = withMicronutrientes([sinNada]);
    expect(r.iron_mg).toBeUndefined();
    expect(r.micronutrientesCobertura).toBeUndefined();
  });
});
