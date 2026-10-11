/**
 * nube.mjs — ¿la sesión corre en la nube y no en el PC de Pablo? (#635)
 *
 * Una sola decisión para la guardia y el arranque. Sin imports a propósito: la
 * guardia carga este fichero junto a ella y no debe arrastrar nada más.
 */

/**
 * ¿Es esta una sesión de la nube (#635, fondo #622)? Allí el único clon,
 * `/home/user/MenuPlan`, está en una rama `ccr-…` que fija la plataforma, y no
 * es la carpeta principal de Pablo (`C:\\dev\\MenuPlan`): se trata como carpeta
 * de tarea. Hacen falta las TRES señales a la vez:
 *   1. `CLAUDE_CODE_REMOTE` valga exactamente `true` (`false`, vacío o «1» no);
 *   2. la rama empiece por `ccr-` y sea un nombre simple;
 *   3. la ruta no sea de Windows (letra de unidad o barra invertida) ni corra
 *      en Windows: la principal real del PC de Pablo nunca pasa por aquí.
 * Falla cerrado: entorno, rama o ruta ilegibles dan false, y entonces manda la
 * regla de siempre. Ninguna señal es infalsificable (quien lance el proceso
 * pone la variable); por eso la ruta y la plataforma importan: poner la
 * variable en el PC de Pablo no abre su carpeta. Comprobar el origin no
 * añadiría nada, porque también lo controla quien tiene el clon.
 */
export function esSesionDeNube(env, rama, ruta = "", plataforma = process.platform) {
  try {
    if (!env || typeof env !== "object" || env.CLAUDE_CODE_REMOTE !== "true") return false;
    if (typeof rama !== "string" || !/^ccr-[A-Za-z0-9._-]+$/.test(rama)) return false;
    if (plataforma === "win32") return false;
    if (typeof ruta !== "string" || /^[A-Za-z]:|\\/.test(ruta)) return false;
    return true;
  } catch {
    // a propósito: un entorno que lanza al leerse (getter hostil) no es la nube; falla cerrado
    return false;
  }
}
