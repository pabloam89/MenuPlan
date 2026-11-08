/**
 * El pedido de Mercadona y su hora de entrega, sin navegador en la lógica (trozo 20 de #1407; 0134). Las llamadas, en
 * `.claude/skills/mercadona/referencias/pedido.md`:
 *   · crear el pedido: `POST …/checkouts/` con el carro escrito; nace con la dirección por defecto;
 *   · las franjas: `GET …/addresses/:direccion/slots/`; solo las libres, y se ofrecen las primeras;
 *   · reservar: `PUT …/checkouts/:pedido/delivery-info/` con la dirección del propio pedido y la franja tal como vino;
 *   · el teléfono: `PUT …/checkouts/:pedido/phone-number/` con lo que se abrió del sello (src/lib/mercadonaTelefono.js).
 * Nunca confirma el pedido: eso es pagar (trozo 21). La dirección no sale de la página: solo su id, para las franjas.
 */
import { totalDelCarro } from "./mercadonaCarro.mjs";
import { PEDIDO_MINIMO_MERCADONA } from "../../src/lib/mercadonaLista.js";
import { FALLO_ENCARGO_MERCADONA as FALLO } from "../../src/lib/mercadonaFallos.js";

/** Cuántas se ofrecen: las primeras libres, para elegir sin agobiar. El tope de la 0134 es 4. */
export const FRANJAS_QUE_SE_OFRECEN = 4;

/** Lo que se guarda de cada franja: lo que Mercadona pide de vuelta para reservarla, nada más. */
const CAMPOS_FRANJA = ["id", "start", "end", "price", "available", "open", "timezone"];

/** Pura. Las que se ofrecen de las que da Mercadona: solo las libres, por orden de hora, como mucho cuatro. */
export function franjasParaOfrecer(todas, cuantas = FRANJAS_QUE_SE_OFRECEN) {
  const sePuede = (f) => f && f.id != null && f.available === true && Number.isFinite(Date.parse(f.start)) && Date.parse(f.end) > Date.parse(f.start);
  return (Array.isArray(todas) ? todas : [])
    .filter(sePuede)
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
    .slice(0, cuantas)
    .map((f) => Object.fromEntries(CAMPOS_FRANJA.filter((k) => k in f).map((k) => [k, f[k]])));
}

// Corre dentro de su página, como enPagina (mercadonaPagina.mjs): la sesión y la dirección no salen de ahí.
//   { crear: carro }                     crea el pedido y pide las franjas de su dirección
//   { reservar: { pedido, franja, telefono } }  reserva la franja con la dirección del pedido, y pone el teléfono
export const enPaginaPedido = async (orden) => {
  let u = null;
  try {
    u = JSON.parse(localStorage.getItem("MO-user"));
  } catch {
    return { paso: "sesion", status: 0 };
  }
  if (!u?.token || !u?.uuid) return { paso: "sesion", status: 0 };
  const cabeceras = { "content-type": "application/json", authorization: `Bearer ${u.token}` };
  const base = `/api/customers/${u.uuid}/`;
  const pedir = (ruta, metodo = "GET", cuerpo) =>
    fetch(`${base}${ruta}?lang=es`, { method: metodo, headers: cabeceras, ...(cuerpo ? { body: JSON.stringify(cuerpo) } : {}) });

  if (orden.crear) {
    const { id, version, lines } = orden.crear;
    const c = await pedir("checkouts/", "POST", { cart: { id, version, lines } });
    if (!c.ok) return { paso: "crear_pedido", status: c.status };
    const pedido = await c.json();
    const direccion = pedido.address?.id;
    if (direccion == null) return { paso: "sin_direccion", status: c.status, pedido_xid: String(pedido.id), summary: pedido.summary ?? null };
    const f = await pedir(`addresses/${direccion}/slots/`);
    if (!f.ok) return { paso: "franjas", status: f.status, pedido_xid: String(pedido.id), summary: pedido.summary ?? null };
    const { results } = await f.json();
    return { paso: "franjas", status: f.status, pedido_xid: String(pedido.id), summary: pedido.summary ?? null, franjas: results ?? [] };
  }

  const { pedido, franja, telefono } = orden.reservar;
  const v = await pedir(`checkouts/${pedido}/`);
  if (!v.ok) return { paso: "ver_pedido", status: v.status };
  const { address } = await v.json();
  const r = await pedir(`checkouts/${pedido}/delivery-info/`, "PUT", { address, slot: franja });
  if (!r.ok) return { paso: "reservar", status: r.status };
  const reservado = await r.json();
  let telefonoPuesto = null;
  if (telefono) telefonoPuesto = (await pedir(`checkouts/${pedido}/phone-number/`, "PUT", telefono)).status;
  return { paso: "reservado", status: r.status, cambiable_hasta: reservado?.slot?.cutoff_time ?? null, telefono: telefonoPuesto };
};

