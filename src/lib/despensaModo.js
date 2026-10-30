/**
 * Cómo usa la casa su despensa (`data.pantryMode`: "off" | "prefer" | "only" | "strict").
 *
 * `data.useHomeStock` es el booleano heredado que va a la par (off ⇄ false): un
 * derivado de `pantryMode` (registroFicha.js) que hasta el 30 oct 2026 se calculaba
 * con la misma expresión en tres sitios (App.jsx, OnboardingPantryMode y
 * api/_bot/ajustes.js). Aquí vive una vez; el inventario (`npm run ficha:inventario`)
 * comprueba que la función existe.
 */

/** El modo en que la despensa no cuenta para el menú. */
const DESPENSA_APAGADA = "off";

/** Si la despensa cuenta para el menú: todo modo salvo «off» (también sin modo, como en las casas viejas). */
export const usaDespensa = (pantryMode) => pantryMode !== DESPENSA_APAGADA;
