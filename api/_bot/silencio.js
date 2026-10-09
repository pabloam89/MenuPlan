/**
 * Alergias «por silencio» (#229, decidido por Pablo el 9 oct 2026).
 *
 * Mientras nadie dice si alguien tiene alergias, el menú esquiva los 14
 * alérgenos (src/lib/alergias.js, alergiasParaMenu): para dos adultos con
 * comida y cena quedan 27 platos y el solver no completa la semana. Y la
 * mayoría de la gente no tiene alergias: no contestar también es contestar,
 * SIEMPRE QUE Lola lo haya avisado al preguntar.
 *
 * Lo decide el código, no el modelo: si lo último que dijo Lola en el chat fue
 * la pregunta de alergias con el aviso (AVISO_SILENCIO) y el mensaje que llega
 * no dice ninguna alergia, se apunta «ninguna» a los que faltaban con la marca
 * `por_silencio` (src/lib/alergiasBase.js). Pasa ANTES del enrutador y de
 * Lola (api/bot/telegram.js), así el menú de ese mismo turno ya sale entero.
 *
 * Por silencio solo vale para filtrar el menú: la ficha lo enseña como
 * «ninguna (por silencio)», y el primer menú lo recuerda una vez
 * (conRecordatorio, desde generar.js).
 */

import { conCasa } from "./casa.js";
import { cerrarPorEstado } from "./tareas.js";
import { fallaCon } from "./avisar.js";
import { puede } from "../../src/lib/papeles.js";
import { ORIGEN_ALERGIAS, ACCIONES_ALERGIAS } from "../../src/lib/vocabularios.js";
import { sinTildes, pareceAlergia, alergiasRevisadas, marcarRevisadas, marcarPorSilencio } from "../../src/lib/alergiasBase.js";

const [DICHA, POR_SILENCIO] = ORIGEN_ALERGIAS;
const [APUNTADA, RECORDADA] = ACCIONES_ALERGIAS;

/** La frase del aviso, la misma que pide conocimiento.md. */
export const AVISO_SILENCIO = "Si no me dices nada, entiendo que ninguna.";

/** Lo que se añade al primer menú de una casa con alguien por silencio. */
export const RECORDATORIO_SILENCIO = {
  es: "ℹ️ He dado por hecho que nadie tiene alergias; si hay alguna, dímelo.",
  en: "ℹ️ I've assumed nobody has allergies; if anyone does, just tell me.",
};

// El aviso con sus variantes de persona («si no me decís nada») y en inglés.
// Va con el tema en el mismo mensaje: «si no me dices nada, te lo cambio» no es.
const AVISO_RE = /\bsi no me (dices|decis|dice|dicen|contestas|contestais|respondes|respondeis) nada\b|\bif you don'?t (tell me|say) anything\b/;
const TEMA_RE = /\b(alergi|intoleran|allerg)/;

