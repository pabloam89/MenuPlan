/**
 * Lo hecho sale de los datos, no del texto (#958, raíz 1).
 *
 * Antes cada herramienta que escribe contestaba una frase («Guardado…») y Lola
 * escribía la suya encima. Nada obligaba a que la confirmación coincidiera con
 * lo guardado, y lo parcial no existía: de 66 cosas de seis tickets se
 * apuntaron 38 y Lola dijo «todo apuntado». Medido en conversaciones reales,
 * ~8 de 47 respuestas (17 %) decían algo que lo guardado contradecía.
 *
 * Ahora una herramienta que escribe devuelve un RESULTADO con forma fija:
 *
 *   { accion, pedido, hecho: [..], sin_hacer: [{ que, motivo }], estado }
 *
 * y de ahí salen las dos cosas que ve alguien:
 *   · lo que lee el modelo (`paraElModelo`): el resultado tal cual, en JSON,
 *     con la orden de no repetir la lista ni decir «todo» si no lo es;
 *   · el recibo que ve la familia (`recibo`): «✅ Apuntado en la despensa: …»
 *     y «⚠️ Sin hacer: … (por qué)», que pinta el código encima del mensaje de
 *     Lola, igual que el menú se pinta debajo (pintar.js). Lola no lo redacta.
 *
 * Aquí vive también el vigilante de «dice que lo guardó» (antes en agente.js):
 * es la misma pregunta, ¿coincide lo dicho con lo hecho?
 *
 * Pura: sin base ni modelo, para los tests.
 */

const MARCA = Symbol("resultado");

/**
 * Qué se ha hecho, en vocabulario cerrado: cada acción con la etiqueta del
 * recibo. Una acción nueva entra aquí (el test lo comprueba).
 */
export const ACCIONES = Object.freeze({
  despensa: "Apuntado en la despensa",
  compra_quitar: "Quitado de la compra",
  semana: "Cambiado en el menú",
  invitado: "Invitados apuntados",
  cole: "Menú del cole guardado",
  tarea: "Tarea cambiada",
  receta: "Receta guardada",
  gustos: "Gustos apuntados",
});

/** El estado de un resultado, de lo hecho y lo que no: no se escribe a mano. */
export const ESTADOS_RESULTADO = ["hecho", "parcial", "nada"];

/** Cuántas cosas se nombran en el recibo antes de «y N más». */
const EN_EL_RECIBO = 8;

const texto = (x) => String(x ?? "").trim();

/**
 * Un resultado de escritura. `hecho`: lo que de verdad quedó guardado, cada
 * cosa como texto corto. `sinHacer`: lo pedido que NO se hizo, con su motivo.
 * `nota`: lo demás que el modelo tiene que saber (no sale en el recibo).
 */
export function resultado({ accion, hecho = [], sinHacer = [], nota = "" }) {
  if (!ACCIONES[accion]) throw new Error(`Acción sin etiqueta: ${accion}`);
  const h = hecho.map(texto).filter(Boolean);
  const s = sinHacer.map((x) => (typeof x === "string" ? { que: texto(x), motivo: "" } : { que: texto(x?.que), motivo: texto(x?.motivo) })).filter((x) => x.que);
  const estado = !h.length ? "nada" : s.length ? "parcial" : "hecho";
  return Object.freeze({ [MARCA]: true, accion, pedido: h.length + s.length, hecho: h, sinHacer: s, estado, nota: texto(nota) });
}

export const esResultado = (x) => Boolean(x && typeof x === "object" && x[MARCA]);

/**
 * Lo que lee el modelo. JSON para que no haya dos formas de leerlo, y la orden
 * de lo que no puede decir: el recibo ya cuenta lo hecho y lo que falta.
 */
