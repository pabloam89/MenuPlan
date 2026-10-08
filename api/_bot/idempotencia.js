/**
 * Una orden repetida no escribe dos veces (spec de tareas, fase H1).
 *
 * La clave es el id de la llamada de herramienta de Anthropic: si el modelo o
 * la red reintentan la MISMA llamada, la segunda devuelve lo que contestó la
 * primera sin tocar nada. Por casa, porque un id solo es único dentro de su
 * casa (0080: primary key (household_id, clave)).
 *
 * Detrás de BOT_TAREAS_V2: apagado, no se lee ni se escribe bot_idempotencia
 * (la 0080 puede no estar aplicada) y todo se comporta como antes.
 *
 * El mismo interruptor enciende la fase T2 de tareas.js (tipo, campo,
 * persona_id y «aplazada»). Para encenderlo: 0080 aplicada, el índice de
 * supabase/manual/0080b_indice_concurrente.sql creado, bot-evals pasadas (cambia
 * cerrar_tarea) y en Production y Preview a la vez: comparten base, y un bot
 * apagado no ve las aplazadas ni las cierra.
 */

import { seguirCon, fallaCon } from "./avisar.js";
import { select, insert, update, borrar, eq } from "./db.js";

export const tareasV2 = () => /^(1|true|si|sí|on)$/i.test(String(process.env.BOT_TAREAS_V2 ?? "").trim());

const esDuplicado = (e) => /\b409\b|23505|duplicate key/i.test(String(e?.message ?? e));

export const YA_HECHO = "Eso ya estaba hecho (la misma orden llegó dos veces): no lo he repetido.";

/**
 * Ejecuta `correr` una sola vez por (casa, clave). Primero reserva la clave; si
 * ya estaba, devuelve lo guardado. Si `correr` falla, suelta la reserva para
 * que un reintento de verdad pueda volver a intentarlo.
 * @param {{ householdId: string, clave?: string|null, rpc: string }} orden
 * @param {() => Promise<any>} correr
 */
export async function unaVez({ householdId, clave, rpc }, correr) {
  if (!tareasV2() || !clave || !householdId) return correr();
  const filtro = `household_id=${eq(householdId)}&clave=${eq(String(clave))}`;
  try {
    await insert("bot_idempotencia", [{ household_id: householdId, clave: String(clave), rpc }]);
  } catch (e) {
    if (!esDuplicado(e)) throw e;
    const [fila] = await select("bot_idempotencia", filtro, "resultado");
    return fila?.resultado?.texto ?? YA_HECHO;
  }
  let r;
  try {
    r = await correr();
  } catch (e) {
    await borrar("bot_idempotencia", filtro).catch(fallaCon("idempotencia/soltar la llave"));
    throw e;
  }
  // Lo que contestó, para devolverlo igual si se repite. Se purga a los 7 días.
  await update("bot_idempotencia", filtro, { resultado: { texto: typeof r === "string" ? r : JSON.stringify(r) } }).catch(seguirCon("idempotencia/guardar resultado"));
  return r;
}
