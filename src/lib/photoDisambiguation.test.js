import { describe, expect, it } from "vitest";

import { disambiguationClause } from "./photoDisambiguation.js";

/**
 * El "con" de los nombres de plato.
 *
 * `disambiguationClause` añade instrucciones al prompt de la foto, y una de
 * ellas decide si lo que va detrás de " con " es una GUARNICIÓN APARTE que hay
 * que pintar separada en el bol, o parte del propio plato.
 *
 * Durante mucho tiempo lo decidía una heurística: hay un " con ", luego hay
 * guarnición. Nació cuando todas las fotos salían de un CSV de combos
 * plato+guarnición, donde era cierta. Deja de serlo en cuanto un plato normal
 * lleva "con" en el nombre, que son cientos: un "Bowl de verduras asadas con
 * quinoa y feta" acababa con la orden de pintar la quinoa "como acompañamiento
 * separado" fuera del bol — justo lo contrario del plato.
 *
 * Quien llama sí sabe la verdad (en el CSV la guarnición va en su columna, y
 * un combo de verdad tiene el id con "+"), así que ahora se le puede pasar.
 */
describe("disambiguationClause · guarnición aparte o parte del plato", () => {
  const GUARNICION = /La guarnici[oó]n es/i;

  it("con esCombo false, un 'con' en el nombre NO inventa una guarnición", () => {
    const c = disambiguationClause("Bowl de verduras asadas con quinoa y feta", { esCombo: false });
    expect(c).not.toMatch(GUARNICION);
  });

  it("con esCombo true, sí la pide y la nombra", () => {
    const c = disambiguationClause("Solomillo con patatas panadera", { esCombo: true });
    expect(c).toMatch(GUARNICION);
    expect(c).toContain("patatas panadera");
  });

  it("sin decir nada se mantiene la heurística vieja, para no cambiar en silencio lo que ya salía bien", () => {
    expect(disambiguationClause("Solomillo con patatas panadera")).toMatch(GUARNICION);
    expect(disambiguationClause("Solomillo a la plancha")).not.toMatch(GUARNICION);
  });

  // Las reglas que NO dependen del combo tienen que seguir saliendo: son
  // parches puestos uno a uno contra fallos reales del generador de imágenes.
  it("las demás reglas no dependen de esCombo", () => {
    const tortilla = disambiguationClause("Tortilla de patatas con cebolla", { esCombo: false });
    expect(tortilla).toMatch(/tortilla espa[nñ]ola/i);

    const fritas = disambiguationClause("Entrecot con patatas fritas", { esCombo: false });
    expect(fritas).toMatch(/patatas fritas son OBLIGATORIAS/);
  });

  it("un nombre sin trampas no añade nada", () => {
    expect(disambiguationClause("Lentejas estofadas", { esCombo: false })).toBe("");
  });
});
