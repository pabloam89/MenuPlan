import { describe, expect, it } from "vitest";
import { medidasDe, medidaPorId, enPlural, UNIDAD_SUELTA } from "./medidasDeIngrediente.js";

const ids = (nombre) => medidasDe(nombre).map((m) => m.id);

/**
 * La tabla existe para dos cosas, y las dos se comprueban aquí:
 *   1. que un desplegable no ofrezca «brick de ajos»
 *   2. que una medida que ya dice cuánto vale no vuelva a preguntarlo
 */
describe("medidasDe", () => {
  it("el ajo va en cabezas o dientes, no en los envases del súper", () => {
    expect(ids("Ajo")).toEqual(["cabeza", "diente", "g"]);
    expect(ids("Ajo")).not.toContain("brick");
    expect(ids("Ajo")).not.toContain("botella");
  });

  it("una cabeza ya dice lo que pesa, así que no se pregunta", () => {
    const cabeza = medidaPorId(medidasDe("Ajo"), "cabeza");
    expect(cabeza.abierto).toBeFalsy();
    expect(cabeza.por).toBe(60);
    expect(cabeza.base).toBe("g");
  });

  it("un paquete sí se pregunta, porque cambia según cuál cojas", () => {
    const paquete = medidaPorId(medidasDe("Arroz"), "paquete");
    expect(paquete.abierto).toBe(true);
    expect(paquete.por).toBe(500);
    expect(paquete.unidades).toEqual(["g", "kg"]);
  });

  it("la familia se hereda sin estar escrita", () => {
    expect(ids("Espaguetis")).toEqual(ids("Arroz"));
    expect(ids("Tallarines")).toContain("paquete");
  });

  it("los líquidos no se cuentan en gramos", () => {
    for (const m of medidasDe("Leche")) expect(m.base).toBe("ml");
    expect(ids("Aceite de oliva")).toEqual(["botella", "garrafa", "ml", "l"]);
  });

  it("el aceite gana a las conservas aunque comparta pasillo", () => {
    expect(ids("Aceite de oliva virgen extra")).not.toContain("lata");
  });

  it("lo que se cuenta por pieza empieza por unidades y no trae envase", () => {
    for (const n of ["Cebolla", "Tomate", "Limón", "Zanahoria", "Patata", "Huevos"]) {
      expect(medidasDe(n)[0].id).toBe("ud");
      expect(medidasDe(n).every((m) => !m.abierto)).toBe(true);
    }
  });

  it("los huevos se cuentan y nada más", () => {
    expect(ids("Huevos")).toEqual(["ud"]);
  });

  it("un nombre desconocido ofrece todo, que es mejor que no ofrecer nada", () => {
    expect(ids("Cosa rarísima")).toEqual(["ud", "g", "kg", "ml", "l"]);
  });

  it("aguanta lo vacío", () => {
    expect(medidasDe("").length).toBeGreaterThan(0);
    expect(medidasDe(undefined).length).toBeGreaterThan(0);
  });

  it("toda medida sabe convertirse a lo que se guarda", () => {
    const bases = new Set(["ud", "g", "ml"]);
    const nombres = ["Ajo", "Arroz", "Leche", "Atún en lata", "Pollo", "Yogur", "Huevos", "Cebolla", "Lentejas"];
    for (const n of nombres) {
      for (const m of medidasDe(n)) {
        expect(bases.has(m.base)).toBe(true);
        expect(m.por).toBeGreaterThan(0);
        // Una medida abierta tiene que decir en qué se declara su contenido.
        if (m.abierto) expect(m.unidades.length).toBeGreaterThan(0);
      }
    }
  });

  it("no hay ids repetidos dentro de un mismo ingrediente", () => {
    for (const n of ["Ajo", "Arroz", "Leche", "Lentejas", "Aceite de oliva"]) {
      const lista = ids(n);
      expect(new Set(lista).size).toBe(lista.length);
    }
  });
});

describe("medidaPorId", () => {
  it("cae en la primera cuando el id no está", () => {
    expect(medidaPorId(medidasDe("Ajo"), "brick").id).toBe("cabeza");
  });
});

describe("enPlural", () => {
  it("las unidades no se pluralizan: son abreviaturas", () => {
    for (const u of UNIDAD_SUELTA) expect(enPlural(u)).toBe(u);
  });

  it("los envases suman una ese, salvo el cartón", () => {
    expect(enPlural("paquete")).toBe("paquetes");
    expect(enPlural("cabeza")).toBe("cabezas");
    expect(enPlural("cartón")).toBe("cartones");
  });
});
