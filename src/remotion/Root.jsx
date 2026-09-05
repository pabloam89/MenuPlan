import { Composition } from 'remotion';
import { Beat1Float } from './beats/Beat1Float';

export const RemotionRoot = () => {
  return (
    <>
      <Composition
        id="Beat1Float"
        component={Beat1Float}
        durationInFrames={75}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};
