/**
 * La forma de un mensaje de Lola: una lista cerrada de reglas (trozo 54 del plan de fichas, #1037).
 *
 * Hasta aquí la forma solo vivía en prosa del manual y nada la miraba: el 4 nov 2026 Pablo recibió la
 * pregunta del camino con 12 líneas, una fecha «2026-11-09» y tres líneas que empezaban por «:». Cada regla
 * vive aquí una vez, con la frase que lee Lola (el manual la pinta con la marca {{FORMATO}}, manual.js) y la
 * función que la mide. El revisor (`faltasDeFormato`) mide la respuesta de cada turno y la lista de faltas va a
 * bot_route (`lola.formato`, api/bot/telegram.js), para contarlas por día. Solo mide: no reescribe ni frena nada.
 *
 * Puro y sin importar nada: lo leen el manual, el agente y telegram.js.
 */

/** Un botón: `[[Opción]]`, como lo saca sacarBotones (api/bot/telegram.js), que lo importa de aquí. */
export const RE_BOTON = /\[\[([^\]\n]{1,40})\]\]/g;

/** Una fecha de máquina (AAAA-MM-DD), la que Lola no dice nunca. */
export const RE_FECHA_ISO = /\b20\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])\b/g;

/** Líneas de texto como mucho por mensaje (sin contar opciones, listas ni botones). */
export const MAX_LINEAS_PROSA = 4;

// Una línea que no es prosa: una viñeta, un paso numerado, o una etiqueta en negrita o cursiva (una opción
// «<b>Solo los días</b>: …», un día, un plato), también detrás de un emoji («🍽️ <b>Comida:</b>»).
const NO_ES_PROSA = /^(?:[•–]|\d+[.)]\s|(?:\p{Extended_Pictographic}️?\s*)?<[bi]>)/u;
const esPregunta = (l) => l.includes("?");

/**
 * Lo que mira cada regla: el texto tal cual (`crudo`, con sus `[[…]]`), las líneas que se ven (`lineas`, sin
 * botones ni vacías), las de prosa y los textos de los botones.
 */
function piezas(texto) {
  const crudo = String(texto ?? "");
  const botones = [...crudo.matchAll(RE_BOTON)].map((m) => m[1].trim());
  const lineas = crudo.replace(RE_BOTON, "").split("\n").map((l) => l.trim()).filter(Boolean);
  return { crudo, botones, lineas, prosa: lineas.filter((l) => !NO_ES_PROSA.test(l)) };
}

/**
 * Las reglas, en el orden en que las lee Lola. `id` es la falta que se apunta (vocabulario cerrado: no se
 * cambia, se cuenta por día); `frase`, lo que dice el manual; `rompe`, si un mensaje la incumple.
 */
export const REGLAS_FORMATO = Object.freeze([
  {
    id: "prosa_larga",
    frase: `Corto: como mucho ${MAX_LINEAS_PROSA} líneas de texto, sin contar opciones, listas ni botones. El detalle, si lo piden.`,
    rompe: ({ prosa }) => prosa.length > MAX_LINEAS_PROSA,
  },
  {
    id: "varias_preguntas",
    frase: "Una sola pregunta por mensaje.",
    rompe: ({ lineas }) => lineas.join("\n").split("?").length - 1 > 1,
  },
  {
    id: "pregunta_enterrada",
    frase: "La pregunta, al final: detrás de ella, como mucho sus opciones y una línea.",
    rompe: ({ prosa }) => {
      const i = prosa.findLastIndex(esPregunta);
      return i >= 0 && prosa.length - 1 - i > 1;
    },
  },
  {
    id: "fecha_iso",
    frase: "Las fechas, como se dicen («el lunes 9», «9 de noviembre»), nunca en forma AAAA-MM-DD.",
    rompe: ({ lineas }) => lineas.some((l) => new RegExp(RE_FECHA_ISO.source).test(l)),
  },
  {
    id: "puntuacion_huerfana",
    frase: "Ninguna línea empieza por «:», «;», «,» o «.».",
    rompe: ({ lineas }) => lineas.some((l) => /^[:;,.]/.test(l)),
  },
  {
    id: "boton_en_linea",
    frase: "Los botones ([[…]]) van al final, cada uno solo en su línea: nunca dentro de una frase, que el chat se lleva el botón y la frase se queda coja.",
    rompe: ({ crudo }) => crudo.split("\n").some((l) => new RegExp(RE_BOTON.source).test(l) && l.replace(RE_BOTON, "").trim() !== ""),
  },
  {
    id: "opcion_sin_negrita",
    frase: "Si explicas las opciones, una por línea y empezando por el nombre de su botón en negrita: «<b>Solo los días</b>: …».",
    rompe: ({ lineas, botones }) => lineas.some((l) => botones.some((b) => l.toLowerCase().startsWith(`${b.toLowerCase()}:`))),
  },
  {
    id: "markdown",
    frase: "Telegram con HTML (<b>negrita</b>, <i>cursiva</i>): nada de Markdown, ni asteriscos ni almohadillas ni guiones como viñeta.",
    rompe: ({ lineas }) => lineas.some((l) => /\*\*|^#{1,6}\s|^- /.test(l)),
  },
].map(Object.freeze));

/** Las faltas que se pueden apuntar: los ids de las reglas. */
export const FALTAS_FORMATO = Object.freeze(REGLAS_FORMATO.map((r) => r.id));

/**
 * Pura. Las faltas de forma de un mensaje, en el orden de REGLAS_FORMATO; vacío si no tiene ninguna.
 * @param {string} texto  lo que dice Lola, con sus `[[…]]`.
 * @returns {string[]}
 */
export function faltasDeFormato(texto) {
  const p = piezas(texto);
  return REGLAS_FORMATO.filter((r) => r.rompe(p)).map((r) => r.id);
}

/** Pura. El bloque de forma del manual (marca {{FORMATO}}): una línea por regla. */
export const formatoParaElManual = () => REGLAS_FORMATO.map((r) => `- ${r.frase}`).join("\n");
