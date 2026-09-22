import { describe, expect, it } from "vitest";
import { medidasDe, enPlural } from "./medidasDeIngrediente.js";

/**
 * La tabla existe para que un desplegable no ofrezca «brick de ajos».
 *
 * Así que lo que se comprueba no es que devuelva algo, sino que NO devuelva lo
 * imposible: cada caso mira a la vez lo que debe estar y lo que no.
 */
describe("medidasDe", () => {
  it("el ajo va en cabezas o dientes, no en los envases del súper", () => {
    const { envases, unidades } = medidasDe("Ajo");
    expect(envases).toEqual(["cabeza", "diente"]);
    expect(envases).not.toContain("brick");
    expect(envases).not.toContain("botella");
    expect(unidades).toEqual(["g"]);
  });

  it("el arroz viene en paquete o bolsa, y se pesa", () => {
    const { envases, unidades } = medidasDe("Arroz");
    expect(envases).toEqual(["paquete", "bolsa"]);
    expect(unidades).toEqual(["g", "kg"]);
  });

  it("la familia se hereda sin estar escrita", () => {
    // "Espaguetis" no está en ninguna regla por su nombre: entra por la de pasta.
    expect(medidasDe("Espaguetis").envases).toEqual(["paquete", "bolsa"]);
    expect(medidasDe("Tallarines").unidades).toEqual(["g", "kg"]);
  });

  it("los líquidos no se cuentan en gramos", () => {
    expect(medidasDe("Leche").unidades).toEqual(["ml", "l"]);
    expect(medidasDe("Aceite de oliva").envases).toEqual(["botella", "garrafa"]);
  });

  it("el aceite gana a las conservas aunque comparta pasillo", () => {
    // Si la regla de conservas fuera antes, el aceite de oliva saldría en lata.
    expect(medidasDe("Aceite de oliva virgen extra").envases).not.toContain("lata");
  });

  it("lo que se cuenta por pieza no trae envase", () => {
    for (const n of ["Cebolla", "Tomate", "Limón", "Zanahoria", "Patata", "Huevos"]) {
      expect(medidasDe(n).envases).toEqual([]);
      expect(medidasDe(n).unidades[0]).toBe("ud");
    }
  });

  it("los huevos se cuentan y no se empaquetan", () => {
    // Con envase, la ficha pide cuántos envases Y qué trae cada uno, así que
    // "6 huevos" habría que decirlo como "media docena de 12".
    expect(medidasDe("Huevos")).toEqual({ envases: [], unidades: ["ud"] });
  });

  it("un nombre desconocido ofrece todo, que es mejor que no ofrecer nada", () => {
    const { envases, unidades } = medidasDe("Cosa rarísima");
    expect(envases).toEqual([]);
    expect(unidades).toEqual(["ud", "g", "kg", "ml", "l"]);
  });

  it("aguanta lo vacío", () => {
    expect(medidasDe("").unidades.length).toBeGreaterThan(0);
    expect(medidasDe(undefined).unidades.length).toBeGreaterThan(0);
  });

  it("las unidades salen siempre del vocabulario de kitchenUnits", () => {
    const legales = new Set(["ud", "g", "kg", "ml", "l"]);
    for (const n of ["Ajo", "Arroz", "Leche", "Atún en lata", "Pollo", "Yogur", "Huevos"]) {
      for (const u of medidasDe(n).unidades) expect(legales.has(u)).toBe(true);
    }
  });
});

describe("enPlural", () => {
  it("suma una ese, salvo el cartón", () => {
    expect(enPlural("paquete")).toBe("paquetes");
    expect(enPlural("cabeza")).toBe("cabezas");
    expect(enPlural("cartón")).toBe("cartones");
    expect(enPlural("pack")).toBe("packs");
  });
});
