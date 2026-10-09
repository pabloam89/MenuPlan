/**
 * Alergias «por silencio» (#229, decidido por Pablo el 9 oct 2026).
 *
 * Mientras nadie dice si alguien tiene alergias, el menú esquiva los 14
 * alérgenos (src/lib/alergias.js, alergiasParaMenu): para dos adultos con
 * comida y cena quedan 27 platos y el solver no completa la semana. Y la
 * mayoría de la gente no tiene alergias: no contestar también es contestar,
 * SIEMPRE QUE Lola lo haya avisado al preguntar.
 *
 * Cuándo cuenta como silencio, y por qué así (jueces de #229):
 *   1. Lo último que dijo Lola terminó con el aviso (AVISO_SILENCIO, como
 *      frase final) en un mensaje que pregunta por alergias.
 *   2. Lola ya ha leído el mensaje que llega y NO ha llamado a ninguna
 *      herramienta que conteste a eso (HERRAMIENTAS_QUE_CONTESTAN). El silencio
 *      nunca se decide antes del modelo: una lista de palabras no cierra la
 *      clase («no toma queso», «APLV», «se pone malo con el pimiento»…).
 *   3. Y además el mensaje no trae ninguna señal (haySenal, deliberadamente
 *      ancha: alergias, reacciones, alérgenos, afirmaciones, aplazamientos,
 *      un «no»). Ante la duda, no se marca: se sigue sin revisar.
 * Un «no» o «nadie tiene» no lo guarda el código: lo guarda Lola con
 * ajustar_alergias, que ya sabe hacerlo por persona.
 *
 * Solo se marca a quien se preguntó (destinatarios). Lo llama responder()
 * al acabar el turno, y generar_menu justo antes de generar, para que el menú
 * de ese mismo turno ya salga entero. Con un aviso pendiente, el webhook no
 * toma la vía rápida (api/bot/telegram.js): el turno pasa por Lola.
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
import { sinTildes, alergiasRevisadas, marcarPorSilencio } from "../../src/lib/alergiasBase.js";

const [, POR_SILENCIO] = ORIGEN_ALERGIAS;
const [APUNTADA, RECORDADA] = ACCIONES_ALERGIAS;

/** La frase del aviso, la misma que pide conocimiento.md. */
export const AVISO_SILENCIO = "Si no me dices nada, entiendo que ninguna.";

/** Lo que se añade al primer menú de una casa con alguien por silencio. */
export const RECORDATORIO_SILENCIO = {
  es: "ℹ️ He dado por hecho que nadie tiene alergias; si hay alguna, dímelo.",
  en: "ℹ️ I've assumed nobody has allergies; if anyone does, just tell me.",
};

/** Para Lola, en lo que devuelve generar_menu: que no lo diga ella también. */
export const NOTA_RECORDATORIO = "(Debajo de tu mensaje sale solo el aviso de que se ha dado por hecho que nadie tiene alergias: no lo digas tú.)";

/**
 * Si Lola llamó a alguna de estas en el turno, el mensaje contestaba a algo
 * de salud o de gustos (o lo aplazaba con una tarea): no es silencio.
 */
export const HERRAMIENTAS_QUE_CONTESTAN = ["ajustar_alergias", "ajustar_salud", "ajustar_gustos", "descartar_supuesto", "anotar_tarea"];

