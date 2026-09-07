// La pantalla de Recetas: se ve la de verdad (3 columnas), la cámara se aleja
// mientras el grid se reordena a 4 columnas, se "abren" todas las categorías
// a la vez y las miniaturas de cada plato salen en espiral ascendente hasta
// desaparecer — y vuelven a bajar en espiral hasta meterse otra vez en su
// tesela. Con el grid ya quieto, las teselas giran a un plano isométrico,
// "Mis recetas" se eleva y centra, y una última animación entra dentro suyo
// para enseñar las carpetas reales que hay ahí (Todas, Día a día...).
//
// Pieza de motion graphics, no una réplica de pantalla — no hay bisel de
// móvil y las teselas no llevan la etiqueta de texto, solo foto + contador.
import { AbsoluteFill, Easing, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { BookOpen, Plus, SlidersHorizontal } from "../src/components/icons.jsx";
import { SANS } from "./fonts.js";
import { categoryTiles, flyingDishes, myFolders } from "./data.js";
import { centeredGrid, rand } from "./gridLayout.js";

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;

const INK = "#142f1d";
const GREEN = "#2d5a3d";
const HEADER_BAND = "#e9f4ed";
const BG = "#f4f8f5";

// ── Guion, en fotogramas (30/s) ─────────────────────────────────────────────
const INTRO_END = 40;
const REFLOW_START = 40;
const REFLOW_DUR = 75;
const REFLOW_END = REFLOW_START + REFLOW_DUR;
const BEAT_START = REFLOW_END;
const BEAT_END = BEAT_START + 26;
const OPEN_START = BEAT_END;
const OPEN_END = OPEN_START + 20;

// Espiral hacia fuera: cada plato nace en su tesela y sube girando hasta un
// punto de fuga por encima del grid.
const ASCEND_START = OPEN_START + 12;
const ASCEND_SPAWN_WINDOW = 90;
const ASCEND_DUR_BASE = 78;
const ASCEND_DUR_JITTER = 16;
const ASCEND_LAST_END = ASCEND_START + ASCEND_SPAWN_WINDOW + ASCEND_DUR_BASE + ASCEND_DUR_JITTER;

// Vacío breve — el grid solo, sin nada volando — antes de que vuelvan.
const VOID_GAP = 18;
const RETURN_START = ASCEND_LAST_END + VOID_GAP;
const RETURN_SPAWN_WINDOW = 65;
const RETURN_DUR_BASE = 48;
const RETURN_DUR_JITTER = 14;
const RETURN_LAST_END = RETURN_START + RETURN_SPAWN_WINDOW + RETURN_DUR_BASE + RETURN_DUR_JITTER;

const SETTLE = 16;
const ISO_START = RETURN_LAST_END + SETTLE;
const ISO_DUR = 42;
const ISO_END = ISO_START + ISO_DUR;
const ISO_HOLD = ISO_END + 18;

const LIFT_START = ISO_HOLD;
const LIFT_RISE = 20;
const LIFT_HOLD = 42; // 20+42 fotogramas ≈ 2s pedidos
const LIFT_END = LIFT_START + LIFT_RISE + LIFT_HOLD;

const REVEAL_START = LIFT_END;
const REVEAL_DUR = 36;
const REVEAL_END = REVEAL_START + REVEAL_DUR;
const FOLDER_ENTER_END = REVEAL_END + 40;
const TAIL = 24;
export const TOTAL_FRAMES = FOLDER_ENTER_END + TAIL;

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" };
const easeIn = Easing.in(Easing.quad);
const easeOut = Easing.out(Easing.quad);

// Grid "de verdad" (3 columnas, como la app) al que llegamos zoom-in, y el
// grid al que se reordena para poder verlas todas (4 columnas, más ancho).
const SOURCE = centeredGrid({ count: categoryTiles.length, cols: 3, gap: 14, gridWidth: 620, canvasWidth: WIDTH, top: 0 });
const TARGET = centeredGrid({ count: categoryTiles.length, cols: 4, gap: 16, gridWidth: 1000, canvasWidth: WIDTH, top: 0 });
const STAGE_TOP = 210; // debajo de la cabecera en la fase inicial
const SOURCE_TOP = STAGE_TOP;
const TARGET_TOP = (HEIGHT - TARGET.height) / 2;
const GRID_CX = WIDTH / 2;
const GRID_CY = TARGET_TOP + TARGET.height / 2;
const VANISH_Y = GRID_CY - 1500;

const originTileIndex = new Map(categoryTiles.map((t, i) => [t.id, i]));
const MINE_INDEX = originTileIndex.get("__mine__");

function hashId(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h) + 1;
}

