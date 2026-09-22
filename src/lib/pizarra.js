/**
 * La pizarra: un menú que nace VACÍO y lo llenas tú.
 *
 * ── Qué es, y qué NO es ───────────────────────────────────────────────────
 * No es un motor nuevo ni un modo de generación: es el mismo menú de siempre
 * con todos sus huecos marcados `cleared`. Todo lo que ya sabe hacer la
 * pantalla del menú sobre un hueco vacío —tocarlo para elegir del catálogo,
 * mover, duplicar, vaciar, partir la comida en primero y segundo— funciona
 * aquí sin una línea nueva, porque el hueco vacío ya era un objeto de primera
 * clase (ver `slot.cleared` en Menu.jsx y `handleClearSlot` en App.jsx).
 *
 * Lo único que faltaba era poder EMPEZAR así: hasta ahora un plan solo nacía
 * de generar, y sin generación no había plan, ni huecos, ni dónde tocar.
 *
 * ── Por qué el esqueleto no se puede improvisar ───────────────────────────
 * Un hueco no es solo "día + comida". Lleva dos datos que nadie recalcula
 * después:
 *
 *   · `eaters` — cuánta gente come ahí. `pickCatalogReplacement` lo lee tal
 *     cual (`currentSlot.eaters ?? 2`) para escalar la receta que coloques.
 *     Un esqueleto sin `eaters` no falla: escala todos los platos para dos
 *     personas y no lo dice.
 *   · `mode` — "casa" o "tupper", que es lo que distingue una comida que se
 *     cocina y se come allí de una que se lleva.
 *
 * Por eso esto es el bucle de `generateMenu` (planner.js) con la parte de
 * elegir receta quitada, y no un objeto inventado: los huecos tienen que
 * salir exactamente donde el generador los habría puesto, o la pizarra y el
 * menú generado serían dos cosas distintas.
 */

import {
  DAYS,
  EXTRA_MEAL_LABELS,
  getDayMeals,
  modeForGroupSlot,
  slotKey,
} from "./planner.js";
import { isBabyMenuGroup, membersOfGroup } from "./groups.js";
import { resolveMemberAge, stageForAge } from "./stages.js";

/**
 * ¿Está encendida? Apagada por defecto, igual que el solver y por el mismo
 * motivo: la Inicio de producción no cambia hasta que alguien lo pida. Dos
 * formas de pedirlo, las dos sin tocar código:
 *   · `VITE_PIZARRA=on` en el entorno del despliegue (en la rama `staging` va
 *     encendida sola, ver vite.config.js);
 *   · `localStorage.setItem("mp_pizarra", "on")` en un navegador concreto,
 *     para enseñarla en producción sin que le salga a nadie más.
 *
 * `import.meta.env.VITE_PIZARRA` se escribe EXACTAMENTE así, sin `?.`: con el
 * encadenamiento opcional Vite no reconoce la expresión y el `define` del
 * build no la sustituye — le pasó al motor y el solver nunca llegó a correr
 * en staging.
 */
export function pizarraActiva() {
  try {
    if (typeof localStorage !== "undefined") {
      const local = localStorage.getItem("mp_pizarra");
      if (local === "on") return true;
      if (local === "off") return false;
    }
  } catch {
    // Safari en privado lanza al leer localStorage; no decide nada.
  }
  try {
    return import.meta.env.VITE_PIZARRA === "on";
  } catch {
    return false;
  }
}

/** Los niños que cuentan para la merienda: ni bebés ni adultos. */
function tieneNinos(miembros) {
  return miembros.some((m) => {
    const s = stageForAge(resolveMemberAge(m)).id;
    return s === "infantil" || s === "primaria";
  });
}

/**
 * ¿Este grupo tiene esta franja?
 *
 * Comida y cena las tiene todo el mundo. Las de fuera de menú siguen las
 * mismas dos excepciones que `planExtraMealsForGroup` (aiPlanner.js), que es
 * quien las reparte cuando el menú se genera: el menú de bebé no lleva
 * ninguna, y la merienda es cosa de niños. Si la pizarra pintara un hueco de
 * merienda a una casa de adultos, sería un hueco que el generador nunca
 * rellena: la pizarra y el menú generado dejarían de tener la misma forma.
 */
