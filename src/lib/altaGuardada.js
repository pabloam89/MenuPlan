/**
 * El cierre del alta en la app: la marca de «alergias revisadas» se guarda AL
 * MOMENTO, se espera la respuesta de la base y solo entonces se avisa a Lola.
 *
 * Antes la marca se ponía en el último clic y subía 1,2 s después con el
 * guardado diferido de la casa entera, mientras ese mismo clic avisaba a
 * Lola. Si en ese segundo la nube se recargaba, el guardado se descartaba en
 * silencio y la casa se quedaba sin la marca; Lola ya tenía apuntado «he
 * rellenado las alergias». Pasó el 30 oct 2026 (#1029): sin la marca el motor
 * esquiva los 14 alérgenos y el menú salió con 27 recetas y huecos vacíos.
 *
 * La clase: un dato de seguridad en un guardado diferido que se puede tirar
 * sin avisar. Aquí el orden es fijo y se ve: marcar → guardar (y esperar) →
 * avisar. Si no se guarda, no se avisa y se dice por qué (lista cerrada).
 *
 * Puro: quien lo llama pone `guardar` (la cola de la casa en App.jsx,
 * guardarCasaAhora) y `avisar` (avisarAltaALola de lib/frontalBot.js). Es el
 * trozo 1 de specs/plan-fichas-con-estado.md; cuando la marca sea una fila
 * con sobre (tramo 3), `guardar` será escribirDato y esto no cambia.
 */
import { marcarRevisadas } from "./alergiasBase.js";

/** Por qué no se ha guardado: chocó con otro cambio, la nube se recargó entretanto, o la base no contestó. */
export const MOTIVOS_NO_GUARDADO = ["choque", "descartado", "error"];

const motivoDe = (r) => (r?.conflict ? "choque" : r?.descartado ? "descartado" : "error");

/**
 * @param {object} p
 * @param {object} p.data La casa tal como está en pantalla (sin la marca: se pone aquí).
 * @param {(data: object) => Promise<{ ok: boolean, conflict?: boolean, descartado?: boolean }>} p.guardar
 * @param {(() => Promise<boolean>) | null} [p.avisar] Avisar a Lola; null si el alta no viene de ella.
 * @returns {Promise<{ ok: boolean, motivo: string | null, data: object, avisado: boolean }>}
 */
export async function cerrarAlta({ data, guardar, avisar = null }) {
  const marcada = marcarRevisadas(data, null);
  let r;
  try {
    r = await guardar(marcada);
  } catch (e) {
    // Sin red o la base caída: no se traga, se devuelve como motivo y se apunta.
    console.warn("[alta] no se pudo guardar la marca de alergias", e?.message);
    r = { ok: false };
  }
  if (!r?.ok) return { ok: false, motivo: motivoDe(r), data: marcada, avisado: false };
  const avisado = avisar ? (await avisar()) === true : false;
  return { ok: true, motivo: null, data: marcada, avisado };
}
