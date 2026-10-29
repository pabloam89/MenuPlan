/**
 * Un turno a la vez por chat (0063): los mensajes que llegan seguidos se
 * atienden JUNTOS, y nunca hay dos respuestas en paralelo en el mismo chat.
 *
 * Cada mensaje se encola; quien consigue el candado espera un momento (por si
 * viene más), toma toda la cola y la atiende en un turno; si mientras tanto ha
 * llegado algo, otra vuelta. Quien no consigue el candado no hace nada más: su
 * mensaje ya está en la cola y lo atenderá quien lo tiene.
 */

import { fallaCon } from "./avisar.js";
import { cabeUnTurno } from "./plazo.js";
import { select, insert, update, rpc, eq } from "./db.js";
import { CANAL, paraEscribir } from "../../src/lib/vocabularios.js";

// Lo que se espera por si llega otro mensaje detrás. 1 s basta para las
// ráfagas de texto («quiero cambiar la cena» · «la del jueves»); un botón
// pulsado (item.inmediato) no espera nada: nadie pulsa dos a la vez.
const ESPERA_RAFAGA_MS = 1000;
const DURACION_CANDADO_S = 150; // más que maxDuration (120): caduca solo si la función muere
const MAX_VUELTAS = 4;

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

export const tomarCandado = (chatId) => rpc("bot_tomar_candado", { p_chat: String(chatId), p_segundos: DURACION_CANDADO_S });
export const soltarCandado = (chatId) => rpc("bot_soltar_candado", { p_chat: String(chatId) }).catch(fallaCon("turnos_soltar_candado"));

// El canal va explícito: el default 'telegram' de la columna (0063) lo escribiría la base sin pasar por la lista viva.
export const encolar = (chatId, item, channel = CANAL.TELEGRAM) =>
  insert("bot_cola", [{ channel: paraEscribir("canales", channel), chat_id: String(chatId), item }]);

/** Toma (y marca) todo lo pendiente del chat, en orden. */
async function sacarCola(chatId) {
  const filas = await update(
    "bot_cola",
    `chat_id=${eq(chatId)}&tomado_at=is.null`,
    { tomado_at: new Date().toISOString() },
  );
  return (filas ?? []).sort((a, b) => a.id - b.id).map((f) => f.item);
}

const hayPendientes = async (chatId) =>
  (await select("bot_cola", `chat_id=${eq(chatId)}&tomado_at=is.null&limit=1`, "id")).length > 0;

/**
 * Encola el mensaje y, si nadie está respondiendo en este chat, responde a
 * todo lo pendiente (drenar).
 * @param {(items: object[]) => Promise<void>} atender  un turno con lo acumulado
 * @param {{ alSobrar?: () => Promise<void> }} [o]  si queda trabajo y no hay tiempo, quién lo releva
 */
export async function enTurno(chatId, item, atender, { alSobrar = null } = {}) {
  await encolar(chatId, item);
  return drenar(chatId, atender, { espera: item.inmediato ? 0 : ESPERA_RAFAGA_MS, alSobrar });
}

/**
 * Atiende lo pendiente del chat si consigue su candado, mirando el reloj de la
 * invocación (plazo.js, #958): no saca de la cola lo que no le da tiempo a
 * contestar. Lo que sobra se queda en la cola, sin tomar, y `alSobrar` lo
 * pasa a otra invocación (el relevo de api/bot/telegram.js). Antes se sacaba
 * todo y, si la función moría, esos mensajes se perdían.
 */
export async function drenar(chatId, atender, { espera = ESPERA_RAFAGA_MS, alSobrar = null } = {}) {
  for (let intento = 0; intento < 2; intento++) {
    if (!cabeUnTurno()) return alSobrar?.();
    if (!(await tomarCandado(chatId))) return;
    let sinTiempo = false;
    try {
      if (espera) await dormir(espera);
      for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
        if (!cabeUnTurno()) { sinTiempo = true; break; }
        const items = await sacarCola(chatId);
        if (!items.length) break;
        await atender(items);
      }
    } finally {
      await soltarCandado(chatId);
    }
    // Algo pudo entrar justo entre la última mirada y soltar el candado: esa
    // llamada no pudo tomarlo y se fue. Se atiende aquí, si da tiempo.
    if (!(await hayPendientes(chatId))) return;
    if (sinTiempo) return alSobrar?.();
  }
  // Dos intentos y sigue habiendo cola (mensajes que no paran de entrar, o más
  // de MAX_VUELTAS seguidas): otra invocación, que empieza con el reloj a cero.
  return alSobrar?.();
}

/**
 * Para lo que no se puede juntar (una foto o un PDF): espera a que el chat
 * esté libre, responde, y deja atendido lo que se haya acumulado detrás.
 * Si tras la espera el chat sigue ocupado, no responde a la vez que el otro
 * turno ni toca su candado: avisa con `alOcupar`.
 * `atender` recibe `{ esperaMs }`: lo que esperó a que el chat quedara libre
 * (bot_route espera_cola_ms: un turno largo delante lo deja en silencio).
 */
export async function aSolas(chatId, atender, drenarCola, alOcupar = async () => {}, { alSobrar = null } = {}) {
  const desde = Date.now();
  let mio = await tomarCandado(chatId);
  for (let i = 0; i < 60 && !mio; i++) {
    await dormir(1000);
    mio = await tomarCandado(chatId);
  }
  if (!mio) return alOcupar();
  try {
    await atender({ esperaMs: Date.now() - desde });
    for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
      // Lo de detrás, solo si cabe en esta invocación (plazo.js, #958).
      if (!cabeUnTurno()) break;
      const items = await sacarCola(chatId);
      if (!items.length) break;
      await drenarCola(items);
    }
  } finally {
    await soltarCandado(chatId);
  }
  if (await hayPendientes(chatId)) return alSobrar?.();
}

/**
 * Varios mensajes seguidos → un solo texto para el agente. En un grupo, cada
 * línea con quién la dijo; las notas de voz, con lo que se oyó.
 */
export function juntar(items, { esGrupo = false } = {}) {
  const autores = new Set(items.map((i) => i.autor).filter(Boolean));
  const conAutor = esGrupo && autores.size > 1;
  const texto = items.map((i) => (conAutor && i.autor ? `[${i.autor}]: ${i.texto}` : i.texto)).join("\n");
  const oidos = items.map((i) => i.oido).filter(Boolean);
  const ultimo = items[items.length - 1];
  return { texto, oido: oidos.length ? oidos.join("», «") : null, ultimo, variosAutores: conAutor };
}
