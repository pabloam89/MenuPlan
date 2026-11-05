/**
 * El pedido de menú en curso (trozo 66 de #1037, tramo 10): una tarea abierta por casa con lo que no sale de la ficha,
 * el camino elegido, desde cuándo y si dijeron «sigue tú». Así sobrevive a que la charla cambie de tema, y dos adultos
 * comparten el mismo: lo garantiza el índice único (casa, clave) entre las abiertas.
 * Lo que falta no se guarda aquí: se calcula en cada turno (src/lib/pedidoMenu.js).
 */
import { select, insert, update, eq } from "./db.js";
import { esDuplicado } from "./entradas.js";
import { CADUCA, COSAS_QUE_CADUCAN, vigente } from "./caducidades.js";
import { IDS_CAMINO } from "./caminoMenu.js";
import { CANAL, ESTADO_TAREA, OBJETIVO_TAREA, TIPO_TAREA, paraEscribir } from "../../src/lib/vocabularios.js";

const CLAVE = "pedido_menu";
const TEXTO = "Pedido de menú en curso";
const VACIO = { camino: null, desde: null, forzado: false };
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

const delPedido = (householdId) => `household_id=${eq(householdId)}&clave=${eq(CLAVE)}&status=eq.${ESTADO_TAREA.ABIERTA}`;
const caducaAt = (ahora) => new Date(ahora.getTime() + COSAS_QUE_CADUCAN[CADUCA.PEDIDO_MENU].vidaMs).toISOString();

/** Pura. Lo guardado en `bot_tareas.pedido`, sin dar por bueno lo que no sea del vocabulario. */
export function pedidoDeFila(fila) {
  let p;
  try {
    p = JSON.parse(fila.pedido);
  } catch {
    console.error("[pedido] ilegible", String(fila.id ?? "").slice(0, 8));
    return { ...VACIO };
  }
  return {
    camino: IDS_CAMINO.includes(p?.camino) ? p.camino : null,
    desde: FECHA.test(String(p?.desde ?? "")) ? p.desde : null,
    forzado: p?.forzado === true,
  };
}

const filaAbierta = async (householdId) => (await select("bot_tareas", `${delPedido(householdId)}&limit=1`, "id,pedido,updated_at"))?.[0] ?? null;
const vivo = (fila, ahora) => vigente(CADUCA.PEDIDO_MENU, fila.updated_at, ahora.getTime());

/** El pedido que sigue vivo en esta casa, o null. */
export async function pedidoEnCurso(householdId, ahora = new Date()) {
  const fila = await filaAbierta(householdId);
  return fila && vivo(fila, ahora) ? pedidoDeFila(fila) : null;
}

/** Lo que había, si sigue vivo, con lo nuevo encima. */
const juntar = (fila, cambios, ahora) => ({ ...(fila && vivo(fila, ahora) ? pedidoDeFila(fila) : VACIO), ...cambios });

const reescribir = (fila, pedido, ahora) => update("bot_tareas", `id=${eq(fila.id)}&status=eq.${ESTADO_TAREA.ABIERTA}`, {
  pedido: JSON.stringify(pedido), caduca_at: caducaAt(ahora), updated_at: ahora.toISOString(),
});

/**
 * Abre el pedido o suma `cambios` al que haya. Si otro adulto lo abre a la vez, gana el índice único y se suma al suyo.
 * @returns {Promise<{ camino: string|null, desde: string|null, forzado: boolean }>}
 */
export async function guardarPedido({ householdId, channel = CANAL.TELEGRAM, chatId, userId = null }, cambios, ahora = new Date()) {
  const fila = await filaAbierta(householdId);
  const pedido = juntar(fila, cambios, ahora);
  if (fila) {
    await reescribir(fila, pedido, ahora);
    return pedido;
  }
  try {
    await insert("bot_tareas", [{
      household_id: householdId, channel: paraEscribir("canales", channel), chat_id: String(chatId), tipo: TIPO_TAREA.ESPERA,
      objetivo: OBJETIVO_TAREA.GENERAR_MENU, clave: CLAVE, texto: TEXTO, pedido: JSON.stringify(pedido), caduca_at: caducaAt(ahora), created_by: userId,
    }]);
    return pedido;
  } catch (e) {
    if (!esDuplicado(e)) throw e;
  }
  const delOtro = await filaAbierta(householdId);
  if (!delOtro) throw new Error("guardarPedido: la clave estaba cogida y el pedido ya no está abierto");
  const juntos = juntar(delOtro, cambios, ahora);
  await reescribir(delOtro, juntos, ahora);
  return juntos;
}

/** Cierra el pedido: `hecha` al generar, `descartada` si lo dejan. Un generar fallido no lo cierra. */
export function cerrarPedido(householdId, estado = ESTADO_TAREA.HECHA, ahora = new Date()) {
  const cuando = ahora.toISOString();
  return update("bot_tareas", delPedido(householdId), { status: estado, closed_at: cuando, updated_at: cuando });
}
