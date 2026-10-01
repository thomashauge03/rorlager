import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { miks } from "./hjelp";

/**
 * Bruddet, mørkt og kaldt — samme bakgrunn som Leveringsseddel-filmen
 * (.bak / .tone / .vignett i film.html). Bildet er bare 1200 punkter bredt,
 * så det er gjort litt uskarpt; da tåler det 4K.
 *
 * `lys` (0–1) er der lyset i bildet samler seg: 0 = venstre (telefonen til
 * venstre), 1 = høyre, 0,5 = midten. `drift` (0–1) er hvor langt i filmen vi er.
 */
export const Bakgrunn: React.FC<{ lys: number; drift: number; staaende?: boolean }> = ({ lys, drift, staaende = false }) => {
  const lx = miks(32, 68, lys);
  const skala = 1.02 + drift * 0.06;
  return (
    <AbsoluteFill style={{ background: "#0a0c0d", overflow: "hidden" }}>
      <AbsoluteFill style={{ inset: "-14%", transform: `scale(${skala}) translateX(${(drift - 0.5) * -1.5}%)` }}>
        <Img
          src={staticFile("bakgrunn/brudd.jpg")}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            filter: "grayscale(0.55) brightness(0.47) contrast(1.18) blur(2.5px)",
          }}
        />
      </AbsoluteFill>
      <AbsoluteFill
        style={{
          background: staaende
            ? "radial-gradient(110% 70% at 50% 62%, rgba(20,24,28,0) 0%, rgba(8,10,12,0.8) 75%), linear-gradient(180deg, rgba(8,10,12,0.72) 0%, rgba(8,10,12,0.25) 45%, rgba(8,10,12,0.5) 100%)"
            : `radial-gradient(120% 90% at ${lx}% 52%, rgba(20,24,28,0) 0%, rgba(8,10,12,0.78) 75%), linear-gradient(${miks(100, 260, lys)}deg, rgba(8,10,12,0.15) 0%, rgba(8,10,12,0.72) 60%)`,
        }}
      />
      <AbsoluteFill style={{ background: "radial-gradient(85% 78% at 50% 50%, rgba(0,0,0,0) 48%, rgba(0,0,0,0.62) 100%)" }} />
    </AbsoluteFill>
  );
};

/** Det røde lyset bak telefonen (.glod). */
export const Glod: React.FC<{ x: number; y: number; styrke: number; storrelse?: number }> = ({ x, y, styrke, storrelse = 1100 }) =>
  styrke <= 0 ? null : (
    <div
      style={{
        position: "absolute",
        left: x - storrelse / 2,
        top: y - storrelse / 2,
        width: storrelse,
        height: storrelse,
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(211,18,33,0.30) 0%, rgba(211,18,33,0.10) 36%, rgba(211,18,33,0) 68%)",
        opacity: styrke,
        pointerEvents: "none",
      }}
    />
  );