/** Pura. Un status de Mercadona que no es un sí, en un fallo del vocabulario. */
const falloDe = (status) => (status === 401 ? FALLO.SESION_CADUCADA : status === 403 || status === 429 ? FALLO.BLOQUEADO : FALLO.ERROR);

/**
 * Tras el carro, el pedido y sus franjas. Lo que se suma al cierre de la lista: `{ pedido: { pedido_xid, total,
 * franjas } }` o `{ fallo }` (la lista ya está: el servidor la guarda igual, 0134). Por debajo del mínimo no se
 * tramita: Mercadona no deja, y crear un pedido a medias que no sirve deja basura en la cuenta.
 * @param {{ id, version, lines, summary }} carro el que devolvió Mercadona al escribirlo
 */
export async function pedirFranjas(pagina, carro) {
  const total = totalDelCarro(carro);
  if (total === null || total < PEDIDO_MINIMO_MERCADONA) return { fallo: FALLO.BAJO_MINIMO };
  const r = await pagina.evaluate(enPaginaPedido, { crear: carro });
  if (r.paso === "sesion") return { fallo: FALLO.SESION_CADUCADA };
  if (r.paso === "crear_pedido") return { fallo: falloDe(r.status) };
  if (r.paso === "sin_direccion") return { fallo: FALLO.SIN_DIRECCION };
  if (!r.franjas) return { fallo: falloDe(r.status) };
  const franjas = franjasParaOfrecer(r.franjas);
  if (!franjas.length) return { fallo: FALLO.SIN_FRANJAS };
  return { pedido: { pedido_xid: r.pedido_xid, total: totalDelCarro({ summary: r.summary }) ?? total, franjas } };
}

/**
 * Reserva la franja elegida y pone el teléfono: `{ cambiable_hasta }` o `{ fallo }`. Si Mercadona no deja reservarla
 * (400, 409 o 422: se ocupó entre medias, o ya no vale), `franja_ocupada`. Un teléfono que no entra no deshace la
 * reserva: se cuenta en el log y la persona lo pone al pagar.
 */
export async function reservarFranja(pagina, { pedido_xid, franja, telefono = null }, log = () => {}) {
  const r = await pagina.evaluate(enPaginaPedido, { reservar: { pedido: pedido_xid, franja, telefono } });
  if (r.paso === "sesion") return { fallo: FALLO.SESION_CADUCADA };
  if (r.paso === "reservar" && [400, 409, 422].includes(r.status)) return { fallo: FALLO.FRANJA_OCUPADA };
  if (r.paso !== "reservado") return { fallo: falloDe(r.status) };
  if (telefono && !(r.telefono >= 200 && r.telefono < 300)) log(`teléfono sin poner: ${r.telefono}`);
  return { cambiable_hasta: Number.isFinite(Date.parse(r.cambiable_hasta)) ? new Date(r.cambiable_hasta).toISOString() : null };
}
