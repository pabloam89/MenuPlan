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
// Quitar una alergia pidiéndolo (sin pregunta de Lola delante) exige hablar de
// la alergia, no del plato: «quítale el queso a Leo» es la pizza, no su alergia
// a la leche. Sin esto, Lola pregunta y el «sí» a su pregunta vale.
const DE_ALERGIA = /\b(alergi|alergic|intoleran|celiac|tolera)/;
// Quitar a alguien de la casa: verbos de quitar, o «ya no vive / come aquí».
// «Ya no viene los jueves» o «esta semana está fuera» son ausencias, no bajas.
const QUITA_COMENSAL = /\b(quit(a|ale|alo|ar|adla|adlo)|borr(a|ale|alo|ar)|elimin(a|ale|alo|ar)|sac(a|ale|alo)|ya no (vive|come) (en casa|aqui|con nosotros))\b/;
const TEMPORAL = /\b(hoy|manana|esta semana|este finde|la semana que viene|hasta|de vacaciones|de campamento|los (lunes|martes|miercoles|jueves|viernes|sabados|domingos)|el (lunes|martes|miercoles|jueves|viernes|sabado|domingo))\b/;
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

// Cómo se nombra cada uno de los 14 alérgenos al hablar (texto ya normalizado:
// minúsculas y sin tildes). Sin frontera al final: «huevos», «nueces».
const DICHO_ALERGENO = {
  gluten: /\b(gluten|celiac|trigo|harina)/,
  crustaceos: /\b(crustace|marisco|gamba|langostin|cangrej|cigala|bogavante)/,
  huevos: /\bhuevo/,
  pescado: /\b(pescado|pez\b|peces)/,
  cacahuetes: /\b(cacahuet|mani\b)/,
  soja: /\bsoja/,
  leche: /\b(leche|lacte|lactos|queso|yogur|nata\b)/,
  frutos_cascara: /\b(frutos? (secos|de cascara)|nuec|nuez|almendr|avellan|anacard|pistach)/,
  apio: /\bapio/,
  mostaza: /\bmostaza/,
  sesamo: /\bsesamo/,
  sulfitos: /\bsulfit/,
  altramuces: /\baltramu/,
  moluscos: /\b(molusc|marisco|mejillon|almeja|calamar|pulpo|sepia|berberecho|ostra)/,
  // Intolerancias y estados (ajustar_salud).
  lactosa_fina: /\blactos/,
  fructosa: /\bfructos/,
  sorbitol: /\bsorbitol/,
  embarazo: /\b(embaraz|ha nacido|nacio|di a luz|dio a luz|parto|parido)/,
  lactancia: /\b(lactanc|pecho|teta|destet)/,
};
// Pedir que se quite un estado se dice de más maneras: «ya no estoy
// embarazada», «ya ha nacido», «ya no le doy el pecho», «hemos destetado».
const QUITA_SALUD = new RegExp(`${QUITA.source}|\\b(ya ha nacido|ya nacio|di a luz|dio a luz|ya no (estoy|esta|le doy|doy)|destet)`);
const mencionaAlergeno = (id, txt) => (DICHO_ALERGENO[id] ?? new RegExp(`\\b${normal(String(id)).replace(/_/g, " ")}`)).test(txt);

