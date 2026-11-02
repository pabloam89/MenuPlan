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
// Por contenido y no por referencia: un plan que ha ido y vuelto de la base (o de otra pestaña) no comparte objetos.
const mismoSobre = (a, b) => Boolean(b) && JSON.stringify(a) === JSON.stringify(b);

export function sellarCambios(viejo, nuevo, sobre) {
  let out = null;
  for (const [g, huecos] of gruposDelPlan(nuevo)) {
    let grupo = null;
    for (const [k, h] of Object.entries(huecos ?? {})) {
      if (!h) continue;
      const antes = viejo?.[g]?.[k];
      const mismo = antes && platosDe(antes) === platosDe(h);
      const sello = mismo ? (h.sobre ?? antes.sobre) : h.sobre && !mismoSobre(h.sobre, antes?.sobre) ? h.sobre : sobre;
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

/** Quién puso un plato, por el canal de su sobre (sobreHueco.js): uno por cada canal de CANALES_DATO. */
export const QUIEN_PUSO = Object.freeze({
  [CANAL_DATO.SISTEMA]: "el menú automático",
  [CANAL_DATO.APP]: "alguien de casa, a mano en la app",
  [CANAL_DATO.TELEGRAM]: "Lola, por el chat",
  [CANAL_DATO.WHATSAPP]: "Lola, por el chat",
});

/**
 * Pura. Por qué hay un plato en un hueco (trozo 18): quién lo puso y cuándo, y, si fue el motor, las preferencias de
 * la casa que lo pidieron (en palabras, textoDe). Un hueco sin sobre es de antes de que se apuntara, y se dice.
 * @param {object} hueco el del plan (`slot`)
 * @param {object[]} prefs las de la casa que pesa el motor (preferenciasDelMotor), para poner nombre a los ids
 * @param {(p: object) => string} textoDe la de cumplimiento.js (se pasa: Lola la toma del motor, porque importarla arrastra .jsx)
 */
export function porQueElPlato(hueco, prefs, textoDe) {
  const s = hueco?.sobre;
  if (!s) return "No está apuntado quién lo puso: es de antes de que se guardara.";
  const quien = `Lo puso ${QUIEN_PUSO[s.canal] ?? s.canal}${s.cuando ? ` (${String(s.cuando).slice(0, 10)})` : ""}.`;
  if (s.canal !== CANAL_DATO.SISTEMA) return quien;
  if (!s.motivo?.length) return `${quien} Ninguna preferencia de la casa lo pedía en concreto.`;
  const porId = new Map((prefs ?? []).map((p) => [p.id, p]));
  const motivos = s.motivo.map((id) => (porId.has(id) ? textoDe(porId.get(id)) : "una preferencia que ya no está"));
  return `${quien} Lo pidió lo que hay apuntado en la casa: ${[...new Set(motivos)].join("; ")}.`;
}
