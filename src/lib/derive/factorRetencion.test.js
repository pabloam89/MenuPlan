import { describe, it, expect } from "vitest";
import { factorRetencion, FAMILIAS_CON_TABLA, META_RETENCION } from "./factorRetencion.js";
import tabla from "../../data/retencion.json";

describe("el orden de las guardas", () => {
  /**
   * LA PRIMERA VERSIÓN PREGUNTABA POR EL ESTADO ANTES DE MIRAR SI HABÍA ALGO
   * QUE CORREGIR, y por eso 800 de las 947 recetas salían marcadas «SIN
   * DECIDIR» — por el pimentón y el azafrán, especias sin estado declarado, sin
   * tabla, a las que nunca se les iba a descontar nada. Un aviso que salta
   * siempre no avisa de nada.
   */
  it("una especia sin estado no ensucia el aviso: no tenía tabla", () => {
    const r = factorRetencion("folate_ug", "especia", "olla", null);
    expect(r.factor).toBe(1);
    expect(r.via).not.toBe("SIN DECIDIR");
    expect(r.via).toMatch(/no cubre la familia/);
  });

  it("pero una legumbre sin estado SÍ avisa: ahí se perdió una corrección", () => {
    const r = factorRetencion("folate_ug", "legumbre", "olla", null);
    expect(r.factor).toBe(1);
    expect(r.via).toBe("SIN DECIDIR");
    expect(r.duda).toBeTruthy();
  });
});

describe("lo que ya viene cocinado no se descuenta dos veces", () => {
  /**
   * EL FALLO QUE ESTO IMPIDE, y es el que hacía peligroso todo el ejercicio:
   * las lentejas cocidas de CIQUAL ya perdieron su folato en el laboratorio.
   * Aplicarles el factor del hervido lo descuenta otra vez, y el error que
   * mete es del mismo tamaño que el que corrige.
   */
  it("una ficha cocida conserva su valor", () => {
    const r = factorRetencion("folate_ug", "legumbre", "olla", true);
    expect(r.factor).toBe(1);
    expect(r.via).toBe("la ficha ya viene cocinada");
  });

  it("y una cruda sí lo pierde", () => {
    const r = factorRetencion("folate_ug", "legumbre", "olla", false);
    expect(r.factor).toBeLessThan(1);
    expect(r.via).toMatch(/^USDA R6/);
  });
});

describe("las técnicas y las familias que no tienen fila", () => {
  it("crudo no pierde nada", () => {
    expect(factorRetencion("vitamin_c_mg", "verdura_hoja", "crudo", false).factor).toBe(1);
  });

  it("una receta sin técnica declarada tampoco corrige", () => {
    const r = factorRetencion("vitamin_c_mg", "verdura_hoja", null, false);
    expect(r.factor).toBe(1);
    expect(r.via).toMatch(/no declara técnica/);
  });

  /**
   * R6 publica 26 nutrientes y el repo maneja 32. Selenio, yodo, manganeso,
   * ácido pantoténico y las vitaminas D, E y K no tienen factor, y el operador
   * lo DICE en vez de asumirles un 100 % que nadie ha medido. Es la diferencia
   * entre «no se pierde» y «no lo sé», y el yodo es justo el micro peor
   * cubierto del catálogo: fingir que se conserva entero sería lo contrario de
   * lo que hace falta.
   */
  it("un nutriente que R6 no mide se declara, no se asume", () => {
    for (const campo of META_RETENCION.nutrientesSinFactor) {
      const r = factorRetencion(campo, "verdura_hoja", "olla", false);
      expect(r.factor, campo).toBe(1);
      expect(r.via, campo).toMatch(/no publica/);
      expect(r.duda, campo).toBeTruthy();
    }
  });
});

describe("la tabla sale de R6 y se puede auditar", () => {
  it("cada par familia×técnica dice de qué fila de R6 viene", () => {
    const mudos = [];
    for (const familia of FAMILIAS_CON_TABLA) {
      for (const [tecnica, fila] of Object.entries(tabla[familia])) {
        if (!fila.usda) mudos.push(`${familia}.${tecnica}`);
      }
    }
    expect(mudos).toEqual([]);
  });

  it("ningún factor se sale de lo posible", () => {
    const raros = [];
    for (const familia of FAMILIAS_CON_TABLA) {
      for (const [tecnica, fila] of Object.entries(tabla[familia])) {
        for (const [campo, f] of Object.entries(fila.factores)) {
          // Un factor mayor que 1 sería una ganancia de nutriente al cocinar, y
          // R6 no publica ninguna; uno por debajo de 0,2 sería una pérdida del
          // 80 %, que tampoco aparece en ninguna fila de esta selección.
          if (f > 1 || f < 0.2) raros.push(`${familia}.${tecnica}.${campo} = ${f}`);
        }
      }
    }
    expect(raros).toEqual([]);
  });

  /**
   * LO QUE R6 DICE Y AQUÍ SE COMPRUEBA. No se copia el número: se comprueba la
   * RELACIÓN que cualquier libro de nutrición confirma y que es la razón de
   * ser de todo esto. Si el mapeo se cambiara por otro que invirtiera estos
   * órdenes, el resto de la tabla podría seguir siendo plausible y aquí saltaría.
   */
  it("el folato de una legumbre hervida pierde más que su calcio", () => {
    const f = tabla.legumbre.olla.factores;
    expect(f.folate_ug).toBeLessThan(f.calcium_mg);
  });

  it("y el potasio de la pasta se va con el agua de cocción", () => {
    // Se escurre: es la única fécula del mapeo que no se come su agua.
    expect(tabla.pasta.olla.factores.potassium_mg).toBeLessThan(0.5);
    // El arroz sí la absorbe, y por eso conserva mucho más.
    expect(tabla.arroz.olla.factores.potassium_mg ?? 1).toBeGreaterThan(tabla.pasta.olla.factores.potassium_mg);
  });

  it("la fuente y su licencia viajan con los datos", () => {
    expect(META_RETENCION.fuente).toMatch(/Release 6/);
    expect(META_RETENCION.licencia).toMatch(/dominio público/);
    expect(META_RETENCION.url).toMatch(/^https:\/\//);
  });
});
