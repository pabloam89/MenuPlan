/**
 * Tras borrar a una persona (escribir_persona, 0108), quitarla de las fotos para deshacer de la casa
 * que ya no se pueden usar (`bot_deshacer.antes`, que guardan la casa entera con su familia). Qué pasa con lo demás suyo, tabla por tabla:
 * AL_BORRAR_PERSONA en src/lib/borrarPersona.js, que es puro; aquí solo se lee y se escribe.
 *
 * Lo llama escribirPersonas (datos.js), que usan la app y Lola, cuando la familia se ha guardado con alguien borrado.
 * No lanza: la persona ya está borrada y repetir el borrado no arregla esto. Si no puede, lo dice con avisarFallo
 * («borrar_persona_fotos») y devuelve null.
 *
 * Solo las de antes del borrado (`bot_rev_despues` menor que la versión que deja escribir_persona): deshacer (casa.js)
 * solo usa la foto cuya versión es la de la casa, así que esas ya no sirven para nada. La del propio borrado, si lo
 * hizo Lola, se queda: con ella «deshaz» devuelve a la persona, y quitarla haría que Lola dijera «deshecho» sin
 * devolverla. Esa rota con las demás (10 por casa, casa.js).
 */
import { select, update, eq } from "./db.js";
import { avisarFallo } from "./avisar.js";
import { anonimizarFoto } from "../../src/lib/borrarPersona.js";

/**
 * @param {string} householdId
 * @param {string[]} personas  los ids borrados
 * @param {number} rev  la versión de la casa tras el borrado (`rev` de escribir_persona)
 * @returns {Promise<number | null>}  cuántas fotos cambió, o null si falló
 */
export async function quitarDeLasFotos(householdId, personas, rev) {
  if (!householdId || !personas?.length) return 0;
  try {
    if (!Number.isFinite(rev)) throw new Error("sin la versión de la casa tras el borrado");
    const fotos = await select("bot_deshacer", `household_id=${eq(householdId)}&bot_rev_despues=lt.${rev}`, "id,antes");
    let tocadas = 0;
    for (const f of fotos) {
      const antes = anonimizarFoto(f.antes, personas);
      if (!antes) continue;
      await update("bot_deshacer", `id=${eq(f.id)}`, { antes });
      tocadas += 1;
    }
    return tocadas;
  } catch (e) {
    avisarFallo("borrar_persona_fotos", e);
    return null;
  }
}
