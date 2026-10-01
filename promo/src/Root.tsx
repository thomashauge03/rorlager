import React from "react";
import { Composition, Folder } from "remotion";
import { FPS } from "./tid";
import { Hovedfilm, Kortfilm } from "./versjoner/Hovedfilm";
import { Miniatyr } from "./versjoner/Miniatyr";
import { HOVEDFILM_PLAN, KORT_PLAN } from "./versjoner/planer";

export const RemotionRoot: React.FC = () => (
  <>
    <Folder name="Film">
      {/* Tegnet i 1920 × 1080 og rendret med --scale=2 til 4K */}
      <Composition id="Hovedfilm" component={Hovedfilm} durationInFrames={HOVEDFILM_PLAN.lengde} fps={FPS} width={1920} height={1080} />
      <Composition id="Reels-9x16" component={Kortfilm} durationInFrames={KORT_PLAN.lengde} fps={FPS} width={1080} height={1920} />
      <Composition id="Feed-4x5" component={Kortfilm} durationInFrames={KORT_PLAN.lengde} fps={FPS} width={1080} height={1350} />
      <Composition id="Miniatyr" component={Miniatyr} durationInFrames={1} fps={FPS} width={1920} height={1080} />
    </Folder>
  </>
);