export function paraElModelo(r) {
  const datos = { accion: r.accion, estado: r.estado, pedido: r.pedido, hecho: r.hecho, sin_hacer: r.sinHacer.map(({ que, motivo }) => ({ que, motivo })) };
  const orden = r.estado === "hecho"
    ? "El recibo con lo hecho sale pintado encima de tu mensaje: no repitas la lista; di en una frase lo que sigue."
    : r.estado === "parcial"
      ? `NO está todo: ${r.sinHacer.length} sin hacer. El recibo (✅ lo hecho, ⚠️ lo que falta y por qué) sale pintado encima de tu mensaje: no lo repitas, no digas «todo» y ofrece lo que se puede hacer con lo que falta.`
      : "No se ha guardado NADA: no digas que está hecho. El recibo con el porqué sale pintado encima de tu mensaje; ofrece cómo arreglarlo.";
  return `RESULTADO ${JSON.stringify(datos)}\n${orden}${r.nota ? `\n${r.nota}` : ""}`;
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function lista(cosas) {
  const vistas = cosas.slice(0, EN_EL_RECIBO).map(esc);
  const resto = cosas.length - vistas.length;
  if (resto > 0) return `${vistas.join(", ")} y ${resto} más`;
  return vistas.length > 1 ? `${vistas.slice(0, -1).join(", ")} y ${vistas.at(-1)}` : vistas.join("");
}

/**
 * El recibo del turno, en HTML de Telegram: una línea ✅ por acción con algo
 * hecho y una ⚠️ por cada motivo de lo que no. Vacío si no hubo resultados.
 */
export function recibo(resultados = []) {
  const lineas = [];
  for (const r of resultados) {
    if (r.hecho.length) lineas.push(`✅ <b>${ACCIONES[r.accion]}</b>: ${lista(r.hecho)}.`);
    const porMotivo = new Map();
    for (const s of r.sinHacer) porMotivo.set(s.motivo, [...(porMotivo.get(s.motivo) ?? []), s.que]);
    for (const [motivo, cosas] of porMotivo) lineas.push(`⚠️ <b>Sin hacer</b>: ${lista(cosas)}${motivo ? ` <i>(${esc(motivo)})</i>` : ""}.`);
  }
  return lineas.join("\n");
}

/** El aviso cuando, tras la segunda vuelta, Lola sigue diciendo que guardó sin haber guardado nada. */
export const RECIBO_SIN_GUARDAR = "⚠️ <b>Ojo</b>: en este mensaje no se ha guardado nada. Si había que cambiar algo, pídemelo otra vez.";

/** El mensaje que ve la familia: el recibo, encima; lo de Lola, debajo (así una pregunta suya sigue al final). */
export function conRecibo(textoDeLola, resultados = [], { sinGuardar = false } = {}) {
  const arriba = [recibo(resultados), sinGuardar ? RECIBO_SIN_GUARDAR : ""].filter(Boolean).join("\n");
  return arriba ? `${arriba}\n\n${textoDeLola}` : textoDeLola;
}

// ── El vigilante: ¿dice que lo ha hecho? ────────────────────────────────────

// Lola a veces dice «✅ Apuntado» sin haber llamado a nada que guarde (1 de
// cada 3 con «a partir de ahora nada de coliflor»). Si lo dice y en el turno no
// hubo ninguna escritura, se le avisa y repite la vuelta una vez (agente.js).
// ✅ solo al empezar una línea, que es como confirma Lola («✅ Apuntado…»).
// Como viñeta («• ✅ Cambiar un plato», al contar lo que sabe hacer) no es
// decir que guardó: «hola, ¿qué sabes hacer?» pasaba por el aviso y una
// segunda llamada al modelo (staging, 2 oct 2026: 8,2 s para un saludo).
//
// #958: se escapaban «He cambiado…», «Te he añadido…», «He borrado…» y «Ya
// está: …». Ahora cuenta cualquier «he/hemos + participio de guardar», con o
// sin pronombre delante. «Puesto», «dejado» y «hecho» solo con «lo/la»
// delante («lo he puesto el jueves»): a secas también son leer o cocinar («te
// he puesto los botones», «he hecho una lista»).
const DE_GUARDAR = "apuntad|cambiad|guardad|quitad|añadid|anadid|borrad|anotad|arreglad|solucionad|corregid|actualizad|eliminad|tachad|marcad|sumad|cancelad|programad|metid";
const DICE_QUE_GUARDO = new RegExp([
  "(^|\\n)\\s*✅",
  "\\bapuntad[oa]s?\\b",
  "\\blo he (apuntado|puesto|cambiado|guardado|quitado|añadido|anotado|arreglado|solucionado|corregido|dejado|actualizado)\\b",
  `\\b(he|hemos)\\s+(${DE_GUARDAR})[oa]s?\\b`,
  "(^|[.!¡]\\s*)hecho\\b",
  // «Ya está: …» o «¡Ya está!» al empezar la frase; «el arroz ya está» no.
  "(^|\\n|[.!¡?]\\s*)ya est[aá]\\s*[:!.]",
].join("|"), "i");
// «Ya está arreglado» sin haber tocado nada (#911: ante la queja de que un
// arroz con tomate llevaba ensalada de lentejas de segundo, Lola solo propuso
// tres primeros y empezó con «Ya está arreglado»). Es la misma mentira que
// «✅ Apuntado»: se corrige con el mismo aviso y la misma vuelta. Solo lo que
// describe esa queja: «hecho» y «listo» sueltos no, que también son cocina
// («el arroz ya está listo») y lectura («el menú ya está hecho»). Con
// «cuando…», «si…» o «en cuanto…» delante, «queda cambiado» es futuro.
const DICE_QUE_ARREGLO = /\bya est[aá] (arreglad|cambiad|solucionad|corregid)[oa]\b|(?<!\b(?:cuando|si|en cuanto)\b[^.!?\n]*)\bqueda (arreglad|cambiad|solucionad|corregid)[oa]\b|\bya lo (cambi[eé]|arregl[eé]|corregí)(?![a-záéíóúñ])/i;
// «No tenéis ninguna alergia apuntada» es leer lo que hay, no decir que guardó:
// saltaba el aviso y costaba otra vuelta de ~3 s en cada consulta (#229). Se
// quita el participio que va detrás de una negación en la misma frase, salvo
// que sea «he apuntado» y el «no» no vaya con él («No olvides que te he
// apuntado leche» sí dice que guardó; «No te he apuntado nada», no). Igual con
// «Nada está cambiado aún» (lo que dice proponer_platos): es leer, no arreglar.
const NEGABLES = `${DE_GUARDAR}|hech|dejad|puest`;
const APUNTADO_NEGADO = new RegExp(`\\b(no|ningun[oa]?|nada|nadie)\\b[^.,;:!?\\n]{0,40}?\\b(${NEGABLES})[oa]s?\\b`, "gi");
const HE_APUNTADO = new RegExp(`\\b(he|hemos|ha|han|has|habeis|habéis)\\s+(${NEGABLES})`, "i");
const NO_HE_APUNTADO = new RegExp(`^no\\s+(\\S+\\s+)?(\\S+\\s+)?(he|hemos|ha|han|has|habeis|habéis)\\s+(${NEGABLES})`, "i");
const sinNegados = (t) => t.replace(APUNTADO_NEGADO, (m) => (HE_APUNTADO.test(m) && !NO_HE_APUNTADO.test(m) ? m : ""));
// Una pregunta («¿Ya está arreglado?», «¿Quieres que lo deje hecho?») no afirma nada.
const sinPreguntas = (t) => t.replace(/¿[^?]*\?/g, "");
const limpio = (t) => sinNegados(sinPreguntas(String(t ?? "")));

/** De qué es la promesa sin hecho (bot_claimed_unsaved.tipo): «guardado» (apuntado, ✅…) o «arreglado» (#911). */
export const tipoDePromesa = (t) => {
  const x = limpio(t);
  return DICE_QUE_GUARDO.test(x) ? "guardado" : DICE_QUE_ARREGLO.test(x) ? "arreglado" : null;
};
export const diceQueGuardo = (t) => tipoDePromesa(t) !== null;

/**
 * ¿Cuenta como guardado lo que hizo una herramienta? Lo que llegó a la base
 * (`escribio`, de db.js), salvo que su resultado diga que no hizo nada de lo
 * pedido: entonces un «✅ Apuntado» detrás pasa por el vigilante igual.
 */
export const cuentaComoGuardado = (escribio, r) => Boolean(escribio) && !(esResultado(r) && r.estado === "nada");
