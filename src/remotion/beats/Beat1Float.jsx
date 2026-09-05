import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { DashboardScreen } from '../../screens/Dashboard.jsx';

// Renderiza la pantalla real de Inicio (src/screens/Dashboard.jsx), no una
// recreación: mismos avatares, degradado, hero de "Generar menú", carrusel
// "Hoy toca" y BottomNav. Solo se le inyectan datos de ejemplo porque el
// componente real exige user/data/menuPlan/household -- nada de su JSX o
// estilos se toca.

const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const todayShort = () => DAYS[(new Date().getDay() + 6) % 7];

// Avatares ilustrados reales (public/avatares/<rol>/<rol>_N.png) via avatarKey,
// no fotos. Recetas con id real de src/data/recipes.js -- "lentejas-verduras"
// no tiene foto en el manifiesto (dishImages.json), así que su card cae al
// mismo icono de cubiertos que usaría la app real para cualquier receta sin
// foto: no es un fallback nuestro, es el comportamiento real del componente.
const MEMBERS = [
  { id: 'm1', name: 'Ana', avatarKey: 'mama_3' },
  { id: 'm2', name: 'Marcos', avatarKey: 'papa_5' },
  { id: 'm3', name: 'Lucía', avatarKey: 'hija_2' },
  { id: 'm4', name: 'Hugo', avatarKey: 'hijo_4' },
];

const GROUPS = [{ id: 'familia', label: 'Familia', memberIds: MEMBERS.map((m) => m.id) }];

const DATA = { members: MEMBERS, groups: GROUPS, meals: ['Comida', 'Cena'] };

const MENU_PLAN = {
  familia: {
    [`${todayShort()}-Comida`]: { recipeId: 'lentejas-verduras' },
    [`${todayShort()}-Cena`]: { recipeId: 'tortilla-francesa' },
  },
};

const USER = { email: 'ana@example.com', user_metadata: { full_name: 'Ana' } };
const ACTIVE_HOUSEHOLD = { name: 'Casa de Ana' };

const noop = () => {};

// Ancla el frame del teléfono a un tamaño fijo. DashboardScreen usa
// min-height: 100dvh (se ajusta al viewport real de Remotion, no al frame),
// así que con overflow hidden el resto del scroll queda recortado por el
// propio marco -- igual que un mockup de dispositivo recorta los bordes.
const PHONE_WIDTH = 460;
const PHONE_HEIGHT = 940;

export function Beat1Float() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const bounce = spring({
    frame,
    fps,
    config: { damping: 12, stiffness: 120, mass: 1 },
  });

  const translateY = interpolate(bounce, [0, 1], [520, 0]);
  const rotateY = interpolate(frame, [0, 30], [-16, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const shadowScale = interpolate(bounce, [0, 1], [0.5, 1]);
  const shadowOpacity = interpolate(bounce, [0, 1], [0.05, 0.5]);

  return (
    <AbsoluteFill style={{ backgroundColor: '#11131a' }}>
      <AbsoluteFill style={{ perspective: 1800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ position: 'relative' }}>
          <div
            style={{
              position: 'absolute',
              bottom: -30,
              left: '50%',
              width: 360,
              height: 50,
              borderRadius: '50%',
              background: '#000',
              filter: 'blur(20px)',
              transform: `translateX(-50%) scale(${shadowScale})`,
              opacity: shadowOpacity,
            }}
          />
          <div
            style={{
              width: PHONE_WIDTH,
              height: PHONE_HEIGHT,
              overflow: 'hidden',
              borderRadius: 36,
              border: '10px solid #0b0c10',
              boxShadow: '0 40px 80px rgba(0,0,0,.55)',
              // translateZ(0) fuerza un containing block nuevo: el BottomNav
              // (position: fixed en el componente real) queda anclado a
              // ESTE marco en vez de saltar al viewport completo de Remotion.
              transform: `translateY(${translateY}px) rotateY(${rotateY}deg) translateZ(0)`,
            }}
          >
            <DashboardScreen
              user={USER}
              data={DATA}
              menuPlan={MENU_PLAN}
              activeHousehold={ACTIVE_HOUSEHOLD}
              householdReadOnly={false}
              onNav={noop}
              onViewMenu={noop}
              onOpenAccount={noop}
              onGenerateMenu={noop}
            />
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
