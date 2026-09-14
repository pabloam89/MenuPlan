/**
 * El placeholder que se escribe solo, se borra hacia atrás y pasa al siguiente.
 *
 * ── Para qué sirve de verdad ──────────────────────────────────────────────
 * Un campo en blanco con "o escríbeme" da mal material: la gente no sabe qué
 * se puede pedir y escribe tres palabras o nada. Ver frases reales
 * apareciendo enseña el REGISTRO esperado —"menos pescado", "más cosas al
 * horno"— sin gastar una línea de ayuda ni cuatro tarjetas de sugerencia.
 *
 * ── La máquina de estados, aparte del componente ──────────────────────────
 * `pasoDeTecleo` es una función pura: dado un estado, devuelve el siguiente y
 * cuánto hay que esperar. Eso la hace probable sin temporizadores ni React, y
 * es donde viven las decisiones que se notan: que borrar sea más rápido que
 * escribir (nadie lee al borrar), y que haya una pausa al terminar la frase
 * (si no, no da tiempo a leerla, que es justo para lo que está).
 */

/** Milisegundos de cada cosa. Borrar va al doble de rápido que escribir. */
export const RITMO = {
  escribir: 55,
  borrar: 28,
  // Al acabar la frase se para para que se pueda leer entera.
  leer: 1600,
  // Y un respiro corto entre una y la siguiente.
  entre: 350,
};

/** El estado inicial: nada escrito, sobre la primera frase. */
export function tecleoInicial() {
  return { indice: 0, largo: 0, borrando: false };
}

/**
 * El siguiente fotograma. Devuelve `{ estado, espera }`.
 *
 * @param {object} estado  { indice, largo, borrando }
 * @param {string[]} frases
 */
export function pasoDeTecleo(estado, frases) {
  if (!frases || frases.length === 0) return { estado, espera: RITMO.leer };

  const { indice, largo, borrando } = estado;
  const frase = frases[indice % frases.length] ?? "";

  if (!borrando) {
    if (largo < frase.length) {
      return { estado: { indice, largo: largo + 1, borrando: false }, espera: RITMO.escribir };
    }
    // Frase entera: se para a que se lea antes de empezar a borrar.
    return { estado: { indice, largo, borrando: true }, espera: RITMO.leer };
  }

  if (largo > 0) {
    return { estado: { indice, largo: largo - 1, borrando: true }, espera: RITMO.borrar };
  }
  // Vacío: a la siguiente. El índice se envuelve para que el bucle no acabe.
  return {
    estado: { indice: (indice + 1) % frases.length, largo: 0, borrando: false },
    espera: RITMO.entre,
  };
}

/**
 * El texto que toca pintar para un estado.
 *
 * La primera letra va en MAYÚSCULA aunque la frase del registro venga en
 * minúscula ("menos pescado"): esas frases están escritas para meterse dentro
 * de otra oración, y aquí son la oración entera. Se capitaliza al pintar y no
 * en la tabla para no obligar a que cada ejemplo nuevo se acuerde.
 */
export function textoDeTecleo(estado, frases) {
  if (!frases || frases.length === 0) return "";
  const frase = frases[estado.indice % frases.length] ?? "";
  const trozo = frase.slice(0, estado.largo);
  return trozo ? trozo.charAt(0).toUpperCase() + trozo.slice(1) : "";
}

/**
 * Cuánto mide la frase más larga, en caracteres. La caja se dimensiona con
 * esto para que no dé saltos de alto mientras teclea: un campo que crece y
 * encoge solo mueve el botón de enviar bajo el dedo.
 */
export function fraseMasLarga(frases) {
  return (frases ?? []).reduce((max, f) => Math.max(max, f.length), 0);
}
