/**
 * Qué has comido últimamente, para no volver a proponértelo.
 *
 * ── El problema que resuelve ──────────────────────────────────────────────
 * El solver ordena los candidatos sobre todo por el DÉFICIT: cuánto le falta
 * a cada familia para llegar a su objetivo. Es lo que hace que el estilo de
 * comida se note, y funciona — pero tiene un efecto que se ve enseguida:
 * los platos que cubren dos familias a la vez son "los más útiles" y ganan
 * SIEMPRE, generación tras generación. Medido: ocho semanas generadas con
 * semillas distintas daban 60 platos distintos de 168 huecos, y solo tres
 * pastas de las veintisiete que caben en un primero.
 *
 * Entre semanas de una misma generación esto no pasa, porque `poolForWeek`
 * parte el recetario en cubos. Lo que no había era memoria ENTRE
 * generaciones: quien genera la misma semana tres veces parte siempre del
 * recetario entero, así que ganan los mismos.
 *
 * ── De dónde sale la memoria ──────────────────────────────────────────────
 * Del archivo de menús (`data.menus`), que ya guarda cada semana con su plan
 * y su lunes. No hace falta campo nuevo: lo que salió está escrito.
 *
 * `menuHistory` NO sirve para esto: solo guarda cuándo se generó y cuántos
 * grupos, no qué platos.
 *
 * ── Lo reciente pesa, lo viejo no ─────────────────────────────────────────
 * Un plato de la semana pasada molesta; uno de hace un mes ya apetece otra
 * vez. Por eso el peso decae con las semanas en vez de ser un sí/no, que
 * habría convertido el recetario en dos cajones estancos.
 */

import { catalogIdOfPlanRecipe } from "./freezer.js";

/** Cuántas semanas hacia atrás se recuerda. */
export const VENTANA_SEMANAS = 4;

/**
 * Los platos que han salido en las últimas semanas, con cuánto pesa cada uno.
 *
 * @param {object} data
 * @param {object} [opciones]
 * @param {Set<string>|string[]} [opciones.exentos] ids que NO se penalizan —
 *   las favoritas de la casa: si lo marcaste como favorito, que repita es
 *   justo lo que quieres.
 * @param {number} [opciones.ventana]
 * @returns {Map<string, number>} id de catálogo → peso entre 0 y 1, donde 1 es
 *   "la semana pasada" y se acerca a 0 según se aleja.
 */
export function recetasRecientes(data, { exentos = [], ventana = VENTANA_SEMANAS } = {}) {
  const fuera = exentos instanceof Set ? exentos : new Set(exentos);
  const salida = new Map();

  // Todas las semanas archivadas, de la más reciente a la más antigua. El
  // lunes ISO ordena bien como texto (aaaa-mm-dd) y es estable: un `offset`
  // apunta a una semana distinta cada día que pasa.
  const semanas = [];
  for (const menu of Object.values(data?.menus ?? {})) {
    for (const semana of Object.values(menu?.weeks ?? {})) {
      if (semana?.startISO) semanas.push(semana);
    }
  }
  semanas.sort((a, b) => (a.startISO < b.startISO ? 1 : a.startISO > b.startISO ? -1 : 0));

  semanas.slice(0, ventana).forEach((semana, i) => {
    // 1 para la más reciente y bajando; nunca llega a 0 dentro de la ventana,
    // porque un plato de hace cuatro semanas aún cuenta un poco.
    const peso = (ventana - i) / ventana;
    for (const [groupId, huecos] of Object.entries(semana.plan ?? {})) {
      if (groupId.startsWith("_")) continue;
      for (const hueco of Object.values(huecos ?? {})) {
        for (const rid of [hueco?.firstRecipeId, hueco?.recipeId]) {
          if (!rid) continue;
          const id = catalogIdOfPlanRecipe(rid);
          if (fuera.has(id)) continue;
          // Si un plato salió en dos semanas, manda la más reciente.
          if ((salida.get(id) ?? 0) < peso) salida.set(id, peso);
        }
      }
    }
  });

  return salida;
}
