// Lo que la app le pide a Lola al abrir el chat desde un sitio concreto
// («cambia este plato», «hazme el menú»), metido en el `/start` de Telegram.
//
// El payload de /start admite 64 caracteres [A-Za-z0-9_-]. Con sesión va
// detrás del código de enlace (22 caracteres): `<código>-<pedido>`; sin
// sesión, solo `p-<pedido>`. Lo lee api/bot/telegram.js y lo convierte en la
// frase que el usuario habría escrito, así que Lola lo atiende como siempre.
//
// Pedidos:
//   g / gs                  → hazme el menú de esta semana / de la que viene
//   c<AAAAMMDD><franja><n>  → cambiar un plato: franja D C M N P (desayuno,
//                             comida, merienda, cena, postre), n 1 = primero,
//                             2 = principal (opcional)
// Compartido entre la app y el bot: el mismo código escribe y lee.

const FRANJAS = { D: "Desayuno", C: "Comida", M: "Merienda", N: "Cena", P: "Postre" };
const LETRA = Object.fromEntries(Object.entries(FRANJAS).map(([k, v]) => [v, k]));
const ARTICULO = { Desayuno: "el desayuno", Comida: "la comida", Merienda: "la merienda", Cena: "la cena", Postre: "el postre" };
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

const LARGO_CODIGO = 22;

/** Pedido de menú: «esta» o «siguiente». */
export const pedidoMenu = (semana = "esta") => (semana === "siguiente" ? "gs" : "g");

/**
 * Pedido de cambiar un plato. `franja` con el nombre de la app («Cena»),
 * `cual` "primero" | "principal" (opcional). Null si falta algo.
 */
export function pedidoCambiar({ fechaISO, franja, cual = null }) {
  const f = LETRA[franja];
  if (!f || !/^\d{4}-\d{2}-\d{2}$/.test(fechaISO ?? "")) return null;
  return `c${fechaISO.replaceAll("-", "")}${f}${cual === "primero" ? "1" : cual === "principal" ? "2" : ""}`;
}

/** El payload de /start: con el código de enlace si lo hay. */
export const payloadStart = (codigo, pedido) => (codigo ? `${codigo}-${pedido}` : `p-${pedido}`);

/**
 * El payload de /start partido: `{ codigo, pedido }`, o null si no es de los
 * nuestros (un código a secas sigue siendo `{ codigo, pedido: null }`).
 */
export function partirStart(payload) {
  if (typeof payload !== "string") return null;
  if (payload.length === LARGO_CODIGO) return { codigo: payload, pedido: null };
  if (payload.length > LARGO_CODIGO + 1 && payload[LARGO_CODIGO] === "-") {
    return { codigo: payload.slice(0, LARGO_CODIGO), pedido: payload.slice(LARGO_CODIGO + 1) };
  }
  if (payload.startsWith("p-") && payload.length < LARGO_CODIGO) return { codigo: null, pedido: payload.slice(2) };
  return null;
}

/**
 * La frase que habría escrito la persona, o null si el pedido no se entiende.
 * `hoyISO` para decir «de la semana que viene» cuando toca.
 */
export function fraseDePedido(pedido, hoyISO) {
  if (pedido === "g") return "Hazme el menú de esta semana.";
  if (pedido === "gs") return "Hazme el menú de la semana que viene.";
  const m = /^c(\d{4})(\d{2})(\d{2})([DCMNP])([12])?$/.exec(pedido ?? "");
  if (!m) return null;
  const [, a, mes, d, f, n] = m;
  const fecha = new Date(Date.UTC(+a, +mes - 1, +d, 12));
  if (Number.isNaN(fecha.getTime())) return null;
  const franja = FRANJAS[f];
  const plato = n === "1" ? `el primero de ${ARTICULO[franja]}` : ARTICULO[franja];
  let cuando = `del ${DIAS[fecha.getUTCDay()]} ${+d} de ${MESES[+mes - 1]}`;
  if (hoyISO) {
    const hoy = new Date(`${hoyISO}T12:00:00Z`);
    const lunesQueViene = new Date(hoy);
    lunesQueViene.setUTCDate(hoy.getUTCDate() + ((8 - hoy.getUTCDay()) % 7 || 7));
    if (`${a}-${mes}-${d}` === hoyISO) cuando = "de hoy";
    else if (fecha >= lunesQueViene) cuando += " (la semana que viene)";
  }
  return `Quiero cambiar ${plato} ${cuando}.`;
}
