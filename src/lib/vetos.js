/**
 * Los vetos: «no me pongas X». UNA fuente, calculada al leer, y UN comparador.
 *
 * ── Por qué existe ──────────────────────────────────────────────────────────
 * Hasta el 8 oct 2026 lo mismo vivía en seis sitios y se comparaba de tres
 * maneras: filterRecipes por substring («pollo» se llevaba el repollo), el
 * planner local por nombre y etiquetas y sin mirar la libreta, y excluirHueco
 * con frontera de palabra. Settings, el resumen del perfil, recipeIntents y
 * medio bot no veían lo dicho en la libreta, y lo que sí lo veía leía
 * `data.excluidos`: una proyección GUARDADA, sin fecha, que se quedaba con lo
 * caducado.
 *
 * ── De dónde salen ─────────────────────────────────────────────────────────
 *   · La libreta (`data.notepad`, claves `excluidos.<x>`): la fuente de verdad
 *     de la casa. Solo lo DICHO veta; lo visto o supuesto solo sesga
 *     (`proyectar`, lib/notepad.js). Se proyecta aquí, al leer, con la fecha.
 *   · Las reglas de la casa (`data.excluidosReglas`): el delta de UNA
 *     generación (lib/reglas.js), nunca se guarda.
 *   · `members[].dislikes`: lo de una persona. Hoy solo lo escribe el delta de
 *     las reglas (`sumarDislike`); se lee igual por si alguna casa vieja lo
 *     trae. Alcanza a todo su GRUPO (comparten menú: reglas.js lo avisa).
 *   · `data.dislikes`: herencia; nadie escribe ya un valor de verdad.
 *
 * `data.excluidos` se sigue ESCRIBIENDO (libretaEnData.js) para los clientes
 * con el bundle de antes, pero no lo lee nadie. Fuera de aquí quedan, a
 * propósito: `data.excluirPorHueco` (vetos por día y comida, lib/excluirHueco.js,
 * que usa este mismo comparador), los descartes por id (`discards`) y las
 * alergias, que son seguridad y van por su camino.
 *
 * ── Qué hace un veto ───────────────────────────────────────────────────────
 * En la comida y la cena es DURO: el plato sale del pool (filterRecipes paso
 * 2, y el planner local lo puntúa -Infinity). En desayuno, merienda y postre
 * es BLANDO, con caída para no dejar la franja opcional en blanco
 * (filterOffMenuRecipes). Es la capa «nunca» del modelo de la ficha
 * (seguridad > nunca > coyuntura > …): por debajo de la seguridad, por encima
 * de todo lo demás.
 *
 * Módulo ligero a propósito: la ficha del bot lo importa sin cargar el motor.
 */

import { proyectar } from "./notepad.js";
import { sinTildes } from "./rasgosBusqueda.js";

const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const clave = (s) => sinTildes(String(s ?? "").trim()).replace(/\s+/g, " ");

/** Sin vacíos y sin repetidos (sin mirar tildes ni mayúsculas); gana la primera grafía. */
function unicos(lista) {
  const vistos = new Set();
  const out = [];
  for (const v of lista) {
    if (typeof v !== "string") continue;
    const k = clave(v);
    if (!k || vistos.has(k)) continue;
    vistos.add(k);
    out.push(v.trim());
  }
  return out;
}

/** Lo que una persona no come, tal cual lo tiene apuntado. */
export function vetosDePersona(m) {
  return unicos(m?.dislikes ?? []);
}

/**
 * Los vetos de la casa entera, sin los de cada persona.
 *
 * @param {object} data
 * @param {{ hoy?: string }} [opts] ISO. Sin él vale `data.vigenteEn` (la fecha
 *   de la semana que se genera, la pone prepararSemana); sin ninguno, no se
 *   mira el calendario, como la proyección de siempre.
 */
export function vetosDeCasa(data, { hoy } = {}) {
  const fecha = hoy ?? data?.vigenteEn ?? undefined;
  const libreta = data?.notepad ? proyectar(data.notepad, { hoy: fecha }).excluidos : [];
  return unicos([...libreta, ...(data?.excluidosReglas ?? []), ...(data?.dislikes ?? [])]);
}

/**
 * Los vetos que valen para un grupo, una persona o (sin ninguno) toda la casa:
 * los de la casa más los de cada persona que come de ese menú.
 *
 * @param {object} data
 * @param {{ grupo?: { memberIds: string[] }, persona?: string|object, hoy?: string }} [opts]
 * @returns {string[]} con la grafía con que se apuntaron
 */
export function vetosDe(data, { grupo, persona, hoy } = {}) {
  let gente = data?.members ?? [];
  if (grupo) {
    const ids = new Set(grupo.memberIds ?? []);
    gente = gente.filter((m) => ids.has(m.id));
  }
  if (persona) {
    const id = typeof persona === "string" ? persona : persona.id;
    gente = gente.filter((m) => m.id === id);
  }
  return unicos([...vetosDeCasa(data, { hoy }), ...gente.flatMap(vetosDePersona)]);
}

const patrones = new Map();

/**
 * El patrón de un veto: palabra entera, sin tildes ni mayúsculas, y con su
 * plural o su singular («patata» ↔ «patatas», «limón» ↔ «limones»). La
 * frontera va a los DOS lados: «pollo» no es «repollo» y «pan» no es
 * «panceta». No sabe de plurales irregulares («nuez» ↔ «nueces»).
 */
function patronDe(veto) {
  const k = clave(veto);
  if (!k) return null;
  if (patrones.has(k)) return patrones.get(k);
  const raices = new Set([k]);
  if (k.length > 4 && k.endsWith("es")) raices.add(k.slice(0, -2));
  if (k.length > 3 && k.endsWith("s")) raices.add(k.slice(0, -1));
  const re = new RegExp(`\\b(?:${[...raices].map(escapar).join("|")})(?:es|s)?\\b`);
  patrones.set(k, re);
  return re;
}

/**
 * ¿Choca el plato con algún veto? Devuelve el primero con el que choca, o null.
 *
 * Mira el NOMBRE del plato y los de sus ingredientes. Las etiquetas no: son
 * clasificación («pescado», «rápido», «guiso»), no lo que lleva el plato, y
 * un veto de grupo entero ya tiene su forma explícita («grupo:pescado» en
 * lib/excluirHueco.js).
 */
export function platoVetado(receta, vetos = []) {
  if (!receta || !vetos?.length) return null;
  const textos = [receta.name, ...(receta.ingredients ?? []).map((i) => i?.name ?? i)]
    .filter((t) => typeof t === "string")
    .map(clave);
  for (const v of vetos) {
    const re = patronDe(v);
    if (re && textos.some((t) => re.test(t))) return v;
  }
  return null;
}
