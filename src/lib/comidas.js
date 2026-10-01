/**
 * Las comidas del día: UN solo catálogo.
 *
 * Antes la lista estaba escrita a mano en cinco sitios del bot (FRANJAS en
 * menu.js, COMIDAS en router.js y ajustes.js, los enum de las herramientas en
 * agente.js, EMOJI/ARTICULO en turno.js y rapido.js) y añadir una comida
 * obligaba a acordarse de todos. Ahora se añade aquí y la entienden el
 * enrutador, Lola y pintarMenu (api/_bot/pintar.js); que el motor la
 * planifique es otro trabajo. Una prueba (comidas.test.js) falla si vuelve a
 * aparecer una lista escrita a mano en el bot.
 *
 * Sin dependencias: lo usan la app, el bot y la ficha, que no carga el motor.
 *
 * El `id` es el que va en el plan («Jue-Cena») y no se toca. En una comida o
 * una cena, `firstRecipeId` es el primero y `recipeId` el segundo (o el plato
 * único); el postre es su propia comida (el hueco «Jue-Postre»), no un plato.
 */

export const COMIDAS = [
  {
    id: "Desayuno", letra: "D", nombre: "desayuno", plural: "desayunos", articulo: "el desayuno", icono: "☕",
    sinonimos: ["desayuno", "desayunos", "desayunar", "desayunamos", "desayunan"],
    platos: ["principal"], tipo: "extra",
  },
  {
    id: "Comida", letra: "C", nombre: "comida", plural: "comidas", articulo: "la comida", icono: "🍽️",
    // «comer», «comemos» no: «¿qué comemos hoy?» es el día entero.
    sinonimos: ["comida", "comidas", "almuerzo", "almuerzos", "almorzar", "mediodia", "a mediodia"],
    platos: ["primero", "principal"], tipo: "principal",
  },
  {
    id: "Merienda", letra: "M", nombre: "merienda", plural: "meriendas", articulo: "la merienda", icono: "🥪",
    sinonimos: ["merienda", "meriendas", "merendar", "merendamos", "meriendan"],
    platos: ["principal"], tipo: "extra",
  },
  {
    id: "Cena", letra: "N", nombre: "cena", plural: "cenas", articulo: "la cena", icono: "🌙",
    sinonimos: ["cena", "cenas", "cenar", "cenamos", "cenan", "esta noche", "noche"],
    platos: ["primero", "principal"], tipo: "principal",
  },
  {
    id: "Postre", letra: "P", nombre: "postre", plural: "postres", articulo: "el postre", icono: "🍮",
    sinonimos: ["postre", "postres", "dulce"],
    platos: ["principal"], tipo: "extra",
  },
  // Llegará: el bot ya lo entiende («¿qué hay de picoteo?»), aunque el motor
  // aún no lo planifique. pintarMenu dice que no se planifica y ofrece añadirlo.
  {
    id: "Aperitivo", letra: "A", nombre: "aperitivo", plural: "aperitivos", articulo: "el aperitivo", icono: "🫒",
    sinonimos: ["aperitivo", "aperitivos", "picoteo", "picar", "tapa", "tapas", "vermu"],
    platos: ["principal"], tipo: "futuro",
  },
];

/** Los platos de una comida, y dónde están en el hueco del plan. */
export const PLATOS = [
  { id: "primero", nombre: "primero", plural: "primeros", campo: "firstRecipeId", sinonimos: ["primero", "primeros", "entrante", "entrantes"] },
  { id: "principal", nombre: "segundo", plural: "segundos", campo: "recipeId", sinonimos: ["segundo", "segundos", "principal", "plato principal", "plato unico"] },
];

export const IDS_COMIDAS = COMIDAS.map((c) => c.id);
/** Las que el motor sabe planificar hoy. */
export const COMIDAS_PLANIFICABLES = COMIDAS.filter((c) => c.tipo !== "futuro").map((c) => c.id);
/** Comida y cena: las que van en `data.meals`. */
export const COMIDAS_PRINCIPALES = COMIDAS.filter((c) => c.tipo === "principal").map((c) => c.id);
export const IDS_PLATOS = PLATOS.map((p) => p.id);

const POR_ID = new Map(COMIDAS.map((c) => [c.id, c]));
export const comida = (id) => POR_ID.get(id) ?? null;
export const iconoDe = (id) => POR_ID.get(id)?.icono ?? "🍽️";
export const articuloDe = (id) => POR_ID.get(id)?.articulo ?? (id ? `la ${String(id).toLowerCase()}` : "la comida");

const normal = (s) => String(s ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();

/** De cualquier forma de decirlo al id: «almuerzo» → "Comida", «picoteo» → "Aperitivo". Null si no es una comida. */
export function comidaDe(texto) {
  const t = normal(texto);
  if (!t) return null;
  return COMIDAS.find((c) => normal(c.id) === t || c.sinonimos.some((s) => normal(s) === t))?.id ?? null;
}

/**
 * Las comidas que se nombran en una frase («¿qué cenamos este finde?» →
 * ["Cena"]), en el orden del día. Sinónimos de una y dos palabras. Pura.
 */
export function comidasEnTexto(texto) {
  const palabras = normal(texto).replace(/[¿?¡!.,;:]/g, " ").split(/\s+/).filter(Boolean);
  const vistas = new Set();
  palabras.forEach((p, i) => {
    const una = comidaDe(p);
    const dos = i + 1 < palabras.length ? comidaDe(`${p} ${palabras[i + 1]}`) : null;
    if (dos) vistas.add(dos);
    else if (una) vistas.add(una);
  });
  return COMIDAS.map((c) => c.id).filter((id) => vistas.has(id));
}

/** «primeros» → "primero", «segundo» → "principal". */
export function platoDe(texto) {
  const t = normal(texto);
  return PLATOS.find((p) => p.id === t || p.sinonimos.some((s) => normal(s) === t))?.id ?? null;
}

/**
 * Las comidas que planifica ESTA casa, en el orden del día: comida y cena de
 * `data.meals`, y desayuno, merienda y postre de `data.extraMeals` (cada uno
 * con su modo; "off" es que no). Sale de sus datos, no de una lista fija.
 */
export function comidasDeLaCasa(data) {
  const principales = Array.isArray(data?.meals) && data.meals.length ? data.meals : COMIDAS_PRINCIPALES;
  const extras = data?.extraMeals ?? {};
  return COMIDAS.filter((c) => {
    if (c.tipo === "principal") return principales.includes(c.id);
    if (c.tipo === "extra") return Boolean(extras[c.nombre]) && extras[c.nombre] !== "off";
    return false;
  }).map((c) => c.id);
}
