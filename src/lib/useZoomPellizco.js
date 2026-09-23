/**
 * El zoom continuo de la pizarra: pellizcar para ver la semana en mosaico o
 * con las fotos grandes.
 *
 * ── Por qué continuo y no por pasos ───────────────────────────────────────
 * La pizarra ya no tiene pestañas Día / Semana: todo es la semana, y lo que
 * cambia es cuánto te acercas. Un gesto que salta entre tres tallas se siente
 * como un botón escondido; uno que sigue a los dedos se siente como mirar una
 * pizarra de verdad. El tamaño de cada tarjeta sale del factor (ver DeckWeek).
 *
 * ── Qué hace con el navegador ─────────────────────────────────────────────
 * El viewport ya lleva `user-scalable=no`, pero Safari lo ignora y lanza sus
 * `gesture*`: se cancelan DENTRO del tablero para que el pellizco sea nuestro
 * y no un zoom de la página entera. En escritorio, el pellizco del trackpad
 * llega como `wheel` con `ctrlKey`, que es lo que hacen Figma o Maps.
 *
 * ── El punto bajo los dedos se queda donde está ───────────────────────────
 * Sin esto, acercarte al jueves te llevaba al sábado: las filas crecen hacia
 * abajo y el scroll no se mueve. Se guarda qué fracción del tablero había bajo
 * el centro del pellizco y, al repintar, se desplaza la ventana para que esa
 * misma fracción vuelva a caer bajo los dedos.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

export const ZOOM_MIN = 0.55;
export const ZOOM_MAX = 1.75;
const CLAVE = "mp_pizarra_zoom";

const acotar = (z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));

function leerGuardado() {
  try {
    const v = Number(localStorage.getItem(CLAVE));
    return Number.isFinite(v) && v > 0 ? acotar(v) : 1;
  } catch {
    return 1;
  }
}

function guardar(z) {
  try {
    localStorage.setItem(CLAVE, String(Math.round(z * 100) / 100));
  } catch {
    // Safari en privado: el zoom vale para esta visita y ya.
  }
}

const distancia = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);

/**
 * @param {boolean} activo  solo la pizarra lo enciende.
 * @returns {{ ref: (el: HTMLElement | null) => void, zoom: number, setZoom: (z: number) => void }}
 *   `ref` es un callback ref: el tablero se monta y desmonta con el menú, y
 *   los oyentes tienen que engancharse al nodo que haya en cada momento.
 */
export function useZoomPellizco(activo) {
  const [nodo, setNodo] = useState(null);
  const ref = useRef(null);
  const [zoom, setZoomState] = useState(leerGuardado);
  const zoomRef = useRef(zoom);
  // Lo que hay que respetar al repintar: qué fracción del tablero había bajo
  // el centro del gesto, y a qué altura de la pantalla estaba ese centro.
  const ancla = useRef(null);
  const guardadoTimer = useRef(null);

  const aplicar = useCallback((z, focoY) => {
    const el = ref.current;
    const nuevo = acotar(z);
    if (nuevo === zoomRef.current) return;
    if (el && focoY != null) {
      const r = el.getBoundingClientRect();
      ancla.current = { fraccion: (focoY - r.top) / Math.max(1, r.height), focoY };
    }
    setZoomState(nuevo);
    clearTimeout(guardadoTimer.current);
    guardadoTimer.current = setTimeout(() => guardar(nuevo), 250);
  }, []);

  useLayoutEffect(() => {
    ref.current = nodo;
  }, [nodo]);

  useLayoutEffect(() => {
    zoomRef.current = zoom;
    const a = ancla.current;
    const el = ref.current;
    ancla.current = null;
    if (!a || !el) return;
    const r = el.getBoundingClientRect();
    const dondeQuedo = r.top + a.fraccion * r.height;
    const delta = dondeQuedo - a.focoY;
    if (Math.abs(delta) > 0.5) window.scrollBy(0, delta);
  }, [zoom]);

  useEffect(() => {
    const el = nodo;
    if (!activo || !el) return undefined;
    let inicio = null; // { d, z }
    let frame = 0;

    const onTouchStart = (e) => {
      if (e.touches.length === 2) {
        inicio = { d: distancia(e.touches[0], e.touches[1]), z: zoomRef.current };
      }
    };
    const onTouchMove = (e) => {
      if (!inicio || e.touches.length !== 2) return;
      e.preventDefault();
      const [a, b] = [e.touches[0], e.touches[1]];
      const d = distancia(a, b);
      const focoY = (a.clientY + b.clientY) / 2;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => aplicar(inicio.z * (d / Math.max(1, inicio.d)), focoY));
    };
    const onTouchEnd = (e) => {
      if (e.touches.length < 2) inicio = null;
    };
    const onWheel = (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      aplicar(zoomRef.current * Math.exp(-e.deltaY * 0.01), e.clientY);
    };
    const cancelar = (e) => e.preventDefault();

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchEnd, { passive: true });
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("gesturestart", cancelar);
    el.addEventListener("gesturechange", cancelar);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("gesturestart", cancelar);
      el.removeEventListener("gesturechange", cancelar);
    };
  }, [activo, aplicar, nodo]);

  useEffect(() => () => clearTimeout(guardadoTimer.current), []);

  return { ref: setNodo, zoom, setZoom: aplicar };
}
