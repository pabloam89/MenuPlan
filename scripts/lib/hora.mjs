/**
 * La hora de Pablo (Madrid), en un solo sitio.
 *
 * Por qué: en Git Bash `TZ=Europe/Madrid date` devuelve la hora UTC con
 * `+0000` y sin ningún error (no trae los datos de zonas horarias). El 8 oct
 * 2026 todas las horas límite que se le dieron a Pablo salieron 2 h antes
 * (#210). Node sí trae las zonas (Intl), así que la hora local sale de aquí:
 * el arranque la enseña, `npm run hora` la imprime y los scripts que dan una
 * hora límite la calculan con esto. Nunca a mano ni con `date`.
 */

export const ZONA = "Europe/Madrid";

const partes = (fecha, opciones) => new Intl.DateTimeFormat("es-ES", { timeZone: ZONA, ...opciones }).format(fecha);

/** «19:25» en Madrid. */
export function horaMadrid(fecha = new Date()) {
  return partes(fecha, { hour: "2-digit", minute: "2-digit", hour12: false });
}

/** Desfase de Madrid respecto a UTC en esa fecha: «UTC+2» en verano, «UTC+1» en invierno. */
export function desfaseMadrid(fecha = new Date()) {
  const nombre = new Intl.DateTimeFormat("en-GB", { timeZone: ZONA, timeZoneName: "shortOffset" })
    .formatToParts(fecha).find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  return nombre.replace("GMT", "UTC") || "UTC";
}

/** «jueves 8 oct, 19:25 en Madrid (UTC+2)». */
export function ahoraEnMadrid(fecha = new Date()) {
  const dia = partes(fecha, { weekday: "long", day: "numeric", month: "short" }).replace(".", "").replace(",", "");
  return `${dia}, ${horaMadrid(fecha)} en Madrid (${desfaseMadrid(fecha)})`;
}
