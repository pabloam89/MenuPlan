import { UtensilsCrossed } from 'lucide-react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { IsoWorld } from '../IsoWorld';

// Calcado de TodayDishCard real (src/screens/Dashboard.jsx:80): misma altura,
// radio, borde, sombra y estructura de pills. La versión real muestra una
// foto del plato (photo prop); aquí no hay red para traer las fotos reales
// del catálogo (dish-gallery/public/catalog.json, en Vercel Blob), así que
// se usa el estado "sin foto" del propio componente -- que es un estado
// real de la app, no algo inventado -- con nombres de plato reales del
// catálogo.
const GREEN = '#2d5a3d';

const todayPillStyle = {
  position: 'absolute',
  fontSize: 9.5,
  fontWeight: 800,
  background: 'rgba(255,255,255,.92)',
  padding: '2px 7px',
  borderRadius: 999,
  letterSpacing: '.3px',
  whiteSpace: 'nowrap',
  boxShadow: '0 1px 4px rgba(20,47,29,.16)',
};

function DishCard({ meal, name, time }) {
  return (
    <div
      style={{
        position: 'relative',
        width: 168,
        height: 132,
        overflow: 'hidden',
        borderRadius: 16,
        border: '1.5px solid #e3ebe6',
        background: '#eef4f0',
        boxShadow: '0 6px 16px -12px rgba(20,47,29,.3)',
        fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif",
      }}
    >
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <UtensilsCrossed size={26} color="#9ab0a1" />
      </div>

      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: '58%',
          background: 'linear-gradient(to top, rgba(0,0,0,.72) 0%, rgba(0,0,0,.18) 65%, transparent 100%)',
        }}
      />

      <span style={{ ...todayPillStyle, top: 6, left: 6, color: GREEN }}>{meal}</span>
      <span style={{ ...todayPillStyle, top: 6, right: 6, color: '#5a7262' }}>{time} min</span>
      <p
        style={{
          position: 'absolute',
          left: 8,
          right: 8,
          bottom: 8,
          margin: 0,
          fontSize: 13,
          fontWeight: 800,
          color: '#fff',
          lineHeight: 1.25,
          textShadow: '0 1px 3px rgba(0,0,0,.4)',
        }}
      >
        {name}
      </p>
    </div>
  );
}

// Nombres reales del catálogo (dish-gallery/public/catalog.json), no inventados.
const DISHES = [
  { meal: 'Comida', name: 'Costillas de cerdo al horno', time: 45 },
  { meal: 'Comida', name: 'Ensalada de lentejas, tomate y comino', time: 20 },
  { meal: 'Cena', name: 'Merluza en salsa verde', time: 30 },
];

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
              width: 380,
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
              display: 'flex',
              gap: 10,
              transform: `translateY(${translateY}px) rotateY(${rotateY}deg)`,
            }}
          >
            {DISHES.map((d) => (
              <DishCard key={d.name} {...d} />
            ))}
          </div>
        </div>
      </IsoWorld>
    </AbsoluteFill>
  );
}