function Header({ opacity }) {
  return (
    <div style={{ position: "absolute", top: 0, left: 0, right: 0, background: HEADER_BAND, opacity }}>
      <div style={{ padding: "20px 18px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <div style={{ width: 36, height: 36, borderRadius: 11, background: "#f2e7fb", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <BookOpen size={17} color="#9647c9" />
          </div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: INK, letterSpacing: "-.3px", fontFamily: SANS }}>
            Recetas
          </h1>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ width: 36, height: 36, borderRadius: 12, border: "1.5px solid #d5e6da", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", color: GREEN }}>
            <SlidersHorizontal size={16} strokeWidth={2.3} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 13px", borderRadius: 12, background: GREEN, color: "#fff", fontSize: 13, fontWeight: 800, fontFamily: SANS }}>
            <Plus size={14} strokeWidth={2.8} /> Crear
          </div>
        </div>
      </div>
    </div>
  );
}

function Badge({ count }) {
  return (
    <span
      style={{
        position: "absolute", top: 6, right: 6,
        minWidth: 20, height: 20, padding: "0 5px", borderRadius: "50%",
        background: "rgba(255,255,255,.92)", color: INK,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 10, fontWeight: 800, fontFamily: SANS,
        boxShadow: "0 1px 4px rgba(20,47,29,.16)",
      }}
    >
      {count}
    </span>
  );
}

