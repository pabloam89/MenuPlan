/**
 * Solo para los tests: lo que contestaría personas_de_casa (0108) para unos comensales en la forma de
 * data.members / data.groups. Desde el corte del trozo 10 (#1037) la casa de Lola lee la familia de ahí, no del
 * documento: un test que monta la casa con una base de mentira tiene que contestar también esta lectura.
 * La conversión es la de verdad (filaDeMiembro), así que lo que vuelve por membersDeFilas es lo que se puso.
 */
import { filaDeMiembro } from "../../src/lib/personas.js";

// De personas.js y no de datos.js: datos.js importa db.js, que los tests sustituyen (vi.mock) y aún no existe aquí.
export { RPC_FAMILIA } from "../../src/lib/personas.js";

/**
 * Lo que contestaría ficha_casa (0097) con la v1, sin el estado de cada dato: desde el trozo 12 (#1037) la casa de
 * Lola lee de ahí los datos de la casa con sobre, y con la v1 siguen en el documento, como antes.
 */
export const RPC_FICHA = "ficha_casa";
export const fichaV1 = () => ({ v: 1, casa: { rev: 1 }, personas: [], faltan: [], tareas: [], callados: [] });

/**
 * @param {object[]} members  comensales, como en data.members
 * @param {object[]} groups   grupos, como en data.groups
 */
export const familiaDeFilas = (members = [], groups = []) => ({
  v: 1,
  rev: 1,
  personas: members.map((m, orden) => ({ id: m.id, ...filaDeMiembro(m), orden })),
  grupos: groups.map((g, orden) => ({
    id: g.id, nombre: g.label ?? "", tipo: g.tipo ?? null, color: g.color ?? null, orden, personas: g.memberIds ?? [],
  })),
});
