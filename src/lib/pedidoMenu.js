/**
 * Qué falta para este pedido de menú (trozo 65 de #1037, tramo 10): cruza el camino con sus temas y con lo que la casa ya
 * sabe (ejesDeCasa.js). Se calcula en cada turno y no se guarda: los ejes no se copian al pedido. Puro.
 */
import { NIVEL_EJE, TEMAS, temasDelCamino } from "./caminos.js";
import { ESTADO_EJE } from "./ejesDeCasa.js";
import { DIAS } from "./dias.js";

const falta = (ejes, e) => ejes[e.dato]?.estado === ESTADO_EJE.FALTA;
const conFalta = (ejes, t) => t.ejes.some((e) => falta(ejes, e));

/** Pura. La semana que ya tiene menú en esta fecha, o null. */
export const menuEnFecha = (semanas, fecha) => (fecha
  ? (semanas ?? []).find((w) => w.plan && w.weekStart <= fecha && fecha <= w.weekEnd) ?? null
  : null);

/**
 * Pura.
 * `ejes`: el de ejesDeCasa. Sin ellos lanza: un fallo de lectura no es «la casa lo sabe todo» y no salta lo de seguridad.
 * `forzado`: dijeron «sigue tú». Lo de nivel `bloquea` no se salta aunque lo digan.
 * @returns {{ bloquea: string[], temas: string[], supuestos: string[], faltaFecha: boolean, pisa: object|null, listo: boolean }}
 *   `bloquea`: datos sin los que no se genera. `temas`: los temas por preguntar, en orden; el primero es la siguiente
 *   pregunta. `supuestos`: datos del camino que Lola debe decir que da por supuestos. `pisa`: la semana que se rehace.
 */
export function faltaDelPedido({ camino, desde = null, forzado = false, ejes = null, hayNinos = false, semanas = [] }) {
  if (!ejes) throw new Error("faltaDelPedido: sin ejes no se sabe qué falta");
  const delCamino = temasDelCamino(camino, { hayNinos }).map((id) => TEMAS.find((t) => t.id === id));
  // En todos los temas: una casa con solo un bebé no tiene «niños» y la etapa del bebé bloquea igual (sin bebé, `no_aplica`).
  const bloquea = TEMAS.flatMap((t) => t.ejes).filter((e) => e.nivel === NIVEL_EJE.BLOQUEA && falta(ejes, e)).map((e) => e.dato);
  const temas = forzado ? [] : delCamino.filter((t) => conFalta(ejes, t)).map((t) => t.id);
  const supuestos = [...new Set(delCamino.flatMap((t) => t.ejes).filter((e) => ejes[e.dato]?.estado === ESTADO_EJE.SUPUESTO).map((e) => e.dato))];
  const faltaFecha = !desde && !forzado;
  return { bloquea: [...new Set(bloquea)], temas, supuestos, faltaFecha, pisa: menuEnFecha(semanas, desde), listo: !bloquea.length && !temas.length && !faltaFecha };
}

/** Pura. Los días con plato en un plan, en orden; sin plan, la semana entera. */
function diasDelPlan(plan) {
  const con = new Set(Object.entries(plan ?? {}).filter(([g]) => !g.startsWith("_")).flatMap(([, huecos]) => Object.keys(huecos ?? {}).map((k) => k.split("-")[0])));
  return con.size ? DIAS.filter((d) => con.has(d)) : DIAS;
}

/**
 * Pura. Lo que Lola dice antes de pisar una semana con menú (trozo 72): qué días se quedan, qué se pierde y qué pasa
 * con la compra. Los platos cambiados a mano no llevan marca, así que se dice por días y no plato a plato.
 * `startDayIdx`: desde qué día se rehace (resolverSemana, api/_bot/semanaPedida.js).
 */
export function avisoDeRehacer({ existente, startDayIdx = 0 }) {
  const dias = diasDelPlan(existente?.plan);
  const seQuedan = dias.filter((d) => DIAS.indexOf(d) < startDayIdx);
  const cambian = dias.filter((d) => DIAS.indexOf(d) >= startDayIdx);
  const quedan = seQuedan.length ? `Se quedan ${seQuedan.join(", ")}. ` : "";
  return `${quedan}Se rehacen ${cambian.join(", ")}: si cambiasteis algún plato de esos días, se pierde. La compra sale del menú nuevo; lo añadido a mano se queda.`;
}
