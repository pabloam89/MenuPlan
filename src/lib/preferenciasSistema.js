/**
 * Las reglas del validador como preferencias del sistema (trozo 32 de #1037): casa `*` (todas las casas), origen
 * `derivado` (no las dice nadie: salen de cómo se cocina), con la fuerza que dice si el solver puede saltárselas.
 *
 * Una regla es `preferencia` cuando su veredicto es el de una preferencia de la casa: cuántos platos de un ámbito
 * casan con ella frente a una cantidad, con el mismo evaluador (`estadoDePreferencia`, cumplimiento.js). Así decide
 * `validateMenu` si la rompe; el predicado (qué plato casa) sigue junto a la regla, en su tabla de validateMenu.js.
 * Las que no caben en esa forma se quedan `escritas` en validateMenu.js, con el motivo, y se cuentan: la cifra solo
 * baja (preferenciasSistema.test.js). Una regla pasa de escrita a preferencia solo con su test de paridad: el
 * veredicto del evaluador y el de validateMenu, el mismo sobre casas y menús aleatorios.
 */
import { estadoDePreferencia } from "./cumplimiento.js";
import { OPERADOR_PREFERENCIA as OP } from "./vocabularios.js";

/** Cómo vive cada regla: evaluada como preferencia o escrita a mano en validateMenu.js. */
export const FORMAS_REGLA = Object.freeze(["preferencia", "escrita"]);
/** Dónde se cuentan los platos de una regla `preferencia`: en un hueco o en la semana del grupo. */
export const AMBITOS_REGLA = Object.freeze(["hueco", "semana"]);
/**
 * Por qué una regla sigue escrita: compara dos platos entre sí (no cuenta platos de un ámbito), no hay plato que
 * mirar (falta el hueco o la receta no existe), o su veredicto no es el de la preferencia (calla aunque la rompa).
 */
export const MOTIVOS_ESCRITA = Object.freeze(["entre_platos", "sin_plato", "veredicto_distinto"]);

const regla = (id, forma, resto) => Object.freeze({ id, casa: "*", origen: "derivado", fuerza: "obligatoria", forma, ...resto });
// En un hueco, ningún plato que la rompa: «como mucho 0» de los que no la cumplen.
const veto = (id, resto = {}) => regla(id, "preferencia", { ambito: "hueco", operador: OP.COMO_MUCHO, cantidad: 0, ...resto });
const escrita = (id, motivo, resto = {}) => regla(id, "escrita", { motivo, ...resto });
// Relajable: el solver se la salta antes de dejar un hueco vacío. Pesa, pero no es obligatoria.
const RELAJABLE = { fuerza: "alto" };

/** Todas las reglas que emite validateMenu, una vez. */
export const PREFERENCIAS_SISTEMA = Object.freeze([
  escrita("slot_faltante", "sin_plato"),
  escrita("recipeId_not_in_catalog", "sin_plato"),
  veto("rol_incompatible_con_hueco"),
  veto("tiempo_excedido"),
  veto("tupper_not_friendly"),
  veto("cena_rapida_no_solicitada"),
  veto("legumbres_en_cena"),
  veto("casqueria_entre_semana"),
  veto("plato_ocasion_entre_semana"),
  veto("school_protein_conflict"),
  veto("school_carb_conflict"),
  veto("excluido_en_hueco"),
  veto("health_profile_conflict", RELAJABLE),
  veto("segundo_sin_proteina_principal", RELAJABLE),
  // Cada familia, «como mucho N» en la semana: la misma forma que un tope de la libreta (preferenciasDelMotor); la
  // cantidad la pone la casa (freqs.<familia>).
  regla("freq_max_exceeded", "preferencia", { ambito: "semana", operador: OP.COMO_MUCHO, cantidad: null, ...RELAJABLE }),
  // «Al menos N con esa base», pero solo culpa a un hueco donde la base cabe: sin ninguno, calla aunque falten.
  escrita("base_pedida_insuficiente", "veredicto_distinto"),
  // Una receta, una vez (la sopa de entrada de cena, hasta VECES_MISMA_SOPA): compara cada plato con los de antes.
  escrita("recipeId_repetido", "entre_platos"),
  escrita("comida_sin_segundo", "entre_platos"),
  escrita("comida_desproporcionada", "entre_platos"),
  escrita("comida_demasiado_larga", "entre_platos"),
  // NO_REPETIR (validateMenu.js): un plato frente al de antes, el de su pareja o los del mismo día.
  escrita("proteina_consecutiva", "entre_platos"),
  escrita("proteina_repetida_en_comida", "entre_platos"),
  escrita("proteina_repetida_en_dia", "entre_platos"),
  escrita("dos_ensaladas_en_comida", "entre_platos"),
  escrita("mismo_plato_seguido", "entre_platos"),
  escrita("guarnicion_repetida", "entre_platos"),
  escrita("guarnicion_legumbre", "entre_platos", RELAJABLE),
  escrita("dos_fritos_seguidos", "entre_platos"),
  escrita("dos_cuchara_mismo_dia", "entre_platos"),
  escrita("guarnicion_cena_consecutiva", "entre_platos"),
  escrita("proteina_cena_consecutiva", "entre_platos"),
]);

export const PREFERENCIA_DEL_SISTEMA = Object.freeze(Object.fromEntries(PREFERENCIAS_SISTEMA.map((p) => [p.id, p])));

/** Las que el solver puede saltarse para no dejar un hueco vacío (REGLAS_RELAJABLES, solver.js): las no obligatorias. */
export const RELAJABLES = Object.freeze(PREFERENCIAS_SISTEMA.filter((p) => p.fuerza !== "obligatoria").map((p) => p.id));

/**
 * Pura. ¿Rompe el menú la regla `id`? `veces`: los platos de su ámbito que casan con ella (los que no cumplen el veto
 * del hueco; los de la familia en la semana); `cantidad`, la de la casa cuando la regla no la trae. Una regla escrita
 * o una cantidad que no es un número (undefined, NaN) lanzan: no hay veredicto que dar.
 */
export function rompe(id, veces, cantidad) {
  const p = PREFERENCIA_DEL_SISTEMA[id];
  if (p?.forma !== "preferencia") throw new Error(`regla ${id}: no es una preferencia del sistema`);
  if (p.cantidad != null) return estadoDePreferencia(p, veces) === "no";
  const tope = Number(cantidad); // null es 0, como en la resta de siempre (validateMenu, regla 11)
  if (!Number.isFinite(tope)) throw new Error(`regla ${id}: cantidad ${cantidad} no es un número`);
  return estadoDePreferencia({ ...p, cantidad: tope }, veces) === "no";
}
