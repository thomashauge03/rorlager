import React from "react";
import { AbsoluteFill, Composition, Folder } from "remotion";
import { AVLOPSROR, BEND } from "./tegning/Hylleskilt";
import { Delehylle } from "./tegning/Delehylle";
import { Rorhylle } from "./tegning/Rorhylle";
import { FPS } from "./tid";
import { Hovedfilm, Kortfilm } from "./versjoner/Hovedfilm";
import { Miniatyr } from "./versjoner/Miniatyr";
import { HOVEDFILM_PLAN, KORT_PLAN } from "./versjoner/planer";

/** Prøvebilde av tegningene. */
const Tegninger: React.FC = () => (
  <AbsoluteFill style={{ background: "#1b1d20" }}>
    <div style={{ position: "absolute", left: 40, top: 40 }}>
      <Rorhylle bredde={1100} vare={AVLOPSROR} />
    </div>
    <div style={{ position: "absolute", left: 1220, top: 40 }}>
      <Rorhylle bredde={640} vare={AVLOPSROR} tatt={0.45} utenSkygge />
    </div>
    <div style={{ position: "absolute", left: 1220, top: 500 }}>
      <Delehylle bredde={420} vare={BEND} />
    </div>
  </AbsoluteFill>
);

export const RemotionRoot: React.FC = () => (
  <>
    <Folder name="Proever">
      <Composition id="Tegninger" component={Tegninger} durationInFrames={30} fps={FPS} width={1920} height={1080} />
    </Folder>
    <Folder name="Film">
      {/* Tegnet i 1920 × 1080 og rendret med --scale=2 til 4K */}
      <Composition id="Hovedfilm" component={Hovedfilm} durationInFrames={HOVEDFILM_PLAN.lengde} fps={FPS} width={1920} height={1080} />
      <Composition id="Reels-9x16" component={Kortfilm} durationInFrames={KORT_PLAN.lengde} fps={FPS} width={1080} height={1920} />
      <Composition id="Feed-4x5" component={Kortfilm} durationInFrames={KORT_PLAN.lengde} fps={FPS} width={1080} height={1350} />
      <Composition id="Miniatyr" component={Miniatyr} durationInFrames={1} fps={FPS} width={1920} height={1080} />
    </Folder>
  </>
);
