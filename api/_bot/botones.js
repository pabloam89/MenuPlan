/**
 * Los botones que el CÓDIGO reconoce por su texto, en castellano y en inglés
 * (#958). Con el inglés elegido, Lola traduce lo que escribe y, a veces, los
 * botones; antes el código solo los entendía en castellano y, pulsados en
 * inglés, no hacían nada («That's not right» no deshacía, «Redo the week of
 * 26 Oct» no rehacía esa semana). Vocabulario cerrado: cada botón, sus formas
 * en los dos idiomas, y un test que las recorre.
 */
import { MESES_CORTOS } from "../../src/lib/dias.js";

/** Cada botón que el código reconoce, con su forma canónica en cada idioma. */
export const BOTONES = Object.freeze({
  noEsAsi: { es: "No es así", en: "That's not right" },
  eligeTu: { es: "Elige tú", en: "You choose" },
  rehacer: { es: "Rehacer la del 26 oct", en: "Redo the week of 26 Oct" },
});

// «No es así» tras apuntar algo: deshacer lo que se acaba de guardar. Las
// formas inglesas son el espejo de las castellanas que ya valían, una a una
// (no es así / no es correcto / así no / me he equivocado); ninguna más.
const NO_ES_ASI = /^(no es as[ií]|no es correcto|no,? as[ií] no|me he equivocado|that'?s not right|that is not right|that'?s wrong|not like that|i made a mistake)$/i;
/** ¿Es el botón [[No es así]], en cualquiera de los dos idiomas? */
export const esNoEsAsi = (texto) => NO_ES_ASI.test(String(texto ?? "").trim());

// «Elige tú»: frontera a mano y no \b, que en JavaScript \b no ve la «ú» final.
// El inglés, espejo de las castellanas (elige tú / la que quieras / cualquiera /
// me da igual / sorpréndeme).
export const ELIGE_TU = /^(elige t[uú]|la que (tu |tú )?quieras|cualquiera|me da igual|sorpr[eé]ndeme|you choose|whichever you like|any of them|i don'?t mind|surprise me)(?=[\s,.!?¡¿]|$)/i;

// Los meses en tres letras → 0-11: los castellanos, de la lista con que se
// escribe el botón (src/lib/dias.js); los ingleses, solo aquí, que es el único
// sitio que los lee.
const MESES_EN = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MESES = Object.fromEntries([...MESES_EN.map((m, i) => [m, i]), ...MESES_CORTOS.map((m, i) => [m, i])]);
const REHACER_ES = /^\s*rehacer la del (\d{1,2}) ([a-z]{3})\s*$/i;
// «Redo the week of 26 Oct», «Redo week of Oct 26», «Redo the 26 Oct».
const REHACER_EN = /^\s*redo (?:the )?(?:week )?(?:of )?(?:(\d{1,2}) ([a-z]{3})|([a-z]{3}) (\d{1,2}))\s*$/i;

/**
 * El día y el mes que nombra el botón de rehacer, en los dos idiomas, o null.
 * @returns {{ dia: number, mes: number } | null}  mes 0-11
 */
export function leerBotonRehacer(texto) {
  const t = String(texto ?? "");
  const es = t.match(REHACER_ES);
  const en = es ? null : t.match(REHACER_EN);
  const dia = es ? es[1] : en ? en[1] ?? en[4] : null;
  const mes = es ? es[2] : en ? en[2] ?? en[3] : null;
  const m = mes == null ? undefined : MESES[mes.toLowerCase()];
  return m === undefined ? null : { dia: Number(dia), mes: m };
}
