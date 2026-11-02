/**
 * El sobre de cada hueco de la semana (plan fichas con estado, trozo 18): quién puso el plato y cuándo. El canal dice
 * quién fue: `sistema` es el motor al generar, `app` un cambio a mano en la app y `telegram`/`whatsapp` Lola. El motor
 * deja además el motivo: los ids de las preferencias de la casa que pidieron ese plato (cumplimiento.js). La forma del
 * plan por semana se queda (un documento por semana): el sobre va dentro de cada hueco, en `slot.sobre`.
 *
 * Antes un hueco no decía quién lo cambió ni cuándo (#958). Puro: sin base, red ni reloj (la hora llega de fuera).
 */
import { CANAL_DATO } from "./vocabularios.js";

const platosDe = (slot) => `${slot?.firstRecipeId ?? ""}|${slot?.recipeId ?? ""}`;

/** Los grupos del plan (sin las claves `_…`, que no son grupos: avisos, versiones). */
export const gruposDelPlan = (plan) => Object.entries(plan ?? {}).filter(([g]) => !g.startsWith("_"));

/**
 * El plan `nuevo` con su sobre en cada hueco que cambió de plato respecto a `viejo`: un hueco con el mismo plato
 * conserva el suyo; uno con otro plato (o nuevo) lleva `sobre`, salvo que ya traiga uno propio (quien lo cambió ya lo
 * selló, como el motor). Si nada cambia, devuelve `nuevo` tal cual (el mismo objeto: quien compara no entra en bucle).
 * @param {object | null | undefined} viejo
 * @param {object} nuevo
 * @param {{ canal: string, cuando: string, quien?: string | null }} sobre
 */
export function sellarCambios(viejo, nuevo, sobre) {
  let out = null;
  for (const [g, huecos] of gruposDelPlan(nuevo)) {
    let grupo = null;
    for (const [k, h] of Object.entries(huecos ?? {})) {
      if (!h) continue;
      const antes = viejo?.[g]?.[k];
      const mismo = antes && platosDe(antes) === platosDe(h);
      const sello = mismo ? (h.sobre ?? antes.sobre) : h.sobre && h.sobre !== antes?.sobre ? h.sobre : sobre;
      if (!sello || sello === h.sobre) continue;
      grupo ??= { ...huecos };
      grupo[k] = { ...h, sobre: sello };
    }
    if (grupo) (out ??= { ...nuevo })[g] = grupo;
  }
  return out ?? nuevo;
}

/**
 * El sobre de un hueco puesto por el motor: canal `sistema` y, si alguna preferencia lo pidió, sus ids.
 * @param {string} cuando
 * @param {string[]} motivo
 */
export const sobreDelMotor = (cuando, motivo) => ({ canal: CANAL_DATO.SISTEMA, cuando, ...(motivo.length ? { motivo } : {}) });
