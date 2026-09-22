/**
 * Casas aleatorias para bancos de pruebas del motor (solver.stress.test.js,
 * solver.vs.modelo.test.js). No lo importa la app.
 *
 * Genera el mismo `data` que produce la app tras el onboarding y la libreta,
 * INCLUIDA la proyección que hace App.jsx antes de generar (freqsByGroup con
 * holgura y objetivoByGroup exacto), para que lo que se mide sea lo que un
 * usuario real dispararía. Determinista: misma semilla, mismas casas.
 */

import { weeklySlotBudget, DAYS } from "./planner.js";
import { freqsEfectivos, presupuestoDeTopes, mover, repartoPorDefecto } from "./reparto.js";
import { FAMILIAS } from "./notepadFields.js";
import { COCINAS } from "../data/recipeSchema.js";

/** mulberry32: un PRNG pequeño y reproducible. */
export function rng(semilla) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ALERGIAS = ["Gluten", "Leche", "Huevos", "Pescado", "Crustáceos", "Frutos de cáscara", "Moluscos", "Soja"];
const INTOLERANCIAS = ["lactosa_fina", "fructosa", "sorbitol", "vegano"];
const PERFILES = ["glucemico", "corazon", "bajo_sodio", "reflux", "anemia"];
const HERRAMIENTAS = ["Horno", "Batidora", "Olla exprés", "Freidora de aire", "Microondas", "Robot de cocina"];
// Subconjunto del enum canónico, no una lista propia: las cinco que una casa
// de prueba pide con más frecuencia. Se filtra contra COCINAS para que un valor
// renombrado en el esquema no se quede aquí colgado en silencio; el test de
// casasAleatorias comprueba que las cinco siguen existiendo.
export const COCINAS_DEMO = COCINAS.filter((c) => ["italiana", "asiatica", "mexicana", "arabe", "india"].includes(c));
const DISLIKES = ["coliflor", "brócoli", "hígado", "espinacas", "setas", "berenjena", "pimiento"];
const MEALS_OPCIONES = [["Comida", "Cena"], ["Comida", "Cena"], ["Comida", "Cena"], ["Comida"], ["Cena"]];

const elige = (r, xs) => xs[Math.floor(r() * xs.length)];
const entre = (r, a, b) => a + Math.floor(r() * (b - a + 1));
const azar = (r, p) => r() < p;
const muestra = (r, xs, n) => {
  const copia = [...xs];
  const out = [];
  for (let i = 0; i < n && copia.length; i++) out.push(copia.splice(Math.floor(r() * copia.length), 1)[0]);
  return out;
};

/**
 * Una casa. `nivel` sube la dureza: 0 = casas normales; 1 = con alergias y
 * horarios; 2 = todo a la vez y tiempos cortos.
 */
