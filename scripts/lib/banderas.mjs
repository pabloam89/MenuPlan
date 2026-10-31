// Las banderas de la app que salen de la rama del despliegue. Un solo sitio:
// de aquí las saca el build (vite.config.js, que las mete en
// import.meta.env) y la prueba de punta a punta (playwright.config.js, que
// imita el despliegue de staging).

// La rama de staging, la que imita la prueba de punta a punta.
export const RAMA_STAGING = "staging";
const RAMA_PRODUCCION = "main";

/**
 * Las banderas para una rama. `leer(nombre)` devuelve lo que traiga el
 * entorno, que pisa a lo que diga la rama.
 *
 * - VITE_MOTOR: qué motor asigna los platos (ver solverActivo en
 *   src/lib/solver.js). En los builds de `staging` y de `main` (producción,
 *   desde el 30 sep 2026) el solver va encendido por defecto; en local y en
 *   las ramas de preview sigue el modelo (y los tests cuentan con eso). Un
 *   navegador concreto puede volver al modelo con localStorage.mp_motor.
 * - VITE_PIZARRA: empezar un menú vacío y rellenarlo a mano (ver
 *   pizarraActiva en src/lib/pizarra.js). Encendida en `staging` y en
 *   producción, apagada en local.
 * - VITE_GUIAS: carrusel de presentación y visitas guiadas (GUIAS_ACTIVAS en
 *   App.jsx). Apagadas en `staging`, donde el bot de Telegram hace de guía;
 *   encendidas en producción hasta que el frontal de Lola llegue allí.
 */
export function banderas(rama, leer = () => "") {
  const desplegada = rama === RAMA_STAGING || rama === RAMA_PRODUCCION;
  return {
    VITE_MOTOR: leer("VITE_MOTOR") || (desplegada ? "solver" : "modelo"),
    VITE_PIZARRA: leer("VITE_PIZARRA") || (desplegada ? "on" : "off"),
    VITE_GUIAS: leer("VITE_GUIAS") || (rama === RAMA_STAGING ? "off" : "on"),
  };
}
