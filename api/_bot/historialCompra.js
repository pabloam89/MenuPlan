/**
 * Los tickets y los precios de una casa, en sus tablas (`ticket`, `precio_observado`: 0109 y 0124; trozo 22 de #1037).
 * Solo el servidor las escribe: la app llega por api/operacion.js, que mira antes quién es y qué papel tiene.
 */
import { select, insert, borrar, eq } from "./db.js";
import { esDuplicado } from "./entradas.js";
import { ticketDeFila, precioDeFila } from "../../src/lib/historialCompra.js";

const COLUMNAS_TICKET = "id,super,comprado_at,total,lineas,tachados,tachados_semana,despensa_ids";
const COLUMNAS_TICKET_0109 = "id,super,comprado_at,total,lineas";
const COLUMNAS_PRECIO = "id,ticket_id,ingrediente_id,nombre,marca,super,precio,cantidad,unidad,tamano_cantidad,tamano_unidad,fuente,tipo,comprado_at";
/** Lo que la 0124 añade a `ticket`. */
const DE_LA_0124 = ["tachados", "tachados_semana", "despensa_ids"];
/** Falta una columna de la 0124 (aún sin aplicar): PostgREST (PGRST204) o Postgres (42703) la nombran. Otra, no. */
const sinColumna = (e) => ["PGRST204", "42703"].includes(e?.codigo) && DE_LA_0124.some((c) => String(e?.message ?? "").includes(c));

/**
 * Guarda un ticket (fila ya comprobada con filaDeTicket) y sus precios (filas de filaDePrecio). Uno que ya estaba no
 * se duplica (esDuplicado). Sin la 0124, guarda el ticket sin lo que lo deshace y lo dice en el log.
 */
export async function guardarTicket(casa, ticket, precios) {
  try {
    await insert("ticket", [{ household_id: casa, ...ticket }]);
  } catch (e) {
    if (esDuplicado(e)) return guardarPrecios(casa, precios);
    if (!sinColumna(e)) throw e;
    console.warn(JSON.stringify({ evento: "ticket_sin_deshacer", motivo: "sin la 0124", ticket: ticket.id }));
    const sin = Object.fromEntries(Object.entries(ticket).filter(([k]) => !DE_LA_0124.includes(k)));
    try {
      await insert("ticket", [{ household_id: casa, ...sin }]);
    } catch (e2) {
      if (!esDuplicado(e2)) throw e2;
    }
  }
  return guardarPrecios(casa, precios);
}

/** Guarda precios sueltos o de un ticket (filas de filaDePrecio); los que ya estaban no se duplican. */
export async function guardarPrecios(casa, precios) {
  if (!precios.length) return { precios: 0 };
  try {
    await insert("precio_observado", precios.map((p) => ({ household_id: casa, ...p })));
  } catch (e) {
    if (!esDuplicado(e)) throw e;
    // Alguno ya estaba (un reintento): de uno en uno, para no perder los que faltan.
    for (const p of precios) {
      try {
        await insert("precio_observado", [{ household_id: casa, ...p }]);
      } catch (e2) {
        if (!esDuplicado(e2)) throw e2;
      }
    }
  }
  return { precios: precios.length };
}

/** Borra un ticket; sus precios se van con él (on delete cascade de la 0109). */
export async function borrarTicket(casa, id) {
  await borrar("ticket", `household_id=${eq(casa)}&id=${eq(id)}`);
  return { borrado: id };
}

/** Los tickets y precios de la casa en la forma de la app (lo que queda tras la poda de 90 días). */
export async function leerCompra(casa) {
  let tickets;
  try {
    tickets = await select("ticket", `household_id=${eq(casa)}&order=comprado_at.desc`, COLUMNAS_TICKET);
  } catch (e) {
    if (!sinColumna(e)) throw e;
    tickets = await select("ticket", `household_id=${eq(casa)}&order=comprado_at.desc`, COLUMNAS_TICKET_0109);
  }
  const precios = await select("precio_observado", `household_id=${eq(casa)}&order=comprado_at.asc`, COLUMNAS_PRECIO);
  return { tickets: tickets.map(ticketDeFila), precios: precios.map(precioDeFila) };
}