const limpio = (s) => sinTildes(s).replace(/[’`´]/g, "'");

// La cola exacta del aviso, como ÚLTIMA frase del mensaje (quitados los
// botones [[…]], el HTML y lo que no son letras al final). «Si no me dices
// nada, lo dejo así» no es; un aviso seguido de otra pregunta, tampoco.
const COLA_RE = /(si no me (dices|decis|contais|cuentas|dice|dicen) nada,? entiendo que (ningun[oa]s?|nadie)|if you don'?t tell me anything,? i'?ll assume (none|no ?one|nobody))[^.?!¿]{0,30}[.!]?[^\p{L}\p{N}]*$/u;
const TEMA_RE = /\b(alergi|intoleran|allerg)/;

/** ¿Este mensaje de Lola preguntó por alergias y terminó con el aviso? */
export function preguntoConAviso(textoDeLola) {
  const t = limpio(textoDeLola).replace(/<[^>]+>/g, "").replace(/(\s*\[\[[^\]]*\]\])+\s*$/, "").trim();
  return COLA_RE.test(t) && TEMA_RE.test(t);
}

// ── Señales: lo que hace que un mensaje NO sea silencio ─────────────────────
// Ancho a propósito: un falso positivo deja a la casa sin revisar (como antes)
// y Lola vuelve a preguntar; un falso negativo da por sano a un alérgico.
const SENALES = [
  // Salud, con y sin la palabra «alergia».
  /\b(alergi|alergic|allerg|intoleran|celiac|celiaqu|coeliac|aplv|histamin|dermatitis|eccema|eczema|urticaria|anafilax|anaphyla|sensibilidad|hives|rash|ronch|epipen|adrenalin)/,
  /\b(celi|gf)\b/,
  // Reacciones: «no toma», «le sienta mal», «se pone malo», «can't have».
  /\b(no (toma|tomo|come|como|puede|puedo|tolera|tolero|soporta|prueba|bebe)|(le|les|me|te) (sienta|sientan|da|dan|pica|pican|hace dano)|reacci|se pone mal|se le hincha|se hincha|hinchaz|picor|vomit|can'?t (have|eat|drink|take)|cannot (have|eat|drink|take)|reaction|intolerant|sick)/,
  // Alérgenos y lo que más da alergia, en castellano (raíces).
  /\b(gluten|trigo|cebada|centeno|espelta|avena|harina|lact|leche|queso|yogur|nata|mantequilla|huevo|guevo|guebo|mahonesa|mayonesa|pescad|atun|salmon|merluza|bacalao|marisco|crustace|gamba|gambon|crevett|langostin|camaron|cigala|cangrej|bogavante|cacahuet|soja|frutos? secos|cascara|nuez|nueces|almendra|avellana|pistacho|anacardo|apio|mostaza|sesamo|ajonjoli|sulfito|altramu|lupin|arachid|erdnu|noci|molusco|mejillon|almeja|berberecho|ostra|calamar|pulpo|sepia|kiwi|melocoton|fresa|melon|platano|pina|tomate)/,
  /\bmani\b/,
  // Y en inglés, palabras enteras («nut» no salta con «nutrición»).
  /\b(peanuts?|nuts?|almonds?|walnuts?|hazelnuts?|cashews?|pistachios?|eggs?|milk|dairy|lactose|wheat|shellfish|shrimps?|prawns?|crabs?|lobsters?|fish|sesame|soy|soya|celery|mustard|lupin|molluscs?|mussels?|squid|strawberr\w*|tomato\w*)\b/,
  // «Tenemos alguna», «alguno»: siempre. El resto de afirmaciones, abajo.
  /\b(alguno|alguna|algunos|algunas)\b/,
  // Aplazamientos: «espera», «pregunto a mi mujer», «lo consulto», «luego».
  /\b(espera|esperate|un momento|momentito|un segundo|pregunt|consult|miro|mirar|mire|luego|despues|mas tarde|ahora te|ahora lo|te digo|ni idea|dejame|prefiero no|no quiero|no estoy segur|later|wait|hold on|check|ask|not sure|don'?t know|dunno|rather not)/,
  // Un no: lo guarda Lola (ajustar_alergias, por persona), no el código.
  /\b(no|nada|ninguna|ninguno|ningun|nadie|none|nope|nobody|nothing)\b/,
];
// «Sí», «Lucas sí», «una»: afirmaciones solo en un mensaje corto. En uno largo
// («Pablo 36, Marta 34 y una niña de 2», «tenemos un hijo de 4») no son un sí,
// y en el alta dejaban la casa con 27 platos. Pegadas a «alguna» o a
// «alergia» ya dan señal arriba.
const AFIRMA = new Set(["si", "yes", "yeah", "yep", "uno", "una", "tiene", "tienen", "tenemos", "tengo"]);
const CORTO = 4;
const UNION = new Set(["y", "e", "and"]);
const primerNombre = (n) => limpio(n).trim().split(/\s+/)[0] ?? "";

/**
 * ¿El mensaje trae algo que pueda ser una respuesta a la pregunta de
 * alergias? `nombres`: los de la casa ANTES del turno («Lucas» a secas es
 * decir quién; en el alta los nombres nuevos no cuentan).
 */
export function haySenal(texto, { nombres = [] } = {}) {
  // Sin la marca de delante que pone el webhook («[nota de voz] no»).
  const t = limpio(texto).replace(/^\s*\[[^\]]*\]\s*/, "");
  if (SENALES.some((re) => re.test(t))) return true;
  const casa = new Set(nombres.map(primerNombre).filter(Boolean));
  const palabras = t.replace(/[^\p{L}\p{N}' ]/gu, " ").split(/\s+/).filter((p) => p && !UNION.has(p));
  const sinNombres = palabras.filter((p) => !casa.has(p));
  if (sinNombres.length <= CORTO && sinNombres.some((p) => AFIRMA.has(p))) return true;
  return palabras.length > 0 && !sinNombres.length;
}

const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Por quién se preguntó: los de la casa nombrados en el mensaje de Lola que
 * siguen sin revisar; si no nombra a nadie, todos los que faltan.
 */
export function destinatarios(textoDeLola, data = {}) {
  const t = limpio(textoDeLola);
  const miembros = data.members ?? [];
  const falta = (m) => !alergiasRevisadas(data, m) && !(m.allergies ?? []).length;
  const faltan = miembros.filter(falta);
  // Solo entre los que faltan: «Lucas ya está… ¿Alguien más…?» va por el resto.
  const nombrados = faltan.filter((m) => {
    const n = primerNombre(m.name ?? "");
    return n && new RegExp(`(^|[^\\p{L}])${escapar(n)}($|[^\\p{L}])`, "u").test(t);
  });
  return (nombrados.length ? nombrados : faltan).map((m) => m.id);
}

// Lo que Lola contestó en ESTE turno: si habla de salud o acaba en pregunta,
// el mensaje pudo ser una respuesta que está aclarando («Leo, güebo» →
// «¿Quieres decir que Leo es alérgico al huevo?»), aunque no llamara a nada.
const TEMA_SALUD_RE = /\b(alergi|alergic|allerg|intoleran|celiac|celiaqu|coeliac|salud|anafil|embaraz|lactancia)/;
function lolaSigueConElTema(respuesta) {
  const t = limpio(respuesta).replace(/<[^>]+>/g, "").replace(/(\s*\[\[[^\]]*\]\])+\s*$/, "").replace(/[^\p{L}\p{N}?]+$/u, "");
  return TEMA_SALUD_RE.test(t) || t.endsWith("?") || preguntoConAviso(respuesta);
}

/**
 * Pura. `por_silencio` si toca apuntar «ninguna», o null: sin aviso en lo
 * último de Lola, si en el turno llamó a algo que contesta, o si el mensaje
 * trae alguna señal. `respuestaDeLola` (al cerrar el turno; dentro de
 * generar_menu aún no la hay): si sigue con el tema o pregunta, tampoco.
 */
export function decidirSilencio({ ultimaDeLola, texto, llamadas = [], nombres = [], respuestaDeLola = null }) {
  if (!preguntoConAviso(ultimaDeLola)) return null;
  if (llamadas.some((h) => HERRAMIENTAS_QUE_CONTESTAN.includes(h))) return null;
  if (haySenal(texto, { nombres })) return null;
  if (respuestaDeLola != null && lolaSigueConElTema(respuestaDeLola)) return null;
  return POR_SILENCIO;
}

/** La línea de log contable, sin datos de la familia (ni casa, ni nombres). */
export const lineaDeAlergias = ({ accion, origen, personas = null, canal = "telegram" }) =>
  JSON.stringify({ evento: "bot_alergias", accion, origen, ...(personas != null ? { personas } : {}), canal });

/** Apunta en el log que el primer menú llevó el recordatorio. */
export const apuntarRecordatorio = (canal = "telegram") =>
  console.info(lineaDeAlergias({ accion: RECORDADA, origen: POR_SILENCIO, canal }));

/**
 * Si toca (decidirSilencio), apunta «ninguna» por silencio a las personas por
 * las que se preguntó y cierra sus preguntas abiertas. Solo quien puede
 * editar la casa: un lector o alguien de fuera no cambia lo de seguridad.
 * Sin aviso, ni lee la base. Nunca tumba el turno: si falla, sin revisar.
 * @returns {Promise<{ origen: string, personas: number } | null>}
 */
export async function apuntarSilencio({ householdId, ultimaDeLola, texto, papel, canal = "telegram", userId = null, llamadas = [], nombres = [], respuestaDeLola = null }) {
  if (!householdId || !puede(papel, "editar_casa")) return null;
  const origen = decidirSilencio({ ultimaDeLola, texto, llamadas, nombres, respuestaDeLola });
  if (!origen) return null;
  let ids = [];
  let nueva = null;
  const r = await conCasa(householdId, (casa) => {
    const data = casa.state?.data ?? {};
    ({ data: nueva, ids } = marcarPorSilencio(data, destinatarios(ultimaDeLola, data)));
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

/** El texto con el recordatorio del primer menú al final, si toca. */
export const conRecordatorio = (texto, recordar, idioma = "es") =>
  (recordar ? `${texto}\n\n${RECORDATORIO_SILENCIO[idioma] ?? RECORDATORIO_SILENCIO.es}` : texto);
