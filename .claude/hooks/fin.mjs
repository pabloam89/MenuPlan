/**
 * fin.mjs — la sesión se borra del registro al cerrarse (SessionEnd).
 * Ver sesiones.mjs. Nunca falla.
 */
import { dirSesiones, quitar } from "./sesiones.mjs";

let crudo = "";
for await (const trozo of process.stdin) crudo += trozo;
try {
  const { session_id: id, cwd } = JSON.parse(crudo);
  quitar(dirSesiones(cwd || process.cwd()), id);
} catch {
  // a propósito: sin entrada legible no hay nada que borrar; la ficha caduca sola (sesiones.mjs)
}
