/**
 * Uno o dos platos en la comida: de la casa (data.mealStructure) y, en modo
 * experto, por grupo (data.mealStructureByGroup[g]), que manda sobre la de la
 * casa. Una sola lectura y una sola escritura para el motor, la app y Lola (#958).
 *
 * Antes Lola escribía solo `mealStructure` y el motor leía primero el del
 * grupo: en una casa con estructura por grupo, «solo un plato» no hacía nada
 * (5 casas así el 29 oct 2026), y describir_ajustes enseñaba el valor de la
 * casa, que no era el que se usaba.
 */

export const ESTRUCTURA_POR_DEFECTO = "primero_segundo";
export const ESTRUCTURA_CENA_POR_DEFECTO = "1_plato";

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
