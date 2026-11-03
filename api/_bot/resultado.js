/**
 * Lo hecho sale de los datos, no del texto (#958, raíz 1).
 *
 * Antes cada herramienta que escribe contestaba una frase («Guardado…») y Lola
 * escribía la suya encima. Nada obligaba a que la confirmación coincidiera con
 * lo guardado, y lo parcial no existía: de 66 cosas de seis tickets se
 * apuntaron 38 y Lola dijo «todo apuntado».
 *
 * Ahora una herramienta que escribe puede devolver un RESULTADO con forma fija:
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
 * Quién lo usa: agente.js (herramientas y responder) lo recoge y lo pinta. Una
 * herramienta que escribe datos de la ficha (`escribe` en su ficha) TIENE que
 * devolverlo (trozo 27 de #1037): la puerta (`exigeResultado`) rechaza lo que
 * no lo traiga y lo apunta como fallo, no como guardado.
 *
 * Pura: sin base ni modelo, para los tests.
 */

import { DIAS, DIA_LARGO_MINUSCULAS } from "../../src/lib/dias.js";
import { IDS_COMIDAS, comida } from "../../src/lib/comidas.js";

const MARCA = Symbol("resultado");

/**
 * Qué se ha hecho, en vocabulario cerrado: cada acción con la etiqueta del
 * recibo. Una acción nueva entra aquí; `resultado()` no acepta otra.
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
  plato: "Plato cambiado",
  compra_anadir: "Añadido a la compra",
  menu: "Menú nuevo",
  trato: "Trato con Lola",
  fuera: "Fuera de casa",
});

/**
 * Los ejes de lo guardado (L1, «Lola solo confirma lo guardado»): los valores
 * con los que el código compara lo que dice Lola (cuadre.js, que llega encima). Cada eje, con su
 * lista del registro (dias.js, comidas.js) y la etiqueta en castellano de cada
 * valor, sacada de allí y no escrita a mano. `persona` no tiene lista fija: es
 * la de la casa, y la trae quien compara (los nombres de la ficha).
 */
export const EJES_GUARDADO = Object.freeze({
  dia: Object.freeze({ valores: DIAS, etiqueta: (d) => DIA_LARGO_MINUSCULAS[d] }),
  comida: Object.freeze({ valores: IDS_COMIDAS, etiqueta: (c) => comida(c).nombre }),
  persona: Object.freeze({ valores: null, etiqueta: (n) => n }),
});

/**
 * Los valores guardados, validados contra su eje: un eje o un valor fuera de
 * la lista no se acepta (como una acción sin etiqueta). Null si no se dan.
 * Quien los da afirma que cubren TODO lo hecho: con ellos, el recibo ✅ puede
 * dejar paso a la frase de Lola (cuadre.js), así que no van si lo hecho lleva
 * algo que no se compara (un plato, una cantidad).
 */
function valoresDe(valores) {
  if (valores == null) return null;
  const v = {};
  for (const [eje, lista] of Object.entries(valores)) {
    const def = EJES_GUARDADO[eje];
    if (!def) throw new Error(`Eje sin vocabulario: ${eje}`);
    const limpios = [...new Set((lista ?? []).map(texto).filter(Boolean))];
    const malos = def.valores ? limpios.filter((x) => !def.valores.includes(x)) : [];
    if (malos.length) throw new Error(`Valor fuera del eje ${eje}: ${malos.join(", ")}`);
    if (limpios.length) v[eje] = Object.freeze(limpios);
  }
  return Object.freeze(v);
}

/** Los valores guardados con su etiqueta en castellano, para el modelo: { dia: ["viernes"], comida: ["cena"] }. */
export const etiquetas = (valores) => Object.fromEntries(Object.entries(valores ?? {}).map(([eje, l]) => [eje, l.map(EJES_GUARDADO[eje].etiqueta)]));

/** El estado de un resultado: sale de lo hecho y lo que no, nunca se escribe a mano. */
export const ESTADO = Object.freeze({ HECHO: "hecho", PARCIAL: "parcial", NADA: "nada" });

/**
 * Cuántas cosas se nombran en el recibo antes de «y N más». Ocho caben en una
 * línea de móvil; lo demás ya lo tiene el modelo en el JSON.
 */
export const EN_EL_RECIBO = 8;

const texto = (x) => String(x ?? "").trim();

/**
 * Un resultado de escritura. `hecho`: lo que de verdad quedó guardado, cada
 * cosa como texto corto. `sinHacer`: lo pedido que NO se hizo, con su motivo.
 * `nota`: lo demás que el modelo tiene que saber (no sale en el recibo).
 */
