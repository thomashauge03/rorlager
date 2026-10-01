import React from "react";
import { AbsoluteFill } from "remotion";
import { ease } from "../tema";
import { mellom } from "./hjelp";
import { useBilde } from "./Tempo";

/**
 * Lukkeren fra mobilappen (hauge-maskin-mobil/twa/lukkar.html): tre skrå,
 * mørke plater med rød kant. `lukk` er bildet de glir inn og dekker alt,
 * `apne` er bildet de glir av igjen mot høyre. Samme tider og kurve som i
 * appen: 520 ms, 60 ms mellom hver plate.
 */
export const Plater: React.FC<{ lukk?: number; apne?: number; startLukket?: boolean }> = ({ lukk, apne, startLukket = false }) => {
  const f = useBilde();
  const VARIGHET = 16;
  // Hendelsene i tidsrekkefølge; den siste som har begynt, bestemmer
  const hendelser = [
    ...(lukk !== undefined ? [{ t: lukk, fra: -1, til: 0 }] : []),
    ...(apne !== undefined ? [{ t: apne, fra: 0, til: 1 }] : []),
  ].sort((a, b) => a.t - b.t);
  return (
    <AbsoluteFill style={{ overflow: "hidden", pointerEvents: "none", zIndex: 100 }}>
      {[0, 1, 2].map((i) => {
        const forsinkelse = i * 2;
        // 0 = dekker, −1 = til venstre utenfor, 1 = til høyre utenfor
        let pos = startLukket ? 0 : -1;
        for (const h of hendelser) {
          if (f >= h.t) pos = mellom(f, [h.t + forsinkelse, h.t + forsinkelse + VARIGHET], [h.fra, h.til], ease.lukker);
        }
        if (pos <= -1 || pos >= 1) return null;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              top: "-14%",
              bottom: "-14%",
              left: `${-8 + i * 36}%`,
              width: "46%",
              background: "linear-gradient(100deg, #0b0b0f 0%, #16161c 72%, #1c1c24 100%)",
              transform: `skewX(-12deg) translate3d(${pos * 210}%, 0, 0)`,
            }}
          >
            <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 4, background: "#e2001a" }} />
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
