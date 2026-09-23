/**
 * Lo que un plato puede tener YA hecho de la tanda, pieza a pieza.
 *
 * ── Tres clases de pieza, las mismas tres patas de la sesión ──────────────
 *   base      un ingrediente hecho aparte: el sofrito, la legumbre cocida.
 *             Varias por plato (unas lentejas con arroz llevan dos).
 *   semi      el plato mismo, a medio hacer: las croquetas formadas, la lasaña
 *             montada. Solo queda el último acto (lib/adelanto.js).
 *   cocinado  el plato mismo, hecho entero: la crema, la sopa. Solo calentar.
 *
 * La ficha pregunta por cada pieza por separado —es normal tener el sofrito y
 * no el arroz—, y la receta se acorta solo con lo que dices tener.
 *
 * ── El plato hecho se come a sus bases ────────────────────────────────────
 * Si la lasaña está montada, su bechamel y su boloñesa ya están dentro: no
 * tiene sentido preguntar por ellas ni restar sus pasos otra vez. Así que
 * cuando la pieza del plato está marcada, las bases quedan "incluidas" y la
 * receta que sale es la del plato (el remate, o calentar), no la de las bases.
 */

import { recetaConBases } from "./recetaConBases.js";
import { partirReceta } from "./adelanto.js";
import { familiasPlato } from "./tandaFamilias.js";

let porReceta = null;

/** La familia de plato (semi o cocinado) de una receta del catálogo, o null. */
export function familiaDeReceta(id) {
  if (!id) return null;
  if (!porReceta) {
    porReceta = new Map();
    for (const f of familiasPlato()) for (const rid of f.recetas) porReceta.set(rid, f);
  }
  return porReceta.get(String(id).split("__").pop()) ?? null;
}

/** Los fríos no se calientan: una crema fría o un gazpacho se sirven tal cual. */
const FRIO = /gazpacho|salmorejo|ajoblanco|fr[ií]a/i;

/** Los pasos de un plato hecho entero: sacarlo, calentarlo y lo que se emplata. */
function pasosDeCocinado(receta, familia) {
  const emplatado = (receta?.stepsRich ?? []).filter((p) => p?.kind === "emplatado");
  const frio = familia?.id === "gazpacho" || FRIO.test(receta?.name ?? "");
  const calentar = frio
    ? [{ text: "Sacar la ración de la nevera y removerla bien: en reposo se separa.", minutes: 1, kind: "prep", deReactivacion: true }]
    : [
      { text: "Sacar la ración de la nevera y pasarla a un cazo.", minutes: 1, kind: "prep", deReactivacion: true },
      { text: "Calentar a fuego medio, removiendo, hasta que humee. Si ha espesado en la nevera, un chorrito de agua o de caldo.", minutes: 6, kind: "activo", deReactivacion: true },
    ];
  return [...calentar, ...emplatado];
}

const suma = (pasos, soloManos = false) => pasos.reduce(
  (s, p) => s + (!soloManos || p?.kind === "activo" || p?.kind === "prep" ? Number(p?.minutes) || 0 : 0),
  0,
);

/**
 * Las piezas de la tanda que tiene este plato, en el orden en que la ficha
 * las pregunta: el plato primero (si se puede dejar hecho) y luego sus bases.
 *
 * @param {object} receta        la receta tal cual la pinta la ficha
 * @param {object} [delCatalogo] la del catálogo, que es la que trae `adelanto`
 * @returns {Array<{clave: string, tipo: "base"|"semi"|"cocinado", nombre: string, familia?: object}>}
 */
export function componentesDeTanda(receta, delCatalogo = receta) {
  const out = [];
  const familia = familiaDeReceta(delCatalogo?.id ?? receta?.id);
  if (familia?.tipo === "semi" && partirReceta(delCatalogo)) {
    out.push({ clave: `plato:${familia.id}`, tipo: "semi", nombre: familia.etiqueta, familia });
  } else if (familia?.tipo === "cocinado") {
    out.push({ clave: `plato:${familia.id}`, tipo: "cocinado", nombre: familia.etiqueta, familia });
  }
  for (const b of recetaConBases(receta).bases) {
    out.push({ clave: b.clave, tipo: "base", nombre: b.nombre });
  }
  return out;
}

/**
 * La receta vista con lo que SÍ tienes hecho.
 *
 * @param {object} receta
 * @param {object} delCatalogo
 * @param {Iterable<string>} faltan  las claves que has dicho que NO tienes
 * @returns {{
 *   aplicada: boolean, platoHecho: boolean, incluidas: Set<string>,
 *   pasos: object[], ingredientes: object[], minutos: number, minutosActivos: number,
 * }}
 */
export function vistaConTanda(receta, delCatalogo, faltan = []) {
  const no = new Set(faltan);
  const piezas = componentesDeTanda(receta, delCatalogo);
  const plato = piezas.find((p) => p.tipo !== "base");
  const bases = piezas.filter((p) => p.tipo === "base");

  if (plato && !no.has(plato.clave)) {
    const pasos = plato.tipo === "semi"
      ? partirReceta(delCatalogo).despues
      : pasosDeCocinado(delCatalogo ?? receta, plato.familia);
    return {
      aplicada: true,
      platoHecho: true,
      incluidas: new Set(bases.map((b) => b.clave)),
      pasos,
      // Con el plato hecho no hay nada que pesar: todo lo que lleva ya está
      // dentro. Se marcan todos como de la tanda para que la ficha lo diga.
      ingredientes: (receta?.ingredients ?? []).map((i) => ({ ...i, deBase: plato.clave })),
      minutos: suma(pasos),
      minutosActivos: suma(pasos, true),
    };
  }

  const listas = bases.map((b) => b.clave).filter((c) => !no.has(c));
  const v = recetaConBases(receta, listas);
  return { ...v, platoHecho: false, incluidas: new Set() };
}
