import { useEffect, useState } from "react";

export const GENERATING_PHRASES = [
  "Calculando variedad para toda la semana…",
  "Ajustando al menú del cole de los peques…",
  "Cuadrando gustos de toda la familia…",
  "Optimizando tiempos de cocina…",
  "Buscando recetas que no se repitan…",
  "Pensando qué comer sin agobios…",
  "Equilibrando proteínas, verduras y algo rico…",
  "Poniendo orden en la nevera imaginaria…",
];

export function GeneratingScreen({ onStop }) {
  const [phraseIdx, setPhraseIdx] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const id = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setPhraseIdx((i) => (i + 1) % GENERATING_PHRASES.length);
        setVisible(true);
      }, 350);
    }, 3200);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "#0a160e",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        color: "#fff",
        overflow: "hidden",
        animation: "genFade .4s ease-out",
      }}
    >
      <style>{`
        @keyframes genFade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes genGlow {
          0%, 100% { opacity: .5; transform: translateX(-50%) scale(1); }
          50%      { opacity: .85; transform: translateX(-50%) scale(1.12); }
        }
        @keyframes genBarWave {
          0%, 100% { transform: scaleY(.32); }
          50%      { transform: scaleY(1); }
        }
        @keyframes genPhraseUp {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Glow verde detrás del logo */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          top: "30%",
          left: "50%",
          width: 320,
          height: 320,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(61,122,82,.42) 0%, transparent 70%)",
          animation: "genGlow 4s ease-in-out infinite",
          pointerEvents: "none",
        }}
      />

      {/* MenuPlan arriba del todo */}
      <div
        style={{
          position: "absolute",
          top: 60,
          left: 0,
          right: 0,
          textAlign: "center",
          zIndex: 1,
          fontFamily: "'Playfair Display', Georgia, serif",
          fontSize: 26,
          fontWeight: 900,
          letterSpacing: "-1px",
          textShadow: "0 2px 18px rgba(0,0,0,.5)",
        }}
      >
        Menú<span style={{ color: "#7ecb96" }}>Plan</span>
      </div>

      {/* "Un momento" — a la altura del "Just a second" */}
      <h2
        style={{
          position: "absolute",
          top: "27%",
          left: 0,
          right: 0,
          textAlign: "center",
          margin: 0,
          zIndex: 1,
          fontSize: 22,
          fontWeight: 800,
          color: "#fff",
        }}
      >
        Un momento
      </h2>

      {/* Logo animado: barras tipo fogón — centrado */}
      <div
        style={{
          position: "absolute",
          top: "47%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          display: "flex",
          alignItems: "flex-end",
          gap: 9,
          height: 64,
          zIndex: 1,
        }}
      >
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            style={{
              width: 13,
              height: 64,
              borderRadius: 7,
              background: "linear-gradient(180deg, #7ecb96, #3d7a52)",
              transformOrigin: "bottom",
              boxShadow: "0 4px 16px rgba(61,122,82,.45)",
              animation: `genBarWave 1s ease-in-out ${i * 0.15}s infinite`,
            }}
          />
        ))}
      </div>

      {/* Frase rotando — a la altura del "We are creating…" */}
      <p
        key={phraseIdx}
        style={{
          position: "absolute",
          top: "72%",
          left: 0,
          right: 0,
          margin: "0 auto",
          maxWidth: 340,
          padding: "0 32px",
          textAlign: "center",
          zIndex: 1,
          fontSize: 18,
          fontWeight: 600,
          lineHeight: 1.5,
          color: "rgba(255,255,255,.85)",
          opacity: visible ? 1 : 0,
          transition: "opacity .35s ease",
          animation: "genPhraseUp .4s ease-out",
        }}
      >
        {GENERATING_PHRASES[phraseIdx]}
      </p>

      {/* Cancelar */}
      {onStop && (
        <button
          type="button"
          onClick={onStop}
          style={{
            position: "absolute",
            bottom: 40,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 1,
            background: "transparent",
            border: "1px solid rgba(255,255,255,.25)",
            color: "rgba(255,255,255,.8)",
            padding: "10px 22px",
            borderRadius: 999,
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Cancelar
        </button>
      )}
    </div>
  );
}
