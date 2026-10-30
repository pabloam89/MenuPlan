/**
 * Uno o dos platos en la comida: de la casa (data.mealStructure) y, en modo
 * experto, por grupo (data.mealStructureByGroup[g]), que manda sobre la de la
 * casa. Una sola lectura y una sola escritura para el motor, la app y Lola (#958).
 *
 * Antes Lola escribía solo `mealStructure` y el motor leía primero el del
 * grupo: en una casa con estructura por grupo, «solo un plato» no hacía nada
 * (5 casas así el 29 oct 2026), y describir_ajustes enseñaba el valor de la
 * casa, que no era el que se usaba.
 *
 * Y cuántos platos lleva cada hueco (platosDelHueco): una sola regla para el
 * motor (buildGroupContext) y para el invariante de completitud
 * (huecosDelPlan.js). Cuando vivía en dos sitios, divergían en el bebé.
 */
import { ESTRUCTURA } from "./vocabularios.js";

export const ESTRUCTURA_POR_DEFECTO = ESTRUCTURA.dosPlatos;
export const ESTRUCTURA_CENA_POR_DEFECTO = ESTRUCTURA.unPlato;

/** Las posiciones de un hueco de dos platos y de uno, como las nombra el motor (slotId). */
const DOS = Object.freeze(["primero", "segundo"]);
const UNO = Object.freeze(["plato_unico"]);

/**
 * Los platos de un hueco: `["primero", "segundo"]` o `["plato_unico"]`.
 *   · Comida: un plato si el día está marcado `unico` o `rapida`, si la
 *     estructura del grupo es la de un plato, o si es el bebé (puré);
 *     si no, primero y segundo.
 *   · Cena: dos platos solo si la estructura de la cena es la de dos y el
 *     día no es `rapida` (una cena rápida nunca se parte). El bebé cena como
 *     diga su estructura.
 * `estructura` y `estructuraCena` son las del grupo (estructuraDelGrupo,
 * estructuraCenaDelGrupo); `slotType`, data.slotType[`${día}|${comida}`].
 */
export function platosDelHueco({ comida, estructura, estructuraCena, slotType, esBebe = false }) {
  if (String(comida).toLowerCase() === "cena") {
    return estructuraCena === ESTRUCTURA.dosPlatos && slotType !== "rapida" ? DOS : UNO;
  }
  if (esBebe || slotType === "unico" || slotType === "rapida" || estructura === ESTRUCTURA.unPlato) return UNO;
  return DOS;
}

/** La estructura de la comida que usa el motor para un grupo. */
export const estructuraDelGrupo = (data, groupId) =>
  data?.mealStructureByGroup?.[groupId] ?? data?.mealStructure ?? ESTRUCTURA_POR_DEFECTO;

/** La de la cena: tiene su propio defecto y no hereda la de la comida. */
export const estructuraCenaDelGrupo = (data, groupId) =>
  data?.mealStructureCenaByGroup?.[groupId] ?? data?.mealStructureCena ?? ESTRUCTURA_CENA_POR_DEFECTO;

/**
 * La casa entera pasa a esta estructura de comida: también los grupos que
 * tenían la suya (si no, el cambio no se nota en ellos).
 */
export function conEstructura(data, valor) {
  const { mealStructureByGroup: _porGrupo, ...resto } = data ?? {};
  return { ...resto, mealStructure: valor };
}

/**
 * Lo que de verdad usa el motor, para contarlo: un valor si todos los grupos
 * comen igual, o uno por grupo (con su nombre) si no.
 * @returns {{ casa: string, porGrupo: { grupo: string, valor: string }[] | null }}
 */
export function estructuraEfectiva(data) {
  const grupos = data?.groups ?? [];
  const porGrupo = grupos.map((g) => ({ grupo: g.label ?? g.id, valor: estructuraDelGrupo(data, g.id) }));
  const valores = new Set(porGrupo.map((x) => x.valor));
  const casa = data?.mealStructure ?? ESTRUCTURA_POR_DEFECTO;
  return { casa, porGrupo: valores.size > 1 || (valores.size === 1 && !valores.has(casa)) ? porGrupo : null };
}
