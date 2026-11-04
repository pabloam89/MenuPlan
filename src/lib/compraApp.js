/**
 * Lo gastado de la casa (trozo 22 de #1037) vive en `ticket` y `precio_observado`, que escribe el servidor
 * (api/operacion.js), no en el documento; sin casa, en el móvil. En memoria, `{ tickets, precios }` en la forma de la
 * app (historialCompra.js). Leer o mandar no lanza por la red ni por la sesión: `{ ok: false, fallo }`.
 */
import { createContext, useContext } from "react";
import { enviarAlServidor, falloDeEnvio, jsonDeTexto } from "./escribirDato.js";
import { tokenDeSesion, urlOperacion } from "./familiaCasa.js";
import { FALLO_DATO } from "./vocabularios.js";

export const SIN_COMPRA = Object.freeze({ leida: false, tickets: [], precios: [], apuntar: async () => ({ ok: false, fallo: FALLO_DATO.SERVIDOR }) });
export const CompraContext = createContext(SIN_COMPRA);
/** Lo gastado de la casa abierta: `{ leida, tickets, precios, apuntar }`. */
export const useCompra = () => useContext(CompraContext);

/** El documento de la casa sin lo gastado, que vive en sus tablas. Sin nada que quitar, el mismo objeto. */
export function sinCompra(data) {
  if (!data || (!("priceObs" in data) && !("receipts" in data))) return data;
  const { priceObs: _p, receipts: _r, ...resto } = data;
  return resto;
}

/** Lo gastado tras un cambio (el mismo que va al servidor): ticket nuevo el primero, sin repetir precios; borrar un ticket se lleva sus precios. */
export function conCambio({ tickets, precios }, { ticket = null, precios: nuevos = [], borrar_ticket: borrar = null }) {
  if (borrar != null) {
    return { tickets: tickets.filter((t) => t.id !== borrar), precios: precios.filter((p) => p.receiptId !== borrar) };
  }
  const ya = new Set(precios.map((p) => p.id));
  return {
    tickets: ticket ? [ticket, ...tickets.filter((t) => t.id !== ticket.id)] : tickets,
    precios: [...precios, ...nuevos.filter((p) => !ya.has(p.id))],
  };
}

const CLAVE_LOCAL = "hm.compra";
/** Lo gastado del invitado, en este móvil. Si lo guardado no se puede leer, lanza: no es «nada gastado». */
export function compraLocal(almacen = window.localStorage) {
  const crudo = almacen.getItem(CLAVE_LOCAL);
  const c = crudo ? jsonDeTexto(crudo) : null;
  if (crudo && !c) throw new Error("compra: lo del móvil no se puede leer");
  return { tickets: Array.isArray(c?.tickets) ? c.tickets : [], precios: Array.isArray(c?.precios) ? c.precios : [] };
}
/** Aplica un cambio a lo gastado del invitado y lo devuelve; si no se puede leer lo de antes, lanza y no lo pisa. */
export function cambiarCompraLocal(cambio, almacen = window.localStorage) {
  const nueva = conCambio(compraLocal(almacen), cambio);
  almacen.setItem(CLAVE_LOCAL, JSON.stringify(nueva));
  return nueva;
}

/** Los tickets y precios de `casa`: `{ ok: true, tickets, precios }` o `{ ok: false, fallo }`. */
export async function leerCompra(casa, { token = tokenDeSesion, fetcher = fetch } = {}) {
  let res;
  let texto;
  try {
    const t = await token();
    if (!t) return { ok: false, fallo: FALLO_DATO.SIN_SESION };
    res = await fetcher(`${urlOperacion()}?casa=${encodeURIComponent(casa)}&compra=1`, { headers: { Authorization: `Bearer ${t}` } });
    texto = await res.text();
  } catch (e) {
    console.error("[compra] sin leer:", String(e?.message ?? e));
    return { ok: false, fallo: FALLO_DATO.SIN_RED };
  }
  const cuerpo = jsonDeTexto(texto);
  const fallo = res.status === 200 ? null : falloDeEnvio({ status: res.status, cuerpo });
  if (fallo || !Array.isArray(cuerpo?.tickets) || !Array.isArray(cuerpo?.precios)) {
    console.error("[compra] respuesta sin tickets ni precios", res.status, cuerpo?.fallo ?? null);
    return { ok: false, fallo: fallo ?? FALLO_DATO.SERVIDOR };
  }
  return { ok: true, tickets: cuerpo.tickets, precios: cuerpo.precios };
}

/** Manda un cambio (`{ ticket?, precios?, borrar_ticket? }`) a la casa: `{ ok: true }` o `{ ok: false, fallo }`. */
export async function mandarCompra(casa, cambio, { token = tokenDeSesion, fetcher = fetch } = {}) {
  let r;
  try {
    r = await enviarAlServidor({ token, url: urlOperacion(), fetchFn: fetcher })({ casa, compra: cambio });
  } catch (e) {
    if (!(e instanceof TypeError)) throw e;
    return { ok: false, fallo: FALLO_DATO.SIN_RED };
  }
  const fallo = falloDeEnvio(r);
  if (fallo || r.cuerpo?.guardado !== true) {
    console.error("[compra] sin apuntar", r.status, r.cuerpo?.fallo ?? null);
    return { ok: false, fallo: fallo ?? FALLO_DATO.SERVIDOR };
  }
  return { ok: true };
}
