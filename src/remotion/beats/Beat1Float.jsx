import { Calendar } from 'lucide-react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { IsoWorld } from '../IsoWorld';

// Card de ejemplo (mock) para el beat 1: mismos tokens que DESIGN_SYSTEM.md
// (tarjeta blanca, verde #2d5a3d, DM Sans, sombra tintada de verde). No es
// el DashboardScreen real: ese componente exige user/menuPlan/household
// reales, así que aquí se simula un resumen de menú con datos de muestra,
// pero con el estilo real de la app, no uno inventado.
function MenuSummaryCard() {
  const rows = [
    { day: 'Lun', dish: 'Lentejas estofadas' },
    { day: 'Mar', dish: 'Pollo al horno' },
    { day: 'Mié', dish: 'Poke de salmón' },
  ];

  return (
    <div
      style={{
        width: 380,
        borderRadius: 16,
        background: '#fff',
        border: '1px solid #e3ebe6',
        boxShadow: '0 18px 50px rgba(20,47,29,.32)',
        padding: '20px 22px',
        fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif",
        color: '#142f1d',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 12,
            background: 'rgba(45,90,61,.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Calendar size={16} strokeWidth={2.4} color="#2d5a3d" />
        </div>
        <span style={{ fontSize: 14, fontWeight: 800, color: '#2d5a3d', letterSpacing: -0.2 }}>
          Menú de la semana
        </span>
      </div>
      {rows.map((r, i) => (
        <div
          key={r.day}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '10px 0',
            borderBottom: i < rows.length - 1 ? '1px solid #eef3f0' : 'none',
          }}
        >
          <span style={{ fontSize: 12.5, fontWeight: 600, color: '#7a8a7f', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {r.day}
          </span>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#142f1d' }}>{r.dish}</span>
        </div>
      ))}
    </div>
  );
}

export function Beat1Float() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const bounce = spring({
    frame,
    fps,
    config: { damping: 12, stiffness: 120, mass: 1 },
  });

  const translateY = interpolate(bounce, [0, 1], [420, 0]);
  const rotateY = interpolate(frame, [0, 30], [-25, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const shadowScale = interpolate(bounce, [0, 1], [0.5, 1]);
  const shadowOpacity = interpolate(bounce, [0, 1], [0.1, 0.35]);

  return (
    <AbsoluteFill style={{ backgroundColor: '#f4f8f5' }}>
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&display=swap"
      />
      <IsoWorld rotateX={0} rotateZ={0} perspective={1200}>
        <div style={{ position: 'relative' }}>
          <div
            style={{
              position: 'absolute',
              bottom: -40,
              left: '50%',
              width: 320,
              height: 40,
              borderRadius: '50%',
              background: 'rgba(20,47,29,1)',
              filter: 'blur(10px)',
              transform: `translateX(-50%) scale(${shadowScale})`,
              opacity: shadowOpacity,
            }}
          />
          <div
            style={{
              transform: `translateY(${translateY}px) rotateY(${rotateY}deg)`,
            }}
          >
            <MenuSummaryCard />
          </div>
        </div>
      </IsoWorld>
    </AbsoluteFill>
  );
}
