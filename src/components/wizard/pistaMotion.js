import { useEffect, useState } from "react";

/**
 * Lo que acompaña a `Pista.jsx` y no es un componente: los estilos del input
 * transparente y el interruptor de la animación.
 *
 * Vive aparte porque un fichero que exporta componentes Y funciones rompe el
 * Fast Refresh de Vite (react-refresh/only-export-components), y en una
 * pantalla que se itera a base de recargar, perder el refresco en caliente se
 * nota en cada cambio.
 */

/**
 * Los estilos del input nativo, que va transparente encima de la pista.
 *
 * El pulgar nativo se esconde y el que se ve es un div, porque la posición de
 * un `::-webkit-slider-thumb` no se puede animar por CSS — y el gesto central
 * de esta pantalla es que el control se VEA moverse cuando lo mueve el agente.
 * El input sigue debajo haciendo lo único que hace bien: recoger el arrastre y
 * el toque en cualquier punto de la pista.
 */
export function estilosDePista() {
  return `
    .mp-pista {
      -webkit-appearance: none; appearance: none;
      position: relative; z-index: 1;
      width: 100%; height: 22px; margin: 0;
      background: transparent; outline: none; cursor: pointer;
      touch-action: none;
    }
    .mp-pista::-webkit-slider-runnable-track { background: transparent; height: 4px; }
    .mp-pista::-moz-range-track { background: transparent; height: 4px; border: none; }
    .mp-pista::-webkit-slider-thumb {
      -webkit-appearance: none; width: 26px; height: 26px;
      border-radius: 50%; background: transparent; border: none; margin-top: -11px;
    }
    .mp-pista::-moz-range-thumb {
      width: 26px; height: 26px; border: none; border-radius: 50%; background: transparent;
    }
    .mp-pista:focus-visible { outline: 2px solid #2d5a3d; outline-offset: 2px; border-radius: 4px; }
  `;
}

/**
 * El interruptor de la animación: se enciende cuando cambia QUIÉN se ha
 * movido, y se apaga sola.
 *
 * Compara por CONTENIDO y no por referencia porque el padre pasa un array
 * literal: comparar identidades reencendería la animación en cada render y el
 * pulgar no pararía de deslizarse.
 */
export function useAnimacionDelAgente(movidas, ms = 700) {
  const clave = movidas.join(",");
  const [animando, setAnimando] = useState(false);
  const [ultima, setUltima] = useState(clave);

  if (clave !== ultima) {
    // Se decide durante el render y no en un efecto: así el primer frame tras
    // el cambio ya sale con la transición puesta. Con `useEffect` el pulgar
    // daría un salto seco antes de empezar a animarse, que es justo lo que
    // esto existe para evitar.
    setUltima(clave);
    setAnimando(Boolean(clave));
  }

  useEffect(() => {
    if (!animando) return;
    const t = setTimeout(() => setAnimando(false), ms);
    return () => clearTimeout(t);
  }, [animando, ms]);

  return animando;
}
