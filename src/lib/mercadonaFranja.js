/**
 * Las franjas de entrega de Mercadona (0134, trozo 20 de #1407): una hora de entrega libre, tal como la da su web
 * (`{ id, start, end, price, available, open, timezone }`, `.claude/skills/mercadona/referencias/pedido.md`,
 * «Franjas»). En lo que se ve se dice «hora de entrega»; `franja`, en el código y los datos. Lo leen la app, Lola y el
 * servidor. El trabajador no la importa (su contenedor solo lleva lo suyo): elige las suyas en scripts/lib.
 */
import { MESES_CORTOS, momentoDeCasa, nombreDia } from "./dias.js";

/** Lo que admite la 0134 en `franjas`: de 1 a 4. Quién elige cuáles es el trabajador (scripts/lib). */
export const TOPE_FRANJAS = 4;

/** Pura. ¿Tiene forma de franja de Mercadona? Un id y dos fechas que se leen, la de fin después de la de inicio. */
export function esFranja(f) {
  if (!f || typeof f !== "object" || Array.isArray(f) || f.id == null || String(f.id) === "") return false;
  const desde = new Date(f.start).getTime();
  const hasta = new Date(f.end).getTime();
  return Number.isFinite(desde) && Number.isFinite(hasta) && hasta > desde;
}

/** Pura. ¿Lo que el trabajador dice del pedido tiene la forma que guarda la 0134? */
export function esPedido(p) {
  return Boolean(p) && typeof p.pedido_xid === "string" && p.pedido_xid !== ""
    && (p.total === null || (typeof p.total === "number" && Number.isFinite(p.total) && p.total >= 0))
    && Array.isArray(p.franjas) && p.franjas.length >= 1 && p.franjas.length <= TOPE_FRANJAS && p.franjas.every(esFranja);
}

/** Pura. El precio de la entrega en euros, de «7.21» o 7.21; null si no se puede leer. */
export function precioDeFranja(franja) {
  const n = Number(String(franja?.price ?? "").replace(",", "."));
  return franja?.price != null && franja.price !== "" && Number.isFinite(n) ? n : null;
}

const euros = (n) => `${n.toFixed(2).replace(".", ",")} €`;

/**
 * Pura. Cómo se dice una franja, en la hora de la casa: `{ dia: "miércoles 12 nov", horas: "15:00–16:00", precio:
 * "7,21 €" | "gratis" | null }`. Lo mismo en la hoja de Comprar y en el chat.
 */
export function partesDeFranja(franja) {
  const desde = momentoDeCasa(franja?.start);
  const hasta = momentoDeCasa(franja?.end);
  if (!desde || !hasta) return null;
  const [, mes, dia] = desde.iso.split("-").map(Number);
  const precio = precioDeFranja(franja);
  return {
    dia: `${nombreDia(desde.dia, { minusculas: true })} ${dia} ${MESES_CORTOS[mes - 1]}`,
    horas: `${desde.hora}–${hasta.hora}`,
    precio: precio === null ? null : precio === 0 ? "gratis" : euros(precio),
  };
}

/** Pura. En una línea: «miércoles 12 nov, 15:00–16:00 · 7,21 €». */
export function textoDeFranja(franja) {
  const p = partesDeFranja(franja);
  if (!p) return "";
  return `${p.dia}, ${p.horas}${p.precio ? ` · ${p.precio}` : ""}`;
}