export function resultado({ accion, hecho = [], sinHacer = [], nota = "", valores = null }) {
  if (!ACCIONES[accion]) throw new Error(`Acción sin etiqueta: ${accion}`);
  const h = hecho.map(texto).filter(Boolean);
  const s = sinHacer.map((x) => (typeof x === "string" ? { que: texto(x), motivo: "" } : { que: texto(x?.que), motivo: texto(x?.motivo) })).filter((x) => x.que);
  const estado = !h.length ? ESTADO.NADA : s.length ? ESTADO.PARCIAL : ESTADO.HECHO;
  return Object.freeze({ [MARCA]: true, accion, pedido: h.length + s.length, hecho: h, sinHacer: s, estado, nota: texto(nota), valores: valoresDe(valores) });
}

export const esResultado = (x) => Boolean(x && typeof x === "object" && x[MARCA]);

/** Lo que se le ordena al modelo según el estado: el recibo ya cuenta lo hecho y lo que falta. */
const ORDEN = {
  [ESTADO.HECHO]: () => "El recibo con lo hecho sale pintado encima de tu mensaje: no repitas la lista; di en una frase lo que sigue.",
  [ESTADO.PARCIAL]: (r) => `NO está todo: ${r.sinHacer.length} sin hacer. El recibo (✅ lo hecho, ⚠️ lo que falta y por qué) sale pintado encima de tu mensaje: no lo repitas, no digas «todo» y ofrece lo que se puede hacer con lo que falta.`,
  // Sin nada hecho ni motivo (una duda: qué día, quién): no hay recibo que pintar; lo que falta saber va en la nota.
  [ESTADO.NADA]: (r) => (r.sinHacer.length
    ? "No se ha guardado NADA: no digas que está hecho. El recibo con el porqué sale pintado encima de tu mensaje; ofrece cómo arreglarlo."
    : "No se ha guardado NADA: no digas que está hecho. Falta un dato para hacerlo (en la nota): pregúntalo."),
};

/**
 * Con valores (L1): lo hecho lo confirma Lola con su voz, y el código comprueba
 * que nombra lo guardado (cuadre.js); si no cuadra, sale el recibo en su lugar.
 */
export const ORDEN_CON_VALORES = "Lo hecho lo confirmas tú, en una frase, nombrando lo guardado tal cual (guardado: días, comidas y personas, ni más ni menos). Si nombras algo que no está ahí, la familia verá el recibo en vez de tu frase.";

/** Lo que lee el modelo: JSON, para que no haya dos formas de leerlo, y la orden de su estado. */
export function paraElModelo(r) {
  const datos = { accion: r.accion, estado: r.estado, pedido: r.pedido, hecho: r.hecho, sin_hacer: r.sinHacer.map(({ que, motivo }) => ({ que, motivo })) };
  const conValores = Boolean(r.valores) && r.estado !== ESTADO.NADA;
  if (conValores) datos.guardado = etiquetas(r.valores);
  // Con valores, lo hecho no sale en el recibo si Lola lo dice bien; lo que falta (⚠️), sí, como siempre.
  const orden = !conValores ? ORDEN[r.estado](r)
    : r.estado === ESTADO.HECHO ? ORDEN_CON_VALORES
      : `NO está todo: ${r.sinHacer.length} sin hacer. Lo que falta y por qué (⚠️) sale pintado encima de tu mensaje: no lo repitas, no digas «todo» y ofrece lo que se puede hacer con lo que falta. ${ORDEN_CON_VALORES}`;
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

/**
 * ¿Cuenta como guardado lo que hizo una herramienta? Lo que llegó a la base
 * (`escribio`, de db.js), salvo que su resultado diga que no hizo nada de lo
 * pedido: entonces un «✅ Apuntado» detrás pasa por el vigilante igual.
 */
export const cuentaComoGuardado = (escribio, r) => Boolean(escribio) && !(esResultado(r) && r.estado === ESTADO.NADA);

/**
 * La puerta (trozo 27 de #1037): ¿tiene que devolver un RESULTADO esta
 * herramienta? Toda la que escribe datos de la ficha (`escribe` no vacío en
 * su ficha, agente.js). Lo que devuelva otra cosa no cuenta como guardado.
 */
export const exigeResultado = (ficha) => Boolean(ficha) && !ficha.soloLectura && (ficha.escribe?.length ?? 0) > 0;

/** El motivo de lo que no se hizo porque no se pudo escribir en la base: el mismo en toda herramienta. */
export const NO_GUARDADO = "no se ha podido guardar";

/** Lo que lee el modelo detrás del texto de una herramienta que la puerta ha rechazado. */
export const SIN_RESULTADO = "[Sin resultado] Esta herramienta no ha dicho qué ha quedado guardado: no consta como hecho. No digas que está hecho; si hacía falta, dilo tal cual y que lo miren en la app.";
