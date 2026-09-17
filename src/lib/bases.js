/**
 * Las bases: cocinar una vez para toda la semana — lógica pura, sin React.
 *
 * ── Qué es una base ────────────────────────────────────────────────────────
 * Algo que se cocina UNA VEZ y alimenta a varios platos: una olla de arroz,
 * una de legumbre, una bandeja de boniato. Está a caballo entre el ingrediente
 * y la receta —hay que cocinarla, pero nadie cena un táper de arroz— y por eso
 * vive en el catálogo con `type: "base"`, exactamente igual que las salsas.
 *
 * ── La pieza que lo hace posible: baseMode ─────────────────────────────────
 * `mainBase` ya decía QUÉ fécula lleva un plato, pero no si esa fécula se
 * puede tener hecha de antes, que es lo único que aquí importa:
 *
 *   · el arroz de un bowl o de unas judías con arroz se hierve aparte y se
 *     junta al final     → baseMode "aparte" → una olla sirve a varios platos
 *   · el arroz de un risotto o de una paella se cocina DENTRO absorbiendo su
 *     caldo             → baseMode "dentro"  → precocinarlo arruina el plato
 *
 * Ausente NO es lo mismo que "dentro": es "sin revisar todavía", y aquí se
 * trata como "no". El riesgo es asimétrico —proponer una tanda para un risotto
 * estropea la cena, no proponerla solo deja de ahorrar tiempo—, así que la
 * duda siempre cae del lado de no proponer.
 *
 * ── Por qué el tiempo no se multiplica ─────────────────────────────────────
 * Es la razón entera de que esto merezca la pena: una olla de garbanzos tarda
 * 55 min tanto para 2 raciones como para 16. El tiempo de una base es AFÍN
 * (`minutosFijos` + raciones × `minutosPorRacion`), no proporcional — hasta
 * `capacidadMax`, que es donde deja de caber en la olla y hace falta otra
 * tanda. Sin ese tope el modelo prometería cocinar para 40 en el mismo cazo.
 */

import basesCatalog from "../data/recipes/bases.json";
import { catalogIdOfPlanRecipe } from "./freezer.js";

/** Todas las bases del catálogo. */
export const BASES = basesCatalog;

/**
 * clave → receta de base. La clave es `baseKey` y, si no lo trae, `mainBase`:
 * las siete de fécula se buscan por su hidrato desde siempre, y las que no son
 * fécula (el sofrito) traen `baseKey` propio para no tener que colarse en
 * MAIN_BASES, que es el eje del hidrato y no el de "qué se puede batchear".
 */
const BASE_POR_CLAVE = new Map(BASES.map((b) => [b.baseKey ?? b.mainBase, b]));

/**
 * TODAS las bases que un plato puede aprovechar ya hechas. Son dos caminos
 * distintos y un plato puede recorrer los dos — un salteado de arroz con
 * sofrito aprovecha las dos cosas:
 *
 *   1. su fécula, si está marcada `baseMode: "aparte"`
 *   2. lo que declare en `basesAparte` (sofrito y compañía)
 *
 * @returns {object[]} sin repetir, vacío si el plato no aprovecha ninguna.
 */
export function basesDeReceta(receta) {
  const out = [];
  // Lo que no está marcado "aparte" no entra: ver la nota sobre el riesgo
  // asimétrico en la cabecera.
  if (receta?.mainBase && receta.baseMode === "aparte") {
    const b = BASE_POR_CLAVE.get(receta.mainBase);
    if (b) out.push(b);
  }
  for (const clave of receta?.basesAparte ?? []) {
    const b = BASE_POR_CLAVE.get(clave);
    if (b && !out.includes(b)) out.push(b);
  }
  return out;
}

/**
 * La base de FÉCULA de una receta, o null. Se queda con este nombre y este
 * significado porque es lo que preguntan la ficha y el generador: "¿este plato
 * lleva arroz que pueda tener hecho?". Para la sesión de batch cooking hace
 * falta `basesDeReceta`, que además ve el sofrito.
 */
export function baseDeReceta(receta) {
  if (!receta?.mainBase) return null;
  if (receta.baseMode !== "aparte") return null;
  return BASE_POR_CLAVE.get(receta.mainBase) ?? null;
}

/** ¿Este plato aprovecha alguna base ya cocinada? */
export function usaBase(receta) {
  return basesDeReceta(receta).length > 0;
}

