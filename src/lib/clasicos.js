/**
 * Los clásicos de casa: los platos que una familia pone sí o sí (macarrones con
 * tomate, lentejas, tortilla…). Se eligen en el paso «¿Qué no puede
 * faltar?» de la hoja de arranque de la pizarra y caen solos en la semana.
 *
 * Qué receta es clásica, y en qué orden, lo dice la lista curada
 * (data/clasicos.js): este módulo solo los agrupa en pestañas y decide en qué
 * hueco va cada uno. Puro: sin React ni base.
 */
import { CLASICOS } from "../data/clasicos.js";
import { papelesDelHueco, tipoDeComida } from "./dias.js";
import { sinTildes } from "./alergiasBase.js";

/**
 * Las pestañas del paso, en orden, y qué categorías del catálogo recoge cada
 * una. Vocabulario cerrado: clasicos.test.js falla si un clásico no cae en
 * ninguna.
 */
export const PESTANAS_CLASICOS = Object.freeze([
  { id: "legumbres", titulo: "Legumbres", categorias: ["legumbres"] },
  { id: "pasta", titulo: "Pasta y arroz", categorias: ["pasta_arroces"] },
  { id: "carne", titulo: "Carne", categorias: ["carnes"] },
  { id: "pescado", titulo: "Pescado", categorias: ["pescados"] },
  { id: "verdura", titulo: "Verdura y huevos", categorias: ["huevos", "ensaladas_verduras"] },
  { id: "cenas", titulo: "Cremas y cenas", categorias: ["sopas_cremas", "platos_unicos"] },
]);

/**
 * Pura. Los clásicos, por pestaña y en el orden de la lista. `porId`: el
 * catálogo por id (recipeCatalogById); que cada id esté lo vigila
 * data/clasicos.test.js.
 */
export function clasicosPorPestana(porId) {
  const clasicos = CLASICOS.map((id) => porId?.[id]).filter(Boolean);
  return PESTANAS_CLASICOS.map((p) => ({
    ...p,
    recetas: clasicos.filter((r) => p.categorias.includes(r.category)),
  }));
}

/**
 * Pura. Los clásicos cuyo nombre lleva todas las palabras de `texto`, sin
 * mirar tildes ni mayúsculas («lentejas chorizo» da «Lentejas con chorizo»), en
 * el orden de las pestañas. Es el buscador del paso: encuentra un plato sin ir
 * pestaña a pestaña. Sin texto, ninguno: entonces mandan las pestañas.
 *
 * @param {{ recetas: { name: string }[] }[]} pestanas  las de clasicosPorPestana
 * @param {string} texto  lo escrito
 */
export function buscarClasicos(pestanas, texto) {
  const palabras = sinTildes(texto).split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return [];
  return pestanas
    .flatMap((p) => p.recetas)
    .filter((r) => {
      const nombre = sinTildes(r.name);
      return palabras.every((w) => nombre.includes(w));
    });
}

/**
 * Pura. Las plazas libres de un tablero, en el orden de la semana: cada hueco
 * vacío con los papeles (`mealRole`) que admite, de `papelesDelHueco`
 * (dias.js), la misma tabla que «Cambiar plato». Aquí una comida es partida si
 * el hueco lo dice (`dosPlatos`), aunque aún no tenga primero.
 *
 * @param {Record<string, object>} huecos  los huecos de UN grupo, por `${día}-${comida}`
 * @param {string[]} dias    los días, en orden
 * @param {string[]} comidas las comidas del día, en orden
 * @returns {{ day: string, meal: string, course: "first"|"main", papeles: string[] }[]}
 */
export function plazasLibres(huecos, dias, comidas) {
  const plazas = [];
  for (const day of dias) {
    for (const meal of comidas) {
      const hueco = huecos?.[`${day}-${meal}`];
      if (!hueco) continue;
      const partida = tipoDeComida(meal) !== "cena" && Boolean(hueco.dosPlatos);
      if (partida && !hueco.firstRecipeId) plazas.push({ day, meal, course: "first", papeles: papelesDelHueco({ meal, course: "first" }) });
      if (!hueco.recipeId) plazas.push({ day, meal, course: "main", papeles: papelesDelHueco({ meal, partida }) });
    }
  }
  return plazas;
}

