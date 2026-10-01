import React from "react";
import { AbsoluteFill, random, staticFile, useCurrentFrame } from "remotion";

/**
 * Et nesten usynlig filmkorn over hele bildet. Det er ikke pynt: mørke
 * fargeoverganger får synlige trappetrinn i 8-bits video, og kornet bryter
 * dem opp. «overlay» lar helt svart forbli svart. Flisene er fra
 * Techauge-promoen (laget med ffmpeg).
 */
export const Korn: React.FC<{ styrke?: number }> = ({ styrke = 0.09 }) => {
  const frame = useCurrentFrame();
  const x = Math.floor(random(`korn-x-${frame}`) * 512);
  const y = Math.floor(random(`korn-y-${frame}`) * 512);
  return (
    <AbsoluteFill
      style={{
        backgroundImage: `url(${staticFile(`korn/korn-${frame % 8}.png`)})`,
        backgroundSize: "512px 512px",
        backgroundPosition: `${x}px ${y}px`,
        mixBlendMode: "overlay",
        opacity: styrke,
        pointerEvents: "none",
      }}
    />
  );
};