/**
 * Cuántas tandas hacen falta para esta base, cuánto tardan, y cuánto se ahorra
 * frente a cocinarla plato a plato.
 *
 * `raciones` es un ARRAY con las raciones de cada plato ([4, 4, 2] = tres
 * platos), no un total. La distinción no es cosmética: es de dónde sale el
 * ahorro. Cocinar 12 raciones de una vez son 12 raciones en una olla; hacerlo
 * suelto son TRES ollas de 4, no doce de una — cada plato paga los
 * `minutosFijos` una vez, no una por comensal. Comparar contra doce ollas
 * inflaba el ahorro cinco veces y habría puesto un número mentiroso delante
 * del usuario.
 *
 * Se acepta también un número suelto por comodidad, y entonces significa "un
 * solo plato con n raciones" — que da ahorro CERO, y es correcto: cocinar la
 * base de un único plato no es batch cooking, es cocinar.
 *
 * Dentro de una tanda el tiempo es afín (hervir es hervir, da igual la
 * cantidad); pasada `capacidadMax` hace falta otra olla y esos fijos se pagan
 * ENTEROS otra vez, porque nadie tiene dos ollas grandes hirviendo a la vez.
 *
 * @param {object} base
 * @param {number|number[]} raciones
 * @returns {{ tandas: number, minutos: number, minutosSueltos: number, ahorro: number }}
 */
/**
 * Qué parte del tiempo de una base es TUYA — estar delante picando o
 * removiendo— y qué parte es la olla sola.
 *
 * Es la corrección más importante de todo esto, porque el número que
 * enseñábamos medía lo que no duele. Medido sobre las propias bases:
 *
 *   pasta     20 min de reloj →   3 de estar delante
 *   arroz     29                →   8
 *   patatas   45                →   9
 *   legumbre  549               →  19   (el resto es remojo y hervor)
 *
 * Una semana entera de tandas ahorra ~66 minutos de reloj y ~6 de atención.
 * "No tengo tiempo" nunca significó que el reloj corriera: significa que no
 * puedes estar ahí. Por eso las listas de batch cooking de verdad están
 * llenas de sofritos y bandejas de verdura y no de ollas de arroz.
 *
 * Se deriva de los pasos de la propia base (`kind`), no de un campo nuevo a
 * mano: el dato ya existe en las 985 recetas con `stepsRich`.
 * @returns {number} entre 0 y 1; 1 si la base no tiene pasos que mirar.
 */
export function fraccionActiva(base) {
  const pasos = base?.stepsRich ?? [];
  let activos = 0;
  let total = 0;
  for (const paso of pasos) {
    const min = Number(paso?.minutes) || 0;
    total += min;
    // `prep` cuenta como activo: picar es lo que mas cansa de una base.
    if (paso?.kind === "activo" || paso?.kind === "prep") activos += min;
  }
  return total > 0 ? activos / total : 1;
}

export function tiempoDeBase(base, raciones) {
  const porPlato = (Array.isArray(raciones) ? raciones : [raciones])
    .map((n) => Math.max(0, Math.floor(Number(n) || 0)))
    .filter((n) => n > 0);
  const total = porPlato.reduce((s, n) => s + n, 0);
  if (!base || total === 0) return { tandas: 0, minutos: 0, minutosSueltos: 0, ahorro: 0 };

  const fijos = Number(base.minutosFijos) || Number(base.time) || 0;
  const porRacion = Number(base.minutosPorRacion) || 0;
  const capacidad = Math.max(1, Number(base.capacidadMax) || total);

  /** Minutos de cocinar `n` raciones de golpe, partiendo en tandas si no caben. */
  const minutosDe = (n) => {
    const tandas = Math.ceil(n / capacidad);
    let minutos = 0;
    let restantes = n;
    for (let i = 0; i < tandas; i++) {
      const enEsta = Math.min(capacidad, restantes);
      minutos += fijos + enEsta * porRacion;
      restantes -= enEsta;
    }
    return minutos;
  };

  const minutos = minutosDe(total);
  // Suelto: cada plato con su propia olla. Los fijos se pagan una vez POR
  // PLATO, y ahí está el ahorro de verdad.
  const minutosSueltos = porPlato.reduce((s, n) => s + minutosDe(n), 0);

  const ahorro = Math.max(0, Math.round(minutosSueltos - minutos));
  const activa = fraccionActiva(base);
  return {
    tandas: Math.ceil(total / capacidad),
    minutos: Math.round(minutos),
    minutosSueltos: Math.round(minutosSueltos),
    ahorro,
    // Los dos, y el que se le enseña al usuario es `ahorroActivo`. `ahorro`
    // se queda porque también significa algo: es ESPERA que te quitas de
    // encima un martes (no cenas mas tarde por esperar al arroz). Pero no es
    // "tienes una hora mas", y enseñarlo como si lo fuera era mentir.
    ahorroActivo: Math.round(ahorro * activa),
    minutosActivos: Math.round(Math.round(minutos) * activa),
  };
}

