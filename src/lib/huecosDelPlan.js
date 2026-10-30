/**
 * Qué huecos DEBE tener un menú y cuáles se han quedado sin plato.
 *
 * El motor, cuando no encuentra plato para un hueco, lo tira y deja una nota
 * en `plan._warnings` que nadie enseña: Lola decía «¡Menú listo!» con cinco
 * huecos vacíos (#1029). Aquí se calcula el invariante de completitud:
 *
 *   hueco esperado = grupo con gente × día activo × comida que se cocina
 *                    (modeForGroupSlot) × platos de su hueco (platosDelHueco)
 *
 * y se compara con el plan guardado. Puro y sin red: lo usa generar.js al
 * acabar (el texto a Lola y la vía rápida).
 */
import { getMeals, modeForGroupSlot } from "./planner.js";
import { isBabyMenuGroup, membersOfGroup, tipoDeGrupo } from "./groups.js";
import { kidsSlotAction } from "./kidsMenu.js";
import { estructuraDelGrupo, estructuraCenaDelGrupo, platosDelHueco } from "./estructuraPlatos.js";
import { DIAS, COMIDAS, DIA_LARGO_MINUSCULAS } from "./dias.js";

/** Los platos de un hueco en el plan guardado, vocabulario cerrado: el primero y el principal. */
export const PLATOS_DEL_HUECO = Object.freeze(["primero", "principal"]);

/** Cómo se dice cada plato cuando se nombra un hueco a medias. */
const ORDINAL = Object.freeze({ primero: "1º", principal: "2º" });

/**
 * De las posiciones del motor (platosDelHueco: «primero», «segundo»,
 * «plato_unico») a los campos del plan guardado: el primero va a
 * `firstRecipeId`; el segundo y el plato único, a `recipeId` (principal).
 */
const platoDelPlan = (posicion) => (posicion === "primero" ? "primero" : "principal");

/**
 * Los platos que el plan debe tener en un hueco. Un hueco de niños que copia
 * el de los adultos (kidsSlotAction ≠ generate) no lo genera el motor: lo
 * rellena después el bloque de copia de generateMenuWithAI, siempre con
 * `recipeId`, con lo que tengan los adultos. Por eso se le exige el principal.
 */
function platosEsperadosDelHueco(data, group, dia, comida, { esBebe, copiaDeAdultos }) {
  if (copiaDeAdultos) return ["principal"];
  return platosDelHueco({
    comida,
    estructura: estructuraDelGrupo(data, group.id),
    estructuraCena: estructuraCenaDelGrupo(data, group.id),
    slotType: data.slotType?.[`${dia}|${comida}`],
    esBebe,
  }).map(platoDelPlan);
}

/**
 * Los huecos que el menú debe tener, uno por plato: `{ grupo, dia, comida, plato, de }`
 * (`de`: cuántos platos lleva ese hueco, 1 o 2).
 * `data` es lo que recibió el motor (grupos, horario, estructura, slotType);
 * `activeDays`, los días de la semana que se generan (ids «Lun»…«Dom»).
 */
export function huecosEsperados(data, { activeDays } = {}) {
  const members = data?.members ?? [];
  const schedule = data?.schedule ?? {};
  const meals = getMeals(data);
  const dias = DIAS.filter((d) => !activeDays || activeDays.includes(d));
  const out = [];
  for (const group of data?.groups ?? []) {
    if (!group?.id || membersOfGroup(group, members).length === 0) continue;
    const esBebe = isBabyMenuGroup(group, members);
    const esDeNinos = tipoDeGrupo(group) === "ninos";
    for (const dia of dias) {
      for (const comida of meals) {
        if (!modeForGroupSlot(group, members, schedule, dia, comida).cook) continue;
        const copiaDeAdultos = esDeNinos && kidsSlotAction(data, dia, comida) !== "generate";
        const platos = platosEsperadosDelHueco(data, group, dia, comida, { esBebe, copiaDeAdultos });
        // `de`: cuántos platos lleva el hueco entero, para decir «(2º)» solo
        // cuando falta uno de dos.
        for (const plato of platos) out.push({ grupo: group.id, dia, comida, plato, de: platos.length });
      }
    }
  }
  return out;
}

/** Un id de receta de verdad: ni vacío ni el marcador «_» (un hueco a medias). */
const hayPlato = (id) => Boolean(id) && id !== "_";

/**
 * De los huecos esperados, los que el plan no tiene, con la misma forma.
 * El plan guardado va por grupo y clave «Lun-Comida», con `recipeId` el
 * principal y `firstRecipeId` el primero.
 */
export function huecosVacios(plan, esperados) {
  return esperados.filter(({ grupo, dia, comida, plato }) => {
    const h = plan?.[grupo]?.[`${dia}-${comida}`];
    return !hayPlato(plato === "primero" ? h?.firstRecipeId : h?.recipeId);
  });
}

/**
 * Los huecos vacíos en castellano corto, en el orden de la semana:
 * «sábado comida (2º), viernes cena». Si del mismo hueco faltan los dos
 * platos, se dice el hueco entero («viernes cena»); si falta uno, cuál.
 * Con varios grupos, el grupo entre corchetes.
 */
export function describirHuecos(huecos) {
  const porHueco = new Map();
  for (const h of huecos) {
    const clave = `${h.grupo}|${h.dia}|${h.comida}`;
    if (!porHueco.has(clave)) porHueco.set(clave, { ...h, platos: [] });
    porHueco.get(clave).platos.push(h.plato);
  }
  const grupos = new Set(huecos.map((h) => h.grupo));
  return [...porHueco.values()]
    .sort((a, b) => DIAS.indexOf(a.dia) - DIAS.indexOf(b.dia) || COMIDAS.indexOf(a.comida) - COMIDAS.indexOf(b.comida))
    .map(({ grupo, dia, comida, platos, de }) => {
      const entero = platos.length >= (de ?? platos.length);
      const cual = entero ? "" : ` (${ORDINAL[platos[0]] ?? platos[0]})`;
      const quien = grupos.size > 1 ? ` [${grupo}]` : "";
      return `${DIA_LARGO_MINUSCULAS[dia] ?? dia} ${comida.toLowerCase()}${cual}${quien}`;
    })
    .join(", ");
}
