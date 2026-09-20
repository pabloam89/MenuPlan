/**
 * La receta tal y como se cocina cuando sus bases YA están hechas.
 *
 * Es la otra mitad del batch cooking, y la que el usuario cobra. Hasta ahora
 * el catálogo sabía qué pasos desaparecen si tienes el sofrito hecho
 * (`stepsRich[i].base`), y la ficha del plato seguía pintando la receta entera:
 * los cuarenta minutos, la cebolla que ya está picada y el paso de pocharla.
 *
 * Esto devuelve la MISMA receta vista desde el martes:
 *
 *   · los pasos de la base se van, y en su sitio entran los de reactivarla
 *     ("saca el bote y dale un minuto de sartén"), que no son gratis
 *   · los ingredientes que solo usaba la base se marcan como ya resueltos, en
 *     vez de desaparecer: siguen haciendo falta, pero el domingo
 *   · el tiempo es el que queda de verdad
 *
 * No escribe nada ni modifica la receta: devuelve una vista.
 *
 * ── Por qué los ingredientes se DERIVAN y no se etiquetan ─────────────────
 * Etiquetamos pasos, no líneas de ingrediente. El enlace entre unos y otras ya
 * existe: los marcadores `{{Cebolla}}` del texto, que es la misma máquina con
 * la que `ingredientsByPart` separa la salsa de la guarnición. Añadir un campo
 * nuevo a cada línea habría sido una segunda verdad sobre lo mismo y otra cosa
 * que se queda desincronizada.
 */

import { BASE_POR_CLAVE, clavesDeReceta } from "./bases.js";
import { ingredientCategoryFor } from "./ingredients.js";
import { findIngredientForMarker, markerIngredientNames } from "./recipeSteps.js";


/**
 * Lo que NUNCA se da por resuelto aunque solo aparezca en un paso de la base.
 *
 * El aceite y la sal salen nombrados al pochar la cebolla y en ningún sitio
 * más, así que la derivación se los llevaba: la ficha decía que ya los tienes
 * y la lista de la compra los perdía. Son de despensa, se usan en todo y no
 * pertenecen a ninguna tanda.
 */
const esDeDespensa = (nombre) => ingredientCategoryFor(nombre) === "Despensa";

/**
 * Qué ingredientes resuelve cada base, por los marcadores de sus pasos.
 *
 * La regla es SOLO: un ingrediente pertenece a la base si todas las veces que
 * se nombra están en pasos de esa base. En cuanto aparece una vez fuera, se
 * queda — porque lo vas a necesitar igual. El aceite de un plato que pocha la
 * cebolla y luego saltea el pollo es el caso típico.
 */
function ingredientesPorBase(receta, listas) {
  const porIngrediente = new Map(); // ingrediente -> clave de base, o null

  for (const paso of receta?.stepsRich ?? []) {
    const clave = paso?.base && listas.has(paso.base) ? paso.base : null;
    for (const marcador of markerIngredientNames(paso?.text)) {
      const ing = findIngredientForMarker(marcador, receta.ingredients);
      if (!ing) continue;
      if (!porIngrediente.has(ing)) porIngrediente.set(ing, clave);
      // Nombrado también fuera de la base (o en otra distinta): se queda.
      else if (porIngrediente.get(ing) !== clave) porIngrediente.set(ing, null);
    }
  }

  for (const [ing, clave] of porIngrediente) {
    if (clave && esDeDespensa(ing.name)) porIngrediente.set(ing, null);
  }
  return porIngrediente;
}

/**
 * @param {object} receta
 * @param {Iterable<string>} [clavesListas] qué bases se dan por hechas. Por
 *   defecto, todas las que el plato declara suyas.
 * @returns {{
 *   aplicada: boolean,
 *   bases: Array<{clave: string, nombre: string, receta: object}>,
 *   pasos: object[],
 *   ingredientes: Array<object & {deBase: string|null}>,
 *   minutos: number, minutosActivos: number,
 * }}
 */
