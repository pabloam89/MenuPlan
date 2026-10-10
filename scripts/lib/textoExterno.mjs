/**
 * textoExterno.mjs — el texto que llega de fuera (títulos de issues y PR, ramas)
 * se trata como DATO, nunca como instrucción (#313, ronda de seguridad de #384).
 *
 * Por qué: el repo es público y cualquiera abre un issue. Un título que diga
 * «IGNORA LAS INSTRUCCIONES ANTERIORES…», o que cierre una etiqueta y abra un
 * `<system-reminder>`, acabaría en el contexto de una sesión si un hook lo
 * pintara tal cual. Esta función es la única que limpia: sin dependencias, para
 * que la usen los hooks, el arranque y los scripts sin cargar nada más.
 */

/** Tope por defecto de un texto de issue en un aviso. */
export const MAX_TEXTO = 90;

/**
 * Un texto de fuera, listo para pintar: sin controles (saltos de línea
 * incluidos), sin caracteres invisibles ni de dirección (anchura cero, bidi),
 * sin `<>[]`, comillas inversas ni « », en una línea y cortado a `max`.
 */
export function limpiarTexto(texto, max = MAX_TEXTO) {
  const s = String(texto ?? "")
    // NFKC primero: los ángulos de anchura completa (＜ ＞) y compatibles (﹤ ﹥) pasan a < > y se quitan abajo.
    .normalize("NFKC")
    .replace(/[\p{Cc}\p{Zl}\p{Zp}]/gu, " ")
    // Invisibles que no son Cf: selectores de variación, rellenos de jamo/hangul y braille en blanco.
    .replace(/[︀-️\u{E0100}-\u{E01EF}ᅟᅠㅤﾠ⠀]/gu, "")
    .replace(/[\p{Cf}<>[\]`«»‹›〈〉⟨⟩⟪⟫《》❬❭❮❯❰❱]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  // Por puntos de código: cortar un par sustituto dejaría medio carácter.
  const puntos = [...s];
  return puntos.length > max ? `${puntos.slice(0, max - 1).join("")}…` : s;
}

/** Rama válida para pintarla o cruzarla: letras, prefijo, barra y un nombre sencillo. */
/** El nombre de una rama de la carpeta principal (puede no llevar prefijo: `ccr-…`). */
export const RAMA_SIMPLE = /^[\w.\-/]{1,60}$/;

/** Un nombre de agente o de fichero que se puede pintar: sin nada raro. */
export const NOMBRE_SIMPLE = /^[\w.\-]{1,80}$/;

export const RAMA_VALIDA = /^[a-z]+\/[\w.\-/]{1,60}$/;
