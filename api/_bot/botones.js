/**
 * Los botones que el CÓDIGO reconoce por su texto, en castellano y en inglés
 * (#958). Con el inglés elegido, Lola traduce lo que escribe y, a veces, los
 * botones; antes el código solo los entendía en castellano y, pulsados en
 * inglés, no hacían nada («That's not right» no deshacía, «Redo the week of
 * 26 Oct» no rehacía esa semana).
 *
 * Vocabulario cerrado: de las listas de aquí salen el texto que se escribe
 * (el botón, el prompt de Lola) y lo que se reconoce. No hay una regex aparte
 * que pueda separarse de la lista.
 */
import { MESES_CORTOS } from "../../src/lib/dias.js";
import { normal } from "./interprete.js";

// Las formas de cada botón. La primera es la del botón; las demás, lo que la
// gente escribe por su cuenta y vale igual. Las inglesas son el espejo de las
// castellanas que ya valían, ninguna más.
const FORMAS = Object.freeze({
  noEsAsi: {
    es: ["No es así", "No es correcto", "No, así no", "Me he equivocado"],
    en: ["That's not right", "That is not right", "That's wrong", "Not like that", "I made a mistake"],
  },
  eligeTu: {
    es: ["Elige tú", "La que quieras", "La que tú quieras", "Cualquiera", "Me da igual", "Sorpréndeme"],
    en: ["You choose", "Whichever you like", "Any of them", "I don't mind", "Surprise me"],
  },
});

// El botón de rehacer: su principio y los meses, en cada idioma.
const REHACER = Object.freeze({ es: "Rehacer la del", en: "Redo the week of" });
const MESES = Object.freeze({
  es: MESES_CORTOS,
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
});

/** El texto del botón que rehace la semana de `iso` («Rehacer la del 26 oct»). */
export const textoRehacer = (iso, lengua = "es") =>
  `${REHACER[lengua]} ${Number(iso.slice(8, 10))} ${MESES[lengua][Number(iso.slice(5, 7)) - 1]}`;

/** Cada botón, con la forma que se escribe en cada idioma. */
export const BOTONES = Object.freeze({
  noEsAsi: { es: FORMAS.noEsAsi.es[0], en: FORMAS.noEsAsi.en[0] },
  eligeTu: { es: FORMAS.eligeTu.es[0], en: FORMAS.eligeTu.en[0] },
  rehacer: { es: textoRehacer("2026-10-26", "es"), en: textoRehacer("2026-10-26", "en") },
});

// Para comparar: sin tildes ni mayúsculas (normal, del intérprete), sin
// apóstrofos («thats» = «that's») y con la puntuación como espacio.
const limpio = (t) => normal(String(t ?? "").replace(/['’]/g, "")).replace(/[^\p{L}\p{N} ]+/gu, " ").replace(/\s+/g, " ").trim();
const formas = (boton) => [...FORMAS[boton].es, ...FORMAS[boton].en].map(limpio);
const NO_ES_ASI = new Set(formas("noEsAsi"));
const ELIGE_TU = formas("eligeTu");

/** ¿Es el botón [[No es así]] (o una de sus formas), en cualquiera de los dos idiomas? */
export const esNoEsAsi = (texto) => NO_ES_ASI.has(limpio(texto));

/** ¿Empieza por «Elige tú» o una de sus formas («elige tú, la que sea»)? */
export const esEligeTu = (texto) => {
  const t = limpio(texto);
  return ELIGE_TU.some((f) => t === f || t.startsWith(`${f} `));
};

/**
 * El día y el mes que nombra el botón de rehacer, en los dos idiomas, o null.
 * @returns {{ dia: number, mes: number } | null}  mes 0-11
 */
export function leerBotonRehacer(texto) {
  const t = limpio(texto);
  for (const lengua of Object.keys(REHACER)) {
    const pre = `${limpio(REHACER[lengua])} `;
    if (!t.startsWith(pre)) continue;
    const m = t.slice(pre.length).match(/^(\d{1,2}) (\p{L}+)$/u);
    const mes = m ? MESES[lengua].findIndex((x) => limpio(x) === m[2]) : -1;
    return mes < 0 ? null : { dia: Number(m[1]), mes };
  }
  return null;
}
