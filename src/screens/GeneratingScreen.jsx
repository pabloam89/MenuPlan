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

export function GeneratingScreen() {
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
        background: "#0d1f13",
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
        @keyframes genBarWave {
          0%, 100% { transform: scaleY(.32); }
          50%      { transform: scaleY(1); }
        }
        @keyframes genPhraseUp {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

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
        Ho<span style={{ color: "#7ecb96" }}>Menu</span>
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

    </div>
  );
}
