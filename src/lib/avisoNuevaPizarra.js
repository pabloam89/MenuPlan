/**
 * Empezar una pizarra en blanco cuando ya hay un menú con platos.
 *
 * «Nueva» pone un menú vacío como el de la semana. Con cuenta, el de antes no
 * se pierde (pasa a «Menús guardados», `foldInNewMenu` en menuArchive.js); sin
 * cuenta, no hay histórico y se borra. Hasta noviembre de 2026 pasaba sin
 * decir nada, y quien solo quería retocar dos platos pisaba el menú entero
 * (Pablo, 3 nov: «pisas menús como quien pisa camisetas»). Ahora se avisa antes,
 * y el aviso dice qué le pasa al menú de ahora.
 */

import { recuentoDelMenu } from "./menuRecuento.js";

/** El título del aviso, el mismo con cuenta y sin ella. */
const TITULO = "¿Empezar un menú nuevo?";

/**
 * Pura. El aviso antes de empezar en blanco, o null si no hace falta: el menú
 * de ahora no tiene ningún hueco con plato (ni primero ni segundo), contados
 * con el recuento de siempre (recuentoDelMenu, menuRecuento.js).
 */
export function avisoAlEmpezar({ plan, conCuenta }) {
  if (!recuentoDelMenu(plan, null).huecos) return null;
  return {
    titulo: TITULO,
    texto: conCuenta ? "El de ahora no se borra: queda en «Menús»." : "Sin cuenta no se guardan menús: el de ahora se borra.",
  };
}
