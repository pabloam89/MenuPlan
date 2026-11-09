/**
 * Las horas de entrega de Mercadona (0134, trozo 20 de #1407): una hora de entrega libre, tal como la da su web
 * (`{ id, start, end, price, available, open, timezone }`, `.claude/skills/mercadona/referencias/pedido.md`,
 * «Horas de entrega»). En lo que se ve se dice «hora de entrega»; `hora_entrega`, en el código y los datos. Lo leen la app, Lola y el
 * servidor. El trabajador no la importa (su contenedor solo lleva lo suyo): elige las suyas en scripts/lib.
 */
import { MESES_CORTOS, momentoDeCasa, nombreDia } from "./dias.js";
import { FALLO_ENCARGO_MERCADONA } from "./mercadonaFallos.js";
import { formatEuro } from "./euros.js";

/** Lo que admite la 0134 en `horas_entrega`: de 1 a 4. Quién elige cuáles es el trabajador (scripts/lib). */
export const TOPE_HORAS_ENTREGA = 4;

/** Pura. ¿Tiene forma de hora de entrega de Mercadona? Un id y dos fechas que se leen, la de fin después de la de inicio. */
export function esHoraEntrega(f) {
  if (!f || typeof f !== "object" || Array.isArray(f) || f.id == null || String(f.id) === "") return false;
  const desde = new Date(f.start).getTime();
  const hasta = new Date(f.end).getTime();
  return Number.isFinite(desde) && Number.isFinite(hasta) && hasta > desde;
}

/** Pura. ¿Lo que el trabajador dice del pedido tiene la forma que guarda la 0134? */
export function esPedido(p) {
  return Boolean(p) && typeof p.pedido_xid === "string" && p.pedido_xid !== ""
    && (p.total === null || (typeof p.total === "number" && Number.isFinite(p.total) && p.total >= 0))
    && Array.isArray(p.horas_entrega) && p.horas_entrega.length >= 1 && p.horas_entrega.length <= TOPE_HORAS_ENTREGA && p.horas_entrega.every(esHoraEntrega);
}

/** Pura. El precio de la entrega en euros, de «7.21» o 7.21; null si no se puede leer. */
export function precioDeHoraEntrega(hora_entrega) {
  const n = Number(String(hora_entrega?.price ?? "").replace(",", "."));
  return hora_entrega?.price != null && hora_entrega.price !== "" && Number.isFinite(n) ? n : null;
}


/**
 * Pura. Cómo se dice una hora de entrega, en la hora de la casa: `{ dia: "miércoles 12 nov", horas: "15:00–16:00", precio:
 * "7,21 €" | "gratis" | null }`. Lo mismo en la hoja de Comprar y en el chat.
 */
export function partesDeHoraEntrega(hora_entrega) {
  const desde = momentoDeCasa(hora_entrega?.start);
  const hasta = momentoDeCasa(hora_entrega?.end);
  if (!desde || !hasta) return null;
  const [, mes, dia] = desde.iso.split("-").map(Number);
  const precio = precioDeHoraEntrega(hora_entrega);
  return {
    dia: `${nombreDia(desde.dia, { minusculas: true })} ${dia} ${MESES_CORTOS[mes - 1]}`,
    horas: `${desde.hora}–${hasta.hora}`,
    precio: precio === null ? null : precio === 0 ? "gratis" : formatEuro(precio),
  };
}

/** Pura. En una línea: «miércoles 12 nov, 15:00–16:00 · 7,21 €». */
export function textoDeHoraEntrega(hora_entrega) {
  const p = partesDeHoraEntrega(hora_entrega);
  if (!p) return "";
  return `${p.dia}, ${p.horas}${p.precio ? ` · ${p.precio}` : ""}`;
}

/** Lo que se dice cuando falla reservar la hora, con la lista ya en Mercadona (0134): lo mismo en la app y en Lola. */
export const TRAS_LA_LISTA = Object.freeze({
  [FALLO_ENCARGO_MERCADONA.BAJO_MINIMO]: "no llega al pedido mínimo de Mercadona. Añade algo y tramítalo allí.",
  [FALLO_ENCARGO_MERCADONA.SIN_DIRECCION]: "tu cuenta de Mercadona no tiene dirección. Añádela allí y elige la hora.",
  [FALLO_ENCARGO_MERCADONA.SIN_HORAS]: "ahora no hay horas de entrega libres. Mira en la app de Mercadona más tarde.",
  [FALLO_ENCARGO_MERCADONA.HORA_OCUPADA]: "esa hora se acaba de ocupar. Elige otra en la app de Mercadona.",
  [FALLO_ENCARGO_MERCADONA.CADUCADO]: "no se ha elegido la hora a tiempo. Elígela en la app de Mercadona.",
});
export const TRAS_LA_LISTA_OTRO = "no he podido reservar la hora de entrega. Elígela en la app de Mercadona.";
