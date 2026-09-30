/**
 * Un turno a la vez por chat (0063): los mensajes que llegan seguidos se
 * atienden JUNTOS, y nunca hay dos respuestas en paralelo en el mismo chat.
 *
 * Cada mensaje se encola; quien consigue el candado espera un momento (por si
 * viene más), toma toda la cola y la atiende en un turno; si mientras tanto ha
 * llegado algo, otra vuelta. Quien no consigue el candado no hace nada más: su
 * mensaje ya está en la cola y lo atenderá quien lo tiene.
 */

import { select, insert, update, rpc, eq } from "./db.js";

const ESPERA_RAFAGA_MS = 2000;
const DURACION_CANDADO_S = 150; // más que maxDuration (120): caduca solo si la función muere
const MAX_VUELTAS = 4;

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

export const tomarCandado = (chatId) => rpc("bot_tomar_candado", { p_chat: String(chatId), p_segundos: DURACION_CANDADO_S });
export const soltarCandado = (chatId) => rpc("bot_soltar_candado", { p_chat: String(chatId) }).catch(() => {});

export const encolar = (chatId, item) => insert("bot_cola", [{ chat_id: String(chatId), item }]);

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
 * todo lo pendiente.
 * @param {(items: object[]) => Promise<void>} atender  un turno con lo acumulado
 */
export async function enTurno(chatId, item, atender) {
  await encolar(chatId, item);
  for (let intento = 0; intento < 2; intento++) {
    if (!(await tomarCandado(chatId))) return;
    try {
      await dormir(ESPERA_RAFAGA_MS);
      for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
        const items = await sacarCola(chatId);
        if (!items.length) break;
        await atender(items);
      }
    } finally {
      await soltarCandado(chatId);
    }
    // Algo pudo entrar justo entre la última mirada y soltar el candado: esa
    // llamada no pudo tomarlo y se fue. Se atiende aquí.
    if (!(await hayPendientes(chatId))) return;
  }
}

/**
 * Para lo que no se puede juntar (una foto o un PDF): espera a que el chat
 * esté libre, responde, y deja atendido lo que se haya acumulado detrás.
 */
export async function aSolas(chatId, atender, drenar) {
  for (let i = 0; i < 60 && !(await tomarCandado(chatId)); i++) await dormir(1000);
  try {
    await atender();
    for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
      const items = await sacarCola(chatId);
      if (!items.length) break;
      await drenar(items);
    }
  } finally {
    await soltarCandado(chatId);
  }
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
