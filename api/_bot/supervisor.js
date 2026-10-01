/**
 * El supervisor de lo delicado: lo que Lola hace que QUITA protección a la
 * familia no se fía solo de su palabra.
 *
 * `confirmado: true` lo pone el modelo, y un modelo puede equivocarse al leer
 * la charla (tomar un «¿y si quitamos el huevo?» por un sí). Así que antes de
 * quitar una alergia, decir que nadie tiene ninguna o quitar a alguien de la
 * casa, se mira lo que ha escrito la PERSONA en este turno: tiene que ser un
 * sí o pedirlo ella con esas palabras. Si no, la herramienta no se ejecuta y
 * Lola recibe la instrucción de preguntar.
 *
 * Lo que AÑADE protección (apuntar una alergia) no se frena aquí: pararlo
 * sería peor que dejarlo pasar. Sigue necesitando su confirmado, como siempre.
 *
 * Puro y sin red: se prueba en supervisor.test.js.
 */

import { normal } from "./menu.js";

// Un sí al principio del mensaje: «sí», «vale», «correcto, guárdalo», el botón
// «Sí». Frontera a mano y no \b: en JavaScript \b no ve la «í» de «sí». El
// «si» sin tilde solo vale solo («si», «si!»): «si le quitamos el huevo…» es
// una condición, no un sí.
const SI = /^((s[ií]+|vale|ok|okay|claro|correct[oa]|exacto|eso es|confirm\w*|adelante|perfecto|de acuerdo|gu[aá]rd(a|alo|ala)|dale|hazlo)(?=[\s,.!?¡¿]|$)|👍|✅)/i;
const SI_SIN_TILDE = /^si\b(?![.!]*\s*$)/i;
// «Claro que no», «vale, pero no quites nada»: empieza como un sí y no lo es.
const PERO_NO = /^[^.?!]{0,25}\b(que no|pero|no quites|no lo quites|espera)\b/;
const QUITA = /\b(quit(a|ale|alo|ar|aselo|aselas)|borr(a|ale|alo|ar)|elimin(a|ale|alo|ar)|sac(a|ale|alo)|ya no (come|vive|esta|viene)|no (es|son) alergic|no tienen? alergi|no (es|tiene) intoleran|ya no (es|tiene))/;
const NADIE = /\b(nadie|ninguno|ninguna|sin alergias|ningun)\b|\bno hay (alergi|ninguna|ningun|intoleran)/;
// Un «no» o un «nada» a secas, contestando a «¿alguien tiene alergias?»
// («Nada nada, feel free», «no, tranquila»): vale si TODO el mensaje es eso y
// relleno. Si lleva algo más («no hay manera de que coma huevo»), no.
// Lo pidió Pablo el 1 oct 2026: con solo «nadie/ninguna», Lola acababa
// preguntando las alergias tres veces.
const RELLENO = new Set(["no", "nada", "nop", "nadie", "ninguna", "ninguno", "tranquila", "tranquilo", "feel", "free", "gracias", "vale", "ok", "de", "momento", "que", "yo", "sepa", "todo", "bien"]);
const NO_A_SECAS = (dicho) => {
  const palabras = dicho.split(/[^a-z0-9ñ]+/).filter(Boolean);
  return palabras.length > 0 && palabras.length <= 6 && /^(no|nada|nop)$/.test(palabras[0]) && palabras.every((w) => RELLENO.has(w));
};

/** Lo que escribió la persona, sin el «[Ana]: » de los grupos, el «[nota de voz]» de los audios ni signos de apertura. */
const limpio = (texto) => String(texto ?? "").trim().replace(/^\[[^\]]{1,40}\]:\s*/, "").replace(/^\[nota de voz\]\s*/i, "").replace(/^[¡¿]+/, "").trim();

/**
 * @param {string} herramienta
 * @param {object} args
 * @param {string} texto  lo que ha escrito la persona en este turno
 * @returns {null | string}  null = adelante; si no, lo que se le dice a Lola
 */
export function supervisar(herramienta, args = {}, texto = "") {
  const t = limpio(texto);
  const dicho = normal(t);
  const esSi = SI.test(t) && !SI_SIN_TILDE.test(t) && !PERO_NO.test(dicho);

  if (herramienta === "ajustar_alergias" && args.confirmado === true) {
    if (args.quitar && !esSi && !QUITA.test(dicho)) {
      return "No se ha guardado: quitar una alergia necesita que la persona lo confirme. Pregúntale en una frase si seguro que ya no la tiene, y quítala solo con su «sí».";
    }
    if (args.ninguna && !esSi && !NADIE.test(dicho) && !NO_A_SECAS(dicho)) {
      return "No se ha guardado: para dejar a la casa sin alergias, la persona tiene que decirlo o confirmarlo. Pregúntale si nadie tiene ninguna alergia ni intolerancia.";
    }
  }

  if (herramienta === "quitar_comensal") {
    const nombre = normal(args.nombre ?? "").split(/\s+/)[0];
    const loPide = QUITA.test(dicho) && nombre && new RegExp(`\\b${nombre.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(dicho);
    if (!esSi && !loPide) {
      return `No se ha quitado: antes pregunta si seguro que ${args.nombre ?? "esa persona"} ya no come en casa (sus gustos y alergias dejan de contar para el menú), y quítala solo con su «sí».`;
    }
  }

  return null;
}
