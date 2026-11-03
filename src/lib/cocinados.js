/**
 * Lo cocinado de la semana (trozo 22 de #1037): un plato marcado «cocinado» en un hueco es un historial, y vive en la
 * tabla `cocinado` (0109: casa, lunes de la semana, día, comida y receta; se poda al año), no en el documento de la
 * casa (`data.cookedDishes`, que crecía sin poda). La app lo escribe y lo lee por api/operacion.js (la tabla es solo
 * del servidor).
 *
 * Lo que se descontó de la despensa al cocinar (`cookedDeltas`) no está aquí: es contabilidad de la despensa, que
 * cambia aparte (cambiar el modo de despensa o desactivar un menú devuelve lo descontado y el plato sigue cocinado).
 */
import { DIAS, COMIDAS } from "./vocabularios.js";

const LUNES = /^\d{4}-\d{2}-\d{2}$/;

/**
 * La fila de un cocinado, comprobada: lo que no case con la tabla (0109) lanza aquí, antes de pedir nada.
 * @param {{ semana: string, dia: string, comida: string, receta_id: string }} f
 */
export function filaDeCocinado({ semana, dia, comida, receta_id } = {}) {
  if (!LUNES.test(String(semana ?? "")) || new Date(`${semana}T12:00:00Z`).getUTCDay() !== 1) throw new Error(`cocinado: «${semana}» no es el lunes de una semana`);
  if (!DIAS.includes(dia)) throw new Error(`cocinado: «${dia}» no es un día`);
  if (!COMIDAS.includes(comida)) throw new Error(`cocinado: «${comida}» no es una comida`);
  if (!receta_id || typeof receta_id !== "string") throw new Error("cocinado: falta la receta");
  return { semana, dia, comida, receta_id };
}
