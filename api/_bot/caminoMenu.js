/**
 * Antes de generar un menú, Lola pregunta siempre para cuándo y cómo de a fondo (decisión de Pablo del 4 nov 2026,
 * #1210): el menú solo se genera desde Lola, y cada vez se elige uno de los tres caminos de src/lib/caminos.js
 * (Lo básico / A tu gusto / Al detalle), la misma lista que el asistente de la app.
 *
 * Lo comprueba el código, no solo el manual: generar_menu no genera sin camino ni fecha, y tampoco en el mismo turno
 * en que se acaba de elegir el camino (entonces toca hacer sus preguntas). Puro: sin base.
 */
import { CAMINOS, TEMAS, temasDelCamino } from "../../src/lib/caminos.js";
import { hasChildMember } from "../../src/lib/groups.js";

/** Los ids de los caminos, para el enum de generar_menu. */
export const IDS_CAMINO = CAMINOS.map((c) => c.id);

/** Los botones de elegir camino, con el texto que llega al pulsarlos. */
export const BOTONES_CAMINO = CAMINOS.map((c) => `[[${c.titulo}]]`).join(" ");

const tituloDeTema = (id) => TEMAS.find((t) => t.id === id).titulo;

/** El camino cuyo botón es este mensaje («A tu gusto»), o null. */
export function caminoDelBoton(texto) {
  const t = String(texto ?? "").trim().toLowerCase();
  return CAMINOS.find((c) => c.titulo.toLowerCase() === t)?.id ?? null;
}

/** Pura. ¿Hay niños en la casa? (para no preguntar lo que solo aplica con niños) */
export const hayNinosEn = (casa) => hasChildMember(casa?.state?.data?.members ?? []);

/** Pura. Lo que Lola pregunta en un camino: los títulos de sus temas, en orden. */
export function preguntasDelCamino(camino, { hayNinos = false } = {}) {
  return temasDelCamino(camino, { hayNinos }).map(tituloDeTema);
}

/**
 * Pura. Si no se puede generar todavía, el «NO GENERADO» con lo que Lola tiene que preguntar; si se puede, null.
 * @param {{ camino?: string|null, desde?: string|null, texto?: string, delBoton?: boolean, hayNinos?: boolean }} p
 *   `texto`: el mensaje de este turno; `delBoton`: pulsado «Rehacer la del…», que ya trae su semana y no pregunta.
 */
export function faltaParaGenerar({ camino = null, desde = null, texto = "", delBoton = false, hayNinos = false }) {
  if (delBoton) return null;
  if (!IDS_CAMINO.includes(camino)) {
    const caminos = CAMINOS.map((c) => `${c.titulo}: ${c.resumen}`).join(" ");
    return `NO GENERADO: antes de generar, pregunta SIEMPRE para cuándo lo quieren y cómo de a fondo, en un solo mensaje, con estos botones: ${BOTONES_CAMINO}. ${caminos} Cuando elijan, haz las preguntas de ese camino (te las da generar_menu con camino) y genera.`;
  }
  const preguntas = preguntasDelCamino(camino, { hayNinos }).join(" ");
  const titulo = CAMINOS.find((c) => c.id === camino).titulo;
  if (caminoDelBoton(texto) === camino) {
    return `NO GENERADO: acaban de elegir «${titulo}». Ahora pregúntale, en un mensaje y con la invitación a contestar en un audio, lo de ese camino (lo que ya sepas de la ficha, no lo vuelvas a preguntar): ${preguntas} Con lo que conteste, generar_menu con camino «${camino}» y desde.`;
  }
  if (!desde) {
    return `NO GENERADO: falta para cuándo. Pregúntalo siempre, aunque parezca obvio (camino «${titulo}»: ${preguntas}). Luego generar_menu con camino y desde (AAAA-MM-DD).`;
  }
  return null;
}