export function casaAleatoria(semilla, { nivel = null } = {}) {
  const r = rng(semilla);
  const dureza = nivel ?? elige(r, [0, 0, 1, 1, 2]);

  // Miembros: 1–5, con niños a veces (los bebés <2 van a su planificador).
  const nMiembros = entre(r, 1, 5);
  const members = [];
  for (let i = 0; i < nMiembros; i++) {
    const esNino = i > 0 && azar(r, 0.35);
    const m = { id: `m${i + 1}`, age: esNino ? entre(r, 1, 12) : entre(r, 22, 75) };
    if (azar(r, dureza === 0 ? 0.15 : dureza === 1 ? 0.4 : 0.6)) m.allergies = muestra(r, ALERGIAS, entre(r, 1, dureza === 2 ? 3 : 2));
    if (azar(r, dureza === 0 ? 0.05 : 0.2)) m.intolerances = muestra(r, INTOLERANCIAS, 1);
    if (azar(r, 0.2)) m.healthProfiles = muestra(r, PERFILES, entre(r, 1, 2));
    if (azar(r, 0.25)) m.dislikes = muestra(r, DISLIKES, entre(r, 1, 2));
    members.push(m);
  }

  // Grupos: casi siempre uno; a veces adultos + niños.
  const ninos = members.filter((m) => m.age < 13);
  const adultos = members.filter((m) => m.age >= 13);
  const groups = ninos.length > 0 && adultos.length > 0 && azar(r, 0.5)
    ? [
      { id: "g_adultos", label: "Adultos", memberIds: adultos.map((m) => m.id) },
      { id: "g_ninos", label: "Niños", memberIds: ninos.map((m) => m.id) },
    ]
    : [{ id: "g1", label: "Casa", memberIds: members.map((m) => m.id) }];

  // Horario: fuera / tupper / cole por miembro y hueco.
  const meals = elige(r, MEALS_OPCIONES);
  const schedule = {};
  const pFuera = dureza === 0 ? 0.08 : 0.2;
  for (const m of members) {
    for (const d of DAYS) {
      for (const meal of meals) {
        if (azar(r, pFuera)) schedule[`${m.id}|${d}|${meal}`] = elige(r, ["fuera", "fuera", "tupper", m.age < 13 ? "cole" : "off"]);
      }
    }
  }

  // Tipo de hueco: plato único y cena rápida a mano.
  const slotType = {};
  for (const d of DAYS) {
    if (meals.includes("Comida") && azar(r, 0.12)) slotType[`${d}|Comida`] = "unico";
    if (meals.includes("Cena") && azar(r, 0.15)) slotType[`${d}|Cena`] = "rapida";
  }

  // Reparto: el default movido unas veces, para que no todas las casas sean
  // la misma.
  let reparto = repartoPorDefecto();
  for (let k = entre(r, 0, 3); k > 0; k--) reparto = mover(reparto, elige(r, FAMILIAS), entre(r, 5, 40));
  const freqsPedidos = {};
  if (azar(r, 0.2)) freqsPedidos[elige(r, FAMILIAS)] = entre(r, 1, 4);

  const data = {
    members,
    groups,
    meals,
    schedule,
    slotType,
    mealStructure: azar(r, 0.15) ? "1_plato" : "primero_segundo",
    cookLevel: elige(r, dureza === 2 ? ["basic", "basic", "normal"] : ["basic", "normal", "normal", "pro"]),
    timeWeekday: dureza === 2 ? entre(r, 15, 35) : entre(r, 25, 60),
    timeWeekend: dureza === 2 ? entre(r, 25, 60) : entre(r, 40, 120),
    kitchenTools: muestra(r, HERRAMIENTAS, entre(r, 1, HERRAMIENTAS.length)),
    reparto,
    freqsPedidos,
    dislikes: azar(r, 0.3) ? muestra(r, DISLIKES, entre(r, 1, 3)) : [],
    cocinas: azar(r, 0.2) ? Object.fromEntries(muestra(r, COCINAS_DEMO, entre(r, 1, 2)).map((c) => [c, entre(r, 1, 2)])) : null,
    kidDinnerMatchesAdultLunch: azar(r, 0.5),
    _semilla: semilla,
    _dureza: dureza,
  };

  // La misma proyección que hace App.jsx justo antes de generar.
  data.freqsByGroup = {};
  data.objetivoByGroup = {};
  for (const g of groups) {
    const huecos = weeklySlotBudget(data, g).total;
    const ejes = { freqs: freqsPedidos, reparto };
    data.objetivoByGroup[g.id] = freqsEfectivos(ejes, { presupuesto: huecos });
    data.freqsByGroup[g.id] = freqsEfectivos(ejes, { presupuesto: presupuestoDeTopes(huecos) });
  }
  return data;
}

/** Semanas cruzadas como las manda App.jsx cuando hay más de una. */
export function crossWeekAleatorio(semilla) {
  const r = rng(semilla ^ 0x9e3779b9);
  const weekCount = elige(r, [1, 1, 1, 2, 3, 4]);
  if (weekCount === 1) return null;
  return { weekIndex: Math.floor(r() * weekCount), weekCount, varietyPref: "strict" };
}
