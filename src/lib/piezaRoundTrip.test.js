import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { pieceGramsFor } from "./ingredients.js";
import { gramsPerPiece } from "./kitchenUnits.js";

/**
 * Dar un peso por pieza a un ingrediente NO es gratis, y el camino por el que
 * hace daño no se ve leyendo el JSON.
 *
 * `aggregationUnit` (lib/shoppingBuilder.js) saca la línea de `ud` y la pasa a
 * gramos en cuanto `pieceGramsFor` devuelve algo — y `pieceGramsFor` pregunta
 * primero al catálogo (`ingrediente.pieza`) y luego al regex. Pero la lente
 * "Unidades" de la pantalla de compra vuelve a piezas con `gramsPerPiece`, que
 * mira SOLO PIECE_WEIGHTS y NO mira el catálogo.
 *
 * Cuando un ingrediente tiene `pieza` y no tiene entrada en PIECE_WEIGHTS, el
 * viaje es de ida: "16 uds de placas de canelones" pasa a "128 g" y ya no hay
 * forma de volver a verlo en piezas. Encima la línea deja de pasar por el
 * redondeo a pieza entera de `snapToPackSize`, así que una casa de 3 acaba
 * comprando "1,5 panes de hamburguesa".
 *
 * Esto pasó: se añadió `pieza` a 11 ingredientes para tapar un hueco de la
 * derivación de nutrición y se rompieron 21 líneas de la lista de la compra
 * con los 1706 tests en verde. Se revirtió. Este test es el que faltaba.
 *
 * NO arregla la deuda que ya había — 23 ingredientes están en ese viaje de
 * ida desde antes, y entre ellos hay piezas tan frecuentes como el huevo, el
 * limón y el pan. La fija para que no crezca en silencio: quien meta uno
 * nuevo tiene que verlo aquí y decidir a conciencia.
 */
const SOLO_IDA_CONOCIDOS = [
  "alcachofa", "apio", "champinon", "clara-de-huevo", "endivia", "guindilla",
  "higo", "huevos", "jamon-york", "laurel", "lenguado", "lima", "limon",
  "masa-quebrada", "pan", "pan-de-payes", "pan-molde", "pimiento-choricero",
  "tinta-de-calamar", "tortilla-de-trigo", "truchas-enteras", "vieira",
  "yema-de-huevo",
];

describe("peso por pieza: ida y vuelta", () => {
  const ingredientes = JSON.parse(
    readFileSync(new URL("../data/ingredients.json", import.meta.url), "utf8"),
  );

  it("no crece la lista de ingredientes que salen de `ud` sin poder volver", () => {
    const soloIda = ingredientes
      .filter((i) => pieceGramsFor(i.name) != null && gramsPerPiece(i.name) == null)
      .map((i) => i.id)
      .sort();
    expect(soloIda).toEqual([...SOLO_IDA_CONOCIDOS].sort());
  });

  it("un `pieza` nuevo necesita su entrada en PIECE_WEIGHTS", () => {
    // El caso concreto que se rompió: `canelones` no está en PIECE_WEIGHTS, así
    // que darle `pieza` lo mandaría a gramos sin retorno.
    const canelones = ingredientes.find((i) => i.id === "canelones");
    expect(canelones).toBeDefined();
    expect(canelones.pieza).toBeUndefined();
    expect(gramsPerPiece("Placas de canelones")).toBeNull();
  });
});
