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

/** mainBase → receta de base. La clave del emparejamiento es `mainBase`. */
const BASE_POR_MAIN_BASE = new Map(BASES.map((b) => [b.mainBase, b]));

/** La base de una receta, o null si ese plato no puede aprovechar ninguna. */
export function baseDeReceta(receta) {
  if (!receta?.mainBase) return null;
  // Lo que no está marcado "aparte" no entra: ver la nota sobre el riesgo
  // asimétrico en la cabecera.
  if (receta.baseMode !== "aparte") return null;
  return BASE_POR_MAIN_BASE.get(receta.mainBase) ?? null;
}

/** ¿Este plato aprovecha una base ya cocinada? */
export function usaBase(receta) {
  return baseDeReceta(receta) !== null;
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

  return {
    tandas: Math.ceil(total / capacidad),
    minutos: Math.round(minutos),
    minutosSueltos: Math.round(minutosSueltos),
    ahorro: Math.max(0, Math.round(minutosSueltos - minutos)),
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
        const base = baseDeReceta(receta);
        if (!base) continue;

        const eaters = Math.max(1, Number(slot.eaters) || 1);
        const entrada = porBase.get(base.id) ?? { base, raciones: 0, huecos: [] };
        entrada.raciones += eaters;
        entrada.huecos.push({ groupId, clave, recipeId: rid, nombre: receta.name, raciones: eaters });
        porBase.set(base.id, entrada);
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
  bases.sort((a, b) => b.ahorro - a.ahorro || b.raciones - a.raciones);

  return {
    bases,
    minutosTotales: bases.reduce((s, b) => s + b.minutos, 0),
    ahorroTotal: bases.reduce((s, b) => s + b.ahorro, 0),
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
    const base = baseDeReceta(r);
    if (!base) continue;
    conteo.set(base.id, (conteo.get(base.id) ?? 0) + 1);
  }
  return conteo;
}
