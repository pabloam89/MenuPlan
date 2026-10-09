/**
 * Las alergias como regla de dominio, no de pantalla ni de prompt.
 *
 * Hay tres sitios que escriben alergias —la ficha de la app, el bot y, más
 * adelante, quien llame a la API— y la regla tiene que ser la misma en los
 * tres: nada se guarda sin confirmación explícita, y solo entran los 14
 * alérgenos del reglamento. Si la regla viviera en el prompt del bot, un
 * tercero que escribiera por la API se la saltaría sin enterarse.
 *
 * ── Id o etiqueta ─────────────────────────────────────────────────────────
 * La app guarda la ETIQUETA ("Gluten") y el bot guardaba el id ("gluten").
 * El filtro normaliza y los trata igual, pero comparar a pelo no: quitar
 * "gluten" no borraba el "Gluten" que puso la app. Aquí se compara siempre
 * por `normalizeAllergenId` y se escribe la etiqueta, que es la forma que ya
 * tienen los datos.
 */

import { EU_ALLERGENS, normalizeAllergenId } from "./allergens.js";
import { EU_ALLERGEN_IDS } from "../data/ingredientSchema.js";
import { alergiasRevisadas, marcarRevisadas } from "./alergiasBase.js";

// Lo que no necesita el catálogo vive en alergiasBase.js (el bot lo usa sin
// cargar el motor); aquí se reexporta para que la app siga importando de aquí.
export {
  pareceAlergia, alergiasRevisadas, alergiasPorSilencio, marcarRevisadas, marcarPorSilencio, conRecordatorioDeSilencio,
} from "./alergiasBase.js";

/** Aplicar a todos los de la casa. Mismo valor que usa la ficha de la app. */
export const FAMILIA = "__familia__";

/**
 * Añade o quita alérgenos a un miembro (o a todos con `FAMILIA`).
 *
 * Devuelve `{ data, escrito, aplicados, ignorados }`. Cuando `escrito` es
 * false, `data` es el MISMO objeto que entró: quien llama puede comparar por
 * referencia para saber si hay algo que guardar.
 */
export function aplicarAlergias(data, { memberId, ids = [], quitar = false, confirmado } = {}) {
  const nada = (extra = {}) => ({ data, escrito: false, aplicados: [], ignorados: [], ...extra });
  if (confirmado !== true) return nada();

  const aplicados = [];
  const ignorados = [];
  for (const raw of ids) {
    const id = normalizeAllergenId(raw);
    if (EU_ALLERGEN_IDS.includes(id)) {
      if (!aplicados.includes(id)) aplicados.push(id);
    } else ignorados.push(raw);
  }
  if (!aplicados.length) return nada({ ignorados });

  const members = data?.members ?? [];
  const toca = (m) => memberId === FAMILIA || m.id === memberId;
  if (!members.some(toca)) return nada({ ignorados });

  const conAlergias = (m) => {
    const actuales = m.allergies ?? [];
    if (quitar) return actuales.filter((a) => !aplicados.includes(normalizeAllergenId(a)));
    const tiene = new Set(actuales.map(normalizeAllergenId));
    return [...actuales, ...aplicados.filter((id) => !tiene.has(id)).map((id) => EU_ALLERGENS[id].label)];
  };

  const tocados = members.filter(toca).map((m) => m.id);
  const conCambio = { ...data, members: members.map((m) => (toca(m) ? { ...m, allergies: conAlergias(m) } : m)) };
  return {
    data: marcarRevisadas(conCambio, tocados),
    escrito: true,
    aplicados,
    ignorados,
  };
}

/**
 * Las alergias con las que el MENÚ filtra a una persona.
 *
 * Una lista vacía no dice lo mismo antes y después de preguntar: antes es «no
 * lo sabemos» y después «no tiene ninguna». El motor leía `m.allergies` a pelo
 * y trataba las dos igual, así que a quien no habían preguntado le podía salir
 * su alérgeno. Decidido por Pablo el 8 oct 2026: mientras no estén revisadas,
 * el menú esquiva los 14 del reglamento (quedan unos 30 platos de 424, de
 * sobra para una semana) y Lola pregunta.
 *
 * Solo para filtrar. No se guarda nunca ni se enseña como alergia de nadie:
 * las fichas, Lola y la explicación de un plato siguen leyendo `m.allergies`.
 *
 * «Por silencio» (#229) cuenta como revisada: el menú usa todas las recetas.
 * Que no está confirmado lo dicen la ficha y Lola, no el filtro.
 */
export function alergiasParaMenu(data, m) {
  const propias = m?.allergies ?? [];
  if (alergiasRevisadas(data, m)) return propias;
  return [...new Set([...propias, ...EU_ALLERGEN_IDS.map((id) => EU_ALLERGENS[id].label)])];
}

/** Los de la casa a los que nadie ha preguntado todavía por alergias. */
export function pendientesDeAlergias(data) {
  return (data?.members ?? []).filter((m) => !alergiasRevisadas(data, m));
}

/** Añade a alguien a la casa SIN revisar: hasta que se pregunte por él, la casa tampoco lo está. */
export function conMiembroNuevo(data, nuevo) {
  const base = marcarRevisadas(data, []);
  return { ...base, members: [...base.members, { ...nuevo, alergiasRevisadas: false }], allergiesReviewed: false };
}