function TileImg({ img }) {
  return <Img src={staticFile(img)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />;
}

function Tile({ tile, rect, pulse, flash, extraTransform, dimAmount = 0 }) {
  return (
    <div style={{ position: "absolute", left: 0, top: 0, transform: `translate(${rect.x}px, ${rect.y}px)` }}>
      <div
        style={{
          width: rect.w,
          height: rect.h,
          transformStyle: "preserve-3d",
          transform: `scale(${pulse}) ${extraTransform ?? ""}`,
          // dimAmount ya sale de interpolate() por fotograma — nada de
          // transition CSS, que no anima en un render fotograma a fotograma.
          filter: dimAmount > 0 ? `brightness(${1 - dimAmount * 0.45}) blur(${dimAmount * 1.5}px)` : "none",
        }}
      >
        <div style={{ position: "relative", width: "100%", height: "100%", borderRadius: 14, overflow: "hidden", background: "#f4f7f5", boxShadow: "0 10px 24px rgba(10,30,18,.22)" }}>
          <TileImg img={tile.img} />
          {flash > 0 && <AbsoluteFill style={{ background: "#fff", opacity: flash }} />}
          <Badge count={tile.count} />
        </div>
      </div>
    </div>
  );
}

/** Un plato en pleno vuelo: sube en espiral hasta un punto de fuga, o baja
 * desde ahí de vuelta a su tesela — misma geometría, sentido contrario. */
function spiralPoint(t, p) {
  const radius = interpolate(t, [0, 0.18, 1], [0, p.peakRadius, p.finalRadius]);
  const theta = p.theta0 + p.turns * Math.PI * 2 * t;
  // El centro del remolino viaja en línea recta de la tesela al punto de
  // fuga; el radio arranca en 0 (así t=0 cae EXACTO sobre la tesela, sin
  // salto), crece para el remolino y se cierra casi a nada al llegar arriba.
  const cx = interpolate(t, [0, 1], [p.ox, GRID_CX]);
  const cy = interpolate(t, [0, 1], [p.oy, VANISH_Y]);
  return {
    x: cx + Math.cos(theta) * radius,
    y: cy + Math.sin(theta) * radius,
    scale: interpolate(t, [0, 0.6, 1], [1, 0.82, 0.2]),
    rotate: p.selfSpin * t,
  };
}

function SpiralDish({ dish, frame }) {
  const origin = TARGET.tiles[originTileIndex.get(dish.category)];
  const ox = origin.x + origin.w / 2;
  const oy = origin.y + TARGET_TOP + origin.h / 2;
  const seed = hashId(dish.id);

  const params = {
    ox,
    oy,
    theta0: rand(seed + 7) * Math.PI * 2,
    turns: 1.1 + rand(seed) * 1.4,
    peakRadius: 90 + rand(seed + 8) * 180,
    finalRadius: 8 + rand(seed + 1) * 18,
    selfSpin: 320 + rand(seed + 4) * 420,
  };
  const ascendDur = ASCEND_DUR_BASE + rand(seed + 2) * ASCEND_DUR_JITTER;
  const ascendSpawn = ASCEND_START + Math.floor(rand(seed + 3) * ASCEND_SPAWN_WINDOW);
  const returnDur = RETURN_DUR_BASE + rand(seed + 5) * RETURN_DUR_JITTER;
  const returnSpawn = RETURN_START + Math.floor(rand(seed + 6) * RETURN_SPAWN_WINDOW);

  const aLocal = frame - ascendSpawn;
  const rLocal = frame - returnSpawn;

  let t = null;
  let opacity = 0;
  if (aLocal >= -1 && aLocal <= ascendDur + 6) {
    // Salida rápida (se despega de la tesela ya con impulso) que se frena
    // según se acerca al punto de fuga, como alejándose hacia la distancia.
    t = interpolate(aLocal, [0, ascendDur], [0, 1], { ...clamp, easing: easeOut });
    opacity = interpolate(aLocal, [0, 4, ascendDur * 0.82, ascendDur], [0, 1, 1, 0], clamp);
  } else if (rLocal >= -1 && rLocal <= returnDur + 4) {
    // Misma fórmula que la subida, recorrida al revés: t va de 1 (arriba,
    // invisible) a 0 (de vuelta en su tesela). Aquí se queda un rato arriba y
    // luego cae con fuerza — el "chasquido" de encajar de vuelta.
    t = 1 - interpolate(rLocal, [0, returnDur], [0, 1], { ...clamp, easing: easeIn });
    opacity = interpolate(rLocal, [0, 4, returnDur * 0.86, returnDur], [0, 1, 1, 0], clamp);
  } else {
    return null;
  }
  if (opacity <= 0.005) return null;

  const p = spiralPoint(t, params);
  const size = origin.w * 0.86 * p.scale;

  return (
    <div
      style={{
        position: "absolute",
        left: p.x - size / 2,
        top: p.y - size / 2,
        width: size,
        height: size,
        borderRadius: 16,
        overflow: "hidden",
        opacity,
        transform: `rotate(${p.rotate}deg)`,
        boxShadow: "0 14px 30px rgba(10,30,18,.35)",
      }}
    >
      <Img src={dish.photo} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
    </div>
  );
}

function FolderTile({ folder, enter }) {
  return (
    <div
      style={{
        display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
        opacity: enter,
        transform: `translateY(${(1 - enter) * 26}px) scale(${0.92 + enter * 0.08})`,
      }}
    >
      <div style={{ position: "relative", width: "100%", aspectRatio: "1 / 1", borderRadius: 18, overflow: "hidden", background: "#f4f7f5" }}>
        <Img
          src={staticFile(folder.img)}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", filter: folder.muted ? "grayscale(.5)" : "none" }}
        />
        <span
          style={{
            position: "absolute", bottom: 10, left: 10,
            padding: "3px 11px", borderRadius: 999,
            background: "rgba(255,255,255,.92)", color: folder.muted ? "#8aa294" : GREEN,
            fontSize: 16, fontWeight: 900, fontFamily: SANS,
            boxShadow: "0 1px 4px rgba(20,47,29,.18)",
          }}
        >
          {folder.count}
        </span>
      </div>
      <span style={{ fontSize: 17, fontWeight: 800, color: INK, fontFamily: SANS, textAlign: "center" }}>{folder.label}</span>
    </div>
  );
}

export function ExplosionRecetas() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const introIn = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 26 });
  const headerOpacity = interpolate(frame, [REFLOW_START, REFLOW_START + 24, ISO_START - 10, ISO_START], [1, 0, 0, 0], clamp);

  const camera = interpolate(frame, [0, REFLOW_END], [1.04, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });

  const reflowT = (i) => {
    const delay = (i / (categoryTiles.length - 1)) * 20;
    return spring({ frame: frame - REFLOW_START - delay, fps, config: { damping: 200 }, durationInFrames: 50 });
  };
  const beatPulse = (i) => {
    const local = frame - BEAT_START - i * 1.6;
    return interpolate(local, [0, 6, 13], [0, 0.35, 0], clamp);
  };
  const openBounce = (i) => {
    const local = frame - OPEN_START - i * 0.8;
    return 1 + interpolate(local, [0, 8, 16], [0, 1, 0], clamp) * 0.14;
  };
  const openFlash = (i) => {
    const local = frame - OPEN_START - i * 0.8;
    return interpolate(local, [0, 4, 14], [0, 0.85, 0], clamp);
  };

  // Giro a isométrico de todo el grid, visto desde arriba en ángulo.
  const isoT = interpolate(frame, [ISO_START, ISO_END], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const isoAngle = isoT * 52;
  const isoTilt = isoT * -7;

  // "Mis recetas" se despega del suelo isométrico, se endereza hacia cámara
  // y se desliza al centro — el resto de teselas se atenúan para dar paso.
  const liftT = interpolate(frame, [LIFT_START, LIFT_START + LIFT_RISE], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const dimOthers = interpolate(frame, [LIFT_START, LIFT_START + LIFT_RISE], [0, 1], clamp);
  const mineRect = TARGET.tiles[MINE_INDEX];
  const mineCenter = { x: mineRect.x + mineRect.w / 2, y: mineRect.y + TARGET_TOP + mineRect.h / 2 };
  const mineTargetCenter = { x: GRID_CX, y: GRID_CY - 60 };
  const mineOffsetX = interpolate(liftT, [0, 1], [0, mineTargetCenter.x - mineCenter.x]);
  const mineOffsetY = interpolate(liftT, [0, 1], [0, mineTargetCenter.y - mineCenter.y]);
  const mineScale = interpolate(liftT, [0, 1], [1, 1.65]);
  const mineZ = interpolate(liftT, [0, 1], [0, 420]);
  const mineCounterRotate = interpolate(liftT, [0, 1], [0, -isoAngle]);

  // La tarjeta ya centrada y agrandada se convierte en el marco desde el que
  // se revela el grid de carpetas (mismo truco que abrir una tesela en la
  // pieza anterior: expandir su rect hasta llenar el lienzo).
  const revealT = interpolate(frame, [REVEAL_START, REVEAL_END], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  // Funde de la foto de "Mis recetas" a blanco+carpetas en el último tramo.
  const foldersFade = interpolate(frame, [REVEAL_END - 14, REVEAL_END], [0, 1], clamp);
  const liftedSize = { w: mineRect.w * mineScale, h: mineRect.h * mineScale };
  const liftedTopLeft = { x: mineTargetCenter.x - liftedSize.w / 2, y: mineTargetCenter.y - liftedSize.h / 2 };
  const revealRect = {
    left: interpolate(revealT, [0, 1], [liftedTopLeft.x, 0]),
    top: interpolate(revealT, [0, 1], [liftedTopLeft.y, 0]),
    width: interpolate(revealT, [0, 1], [liftedSize.w, WIDTH]),
    height: interpolate(revealT, [0, 1], [liftedSize.h, HEIGHT]),
    borderRadius: interpolate(revealT, [0, 1], [26, 0]),
  };
  const sceneOpacity = interpolate(frame, [REVEAL_START, REVEAL_END], [1, 0], clamp);

  const folderGrid = centeredGrid({ count: myFolders.length, cols: 3, gap: 24, gridWidth: 900, canvasWidth: WIDTH, top: 0 });
  const folderTop = (HEIGHT - folderGrid.height) / 2;
  const folderEnter = (i) =>
    spring({ frame: frame - REVEAL_END - i * 5, fps, config: { damping: 200 }, durationInFrames: 26 });

  return (
    <AbsoluteFill style={{ background: BG, fontFamily: SANS }}>
      {frame < REVEAL_END && (
        <AbsoluteFill style={{ opacity: sceneOpacity }}>
          <Header opacity={frame < INTRO_END ? introIn : headerOpacity} />

          <AbsoluteFill style={{ transform: `scale(${camera})`, perspective: 1800, transformStyle: "preserve-3d" }}>
            <div style={{ position: "absolute", inset: 0, transformStyle: "preserve-3d", transform: `rotateX(${isoAngle}deg) rotateZ(${isoTilt}deg)` }}>
              {categoryTiles.map((tile, i) => {
                const source = { ...SOURCE.tiles[i], y: SOURCE.tiles[i].y + SOURCE_TOP };
                const target = { ...TARGET.tiles[i], y: TARGET.tiles[i].y + TARGET_TOP };
                const t = frame < REFLOW_START ? 0 : reflowT(i);
                const rect = {
                  x: interpolate(t, [0, 1], [source.x, target.x]),
                  y: interpolate(t, [0, 1], [source.y, target.y]),
                  w: interpolate(t, [0, 1], [source.w, target.w]),
                  h: interpolate(t, [0, 1], [source.h, target.h]),
                };
                const isMine = i === MINE_INDEX;
                if (isMine && frame >= LIFT_START) {
                  rect.x += mineOffsetX;
                  rect.y += mineOffsetY;
                }
                const enter = frame < INTRO_END ? introIn : 1;
                // mineScale ya vale 1 antes de LIFT_START y sube a 1.65 durante
                // el ascenso — multiplicarlo aquí basta, sin trucos de potencia.
                const pulse =
                  enter *
                  (frame >= BEAT_START && frame < BEAT_END ? 1 + beatPulse(i) * 0.06 : 1) *
                  (frame >= OPEN_START && frame < OPEN_END + 4 ? openBounce(i) : 1) *
                  (isMine ? mineScale : 1);
                const flash = frame >= OPEN_START && frame < OPEN_END + 4 ? openFlash(i) : 0;
                const extraTransform = isMine
                  ? `rotateX(${mineCounterRotate}deg) translateZ(${mineZ}px)`
                  : undefined;
                return (
                  <Tile
                    key={tile.id}
                    tile={tile}
                    rect={rect}
                    pulse={pulse}
                    flash={flash}
                    extraTransform={extraTransform}
                    dimAmount={isMine ? 0 : dimOthers}
                  />
                );
              })}
            </div>
          </AbsoluteFill>

          {frame >= ASCEND_START - 2 &&
            frame < RETURN_LAST_END + 6 &&
            flyingDishes.map((dish) => <SpiralDish key={dish.id} dish={dish} frame={frame} />)}
        </AbsoluteFill>
      )}

      {frame >= REVEAL_START - 4 && (
        <div style={{ position: "absolute", overflow: "hidden", background: "#fff", ...revealRect }}>
          {/* La caja que se expande no puede ir en blanco mientras crece: es la
              propia foto de "Mis recetas", que se funde a la rejilla de
              carpetas al final — mismo truco que abrir una tesela en la pieza
              anterior. */}
          <TileImg img={categoryTiles[MINE_INDEX].img} />
          <AbsoluteFill style={{ background: "#fff", opacity: foldersFade }} />
          {frame >= REVEAL_END - 2 && (
            <div style={{ position: "absolute", inset: 0, transform: `translateY(${folderTop}px)`, opacity: foldersFade }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: 24,
                  padding: "0 90px",
                }}
              >
                {myFolders.map((folder, i) => (
                  <FolderTile key={folder.id} folder={folder} enter={folderEnter(i)} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </AbsoluteFill>
  );
}
