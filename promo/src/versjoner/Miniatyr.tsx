import React from "react";
import { AbsoluteFill } from "remotion";
import { dmSans } from "../fonter";
import { Bakgrunn } from "../felles/Bakgrunn";
import { HmLogo } from "../merke/HmLogo";
import { farge } from "../tema";

/**
 * Plakaten til nettsiden og miniatyren til YouTube (1920 × 1080, skaleres
 * ned til 1280 × 720). Få ord, stor kontrast: det skal leses i en liten rute.
 */
export const Miniatyr: React.FC = () => (
  <AbsoluteFill style={{ fontFamily: dmSans, color: farge.hvit }}>
    <Bakgrunn lys={1} drift={0.5} />
    <div style={{ position: "absolute", left: 120, top: 150 }}>
      <HmLogo hoyde={96} />
    </div>
    <div style={{ position: "absolute", left: 112, top: 300, fontSize: 158, fontWeight: 800, letterSpacing: "-0.045em", lineHeight: 0.98 }}>
      <div>Ta ut rør</div>
      <div style={{ color: farge.rod }}>med mobilen.</div>
    </div>
    <div style={{ position: "absolute", left: 120, top: 660, width: 150, height: 7, borderRadius: 4, background: farge.rod }} />
    <div style={{ position: "absolute", left: 120, top: 710, fontSize: 44, fontWeight: 500, color: farge.hvitSvak, letterSpacing: "-0.01em" }}>
      Skann · Velg mengde · Send inn
    </div>
  </AbsoluteFill>
);
