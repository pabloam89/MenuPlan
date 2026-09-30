/**
 * DE QUÉ ES FUENTE UN PLATO, Y DE QUÉ ES ALTO.
 *
 * El catálogo calcula 24 micronutrientes y hasta hoy solo sabía decir una cosa
 * sobre ellos: `rico_hierro`, colgada de quince palabras clave. Con los micros
 * ya calculados, su cobertura y la retención descontada, se puede decir de
 * cada plato de qué es «fuente de» y de qué es «alto en» — con el mismo listón
 * que usa una etiqueta, que es público y está escrito.
 *
 * ── Esto habla del PLATO, nunca de quien se lo come ────────────────────────
 *
 * El VRN del Anexo XIII es un valor ÚNICO de etiquetado: un adulto medio, sin
 * sexo, sin edad y sin estado. No son las necesidades de nadie en concreto —
 * una mujer en edad fértil necesita más hierro y un hombre menos—, y por eso
 * de aquí no sale ningún «cubres el X % de lo tuyo». Sale «este plato es alto
 * en hierro», que es una propiedad del plato.
 *
 * El día que haya perfil por persona, lo que hará falta es OTRA tabla (EFSA
 * publica PRI por edad, sexo y estado, y además los límites superiores). Esta
 * no se recicla para eso: es una tabla de *claims*, no de necesidades, y
 * confundirlas es el error que hay que no cometer.
 *
 * ── Los dos cortes, y de dónde salen ───────────────────────────────────────
 *
 * Reglamento (CE) 1924/2006, Anexo: «fuente de» a partir del 15 % del VRN y
 * «alto contenido en» al doble, el 30 %. Los VRN son los del Reglamento (UE)
 * 1169/2011, Anexo XIII, parte A.
 *
 * LA TRASLACIÓN SE DECLARA, igual que en healthFlags: la norma mide por 100 g
 * de producto envasado y aquí se mide POR RACIÓN de un plato cocinado. Un
 * plato no es una etiqueta. Esto toma prestado su listón porque es público,
 * está motivado y no se lo ha inventado nadie aquí — no está aplicando el
 * reglamento, y una frase que saliera a pantalla tendría que decirlo.
 *
 * ── Por qué la cobertura baja NO impide declarar ───────────────────────────
 *
 * Cuesta un momento verlo y es el punto más fino del fichero. Si el hierro de
 * un plato está sostenido por el 40 % de su masa, el número publicado es el
 * hierro de ese 40 %: el real es MAYOR, nunca menor, porque lo que falta suma
 * cero. Así que una declaración positiva con cobertura baja es conservadora
 * por construcción — si con el 40 % ya pasa del 30 % del VRN, con el plato
 * entero también.
 *
 * Lo que la cobertura baja sí produce son falsos NEGATIVOS, y por eso el
 * operador no dice nunca «este plato no es fuente de X»: distingue «no llega»
 * de «no se sabe» y publica los dos por separado. La cobertura viaja con cada
 * declaración de todos modos, porque quien la pinte tiene derecho a saberlo.
 */

import { META_RETENCION } from "./factorRetencion.js";

/**
 * Valores de Referencia de Nutrientes. Reglamento (UE) 1169/2011, Anexo XIII,
 * parte A, punto 1 — «Ingestas de referencia de vitaminas y minerales
 * (adultos)». Transcritos del reglamento, no redondeados ni ajustados.
 *
 * Quedan fuera los VRN que el repo no mide (biotina, cloruro, fluoruro, cromo,
 * molibdeno) y los campos del repo que no tienen VRN: `sodium_mg` —la sal
 * tiene su propio régimen y su declaración es de «bajo», no de «alto»—,
 * `cholesterol_mg`, y `retinol_ug` / `beta_carotene_ug`, que no se declaran
 * por separado porque el VRN de vitamina A se mide sobre la suma en RAE.
 */
export const VRN = {
  vitamin_a_rae_ug: 800,
  vitamin_d_ug: 5,
  vitamin_e_mg: 12,
  vitamin_k_ug: 75,
  vitamin_c_mg: 80,
  thiamin_mg: 1.1,
  riboflavin_mg: 1.4,
  niacin_mg: 16,
  vitamin_b6_mg: 1.4,
  folate_ug: 200,
  vitamin_b12_ug: 2.5,
  pantothenic_acid_mg: 6,
  potassium_mg: 2000,
  calcium_mg: 800,
  phosphorus_mg: 700,
  magnesium_mg: 375,
  iron_mg: 14,
  zinc_mg: 10,
  copper_mg: 1,
  manganese_mg: 2,
  selenium_ug: 55,
  iodine_ug: 150,
};

