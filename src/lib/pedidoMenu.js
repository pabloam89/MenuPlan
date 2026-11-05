/**
 * Qué falta para este pedido de menú (trozo 65 de #1037, tramo 10): cruza el camino con sus temas y con lo que la casa ya
 * sabe (ejesDeCasa.js). Se calcula en cada turno y no se guarda: los ejes no se copian al pedido. Puro.
 */
import { NIVEL_EJE, TEMAS, temasDelCamino } from "./caminos.js";
import { ESTADO_EJE } from "./ejesDeCasa.js";

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
  const aplicables = TEMAS.filter((t) => hayNinos || !t.soloNinos);
  const bloquea = aplicables.flatMap((t) => t.ejes).filter((e) => e.nivel === NIVEL_EJE.BLOQUEA && falta(ejes, e)).map((e) => e.dato);
  const temas = forzado ? [] : delCamino.filter((t) => conFalta(ejes, t)).map((t) => t.id);
  const supuestos = [...new Set(delCamino.flatMap((t) => t.ejes).filter((e) => ejes[e.dato]?.estado === ESTADO_EJE.SUPUESTO).map((e) => e.dato))];
  const faltaFecha = !desde && !forzado;
  return { bloquea: [...new Set(bloquea)], temas, supuestos, faltaFecha, pisa: menuEnFecha(semanas, desde), listo: !bloquea.length && !temas.length && !faltaFecha };
}
