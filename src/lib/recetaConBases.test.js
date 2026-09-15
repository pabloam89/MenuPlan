import { describe, expect, it } from "vitest";

import { BASES, claveDeBase } from "./bases.js";
import { recipeCatalog } from "../data/recipeCatalog.js";
import { recetaConBases } from "./recetaConBases.js";

/**
 * La receta vista desde el martes, con las bases ya hechas.
 *
 * Lo que se vigila aquí no es que quite cosas —eso es fácil— sino que no quite
 * de MÁS: los pasos de reactivar cuestan, el aceite y la sal siguen haciendo
 * falta, y un ingrediente que la base solo toca de pasada no está resuelto.
 */

const paso = (text, minutes, kind, base) => ({ text, minutes, kind, ...(base ? { base } : {}) });

// Un plato de manual: tres pasos de sofrito, uno que lo junta y uno de cocinar.
const PLATO = {
  name: "Pollo con sofrito",
  basesAparte: ["sofrito"],
  ingredients: [
    { name: "Cebolla", ingredientId: "cebolla", amount: 150, unit: "g" },
    { name: "Tomate", ingredientId: "tomate", amount: 200, unit: "g" },
    { name: "Pechuga de pollo", ingredientId: "pechuga-de-pollo", amount: 300, unit: "g" },
    { name: "Aceite de oliva virgen extra", ingredientId: "aceite-oliva-virgen", amount: 20, unit: "ml" },
  ],
  stepsRich: [
    paso("Picar {{Cebolla}} muy fina.", 5, "prep", "sofrito"),
    paso("Pocharla con {{Aceite de oliva virgen extra}} a fuego suave.", 15, "activo", "sofrito"),
    paso("Añadir {{Tomate}} y dejar reducir.", 10, "pasivo", "sofrito"),
    paso("Saltear {{Pechuga de pollo}} y añadir el sofrito.", 8, "activo"),
    paso("Servir.", 1, "emplatado"),
  ],
};

const deBase = (v, nombre) => v.ingredientes.find((i) => i.name === nombre)?.deBase ?? null;

describe("recetaConBases", () => {
  it("cambia los pasos de la base por los de reactivarla, en su sitio", () => {
    const v = recetaConBases(PLATO);
    expect(v.aplicada).toBe(true);
    // Los tres de sofrito se van; entran los dos de reactivar, delante, que es
    // donde estaba el primero.
    expect(v.pasos.filter((p) => p.deReactivacion)).toHaveLength(2);
    expect(v.pasos[0].deReactivacion).toBe(true);
    expect(v.pasos.some((p) => p.text.includes("Pocharla"))).toBe(false);
    // Y el paso que JUNTA el sofrito con el pollo se queda: la base está
    // hecha, pero el plato no se monta solo.
    expect(v.pasos.some((p) => p.text.includes("Saltear"))).toBe(true);
  });

  it("reactivar no es gratis: cuenta en el tiempo", () => {
    const v = recetaConBases(PLATO);
    const sofrito = BASES.find((b) => b.baseKey === "sofrito");
    const coste = sofrito.reactivacion.reduce((s, p) => s + p.minutes, 0);
    // 8 + 1 de lo que queda, más lo que cueste sacar el bote.
    expect(v.minutos).toBe(9 + coste);
    expect(v.minutos).toBeGreaterThan(9);
  });

  it("marca como resuelto lo que SOLO usa la base", () => {
    const v = recetaConBases(PLATO);
    expect(deBase(v, "Cebolla")).toBe("sofrito");
    expect(deBase(v, "Tomate")).toBe("sofrito");
    expect(deBase(v, "Pechuga de pollo")).toBe(null);
  });

  it("el aceite y la sal NO se dan por resueltos aunque solo salgan en la base", () => {
    // Es el fallo que más duele porque no se ve: la ficha diría que ya lo
    // tienes y la lista de la compra perdería el aceite.
    const v = recetaConBases(PLATO);
    expect(deBase(v, "Aceite de oliva virgen extra")).toBe(null);
  });

  it("un ingrediente que se usa también fuera de la base se queda", () => {
    const conTomateFuera = {
      ...PLATO,
      stepsRich: [
        ...PLATO.stepsRich,
        paso("Terminar con {{Tomate}} fresco en dados.", 2, "prep"),
      ],
    };
    expect(deBase(recetaConBases(conTomateFuera), "Tomate")).toBe(null);
    // La cebolla, que sigue siendo solo del sofrito, no se ve afectada.
    expect(deBase(recetaConBases(conTomateFuera), "Cebolla")).toBe("sofrito");
  });

  it("sin bases hechas devuelve la receta tal cual", () => {
    const v = recetaConBases(PLATO, []);
    expect(v.aplicada).toBe(false);
    expect(v.pasos).toBe(PLATO.stepsRich);
    expect(v.ingredientes.every((i) => i.deBase === null)).toBe(true);
    expect(v.minutos).toBe(39);
  });

  it("una base declarada pero sin ningún paso marcado no reactiva nada", () => {
    // Declarar arroz aparte y no tener ni un paso de arroz es frecuente: no
    // hay tupper que sacar, así que cobrarlo sería inventarse un coste.
    const v = recetaConBases({ ...PLATO, mainBase: "arroz", baseMode: "aparte" });
    expect(v.bases.map((b) => b.clave)).toEqual(["sofrito"]);
  });

  it("el ahorro que publica es real: nunca presume de minutos que no quita", () => {
    // El fusible de toda la promesa. `ahorro` es lo unico que la ficha puede
    // ensenar, asi que no puede decir 20 si la receta sigue durando lo mismo.
    const mentiras = [];
    for (const r of recipeCatalog) {
      if (!(r.stepsRich ?? []).some((p) => p.base)) continue;
      const v = recetaConBases(r);
      // Nunca mas de lo que de verdad quita, nunca negativo. Cuando reactivar
      // cuesta mas que el paso que se lleva, la diferencia es negativa y lo
      // que se publica tiene que ser cero, no ese numero en rojo.
      const real = Math.max(0, v.minutosEnteros - v.minutos);
      if (v.ahorro !== real) mentiras.push(`${r.name}: dice ${v.ahorro}, son ${real}`);
    }
    expect(mentiras).toEqual([]);
  });

  it("cuando reactivar cuesta mas que el paso que quita, el ahorro es cero", () => {
    // Pasa de verdad, en una decena de platos: una ensalada cuya unica linea
    // de legumbre es "escurrir los garbanzos" cambia un minuto por los dos de
    // sacar el tupper. La vista sigue siendo util —los garbanzos estan
    // cocidos— pero no hay nada de que presumir, y el numero lo dice.
    const flojo = {
      basesAparte: ["legumbre"],
      ingredients: [{ name: "Garbanzos", ingredientId: "garbanzos", amount: 200, unit: "g" }],
      stepsRich: [
        paso("Escurrir {{Garbanzos}}.", 1, "prep", "legumbre"),
        paso("Mezclar con el resto y servir.", 4, "activo"),
      ],
    };
    const v = recetaConBases(flojo);
    expect(v.aplicada).toBe(true);
    expect(v.minutos).toBeGreaterThan(v.minutosEnteros);
    expect(v.ahorro).toBe(0);
    // Y los garbanzos SIGUEN marcados como ya cocidos, que es lo que vale.
    expect(deBase(v, "Garbanzos")).toBe("legumbre");
  });

  it("toda base que se reactiva sabe cómo hacerlo", () => {
    for (const b of BASES) {
      expect(b.reactivacion?.length, `${claveDeBase(b)} no dice cómo se reactiva`).toBeGreaterThan(0);
    }
  });
});
