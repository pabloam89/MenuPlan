/**
 * Lo de alergias que no necesita el catálogo: si una persona está revisada, de
 * dónde sale su «ninguna» y si una frase habla de alergias. Sin dependencias
 * pesadas, para que el bot lo use en el camino del turno sin cargar el motor
 * (src/lib/alergias.js arrastra allergens.js e ingredientSchema.js, y con
 * ellos el catálogo). src/lib/alergias.js lo reexporta todo: la app sigue
 * importando de allí.
 */

import { ORIGEN_ALERGIAS } from "./vocabularios.js";

const [, POR_SILENCIO] = ORIGEN_ALERGIAS;

// Se compara SIN tildes. La primera versión no lo hacía y se le escapaban
// "soy alérgico" y "mi hija es celíaca" — o sea, las dos formas en que
// cualquier español escribe esto.
export const sinTildes = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");

// Deliberadamente ancha: un falso positivo manda al usuario a la ficha de
// alérgenos, que es donde debería ir de todas formas. Un falso negativo le deja
// creer que está protegido.
const ALERGIA_RE = /\b(alergi|alergic|intoleran|celiac|celiaqu|anafilax|sin gluten|sin lactosa|sin huevo|sin frutos secos|no puede tomar|le sienta mal|me sienta mal)/;

/** ¿Esta frase habla de una alergia o intolerancia? Para cortar antes del modelo. */
export function pareceAlergia(texto) {
  return ALERGIA_RE.test(sinTildes(texto));
}

/**
 * ── Revisión por persona ──────────────────────────────────────────────────
 * `allergiesReviewed` era de toda la casa y no se reseteaba al añadir a
 * alguien: entraba un bebé nuevo y la casa seguía «revisada» sin que nadie
 * hubiera preguntado por él. Ahora cada miembro lleva `alergiasRevisadas`, y
 * `data.allergiesReviewed` queda como resumen (todos revisados), que es lo que
 * siguen leyendo la app y el embudo.
 *
 * Un miembro sin el campo (datos de antes) hereda el valor de la casa.
 */
export const alergiasRevisadas = (data, m) => m?.alergiasRevisadas ?? data?.allergiesReviewed === true;

/**
 * ¿Su «ninguna» es por silencio y no dicho? Solo si sigue sin alergias: una
 * que se apunte después (desde la app, que no conoce la marca) manda.
 */
export const alergiasPorSilencio = (data, m) =>
  alergiasRevisadas(data, m) && m?.alergiasOrigen === POR_SILENCIO && !(m?.allergies ?? []).length;

const sinOrigen = (m) => {
  if (!("alergiasOrigen" in m)) return m;
  const { alergiasOrigen: _fuera, ...resto } = m;
  return resto;
};

/**
 * Marca como revisados los miembros con esos ids (`null` = todos) y deja el
 * resto como estaba, pero escrito en cada uno: así cambiar el resumen de la
 * casa no cambia lo que hereda un miembro antiguo. A los que marca les quita
 * la marca de silencio: esto es lo que alguien ha dicho (o la app ha visto).
 */
export function marcarRevisadas(data, ids = null) {
  const members = (data?.members ?? []).map((m) => {
    const toca = ids == null || ids.includes(m.id);
    return { ...(toca ? sinOrigen(m) : m), alergiasRevisadas: toca ? true : alergiasRevisadas(data, m) };
  });
  return { ...data, members, allergiesReviewed: members.every((m) => m.alergiasRevisadas) };
}

/**
 * «Si no me dices nada, entiendo que ninguna» y no dijeron nada (#229): los
 * que siguen sin revisar y sin alergias pasan a revisados, con la marca
 * `alergiasOrigen: "por_silencio"`. Para el menú es «ninguna»; la ficha lo
 * enseña como no confirmado. Sin nadie que marcar, el mismo objeto.
 * `soloIds`: solo esas personas (por las que se preguntó); null, todas.
 * @returns {{ data: object, ids: string[] }}
 */
export function marcarPorSilencio(data, soloIds = null) {
  const ids = (data?.members ?? [])
    .filter((m) => !alergiasRevisadas(data, m) && !(m.allergies ?? []).length)
    .filter((m) => soloIds == null || soloIds.includes(m.id))
    .map((m) => m.id);
  if (!ids.length) return { data, ids };
  const members = (data.members ?? []).map((m) => (ids.includes(m.id)
    ? { ...m, alergiasRevisadas: true, alergiasOrigen: POR_SILENCIO }
    : { ...m, alergiasRevisadas: alergiasRevisadas(data, m) }));
  return { data: { ...data, members, allergiesReviewed: members.every((m) => m.alergiasRevisadas) }, ids };
}

/**
 * El recordatorio del primer menú de una casa con alguien por silencio («He
 * dado por hecho que nadie tiene alergias…»): una vez por casa. Quien genera
 * el menú lo llama dentro de la misma escritura, así que dos menús seguidos no
 * lo dan dos veces. `data.alergiasSilencioRecordado` es la marca.
 * @returns {{ data: object, recordar: boolean }}
 */
export function conRecordatorioDeSilencio(data) {
  if (data?.alergiasSilencioRecordado === true) return { data, recordar: false };
  if (!(data?.members ?? []).some((m) => alergiasPorSilencio(data, m))) return { data, recordar: false };
  return { data: { ...data, alergiasSilencioRecordado: true }, recordar: true };
}