/**
 * Pura. En qué plaza va cada clásico elegido: una vez cada uno, repartidos por
 * la semana (el día con menos clásicos primero; a igualdad, el más temprano, y
 * la comida antes que la cena porque `plazas` va en ese orden).
 *
 * Primero se colocan los que caben en menos sitios: la ensaladilla solo cabe de
 * primero, y si los filetes llegaran antes podrían quitarle la única comida
 * partida que hay.
 *
 * Lo que no cabe por su papel va, en una segunda vuelta, a cualquier plato
 * principal que quede libre: lo has pedido tú, y el papel del catálogo es más
 * estrecho que la vida (los filetes empanados son `segundo`, y en una casa que
 * come a plato único se cenan igual). Al primer plato de una comida partida no:
 * unos filetes de primero no los pone nadie. Solo si no queda hueco, `sinSitio`.
 *
 * @param {{ id: string, mealRole?: string[] }[]} recetas  las elegidas
 * @param {ReturnType<typeof plazasLibres>} plazas
 * @returns {{ colocados: { recetaId: string, day: string, meal: string, course: string }[], sinSitio: string[] }}
 */
export function repartirClasicos(recetas, plazas) {
  const cabe = (r, p) => (r.mealRole ?? []).some((papel) => p.papeles.includes(papel));
  const ordenadas = (recetas ?? [])
    .map((r, i) => ({ r, i, sitios: plazas.filter((p) => cabe(r, p)).length }))
    .sort((a, b) => a.sitios - b.sitios || a.i - b.i);

  const libres = [...plazas];
  const porDia = new Map();
  const colocados = [];
  const poner = (r, vale) => {
    let mejor = -1;
    for (let k = 0; k < libres.length; k++) {
      if (!vale(libres[k])) continue;
      if (mejor === -1 || (porDia.get(libres[k].day) ?? 0) < (porDia.get(libres[mejor].day) ?? 0)) mejor = k;
    }
    if (mejor === -1) return false;
    const [p] = libres.splice(mejor, 1);
    porDia.set(p.day, (porDia.get(p.day) ?? 0) + 1);
    colocados.push({ recetaId: r.id, day: p.day, meal: p.meal, course: p.course });
    return true;
  };
  const sinPapel = ordenadas.filter(({ r }) => !poner(r, (p) => cabe(r, p)));
  const sinSitio = sinPapel.filter(({ r }) => !poner(r, (p) => p.course === "main")).map(({ r }) => r.id);
  return { colocados, sinSitio };
}

const SIN_HUECO = "no queda hueco libre en la semana";

/** «A», «A» y «B», «A», «B» y «C». */
function enLista(nombres) {
  const q = nombres.map((n) => `«${n}»`);
  return q.length <= 1 ? q.join("") : `${q.slice(0, -1).join(", ")} y ${q[q.length - 1]}`;
}

/**
 * Pura. El aviso de los clásicos elegidos que no han entrado en la semana,
 * con su nombre y su porqué: antes, con dos o más, solo decía cuántos («2
 * clásicos no se pudieron poner»), y Pablo no supo por qué (10 nov 2026).
 * Los que comparten porqué van juntos, para que quepa en las dos líneas del
 * aviso. `porque` null es que no quedaba hueco libre.
 *
 * @param {{ nombre: string, porque: string|null }[]} perdidos
 * @returns {string|null}  null si no se ha perdido ninguno
 */
export function avisoDeClasicosPerdidos(perdidos) {
  if (!perdidos?.length) return null;
  const grupos = new Map();
  for (const { nombre, porque } of perdidos) {
    const clave = porque ?? SIN_HUECO;
    grupos.set(clave, [...(grupos.get(clave) ?? []), nombre]);
  }
  return [...grupos]
    .map(([porque, nombres]) => `${enLista(nombres)} no ${nombres.length === 1 ? "entra" : "entran"}: ${porque}`)
    .join(". ");
}
