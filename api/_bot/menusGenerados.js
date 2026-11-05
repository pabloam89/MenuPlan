/**
 * Los menús generados de una casa, en su tabla (`menu_generado`, 0125; trozo 22 de #1037): la racha y el contador, y
 * desde la 0130 (trozo 70) cómo se pidió cada uno.
 * Solo el servidor la escribe: la app llega por api/operacion.js, que mira antes quién es y qué papel tiene.
 */
import { select, insert, eq } from "./db.js";
import { MENUS_QUE_SE_LEEN } from "../../src/lib/menusGenerados.js";
import { paraEscribir } from "../../src/lib/vocabularios.js";

const DE_LA_0130 = ["menu_id", "week_start", "camino"];
/** Falta una columna de la 0130 (aún sin aplicar): PostgREST (PGRST204) o Postgres (42703) la nombran. Otra, no. */
const sinColumna = (e) => ["PGRST204", "42703"].includes(e?.codigo) && DE_LA_0130.some((c) => String(e?.message ?? "").includes(c));

/** Cuándo se generaron los últimos menús de la casa (ISO), del más viejo al más nuevo. */
export async function menusGenerados(casa) {
  const filas = await select("menu_generado", `household_id=${eq(casa)}&order=created_at.desc&limit=${MENUS_QUE_SE_LEEN}`, "created_at");
  return filas.map((f) => f.created_at).reverse();
}

/** El último menú con camino de esta casa, `{ menu_id, week_start, camino }`, o null. Sin la 0130, null. */
export async function ultimoPedido(casa) {
  try {
    const [fila] = await select("menu_generado", `household_id=${eq(casa)}&camino=not.is.null&order=created_at.desc&limit=1`, "menu_id,week_start,camino");
    return fila ?? null;
  } catch (e) {
    if (!sinColumna(e)) throw e;
    return null;
  }
}

/**
 * Apunta un menú generado ahora. Lo que falle, lanza.
 * `comoSePidio`: `{ menu_id, week_start, camino }` del pedido de Lola. Sin la 0130 se apunta sin eso.
 */
export async function apuntarMenuGenerado(casa, comoSePidio = null) {
  try {
    const camino = comoSePidio?.camino ? paraEscribir("caminos_menu", comoSePidio.camino) : null;
    await insert("menu_generado", [{ household_id: casa, ...comoSePidio, ...(comoSePidio && { camino }) }]);
  } catch (e) {
    if (!comoSePidio || !sinColumna(e)) throw e;
    console.warn(JSON.stringify({ evento: "menu_generado_sin_pedido", motivo: "sin la 0130" }));
    await insert("menu_generado", [{ household_id: casa }]);
  }
  return { apuntado: true };
}
