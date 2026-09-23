/**
 * LO QUE SE PIERDE AL COCINAR.
 *
 * Un hervido se lleva la mitad del folato de una legumbre y un crudo no se
 * lleva nada. El catálogo suma los ingredientes como si nada se perdiera, así
 * que sus micros están inflados —y no un poco al azar: siempre en la misma
 * dirección, que es lo que hace que sumar la semana no lo arregle.
 *
 * Los factores salen de la USDA Table of Nutrient Retention Factors, Release 6
 * (2007), dominio público, y NO de la literatura de memoria. Cada par familia ×
 * técnica guarda al lado la descripción exacta de R6 de la que sale, para que
 * el número se pueda auditar sin salir del repo. El mapeo y sus dos decisiones
 * —el agua que se come y el jugo que se sirve— están en scripts/build-retencion.mjs.
 *
 * ── La forma, que es la de la casa ─────────────────────────────────────────
 *
 * `{ factor, via, duda }`, igual que `fraccionServida`, `factorHidratacion` y
 * `factorAceite`. Y con la misma regla: cuando el dato no alcanza se devuelve
 * factor 1 con `via: "SIN DECIDIR"` y se dice qué falta, en vez de un número
 * inventado que parezca conocimiento.
 *
 * Un factor 1 aquí significa tres cosas distintas y NO se pueden confundir:
 * que no se pierde nada, que R6 no publica ese nutriente, o que no se sabe si
 * la ficha ya venía cocinada. Por eso `via` no es decorativo: es la diferencia
 * entre «no pierde» y «no lo sé», y quien sume coberturas tiene que poder
 * contarlas aparte.
 *
 * ── Lo que esto NO es ──────────────────────────────────────────────────────
 *
 * `tecnica` es UNA por receta, y una receta mezcla: una ensalada con huevo
 * cocido, un guiso con perejil crudo por encima. Lo correcto sería por línea ×
 * técnica del paso donde entra, y eso hoy no se puede: el operador que ataría
 * ingrediente a paso concuerda un 54,4 % con la curación y está declarado no
 * promocionable. Esto es un proxy por receta, y llamarlo otra cosa sería
 * mentir sobre su precisión.
 *
 * Y seis campos se quedan fuera porque R6 no los publica: selenio, yodo,
 * manganeso, ácido pantoténico y las vitaminas D, E y K. No reciben corrección
 * y el operador lo dice, en vez de asumirles un 100 % que nadie ha medido.
 */

import tabla from "../../data/retencion.json";

const SIN_FACTOR = new Set(tabla._meta.nutrientesSinFactor);

/** Un alimento crudo no pierde nada, y una receta sin técnica no dice qué hizo. */
const NO_COCINA = new Set(["crudo", null, undefined, ""]);

/**
 * @param {string} campo     nombre por ración, p. ej. `folate_ug`
 * @param {string} familia   familia del alimento (ver alimentoSchema.js)
 * @param {string} tecnica   `olla` | `sarten` | `horno` | `plancha` | `crudo`
 * @param {boolean|null} yaCocinada  lo que dice `vieneCocinada` de la ficha
 * @returns {{factor: number, via: string, duda: string|null}}
 */
export function factorRetencion(campo, familia, tecnica, yaCocinada) {
  // EL ORDEN DE LAS GUARDAS ES EL PUNTO DE ESTE FICHERO, y la primera versión
  // lo tenía al revés: preguntaba por el estado de la ficha antes de mirar si
  // había alguna corrección que aplicar. Resultado, 800 de 947 recetas salían
  // marcadas «SIN DECIDIR» por culpa del pimentón y el azafrán — especias sin
  // estado declarado, que no tienen tabla y a las que nunca se les iba a
  // descontar nada. Un aviso que salta siempre no avisa de nada.
  //
  // Así que primero se descarta lo que no se corrige por otros motivos, y solo
  // cuando de verdad HABÍA una corrección en juego se mira si el estado de la
  // ficha la bloquea. `SIN DECIDIR` significa entonces lo que debe: aquí se
  // perdió una corrección que sí tocaba.
  if (NO_COCINA.has(tecnica)) {
    return { factor: 1, via: tecnica === "crudo" ? "no se cocina" : "la receta no declara técnica", duda: null };
  }

  const deFamilia = tabla[familia];
  if (!deFamilia) {
    return { factor: 1, via: `R6 no cubre la familia ${familia}`, duda: null };
  }

  const fila = deFamilia[tecnica];
  if (!fila) {
    return { factor: 1, via: `R6 no cubre ${familia} a la técnica ${tecnica}`, duda: null };
  }

  if (SIN_FACTOR.has(campo)) {
    return { factor: 1, via: `R6 no publica ${campo}`, duda: `${campo} no se corrige: R6 no mide ese nutriente` };
  }

  // Ahora sí: las lentejas cocidas de CIQUAL ya perdieron su folato en el
  // laboratorio. Volver a descontárselo lo cuenta dos veces, y el error que
  // eso mete es del mismo tamaño que el que corrige.
  if (yaCocinada === true) {
    return { factor: 1, via: "la ficha ya viene cocinada", duda: null };
  }
  if (yaCocinada === null || yaCocinada === undefined) {
    return {
      factor: 1,
      via: "SIN DECIDIR",
      duda: "no se sabe si la ficha viene cruda o cocinada, así que no se descuenta nada",
    };
  }

  const factor = fila.factores[campo];
  // Ausente en la fila = R6 lo midió y no se pierde (el generador descarta los
  // 100 % para no guardar 84 tablas llenas de unos).
  if (factor == null) return { factor: 1, via: `USDA R6 · ${fila.usda}`, duda: null };

  return { factor, via: `USDA R6 · ${fila.usda}`, duda: null };
}

/** Las familias que tienen tabla, para que quien mida cobertura no adivine. */
export const FAMILIAS_CON_TABLA = Object.keys(tabla).filter((k) => k !== "_meta");

export const META_RETENCION = tabla._meta;
