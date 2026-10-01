import React from "react";
import { interpolate } from "remotion";
import { ease, farge } from "../tema";
import { mellom } from "./hjelp";
import { useBilde } from "./Tempo";

/** Ett trykk: bildet det treffer på, og hvor på skjermen (skjermens punkter). */
export type Trykk = { f: number; x: number; y: number };

/** Så lenge før trykket fingeren kommer til syne, og etter at den blir borte. */
const FOR = 14;
const ETTER = 12;
/** Trykk nærmere enn dette henger sammen: fingeren glir fra det ene til det neste. */
const SAMMEN = 34;

/**
 * Fingertuppen, som i Leveringsseddel-filmen: en lys, gjennomskinnelig
 * skive (ingen tegnet hånd). Den kommer nedenfra eller fra forrige trykk,
 * trykkes inn, og en rød ring brer seg ut fra treffpunktet.
 */
export const Finger: React.FC<{ trykk: Trykk[] }> = ({ trykk }) => {
  const frame = useBilde();
  if (trykk.length === 0) return null;

  // Hvilket trykk vi er på vei mot eller nettopp har gjort
  let i = trykk.findIndex((t) => frame <= t.f + ETTER);
  if (i === -1) i = trykk.length - 1;
  const mål = trykk[i];
  const forrige = i > 0 && mål.f - trykk[i - 1].f <= SAMMEN ? trykk[i - 1] : undefined;
  const neste = i < trykk.length - 1 && trykk[i + 1].f - mål.f <= SAMMEN ? trykk[i + 1] : undefined;

  const start = forrige ? { x: forrige.x, y: forrige.y, f: forrige.f + 3 } : { x: mål.x + 40, y: mål.y + 230, f: mål.f - FOR };
  const p = mellom(frame, [start.f, mål.f - 1], [0, 1], ease.myk);
  const x = start.x + (mål.x - start.x) * p;
  const y = start.y + (mål.y - start.y) * p;

  const inn = forrige ? 1 : mellom(frame, [mål.f - FOR, mål.f - FOR + 7], [0, 1]);
  const ut = neste ? 1 : mellom(frame, [mål.f + ETTER - 7, mål.f + ETTER], [1, 0]);
  const synlig = frame >= start.f - 1 && frame <= mål.f + ETTER ? Math.min(inn, ut) : 0;

  const d = frame - mål.f;
  const skala = interpolate(d, [-5, 0, 3, 8], [1.08, 0.86, 0.86, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <>
      {/* Ringer og glød fra alle trykk som er ferske */}
      {trykk.map((t) => {
        const e = frame - t.f;
        if (e < 0 || e > 20) return null;
        const q = interpolate(e, [0, 20], [0, 1], { easing: ease.inn });
        return (
          <React.Fragment key={t.f}>
            <div
              style={{
                position: "absolute",
                left: t.x - 45,
                top: t.y - 45,
                width: 90,
                height: 90,
                borderRadius: "50%",
                border: `3px solid rgba(211,18,33,0.85)`,
                boxShadow: "0 0 18px rgba(211,18,33,0.45)",
                transform: `scale(${0.35 + q * 0.75})`,
                opacity: (1 - q) * 0.95,
                zIndex: 45,
              }}
            />
            <div
              style={{
                position: "absolute",
                left: t.x - 110,
                top: t.y - 110,
                width: 220,
                height: 220,
                borderRadius: "50%",
                background: `radial-gradient(circle, rgba(211,18,33,0.22) 0%, rgba(211,18,33,0) 60%)`,
                opacity: 1 - q,
                zIndex: 44,
              }}
            />
          </React.Fragment>
        );
      })}
      {synlig > 0 && (
        <div
          style={{
            position: "absolute",
            left: x - 23,
            top: y - 23,
            width: 46,
            height: 46,
            borderRadius: "50%",
            background: "radial-gradient(circle at 45% 40%, rgba(255,255,255,0.72) 0%, rgba(255,255,255,0.48) 55%, rgba(255,255,255,0.30) 100%)",
            border: "1.5px solid rgba(255,255,255,0.75)",
            boxShadow: `0 4px 14px rgba(0,0,0,0.35), 0 0 0 4px rgba(255,255,255,0.06)`,
            transform: `scale(${skala})`,
            opacity: synlig,
            zIndex: 46,
          }}
        />
      )}
    </>
  );
};

/** Et lite støt i telefonen når fingeren treffer: skalaen den skal ha på dette bildet. */
export const stot = (frame: number, trykk: Trykk[]) => {
  let s = 1;
  for (const t of trykk) {
    const d = frame - t.f;
    if (d >= -1 && d <= 8) s = Math.min(s, interpolate(d, [-1, 1, 8], [1, 0.992, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  }
  return s;
};

export const RING_FARGE = farge.rod;
