import { describe, it, expect } from "vitest";
import { pieceFor, pieceGramsFor } from "./ingredients.js";
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
