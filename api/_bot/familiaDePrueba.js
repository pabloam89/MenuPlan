/**
 * Solo para los tests: lo que contestaría personas_de_casa (0108) para unos comensales en la forma de
 * data.members / data.groups. Desde el corte del trozo 10 (#1037) la casa de Lola lee la familia de ahí, no del
 * documento: un test que monta la casa con una base de mentira tiene que contestar también esta lectura.
 * La conversión es la de verdad (filaDeMiembro), así que lo que vuelve por membersDeFilas es lo que se puso.
 */
import { filaDeMiembro } from "../../src/lib/personas.js";
import { CAMPOS_CASA_CON_SOBRE, CAMPOS_CON_AMBITO_CON_SOBRE } from "../../src/lib/estadoDeDato.js";
import { REGISTRO_CAMPOS } from "../../src/lib/registroCampos.js";
import { DATOS_CASA } from "../../src/lib/registroFicha.js";

// De personas.js y no de datos.js: datos.js importa db.js, que los tests sustituyen (vi.mock) y aún no existe aquí.
export { RPC_FAMILIA } from "../../src/lib/personas.js";

/** ficha_casa (0097, v2 desde la 0107): desde el trozo 12 (#1037) la casa de Lola lee de ahí los datos de la casa con sobre. */
export const RPC_FICHA = "ficha_casa";
/** Lo que la ficha trae además de «fichas», para una casa sin tareas. */
export const FICHA_SIN_TAREAS = Object.freeze({ casa: { rev: 1 }, personas: [], faltan: [], tareas: [], callados: [] });

/** Un dato de «fichas» de la casa sin sobre: el defecto del registro, o vacío si no tiene. La base de un campo con ámbito, `ambito: null`. */
const sinSobre = (campo) => {
  const defecto = REGISTRO_CAMPOS[campo].defecto ?? null;
  return {
    campo, sujeto: { tipo: "casa", id: null }, estado: defecto == null ? "vacio" : "por_defecto", valor: defecto, origen: null,
    bloqueado: false, peso: null, confirmado_el: null, caduca_at: null, cambiado_at: null, dicho_por: null, canal: null, operacion_id: null,
    ...(CAMPOS_CON_AMBITO_CON_SOBRE.includes(campo) ? { ambito: null } : {}),
  };
};

/**
 * Lo que contestaría ficha_casa v2 con la 0112 a la 0116 aplicadas: todos los datos con sobre de las fichas Casa y
 * Rutina, cada uno en su ficha. Los `elementos` que se pasan sustituyen al de su campo (los sin ámbito) o se suman
 * (los huecos, con `ambito`); el resto, sin sobre.
 */
export const fichaDePrueba = (...elementos) => {
  const sustituye = (e) => e.ambito == null;
  const dados = new Set(elementos.filter(sustituye).map((e) => e.campo));
  const todos = [...[...CAMPOS_CASA_CON_SOBRE, ...CAMPOS_CON_AMBITO_CON_SOBRE].filter((c) => !dados.has(c)).map(sinSobre), ...elementos];
  const fichas = {};
  for (const e of todos) (fichas[DATOS_CASA[e.campo].ficha] ??= []).push(e);
  return { ...FICHA_SIN_TAREAS, v: 2, fichas };
};

/**
 * Lo que contestaría preferencias_de_casa (0109) para una casa sin preferencias: desde el trozo 14 (#1037) la casa
 * de Lola lee de ahí la libreta. `preferencias`, filas como las de la tabla.
 */
export { RPC_LEER_PREFERENCIAS as RPC_PREFERENCIAS_DE_CASA } from "../../src/lib/operaciones/tuberia.js";
export const preferenciasDeFilas = (preferencias = []) => ({ v: 1, rev: 1, preferencias, planes: [] });

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
