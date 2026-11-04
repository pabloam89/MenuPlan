/**
 * El botón de un recordatorio (#1238). Lleva el id de su tarea (bot_tareas), no su texto: al pulsarlo, la casa sale de
 * la tarea (recordatorioDelBoton, api/_bot/recordatorios.js), así que pulsado estando en otra casa no se hace en la
 * equivocada; y el texto ya no tiene que caber en los 64 bytes de Telegram. Puro: sin base.
 */
import { tarea as idTarea } from "../../src/lib/ids.js";
import { escaparHtml } from "./telegram.js";

const PREFIJO_BOTON = "rec:";
export const botonDeRecordatorio = (id) => ({ texto: "👉 Vamos", dato: `${PREFIJO_BOTON}${id}` });
/** El id de la tarea de un botón de recordatorio, o null si el botón no es de un recordatorio. */
export function idDeBoton(dato) {
  const id = typeof dato === "string" && dato.startsWith(PREFIJO_BOTON) ? dato.slice(PREFIJO_BOTON.length) : null;
  return idTarea.esNuevo(id) ? id : null;
}

/** Lo que pasa al pulsar el botón de un recordatorio. */
export const AL_PULSAR = Object.freeze({ HACER: "hacer", OTRA_CASA: "otra_casa", YA_NO_ESTA: "ya_no_esta" });

/** Pura. `casa`: la del turno (casaDelTurno). Se hace solo en la casa del recordatorio. */
export function alPulsar({ recordatorio, casa }) {
  if (!recordatorio) return AL_PULSAR.YA_NO_ESTA;
  return recordatorio.household_id === casa ? AL_PULSAR.HACER : AL_PULSAR.OTRA_CASA;
}

/** Pura. Lo que dice Lola si el recordatorio es de otra casa que la abierta en la app. */
export function avisoDeOtraCasa({ suya, abierta }) {
  const nombre = (n, si) => (n ? `<b>${escaparHtml(n)}</b>` : si);
  return `Este recordatorio es de ${nombre(suya, "otra casa")}, y ahora tienes abierta ${nombre(abierta, "otra")} en la app. `
    + `Para hacerlo ahí, abre ${nombre(suya, "esa casa")} en la app y pulsa otra vez.`;
}

/** Lo que dice Lola si el recordatorio ya no está (cancelado, o borrado a los 7 días de mandarse). */
export const RECORDATORIO_YA_NO_ESTA = "Ese recordatorio ya no está. Dime qué quieres hacer y me pongo.";
