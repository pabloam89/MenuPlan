/**
 * Los campos de la ficha con fila en `registro_campo` (modelo de la ficha, spec
 * v17; tabla de la 0097): una PROYECCIÓN del registro de la ficha
 * (registroFicha.js), que es donde vive cada dato con todas sus columnas. Un
 * dato entra aquí si lleva `campo`, y sus columnas salen de las suyas; la
 * tabla se rellena desde este objeto y registroCampos.test.js compara las dos.
 *
 * Absorbe el antiguo `CAMPOS` de registroTareas.js (política, seguridad,
 * caducidad de la pregunta), que lo sigue exportando con ese nombre.
 *
 * Columnas (las de la 0097 y las del eje de la 0105, en registroFicha.js están
 * explicadas una a una):
 *  - tipo (TIPOS_CAMPO), vocabulario, minimo, maximo, politica (POLITICAS),
 *    seguridad, aplica (APLICA), columna, caduca_dias: tal cual del dato.
 *  - ficha, clase, defecto, suposicion, minimo_para_generar, peso_menu,
 *    escribe y choque (0105): tal cual del dato; las leen ficha_casa v2 y
 *    aplicar_operacion.
 *  - por (POR): si el dato es de cada persona o de la casa entera; es la
 *    entidad del dato, que para un campo solo puede ser una de esas dos.
 *
 * Añadir un campo es poner `campo` (y su política) a un dato del registro y
 * escribir la migración que lo lleve a registro_campo: el test de paridad
 * falla hasta que las dos digan lo mismo.
 *
 * Los vocabularios de salud (alergias, intolerancias, estados) los lleva otra
 * sesión con su catálogo: `alergias` nombra `alergenos` aunque aún no exista.
 */
import { DATOS_CASA, DATOS_PERSONA, TIPOS_CAMPO, POLITICAS, APLICA } from "./registroFicha.js";

export { TIPOS_CAMPO, POLITICAS, APLICA };

/** De quién es un campo: las dos entidades del registro que hoy tienen sobre (CHECK registro_campo_por_vocabulario). */
export const POR = ["persona", "casa"];

const COLUMNAS = [
  "tipo", "vocabulario", "minimo", "maximo", "politica", "seguridad", "por", "aplica", "columna", "caduca_dias",
  "ficha", "clase", "defecto", "suposicion", "minimo_para_generar", "peso_menu", "escribe", "choque",
];

/** La fila de registro_campo de un dato con `campo`; falla alto si al dato le falta algo que la tabla exige. */
function fila(clave, d) {
  if (!POR.includes(d.entidad)) throw new Error(`${clave}: el campo «${d.campo}» es de «${d.entidad}», y registro_campo solo admite ${POR.join(" o ")}`);
  if (!TIPOS_CAMPO.includes(d.tipo)) throw new Error(`${clave}: el campo «${d.campo}» es de tipo «${d.tipo}», que registro_campo no admite`);
  if (!POLITICAS.includes(d.politica)) throw new Error(`${clave}: el campo «${d.campo}» no dice su política de pregunta`);
  return Object.fromEntries(COLUMNAS.map((c) => [c, c === "por" ? d.entidad : d[c]]));
}

export const REGISTRO_CAMPOS = Object.freeze(Object.fromEntries(
  // La persona primero: así los preguntables quedan en el orden del CHECK de
  // bot_tareas.campo (0080), que registroTareas.js proyecta de aquí.
  [...Object.entries(DATOS_PERSONA), ...Object.entries(DATOS_CASA)]
    .filter(([, d]) => d.campo)
    .map(([clave, d], i, todos) => {
      const otro = todos.findIndex(([, x]) => x.campo === d.campo);
      if (otro !== i) throw new Error(`el campo «${d.campo}» lo llevan dos datos: ${todos[otro][0]} y ${clave}`);
      return [d.campo, fila(clave, d)];
    }),
));

/**
 * Vocabularios que la ficha ya referencia y aún no viven en vocabularios.js:
 * los de salud los trae menuplan-09 con su catálogo de alergias. Cuando
 * existan, salen de aquí y entran en VOCABULARIOS.
 */
export const VOCABULARIOS_PENDIENTES = ["alergenos", "estados"];

/**
 * Los campos sobre los que una tarea puede preguntar: la lista del CHECK
 * bot_tareas_campo_check de 0080 (aplicada, NOT VALID hasta el VALIDATE a mano).
 */
export const CAMPOS_PREGUNTABLES = Object.keys(REGISTRO_CAMPOS).filter((c) => REGISTRO_CAMPOS[c].politica !== "nunca");