// La persona por su nombre (el primero basta: «Leo» por «Leo Martín»). Para
// toda la casa vale «todos», «la casa», «nadie».
function mencionaPersona(persona, txt) {
  const p = normal(persona ?? "");
  if (!p || /^(toda la casa|todos|la casa|familia)$/.test(p)) return /\b(todos|toda la casa|la casa|nadie|ninguno|familia)\b/.test(txt);
  const nombre = p.split(/\s+/)[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${nombre}\\b`).test(txt);
}

/** Lo que escribió la persona, sin el «[Ana]: » de los grupos, el «[nota de voz]» de los audios ni signos de apertura. */
const limpio = (texto) => String(texto ?? "").trim().replace(/^\[[^\]]{1,40}\]:\s*/, "").replace(/^\[nota de voz\]\s*/i, "").replace(/^[¡¿]+/, "").trim();

/**
 * @param {string} herramienta
 * @param {object} args
 * @param {string} texto  lo que ha escrito la persona en este turno
 * @returns {null | string}  null = adelante; si no, lo que se le dice a Lola
 */
export function supervisar(herramienta, args = {}, texto = "", { anterior = "" } = {}) {
  const t = limpio(texto);
  const dicho = normal(t);
  const esSi = SI.test(t) && !SI_SIN_TILDE.test(t) && !PERO_NO.test(dicho);

  if (herramienta === "ajustar_alergias" && args.confirmado === true) {
    // Quitar: no basta un «sí» o un «quita» cualquiera; tienen que ser ESA
    // persona y ESE alérgeno. O los nombra la persona al pedirlo («quítale el
    // huevo a Leo»), o los nombraba la pregunta de Lola a la que dice que sí.
    const deEso = (txt) => (args.alergenos ?? []).length > 0
      && args.alergenos.every((a) => mencionaAlergeno(a, txt)) && mencionaPersona(args.persona, txt);
    const loPide = QUITA.test(dicho) && DE_ALERGIA.test(dicho) && deEso(dicho);
    const loConfirma = esSi && (deEso(dicho) || deEso(normal(anterior)));
    if (args.quitar && !loPide && !loConfirma) {
      return "No se ha guardado: quitar una alergia necesita que la persona lo confirme diciendo quién y qué. Pregúntale en una frase si seguro que esa persona ya no tiene esa alergia (nómbralas las dos), y quítala solo con su «sí».";
    }
    // Un «sí» solo vale si contesta a una pregunta de Lola sobre alergias.
    const siAAlergias = esSi && /\b(alergi|alergic|intoleran)/.test(normal(anterior));
    if (args.ninguna && !siAAlergias && !NADIE.test(dicho) && !NO_A_SECAS(dicho)) {
      return "No se ha guardado: para dejar a la casa sin alergias, la persona tiene que decirlo o confirmarlo. Pregúntale si nadie tiene ninguna alergia ni intolerancia.";
    }
  }

  // Intolerancias y estados (embarazo, lactancia): igual que una alergia.
  if (herramienta === "ajustar_salud" && args.confirmado === true && args.quitar) {
    const cosas = [...(args.intolerancias ?? []), ...(args.estados ?? [])];
    const deEso = (txt) => cosas.length > 0 && cosas.every((c) => mencionaAlergeno(c, txt)) && mencionaPersona(args.persona, txt);
    if (!(QUITA_SALUD.test(dicho) && deEso(dicho)) && !(esSi && (deEso(dicho) || deEso(normal(anterior))))) {
      return "No se ha guardado: quitar una intolerancia o un estado necesita que la persona lo confirme diciendo quién y qué. Pregúntale en una frase si seguro que ya no (nombra a la persona y lo que es), y quítalo solo con su «sí».";
    }
  }

  if (herramienta === "quitar_comensal") {
    const nombre = normal(args.nombre ?? "").split(/\s+/)[0];
    const nombra = (txt) => Boolean(nombre) && new RegExp(`\\b${nombre.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(txt);
    const loPide = QUITA_COMENSAL.test(dicho) && !TEMPORAL.test(dicho) && nombra(dicho);
    // Un «sí» solo vale si contesta a una pregunta de Lola que nombraba a esa persona.
    const loConfirma = esSi && nombra(normal(anterior));
    if (!loConfirma && !loPide) {
      return `No se ha quitado: antes pregunta si seguro que ${args.nombre ?? "esa persona"} ya no come en casa (sus gustos y alergias dejan de contar para el menú), y quítala solo con su «sí».`;
    }
  }

  return null;
}
