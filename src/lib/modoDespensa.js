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
import { DATOS_CASA } from "./registroFicha.js";

/** Los modos que entiende el motor (aiPlanner.js, buildUserMessage): el vocabulario modo_despensa de pantryMode. */
export const MODOS_DESPENSA_MOTOR = MODOS_DESPENSA;

/**
 * Cómo usa el menú lo que hay en casa, en palabras, por modo del motor: lo dicen la herramienta de Lola
 * (agente.js), lo que contesta al guardarlo (ajustes.js) y su ficha (ficha.js). El asistente de la app ofrece
 * strict y only; prefer y off siguen valiendo, y sin off «deja de usar lo de casa» no se podía hacer (#958).
 */
export const MODOS_DESPENSA_TEXTO = Object.freeze({
  strict: "solo con lo de casa, sin comprar salvo que un hueco no salga de otra forma",
  only: "sobre todo lo de casa, y se compra lo que falte",
  prefer: "con lo de casa solo para desempatar entre platos",
  off: "sin mirar lo de casa (la compra sigue descontando lo que tengas)",
});

/** Pura. El modo con que se genera: el guardado si es uno del motor; si no, "off" (no se asume nada). */
export function modoDespensaAlGenerar(data) {
  const modo = data?.pantryMode;
  return MODOS_DESPENSA_MOTOR.includes(modo) ? modo : "off";
}

/**
 * Pura. El modo de la casa al cargarla (normalización de App.jsx): el leído si es uno del motor, «off» incluido;
 * si falta o no se entiende, el defecto del registro («only»). Ya no hay marca `pantryModeSet` (trozo 12 de
 * #1037): con la 0112 el modo sale de su sobre, que ya dice si lo dijo alguien; sin ella, el del documento cuenta
 * como dicho, como cookLevel en el PR 6.
 */
export const modoDespensaAlCargar = (modo) => (MODOS_DESPENSA_MOTOR.includes(modo) ? modo : DATOS_CASA.pantryMode.defecto);

/** Pura. ¿El menú parte de lo que hay en casa? Lo que antes se guardaba como `useHomeStock`. */
export const usaDespensa = (data) => modoDespensaAlGenerar(data) !== "off";

/** Pura. Los datos de la casa sin el `useHomeStock` que traiga una casa vieja: no se vuelve a guardar. */
export function sinUseHomeStock(data) {
  const { useHomeStock: _viejo, ...resto } = data ?? {};
  return resto;
}
