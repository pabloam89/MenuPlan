/**
 * Qué huecos DEBE tener un menú y cuáles se han quedado sin plato.
 *
 * El motor, cuando no encuentra plato para un hueco, lo tira y deja una nota
 * en `plan._warnings` que nadie enseña: Lola decía «¡Menú listo!» con cinco
 * huecos vacíos (#1029). Aquí se calcula el invariante de completitud:
 *
 *   hueco esperado = grupo con gente × día activo × comida que se cocina
 *                    (modeForGroupSlot) × platos de su estructura
 *
 * y se compara con el plan guardado. Puro y sin red: lo usan generar.js al
 * acabar y la cifra «semanas vivas con huecos vacíos» (npm run consulta).
 *
 * La regla de cuántos platos lleva cada hueco está calcada de
 * buildGroupContext (aiPlanner.js): la misma lectura de mealStructure,
 * mealStructureCena y slotType. Cuando se fusione la rama
 * `datos/estructura-efectiva` (src/lib/estructuraPlatos.js), esto pasa a
 * leerla de ahí y la copia desaparece.
 */
import { getMeals, modeForGroupSlot } from "./planner.js";
import { isBabyMenuGroup, membersOfGroup, tipoDeGrupo } from "./groups.js";
import { kidsSlotAction } from "./kidsMenu.js";
import { DIAS, COMIDAS, DIA_LARGO_MINUSCULAS } from "./dias.js";

/** Los platos de un hueco, vocabulario cerrado: el primero y el principal. */
export const PLATOS_DEL_HUECO = Object.freeze(["primero", "principal"]);

/** Cómo se dice cada plato cuando se nombra un hueco a medias. */
const ORDINAL = Object.freeze({ primero: "1º", principal: "2º" });

/**
 * Cuántos platos lleva un hueco según la estructura del grupo y el tipo de
 * ese día (plato único, rápida). Misma regla que buildGroupContext.
 */
function platosDelHueco(data, group, day, meal, { esBebe, copiaDeAdultos }) {
  // El bebé come un solo plato (puré); un hueco que copia el de los adultos
  // lleva lo que tengan ellos, así que lo que se exige aquí es que haya algo.
  if (esBebe || copiaDeAdultos) return ["principal"];
  const slotTypeSel = data.slotType?.[`${day}|${meal}`];
  if (meal === "Comida") {
    const estructura = data.mealStructureByGroup?.[group.id] ?? data.mealStructure ?? "primero_segundo";
    const unPlato = slotTypeSel === "unico" || slotTypeSel === "rapida" || estructura !== "primero_segundo";
    return unPlato ? ["principal"] : [...PLATOS_DEL_HUECO];
  }
  const estructuraCena = data.mealStructureCenaByGroup?.[group.id] ?? data.mealStructureCena ?? "1_plato";
  const dosPlatos = estructuraCena === "primero_segundo" && slotTypeSel !== "rapida";
  return dosPlatos ? [...PLATOS_DEL_HUECO] : ["principal"];
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
        const platos = platosDelHueco(data, group, dia, comida, { esBebe, copiaDeAdultos });
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
 * De los huecos esperados, los que el plan no tiene: `{ grupo, dia, comida, plato }`.
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
 * Con varios grupos, el grupo entre paréntesis.
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