export function recetaConBases(receta, clavesListas) {
  const pasosOriginales = receta?.stepsRich ?? [];
  const dadas = Array.isArray(clavesListas) ? clavesListas : clavesDeReceta(receta);
  // Solo cuentan las bases que de verdad se llevan algún paso: un plato puede
  // declarar arroz aparte y no tener ni un paso marcado, y entonces no hay
  // tupper que sacar ni nada que reactivar.
  const listas = new Set(
    [...new Set(dadas)].filter((c) => pasosOriginales.some((p) => p?.base === c)),
  );

  const minutosEnteros = pasosOriginales.reduce((s, p) => s + (Number(p?.minutes) || 0), 0);
  const vacio = {
    aplicada: false,
    bases: [],
    pasos: pasosOriginales,
    ingredientes: (receta?.ingredients ?? []).map((i) => ({ ...i, deBase: null })),
    minutos: minutosEnteros,
    minutosEnteros,
    ahorro: 0,
    minutosActivos: pasosOriginales.reduce(
      (s, p) => s + (p?.kind === "activo" || p?.kind === "prep" ? Number(p?.minutes) || 0 : 0), 0,
    ),
  };
  if (listas.size === 0) return vacio;

  // ── Pasos ───────────────────────────────────────────────────────────────
  // Los de reactivar entran donde estaba el PRIMER paso de esa base, no al
  // principio de la receta: si el sofrito se usaba a mitad, sacar el bote a
  // mitad es lo natural. En la mayoría de platos la base va primera, así que
  // en la práctica la receta empieza por reactivarla, que es lo que se quiere.
  const pasos = [];
  const yaReactivada = new Set();
  for (const paso of pasosOriginales) {
    const clave = paso?.base;
    if (!clave || !listas.has(clave)) {
      pasos.push(paso);
      continue;
    }
    if (yaReactivada.has(clave)) continue;
    yaReactivada.add(clave);
    const base = BASE_POR_CLAVE.get(clave);
    for (const r of base?.reactivacion ?? []) {
      // `base` viaja en el paso para que la ficha pueda marcarlo como de la
      // tanda, y `deBase` dice de cuál sin tener que volver a mirarlo.
      pasos.push({ ...r, base: clave, deReactivacion: true });
    }
  }

  // ── Ingredientes ────────────────────────────────────────────────────────
  const porIngrediente = ingredientesPorBase(receta, listas);
  const ingredientes = (receta?.ingredients ?? []).map((i) => ({
    ...i,
    deBase: porIngrediente.get(i) ?? null,
  }));

  const minutos = pasos.reduce((s, p) => s + (Number(p?.minutes) || 0), 0);
  const minutosActivos = pasos.reduce(
    (s, p) => s + (p?.kind === "activo" || p?.kind === "prep" ? Number(p?.minutes) || 0 : 0), 0,
  );

  return {
    aplicada: true,
    bases: [...listas].map((clave) => ({
      clave,
      nombre: BASE_POR_CLAVE.get(clave)?.name ?? clave,
      receta: BASE_POR_CLAVE.get(clave) ?? null,
    })),
    pasos,
    ingredientes,
    minutos,
    minutosEnteros,
    // Lo que se ahorra de verdad, y puede ser CERO o menos que cero.
    //
    // Hay una decena de platos donde reactivar cuesta mas que el paso que se
    // lleva: una ensalada de garbanzos cuya unica linea de legumbre es
    // "escurrir los garbanzos" cambia un minuto por los dos de sacar el tupper
    // y escurrirlo. No es un fallo del calculo, es que ahi la tanda no sirve
    // de nada, y el numero tiene que poder decirlo. La ficha ensena el ahorro
    // solo cuando es positivo; si no, no hay nada que presumir.
    ahorro: Math.max(0, minutosEnteros - minutos),
    minutosActivos,
  };
}
