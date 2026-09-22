import { useState } from "react";

/**
 * La pista de un slider que SÍ se puede animar.
 *
 * `SliderInput` de ui.jsx dibuja su relleno pero deja el pulgar al
 * `::-webkit-slider-thumb` nativo, y la posición de un pulgar nativo no se
 * puede animar por CSS. Aquí eso es el gesto central de la pantalla: al pedir
 * "más pescado" por voz, el control tiene que VERSE moverse. Un salto
 * instantáneo no se lee como "te lo he movido yo", se lee como un repintado.
 *
 * Así que el pulgar es un div propio con su transición y el input nativo se
 * queda debajo, transparente (ver `estilosDePista` en pistaMotion.js).
 *
 * La animación solo se enciende cuando la mueve el agente. Animar el arrastre
 * del propio dedo dejaría el pulgar corriendo por detrás del dedo, que es la
 * forma más rápida de que un slider se sienta roto.
 */
export function Pista({ valor, min = 0, max = 100, step = 1, color = "#2d5a3d", animar, etiqueta, onChange }) {
  const [arrastrando, setArrastrando] = useState(false);
  const pct = ((valor - min) / (max - min)) * 100;
  const transicion =
    animar && !arrastrando
      ? "left .45s cubic-bezier(.25,.46,.45,.94), width .45s cubic-bezier(.25,.46,.45,.94)"
      : "none";

  return (
    <div style={{ position: "relative", height: 22, display: "flex", alignItems: "center" }}>
      <div style={{ position: "absolute", left: 0, right: 0, height: 4, borderRadius: 2, background: "#e5ede7", pointerEvents: "none" }} />
      <div
        style={{
          position: "absolute", left: 0, height: 4, borderRadius: 2,
          background: color, width: `${pct}%`,
          transition: transicion, pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute", left: `${pct}%`, top: "50%",
          width: 18, height: 18, marginLeft: -9, marginTop: -9,
          borderRadius: "50%", background: "#fff",
          border: `2.5px solid ${color}`,
          boxShadow: "0 1px 4px rgba(20,47,29,.18)",
          transition: transicion, pointerEvents: "none",
        }}
      />
      <input
        className="mp-pista"
        type="range"
        min={min}
        max={max}
        step={step}
        value={valor}
        aria-label={etiqueta}
        onChange={(e) => onChange(+e.target.value)}
        onPointerDown={() => setArrastrando(true)}
        onPointerUp={() => setArrastrando(false)}
        onPointerCancel={() => setArrastrando(false)}
        onBlur={() => setArrastrando(false)}
      />
    </div>
  );
}
