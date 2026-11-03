/**
 * Lo que se gastó en la compra (trozo 22 de #1037): los tickets y los precios vistos son historiales, y viven en
 * `ticket` y `precio_observado` (0109, con poda a los 90 días; lo que deshace un ticket, 0124), no en el documento de
 * la casa (`data.receipts`, `data.priceObs`). Aquí, la forma de la fila de cada tabla y la vuelta a la forma de la
 * app, en un solo sitio para el servidor (api/_bot/historialCompra.js) y la app.
 */
import { FUENTES_PRECIO, TIPOS_LINEA_TICKET } from "./vocabularios.js";

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const num = (v) => (v == null || v === "" ? null : Number(v));
const texto = (v) => (v == null || v === "" ? null : String(v));
const instante = (v, que) => {
  const t = Date.parse(v);
  if (!Number.isFinite(t)) throw new Error(`${que}: «${v}» no es una fecha`);
  return new Date(t).toISOString();
};
const textos = (v, que) => {
  if (v == null) return [];
  if (!Array.isArray(v) || v.some((x) => typeof x !== "string" && typeof x !== "number")) throw new Error(`${que}: no es una lista`);
  return v.map(String);
};

/** La fila de `ticket` de un ticket de la app (`data.receipts`); lo que no case con la tabla lanza. */
export function filaDeTicket(r) {
  if (!r?.id) throw new Error("ticket: falta el id");
  const total = Number(r.total);
  const lineas = Number(r.lineCount);
  if (!(total >= 0) || !Number.isInteger(lineas) || lineas < 0) throw new Error("ticket: total o líneas no valen");
  const semana = r.tachedWeekStart ?? null;
  if (semana != null && (!FECHA.test(String(semana)) || new Date(`${semana}T12:00:00Z`).getUTCDay() !== 1)) throw new Error(`ticket: «${semana}» no es un lunes`);
  return {
    id: String(r.id), super: texto(r.store), comprado_at: instante(r.purchasedAt, "ticket"), total, lineas,
    tachados: textos(r.tachedKeys, "ticket.tachados"), tachados_semana: semana, despensa_ids: textos(r.pantryIds, "ticket.despensa_ids"),
  };
}

/** El ticket de la app de una fila de `ticket` (sin las columnas de la 0124, sin deshacer). */
export const ticketDeFila = (f) => ({
  id: f.id, store: f.super ?? null, purchasedAt: f.comprado_at, total: Number(f.total), lineCount: f.lineas,
  tachedKeys: f.tachados ?? [], tachedWeekStart: f.tachados_semana ?? null, pantryIds: f.despensa_ids ?? [],
});

/** La fila de `precio_observado` de un precio de la app (`data.priceObs`); lo que no case con la tabla lanza. */
export function filaDePrecio(o) {
  if (!o?.id) throw new Error("precio: falta el id");
  if (!o.name) throw new Error("precio: falta el nombre");
  const precio = Number(o.price);
  if (!(precio >= 0)) throw new Error("precio: el precio no vale");
  if (!FUENTES_PRECIO.includes(o.source)) throw new Error(`precio: «${o.source}» no es una fuente`);
  if (!TIPOS_LINEA_TICKET.includes(o.kind)) throw new Error(`precio: «${o.kind}» no es un tipo de línea`);
  return {
    id: String(o.id), ticket_id: texto(o.receiptId), ingrediente_id: texto(o.ingredientId), nombre: String(o.name),
    marca: texto(o.brand), super: texto(o.store), precio, cantidad: num(o.qty), unidad: texto(o.unit),
    tamano_cantidad: num(o.sizeQty), tamano_unidad: texto(o.sizeUnit), fuente: o.source, tipo: o.kind,
    comprado_at: instante(o.purchasedAt, "precio"),
  };
}

/** El precio de la app de una fila de `precio_observado`. */
export const precioDeFila = (f) => ({
  id: f.id, receiptId: f.ticket_id ?? null, ingredientId: f.ingrediente_id ?? null, name: f.nombre, brand: f.marca ?? null,
  store: f.super ?? null, price: Number(f.precio), qty: num(f.cantidad), unit: f.unidad ?? null,
  sizeQty: num(f.tamano_cantidad), sizeUnit: f.tamano_unidad ?? null, source: f.fuente, kind: f.tipo, purchasedAt: f.comprado_at,
});
