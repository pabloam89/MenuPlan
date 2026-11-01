/**
 * Cómo usa la despensa el menú al generar, en un solo sitio para la app (App.jsx) y Lola (api/_bot/generar.js).
 *
 * `useHomeStock` era el booleano viejo que la app y Lola guardaban a la par de `pantryMode` (off ⇄ false) y que
 * nadie leía: es un derivado (plan fichas con estado, «Las cuatro clases de dato»; trozo 12 de #1037), así que ya
 * no se guarda y se calcula aquí al leer (usaDespensa).
 *
 * Sin import.meta ni Supabase: el servidor lo importa tal cual.
 */
import { MODOS_DESPENSA } from "./vocabularios.js";

/** Los modos que entiende el motor (aiPlanner.js, buildUserMessage): el vocabulario modo_despensa de pantryMode. */
export const MODOS_DESPENSA_MOTOR = MODOS_DESPENSA;

/** Pura. El modo con que se genera: el guardado si es uno del motor; si no, "off" (no se asume nada). */
export function modoDespensaAlGenerar(data) {
  const modo = data?.pantryMode;
  return MODOS_DESPENSA_MOTOR.includes(modo) ? modo : "off";
}

/** Pura. ¿El menú parte de lo que hay en casa? Lo que antes se guardaba como `useHomeStock`. */
export const usaDespensa = (data) => modoDespensaAlGenerar(data) !== "off";

/** Pura. Los datos de la casa sin el `useHomeStock` que traiga una casa vieja: no se vuelve a guardar. */
export function sinUseHomeStock(data) {
  const { useHomeStock: _viejo, ...resto } = data ?? {};
  return resto;
}
