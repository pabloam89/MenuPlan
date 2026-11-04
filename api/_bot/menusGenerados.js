/**
 * Los menús generados de una casa, en su tabla (`menu_generado`, 0125; trozo 22 de #1037): la racha y el contador.
 * Solo el servidor la escribe: la app llega por api/operacion.js, que mira antes quién es y qué papel tiene.
 */
import { select, insert, eq } from "./db.js";
import { MENUS_QUE_SE_LEEN } from "../../src/lib/menusGenerados.js";

/** Cuándo se generaron los últimos menús de la casa (ISO), del más viejo al más nuevo. */
export async function menusGenerados(casa) {
  const filas = await select("menu_generado", `household_id=${eq(casa)}&order=created_at.desc&limit=${MENUS_QUE_SE_LEEN}`, "created_at");
  return filas.map((f) => f.created_at).reverse();
}

/** Apunta un menú generado ahora. Lo que falle, lanza. */
export async function apuntarMenuGenerado(casa) {
  await insert("menu_generado", [{ household_id: casa }]);
  return { apuntado: true };
}