/** ¿Este mensaje de Lola preguntó por alergias con el aviso? */
export function preguntoConAviso(textoDeLola) {
  const t = sinTildes(textoDeLola).replace(/[’`]/g, "'");
  return AVISO_RE.test(t) && TEMA_RE.test(t);
}

// Un alérgeno nombrado a secas («Ana, el huevo») también es una alergia: ante
// la duda, no es silencio (lo apunta Lola o vuelve a preguntar). Ancha a
// propósito: el lado seguro es no marcar. En inglés, palabras enteras («nut»
// no puede saltar con «nutrición»); «soy» no está: en castellano es «yo soy».
const ALERGENO_ES_RE = /\b(gluten|trigo|lact|leche|huevo|pescado|marisco|crustace|gamba|langostin|cigala|cangrej|cacahuet|soja|frutos? secos|cascara|nuez|nueces|almendra|avellana|pistacho|anacardo|apio|mostaza|sesamo|sulfito|altramu|molusco|mejillon|almeja|calamar|pulpo|sepia|kiwi|melocoton|fresa)/;
const ALERGENO_EN_RE = /\b(peanuts?|nuts?|eggs?|milk|dairy|shellfish|fish|sesame|coeliac|celiac)\b/;
// «Ahora te digo», «prefiero no decirlo», «no lo sé»: no es «ninguna».
const APLAZA_RE = /\b(ahora te (lo )?dig|luego te (lo )?dig|despues te (lo )?dig|mas tarde|te lo miro|lo miro|lo tengo que mirar|dejame (que )?(lo )?mir|tengo que preguntar|lo pregunto|prefiero no|no quiero decir|no te lo (digo|voy a decir)|no lo se\b|ni idea|no estoy segur|later|let me check|not sure|i don'?t know|rather not)/;
const NEGATIVAS = new Set(["no", "nada", "ninguna", "ninguno", "ningun", "nadie", "none", "nope", "nobody"]);
const RELLENO = new Set(["tranquila", "tranquilo", "gracias", "de", "thanks", "one", "lola"]);

/**
 * Qué es el mensaje que llega tras la pregunta con aviso: `alergia` (dice
 * una, o nombra un alérgeno), `aplaza` (luego, no lo sé, prefiero no), `no`
 * (un no a secas: la respuesta dicha) u `otra` (siguen con lo suyo: silencio).
 */
export function respuestaAlAviso(texto) {
  // Sin la marca de delante que pone el webhook («[nota de voz] no»).
  const t = sinTildes(texto).replace(/[’`]/g, "'").replace(/^\s*\[[^\]]*\]\s*/, "");
  if (pareceAlergia(t) || ALERGENO_ES_RE.test(t) || ALERGENO_EN_RE.test(t)) return "alergia";
  if (APLAZA_RE.test(t)) return "aplaza";
  const palabras = t.replace(/[^\p{L}\p{N}' ]/gu, " ").split(/\s+/).filter(Boolean);
  if (palabras.length && palabras.some((p) => NEGATIVAS.has(p)) && palabras.every((p) => NEGATIVAS.has(p) || RELLENO.has(p))) return "no";
  return "otra";
}

/**
 * Pura. El origen con que se apunta «ninguna» a los que faltan, o null si no
 * toca apuntar nada: sin aviso en lo último que dijo Lola, o si dicen una
 * alergia (la apunta Lola con ajustar_alergias, como siempre) o lo aplazan.
 */
export function decidirSilencio({ ultimaDeLola, texto }) {
  if (!preguntoConAviso(ultimaDeLola)) return null;
  const r = respuestaAlAviso(texto);
  if (r === "otra") return POR_SILENCIO;
  if (r === "no") return DICHA;
  return null;
}

/** La línea de log contable, sin datos de la familia (ni casa, ni nombres). */
export const lineaDeAlergias = ({ accion, origen, personas = null, canal = "telegram" }) =>
  JSON.stringify({ evento: "bot_alergias", accion, origen, ...(personas != null ? { personas } : {}), canal });

/** Apunta en el log que el primer menú llevó el recordatorio. */
export const apuntarRecordatorio = (canal = "telegram") =>
  console.info(lineaDeAlergias({ accion: RECORDADA, origen: POR_SILENCIO, canal }));

/**
 * Antes del turno: si toca (decidirSilencio), apunta «ninguna» a los de la
 * casa que faltaban y cierra sus preguntas abiertas. Solo quien puede editar
 * la casa: un lector o alguien de fuera del grupo no cambia lo de seguridad.
 * Nunca tumba el turno: si falla, se sigue como antes (sin revisar).
 * @returns {Promise<{ origen: string, personas: number } | null>}
 */
export async function apuntarSilencio({ householdId, ultimaDeLola, texto, papel, canal = "telegram", userId = null }) {
  if (!householdId || !puede(papel, "editar_casa")) return null;
  const origen = decidirSilencio({ ultimaDeLola, texto });
  if (!origen) return null;
  let ids = [];
  let nueva = null;
  const r = await conCasa(householdId, (casa) => {
    const data = casa.state?.data ?? {};
    if (origen === POR_SILENCIO) ({ data: nueva, ids } = marcarPorSilencio(data));
    else {
      ids = (data.members ?? []).filter((m) => !alergiasRevisadas(data, m) && !(m.allergies ?? []).length).map((m) => m.id);
      nueva = ids.length ? marcarRevisadas(data, ids) : data;
    }
    if (!ids.length) return null;
    // No es algo que hayan pedido: no deja foto para «deshaz».
    return { state: { ...casa.state, data: nueva }, sinDeshacer: true };
  }).catch(fallaCon("silencio_apuntar", null));
  if (!r) return null;
  if (!r.ok) return fallaCon("silencio_apuntar", null)(new Error(r.error));
  if (r.sinCambios || !ids.length) return null;
  await cerrarPorEstado(householdId, nueva, { userId }).catch(fallaCon("silencio_cerrar", 0));
  console.info(lineaDeAlergias({ accion: APUNTADA, origen, personas: ids.length, canal }));
  return { origen, personas: ids.length };
}

/** Para Lola, en lo que devuelve generar_menu: que no lo diga ella también. */
export const NOTA_RECORDATORIO = "(Debajo de tu mensaje sale solo el aviso de que se ha dado por hecho que nadie tiene alergias: no lo digas tú.)";

/** El texto con el recordatorio del primer menú al final, si toca. */
export const conRecordatorio = (texto, recordar, idioma = "es") =>
  (recordar ? `${texto}\n\n${RECORDATORIO_SILENCIO[idioma] ?? RECORDATORIO_SILENCIO.es}` : texto);
