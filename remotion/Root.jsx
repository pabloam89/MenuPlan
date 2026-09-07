import { Composition } from "remotion";
import { PantallaRecetas, FPS, WIDTH, HEIGHT, TOTAL_FRAMES } from "./PantallaRecetas.jsx";
import {
  ExplosionRecetas,
  FPS as EXPLOSION_FPS,
  WIDTH as EXPLOSION_W,
  HEIGHT as EXPLOSION_H,
  TOTAL_FRAMES as EXPLOSION_FRAMES,
} from "./ExplosionRecetas.jsx";

export function RemotionRoot() {
  return (
    <>
      <Composition
        id="PantallaRecetas"
        component={PantallaRecetas}
        durationInFrames={TOTAL_FRAMES}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
      <Composition
        id="ExplosionRecetas"
        component={ExplosionRecetas}
        durationInFrames={EXPLOSION_FRAMES}
        fps={EXPLOSION_FPS}
        width={EXPLOSION_W}
        height={EXPLOSION_H}
      />
    </>
  );
}
