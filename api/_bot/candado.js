/**
 * Cuánto dura el candado de un chat (bot_tomar_candado, 0063). Vive aparte de
 * turnos.js para que lo lean turnos.js y caducidades.js (la vida de la cola
 * sin dueño, #958) sin que quien simula turnos.js en un test tenga que
 * simularlo también.
 */

// Más que maxDuration (120): caduca solo si la función muere.
export const DURACION_CANDADO_S = 150;
