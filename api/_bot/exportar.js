/**
 * Exportar una casa (trozo 36 de #1037): lee, con la service role, cada tabla de TABLAS_EXPORTADAS
 * (src/lib/exportarCasa.js) con las filas de esa casa, y las arma en un JSON con armarExportacion.
 * Quién la llama: GET /api/operacion?casa=<uuid>&exportar=1, que antes mira que quien pide es de la casa.
 *
 * Lee por la lista, no tabla a tabla en el código: cableado (scripts/cableado.mjs) no ve estas lecturas, y por
 * eso la lista la ata a las migraciones su propio test (exportarCasa.test.js). Si una tabla falla, falla la
 * exportación entera: una exportación a medias no se da por buena (armarExportacion).
 */
import { select, eq } from "./db.js";
import { identidadesDe } from "./papel.js";
import { armarExportacion, columnaDeCasa, LIMITE_FILAS, TABLAS_EXPORTADAS } from "../../src/lib/exportarCasa.js";

/**
 * El JSON de una casa con todas sus tablas, para `userId` (quien exporta: su chat privado y sus tareas personales sí,
 * los de las demás personas no). Lanza si alguna tabla no se puede leer.
 */
export async function exportarCasa(householdId, userId, ahora = new Date()) {
  const propios = (await identidadesDe(userId)).map((i) => i.external_id);
  const leidas = {};
  // Una a una: son ~30 lecturas pequeñas y así una casa grande no dispara 30 peticiones a la vez.
  for (const tabla of TABLAS_EXPORTADAS) {
    leidas[tabla] = await select(tabla, `${columnaDeCasa(tabla)}=${eq(householdId)}&limit=${LIMITE_FILAS + 1}`);
  }
  return armarExportacion({ casa: householdId, leidas, quien: { userId, propios }, ahora });
}
