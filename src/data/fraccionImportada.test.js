import { describe, expect, it } from "vitest";

import fraccionComestible from "./fraccionComestible.json";

/**
 * LO QUE NO PUEDE ENTRAR AQUÍ DESDE BEDCA, Y POR QUÉ.
 *
 * 33 de las fracciones de este fichero están copiadas del campo
 * `edible_portion` de BEDCA, y sus motivos lo dicen. Es una fuente razonable y
 * seguirá usándose — pero ese campo tiene agujeros rellenos con números que
 * parecen medidas:
 *
 *   ajo                0,01   un ajo no es un 1 % comestible
 *   mango              0,00
 *   coles-de-bruselas  0,00
 *   pescadilla         0,00
 *
 * El 0 significa «falta el dato», igual que el 1,00 lo significa en las fichas
 * duplicadas: lo delata el contraste entre hermanas, porque donde hay dato de
 * verdad coinciden (el rape da 0,73 en sus dos fichas, el pez espada 0,94 en
 * tres) y donde no, una trae valor y la otra un 0 o un 1 redondo.
 *
 * Hoy ninguno de los cuatro ha entrado. Este test existe para la SIGUIENTE
 * pasada: el día que alguien vuelva a rellenar fracciones desde BEDCA —que es
 * lo razonable, quedan 29 alimentos sin dato— el ajo entraría con un 0,01 y
 * 4,1 kg de ajo desaparecerían del catálogo sin que nada fallara.
 */
const VENENOS = {
  ajo: "BEDCA f_id 2361 da edible_portion 0,01 para el ajo. Un diente pelado ronda 0,87.",
  mango: "BEDCA da 0,00, que en ese campo significa «falta el dato», no «no se come».",
  "coles-de-bruselas": "BEDCA da 0,00, y además su ficha dice «cruda» en español y «frozen» en inglés.",
  pescadilla: "BEDCA da 0,00. Está declarada a 1 con motivo propio; si alguna vez baja, mira de dónde viene el número.",
};

describe("las fracciones importadas de BEDCA", () => {
  it("ninguno de los cuatro valores envenenados ha entrado", () => {
    const entrados = Object.entries(VENENOS)
      .filter(([id]) => fraccionComestible[id] != null)
      .filter(([id]) => fraccionComestible[id].valor < 0.2)
      .map(([id, porque]) => `${id} = ${fraccionComestible[id].valor} · ${porque}`);
    expect(
      entrados,
      "una fracción copiada de un hueco de BEDCA. El campo `edible_portion` rellena "
      + "con 0 y con 1,00 lo que no tiene, y esos cuatro alimentos son los casos "
      + "conocidos. Si de verdad se tira casi todo, escríbelo con su motivo y saca "
      + "el id de esta lista.",
    ).toEqual([]);
  });

  /**
   * El invariante general, que es el que caza a los que aún no conocemos: entre
   * el 0 y el 0,25 no hay comida. O no se come nada —el hueso, la cáscara, y
   * entonces vale exactamente 0— o se come al menos una cuarta parte. Hoy el
   * valor más bajo distinto de cero es el 0,25 de las almejas, que es el peor
   * rendimiento de todo el catálogo.
   */
  it("no hay fracciones entre 0 y 0,25: ahí solo caen los errores de importación", () => {
    const raras = Object.entries(fraccionComestible)
      .filter(([k]) => k !== "_")
      .filter(([, v]) => v.valor > 0 && v.valor < 0.25)
      .map(([k, v]) => `${k} = ${v.valor}`);
    expect(
      raras,
      "una fracción entre 0 y 0,25. Un alimento del que se aprovecha menos de una "
      + "cuarta parte no se compra: o es 0 y no se come (hueso, cáscara, y entonces "
      + "decláralo como tal) o el número viene de un campo vacío.",
    ).toEqual([]);
  });
});
