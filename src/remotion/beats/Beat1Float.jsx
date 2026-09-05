import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { IsoWorld } from '../IsoWorld';

// Card de ejemplo (mock) para el beat 1. No es el DashboardScreen real:
// ese componente exige user/menuPlan/household reales, así que aquí se
// simula un resumen de menú semanal con datos de muestra.
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
        borderRadius: 20,
        background: '#1e2027',
        border: '1px solid #33363f',
        boxShadow: '0 10px 0 rgba(0,0,0,0.35)',
        padding: 24,
        fontFamily: 'system-ui, sans-serif',
        color: '#ece9e2',
      }}
    >
      <div style={{ fontSize: 13, letterSpacing: 1, textTransform: 'uppercase', color: '#e8a33d', marginBottom: 12, fontWeight: 700 }}>
        Menú de la semana
      </div>
      {rows.map((r) => (
        <div
          key={r.day}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '10px 0',
            borderTop: '1px solid #2c2f37',
            fontSize: 16,
          }}
        >
          <span style={{ color: '#9a9ca8' }}>{r.day}</span>
          <span>{r.dish}</span>
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
  const shadowOpacity = interpolate(bounce, [0, 1], [0.1, 0.45]);

  return (
    <AbsoluteFill style={{ backgroundColor: '#101114' }}>
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
              background: '#000',
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