/** Reglamento (CE) 1924/2006, Anexo. «Alto» es exactamente el doble de «fuente». */
export const FRACCION_FUENTE = 0.15;
export const FRACCION_ALTO = FRACCION_FUENTE * 2;

export const CAMPOS_CON_VRN = Object.keys(VRN);

/** Los que salen sin corregir por cocción porque R6 no los mide. */
const SIN_RETENCION = new Set(META_RETENCION.nutrientesSinFactor);

/**
 * NO HAY NOMBRE BONITO, y es deliberado. `nutrientes.js` declara unidad,
 * decimales y nombre por ración, pero no una etiqueta en castellano, y abrir
 * aquí una lista paralela de nombres sería la séptima copia de algo que ya
 * tiene su sitio. Cuando haga falta pintarlos, la etiqueta se añade a la
 * declaración única y la lee todo el mundo.
 *
 * @param {object} nutricion  la salida de `computeRecipeNutrition`, o una
 *   receta de catálogo ya hidratada con sus micros
 * @returns {{
 *   alto: Array<{campo, valor, pctVRN, cobertura}>,
 *   fuente: Array<{campo, valor, pctVRN, cobertura}>,
 *   noLlega: string[],
 *   noSeSabe: string[],
 * }}
 */
export function declaracionesDe(nutricion) {
  const alto = [];
  const fuente = [];
  const noLlega = [];
  const noSeSabe = [];
  if (!nutricion) return { alto, fuente, noLlega, noSeSabe: CAMPOS_CON_VRN.slice() };

  const coberturas = nutricion.coberturaPorCampo ?? nutricion.micronutrientesCobertura ?? {};

  for (const campo of CAMPOS_CON_VRN) {
    const valor = nutricion[campo];
    // `null` es «no lo sé», y 0 con cobertura 0 es lo mismo. Ninguno de los dos
    // permite decir que el plato NO lo tiene.
    const cobertura = coberturas[campo] ?? null;
    if (valor == null || (cobertura === 0 && !valor)) { noSeSabe.push(campo); continue; }

    const pct = valor / VRN[campo];
    const fila = {
      campo,
      valor,
      pctVRN: Math.round(pct * 1000) / 10,
      cobertura,
      // R6 no publica factor de retención para siete campos, así que su valor
      // NO lleva descontado lo que se pierde al cocinar y está por encima de
      // lo que llega al plato. El selenio y el yodo son dos de ellos, y el
      // selenio sale «alto» en 463 de las 743 estrella: sin esta marca, esa
      // cifra se leería como si tuviera la misma solidez que la del hierro.
      sinRetencion: SIN_RETENCION.has(campo) || undefined,
    };
    if (pct >= FRACCION_ALTO) alto.push(fila);
    else if (pct >= FRACCION_FUENTE) fuente.push(fila);
    // NO LLEGA AL LISTÓN, que no es lo mismo que «no lo tiene»: si la cobertura
    // es baja, el valor real puede estar por encima y esta rama se lo pierde.
    // Por eso se separa de `noSeSabe` en vez de juntarlos en un «no».
    else if (cobertura != null && cobertura >= 0.9) noLlega.push(campo);
    else noSeSabe.push(campo);
  }

  // De más destacado a menos, que es el orden en que sirven para enseñarlos.
  const porPeso = (a, b) => b.pctVRN - a.pctVRN;
  return { alto: alto.sort(porPeso), fuente: fuente.sort(porPeso), noLlega, noSeSabe };
}

/**
 * El titular: los micros por los que este plato destaca, ya ordenados.
 *
 * ── ESTE, Y NO LA LISTA CRUDA, ES LO QUE SE PINTA ──────────────────────────
 *
 * Medido sobre las 743 estrella: la MEDIANA es de OCHO «alto en» por plato, y
 * ni uno solo se queda sin declaración. No es un fallo del cálculo — es lo que
 * pasa al trasladar el listón. El corte del 30 % está pensado para 100 g de un
 * producto envasado, y 100 g de galletas no son una comida; una ración de
 * plato principal es del orden de un tercio del día, así que pasa del 30 % del
 * VRN diario en casi todo lo que lleva.
 *
 * Un plato que es «alto en» ocho cosas no está diciendo nada. El fósforo sale
 * alto en 562 de 743 y el selenio en 463: son ciertos y son inútiles. Lo que
 * informa es en qué destaca MÁS, y por eso esto ordena por porcentaje de VRN y
 * corta. Tres cosas ciertas valen más que veintidós exhaustivas.
 */
export function destacaEn(nutricion, tope = 3) {
  const { alto, fuente } = declaracionesDe(nutricion);
  return [...alto, ...fuente].slice(0, tope);
}