function franjaAplica(meal, { esMenuDeBebe, hayNinos }) {
  if (!EXTRA_MEAL_LABELS.includes(meal)) return true;
  if (esMenuDeBebe) return false;
  if (meal === "Merienda") return hayNinos;
  return true;
}

/**
 * El esqueleto: todos los huecos de la semana, todos vacíos.
 *
 * `cleared: true` es lo que hace que la pantalla del menú pinte el
 * placeholder tocable en vez de saltarse el hueco — y también lo que hace que
 * `hasVisibleMenu` (Menu.jsx) dé verdadero, así que un menú entero por
 * rellenar entra en el deck en lugar de caer en el "aún no tienes menú".
 *
 * `groups` se pasa como argumento en vez de leerse de `data.groups` porque
 * quien llama ya ha tenido que resolver los grupos reales (pueden venir del
 * modelo si el estado guardado traía un reparto viejo), y resolverlos dos
 * veces con criterios distintos es justo como se desincronizan las cosas.
 */
export function planVacio(data, groups) {
  const plan = { _warnings: [] };
  const members = data?.members ?? [];
  const schedule = data?.schedule ?? {};
  const comidas = getDayMeals(data);

  for (const group of groups ?? []) {
    plan[group.id] = {};
    const delGrupo = membersOfGroup(group, members);
    if (delGrupo.length === 0) continue;

    const contexto = {
      esMenuDeBebe: isBabyMenuGroup(group, members),
      hayNinos: tieneNinos(delGrupo),
    };

    for (const day of DAYS) {
      for (const meal of comidas) {
        if (!franjaAplica(meal, contexto)) continue;

        // Mismo criterio que el generador: si ese día no come nadie en casa,
        // no hay hueco que rellenar. Aquí importa el doble, porque un hueco
        // con cero comensales escalaría a cero raciones el plato que le
        // pusieras encima.
        const mode = modeForGroupSlot(group, members, schedule, day, meal);
        if (!mode.cook) continue;

        const eaters = delGrupo.filter((m) => {
          const s = schedule[slotKey(m.id, day, meal)] ?? "casa";
          return s === "casa" || s === "tupper";
        }).length;
        if (eaters === 0) continue;

        plan[group.id][`${day}-${meal}`] = {
          recipeId: null,
          firstRecipeId: null,
          mode: mode.mode,
          eaters,
          warnings: [],
          cleared: true,
        };
      }
    }
  }

  return plan;
}

/**
 * Pone al día los huecos de un plan cuando cambian las comidas o los días
 * desde los mandos de la pizarra.
 *
 * SOLO AÑADE. Quitar el desayuno no borra los desayunos que ya habías puesto:
 * deja de pintarlos, porque el deck dibuja lo que dice `getDayMeals`, y si
 * vuelves a encenderlo aparecen donde estaban. Borrarlos sería destruir
 * trabajo por tocar un interruptor, y el interruptor no avisa de eso.
 *
 * Devuelve el mismo plan cuando no hay nada que añadir, para no disparar un
 * render por cada toque que no cambia la forma del tablero.
 */
export function conHuecosAlDia(plan, data, groups) {
  const base = planVacio(data, groups);
  const next = { ...plan };
  let nuevos = 0;

  for (const [gid, huecos] of Object.entries(base)) {
    if (gid === "_warnings") continue;
    const actuales = next[gid] ?? {};
    let copia = null;
    for (const [key, hueco] of Object.entries(huecos)) {
      if (actuales[key]) continue;
      copia = copia ?? { ...actuales };
      copia[key] = hueco;
      nuevos++;
    }
    if (copia) next[gid] = copia;
  }

  return nuevos > 0 ? next : plan;
}

/** Cuántos huecos tiene un esqueleto (para el copy de "tienes N huecos"). */
export function huecosDelPlan(plan) {
  let n = 0;
  for (const [gid, slots] of Object.entries(plan ?? {})) {
    if (gid === "_warnings" || !slots || typeof slots !== "object") continue;
    n += Object.values(slots).filter(Boolean).length;
  }
  return n;
}
