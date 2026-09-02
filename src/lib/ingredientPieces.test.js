import { describe, it, expect } from "vitest";
import { pieceFor, pieceGramsFor, resolveIngredientId } from "./ingredients.js";
import { gramsPerPiece } from "./kitchenUnits.js";
import { ingredientCatalog } from "./ingredients.js";

describe("pieza del ingrediente", () => {
  it("el catálogo manda sobre la heurística de nombres", () => {
    // El caso que motivó todo esto: PIECE_WEIGHTS casa por regex y gana la
    // primera, así que "Pimientos del piquillo" heredaba los 180 g de un
    // morrón y una lata de 8 se convertía en 1,4 kg. Resolver por id es lo
    // único que lo impide de raíz.
    expect(pieceGramsFor("Pimientos del piquillo")).toBe(25);
    expect(pieceFor("Pimientos del piquillo")?.nombre).toBe("piquillo");
  });

  it("cae a la heurística cuando el nombre no está en el catálogo", () => {
    // Recetas propias del usuario: nombres libres que nadie ha catalogado.
    // Ahí seguimos haciendo exactamente lo de antes, ni mejor ni peor.
    const libre = "Cebolla de mi huerto";
    expect(pieceGramsFor(libre)).toBe(gramsPerPiece(libre));
  });

  it("nombra la pieza, no solo la pesa", () => {
    // Sin el nombre no se puede escribir "4 rebanadas" ni "media cabeza", y
    // sobre todo no se detecta un peso absurdo de un vistazo: "rebanada, 35 g"
    // se lee bien y "hogaza, 35 g" canta.
    expect(pieceFor("Pan de molde")).toEqual({ nombre: "rebanada", g: 35 });
    expect(pieceFor("Apio")?.nombre).toBe("rama");
  });

  it("ninguna pieza del catálogo tiene un peso absurdo", () => {
    for (const ing of ingredientCatalog) {
      if (!ing.pieza) continue;
      expect(ing.pieza.g, `${ing.id} (${ing.pieza.nombre})`).toBeGreaterThan(0);
      expect(ing.pieza.g, `${ing.id} (${ing.pieza.nombre})`).toBeLessThan(2000);
      expect(ing.pieza.nombre.length, ing.id).toBeGreaterThan(0);
    }
  });
});

describe("un id, varias piezas", () => {
  it("distingue la cabeza del diente aunque sean el mismo ajo", () => {
    // El caso que planteó el bug: los dos son ajo -mismo id, mismo pasillo,
    // mismos alérgenos- pero entre una cabeza y un diente hay un 10x. Lo que
    // los distingue es el alias, no el ingrediente.
    expect(resolveIngredientId("Cabeza de ajos")).toBe(resolveIngredientId("Ajo"));
    expect(pieceFor("Ajo")).toEqual({ nombre: "diente", g: 5 });
    expect(pieceFor("Cabeza de ajos")).toEqual({ nombre: "cabeza", g: 50 });
  });

  it("la hogaza no pesa lo que una rebanada", () => {
    expect(pieceGramsFor("Pan rústico")).toBe(35);
    expect(pieceGramsFor("Pan de hogaza")).toBe(500);
  });

  it("un pimiento de padrón no pesa lo que un morrón", () => {
    // Salía a 180 g por pieza: en la despensa se leían "3 ud · 450 g" de
    // padrones, que son ~6 g cada uno.
    expect(pieceGramsFor("Pimiento de padrón")).toBe(6);
    expect(pieceGramsFor("Pimiento verde")).toBe(180);
  });
});

describe("identidad: alias que apuntaban a otro ingrediente", () => {
  it("un salmonete no es un salmón", () => {
    expect(resolveIngredientId("Salmonetes pequeños")).toBe("salmonete");
    expect(resolveIngredientId("Salmón")).not.toBe("salmonete");
  });

  it("una endivia no es lechuga", () => {
    // Heredaba los valores nutricionales de la lechuga.
    expect(resolveIngredientId("Endivias")).toBe("endivia");
  });

  it("el choricero en plural va a su propio id, que ya existía", () => {
    expect(resolveIngredientId("Pimientos choriceros")).toBe("pimiento-choricero");
    expect(resolveIngredientId("Pimiento choricero")).toBe("pimiento-choricero");
  });

  it("yema y clara dejan de ser un huevo entero", () => {
    expect(resolveIngredientId("Yema de huevo")).toBe("yema-de-huevo");
    expect(resolveIngredientId("Clara de huevo")).toBe("clara-de-huevo");
    expect(pieceGramsFor("Yema de huevo")).toBe(18);
    expect(pieceGramsFor("Huevo")).toBe(60);
  });
});