/**
 * Cuántos platos tienen que compartir una base para que valga la pena sacarla
 * como tanda aparte.
 *
 * Dos, y no uno: cocinar el arroz de un solo plato no es batch cooking, es
 * cocinar. Proponerlo como "sesión" sería vender como ahorro lo que ya hacías.
 */
export const MIN_PLATOS_POR_BASE = 2;

/**
 * La sesión de batch cooking de una semana: qué bases cocinar, cuántas
 * raciones de cada una, cuánto se tarda y a qué huecos alimenta cada una.
 *
 * @param {object} plan        menuPlan[groupId]["<dia>-<comida>"] = {recipeId, eaters, ...}
 * @param {Map|object} recetasPorId  catálogo indexado por id
 * @param {{dias?: string[], comidas?: string[]}} opts  vocabulario de huecos
 * @returns {{ bases: Array, minutosTotales: number, ahorroTotal: number }}
 *   ordenado por ahorro descendente: lo que más tiempo devuelve, primero.
 */
export function sesionDeBases(plan, recetasPorId, opts = {}) {
  const dias = opts.dias ?? [];
  const comidas = opts.comidas ?? [];
  const claves = dias.flatMap((d) => comidas.map((c) => `${d}-${c}`));
  const get = (id) => (recetasPorId instanceof Map ? recetasPorId.get(id) : recetasPorId?.[id]);

  /** @type {Map<string, {base: object, raciones: number, huecos: Array}>} */
  const porBase = new Map();

  for (const groupId of Object.keys(plan ?? {})) {
    if (groupId.startsWith("_")) continue;
    const slots = plan[groupId];
    if (!slots) continue;

    for (const clave of claves) {
      const slot = slots[clave];
      if (!slot) continue;
      // Un hueco puede llevar primero y segundo: los dos pueden tener base.
      for (const rid of [slot.firstRecipeId, slot.recipeId]) {
        if (!rid) continue;
        const receta = get(catalogIdOfPlanRecipe(rid));
        const eaters = Math.max(1, Number(slot.eaters) || 1);
        // Un plato puede alimentar varias tandas a la vez: su fécula y su
        // sofrito. Contarlo en una sola dejaba la mitad del ahorro fuera.
        for (const base of basesDeReceta(receta)) {
          const entrada = porBase.get(base.id) ?? { base, raciones: 0, huecos: [] };
          entrada.raciones += eaters;
          entrada.huecos.push({ groupId, clave, recipeId: rid, nombre: receta.name, raciones: eaters });
          porBase.set(base.id, entrada);
        }
      }
    }
  }

  const bases = [];
  for (const entrada of porBase.values()) {
    if (entrada.huecos.length < MIN_PLATOS_POR_BASE) continue;
    // Las raciones van plato a plato, no sumadas: es lo que hace que el ahorro
    // se compare contra "una olla por plato" y no contra "una olla por ración".
    const t = tiempoDeBase(entrada.base, entrada.huecos.map((h) => h.raciones));
    bases.push({ ...entrada, ...t });
  }
  // Se ordena por el ahorro ACTIVO, no por el de reloj: lo que mas arriba
  // aparece tiene que ser lo que mas trabajo te quita, no lo que mas tiempo
  // pasa en el fuego. Con el orden viejo, una olla de legumbre (549 min de
  // reloj, 19 tuyos) tapaba a cualquier cosa que de verdad ahorrara manos.
  bases.sort((a, b) => b.ahorroActivo - a.ahorroActivo || b.ahorro - a.ahorro || b.raciones - a.raciones);

  return {
    bases,
    minutosTotales: bases.reduce((s, b) => s + b.minutos, 0),
    minutosActivosTotales: bases.reduce((s, b) => s + b.minutosActivos, 0),
    ahorroTotal: bases.reduce((s, b) => s + b.ahorro, 0),
    ahorroActivoTotal: bases.reduce((s, b) => s + b.ahorroActivo, 0),
  };
}

/**
 * Cuántos platos distintos del catálogo comparten cada base. Es el dato que
 * necesita el generador para SESGAR hacia platos que comparten olla — el eje
 * nuevo del que hablaba el batch cooking, y que no pelea con la variedad:
 * la variedad se mide en platos, el ahorro se mide en bases. Diez platos
 * distintos con tres bases no rompen ninguna regla de validateMenu.js.
 */
export function coberturaDeBases(recetas) {
  const conteo = new Map();
  for (const r of recetas ?? []) {
    for (const base of basesDeReceta(r)) {
      conteo.set(base.id, (conteo.get(base.id) ?? 0) + 1);
    }
  }
  return conteo;
}
