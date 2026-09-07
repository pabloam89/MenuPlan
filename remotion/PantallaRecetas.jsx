import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import logoSrc from "../brand/homenu-teal.svg";
import { SANS, SERIF } from "./fonts.js";
import { categoryTiles, firstDishOf } from "./data.js";
import { RecetasScreen, SCREEN_H, SCREEN_W, tileRect } from "./RecetasUI.jsx";

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;

// El móvil: la pantalla se pinta a su tamaño real (420 px de ancho, el
// APP_SHELL_MAX_WIDTH de la app) y se escala entera, así ninguna medida del
// sistema de diseño hay que recalcularla a mano.
const BEZEL = 13;
const S = 2.05;
const PHONE_W = (SCREEN_W + BEZEL * 2) * S;
const PHONE_H = (SCREEN_H + BEZEL * 2) * S;
const PHONE_LEFT = (WIDTH - PHONE_W) / 2;
const PHONE_TOP = (HEIGHT - PHONE_H) / 2;

const TAP_INDEX = categoryTiles.findIndex((t) => t.id === "pescados");
const DISH = firstDishOf("pescados");

const HERO_GRADIENT = "linear-gradient(150deg, #1c4a2e 0%, #2d5a3d 46%, #47a066 100%)";
const PHOTO_OVERLAY =
  "linear-gradient(to top, rgba(10,30,18,.92) 0%, rgba(10,30,18,.4) 38%, rgba(10,30,18,0) 66%)";

// Guion, en fotogramas (30 por segundo).
const HEADER_IN = 14;
const TILES_IN = 22;
const NAV_IN = 40;
const SCROLL_DOWN = 100;
const SCROLL_BACK = 150;
const TAP = 186;
const EXPAND = 202;
const EXPAND_LEN = 68;
const DISH_TEXT = 248;
const OUTRO = 336;
export const TOTAL_FRAMES = 420;

const ease = { easing: Easing.inOut(Easing.cubic), extrapolateLeft: "clamp", extrapolateRight: "clamp" };
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" };

/** Un punto de la pantalla del móvil, en coordenadas del vídeo. */
function toVideo(x, y, camera) {
  const baseX = PHONE_LEFT + (BEZEL + x) * S;
  const baseY = PHONE_TOP + (BEZEL + y) * S;
  return {
    x: WIDTH / 2 + (baseX - WIDTH / 2) * camera,
    y: HEIGHT / 2 + (baseY - HEIGHT / 2) * camera,
  };
}

function Phone({ children, opacity, camera, enterY }) {
  return (
    <div
      style={{
        position: "absolute",
        left: PHONE_LEFT,
        top: PHONE_TOP,
        width: PHONE_W,
        height: PHONE_H,
        borderRadius: 44 * S,
        background: "#0d1712",
        boxShadow: "0 70px 130px rgba(0,0,0,.5), 0 0 0 2px rgba(255,255,255,.14)",
        opacity,
        transform: `translateY(${enterY}px) scale(${camera})`,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: BEZEL * S,
          top: BEZEL * S,
          width: SCREEN_W * S,
          height: SCREEN_H * S,
          borderRadius: 32 * S,
          overflow: "hidden",
        }}
      >
        <div style={{ width: SCREEN_W, height: SCREEN_H, transform: `scale(${S})`, transformOrigin: "top left" }}>
          {children}
        </div>
      </div>
    </div>
  );
}

/** El toque: el círculo del dedo y la onda que suelta al levantarlo. */
function Tap({ center, frame }) {
  const appear = interpolate(frame, [TAP, TAP + 6], [0, 1], clamp);
  const fade = interpolate(frame, [EXPAND, EXPAND + 10], [1, 0], clamp);
  const ripple = interpolate(frame, [TAP + 8, TAP + 30], [0, 1], clamp);

  return (
    <>
      <div
        style={{
          position: "absolute",
          left: center.x - 46,
          top: center.y - 46,
          width: 92,
          height: 92,
          borderRadius: "50%",
          background: "rgba(255,255,255,.32)",
          border: "3px solid rgba(255,255,255,.8)",
          opacity: appear * fade * (1 - ripple * 0.35),
          transform: `scale(${interpolate(appear, [0, 1], [1.5, 1])})`,
        }}
      />
      {ripple > 0 && ripple < 1 && (
        <div
          style={{
            position: "absolute",
            left: center.x - 46,
            top: center.y - 46,
            width: 92,
            height: 92,
            borderRadius: "50%",
            border: "4px solid rgba(255,255,255,.55)",
            opacity: (1 - ripple) * fade,
            transform: `scale(${interpolate(ripple, [0, 1], [1, 2.6])})`,
          }}
        />
      )}
    </>
  );
}

