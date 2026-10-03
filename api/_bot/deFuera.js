/**
 * Lo que no puede comer quien viene de fuera (un invitado celíaco, una amiga
 * embarazada), aplicado por el MOTOR y no por la memoria de Lola.
 *
 * Staging, 2 oct 2026: «cenamos con amigos, una está embarazada y otro es
 * celíaco». anadir_invitado no guarda restricciones y proponer_platos solo
 * filtraba por la casa: «sin gluten» y «apto para embarazo» eran Lola
 * acordándose. Aquí se añade, SOLO para esa llamada, un comensal de fuera al
 * grupo que come, con las mismas alergias, intolerancias y estados
 * (embarazo, lactancia) que tendría alguien de la casa. El motor filtra con
 * sus reglas de siempre (src/lib/intolerances.js, src/lib/allergens.js): no hay
 * criterio nuevo de qué es seguro, y nada se guarda en la casa.
 *
 * No es la solución entera: una restricción guardada con el invitado y aplicada
 * solo a esa comida necesita tocar el motor (specs/invitados-seguros.md).
 */

import { EU_ALLERGENS, normalizeAllergenId } from "../../src/lib/allergensCore.js";
import { INTOLERANCE_RULES } from "../../src/lib/intolerances.js";

export const ALERGENOS = Object.keys(EU_ALLERGENS);
export const INTOLERANCIAS = Object.entries(INTOLERANCE_RULES).filter(([, r]) => r.kind === "intolerance").map(([k]) => k);
export const ESTADOS = ["embarazo", "lactancia"];

const ID = "_de_fuera";

/**
 * Lo pedido, solo con lo que el motor sabe filtrar. null si no queda nada.
 * @param {{ alergias?: string[], intolerancias?: string[], estados?: string[] } | null | undefined} x
 */
export function restriccionesDeFuera(x) {
  if (!x) return null;
  const alergias = [...new Set((x.alergias ?? []).map(normalizeAllergenId).filter((a) => ALERGENOS.includes(a)))];
  const intolerancias = [...new Set((x.intolerancias ?? []).filter((i) => INTOLERANCIAS.includes(i)))];
  const estados = [...new Set((x.estados ?? []).filter((e) => ESTADOS.includes(e)))];
  return alergias.length || intolerancias.length || estados.length ? { alergias, intolerancias, estados } : null;
}

/**
 * `data` con un comensal de fuera en los grupos indicados, para pasárselo al
 * motor al elegir platos. Sin restricciones, el mismo `data`.
 * @param {object} data  state.data de la casa
 * @param {string[]} grupos  ids de los grupos que comen con el de fuera
 * @param {ReturnType<typeof restriccionesDeFuera>} r
 */
export function conQuienViene(data, grupos, r) {
  if (!r) return data;
  // Adulto: sin edad, el motor podría tratarlo como niño o bebé.
  const deFuera = { id: ID, name: "de fuera", age: 35, allergies: r.alergias, intolerances: r.intolerancias, dietaryStates: r.estados };
  return {
    ...data,
    members: [...(data.members ?? []), deFuera],
    groups: (data.groups ?? []).map((g) => (grupos.includes(g.id) ? { ...g, memberIds: [...(g.memberIds ?? []), ID] } : g)),
  };
}

/** «sin gluten, embarazo», para decir en la respuesta con qué se ha filtrado. */
export function describirDeFuera(r) {
  if (!r) return "";
  return [
    ...r.alergias.map((a) => `sin ${a.replace(/_/g, " ")}`),
    ...r.intolerancias.map((i) => INTOLERANCE_RULES[i]?.label?.toLowerCase() ?? i),
    ...r.estados,
  ].join(", ");
}

/** El esquema del parámetro, igual en proponer_platos y cambiar_plato. */
export const ESQUEMA_DE_FUERA = {
  type: "object",
  description: "Lo que NO pueden comer los invitados de esa comida (celíaco = alergias: gluten; embarazada = estados: embarazo). Pásalo SIEMPRE que lo hayan dicho, también en cada propuesta o cambio siguiente de esa comida: el motor lo filtra igual que lo de la casa. Sin esto, no está filtrado y no puedes decir que lo es.",
  properties: {
    alergias: { type: "array", items: { type: "string", enum: ALERGENOS } },
    intolerancias: { type: "array", items: { type: "string", enum: INTOLERANCIAS } },
    estados: { type: "array", items: { type: "string", enum: ESTADOS } },
  },
  additionalProperties: false,
};
