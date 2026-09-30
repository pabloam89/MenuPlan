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

/** Aplicar a todos los de la casa. Mismo valor que usa la ficha de la app. */
export const FAMILIA = "__familia__";

// Se compara SIN tildes. La primera versión no lo hacía y se le escapaban
// "soy alérgico" y "mi hija es celíaca" — o sea, las dos formas en que
// cualquier español escribe esto.
const sinTildes = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");

// Deliberadamente ancha: un falso positivo manda al usuario a la ficha de
// alérgenos, que es donde debería ir de todas formas. Un falso negativo le deja
// creer que está protegido.
const ALERGIA_RE = /\b(alergi|alergic|intoleran|celiac|celiaqu|anafilax|sin gluten|sin lactosa|sin huevo|sin frutos secos|no puede tomar|le sienta mal|me sienta mal)/;

/** ¿Esta frase habla de una alergia o intolerancia? Para cortar antes del modelo. */
export function pareceAlergia(texto) {
  return ALERGIA_RE.test(sinTildes(texto));
}

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

  return {
    data: {
      ...data,
      members: members.map((m) => (toca(m) ? { ...m, allergies: conAlergias(m) } : m)),
      allergiesReviewed: true,
    },
    escrito: true,
    aplicados,
    ignorados,
  };
}