function DishPayoff({ frame }) {
  const name = spring({ frame: frame - DISH_TEXT, fps: FPS, config: { damping: 200 }, durationInFrames: 28 });
  const meta = spring({ frame: frame - DISH_TEXT - 8, fps: FPS, config: { damping: 200 }, durationInFrames: 28 });
  const overlay = interpolate(frame, [EXPAND + 34, EXPAND + 60], [0, 1], clamp);

  return (
    <>
      <AbsoluteFill style={{ background: PHOTO_OVERLAY, opacity: overlay }} />
      <div style={{ position: "absolute", left: 72, right: 72, bottom: 200 }}>
        <div
          style={{
            opacity: name,
            transform: `translateY(${interpolate(name, [0, 1], [36, 0])}px)`,
            fontFamily: SANS,
            fontWeight: 900,
            fontSize: 74,
            lineHeight: 1.06,
            letterSpacing: -2,
            color: "#fff",
            textShadow: "0 6px 30px rgba(0,0,0,.45)",
          }}
        >
          {DISH.name}
        </div>
        <div
          style={{
            marginTop: 32,
            display: "flex",
            gap: 16,
            opacity: meta,
            transform: `translateY(${interpolate(meta, [0, 1], [24, 0])}px)`,
          }}
        >
          {[`${DISH.time} min`, `${DISH.kcal} kcal`].map((label) => (
            <span
              key={label}
              style={{
                padding: "14px 30px",
                borderRadius: 999,
                background: "rgba(255,255,255,.16)",
                border: "1.5px solid rgba(255,255,255,.34)",
                color: "#fff",
                fontFamily: SANS,
                fontWeight: 800,
                fontSize: 30,
                lineHeight: 1,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {label}
            </span>
          ))}
        </div>
      </div>
    </>
  );
}

function Outro({ frame }) {
  const enter = interpolate(frame, [OUTRO, OUTRO + 20], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const lift = spring({ frame: frame - OUTRO - 6, fps: FPS, config: { damping: 200 }, durationInFrames: 30 });

  return (
    <AbsoluteFill
      style={{
        background: HERO_GRADIENT,
        alignItems: "center",
        justifyContent: "center",
        opacity: enter,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 28, transform: `scale(${interpolate(lift, [0, 1], [0.92, 1])})` }}>
        <Img src={logoSrc} style={{ filter: "brightness(0) invert(1)", width: 124 }} />
        <span style={{ fontFamily: SERIF, fontWeight: 800, fontSize: 92, letterSpacing: -2, color: "#fff" }}>
          HoMenu
        </span>
      </div>
      <div
        style={{
          marginTop: 40,
          maxWidth: 780,
          textAlign: "center",
          opacity: lift * 0.92,
          transform: `translateY(${interpolate(lift, [0, 1], [22, 0])}px)`,
          fontFamily: SANS,
          fontWeight: 700,
          fontSize: 40,
          lineHeight: 1.35,
          color: "#fff",
        }}
      >
        El menú familiar de la semana, resuelto.
      </div>
    </AbsoluteFill>
  );
}

export function PantallaRecetas() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Entrada del móvil y montaje de la interfaz.
  const phoneIn = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 30 });
  const headerEnter = spring({ frame: frame - HEADER_IN, fps, config: { damping: 200 }, durationInFrames: 26 });
  const navEnter = spring({ frame: frame - NAV_IN, fps, config: { damping: 200 }, durationInFrames: 28 });
  const tileEnter = (i) =>
    spring({ frame: frame - TILES_IN - i * 3, fps, config: { damping: 200 }, durationInFrames: 24 });

  // Se hojea el catálogo y se vuelve un poco atrás, como se hace con el pulgar.
  const scrollY = interpolate(
    frame,
    [SCROLL_DOWN, SCROLL_DOWN + 40, SCROLL_BACK, SCROLL_BACK + 24],
    [0, -90, -90, -30],
    ease,
  );

  // La cámara entra despacio, y se lanza dentro de la tesela al abrirse.
  const camera = interpolate(
    frame,
    [0, EXPAND, EXPAND + EXPAND_LEN],
    [1, 1.06, 1.3],
    { ...clamp, easing: Easing.inOut(Easing.cubic) },
  );

  const press = interpolate(frame, [TAP + 2, TAP + 6, TAP + 12], [1, 0.97, 1], clamp);

  const rect = tileRect(TAP_INDEX, scrollY);
  const topLeft = toVideo(rect.x, rect.y, camera);
  const size = rect.w * S * camera;
  const tapCenter = { x: topLeft.x + size / 2, y: topLeft.y + size / 2 };

  // La tesela se despega de la pantalla y crece hasta llenar el encuadre.
  const open = interpolate(frame, [EXPAND, EXPAND + EXPAND_LEN], [0, 1], ease);
  const opening = frame >= EXPAND;
  const openRect = {
    left: interpolate(open, [0, 1], [topLeft.x, 0]),
    top: interpolate(open, [0, 1], [topLeft.y, 0]),
    width: interpolate(open, [0, 1], [size, WIDTH]),
    height: interpolate(open, [0, 1], [size, HEIGHT]),
    borderRadius: interpolate(open, [0, 1], [14 * S * camera, 0]),
  };
  // A mitad de camino la ilustración de la categoría deja paso al plato.
  const dishFade = interpolate(frame, [EXPAND + 16, EXPAND + 44], [0, 1], clamp);
  const phoneOpacity = interpolate(frame, [EXPAND + 6, EXPAND + 40], [1, 0], clamp);

  return (
    <AbsoluteFill style={{ background: HERO_GRADIENT }}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div
          style={{
            width: 1500,
            height: 1500,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(255,255,255,.16) 0%, rgba(255,255,255,0) 62%)",
          }}
        />
      </AbsoluteFill>

      <Phone
        opacity={phoneIn * phoneOpacity}
        camera={camera}
        enterY={interpolate(phoneIn, [0, 1], [90, 0])}
      >
        <RecetasScreen
          tiles={categoryTiles}
          scrollY={scrollY}
          headerEnter={headerEnter}
          navEnter={navEnter}
          tileEnter={tileEnter}
          pressedIndex={TAP_INDEX}
          press={press}
        />
      </Phone>

      {frame >= TAP && <Tap center={tapCenter} frame={frame} />}

      {opening && (
        <div style={{ position: "absolute", overflow: "hidden", ...openRect }}>
          <Img
            src={staticFile(categoryTiles[TAP_INDEX].img)}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
          />
          <Img
            src={DISH.photo}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              opacity: dishFade,
            }}
          />
        </div>
      )}

      {frame >= EXPAND + 30 && <DishPayoff frame={frame} />}
      {frame >= OUTRO && <Outro frame={frame} />}
    </AbsoluteFill>
  );
}
