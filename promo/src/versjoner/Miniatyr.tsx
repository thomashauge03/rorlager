import React from "react";
import { AbsoluteFill } from "remotion";
import { Kamera } from "../app/Kamera";
import { AVLOPSROR } from "../data";
import { dmSans } from "../fonter";
import { Bakgrunn, Glod } from "../felles/Bakgrunn";
import { Rigg } from "../felles/Rigg";
import { Telefon } from "../felles/Telefon";
import { HmLogo } from "../merke/HmLogo";
import { Rorhylle } from "../tegning/Rorhylle";
import { farge } from "../tema";

/**
 * Plakaten til nettsiden og miniatyren til YouTube (1920 × 1080, skaleres
 * ned til 1280 × 720). Få ord, stor kontrast: det skal leses i en liten rute.
 */
export const Miniatyr: React.FC = () => (
  <AbsoluteFill style={{ fontFamily: dmSans, color: farge.hvit }}>
    <Bakgrunn lys={1} drift={0.5} />
    <div
      style={{
        position: "absolute",
        left: 880,
        top: 300,
        width: 1300,
        height: 900,
        background: "radial-gradient(ellipse 50% 50% at 50% 50%, rgba(235,238,245,0.14) 0%, rgba(0,0,0,0) 70%)",
      }}
    />
    <div style={{ position: "absolute", left: 960, top: 300, filter: "brightness(0.8)" }}>
      <Rorhylle bredde={900} vare={AVLOPSROR} />
    </div>
    <Glod x={1430} y={560} styrke={1} />
    <Rigg x={1440} y={600} zoom={0.98} ry={12} rz={2}>
      {(z) => (
        <Telefon zoom={z} klokke="07:38">
          <Kamera motiv="skilt" las={1} boble={1} />
        </Telefon>
      )}
    </Rigg>
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
